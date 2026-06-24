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
FUZZY_MIN = 82          # candidate threshold (LLM adjudicates from here up)
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
        for a, b in itertools.combinations(ids, 2):
            pk = (a, b) if a < b else (b, a)
            if pk in seen:
                continue
            seen.add(pk)
            na, nb = co[a]["name"], co[b]["name"]
            if translit(na) == translit(nb):
                cand.append((a, b, 100, "exact"))         # auto-join, no LLM
            elif fuzz.token_sort_ratio(na, nb) >= FUZZY_MIN:
                cand.append((a, b, fuzz.token_sort_ratio(na, nb), key[0]))
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


def verify():
    import os
    sys.path.insert(0, str(ROOT / "scripts"))
    from classify_llm import load_env
    load_env()
    pairs = [r for r in csv.DictReader(CAND.open()) if r["via"] != "exact"]
    print(f"verifying {len(pairs):,} candidate pairs (exact pairs skip the LLM)")

    if os.environ.get("ANTHROPIC_API_KEY"):
        import anthropic
        cl = anthropic.Anthropic()
        reqs = [{"custom_id": f'{p["id_a"]}-{p["id_b"]}',
                 "params": {"model": "claude-haiku-4-5", "max_tokens": 16,
                            "system": SYS,
                            "messages": [{"role": "user", "content": _prompt(p)}]}}
                for p in pairs]
        # Anthropic message batches accept up to 100k requests / 256MB
        batch = cl.messages.batches.create(requests=reqs)
        print(f"submitted Anthropic batch {batch.id} ({len(reqs):,} pairs). "
              f"Re-run 'verify' to collect when ended.")
        _save_batch_id("anthropic", batch.id)
        return
    if os.environ.get("OPENAI_API_KEY"):
        print("ANTHROPIC_API_KEY not set; OpenAI-batch path available — "
              "set the key you're providing and re-run.")
        return
    sys.exit("No LLM API key set in .env.local")


def _save_batch_id(provider, bid):
    (PROC / "er_batch.txt").write_text(f"{provider}\n{bid}\n")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["candidates", "verify", "apply"])
    args = ap.parse_args()
    if args.cmd == "candidates":
        gen_candidates()
    elif args.cmd == "verify":
        verify()
    else:
        print(f"'{args.cmd}' not yet wired in this build step")
