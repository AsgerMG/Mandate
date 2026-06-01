"""Extract Baltic NDB grant/investment data — Sprint 17.

Covers three thin-SATR countries in one script:
  - ALTUM (Latvia) — national development finance institution
  - ILTE / Enterprise Lithuania (Lithuania) — innovation/investment agency
  - EIS = KredEx + Enterprise Estonia (merged 2022) — Estonian NDB

Data sources:
  Latvia — ALTUM:
    Open data portal: https://data.gov.lv
    Confirmed search: https://data.gov.lv/dati/eng/dataset?q=altum
    → Data not found on portal as of 2026-06-01. Try:
      a) ALTUM annual report transparency data (PDF — requires manual parsing)
      b) ALTUM website: https://altum.lv/en/funded-projects (if available)
      c) Latvian State Aid Register: similar to SATR

  Lithuania — ILTE:
    Open data portal: https://data.gov.lt
    ILTE (formerly INVEGA) transparency reports.
    Try: https://data.gov.lt/dataset?publisher=ilte

  Estonia — EIS (KredEx + Enterprise Estonia):
    EIS funded projects database: https://eis.ee/funded-projects
    Try: https://eis.ee/api/projects?page=0&size=100

  Manual fallback for each: annual report PDFs available on each institution's
  website. Download the project list appendix and provide as --local <country> <path>.

Run modes:
  python extract_baltic_ndbs.py --country LV --probe
  python extract_baltic_ndbs.py --country LT --probe
  python extract_baltic_ndbs.py --country EE --probe
  python extract_baltic_ndbs.py --country LV --load-db
  python extract_baltic_ndbs.py --country LV --local <path>
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sqlite3
import sys
import urllib.request
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
RAW_DIR = BASE_DIR / "data" / "raw" / "baltic_ndbs"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = BASE_DIR / "db.sqlite"

# Config per country
COUNTRY_CONFIG = {
    "LV": {
        "ndb": "altum",
        "ndb_label": "ALTUM (Latvia)",
        "deployment_country": "LV",
        "currency": "EUR",
        "eur_rate": 1.0,
        "source_prefix": "altum",
        "api_candidates": [
            "https://data.gov.lv/dati/api/3/action/datastore_search?resource_id=altum_grants",
            "https://altum.lv/api/funded-projects",
            "https://altum.lv/api/v1/projects",
        ],
        "manual_url": "https://altum.lv/en/about-altum/reports-and-publications",
    },
    "LT": {
        "ndb": "ilte",
        "ndb_label": "ILTE (Lithuania)",
        "deployment_country": "LT",
        "currency": "EUR",
        "eur_rate": 1.0,
        "source_prefix": "ilte",
        "api_candidates": [
            "https://data.gov.lt/api/3/action/datastore_search?resource_id=ilte_grants",
            "https://ilte.lt/api/funded-projects",
            "https://invega.lt/api/v1/projects",
        ],
        "manual_url": "https://ilte.lt/en/transparency",
    },
    "EE": {
        "ndb": "eis",
        "ndb_label": "EIS (Estonia — KredEx + Enterprise Estonia)",
        "deployment_country": "EE",
        "currency": "EUR",
        "eur_rate": 1.0,
        "source_prefix": "eis",
        "api_candidates": [
            "https://eis.ee/api/projects?page=0&size=500",
            "https://eis.ee/api/v1/projects",
            "https://www.eas.ee/api/projects",
            "https://kredex.ee/api/projects",
        ],
        "manual_url": "https://eis.ee/funded-projects",
    },
}

MIN_YEAR = 2021


def _get_json(url: str) -> dict | list | None:
    try:
        req = urllib.request.Request(
            url, headers={"User-Agent": "EuroInvTracker/1.0", "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


def _probe(cfg: dict) -> str | None:
    for url in cfg["api_candidates"]:
        print(f"  Trying: {url}")
        data = _get_json(url)
        if data and (isinstance(data, list) or (isinstance(data, dict) and len(data) > 0)):
            print(f"  ✓ API works: {url}")
            return url
        elif data:
            print(f"    Response: {str(data)[:80]}")
    return None


def _parse_record(rec: dict, cfg: dict) -> dict | None:
    def _f(*keys: str) -> str:
        for k in keys:
            v = rec.get(k)
            if v is not None:
                return str(v).strip()
        return ""

    year_str = _f("year", "startDate", "start_date", "date", "grantDate", "period")
    year_match = re.search(r"(20\d{2})", year_str)
    if not year_match:
        return None
    year = int(year_match.group(1))
    if year < MIN_YEAR:
        return None

    name = _f("companyName", "company_name", "name", "recipient", "beneficiary",
              "organisation", "applicant")
    if not name:
        return None

    amt_str = _f("amount", "grantAmount", "totalGrant", "support", "value",
                 "grant", "approved")
    amt_str = re.sub(r"[^\d.,]", "", amt_str).replace(",", ".").replace(" ", "")
    try:
        amount = float(amt_str) if amt_str else 0.0
    except ValueError:
        amount = 0.0
    amount_eur = amount * cfg["eur_rate"]

    programme = _f("programme", "program", "instrument", "measure", "type")
    proj_id = _f("id", "projectId", "applicationId", "regNr")
    slug = re.sub(r"[^a-z0-9]+", "_", programme.lower())[:20] or "grant"

    source = f"{cfg['source_prefix']}_{slug}_{year}"
    call_id = f"{source}_{proj_id or name[:20]}"

    return {
        "source": source,
        "call_id": call_id,
        "company_name": name,
        "company_name_norm": name.upper(),
        "country": cfg["deployment_country"],
        "year": year,
        "project_id": proj_id,
        "programme": programme,
        "grant_amount_eur": round(amount_eur, 2),
        "ndb_distributor": cfg["ndb"],
        "deployment_country": cfg["deployment_country"],
    }


def _parse_csv_file(path: str, cfg: dict) -> list[dict]:
    rows = []
    with open(path, encoding="utf-8", errors="replace") as f:
        for delim in (";", ",", "\t"):
            f.seek(0)
            reader = csv.DictReader(f, delimiter=delim)
            sample = next(reader, None)
            if sample and len(sample) >= 3:
                f.seek(0)
                for raw_row in csv.DictReader(f, delimiter=delim):
                    r = _parse_record({k.strip(): v for k, v in raw_row.items()}, cfg)
                    if r:
                        rows.append(r)
                break
    return rows


def _load_to_db(rows: list[dict], country: str) -> dict:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    counts = {"inserted": 0, "skipped_dup": 0, "errors": 0}
    for r in rows:
        try:
            norm = r["company_name_norm"]
            cur.execute(
                "SELECT id FROM companies WHERE canonical_name=? AND country=?",
                (norm, country))
            row = cur.fetchone()
            if row:
                cid = row[0]
            else:
                cur.execute(
                    """INSERT INTO companies (canonical_name, raw_name, country,
                       entity_type, match_method, match_confidence)
                       VALUES (?, ?, ?, 'unknown', ?, 'medium')""",
                    (norm, r["company_name"], country, r["ndb_distributor"]))
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
                    project_number, project_started, grant_amount_eur,
                    grant_amount_basis, deployment_country, ndb_distributor)
                   VALUES (?, ?, ?, 'direct', 0, ?, ?, ?, 'ndb_grant', ?, ?)""",
                (cid, r["source"], r["call_id"], r.get("project_id") or None,
                 f"{r['year']}-01-01", r["grant_amount_eur"],
                 r["deployment_country"], r["ndb_distributor"]))
            counts["inserted"] += 1
        except Exception as e:
            counts["errors"] += 1
            if counts["errors"] <= 3:
                print(f"  ERROR {r.get('company_name','?')}: {e}", file=sys.stderr)
    con.commit()
    con.close()
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract Baltic NDB data (ALTUM/ILTE/EIS)")
    parser.add_argument("--country", required=True, choices=["LV", "LT", "EE"],
                        help="LV=ALTUM, LT=ILTE, EE=EIS")
    parser.add_argument("--load-db", action="store_true")
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--local", metavar="PATH")
    args = parser.parse_args()

    cfg = COUNTRY_CONFIG[args.country]
    print(f"Processing {cfg['ndb_label']} ...")

    if args.local:
        if args.local.endswith(".csv"):
            rows = _parse_csv_file(args.local, cfg)
        else:
            with open(args.local) as f:
                raw = json.load(f)
            records = raw if isinstance(raw, list) else raw.get("data", raw.get("content", []))
            rows = [r for rec in records if (r := _parse_record(rec, cfg)) is not None]
    elif args.probe:
        url = _probe(cfg)
        if not url:
            print(
                f"\nNo API found for {cfg['ndb_label']}.\n"
                f"Manual: download data from {cfg['manual_url']}\n"
                f"Then: python extract_baltic_ndbs.py --country {args.country} "
                f"--local <file.csv> [--load-db]\n"
            )
        return
    else:
        url = _probe(cfg)
        if not url:
            print(f"ERROR: No working API for {cfg['ndb']}. Run --probe.", file=sys.stderr)
            sys.exit(1)
        # Fetch and parse
        data = _get_json(url)
        records = data if isinstance(data, list) else (
            data.get("data") or data.get("content") or data.get("result") or [])
        rows = [r for rec in records if (r := _parse_record(rec, cfg)) is not None]

    if not rows:
        print("  No rows extracted.")
        return

    out_path = OUT_DIR / f"{cfg['ndb']}_grants.csv"
    with out_path.open("w", newline="", encoding="utf-8") as f:
        if rows:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()), extrasaction="ignore")
            w.writeheader()
            for r in rows:
                w.writerow(r)
    print(f"  CSV → {out_path} ({len(rows)} rows)")

    from collections import Counter
    for y, n in sorted(Counter(r["year"] for r in rows).items()):
        print(f"    {y}: {n:>5}  €{sum(r['grant_amount_eur'] for r in rows if r['year']==y)/1e6:.1f}M")

    if args.load_db:
        counts = _load_to_db(rows, args.country)
        print(f"  Inserted: {counts['inserted']}, dup: {counts['skipped_dup']}, "
              f"errors: {counts['errors']}")
        print("  Run python3 classify.py after loading.")


if __name__ == "__main__":
    main()
