"""Extract Invest-NL portfolio companies (Sprint 13 Workstream D).

Source: https://www.invest-nl.nl/nl/impact/ons-portfolio
  - Server-side rendered HTML listing. ~13 entries visible.
  - Mix of direct equity (Milence, Fastned, Qualinx, etc.) and fund-of-funds LP
    commitments (EQT Health Economics 3, IQ Capital Fund V, etc.).
  - Amounts are NOT on the listing page (some appear on detail pages, e.g.
    "€ 25 miljoen" for Milence). Detail-page fetching is deferred — Sprint 13
    decision is "participation marker is analytically valuable on its own."

Schema mapping:
  source              = 'invest_nl_equity' (direct) | 'invest_nl_fof' (fund-of-funds)
  role                = 'direct'
  equity_amount_eur   = NULL (until detail-page enhancement)
  grant_amount_basis  = 'invest_nl_equity' (both source kinds)
  deployment_country  = 'NL'
  eif_lp_backed       = 0 (sovereign-funded)

Run modes:
  python extract_invest_nl.py             → parse + CSV only
  python extract_invest_nl.py --load-db   → parse + match + load
  python extract_invest_nl.py --refresh   → re-download listing (else use cached)
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
import re
import sqlite3
import subprocess
import sys
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

from ndb_helpers import backfill_ipcei_linked

BASE_DIR = _ETL_ROOT
RAW_DIR = BASE_DIR / "data" / "raw" / "invest_nl"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

LISTING_URL = "https://www.invest-nl.nl/nl/impact/ons-portfolio"
LISTING_HTML = RAW_DIR / "portfolio_listing.html"
CSV_PATH = OUT_DIR / "invest_nl_portfolio.csv"
MATCH_CSV_PATH = OUT_DIR / "invest_nl_match_summary.csv"
DB_PATH = _ETL_DB
DEPLOYMENT_COUNTRY = "NL"


# ---------------------------------------------------------------------------
# Sector mapping (Dutch portfolio labels → our v1 7-bucket taxonomy)
# ---------------------------------------------------------------------------

# Listing-page Dutch labels observed 2026-05-26.
INL_SECTOR_MAP: dict[str, str] = {
    "Deep tech": "deeptech_hardware",
    "Energie": "cleantech",
    "Biobased & Circulaire economie": "cleantech",
    "Biobased & Circulaire economie": "cleantech",  # duplicate-safe
    "Life Sciences & Health": "life_sciences",
    # Fund-of-funds-only entries (no single-sector tag) → 'other' until detail-page fetch resolves
}

# Slugs that are fund-of-funds vehicles, not direct company investments.
# When source='invest_nl_fof' we treat the fund itself as the "company" row
# until a per-portfolio resolution exists.
FOF_SLUGS: set[str] = {
    "investeu",
    "eqt-health-economics-3",
    "iq-capital-fund-v",
    "european-defence-security-tech-fund",
    "nextgen-ventures-fund-iii",
    "positron-ventures",
    "pureterra-ventures-fund-ii",
    "innovation-industries-fonds-ii",
    "dutch-alternative-credit-instrument",
    "dutch-future-fund",
    "capitalt",
}


# ---------------------------------------------------------------------------
# Name normaliser (shared pattern)
# ---------------------------------------------------------------------------

_NORM_LEGAL_RE = re.compile(
    r"\b(?:GmbH|gGmbH|mbH|AG|KG|UG|GesmbH|BV|NV|SAS|SARL|SASU|SCA|SRL|SpA|"
    r"SRO|SL|SLU|SLL|SAU|Ltd|Limited|PLC|LLC|LLP|Inc|Corp|AB|ApS|AS|"
    r"Oy|Oyj|hf|ehf|DOO|UAB|OOO|Lda|CRL|Scrl|SE|SA)\b",
    re.IGNORECASE,
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
    result = subprocess.run(
        ["curl", "-sL", "-A", "Mozilla/5.0", "-o", str(LISTING_HTML), LISTING_URL],
        capture_output=True, timeout=20,
    )
    if not LISTING_HTML.exists() or LISTING_HTML.stat().st_size < 5000:
        raise RuntimeError(
            f"Invest-NL listing fetch failed (size={LISTING_HTML.stat().st_size if LISTING_HTML.exists() else 0}); "
            f"stderr={result.stderr.decode()[:200]}"
        )
    return LISTING_HTML.read_text(encoding="utf-8")


_ENT_AMP = re.compile(r"&amp;")
_ANCHOR_RE = re.compile(
    r'<a[^>]*href="(?P<href>/nl/impact/ons-portfolio/[^"]+)"[^>]*>(?P<inner>.*?)</a>',
    re.S,
)


def parse_listing(html: str) -> list[dict]:
    """Extract company name, slug, description, and listing-page sector hint."""
    rows: list[dict] = []
    seen_slugs: set[str] = set()

    for m in _ANCHOR_RE.finditer(html):
        slug = m.group("href").rsplit("/", 1)[-1]
        if slug in seen_slugs:
            continue
        seen_slugs.add(slug)

        inner = m.group("inner")
        # Strip tags, normalise whitespace + HTML entities
        text = re.sub(r"<[^>]+>", " ", inner)
        text = _ENT_AMP.sub("&", text)
        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            continue

        # Try to peel a known sector tag off the end of the text
        sector_v1 = "other"
        sector_tags_raw = ""
        for label in sorted(INL_SECTOR_MAP, key=len, reverse=True):
            if text.endswith(label):
                sector_v1 = INL_SECTOR_MAP[label]
                sector_tags_raw = label
                text = text[: -len(label)].strip()
                break

        # Whatever remains is "<NAME> <Dutch-verb-starting-description>".
        # Split at the first Dutch description verb (capitalised, 3rd person singular).
        # If no verb match, fall back to slug-based name.
        _NL_VERBS = (
            r"[Cc]reëert|[Cc]reeert|[Vv]erleent|[Mm]aakt|[Oo]ntwikkelt|"
            r"[Ii]nvesteert|[Ll]eent|[Hh]elpt|[Bb]iedt|[Ff]aciliteert|"
            r"[Vv]ersnelt|[Oo]ndersteunt|[Bb]ouwt|[Ll]evert|[Ww]erkt|"
            r"[Vv]erbindt|[Vv]erandert|[Bb]rengt|[Vv]oert|[Ww]erkzaam"
        )
        verb_match = re.search(rf"\s({_NL_VERBS})\s", " " + text + " ")
        if verb_match:
            name = text[: verb_match.start()].strip()
            # Some entries repeat the name verbatim ("EQT Health Economics 3 EQT Health Economics 3 ...")
            half = len(name) // 2
            if half > 2 and name[:half].strip().rstrip() == name[half:].strip().lstrip():
                name = name[:half].strip()
        else:
            name = slug.replace("-", " ").title()

        is_fof = slug in FOF_SLUGS
        rows.append({
            "slug": slug,
            "raw_name": name,
            "description": text[len(name):].strip()[:500],
            "sector_tags_raw": sector_tags_raw or ("fund-of-funds" if is_fof else ""),
            "sector_v1": sector_v1,
            "is_fof": is_fof,
            "doc_url": f"https://www.invest-nl.nl{m.group('href')}",
        })

    return rows


# ---------------------------------------------------------------------------
# Matcher + loader (IF-pattern)
# ---------------------------------------------------------------------------

_FUZZY_THRESHOLD = 0.92

MATCH_FIELDNAMES = [
    "source", "call_id", "published_name", "country",
    "matched_company_id", "matched_canonical_name",
    "match_method", "match_confidence", "fuzzy_score",
]


def match_companies(rows: list[dict], conn: sqlite3.Connection) -> tuple[list[dict], list[dict]]:
    cur = conn.cursor()
    cur.execute("SELECT id, canonical_name, country FROM companies")
    existing: dict[tuple[str, str], tuple[int, str]] = {}
    existing_list: list[tuple[str, str, int, str]] = []
    for row_id, cname, cntry in cur.fetchall():
        norm = normalize_name(cname)
        existing[(norm, (cntry or "").upper())] = (row_id, cname)
        existing_list.append((norm, (cntry or "").upper(), row_id, cname))

    enriched: list[dict] = []
    summary: list[dict] = []
    country = DEPLOYMENT_COUNTRY  # Invest-NL assumed NL HQ unless detail page proves otherwise (future enhancement)

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
            entity_type = "other" if r["is_fof"] else "company"
            cur.execute(
                """INSERT INTO companies
                   (canonical_name, raw_name, country, entity_type, sector_inferred,
                    match_confidence, match_method)
                   VALUES (?, ?, ?, ?, ?, 'unmatched', 'none')""",
                (raw_name, raw_name, country, entity_type, r["sector_v1"]),
            )
            cid = cur.lastrowid
            matched_canonical = raw_name
            existing[(norm, country)] = (cid, raw_name)
            existing_list.append((norm, country, cid, raw_name))

        source_id = "invest_nl_fof" if r["is_fof"] else "invest_nl_equity"
        call_id = f"{source_id}_{r['slug']}"
        enriched.append({**r, "company_id": cid, "source": source_id, "call_id": call_id})
        summary.append({
            "source": source_id, "call_id": call_id, "published_name": raw_name,
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
        cid = r["company_id"]
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
                project_summary, sector_tags_raw, raw_source_url,
                coordinator_only, grant_amount_basis,
                deployment_country, eif_lp_backed)
               VALUES (?, ?, 'direct', ?, ?, ?, ?, ?, 1, 'invest_nl_equity', ?, 0)""",
            (cid, r["source"], r["call_id"], r["raw_name"],
             r["description"], r["sector_tags_raw"], r["doc_url"],
             DEPLOYMENT_COUNTRY),
        )
        inserted += 1
    conn.commit()
    if skipped:
        print(f"  Skipped {skipped} duplicate (source, call_id) pairs")
    return inserted


# ---------------------------------------------------------------------------
# Entry
# ---------------------------------------------------------------------------

CSV_FIELDNAMES = [
    "source", "call_id", "slug", "raw_name", "description",
    "sector_tags_raw", "sector_v1", "is_fof", "doc_url",
]

# Sector hint for classify.py — both Invest-NL sources lean deeptech/cleantech mix.
# Classify already infers from sector_tags_raw; this dict is for fall-through.
INVEST_NL_SOURCE_SECTOR: dict[str, str] = {
    "invest_nl_equity": "deeptech_hardware",
    "invest_nl_fof": "other",
}


def main() -> None:
    args = set(sys.argv[1:])
    load_db = "--load-db" in args
    refresh = "--refresh" in args

    print(f"Fetching {LISTING_URL} ...")
    html = fetch_listing(force=refresh)
    rows = parse_listing(html)

    # Assign source IDs in CSV preview
    for r in rows:
        r["source"] = "invest_nl_fof" if r["is_fof"] else "invest_nl_equity"
        r["call_id"] = f"{r['source']}_{r['slug']}"

    counts: dict[str, int] = defaultdict(int)
    for r in rows:
        counts[r["source"]] += 1
    print(f"Parsed {len(rows)} portfolio entries:")
    for src, n in sorted(counts.items()):
        print(f"  {src:<25}  {n:>3}")

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
    flagged = backfill_ipcei_linked(conn=conn, source_prefixes=("invest_nl_",))
    print(f"Inserted {inserted} events; flagged {flagged} as ipcei_linked")
    conn.close()
    print("next: run python3 classify.py")


if __name__ == "__main__":
    main()
