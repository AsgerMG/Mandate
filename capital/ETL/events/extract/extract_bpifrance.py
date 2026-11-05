"""Extract Bpifrance presence (Sprint 13 Workstream A — placeholder mode).

**Status: scaffolded at FUND-VEHICLE level only.**

Background: `bpifrance.fr` is behind Cloudflare (403 to curl), `bpifrance.com`
has no portfolio. Le Hub sub-pages 403 via CloudFront. The EU State Aid
Transparency Award Module (TAM) at `webgate.ec.europa.eu/competition/transparency`
holds Bpifrance grant-style state aid by law but its public form requires
interactive JS use; its API requires EU Login.

This extractor loads the 11 named Bpifrance investment funds (discovered from
`lehub.bpifrance.fr/fonds-et-participations/`) as fund-vehicle program-level
rows so Bpifrance has institutional presence in the corpus. Each row represents
ONE FUND, not one company. They are loaded with `entity_type='other'`.

To populate at company-level (future session, biggest single unlock):
  - Manual: ask Bpifrance for portfolio data export (Cour des Comptes audit
    confirmed they hold beneficiary registers).
  - Programmatic: EU Login → TAM API (`webgate.ec.europa.eu/competition/transparency/api`).
    France 2030 / i-Nov / Plan Deeptech grants > €100k all required to be published.
  - Scraping: Playwright with `playwright-stealth` against `bpifrance.fr` to step
    through Cloudflare. Fragile.

Schema mapping:
  source              = 'bpifrance_fond'  (single source, fund vehicles)
  role                = 'direct'
  equity_amount_eur   = NULL
  grant_amount_basis  = 'bpifrance_fond'
  deployment_country  = 'FR'
  eif_lp_backed       = 0 (Bpifrance is sovereign-funded at parent level)
  entity_type         = 'other' (fund vehicle, not a company)
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
import sys
from pathlib import Path

from ndb_helpers import backfill_ipcei_linked

BASE_DIR = _ETL_ROOT
OUT_DIR = BASE_DIR / "data" / "processed"
OUT_DIR.mkdir(parents=True, exist_ok=True)
CSV_PATH = OUT_DIR / "bpifrance_fonds.csv"
DB_PATH = _ETL_DB
DEPLOYMENT_COUNTRY = "FR"

# 11 Bpifrance fund vehicles discovered from lehub.bpifrance.fr/fonds-et-participations/
# Order preserved from the Le Hub listing.
BPI_FONDS: list[tuple[str, str, str]] = [
    # (slug, label, sector_v1)
    ("bpifrance-amorcage-industriel",        "Bpifrance Amorçage Industriel",      "deeptech_hardware"),
    ("bpifrance-deeptech-venture",           "Bpifrance Deeptech Venture",         "deeptech_hardware"),
    ("bpifrance-digital-venture",            "Bpifrance Digital Venture",          "digital"),
    ("bpifrance-french-tech-acceleration",   "Bpifrance French Tech Acceleration", "digital"),
    ("bpifrance-green-venture",              "Bpifrance Green Venture",            "cleantech"),
    ("bpifrance-innobio-lifesciences-venture","Bpifrance Innobio LifeSciences Venture", "life_sciences"),
    ("bpifrance-large-venture",              "Bpifrance Large Venture",            "other"),
    ("french-touch-capital",                 "French Touch Capital",               "digital"),
    ("nouveau-fond-2",                       "Bpifrance Nouveau Fonds",            "other"),
    ("societe-de-projets-industriels",       "Société de Projets Industriels",     "deeptech_hardware"),
]

BPIFRANCE_SOURCE_SECTOR: dict[str, str] = {"bpifrance_fond": "other"}


def main() -> None:
    args = set(sys.argv[1:])
    load_db = "--load-db" in args

    rows = []
    for slug, label, sector_v1 in BPI_FONDS:
        rows.append({
            "source": "bpifrance_fond",
            "call_id": f"bpifrance_fond_{slug}",
            "slug": slug,
            "fund_name": label,
            "sector_v1": sector_v1,
            "doc_url": f"https://lehub.bpifrance.fr/fonds-et-participations/{slug}/",
        })

    print(f"Parsed {len(rows)} Bpifrance fund vehicles (program-level placeholders)")
    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["source", "call_id", "slug", "fund_name",
                                          "sector_v1", "doc_url"])
        w.writeheader()
        w.writerows(rows)
    print(f"CSV → {CSV_PATH}")
    print("NOTE: Company-level Bpifrance portfolio resolution requires EU Login")
    print("  (TAM) or Playwright stealth against bpifrance.fr (Cloudflare-blocked).")
    print("  See scripts/extract_bpifrance.py docstring.")

    if not load_db:
        return

    with connect() as conn:
        cur = conn.cursor()
        inserted = 0
        for r in rows:
            # Idempotent company lookup — reuse existing placeholder row if present
            existing = cur.execute(
                "SELECT id FROM companies WHERE canonical_name = %s AND country = 'FR' ORDER BY id",
                (r["fund_name"],),
            ).fetchone()
            if existing:
                cid = existing[0]
            else:
                cur.execute(
                    """INSERT INTO companies (canonical_name, raw_name, country, entity_type,
                                               sector_inferred, match_confidence, match_method)
                       VALUES (%s, %s, 'FR', 'other', %s, 'unmatched', 'none') RETURNING id""",
                    (r["fund_name"], r["fund_name"], r["sector_v1"]),
                )
                cid = cur.fetchone()[0]
            cur.execute(
                "SELECT 1 FROM public_funding_events WHERE source=%s AND call_id=%s",
                (r["source"], r["call_id"]),
            )
            if cur.fetchone():
                continue
            cur.execute(
                """INSERT INTO public_funding_events
                   (company_id, source, role, call_id, project_title,
                    sector_tags_raw, raw_source_url, coordinator_only,
                    grant_amount_basis, deployment_country, eif_lp_backed)
                   VALUES (%s, %s, 'direct', %s, %s, %s, %s, 1, 'bpifrance_fond', 'FR', 0)""",
                (cid, r["source"], r["call_id"], r["fund_name"],
                 "Fonds Bpifrance", r["doc_url"]),
            )
            inserted += 1
        conn.commit()
        flagged = backfill_ipcei_linked(conn=conn, source_prefixes=("bpifrance_",))
        print(f"Inserted {inserted} fund-vehicle events; flagged {flagged} as ipcei_linked")


if __name__ == "__main__":
    main()
