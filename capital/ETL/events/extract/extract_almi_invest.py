"""Extract Almi Invest portfolio (Sprint 13 Workstream H — Almi half).

Source: https://www.almi.se/api/views/portfolio?root=3650&p={1..21}
  - Paginated HTML cards. ~323 unique portfolio companies as of 2026-05-26.
  - Per card: company name + slug. No sector tags, no year, no amount disclosed
    on the listing. Detail pages exist at /riskkapital/portfolio/<slug>/ but
    typically only carry a short description.

Vinnova (Sprint 13 Workstream H's grants half) is behind etjanster.vinnova.se
login and out of scope this session. Saminvest's portfolio is JS-only.

Schema mapping:
  source              = 'almi_invest_equity'
  role                = 'direct'
  equity_amount_eur   = NULL (Almi does not publish ticket sizes)
  grant_amount_basis  = 'almi_invest_equity'
  deployment_country  = 'SE'
  eif_lp_backed       = 0 (Almi Invest is sovereign-funded; not LP-backed by EIF)

Run modes:
  python extract_almi_invest.py             → parse + CSV only
  python extract_almi_invest.py --load-db   → parse + match + load
  python extract_almi_invest.py --refresh   → re-download pages
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

BASE_DIR = _ETL_ROOT
RAW_DIR = BASE_DIR / "data" / "raw" / "almi_invest"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

API_BASE = "https://www.almi.se/api/views/portfolio?root=3650"
CSV_PATH = OUT_DIR / "almi_invest_portfolio.csv"
MATCH_CSV_PATH = OUT_DIR / "almi_invest_match_summary.csv"
DB_PATH = _ETL_DB
DEPLOYMENT_COUNTRY = "SE"

# Almi Invest's listing has no sector hint — all rows default to 'other' until
# classify.py can re-classify from name/website signals.
ALMI_INVEST_SOURCE_SECTOR: dict[str, str] = {"almi_invest_equity": "other"}

_NORM_LEGAL_RE = re.compile(
    r"\b(?:AB|Aktiebolag|ApS|AS|SE|SA|GmbH|AG|BV|NV|"
    r"Ltd|Limited|PLC|LLC|Inc|Corp|Holding)\b\.?", re.IGNORECASE,
)
_NORM_PUNCT_RE = re.compile(r"[,.\-_/\\&]+")
_NORM_WS_RE = re.compile(r"\s+")


def normalize_name(s: str) -> str:
    s = _NORM_LEGAL_RE.sub("", s)
    s = _NORM_PUNCT_RE.sub(" ", s)
    return _NORM_WS_RE.sub(" ", s).strip().lower()


def fetch_all(force: bool, max_pages: int = 30) -> None:
    """Download all pages until two consecutive empties."""
    empties = 0
    for p in range(1, max_pages + 1):
        out = RAW_DIR / f"page_{p}.html"
        if out.exists() and not force:
            continue
        subprocess.run(
            ["curl", "-sL", "-A", "Mozilla/5.0", "-o", str(out), f"{API_BASE}&p={p}"],
            check=False, timeout=15,
        )
        if not out.exists() or out.stat().st_size < 200:
            empties += 1
            try: out.unlink()
            except FileNotFoundError: pass
            if empties >= 2:
                break
        else:
            empties = 0


_CARD_RE = re.compile(
    r'href="/riskkapital/portfolio/(?P<slug>[^/"]+)/?"[^>]*>.*?'
    r'<highlight-text[^>]*>(?P<name>[^<]+)</highlight-text>',
    re.S,
)


def parse_all() -> list[dict]:
    seen: set[str] = set()
    rows: list[dict] = []
    for f in sorted(RAW_DIR.glob("page_*.html"), key=lambda p: int(p.stem.split("_")[1])):
        html = f.read_text(encoding="utf-8")
        for m in _CARD_RE.finditer(html):
            slug = m.group("slug")
            if slug in seen:
                continue
            seen.add(slug)
            name = html_mod.unescape(m.group("name")).strip()
            rows.append({
                "slug": slug,
                "raw_name": name,
                "sector_tags_raw": "",
                "doc_url": f"https://www.almi.se/riskkapital/portfolio/{slug}/",
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
    country = DEPLOYMENT_COUNTRY  # Almi Invest only funds Swedish companies

    for r in rows:
        raw_name = r["raw_name"]
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
                if ex_country != country:
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
                   (canonical_name, raw_name, country, entity_type, sector_inferred,
                    match_confidence, match_method)
                   VALUES (?, ?, ?, 'company', 'other', 'unmatched', 'none')""",
                (raw_name, raw_name, country),
            )
            cid = cur.lastrowid
            matched_canonical = raw_name
            existing[(norm, country)] = (cid, raw_name)
            existing_list.append((norm, country, cid, raw_name))

        call_id = f"almi_invest_equity_{r['slug']}"
        enriched.append({**r, "company_id": cid, "source": "almi_invest_equity", "call_id": call_id})
        summary.append({
            "source": "almi_invest_equity", "call_id": call_id, "published_name": raw_name,
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
                raw_source_url, coordinator_only, grant_amount_basis,
                deployment_country, eif_lp_backed)
               VALUES (?, ?, 'direct', ?, ?, ?, 1, 'almi_invest_equity', ?, 0)""",
            (r["company_id"], r["source"], r["call_id"], r["raw_name"],
             r["doc_url"], DEPLOYMENT_COUNTRY),
        )
        inserted += 1
    conn.commit()
    if skipped:
        print(f"  Skipped {skipped} duplicate (source, call_id) pairs")
    return inserted


CSV_FIELDNAMES = ["source", "call_id", "slug", "raw_name", "sector_tags_raw", "doc_url"]


def main() -> None:
    args = set(sys.argv[1:])
    load_db = "--load-db" in args
    refresh = "--refresh" in args

    print("Fetching Almi Invest portfolio pages ...")
    fetch_all(force=refresh)
    rows = parse_all()
    for r in rows:
        r["source"] = "almi_invest_equity"
        r["call_id"] = f"almi_invest_equity_{r['slug']}"

    print(f"Parsed {len(rows)} unique portfolio companies")

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
        print(f"  {m:<20}  {n:>4}")

    inserted = load_events(enriched, conn)
    flagged = backfill_ipcei_linked(conn=conn, source_prefixes=("almi_invest_",))
    print(f"Inserted {inserted} events; flagged {flagged} as ipcei_linked")
    conn.close()
    print("next: run python3 classify.py")


if __name__ == "__main__":
    main()
