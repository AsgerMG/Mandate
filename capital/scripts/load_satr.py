"""Load SATR scraped CSVs into the database.

Two-step design:

  --staging   Load all *.csv.gz files into a flat `satr_staging` table.
              Used for overlap audit and exploration without touching the
              corpus tables.

  --apply     Promote staging rows to companies + public_funding_events.
              Skips TM references already present (idempotent), matches
              companies by national_id+country first then by name+country,
              creates new company rows where no match is found.

  --report    Print summary stats from staging (count by country, etc).

Run order: --staging   →   --report   →   --apply
"""
from __future__ import annotations

import argparse
import csv
import gzip
import re
import sqlite3
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

# Make `scripts.*` importable when run as a script
sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.lib.satr_filters import filter_passes  # noqa: E402
from scripts.lib.ndb_taxonomy import classify_ndb  # noqa: E402
from scripts.ndb_helpers import normalise_ticket  # noqa: E402

# Europe scope canonicaliser (Sprint 14)
try:
    from scripts.europe_scope import canonicalise_country  # noqa: E402
except ImportError:
    def canonicalise_country(c: str) -> str | None:  # type: ignore
        return c.upper() if c else None

DB_PATH = Path(__file__).parent.parent / "db.sqlite"
SATR_DIR = Path(__file__).parent.parent / "data" / "processed" / "satr"

# ── Staging schema ──────────────────────────────────────────────────────────

STAGING_SCHEMA = """
CREATE TABLE IF NOT EXISTS satr_staging (
    tm_id TEXT PRIMARY KEY,
    country TEXT,                          -- granting country (English name)
    aid_measure_title TEXT,
    sa_number TEXT,
    national_id TEXT,
    beneficiary_name TEXT,
    beneficiary_type TEXT,
    region TEXT,
    sector_nace TEXT,
    aid_instrument_text TEXT,
    objectives_text TEXT,
    nominal_amount_raw TEXT,
    aid_element_raw TEXT,
    date_granted TEXT,                     -- DD/MM/YYYY
    granting_authority TEXT,
    entrusted_entity TEXT,
    financial_intermediaries TEXT,
    published_date TEXT,
    beneficiary_ms TEXT,                   -- beneficiary HQ country (English name)
    third_country TEXT,                    -- third country if non-EU; rows with this set are skipped
    -- Derived / matcher fields:
    granting_country_iso2 TEXT,
    beneficiary_country_iso2 TEXT,
    amount_eur REAL,                       -- aid_element preferred, else nominal, converted to EUR
    amount_basis TEXT,                     -- 'satr_aid_element' or 'satr_nominal_amount'
    grant_year INTEGER,
    source_filter TEXT,                    -- 'equity' or 'rnd' — which batch family yielded this row
    company_id INTEGER,                    -- populated on --apply if matched
    apply_status TEXT,                     -- 'matched' / 'created' / 'skipped' / NULL
    apply_notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_satr_staging_country ON satr_staging(granting_country_iso2);
CREATE INDEX IF NOT EXISTS idx_satr_staging_natid ON satr_staging(national_id);
CREATE INDEX IF NOT EXISTS idx_satr_staging_name ON satr_staging(beneficiary_name);
CREATE INDEX IF NOT EXISTS idx_satr_staging_apply ON satr_staging(apply_status);
"""

# Country name → ISO 2-letter (matches the SATR portal's English country names)
COUNTRY_TO_ISO2 = {
    "Austria": "AT", "Belgium": "BE", "Bulgaria": "BG", "Croatia": "HR",
    "Cyprus": "CY", "Czechia": "CZ", "Czech Republic": "CZ", "Denmark": "DK",
    "Estonia": "EE", "Finland": "FI", "France": "FR", "Germany": "DE",
    "Greece": "GR", "Hungary": "HU", "Iceland": "IS", "Ireland": "IE",
    "Italy": "IT", "Latvia": "LV", "Lithuania": "LT", "Luxembourg": "LU",
    "Malta": "MT", "Netherlands": "NL", "Poland": "PL", "Portugal": "PT",
    "Romania": "RO", "Slovakia": "SK", "Slovenia": "SI", "Spain": "ES",
    "Sweden": "SE", "United Kingdom": "GB", "Norway": "NO", "Switzerland": "CH",
    "Liechtenstein": "LI",
}

# Currency code → ISO 4217 (most SATR rows use the granting country's currency)
COUNTRY_CURRENCY = {
    "AT": "EUR", "BE": "EUR", "CY": "EUR", "DE": "EUR", "EE": "EUR",
    "ES": "EUR", "FI": "EUR", "FR": "EUR", "GR": "EUR", "IE": "EUR",
    "IT": "EUR", "LV": "EUR", "LT": "EUR", "LU": "EUR", "MT": "EUR",
    "NL": "EUR", "PT": "EUR", "SK": "EUR", "SI": "EUR", "HR": "EUR",
    "BG": "BGN", "CZ": "CZK", "DK": "DKK", "HU": "HUF", "IS": "ISK",
    "PL": "PLN", "RO": "RON", "SE": "SEK", "GB": "GBP",
}

# Bid maps for instrument / objective — derived from cached samples.
# These are LOOSELY populated and best-effort; the staging table keeps the raw
# strings so we can refine the mapping at apply time without re-scraping.
# Pattern: match an instrument name fragment → bid.
INSTRUMENT_NAME_TO_BID = [
    ("provision of risk capital", "StateAidInstrumentPRC"),
    ("provision of risk finance", "StateAidInstrumentPRVRISKFIN"),
    ("other forms of equity", "StateAidInstrumentOFEI"),
    ("subordinated debt", "StateAidInstrumentSubordDebt"),
    ("repayable advances", "StateAidInstrumentLradv"),
    ("soft loan", "StateAidInstrumentSL"),
    ("loan", "StateAidInstrumentLradv"),
    ("guarantee", "StateAidInstrumentG"),
    ("direct grant", "StateAidInstrumentDG"),
    ("tax", "StateAidInstrumentTaote"),
]


def map_instrument_to_bid(text: str) -> str | None:
    t = (text or "").lower()
    for frag, bid in INSTRUMENT_NAME_TO_BID:
        if frag in t:
            return bid
    return None


# Map objectives_text → GBER article bid (best-effort)
OBJECTIVE_NAME_TO_BID = [
    ("aid for start-ups", "StateAidObjectiveGberArt22"),
    ("art. 25c", "StateAidObjectiveGberArt25c"),
    ("art. 25b", "StateAidObjectiveGberArt25b"),
    ("art. 25", "StateAidObjectiveGberArt25"),
    ("art. 26", "StateAidObjectiveGberArt26"),
    ("art. 27", "StateAidObjectiveGberArt27"),
    ("art. 28", "StateAidObjectiveGberArt28"),
    ("art. 29", "StateAidObjectiveGberArt29"),
    ("art. 30", "StateAidObjectiveGberArt30"),
    ("art. 21", "StateAidObjectiveGberArt21"),
    ("art. 22", "StateAidObjectiveGberArt22"),
    ("smes", "StateAidObjective6952"),
    ("sme", "StateAidObjective6952"),
    ("research and development", "StateAidObjectiveGberArt25"),
    ("innovation", "StateAidObjectiveGberArt28"),
]


def map_objective_to_bid(text: str) -> str | None:
    t = (text or "").lower()
    for frag, bid in OBJECTIVE_NAME_TO_BID:
        if frag in t:
            return bid
    return None


# ── Name normalisation (mirrors satr_overlap_audit.py) ──────────────────────

_LEGAL_SUFFIX_RE = re.compile(
    r"\b(gmbh|s\.?p\.?a\.?|s\.?r\.?l\.?|s\.?l\.?|s\.?a\.?|n\.?v\.?|b\.?v\.?|"
    r"oy|ab|plc|ltd|limited|llc|inc|corp|sas|sarl|kg|ag|co\.?|gesellschaft|"
    r"holding|gruppo|group|aktiengesellschaft|aktiebolaget|m\.?b\.?h\.?)\b"
    r"\.?", re.IGNORECASE
)
_PUNCT_RE = re.compile(r"[^\w\s]")
_WS_RE = re.compile(r"\s+")


def normalise_name(s: str | None) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s).encode("ASCII", "ignore").decode("ASCII")
    s = s.lower()
    s = _LEGAL_SUFFIX_RE.sub("", s)
    s = _PUNCT_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s).strip()
    return s


# ── Helpers ─────────────────────────────────────────────────────────────────

# Crisis / COVID emergency aid exclusion patterns (case-insensitive).
#
# These are EU-wide emergency aid frameworks issued during COVID-19 (Temporary
# Framework 2020-2022) and the 2022 Ukraine energy crisis (Temporary Crisis
# Framework / Temporary Crisis and Transition Framework). All are state-aid-
# classified but are emergency liquidity, NOT innovation or strategic-
# industrial-policy aid. Excluded at staging load so they don't pollute the
# corpus.
#
# CRITICAL: an earlier narrower TCTF-only filter missed ~73k rows of COVID aid
# (Italy +25k, Hungary +43k, Germany +20k) because COVID schemes typically
# use "COVID-19:" / "COVID19" / "Covid" prefixes and reference the original
# 2020 "Temporary Framework" (no "Crisis"). Sprint 15 evening (2026-05-29)
# correction.
#
# Multilingual patterns: SATR carries the granting-Member-State's original
# language title, so we match both English and native-language variants.
_TCTF_PATTERNS = [
    # COVID-19 prefix patterns — DOMINANT in the data
    r"\bCOVID[\s\-]?(?:19|10)\b",            # COVID-19, COVID 19, COVID19, COVID-10 (typo in SATR data)
    r"\bCovid\b",                            # standalone (German "Covid" schemes)
    r"\bSARS[\-\s]?CoV[\-\s]?2\b",
    r"\bCoronavirus\b",
    # Temporary Framework references
    r"\bTCF\s*[:.\-]",                       # "TCF:" or "TCF -" prefix
    r"\bTCTF\b",
    r"Temporary\s+Framework",                # COVID-era framework (no "Crisis")
    r"Temporary\s+Crisis\s+(?:and\s+Transition\s+)?Framework",
    # Boilerplate scheme titles
    r"Limited\s+amounts?\s+of\s+aid\s+for\s+undertakings",
    r"Loan\s+guarantees?\s+for\s+SMEs?\s+and\s+small\s+mid[\-\s]?caps",
    r"Exceptional\s+Liquidity\s+Guarantee",  # Hungarian COVID scheme
    r"Liquidity\s+(?:assistance|support)\s+scheme",
    # Native-language equivalents
    r"Quadro\s+Temporaneo",                  # Italian
    r"Encadrement\s+temporaire",             # French
    r"Befristeter\s+(?:Krisenrahmen|Rahmen)",  # German (with or without "Krisen")
    r"Marco\s+Temporal\s+(?:de\s+)?(?:Crisis|COVID)",  # Spanish
    r"Tijdelijke\s+(?:steun)?kaderregeling",  # Dutch
    # Energy crisis ad-hoc
    r"energy\s+crisis",                      # Ukraine 2022 energy crisis emergency aid
]
_TCTF_RE = re.compile("|".join(_TCTF_PATTERNS), re.IGNORECASE)


def is_tctf(aid_measure_title: str | None) -> bool:
    """Return True if the aid measure is COVID / TCF / TCTF crisis aid.

    Named is_tctf for backwards-compat; the function now catches COVID-era
    'Temporary Framework' schemes as well, which was the bulk of the missed
    rows in the first Sprint 15 attempt.
    """
    if not aid_measure_title:
        return False
    return bool(_TCTF_RE.search(aid_measure_title))


_AMOUNT_RE = re.compile(r"([\d,]+)\s*([A-Z]{3})?", re.IGNORECASE)


def parse_amount(raw: str) -> tuple[float | None, str | None]:
    """Parse '1,468,000 EUR' → (1468000.0, 'EUR'). Returns (None, None) on empty/bad."""
    if not raw:
        return (None, None)
    raw = raw.strip()
    m = _AMOUNT_RE.match(raw)
    if not m:
        return (None, None)
    try:
        amt = float(m.group(1).replace(",", ""))
    except ValueError:
        return (None, None)
    ccy = (m.group(2) or "").upper() or None
    return (amt, ccy)


def parse_date_to_year(dmy: str) -> int | None:
    """Parse DD/MM/YYYY → year, or None."""
    if not dmy:
        return None
    parts = dmy.split("/")
    if len(parts) != 3:
        return None
    try:
        return int(parts[2])
    except ValueError:
        return None


def parse_date_to_iso(dmy: str) -> str | None:
    """Parse DD/MM/YYYY → YYYY-MM-DD, or None."""
    if not dmy:
        return None
    try:
        return datetime.strptime(dmy.strip(), "%d/%m/%Y").date().isoformat()
    except ValueError:
        return None


def filter_family_from_filename(path: Path) -> str:
    """satr_AT_20210101_20211231_equity.csv.gz → 'equity'"""
    stem = path.name.removesuffix(".csv.gz")
    return stem.rsplit("_", 1)[-1]


# ── Stage loader ────────────────────────────────────────────────────────────

def load_staging(conn: sqlite3.Connection) -> dict:
    """Read all CSV.gz files into satr_staging. Dedup by tm_id (TM-XXXXXX)."""
    conn.executescript(STAGING_SCHEMA)

    files = sorted(SATR_DIR.glob("satr_*.csv.gz"))
    if not files:
        return {"files": 0, "rows_read": 0, "rows_inserted": 0}

    rows_read = 0
    rows_inserted = 0
    skipped_third_country = 0
    skipped_no_tm = 0
    skipped_tctf = 0
    seen_tm = set(r[0] for r in conn.execute("SELECT tm_id FROM satr_staging"))

    cur = conn.cursor()
    for f in files:
        filt = filter_family_from_filename(f)
        with gzip.open(f, "rt", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                rows_read += 1
                tm = (row.get("reference_number") or "").strip()
                if not tm:
                    skipped_no_tm += 1
                    continue
                if tm in seen_tm:
                    continue  # already in staging
                # Skip non-European third-country rows
                if (row.get("third_country") or "").strip():
                    skipped_third_country += 1
                    continue
                # Skip TCTF / COVID-Crisis emergency aid — not innovation focus
                if is_tctf(row.get("aid_measure_title")):
                    skipped_tctf += 1
                    continue

                gc_iso = COUNTRY_TO_ISO2.get((row.get("country") or "").strip())
                bc_iso = COUNTRY_TO_ISO2.get((row.get("beneficiary_ms") or "").strip())
                year = parse_date_to_year(row.get("date_granted") or "")

                # Amount: aid_element preferred, else nominal
                ae_amt, ae_ccy = parse_amount(row.get("aid_element_raw") or "")
                no_amt, no_ccy = parse_amount(row.get("nominal_amount_raw") or "")

                amt_eur = None
                amt_basis = None
                if ae_amt is not None:
                    ccy = ae_ccy or COUNTRY_CURRENCY.get(gc_iso or "", "EUR")
                    if year:
                        try:
                            amt_eur = normalise_ticket(ae_amt, ccy, year)
                            amt_basis = "satr_aid_element"
                        except KeyError:
                            # Unknown FX series — keep raw; flag basis
                            amt_eur = ae_amt if ccy == "EUR" else None
                            amt_basis = "satr_aid_element"
                elif no_amt is not None:
                    ccy = no_ccy or COUNTRY_CURRENCY.get(gc_iso or "", "EUR")
                    if year:
                        try:
                            amt_eur = normalise_ticket(no_amt, ccy, year)
                            amt_basis = "satr_nominal_amount"
                        except KeyError:
                            amt_eur = no_amt if ccy == "EUR" else None
                            amt_basis = "satr_nominal_amount"

                cur.execute(
                    """INSERT OR IGNORE INTO satr_staging (
                        tm_id, country, aid_measure_title, sa_number,
                        national_id, beneficiary_name, beneficiary_type,
                        region, sector_nace, aid_instrument_text,
                        objectives_text, nominal_amount_raw, aid_element_raw,
                        date_granted, granting_authority, entrusted_entity,
                        financial_intermediaries, published_date,
                        beneficiary_ms, third_country,
                        granting_country_iso2, beneficiary_country_iso2,
                        amount_eur, amount_basis, grant_year, source_filter
                    ) VALUES (
                        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                        ?, ?, ?, ?, ?, ?
                    )""",
                    (
                        tm, row.get("country"), row.get("aid_measure_title"),
                        row.get("sa_number"), row.get("national_id"),
                        row.get("beneficiary_name"), row.get("beneficiary_type"),
                        row.get("region"), row.get("sector_nace"),
                        row.get("aid_instrument_text"), row.get("objectives_text"),
                        row.get("nominal_amount_raw"), row.get("aid_element_raw"),
                        row.get("date_granted"), row.get("granting_authority"),
                        row.get("entrusted_entity"), row.get("financial_intermediaries"),
                        row.get("published_date"), row.get("beneficiary_ms"),
                        row.get("third_country"),
                        gc_iso, bc_iso, amt_eur, amt_basis, year, filt,
                    ),
                )
                seen_tm.add(tm)
                rows_inserted += 1

    conn.commit()
    return {
        "files": len(files), "rows_read": rows_read,
        "rows_inserted": rows_inserted,
        "skipped_third_country": skipped_third_country,
        "skipped_tctf": skipped_tctf,
        "skipped_no_tm": skipped_no_tm,
    }


# ── Reporter ────────────────────────────────────────────────────────────────

def report(conn: sqlite3.Connection) -> None:
    print("=== SATR staging summary ===\n")

    n = conn.execute("SELECT COUNT(*) FROM satr_staging").fetchone()[0]
    n_co = conn.execute(
        "SELECT COUNT(DISTINCT beneficiary_name) FROM satr_staging "
        "WHERE beneficiary_name IS NOT NULL AND beneficiary_name != ''"
    ).fetchone()[0]
    n_id = conn.execute(
        "SELECT COUNT(DISTINCT national_id) FROM satr_staging "
        "WHERE national_id IS NOT NULL AND national_id != ''"
    ).fetchone()[0]
    total_amt = conn.execute(
        "SELECT SUM(amount_eur) FROM satr_staging WHERE amount_eur IS NOT NULL"
    ).fetchone()[0] or 0

    print(f"  Total awards (rows):               {n:,}")
    print(f"  Unique beneficiary names:          {n_co:,}")
    print(f"  Unique national IDs:               {n_id:,}")
    print(f"  Total aid amount (sum):            €{total_amt/1e9:.2f}B\n")

    print("  By granting country:")
    rows = conn.execute(
        "SELECT granting_country_iso2, COUNT(*), "
        "       COUNT(DISTINCT beneficiary_name), "
        "       SUM(amount_eur) "
        "FROM satr_staging "
        "GROUP BY granting_country_iso2 ORDER BY 2 DESC"
    ).fetchall()
    print(f"    {'ISO':4} {'awards':>10} {'companies':>12} {'amount':>14}")
    for iso, c, co, amt in rows:
        amt_str = f"€{(amt or 0)/1e6:>10,.1f}M"
        print(f"    {iso or '?':4} {c:>10,} {co:>12,} {amt_str:>14}")

    print("\n  By filter family:")
    for filt, c in conn.execute(
        "SELECT source_filter, COUNT(*) FROM satr_staging GROUP BY 1 ORDER BY 2 DESC"
    ):
        print(f"    {filt}: {c:,}")

    print("\n  By aid instrument (top 10):")
    for ins, c in conn.execute(
        "SELECT aid_instrument_text, COUNT(*) FROM satr_staging "
        "GROUP BY 1 ORDER BY 2 DESC LIMIT 10"
    ):
        print(f"    {c:>7,}  {(ins or '?')[:80]}")


# ── Apply (staging → corpus tables) ──────────────────────────────────────────

def apply_staging(conn: sqlite3.Connection, *, dry_run: bool = False) -> dict:
    """Promote satr_staging rows to companies + public_funding_events.

    For each staging row:
      1. Skip if satr_tm_id is already in public_funding_events
      2. Resolve / create company:
         a. Try national_id + country (rare since we don't store IDs on companies)
         b. Try normalised name + country exact
         c. Otherwise create a new companies row
      3. Insert into public_funding_events with source=satr_<iso2>_<filter>_<year>
      4. Update staging.company_id + apply_status
    """
    # Build a name-lookup over existing companies
    print("  Building name index over existing companies...")
    name_index: dict[tuple[str, str], int] = {}
    for cid, canon, raw, country in conn.execute(
        "SELECT id, canonical_name, raw_name, country FROM companies"
    ):
        if not country:
            continue
        c_iso = canonicalise_country(country) or ""
        if not c_iso:
            continue
        for n in {normalise_name(canon), normalise_name(raw)}:
            if n:
                key = (n, c_iso)
                name_index.setdefault(key, cid)

    print(f"  Companies indexed: {len(name_index):,}")

    # Already-loaded TMs
    seen_tm = {r[0] for r in conn.execute(
        "SELECT satr_tm_id FROM public_funding_events "
        "WHERE satr_tm_id IS NOT NULL"
    )}
    print(f"  Existing SATR TMs in public_funding_events: {len(seen_tm):,}")

    # Iterate staging rows
    stats = Counter()
    cur = conn.cursor()
    rows = conn.execute(
        "SELECT tm_id, country, aid_measure_title, sa_number, national_id, "
        "       beneficiary_name, beneficiary_type, region, sector_nace, "
        "       aid_instrument_text, objectives_text, "
        "       granting_authority, granting_country_iso2, "
        "       beneficiary_country_iso2, amount_eur, amount_basis, "
        "       grant_year, source_filter, date_granted "
        "FROM satr_staging WHERE apply_status IS NULL OR apply_status='error'"
    ).fetchall()

    print(f"  Staging rows to apply: {len(rows):,}")

    for (tm, country, title, sa, natid, name, btype, region, nace,
         ins_text, obj_text, granting_auth, gc_iso, bc_iso,
         amt_eur, amt_basis, year, filt, date_granted) in rows:

        if tm in seen_tm:
            stats["skipped_duplicate_tm"] += 1
            continue

        beneficiary_country_iso = bc_iso or gc_iso
        if beneficiary_country_iso:
            beneficiary_country_iso = canonicalise_country(beneficiary_country_iso)

        if not name:
            stats["skipped_no_name"] += 1
            cur.execute(
                "UPDATE satr_staging SET apply_status=? WHERE tm_id=?",
                ("skipped_no_name", tm),
            )
            continue

        # Resolve company
        norm = normalise_name(name)
        company_id = None
        match_method = None
        if norm and beneficiary_country_iso:
            company_id = name_index.get((norm, beneficiary_country_iso))
            if company_id:
                match_method = "name_exact"

        if company_id is None:
            # Create new company
            if dry_run:
                stats["would_create"] += 1
                continue
            try:
                r = cur.execute(
                    "INSERT INTO companies (canonical_name, raw_name, country, "
                    "                       match_confidence, match_method) "
                    "VALUES (?, ?, ?, 'medium', 'none')",
                    (name, name, beneficiary_country_iso),
                )
                company_id = r.lastrowid
                name_index[(norm, beneficiary_country_iso)] = company_id
                stats["created_companies"] += 1
                match_method = "created"
            except sqlite3.IntegrityError as e:
                # Europe-scope trigger or similar — skip the row
                stats["skipped_scope_violation"] += 1
                cur.execute(
                    "UPDATE satr_staging SET apply_status=?, apply_notes=? "
                    "WHERE tm_id=?",
                    ("skipped_scope_violation", str(e)[:200], tm),
                )
                continue

        if dry_run:
            stats["would_insert_event"] += 1
            continue

        # Build source ID and insert event
        source_id = f"satr_{(gc_iso or 'unk').lower()}_{filt}_{year or 'na'}"
        aid_inst_bid = map_instrument_to_bid(ins_text)
        aid_obj_bid = map_objective_to_bid(obj_text)
        project_started_iso = None
        if date_granted:
            try:
                project_started_iso = datetime.strptime(
                    date_granted.strip(), "%d/%m/%Y"
                ).date().isoformat()
            except ValueError:
                pass

        raw_source_url = None
        if sa:
            raw_source_url = f"https://competition-cases.ec.europa.eu/cases/{sa}"

        # Fetch entrusted + intermediaries from staging (already inserted there)
        ee_fi = cur.execute(
            "SELECT entrusted_entity, financial_intermediaries FROM satr_staging WHERE tm_id=?",
            (tm,),
        ).fetchone() or (None, None)
        entrusted, fin_inter = ee_fi
        ndb_id = classify_ndb(granting_auth, entrusted, fin_inter)

        try:
            cur.execute(
                """
                INSERT INTO public_funding_events (
                    company_id, source, role, project_title, call_id,
                    project_started, grant_amount_eur, sector_tags_raw,
                    raw_source_url, deployment_country, grant_amount_basis,
                    ipcei_linked, eif_lp_backed,
                    satr_tm_id, aid_instrument, aid_objective,
                    granting_authority, granting_authority_country,
                    entrusted_entity, financial_intermediaries, ndb_distributor
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,0,0,?,?,?,?,?,?,?,?)
                """,
                (
                    company_id, source_id, "beneficiary", title, sa,
                    project_started_iso, amt_eur, nace,
                    raw_source_url, gc_iso, amt_basis,
                    tm, aid_inst_bid, aid_obj_bid,
                    granting_auth, gc_iso,
                    entrusted, fin_inter, ndb_id,
                ),
            )
            seen_tm.add(tm)
            stats["events_inserted"] += 1
            cur.execute(
                "UPDATE satr_staging SET company_id=?, apply_status=?, "
                "       apply_notes=? WHERE tm_id=?",
                (company_id, match_method or "matched", None, tm),
            )
        except sqlite3.IntegrityError as e:
            stats["insert_errors"] += 1
            cur.execute(
                "UPDATE satr_staging SET apply_status=?, apply_notes=? "
                "WHERE tm_id=?",
                ("error", str(e)[:200], tm),
            )

    if not dry_run:
        conn.commit()

    return dict(stats)


# ── Entry point ─────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--staging", action="store_true",
                    help="Load CSV.gz files into satr_staging")
    ap.add_argument("--report", action="store_true",
                    help="Print summary from satr_staging")
    ap.add_argument("--apply", action="store_true",
                    help="Promote staging rows to companies + public_funding_events")
    ap.add_argument("--dry-run", action="store_true",
                    help="Used with --apply: report counts without writing")
    args = ap.parse_args()

    conn = sqlite3.connect(DB_PATH)
    try:
        if args.staging:
            print("Loading SATR CSVs into satr_staging...")
            stats = load_staging(conn)
            for k, v in stats.items():
                print(f"  {k}: {v:,}" if isinstance(v, int) else f"  {k}: {v}")
        if args.report:
            report(conn)
        if args.apply:
            print(f"\nApplying staging → corpus (dry_run={args.dry_run})...")
            stats = apply_staging(conn, dry_run=args.dry_run)
            for k, v in stats.items():
                print(f"  {k}: {v:,}")
        if not any([args.staging, args.report, args.apply]):
            ap.print_help()
    finally:
        conn.close()


if __name__ == "__main__":
    main()
