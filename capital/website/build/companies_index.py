"""Build a single compact company index for the competitive-intelligence agent.

The /companies lookup ships ~994 client-side shards (company_search.py).
The intelligence agent runs server-side and needs the opposite shape: one file
it can load once per warm serverless invocation and fuzzy-match competitor names
against. This script writes that file.

  website/frontend/public/data/companies_index.json
    {"generatedAt": ..., "companies": N,
     "rows": [[n, q, c, s, eur, [[ch,eur],...], y0, y1], ...]}

Rows are positional (terser than keyed objects at ~149k records):
  0 n   canonical display name (richest member of the parent group)
  1 q   normalized name(s), space-joined across every spelling variant
  2 c   ISO2 country
  3 s    sector_inferred
  4 eur  total grant+debt EUR across all events (rounded), 0 if none
  5 ca  per-channel committed EUR, [[source_family, eur], ...] sorted desc.
        The intelligence memo needs concrete per-door figures ("€2.5M via EIC,
        €1.8M via Bpifrance"), not just a lump sum and a bare channel list.
  6 y0  first event year across the group (int), 0 if no dated event
  7 y1  last event year across the group (int), 0 if no dated event
  8 st  sector_top (broad Tier-1 of the two-tier taxonomy), "" if unclassified
  9 ss  subsector (granular Tier-2), "" if unclassified
        Tiers 8/9 power database-native peer discovery: find funded companies in
        the same sub-sector instead of relying only on web-search name matches.
 10 et  entity_type ("company"/"research_org"/"unknown"/...), to keep universities
        and public bodies out of competitive-peer lists.

Parent-group rollup mirrors company_search.py so the agent sees the same
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
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from web_env import ROOT, DB, SITE_DATA  # noqa: E402

OUT = SITE_DATA / "companies_index.json"


def normalize(name: str) -> str:
    s = unicodedata.normalize("NFKD", name)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9 ]+", " ", s.lower()).strip()


def main():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row

    # Per company: total EUR (grant, else debt), per-channel EUR, year span.
    totals: dict[int, float] = defaultdict(float)
    chan_eur: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    years: dict[int, list[int]] = defaultdict(list)
    for r in con.execute("""
        SELECT v.company_id, v.source_family,
               v.grant_amount_eur, v.debt_amount_eur, v.event_year
        FROM v_events v
    """):
        amount = r["grant_amount_eur"]
        if amount is None and r["debt_amount_eur"]:
            amount = r["debt_amount_eur"]
        if amount:
            totals[r["company_id"]] += amount
        if r["source_family"]:
            chan_eur[r["company_id"]][r["source_family"]] += amount or 0.0
        if r["event_year"]:
            years[r["company_id"]].append(int(r["event_year"]))

    meta: dict[int, sqlite3.Row] = {}
    members: dict[str, list[int]] = defaultdict(list)
    for r in con.execute(
            "SELECT id, canonical_name, country, sector_inferred, parent_group, "
            "sector_top, subsector, entity_type FROM companies"):
        meta[r["id"]] = r
        members[r["parent_group"] or f"id{r['id']}"].append(r["id"])
    con.close()

    rows: list[list] = []
    for gk, ids in members.items():
        ch_eur: dict[str, float] = defaultdict(float)
        eur = 0.0
        yrs: list[int] = []
        for cid in ids:
            for c, a in chan_eur.get(cid, {}).items():
                ch_eur[c] += a
            eur += totals.get(cid, 0.0)
            yrs.extend(years.get(cid, ()))
        if not ch_eur:                               # no funding event → skip
            continue
        rep = meta[max(ids, key=lambda c: totals.get(c, 0.0))]
        norms = sorted({normalize(meta[c]["canonical_name"]) for c in ids})
        ca = sorted(([c, round(a)] for c, a in ch_eur.items()),
                    key=lambda x: x[1], reverse=True)
        rows.append([
            rep["canonical_name"],
            " ".join(norms),
            rep["country"] or "",
            rep["sector_inferred"] or "",
            round(eur),
            ca,
            min(yrs) if yrs else 0,
            max(yrs) if yrs else 0,
            rep["sector_top"] or "",
            rep["subsector"] or "",
            rep["entity_type"] or "",
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
