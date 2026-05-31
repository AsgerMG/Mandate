"""Extract HTGF (High-Tech Gründerfonds) portfolio (Sprint 13 Workstream B — KfW Capital deployment layer).

Source: https://www.htgf.de/wp-json/wp/v2/portfolio (WordPress REST API, no auth)
  - 857 unique portfolio companies (1,069 raw posts; deduped to EN+DE pairs by slug).
  - Sector taxonomy in WordPress `class_list` field (prefix `branchen22-`).
  - Investment year / status / region NOT directly exposed in the REST schema —
    they're rendered server-side and would need per-detail-page enrichment.

Why this represents KfW Capital deployment:
  KfW Capital is the federal LP layer; it commits to funds like HTGF (where KfW
  is a major LP alongside the federal government and corporate Fund-of-Funds
  partners) and Coparion. We track the deployment layer (HTGF → company) per
  Sprint 13 EIF/LP policy. The HTGF parent receives KfW Capital LP money;
  flagging `eif_lp_backed=0` because HTGF itself is German federal-funded, not
  EIF-backed at the parent level.

Schema mapping:
  source              = 'htgf_equity'  (single source; HTGF is one institution
                          covering multiple fund vintages internally)
  role                = 'direct'
  equity_amount_eur   = NULL (HTGF doesn't disclose tickets on portfolio listing)
  grant_amount_basis  = 'htgf_equity'
  deployment_country  = 'DE'
  eif_lp_backed       = 0

Run modes:
  python extract_htgf.py             → parse + CSV only
  python extract_htgf.py --load-db   → parse + match + load
  python extract_htgf.py --refresh   → re-download
"""
from __future__ import annotations

import csv
import html as html_mod
import json
import re
import sqlite3
import subprocess
import sys
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

from ndb_helpers import backfill_ipcei_linked

BASE_DIR = Path(__file__).parent.parent
RAW_DIR = BASE_DIR / "data" / "raw" / "htgf"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

API_BASE = "https://www.htgf.de/wp-json/wp/v2/portfolio?per_page=100&page={p}"
CSV_PATH = OUT_DIR / "htgf_portfolio.csv"
MATCH_CSV_PATH = OUT_DIR / "htgf_match_summary.csv"
DB_PATH = BASE_DIR / "db.sqlite"
DEPLOYMENT_COUNTRY = "DE"


# ---------------------------------------------------------------------------
# Sector classifier — `branchen22-*` taxonomy from WordPress class_list
# Manually curated from the 80 observed distinct branchen22-* tags.
# ---------------------------------------------------------------------------

# Map any branchen22-* tag suffix that contains the key to a v1 sector bucket.
# First-match wins; order from specific to generic.
BRANCH_MATCHERS: list[tuple[str, str]] = [
    # life sciences
    ("medtech", "life_sciences"), ("biotech", "life_sciences"),
    ("pharma", "life_sciences"), ("life-science", "life_sciences"),
    ("diagnostic", "life_sciences"), ("digital-health", "life_sciences"),
    ("health", "life_sciences"), ("therapeutic", "life_sciences"),
    # cleantech
    ("energy", "cleantech"), ("climate", "cleantech"),
    ("circular", "cleantech"), ("greentech", "cleantech"),
    ("agritech", "cleantech"), ("agriculture", "cleantech"),
    ("food", "cleantech"), ("mobility", "cleantech"),
    ("battery", "cleantech"), ("hydrogen", "cleantech"),
    ("water", "cleantech"), ("emission", "cleantech"),
    # space
    ("space", "space"), ("aerospace", "space"), ("satellite", "space"),
    # defense
    ("defense", "defense"), ("defence", "defense"), ("security", "defense"),
    # digital
    ("software", "digital"), ("saas", "digital"), ("platform", "digital"),
    ("data", "digital"), ("ai", "digital"), ("cyber", "digital"),
    ("fintech", "digital"), ("retail", "digital"), ("media", "digital"),
    ("insurtech", "digital"), ("legaltech", "digital"), ("edtech", "digital"),
    ("hr", "digital"), ("commerce", "digital"), ("digital", "digital"),
    # deeptech_hardware
    ("3d-printing", "deeptech_hardware"), ("surface", "deeptech_hardware"),
    ("material", "deeptech_hardware"), ("manufactur", "deeptech_hardware"),
    ("robotic", "deeptech_hardware"), ("automat", "deeptech_hardware"),
    ("photonic", "deeptech_hardware"), ("optic", "deeptech_hardware"),
    ("electronic", "deeptech_hardware"), ("semiconductor", "deeptech_hardware"),
    ("quantum", "deeptech_hardware"), ("chemistry", "deeptech_hardware"),
    ("industrial", "deeptech_hardware"), ("deeptech", "deeptech_hardware"),
    ("hardware", "deeptech_hardware"),
]


def _classify_sector(class_list: list[str]) -> str:
    """Map a WP class_list to a v1 sector. Default: deeptech_hardware (HTGF is
    Germany's deeptech VC by mandate, so the safest fallback is deeptech)."""
    branches = [c.removeprefix("branchen22-") for c in class_list if c.startswith("branchen22-")]
    branch_str = " ".join(branches).lower()
    for needle, sector in BRANCH_MATCHERS:
        if needle in branch_str:
            return sector
    return "deeptech_hardware"


# Sector hint for classify.py source-fallback
HTGF_SOURCE_SECTOR: dict[str, str] = {"htgf_equity": "deeptech_hardware"}


# ---------------------------------------------------------------------------
# Name normaliser
# ---------------------------------------------------------------------------

_NORM_LEGAL_RE = re.compile(
    r"\b(?:GmbH|gGmbH|mbH|AG|KG|UG|GesmbH|GmbH\s*&\s*Co\.?\s*KG|"
    r"BV|NV|SAS|SARL|SE|SA|"
    r"Ltd|Limited|PLC|LLC|LLP|Inc|Corp|Holding|Group)\b\.?",
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

def fetch_all(force: bool, max_pages: int = 20) -> None:
    for p in range(1, max_pages + 1):
        out = RAW_DIR / f"page_{p}.json"
        if out.exists() and not force and out.stat().st_size > 500:
            continue
        subprocess.run(
            ["/usr/bin/curl", "-sL", "-A", "Mozilla/5.0",
             "-H", "Accept: application/json",
             "-o", str(out), "--max-time", "30",
             API_BASE.format(p=p)],
            check=False,
        )
        if not out.exists() or out.stat().st_size < 200:
            break


def parse_all() -> list[dict]:
    """Read all pages, dedupe DE/EN duplicates by slug, prefer EN where present."""
    items: dict[str, dict] = {}
    files = sorted(RAW_DIR.glob("page_*.json"),
                   key=lambda f: int(f.stem.split("_")[1]))
    for f in files:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        if not isinstance(data, list):
            continue
        for it in data:
            slug = it.get("slug", "")
            lang = it.get("lang", "")
            if not slug:
                continue
            # Prefer English version where both exist
            if slug not in items or lang == "en":
                items[slug] = it

    rows: list[dict] = []
    for slug, it in items.items():
        name = html_mod.unescape(it.get("title", {}).get("rendered", "").strip())
        if not name:
            continue
        class_list = it.get("class_list", [])
        sector_v1 = _classify_sector(class_list)
        branches = [c.removeprefix("branchen22-") for c in class_list if c.startswith("branchen22-")]
        rows.append({
            "slug": slug,
            "raw_name": name,
            "sector_tags_raw": ", ".join(branches),
            "sector_v1": sector_v1,
            "doc_url": it.get("link", f"https://www.htgf.de/en/portfolio/htgffamily/{slug}/"),
            "wp_id": it.get("id"),
            "lang": it.get("lang", ""),
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
    country = DEPLOYMENT_COUNTRY  # HTGF funds German companies by mandate

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
                   VALUES (?, ?, ?, 'company', ?, 'unmatched', 'none')""",
                (raw_name, raw_name, country, r["sector_v1"]),
            )
            cid = cur.lastrowid
            matched_canonical = raw_name
            existing[(norm, country)] = (cid, raw_name)
            existing_list.append((norm, country, cid, raw_name))

        call_id = f"htgf_equity_{r['slug']}"
        enriched.append({**r, "company_id": cid, "source": "htgf_equity", "call_id": call_id})
        summary.append({
            "source": "htgf_equity", "call_id": call_id, "published_name": raw_name,
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
                sector_tags_raw, raw_source_url, coordinator_only,
                grant_amount_basis, deployment_country, eif_lp_backed)
               VALUES (?, ?, 'direct', ?, ?, ?, ?, 1, 'htgf_equity', ?, 0)""",
            (r["company_id"], r["source"], r["call_id"], r["raw_name"],
             r["sector_tags_raw"], r["doc_url"], DEPLOYMENT_COUNTRY),
        )
        inserted += 1
    conn.commit()
    if skipped:
        print(f"  Skipped {skipped} duplicate (source, call_id) pairs")
    return inserted


CSV_FIELDNAMES = ["source", "call_id", "slug", "raw_name", "sector_tags_raw",
                  "sector_v1", "doc_url", "wp_id", "lang"]


def main() -> None:
    args = set(sys.argv[1:])
    load_db = "--load-db" in args
    refresh = "--refresh" in args

    print("Fetching HTGF portfolio via WP REST API ...")
    fetch_all(force=refresh)
    rows = parse_all()
    for r in rows:
        r["source"] = "htgf_equity"
        r["call_id"] = f"htgf_equity_{r['slug']}"

    print(f"Parsed {len(rows)} unique HTGF portfolio companies")
    sectors = defaultdict(int)
    for r in rows:
        sectors[r["sector_v1"]] += 1
    print("By sector:")
    for s, n in sorted(sectors.items(), key=lambda x: -x[1]):
        print(f"  {s:<25}  {n:>4}")

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
        print(f"  {m:<20}  {n:>4}")

    inserted = load_events(enriched, conn)
    flagged = backfill_ipcei_linked(conn=conn, source_prefixes=("htgf_",))
    print(f"Inserted {inserted} events; flagged {flagged} as ipcei_linked")
    conn.close()
    print("next: run python3 classify.py")


if __name__ == "__main__":
    main()
