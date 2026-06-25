"""Extract Coparion portfolio (Sprint 13 Workstream B — KfW Capital deployment layer, second source).

Source: https://www.coparion.vc/  (homepage embeds 52 modal-style portfolio cards)
  - Server-rendered HTML; each portfolio company is a `<div id="portfolio-item-N">` modal.
  - Per modal: name (in <h4><span>), Managing Director name + role, external
    company website link, LinkedIn link. NO sector tag, NO amount, NO year.

Coparion is the second major KfW-backed German VC alongside HTGF. KfW Capital
is an LP in Coparion's funds. Together HTGF+Coparion form the "KfW Capital
deployment layer" for direct equity into German deeptech / scaleups.

Schema mapping:
  source              = 'coparion_equity'
  role                = 'direct'
  equity_amount_eur   = NULL (not disclosed)
  grant_amount_basis  = 'coparion_equity'
  deployment_country  = 'DE'
  eif_lp_backed       = 0  (KfW/sovereign LP, not EIF)

Run modes:
  python extract_coparion.py             → parse + CSV only
  python extract_coparion.py --load-db   → parse + match + load
  python extract_coparion.py --refresh   → re-download listing
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
RAW_DIR = BASE_DIR / "data" / "raw" / "coparion"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

LISTING_URL = "https://www.coparion.vc/"
LISTING_HTML = RAW_DIR / "homepage.html"
CSV_PATH = OUT_DIR / "coparion_portfolio.csv"
MATCH_CSV_PATH = OUT_DIR / "coparion_match_summary.csv"
DB_PATH = _ETL_DB
DEPLOYMENT_COUNTRY = "DE"

COPARION_SOURCE_SECTOR: dict[str, str] = {"coparion_equity": "deeptech_hardware"}

_NORM_LEGAL_RE = re.compile(
    r"\b(?:GmbH|gGmbH|mbH|AG|KG|UG|GesmbH|"
    r"BV|NV|SAS|SARL|SE|SA|Ltd|Limited|PLC|LLC|Inc|Corp)\b\.?",
    re.IGNORECASE,
)
_NORM_PUNCT_RE = re.compile(r"[,.\-_/\\&]+")
_NORM_WS_RE = re.compile(r"\s+")


def normalize_name(s: str) -> str:
    s = _NORM_LEGAL_RE.sub("", s)
    s = _NORM_PUNCT_RE.sub(" ", s)
    return _NORM_WS_RE.sub(" ", s).strip().lower()


def fetch_listing(force: bool) -> str:
    if LISTING_HTML.exists() and not force:
        return LISTING_HTML.read_text(encoding="utf-8")
    subprocess.run(
        ["/usr/bin/curl", "-sL", "-A", "Mozilla/5.0",
         "-o", str(LISTING_HTML), "--max-time", "20", LISTING_URL],
        check=False,
    )
    if not LISTING_HTML.exists() or LISTING_HTML.stat().st_size < 5000:
        raise RuntimeError(f"Coparion fetch failed: {LISTING_HTML}")
    return LISTING_HTML.read_text(encoding="utf-8")


def parse_listing(html: str) -> list[dict]:
    """Each portfolio-item-N modal has <h4><span>NAME</span></h4> + external link."""
    rows: list[dict] = []
    seen: set[str] = set()
    for m in re.finditer(
        r'id="portfolio-item-(\d+)"(.*?)</div>\s*</div>\s*</div>',
        html, re.S,
    ):
        mid, body = m.group(1), m.group(2)
        name_m = re.search(r"<h4[^>]*>\s*<span>([^<]+)</span>", body)
        if not name_m:
            continue
        name = html_mod.unescape(name_m.group(1)).strip()
        if not name or name in seen:
            continue
        seen.add(name)
        # External website (skip coparion / linkedin / twitter)
        website = ""
        for sm in re.finditer(r'href="(https?://[^"]+)"', body):
            u = sm.group(1)
            if not any(x in u for x in ("coparion", "linkedin", "twitter")):
                website = u
                break
        rows.append({
            "modal_id": mid,
            "raw_name": name,
            "website": website,
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
    country = DEPLOYMENT_COUNTRY

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
                   (canonical_name, raw_name, country, website, entity_type,
                    sector_inferred, match_confidence, match_method)
                   VALUES (?, ?, ?, ?, 'company', 'deeptech_hardware', 'unmatched', 'none')""",
                (raw_name, raw_name, country, r["website"] or None),
            )
            cid = cur.lastrowid
            matched_canonical = raw_name
            existing[(norm, country)] = (cid, raw_name)
            existing_list.append((norm, country, cid, raw_name))

        call_id = f"coparion_equity_{r['modal_id']}"
        enriched.append({**r, "company_id": cid, "source": "coparion_equity", "call_id": call_id})
        summary.append({
            "source": "coparion_equity", "call_id": call_id, "published_name": raw_name,
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
               VALUES (?, ?, 'direct', ?, ?, ?, 1, 'coparion_equity', ?, 0)""",
            (r["company_id"], r["source"], r["call_id"], r["raw_name"],
             r["doc_url"], DEPLOYMENT_COUNTRY),
        )
        inserted += 1
    conn.commit()
    if skipped:
        print(f"  Skipped {skipped} duplicate (source, call_id) pairs")
    return inserted


CSV_FIELDNAMES = ["source", "call_id", "modal_id", "raw_name", "website", "doc_url"]


def main() -> None:
    args = set(sys.argv[1:])
    load_db = "--load-db" in args
    refresh = "--refresh" in args

    print(f"Fetching {LISTING_URL} ...")
    html = fetch_listing(force=refresh)
    rows = parse_listing(html)
    for r in rows:
        r["source"] = "coparion_equity"
        r["call_id"] = f"coparion_equity_{r['modal_id']}"
    print(f"Parsed {len(rows)} Coparion portfolio companies")

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
    method_counts = defaultdict(int)
    for s in summary:
        method_counts[s["match_method"]] += 1
    print("Match results:")
    for m, n in sorted(method_counts.items()):
        print(f"  {m:<20}  {n}")
    inserted = load_events(enriched, conn)
    flagged = backfill_ipcei_linked(conn=conn, source_prefixes=("coparion_",))
    print(f"Inserted {inserted} events; flagged {flagged} as ipcei_linked")
    conn.close()
    print("next: run python3 classify.py")


if __name__ == "__main__":
    main()
