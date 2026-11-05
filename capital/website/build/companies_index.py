"""Build a single compact company index for the competitive-intelligence agent.

The /companies lookup ships ~994 client-side shards (company_search.py).
The intelligence agent runs server-side and needs the opposite shape: one file
it can load once per warm serverless invocation and fuzzy-match competitor names
against. This script writes that file.

  web/public/data/companies_index.json
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
 11 rg  NUTS region id (level 1 or 2), "" when the register does not place the
        company. This is the company's OWN region, read from the State Aid
        Transparency Register's beneficiary field on its awards -- not a
        property of anything it was funded by.

        It exists to PRE-FILL the intake's region question. That question is
        worth 181 encoded, official region filters on 155 leaves, and takes the
        share of leaves a perfect answer could narrow to five rows from 8% to
        39% -- but it only pays if the founder actually answers it, and moving
        it to the first screen is a real cost on a form deliberately kept to six
        fields. A pre-filled answer the founder only has to CORRECT is what
        makes that trade worth taking.

        A REGISTERED ADDRESS IS NOT ALWAYS WHERE THE WORK HAPPENS, so this is
        offered as a default and never as a fact: the intake marks it as
        derived, and a founder's edit wins outright.

        Rolled up to at most 4 characters because that is the deepest level
        regions.generated.ts carries and the deepest a founder is ever offered
        (nuts_regions.MAX_ROUTING_LEVEL_CHARS). The register publishes many
        awards at level 3, and a level-3 id would match no option in the list.

Parent-group rollup mirrors company_search.py so the agent sees the same
deduplicated entities as the public lookup. A group is included if it has at
least one funding event (equity-only groups carry no EU "capital accessed"
figure and are not useful competitor signal here).
"""
from __future__ import annotations

import os
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from web_env import ROOT, SITE_DATA  # noqa: E402
from store import connect  # noqa: E402

# The register's region NAMES resolve to NUTS ids through Eurostat's own name
# register, never through a rule with an error rate. Same module the corpus's
# delivery regions come from, so a company and the funds it applies to are
# placed by one lookup rather than two that could disagree.
from nuts_regions import (  # noqa: E402
    ISO2_TO_NUTS, MAX_ROUTING_LEVEL_CHARS, MIN_ROUTING_LEVEL_CHARS,
    load_reference, resolve)

OUT = SITE_DATA / "companies_index.json"


def normalize(name: str) -> str:
    s = unicodedata.normalize("NFKD", name)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9 ]+", " ", s.lower()).strip()


def main():
    with connect(readonly=True, dict_rows=True) as con:
        _main(con)


def _main(con):
    # EVERY QUERY HERE STATES ITS ORDER, because the order reaches the output:
    # euro figures are float sums accumulated in fetch order, a group's
    # representative is the first of equally-funded members, the region is
    # Counter.most_common's first of equal counts, and the final sort is stable
    # on rounded euros. Each order is the one the SQLite store produced (events
    # by company country, company, event; companies and groups by id; region
    # keys in byte order, NULL first), so the move changed no byte of the file.

    # Per company: total EUR (grant, else debt), per-channel EUR, year span.
    totals: dict[int, float] = defaultdict(float)
    chan_eur: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    years: dict[int, list[int]] = defaultdict(list)
    for r in con.execute("""
        SELECT v.company_id, v.source_family,
               v.grant_amount_eur, v.debt_amount_eur, v.event_year
        FROM v_events v JOIN companies c ON c.id = v.company_id
        ORDER BY c.country COLLATE "C", v.company_id, v.id
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

    # Per company: where the register says its awards went, rolled up to a level
    # a founder is actually offered. Counted rather than taken from one award,
    # because a company with sites in two regions has two, and the modal one is
    # the honest default to put in front of them. 90.2% of the register's
    # 122,814 rows carry a region name Eurostat still recognises; the rest, and
    # the ones filed only at country level, resolve to nothing and pre-fill
    # nothing.
    index = load_reference()["index"]
    seen: dict[tuple[str, str], str] = {}
    regions: dict[int, Counter] = defaultdict(Counter)
    for r in con.execute("""
            SELECT company_id, granting_country_iso2, beneficiary_country_iso2,
                   region, COUNT(*)
              FROM satr_staging
             WHERE company_id IS NOT NULL
             GROUP BY 1, 2, 3, 4
             ORDER BY company_id,
                      granting_country_iso2 COLLATE "C" NULLS FIRST,
                      beneficiary_country_iso2 COLLATE "C" NULLS FIRST,
                      region COLLATE "C" NULLS FIRST"""):
        cid, gcc, bcc, region, n = (r["company_id"], r["granting_country_iso2"],
                                    r["beneficiary_country_iso2"], r["region"], r["count"])
        iso = bcc or gcc or ""
        key = (region or "", iso)
        if key not in seen:
            hit = resolve(region or "", ISO2_TO_NUTS.get(iso, iso), index)
            # Vintage 0 is NUTS-0 -- the country itself, which places nobody.
            got = hit[0][:MAX_ROUTING_LEVEL_CHARS] if hit and hit[1] > 0 else ""
            # A country-level id places nobody either, and some names resolve to
            # one with a real vintage attached, so the level test has to be on
            # the id rather than only on the vintage. 455 rows arrived here as
            # bare "FR"/"IT" before this line existed, and every one of them
            # would have pre-filled a region option that does not exist.
            seen[key] = got if len(got) >= MIN_ROUTING_LEVEL_CHARS else ""
        if seen[key]:
            regions[cid][seen[key]] += n

    meta: dict[int, dict] = {}
    members: dict[str, list[int]] = defaultdict(list)
    for r in con.execute(
            "SELECT id, canonical_name, country, sector_inferred, parent_group, "
            "sector_top, subsector, entity_type FROM companies ORDER BY id"):
        meta[r["id"]] = r
        members[r["parent_group"] or f"id{r['id']}"].append(r["id"])

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
        # Pooled across the group for the same reason the money is: a founder
        # typing the parent's name should get the parent's region.
        #
        # CONSTRAINED TO THE REPRESENTATIVE'S OWN COUNTRY, because a parent
        # group is routinely multinational and the modal region across it can
        # belong to a different country entirely. Unfiltered, this put FR10 on
        # a Dutch Air Liquide entity and NL41 on NXP's German one -- a pre-fill
        # naming a region that would not even appear in the option list the
        # founder's country generates, which is the one way this field can be
        # worse than empty.
        rep_prefix = ISO2_TO_NUTS.get(rep["country"] or "", rep["country"] or "")
        grp: Counter = Counter()
        for cid in ids:
            for rid, n in regions.get(cid, {}).items():
                if rep_prefix and rid.startswith(rep_prefix):
                    grp[rid] += n
        rg = grp.most_common(1)[0][0] if grp else ""
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
            rg,
        ])

    # Heaviest-funded first: if the agent ever truncates, it keeps the signal.
    rows.sort(key=lambda r: r[4], reverse=True)

    OUT.write_text(json.dumps(
        {"generatedAt": date.today().isoformat(),
         "companies": len(rows),
         "rows": rows},
        ensure_ascii=False, separators=(",", ":")))
    mb = OUT.stat().st_size / 1e6
    print(f"wrote {Path(os.path.relpath(OUT, ROOT))}: {len(rows)} companies, {mb:.1f} MB")


if __name__ == "__main__":
    main()
