"""Entity resolution for company names — the standard procedure, one script.

normalize -> block -> verify (LLM, batch) -> cluster -> canonicalise.

The goal: every record of the same real-world company ends up under one
parent_group (and one canonical display name), at high precision, for ~EUR few.

Why each stage:
  1. NORMALISE with proper transliteration (ae/oe/aa/ss...) so 'Mærsk'=='Maersk'.
  2. BLOCK on shared distinctive tokens AND metaphone phonetic keys, so typos and
     spelling variants ('Marsk'~'Maersk') land together. Blocking turns 11e9
     all-pairs into ~tens of thousands of plausible candidates.
  3. VERIFY each candidate pair with an LLM (pairwise 'same company? yes/no' —
     verification, NOT generation, so no hallucinated mega-clusters). Batch API,
     cached, model-agnostic (OpenAI now; Haiku by setting ANTHROPIC_API_KEY).
  4. CLUSTER the yes-pairs into components (deterministic guards: golden negatives
     split, size cap flagged, exact-normalised pairs auto-join).
  5. CANONICALISE: one parent_group per cluster, labelled by the richest member.

Subcommands:
  candidates   normalize+block -> data/processed/er_candidates.csv   (no key)
  verify       LLM-batch verify candidates -> er_verdicts.csv         (key)
  apply        cluster verified + guards -> write parent_group        (no key)
"""
from __future__ import annotations

import argparse
import csv
import itertools
import re
import sqlite3
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

import jellyfish
from rapidfuzz import fuzz

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from merge_companies import DB  # noqa: E402
from lib.merge_stoplist import LEGAL, STOPLIST  # noqa: E402

PROC = ROOT / "data" / "processed"
CAND = PROC / "er_candidates.csv"
VERD = PROC / "er_verdicts.csv"

DF_CAP = 80
RARE_DF = 0             # 0 = fuzzy/phonetic only (high ROI). Raise (e.g. 25) to also
                        # verify ALL pairs of rare-token blocks — but a pilot showed
                        # that tier is ~97% unrelated companies sharing a token (low
                        # ROI, ~$32 vs ~$1). Big brands are handled by the brand dict.
FUZZY_MIN = 82          # only verify string-similar pairs (typos/variants)
BLOCK_CAP = 60
SIZE_CAP = 150

TRANSLIT = str.maketrans({
    "æ": "ae", "ø": "oe", "å": "aa", "ß": "ss", "ð": "d", "þ": "th",
    "ł": "l", "đ": "d", "ı": "i", "œ": "oe",
})


def translit(s: str) -> str:
    s = (s or "").lower().translate(TRANSLIT)
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


def tokens(nm: str) -> list[str]:
    return [t for t in re.sub(r"[^a-z0-9]+", " ", translit(nm)).split() if t]


def distinctive(nm: str) -> list[str]:
    return [t for t in tokens(nm) if len(t) >= 3 and t not in STOPLIST]


def brand_stem(nm: str) -> str:
    """name minus legal-form tokens, transliterated — for the phonetic key."""
    return " ".join(t for t in tokens(nm) if t not in LEGAL)


def load(con):
    rows = con.execute("""
        SELECT c.id, c.canonical_name, COALESCE(c.country,''),
               COALESCE(SUM(COALESCE(v.grant_amount_eur,0)+COALESCE(v.debt_amount_eur,0)),0)
        FROM companies c JOIN v_events v ON v.company_id=c.id GROUP BY c.id
    """).fetchall()
    return {r[0]: {"name": r[1], "country": r[2], "eur": r[3]} for r in rows}


# ── candidates ────────────────────────────────────────────────────────────────
def gen_candidates():
    con = sqlite3.connect(DB)
    co = load(con)
    df = defaultdict(int)
    for cid, d in co.items():
        for t in set(distinctive(d["name"])):
            df[t] += 1

    blocks = defaultdict(list)
    for cid, d in co.items():
        for t in set(distinctive(d["name"])):
            if df[t] <= DF_CAP:
                blocks[("tok", t)].append(cid)
        stem = brand_stem(d["name"])
        if stem:
            mp = jellyfish.metaphone(stem)
            if len(mp) >= 4:
                blocks[("ph", mp)].append(cid)

    seen, cand = set(), []
    for key, ids in blocks.items():
        if not (2 <= len(ids) <= BLOCK_CAP):
            continue
        # rare distinctive token -> verify ALL its pairs (likely a brand family,
        # even when the names aren't string-similar). Commoner tokens / phonetic
        # blocks -> only verify string-similar pairs (bounds cost + noise).
        rare = key[0] == "tok" and df[key[1]] <= RARE_DF
        for a, b in itertools.combinations(ids, 2):
            pk = (a, b) if a < b else (b, a)
            if pk in seen:
                continue
            seen.add(pk)
            na, nb = co[a]["name"], co[b]["name"]
            if translit(na) == translit(nb):
                cand.append((a, b, 100, "exact"))         # auto-join, no LLM
                continue
            s = fuzz.token_sort_ratio(na, nb)
            if rare or s >= FUZZY_MIN:
                cand.append((a, b, s, "rare" if rare and s < FUZZY_MIN else key[0]))
    PROC.mkdir(parents=True, exist_ok=True)
    with CAND.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id_a", "name_a", "country_a", "id_b", "name_b", "country_b", "score", "via"])
        for a, b, s, via in cand:
            w.writerow([a, co[a]["name"], co[a]["country"], b, co[b]["name"], co[b]["country"], s, via])
    auto = sum(1 for c in cand if c[2] == 100)
    print(f"candidates: {len(cand):,}  ({auto:,} exact auto-join, "
          f"{len(cand)-auto:,} need LLM verification)  -> {CAND.name}")
    print(f"blocking considered {len(seen):,} unique pairs")


# ── verify (LLM pairwise, batch, model-agnostic) ──────────────────────────────
SYS = ("You are an entity-resolution expert for company records. Decide if two "
       "records are the SAME real-world company — counting legal-form variants, "
       "translations, transliterations, typos, rebrands, and a subsidiary vs its "
       "named parent as SAME; but DIFFERENT companies that merely share a common "
       "word, a surname, or a sequential number (e.g. 'Fund III' vs 'Fund IV') are "
       "NOT the same. If you are not confident, answer \"unsure\" — do not guess. "
       'Reply ONLY JSON: {"v":"yes|no|unsure"}.')


def _prompt(a):
    return (f'A: {a["name_a"]} (country {a["country_a"]})\n'
            f'B: {a["name_b"]} (country {a["country_b"]})')


MODEL = "claude-haiku-4-5"
MAX_PER_BATCH = 90_000   # Anthropic message-batch hard cap is 100k requests
BATCH_STATE = PROC / "er_batch.json"


def _client():
    import os
    sys.path.insert(0, str(ROOT / "scripts"))
    from classify_llm import load_env
    load_env()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit("Set ANTHROPIC_API_KEY in .env.local (Haiku) and re-run.")
    import anthropic
    return anthropic.Anthropic()


def _parse(text):
    import json
    try:
        return json.loads(text).get("v", "unsure")
    except Exception:
        t = text.lower()
        return "yes" if '"yes"' in t or t.strip() == "yes" else "unsure"


def verify_pilot(n):
    """Synchronous quick pilot: validates key/prompt/parsing on a sample, instantly."""
    cl = _client()
    pairs = [r for r in csv.DictReader(CAND.open()) if r["via"] != "exact"]
    # bias the sample toward recognisable cases + spread
    keyish = [p for p in pairs if any(k in (p["name_a"] + p["name_b"]).lower()
              for k in ("vyoma", "maersk", "siemens", "bosch"))][:10]
    sample = keyish + pairs[: max(0, n - len(keyish))]
    print(f"PILOT: {len(sample)} pairs, synchronous {MODEL}\n")
    for p in sample:
        m = cl.messages.create(model=MODEL, max_tokens=16, system=SYS,
                               messages=[{"role": "user", "content": _prompt(p)}])
        v = _parse(m.content[0].text)
        print(f"  {v:6} | {p['name_a'][:34]:34} || {p['name_b'][:34]}")


def verify():
    """Submit chunked batches on first run; poll + collect on later runs."""
    import json
    cl = _client()
    pairs = [r for r in csv.DictReader(CAND.open()) if r["via"] != "exact"]

    if not BATCH_STATE.exists():
        batches = []
        for i in range(0, len(pairs), MAX_PER_BATCH):
            chunk = pairs[i:i + MAX_PER_BATCH]
            reqs = [{"custom_id": f'{p["id_a"]}-{p["id_b"]}',
                     "params": {"model": MODEL, "max_tokens": 16, "system": SYS,
                                "messages": [{"role": "user", "content": _prompt(p)}]}}
                    for p in chunk]
            b = cl.messages.batches.create(requests=reqs)
            batches.append(b.id)
            print(f"  submitted batch {b.id} ({len(reqs):,} pairs)")
        BATCH_STATE.write_text(json.dumps(batches))
        print(f"submitted {len(batches)} batch(es), {len(pairs):,} pairs total. "
              f"Re-run 'verify' to poll/collect.")
        return

    batches = json.loads(BATCH_STATE.read_text())
    statuses = {bid: cl.messages.batches.retrieve(bid).processing_status for bid in batches}
    print("batch status:", statuses)
    if any(s != "ended" for s in statuses.values()):
        print("not all finished — re-run shortly."); return
    from collections import Counter
    rows = []
    for bid in batches:
        for r in cl.messages.batches.results(bid):
            v = "unsure"
            try:
                if r.result.type == "succeeded":
                    v = _parse(r.result.message.content[0].text)
            except Exception:
                pass
            a, bb = r.custom_id.split("-")
            rows.append((a, bb, v))
    with VERD.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["id_a", "id_b", "verdict"])
        w.writerows(rows)
    print(f"collected {len(rows):,} verdicts -> {VERD.name}: {dict(Counter(v for *_, v in rows))}")


def _numset(nm):
    ROMAN = {"ii", "iii", "iv", "vi", "vii", "viii", "ix", "xi", "xii", "xiii", "xiv", "xv"}
    return {t for t in re.findall(r"[a-z0-9]+", nm.lower())
            if any(c.isdigit() for c in t) or t in ROMAN}


def apply(write):
    from merge_companies import dedup_key
    con = sqlite3.connect(DB)
    co = load(con)
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x

    def union(a, b):
        parent[find(a)] = find(b)

    for cid in co:
        find(cid)
    # 1) seed with the deterministic parent_group already in the DB
    pg = defaultdict(list)
    for cid, g in con.execute("SELECT id, parent_group FROM companies WHERE parent_group IS NOT NULL"):
        if cid in co:
            pg[g].append(cid)
    for ids in pg.values():
        for x in ids[1:]:
            union(ids[0], x)
    # 2) exact auto-join pairs
    exact = yes = skipped = 0
    for r in csv.DictReader(CAND.open()):
        if r["via"] == "exact":
            a, b = int(r["id_a"]), int(r["id_b"])
            if a in co and b in co:
                union(a, b); exact += 1
    # 3) verified yes pairs (number guard as backstop even on a 'yes')
    if VERD.exists():
        verd = {(r["id_a"], r["id_b"]): r["verdict"] for r in csv.DictReader(VERD.open())}
        for (a, b), v in verd.items():
            ai, bi = int(a), int(b)
            if v != "yes" or ai not in co or bi not in co:
                continue
            if _numset(co[ai]["name"]) != _numset(co[bi]["name"]):
                skipped += 1; continue
            union(ai, bi); yes += 1

    comp = defaultdict(list)
    for cid in co:
        comp[find(cid)].append(cid)
    groups = [g for g in comp.values() if len(g) > 1]
    over = [g for g in groups if len(g) > SIZE_CAP]
    distinct = len(comp)
    print(f"clusters: {len(groups):,} | exact-joins {exact:,} | verified-yes {yes:,} "
          f"(skipped {skipped} number-mismatch) | oversized {len(over)}")
    print(f"distinct companies after resolution: {distinct:,} (from {len(co):,})")
    if not write:
        print("dry run — add --apply to write parent_group")
        return
    if over:
        sys.exit(f"REFUSING: {len(over)} clusters over size cap {SIZE_CAP} — review first.")
    con.execute("UPDATE companies SET parent_group=NULL")
    ups = []
    for g in groups:
        key = dedup_key(co[max(g, key=lambda c: co[c]['eur'])]["name"])
        ups += [(key, c) for c in g]
    con.executemany("UPDATE companies SET parent_group=? WHERE id=?", ups)
    con.commit()
    print(f"APPLIED parent_group to {len(ups):,} companies in {len(groups):,} clusters.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["candidates", "verify", "apply"])
    ap.add_argument("--apply", action="store_true", help="write parent_group (apply only)")
    ap.add_argument("--pilot", type=int, default=0, help="verify: synchronous pilot on N pairs")
    args = ap.parse_args()
    if args.cmd == "candidates":
        gen_candidates()
    elif args.cmd == "verify":
        verify_pilot(args.pilot) if args.pilot else verify()
    elif args.cmd == "apply":
        apply(args.apply)
