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
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from merge_companies import dedup_key, norm_tokens, DB  # noqa: E402
from lib.merge_stoplist import is_distinctive, STOPLIST  # noqa: E402

OUT = ROOT / "data" / "processed" / "parent_groups_dryrun.csv"
MIN_COUNTRIES = 2     # a brand bigram must span >= this many countries to anchor
DF_CAP = 200          # a bigram token appearing in more companies than this is generic
SIZE_CAP = 120        # components larger than this are flagged for review, not merged

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

    big = defaultdict(list)
    for cid in name:
        b = bigram(cid)
        if b:
            big[b].append(cid)
    # a bigram anchors only if its family spans >= MIN_COUNTRIES
    valid_bigrams = {b for b, ids in big.items()
                     if len({country[i] for i in ids if country[i]}) >= MIN_COUNTRIES}

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
    for (layer, key), ids in by_key.items():
        if len(ids) < 2:
            continue
        for cid in ids[1:]:
            ra, rb = uf.find(("c", ids[0])), uf.find(("c", cid))
            if ra != rb:
                contrib[layer] += 1
            uf.union(("c", ids[0]), ("c", cid))

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

    # ---- counts ----
    distinct_raw = n
    distinct_l1 = len({l1[c] for c in name if l1[c]}) + sum(1 for c in name if not l1[c])
    merged_in_groups = sum(len(g) for g in groups)
    distinct_full = n - sum(len(g) - 1 for g in groups)

    print(f"event-bearing companies:            {distinct_raw:>8,}")
    print(f"distinct after L1 (exact-name):     {distinct_l1:>8,}  (-{distinct_raw-distinct_l1:,})")
    print(f"distinct after full pipeline:       {distinct_full:>8,}  (-{distinct_raw-distinct_full:,})")
    print(f"  groups: {len(groups):,} covering {merged_in_groups:,} entities")
    print(f"  new links: name-key (L1+suffix)={contrib['nk']:,}  brand-bigram(2b)={contrib['2b']:,}")
    print(f"\nRISK CONTROLS")
    print(f"  golden-negative violations: {len(gn_hits)}  {'<-- INVESTIGATE' if gn_hits else 'OK'}")
    for a, b, sz in gn_hits:
        print(f"     '{a}' + '{b}' in a size-{sz} group")
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
        import csv
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

    if gn_hits or over:
        sys.exit("REFUSING --apply: golden-negative or size-cap violations present.")
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
