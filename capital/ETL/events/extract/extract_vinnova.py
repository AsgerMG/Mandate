"""Extract Vinnova (Sweden) funded projects.

Data source (rewired 2026-06-26 — the old gdphub.se / portal.api.vinnova.se
endpoints are dead):
  Vinnova's official open-data API (CC0):
    https://data.vinnova.se/api/projekt/{YYYY-MM-DD}
  Returns every project whose record was modified on/after the given date.
  We pull from an early date and filter to start year >= 2021.

  Response fields per project (coordinator-level; no participant breakdown):
    Diarienummer, Ärenderubrik / ÄrenderubrikEngelska, DiarienummerUtlysning,
    BeviljatBidrag (granted amount, SEK), ProjektStart, KoordinatorOrg, Status

  Amounts are SEK → converted to EUR via ECB annual reference rates
  (ndb_helpers.normalise_ticket).

  SATR dedup rule (pre-measured): 514 SATR rows already tagged with
  ndb_distributor='vinnova'. On load, dedup by canonical_name + country='SE'
  + year ± 1 (on public_funding_events). Vinnova direct data adds the
  sub-threshold + recent awards SATR misses.

Run modes:
  python extract_vinnova.py --load-db              → fetch + dedup + load
  python extract_vinnova.py --since 2021-01-01     → narrower modified-since window
  python extract_vinnova.py --local <path>         → load from local JSON file
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
from ndb_helpers import normalise_ticket  # noqa: E402
# --- end ETL path bootstrap ---

import argparse
import csv
import json
import re
import sqlite3
import subprocess
import sys
from pathlib import Path

BASE_DIR = _ETL_ROOT
RAW_DIR = BASE_DIR / "data" / "raw" / "vinnova"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

CSV_PATH = OUT_DIR / "vinnova_grants.csv"
DB_PATH = _ETL_DB
DEPLOYMENT_COUNTRY = "SE"
NDB_DISTRIBUTOR = "vinnova"
MIN_YEAR = 2021
PAGE_SIZE = 500

# Vinnova's official open-data API (CC0). `/api/projekt/{date}` returns every
# project whose record was modified on/after {date}; we then filter by start year.
# Granted amounts (BeviljatBidrag) are in SEK and converted to EUR via ECB rates.
API_BASE = "https://data.vinnova.se/api"

# Vinnova names its programmes in a separate register, keyed by the same
# diarienummer the award records carry in DiarienummerProgram. Without it the
# awards only carry "2016-04663", and a fund row called that is worse than no
# row -- so the corpus held 6,345 Vinnova awards as ONE instrument rather than
# risk naming them badly.
#
# 159 of 159 programme ids in our data resolve against this register, which is
# what makes the split safe: "Innovativa startups", "EUREKA Eurostars",
# "Fordonsstrategisk forskning och innovation - FFI".
PROGRAMME_API = f"{API_BASE}/program/2000-01-01"
PROGRAMME_CACHE = _ETL_ROOT / "reference" / "vinnova_programmes.json"


def programme_names() -> dict[str, str]:
    """diarienummer -> programme title, from Vinnova's own register.

    Falls back to the cached copy when offline: a refresh that cannot reach the
    register must not silently produce unnamed programmes, which would split
    the corpus into rows called "2016-04663".
    """
    try:
        import urllib.request
        with urllib.request.urlopen(PROGRAMME_API, timeout=60) as fh:
            rows = json.load(fh)
        PROGRAMME_CACHE.parent.mkdir(parents=True, exist_ok=True)
        PROGRAMME_CACHE.write_text(json.dumps(rows, ensure_ascii=False))
    except Exception as exc:  # pragma: no cover - network
        print(f"  programme register unreachable ({exc}); using cache")
        rows = json.loads(PROGRAMME_CACHE.read_text())
    if isinstance(rows, dict):
        rows = rows.get("data") or next(iter(rows.values()))
    return {(r.get("Diarienummer") or "").strip(): (r.get("Titel") or "").strip()
            for r in rows if (r.get("Titel") or "").strip()}
# Early enough to capture every project with a 2021+ start (records are touched
# around award time, well after this date). One bulk pull; no paging on this API.
SINCE_DATE = "2018-01-01"


def _fetch_projekt(since_date: str = SINCE_DATE) -> list[dict]:
    """Fetch the funded-projects list from data.vinnova.se.

    Uses curl (long timeout + robust SSL) like the other europa/large-payload
    extractors; the full dump is several MB so urllib's short timeout is unsafe.
    """
    url = f"{API_BASE}/projekt/{since_date}"
    print(f"  GET {url}")
    result = subprocess.run(
        ["curl", "-sL", "--max-time", "240", "-H", "User-Agent: Wincent/1.0",
         "-H", "Accept: application/json", url],
        capture_output=True, timeout=300,
    )
    if result.returncode != 0:
        raise RuntimeError(f"curl failed: {result.stderr.decode()[:200]}")
    data = json.loads(result.stdout)
    if not isinstance(data, list):
        raise SystemExit(f"vinnova: unexpected response shape {str(data)[:160]}")
    print(f"  fetched {len(data)} project records")
    return data


_HTML_RE = re.compile(r"<[^>]+>")


def _strip_html(s: str) -> str:
    return _HTML_RE.sub(" ", s or "").replace("&nbsp;", " ").strip()


def _parse_record(rec: dict) -> list[dict]:
    """Return one coordinator-level row per data.vinnova.se project (2021+).

    The official API exposes the coordinating organisation (KoordinatorOrg) and
    the granted amount (BeviljatBidrag, SEK) — there is no participant breakdown.
    """
    start = str(rec.get("ProjektStart") or "").strip()
    m = re.search(r"(20\d{2})", start)
    if not m:
        return []
    year = int(m.group(1))
    if year < MIN_YEAR:
        return []

    coord_name = str(rec.get("KoordinatorOrg") or "").strip()
    if not coord_name:
        return []

    project_id = str(rec.get("Diarienummer") or "").strip()
    if not project_id:
        return []
    title = _strip_html(rec.get("ÄrenderubrikEngelska") or rec.get("Ärenderubrik") or "")
    call_id_raw = str(rec.get("DiarienummerUtlysning") or "").strip()

    # BeviljatBidrag is in SEK → ECB annual-average conversion to EUR.
    try:
        sek = float(rec.get("BeviljatBidrag") or 0)
    except (TypeError, ValueError):
        sek = 0.0
    eur = normalise_ticket(sek, "SEK", year) or 0.0

    source = f"vinnova_grant_{year}"
    return [{
        "source": source,
        "call_id": f"{source}_{project_id}",
        "company_name": coord_name,
        "company_name_norm": coord_name.upper(),
        "org_nr": "",
        "country": DEPLOYMENT_COUNTRY,
        "year": year,
        "project_id": project_id,
        "project_title": title[:200],
        "call_id_vinnova": call_id_raw,
        "role": "coordinator",
        "coordinator_only": 1,
        "grant_amount_eur": round(eur, 2),
        "ndb_distributor": NDB_DISTRIBUTOR,
        "deployment_country": DEPLOYMENT_COUNTRY,
    }]


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
    parser.add_argument("--since", metavar="YYYY-MM-DD", default=SINCE_DATE,
                        help="fetch projects modified on/after this date")
    parser.add_argument("--local", metavar="PATH")
    args = parser.parse_args()

    if args.local:
        with open(args.local, encoding="utf-8", errors="replace") as f:
            raw = json.load(f)
        records = raw if isinstance(raw, list) else (
            raw.get("content") or raw.get("data") or raw.get("aktiviteter") or [])
        rows = [row for rec in records for row in _parse_record(rec)]
    else:
        raw_records = _fetch_projekt(args.since)
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
