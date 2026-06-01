"""Extract Vinnova (Sweden) funded activities — Sprint 17.

Data source:
  GDP Hub (Gemensamma dataplattformen) — formerly portal.api.vinnova.se, now:
    https://gdphub.se

  The API is CC0 licensed and covers Vinnova, Formas, Forte, and
  Vetenskapsrådet. We filter to Vinnova-funded activities only.

  API discovery:
    Base URL:   https://gdphub.se/api/finansierade-aktiviteter
    Parameters: ?financier=vinnova&page=0&size=500&fromYear=2021
    OR legacy:  https://portal.api.vinnova.se/vinnova (may redirect)

  Typical response fields per funded activity:
    id, title, startDate, endDate, budget, approvedBudget,
    coordinatingOrganisation { name, organisationNumber },
    participants [ { name, organisationNumber, allocatedBudget } ],
    callIdentifier, callTitle, programArea

  SATR dedup rule (pre-measured): 514 SATR rows already tagged with
  ndb_distributor='vinnova'. On load, dedup by:
    1. canonical_name + country='SE' + year ± 1  (on public_funding_events)
  The SATR rows came via grant-with-aid-element (subsidy component); Vinnova
  direct data adds the sub-threshold + recent awards SATR misses.

Run modes:
  python extract_vinnova.py --probe                → test API endpoint
  python extract_vinnova.py --load-db              → fetch + dedup + load
  python extract_vinnova.py --api-base <url>       → override API base
  python extract_vinnova.py --local <path>         → load from local file
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
RAW_DIR = BASE_DIR / "data" / "raw" / "vinnova"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

CSV_PATH = OUT_DIR / "vinnova_grants.csv"
DB_PATH = BASE_DIR / "db.sqlite"
DEPLOYMENT_COUNTRY = "SE"
NDB_DISTRIBUTOR = "vinnova"
MIN_YEAR = 2021
PAGE_SIZE = 500

API_CANDIDATES = [
    # GDP Hub (new home since 2024)
    "https://gdphub.se/api/finansierade-aktiviteter",
    "https://gdphub.se/finansierade-aktiviteter",
    # Legacy Vinnova API (may still redirect)
    "https://portal.api.vinnova.se/vinnova/finansierade-aktiviteter",
    "https://portal.api.vinnova.se/vinnova/projekter",
    "https://portal.api.vinnova.se/vinnova/beviljade",
    # Direct Vinnova project database
    "https://www.vinnova.se/api/projects",
]


def _get_json(url: str) -> dict | list | None:
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "EuroInvTracker/1.0",
                "Accept": "application/json",
                "Accept-Language": "en,sv",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


def _probe_api(candidates: list[str]) -> tuple[str | None, str]:
    """Return (working_base, params_template) or (None, '')."""
    param_variants = [
        "?financier=vinnova&page=0&size=2&fromYear=2021",
        "?page=0&size=2&fromYear=2021",
        "?page=0&size=2",
        "",
    ]
    for base in candidates:
        for params in param_variants:
            url = base + params
            print(f"  Trying: {url}")
            data = _get_json(url)
            if data and (isinstance(data, list) or (
                    isinstance(data, dict) and (
                    "content" in data or "aktiviteter" in data or
                    "items" in data or "results" in data or "data" in data))):
                print(f"  ✓ API at: {base} with params: {params}")
                return base, params
            if data:
                print(f"    Got JSON: {str(data)[:80]}")
    return None, ""


def _fetch_all(api_base: str, params_template: str) -> list[dict]:
    all_records: list[dict] = []
    for page in range(200):
        # Replace page=0 with current page
        params = re.sub(r"page=\d+", f"page={page}", params_template)
        if "page=" not in params:
            params += f"&page={page}" if params else f"?page={page}"
        params = re.sub(r"size=\d+", f"size={PAGE_SIZE}", params)
        if "size=" not in params:
            params += f"&size={PAGE_SIZE}"
        url = api_base + params
        data = _get_json(url)
        if not data:
            break
        records = data if isinstance(data, list) else (
            data.get("content") or data.get("aktiviteter") or
            data.get("items") or data.get("results") or data.get("data") or [])
        if not records:
            break
        all_records.extend(records)
        print(f"  Page {page}: +{len(records)} (total {len(all_records)})")
        if isinstance(data, dict):
            if data.get("last") or len(all_records) >= int(data.get("totalElements") or 99999):
                break
        if len(records) < PAGE_SIZE:
            break
    return all_records


def _parse_record(rec: dict) -> list[dict]:
    """Return one row per funded organisation in the record (coord + participants)."""
    def _f(*keys: str) -> str:
        for k in keys:
            v = rec.get(k)
            if v is not None:
                return str(v).strip()
        return ""

    year_str = _f("startDate", "start_date", "startYear", "callYear", "year", "beviljar_ar")
    year_match = re.search(r"(20\d{2})", year_str)
    if not year_match:
        return []
    year = int(year_match.group(1))
    if year < MIN_YEAR:
        return []

    project_id = _f("id", "diarienummer", "projectId", "dnr")
    title = _f("title", "tittel", "projectTitle", "rubrik")
    call_id_raw = _f("callIdentifier", "utlysning", "call", "utlysningsId")
    programme = _f("programArea", "programomrade", "category", "type")

    rows = []
    # Coordinating organisation
    coord = rec.get("coordinatingOrganisation") or rec.get("koordinerandeOrganisation") or {}
    if isinstance(coord, dict):
        coord_name = coord.get("name") or coord.get("namn") or ""
        coord_nr = coord.get("organisationNumber") or coord.get("organisationsnummer") or ""
        budget_str = (rec.get("approvedBudget") or rec.get("budget") or
                      rec.get("beviljatBidrag") or coord.get("allocatedBudget") or
                      coord.get("beviljadesumma") or "0")
    else:
        coord_name = _f("coordinatingOrganisation", "organisation", "organisation_name")
        coord_nr = ""
        budget_str = _f("approvedBudget", "budget", "beviljatBidrag", "amount")

    budget_str = re.sub(r"[^\d.,]", "", str(budget_str)).replace(",", ".").replace(" ", "")
    try:
        budget_eur = float(budget_str) if budget_str else 0.0
    except ValueError:
        budget_eur = 0.0

    if coord_name:
        slug = re.sub(r"[^a-z0-9]+", "_", programme.lower())[:20] or "grant"
        source = f"vinnova_{slug}_{year}"
        rows.append({
            "source": source,
            "call_id": f"{source}_{project_id or coord_name[:20]}",
            "company_name": coord_name,
            "company_name_norm": coord_name.upper(),
            "org_nr": coord_nr,
            "country": DEPLOYMENT_COUNTRY,
            "year": year,
            "project_id": project_id,
            "project_title": title[:200],
            "call_id_vinnova": call_id_raw,
            "role": "coordinator",
            "coordinator_only": 1,
            "grant_amount_eur": round(budget_eur, 2),
            "ndb_distributor": NDB_DISTRIBUTOR,
            "deployment_country": DEPLOYMENT_COUNTRY,
        })

    # Participants
    participants = (rec.get("participants") or rec.get("deltagare") or
                    rec.get("partners") or [])
    for p in (participants if isinstance(participants, list) else []):
        if not isinstance(p, dict):
            continue
        p_name = p.get("name") or p.get("namn") or ""
        p_nr = p.get("organisationNumber") or p.get("organisationsnummer") or ""
        p_budget = p.get("allocatedBudget") or p.get("beviljadesumma") or 0
        try:
            p_eur = float(re.sub(r"[^\d.,]", "", str(p_budget)).replace(",", ".")) or 0.0
        except ValueError:
            p_eur = 0.0
        if p_name:
            slug = re.sub(r"[^a-z0-9]+", "_", programme.lower())[:20] or "grant"
            source = f"vinnova_{slug}_{year}"
            rows.append({
                "source": source,
                "call_id": f"{source}_{project_id or ''}_{p_nr or p_name[:15]}",
                "company_name": p_name,
                "company_name_norm": p_name.upper(),
                "org_nr": p_nr,
                "country": DEPLOYMENT_COUNTRY,
                "year": year,
                "project_id": project_id,
                "project_title": title[:200],
                "call_id_vinnova": call_id_raw,
                "role": "participant",
                "coordinator_only": 0,
                "grant_amount_eur": round(p_eur, 2),
                "ndb_distributor": NDB_DISTRIBUTOR,
                "deployment_country": DEPLOYMENT_COUNTRY,
            })
    return rows


def _satr_dedup_set(con: sqlite3.Connection) -> set[tuple[str, int]]:
    """Return (canonical_name_upper, year) pairs already in SATR for SE."""
    cur = con.cursor()
    cur.execute(
        """SELECT UPPER(c.canonical_name),
                  CAST(strftime('%Y', pfe.project_started) AS INTEGER)
           FROM public_funding_events pfe
           JOIN companies c ON c.id = pfe.company_id
           WHERE pfe.source LIKE 'satr_%'
             AND pfe.ndb_distributor = 'vinnova'""")
    return {(row[0], row[1]) for row in cur.fetchall()}


def _load_to_db(rows: list[dict]) -> dict:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    satr_pairs = _satr_dedup_set(con)
    print(f"  SATR dedup set: {len(satr_pairs)} (vinnova, SE) pairs")

    cur.execute("PRAGMA table_info(companies)")
    col_names = {r[1] for r in cur.fetchall()}
    has_national_id = "national_id" in col_names

    counts = {"inserted": 0, "satr_deduped": 0, "skipped_dup": 0, "errors": 0}
    for r in rows:
        norm = r["company_name_norm"]
        year = r["year"]
        # SATR dedup: skip if already present in SATR for this company+year (±1)
        if any((norm, y) in satr_pairs for y in range(year - 1, year + 2)):
            counts["satr_deduped"] += 1
            continue
        try:
            if has_national_id and r.get("org_nr"):
                cur.execute(
                    "SELECT id FROM companies WHERE national_id=? AND country='SE'",
                    (r["org_nr"],))
                row = cur.fetchone()
                cid = row[0] if row else None
            else:
                cid = None
            if cid is None:
                cur.execute(
                    "SELECT id FROM companies WHERE canonical_name=? AND country='SE'", (norm,))
                row = cur.fetchone()
                cid = row[0] if row else None
            if cid is None:
                if has_national_id:
                    cur.execute(
                        """INSERT INTO companies (canonical_name, raw_name, country, national_id,
                           entity_type, match_method, match_confidence)
                           VALUES (?, ?, 'SE', ?, 'unknown', 'vinnova', 'medium')""",
                        (norm, r["company_name"], r.get("org_nr") or None))
                else:
                    cur.execute(
                        """INSERT INTO companies (canonical_name, raw_name, country,
                           entity_type, match_method, match_confidence)
                           VALUES (?, ?, 'SE', 'unknown', 'vinnova', 'medium')""",
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
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ndb_grant', ?, ?)""",
                (cid, r["source"], r["call_id"], r["role"], r["coordinator_only"],
                 r.get("project_id") or None, r.get("project_title") or None,
                 f"{year}-01-01", r["grant_amount_eur"],
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
    parser = argparse.ArgumentParser(description="Extract Vinnova funded activities")
    parser.add_argument("--load-db", action="store_true")
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--api-base", metavar="URL")
    parser.add_argument("--local", metavar="PATH")
    args = parser.parse_args()

    if args.local:
        with open(args.local, encoding="utf-8", errors="replace") as f:
            raw = json.load(f)
        records = raw if isinstance(raw, list) else (
            raw.get("content") or raw.get("data") or raw.get("aktiviteter") or [])
        rows = [row for rec in records for row in _parse_record(rec)]
    else:
        candidates = ([args.api_base] if args.api_base else []) + API_CANDIDATES
        if args.probe:
            base, params = _probe_api(candidates)
            if not base:
                print(
                    "\nAPI not found. Vinnova open data is now at gdphub.se.\n"
                    "Try: https://gdphub.se — look for API documentation.\n"
                    "Or download manually from:\n"
                    "  https://www.vinnova.se/en/results-and-offers/open-data/\n"
                    "Then: python extract_vinnova.py --local <file.json>\n"
                )
            return
        base, params = _probe_api(candidates)
        if not base:
            print("ERROR: No working API. Run --probe.", file=sys.stderr)
            sys.exit(1)
        raw_records = _fetch_all(base, params)
        rows = [row for rec in raw_records for row in _parse_record(rec)]
        raw_path = RAW_DIR / "vinnova_raw.json"
        raw_path.write_text(json.dumps(raw_records[:5000], ensure_ascii=False), encoding="utf-8")

    if not rows:
        print("  No rows.")
        return

    out_fields = ["source", "call_id", "company_name", "org_nr", "country", "year",
                  "project_id", "project_title", "role", "coordinator_only",
                  "grant_amount_eur", "ndb_distributor"]
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
