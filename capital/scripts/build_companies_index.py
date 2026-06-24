"""Build a single compact company index for the competitive-intelligence agent.

The /companies lookup ships ~994 client-side shards (build_company_search.py).
The intelligence agent runs server-side and needs the opposite shape: one file
it can load once per warm serverless invocation and fuzzy-match competitor names
against. This script writes that file.

  site/public/data/companies_index.json
    {"generatedAt": ..., "companies": N, "rows": [[n, q, c, s, eur, [ch,...]], ...]}

Rows are positional (terser than keyed objects at ~95k records):
  0 n   canonical display name (richest member of the parent group)
  1 q   normalized name(s), space-joined across every spelling variant
  2 c   ISO2 country
  3 s    sector_inferred
  4 eur  total grant+debt EUR across all events (rounded), 0 if none
  5 ch   distinct source_family channels, EU capital "doors" the group used

Parent-group rollup mirrors build_company_search.py so the agent sees the same
deduplicated entities as the public lookup. A group is included if it has at
least one funding event (equity-only groups carry no EU "capital accessed"
figure and are not useful competitor signal here).
"""
from __future__ import annotations

import json
import re
import sqlite3
import unicodedata
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "db.sqlite"
OUT = ROOT / "site" / "public" / "data" / "companies_index.json"


def normalize(name: str) -> str:
    s = unicodedata.normalize("NFKD", name)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9 ]+", " ", s.lower()).strip()


def main():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row

    # Per company: total EUR (grant, else debt) and the set of channels used.
    totals: dict[int, float] = defaultdict(float)
    channels: dict[int, set] = defaultdict(set)
    for r in con.execute("""
        SELECT v.company_id, v.source_family,
               v.grant_amount_eur, v.debt_amount_eur
        FROM v_events v
    """):
        amount = r["grant_amount_eur"]
        if amount is None and r["debt_amount_eur"]:
            amount = r["debt_amount_eur"]
        if amount:
            totals[r["company_id"]] += amount
        if r["source_family"]:
            channels[r["company_id"]].add(r["source_family"])

    meta: dict[int, sqlite3.Row] = {}
    members: dict[str, list[int]] = defaultdict(list)
    for r in con.execute(
            "SELECT id, canonical_name, country, sector_inferred, parent_group "
            "FROM companies"):
        meta[r["id"]] = r
        members[r["parent_group"] or f"id{r['id']}"].append(r["id"])
    con.close()

    rows: list[list] = []
    for gk, ids in members.items():
        ch: set = set()
        eur = 0.0
        for cid in ids:
            ch |= channels.get(cid, set())
            eur += totals.get(cid, 0.0)
        if not ch:                                   # no funding event → skip
            continue
        rep = meta[max(ids, key=lambda c: totals.get(c, 0.0))]
        norms = sorted({normalize(meta[c]["canonical_name"]) for c in ids})
        rows.append([
            rep["canonical_name"],
            " ".join(norms),
            rep["country"] or "",
            rep["sector_inferred"] or "",
            round(eur),
            sorted(ch),
        ])

    # Heaviest-funded first: if the agent ever truncates, it keeps the signal.
    rows.sort(key=lambda r: r[4], reverse=True)

    OUT.write_text(json.dumps(
        {"generatedAt": date.today().isoformat(),
         "companies": len(rows),
         "rows": rows},
        ensure_ascii=False, separators=(",", ":")))
    mb = OUT.stat().st_size / 1e6
    print(f"wrote {OUT.relative_to(ROOT)}: {len(rows)} companies, {mb:.1f} MB")


if __name__ == "__main__":
    main()
