"""Canonical NDB-distributor taxonomy for SATR rows.

Maps the free-text strings that SATR exposes in granting_authority,
entrusted_entity, and financial_intermediaries to canonical NDB identifiers
that match the EuroInvTracker source-family taxonomy.

The canonical ids are lowercase snake_case and align with the `source` prefixes
of our direct-NDB scrapers where overlap exists (e.g. `kfw_capital` overlaps
with our Sprint 13 `kfw_capital_*` source-prefix; `htgf` overlaps with `htgf_*`).
Where no direct scraper exists yet, we still tag (e.g. `ffg`, `awssg`, `l_bank`)
so the corpus can be filtered by NDB even without separate ingestion.

Matching rule: case-insensitive substring match. ORDER MATTERS — more specific
patterns must come before more general ones (e.g. "Hightech Gründerfonds" before
"KfW" because HTGF is a KfW subsidiary but we want it tagged as htgf, not kfw).

Sprint 15 follow-up (2026-05-29).
"""
from __future__ import annotations

# (substring_pattern, canonical_ndb_id)
# Patterns are matched against any of granting_authority / entrusted_entity /
# financial_intermediaries. First match wins.
NDB_PATTERNS: list[tuple[str, str]] = [
    # ─── German Federal + Land NDBs ──────────────────────────────────────────
    ("Hightech Gründerfonds", "htgf"),
    ("Hightech Grunderfonds", "htgf"),
    ("Coparion", "coparion"),
    ("SPRIND", "sprind"),
    ("Sprunginnovationen", "sprind"),
    ("Bundesagentur für Sprunginnovationen", "sprind"),
    ("KfW Capital", "kfw_capital"),
    ("Kreditanstalt für Wiederaufbau", "kfw"),
    ("KfW", "kfw"),
    ("Landwirtschaftliche Rentenbank", "rentenbank"),
    ("L-Bank Baden-Württemberg", "l_bank"),
    ("L-Bank", "l_bank"),
    ("LfA Förderbank Bayern", "lfa_bayern"),
    ("LfA", "lfa_bayern"),
    ("Investitionsbank Berlin", "ibb_berlin"),
    ("Investitionsbank des Landes Brandenburg", "ilb_brandenburg"),
    ("Hamburgische Investitions", "ifb_hamburg"),
    ("Investitionsbank Schleswig-Holstein", "ib_sh"),
    ("Investitionsbank Sachsen-Anhalt", "ib_sa"),
    ("Sachsen_SAB", "sab_sachsen"),
    ("Sächsische Aufbaubank", "sab_sachsen"),
    ("Technologiegründerfonds Sachsen", "tgfs"),
    ("Forschungszentrum Jülich", "fz_juelich"),
    ("Projektträger Jülich", "fz_juelich"),
    ("Projektträger im DLR", "dlr"),
    ("DLR Raumfahrtagentur", "dlr"),
    ("Deutsches Zentrum für Luft- und Raumfahrt", "dlr"),
    ("VDI/VDE Innovation", "vdivde"),
    # German federal agencies with specific R&D/innovation mandate (NOT generic ministries)
    ("Bundesministerium für Bildung und Forschung", "bmbf"),   # R&D-specific ministry
    ("Bundesamt für Wirtschaft und Ausfuhrkontrolle", "bafa"), # specialist agency (energy/trade)
    # German Landesbanken not yet tagged
    ("NRW.BANK", "nrw_bank"),
    ("NBank Niedersachsen", "nbank"),
    ("NBank", "nbank"),
    ("Thüringer Aufbaubank", "tab"),
    ("Bremer Aufbau-Bank", "bab_bremen"),
    ("WIBank", "wibank"),
    ("Bayerische Forschungsstiftung", "bfs_bavaria"),

    # ─── Austrian NDB / R&D agencies ─────────────────────────────────────────
    ("Österreichische Forschungsförderungsgesellschaft", "ffg"),
    ("FFG", "ffg"),
    ("Austria Wirtschaftsservice", "awssg"),
    ("AWS", "awssg"),
    ("Kommunalkredit Public Consulting", "kpc_at"),
    ("Wirtschaftsagentur Wien", "wirtschaftsagentur_wien"),
    ("Kärntner Wirtschaftsförderungsfonds", "kwf_carinthia"),
    ("Steirische Wirtschaftsförderungsgesellschaft", "sfg_steiermark"),
    ("SFG", "sfg_steiermark"),

    # ─── Italian NDBs / public agencies ──────────────────────────────────────
    ("MedioCredito Centrale", "mediocredito_centrale"),
    ("Mediocredito centrale", "mediocredito_centrale"),
    ("MEDIOCREDITO CENTRALE", "mediocredito_centrale"),
    ("Invitalia", "invitalia"),
    ("Agenzia nazionale per l'attrazione degli investimenti", "invitalia"),
    ("SACE S.P.A.", "sace"),
    ("SACE SpA", "sace"),
    ("SACE", "sace"),
    ("Cassa Depositi e Prestiti", "cdp"),
    ("CDP Venture Capital", "cdp_vc"),
    ("CDP ", "cdp"),
    ("SIMEST", "simest"),
    # Italian agencies/bodies — only specialist agencies, NOT generic ministries or regional govts
    # MIMIT = Ministry of Enterprise: manages many company-direct grants → keep as it's
    # Italy's primary industrial policy body (equivalent to BMWK in Germany)
    ("Ministero delle Imprese e del Made in Italy", "mimit"),
    ("MINISTERO DELLE IMPRESE", "mimit"),
    # GSE = state-owned energy services company managing cleantech grants
    ("Gestore servizi Energetici", "gse_it"),
    ("GSE ", "gse_it"),
    # MUR = university/research ministry — R&D specific mandate
    ("MINISTERO DELL'UNIVERSITA' E DELLA RICERCA", "mur_it"),
    ("Ministero dell'Università e della Ricerca", "mur_it"),
    ("MINISTERO DELL'ISTRUZIONE DELL'UNIVERSITA' E DELLA RICERCA", "mur_it"),
    # MITE = environment/energy transition agency (became MASE)
    ("Ministero della Transizione Ecologica", "mite_it"),
    ("Ministero dell'ambiente", "mite_it"),
    # Regional development agencies (specialist bodies, not regional govts)
    ("Finpiemonte", "finpiemonte"),
    ("Lazio Innova", "lazio_innova"),
    ("Puglia Sviluppo", "puglia_sviluppo"),
    # Note: generic regional govts (Regione Lombardia, Friuli, Trento etc.) NOT tagged

    # ─── French NDBs ─────────────────────────────────────────────────────────
    ("Bpifrance", "bpifrance"),
    ("BPIFRANCE", "bpifrance"),
    ("BPI France", "bpifrance"),
    ("Caisse des Dépôts", "caisse_des_depots"),
    ("Caisse des Depots", "caisse_des_depots"),
    # Note: French general ministries (Ministère de l'économie, Transition écologique)
    # are NOT tagged — they are government departments, not development banks/agencies.

    # ─── Finnish ─────────────────────────────────────────────────────────────
    ("Business Finland Venture Capital", "business_finland_vc"),
    ("Innovaatiorahoituskeskus Business Finland", "business_finland"),
    ("Business Finland", "business_finland"),
    ("Tesi", "tesi"),
    ("Suomen Teollisuussijoitus", "tesi"),
    ("Finnvera", "finnvera"),
    ("elinvoimakeskus", "ely_fi"),   # ELY Centres = Finnish regional enterprise/innovation agencies
    ("Energiavirasto", "energiavirasto_fi"),

    # ─── Swedish ─────────────────────────────────────────────────────────────
    ("Vinnova", "vinnova"),
    ("Almi Företagspartner", "almi"),
    ("Almi Invest", "almi"),
    ("ALMI", "almi"),
    ("Energimyndigheten", "energimyndigheten"),
    ("Naturvårdsverket", "naturvardsverket"),
    ("Tillväxtverket", "tillvaxtverket"),
    ("Rymdstyrelsen", "rymdstyrelsen"),
    ("Formas", "formas_se"),

    # ─── Danish ──────────────────────────────────────────────────────────────
    ("EIFO", "eifo"),
    ("Eksport- og Investeringsfonden", "eifo"),
    ("Vækstfonden", "vaekstfonden"),
    ("Vaekstfonden", "vaekstfonden"),
    ("Innovationsfonden", "innovationsfonden"),
    ("EKF Danmarks", "ekf"),

    # ─── Dutch ───────────────────────────────────────────────────────────────
    ("Invest-NL", "invest_nl"),
    ("Invest NL", "invest_nl"),
    ("Rijksdienst voor ondernemend Nederland", "rvo"),
    ("RVO", "rvo"),
    # Ministerie van Economische Zaken = the ministry that runs RVO programs
    ("Ministerie van Economische Zaken", "rvo"),
    # Regional Dutch development agencies (specialist intermediaries, not generic govts)
    ("provincie Noord-Brabant", "bom"),
    ("Samenwerkingsverband Noord-Nederland", "nom"),
    # Note: Kansen voor West (EU cohesion fund), generic Dutch provinces NOT tagged

    # ─── Belgian regional ────────────────────────────────────────────────────
    # VLAIO = Agentschap Innoveren & Ondernemen (Flanders innovation grants)
    ("VLAIO", "vlaio"),
    ("Agentschap Innoveren", "vlaio"),
    # SPW DGO = Service Public de Wallonie (Walloon R&D grants)
    ("SPW DGO Economie", "spw_wallonie"),
    ("SPW DGO", "spw_wallonie"),
    ("SPW - DG Energie", "spw_energie"),
    # Innoviris = Brussels R&D agency
    ("Innoviris", "innoviris"),
    ("Brussel Economie en Werkgelegenheid", "bewe_brussels"),
    # EWI = Flanders Economy, Science and Innovation dept
    ("EWI", "ewi_flanders"),
    ("Participatie Maatschappij Vlaanderen", "pmv"),
    ("PMV", "pmv"),
    ("SOGEPA", "sogepa"),
    ("SRIW", "sriw"),
    ("Wallonie Entreprendre", "wallonie_entreprendre"),
    ("Finance.brussels", "finance_brussels"),
    ("SFPIM", "sfpim"),

    # ─── Polish (won't hit in SATR — Poland uses SUDOP — kept for completeness) ──
    ("PFR", "pfr"),
    ("Polski Fundusz Rozwoju", "pfr"),
    ("NCBR", "ncbr"),
    ("Narodowe Centrum Badań i Rozwoju", "ncbr"),
    ("BGK", "bgk"),
    ("Bank Gospodarstwa Krajowego", "bgk"),
    ("PARP", "parp"),

    # ─── Irish ───────────────────────────────────────────────────────────────
    ("Enterprise Ireland", "enterprise_ireland"),
    ("IDA Ireland", "ida_ireland"),
    ("Sustainable Energy Authority of Ireland", "seai"),
    ("SEAI", "seai"),

    # ─── Spanish ─────────────────────────────────────────────────────────────
    ("CDTI", "cdti"),
    ("Centro para el Desarrollo Tecnológico", "cdti"),
    ("COFIDES", "cofides"),
    ("ICO", "ico"),
    ("Instituto de Crédito Oficial", "ico"),
    ("ENISA", "enisa"),

    # ─── Greek ───────────────────────────────────────────────────────────────
    ("Ελληνική Αναπτυξιακή Τράπεζα", "hdb"),
    ("Hellenic Development Bank", "hdb"),
    # GSRT = General Secretariat for Research & Technology — specialist R&D body
    ("ΓΓΕΚ", "gsrt_gr"),
    ("Γενική Γραμματεία Έρευνας", "gsrt_gr"),
    # Note: Greek ESPA managing authorities, environment ministry NOT tagged — not NDBs

    # ─── Hungarian ───────────────────────────────────────────────────────────
    ("MFB Zrt", "mfb"),
    ("MFB", "mfb"),
    ("Magyar Fejlesztési Bank", "mfb"),
    ("Garantiqa", "garantiqa"),
    ("NKFIH", "nkfih"),
    ("Nemzeti Kutatási", "nkfih"),
    ("Hiventures", "hiventures"),
    ("Magyar Export-Import Bank", "exim_hu"),
    # Note: Hungarian ministries (Pénzügyminisztérium, Nemzetgazdasági etc.) NOT tagged — ministries

    # ─── Baltic ──────────────────────────────────────────────────────────────
    ("Attīstības finanšu institūcija Altum", "altum"),
    ("Altum", "altum"),
    ("Centrālā finanšu un līgumu aģentūra", "cfla"),
    ("CFLA", "cfla"),
    # Estonia: EIS = merged KredEx + Enterprise Estonia (2022)
    ("Ettevõtluse ja Innovatsiooni Sihtasutus", "eis"),
    ("Ettevõtluse Arendamise Sihtasutus", "eis"),   # old Enterprise Estonia name
    ("KredEx", "eis"),
    ("Keskkonnainvesteeringute Keskus", "kik_ee"),
    ("Invega", "invega"),
    ("UAB ILTE", "ilte"),
    ("Ekonomikos ir inovacijų ministerija", "ecomin_lt"),

    # ─── Portuguese ──────────────────────────────────────────────────────────
    ("Banco Português de Fomento", "bpf"),
    ("PME Investimentos", "pme_investimentos"),

    # ─── Czech ───────────────────────────────────────────────────────────────
    ("Národní rozvojová banka", "nrb_cz"),
    ("Českomoravská záruční", "cmzrb"),
    ("ČMZRB", "cmzrb"),
    ("CzechInvest", "czechinvest"),
    ("Technologická agentura ČR", "tacr"),
    # Note: Czech ministries (MPO, MŽP) NOT tagged — not specialist agencies

    # ─── Croatian ────────────────────────────────────────────────────────────
    ("Hrvatska banka za obnovu i razvitak", "hbor"),
    ("HBOR", "hbor"),
    ("Hrvatska agencija za malo gospodarstvo", "hamag_bicro"),
    ("HAMAG-BICRO", "hamag_bicro"),
    # Note: Croatian ministries NOT tagged — not specialist agencies

    # ─── Bulgarian ───────────────────────────────────────────────────────────
    ("Fund of Funds", "fof_bg"),
    ("Фонд на фондовете", "fof_bg"),
    ("Ministry of Innovation and Growth", "mig_bg"),

    # ─── Cypriot ─────────────────────────────────────────────────────────────
    ("Ίδρυμα Έρευνας και Καινοτομίας", "idek_cy"),
    ("ΙδΕΚ", "idek_cy"),
    ("Research and Innovation Foundation", "idek_cy"),

    # ─── Maltese ─────────────────────────────────────────────────────────────
    ("Malta Enterprise", "malta_enterprise"),

    # ─── Slovak ──────────────────────────────────────────────────────────────
    ("Slovenská inovačná a energetická agentúra", "siea_sk"),
    ("SIEA", "siea_sk"),
    ("Agentúra na podporu výskumu a vývoja", "apvv_sk"),
    ("APVV", "apvv_sk"),
    # Note: Slovak ministries NOT tagged — not development banks/agencies

    # ─── UK ──────────────────────────────────────────────────────────────────
    ("Innovate UK", "innovate_uk"),
    ("UKRI", "innovate_uk"),
    ("British Business Bank", "bbb_uk"),
    ("Invest NI", "invest_ni"),

    # Note: Portuguese cohesion fund managing authorities (COMPETE 2030 etc.) NOT tagged
    # Note: Luxembourg ministries NOT tagged

    # ─── EU bodies (intermediaries) ──────────────────────────────────────────
    ("EIF", "eif"),
    ("European Investment Fund", "eif"),
    ("European Investment Bank", "eib"),
]


def classify_ndb(*texts: str | None) -> str | None:
    """Return the canonical NDB id for the first matching pattern across any
    of the given text fields (granting_authority, entrusted_entity,
    financial_intermediaries). Returns None if no match.

    Match order respects NDB_PATTERNS — specific subsidiaries (HTGF, KfW Capital,
    CDP VC) win over their parent institution (KfW, CDP).
    """
    joined = " | ".join(t for t in texts if t)
    if not joined:
        return None
    lower = joined.lower()
    for pat, ndb_id in NDB_PATTERNS:
        if pat.lower() in lower:
            return ndb_id
    return None


# Direct-scraper source prefix → canonical NDB id. Used to unify the NDB layer
# across Sprint 13 direct-scraper rows (which populate `source` but not
# granting_authority) and the SATR rows (which populate granting_authority and
# friends). Lets a single `ndb_distributor` column give a complete institutional
# view of European public capital deployment.
SOURCE_PREFIX_TO_NDB: dict[str, str] = {
    "htgf_": "htgf",
    "coparion_": "coparion",
    "sprind_": "sprind",
    "cdti_": "cdti",
    "almi_": "almi",
    "cdp_vc_": "cdp_vc",
    "tesi_": "tesi",
    "invest_nl_": "invest_nl",
    "bpifrance_": "bpifrance",
    "enterprise_ireland_": "enterprise_ireland",
    "kfw_capital_": "kfw_capital",
    "saminvest_": "saminvest",
    # Sprint 16 (2026-05-30): central FR innovation registries — both
    # already match bpifrance_ above, but listed explicitly for clarity.
    "bpifrance_inov": "bpifrance",
    "bpifrance_pmup_": "bpifrance",
    "innovationsfonden_": "innovationsfonden",
    "eifo_": "eifo",
    "ademe_": "ademe",
    # sudop_ rows set ndb_distributor directly per-row from granting-authority
    # pattern match; no static prefix mapping here. See extract_sudop.classify_ndb.
    # Sprint 17 (2026-06-01): national thin-country registers
    "innovasjon_norge_": "innovasjon_norge",
    "nfr_": "nfr",
    "innosuisse_": "innosuisse",
    "altum_": "altum",
    "ilte_": "ilte",
    "eis_": "eis",
    "tacr_": "tacr",
    "bdns_": "bdns",
    "vinnova_": "vinnova",
    "business_finland_": "business_finland",
    "fr_region_": "fr_region",
}


def classify_ndb_from_source(source: str | None) -> str | None:
    """Return canonical NDB id from a Sprint-13 source prefix, or None."""
    if not source:
        return None
    for prefix, ndb_id in SOURCE_PREFIX_TO_NDB.items():
        if source.startswith(prefix):
            return ndb_id
    return None


# Add saminvest to the labels
NDB_LABELS_SUPPLEMENTAL = {"saminvest": "Saminvest (Sweden)"}


# Canonical labels for display
NDB_LABELS: dict[str, str] = {
    "kfw": "KfW",
    "kfw_capital": "KfW Capital",
    "htgf": "HTGF",
    "coparion": "Coparion",
    "sprind": "SPRIND",
    "rentenbank": "Landwirtschaftliche Rentenbank",
    "l_bank": "L-Bank (Baden-Württemberg)",
    "lfa_bayern": "LfA Förderbank Bayern",
    "ibb_berlin": "IBB Berlin",
    "ilb_brandenburg": "ILB Brandenburg",
    "ifb_hamburg": "IFB Hamburg",
    "ib_sh": "IB Schleswig-Holstein",
    "ib_sa": "IB Sachsen-Anhalt",
    "sab_sachsen": "SAB Sachsen",
    "tgfs": "Technologiegründerfonds Sachsen",
    "fz_juelich": "Forschungszentrum Jülich",
    "ffg": "FFG (Austria)",
    "awssg": "AWS (Austria Wirtschaftsservice)",
    "mediocredito_centrale": "MedioCredito Centrale",
    "invitalia": "Invitalia",
    "sace": "SACE",
    "cdp": "CDP",
    "cdp_vc": "CDP Venture Capital",
    "simest": "SIMEST",
    "bpifrance": "Bpifrance",
    "caisse_des_depots": "Caisse des Dépôts",
    "ademe": "ADEME (France)",
    "business_finland": "Business Finland",
    "business_finland_vc": "Business Finland Venture Capital",
    "tesi": "Tesi (Finnish Industry Investment)",
    "finnvera": "Finnvera",
    "vinnova": "Vinnova",
    "almi": "Almi Invest",
    "eifo": "EIFO",
    "vaekstfonden": "Vækstfonden (legacy → EIFO)",
    "innovationsfonden": "Innovationsfonden",
    "ekf": "EKF Denmark",
    "invest_nl": "Invest-NL",
    "rvo": "RVO Netherlands",
    "pmv": "PMV (Flanders)",
    "sogepa": "SOGEPA (Wallonia)",
    "sriw": "SRIW (Wallonia)",
    "wallonie_entreprendre": "Wallonie Entreprendre",
    "finance_brussels": "Finance.brussels",
    "sfpim": "SFPIM",
    "pfr": "PFR (Poland)",
    "ncbr": "NCBR (Poland)",
    "bgk": "BGK (Poland)",
    "parp": "PARP (Poland)",
    "enterprise_ireland": "Enterprise Ireland",
    "cdti": "CDTI (Spain)",
    "cofides": "COFIDES",
    "ico": "ICO (Spain)",
    "enisa": "ENISA (Spain)",
    "hdb": "Hellenic Development Bank",
    "mfb": "MFB (Hungary)",
    "garantiqa": "Garantiqa (Hungary)",
    "altum": "Altum (Latvia)",
    "kredex": "KredEx (Estonia)",
    "invega": "Invega (Lithuania)",
    "ilte": "ILTE (Lithuania)",
    "bpf": "Banco Português de Fomento",
    "pme_investimentos": "PME Investimentos (Portugal)",
    "nrb_cz": "Národní rozvojová banka (Czech)",
    "cmzrb": "ČMZRB / NRB (Czech)",
    "czechinvest": "CzechInvest",
    "eif": "European Investment Fund",
    "eib": "European Investment Bank",
    "saminvest": "Saminvest (Sweden)",
    # Sprint 17 — full SATR tagging pass
    "bmbf": "BMBF (German Federal Research Ministry)",
    "bmwk": "BMWK (German Federal Economics Ministry)",
    "bafa": "BAFA (German Federal Office Economics & Export Control)",
    "dlr": "DLR Projektträger (German Aerospace/R&D Agency)",
    "vdivde": "VDI/VDE Innovation und Technik",
    "nrw_bank": "NRW.BANK",
    "nbank": "NBank (Lower Saxony)",
    "tab": "Thüringer Aufbaubank",
    "bab_bremen": "Bremer Aufbau-Bank",
    "wibank": "WIBank (Hesse)",
    "bfs_bavaria": "Bayerische Forschungsstiftung",
    "kpc_at": "Kommunalkredit Public Consulting (Austria)",
    "wirtschaftsagentur_wien": "Wirtschaftsagentur Wien",
    "kwf_carinthia": "KWF (Carinthia)",
    "sfg_steiermark": "SFG (Styria)",
    "mimit": "MIMIT (Italian Ministry of Enterprise)",
    "gse_it": "GSE (Italian Energy Services Manager)",
    "mur_it": "MUR (Italian Ministry of Universities and Research)",
    "mite_it": "MITE (Italian Ecological Transition Ministry)",
    "finpiemonte": "Finpiemonte (Piedmont)",
    "lazio_innova": "Lazio Innova",
    "mef_fr": "Ministère de l'Économie (France)",
    "mte_fr": "Ministère de la Transition Écologique (France)",
    "tem_fi": "TEM (Finnish Ministry of Economy and Employment)",
    "ely_fi": "ELY Centres (Finnish Regional Development)",
    "energiavirasto_fi": "Energiavirasto (Finnish Energy Authority)",
    "energimyndigheten": "Energimyndigheten (Swedish Energy Agency)",
    "naturvardsverket": "Naturvårdsverket (Swedish Environment Agency)",
    "tillvaxtverket": "Tillväxtverket (Swedish Growth Agency)",
    "rymdstyrelsen": "Rymdstyrelsen (Swedish Space Agency)",
    "formas_se": "Formas (Swedish Research Council for Environment)",
    "ida_ireland": "IDA Ireland",
    "seai": "SEAI (Irish Sustainable Energy Authority)",
    "tacr": "TAČR (Czech Technology Agency)",
    "mpo_cz": "MPO (Czech Ministry of Industry and Trade)",
    "mzp_cz": "MŽP (Czech Environment Ministry)",
    "nkfih": "NKFIH (Hungarian National R&D Fund)",
    "hiventures": "Hiventures (Hungary)",
    "exim_hu": "Magyar Eximbank",
    "cfla": "CFLA (Latvian Central Finance and Contracting Agency)",
    "kik_ee": "KIK (Estonian Environmental Investment Centre)",
    "ecomin_lt": "Lithuanian Ministry of Economy and Innovation",
    "hbor": "HBOR (Croatian Development Bank)",
    "hamag_bicro": "HAMAG-BICRO (Croatia)",
    "fof_bg": "Fund of Funds Bulgaria",
    "idek_cy": "ΙδΕΚ (Cyprus Research & Innovation Foundation)",
    "malta_enterprise": "Malta Enterprise",
    "siea_sk": "SIEA (Slovak Innovation & Energy Agency)",
    "apvv_sk": "APVV (Slovak Research Agency)",
    "innovate_uk": "Innovate UK / UKRI",
    "bbb_uk": "British Business Bank",
    "invest_ni": "Invest Northern Ireland",
    "compete_pt": "COMPETE / PT2030 (Portuguese cohesion funds)",
    "lu_economie": "Ministère de l'Économie (Luxembourg)",
    "lu_energie": "Ministère de l'Énergie (Luxembourg)",
    # Sprint 17 — Belgian and Dutch granting authorities now tagged
    "vlaio": "VLAIO (Flanders Innovation & Entrepreneurship)",
    "spw_wallonie": "SPW DGO Économie (Wallonia)",
    "innoviris": "Innoviris (Brussels R&D)",
    "bom": "BOM (Brabantse Ontwikkelingsmaatschappij)",
    "nom": "NOM (Noord-Nederland Ontwikkeling)",
    # Sprint 17 additions
    "innovasjon_norge": "Innovasjon Norge",
    "nfr": "Norges Forskningsråd",
    "innosuisse": "Innosuisse (Switzerland)",
    "eis": "EIS (KredEx + Enterprise Estonia)",
    "tacr": "TAČR (Czech Republic)",
    "bdns": "Spain BDNS (regional agencies)",
    "fr_region": "French Regional Innovation Grants",
}
