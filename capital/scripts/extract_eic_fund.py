"""EIC Fund portfolio extractor — the EU's direct equity arm.

Source (probed 2026-06-11): https://eic.ec.europa.eu/eic-fund/eic-fund-invested-companies_en
Server-rendered Drupal/ECL, ~20 cards/page, ?page=0..N. Per card: company name
+ detail slug, Country, Sector, one-line description. The EIC Fund does NOT
publish per-company ticket sizes (verified on detail pages), so
equity_amount_eur stays NULL and grant_amount_basis='eic_fund_equity_unpublished'
is the queryable marker for "equity position exists, size undisclosed"
(precedent: eit_kic_equity).

Most portfolio companies are EIC Accelerator blended-finance winners already in
the DB — expect a high match rate via lib/matching.

Usage:
  python3 extract_eic_fund.py             → fetch + CSV only
  python3 extract_eic_fund.py --load-db   → fetch + match + load
"""

from __future__ import annotations

import argparse
import csv
import html as htmllib
import re
import sqlite3
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from ndb_ssl import fetch_text  # noqa: E402
from europe_scope import canonicalise_country  # noqa: E402
from lib.matching import CompanyMatcher, normalize_name  # noqa: E402

RAW_DIR = Path(__file__).parent.parent / "data" / "raw" / "eic_fund"
PROCESSED_DIR = Path(__file__).parent.parent / "data" / "processed"
DB_PATH = Path(__file__).parent.parent / "db.sqlite"

BASE = "https://eic.ec.europa.eu/eic-fund/eic-fund-invested-companies_en"
MAX_PAGES = 40  # safety cap; probe showed ~15

COUNTRY_ISO = {
    "austria": "AT", "belgium": "BE", "bulgaria": "BG", "croatia": "HR",
    "cyprus": "CY", "czechia": "CZ", "czech republic": "CZ", "denmark": "DK",
    "estonia": "EE", "finland": "FI", "france": "FR", "germany": "DE",
    "greece": "GR", "hungary": "HU", "iceland": "IS", "ireland": "IE",
    "italy": "IT", "latvia": "LV", "lithuania": "LT", "luxembourg": "LU",
    "malta": "MT", "netherlands": "NL", "the netherlands": "NL", "norway": "NO",
    "poland": "PL", "portugal": "PT", "romania": "RO", "slovakia": "SK",
    "slovenia": "SI", "spain": "ES", "sweden": "SE", "switzerland": "CH",
    "united kingdom": "GB", "ukraine": "UA", "serbia": "RS", "israel": "IL",
    "turkey": "TR", "türkiye": "TR", "moldova": "MD",
}

# Final-fallback sector for classify.py. Portfolio sector labels reuse the EIC
# Data Hub vocabulary, so the tag classifier resolves most rows; description
# keywords catch more; this stops the zero-unclassified gate on the remainder.
EIC_FUND_SOURCE_SECTOR: dict[str, str] = {"eic_fund": "other"}

CARD_RE = re.compile(
    r'ecl-content-block__title[^>]*><a\s+href="(/eic-fund/eic-fund-portfolio/[^"]+)"[^>]*>\s*([^<]+)</a>'
    r'.*?ecl-content-block__description[^>]*><p>(.*?)</p>'
    r'.*?ecl-description-list__term[^>]*>Country</dt>.*?ecl-description-list__definition-item[^>]*>([^<]+)'
    r'.*?ecl-description-list__term[^>]*>Sector</dt>.*?ecl-description-list__definition-item[^>]*>([^<]+)',
    re.S,
)


def fetch_rows() -> list[dict]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    rows: list[dict] = []
    seen_slugs: set[str] = set()
    for page in range(MAX_PAGES):
        cache = RAW_DIR / f"page_{page:02d}.html"
        if cache.exists():
            html = cache.read_text()
        else:
            html = fetch_text(f"{BASE}?page={page}", timeout=40) or ""
            if html:
                cache.write_text(html)
            time.sleep(0.3)
        cards = CARD_RE.findall(html)
        if not cards:
            print(f"  page {page}: no cards — stopping")
            break
        new = 0
        for href, name, desc, country, sector in cards:
            slug = href.rstrip("_en").split("/")[-1]
            if slug in seen_slugs:
                continue
            seen_slugs.add(slug)
            new += 1
            country_iso = COUNTRY_ISO.get(
                htmllib.unescape(country).strip().lower(), "")
            rows.append({
                "source": "eic_fund",
                "call_id": f"eic_fund_{slug}",
                "company_name": htmllib.unescape(name).strip(),
                "country": country_iso,
                "country_raw": htmllib.unescape(country).strip(),
                "sector_label": htmllib.unescape(sector).strip(),
                "description": htmllib.unescape(re.sub(r"<[^>]+>", " ", desc)).strip()[:1000],
                "detail_url": f"https://eic.ec.europa.eu{href}",
            })
        print(f"  page {page}: {len(cards)} cards, {new} new (total {len(rows)})")
        if new == 0:
            break
    return rows


def load_db(rows: list[dict]) -> None:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    matcher = CompanyMatcher(con)  # cross-country: portfolio spans the scope

    counts = {"matched": 0, "new": 0, "out_of_scope": 0,
              "skipped_dup": 0, "inserted_events": 0}
    methods: dict[str, int] = {}

    for r in rows:
        country = canonicalise_country(r["country"]) if r["country"] else None
        if r["country"] and country is None:
            counts["out_of_scope"] += 1
            continue

        cid, method = matcher.match(r["company_name"])
        methods[method] = methods.get(method, 0) + 1
        if cid is None:
            norm = normalize_name(r["company_name"])
            cur.execute(
                """INSERT INTO companies (canonical_name, raw_name, country,
                   entity_type, match_method, match_confidence)
                   VALUES (?, ?, ?, 'company', 'eic_fund', 'medium')""",
                (norm, r["company_name"], country),
            )
            cid = cur.lastrowid
            matcher.register(cid, r["company_name"])
            counts["new"] += 1
        else:
            counts["matched"] += 1

        cur.execute("SELECT 1 FROM public_funding_events WHERE source=? AND call_id=?",
                    ("eic_fund", r["call_id"]))
        if cur.fetchone():
            counts["skipped_dup"] += 1
            continue
        cur.execute(
            """INSERT INTO public_funding_events
               (company_id, source, call_id, role, project_summary,
                equity_amount_eur, sector_tags_raw, grant_amount_basis,
                raw_source_url)
               VALUES (?, 'eic_fund', ?, 'portfolio_company', ?, NULL, ?,
                       'eic_fund_equity_unpublished', ?)""",
            (cid, r["call_id"], r["description"], r["sector_label"],
             r["detail_url"]),
        )
        counts["inserted_events"] += 1

    con.commit()
    con.close()
    print(f"Match/load: {counts}")
    print(f"Match methods: {methods}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--load-db", action="store_true")
    args = parser.parse_args()

    rows = fetch_rows()
    if not rows:
        sys.exit("No rows extracted — check CARD_RE against the live page")

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    out_csv = PROCESSED_DIR / "eic_fund_portfolio.csv"
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} portfolio companies → {out_csv}")

    from collections import Counter
    print("By country:", dict(Counter(r['country_raw'] for r in rows).most_common(8)))
    print("Sector labels:", dict(Counter(r['sector_label'] for r in rows).most_common(8)))

    if args.load_db:
        load_db(rows)
        print("Reminder: python3 scripts/classify.py")


if __name__ == "__main__":
    main()
