"""Layer 2c — curated brand dictionary for the deterministic merge pipeline.

Maps a company's LEADING DISTINCTIVE TOKEN to a canonical parent, to close the
recall gap that rules 2a/2b leave on big names (single-token brands like
Volkswagen, and sub-brand fragmentation like Siemens Healthcare vs Siemens
Gamesa). Hand-curated and conservative: only tokens that are unambiguous brand
names — NOT short acronyms (IQM ~ IQM Srl) or given names (Leonardo) that collide
with unrelated firms. Token-exact matching means 'bayer' never catches
'bayerische' (a different token). DENY vetoes known traps by substring.

Every entry is reviewed once; precision is guarded downstream by the golden-
negative set, the cohesion audit, and the sanity check.
"""

# leading distinctive token  ->  canonical parent label
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
    "vestas": "Vestas",
    "alstom": "Alstom",
    "valeo": "Valeo",
    "continental": "Continental",
    "safran": "Safran",
    "infineon": "Infineon",
    "stmicroelectronics": "STMicroelectronics",
    "stellantis": "Stellantis",
    "basf": "BASF",
    "sanofi": "Sanofi",
    "bayer": "Bayer",
    "maersk": "Maersk",
    "carlsberg": "Carlsberg",
    "bosch": "Bosch",
    "northvolt": "Northvolt",
    "einride": "Einride",
    "schneider": "Schneider Electric",  # 'schneider markus' is vetoed below
}

# substrings that VETO a brand match (the name is not that brand)
DENY = [
    "gimpera",      # Fundacio Bosch i Gimpera (Barcelona) != Bosch
    "bayerische", "bayern", "bayreuth", "bayer gradel",  # Bavaria != Bayer
    "schneider markus", "markus schneider",  # a person != Schneider Electric
    "continental group",  # Irish Continental Group (shipping) != Continental AG
]
