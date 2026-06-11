"""Generate per-country coverage-completeness indicator for EuroInvTracker.

PURPOSE: prevent per-capita analysis from reading coverage gaps as spending
gaps. The IS/EE/LU per-capita "lead" from Sprint 9 is a known coverage-artifact
risk: small countries with rich direct-register coverage look inflated relative
to large countries that are SATR-only.

OUTPUT: data/processed/coverage_indicator.json
  {
    "generated": "ISO-8601 timestamp",
    "countries": {
      "DE": {
        "source_families": ["satr", "htgf", "coparion", ...],
        "event_count": 30000,
        "coverage_tier": "A",  // A=rich, B=moderate, C=thin, D=SATR-only
        "notes": "BMBF Projektträger grants structurally absent"
      }, ...
    }
  }

Coverage tiers:
  A = SATR + ≥1 direct national register + ≥1 EU instrument
  B = SATR + ≥1 direct national register OR ≥2 EU instruments
  C = SATR + EU instruments only (no direct national register)
  D = SATR only (no EU instruments, no direct national register)
  X = Not in SATR and no direct register (no coverage)

Run: python gen_coverage_indicator.py
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
DB_PATH = BASE_DIR / "db.sqlite"
OUT_PATH = BASE_DIR / "data" / "processed" / "coverage_indicator.json"
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

# Source families by type
EU_INSTRUMENT_PREFIXES = (
    "horizon_", "eic_", "eit_", "ipcei_", "edf_", "innovation_fund_",
    "chips_ju_", "chp_", "ihi_", "eurohpc_", "eib_", "erc_poc_",
    "horizon_eu_miss_", "horizon_eu_eie_", "horizon_eu_cbe_",
    # Sprint 18 JU batch
    "clean_aviation_", "sns_ju_", "sesar_ju_", "europes_rail_",
    "euspa_", "gh_edctp3_",
)

SATR_PREFIX = "satr_"

DIRECT_NDB_PREFIXES = (
    "htgf_", "coparion_", "sprind_", "cdti_", "almi_", "cdp_vc_", "tesi_",
    "invest_nl_", "bpifrance_", "enterprise_ireland_", "eifo_", "ademe_",
    "innovationsfonden_", "fr_relance_", "fr_region_",
    # Sprint 17
    "innovasjon_norge_", "nfr_", "innosuisse_", "altum_", "ilte_", "eis_",
    "tacr_", "bdns_", "vinnova_", "business_finland_",
    "sudop_",
    "innovate_uk_",
)

# Known structural gaps per country (for notes field)
STRUCTURAL_GAPS: dict[str, str] = {
    "DE": "Full SATR state aid (€72.7B) + HTGF/Coparion/SPRIND direct + KfW/Landesbanks/BMBF tagged. BMBF Projektträger sub-threshold grants remain off-register.",
    "FR": "ADEME (27.7k events) + Bpifrance i-Nov/PM'up + full SATR. Bpifrance commercial equity tickets not in any register (Art.107 market-conform).",
    "IT": "Full SATR (€29.9B) incl. MedioCredito Centrale, Invitalia, GSE, MUR; CDP VC direct. RNA de minimis layer (below €100k) not extracted.",
    "FI": "SATR incl. Business Finland + Tesi direct. Finnvera loan/guarantee portfolio has no public company register.",
    "SE": "SATR incl. Vinnova + Almi Invest direct. Energimyndigheten/Naturvårdsverket tagged.",
    "PL": "SUDOP national register loaded via v1 purpose-code query (R&D Art.25-29): 2,931 events / €4.2B. NCBR + mapadotacji.gov.pl (EU cohesion) out of scope.",
    "NL": "Full SATR incl. RVO + regional dev agencies (BOM, NOM) tagged. Invest-NL co-invest thin; RVO sub-threshold WBSO not in register.",
    "ES": "BDNS national state-aid register loaded via infosubvenciones.es mirror (GBER Art.21-30+36-49, ≥€100k): 13.2k events / €6.9B + CDTI/IDAE/ICAEN/IVACE/GAIN/ACCIÓ direct.",
    "NO": "Innovasjon Norge direct register (14.4k events, grants+loans) + NFR company-led projects (2.1k) + EU instruments. No SATR (non-EU).",
    "GB": "Innovate UK via UKRI GtR (17k participant rows, €5.9B, 2021+). No SATR (post-Brexit); UK subsidy database not yet loaded; EU layer thin 2021-2023 (Horizon exclusion).",
    "CH": "Innosuisse company-led projects via ARAMIS export (1.8k events) + EU instruments. No SATR (non-EU).",
    "LV": "SATR + ALTUM recipients workbook (3.9k events: loans/guarantees/equity, agri sheets excluded). EU-instrument layer thin.",
    "LT": "SATR + economy-ministry/ILTE tagged. No machine-readable ILTE direct register (data.gov.lt datasets are COVID/energy compensation, SATR-overlapping).",
    "EE": "SATR + EIS funded-projects register (3.7k company events net of SATR overlap). EU-instrument layer thin.",
    "CZ": "Full SATR + TAČR via STARFOS export (547 net-new company-led events after SATR dedup; 514 collisions skipped).",
    "RO": "EU instruments only. REGAS national SATR portal not yet extracted.",
    "SI": "EU instruments only. gov.si national state-aid page (no bulk export) not yet extracted.",
    "HU": "Full SATR + NKFIH/Hiventures tagged. MFB has no open company register.",
    "GR": "SATR + HDB/GSRT tagged. HDBI fund-of-funds (indirect) out of scope.",
    "IS": "Thin SATR (EEA). Rannís grant list not extracted.",
    "LU": "Thin SATR; per-capita figures may be inflated by holding-company registrations.",
}


def _classify_sources(sources: set[str]) -> tuple[str, list[str]]:
    """Return (coverage_tier, [source_family_labels])."""
    families = set()
    has_satr = False
    has_eu = False
    has_direct_ndb = False

    for src in sources:
        if src.startswith(SATR_PREFIX):
            has_satr = True
            families.add("satr")
        elif any(src.startswith(p) for p in EU_INSTRUMENT_PREFIXES):
            has_eu = True
            fam = next((p.rstrip("_") for p in EU_INSTRUMENT_PREFIXES if src.startswith(p)), src)
            families.add(fam)
        elif any(src.startswith(p) for p in DIRECT_NDB_PREFIXES):
            has_direct_ndb = True
            fam = next((p.rstrip("_") for p in DIRECT_NDB_PREFIXES if src.startswith(p)), src)
            families.add(fam)

    if has_satr and has_direct_ndb and has_eu:
        tier = "A"
    elif has_satr and (has_direct_ndb or has_eu):
        tier = "B"
    elif has_satr:
        tier = "C"
    elif has_direct_ndb or has_eu:
        tier = "B"  # no SATR but some direct coverage
    else:
        tier = "D"

    return tier, sorted(families)


# State-aid-register prefixes (SATR + national equivalents — all count as the
# "primary public-capital register" layer for the tier test).
STATE_AID_PREFIXES = ("satr_", "sudop_", "bdns_", "regas_", "gov_si_")


def _refined_tier(reg_events: int, eu_events: int, ndb_events: int) -> str:
    """Count-based tier. A = a primary register (SATR or national equivalent
    e.g. BDNS/SUDOP, OR a substantial direct-NDB layer) AND EU instruments AND
    an NDB layer (direct + tagged-in-register). Mirrors the manual status table."""
    has_register = reg_events >= 500
    has_eu = eu_events >= 500
    has_ndb = ndb_events >= 250
    if has_register and has_eu and has_ndb:
        return "A"
    if has_register and has_eu:
        return "B"
    if has_eu and has_ndb:
        return "B"
    if has_register and has_ndb:
        return "B"  # small countries rarely reach 500 EU events
    if has_eu or has_register:
        return "C"
    return "X"


def main() -> None:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    # Get all sources per country from companies + events join
    cur.execute("""
        SELECT c.country, pfe.source, COUNT(*) as n
        FROM public_funding_events pfe
        JOIN companies c ON c.id = pfe.company_id
        WHERE c.country IS NOT NULL AND c.country != ''
        GROUP BY c.country, pfe.source
    """)
    rows = cur.fetchall()

    from collections import defaultdict
    country_sources: dict[str, set[str]] = defaultdict(set)
    country_events: dict[str, int] = defaultdict(int)
    country_companies: dict[str, set[int]] = defaultdict(set)

    cur.execute("""
        SELECT c.country, pfe.source, pfe.id, pfe.company_id
        FROM public_funding_events pfe
        JOIN companies c ON c.id = pfe.company_id
        WHERE c.country IS NOT NULL AND c.country != ''
    """)
    for country, source, eid, cid in cur.fetchall():
        country_sources[country].add(source)
        country_events[country] += 1
        country_companies[country].add(cid)

    # Per-country event counts by layer, for the refined tier test.
    reg_events: dict[str, int] = defaultdict(int)   # state-aid register (SATR/BDNS/SUDOP)
    eu_events: dict[str, int] = defaultdict(int)
    direct_ndb_events: dict[str, int] = defaultdict(int)
    ndb_via_reg: dict[str, int] = defaultdict(int)  # ndb_distributor tagged on register rows
    cur.execute("""
        SELECT c.country, pfe.source, pfe.ndb_distributor
        FROM public_funding_events pfe JOIN companies c ON c.id = pfe.company_id
        WHERE c.country IS NOT NULL AND c.country != ''
    """)
    for country, source, ndb in cur.fetchall():
        if any(source.startswith(p) for p in STATE_AID_PREFIXES):
            reg_events[country] += 1
            if ndb:
                ndb_via_reg[country] += 1
        elif any(source.startswith(p) for p in EU_INSTRUMENT_PREFIXES):
            eu_events[country] += 1
        elif any(source.startswith(p) for p in DIRECT_NDB_PREFIXES):
            direct_ndb_events[country] += 1

    con.close()

    result = {"generated": datetime.now(timezone.utc).isoformat(), "countries": {}}
    ratings: dict[str, dict] = {}
    for country in sorted(country_sources.keys()):
        _, families = _classify_sources(country_sources[country])
        reg = reg_events[country]
        eu = eu_events[country]
        dndb = direct_ndb_events[country]
        ndb_total = dndb + ndb_via_reg[country]
        # primary register = max(state-aid register, direct-NDB layer) — DK/PL use
        # a direct/national register in place of EC-TAM SATR.
        tier = _refined_tier(max(reg, dndb), eu, ndb_total)
        result["countries"][country] = {
            "source_families": families,
            "event_count": country_events[country],
            "company_count": len(country_companies[country]),
            "register_events": reg,
            "eu_events": eu,
            "ndb_events": ndb_total,
            "coverage_tier": tier,
            "structural_gap": STRUCTURAL_GAPS.get(country, ""),
        }
        ratings[country] = {
            "rating": tier,
            "note": STRUCTURAL_GAPS.get(country, "")
                    or f"{country_events[country]:,} events across "
                       f"{len(families)} source families.",
        }

    OUT_PATH.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Coverage indicator → {OUT_PATH}")

    # Emit the site-facing ratings file (homepage reads this — keeps it live).
    site_path = BASE_DIR / "site" / "public" / "data" / "coverage_ratings.json"
    if site_path.parent.exists():
        site_path.write_text(json.dumps(ratings, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Site coverage ratings → {site_path}")

    # Emit the full per-country detail for the homepage transparency table:
    # grade, layer event counts, source families and structural-gap notes.
    site_full_path = BASE_DIR / "site" / "public" / "data" / "country_coverage.json"
    if site_full_path.parent.exists():
        site_full_path.write_text(
            json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        print(f"Site country coverage detail → {site_full_path}")
    print()
    print("Coverage tiers:")
    from collections import Counter
    tier_counts = Counter(v["coverage_tier"] for v in result["countries"].values())
    for tier in "ABCDX":
        n = tier_counts.get(tier, 0)
        desc = {"A": "Rich (SATR+NDB+EU)", "B": "Moderate (SATR+1 source)",
                "C": "SATR+EU only", "D": "SATR only", "X": "No coverage"}[tier]
        print(f"  {tier} ({desc}): {n} countries")
    print()
    print("Countries by tier:")
    for tier in "ABCDX":
        countries = [c for c, v in result["countries"].items() if v["coverage_tier"] == tier]
        if countries:
            print(f"  {tier}: {', '.join(sorted(countries))}")

    # Flag per-capita analysis risk
    thin_with_high_events = [
        (c, v["event_count"], v["company_count"])
        for c, v in result["countries"].items()
        if v["coverage_tier"] in ("B", "C") and v["event_count"] > 2000
    ]
    if thin_with_high_events:
        print()
        print("Per-capita analysis risk (thin-coverage countries with high event counts):")
        for c, evs, cos in sorted(thin_with_high_events, key=lambda x: -x[1])[:10]:
            print(f"  {c}: {evs:,} events / {cos:,} cos [tier "
                  f"{result['countries'][c]['coverage_tier']}]")


if __name__ == "__main__":
    main()
