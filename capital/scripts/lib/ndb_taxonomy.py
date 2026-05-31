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

    # ─── Austrian NDB / R&D agencies ─────────────────────────────────────────
    ("Österreichische Forschungsförderungsgesellschaft", "ffg"),
    ("FFG", "ffg"),
    ("Austria Wirtschaftsservice", "awssg"),
    ("AWS", "awssg"),

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

    # ─── French NDBs ─────────────────────────────────────────────────────────
    ("Bpifrance", "bpifrance"),
    ("BPIFRANCE", "bpifrance"),
    ("BPI France", "bpifrance"),
    ("Caisse des Dépôts", "caisse_des_depots"),
    ("Caisse des Depots", "caisse_des_depots"),

    # ─── Finnish ─────────────────────────────────────────────────────────────
    ("Business Finland Venture Capital", "business_finland_vc"),
    ("Innovaatiorahoituskeskus Business Finland", "business_finland"),
    ("Business Finland", "business_finland"),
    ("Tesi", "tesi"),
    ("Suomen Teollisuussijoitus", "tesi"),
    ("Finnvera", "finnvera"),

    # ─── Swedish ─────────────────────────────────────────────────────────────
    ("Vinnova", "vinnova"),
    ("Almi Företagspartner", "almi"),
    ("Almi Invest", "almi"),
    ("ALMI", "almi"),

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

    # ─── Belgian regional ────────────────────────────────────────────────────
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

    # ─── Hungarian ───────────────────────────────────────────────────────────
    ("MFB Zrt", "mfb"),
    ("MFB", "mfb"),
    ("Magyar Fejlesztési Bank", "mfb"),
    ("Garantiqa", "garantiqa"),

    # ─── Baltic ──────────────────────────────────────────────────────────────
    ("Attīstības finanšu institūcija Altum", "altum"),
    ("Altum", "altum"),
    ("KredEx", "kredex"),
    ("Invega", "invega"),
    ("UAB ILTE", "ilte"),

    # ─── Portuguese ──────────────────────────────────────────────────────────
    ("Banco Português de Fomento", "bpf"),
    ("PME Investimentos", "pme_investimentos"),

    # ─── Czech ───────────────────────────────────────────────────────────────
    ("Národní rozvojová banka", "nrb_cz"),
    ("Českomoravská záruční", "cmzrb"),
    ("ČMZRB", "cmzrb"),
    ("CzechInvest", "czechinvest"),

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
}
