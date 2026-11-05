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

import argparse
import csv
import html as htmllib
import re
import sys
import time
from pathlib import Path

pass  # sys.path handled by etl_env bootstrap
from ndb_ssl import fetch_text  # noqa: E402
from europe_scope import COUNTRY_NAME_TO_ISO2, name_to_iso2, canonicalise_country  # noqa: E402
from matching import CompanyMatcher, normalize_name  # noqa: E402

RAW_DIR = _ETL_ROOT / "data" / "raw" / "eic_fund"
PROCESSED_DIR = _ETL_ROOT / "data" / "processed"
DB_PATH = _ETL_DB

BASE = "https://eic.ec.europa.eu/eic-fund/eic-fund-invested-companies_en"
MAX_PAGES = 40  # safety cap; probe showed ~15

# Moved to ETL/lib/europe_scope.py. Eight modules each carried a version of
# this map in a different casing, so a case-sensitive lookup silently failed
# depending on which copy a feed hit, and an unresolvable name writes a NULL
# country rather than raising. The canonical map is casefolded and is the
# union of every alias any source needed (72 names, incl. native forms).
COUNTRY_ISO = COUNTRY_NAME_TO_ISO2

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
            country_iso = name_to_iso2(htmllib.unescape(country)) or ""
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
    with connect() as con:
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
                       VALUES (%s, %s, %s, 'company', 'eic_fund', 'medium') RETURNING id""",
                    (norm, r["company_name"], country),
                )
                cid = cur.fetchone()[0]
                matcher.register(cid, r["company_name"])
                counts["new"] += 1
            else:
                counts["matched"] += 1

            cur.execute("SELECT 1 FROM public_funding_events WHERE source=%s AND call_id=%s",
                        ("eic_fund", r["call_id"]))
            if cur.fetchone():
                counts["skipped_dup"] += 1
                continue
            cur.execute(
                """INSERT INTO public_funding_events
                   (company_id, source, call_id, role, project_summary,
                    equity_amount_eur, sector_tags_raw, grant_amount_basis,
                    raw_source_url)
                   VALUES (%s, 'eic_fund', %s, 'portfolio_company', %s, NULL, %s,
                           'eic_fund_equity_unpublished', %s)""",
                (cid, r["call_id"], r["description"], r["sector_label"],
                 r["detail_url"]),
            )
            counts["inserted_events"] += 1

        con.commit()
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
        print("Reminder: python3 ETL/events/transform/classify_taxonomy.py apply-nace && python3 ETL/events/transform/classify_taxonomy.py run")


if __name__ == "__main__":
    main()
