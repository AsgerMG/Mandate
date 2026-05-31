"""Extract Tesi (Finnish Industry Investment) portfolio (Sprint 13 Workstream G — Tesi half).

Source: https://tesi.fi/en/portfolio/companies/
  - Server-side rendered HTML table; 135 unique direct portfolio companies.
  - Per-row data: company name, website, investment year, portfolio category
    (Venture Capital / Scaleup & Growth / Industrial), sector tags, manager.
  - Amounts NOT disclosed on the listing (no detail page exposes them either).

Tesi's other half — fund-of-funds LP commitments (KRR + 137 PE/VC funds) — is
out of scope here per the Sprint 13 "track at deployment layer" rule. They
appear in the aggregate stats Tesi publishes ("EUR 3.2 bn AUM") but not at
per-fund level on this listing.

Business Finland (Workstream G's grants half) requires a separate session and is
deferred — Vinnova-style behind-login projektdatabas.

Schema mapping:
  source              = 'tesi_equity'
  role                = 'direct'
  equity_amount_eur   = NULL
  grant_amount_basis  = 'tesi_equity'
  deployment_country  = 'FI'
  eif_lp_backed       = 0 (sovereign-funded Finnish state)
  project_started     = investment-year-01-01 (best signal we have)

Run modes:
  python extract_tesi.py             → parse + CSV only
  python extract_tesi.py --load-db   → parse + match + load
  python extract_tesi.py --refresh   → re-download
"""
from __future__ import annotations

import csv
import html as html_mod
import re
import sqlite3
import subprocess
import sys
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

from ndb_helpers import backfill_ipcei_linked

BASE_DIR = Path(__file__).parent.parent
RAW_DIR = BASE_DIR / "data" / "raw" / "tesi"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

LISTING_URL = "https://tesi.fi/en/portfolio/companies/"
LISTING_HTML = RAW_DIR / "portfolio_listing.html"
CSV_PATH = OUT_DIR / "tesi_portfolio.csv"
MATCH_CSV_PATH = OUT_DIR / "tesi_match_summary.csv"
DB_PATH = BASE_DIR / "db.sqlite"
DEPLOYMENT_COUNTRY = "FI"

# Listing-page sector labels → v1 7-bucket
TESI_SECTOR_MAP: dict[str, str] = {
    "Health & Life Science": "life_sciences",
    "Deep tech": "deeptech_hardware",
    "Defence": "defense",
    "Clean economy": "cleantech",
    "Other": "other",
}

# All Tesi rows → tesi_equity (single source per Sprint 13 plan)
TESI_SOURCE_SECTOR: dict[str, str] = {"tesi_equity": "deeptech_hardware"}


_NORM_LEGAL_RE = re.compile(
    r"\b(?:Oy|Oyj|hf|ehf|AB|ApS|AS|SE|SA|GmbH|AG|BV|NV|"
    r"Ltd|Limited|PLC|LLC|Inc|Corp|Holding)\b\.?", re.IGNORECASE,
)
_NORM_PUNCT_RE = re.compile(r"[,.\-_/\\&]+")
_NORM_WS_RE = re.compile(r"\s+")


def normalize_name(s: str) -> str:
    s = _NORM_LEGAL_RE.sub("", s)
    s = _NORM_PUNCT_RE.sub(" ", s)
    return _NORM_WS_RE.sub(" ", s).strip().lower()


# ---------------------------------------------------------------------------
# Fetch + parse
# ---------------------------------------------------------------------------

def fetch_listing(force: bool) -> str:
    if LISTING_HTML.exists() and not force:
        return LISTING_HTML.read_text(encoding="utf-8")
    subprocess.run(
        ["curl", "-sL", "-A", "Mozilla/5.0", "-o", str(LISTING_HTML), LISTING_URL],
        check=False, timeout=25,
    )
    if not LISTING_HTML.exists() or LISTING_HTML.stat().st_size < 5000:
        raise RuntimeError(f"Tesi listing fetch failed: {LISTING_HTML}")
    return LISTING_HTML.read_text(encoding="utf-8")


_TR = re.compile(r"<tr[^>]*>(.*?)</tr>", re.S)
_TD = re.compile(r"<td[^>]*>(.*?)</td>", re.S)


def _strip(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s)).strip()


def parse_listing(html: str) -> list[dict]:
    """Each TR → 6 cells: name, website, year, category, sector_tags, manager.

    The page contains nested / duplicated TRs; dedupe by (name, year).
    """
    seen: set[tuple[str, str]] = set()
    rows: list[dict] = []
    for tr in _TR.finditer(html):
        cells = [_strip(c) for c in _TD.findall(tr.group(1))]
        if len(cells) < 5:
            continue
        name = html_mod.unescape(cells[0])
        if not name or len(name) > 200:
            continue
        website = cells[1] if len(cells) > 1 else ""
        year_raw = cells[2] if len(cells) > 2 else ""
        category = html_mod.unescape(cells[3]) if len(cells) > 3 else ""
        sector_tags = html_mod.unescape(cells[4]) if len(cells) > 4 else ""

        try:
            year = int(re.search(r"\d{4}", year_raw).group(0))
        except (AttributeError, ValueError):
            continue
        if not (1990 <= year <= 2030):
            continue

        key = (name.lower(), str(year))
        if key in seen:
            continue
        seen.add(key)

        sector_v1 = "other"
        for label, mapped in TESI_SECTOR_MAP.items():
            if label in sector_tags:
                sector_v1 = mapped
                break

        rows.append({
            "raw_name": name,
            "website": website,
            "year": year,
            "category": category,
            "sector_tags_raw": sector_tags,
            "sector_v1": sector_v1,
            "doc_url": LISTING_URL,
        })
    return rows


# ---------------------------------------------------------------------------
# Matcher + loader
# ---------------------------------------------------------------------------

_FUZZY_THRESHOLD = 0.92

MATCH_FIELDNAMES = [
    "source", "call_id", "published_name", "country",
    "matched_company_id", "matched_canonical_name",
    "match_method", "match_confidence", "fuzzy_score",
]


def match_companies(rows: list[dict], conn: sqlite3.Connection):
    cur = conn.cursor()
    cur.execute("SELECT id, canonical_name, country FROM companies")
    existing: dict[tuple[str, str], tuple[int, str]] = {}
    existing_list: list[tuple[str, str, int, str]] = []
    for row_id, cname, cntry in cur.fetchall():
        norm = normalize_name(cname)
        existing[(norm, (cntry or "").upper())] = (row_id, cname)
        existing_list.append((norm, (cntry or "").upper(), row_id, cname))

    enriched, summary = [], []
    for r in rows:
        raw_name = r["raw_name"]
        # Heuristic: company is Finnish unless name screams non-FI (e.g. "Inc.", "Holding, Inc.")
        country = "FI"
        upper = raw_name.upper()
        if " INC" in upper or " HOLDING," in upper:
            country = ""  # unknown
        norm = normalize_name(raw_name)

        cid: int | None = None
        method, conf = "none", "unmatched"
        matched_canonical = ""
        fuzzy_score = None

        if (norm, country) in existing:
            cid, matched_canonical = existing[(norm, country)]
            method, conf = "exact", "high"

        if cid is None and norm:
            best_ratio, best_id, best_name = 0.0, None, ""
            for ex_norm, ex_country, ex_id, ex_cname in existing_list:
                if ex_country and country and ex_country != country:
                    continue
                ratio = SequenceMatcher(None, norm, ex_norm).ratio()
                if ratio >= _FUZZY_THRESHOLD and ratio > best_ratio:
                    best_ratio, best_id, best_name = ratio, ex_id, ex_cname
            if best_id is not None:
                cid, matched_canonical = best_id, best_name
                method, conf, fuzzy_score = "fuzzy", "medium", round(best_ratio, 4)

        if cid is None:
            cur.execute(
                """INSERT INTO companies
                   (canonical_name, raw_name, country, website, entity_type, sector_inferred,
                    match_confidence, match_method)
                   VALUES (?, ?, ?, ?, 'company', ?, 'unmatched', 'none')""",
                (raw_name, raw_name, country or None,
                 r["website"] or None, r["sector_v1"]),
            )
            cid = cur.lastrowid
            matched_canonical = raw_name
            existing[(norm, country)] = (cid, raw_name)
            existing_list.append((norm, country, cid, raw_name))

        call_id = f"tesi_equity_{cid}_{r['year']}"
        enriched.append({**r, "company_id": cid, "source": "tesi_equity", "call_id": call_id, "country": country})
        summary.append({
            "source": "tesi_equity", "call_id": call_id, "published_name": raw_name,
            "country": country, "matched_company_id": cid,
            "matched_canonical_name": matched_canonical,
            "match_method": method, "match_confidence": conf, "fuzzy_score": fuzzy_score,
        })

    conn.commit()
    return enriched, summary


def load_events(rows: list[dict], conn: sqlite3.Connection) -> int:
    cur = conn.cursor()
    inserted, skipped = 0, 0
    for r in rows:
        cur.execute(
            "SELECT 1 FROM public_funding_events WHERE source=? AND call_id=?",
            (r["source"], r["call_id"]),
        )
        if cur.fetchone():
            skipped += 1
            continue
        cur.execute(
            """INSERT INTO public_funding_events
               (company_id, source, role, call_id, project_title,
                project_summary, project_started,
                sector_tags_raw, raw_source_url,
                coordinator_only, grant_amount_basis,
                deployment_country, eif_lp_backed)
               VALUES (?, ?, 'direct', ?, ?, ?, ?, ?, ?, 1, 'tesi_equity', ?, 0)""",
            (r["company_id"], r["source"], r["call_id"], r["raw_name"],
             r.get("category", ""), f"{r['year']}-01-01",
             r["sector_tags_raw"], r["doc_url"], DEPLOYMENT_COUNTRY),
        )
        inserted += 1
    conn.commit()
    if skipped:
        print(f"  Skipped {skipped} duplicate (source, call_id) pairs")
    return inserted


# ---------------------------------------------------------------------------

CSV_FIELDNAMES = [
    "source", "call_id", "raw_name", "website", "year",
    "category", "sector_tags_raw", "sector_v1", "doc_url",
]


def main() -> None:
    args = set(sys.argv[1:])
    load_db = "--load-db" in args
    refresh = "--refresh" in args

    print(f"Fetching {LISTING_URL} ...")
    html = fetch_listing(force=refresh)
    rows = parse_listing(html)
    for r in rows:
        r["source"] = "tesi_equity"
        r["call_id"] = f"tesi_equity_{normalize_name(r['raw_name']).replace(' ','_')}_{r['year']}"

    counts: dict[int, int] = defaultdict(int)
    for r in rows:
        counts[r["year"]] += 1
    print(f"Parsed {len(rows)} portfolio entries — by year:")
    for year in sorted(counts):
        print(f"  {year}  {counts[year]:>3}")

    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
        w.writeheader()
        w.writerows(rows)
    print(f"CSV → {CSV_PATH}")

    if not load_db:
        print("(CSV only — pass --load-db to match and load into db.sqlite)")
        return

    conn = sqlite3.connect(DB_PATH)
    enriched, summary = match_companies(rows, conn)

    with MATCH_CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w2 = csv.DictWriter(f, fieldnames=MATCH_FIELDNAMES)
        w2.writeheader()
        w2.writerows(summary)
    method_counts: dict[str, int] = defaultdict(int)
    for s in summary:
        method_counts[s["match_method"]] += 1
    print("Match results:")
    for m, n in sorted(method_counts.items()):
        print(f"  {m:<20}  {n:>3}")

    inserted = load_events(enriched, conn)
    flagged = backfill_ipcei_linked(conn=conn, source_prefixes=("tesi_",))
    print(f"Inserted {inserted} events; flagged {flagged} as ipcei_linked")
    conn.close()
    print("next: run python3 classify.py")


if __name__ == "__main__":
    main()
