"""Extract EIB direct venture-debt / growth-finance loans (2021-2026).

Data source: EIB Project Finance public database (www.eib.org)
Instrument scope:
  - EGF VD  (European Guarantee Fund Venture Debt, 2021-2022)
  - InvestEU VD windows  IEU LS / TI / FT / GT / GT2 / GT3 / SIW / G (2022+)
  - IDGF    (Innovation & Digitalisation Growth Finance)

Borrower names scraped from individual EIB project pages.

Run modes:
  python extract_eib.py                      → CSV only (no DB write)
  python extract_eib.py --load-db            → CSV + match + load into db.sqlite
  python extract_eib.py --skip-scrape --load-db → use existing CSV, load only
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
from store import connect  # noqa: E402
from grounded_inputs import materialise  # noqa: E402
# --- end ETL path bootstrap ---

import csv
import re
import sys
import time
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError

BASE_DIR = _ETL_ROOT
RAW_DIR = BASE_DIR / "data" / "raw" / "eib"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR = BASE_DIR / "data" / "processed"
OUT_DIR.mkdir(parents=True, exist_ok=True)

CSV_PATH = RAW_DIR / "eib_projects_signed_20260520.csv"
MATCH_CSV_PATH = OUT_DIR / "eib_match_summary.csv"
IDS_JSON_PATH = RAW_DIR / "eib_project_ids.json"
DB_PATH = _ETL_DB

EIB_BASE_URL = "https://www.eib.org"

# ---------------------------------------------------------------------------
# Instrument / framework identification
# ---------------------------------------------------------------------------

# Project title patterns that indicate a direct corporate venture-debt or
# growth-equity loan (as opposed to fund-level or programme-level entries).
VD_PATTERNS = [
    r"\(IEU\s+(?:LS|TI|FT|GT|GT2|GT3|SIW|VD|G)\)",
    r"\(EGF\s+VD[^\)]*\)",
    r"IDGF",
    r"TECHEU\s+VD",
    r"TECHEU\s+SCALE\s+UP",
    r"\(IEU\s+TI\s+",
]

# Entries to exclude: programme-level, lending envelopes, co-investment vehicles
EXCLUDE_PATTERNS = [
    r"\bPL\b",
    r"\bLE\s+[IVX]+\b",
    r"CO-INVESTMENT FACILITY",
    r"\(EGF\s+VDC\)",
    r"BOOST AFRICA",
]

# ---------------------------------------------------------------------------
# Sector mapping
# ---------------------------------------------------------------------------

# Maps EIB's broad sector label to the nearest EIC tag that classify.py
# recognises. Where the EIB sector is too broad (Industry / Services) we
# store an empty string and let classify.py's keyword fallback use the
# project description text stored in project_summary.
EIB_SECTOR_TAGS: dict[str, str] = {
    "Energy":                           "Energy",               # → cleantech
    "Health":                           "Health Biotechnology",  # → life_sciences
    "Telecom":                          "Data & ICT",            # → digital
    "Information technology":           "Artificial Intelligence",  # → digital
    "Information and Communication":    "Data & ICT",
    "Industry":                         "",   # keyword fallback on description
    "Services":                         "",
    "Transport":                        "",
    "Agriculture, fisheries, forestry": "",
}


def _sector_tag(eib_sector: str) -> str:
    """Return the EIC-compatible tag for an EIB sector label, or empty string."""
    for key, tag in EIB_SECTOR_TAGS.items():
        if key.lower() in eib_sector.lower():
            return tag
    return ""


# Determine source label: EGF VD loans get 'eib_venture'; InvestEU / IDGF
# loans also get 'eib_venture' (methodology.md note: can't reliably split).
def _source_label(title: str) -> str:
    if re.search(r"\(EGF\s+VD", title, re.IGNORECASE):
        return "eib_venture"
    return "eib_venture"  # all instruments unified under eib_venture for now


# ---------------------------------------------------------------------------
# EIB project list discovery
# ---------------------------------------------------------------------------

def _discover_projects() -> list[dict]:
    """Read project list from cached JSON or raise if missing."""
    if IDS_JSON_PATH.exists():
        import json
        with open(IDS_JSON_PATH) as f:
            return json.load(f)

    # Fallback: fetch from EIB API and filter
    print("eib_project_ids.json not found — fetching from EIB API...")
    import json
    url = "https://www.eib.org/page-provider/projects/list"
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://www.eib.org/en/projects/all/index.htm",
    }
    req = Request(url, headers=headers)
    with urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())

    projects = []
    for p in data.get("data", []):
        title = p.get("title", "")
        if not any(re.search(pat, title, re.IGNORECASE) for pat in VD_PATTERNS):
            continue
        if any(re.search(pat, title, re.IGNORECASE) for pat in EXCLUDE_PATTERNS):
            continue
        addl = p.get("additionalInformation", [])
        ts = p.get("startDate")
        year = datetime.fromtimestamp(ts / 1000).year if ts else 0
        status = addl[0] if len(addl) > 0 else ""
        date_str = addl[1] if len(addl) > 1 else ""
        amount = addl[2] if len(addl) > 2 else 0
        if amount > 200_000_000:
            continue
        sector = country = ""
        for tag in (p.get("primaryTags") or []):
            if tag.get("subType") == "sectors":
                sector = tag.get("label", "")
            if tag.get("subType") == "countries":
                country = tag.get("value", "")
        if not (year >= 2021 and status in ("Signed", "Approved")):
            continue
        if country in ("C7", "") or len(country) != 2:
            continue
        projects.append({
            "eib_project_id": p.get("id"),
            "title": title,
            "status": status,
            "signature_date": date_str,
            "amount_approved_eur": amount,
            "country_iso2": country,
            "eib_sector": sector,
            "description": p.get("description", "") or "",
        })

    with open(IDS_JSON_PATH, "w") as f:
        json.dump(projects, f, indent=2)
    return projects


# ---------------------------------------------------------------------------
# Borrower-name scraper
# ---------------------------------------------------------------------------

def _scrape_promoter(project_id: str, retries: int = 2) -> str:
    url = f"{EIB_BASE_URL}/en/projects/all/{project_id}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html",
    }
    for attempt in range(retries + 1):
        try:
            req = Request(url, headers=headers)
            with urlopen(req, timeout=15) as resp:
                html = resp.read().decode("utf-8", errors="replace")
            m = re.search(
                r"Promoter\s+-\s+financial intermediary"
                r".*?"
                r'data-sheet--x-small[^>]*>\s*'
                r"[^<]+"
                r"</div>.*?"
                r'data-sheet--x-small[^>]*>\s*'
                r"([^\n<]+)",
                html,
                re.DOTALL,
            )
            return m.group(1).strip() if m else ""
        except Exception as exc:
            if attempt < retries:
                time.sleep(3)
            else:
                print(f"  WARN: failed to scrape {project_id}: {exc}")
                return ""
    return ""


CSV_FIELDNAMES = [
    "eib_project_id", "title", "borrower_name", "status", "signature_date",
    "amount_approved_eur", "country_iso2", "eib_sector", "description",
]


def build_csv(projects: list[dict], skip_scrape: bool = False) -> None:
    """Scrape borrower names and write/append to CSV."""
    existing_ids: set[str] = set()
    if CSV_PATH.exists():
        with open(CSV_PATH, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                existing_ids.add(row["eib_project_id"])

    todo = [p for p in projects if p["eib_project_id"] not in existing_ids]

    if skip_scrape and CSV_PATH.exists():
        print(f"--skip-scrape: using existing CSV ({len(existing_ids)} rows)")
        return

    if not todo:
        print(f"CSV already complete ({len(existing_ids)} rows)")
        return

    write_header = not CSV_PATH.exists() or not existing_ids

    with open(CSV_PATH, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
        if write_header:
            writer.writeheader()

        print(f"Scraping {len(todo)} project pages at 1 req/sec...")
        for i, p in enumerate(todo):
            pid = p["eib_project_id"]
            borrower = _scrape_promoter(pid)
            row = {**p, "borrower_name": borrower}
            writer.writerow(row)
            f.flush()
            print(
                f"  [{i+1:3d}/{len(todo)}] {pid} | "
                f"{borrower[:55] if borrower else '(not found)'}"
            )
            if i < len(todo) - 1:
                time.sleep(1.0)

    print(f"CSV ready: {CSV_PATH}")


# ---------------------------------------------------------------------------
# Name normalisation (mirrors extract_ipcei.py)
# ---------------------------------------------------------------------------

_NORM_LEGAL_RE = re.compile(
    r"\b(?:GmbH|gGmbH|mbH|AG|KG|UG|GesmbH|"
    r"BV|NV|"
    r"SAS|SARL|SASU|SCA|"
    r"SRL|S\.r\.l\.|SpA|S\.p\.A\.|Srls|SCPA|"
    r"SRO|s\.r\.o\.|"
    r"SL|SLU|SLL|SLNE|SAU|"
    r"Ltd|Limited|PLC|LLC|LLP|Inc|Corp|"
    r"AB|ApS|AS|"
    r"Oy|Oyj|hf|ehf|"
    r"DOO|d\.o\.o\.|DD|UAB|OOO|"
    r"Lda|CRL|Scrl|"
    r"EE|IKE|"
    r"Zrt|Kft|Nyrt|"
    r"SE|SA)\b",
    re.IGNORECASE,
)
_NORM_PUNCT_RE = re.compile(r"[,.\-_/\\&]+")
_NORM_WS_RE = re.compile(r"\s+")


def normalize_name(s: str) -> str:
    s = _NORM_LEGAL_RE.sub("", s)
    s = _NORM_PUNCT_RE.sub(" ", s)
    return _NORM_WS_RE.sub(" ", s).strip().lower()


# ---------------------------------------------------------------------------
# CSV → structured rows
# ---------------------------------------------------------------------------

def load_csv_rows() -> list[dict]:
    if not CSV_PATH.exists():
        raise FileNotFoundError(f"CSV not found: {CSV_PATH}")
    rows = []
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            borrower = r["borrower_name"].strip()
            # Derive company name from title if scrape returned nothing
            if not borrower:
                t = re.sub(r"\s*\([^)]*\)\s*$", "", r["title"]).strip()
                # Strip "TECHEU VD " / "TECHEU SCALE UP - " prefixes
                t = re.sub(r"^TECHEU\s+(?:VD|SCALE[\s\-]+UP)[\s\-]+", "", t, flags=re.IGNORECASE).strip()
                borrower = t
            if not borrower:
                continue

            # Parse date
            sig_date = None
            raw_date = r["signature_date"].strip()
            for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
                try:
                    sig_date = datetime.strptime(raw_date, fmt).strftime("%Y-%m-%d")
                    break
                except ValueError:
                    pass

            try:
                amount = float(r["amount_approved_eur"])
            except (ValueError, TypeError):
                amount = None

            sector_tag = _sector_tag(r.get("eib_sector", ""))
            source = _source_label(r["title"])

            rows.append({
                "eib_project_id": r["eib_project_id"],
                "title":          r["title"],
                "borrower_name":  borrower,
                "status":         r["status"],
                "signature_date": sig_date,
                "debt_amount_eur": amount,
                "country":        (r["country_iso2"] or "").upper(),
                "eib_sector":     r.get("eib_sector", ""),
                "sector_tag":     sector_tag,
                "description":    r.get("description", ""),
                "source":         source,
                "raw_url":        f"{EIB_BASE_URL}/en/projects/all/{r['eib_project_id']}",
            })
    return rows


# ---------------------------------------------------------------------------
# Company matching
# ---------------------------------------------------------------------------

_FUZZY_THRESHOLD = 0.92

MATCH_FIELDNAMES = [
    "source", "country", "input_name", "normalized", "matched_canonical",
    "match_method", "match_confidence", "company_id",
]


def match_companies(
    rows: list[dict],
    conn,
) -> tuple[list[dict], list[dict]]:
    cur = conn.cursor()

    cur.execute("SELECT id, canonical_name, country FROM companies ORDER BY canonical_name COLLATE \"C\", country COLLATE \"C\" NULLS FIRST, id")
    existing: dict[tuple[str, str], tuple[int, str]] = {}
    existing_list: list[tuple[str, str, int, str]] = []
    for row_id, cname, country in cur.fetchall():
        norm = normalize_name(cname)
        key = (norm, (country or "").upper())
        existing[key] = (row_id, cname)
        existing_list.append((norm, (country or "").upper(), row_id, cname))

    enriched: list[dict] = []
    summary: list[dict] = []

    for r in rows:
        norm = normalize_name(r["borrower_name"])
        country = r["country"]

        company_id: int | None = None
        match_method = "none"
        match_confidence = "unmatched"
        matched_canonical = ""

        # 1. Exact match
        if (norm, country) in existing:
            company_id, matched_canonical = existing[(norm, country)]
            match_method = "exact"
            match_confidence = "high"

        # 2. Fuzzy match (same country, ≥ threshold)
        if company_id is None and norm:
            best_ratio = 0.0
            best_id: int | None = None
            best_cname = ""
            for ex_norm, ex_country, ex_id, ex_cname in existing_list:
                if ex_country != country:
                    continue
                ratio = SequenceMatcher(None, norm, ex_norm).ratio()
                if ratio >= _FUZZY_THRESHOLD and ratio > best_ratio:
                    best_ratio = ratio
                    best_id = ex_id
                    best_cname = ex_cname
            if best_id is not None:
                company_id = best_id
                matched_canonical = best_cname
                match_method = "fuzzy"
                match_confidence = "medium"

        # 3. Insert new company
        if company_id is None:
            cur.execute(
                """INSERT INTO companies
                   (canonical_name, raw_name, country, entity_type, sector_inferred,
                    match_confidence, match_method)
                   VALUES (%s, %s, %s, 'unknown', NULL, 'unmatched', 'none') RETURNING id""",
                (r["borrower_name"], r["borrower_name"], country or None),
            )
            company_id = cur.fetchone()[0]
            matched_canonical = r["borrower_name"]
            match_method = "none"
            match_confidence = "unmatched"
            existing[(norm, country)] = (company_id, r["borrower_name"])
            existing_list.append((norm, country, company_id, r["borrower_name"]))

        enriched.append({**r, "company_id": company_id})
        summary.append({
            "source":            r["source"],
            "country":           country,
            "input_name":        r["borrower_name"],
            "normalized":        norm,
            "matched_canonical": matched_canonical,
            "match_method":      match_method,
            "match_confidence":  match_confidence,
            "company_id":        company_id,
        })

    conn.commit()
    return enriched, summary


# ---------------------------------------------------------------------------
# Event loading
# ---------------------------------------------------------------------------

def load_events(rows: list[dict], conn) -> int:
    cur = conn.cursor()
    inserted = 0
    for r in rows:
        company_id = r.get("company_id")
        if company_id is None:
            continue

        # Skip duplicate (source, call_id) pairs
        cur.execute(
            "SELECT 1 FROM public_funding_events WHERE source=%s AND call_id=%s",
            (r["source"], r["eib_project_id"]),
        )
        if cur.fetchone():
            continue

        cur.execute(
            """INSERT INTO public_funding_events
               (company_id, source, role, call_id,
                project_title, project_summary,
                project_started,
                debt_amount_eur,
                sector_tags_raw,
                raw_source_url,
                coordinator_only, grant_amount_basis)
               VALUES (%s, %s, 'borrower', %s, %s, %s, %s, %s, %s, %s, 0, 'eib_debt_commitment')""",
            (
                company_id,
                r["source"],
                r["eib_project_id"],
                r["title"],
                r["description"],
                r["signature_date"],
                r["debt_amount_eur"],
                r["sector_tag"],       # EIC-compatible tag or '' for keyword fallback
                r["raw_url"],
            ),
        )
        inserted += 1

    conn.commit()
    return inserted


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    args = set(sys.argv[1:])
    load_db = "--load-db" in args
    skip_scrape = "--skip-scrape" in args

    # inputs come from the grounding store, not a laptop (ETL/lib/grounded_inputs.py)
    materialise("eib")
    projects = _discover_projects()
    print(f"Discovered {len(projects)} EIB VD projects (2021+, signed/approved)")

    build_csv(projects, skip_scrape=skip_scrape)

    rows = load_csv_rows()
    print(f"Loaded {len(rows)} rows from CSV")

    if not load_db:
        print("(CSV only — pass --load-db to match and load into db.sqlite)")
        return


    with connect() as conn:
        print(f"\nMatching {len(rows)} rows against {DB_PATH.name} …")
        enriched, summary = match_companies(rows, conn)

        with open(MATCH_CSV_PATH, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=MATCH_FIELDNAMES)
            w.writeheader()
            w.writerows(summary)

        method_counts: dict[str, int] = {}
        for s in summary:
            method_counts[s["match_method"]] = method_counts.get(s["match_method"], 0) + 1
        print("Match results:")
        for method, count in sorted(method_counts.items()):
            print(f"  {method:<12}  {count:>4}")
        print(f"  Match summary → {MATCH_CSV_PATH}")

        inserted = load_events(enriched, conn)
    print(f"\nInserted {inserted} events into public_funding_events")

    total_debt = sum(
        r["debt_amount_eur"] for r in rows if r["debt_amount_eur"] is not None
    )
    print(f"Total debt_amount_eur loaded: €{total_debt/1e6:.0f}M")


if __name__ == "__main__":
    main()
