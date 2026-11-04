"""ISO 2-letter ↔ SATR country bid mapping.

The SATR portal uses 3-letter Spring 'bid' identifiers like CountryDEU.
Our DB and the rest of the corpus use ISO 2-letter codes (DE, FR, etc.),
normalised by scripts.europe_scope.canonicalise_country.

Greek SATR uses 'GRC' (Country code 'EL' in the EC's own internal nomenclature
but ISO is GR). Mapping below uses the *ISO 2-letter* on the Wincent
side (GR, not EL), consistent with the rest of the corpus.

The EIB row in SATR (CountryEIB) is included for completeness but should NOT
be loaded as 'state aid' — EIB is an EU-direct instrument already covered by
extract_eib.py. The SATR EIB row is captured separately and used only for
cross-validation of EIB extractor coverage.
"""
from __future__ import annotations

# ISO2 → (SATR bid, English name)
SATR_COUNTRIES: dict[str, tuple[str, str]] = {
    "AT": ("CountryAUT", "Austria"),
    "BE": ("CountryBEL", "Belgium"),
    "BG": ("CountryBGR", "Bulgaria"),
    "HR": ("CountryHRV", "Croatia"),
    "CY": ("CountryCYP", "Cyprus"),
    "CZ": ("CountryCZE", "Czechia"),
    "DK": ("CountryDNK", "Denmark"),
    "EE": ("CountryEST", "Estonia"),
    "FI": ("CountryFIN", "Finland"),
    "FR": ("CountryFRA", "France"),
    "DE": ("CountryDEU", "Germany"),
    "GR": ("CountryGRC", "Greece"),
    "HU": ("CountryHUN", "Hungary"),
    "IS": ("CountryISL", "Iceland"),
    "IE": ("CountryIRL", "Ireland"),
    "IT": ("CountryITA", "Italy"),
    "LV": ("CountryLVA", "Latvia"),
    "LT": ("CountryLTU", "Lithuania"),
    "LU": ("CountryLUX", "Luxembourg"),
    "MT": ("CountryMLT", "Malta"),
    "NL": ("CountryNLD", "Netherlands"),
    "PT": ("CountryPRT", "Portugal"),
    "SK": ("CountrySVK", "Slovakia"),
    "SE": ("CountrySWE", "Sweden"),
    "GB": ("CountryGBR", "United Kingdom"),
}

# Countries that report state aid but NOT via the EC portal — handled by
# dedicated scripts in Sprint 15 Workstream B.
NATIONAL_PORTAL_COUNTRIES = {
    "PL": "SUDOP",
    "RO": "REGAS",
    "ES": "BDNS",       # already covered via extract_cdti.py
    "SI": "gov.si",
}


def to_bid(iso2: str) -> str:
    """Return SATR country bid for an ISO 2-letter code. Raises if not in scope."""
    iso2 = iso2.upper()
    if iso2 not in SATR_COUNTRIES:
        if iso2 in NATIONAL_PORTAL_COUNTRIES:
            raise ValueError(
                f"{iso2} uses national portal {NATIONAL_PORTAL_COUNTRIES[iso2]}, "
                "not the EC SATR portal."
            )
        raise ValueError(f"Country {iso2} not in SATR scope.")
    return SATR_COUNTRIES[iso2][0]


def name(iso2: str) -> str:
    """Return English country name."""
    return SATR_COUNTRIES[iso2.upper()][1]
