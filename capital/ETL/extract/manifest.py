"""Source manifest — the single, machine-readable registry of every extractor.

Each entry maps a funding source listed in `docs/methodology.md` to the extractor
that (re)loads it, the arguments that trigger a fresh pull into `db.sqlite`, and a
renewal *tier* describing how hands-off that pull is:

  AUTO    — fully programmatic: an open API / bulk file / server-rendered page.
            `renew.py --auto` runs these end to end.
  NETWORK — programmatic, but the endpoint is only reachable from a specific network
            or host (national NDB APIs that the build host can't reach, WAF-gated
            registers, rate-limited factsheets). Run from the right host.
  MANUAL  — needs a file that cannot be fetched unattended (an annual-report PDF, a
            register export, a Wayback snapshot). Renewal = drop in the new file,
            then run the extractor with that path. These are mostly the Sprint-19
            equity-stakes one-shots.
  REJECTED— evaluated and deliberately not loaded (kept for provenance).

`renew.py` consumes this file; `ETL/README.md` renders it as a table. Keep it in
sync when an extractor is added or its access path changes (see the ship-a-source
skill).
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Source:
    key: str                 # short id (also the renew.py selector)
    module: str              # extractor file stem under ETL/extract/
    title: str               # human label (country / instrument)
    tier: str                # AUTO | NETWORK | MANUAL | REJECTED
    renew: list[str] = field(default_factory=list)   # args appended after --load-db pull
    dep: str = ""            # endpoint / dependency kind
    note: str = ""           # caveat surfaced to the operator


# Order: EU instruments, then CORDIS-derived, then national NDB registers,
# then the equity-stakes one-shots. Tiers per methodology + workarounds memory.
SOURCES: list[Source] = [
    # ---- EU instruments ------------------------------------------------------
    Source("eic_fund", "extract_eic_fund", "EIC Fund portfolio (EU equity)", "AUTO",
           ["--load-db"], "eic.ec.europa.eu (server-rendered)",
           "names only; ticket sizes unpublished"),
    Source("innovation_fund", "extract_innovation_fund", "EU Innovation Fund", "AUTO",
           ["--load-db"], "climate.ec.europa.eu", "coordinator-level; some grant ceilings"),
    Source("ipcei", "extract_ipcei", "IPCEI decisions", "NETWORK",
           ["--load-db"], "ec.europa.eu/competition state-aid PDFs",
           "per-decision PDFs; redacted amounts backfilled from SATR"),
    Source("eib", "extract_eib", "EIB venture/growth debt", "AUTO",
           ["--load-db"], "eib.org", "SSL curl workaround documented"),
    Source("edf", "extract_edf", "European Defence Fund", "NETWORK",
           ["--load-db"], "defence-industry-space.ec.europa.eu",
           "~50% factsheet coverage (rate-limited)"),
    Source("eit", "extract_eit", "EIT KICs (all 8)", "AUTO",
           ["--load-db"], "per-KIC newsrooms (composite, largely cached)",
           "many hardcoded source pages; refresh is incremental"),
    Source("chips_ju", "extract_chips_ju", "Chips JU / KDT JU", "AUTO",
           ["--load-db", "--refresh"], "chips-ju.europa.eu OData",
           "largely superseded by CORDIS HORIZON-JU-Chips-"),

    # ---- CORDIS bulk (Horizon Pillar II + JU families) -----------------------
    Source("cordis", "extract_cordis", "CORDIS HORIZON projects (base)", "AUTO",
           ["--load-db"], "cordis.europa.eu bulk CSV zip",
           "downloads the full HORIZON projects dump"),
    Source("cordis_pillar_ii", "extract_cordis_pillar_ii",
           "Horizon Pillar II CL1/3/4/5/6 + JU families", "AUTO",
           ["--load-db"], "cordis.europa.eu bulk CSV",
           "the main HE workhorse; org-level ecContribution"),

    # ---- National NDB / state-aid registers ----------------------------------
    Source("satr", "extract_satr", "SATR — EU State Aid Transparency Register", "NETWORK",
           [], "webgate.ec.europa.eu transparency",
           "two-step: run_satr_all.sh then ETL/load/load_satr.py --staging --apply"),
    Source("bdns", "extract_bdns", "Spain BDNS / SNPSAP state aid", "AUTO",
           ["--load-db"], "infosubvenciones.es/bdnstrans/api",
           "use infosubvenciones mirror (hacienda.gob.es is WAF/IP-blocked)"),
    Source("cdti", "extract_cdti", "Spain CDTI (sub-threshold direct)", "AUTO",
           ["--load-db", "--refresh"], "infosubvenciones.es/bdnstrans/api", ""),
    Source("ademe", "extract_ademe", "ADEME (FR cleantech aid)", "AUTO",
           ["--load-db", "--refresh"], "data.ademe.fr open API",
           "largest source by event count"),
    Source("fr_innov_grants", "extract_fr_innov_grants", "Bpifrance i-Nov / PM'up (FR)", "AUTO",
           ["--load-db", "--refresh"], "data.enseignementsup-recherche.gouv.fr API", ""),
    Source("bpifrance", "extract_bpifrance", "Bpifrance fonds & participations (FR)", "AUTO",
           ["--load-db"], "lehub.bpifrance.fr", "self-published portfolio"),
    Source("innovate_uk", "extract_innovate_uk", "Innovate UK / UKRI (GB)", "AUTO",
           ["--load-db"], "gtr.ukri.org/gtr/api", "GBP→EUR at ECB averages"),
    Source("innovationsfonden", "extract_innovationsfonden", "Innovationsfonden (DK)", "AUTO",
           ["--load-db", "--refresh"], "innovationsfonden.dk", ""),
    Source("eifo", "extract_eifo", "EIFO Venturelisten co-invest (DK)", "AUTO",
           ["--load-db", "--refresh"], "Google Sheets export", ""),
    Source("business_finland", "extract_business_finland", "Business Finland (FI)", "AUTO",
           ["--load-db"], "avoindata.fi", ""),
    Source("vinnova", "extract_vinnova", "Vinnova / GDP Hub (SE)", "AUTO",
           ["--load-db"], "gdphub.se", ""),
    Source("enterprise_ireland", "extract_enterprise_ireland", "Enterprise Ireland (IE)", "AUTO",
           ["--load-db"], "enterprise-ireland.com", ""),
    Source("sprind", "extract_sprind", "SPRIND challenges (DE)", "AUTO",
           ["--load-db", "--refresh"], "sprind.org", "presence-only (amounts NULL)"),
    Source("htgf", "extract_htgf", "High-Tech Gründerfonds (DE)", "AUTO",
           ["--load-db", "--refresh"], "htgf.de wp-json", ""),
    Source("coparion", "extract_coparion", "Coparion (DE)", "AUTO",
           ["--load-db", "--refresh"], "coparion.vc (static modal)", ""),
    Source("cdp_vc", "extract_cdp_vc", "CDP Venture Capital (IT)", "AUTO",
           ["--load-db", "--refresh"], "cdpventurecapital.it", ""),
    Source("invest_nl", "extract_invest_nl", "Invest-NL (NL)", "AUTO",
           ["--load-db", "--refresh"], "invest-nl.nl", ""),
    Source("tesi", "extract_tesi", "Tesi portfolio (FI)", "AUTO",
           ["--load-db", "--refresh"], "tesi.fi/portfolio", ""),
    Source("almi_invest", "extract_almi_invest", "Almi Invest (SE)", "AUTO",
           ["--load-db", "--refresh"], "almi.se/api", ""),
    Source("innovasjon_norge", "extract_innovasjon_norge", "Innovasjon Norge (NO)", "NETWORK",
           ["--load-db"], "data.norge.no Azure blob CSV", "build host can't reach — run locally"),
    Source("nfr", "extract_nfr", "Forskningsrådet / NFR (NO)", "NETWORK",
           ["--load-db"], "prosjektbanken.forskningsradet.no REST", "run from a local host"),
    Source("innosuisse", "extract_innosuisse", "Innosuisse (CH)", "NETWORK",
           ["--load-db"], "datenausgabe.aramis.admin.ch JSON", "run from a local host"),
    Source("tacr", "extract_tacr", "TAČR / STARFOS (CZ)", "NETWORK",
           ["--load-db"], "starfos.tacr.cz export", "isvavai.cz WAF-blocked; SATR-overlap gate"),
    Source("baltic_ndbs", "extract_baltic_ndbs", "ALTUM (LV) + EIS (EE)", "NETWORK",
           ["--load-db"], "altum.lv XLSX + eis.ee JSON", "run locally; SATR-overlap gate"),
    Source("sudop", "extract_sudop", "SUDOP (PL)", "NETWORK",
           ["--load-db", "--refresh"], "api-sudop.uokik.gov.pl (async OpenAPI)",
           "partial — remaining measures pending"),
    Source("fr_regions", "extract_fr_regions", "FR regional SCDL", "REJECTED",
           [], "data.gouv.fr", "tested & rejected — schools/associations, not innovation co's"),

    # ---- Equity-stakes one-shots (need a downloaded file each renewal) --------
    Source("future_fund", "extract_future_fund", "UK Future Fund register (GB)", "MANUAL",
           [], "british-business-bank.co.uk (Wayback HTML)",
           "arg: <register.html> <as_of>; live page is Cloudflare-gated"),
    Source("ee_register_stakes", "extract_ee_register_stakes", "EE e-Business Register (SmartCap)", "MANUAL",
           [], "ariregister.rik.ee open-data download", "arg: <export-file>"),
    Source("investinor_portfolio", "extract_investinor_portfolio", "Investinor (NO)", "MANUAL",
           [], "investinor.no/portefolje", "arg: <export-file>"),
    Source("isif_direct", "extract_isif_direct", "ISIF directs (IE)", "MANUAL",
           [], "ntma.ie annual report PDF", "arg: <annual_report.pdf> <as_of>"),
    Source("pfr_ventures", "extract_pfr_ventures", "PFR Ventures (PL)", "MANUAL",
           [], "pfrventures.pl Airtable JSON export", "arg: <airtable.json> <as_of>"),
    Source("tesi_directs", "extract_tesi_directs", "Tesi directs note (FI)", "MANUAL",
           [], "tesi.fi financial-review PDF", "arg: <financial_review.pdf> <as_of>"),
    Source("bpifrance_urd_stakes", "extract_bpifrance_urd_stakes", "Bpifrance URD stakes (FR)", "MANUAL",
           [], "bpifrance.fr URD PDF", "annual universal registration document"),
    Source("eifo_note12", "extract_eifo_note12", "EIFO annual-report Note 12 (DK)", "MANUAL",
           [], "eifo.dk annual report PDF", "fund-layer percentages"),
]

BY_KEY: dict[str, Source] = {s.key: s for s in SOURCES}
TIERS = ("AUTO", "NETWORK", "MANUAL", "REJECTED")
