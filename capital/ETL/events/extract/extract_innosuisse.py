"""Extract Innosuisse (Swiss Innovation Agency) company-led projects — Sprint 17.

Data source (discovered 2026-06-10):
  Innosuisse's own data portal has no bulk export, but every Innosuisse project
  is recorded in ARAMIS, the research database of the Swiss federal
  administration. ARAMIS publishes a full public export (opendata.swiss
  dataset "aramis"):
    https://datenausgabe.aramis.admin.ch/full_export.json

  Innosuisse rows: research_unit_short_name == 'INNOSUISSE' (~17k records).
  `contact_person_full_address` holds the lead applicant organisation. For
  innovation projects led by a company, this is the company name (e.g.
  "Miraex SA"); for research-partner-led projects it is the university/FH.
  We keep only company-led rows (corporate suffix match, non-academic).

  `granted_total_costs` is the granted federal contribution in CHF for the
  whole project — recorded with basis 'innosuisse_project_grant_total'
  (the company is the lead applicant; part of the work happens at the
  research partner).

Scope:
  - export_start_date >= 2021
  - lead organisation is a company (AG/GmbH/SA/Sàrl/Ltd/Inc suffix,
    excluding academic institutions)

Schema mapping:
  source             = 'innosuisse_<instrument_slug>_<year>'  (from project
                       number suffix: IP-ENG, INNO-ICT, INT-LS, ...)
  call_id            = 'innosuisse_<project number>'
  grant_amount_eur   = granted_total_costs CHF → EUR (ECB annual rate)
  deployment_country = 'CH'
  ndb_distributor    = 'innosuisse'

Run modes:
  python extract_innosuisse.py             → fetch + CSV only
  python extract_innosuisse.py --load-db   → fetch + match + load
  python extract_innosuisse.py --local <path> → use cached full_export.json
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
from pathlib import Path

_sys_path_dir = str(Path(__file__).parent)
if _sys_path_dir not in sys.path:
    pass  # sys.path handled by etl_env bootstrap
from ndb_ssl import fetch_bytes as _fetch_bytes  # noqa: E402

BASE_DIR = _ETL_ROOT
RAW_DIR = BASE_DIR / "data" / "raw" / "innosuisse"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

CSV_PATH = OUT_DIR / "innosuisse_grants.csv"
RAW_PATH = RAW_DIR / "aramis_full_export.json"
DB_PATH = _ETL_DB
DEPLOYMENT_COUNTRY = "CH"
NDB_DISTRIBUTOR = "innosuisse"
MIN_YEAR = 2021

EXPORT_URL = "https://datenausgabe.aramis.admin.ch/full_export.json"

# ECB annual average CHF per EUR; fallback for years not listed.
CHF_PER_EUR = {
    2021: 1.0811,
    2022: 1.0047,
    2023: 0.9718,
    2024: 0.9526,
    2025: 0.9400,
    2026: 0.9400,
}
CHF_PER_EUR_FALLBACK = 0.96

_CORP_RE = re.compile(r"\b(AG|GmbH|SA|S\u00e0rl|SARL|Sagl|Ltd|Inc|Co)\b\.?", re.UNICODE)
_ACADEMIC_RE = re.compile(
    r"(Hochschule|Universit|ETH|EPFL|EMPA|Fachhochschule|Institut|CSEM|PSI|WSL|"
    r"EAWAG|SUPSI|\bOST\b|ZHAW|HSLU|\bBFH\b|\bHES\b|\bFHNW\b|Scuola|Ecole|"
    r"Stiftung|Foundation|Verein|Spital|H\u00f4pital|Clinic|Klinik)", re.I)


def _normalise_name(name: str) -> str:
    n = (name or "").upper()
    for suffix in [" AG", " GMBH", " SA", " S\u00c0RL", " SARL", " SAGL", " LTD",
                   " INC", " HOLDING"]:
        if n.endswith(suffix):
            n = n[: -len(suffix)]
    n = re.sub(r"[^A-Z0-9\u00c4\u00d6\u00dc\u00c9\u00c8 ]+", " ", n).strip()
    return re.sub(r"\s+", " ", n)


def _instrument_slug(number: str) -> str:
    # Project numbers like "120.337 IP-LS", "49892.1 IP-ENG", "... INNO-ICT"
    parts = (number or "").split()
    suffix = parts[-1] if len(parts) > 1 else "other"
    slug = re.sub(r"[^a-z0-9]+", "_", suffix.lower()).strip("_")
    return slug or "other"


def extract(records: list[dict]) -> list[dict]:
    out = []
    n_inno = 0
    skipped = {"year": 0, "not_company": 0, "amount": 0}
    for rec in records:
        if rec.get("research_unit_short_name") != "INNOSUISSE":
            continue
        n_inno += 1
        start = rec.get("export_start_date") or ""
        m = re.match(r"(\d{4})", start)
        if not m or int(m.group(1)) < MIN_YEAR:
            skipped["year"] += 1
            continue
        year = int(m.group(1))

        org = (rec.get("contact_person_full_address") or "").split("\n")[0].strip()
        if not org or not _CORP_RE.search(org) or _ACADEMIC_RE.search(org):
            skipped["not_company"] += 1
            continue

        amount_chf = float(rec.get("granted_total_costs") or 0)
        if amount_chf <= 0:
            skipped["amount"] += 1
            continue
        amount_eur = amount_chf / CHF_PER_EUR.get(year, CHF_PER_EUR_FALLBACK)

        number = (rec.get("number") or "").strip()
        title = (rec.get("title_en") or rec.get("title_de") or
                 rec.get("title_fr") or rec.get("title_it") or "").strip()
        slug = _instrument_slug(number)

        out.append({
            "source": f"innosuisse_{slug}_{year}",
            "call_id": f"innosuisse_{number}",
            "company_name": org,
            "company_name_norm": _normalise_name(org),
            "country": DEPLOYMENT_COUNTRY,
            "year": year,
            "date": start,
            "project_number": number,
            "project_title": title[:200],
            "section": (rec.get("section") or "").strip(),
            "grant_amount_eur": round(amount_eur, 2),
            "grant_amount_chf": amount_chf,
            "ndb_distributor": NDB_DISTRIBUTOR,
            "deployment_country": DEPLOYMENT_COUNTRY,
        })

    print(f"  INNOSUISSE records: {n_inno} → {len(out)} company-led {MIN_YEAR}+ "
          f"(skipped: {skipped['year']} pre-{MIN_YEAR}, "
          f"{skipped['not_company']} research-partner-led/non-company, "
          f"{skipped['amount']} zero-amount)")
    return out


def _load_to_db(rows: list[dict]) -> dict:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    counts = {"inserted": 0, "skipped_dup": 0, "errors": 0}
    for r in rows:
        try:
            norm = r["company_name_norm"]
            cur.execute(
                "SELECT id FROM companies WHERE canonical_name=? AND country='CH'",
                (norm,))
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
                    grant_amount_eur, grant_amount_basis, sector_tags_raw,
                    deployment_country, ndb_distributor)
                   VALUES (?, ?, ?, 'direct', 0, ?, ?, ?, ?,
                           'innosuisse_project_grant_total', ?, ?, ?)""",
                (cid, r["source"], r["call_id"], r["project_number"] or None,
                 r["project_title"] or None, r["date"],
                 r["grant_amount_eur"], r["section"] or None,
                 r["deployment_country"], r["ndb_distributor"]))
            counts["inserted"] += 1
        except Exception as e:
            counts["errors"] += 1
            if counts["errors"] <= 3:
                print(f"  ERROR {r.get('company_name', '?')}: {e}", file=sys.stderr)
    con.commit()
    con.close()
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract Innosuisse company projects (via ARAMIS)")
    parser.add_argument("--load-db", action="store_true")
    parser.add_argument("--local", metavar="PATH", help="Use cached full_export.json")
    args = parser.parse_args()

    path = Path(args.local) if args.local else RAW_PATH
    if not path.exists():
        print(f"Fetching ARAMIS full export → {RAW_PATH} ...")
        data = _fetch_bytes(EXPORT_URL, timeout=300)
        if not data:
            print("ERROR: download failed. Get it manually from "
                  "https://opendata.swiss/en/dataset/aramis", file=sys.stderr)
            sys.exit(1)
        RAW_PATH.write_bytes(data)
        path = RAW_PATH
    print(f"  Using export: {path}")
    records = json.loads(path.read_text(encoding="utf-8"))
    print(f"  ARAMIS records: {len(records)}")

    rows = extract(records)
    if not rows:
        return

    out_fields = ["source", "call_id", "company_name", "country", "year", "date",
                  "project_number", "project_title", "section",
                  "grant_amount_eur", "grant_amount_chf", "ndb_distributor"]
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
        print("  Run python3 scripts/classify.py after loading.")


if __name__ == "__main__":
    main()
