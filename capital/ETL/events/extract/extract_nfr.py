"""Extract Norges Forskningsråd (Research Council Norway) company projects — Sprint 17.

Data source:
  Prosjektbanken — https://prosjektbanken.forskningsradet.no/
  REST API (discovered via DevTools 2026-06-10):
    https://prosjektbanken.forskningsradet.no/prosjektbanken/rest/projectlist
      ?Kilde=FORISS&sortBy=date&sortOrder=desc&resultCount=500&offset=N
  Response: {"projects": [...], "pagination": {"currentOffset": N, "totalHits": M}}

  Each project carries `organisations`: a list of [sector, subsector, ORG, dept]
  paths. The lead organisation is the first entry; sector "Næringsliv" = business.
  Server-side sector filtering isn't exposed, so we paginate (date-desc) until
  projects start before MIN_YEAR and filter client-side.

Scope:
  - startYear >= 2021
  - lead organisation sector == 'Næringsliv' (company-led projects only)
  - amount = totalFunding (NOK, total award over project life) → EUR

Schema mapping:
  source             = 'nfr_<activity_slug>_<startYear>'
  call_id            = 'nfr_<project_id>'
  grant_amount_eur   = totalFunding NOK → EUR (ECB annual rate of start year)
  deployment_country = 'NO'
  ndb_distributor    = 'nfr'

Run modes:
  python extract_nfr.py             → fetch + CSV only
  python extract_nfr.py --load-db   → fetch + match + load
  python extract_nfr.py --probe     → test API endpoint only
  python extract_nfr.py --local <json_path> → use cached nfr_projects.json
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
# --- end ETL path bootstrap ---

import argparse
import csv
import json
import re
import sqlite3
import sys
import time
from pathlib import Path

_sys_path_dir = str(Path(__file__).parent)
if _sys_path_dir not in sys.path:
    pass  # sys.path handled by etl_env bootstrap
from ndb_ssl import fetch_json as _fetch_json  # noqa: E402

BASE_DIR = _ETL_ROOT
RAW_DIR = BASE_DIR / "data" / "raw" / "nfr"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

CSV_PATH = OUT_DIR / "nfr_grants.csv"
DB_PATH = _ETL_DB
DEPLOYMENT_COUNTRY = "NO"
NDB_DISTRIBUTOR = "nfr"
MIN_YEAR = 2021
BUSINESS_SECTOR = "Næringsliv"

API_BASE = "https://prosjektbanken.forskningsradet.no/prosjektbanken/rest/projectlist"
PAGE_SIZE = 500
MAX_PAGES = 120  # safety cap (~60k records)

# ECB annual average NOK per EUR; fallback used for years not listed.
NOK_PER_EUR = {
    2021: 10.1633,
    2022: 10.1026,
    2023: 11.4248,
    2024: 11.6290,
    2025: 11.6700,
    2026: 11.6700,
}
NOK_PER_EUR_FALLBACK = 11.5


def _normalise_name(name: str) -> str:
    n = (name or "").upper()
    for suffix in [" AS", " ASA", " ANS", " DA", " SA", " BA", " A/S"]:
        if n.endswith(suffix):
            n = n[: -len(suffix)]
    n = re.sub(r"[^A-Z0-9ÆØÅÉ ]+", " ", n).strip()
    return re.sub(r"\s+", " ", n)


def _page_url(offset: int) -> str:
    return (f"{API_BASE}?Kilde=FORISS&sortBy=date&sortOrder=desc"
            f"&resultCount={PAGE_SIZE}&offset={offset}")


def _fetch_all() -> list[dict]:
    """Paginate date-desc until a full page starts before MIN_YEAR."""
    all_records: list[dict] = []
    offset = 0
    for _ in range(MAX_PAGES):
        data = _fetch_json(_page_url(offset), timeout=60)
        if not data or not isinstance(data, dict):
            print(f"  offset {offset}: request failed", file=sys.stderr)
            break
        projects = data.get("projects") or []
        if not projects:
            break
        all_records.extend(projects)
        total = (data.get("pagination") or {}).get("totalHits", 0)
        start_years = [
            (p.get("duration") or {}).get("startYear") or 0 for p in projects
        ]
        print(f"  offset {offset}: +{len(projects)} (total {len(all_records)}/{total}), "
              f"startYear range {min(start_years)}–{max(start_years)}")
        if max(start_years) < MIN_YEAR:
            break  # everything from here on is older than our window
        offset += len(projects)
        if total and offset >= total:
            break
        time.sleep(0.2)
    return all_records


def _parse_record(rec: dict) -> dict | None:
    duration = rec.get("duration") or {}
    year = duration.get("startYear") or 0
    if year < MIN_YEAR:
        return None

    orgs = rec.get("organisations") or []
    if not orgs or not orgs[0]:
        return None
    lead = orgs[0]
    sector = (lead[0] or "").strip() if len(lead) > 0 else ""
    if sector != BUSINESS_SECTOR:
        return None
    org_name = (lead[2] or "").strip() if len(lead) > 2 else ""
    if not org_name:
        return None

    amount_nok = float(rec.get("totalFunding") or 0)
    if amount_nok <= 0:
        return None
    amount_eur = amount_nok / NOK_PER_EUR.get(year, NOK_PER_EUR_FALLBACK)

    activity = ((rec.get("currentActivity") or {}).get("activity") or "other")
    slug = re.sub(r"[^a-z0-9]+", "_", activity.split("-")[0].lower()).strip("_")[:30] or "other"

    project_id = str(rec.get("id") or "")
    geo = rec.get("geographies") or []
    city = (geo[0][1] or "").strip() if geo and geo[0] and len(geo[0]) > 1 else ""

    return {
        "source": f"nfr_{slug}_{year}",
        "call_id": f"nfr_{project_id}",
        "company_name": org_name,
        "company_name_norm": _normalise_name(org_name),
        "country": DEPLOYMENT_COUNTRY,
        "city": city,
        "year": year,
        "project_id": project_id,
        "project_title": (rec.get("title") or "")[:200],
        "activity": activity,
        "grant_amount_eur": round(amount_eur, 2),
        "grant_amount_nok": amount_nok,
        "ndb_distributor": NDB_DISTRIBUTOR,
        "deployment_country": DEPLOYMENT_COUNTRY,
    }


def _load_to_db(rows: list[dict]) -> dict:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    counts = {"inserted": 0, "skipped_dup": 0, "errors": 0}
    for r in rows:
        try:
            norm = r["company_name_norm"]
            cur.execute(
                "SELECT id FROM companies WHERE canonical_name=? AND country='NO'",
                (norm,))
            row = cur.fetchone()
            if row:
                cid = row[0]
            else:
                cur.execute(
                    """INSERT INTO companies (canonical_name, raw_name, country, city,
                       entity_type, match_method, match_confidence)
                       VALUES (?, ?, 'NO', ?, 'unknown', 'nfr', 'medium')""",
                    (norm, r["company_name"], r["city"] or None))
                cid = cur.lastrowid

            cur.execute(
                "SELECT 1 FROM public_funding_events WHERE source=? AND call_id=?",
                (r["source"], r["call_id"]))
            if cur.fetchone():
                counts["skipped_dup"] += 1
                continue

            cur.execute(
                """INSERT INTO public_funding_events
                   (company_id, source, call_id, role, coordinator_only,
                    project_number, project_title, project_started,
                    grant_amount_eur, grant_amount_basis, deployment_country,
                    ndb_distributor)
                   VALUES (?, ?, ?, 'direct', 0, ?, ?, ?, ?, 'ndb_grant_total_award', ?, ?)""",
                (cid, r["source"], r["call_id"], r["project_id"] or None,
                 r["project_title"] or None, f"{r['year']}-01-01",
                 r["grant_amount_eur"], r["deployment_country"], r["ndb_distributor"]))
            counts["inserted"] += 1
        except Exception as e:
            counts["errors"] += 1
            if counts["errors"] <= 3:
                print(f"  ERROR {r.get('company_name', '?')}: {e}", file=sys.stderr)
    con.commit()
    con.close()
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract NFR company projects")
    parser.add_argument("--load-db", action="store_true")
    parser.add_argument("--probe", action="store_true", help="Test API endpoint only")
    parser.add_argument("--local", metavar="PATH", help="Use cached nfr_projects.json")
    args = parser.parse_args()

    if args.probe:
        data = _fetch_json(_page_url(0).replace(f"resultCount={PAGE_SIZE}", "resultCount=2"),
                           timeout=30)
        if data and data.get("projects"):
            total = (data.get("pagination") or {}).get("totalHits", "?")
            print(f"✓ Prosjektbanken API live. totalHits={total}")
            print(f"  Sample: {data['projects'][0].get('title','')[:80]}")
        else:
            print("✗ API probe failed", file=sys.stderr)
            sys.exit(1)
        return

    if args.local:
        raw_records = json.loads(Path(args.local).read_text(encoding="utf-8"))
        print(f"  Using local cache: {args.local} ({len(raw_records)} records)")
    else:
        print("Fetching Prosjektbanken FORISS projects (date-desc) ...")
        raw_records = _fetch_all()
        if not raw_records:
            print("ERROR: no records fetched", file=sys.stderr)
            sys.exit(1)
        raw_path = RAW_DIR / "nfr_projects.json"
        raw_path.write_text(json.dumps(raw_records, ensure_ascii=False), encoding="utf-8")
        print(f"  Cached {len(raw_records)} raw records → {raw_path}")

    rows = [r for rec in raw_records if (r := _parse_record(rec)) is not None]
    # In-run dedup by call_id (paging overlap safety)
    seen: set[str] = set()
    rows = [r for r in rows if not (r["call_id"] in seen or seen.add(r["call_id"]))]
    print(f"  {len(rows)} company-led ({BUSINESS_SECTOR}) projects {MIN_YEAR}+")
    if not rows:
        return

    out_fields = ["source", "call_id", "company_name", "country", "city", "year",
                  "project_id", "project_title", "activity",
                  "grant_amount_eur", "grant_amount_nok", "ndb_distributor"]
    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=out_fields, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)
    print(f"  CSV → {CSV_PATH} ({len(rows)} rows)")

    from collections import Counter
    for y, n in sorted(Counter(r["year"] for r in rows).items()):
        total = sum(r["grant_amount_eur"] for r in rows if r["year"] == y)
        print(f"    {y}: {n:>5} events  €{total/1e6:.1f}M")

    if args.load_db:
        counts = _load_to_db(rows)
        print(f"  Inserted: {counts['inserted']}, dup: {counts['skipped_dup']}, "
              f"errors: {counts['errors']}")
        print("  Run python3 ETL/events/transform/classify_taxonomy.py apply-nace && python3 ETL/events/transform/classify_taxonomy.py run after loading.")


if __name__ == "__main__":
    main()
