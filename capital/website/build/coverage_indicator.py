"""Generate per-country coverage-completeness indicator for Wincent.

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

Run: python coverage_indicator.py
"""
from __future__ import annotations

import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from web_env import DB_PATH, DATA_PROCESSED, SITE_DATA  # noqa: E402

OUT_PATH = DATA_PROCESSED / "coverage_indicator.json"
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

# Sprint 19: equity visibility tiers — the integration criterion for the
# public-equity layer (public_equity_stakes), mirroring the grant coverage
# tiers. Cross-country equity comparisons only WITHIN a tier; presence-only
# claims corpus-wide with the tier caveat; ticket-size claims only where
# disclosure_level='amount'.
#   E-A register-grade   : ownership register / mandatory filing makes stakes
#                          near-complete independent of institutional goodwill
#   E-B institution-grade: the institution publishes a complete portfolio
#   E-C partial          : press releases / case pages only
#   E-X opaque           : nothing recoverable
# PRELIMINARY desk assessment (Sprint 19 Steps 1-2); Step 5/6 extractions
# confirm or demote. Default for unlisted countries is E-X.
EQUITY_TIERS_PRELIMINARY: dict[str, tuple[str, str]] = {
    # Tier = what is ACHIEVED with loaded data, not the structural ceiling.
    # Upgrade paths live in the notes; comparisons must follow loaded data.
    "DK": ("E-B", "ACHIEVED E-B: EIFO Note 12 — 43 FUND-layer stakes at pct_exact (accounting-forced, the Route A precedent; company tickets stay aggregate-only in Note 13) + 115 Venturelisten rounds (investment register, exit status unknown). E-A potential via CVR legal-owner register — pending user S2S access"),
    "EE": ("E-A", "ACHIEVED E-A: e-Business Register open data (osanikud bulk dump, free, daily refresh, Nasdaq-CSD-verified) — 14 SmartCap holdings at EXACT percentages with dates (incl. Stargate Hydrogen 10.5%, UP Catalyst 10.9%). Caveat: covers OÜ shareholders only; AS ownership sits in the securities register"),
    "NO": ("E-B", "ACHIEVED E-B: Investinor 139 stakes (incl. 72 divested) + Nysnø 54 (38 companies + 16 fund-layer), name_only. E-A route CONFIRMED VIABLE: skatteetaten releases the full aksjonærregister as CSV on request (1.7M rows; FY2025 holdings open since 18 May 2026) — ordering the extract is the remaining step"),
    "GB": ("E-A", "ACHIEVED E-A: Future Fund statutory register — two quarterly snapshots loaded (2025-06-30 + 2026-03-31; 645 current equity interests, 391 cumulative insolvencies) at name_only. CAVEAT: covers ONE legacy scheme, not all UK public equity"),
    "DE": ("E-B", "LOADED: HTGF 538 (130 exits via '(Exit)' labels) + Coparion 52 + Bayern Kapital 133 + IBB Ventures 100 stakes. NRW.BANK Venture publishes NO portfolio (probe confirmed); KfW Capital is LP-only"),
    "PL": ("E-B", "LOADED: PFR Ventures 1,068 stakes — ALL look-through LP exposure (via_fund set); never compare with direct stakes. Most transparent FoF in Europe"),
    "IT": ("E-B", "LOADED: CDP Venture Capital 81 stakes from Sprint 13 listing"),
    "PT": ("E-B", "LOADED: Portugal Ventures 252 stakes incl. 84 published exits (one of four institutions disclosing the exit side)"),
    "FI": ("E-B", "LOADED: Tesi Financial Review note 4.2 — the ENTIRE direct portfolio (72 holdings) at EXACT percentages, the only institution found that does this voluntarily for every position (ICEYE 6.7%, IQM 6.6%, Oura 3.4%, Valmet Automotive 45.0%). Best-practice benchmark for the scorecard; fund-layer commitments with EUR amounts also published (note 4.1, extraction queued)"),
    "SE": ("E-B", "LOADED: Almi Invest 323 stakes from Sprint 13 listing; Saminvest is FoF; Industrifonden foundation-owned"),
    "HU": ("E-C", "DOWNGRADED from E-B on inspection: Hiventures' public archive lists only ~45 of 1,000+ claimed tickets (45 loaded) — partial disclosure, not a complete portfolio"),
    "IE": ("E-B", "LOADED: ISIF 20 stakes WITH amounts (€602M original commitments 2015-2023, NTMA appendix) — the only per-company euro disclosure found in Europe; commitments-not-holdings caveat; Enterprise Ireland appendices pending"),
    "LV": ("E-B", "LOADED: ALTUM 21 stakes WITH ticket_eur + 1 register-grade position (Mogotel Development Holding, 84.55% of nominal capital via Altum kapitāla fonds, from the OPEN SIA members register). Register finding: ALTUM's venture co-invest tickets are convertible-structured and do NOT appear as share ownership — an open share register still cannot see non-share state equity"),
    "AT": ("E-B", "LOADED: aws Gründungsfonds 54 stakes (TYPO3 portfolio page)"),
    "BE": ("E-C", "DOWNGRADED from E-B on inspection: PMV publishes NO full portfolio (news items + Invest-for-Jobs subset only); Wallonie Entreprendre partial"),
    "NL": ("E-C", "Invest-NL case pages; regional ROMs partial"),
    "FR": ("E-C", "E-C with an IFRS-forced island: the URD 2024 accounting notes disclose 13 flagship stakes at EXACT pct (STMicroelectronics 13.86%, Soitec 11.47%, Doctolib 12.55% — France's only disclosed venture position, published solely because it crossed 1% of Bpifrance's capital). The other ~65 Large Venture positions and all regional vehicles stay invisible: disclosure exists exactly where accounting law forces it, nowhere else"),
    "ES": ("E-C", "CDTI Innvierte press releases; Axis/Fond-ICO is FoF; participative loans in BDNS are quasi-equity"),
    "LT": ("E-C", "INVEGA Koinvesticinis fondas case pages"),
    "GR": ("E-C", "Equifund is FoF; HDB direct equity thin"),
    "CH": ("E-X", "No federal direct-equity instrument; cantonal vehicles opaque"),
}
EU_EQUITY_TIER = ("E-C", "EIC Fund portfolio published as names only — ticket sizes unpublished (233 positions loaded)")

# Sprint 19: stake holders -> the country whose equity-tool coverage they
# evidence. Attribution is by HOLDER country, not company HQ (the equity table
# grades each country's INSTITUTIONS' disclosure; ~970 PFR-inserted companies
# have country='' anyway). EU-level holders aggregate into the eu_layer block.
HOLDER_COUNTRY: dict[str, str] = {
    "uk_future_fund": "GB",
    "pfr_ventures": "PL",
    "htgf": "DE", "coparion": "DE", "bayern_kapital": "DE",
    "ibb_ventures": "DE",
    "almi_invest": "SE",
    "eifo": "DK",
    "investinor": "NO", "nysno": "NO",
    "tesi": "FI",
    "cdp_vc": "IT",
    "aws_gruendungsfonds": "AT",
    "hiventures": "HU",
    "portugal_ventures": "PT",
    "invest_nl": "NL",
    "altum": "LV",
    "isif": "IE",
    "smartcap": "EE",
    "bpifrance": "FR",
    "eic_fund": "EU",
    "eit_innoenergy": "EU", "eit_manufacturing": "EU",
    "eit_urban_mobility": "EU",
}

HOLDER_LABELS: dict[str, str] = {
    "uk_future_fund": "Future Fund", "pfr_ventures": "PFR Ventures*",
    "htgf": "HTGF", "coparion": "Coparion", "bayern_kapital": "Bayern Kapital",
    "ibb_ventures": "IBB Ventures", "almi_invest": "Almi Invest",
    "eifo": "EIFO", "investinor": "Investinor", "nysno": "Nysnø",
    "tesi": "Tesi", "cdp_vc": "CDP VC", "aws_gruendungsfonds": "aws GF",
    "hiventures": "Hiventures", "portugal_ventures": "Portugal Ventures",
    "invest_nl": "Invest-NL", "altum": "ALTUM", "isif": "ISIF",
    "smartcap": "SmartCap",
    "bpifrance": "Bpifrance (IFRS notes)",
    "eic_fund": "EIC Fund", "eit_innoenergy": "EIT InnoEnergy",
    "eit_manufacturing": "EIT Mfg", "eit_urban_mobility": "EIT UM",
}

_DISCLOSURE_RANK = {"name_only": 0, "pct_range": 1, "pct_exact": 2, "amount": 3}

# Sprint 19 deep-research pass (2026-06-11): published portfolio PERFORMANCE
# per holder country — what the institution itself discloses about returns.
# Absence of an entry means no portfolio-level performance disclosure was
# found, which is itself a scorecard datapoint (rendered as "not disclosed").
# Sources: institution annual/quarterly reports; figures are theirs, not ours.
EQUITY_PERFORMANCE: dict[str, str] = {
    "IE": "ISIF discloses returns: 3.4% p.a. since inception (€2.9bn cumulative to 2024), 6.5% in 2024 (NTMA AR 2024).",
    "NO": "Investinor discloses vintage-level returns: Direct-2013 cohort IRR 5.6%, TVPI 1.43, DPI 0.73; Direct-2018 IRR 1.0%; rolling 4-quarter ROI 6.5% (Q4 2025 report). Nysnø reports fair value in its annual report.",
    "FI": "Tesi discloses results: 2024 IFRS result €165m; direct portfolio €337m invested in 63 companies, €108m returned to date; has doubled its state capital over ~30 years (Financial Review 2024).",
    "DK": "EIFO disclosures imply fund-stake performance: Note 12 value index 1.46 (2025; (book value + distributions) / cost; 1.45 in 2024). Direct-ticket performance is aggregate-only.",
    "GB": "Future Fund Year-3 evaluation (Sep 2025): portfolio median turnover growth 22.5% (2023) and 21.5% (2024); of 1,193 convertible loans, 645 remain equity interests and 391 ended in insolvency (33%) as at 2026-03-31.",
    "FR": "Bpifrance URD 2024 (activity level only): Large Venture invested €134m in 21 companies in 2024 (incl. H.AI €24m, Exotec €20m follow-on); group disposals €2.4bn incl. €310m net fund-of-funds gains. No portfolio-level IRR or fair-value series published.",
}
EU_EQUITY_PERFORMANCE = ("The EIC Fund publishes no portfolio performance — no fair value, no IRR, no loss rate. "
                         "The EIT KICs disclose no investment results.")


def _equity_by_country(con: sqlite3.Connection) -> tuple[dict, dict]:
    """Aggregate public_equity_stakes per holder country (current view:
    latest as_of per (holder, company) so quarterly register snapshots
    don't double-count). Returns (per_country, eu_layer)."""
    from collections import defaultdict
    latest: dict[tuple[str, int], tuple[str, int, str]] = {}
    for holder, cid, as_of, exited, level in con.execute(
        "SELECT holder, company_id, COALESCE(as_of,''), exited, "
        "disclosure_level FROM public_equity_stakes"
    ):
        key = (holder, cid)
        if key not in latest or as_of > latest[key][0]:
            latest[key] = (as_of, exited, level)

    agg: dict[str, dict] = defaultdict(lambda: {
        "positions": 0, "exited": 0, "holders": set(), "best": 0})
    for (holder, _cid), (_as_of, exited, level) in latest.items():
        country = HOLDER_COUNTRY.get(holder, "")
        if not country:
            continue
        a = agg[country]
        a["positions"] += 1
        a["exited"] += exited
        a["holders"].add(holder)
        a["best"] = max(a["best"], _DISCLOSURE_RANK.get(level, 0))
    rank_to_label = {v: k for k, v in _DISCLOSURE_RANK.items()}
    out = {}
    for country, a in agg.items():
        out[country] = {
            "equity_positions": a["positions"],
            "equity_exited": a["exited"],
            "equity_holders": sorted(HOLDER_LABELS.get(h, h)
                                     for h in a["holders"]),
            "equity_best_disclosure": rank_to_label[a["best"]],
        }
    eu_layer = out.pop("EU", None)
    return out, eu_layer

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

    # 2026-07-08 country-scope reduction: only corpus countries (≥€1B cumulative
    # public support, see v_country_public_support in data/views.sql) get a
    # coverage rating — excluded countries would otherwise reappear here after
    # being filtered from every other surface.
    in_corpus = {
        row[0] for row in cur.execute(
            "SELECT country FROM v_country_public_support WHERE in_corpus = 1")
    }

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

    equity_by_country, eu_equity_layer = _equity_by_country(con)
    con.close()

    result = {"generated": datetime.now(timezone.utc).isoformat(), "countries": {}}
    result["eu_equity_layer"] = {
        "equity_tier": EU_EQUITY_TIER[0],
        "equity_tier_note": EU_EQUITY_TIER[1],
        "equity_performance": EU_EQUITY_PERFORMANCE,
        **(eu_equity_layer or {}),
    }
    ratings: dict[str, dict] = {}
    for country in sorted(country_sources.keys() & in_corpus):
        _, families = _classify_sources(country_sources[country])
        reg = reg_events[country]
        eu = eu_events[country]
        dndb = direct_ndb_events[country]
        ndb_total = dndb + ndb_via_reg[country]
        # primary register = max(state-aid register, direct-NDB layer) — DK/PL use
        # a direct/national register in place of EC-TAM SATR.
        tier = _refined_tier(max(reg, dndb), eu, ndb_total)
        eq_tier, eq_note = EQUITY_TIERS_PRELIMINARY.get(
            country, ("E-X", "No recoverable public-equity disclosure identified (preliminary)"))
        result["countries"][country] = {
            "source_families": families,
            "event_count": country_events[country],
            "company_count": len(country_companies[country]),
            "register_events": reg,
            "eu_events": eu,
            "ndb_events": ndb_total,
            "coverage_tier": tier,
            "equity_tier": eq_tier,
            "equity_tier_note": eq_note,
            "equity_performance": EQUITY_PERFORMANCE.get(country),
            "structural_gap": STRUCTURAL_GAPS.get(country, ""),
            **equity_by_country.get(country, {
                "equity_positions": 0, "equity_exited": 0,
                "equity_holders": [], "equity_best_disclosure": None,
            }),
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
    site_path = SITE_DATA / "coverage_ratings.json"
    if site_path.parent.exists():
        site_path.write_text(json.dumps(ratings, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Site coverage ratings → {site_path}")

    # Emit the full per-country detail for the homepage transparency table:
    # grade, layer event counts, source families and structural-gap notes.
    site_full_path = SITE_DATA / "country_coverage.json"
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

    print()
    print("Equity visibility tiers (preliminary, Sprint 19):")
    eq_counts = Counter(v["equity_tier"] for v in result["countries"].values())
    for t in ("E-A", "E-B", "E-C", "E-X"):
        countries = sorted(c for c, v in result["countries"].items()
                           if v["equity_tier"] == t)
        if countries:
            print(f"  {t} ({eq_counts[t]}): {', '.join(countries)}")
    print(f"  EU layer: {EU_EQUITY_TIER[0]} — {EU_EQUITY_TIER[1]}")

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
