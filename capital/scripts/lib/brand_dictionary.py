"""Layer 2c — curated brand dictionary for the deterministic merge pipeline.

Maps an ANY-POSITION distinctive token to a canonical parent, to close the recall
gap that rules 2a/2b leave on big names: single-token brands (Volkswagen),
sub-brand fragmentation (Siemens Healthcare/Gamesa -> Siemens), and founder-name
prefixes ('A.P. Moller Maersk' carries the token 'maersk'). Hand-curated and
conservative: only tokens that are unambiguous brand names — NOT short acronyms
(IQM ~ IQM Srl), generic words ('total', 'general'), or given/family names that
collide (Leonardo; 'moller' would hit every Möller firm — so we key on 'maersk').
Token-EXACT membership means 'bayer' never catches 'bayerische' (a different
token). DENY vetoes known traps by substring.

Every entry is reviewed once; precision is guarded downstream by the golden-
negative set, the cohesion audit, and the WATCHLIST consolidation gate.
"""

# distinctive token (any position)  ->  canonical parent label
BRANDS = {
    "siemens": "Siemens",
    "volkswagen": "Volkswagen",
    "airbus": "Airbus",
    "thales": "Thales",
    "philips": "Philips",
    "ericsson": "Ericsson",
    "nokia": "Nokia",
    "michelin": "Michelin",
    "nestle": "Nestle",
    "alstom": "Alstom",
    "valeo": "Valeo",
    # NB: 'vestas' deliberately excluded — collides with Vestas Aircoil A/S, a
    # different company. Conservative: omit single-token brands with known clashes.
    "continental": "Continental",
    "safran": "Safran",
    "infineon": "Infineon",
    "stmicroelectronics": "STMicroelectronics",
    "stellantis": "Stellantis",
    "basf": "BASF",
    "sanofi": "Sanofi",
    "bayer": "Bayer",
    "maersk": "Maersk",          # also catches 'A.P. Moller Maersk' (token 'maersk')
    "carlsberg": "Carlsberg",
    "bosch": "Bosch",
    "northvolt": "Northvolt",
    "einride": "Einride",
    # NB: 'schneider' excluded — too common a surname (Walter/Michael Schneider);
    # Schneider Electric still consolidates via the 2b 'schneider electric' bigram.
    "engie": "Engie",
    "dsv": "DSV",
    "totalenergies": "TotalEnergies",   # 'total' alone is too generic — excluded
    "orsted": "Orsted",
    # added from the ranked candidate review (scripts/brand_candidates.py) — all
    # unique multinational tokens; generics/surnames/city-clashes (heidelberg,
    # shell, renault, carl) deliberately excluded.
    "veolia": "Veolia",
    "rwe": "RWE",
    "nxp": "NXP",
    "arcelormittal": "ArcelorMittal",
    "arcelor": "ArcelorMittal",   # 'ARCELOR MITTAL' spelled as two words
    "holcim": "Holcim",
    "lhyfe": "Lhyfe",
    "daimler": "Daimler",
    "fraunhofer": "Fraunhofer",
    "kronospan": "Kronospan",
    "liquide": "Air Liquide",
}

# Brands that MUST consolidate to a single group — the apply step refuses if any
# of these spans more than one component (the "no 20-30 fragments" guarantee).
WATCHLIST = [
    "siemens", "bosch", "airbus", "thales", "volkswagen", "maersk", "engie",
    "dsv", "totalenergies", "orsted", "nokia", "ericsson", "philips", "sanofi",
    "continental", "michelin", "nestle", "safran", "valeo", "alstom", "infineon",
    "northvolt", "stellantis", "basf", "veolia", "rwe", "nxp", "arcelormittal",
    "holcim",
]

# substrings that VETO a brand match (the name is not that brand)
DENY = [
    "gimpera",      # Fundacio Bosch i Gimpera (Barcelona) != Bosch
    "bayerische", "bayern", "bayreuth", "bayer gradel",  # Bavaria != Bayer
    "schneider markus", "markus schneider",  # a person != Schneider Electric
    "continental group",  # Irish Continental Group (shipping) != Continental AG
]
