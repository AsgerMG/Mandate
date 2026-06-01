"""Extract TAČR (Technology Agency of the Czech Republic) funded projects — Sprint 17.

Data source:
  TAČR CEP database: https://www.isvavai.cz/cep
  IS VaVaI (Information System of Research, Development and Innovation):
    https://www.isvavai.cz/  → all Czech public R&D funding including TAČR

  TAČR itself also maintains:
    https://www.tacr.cz/en/projects/

  CEP (Central Evidence of Projects) provides bulk CSV/XML export:
    https://www.isvavai.cz/exports  → bulk exports available
    Key datasets:
      - Projekty (Projects) — project-level data with funding amount and lead organisation
      - Format: CSV, semicolon-delimited

  TAČR programmes (relevant ones):
    EPSILON  — industrial research, €2-5M per project
    TREND    — applied research, SME-focused
    ETA      — social innovation and applied research
    DELTA2   — international cooperation
    Théta    — energy sector
    DOPRAVA  — transport R&D
    KAPPA    — small companies R&D
    GAMA2    — proof of concept

  Czech company identifier: IČ (Identifikační číslo osoby) — 8-digit national ID

Schema mapping:
  source             = 'tacr_<programme>_<year>'
  grant_amount_eur   = totalCost (CZK) × CZK_EUR (≈ 0.04)
  deployment_country = 'CZ'
  ndb_distributor    = 'tacr'

Run modes:
  python extract_tacr.py --probe         → test CEP API access
  python extract_tacr.py --load-db       → fetch + load
  python extract_tacr.py --local <path>  → load local CEP CSV export
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
RAW_DIR = BASE_DIR / "data" / "raw" / "tacr"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

CSV_PATH = OUT_DIR / "tacr_grants.csv"
DB_PATH = BASE_DIR / "db.sqlite"
DEPLOYMENT_COUNTRY = "CZ"
NDB_DISTRIBUTOR = "tacr"
CZK_EUR = 0.04  # approx. 2024 average
MIN_YEAR = 2021
PAGE_SIZE = 1000

# IS VaVaI / CEP API
CEP_BASE = "https://www.isvavai.cz/cep"

# TAČR provider code in CEP
TACR_PROVIDER_CODE = "TA"  # all TAČR programmes start with TA

API_CANDIDATES = [
    # IS VaVaI REST API (if available)
    "https://www.isvavai.cz/api/v1/projekty",
    # TAČR direct project search
    "https://www.tacr.cz/api/projects",
    "https://ista.tacr.cz/api/v1/projects",
]


def _get_json(url: str) -> dict | list | None:
    try:
        req = urllib.request.Request(
            url, headers={"User-Agent": "EuroInvTracker/1.0", "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


def _probe(candidates: list[str]) -> str | None:
    for url in candidates:
        print(f"  Trying: {url}")
        data = _get_json(url)
        if data:
            print(f"  ✓ Found: {url}")
            return url
        print("    No JSON response")
    return None


def _parse_cep_csv(path: str) -> list[dict]:
    """Parse IS VaVaI / CEP bulk CSV export."""
    rows = []
    with open(path, encoding="utf-8", errors="replace") as f:
        for delim in (";", ",", "\t"):
            f.seek(0)
            reader = csv.DictReader(f, delimiter=delim)
            sample = next(reader, None)
            if not sample or len(sample) < 5:
                continue
            f.seek(0)
            for raw_row in csv.DictReader(f, delimiter=delim):
                r = _parse_record({k.strip(): v for k, v in raw_row.items()})
                if r:
                    rows.append(r)
            break
    return rows


def _parse_record(rec: dict) -> dict | None:
    def _f(*keys: str) -> str:
        for k in keys:
            v = rec.get(k)
            if v is not None:
                return str(v).strip()
        return ""

    # Filter to TAČR projects only (provider code TA*)
    programme_code = _f("KodProgramu", "programme", "kodProgramu", "program")
    if not programme_code.startswith("TA") and not programme_code.upper().startswith("EPSILON"):
        # Accept any CEP row if from provider TA
        provider = _f("Poskytovatel", "provider", "poskyto")
        if "TA" not in provider.upper() and "TAČR" not in provider.upper():
            if "TACR" not in provider.upper():
                return None

    year_str = _f("RokZahajeni", "startYear", "rok_zahajeni", "year", "start_date", "zacatek")
    year_match = re.search(r"(20\d{2})", year_str)
    if not year_match:
        return None
    year = int(year_match.group(1))
    if year < MIN_YEAR:
        return None

    # Lead organisation (hlavní příjemce)
    name = _f("PrijemceNazev", "NazevUchazeceHlavni", "company", "nazev",
              "prijemce", "organisationName")
    if not name:
        return None

    ico = _f("PrijemceICO", "ICO", "ico", "orgId", "businessId")
    ico = re.sub(r"\s+", "", ico)

    amt_czk_str = _f("CelkovaNaklady", "CastkaCelkem", "amount", "budget",
                     "celkove_naklady", "grant")
    amt_czk_str = re.sub(r"[^\d.,]", "", amt_czk_str).replace(",", ".").replace(" ", "")
    try:
        amount_czk = float(amt_czk_str) if amt_czk_str else 0.0
    except ValueError:
        amount_czk = 0.0
    amount_eur = amount_czk * CZK_EUR

    proj_id = _f("KodProjektu", "projectId", "id", "kod")
    title = _f("NazevProjektu", "title", "nazev_projektu")

    programme = _f("KodProgramu", "programme", "kodProgramu") or "ta_rnd"
    slug = re.sub(r"[^a-z0-9]+", "_", programme.lower())[:20] or "rnd"
    source = f"tacr_{slug}_{year}"
    call_id = f"{source}_{proj_id or ico or name[:20]}"

    return {
        "source": source,
        "call_id": call_id,
        "company_name": name,
        "company_name_norm": name.upper(),
        "ico": ico,
        "country": DEPLOYMENT_COUNTRY,
        "year": year,
        "project_id": proj_id,
        "project_title": title[:200],
        "programme": programme,
        "grant_amount_eur": round(amount_eur, 2),
        "grant_amount_czk": amount_czk,
        "ndb_distributor": NDB_DISTRIBUTOR,
        "deployment_country": DEPLOYMENT_COUNTRY,
    }


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
            cid = None
            if has_national_id and r.get("ico"):
                cur.execute(
                    "SELECT id FROM companies WHERE national_id=? AND country='CZ'", (r["ico"],))
                row = cur.fetchone()
                cid = row[0] if row else None
            if cid is None:
                cur.execute(
                    "SELECT id FROM companies WHERE canonical_name=? AND country='CZ'", (norm,))
                row = cur.fetchone()
                cid = row[0] if row else None
            if cid is None:
                if has_national_id:
                    cur.execute(
                        """INSERT INTO companies (canonical_name, raw_name, country, national_id,
                           entity_type, match_method, match_confidence)
                           VALUES (?, ?, 'CZ', ?, 'unknown', 'tacr', 'medium')""",
                        (norm, r["company_name"], r.get("ico") or None))
                else:
                    cur.execute(
                        """INSERT INTO companies (canonical_name, raw_name, country,
                           entity_type, match_method, match_confidence)
                           VALUES (?, ?, 'CZ', 'unknown', 'tacr', 'medium')""",
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
    parser = argparse.ArgumentParser(description="Extract TAČR Czech R&D grants")
    parser.add_argument("--load-db", action="store_true")
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--local", metavar="PATH", help="IS VaVaI / CEP CSV export")
    args = parser.parse_args()

    if args.local:
        rows = _parse_cep_csv(args.local)
    elif args.probe:
        url = _probe(API_CANDIDATES)
        if not url:
            print(
                "\nNo API found. Download bulk data from IS VaVaI:\n"
                "  1. Visit https://www.isvavai.cz/cep\n"
                "  2. Search for provider 'TA' (TAČR) + year 2021-2026\n"
                "  3. Export as CSV\n"
                "  OR visit https://www.isvavai.cz/exports for bulk data downloads\n"
                "  4. Then: python extract_tacr.py --local <file.csv> --load-db\n"
            )
        return
    else:
        url = _probe(API_CANDIDATES)
        if not url:
            print("ERROR: No API found. Run --probe.", file=sys.stderr)
            sys.exit(1)
        data = _get_json(url)
        records = data if isinstance(data, list) else data.get("data", [])
        rows = [r for rec in records if (r := _parse_record(rec)) is not None]

    if not rows:
        print("  No rows extracted.")
        return

    out_fields = ["source", "call_id", "company_name", "ico", "country", "year",
                  "project_id", "project_title", "programme",
                  "grant_amount_eur", "grant_amount_czk", "ndb_distributor"]
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
