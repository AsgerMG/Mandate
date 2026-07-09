"""Curated source registry for the news/signals layer — v1 (2026-07-09).

THE RULE: extractors (news_*.py, to be built) read THIS registry and sync it
into signals.sqlite `sources`; nobody hardcodes an outlet in an extractor.
Adding a source = adding an entry here.

Curation base: the user-supplied 77-source tech-policy list (EU 32 / FR 24 /
DE 21), filtered for THIS corpus's purpose — public-funding intelligence for
European tech companies, not tech policy at large — then augmented with the
missing categories: funder newsflows (EIC/EIF/EIB/EISMEA, NDBs), industrial-
policy signal, and dedicated coverage of the future-funding files that must
not be missed:
  * European Competitiveness Fund (ECF) — proposed 2025-07-16 in the MFF
    2028-34 package, €234B across four policy windows (with Horizon Europe
    €175B ≈ €409B for strategic tech); brings a "Seal for Competitiveness"
    and faster SME/startup/scaleup access. Tracked on the EP Legislative
    Train under the MFF spotlight.
  * EU Startup & Scaleup Strategy (2025-05) and its deliveries — Scaleup
    Europe Fund (via EIC, first investments expected autumn 2026), EISMEA
    Startup & Scaleup Hubs pilot calls, 28th-regime debate.
  * STEP, IPCEIs, Competitiveness Compass / Draghi follow-ups.

Tier mapping (must match signals_schema.sql CHECK):
  funder_press  — official/institutional: funders, ministries, EU bodies,
                  legislative pipeline trackers. Highest signal-to-noise.
  trade_press   — specialist outlets on EU funding / startup policy.
  general_news  — broad press + targeted Google News queries (highest noise;
                  everything passes classify_relevance.py before embedding).

`url` values are best-known feed/listing endpoints and MUST be verified when
the extractor for that `kind` is built (None = to be located). `priority`:
1 = wire up first, 2 = second wave, 3 = nice-to-have.

DROPPED (bottom) documents every source from the user's list that was cut,
with the reason — so the curation is auditable and reversible.
"""
from __future__ import annotations

# kind: "rss" (feed), "html" (listing page scrape), "gnews" (Google News RSS
# query — url holds the query string, not a URL).
SOURCES: dict[str, dict] = {
    # ── EU: official / institutional (funder_press) ─────────────────────────
    "ec_press": {
        "name": "European Commission press corner", "tier": "funder_press",
        "country": None, "language": "en", "kind": "rss",
        "url": "https://ec.europa.eu/commission/presscorner/api/rss?language=en",
        "topics": ["programmes", "competitiveness_fund", "industrial_policy"],
        "priority": 1},
    "ec_grow_ecf": {
        "name": "DG GROW — European Competitiveness Fund page", "tier": "funder_press",
        "country": None, "language": "en", "kind": "html",
        "url": "https://single-market-economy.ec.europa.eu/access-finance/european-competitiveness-fund_en",
        "topics": ["competitiveness_fund"], "priority": 1},
    "ec_rtd_news": {
        "name": "DG RTD research & innovation news (incl. Startup & Scaleup Strategy)",
        "tier": "funder_press", "country": None, "language": "en", "kind": "html",
        "url": "https://research-and-innovation.ec.europa.eu/news_en",
        "topics": ["startup_scaleup", "programmes"], "priority": 1},
    "ep_train_ecf": {
        "name": "EP Legislative Train — ECF file (MFF 2028-34 spotlight)",
        "tier": "funder_press", "country": None, "language": "en", "kind": "html",
        "url": "https://www.europarl.europa.eu/legislative-train/spotlight-MFF%202028-2034/file-european-competitiveness-fund",
        "topics": ["competitiveness_fund", "legislative_pipeline"], "priority": 1},
    "oeil": {
        "name": "EP Legislative Observatory (OEIL) — funding-programme files",
        "tier": "funder_press", "country": None, "language": "en", "kind": "html",
        "url": None,  # per-dossier subscription; scope to MFF/ECF/FP10 files
        "topics": ["legislative_pipeline"], "priority": 1},
    "have_your_say": {
        "name": "EC Have Your Say — consultations (earliest programme-design signal)",
        "tier": "funder_press", "country": None, "language": "en", "kind": "html",
        "url": "https://ec.europa.eu/info/law/better-regulation/have-your-say_en",
        "topics": ["legislative_pipeline", "programmes"], "priority": 1},
    "eurlex_com_proposals": {
        "name": "EUR-Lex — COM proposals (future programme regulations)",
        "tier": "funder_press", "country": None, "language": "en", "kind": "rss",
        "url": None,  # EUR-Lex saved-search RSS; scope to budget/programme chapters
        "topics": ["legislative_pipeline"], "priority": 1},
    "eurlex_oj_l": {
        "name": "EUR-Lex — Official Journal L (adopted programme law)",
        "tier": "funder_press", "country": None, "language": "en", "kind": "rss",
        "url": None, "topics": ["legislative_pipeline"], "priority": 2},
    "ep_press": {
        "name": "European Parliament press (budgets/ITRE angle)", "tier": "funder_press",
        "country": None, "language": "en", "kind": "rss", "url": None,
        "topics": ["legislative_pipeline"], "priority": 2},
    "eprs_blog": {
        "name": "EPRS blog (MFF/ECF analysis)", "tier": "funder_press",
        "country": None, "language": "en", "kind": "rss",
        "url": "https://epthinktank.eu/feed/",
        "topics": ["competitiveness_fund", "analysis"], "priority": 2},
    "ec_digital": {
        "name": "DG CNECT digital strategy news (digital funding calls)",
        "tier": "funder_press", "country": None, "language": "en", "kind": "html",
        "url": "https://digital-strategy.ec.europa.eu/en/news", "topics": ["programmes"],
        "priority": 2},
    "eic_news": {
        "name": "European Innovation Council news (incl. Scaleup Europe Fund)",
        "tier": "funder_press", "country": None, "language": "en", "kind": "html",
        "url": "https://eic.ec.europa.eu/news_en",
        "topics": ["startup_scaleup", "programmes", "people"], "priority": 1},
    "eismea_news": {
        "name": "EISMEA news + calls (Startup & Scaleup Hubs pilot etc.)",
        "tier": "funder_press", "country": None, "language": "en", "kind": "html",
        "url": "https://eismea.ec.europa.eu/news_en",
        "topics": ["startup_scaleup", "programmes"], "priority": 1},
    "eif_news": {
        "name": "European Investment Fund news", "tier": "funder_press",
        "country": None, "language": "en", "kind": "html",
        "url": "https://www.eif.org/what_we_do/news/index.htm",
        "topics": ["programmes", "vehicles"], "priority": 1},
    "eib_press": {
        "name": "EIB press releases", "tier": "funder_press",
        "country": None, "language": "en", "kind": "rss",
        "url": "https://www.eib.org/en/press/rss.htm",
        "topics": ["programmes", "vehicles"], "priority": 1},
    "cinea_news": {
        "name": "CINEA news (EU Innovation Fund)", "tier": "funder_press",
        "country": None, "language": "en", "kind": "html",
        "url": "https://cinea.ec.europa.eu/news-events_en", "topics": ["programmes"],
        "priority": 2},
    "eca_press": {
        "name": "European Court of Auditors (programme audits — how vehicles behave)",
        "tier": "funder_press", "country": None, "language": "en", "kind": "html",
        "url": "https://www.eca.europa.eu/en/news", "topics": ["vehicles", "analysis"],
        "priority": 2},

    # ── EU: trade / specialist press (trade_press) ──────────────────────────
    "science_business": {
        "name": "Science|Business — THE outlet for FP10/ECF/EIC politics",
        "tier": "trade_press", "country": None, "language": "en", "kind": "rss",
        "url": "https://sciencebusiness.net/rss.xml",
        "topics": ["competitiveness_fund", "programmes", "people"], "priority": 1},
    "politico_eu": {
        "name": "Politico Europe (tech + competition + budget beats)",
        "tier": "trade_press", "country": None, "language": "en", "kind": "rss",
        "url": "https://www.politico.eu/feed/",
        "topics": ["competitiveness_fund", "industrial_policy", "people"], "priority": 1},
    "euractiv": {
        "name": "Euractiv (economy / industrial policy)", "tier": "trade_press",
        "country": None, "language": "en", "kind": "rss",
        "url": "https://www.euractiv.com/feed/",
        "topics": ["industrial_policy", "competitiveness_fund"], "priority": 1},
    "sifted": {
        "name": "Sifted (startup/scaleup + EIC/EIF coverage)", "tier": "trade_press",
        "country": None, "language": "en", "kind": "rss",
        "url": "https://sifted.eu/feed", "topics": ["startup_scaleup", "programmes"],
        "priority": 1},
    "contexte": {
        "name": "Contexte (FR-language EU policy verticals)", "tier": "trade_press",
        "country": None, "language": "fr", "kind": "rss", "url": None,  # paywalled; verify access
        "topics": ["legislative_pipeline", "industrial_policy"], "priority": 2},
    "euobserver": {
        "name": "EUobserver", "tier": "trade_press", "country": None,
        "language": "en", "kind": "rss", "url": "https://euobserver.com/rss",
        "topics": ["industrial_policy"], "priority": 2},
    "table_europe": {
        "name": "Table.Media Europe/Research Table (DE-language EU research funding)",
        "tier": "trade_press", "country": None, "language": "de", "kind": "rss",
        "url": None,  # paywalled briefing; verify access
        "topics": ["competitiveness_fund", "programmes"], "priority": 3},

    # ── EU: general / query-driven (general_news) ───────────────────────────
    "gnews_competitiveness_fund": {
        "name": "Google News — European Competitiveness Fund", "tier": "general_news",
        "country": None, "language": "en", "kind": "gnews",
        "url": '"European Competitiveness Fund" OR "Competitiveness Fund" EU',
        "topics": ["competitiveness_fund"], "priority": 1},
    "gnews_startup_scaleup": {
        "name": "Google News — EU Startup & Scaleup Strategy / Scaleup Europe Fund",
        "tier": "general_news", "country": None, "language": "en", "kind": "gnews",
        "url": '"Startup and Scaleup Strategy" OR "Scaleup Europe Fund" OR "28th regime"',
        "topics": ["startup_scaleup"], "priority": 1},
    "gnews_ipcei": {
        "name": "Google News — IPCEI", "tier": "general_news", "country": None,
        "language": "en", "kind": "gnews", "url": 'IPCEI funding',
        "topics": ["programmes"], "priority": 2},
    "gnews_step": {
        "name": "Google News — STEP platform", "tier": "general_news", "country": None,
        "language": "en", "kind": "gnews",
        "url": '"Strategic Technologies for Europe Platform" OR "STEP Seal"',
        "topics": ["programmes"], "priority": 2},
    "gnews_eu_tech": {
        "name": "Google News — EU tech funding (broad)", "tier": "general_news",
        "country": None, "language": "en", "kind": "gnews",
        "url": "EU tech public funding grant", "topics": ["broad"], "priority": 2},
    "gnews_ft_eu_funding": {
        "name": "Google News — FT on EU industrial policy/funding (headline signal;"
                " full text paywalled)", "tier": "general_news", "country": None,
        "language": "en", "kind": "gnews",
        "url": "site:ft.com EU competitiveness industrial policy funding",
        "topics": ["industrial_policy"], "priority": 2},

    # ── France ───────────────────────────────────────────────────────────────
    "bpifrance_presse": {
        "name": "Bpifrance press (NDB agenda)", "tier": "funder_press", "country": "FR",
        "language": "fr", "kind": "html",
        "url": "https://presse.bpifrance.fr/", "topics": ["ndb_agenda", "vehicles"],
        "priority": 1},
    "sgpi_france2030": {
        "name": "SGPI — France 2030 announcements", "tier": "funder_press",
        "country": "FR", "language": "fr", "kind": "html",
        "url": "https://www.gouvernement.fr/france-2030",  # verify: SGPI newsroom
        "topics": ["ndb_agenda", "industrial_policy"], "priority": 1},
    "ademe_presse": {
        "name": "ADEME press (cleantech funding)", "tier": "funder_press",
        "country": "FR", "language": "fr", "kind": "html",
        "url": "https://presse.ademe.fr/", "topics": ["ndb_agenda"], "priority": 2},
    "dge_actualites": {
        "name": "DGE (economy ministry) news — industrial policy / aid schemes",
        "tier": "funder_press", "country": "FR", "language": "fr", "kind": "html",
        "url": "https://www.entreprises.gouv.fr/fr/actualites",
        "topics": ["industrial_policy"], "priority": 2},
    "an_dossiers": {
        "name": "Assemblée nationale dossiers (finance-law funding lines only)",
        "tier": "funder_press", "country": "FR", "language": "fr", "kind": "html",
        "url": None, "topics": ["legislative_pipeline"], "priority": 3},
    "senat_dossiers": {
        "name": "Sénat dossiers (finance-law funding lines only)", "tier": "funder_press",
        "country": "FR", "language": "fr", "kind": "html", "url": None,
        "topics": ["legislative_pipeline"], "priority": 3},
    "ccomptes_rapports": {
        "name": "Cour des comptes reports (audits of France 2030 / Bpifrance)",
        "tier": "funder_press", "country": "FR", "language": "fr", "kind": "html",
        "url": "https://www.ccomptes.fr/fr/publications", "topics": ["vehicles", "analysis"],
        "priority": 2},
    "maddyness": {
        "name": "Maddyness (FR startup press, heavy Bpifrance/France 2030 coverage)",
        "tier": "trade_press", "country": "FR", "language": "fr", "kind": "rss",
        "url": "https://www.maddyness.com/feed/", "topics": ["startup_scaleup", "ndb_agenda"],
        "priority": 2},
    "latribune": {
        "name": "La Tribune (business/industrial policy)", "tier": "general_news",
        "country": "FR", "language": "fr", "kind": "rss",
        "url": "https://www.latribune.fr/rss/rubriques/technos-medias.html",
        "topics": ["industrial_policy"], "priority": 2},
    "gnews_fr_funding": {
        "name": "Google News FR — public funding (France 2030, Bpifrance, aides)",
        "tier": "general_news", "country": "FR", "language": "fr", "kind": "gnews",
        "url": '"France 2030" OR Bpifrance financement startup deeptech',
        "topics": ["ndb_agenda"], "priority": 1},
    "gnews_fr_tech": {
        "name": "Google News FR — tech (broad)", "tier": "general_news", "country": "FR",
        "language": "fr", "kind": "gnews", "url": "startup technologie financement public",
        "topics": ["broad"], "priority": 3},

    # ── Germany ──────────────────────────────────────────────────────────────
    "bmwe_presse": {
        "name": "BMWK/BMWE press (IPCEI + industrial policy)", "tier": "funder_press",
        "country": "DE", "language": "de", "kind": "html",
        "url": "https://www.bmwk.de/Redaktion/DE/Pressemitteilungen/pressemitteilungen.html",
        "topics": ["industrial_policy", "programmes"], "priority": 1},
    "bmbf_presse": {
        "name": "BMFTR/BMBF press (research funding) — via gnews, the CMS listing is form-driven",
        "tier": "funder_press", "country": "DE", "language": "de", "kind": "gnews",
        "url": "site:bmftr.bund.de",
        "topics": ["programmes"], "priority": 1},
    "kfw_presse": {
        "name": "KfW press (NDB agenda, Zukunftsfonds)", "tier": "funder_press",
        "country": "DE", "language": "de", "kind": "html",
        "url": "https://www.kfw.de/%C3%9Cber-die-KfW/Newsroom/",
        "topics": ["ndb_agenda", "vehicles"], "priority": 1},
    "sprind_news": {
        "name": "SPRIND news (federal disruptive-innovation agency)",
        "tier": "funder_press", "country": "DE", "language": "de", "kind": "html",
        "url": "https://www.sprind.org/de/aktuelles/", "topics": ["programmes"],
        "priority": 2},
    "bundestag_hib": {
        "name": "Bundestag hib (research/economy committees only)", "tier": "funder_press",
        "country": "DE", "language": "de", "kind": "rss", "url": None,
        "topics": ["legislative_pipeline"], "priority": 3},
    "startup_verband": {
        "name": "Startup-Verband press (startup strategy / Zukunftsfonds advocacy)",
        "tier": "trade_press", "country": "DE", "language": "de", "kind": "html",
        "url": "https://startupverband.de/presse/", "topics": ["startup_scaleup"],
        "priority": 2},
    "gnews_de_funding": {
        "name": "Google News DE — public funding (Förderung, Zukunftsfonds, IPCEI)",
        "tier": "general_news", "country": "DE", "language": "de", "kind": "gnews",
        "url": 'Förderung Startup Zukunftsfonds OR IPCEI OR "industriepolitik"',
        "topics": ["ndb_agenda", "industrial_policy"], "priority": 1},
    "gnews_de_tech": {
        "name": "Google News DE — tech (broad)", "tier": "general_news", "country": "DE",
        "language": "de", "kind": "gnews", "url": "Startup Technologie staatliche Förderung",
        "topics": ["broad"], "priority": 3},
}

# ── Cut from the user-supplied 77-source list, with reasons ──────────────────
# The originals were curated for TECH POLICY; this corpus tracks PUBLIC FUNDING.
# Everything privacy / security / courts / consumer-tech went. Reversible: move
# an entry back up and give it a tier + priority.
DROPPED: dict[str, str] = {
    # EU
    "eurlex": "raw firehose; the scoped saved-searches above cover programme law",
    "eurlex_key_acts": "duplicates eurlex_com_proposals/oj_l for our purpose",
    "eurlex_ep_council_legislation": "same",
    "law_tracker": "duplicates oeil + ep_train_ecf",
    "ep_texts_adopted": "OJ L + oeil catch the funding-relevant adoptions",
    "ep_written_questions": "very high noise; funding questions surface via ep_press",
    "ep_verbatim": "plenary transcripts — noise dwarfs signal",
    "edpb_news": "data protection — no funding angle",
    "berec_news": "telecom regulation — no funding angle",
    "ecb_press": "monetary policy — out of scope",
    "eba_news": "banking supervision — out of scope",
    "esma_news": "markets supervision — out of scope",
    "eiopa_news": "insurance supervision — out of scope",
    "etsi_news": "standards body — out of scope",
    "eu_ombudsman": "maladministration — out of scope",
    "eu_law_analysis": "legal-academic blog — no funding angle",
    "eu_law_live": "same",
    "verfassungsblog": "constitutional law — out of scope",
    "techcrunch_eu": "predominantly private VC rounds — explicitly out of scope",
    "contexte_news": "merged into single `contexte` entry",
    # France
    "cnil_news": "privacy regulator — no funding angle",
    "anssi_news": "cybersecurity agency — no funding angle",
    "arcom_news": "media regulator — no funding angle",
    "arcep_presse": "telecom regulator — no funding angle",
    "amf_presse": "markets regulator — no funding angle",
    "defenseurdesdroits_actu": "rights ombudsman — out of scope",
    "conseil_etat_actu": "administrative court — out of scope",
    "conseil_etat_avis": "same",
    "adlc_decisions": "competition authority — state-aid enforcement is EU-level",
    "an_verbatim": "transcripts — noise dwarfs signal",
    "senat_textes": "covered via senat_dossiers",
    "01net": "consumer tech — no funding angle",
    "inria_news": "single research institute — too narrow",
    "laquadrature": "digital rights — out of scope",
    "lemonde_pixels": "consumer-tech desk; gnews_fr_funding catches its funding pieces",
    "next_ink": "consumer tech/digital rights — out of scope",
    "numerama": "consumer tech — out of scope",
    "publicsenat": "parliamentary TV — covered via senat_dossiers",
    "siecledigital": "consumer tech/marketing — out of scope",
    # Germany
    "bgbl1": "federal gazette raw — funding-relevant laws surface via ministries",
    "bundesrat_neueingaenge": "raw legislative intake — too noisy",
    "gesetze_aktudienst": "same",
    "bfdi_news": "privacy — no funding angle",
    "hmbbfdi_news": "regional privacy — no funding angle",
    "bitkom_presse": "industry association; funding positions surface via press anyway",
    "bkarta_news": "cartel office — out of scope",
    "bmi_presse": "interior ministry — out of scope",
    "bnetza_presse": "network agency — out of scope",
    "bsi_presse": "IT security — out of scope",
    "bag_presse": "labour court — out of scope",
    "bgh_presse": "federal court — out of scope",
    "bverwg_presse": "administrative court — out of scope",
    "stiftung_datenschutz": "privacy foundation — out of scope",
    "golem_news": "consumer tech; gnews_de_funding catches funding pieces",
    "heise_news": "same",
    "irights_info": "digital rights/copyright — out of scope",
    "netzpolitik": "digital rights — out of scope",
}


def active(priority_max: int = 3) -> dict[str, dict]:
    """Registry entries at or above a priority cut, for extractor sync."""
    return {k: v for k, v in SOURCES.items() if v["priority"] <= priority_max}


if __name__ == "__main__":
    from collections import Counter
    tiers = Counter(v["tier"] for v in SOURCES.values())
    prios = Counter(v["priority"] for v in SOURCES.values())
    countries = Counter(v["country"] or "EU" for v in SOURCES.values())
    print(f"{len(SOURCES)} sources kept, {len(DROPPED)} dropped")
    print("by tier:    ", dict(tiers))
    print("by priority:", dict(sorted(prios.items())))
    print("by country: ", dict(countries))
    missing_url = [k for k, v in SOURCES.items() if not v["url"]]
    print(f"URLs to locate at extractor build: {len(missing_url)} → {', '.join(missing_url)}")


# ── HTML adapter config (2026-07-09) ─────────────────────────────────────────
# Per-source scraping hints for kind=html sources, consumed by news_ingest's
# generic harvester. `link_pattern` is a regex matched against ABSOLUTE hrefs
# found on the listing page; matches are treated as article pages and fetched
# in full (title from og:title/<h1>, date from article:published_time/<time>,
# body via extract_main_text). `page_param` + `max_pages` crawl Drupal-style
# pagination (?page=N) for archive depth. mode="page" = the URL itself is the
# document (strategy hubs): stored once, re-stored when its content changes.
# Sources absent here (or js_rendered) are skipped with a log line — the
# honest "needs a real adapter" list.
HTML_ADAPTERS: dict[str, dict] = {
    # EC family (Drupal, ?page=N pagination works)
    "eic_news":      {"link_pattern": r"eic\.ec\.europa\.eu/news/[^\s\"'?#]+_en",
                      "page_param": "page", "max_pages": 25},
    "eismea_news":   {"link_pattern": r"eismea\.ec\.europa\.eu/news/[^\s\"'?#]+_en",
                      "page_param": "page", "max_pages": 25},
    "ec_digital":    {"link_pattern": r"digital-strategy\.ec\.europa\.eu/en/news/[^\s\"'?#]+",
                      "page_param": "page", "max_pages": 25},
    "ec_rtd_news":   {"link_pattern": r"research-and-innovation\.ec\.europa\.eu/news/[^\s\"'?#]+_en",
                      "page_param": "page", "max_pages": 25},
    "cinea_news":    {"link_pattern": r"cinea\.ec\.europa\.eu/[^\s\"'?#]*news[^\s\"'?#]+_en",
                      "page_param": "page", "max_pages": 15},
    # EU institutions
    "eib_press":     {"listing": "https://www.eib.org/en/press/all/index.htm",
                      "link_pattern": r"eib\.org/en/press/all/\d{4}-\d+[^\s\"'?#]*"},
    "eif_news":      {"link_pattern": r"eif\.org/what_we_do/news/\d{4}/[^\s\"'?#]+"},
    "eca_press":     {"link_pattern": r"eca\.europa\.eu/en/news/[^\s\"'?#]+"},
    # Strategy hubs — the page IS the document
    "ec_grow_ecf":   {"mode": "page"},
    "ep_train_ecf":  {"mode": "page"},
    # JS-rendered portals — need real adapters, skip loudly
    "have_your_say": {"js_rendered": True},
    "oeil":          {"js_rendered": True},
    # France
    "bpifrance_presse": {"link_pattern": r"presse\.bpifrance\.fr/[a-z0-9][a-z0-9-]{24,}"},
    "sgpi_france2030":  {"mode": "page"},
    "ademe_presse":     {"link_pattern": r"presse\.ademe\.fr/[^\s\"'?#]*\d{4}[^\s\"'?#]+"},
    "dge_actualites":   {"link_pattern": r"entreprises\.gouv\.fr/fr/actualites/[^\s\"'?#]+"},
    "ccomptes_rapports": {"link_pattern": r"ccomptes\.fr/fr/publications/[^\s\"'?#]+"},
    # Germany
    "bmwe_presse":   {"js_rendered": True},   # BMWK listing is a JS app; gnews_de_funding carries it meanwhile
    "kfw_presse":    {"link_pattern": r"kfw\.de/[^\s\"'?#]*(?:Pressemitteilungen|News)[^\s\"'?#]+\.html"},
    "sprind_news":   {"js_rendered": True},   # sprind.org is a SPA; gnews_de_funding carries it meanwhile
    "startup_verband": {"link_pattern": r"startupverband\.de/[^\s\"'?#]*(?:presse|news)[^\s\"'?#]+"},
}
