"""Extract Enterprise Ireland presence (Sprint 13 Workstream F — placeholder mode).

**Status: scaffolded at PROGRAM level only.**

Background: EI's press-room and HPSU client list are JavaScript-rendered.
`data.gov.ie` has 118 EI-related datasets but no per-beneficiary list.
EU State Aid TAM holds EI grants > €100k (mandated) but is gated by EU Login.

This extractor loads EI's four primary funding programmes as program-level
placeholder rows so EI has institutional presence in the corpus. Each row
represents ONE PROGRAMME, not one company. Loaded with `entity_type='other'`.

To populate at company-level (future session):
  - Manual: EI publishes annual reports listing HPSU clients; download the
    most recent PDF and parse beneficiaries (IF fiche pattern).
  - Programmatic: EU Login → TAM API for grants > €100k.
  - data.gov.ie: Science Foundation Ireland grant data IS available there but
    not EI specifically; complement of these is the policy gap.

Schema mapping:
  source              = 'enterprise_ireland_<programme>'
  role                = 'direct'
  equity_amount_eur   = NULL
  grant_amount_basis  = 'enterprise_ireland_equity' (HPSU is mixed equity+grant)
                        or 'enterprise_ireland_grant' (the R&D programmes)
  deployment_country  = 'IE'
  eif_lp_backed       = 0
  entity_type         = 'other'
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
CSV_PATH = OUT_DIR / "enterprise_ireland_programmes.csv"
DB_PATH = _ETL_DB
DEPLOYMENT_COUNTRY = "IE"

# Enterprise Ireland's primary equity + grant programmes (2021-2026 era).
EI_PROGRAMMES: list[tuple[str, str, str, str]] = [
    # (slug, label, basis, sector_v1)
    ("hpsu",                    "High Potential Start-Up (HPSU) Fund",
                                "enterprise_ireland_equity", "deeptech_hardware"),
    ("seed-and-venture-capital", "Seed & Venture Capital Scheme",
                                "enterprise_ireland_equity", "other"),
    ("innovation-partnership",  "Innovation Partnership Programme",
                                "enterprise_ireland_grant", "deeptech_hardware"),
    ("rd-fund",                 "R&D Fund",
                                "enterprise_ireland_grant", "deeptech_hardware"),
    ("commercialisation-fund",  "Commercialisation Fund",
                                "enterprise_ireland_grant", "deeptech_hardware"),
    ("disruptive-technologies", "Disruptive Technologies Innovation Fund (DTIF)",
                                "enterprise_ireland_grant", "deeptech_hardware"),
]

EI_SOURCE_SECTOR: dict[str, str] = {
    "enterprise_ireland_hpsu": "deeptech_hardware",
    "enterprise_ireland_seed": "other",
    "enterprise_ireland_ip":   "deeptech_hardware",
    "enterprise_ireland_rd":   "deeptech_hardware",
    "enterprise_ireland_cf":   "deeptech_hardware",
    "enterprise_ireland_dtif": "deeptech_hardware",
}


def main() -> None:
    args = set(sys.argv[1:])
    load_db = "--load-db" in args

    short_codes = {
        "hpsu": "hpsu", "seed-and-venture-capital": "seed",
        "innovation-partnership": "ip", "rd-fund": "rd",
        "commercialisation-fund": "cf", "disruptive-technologies": "dtif",
    }

    rows = []
    for slug, label, basis, sector_v1 in EI_PROGRAMMES:
        src = f"enterprise_ireland_{short_codes[slug]}"
        rows.append({
            "source": src,
            "call_id": f"{src}_programme",
            "slug": slug,
            "programme_name": label,
            "grant_amount_basis": basis,
            "sector_v1": sector_v1,
            "doc_url": f"https://www.enterprise-ireland.com/en/supports/{slug}",
        })

    print(f"Parsed {len(rows)} Enterprise Ireland programmes (program-level placeholders)")
    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["source", "call_id", "slug",
                                          "programme_name", "grant_amount_basis",
                                          "sector_v1", "doc_url"])
        w.writeheader()
        w.writerows(rows)
    print(f"CSV → {CSV_PATH}")
    print("NOTE: Company-level EI portfolio resolution requires EI annual-report")
    print("  PDF parse or TAM (EU Login). See scripts/extract_enterprise_ireland.py docstring.")

    if not load_db:
        return

    with connect() as conn:
        cur = conn.cursor()
        inserted = 0
        for r in rows:
            # Idempotent company lookup — reuse existing placeholder row if present
            existing = cur.execute(
                "SELECT id FROM companies WHERE canonical_name = %s AND country = 'IE' ORDER BY id",
                (r["programme_name"],),
            ).fetchone()
            if existing:
                cid = existing[0]
            else:
                cur.execute(
                    """INSERT INTO companies (canonical_name, raw_name, country, entity_type,
                                               sector_inferred, match_confidence, match_method)
                       VALUES (%s, %s, 'IE', 'other', %s, 'unmatched', 'none') RETURNING id""",
                    (r["programme_name"], r["programme_name"], r["sector_v1"]),
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
                   VALUES (%s, %s, 'direct', %s, %s, %s, %s, 1, %s, 'IE', 0)""",
                (cid, r["source"], r["call_id"], r["programme_name"],
                 "Enterprise Ireland", r["doc_url"], r["grant_amount_basis"]),
            )
            inserted += 1
        conn.commit()
        flagged = backfill_ipcei_linked(conn=conn, source_prefixes=("enterprise_ireland_",))
        print(f"Inserted {inserted} programme-level events; flagged {flagged} as ipcei_linked")


if __name__ == "__main__":
    main()
