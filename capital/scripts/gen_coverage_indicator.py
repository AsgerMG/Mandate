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
)

# Known structural gaps per country (for notes field)
STRUCTURAL_GAPS: dict[str, str] = {
    "DE": "BMBF Projektträger grants (~€4-6B/yr to industry) have no central register",
    "FR": "Bpifrance equity tickets and 8 of 12 regions not yet extracted",
    "IT": "Italian RNA de minimis layer (below SATR threshold) not extracted",
    "FI": "Finnvera loan/guarantee portfolio not public",
    "SE": "Vinnova direct register added Sprint 17 (deduped against 514 SATR rows)",
    "PL": "SUDOP 9 measures + NCBR not yet complete; mapadotacji.gov.pl out of scope",
    "NL": "RVO SDE++/WBSO (largest Dutch instruments) have no public company register",
    "ES": "BDNS regional agencies added Sprint 17; WAF-blocked from cloud IPs",
    "NO": "Innovasjon Norge + NFR extractors added Sprint 17; network-accessible",
    "CH": "Innosuisse extractor added Sprint 17; API discovery pending",
    "LV": "ALTUM: data.gov.lv shows no ALTUM dataset; manual download required",
    "LT": "ILTE: data.gov.lt access pending local network test",
    "EE": "EIS funded-projects DB: access pending local network test",
    "CZ": "TAČR: IS VaVaI CEP bulk download required",
    "RO": "REGAS national SATR portal not yet extracted",
    "SI": "gov.si static page SATR alternative not yet extracted",
    "HU": "MFB, NKFIH: no open register found",
    "GR": "HDB thin; HDBI FoF (3,500 portfolio cos) out of scope",
    "IS": "Small-country SATR coverage; Rannís not extracted",
    "LU": "Thin SATR coverage; risk of holding-company inflation in per-capita stats",
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

    con.close()

    result = {"generated": datetime.now(timezone.utc).isoformat(), "countries": {}}
    for country in sorted(country_sources.keys()):
        tier, families = _classify_sources(country_sources[country])
        result["countries"][country] = {
            "source_families": families,
            "event_count": country_events[country],
            "company_count": len(country_companies[country]),
            "coverage_tier": tier,
            "structural_gap": STRUCTURAL_GAPS.get(country, ""),
        }

    OUT_PATH.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Coverage indicator → {OUT_PATH}")
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
