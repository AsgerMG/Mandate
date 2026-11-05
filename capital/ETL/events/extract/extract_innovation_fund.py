"""Extract EU Innovation Fund awarded projects from CINEA project fiches.

Data source:
  - climate.ec.europa.eu projects table (projects_index.json, scraped from _index.html)
  - Individual project fiche PDFs (data/raw/innovation_fund/fiches/)

Calls in scope: 2020–2024 (all calls with signed grant agreements as of 2026-05-21).
H2 Bank Auction Rounds 1 (IF23) and 2 (IF24) are included.
IF25 calls are excluded (status = invited to grant agreement preparation, not awarded).

Run modes:
  python extract_innovation_fund.py             → parse + CSV only (no DB write)
  python extract_innovation_fund.py --load-db   → parse + match + load into db.sqlite
"""
from __future__ import annotations


# --- ETL path bootstrap (auto-added; see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from europe_scope import COUNTRY_NAME_TO_ISO2  # noqa: E402
from etl_env import DB as _ETL_DB, ROOT as _ETL_ROOT  # noqa: E402,F401
from store import connect  # noqa: E402
from europe_scope import canonicalise_country  # noqa: E402
# --- end ETL path bootstrap ---

import csv
import json
import re
import subprocess
import sys
import time
from difflib import SequenceMatcher
from pathlib import Path

# ── WHY THIS IMPORT IS LAZY ────────────────────────────────────────────────
# `classify.py` imports IF_SOURCE_SECTOR from this module -- a dict of source
# names, nothing to do with PDFs -- and `classify_taxonomy.py` imports classify.
# So `test_sector_evidence.py`, a pure taxonomy test, dragged a PDF parser in at
# module scope and died in CI with ModuleNotFoundError. The Python job installs
# no dependencies at all, deliberately: it byte-compiles and runs schema checks,
# and it should not need a wheel to read a constant.
#
# pdfplumber is used at exactly ONE site, inside the fiche reader. Importing it
# there costs nothing at extraction time and stops a heavy dependency being a
# precondition for reading a dictionary.

BASE_DIR = _ETL_ROOT
RAW_DIR = BASE_DIR / "data" / "raw" / "innovation_fund"
FICHES_DIR = RAW_DIR / "fiches"
OUT_DIR = BASE_DIR / "data" / "processed"
OUT_DIR.mkdir(parents=True, exist_ok=True)

INDEX_JSON = RAW_DIR / "projects_index.json"
CSV_PATH = OUT_DIR / "innovation_fund_projects.csv"
MATCH_CSV_PATH = OUT_DIR / "innovation_fund_match_summary.csv"
DB_PATH = _ETL_DB

CLIMATE_BASE = "https://climate.ec.europa.eu"

# ---------------------------------------------------------------------------
# Call → source ID mapping + metadata
# ---------------------------------------------------------------------------

# Maps climate.ec.europa.eu "Type" column to (source_id, awarded_date, raw_dir)
CALL_TO_SOURCE: dict[str, tuple[str, str]] = {
    "2020 Large-scale":     ("innovation_fund_lsp_2020", "2021-11-16"),
    "2020 Small-scale":     ("innovation_fund_ssp_2020", "2022-04-12"),
    "2021 Large-scale":     ("innovation_fund_lsp_2021", "2022-07-12"),
    "2021 Small-scale":     ("innovation_fund_ssp_2021", "2023-02-09"),
    "2022 Large-scale":     ("innovation_fund_lsp_2022", "2023-07-13"),
    "2022-Small Scale":     ("innovation_fund_ssp_2022", "2024-02-15"),
    # IF23 call — multiple sub-tracks from one 2022/2023 open call
    "IF23Call – General large-scale": ("innovation_fund_lsp_2023", "2024-10-23"),
    "IF23Call – General medium-scale": ("innovation_fund_msp_2023", "2024-10-23"),
    "IF23Call – General small-scale": ("innovation_fund_ssp_2023", "2024-10-23"),
    "IF23Call – Manufacturing":        ("innovation_fund_mfg_2023", "2024-10-23"),
    "IF23Call – Pilots":               ("innovation_fund_plt_2023", "2024-10-23"),
    "IF23Auction - renewable hydrogen":     ("innovation_fund_hbank_2023", "2024-10-08"),
    # IF24 call
    "IF24Call – General large-scale":  ("innovation_fund_lsp_2024", "2025-11-03"),
    "IF24Call – General medium-scale": ("innovation_fund_msp_2024", "2025-11-03"),
    "IF24Call – General small-scale":  ("innovation_fund_ssp_2024", "2025-11-03"),
    "IF24Call - Manufacturing":             ("innovation_fund_mfg_2024", "2025-11-03"),
    "IF24Call - Pilots":                    ("innovation_fund_plt_2024", "2025-11-03"),
    "IF24 Battery Call - Electric vehicle battery cell production":
                                            ("innovation_fund_battery_2024", "2025-11-10"),
    "IF24Auction - renewable hydrogen":     ("innovation_fund_hbank_2024", "2025-05-20"),
    "IF24Auction - renewable hydrogen – maritime topic":
                                            ("innovation_fund_hbank_2024_maritime", "2025-05-20"),
}

# All Innovation Fund sources → cleantech (overwhelmingly decarbonisation projects)
IF_SOURCE_SECTOR: dict[str, str] = {src: "cleantech" for src in
    [v[0] for v in CALL_TO_SOURCE.values()]}

# COUNTRY_NAME_TO_ISO moved to ETL/lib/europe_scope.py. Four extractors each carried
# their own copy of this dict and they had drifted in coverage -- eight
# names were missing from at least one, and an unresolvable name writes a
# NULL country rather than raising. One copy now, imported.
COUNTRY_NAME_TO_ISO = COUNTRY_NAME_TO_ISO2

# ---------------------------------------------------------------------------
# Fiche PDF parser
# ---------------------------------------------------------------------------

def parse_fiche(pdf_path: Path) -> tuple[str | None, float | None]:
    """Return (coordinator_name, grant_amount_eur) from a project fiche PDF.

    All IF fiches use a two-column layout. We crop to the right half of each
    page so that left-column body text does not interleave with the metadata
    fields on the right, giving clean line-by-line parsing.
    """
    lines: list[str] = []
    try:
        import pdfplumber  # lazy: see the note beside the stdlib imports
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages[:2]:
                # Right column contains all metadata fields (COORDINATOR, AMOUNT…)
                right = page.crop((page.width / 2, 0, page.width, page.height))
                t = right.extract_text()
                if t:
                    lines += [l.strip() for l in t.split("\n") if l.strip()]
    except Exception:
        return None, None

    coordinator: str | None = None
    grant_eur: float | None = None

    KNOWN_FIELD_STARTS = {
        "LOCATION", "CATEGORY", "SECTOR", "AMOUNT", "GHG", "STARTING",
        "PLANNED", "BENEFICIAR", "COUNTRY", "COORDINATOR", "ELECTROLYSER",
        "EXPECTED", "UPDATE", "AFFILIATED", "RELEVANT COST", "TOTAL PROJECT",
        "TOTAL ELIGIBLE", "AUCTIONED", "FINANCIAL",
    }

    for i, line in enumerate(lines):
        # --- Coordinator ---
        if line == "COORDINATOR":
            clines: list[str] = []
            for j in range(i + 1, min(i + 6, len(lines))):
                l = lines[j]
                l = re.sub(r"^\|\s*Project\s+Factsheet\s*", "", l).strip()
                if any(l.upper().startswith(k) for k in KNOWN_FIELD_STARTS):
                    break
                if l and l[0].islower() and clines:
                    break
                if l and not l[0].islower():
                    clines.append(l)
            coordinator = " ".join(clines) if clines else None

        # --- Grant amount (handles both "AMOUNT OF INNOVATION FUND GRANT"
        #     and "AMOUNT OF THE INNOVATION FUND GRANT") ---
        if re.search(r"AMOUNT\s+OF\s+(?:THE\s+)?INNOVATION\s+FUND\s+GRANT", line, re.IGNORECASE):
            # Amount may be on the same line or the next few lines
            candidates = [line] + lines[i + 1: min(i + 4, len(lines))]
            for candidate in candidates:
                m = re.search(r"EUR\s+([\d,.\s]+)", candidate, re.IGNORECASE)
                if m:
                    amt_str = re.sub(r"[\s,]", "", m.group(1))
                    try:
                        grant_eur = float(amt_str)
                    except ValueError:
                        pass
                    break

    return coordinator, grant_eur


# ---------------------------------------------------------------------------
# Name normalisation (mirrors extract_ipcei.py / extract_eib.py)
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
_NORM_WS_RE = re.compile(r"\s+")


def normalize_name(s: str) -> str:
    s = _NORM_LEGAL_RE.sub("", s)
    s = _NORM_PUNCT_RE.sub(" ", s)
    return _NORM_WS_RE.sub(" ", s).strip().lower()


# ---------------------------------------------------------------------------
# Fiche downloader (curl-based to avoid SSL cert issues on macOS)
# ---------------------------------------------------------------------------

def ensure_fiche(project: dict, idx: int) -> Path | None:
    """Return path to the fiche PDF, downloading it if needed."""
    url = project.get("doc_url")
    if not url:
        return None
    if url.startswith("/"):
        url = CLIMATE_BASE + url

    safe = f"{idx+1:03d}_" + project["acronym"][:30].replace("/", "_").replace(
        " ", "_"
    ).replace(":", "").strip(".")
    path = FICHES_DIR / f"{safe}.pdf"
    if path.exists() and path.stat().st_size > 5000:
        return path

    FICHES_DIR.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        ["curl", "-sL", "-H", "User-Agent: Mozilla/5.0", "-o", str(path), url],
        capture_output=True,
        timeout=30,
    )
    if path.exists() and path.stat().st_size > 5000:
        return path
    return None


# ---------------------------------------------------------------------------
# Main extraction
# ---------------------------------------------------------------------------

def extract_all(download_missing: bool = False) -> list[dict]:
    with open(INDEX_JSON) as f:
        projects = json.load(f)

    rows: list[dict] = []
    parse_failures: list[str] = []

    for idx, p in enumerate(projects):
        call = p["call"]
        status = p["status"]

        if "signed" not in status.lower():
            continue

        src_info = CALL_TO_SOURCE.get(call)
        if src_info is None:
            print(f"  WARN: unmapped call '{call}' for project {p['acronym'][:30]}")
            continue

        source_id, awarded_date = src_info

        # Country → ISO, then canonicalise to Europe scope (PO→PL, SW→SE, …).
        # A non-empty source country that canonicalises to None is genuinely
        # out of scope → skip the row (don't let the scope trigger abort the load).
        country_raw = p.get("country", "")
        country = COUNTRY_NAME_TO_ISO.get(country_raw, country_raw[:2].upper() if country_raw else "")
        canon = canonicalise_country(country)
        if canon is None and country:
            continue
        country = canon or ""

        # Fiche PDF
        fiche_path = None
        expected_safe = f"{idx+1:03d}_" + p["acronym"][:30].replace("/", "_").replace(
            " ", "_"
        ).replace(":", "").strip(".")
        expected_path = FICHES_DIR / f"{expected_safe}.pdf"
        if expected_path.exists() and expected_path.stat().st_size > 5000:
            fiche_path = expected_path
        elif download_missing:
            fiche_path = ensure_fiche(p, idx)

        coordinator = None
        grant_eur = None
        if fiche_path:
            coordinator, grant_eur = parse_fiche(fiche_path)

        if not coordinator:
            parse_failures.append(p["acronym"])

        # Sector tags: keep 'Energy' first so classifier's CLEANTECH_TAGS
        # set match still fires, then append the climate.ec.europa.eu
        # category + sector for queryable sub-sector detail.
        category = (p.get("category") or "").replace("​", "").strip()
        sector = (p.get("sector") or "").replace("​", "").strip()
        sector_parts = ["Energy"]
        if category and category.lower() != "other":
            sector_parts.append(category)
        if sector and sector.lower() != "other":
            sector_parts.append(sector)
        sector_tags_raw = ", ".join(sector_parts)

        # Build row
        rows.append({
            "source": source_id,
            "call_id": f"{source_id}_{p['acronym'][:40].replace(' ', '_').lower()}",
            "project_acronym": p["acronym"][:200],
            "coordinator_name": coordinator or "",
            "country": country,
            "description": p.get("description", "")[:500],
            "grant_eur": grant_eur,
            "awarded_date": awarded_date,
            "doc_url": p.get("doc_url") or "",
            "sector_tags_raw": sector_tags_raw,
        })

    if parse_failures:
        print(f"  WARN: coordinator not found in {len(parse_failures)} fiches: "
              f"{parse_failures[:5]}{'...' if len(parse_failures) > 5 else ''}")

    print(f"Extracted {len(rows)} grant-signed IF projects")
    return rows


# ---------------------------------------------------------------------------
# Company matching (mirrors extract_ipcei.py / extract_eib.py)
# ---------------------------------------------------------------------------

_FUZZY_THRESHOLD = 0.92

MATCH_FIELDNAMES = [
    "source", "call_id", "published_name", "country", "matched_company_id",
    "matched_canonical_name", "match_method", "match_confidence", "fuzzy_score",
]


def match_companies(
    rows: list[dict], conn
) -> tuple[list[dict], list[dict]]:
    cur = conn.cursor()
    cur.execute("SELECT id, canonical_name, country FROM companies ORDER BY canonical_name COLLATE \"C\", country COLLATE \"C\" NULLS FIRST, id")
    existing: dict[tuple[str, str], tuple[int, str]] = {}
    existing_list: list[tuple[str, str, int, str]] = []
    for row_id, cname, cntry in cur.fetchall():
        norm = normalize_name(cname)
        key = (norm, (cntry or "").upper())
        existing[key] = (row_id, cname)
        existing_list.append((norm, (cntry or "").upper(), row_id, cname))

    enriched: list[dict] = []
    summary: list[dict] = []

    for r in rows:
        raw_name = r["coordinator_name"]
        country = r["country"]

        if not raw_name:
            # No fiche — insert as unmatched with project title as canonical name
            raw_name = r["project_acronym"].split(":")[0].strip()

        norm = normalize_name(raw_name)

        company_id: int | None = None
        match_method = "none"
        match_confidence = "unmatched"
        matched_canonical = ""
        fuzzy_score: float | None = None

        # 1. Exact match (normalised name + country)
        exact_key = (norm, country)
        if exact_key in existing:
            company_id, matched_canonical = existing[exact_key]
            match_method = "exact"
            match_confidence = "high"

        # 2. Fuzzy match (same country, ≥ threshold)
        if company_id is None and norm:
            best_ratio = 0.0
            best_id: int | None = None
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

        # 3. No match → insert new company
        if company_id is None:
            cur.execute(
                """INSERT INTO companies
                   (canonical_name, raw_name, country, entity_type, sector_inferred,
                    match_confidence, match_method)
                   VALUES (%s, %s, %s, 'unknown', 'cleantech', 'unmatched', 'none') RETURNING id""",
                (raw_name, raw_name, country or None),
            )
            company_id = cur.fetchone()[0]
            matched_canonical = raw_name
            match_method = "none"
            match_confidence = "unmatched"

            new_norm = normalize_name(raw_name)
            existing[(new_norm, country)] = (company_id, raw_name)
            existing_list.append((new_norm, country, company_id, raw_name))

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

def load_events(rows: list[dict], conn) -> int:
    cur = conn.cursor()
    inserted = 0
    skipped_dup = 0

    for r in rows:
        company_id = r.get("company_id")
        if company_id is None:
            continue

        # Idempotency: skip duplicate (source, call_id)
        cur.execute(
            "SELECT 1 FROM public_funding_events WHERE source=%s AND call_id=%s",
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

        raw_url = r.get("doc_url") or ""
        if raw_url and raw_url.startswith("/"):
            raw_url = CLIMATE_BASE + raw_url

        cur.execute(
            """INSERT INTO public_funding_events
               (company_id, source, role, call_id,
                project_title, project_summary,
                project_started,
                grant_amount_eur,
                sector_tags_raw,
                raw_source_url,
                coordinator_only, grant_amount_basis)
               VALUES (%s, %s, 'direct', %s, %s, %s, %s, %s, %s, %s, 1, 'if_eu_grant')""",
            (
                company_id,
                r["source"],
                r["call_id"],
                r["project_acronym"],
                r["description"],
                r["awarded_date"],
                grant_eur,
                r.get("sector_tags_raw", "Energy"),
                raw_url,
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
    "source", "call_id", "project_acronym", "coordinator_name", "country",
    "description", "grant_eur", "awarded_date", "doc_url", "sector_tags_raw",
]


def main() -> None:
    args = set(sys.argv[1:])
    load_db = "--load-db" in args
    download = "--download" in args

    # --- Step 1: Extract ---
    print("Parsing project index and fiche PDFs...")
    all_rows = extract_all(download_missing=download)

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
        print(f"  {src:<40}  {n:>3} projects  €{total_m:,.0f}M")

    no_name = sum(1 for r in all_rows if not r["coordinator_name"])
    no_amt = sum(1 for r in all_rows if not r["grant_eur"])
    print(f"\nTotal: {len(all_rows)} rows")
    print(f"  No coordinator name: {no_name}")
    print(f"  No grant amount: {no_amt}")

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

    with connect() as conn:
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
    print(f"\nInserted {inserted} events into public_funding_events")
    print("\nnext: run python3 classify.py")


if __name__ == "__main__":
    main()
