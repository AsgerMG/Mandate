"""Extract Chips JU / KDT JU awarded projects from the chips-ju.europa.eu portal.

Data source:
  - chips-ju.europa.eu OData API (Dynamics 365/PowerApps portal backend):
      GET /_api/shv_webprojectses?$filter=shv_jueratype eq 920810000
    Returns one row per awarded project with the KDT JU coordinator institution,
    total public funding (EU + member-state contributions combined), call year,
    and start date. The Chips JU's R&D&I calls under the Chips Act mandate (2024+)
    have not yet been published in this portal.

Scope (v1, sprint 5):
  - 35 KDT JU projects spanning call years 2020–2023 (the JU itself labels the
    2 early "call year 2020" projects as KDT-era; both started in 2021).
  - All ECSEL JU projects (pre-2021) are filtered out by the jueratype eq 920810000
    predicate.
  - **KDT 2023 is incomplete** — only 4 of the ~25 expected projects are loaded in
    the portal as of 2026-05-21 (SMARTY was added Oct 2025). Re-running the
    extractor is idempotent and will pick up the rest once the portal is updated.
  - Chips JU proper calls (post-2024) are NOT in the portal yet; not in scope.

Coordinator-only capture (Option A): same caveat as Innovation Fund — see
[project_innovation_fund_workarounds.md](memory). The portal does NOT expose the
full beneficiary list per project; only the lead institution.

Amount: `shv_totalinvestment` is the **total JU public grant** (EU + national
member-state contributions combined into one figure). The EU-only share is
roughly half but is not published per project. Stored in `grant_amount_eur`;
methodology.md documents the caveat (same pattern as IPCEI state-aid totals).

Run modes:
  python extract_chips_ju.py             → fetch + CSV only (no DB write)
  python extract_chips_ju.py --load-db   → fetch + match + load into db.sqlite
"""
from __future__ import annotations

import csv
import json
import re
import sqlite3
import subprocess
import sys
from difflib import SequenceMatcher
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
RAW_DIR = BASE_DIR / "data" / "raw" / "chips_ju"
OUT_DIR = BASE_DIR / "data" / "processed"
OUT_DIR.mkdir(parents=True, exist_ok=True)
RAW_DIR.mkdir(parents=True, exist_ok=True)

RAW_JSON = RAW_DIR / "chips_ju_projects.json"
CSV_PATH = OUT_DIR / "chips_ju_projects.csv"
MATCH_CSV_PATH = OUT_DIR / "chips_ju_match_summary.csv"
DB_PATH = BASE_DIR / "db.sqlite"

PORTAL_BASE = "https://www.chips-ju.europa.eu"
# OData endpoint discovered from the page source of /projects/
API_URL = (
    PORTAL_BASE
    + "/_api/shv_webprojectses"
    + "?$filter=shv_jueratype%20eq%20920810000"  # KDT era (excludes ECSEL=920810001)
    + "&$select=shv_webprojectsid,shv_name,shv_titlecontent,shv_institution,"
      "shv_countries,shv_totalinvestment,shv_year,shv_startdate,shv_category,"
      "shv_description,shv_participatingorganization,shv_website"
    + "&$orderby=shv_year%20asc,shv_name%20asc&$top=200"
)
PROJECT_URL_TEMPLATE = PORTAL_BASE + "/Project-detail?id={id}"

# ---------------------------------------------------------------------------
# Call year → (source_id, awarded_date) mapping
# ---------------------------------------------------------------------------

# Awarded-date is the call's grant-signature year start; projects from the same
# call all roll up to the same source_id (mirroring IPCEI's per-decision source).
CALL_TO_SOURCE: dict[int, tuple[str, str]] = {
    2020: ("chips_ju_kdt_2020", "2021-01-01"),   # KDT JU transition projects
    2021: ("chips_ju_kdt_2021", "2022-01-01"),
    2022: ("chips_ju_kdt_2022", "2023-01-01"),
    2023: ("chips_ju_kdt_2023", "2024-01-01"),
}

# All Chips JU / KDT JU sources → deeptech_hardware (semiconductors by definition).
# Imported by classify.py — single source of truth (same pattern as IF_SOURCE_SECTOR).
CHIPS_JU_SOURCE_SECTOR: dict[str, str] = {
    src: "deeptech_hardware" for src, _ in CALL_TO_SOURCE.values()
}


# ---------------------------------------------------------------------------
# Coordinator-country derivation
# ---------------------------------------------------------------------------
#
# The portal does NOT expose the coordinator country separately — only the full
# list of participating countries (shv_countries) for the whole consortium.
# We derive the coordinator country from the institution name using:
#   1. Explicit country mention in the name ("GERMANY", "AUSTRIA", "NEDERLAND"…)
#   2. Language-specific institution patterns (POLYTECHNEIO → GR, SCUOLA → IT…)
#   3. Known organisation overrides (ASML→NL, IMEC→BE, Infineon AG→DE…)
# The result is then validated against shv_countries; if mismatch, we fall back
# to the participating-countries list (taking the first one alphabetically as a
# soft fallback — this only happens when both heuristics fail).
# After exact/fuzzy match against the existing companies table, a matched row
# will inherit the existing canonical country, so this derivation only fires
# for NEW companies that we're inserting fresh.

_EXPLICIT_COUNTRY_MARKERS: list[tuple[str, str]] = [
    # Order matters — more specific patterns first
    (r"\bAUSTRIA\b|\b[OÖ]STERREICH\b", "AT"),
    (r"\bGERMANY\b|\bDEUTSCHLAND\b", "DE"),
    (r"\bFRANCE\b|\bFRAN[ÇC]AIS\b", "FR"),
    (r"\bITALIA\b|\bITALY\b|\bITALIAN\b", "IT"),
    (r"\bNEDERLAND\b|\bNETHERLANDS?\b", "NL"),
    (r"\bBELGIQUE\b|\bBELGI[EË]\b|\bBELGIUM\b", "BE"),
    (r"\bESPA[ÑN]A\b|\bSPAIN\b|\bSPANISH\b", "ES"),
    (r"\bSWEDEN\b|\bSVERIGE\b", "SE"),
    (r"\bNORWAY\b|\bNORGE\b", "NO"),
    (r"\bDENMARK\b|\bDANMARK\b", "DK"),
    (r"\bFINLAND\b|\bSUOMI\b", "FI"),
    (r"\bPOLAND\b|\bPOLSKA\b", "PL"),
    (r"\bPORTUGAL\b", "PT"),
    (r"\bGREECE\b|\bHELLENIC\b|\bHELLAS\b", "GR"),
    (r"\bIRELAND\b", "IE"),
    (r"\bCZECH\b|\b[ČC]ESK[ÁA]\b", "CZ"),
    (r"\bSLOVAK\b", "SK"),
    (r"\bSLOVEN", "SI"),
    (r"\bHUNGAR\b|\bMAGYAR\b", "HU"),
    (r"\bROMANIA\b", "RO"),
    (r"\bSWISS\b|\bSCHWEIZ\b|\bSUISSE\b", "CH"),
    (r"\bISRAEL\b", "IL"),
    (r"\bT[UÜ]RK[IİY]\b|\bTURKEY\b", "TR"),
]

# Institution-name patterns indicating a national language/origin
_LANGUAGE_PATTERNS: list[tuple[str, str]] = [
    (r"\bPOLYTECHNEIO\b|\bPANEPISTIMI|\bEREVNAS\b|\bDEMOKRITOS\b", "GR"),
    (r"\bSCUOLA SUPERIORE\b|\bUNIVERSIT[ÀA]\b|\bCONSORZIO\b|"
     r"\bPOLITECNICO\b|\bINTERUNIVERSITARIO\b", "IT"),
    (r"\bLULE[ÅA] TEKNISKA\b|\bKUNGLIGA\b|\bUPPSALA\b|\bKOMATSU FOREST\b", "SE"),
    (r"\bSINTEF\b", "NO"),
    (r"\bCOMMISSARIAT\b|\bUNIVERSITE\b|\bUNIVERSIT[ÉE]\b|\bCNRS\b|\bINRIA\b|"
     r"\bLYNRED\b", "FR"),
    (r"\bINTERUNIVERSITAIR MICRO|\bIMEC\b", "BE"),
    (r"\bNATIONAL INSTITUTE FOR R&D IN MICROTECHNOLOG", "RO"),
]

# Hardcoded org-level overrides (well-known multi-country corporates). Lookup is
# case-insensitive: keys are stored uppercased, the lookup uppercases the input.
_KNOWN_ORG_COUNTRIES: dict[str, str] = {
    k.upper(): v for k, v in {
        "ASML NETHERLANDS B.V.": "NL",
        "ASML NETHERLANDS B.V. (ASML)": "NL",
        "SIOUX TECHNOLOGIES BV": "NL",
        "PHILIPS ELECTRONICS NEDERLAND BV": "NL",
        "INFINEON TECHNOLOGIES AG": "DE",
        "INFINEON TECHNOLOGIES AG (IFAG": "DE",
        "AVL LIST GMBH": "AT",
        "AVL LIST GMBH (AVL)": "AT",
        "STMICROELECTRONICS SA (ST-SA)": "FR",   # ST is FR-IT; SA = French entity
        "PERTIMM DEVELOPPEMENT (PERTIMM)": "FR",
        "X-FAB France": "FR",
        "COGNITECHNA SRO (COG)": "CZ",
        "UNIVERSITY OF BOLOGNA": "IT",
    }.items()
}


def _country_in_consortium(iso: str | None, countries_raw: str | None) -> bool:
    """Return True if iso is in the formatted participating-countries field."""
    if not iso or not countries_raw:
        return True  # don't gate on this if we don't have the list
    return iso in countries_raw


def derive_coordinator_country(
    institution: str, participating_countries: str | None
) -> str | None:
    """Return ISO2 country code for the coordinator, or None if undetermined.

    Priority: explicit country names in institution name > language patterns >
    known-org overrides > first country in the participating-countries list.
    """
    if not institution:
        return None

    name_upper = institution.upper()

    # 0. Hardcoded overrides for known orgs (case-insensitive)
    if name_upper in _KNOWN_ORG_COUNTRIES:
        return _KNOWN_ORG_COUNTRIES[name_upper]

    # 1. Explicit country mention
    for pattern, iso in _EXPLICIT_COUNTRY_MARKERS:
        if re.search(pattern, name_upper):
            if _country_in_consortium(iso, participating_countries):
                return iso

    # 2. Language-specific institution patterns
    for pattern, iso in _LANGUAGE_PATTERNS:
        if re.search(pattern, name_upper):
            if _country_in_consortium(iso, participating_countries):
                return iso

    # 3. First country in the participating-countries field as soft fallback.
    # Format is "DE-Germany; DK-Denmark; ..." (semicolon-separated, ISO2 prefix).
    if participating_countries:
        m = re.match(r"\s*([A-Z]{2})-", participating_countries)
        if m:
            return m.group(1)

    return None


# ---------------------------------------------------------------------------
# API fetching
# ---------------------------------------------------------------------------

def fetch_projects(force_refresh: bool = False) -> list[dict]:
    """Fetch the project list from the chips-ju.europa.eu OData API.

    Caches the raw response to data/raw/chips_ju/chips_ju_projects.json.
    Uses curl to avoid macOS Python SSL trust-store issues with europa.eu
    (same workaround as extract_eib.py / extract_innovation_fund.py).
    """
    if not force_refresh and RAW_JSON.exists() and RAW_JSON.stat().st_size > 1000:
        with open(RAW_JSON) as f:
            return json.load(f)["value"]

    result = subprocess.run(
        ["curl", "-sL", "-H", "User-Agent: Mozilla/5.0",
         "-H", "Accept: application/json", API_URL],
        capture_output=True, timeout=60,
    )
    if result.returncode != 0:
        raise RuntimeError(f"curl failed: {result.stderr.decode()[:200]}")
    data = json.loads(result.stdout)
    with open(RAW_JSON, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return data["value"]


# ---------------------------------------------------------------------------
# Name normalisation (mirrors extract_innovation_fund.py)
# ---------------------------------------------------------------------------

_NORM_LEGAL_RE = re.compile(
    r"\b(?:GmbH|gGmbH|mbH|AG|KG|UG|GesmbH|"
    r"BV|NV|"
    r"SAS|SARL|SASU|SCA|"
    r"SRL|S\.r\.l\.|SpA|S\.p\.A\.|Srls|SCPA|"
    r"SRO|s\.r\.o\.|"
    r"SL|SLU|SLL|SLNE|SAU|"
    r"Ltd|Limited|PLC|LLC|LLP|Inc|Corp|"
    r"AB|ApS|AS|"
    r"Oy|Oyj|hf|ehf|"
    r"DOO|d\.o\.o\.|DD|UAB|OOO|"
    r"Lda|CRL|Scrl|"
    r"EE|IKE|"
    r"Zrt|Kft|Nyrt|"
    r"SE|SA)\b",
    re.IGNORECASE,
)
_NORM_PUNCT_RE = re.compile(r"[,.\-_/\\&]+")
_NORM_PAREN_RE = re.compile(r"\([^)]*\)")  # strip trailing acronym parens like "(IFAT)"
_NORM_WS_RE = re.compile(r"\s+")


def normalize_name(s: str) -> str:
    s = _NORM_PAREN_RE.sub(" ", s)        # drop "(IFAT)" / "(LYNRED)" parens first
    s = _NORM_LEGAL_RE.sub("", s)
    s = _NORM_PUNCT_RE.sub(" ", s)
    return _NORM_WS_RE.sub(" ", s).strip().lower()


# ---------------------------------------------------------------------------
# Main extraction
# ---------------------------------------------------------------------------

def extract_all(force_refresh: bool = False) -> list[dict]:
    projects = fetch_projects(force_refresh=force_refresh)
    rows: list[dict] = []
    unmapped_years: set[int] = set()

    for p in projects:
        year = p.get("shv_year")
        src_info = CALL_TO_SOURCE.get(year) if year is not None else None
        if src_info is None:
            unmapped_years.add(year)
            continue
        source_id, awarded_date = src_info

        acronym = (p.get("shv_name") or "").strip()
        if not acronym:
            continue

        institution = (p.get("shv_institution") or "").strip()
        countries_raw = p.get("shv_countries@OData.Community.Display.V1.FormattedValue") or ""
        country = derive_coordinator_country(institution, countries_raw)

        grant_eur = p.get("shv_totalinvestment")
        try:
            grant_eur = float(grant_eur) if grant_eur is not None else None
        except (TypeError, ValueError):
            grant_eur = None

        start_date = p.get("shv_startdate") or awarded_date
        title = (p.get("shv_titlecontent") or "").strip()
        description = (p.get("shv_description") or "").strip() or title
        category = (p.get("shv_category@OData.Community.Display.V1.FormattedValue") or "").strip()

        # sector_tags_raw: "Semiconductors" + portal category for sub-sector queries.
        # Classifier's DEEPTECH_TAGS gets "Semiconductors" added so the tag-match
        # path resolves to deeptech_hardware directly.
        sector_parts = ["Semiconductors"]
        if category and category.lower() != "other":
            sector_parts.append(category)
        sector_tags_raw = ", ".join(sector_parts)

        rows.append({
            "source": source_id,
            "call_id": f"{source_id}_{acronym[:40].replace(' ', '_').lower()}",
            "project_acronym": acronym[:200],
            "project_title": title[:300],
            "coordinator_name": institution,
            "country": country or "",
            "participating_countries": countries_raw,
            "n_partners": p.get("shv_participatingorganization"),
            "description": description[:500],
            "grant_eur": grant_eur,
            "awarded_date": awarded_date,
            "started_date": start_date,
            "doc_url": PROJECT_URL_TEMPLATE.format(id=p.get("shv_webprojectsid")),
            "sector_tags_raw": sector_tags_raw,
        })

    if unmapped_years:
        print(f"  WARN: skipped projects with unmapped call years: {sorted(unmapped_years)}")
    if any(not r["country"] for r in rows):
        no_country = [r["project_acronym"] for r in rows if not r["country"]]
        print(f"  WARN: {len(no_country)} rows without derived country: "
              f"{no_country[:5]}{'...' if len(no_country) > 5 else ''}")

    print(f"Extracted {len(rows)} KDT JU projects")
    return rows


# ---------------------------------------------------------------------------
# Company matching (mirrors extract_innovation_fund.py)
# ---------------------------------------------------------------------------

_FUZZY_THRESHOLD = 0.92

MATCH_FIELDNAMES = [
    "source", "call_id", "published_name", "country", "matched_company_id",
    "matched_canonical_name", "match_method", "match_confidence", "fuzzy_score",
]


def match_companies(
    rows: list[dict], conn: sqlite3.Connection
) -> tuple[list[dict], list[dict]]:
    cur = conn.cursor()
    cur.execute("SELECT id, canonical_name, country FROM companies")
    existing: dict[tuple[str, str], tuple[int, str]] = {}
    # For cross-country fuzzy (Infineon DE vs Infineon AT) we also index by name
    # alone, but the same-country fuzzy is preferred — we only use name-only as
    # a secondary tier after same-country fuzzy fails AND the input country was
    # not derivable from the institution name.
    by_name_only: dict[str, list[tuple[str, int, str]]] = {}
    existing_list: list[tuple[str, str, int, str]] = []
    for row_id, cname, cntry in cur.fetchall():
        norm = normalize_name(cname)
        cntry_up = (cntry or "").upper()
        existing[(norm, cntry_up)] = (row_id, cname)
        existing_list.append((norm, cntry_up, row_id, cname))
        by_name_only.setdefault(norm, []).append((cntry_up, row_id, cname))

    enriched: list[dict] = []
    summary: list[dict] = []

    for r in rows:
        raw_name = r["coordinator_name"]
        country = (r["country"] or "").upper()

        if not raw_name:
            raw_name = r["project_acronym"]

        norm = normalize_name(raw_name)

        company_id: int | None = None
        match_method = "none"
        match_confidence = "unmatched"
        matched_canonical = ""
        fuzzy_score: float | None = None

        # 1. Exact match (normalised name + country)
        exact_key = (norm, country)
        if country and exact_key in existing:
            company_id, matched_canonical = existing[exact_key]
            match_method = "exact"
            match_confidence = "high"

        # 2. Exact name match ignoring country (for cases where coordinator
        # country derivation differs from the canonical record — e.g. Infineon
        # AG appears in IPCEI MECT as DE, our heuristic also lands on DE, but
        # some entries lack legal-form normalisation). Only fires if (1) failed.
        if company_id is None and norm in by_name_only and not country:
            cands = by_name_only[norm]
            cands_with_country = [c for c in cands if c[0]]
            if cands_with_country:
                ex_country, ex_id, ex_cname = cands_with_country[0]
                company_id = ex_id
                matched_canonical = ex_cname
                match_method = "exact_name_only"
                match_confidence = "medium"
                country = ex_country  # inherit country from matched row
                r["country"] = country

        # 3. Prefix match (same country, existing name is a prefix-word of new name).
        # Bridges the IPCEI naming gap: IPCEI MECT/Micro stores shortened names
        # ("ASML", "Infineon", "Bosch") while Chips JU uses full legal entity
        # names ("ASML NETHERLANDS B.V.", "INFINEON TECHNOLOGIES AG"). The fuzzy
        # tier rejects these because the substring ratio is too low. Require
        # the existing normalized name to be ≥4 chars to avoid 2–3 letter false
        # positives (e.g. "ESS", "INA").
        if company_id is None and norm and country:
            best_len = 0
            best_id = None
            best_cname = ""
            for ex_norm, ex_country, ex_id, ex_cname in existing_list:
                if ex_country != country or len(ex_norm) < 4:
                    continue
                if norm.startswith(ex_norm + " "):
                    # Prefer the longest matching prefix (most specific)
                    if len(ex_norm) > best_len:
                        best_len = len(ex_norm)
                        best_id = ex_id
                        best_cname = ex_cname
            if best_id is not None:
                company_id = best_id
                matched_canonical = best_cname
                match_method = "prefix"
                match_confidence = "medium"

        # 4. Fuzzy match (same country, ≥ threshold)
        if company_id is None and norm and country:
            best_ratio = 0.0
            best_id = None
            best_cname = ""
            for ex_norm, ex_country, ex_id, ex_cname in existing_list:
                if ex_country != country:
                    continue
                ratio = SequenceMatcher(None, norm, ex_norm).ratio()
                if ratio >= _FUZZY_THRESHOLD and ratio > best_ratio:
                    best_ratio = ratio
                    best_id = ex_id
                    best_cname = ex_cname
            if best_id is not None:
                company_id = best_id
                matched_canonical = best_cname
                match_method = "fuzzy"
                match_confidence = "medium"
                fuzzy_score = round(best_ratio, 4)

        # 4. No match → insert new company
        if company_id is None:
            cur.execute(
                """INSERT INTO companies
                   (canonical_name, raw_name, country, entity_type, sector_inferred,
                    match_confidence, match_method)
                   VALUES (?, ?, ?, 'unknown', 'deeptech_hardware',
                           'unmatched', 'none')""",
                (raw_name, raw_name, country or None),
            )
            company_id = cur.lastrowid
            matched_canonical = raw_name
            match_method = "none"
            match_confidence = "unmatched"

            new_norm = normalize_name(raw_name)
            existing[(new_norm, country)] = (company_id, raw_name)
            existing_list.append((new_norm, country, company_id, raw_name))
            by_name_only.setdefault(new_norm, []).append((country, company_id, raw_name))

        enriched.append({**r, "company_id": company_id})
        summary.append({
            "source": r["source"],
            "call_id": r["call_id"],
            "published_name": raw_name,
            "country": country,
            "matched_company_id": company_id,
            "matched_canonical_name": matched_canonical,
            "match_method": match_method,
            "match_confidence": match_confidence,
            "fuzzy_score": fuzzy_score,
        })

    conn.commit()
    return enriched, summary


# ---------------------------------------------------------------------------
# Event loading
# ---------------------------------------------------------------------------

def load_events(rows: list[dict], conn: sqlite3.Connection) -> int:
    cur = conn.cursor()
    inserted = 0
    skipped_dup = 0

    for r in rows:
        company_id = r.get("company_id")
        if company_id is None:
            continue

        # Idempotency: skip duplicate (source, call_id)
        cur.execute(
            "SELECT 1 FROM public_funding_events WHERE source=? AND call_id=?",
            (r["source"], r["call_id"]),
        )
        if cur.fetchone():
            skipped_dup += 1
            continue

        grant_eur = r.get("grant_eur")
        if grant_eur is not None:
            try:
                grant_eur = float(grant_eur)
            except (ValueError, TypeError):
                grant_eur = None

        cur.execute(
            """INSERT INTO public_funding_events
               (company_id, source, role, call_id,
                project_acronym, project_title, project_summary,
                project_started,
                grant_amount_eur,
                sector_tags_raw,
                raw_source_url,
                coordinator_only, grant_amount_basis)
               VALUES (?, ?, 'direct', ?, ?, ?, ?, ?, ?, ?, ?, 1, 'chips_ju_total_public')""",
            (
                company_id,
                r["source"],
                r["call_id"],
                r["project_acronym"],
                r["project_title"],
                r["description"],
                r["started_date"],
                grant_eur,
                r.get("sector_tags_raw", "Semiconductors"),
                r.get("doc_url", ""),
            ),
        )
        inserted += 1

    conn.commit()
    if skipped_dup:
        print(f"  Skipped {skipped_dup} duplicate (source, call_id) pairs")
    return inserted


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

CSV_FIELDNAMES = [
    "source", "call_id", "project_acronym", "project_title", "coordinator_name",
    "country", "participating_countries", "n_partners", "description", "grant_eur",
    "awarded_date", "started_date", "doc_url", "sector_tags_raw",
]


def main() -> None:
    args = set(sys.argv[1:])
    load_db = "--load-db" in args
    refresh = "--refresh" in args

    # --- Step 1: Extract ---
    print("Fetching KDT JU projects from chips-ju.europa.eu OData API ...")
    all_rows = extract_all(force_refresh=refresh)

    # Per-source summary
    from collections import defaultdict
    source_counts: dict[str, int] = defaultdict(int)
    source_grant: dict[str, float] = defaultdict(float)
    for r in all_rows:
        source_counts[r["source"]] += 1
        if r["grant_eur"]:
            source_grant[r["source"]] += r["grant_eur"]
    for src in sorted(source_counts):
        n = source_counts[src]
        total_m = source_grant[src] / 1e6
        print(f"  {src:<28}  {n:>3} projects  €{total_m:,.1f}M")

    no_name = sum(1 for r in all_rows if not r["coordinator_name"])
    no_country = sum(1 for r in all_rows if not r["country"])
    no_amt = sum(1 for r in all_rows if not r["grant_eur"])
    print(f"\nTotal: {len(all_rows)} rows")
    print(f"  No coordinator name: {no_name}")
    print(f"  No country derived:  {no_country}")
    print(f"  No grant amount:     {no_amt}")

    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
        w.writeheader()
        w.writerows(all_rows)
    print(f"\nCSV → {CSV_PATH}")

    if not load_db:
        print("(CSV only — pass --load-db to match and load into db.sqlite)")
        print("Reminder: run python3 classify.py after --load-db")
        return

    # --- Step 2: Match + Load ---
    if not DB_PATH.exists():
        print(f"!! DB not found: {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    print(f"\nMatching {len(all_rows)} rows against {DB_PATH.name} ...")
    enriched, summary = match_companies(all_rows, conn)

    with MATCH_CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w2 = csv.DictWriter(f, fieldnames=MATCH_FIELDNAMES)
        w2.writeheader()
        w2.writerows(summary)

    method_counts: dict[str, int] = defaultdict(int)
    for s in summary:
        method_counts[s["match_method"]] += 1
    print("Match results:")
    for method, count in sorted(method_counts.items()):
        print(f"  {method:<20}  {count:>4}")
    print(f"  Match summary → {MATCH_CSV_PATH}")

    inserted = load_events(enriched, conn)
    conn.close()
    print(f"\nInserted {inserted} events into public_funding_events")
    print("\nnext: run python3 classify.py")


if __name__ == "__main__":
    main()
