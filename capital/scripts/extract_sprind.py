"""Extract SPRIND (Bundesagentur für Sprunginnovationen) funded projects.

**Status: scaffold — discovery revealed the listing page doesn't map to companies.**

Source: https://www.sprind.org/taten/challenges
  - 20 challenges visible 2026-05-26 (antiviral, biomanufacturing, carbon-to-value,
    composite-learning, continuous-hormone-monitoring, energystorage,
    eudi-wallet-prototypes, funke-* series, newcomputing, next-frontier-ai,
    orbital-bioworks, tech-metal).
  - Each challenge page lists *team codenames* ("CRISPR/CAS13", "iGUARD platform",
    "Virustrap", "MucBoost") — these are project names, not legal entities. No
    "Mehr erfahren" links to team detail pages with company info.

To resolve team → legal entity, future sessions can use:
  1. Bundesanzeiger.de — German Federal Gazette publishes SPRIND grant decisions.
  2. SPRIND annual report PDFs (latest 2024).
  3. Per-team press releases mentioning the spinout / Gmbh.

For now: this scaffold extracts the 20 challenges as program-level placeholder
records. They demonstrate SPRIND's presence in the dataset but DO NOT count as
company-level events. Each "company" row has entity_type='other'.

Schema mapping:
  source              = 'sprind_challenge'
  role                = 'direct'
  grant_amount_basis  = 'sprind_grant'
  deployment_country  = 'DE'
  eif_lp_backed       = 0
  entity_type         = 'other' (program placeholder, not a legal entity)
"""
from __future__ import annotations

import csv
import re
import sqlite3
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

from ndb_helpers import backfill_ipcei_linked

BASE_DIR = Path(__file__).parent.parent
RAW_DIR = BASE_DIR / "data" / "raw" / "sprind"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

LISTING_URL = "https://www.sprind.org/taten/challenges"
LISTING_HTML = RAW_DIR / "challenges_listing.html"
CSV_PATH = OUT_DIR / "sprind_challenges.csv"
DB_PATH = BASE_DIR / "db.sqlite"
DEPLOYMENT_COUNTRY = "DE"

SPRIND_SOURCE_SECTOR: dict[str, str] = {"sprind_challenge": "deeptech_hardware"}


def fetch_listing(force: bool) -> str:
    if LISTING_HTML.exists() and not force:
        return LISTING_HTML.read_text(encoding="utf-8")
    subprocess.run(
        ["curl", "-sL", "-A", "Mozilla/5.0", "-o", str(LISTING_HTML), LISTING_URL],
        check=False, timeout=20,
    )
    if not LISTING_HTML.exists() or LISTING_HTML.stat().st_size < 5000:
        raise RuntimeError(f"SPRIND fetch failed: {LISTING_HTML}")
    return LISTING_HTML.read_text(encoding="utf-8")


def parse_challenges(html: str) -> list[dict]:
    paths = sorted(set(re.findall(r'href="(/taten/challenges/[^"#?]+)"', html)))
    paths = [p for p in paths if p != "/taten/challenges" and "artikel" not in p]
    rows = []
    for path in paths:
        slug = path.rsplit("/", 1)[-1]
        rows.append({
            "slug": slug,
            "name": f"SPRIND Challenge — {slug}",
            "doc_url": f"https://www.sprind.org{path}",
        })
    return rows


def main() -> None:
    args = set(sys.argv[1:])
    load_db = "--load-db" in args
    refresh = "--refresh" in args

    print(f"Fetching {LISTING_URL} ...")
    html = fetch_listing(force=refresh)
    rows = parse_challenges(html)
    print(f"Parsed {len(rows)} SPRIND challenges (program-level placeholders)")

    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["slug", "name", "doc_url"])
        w.writeheader()
        w.writerows(rows)
    print(f"CSV → {CSV_PATH}")
    print("NOTE: team-to-legal-entity mapping requires Bundesanzeiger or annual report")
    print("  (see scripts/extract_sprind.py docstring). These rows are placeholders.")

    if not load_db:
        return

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    inserted = 0
    for r in rows:
        # Idempotent company lookup — reuse existing placeholder row if present
        existing = cur.execute(
            "SELECT id FROM companies WHERE canonical_name = ? AND country = 'DE'",
            (r["name"],),
        ).fetchone()
        if existing:
            cid = existing[0]
        else:
            cur.execute(
                """INSERT INTO companies (canonical_name, raw_name, country, entity_type,
                                           sector_inferred, match_confidence, match_method)
                   VALUES (?, ?, 'DE', 'other', 'deeptech_hardware', 'unmatched', 'none')""",
                (r["name"], r["name"]),
            )
            cid = cur.lastrowid
        call_id = f"sprind_challenge_{r['slug']}"
        cur.execute(
            "SELECT 1 FROM public_funding_events WHERE source=? AND call_id=?",
            ("sprind_challenge", call_id),
        )
        if cur.fetchone():
            continue
        cur.execute(
            """INSERT INTO public_funding_events
               (company_id, source, role, call_id, project_title,
                raw_source_url, coordinator_only, grant_amount_basis,
                deployment_country, eif_lp_backed)
               VALUES (?, 'sprind_challenge', 'direct', ?, ?, ?, 1, 'sprind_grant', 'DE', 0)""",
            (cid, call_id, r["name"], r["doc_url"]),
        )
        inserted += 1
    conn.commit()
    flagged = backfill_ipcei_linked(conn=conn, source_prefixes=("sprind_",))
    print(f"Inserted {inserted} placeholder events; flagged {flagged} as ipcei_linked")
    conn.close()


if __name__ == "__main__":
    main()
