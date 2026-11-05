"""Extract Business Finland funded projects.

Data source (rewired 2026-06-26 — the old avoindata.fi CKAN feed is gone: the
portal migrated to avoindata.suomi.fi and Business Finland removed its grants
dataset, leaving only a tourism dataset):
  research.fi (Research Information Hub, run by CSC) exposes every Finnish public
  funding decision via an Elasticsearch portal API. We query the `funding` index
  filtered to funder = "Innovaatiorahoituskeskus Business Finland":
    POST https://researchfi-api-production.2.rahtiapp.fi/portalapi/funding/_search

  Each decision carries a `fundingGroupPerson` list naming each recipient
  organisation (consortiumOrganizationNameEn), its Finnish business ID, and its
  share of the grant (shareOfFundingInEur, already in EUR). Amounts need no FX.

  SATR dedup rule: ~1,988 SATR rows already tagged ndb_distributor='business_finland'.
  Dedup by canonical_name + country='FI' + year ± 1.

Run modes:
  python extract_business_finland.py --probe           → fetch + show parsed sample
  python extract_business_finland.py --load-db         → fetch + dedup + load
  python extract_business_finland.py --local <path>    → load a saved ES JSON dump
"""
from __future__ import annotations


# --- ETL path bootstrap (auto-added; see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB as _ETL_DB, ROOT as _ETL_ROOT  # noqa: E402,F401
from store import columns, connect  # noqa: E402
# --- end ETL path bootstrap ---

import argparse
import csv
import json
import re
import subprocess
import sys
from pathlib import Path

BASE_DIR = _ETL_ROOT
RAW_DIR = BASE_DIR / "data" / "raw" / "business_finland"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

CSV_PATH = OUT_DIR / "business_finland_grants.csv"
DB_PATH = _ETL_DB
DEPLOYMENT_COUNTRY = "FI"
NDB_DISTRIBUTOR = "business_finland"
MIN_YEAR = 2021
PAGE_SIZE = 5000

# research.fi portal API (Research Information Hub, CSC). The `funding` index
# holds every Finnish public funding decision, including Business Finland's.
RFI_SEARCH = ("https://researchfi-api-production.2.rahtiapp.fi"
              "/portalapi/funding/_search")
RFI_FUNDER = "Innovaatiorahoituskeskus Business Finland"
ES_WINDOW = 10000  # ES max_result_window; BF doc count is below this


def _fetch_research_fi() -> list[dict]:
    """Fetch every Business Finland funding decision from research.fi.

    Uses curl (long timeout) like the other large-payload extractors. One bulk
    query — the BF doc count is under the 10k result window.
    """
    body = json.dumps({
        "size": ES_WINDOW,
        "query": {"match_phrase": {"funderNameEn": RFI_FUNDER}},
    })
    print(f"  POST {RFI_SEARCH}  (funder='{RFI_FUNDER}')")
    result = subprocess.run(
        ["curl", "-sL", "--max-time", "180", "-X", "POST",
         "-H", "Content-Type: application/json",
         "-H", "User-Agent: Wincent/1.0",
         "-d", body, RFI_SEARCH],
        capture_output=True, timeout=240,
    )
    if result.returncode != 0:
        raise RuntimeError(f"curl failed: {result.stderr.decode()[:200]}")
    data = json.loads(result.stdout)
    hits = (data.get("hits") or {}).get("hits") or []
    if not hits:
        raise SystemExit(f"research.fi returned no BF hits: {str(data)[:160]}")
    print(f"  fetched {len(hits)} funding docs")
    return [h["_source"] for h in hits]


def _parse_record(rec: dict) -> list[dict]:
    """One row per funded organisation in a research.fi funding decision.

    Each decision carries a `fundingGroupPerson` list; every entry names the
    recipient organisation (consortiumOrganizationName*), its Finnish business
    ID, and its share of the grant (shareOfFundingInEur).
    """
    try:
        year = int(rec.get("fundingStartYear") or 0)
    except (TypeError, ValueError):
        return []
    if year < MIN_YEAR:
        return []

    proj_no = str(rec.get("funderProjectNumber") or rec.get("projectId") or "").strip()
    title = str(rec.get("projectNameEn") or rec.get("projectNameFi")
                or rec.get("projectNameUnd") or "").strip()
    source = f"business_finland_{year}"

    rows: list[dict] = []
    seen: set[str] = set()
    for fgp in rec.get("fundingGroupPerson") or []:
        if not isinstance(fgp, dict):
            continue
        name = (fgp.get("consortiumOrganizationNameEn")
                or fgp.get("consortiumOrganizationNameFi") or "").strip()
        if not name:
            continue
        business_id = str(fgp.get("consortiumOrganizationBusinessId") or "").strip()
        try:
            amount_eur = float(fgp.get("shareOfFundingInEur") or 0)
        except (TypeError, ValueError):
            amount_eur = 0.0
        key = business_id or name.upper()
        if key in seen:        # one org may appear twice in a consortium list
            continue
        seen.add(key)
        call_id = f"{source}_{proj_no or title[:20]}_{key}"
        rows.append({
            "source": source,
            "call_id": call_id,
            "company_name": name,
            "company_name_norm": name.upper(),
            "business_id": business_id,
            "country": DEPLOYMENT_COUNTRY,
            "year": year,
            "project_id": proj_no,
            "project_title": title[:200],
            "programme": "business_finland",
            "grant_amount_eur": round(amount_eur, 2),
            "ndb_distributor": NDB_DISTRIBUTOR,
            "deployment_country": DEPLOYMENT_COUNTRY,
        })
    return rows


def _satr_dedup_set(con) -> set[tuple[str, int]]:
    cur = con.cursor()
    cur.execute(
        """SELECT translate(c.canonical_name, 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'),
                  -- strftime('%Y', x) in SQLite: NULL unless x is a date
                  CASE WHEN pfe.project_started ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                       THEN substr(pfe.project_started, 1, 4)::int END
           FROM public_funding_events pfe
           JOIN companies c ON c.id = pfe.company_id
           WHERE pfe.source LIKE 'satr_%'
             AND pfe.ndb_distributor = 'business_finland'""")
    return {(row[0], row[1]) for row in cur.fetchall()}


def _load_to_db(rows: list[dict]) -> dict:
    with connect() as con:
        cur = con.cursor()
        satr_pairs = _satr_dedup_set(con)
        print(f"  SATR dedup set: {len(satr_pairs)} (business_finland, FI) pairs")

        col_names = set(columns(con, "companies"))
        has_national_id = "national_id" in col_names

        counts = {"inserted": 0, "satr_deduped": 0, "skipped_dup": 0, "errors": 0}
        for r in rows:
            norm = r["company_name_norm"]
            year = r["year"]
            if any((norm, y) in satr_pairs for y in range(year - 1, year + 2)):
                counts["satr_deduped"] += 1
                continue
            try:
                # A savepoint per row: a failed statement must not abort the rest
                # of the load, which is what SQLite's per-row except allowed.
                with con.transaction():
                    cid = None
                    if has_national_id and r.get("business_id"):
                        cur.execute(
                            "SELECT id FROM companies WHERE national_id=%s AND country='FI' ORDER BY id",
                            (r["business_id"],))
                        row = cur.fetchone()
                        cid = row[0] if row else None
                    if cid is None:
                        cur.execute(
                            "SELECT id FROM companies WHERE canonical_name=%s AND country='FI' ORDER BY id", (norm,))
                        row = cur.fetchone()
                        cid = row[0] if row else None
                    if cid is None:
                        if has_national_id:
                            cur.execute(
                                """INSERT INTO companies (canonical_name, raw_name, country, national_id,
                                   entity_type, match_method, match_confidence)
                                   VALUES (%s, %s, 'FI', %s, 'unknown', 'business_finland', 'medium') RETURNING id""",
                                (norm, r["company_name"], r.get("business_id") or None))
                        else:
                            cur.execute(
                                """INSERT INTO companies (canonical_name, raw_name, country,
                                   entity_type, match_method, match_confidence)
                                   VALUES (%s, %s, 'FI', 'unknown', 'business_finland', 'medium') RETURNING id""",
                                (norm, r["company_name"]))
                        cid = cur.fetchone()[0]
                    cur.execute(
                        "SELECT 1 FROM public_funding_events WHERE source=%s AND call_id=%s",
                        (r["source"], r["call_id"]))
                    if cur.fetchone():
                        counts["skipped_dup"] += 1
                        continue
                    cur.execute(
                        """INSERT INTO public_funding_events
                           (company_id, source, call_id, role, coordinator_only,
                            project_number, project_title, project_started,
                            grant_amount_eur, grant_amount_basis, deployment_country, ndb_distributor)
                           VALUES (%s, %s, %s, 'direct', 0, %s, %s, %s, %s, 'ndb_grant', %s, %s)""",
                        (cid, r["source"], r["call_id"], r.get("project_id") or None,
                         r.get("project_title") or None, f"{year}-01-01",
                         r["grant_amount_eur"], r["deployment_country"], r["ndb_distributor"]))
                    counts["inserted"] += 1
            except Exception as e:
                counts["errors"] += 1
                if counts["errors"] <= 3:
                    print(f"  ERROR {r.get('company_name','?')}: {e}", file=sys.stderr)
        con.commit()
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract Business Finland grants")
    parser.add_argument("--load-db", action="store_true")
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--local", metavar="PATH")
    args = parser.parse_args()

    if args.local:
        with open(args.local) as f:
            raw = json.load(f)
        records = (raw if isinstance(raw, list)
                   else [h["_source"] for h in (raw.get("hits") or {}).get("hits") or []])
        rows = [row for rec in records for row in _parse_record(rec)]
    elif args.probe:
        print(f"Probing research.fi funding index for '{RFI_FUNDER}' ...")
        recs = _fetch_research_fi()
        sample = [row for rec in recs[:50] for row in _parse_record(rec)]
        print(f"  {len(recs)} docs → {len(sample)} parsed org-rows (first 50 docs)")
        for r in sample[:5]:
            print(f"    {r['year']} {r['company_name'][:40]:<40} €{r['grant_amount_eur']/1e3:.0f}k")
        return
    else:
        records = _fetch_research_fi()
        rows = [row for rec in records for row in _parse_record(rec)]
        if not rows:
            print("ERROR: No data parsed from research.fi.", file=sys.stderr)
            sys.exit(1)

    if not rows:
        print("  No rows extracted.")
        return

    out_fields = ["source", "call_id", "company_name", "business_id", "country", "year",
                  "project_id", "project_title", "programme", "grant_amount_eur",
                  "ndb_distributor"]
    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=out_fields, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)
    print(f"  CSV → {CSV_PATH} ({len(rows)} rows)")
    from collections import Counter
    for y, n in sorted(Counter(r["year"] for r in rows).items()):
        print(f"    {y}: {n:>5}  €{sum(r['grant_amount_eur'] for r in rows if r['year']==y)/1e6:.1f}M")

    if args.load_db:
        counts = _load_to_db(rows)
        print(f"  Inserted: {counts['inserted']}, SATR-deduped: {counts['satr_deduped']}, "
              f"dup: {counts['skipped_dup']}, errors: {counts['errors']}")
        print("  Run python3 classify.py after loading.")


if __name__ == "__main__":
    main()
