"""Extract Norges Forskningsråd (Research Council Norway) funded projects — Sprint 17.

Data source:
  Prosjektbanken — https://prosjektbanken.forskningsradet.no/
  The frontend is a React SPA backed by a Java Jersey REST + Elasticsearch API.

  API discovery (run once locally to find the actual endpoint):
    1. Open https://prosjektbanken.forskningsradet.no/explore/projects in Chrome
    2. Open DevTools → Network → filter for XHR/Fetch requests
    3. Look for a request like /prosjekter, /projects, /api/... that returns JSON
    4. Note the URL and pass it with --api-base

  Known candidate endpoints (try with --probe):
    https://prosjektbanken.forskningsradet.no/prosjekter
    https://prosjektbanken.forskningsradet.no/api/prosjekter
    https://prosjektbanken.forskningsradet.no/backend/prosjekter

  CSV fallback: The dataset also appears on data.norge.no under publisher
  "Norges forskningsråd". Search: https://data.norge.no → "forskningsrådet prosjekter"
  If found, download the CSV and use --local <path>.

  Typical API parameters:
    page=0, size=1000, sort=startDato,desc
    Kilde=FORISS (filter to company-eligible calls)
    fromYear=2021, toYear=2026

Schema mapping:
  source             = 'nfr_<prosjekttype>_<year>'
  grant_amount_eur   = bevilgning NOK → EUR (NOK_EUR = 1/11.5)
  deployment_country = 'NO'
  ndb_distributor    = 'nfr'

Run modes:
  python extract_nfr.py --probe               → discover/test API endpoint
  python extract_nfr.py --load-db             → fetch + load
  python extract_nfr.py --local <csv_path>    → load from local file
  python extract_nfr.py --api-base <url>      → override API base URL
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sqlite3
import sys
import urllib.request
import urllib.error
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
RAW_DIR = BASE_DIR / "data" / "raw" / "nfr"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

CSV_PATH = OUT_DIR / "nfr_grants.csv"
DB_PATH = BASE_DIR / "db.sqlite"
DEPLOYMENT_COUNTRY = "NO"
NDB_DISTRIBUTOR = "nfr"
NOK_EUR = 1 / 11.5
MIN_YEAR = 2021

# Candidate API base URLs to try (first that returns valid JSON wins)
API_CANDIDATES = [
    "https://prosjektbanken.forskningsradet.no/prosjekter",
    "https://prosjektbanken.forskningsradet.no/api/prosjekter",
    "https://prosjektbanken.forskningsradet.no/backend/prosjekter",
    "https://prosjektbanken.forskningsradet.no/rest/prosjekter",
    "https://prosjektbanken.forskningsradet.no/explore/api/prosjekter",
]

PAGE_SIZE = 1000
MAX_PAGES = 50  # safety cap


def _get(url: str, timeout: int = 30) -> dict | list | None:
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "EuroInvTracker/1.0",
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8", errors="replace"))
    except Exception as e:
        return None


def _probe_api(candidates: list[str]) -> str | None:
    """Try each candidate and return the first one that returns JSON with project data."""
    test_params = "?page=0&size=2&sort=startDato,desc&fromYear=2021"
    for base in candidates:
        url = base + test_params
        print(f"  Trying: {url}")
        data = _get(url)
        if data and (isinstance(data, list) or (isinstance(data, dict) and (
                "content" in data or "prosjekter" in data or "hits" in data or
                "results" in data or "data" in data))):
            print(f"  ✓ Found working API at: {base}")
            return base
        if data:
            print(f"    Got JSON but unexpected shape: {str(data)[:100]}")
        else:
            print(f"    No JSON response")
    return None


def _fetch_all(api_base: str) -> list[dict]:
    """Paginate through the API and return all project records."""
    all_rows = []
    for page in range(MAX_PAGES):
        url = (f"{api_base}?page={page}&size={PAGE_SIZE}"
               f"&sort=startDato,desc&fromYear={MIN_YEAR}")
        data = _get(url)
        if data is None:
            print(f"  Page {page}: request failed", file=sys.stderr)
            break

        # Handle different response shapes
        if isinstance(data, list):
            records = data
        elif isinstance(data, dict):
            records = (data.get("content") or data.get("prosjekter") or
                       data.get("hits") or data.get("results") or
                       data.get("data") or [])
        else:
            break

        if not records:
            break
        all_rows.extend(records)
        print(f"  Page {page}: +{len(records)} records (total {len(all_rows)})")

        # Pagination termination: check if last page
        if isinstance(data, dict):
            total = (data.get("totalElements") or data.get("total") or
                     data.get("totalCount") or 0)
            if total and len(all_rows) >= total:
                break
            last = data.get("last") or data.get("isLast") or False
            if last:
                break

        if len(records) < PAGE_SIZE:
            break

    return all_rows


def _parse_record(rec: dict) -> dict | None:
    """Extract fields from a Prosjektbanken record (field names may vary)."""

    def _f(*keys: str) -> str:
        for k in keys:
            v = rec.get(k)
            if v is not None:
                return str(v).strip()
        return ""

    year_str = _f("startDato", "startDate", "year", "aar")
    year_match = re.search(r"(20\d{2})", year_str)
    if not year_match:
        return None
    year = int(year_match.group(1))
    if year < MIN_YEAR:
        return None

    # Organisation (lead/applicant)
    org_name = _f("institusjonNavn", "organisasjonsNavn", "applicantName",
                   "prosjektlederNavnOrganisasjon", "institusjonsnavn",
                   "coordinating_institution", "institution")
    if not org_name:
        return None

    org_nr = _f("organisasjonsnummer", "orgNr", "nationalId")

    # Grant amount (NOK)
    amt_str = _f("bevilgning", "tildelt", "innvilget", "amount", "totalBevilgning")
    amt_str = re.sub(r"[^\d.,]", "", amt_str).replace(",", ".").replace(" ", "")
    try:
        amount_nok = float(amt_str) if amt_str else 0.0
    except ValueError:
        amount_nok = 0.0

    project_type = _f("prosjekttype", "type", "programType", "kategori")
    project_id = _f("prosjektId", "projectId", "id", "nummer")
    title = _f("prosjektTittelNorsk", "tittel", "title", "prosjektTittel")

    slug = re.sub(r"[^a-z0-9]+", "_", project_type.lower())[:30] or "other"
    source = f"nfr_{slug}_{year}"
    call_id = f"{source}_{project_id or org_nr or org_name[:20]}"

    return {
        "source": source,
        "call_id": call_id,
        "company_name": org_name,
        "company_name_norm": org_name.upper(),
        "org_nr": org_nr,
        "country": DEPLOYMENT_COUNTRY,
        "year": year,
        "project_id": project_id,
        "project_title": title[:200],
        "project_type": project_type,
        "grant_amount_eur": round(amount_nok * NOK_EUR, 2),
        "grant_amount_nok": amount_nok,
        "ndb_distributor": NDB_DISTRIBUTOR,
        "deployment_country": DEPLOYMENT_COUNTRY,
    }


def _parse_csv_file(path: str) -> list[dict]:
    """Parse a local CSV export from Prosjektbanken."""
    rows = []
    with open(path, encoding="utf-8", errors="replace") as f:
        for delim in (";", ",", "\t"):
            f.seek(0)
            reader = csv.DictReader(f, delimiter=delim)
            sample_row = next(reader, None)
            if sample_row and len(sample_row) >= 4:
                f.seek(0)
                reader = csv.DictReader(f, delimiter=delim)
                raw_rows = list(reader)
                break
        else:
            print("ERROR: Could not parse CSV", file=sys.stderr)
            return []
    for row in raw_rows:
        parsed = _parse_record({k.strip(): v for k, v in row.items()})
        if parsed:
            rows.append(parsed)
    return rows


def _load_to_db(rows: list[dict]) -> dict:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("PRAGMA table_info(companies)")
    col_names = {r[1] for r in cur.fetchall()}
    has_national_id = "national_id" in col_names

    counts = {"inserted": 0, "skipped_dup": 0, "errors": 0}
    for r in rows:
        try:
            norm = r["company_name_norm"]
            if has_national_id and r.get("org_nr"):
                cur.execute(
                    "SELECT id FROM companies WHERE national_id=? AND country='NO'",
                    (r["org_nr"],))
                row = cur.fetchone()
                if row:
                    cid = row[0]
                else:
                    cid = None
            else:
                cid = None
            if cid is None:
                cur.execute(
                    "SELECT id FROM companies WHERE canonical_name=? AND country='NO'",
                    (norm,))
                row = cur.fetchone()
                cid = row[0] if row else None
            if cid is None:
                if has_national_id:
                    cur.execute(
                        """INSERT INTO companies
                           (canonical_name, raw_name, country, national_id,
                            entity_type, match_method, match_confidence)
                           VALUES (?, ?, 'NO', ?, 'unknown', 'nfr', 'medium')""",
                        (norm, r["company_name"], r.get("org_nr") or None))
                else:
                    cur.execute(
                        """INSERT INTO companies
                           (canonical_name, raw_name, country,
                            entity_type, match_method, match_confidence)
                           VALUES (?, ?, 'NO', 'unknown', 'nfr', 'medium')""",
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
                print(f"  ERROR {r.get('company_name', '?')}: {e}", file=sys.stderr)
    con.commit()
    con.close()
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract Norges Forskningsråd grants")
    parser.add_argument("--load-db", action="store_true")
    parser.add_argument("--probe", action="store_true", help="Discover/test API endpoint")
    parser.add_argument("--api-base", metavar="URL", help="Override API base URL")
    parser.add_argument("--local", metavar="PATH", help="Use local CSV or JSON file")
    args = parser.parse_args()

    if args.local:
        path = args.local
        if path.endswith(".csv"):
            rows = _parse_csv_file(path)
        else:
            with open(path, encoding="utf-8") as f:
                raw = json.load(f)
            records = raw if isinstance(raw, list) else raw.get("content", raw.get("data", []))
            rows = [r for rec in records if (r := _parse_record(rec)) is not None]
        print(f"  Loaded {len(rows)} rows from {path}")
    else:
        candidates = ([args.api_base] if args.api_base else []) + API_CANDIDATES
        if args.probe:
            api_base = _probe_api(candidates)
            if not api_base:
                print(
                    "\nNo working API found. Manual steps:\n"
                    "  1. Open https://prosjektbanken.forskningsradet.no in Chrome\n"
                    "  2. DevTools → Network → filter XHR → load projects\n"
                    "  3. Find the JSON API endpoint URL\n"
                    "  4. Re-run: python extract_nfr.py --api-base <URL> [--load-db]\n"
                )
            return
        api_base = _probe_api(candidates)
        if not api_base:
            print("ERROR: No working API endpoint found. Run --probe for diagnostics.",
                  file=sys.stderr)
            sys.exit(1)
        raw_records = _fetch_all(api_base)
        print(f"  Fetched {len(raw_records)} raw records")
        rows = [r for rec in raw_records if (r := _parse_record(rec)) is not None]
        raw_path = RAW_DIR / "nfr_projects.json"
        raw_path.write_text(json.dumps(raw_records, ensure_ascii=False), encoding="utf-8")

    if not rows:
        print("  No rows extracted.")
        return

    out_fields = ["source", "call_id", "company_name", "org_nr", "country", "year",
                  "project_id", "project_title", "project_type",
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
        print(f"  Inserted: {counts['inserted']}, dup: {counts['skipped_dup']}, errors: {counts['errors']}")
        print("  Run python3 classify.py after loading.")


if __name__ == "__main__":
    main()
