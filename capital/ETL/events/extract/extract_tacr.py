"""Extract TAČR (Technology Agency of the Czech Republic) funded projects — Sprint 17.

Data source:
  STARFOS (https://starfos.tacr.cz) — TAČR's public search over IS VaVaI/CEP.
  The isvavai.cz site itself is behind an F5 WAF that rejects non-browser
  clients, but STARFOS exposes an export API that works directly:

    POST https://old.starfos.tacr.cz/api/starfos/export
    body: {"collection": "isvav_project", "format": "csv", "limit": 0,
           "columns": [...], "query_code": "<saved-query-token>"}

  The query_code is produced by the STARFOS UI when a filter is applied.
  Token used here filters Provider = TA ČR (all programmes), ~5,500 projects.
  If the token expires, re-create it in the UI (Filter → Provider > Programme
  → TA ČR → Use) and copy the `query` param from the URL.

  Export columns include: Project code, Main participants (with IČO),
  Detailed participants' information (with legal form codes), Programme,
  Public support (thousands CZK), Solve beginning/end.

Filtering (consistent with NFR / Innosuisse loads):
  - Solve beginning >= 2021
  - Main (lead) participant must be a company:
      POO — legal entity in the commercial register
      FOI — natural person entrepreneur in the commercial register
    (excludes VVS universities, VVI public research institutes, etc.)

SATR-overlap gate (sprint-17 hard rule):
  SATR CZ already carries 760 rows with ndb_distributor='tacr'. Audit
  measured 514/1,061 new rows colliding on normalised-name + year±1.
  Decision: MERGE — the loader skips any row whose (normalised company
  name, start year±1) matches a SATR row tagged tacr, keeping only the
  net-new sub-threshold / recent projects SATR misses.

Schema mapping:
  source             = 'tacr_<programme-code>_<year>'   e.g. tacr_fw_2023
  call_id            = 'tacr_<project code>'
  grant_amount_eur   = Public support (thou. CZK × 1000) / CZK_PER_EUR[year]
  grant_amount_basis = 'tacr_public_support_total' (whole project, all participants)
  deployment_country = 'CZ'
  ndb_distributor    = 'tacr'

Run modes:
  python extract_tacr.py                 → fetch (or use cache) + write CSV
  python extract_tacr.py --load-db       → fetch + load into db.sqlite
  python extract_tacr.py --local <path>  → parse a local STARFOS export CSV
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
from collections import Counter
from pathlib import Path

BASE_DIR = _ETL_ROOT
RAW_DIR = BASE_DIR / "data" / "raw" / "tacr"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

RAW_CSV = RAW_DIR / "starfos_tacr_projects.csv"
CSV_PATH = OUT_DIR / "tacr_grants.csv"
DB_PATH = _ETL_DB

DEPLOYMENT_COUNTRY = "CZ"
NDB_DISTRIBUTOR = "tacr"
MIN_YEAR = 2021

# ECB annual average CZK per EUR
CZK_PER_EUR = {
    2021: 25.640, 2022: 24.566, 2023: 24.004,
    2024: 25.120, 2025: 24.960, 2026: 24.960,
}

# Legal form codes counted as companies (lead participant filter)
COMPANY_FORMS = {"POO", "FOI"}

EXPORT_URL = "https://old.starfos.tacr.cz/api/starfos/export"
# Saved-query token for Provider = TA ČR (created in the STARFOS UI)
QUERY_CODE = "tnbqaacabgiq"
EXPORT_COLUMNS = [
    "code", "name", "exp_organization_main", "exp_organization_others",
    "exp_organization_all", "exp_organization_all__inst_type",
    "exp_organization_all__country", "exp_programme", "exp_programme__funder",
    "exp_vav_category", "fin_total", "fin_state_budget",
    "x_solve_begin_year", "x_solve_end_year", "url",
]


def _fetch_export() -> str | None:
    """POST to the STARFOS export API; returns CSV text or None."""
    body = json.dumps({
        "collection": "isvav_project",
        "language_ui": "en",
        "format": "csv",
        "limit": 0,
        "columns": EXPORT_COLUMNS,
        "query_code": QUERY_CODE,
    }).encode()
    req = urllib.request.Request(
        EXPORT_URL, data=body, method="POST",
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
            "Origin": "https://starfos.tacr.cz",
            "Referer": "https://starfos.tacr.cz/",
        })
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.read().decode("utf-8")
    except Exception as e:
        print(f"  export fetch failed: {e}", file=sys.stderr)
        return None


_ICO_RE = re.compile(r"\((?:parent )?IČO:\s*(\d+)\)")
_FORMA_RE = re.compile(r"forma:\s*([A-Z0-9]+)")


def _main_participant_forma(rec: dict, main_name: str) -> str:
    """Look up the legal form of the lead participant in the detail column."""
    prefix = main_name[:40]
    for line in rec.get("Detailed participants' information", "").split("\n"):
        if line.strip().startswith(prefix):
            m = _FORMA_RE.search(line)
            if m:
                return m.group(1)
    return ""


def _parse_record(rec: dict) -> dict | None:
    year_str = (rec.get("Solve beginning") or "").strip()
    if not year_str.isdigit():
        return None
    year = int(year_str)
    if year < MIN_YEAR:
        return None

    main = (rec.get("Main participants") or "").strip()
    if not main:
        return None
    ico_m = _ICO_RE.search(main)
    ico = ico_m.group(1) if ico_m else ""
    name = _ICO_RE.sub("", main).strip().rstrip("(").strip()
    if not name:
        return None

    forma = _main_participant_forma(rec, name)
    if forma not in COMPANY_FORMS:
        return None

    # Public support is in thousands of CZK
    sup_str = (rec.get("Public support") or "").replace(" ", "").replace(",", ".")
    try:
        amount_czk = float(sup_str) * 1000.0
    except ValueError:
        return None
    if amount_czk <= 0:
        return None
    rate = CZK_PER_EUR.get(year, CZK_PER_EUR[max(CZK_PER_EUR)])
    amount_eur = amount_czk / rate

    proj_code = (rec.get("Project code") or "").strip()
    if not proj_code:
        return None
    programme = (rec.get("Programme") or "").strip()
    prog_code = programme.split(" - ")[0].strip().lower() or "rnd"
    prog_slug = re.sub(r"[^a-z0-9]+", "_", prog_code)[:20]

    return {
        "source": f"tacr_{prog_slug}_{year}",
        "call_id": f"tacr_{proj_code}",
        "company_name": name,
        "company_name_norm": name.upper(),
        "ico": ico,
        "country": DEPLOYMENT_COUNTRY,
        "year": year,
        "project_id": proj_code,
        "project_title": (rec.get("Name czech") or "").strip()[:200],
        "programme": programme[:80],
        "grant_amount_eur": round(amount_eur, 2),
        "grant_amount_czk": round(amount_czk, 2),
        "ndb_distributor": NDB_DISTRIBUTOR,
        "deployment_country": DEPLOYMENT_COUNTRY,
    }


def extract(local_path: str | None = None) -> list[dict]:
    if local_path:
        text = Path(local_path).read_text(encoding="utf-8")
    elif RAW_CSV.exists():
        print(f"  Using cached export: {RAW_CSV}")
        text = RAW_CSV.read_text(encoding="utf-8")
    else:
        print(f"  Fetching STARFOS export (query={QUERY_CODE}) ...")
        text = _fetch_export()
        if not text:
            print("ERROR: export failed and no cache present.", file=sys.stderr)
            sys.exit(1)
        RAW_CSV.write_text(text, encoding="utf-8")
        print(f"  Cached → {RAW_CSV}")

    rows = []
    for rec in csv.DictReader(text.splitlines()):
        r = _parse_record(rec)
        if r:
            rows.append(r)
    return rows


_LEGAL_SUFFIX_RE = re.compile(r"\b(S\s*R\s*O|SPOL\s*S\s*R\s*O|A\s*S|SE|K\s*S|V\s*O\s*S)\b")


def _norm_name(s: str) -> str:
    s = re.sub(r'[",\.]', " ", (s or "").upper())
    s = _LEGAL_SUFFIX_RE.sub("", s)
    return re.sub(r"\s+", " ", s).strip()


def _satr_collision_index(cur: sqlite3.Cursor) -> dict[str, list[int]]:
    """Normalised name → start years of SATR CZ rows tagged ndb_distributor='tacr'."""
    cur.execute(
        """SELECT c.canonical_name, CAST(substr(COALESCE(e.project_started,''),1,4) AS INT)
           FROM public_funding_events e JOIN companies c ON c.id=e.company_id
           WHERE e.source LIKE 'satr_cz%' AND e.ndb_distributor='tacr'""")
    idx: dict[str, list[int]] = {}
    for name, yr in cur.fetchall():
        idx.setdefault(_norm_name(name), []).append(yr or 0)
    return idx


def _load_to_db(rows: list[dict]) -> dict:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("PRAGMA table_info(companies)")
    col_names = {r[1] for r in cur.fetchall()}
    has_national_id = "national_id" in col_names
    satr_idx = _satr_collision_index(cur)

    counts = {"inserted": 0, "skipped_dup": 0, "skipped_satr_overlap": 0, "errors": 0}
    for r in rows:
        try:
            satr_years = satr_idx.get(_norm_name(r["company_name"]), [])
            if any(y and abs(y - r["year"]) <= 1 for y in satr_years):
                counts["skipped_satr_overlap"] += 1
                continue
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
                   VALUES (?, ?, ?, 'direct', 0, ?, ?, ?, ?, 'tacr_public_support_total', ?, ?)""",
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
    parser = argparse.ArgumentParser(description="Extract TAČR Czech R&D grants (STARFOS export)")
    parser.add_argument("--load-db", action="store_true")
    parser.add_argument("--local", metavar="PATH", help="local STARFOS export CSV")
    args = parser.parse_args()

    rows = extract(args.local)
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
    for y, n in sorted(Counter(r["year"] for r in rows).items()):
        print(f"    {y}: {n:>5}  €{sum(r['grant_amount_eur'] for r in rows if r['year']==y)/1e6:.1f}M")

    if args.load_db:
        counts = _load_to_db(rows)
        print(f"  Inserted: {counts['inserted']}, dup: {counts['skipped_dup']}, "
              f"satr_overlap: {counts['skipped_satr_overlap']}, errors: {counts['errors']}")
        print("  Run python3 classify.py after loading.")


if __name__ == "__main__":
    main()
