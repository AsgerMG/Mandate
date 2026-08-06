"""Probe: what is actually IN the quote cache, and can any of it pay?

Reads Postgres (never SQLite -- the two are not kept in sync and SQLite is not
what the product reads). Answers, in order:

  1. which instruments have no `eligibility_text` but DO hold verbatim quotes
     in `eligibility_gates` / `eligibility_clauses`;
  2. how many of those are publishable AND sit in a multi-leaf regime, i.e.
     can move the sibling metric at all;
  3. whether the text they would assemble is DISTINCT from its siblings', or
     the same regime document copied onto every leaf.

(3) is the whole question. Filling a column with a regime's shared boilerplate
raises coverage and cuts the sibling class by exactly zero.
"""
from __future__ import annotations

import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

import psycopg2
import psycopg2.extras

REPO = Path(__file__).resolve().parents[1]
TIERS = json.loads(
    (REPO / "website/frontend/lib/intelligence/evidenceTiers.json").read_text())
# Presented eligibility prose is shown to a founder as the fund's own words, so
# it is held to the CITED bar -- not `attributable`, which may only structure.
CITED = set(TIERS["cited"]["tiers"])
INADMISSIBLE = set(TIERS["inadmissible"]["tiers"])


def env() -> None:
    for line in (Path("/Users/asgermollergrimberg/Wincent/.env.local")).read_text().splitlines():
        m = re.match(r"^([A-Z_]+)=(.*)$", line)
        if m:
            os.environ[m.group(1)] = m.group(2).strip().strip("\"'")


def connect():
    env()
    return psycopg2.connect(os.environ["DATABASE_URL"])


def publishable_ids() -> set[str]:
    p = REPO / "publishable_ids.json"
    return set(json.loads(p.read_text()))


def norm(s: str | None) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip().lower()


def load(cur):
    cur.execute("""
        SELECT id, parent_id, country, name, is_framework,
               administering_body, delivery_region, eligibility_text,
               eligibility_source_url, eligibility_confidence, eligibility_fetched_at,
               scheme_end_date
          FROM funding_instruments""")
    return {r["id"]: dict(r) for r in cur.fetchall()}


def load_quotes(cur):
    """Every verbatim quote we hold, per instrument, with its tier and origin."""
    out = defaultdict(list)
    cur.execute("""
        SELECT instrument_id, gate_key AS key, gate_family AS family, requirement AS body,
               quote, source_file, source_locator, verification_level, created_at,
               'gate' AS kind, gate_role
          FROM eligibility_gates WHERE quote IS NOT NULL AND length(trim(quote)) > 0""")
    for r in cur.fetchall():
        out[r["instrument_id"]].append(dict(r))
    cur.execute("""
        SELECT instrument_id, clause_key AS key, clause_type AS family, text AS body,
               quote, source_file, source_locator, verification_level, created_at,
               'clause' AS kind, NULL AS gate_role
          FROM eligibility_clauses WHERE quote IS NOT NULL AND length(trim(quote)) > 0""")
    for r in cur.fetchall():
        out[r["instrument_id"]].append(dict(r))
    return out


def assemble(quotes: list[dict]) -> str:
    """The candidate eligibility_text: the instrument's own cited quotes, in
    stable order, de-duplicated. No paraphrase -- verbatim only."""
    seen, parts = set(), []
    for q in sorted(quotes, key=lambda q: (q["family"] or "", q["key"] or "")):
        if q["verification_level"] not in CITED:
            continue
        t = re.sub(r"\s+", " ", q["quote"]).strip()
        if len(t) < 20 or norm(t) in seen:
            continue
        seen.add(norm(t))
        parts.append(t)
    return " ".join(parts)


def main() -> None:
    conn = connect()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    inst = load(cur)
    quotes = load_quotes(cur)
    pub = publishable_ids()

    regime = defaultdict(list)
    for i in inst.values():
        regime[i["parent_id"] or i["id"]].append(i["id"])
    multi = {k for k, v in regime.items() if len(v) > 1}

    # ---- 1. the cache -----------------------------------------------------
    cand = []
    for iid, i in inst.items():
        if norm(i["eligibility_text"]):
            continue
        qs = quotes.get(iid) or []
        if not qs:
            continue
        text = assemble(qs)
        if len(text) < 40:
            continue
        cand.append(iid)

    print(f"instruments with NO eligibility_text but >=40 chars of CITED quote: {len(cand)}")

    on_board = [i for i in cand if (inst[i]["parent_id"] or i) in multi]
    pub_board = [i for i in on_board if i in pub]
    print(f"  ... in a multi-leaf regime: {len(on_board)}")
    print(f"  ... AND publishable:        {len(pub_board)}")

    by_cc = defaultdict(lambda: [0, 0, 0])
    for i in cand:
        b = by_cc[inst[i]["country"]]
        b[0] += 1
        if (inst[i]["parent_id"] or i) in multi:
            b[1] += 1
            if i in pub:
                b[2] += 1
    print("\n  cc   cached  on-board  publishable-on-board")
    for cc, b in sorted(by_cc.items(), key=lambda kv: -kv[1][2]):
        print(f"  {cc or '??':<4} {b[0]:>6} {b[1]:>9} {b[2]:>11}")

    # ---- 2. distinctness, per regime -------------------------------------
    print("\n=== DISTINCTNESS: would the assembled text separate anything? ===")
    print("regime                          leaves  cand  distinct  vs-existing-sib  verdict")
    total_useful = 0
    useful_ids: list[str] = []
    for rid in sorted(multi, key=lambda r: -len([i for i in regime[r] if i in cand])):
        members = regime[rid]
        mine = [i for i in members if i in cand]
        if not mine:
            continue
        texts = {i: assemble(quotes[i]) for i in mine}
        # what the siblings ALREADY say -- a candidate that duplicates a
        # sibling's existing eligibility_text separates nothing either.
        existing = {norm(inst[i]["eligibility_text"])
                    for i in members if norm(inst[i]["eligibility_text"])}
        groups = defaultdict(list)
        for i, t in texts.items():
            groups[norm(t)].append(i)
        distinct = len(groups)
        clash = sum(1 for i, t in texts.items() if norm(t) in existing)
        # useful = its assembled text is unique among candidates AND unseen
        # among siblings that already carry text
        useful = [i for i, t in texts.items()
                  if len(groups[norm(t)]) == 1 and norm(t) not in existing]
        total_useful += len(useful)
        useful_ids.extend(useful)
        verdict = ("REGIME-INHERITED" if distinct == 1 and len(mine) > 1
                   else "usable" if len(useful) == len(mine) else "mixed")
        print(f"{rid[:30]:<30} {len(members):>6} {len(mine):>5} {distinct:>9} "
              f"{clash:>16}  {verdict}")
    print(f"\ncandidates whose assembled text is genuinely NEW and DISTINCT: {total_useful}")
    pub_useful = [i for i in useful_ids if i in pub]
    print(f"  ... of which publishable: {len(pub_useful)}")

    out = REPO / "harvest_candidates.json"
    out.write_text(json.dumps({
        "all": cand,
        "on_board": on_board,
        "publishable_on_board": pub_board,
        "useful": useful_ids,
        "publishable_useful": pub_useful,
    }, indent=0))
    print(f"\nwrote {out}")

    # ---- 3. tier audit ----------------------------------------------------
    tiers = defaultdict(int)
    for iid in inst:
        for q in quotes.get(iid) or []:
            tiers[q["verification_level"]] += 1
    print("\nquote tiers across the corpus (inadmissible are EXCLUDED above):")
    for t, n in sorted(tiers.items(), key=lambda kv: -kv[1]):
        flag = " <- inadmissible" if t in INADMISSIBLE else (" <- cited" if t in CITED else "")
        print(f"  {t:<22} {n:>6}{flag}")


if __name__ == "__main__":
    sys.exit(main())
