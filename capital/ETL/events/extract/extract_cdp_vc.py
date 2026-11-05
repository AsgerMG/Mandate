"""Extract CDP Venture Capital portfolio (Sprint 13 Workstream C).

Source: https://www.cdpventurecapital.it/it/portfolio.page
  - Server-rendered HTML cards. 200 entries (153 direct + 47 supported funds).
  - Per-card data-attributes: category, vehicle (which CDP fund), sector, region.
  - Website link present per card. NO amounts disclosed on the listing.

Schema mapping:
  source              = 'cdp_vc_equity' (direct) | 'cdp_vc_fof' (fund-of-funds)
  role                = 'direct'
  equity_amount_eur   = NULL
  grant_amount_basis  = 'cdp_vc_equity' (both kinds)
  deployment_country  = 'IT'
  eif_lp_backed       = 1 for cdp_vc_*  (per ndb_helpers.py mark_eif_backed)

Run modes:
  python extract_cdp_vc.py             → parse + CSV only
  python extract_cdp_vc.py --load-db   → parse + match + load
  python extract_cdp_vc.py --refresh   → re-download listing
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
# --- end ETL path bootstrap ---

import csv
import html as html_mod
import re
import subprocess
import sys
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

from ndb_helpers import backfill_ipcei_linked

BASE_DIR = _ETL_ROOT
RAW_DIR = BASE_DIR / "data" / "raw" / "cdp_vc"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

LISTING_URL = "https://www.cdpventurecapital.it/it/portfolio.page"
LISTING_HTML = RAW_DIR / "portfolio_listing.html"
CSV_PATH = OUT_DIR / "cdp_vc_portfolio.csv"
MATCH_CSV_PATH = OUT_DIR / "cdp_vc_match_summary.csv"
DB_PATH = _ETL_DB
DEPLOYMENT_COUNTRY = "IT"


# data-settore label → v1 sector
CDP_SECTOR_MAP: dict[str, str] = {
    "Clean Tech": "cleantech",
    "Healthcare & Lifescience": "life_sciences",
    "InfraTech & Mobility": "deeptech_hardware",
    "IndustryTech": "deeptech_hardware",
    "AgriTech & FoodTech": "life_sciences",
    "SpaceTech": "space",
    "AI": "digital",
    "Other": "other",
}

CDP_VC_SOURCE_SECTOR: dict[str, str] = {
    "cdp_vc_equity": "deeptech_hardware",
    "cdp_vc_fof": "other",
}


_NORM_LEGAL_RE = re.compile(
    r"\b(?:S\.r\.l\.|SRL|SpA|S\.p\.A\.|Srls|SCPA|Holding|SICAF|"
    r"GmbH|AG|BV|NV|Ltd|Limited|PLC|LLC|Inc|Corp|SE|SA)\b\.?", re.IGNORECASE,
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
        ["curl", "-sL", "-A", "Mozilla/5.0", "-o", str(LISTING_HTML), LISTING_URL],
        check=False, timeout=25,
    )
    if not LISTING_HTML.exists() or LISTING_HTML.stat().st_size < 5000:
        raise RuntimeError(f"CDP VC listing fetch failed: {LISTING_HTML}")
    return LISTING_HTML.read_text(encoding="utf-8")


_CARD_RE = re.compile(
    r'<div[^>]*class="[^"]*card-wrapper[^"]*flip-card-wrapper[^"]*"[^>]*'
    r'data-category="(?P<cat>[^"]*)"[^>]*?'
    r'data-veicolo="(?P<vei>[^"]*)"[^>]*?'
    r'data-settore="(?P<sec>[^"]*)"[^>]*?'
    r'data-regione="(?P<reg>[^"]*)"[^>]*?>'
    r'(?P<inner>.*?)(?=<div[^>]*card-wrapper|</section)', re.S,
)


def parse_listing(html: str) -> list[dict]:
    rows: list[dict] = []
    seen: set[str] = set()
    for m in _CARD_RE.finditer(html):
        inner = m.group('inner')
        name_m = re.search(r'<h4[^>]*>([^<]+)</h4>', inner)
        if not name_m:
            continue
        name = html_mod.unescape(name_m.group(1)).strip()
        if not name or name in seen:
            continue
        seen.add(name)

        category = m.group('cat')
        is_fof = category == "FondiSupportati"
        sector_raw = html_mod.unescape(m.group('sec')).strip()
        # First label before comma is the primary sector
        primary = sector_raw.split(",")[0].strip()
        sector_v1 = CDP_SECTOR_MAP.get(primary, "other")

        href_m = re.search(r'<a[^>]*class="btn-animated-icon-grey"[^>]*href="([^"]+)"', inner)
        website = (href_m.group(1).strip() if href_m else "")

        # Italian-region "Altro" means non-Italy or unspecified; everything else is IT.
        region = html_mod.unescape(m.group('reg')).strip()
        country = "IT" if region and region != "Altro" else ""

        rows.append({
            "raw_name": name,
            "is_fof": is_fof,
            "vehicle": m.group('vei'),
            "sector_tags_raw": sector_raw,
            "sector_v1": sector_v1,
            "region": region,
            "country": country,
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


def match_companies(rows: list[dict], conn):
    cur = conn.cursor()
    cur.execute("SELECT id, canonical_name, country FROM companies ORDER BY canonical_name COLLATE \"C\", country COLLATE \"C\" NULLS FIRST, id")
    existing: dict[tuple[str, str], tuple[int, str]] = {}
    existing_list: list[tuple[str, str, int, str]] = []
    for row_id, cname, cntry in cur.fetchall():
        norm = normalize_name(cname)
        existing[(norm, (cntry or "").upper())] = (row_id, cname)
        existing_list.append((norm, (cntry or "").upper(), row_id, cname))

    enriched, summary = [], []
    for r in rows:
        raw_name = r["raw_name"]
        country = r["country"]
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
                if country and ex_country and ex_country != country:
                    continue
                ratio = SequenceMatcher(None, norm, ex_norm).ratio()
                if ratio >= _FUZZY_THRESHOLD and ratio > best_ratio:
                    best_ratio, best_id, best_name = ratio, ex_id, ex_cname
            if best_id is not None:
                cid, matched_canonical = best_id, best_name
                method, conf, fuzzy_score = "fuzzy", "medium", round(best_ratio, 4)

        if cid is None:
            entity_type = "other" if r["is_fof"] else "company"
            cur.execute(
                """INSERT INTO companies
                   (canonical_name, raw_name, country, website, entity_type, sector_inferred,
                    match_confidence, match_method)
                   VALUES (%s, %s, %s, %s, %s, %s, 'unmatched', 'none') RETURNING id""",
                (raw_name, raw_name, country or None, r["website"] or None,
                 entity_type, r["sector_v1"]),
            )
            cid = cur.fetchone()[0]
            matched_canonical = raw_name
            existing[(norm, country)] = (cid, raw_name)
            existing_list.append((norm, country, cid, raw_name))

        source_id = "cdp_vc_fof" if r["is_fof"] else "cdp_vc_equity"
        slug = re.sub(r"[^a-z0-9]+", "-", raw_name.lower()).strip("-")[:60]
        call_id = f"{source_id}_{slug}"
        enriched.append({**r, "company_id": cid, "source": source_id, "call_id": call_id})
        summary.append({
            "source": source_id, "call_id": call_id, "published_name": raw_name,
            "country": country, "matched_company_id": cid,
            "matched_canonical_name": matched_canonical,
            "match_method": method, "match_confidence": conf, "fuzzy_score": fuzzy_score,
        })

    conn.commit()
    return enriched, summary


def load_events(rows: list[dict], conn) -> int:
    cur = conn.cursor()
    inserted, skipped = 0, 0
    for r in rows:
        cur.execute(
            "SELECT 1 FROM public_funding_events WHERE source=%s AND call_id=%s",
            (r["source"], r["call_id"]),
        )
        if cur.fetchone():
            skipped += 1
            continue
        cur.execute(
            """INSERT INTO public_funding_events
               (company_id, source, role, call_id, project_title,
                project_summary, sector_tags_raw, raw_source_url,
                coordinator_only, grant_amount_basis,
                deployment_country, eif_lp_backed)
               VALUES (%s, %s, 'direct', %s, %s, %s, %s, %s, 1, 'cdp_vc_equity', %s, 1)""",
            (r["company_id"], r["source"], r["call_id"], r["raw_name"],
             r.get("vehicle", ""), r["sector_tags_raw"], r["doc_url"],
             DEPLOYMENT_COUNTRY),
        )
        inserted += 1
    conn.commit()
    if skipped:
        print(f"  Skipped {skipped} duplicate (source, call_id) pairs")
    return inserted


CSV_FIELDNAMES = [
    "source", "call_id", "raw_name", "is_fof", "vehicle",
    "sector_tags_raw", "sector_v1", "region", "country", "website", "doc_url",
]


def main() -> None:
    args = set(sys.argv[1:])
    load_db = "--load-db" in args
    refresh = "--refresh" in args

    print(f"Fetching {LISTING_URL} ...")
    html = fetch_listing(force=refresh)
    rows = parse_listing(html)
    for r in rows:
        r["source"] = "cdp_vc_fof" if r["is_fof"] else "cdp_vc_equity"
        slug = re.sub(r"[^a-z0-9]+", "-", r["raw_name"].lower()).strip("-")[:60]
        r["call_id"] = f"{r['source']}_{slug}"

    counts: dict[str, int] = defaultdict(int)
    for r in rows:
        counts[r["source"]] += 1
    print(f"Parsed {len(rows)} cards:")
    for src, n in sorted(counts.items()):
        print(f"  {src:<25}  {n}")

    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
        w.writeheader()
        w.writerows(rows)
    print(f"CSV → {CSV_PATH}")

    if not load_db:
        print("(CSV only — pass --load-db to match and load into db.sqlite)")
        return

    with connect() as conn:
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
            print(f"  {m:<20}  {n}")

        inserted = load_events(enriched, conn)
        flagged = backfill_ipcei_linked(conn=conn, source_prefixes=("cdp_vc_",))
        print(f"Inserted {inserted} events; flagged {flagged} as ipcei_linked")
    print("next: run python3 classify.py")


if __name__ == "__main__":
    main()
