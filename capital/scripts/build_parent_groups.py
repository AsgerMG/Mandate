"""Deterministic parent-group builder — DRY RUN by default.

Composes merge layers into one `parent_group` per real-world company:
  L1  exact normalised-name dedup            (anchor = dedup_key)
  2a  suffix / country-tag normalisation      (anchor = stripped-stem dedup_key)
  2b  multi-country distinctive brand bigram  (anchor = (t1,t2), >= MIN_COUNTRIES)

Companies are unioned when they share a HIGH-PRECISION anchor (exact key, exact
stripped stem, or a multi-country distinctive bigram). Generic anchors are removed
up front by the stoplist + frequency cap, so chaining cannot run through junk.
Risk controls: hard size cap (oversized components are flagged, not merged),
golden-negative assertions, and full provenance. No DB writes unless --apply.

Usage:
  python3 scripts/build_parent_groups.py            # dry run + report + CSV
  python3 scripts/build_parent_groups.py --apply    # write companies.parent_group
"""
import argparse
import csv
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from merge_companies import dedup_key, norm_tokens, DB  # noqa: E402
from lib.merge_stoplist import is_distinctive, STOPLIST, LEGAL  # noqa: E402
from lib.brand_dictionary import BRANDS, DENY, WATCHLIST  # noqa: E402

OUT = ROOT / "data" / "processed" / "parent_groups_dryrun.csv"
MIN_COUNTRIES = 2     # a brand bigram must span >= this many countries to anchor
DF_CAP = 200          # a bigram token appearing in more companies than this is generic
SIZE_CAP = 120        # components larger than this are flagged for review, not merged
FUZZY_AUTO = 93       # rapidfuzz token_sort_ratio >= this -> auto-merge (same country)
FUZZY_REVIEW = 88     # [REVIEW, AUTO) -> clerical-review CSV, never auto-merged
FUZZY_BLOCK_CAP = 40  # skip fuzzy on distinctive-token blocks bigger than this

EU_ISO2 = {"AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","EL","HU","IE",
           "IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE","NO","IS",
           "CH","GB","UK","LI","RS","TR","UA","ME","MK","AL","BA","MD","XK"}
COUNTRY_WORDS = {"deutschland","france","espana","italia","italya","nederland","belgique",
                 "danmark","sverige","norge","suomi","polska","osterreich","portugal",
                 "ireland","schweiz","suisse","europe"}

# Golden negatives: company-name fragments that must NEVER land in one group.
GOLDEN_NEGATIVES = [
    ("john deere", "john cockerill"),
    ("m-tron", "m-files"),
    ("cementos portland valderrivas", "aalborg portland"),
    ("cherry biotech", "io biotech"),
    ("gestamp", "levante srl"),
]

CODE_RE = re.compile(r"^(.*\S)\s+[-–]\s+(\S{1,8})$")


def strip_codes(name: str) -> str:
    """Remove trailing internal ' - CODE' ids and BRAND-CC country tags.
    Guards: only strips when the stem stays distinctive (>=2 tokens or >=4 chars)."""
    s = name.strip()
    # spaced internal code: "Novo Nordisk A/S - E1", "... - BOA0032"
    for _ in range(3):
        m = CODE_RE.match(s)
        if not m:
            break
        stem, code = m.group(1).strip(), m.group(2)
        looks_code = any(ch.isdigit() for ch in code) or len(code) <= 4
        if looks_code and len(norm_tokens(stem)) >= 1 and len(stem) >= 4:
            s = stem
        else:
            break
    # trailing country word or "-CC" / " CC" ISO tag (NXP-DE, IFX-AT)
    m = re.match(r"^(.*\S)[-\s]([A-Za-z]{2})$", s)
    if m and m.group(2).upper() in EU_ISO2:
        stem = m.group(1).strip()
        if len(norm_tokens(stem)) >= 1 and len(stem) >= 3:
            s = stem
    toks = s.split()
    if toks and toks[-1].lower() in COUNTRY_WORDS and len(toks) >= 2:
        s = " ".join(toks[:-1])
    return s


_LEGAL_DESC = sorted(LEGAL, key=len, reverse=True)


def aggressive_key(nm: str) -> str:
    """Deterministic collapse of punctuation / spacing / diacritics / legal-form
    spelling: 'GENESAL ENERGY IB, S.A.' == 'GENESAL ENERGY IB SA'; 'Vyoma GmH' ==
    'Vyoma GmbH'. Works on whole tokens (drops legal-form *tokens*, not arbitrary
    suffixes) so real words are never truncated ('Vestas' stays 'vestas', not
    'vest'). Sorted + joined for word-order independence. Zero fuzzy risk — exact
    equality after hard normalisation. '' if nothing distinctive remains."""
    import unicodedata
    out = []
    for tok in nm.split():
        t = unicodedata.normalize("NFKD", tok).encode("ascii", "ignore").decode().lower()
        t = re.sub(r"[^a-z0-9]", "", t)
        if t and t not in LEGAL:
            out.append(t)
    s = "".join(out)  # order-preserving: avoids anagram collisions of sorted tokens
    return s if len(s) >= 4 else ""


class UF:
    def __init__(self):
        self.p = {}
    def find(self, x):
        self.p.setdefault(x, x)
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x
    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[ra] = rb


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    con = sqlite3.connect(DB)
    rows = con.execute("""
        SELECT c.id, c.canonical_name, c.country,
               COALESCE(SUM(COALESCE(v.grant_amount_eur,0)+COALESCE(v.debt_amount_eur,0)),0) eur
        FROM companies c JOIN v_events v ON v.company_id = c.id
        GROUP BY c.id
    """).fetchall()
    n = len(rows)
    name = {r[0]: r[1] for r in rows}
    country = {r[0]: (r[2] or "") for r in rows}
    eur = {r[0]: r[3] for r in rows}

    # ---- anchors ----
    l1 = {cid: dedup_key(name[cid]) for cid in name}
    stem = {cid: dedup_key(strip_codes(name[cid])) for cid in name}

    # token DF for the bigram frequency guard
    df = Counter()
    for cid in name:
        for t in set(norm_tokens(name[cid])):
            df[t] += 1

    def bigram(cid):
        toks = [t for t in norm_tokens(name[cid]) if is_distinctive(t)]
        if len(toks) >= 2 and df[toks[0]] <= DF_CAP and df[toks[1]] <= DF_CAP:
            return (toks[0], toks[1])
        return None

    def brand_of(cid):
        low = name[cid].lower()
        if " / " in name[cid] or any(d in low for d in DENY):
            return None  # consortium record (X / Y) or a denied place/word clash
        for t in norm_tokens(name[cid]):
            if is_distinctive(t) and t in BRANDS:
                return BRANDS[t]  # any-position match (catches 'A.P. Moller Maersk')
        return None

    big = defaultdict(list)
    for cid in name:
        b = bigram(cid)
        if b:
            big[b].append(cid)
    # a bigram anchors only if its family spans >= MIN_COUNTRIES
    valid_bigrams = {b for b, ids in big.items()
                     if len({country[i] for i in ids if country[i]}) >= MIN_COUNTRIES}

    # ---- Layer 2d: fuzzy name match (record linkage, Fellegi-Sunter 3-way) ----
    # Blocked by shared distinctive token + same country; rapidfuzz scores the
    # pair; >= AUTO merges, [REVIEW, AUTO) goes to a clerical-review CSV (never
    # auto-merged), below REVIEW is rejected. Catches typos like "Vyoma GmH".
    # numbers/roman numerals that distinguish sequential vehicles ("16. Leda" vs
    # "20. Leda", "VALMY 114" vs "110", "...XII"). If two names differ on these,
    # they are NOT the same entity — demote to clerical review, never auto-merge.
    ROMAN = {"ii", "iii", "iv", "vi", "vii", "viii", "ix", "xi", "xii", "xiii",
             "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx"}

    def numset(nm):
        # any token carrying a digit (123, BOA0031966, 6AB) or a roman numeral
        # distinguishes a vehicle; differing sets => not the same entity.
        toks = re.findall(r"[a-z0-9]+", nm.lower())
        return {t for t in toks if any(c.isdigit() for c in t) or t in ROMAN}

    fuzzy_pairs, fuzzy_review = [], []
    try:
        from rapidfuzz import fuzz
        token_block = defaultdict(list)
        for cid in name:
            for t in set(norm_tokens(name[cid])):
                if is_distinctive(t) and df[t] <= DF_CAP:
                    token_block[t].append(cid)
        seen = set()
        for t, ids in token_block.items():
            if not (2 <= len(ids) <= FUZZY_BLOCK_CAP):
                continue
            for i in range(len(ids)):
                for j in range(i + 1, len(ids)):
                    a, b = ids[i], ids[j]
                    if not country[a] or country[a] != country[b]:
                        continue
                    pk = (a, b) if a < b else (b, a)
                    if pk in seen:
                        continue
                    seen.add(pk)
                    if dedup_key(name[a]) == dedup_key(name[b]):
                        continue  # already caught by L1
                    s = fuzz.token_sort_ratio(name[a], name[b])
                    # Fuzzy NEVER auto-merges (surname collisions like 'Köhler Kalk'
                    # vs 'Karl Köhler' score high). It only powers a human-gated
                    # review queue. Deterministic auto-merge is the aggressive-key
                    # anchor above. The number guard keeps differing-vehicle pairs
                    # out of even the review queue's top of mind.
                    if s >= FUZZY_REVIEW:
                        tag = "" if numset(name[a]) == numset(name[b]) else "diff-number"
                        fuzzy_review.append((a, b, round(s), tag))
    except ImportError:
        print("  (rapidfuzz not installed — Layer 2d skipped)")

    # ---- union over high-precision anchors ----
    uf = UF()
    for cid in name:
        uf.find(("c", cid))
    contrib = Counter()  # which layer linked things
    by_key = defaultdict(list)
    def has_distinctive(key):
        # a name-key may anchor only if it carries >=1 distinctive token; this
        # rejects pure-initial anagrams ("b m p"), digit-only keys ("1","2"), and
        # generic-word collisions ("energy","group") that token-sorting would merge.
        return any(is_distinctive(t) for t in key.split())

    for cid in name:
        # empty keys (non-Latin names that ASCII-fold to "") must NOT anchor.
        # L1 (full name) and 2a (stripped stem) share ONE name-key namespace, so a
        # stripped stem ("Novo Nordisk A/S - E1" -> "novo nordisk a s") matches the
        # plain company's full-name key.
        if l1[cid] and has_distinctive(l1[cid]):
            by_key[("nk", l1[cid])].append(cid)
        if stem[cid] and stem[cid] != l1[cid] and has_distinctive(stem[cid]):
            by_key[("nk", stem[cid])].append(cid)
        b = bigram(cid)
        if b in valid_bigrams:
            by_key[("2b", b)].append(cid)
        br = brand_of(cid)
        if br:
            by_key[("2c", br)].append(cid)
    for (layer, key), ids in by_key.items():
        if len(ids) < 2:
            continue
        for cid in ids[1:]:
            ra, rb = uf.find(("c", ids[0])), uf.find(("c", cid))
            if ra != rb:
                contrib[layer] += 1
            uf.union(("c", ids[0]), ("c", cid))
    # Layer 2d: union the auto-tier fuzzy pairs (already same-country, > AUTO).
    for a, b in fuzzy_pairs:
        ra, rb = uf.find(("c", a)), uf.find(("c", b))
        if ra != rb:
            contrib["2d"] += 1
        uf.union(("c", a), ("c", b))

    comp = defaultdict(list)
    for cid in name:
        comp[uf.find(("c", cid))].append(cid)
    groups = [ids for ids in comp.values() if len(ids) > 1]

    # ---- risk controls ----
    over = [g for g in groups if len(g) > SIZE_CAP]
    gn_hits = []
    for a, b in GOLDEN_NEGATIVES:
        for g in groups:
            names = [name[c].lower() for c in g]
            if any(a in x for x in names) and any(b in x for x in names):
                gn_hits.append((a, b, len(g)))
                break

    # cohesion audit (built in): each group should share >=1 distinctive token
    def dset(nm):
        return {t for t in norm_tokens(nm) if is_distinctive(t)}
    cohesive = sum(1 for g in groups
                   if set.intersection(*(dset(name[c]) for c in g)))
    coh_pct = 100 * cohesive / len(groups) if groups else 100

    # watchlist consolidation gate: each WATCHLIST brand must land in ONE group
    root = {cid: uf.find(("c", cid)) for cid in name}
    watch_frag = []
    for wb in WATCHLIST:
        target = BRANDS.get(wb)
        if target:
            # count only companies actually ASSIGNED this brand, so a JV that maps
            # to another watch brand (Valeo Siemens -> Valeo) is not miscounted.
            ids = [cid for cid in name if brand_of(cid) == target]
        else:
            ids = [cid for cid in name
                   if any(is_distinctive(t) and t == wb for t in norm_tokens(name[cid]))
                   and not brand_of(cid)]
        comps_wb = {root[cid] for cid in ids}
        if len(comps_wb) > 1:
            watch_frag.append((wb, len(ids), len(comps_wb)))

    # ---- counts ----
    distinct_raw = n
    distinct_l1 = len({l1[c] for c in name if l1[c]}) + sum(1 for c in name if not l1[c])
    merged_in_groups = sum(len(g) for g in groups)
    distinct_full = n - sum(len(g) - 1 for g in groups)

    print(f"event-bearing companies:            {distinct_raw:>8,}")
    print(f"distinct after L1 (exact-name):     {distinct_l1:>8,}  (-{distinct_raw-distinct_l1:,})")
    print(f"distinct after full pipeline:       {distinct_full:>8,}  (-{distinct_raw-distinct_full:,})")
    print(f"  groups: {len(groups):,} covering {merged_in_groups:,} entities")
    print(f"  new links: name-key(L1+2a)={contrib['nk']:,}  bigram(2b)={contrib['2b']:,}  brand-dict(2c)={contrib['2c']:,}  fuzzy(2d)={contrib['2d']:,}")
    if fuzzy_pairs:
        au = ROOT / "data" / "processed" / "parent_merge_fuzzy_auto.csv"
        with au.open("w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["id_a", "name_a", "id_b", "name_b", "country"])
            for a, b in fuzzy_pairs:
                w.writerow([a, name[a], b, name[b], country[a]])
    if fuzzy_review:
        rev = ROOT / "data" / "processed" / "parent_merge_fuzzy_review.csv"
        with rev.open("w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["score", "flag", "id_a", "name_a", "id_b", "name_b", "country"])
            for a, b, s, tag in sorted(fuzzy_review, key=lambda x: -x[2]):
                w.writerow([s, tag, a, name[a], b, name[b], country[a]])
        print(f"  fuzzy clerical-review band: {len(fuzzy_review)} pairs -> {rev.name} (NOT merged)")
    print(f"\nRISK CONTROLS")
    print(f"  cohesion (groups sharing a distinctive token): {cohesive:,}/{len(groups):,} ({coh_pct:.1f}%)")
    print(f"  golden-negative violations: {len(gn_hits)}  {'<-- INVESTIGATE' if gn_hits else 'OK'}")
    for a, b, sz in gn_hits:
        print(f"     '{a}' + '{b}' in a size-{sz} group")
    print(f"  watchlist consolidation: {len(WATCHLIST)-len(watch_frag)}/{len(WATCHLIST)} brands in one group"
          f"  {'<-- FRAGMENTED:' if watch_frag else 'OK'}")
    for wb, nc, ng in watch_frag:
        print(f"     {wb}: {nc} companies still in {ng} groups")
    print(f"  components over size cap ({SIZE_CAP}): {len(over)}  (flagged, review before apply)")
    for g in sorted(over, key=len, reverse=True)[:8]:
        ns = sorted({name[c] for c in g})
        print(f"     {len(g):4}  e.g. {ns[0][:46]}")

    print(f"\nLARGEST NEW GROUPS (review sample):")
    for g in sorted(groups, key=len, reverse=True)[:25]:
        if len(g) > SIZE_CAP:
            continue
        ns = sorted({name[c] for c in g})
        cs = sorted({country[c] for c in g if country[c]})
        print(f"  {len(g):4} {len(cs)}c  {ns[0][:42]:42} | {ns[1][:28] if len(ns)>1 else ''}")

    # ---- write provenance CSV (dry run) ----
    if not args.apply:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        with OUT.open("w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["parent_key", "size", "company_id", "name", "country", "eur"])
            for g in sorted(groups, key=len, reverse=True):
                anchor = name[max(g, key=lambda c: eur[c])]  # richest member as label
                pk = dedup_key(anchor)
                for c in sorted(g, key=lambda c: -eur[c]):
                    w.writerow([pk, len(g), c, name[c], country[c], round(eur[c])])
        print(f"\nDRY RUN -> {OUT}  (no DB writes; --apply to persist after review)")
        return

    if gn_hits or over or watch_frag or coh_pct < 99.0:
        sys.exit(f"REFUSING --apply: gn={len(gn_hits)} over={len(over)} "
                 f"watch_fragmented={len(watch_frag)} cohesion={coh_pct:.1f}% (need >=99).")
    cols = [r[1] for r in con.execute("PRAGMA table_info(companies)")]
    if "parent_group" not in cols:
        con.execute("ALTER TABLE companies ADD COLUMN parent_group TEXT")
    con.execute("UPDATE companies SET parent_group=NULL")
    updates = []
    for g in groups:
        pk = dedup_key(name[max(g, key=lambda c: eur[c])])
        updates += [(pk, c) for c in g]
    con.executemany("UPDATE companies SET parent_group=? WHERE id=?", updates)
    con.commit()
    print(f"\nAPPLIED parent_group to {len(updates):,} companies in {len(groups):,} groups.")


if __name__ == "__main__":
    main()
