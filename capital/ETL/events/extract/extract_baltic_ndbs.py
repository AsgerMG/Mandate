"""Extract Baltic NDB grant/investment data — Sprint 17.

Covers three thin-SATR countries in one script:
  - ALTUM (Latvia) — national development finance institution
  - ILTE / Enterprise Lithuania (Lithuania) — innovation/investment agency
  - EIS = KredEx + Enterprise Estonia (merged 2022) — Estonian NDB

Data sources:
  Latvia — ALTUM  [WORKING — 2026-06-10]:
    ALTUM publishes a recipients workbook (updated monthly) at
    https://www.altum.lv/pakalpojumi/biznesam/atbalsta-sanemeji-paligmateriali/
    Direct XLSX (date-stamped filename, scraped from that page):
      https://www.altum.lv/wp-content/uploads/.../ALTUM-atbalsta-sanemeji_DD.MM.YYYY.xlsx
    ~42 sheets, one per programme; headers vary but map by keyword:
      saņēmējs=recipient, Reģistrācijas=reg no, ... EUR=amount, datums=date.
    Instrument from sheet/header: garantij→guarantee, aizdev→loan,
    Iespējkapitāl→equity, grants→grant; ANM sheets carry a Kapitāla
    atlaide (capital rebate) column loaded as the grant component.
    Agriculture sheets (ELFLA/lauksaimn…) are skipped, as are legacy
    pre-2021 sheets without parseable headers (ESF2, STARTA, MIKRO, …).
    Requires openpyxl.

  Lithuania — ILTE:
    Open data portal: https://data.gov.lt
    ILTE (formerly INVEGA) transparency reports.
    Try: https://data.gov.lt/dataset?publisher=ilte

  Estonia — EIS (KredEx + Enterprise Estonia)  [WORKING — 2026-06-10]:
    https://eis.ee/toetatud-projektid/ embeds the FULL dataset (~8,000 rows)
    in the page HTML as <script type="application/json"
    id="supported-projects-data">. No API needed — fetch the page (~18 MB),
    extract the JSON array. Fields: recipient (lowercased), recipientCode,
    projectName, grantSize (EUR), program (slug), year (decision year), html
    (rendered row — proper-cased name, project cost, fund, decision year).

    Filters applied: year >= 2021; companies only (drops municipalities,
    MTÜ non-profits, foundations, schools, reg codes 7*/8*/9*).
    SATR-overlap gate: SATR EE carries 681 rows tagged ndb_distributor='eis';
    loader skips rows colliding on normalised-name + year±1.

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
RAW_DIR = BASE_DIR / "data" / "raw" / "baltic_ndbs"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = _ETL_DB

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

EIS_PAGE_URL = "https://eis.ee/toetatud-projektid/"
EIS_RAW_JSON = RAW_DIR / "eis_supported_projects.json"

# Recipient-name / reg-code patterns for non-company entities (Estonia)
_EE_NONCOMPANY_RE = re.compile(
    r"\b(mtü|mittetulundus|sihtasutus|vald|linn|linnavalitsus|vallavalitsus|"
    r"ülikool|kõrgkool|kool)\b", re.I)


def _eis_fetch_records() -> list[dict]:
    """Fetch the EIS page and extract the embedded supported-projects JSON."""
    if EIS_RAW_JSON.exists():
        print(f"  Using cached: {EIS_RAW_JSON}")
        return json.loads(EIS_RAW_JSON.read_text(encoding="utf-8"))
    print(f"  Fetching {EIS_PAGE_URL} (~18 MB) ...")
    req = urllib.request.Request(
        EIS_PAGE_URL, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        html = resp.read().decode("utf-8", errors="replace")
    m = re.search(r'id="supported-projects-data">\s*', html)
    if not m:
        print("ERROR: supported-projects-data blob not found in page.", file=sys.stderr)
        sys.exit(1)
    arr, _end = json.JSONDecoder().raw_decode(html, html.index("[", m.end() - 1))
    EIS_RAW_JSON.write_text(json.dumps(arr, ensure_ascii=False), encoding="utf-8")
    print(f"  Cached → {EIS_RAW_JSON} ({len(arr)} records)")
    return arr


def _eis_html_cells(rec: dict) -> list[str]:
    """Desktop <td> cells of the rendered row: [name, code, project, grant,
    cost, programme label, fund, decision year]."""
    tds = re.findall(r"<td(?![^>]*mobile-only)[^>]*>\s*(.*?)\s*</td>", rec.get("html", ""), re.S)
    import html as _html
    return [_html.unescape(re.sub(r"<[^>]+>", "", t)).strip() for t in tds]


def _extract_ee(cfg: dict) -> list[dict]:
    import hashlib
    rows = []
    for rec in _eis_fetch_records():
        year_str = str(rec.get("year") or "")
        if not year_str.isdigit():
            continue
        year = int(year_str)
        if year < MIN_YEAR:
            continue
        code = str(rec.get("recipientCode") or "").strip()
        name_lc = (rec.get("recipient") or "").strip()
        if not name_lc:
            continue
        if _EE_NONCOMPANY_RE.search(name_lc) or code[:1] in {"7", "8", "9"}:
            continue
        amount = rec.get("grantSize") or 0
        if not amount or amount <= 0:
            continue
        cells = _eis_html_cells(rec)
        name = cells[0] if cells else name_lc.upper()
        fund = cells[6] if len(cells) >= 8 else ""
        prog_slug = re.sub(r"[^a-z0-9]+", "_", (rec.get("program") or "grant"))[:24].strip("_")
        source = f"{cfg['source_prefix']}_{prog_slug}_{year}"
        digest = hashlib.sha1(
            f"{code}|{rec.get('projectName','')}|{amount}|{year}".encode()).hexdigest()[:10]
        rows.append({
            "source": source,
            "call_id": f"eis_{code}_{digest}",
            "company_name": name,
            "company_name_norm": name.upper(),
            "reg_code": code,
            "country": "EE",
            "year": year,
            "project_id": None,
            "project_title": (rec.get("projectName") or "")[:200],
            "programme": (rec.get("program") or "")[:60],
            "fund": fund,
            "grant_amount_eur": round(float(amount), 2),
            "ndb_distributor": cfg["ndb"],
            "deployment_country": "EE",
        })
    return rows


_LEGAL_SUFFIX_RE = re.compile(
    r"\b(OÜ|AS|UÜ|TÜ|AKTSIASELTS|OSAÜHING|SIA|UAB|MB|VŠĮ)\b")


def _norm_name(s: str) -> str:
    s = re.sub(r'["“”,\.]', " ", (s or "").upper())
    s = _LEGAL_SUFFIX_RE.sub("", s)
    return re.sub(r"\s+", " ", s).strip()


def _satr_collision_index(cur: sqlite3.Cursor, country: str, ndb: str) -> dict[str, list[int]]:
    """Normalised name → start years of SATR rows tagged with this NDB."""
    cur.execute(
        """SELECT c.canonical_name, CAST(substr(COALESCE(e.project_started,''),1,4) AS INT)
           FROM public_funding_events e JOIN companies c ON c.id=e.company_id
           WHERE e.source LIKE 'satr%' AND c.country=? AND e.ndb_distributor=?""",
        (country, ndb))
    idx: dict[str, list[int]] = {}
    for name, yr in cur.fetchall():
        idx.setdefault(_norm_name(name), []).append(yr or 0)
    return idx


ALTUM_PAGE_URL = "https://www.altum.lv/pakalpojumi/biznesam/atbalsta-sanemeji-paligmateriali/"
ALTUM_RAW_XLSX = RAW_DIR / "altum_recipients.xlsx"

# Agriculture programmes (EAFRD etc.) — out of scope, consistent with the
# Landbrukstilskudd exclusion applied to Innovasjon Norge.
_LV_AGRI_RE = re.compile(r"elfla|lauksaimn|zivsaimn", re.I)


def _altum_fetch_xlsx() -> Path:
    if ALTUM_RAW_XLSX.exists():
        print(f"  Using cached: {ALTUM_RAW_XLSX}")
        return ALTUM_RAW_XLSX
    print(f"  Locating XLSX link on {ALTUM_PAGE_URL} ...")
    req = urllib.request.Request(ALTUM_PAGE_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        page = resp.read().decode("utf-8", errors="replace")
    m = re.search(r'href="(https://www\.altum\.lv/wp-content/uploads/[^"]*sanemeji[^"]*\.xlsx)"', page)
    if not m:
        print("ERROR: ALTUM recipients XLSX link not found.", file=sys.stderr)
        sys.exit(1)
    req = urllib.request.Request(m.group(1), headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        ALTUM_RAW_XLSX.write_bytes(resp.read())
    print(f"  Cached → {ALTUM_RAW_XLSX}")
    return ALTUM_RAW_XLSX


def _extract_lv(cfg: dict) -> list[dict]:
    import hashlib
    try:
        import openpyxl
    except ImportError:
        print("ERROR: openpyxl required for ALTUM XLSX (pip install openpyxl).", file=sys.stderr)
        sys.exit(1)

    path = _altum_fetch_xlsx()
    wb = openpyxl.load_workbook(path, read_only=True)
    rows: list[dict] = []
    for sn in wb.sheetnames:
        if _LV_AGRI_RE.search(sn):
            continue
        ws = wb[sn]
        all_rows = list(ws.iter_rows(values_only=True))
        hdr_i, hdr = None, None
        for i, row in enumerate(all_rows[:10]):
            vals = [str(c).strip() if c is not None else "" for c in row]
            if any("saņēmēj" in v.lower() for v in vals) and sum(1 for v in vals if v) >= 3:
                hdr_i, hdr = i, vals
                break
        if hdr is None:
            continue  # legacy/inactive sheets without a parseable header

        def col(pred):
            for j, h in enumerate(hdr):
                if h and pred(h.lower()):
                    return j
            return None

        c_name = col(lambda h: "saņēmēj" in h)
        c_reg = col(lambda h: h.startswith("reģ"))
        c_date = col(lambda h: "datum" in h)
        c_loan = col(lambda h: "aizdevums, eur" in h or "aizdevums,eur" in h)
        c_guar = col(lambda h: "garantijas summa" in h)
        c_equity = col(lambda h: "iespējkapitāla finansējums" in h)
        c_grant = col(lambda h: "grants, eur" in h)
        c_rebate = col(lambda h: "atlaide, eur" in h)
        c_generic = col(lambda h: h.strip() in ("summa, eur", "summa,eur"))
        if c_name is None or c_date is None:
            continue

        slug = re.sub(r"[^a-z0-9]+", "_", sn.lower()).strip("_")[:24]
        sheet_l = sn.lower()
        for row in all_rows[hdr_i + 1:]:
            def cell(j):
                if j is None or j >= len(row) or row[j] is None:
                    return ""
                return str(row[j]).strip()
            name = cell(c_name)
            if not name or name.lower().startswith("kopā"):
                continue
            date_s = cell(c_date)
            ym = re.search(r"(20\d{2})", date_s)
            if not ym:
                continue
            year = int(ym.group(1))
            if year < MIN_YEAR:
                continue

            def num(j):
                s = re.sub(r"[^\d.,]", "", cell(j)).replace(",", ".")
                try:
                    return float(s) if s else 0.0
                except ValueError:
                    return 0.0
            loan = num(c_loan)
            guar = num(c_guar)
            equity = num(c_equity)
            rebate = num(c_rebate)
            if rebate:
                # Kapitāla atlaide is the forgivable part of the loan:
                # split it out as grant so loan+rebate isn't double-counted.
                loan = max(loan - rebate, 0.0)
            grant = num(c_grant) + rebate
            generic = num(c_generic)
            if generic and not (loan or guar or equity or grant):
                if "garantij" in sheet_l:
                    guar = generic
                elif "aizdev" in sheet_l:
                    loan = generic
                else:
                    grant = generic
            debt = loan + guar
            if not (debt or equity or grant):
                continue
            if guar and not loan:
                basis = "ndb_guarantee"
            elif loan:
                basis = "ndb_loan_commitment"
            elif equity:
                basis = "ndb_equity"
            else:
                basis = "ndb_grant"
            reg = re.sub(r"\D", "", cell(c_reg))
            digest = hashlib.sha1(f"{name}|{reg}|{debt}|{equity}|{grant}|{date_s}".encode()).hexdigest()[:10]
            rows.append({
                "source": f"altum_{slug}_{year}",
                "call_id": f"altum_{digest}",
                "company_name": name,
                "company_name_norm": name.upper(),
                "reg_code": reg,
                "country": "LV",
                "year": year,
                "project_id": None,
                "project_title": None,
                "programme": sn.strip()[:60],
                "grant_amount_eur": round(grant, 2) or None,
                "debt_amount_eur": round(debt, 2) or None,
                "equity_amount_eur": round(equity, 2) or None,
                "grant_amount_basis": basis,
                "ndb_distributor": cfg["ndb"],
                "deployment_country": "LV",
            })
    wb.close()
    return rows


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


def _load_to_db(rows: list[dict], country: str, ndb: str) -> dict:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    satr_idx = _satr_collision_index(cur, country, ndb)
    counts = {"inserted": 0, "skipped_dup": 0, "skipped_satr_overlap": 0, "errors": 0}
    for r in rows:
        try:
            satr_years = satr_idx.get(_norm_name(r["company_name"]), [])
            if any(y and abs(y - r["year"]) <= 1 for y in satr_years):
                counts["skipped_satr_overlap"] += 1
                continue
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
                    project_number, project_title, project_started,
                    grant_amount_eur, debt_amount_eur, equity_amount_eur,
                    grant_amount_basis, deployment_country, ndb_distributor)
                   VALUES (?, ?, ?, 'direct', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (cid, r["source"], r["call_id"], r.get("project_id") or None,
                 r.get("project_title") or None, f"{r['year']}-01-01",
                 r.get("grant_amount_eur"), r.get("debt_amount_eur"),
                 r.get("equity_amount_eur"),
                 r.get("grant_amount_basis") or "ndb_grant",
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

    if args.country == "EE" and not args.local and not args.probe:
        rows = _extract_ee(cfg)
    elif args.country == "LV" and not args.local and not args.probe:
        rows = _extract_lv(cfg)
    elif args.local:
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
    def _amt(r):
        return (r.get("grant_amount_eur") or 0) + (r.get("debt_amount_eur") or 0) + \
               (r.get("equity_amount_eur") or 0)
    for y, n in sorted(Counter(r["year"] for r in rows).items()):
        print(f"    {y}: {n:>5}  €{sum(_amt(r) for r in rows if r['year']==y)/1e6:.1f}M")

    if args.load_db:
        counts = _load_to_db(rows, args.country, cfg["ndb"])
        print(f"  Inserted: {counts['inserted']}, dup: {counts['skipped_dup']}, "
              f"satr_overlap: {counts['skipped_satr_overlap']}, errors: {counts['errors']}")
        print("  Run python3 classify.py after loading.")


if __name__ == "__main__":
    main()
