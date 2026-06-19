"""Multilingual stoplist for the deterministic merge pipeline.

Tokens that must NEVER anchor a brand merge: legal forms, generic org-type words,
geographies/directions, and common given names (the first-name false-bridge class).
Seed list — extend from the document-frequency ranking as new generics surface.
Deliberately EXCLUDES brand tokens (nordisk, bosch, gamesa, gobain, liquide, ...).
All entries are lowercase, ASCII-folded (match against the same normalisation).
"""

LEGAL = {
    # German / Austrian / Swiss
    "gmbh", "mbh", "ag", "kg", "kgaa", "ohg", "gbr", "ug", "se", "eg", "gesmbh",
    # French / Belgian
    "sa", "sas", "sasu", "sarl", "sca", "snc", "scs", "scop", "sci", "eurl", "gie",
    # Italian
    "srl", "srls", "spa", "sapa", "scarl", "scrl", "sas",
    # Spanish / Portuguese
    "sl", "slu", "slne", "sau", "slp", "sociedad", "anonima", "limitada", "lda",
    "sociedade", "sgps", "scl",
    # Dutch
    "bv", "nv", "cv", "vof", "cvba", "bvba",
    # Nordic
    "oy", "oyj", "ab", "asa", "aps", "ks", "hf", "ehf", "is",
    # UK / US / Irish
    "ltd", "limited", "plc", "llp", "llc", "inc", "corp", "co", "company", "teoranta",
    # Central / Eastern Europe
    "kft", "zrt", "bt", "nyrt", "kkt", "spzoo", "zoo", "sp", "spk", "spj", "ska",
    "sro", "spol", "akz", "as", "ase", "doo", "dd", "doel", "ood", "ad", "eood",
    "sa", "srl", "pfa",
    # Baltic
    "sabiedriba", "ierobezotu", "atbildibu", "atbildiba", "uab", "uzdaroji",
    "akcine", "bendrove", "ab", "ou", "as", "sia", "vsi",
    # generic
    "and", "the", "of", "und", "et", "y", "e", "i", "de", "du", "des", "la", "le",
    "les", "del", "della", "di", "da", "van", "von", "der", "den",
}

ORG = {
    "societa", "societe", "sociedade", "cooperativa", "cooperative", "cooperatie",
    "kooperativ", "coop", "responsabilita", "responsabilite", "responsabilidad",
    "azienda", "agricola", "agricole", "agraria", "agricoltura", "fattoria",
    "cascina", "cantina", "groupement", "forestier", "forestiere", "foncier",
    "foncia", "comunidad", "comunita", "communaute", "propietarios", "proprietari",
    "eigenaars", "eigentumer", "universita", "universite", "universidad",
    "universitat", "university", "uniwersytet", "univerzita", "ulikool", "ecole",
    "scuola", "escuela", "schule", "hochschule", "institut", "instituto",
    "institutul", "istituto", "cercetare", "ricerca", "investigacion", "recherche",
    "forschung", "vyzkumny", "ustav", "badawcza", "siec", "druzstvo", "zemedelske",
    "vereniging", "association", "associazione", "asociacion", "asbl", "fondation",
    "fondazione", "fundacion", "fundacio", "fundacja", "stiftung", "foundation",
    "chambre", "camera", "chamber", "commerce", "industrie", "syndicat", "sindicato",
    "consorzio", "consorcio", "consortium", "federation", "federazione", "verband",
    "agglomeration", "metropole", "departement", "departemental", "regional",
    "regionale", "municipal", "comune", "commune", "ayuntamiento", "gemeinde",
    "kommune", "office", "tourisme", "turismo", "parc", "parco", "parque", "ferme",
    "centrale", "eolien", "eolienne", "eolico", "eolica", "solaire", "solar",
    "photovoltaique", "pole", "equilibre", "mixte", "hospital", "hopital",
    "ospedale", "clinica", "klinik", "casa", "cura", "ente", "agence", "agenzia",
    "agencia", "national", "nationale", "nazionale", "nacional", "research",
    "technology", "technologies", "solutions", "services", "service", "system",
    "systems", "group", "groupe", "gruppo", "grupo", "holding", "holdings",
    "international", "global", "europe", "deutschland",
}

GEO = {
    "europe", "european", "europeo", "europea", "europeenne", "germany", "france",
    "francia", "espana", "espagne", "spain", "italia", "italy", "italie",
    "nederland", "netherlands", "belgique", "belgium", "belgie", "danmark",
    "denmark", "sverige", "sweden", "norge", "norway", "suomi", "finland", "polska",
    "poland", "osterreich", "austria", "schweiz", "suisse", "switzerland",
    "portugal", "ireland", "eire", "hellas", "greece", "magyar", "hungary", "ceska",
    "czech", "slovensko", "slovakia", "romania", "bulgaria", "hrvatska", "croatia",
    "slovenija", "slovenia", "eesti", "estonia", "latvija", "latvia", "lietuva",
    "lithuania", "luxembourg", "malta", "cyprus", "island", "iceland",
    "north", "south", "east", "west", "nord", "sud", "est", "ouest", "ovest",
    "norte", "sur", "central", "centrale",
}

# Common given names across EU languages — prevents "Josef X" ↔ "Josef Y" bridges.
FIRST_NAMES = {
    "josef", "joseph", "giuseppe", "jean", "pierre", "louis", "marie", "maria",
    "anna", "hans", "peter", "paul", "andrea", "antonio", "francesco", "giovanni",
    "luigi", "mario", "carlo", "carlos", "juan", "jose", "manuel", "david",
    "michael", "thomas", "martin", "andreas", "stefan", "jan", "jens", "lars",
    "erik", "nils", "per", "sven", "henrik", "mette", "karl", "franz", "georg",
    "heinrich", "wilhelm", "johann", "johannes", "robert", "richard", "frank",
    "klaus", "werner", "helmut", "angelo", "salvatore", "vincenzo", "roberto",
    "marco", "paolo", "alessandro", "matteo", "lukas", "felix", "max", "anton",
}

# Generic industry / descriptor terms and multilingual org words that, in pairs,
# bridge unrelated firms (surfaced by the global dry run). Both tokens of a brand
# bigram must clear these.
GENERIC2 = {
    # English industry/descriptor
    "real", "estate", "artificial", "intelligence", "united", "nations", "energy",
    "digital", "smart", "green", "tech", "data", "cyber", "cloud", "medical",
    "pharma", "auto", "motors", "mobility", "power", "water", "food", "agro",
    "capital", "ventures", "partners", "partner", "consulting", "engineering",
    "electronics", "advanced", "renewable", "industries", "industrial", "logistics",
    "telecom", "telecommunications", "networks", "labs", "laboratories", "studio",
    "media", "finance", "financial", "insurance", "bank", "banca", "banque",
    # Italian university/org
    "degli", "studi", "studii",
    # French org
    "centre", "hospitalier", "hospitaliere", "universitaire", "national", "nationale",
    "intercommunal", "interhospitalier",
    # Romanian R&D
    "dezvoltare", "pentru", "cercetari", "stiintifica",
    # French/other utility generics
    "energie", "energies", "syndicat", "departemental",
    # Greek/Cyrillic generic legal terms (transliterated forms that survive folding)
    "anonymi", "etaireia", "monoprosopi", "anonymos",
}

STOPLIST = LEGAL | ORG | GEO | FIRST_NAMES | GENERIC2


def is_distinctive(token: str) -> bool:
    """A token can anchor a brand merge only if it is long enough and not generic."""
    return len(token) >= 3 and token not in STOPLIST
