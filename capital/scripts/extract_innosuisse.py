"""Extract Innosuisse (Swiss Innovation Agency) funded projects — Sprint 17.

Data source:
  Innosuisse publishes project data via its data portal:
    https://www.innosuisse.admin.ch/en/figures-funding-data-portal

  Two access paths (try in order):
    1. Direct export from the data portal — look for CSV/Excel download button
       on the project search page:
       https://www.innosuisse.admin.ch/en/promotion-innovation/search-for-projects
    2. Innosuisse API (if available) — structure not confirmed; try:
       https://www.innosuisse.admin.ch/api/v1/projects?page=0&size=100
    3. Opendata.swiss dataset (confirmed publisher: Innosuisse):
       https://opendata.swiss/en/dataset?publisher=innosuisse

  Typical fields in Innosuisse project data:
    ProjectNr, Title, StartDate, EndDate, Organisation (lead company/research partner),
    Canton, GrantedAmount (CHF), ProjectType, FundingInstrument

  NOTE: Switzerland is not in the EU/EEA but IS in the 40-country Europe scope
  (included as EEA-associated country). country = 'CH'.

Schema mapping:
  source             = 'innosuisse_<instrument>_<year>'
  grant_amount_eur   = GrantedAmount CHF → EUR (CHF_EUR ≈ 0.96 in 2024)
  deployment_country = 'CH'
  ndb_distributor    = 'innosuisse'

Run modes:
  python extract_innosuisse.py --probe          → test API endpoint
  python extract_innosuisse.py --load-db        → fetch + load
  python extract_innosuisse.py --local <path>   → load from local CSV/JSON
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sqlite3
import sys
import urllib.request
import urllib.error
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
RAW_DIR = BASE_DIR / "data" / "raw" / "innosuisse"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

CSV_PATH = OUT_DIR / "innosuisse_grants.csv"
DB_PATH = BASE_DIR / "db.sqlite"
DEPLOYMENT_COUNTRY = "CH"
NDB_DISTRIBUTOR = "innosuisse"
CHF_EUR = 0.96  # approximate 2024 average
MIN_YEAR = 2021
PAGE_SIZE = 500

API_CANDIDATES = [
    "https://www.innosuisse.admin.ch/api/v1/projects",
    "https://www.innosuisse.admin.ch/api/projects",
    "https://api.innosuisse.admin.ch/v1/projects",
    "https://data.innosuisse.ch/api/v1/projects",
]

# Instrument → source slug fragment
INSTRUMENT_MAP = {
    "flagship": "flagship",
    "innovation_project": "innov_proj",
    "startup": "startup",
    "start-up": "startup",
    "nf": "natl_innovation",
    "impulse": "impulse",
    "incentive": "incentive",
}


def _get_json(url: str) -> dict | list | None:
    try:
        req = urllib.request.Request(
            url, headers={"User-Agent": "EuroInvTracker/1.0", "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


def _probe_api(candidates: list[str]) -> str | None:
    for base in candidates:
        url = base + "?page=0&size=2"
        print(f"  Trying: {url}")
        data = _get_json(url)
        if data and (isinstance(data, list) or
                     (isinstance(data, dict) and len(data) > 0)):
            print(f"  ✓ API at: {base}")
            return base
    return None


def _fetch_all(api_base: str) -> list[dict]:
    all_records = []
    for page in range(200):
        url = f"{api_base}?page={page}&size={PAGE_SIZE}&language=en"
        data = _get_json(url)
        if not data:
            break
        records = data if isinstance(data, list) else (
            data.get("content") or data.get("projects") or data.get("data") or [])
        if not records:
            break
        all_records.extend(records)
        print(f"  Page {page}: +{len(records)} (total {len(all_records)})")
        if isinstance(data, dict):
            if data.get("last") or len(all_records) >= (data.get("totalElements") or 99999):
                break
        if len(records) < PAGE_SIZE:
            break
    return all_records


def _parse_record(rec: dict) -> dict | None:
    def _f(*keys: str) -> str:
        for k in keys:
            v = rec.get(k)
            if v is not None:
                return str(v).strip()
        return ""

    year_str = _f("startDate", "StartDate", "start_date", "year", "callYear")
    year_match = re.search(r"(20\d{2})", year_str)
    if not year_match:
        return None
    year = int(year_match.group(1))
    if year < MIN_YEAR:
        return None

    # Lead organisation (usually the company partner for innovation projects)
    org = _f("implementingOrganisation", "leadOrganisation", "companyName",
             "applicantName", "organisationName", "partnerName", "company")
    if not org:
        return None

    amt_str = _f("grantedAmount", "amount", "grantAmount", "budget", "totalBudget")
    amt_str = re.sub(r"[^\d.,]", "", amt_str).replace(",", ".").replace("'", "")
    try:
        amount_chf = float(amt_str) if amt_str else 0.0
    except ValueError:
        amount_chf = 0.0

    instrument = _f("fundingInstrument", "instrument", "type", "projectType", "category")
    proj_id = _f("projectNumber", "projectId", "id", "number")
    title = _f("title", "projectTitle", "titleEnglish")

    slug = "other"
    for key, val in INSTRUMENT_MAP.items():
        if key.lower() in instrument.lower():
            slug = val
            break

    source = f"innosuisse_{slug}_{year}"
    call_id = f"{source}_{proj_id or re.sub(r'[^A-Z0-9]', '', org.upper())[:20]}"

    return {
        "source": source,
        "call_id": call_id,
        "company_name": org,
        "company_name_norm": org.upper(),
        "country": DEPLOYMENT_COUNTRY,
        "year": year,
        "project_id": proj_id,
        "project_title": title[:200],
        "instrument": instrument,
        "grant_amount_eur": round(amount_chf * CHF_EUR, 2),
        "grant_amount_chf": amount_chf,
        "ndb_distributor": NDB_DISTRIBUTOR,
        "deployment_country": DEPLOYMENT_COUNTRY,
    }


def _parse_csv_file(path: str) -> list[dict]:
    rows = []
    with open(path, encoding="utf-8", errors="replace") as f:
        for delim in (";", ",", "\t"):
            f.seek(0)
            reader = csv.DictReader(f, delimiter=delim)
            sample = next(reader, None)
            if sample and len(sample) >= 3:
                f.seek(0)
                for raw_row in csv.DictReader(f, delimiter=delim):
                    r = _parse_record({k.strip(): v for k, v in raw_row.items()})
                    if r:
                        rows.append(r)
                break
    return rows


def _load_to_db(rows: list[dict]) -> dict:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    counts = {"inserted": 0, "skipped_dup": 0, "errors": 0}
    for r in rows:
        try:
            norm = r["company_name_norm"]
            cur.execute("SELECT id FROM companies WHERE canonical_name=? AND country='CH'", (norm,))
            row = cur.fetchone()
            if row:
                cid = row[0]
            else:
                cur.execute(
                    """INSERT INTO companies (canonical_name, raw_name, country,
                       entity_type, match_method, match_confidence)
                       VALUES (?, ?, 'CH', 'unknown', 'innosuisse', 'medium')""",
                    (norm, r["company_name"]))
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
                    grant_amount_eur, grant_amount_basis, deployment_country, ndb_distributor)
                   VALUES (?, ?, ?, 'direct', 0, ?, ?, ?, ?, 'ndb_grant', ?, ?)""",
                (cid, r["source"], r["call_id"], r.get("project_id") or None,
                 r.get("project_title") or None, f"{r['year']}-01-01",
                 r["grant_amount_eur"], r["deployment_country"], r["ndb_distributor"]))
            counts["inserted"] += 1
        except Exception as e:
            counts["errors"] += 1
            if counts["errors"] <= 3:
                print(f"  ERROR {r.get('company_name','?')}: {e}", file=sys.stderr)
    con.commit()
    con.close()
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract Innosuisse funded projects")
    parser.add_argument("--load-db", action="store_true")
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--api-base", metavar="URL")
    parser.add_argument("--local", metavar="PATH")
    args = parser.parse_args()

    if args.local:
        if args.local.endswith(".csv"):
            rows = _parse_csv_file(args.local)
        else:
            with open(args.local) as f:
                raw = json.load(f)
            records = raw if isinstance(raw, list) else raw.get("content", raw.get("data", []))
            rows = [r for rec in records if (r := _parse_record(rec)) is not None]
    else:
        candidates = ([args.api_base] if args.api_base else []) + API_CANDIDATES
        if args.probe:
            _probe_api(candidates)
            print("\nIf no API found, manually export from:\n"
                  "  https://www.innosuisse.admin.ch/en/promotion-innovation/search-for-projects\n"
                  "Then re-run: python extract_innosuisse.py --local <file.csv>\n"
                  "\nAlso try opendata.swiss:\n"
                  "  https://opendata.swiss/en/dataset?publisher=innosuisse\n")
            return
        api_base = _probe_api(candidates)
        if not api_base:
            print("ERROR: API not found. Run --probe for diagnostics.", file=sys.stderr)
            sys.exit(1)
        raw = _fetch_all(api_base)
        rows = [r for rec in raw if (r := _parse_record(rec)) is not None]

    if not rows:
        print("  No rows extracted.")
        return

    out_fields = ["source", "call_id", "company_name", "country", "year",
                  "project_id", "project_title", "instrument",
                  "grant_amount_eur", "grant_amount_chf", "ndb_distributor"]
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
        print(f"  Inserted: {counts['inserted']}, dup: {counts['skipped_dup']}, errors: {counts['errors']}")
        print("  Run python3 classify.py after loading.")


if __name__ == "__main__":
    main()
