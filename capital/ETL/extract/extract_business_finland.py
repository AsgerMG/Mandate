"""Extract Business Finland funded projects — Sprint 17.

Data source:
  Business Finland (Innovaatiorahoituskeskus Business Finland) publishes
  its funding data via the Finnish open data portal avoindata.fi.

  Confirmed publisher: https://www.avoindata.fi/data/en_GB/organization/business-finland
  Dataset search: https://www.avoindata.fi/data/en_GB/dataset?q=business+finland+grants

  The dataset is likely published as CSV with fields like:
    ApplicationId, CompanyName, BusinessId, Region, Programme,
    DecisionYear, GrantedAmountEUR, ProjectTitle

  API access (CKAN-based avoindata.fi):
    Base: https://www.avoindata.fi/data/api/3
    Action: /action/datastore_search?resource_id=<id>&limit=5000
    Find resource ID: search for "Business Finland" on avoindata.fi

  SATR dedup rule: 1,988 SATR rows already tagged ndb_distributor='business_finland'.
  Dedup by canonical_name + country='FI' + year ± 1.

Run modes:
  python extract_business_finland.py --probe           → test API + find dataset
  python extract_business_finland.py --load-db         → fetch + dedup + load
  python extract_business_finland.py --local <path>    → load local CSV/JSON
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
import urllib.request
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

# CKAN API base for avoindata.fi
CKAN_BASE = "https://www.avoindata.fi/data/api/3"

# Known dataset/resource IDs (may change; run --probe to rediscover)
KNOWN_RESOURCE_IDS = [
    # Add IDs found via manual search of avoindata.fi
    # Example format: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
]

# Alternative direct endpoints
API_CANDIDATES = [
    f"{CKAN_BASE}/action/datastore_search?resource_id=business-finland-grants&limit=2",
    "https://api.businessfinland.fi/v1/grants?limit=2",
    "https://data.businessfinland.fi/api/v1/projects?limit=2",
]


def _get_json(url: str) -> dict | list | None:
    try:
        req = urllib.request.Request(
            url, headers={"User-Agent": "EuroInvTracker/1.0", "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


def _search_ckan_for_bf() -> list[str]:
    """Search avoindata.fi CKAN for Business Finland datasets, return resource IDs."""
    url = f"{CKAN_BASE}/action/package_search?q=business+finland&fq=organization:business-finland&rows=10"
    data = _get_json(url)
    if not data:
        return []
    results = data.get("result", {}).get("results", [])
    resource_ids = []
    for pkg in results:
        for res in pkg.get("resources", []):
            if res.get("format", "").upper() in ("CSV", "JSON", "XLSX"):
                print(f"  Found resource: {res.get('name')} — {res.get('id')} ({res.get('format')})")
                resource_ids.append(res["id"])
    return resource_ids


def _fetch_from_ckan(resource_id: str) -> list[dict]:
    all_records = []
    offset = 0
    while True:
        url = f"{CKAN_BASE}/action/datastore_search?resource_id={resource_id}&limit={PAGE_SIZE}&offset={offset}"
        data = _get_json(url)
        if not data:
            break
        result = data.get("result", {})
        records = result.get("records", [])
        if not records:
            break
        all_records.extend(records)
        print(f"  Offset {offset}: +{len(records)} (total {len(all_records)})")
        total = result.get("total", 0)
        offset += PAGE_SIZE
        if offset >= total:
            break
    return all_records


def _parse_record(rec: dict) -> dict | None:
    def _f(*keys: str) -> str:
        for k in keys:
            v = rec.get(k)
            if v is not None:
                return str(v).strip()
        return ""

    year_str = _f("DecisionYear", "Year", "GrantYear", "startDate", "year",
                   "Paatosvuosi", "Myontamisvuosi")
    year_match = re.search(r"(20\d{2})", year_str)
    if not year_match:
        return None
    year = int(year_match.group(1))
    if year < MIN_YEAR:
        return None

    name = _f("CompanyName", "Organisation", "Yritys", "Hakija", "company_name",
              "organisationName", "name")
    if not name:
        return None

    business_id = _f("BusinessId", "business_id", "YTunnus", "y_tunnus", "orgNr")

    amt_str = _f("GrantedAmountEUR", "Amount", "Grant", "Summa", "Myontosumma",
                 "GrantEUR", "amount_eur", "granted_amount")
    amt_str = re.sub(r"[^\d.,]", "", amt_str).replace(",", ".").replace(" ", "")
    try:
        amount_eur = float(amt_str) if amt_str else 0.0
    except ValueError:
        amount_eur = 0.0

    programme = _f("Programme", "Program", "Ohjelma", "FundingInstrument", "type")
    proj_id = _f("ApplicationId", "ProjectId", "Hakemustunnus", "id")
    title = _f("ProjectTitle", "Title", "Otsikko", "Projektin_nimi")

    slug = re.sub(r"[^a-z0-9]+", "_", programme.lower())[:20] or "grant"
    source = f"business_finland_{slug}_{year}"
    call_id = f"{source}_{proj_id or business_id or name[:20]}"

    return {
        "source": source,
        "call_id": call_id,
        "company_name": name,
        "company_name_norm": name.upper(),
        "business_id": business_id,
        "country": DEPLOYMENT_COUNTRY,
        "year": year,
        "project_id": proj_id,
        "project_title": title[:200],
        "programme": programme,
        "grant_amount_eur": round(amount_eur, 2),
        "ndb_distributor": NDB_DISTRIBUTOR,
        "deployment_country": DEPLOYMENT_COUNTRY,
    }


def _satr_dedup_set(con: sqlite3.Connection) -> set[tuple[str, int]]:
    cur = con.cursor()
    cur.execute(
        """SELECT UPPER(c.canonical_name),
                  CAST(strftime('%Y', pfe.project_started) AS INTEGER)
           FROM public_funding_events pfe
           JOIN companies c ON c.id = pfe.company_id
           WHERE pfe.source LIKE 'satr_%'
             AND pfe.ndb_distributor = 'business_finland'""")
    return {(row[0], row[1]) for row in cur.fetchall()}


def _load_to_db(rows: list[dict]) -> dict:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    satr_pairs = _satr_dedup_set(con)
    print(f"  SATR dedup set: {len(satr_pairs)} (business_finland, FI) pairs")

    cur.execute("PRAGMA table_info(companies)")
    col_names = {r[1] for r in cur.fetchall()}
    has_national_id = "national_id" in col_names

    counts = {"inserted": 0, "satr_deduped": 0, "skipped_dup": 0, "errors": 0}
    for r in rows:
        norm = r["company_name_norm"]
        year = r["year"]
        if any((norm, y) in satr_pairs for y in range(year - 1, year + 2)):
            counts["satr_deduped"] += 1
            continue
        try:
            cid = None
            if has_national_id and r.get("business_id"):
                cur.execute(
                    "SELECT id FROM companies WHERE national_id=? AND country='FI'",
                    (r["business_id"],))
                row = cur.fetchone()
                cid = row[0] if row else None
            if cid is None:
                cur.execute(
                    "SELECT id FROM companies WHERE canonical_name=? AND country='FI'", (norm,))
                row = cur.fetchone()
                cid = row[0] if row else None
            if cid is None:
                if has_national_id:
                    cur.execute(
                        """INSERT INTO companies (canonical_name, raw_name, country, national_id,
                           entity_type, match_method, match_confidence)
                           VALUES (?, ?, 'FI', ?, 'unknown', 'business_finland', 'medium')""",
                        (norm, r["company_name"], r.get("business_id") or None))
                else:
                    cur.execute(
                        """INSERT INTO companies (canonical_name, raw_name, country,
                           entity_type, match_method, match_confidence)
                           VALUES (?, ?, 'FI', 'unknown', 'business_finland', 'medium')""",
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
                 r.get("project_title") or None, f"{year}-01-01",
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
    parser = argparse.ArgumentParser(description="Extract Business Finland grants")
    parser.add_argument("--load-db", action="store_true")
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--local", metavar="PATH")
    args = parser.parse_args()

    if args.local:
        if args.local.endswith(".csv"):
            rows = []
            with open(args.local, encoding="utf-8", errors="replace") as f:
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
        else:
            with open(args.local) as f:
                raw = json.load(f)
            records = raw if isinstance(raw, list) else raw.get("records", raw.get("data", []))
            rows = [r for rec in records if (r := _parse_record(rec)) is not None]
    elif args.probe:
        print("Searching avoindata.fi CKAN for Business Finland datasets ...")
        resource_ids = _search_ckan_for_bf()
        if not resource_ids:
            print("  No datasets found via CKAN search.")
        for rid in resource_ids[:3]:
            url = f"{CKAN_BASE}/action/datastore_search?resource_id={rid}&limit=2"
            print(f"  Testing resource {rid}: {url}")
            data = _get_json(url)
            if data:
                print(f"    Response shape: {list(data.keys() if isinstance(data, dict) else [])}")
        print(
            "\nManual steps:\n"
            "  1. Visit https://www.avoindata.fi/data/en_GB/organization/business-finland\n"
            "  2. Find the grants/funded projects dataset\n"
            "  3. Download as CSV\n"
            "  4. Re-run: python extract_business_finland.py --local <file.csv> [--load-db]\n"
        )
        return
    else:
        # Try CKAN search + fetch
        resource_ids = _search_ckan_for_bf()
        rows = []
        for rid in resource_ids:
            records = _fetch_from_ckan(rid)
            rows.extend(r for rec in records if (r := _parse_record(rec)) is not None)
        if not rows:
            print("ERROR: No data found. Run --probe for diagnostics.", file=sys.stderr)
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
