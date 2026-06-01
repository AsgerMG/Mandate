"""Extract Innovasjon Norge grant awards (Norway) — Sprint 17.

Data source:
  Innovasjon Norge publishes an open-data CSV of all grants/tildelinger via the
  Norwegian national open-data portal (data.norge.no). The dataset is CC0.

  Primary download URL (try in order):
    1. https://data.innovasjonnorge.no/api/files?filename=Tildelinger.csv
    2. https://data.norge.no/api/3/action/datastore_search?resource_id=<id>&limit=5000
    3. Fallback: download from the annual transparency report page:
       https://www.innovasjonnorge.no/no/verktoy/statistikk-og-analyse/tildelinger/

  The CSV contains company-level grants with fields (typical):
    Kundenummer, Organisasjonsnummer, Kundenavn, Postnummer, Kommune, Fylke,
    Land, Virkemiddel (instrument), Bevilgningsaar (year), Beloep (NOK amount),
    Utbetalt (paid out NOK)

  On data.norge.no, search for "Innovasjon Norge tildelinger" to find the
  current resource ID. The dataset was last confirmed under publisher
  "Innovasjon Norge" with file name "Tildelinger.csv".

Schema mapping:
  source             = 'innovasjon_norge_<instrument_slug>'
  grant_amount_eur   = Beloep NOK → EUR via fixed rate 11.5 NOK/EUR
  deployment_country = 'NO'
  ndb_distributor    = 'innovasjon_norge'

Run modes:
  python extract_innovasjon_norge.py             → fetch + CSV only
  python extract_innovasjon_norge.py --load-db   → fetch + match + load
  python extract_innovasjon_norge.py --probe      → test download URL only
  python extract_innovasjon_norge.py --local <path> → use local CSV file
"""
from __future__ import annotations

import argparse
import csv
import io
import re
import sqlite3
import sys
import urllib.request
import urllib.error
from pathlib import Path

import sys as _sys
_sys.path.insert(0, str(Path(__file__).parent))
from ndb_ssl import fetch_text as _ndb_fetch_text, fetch_json as _ndb_fetch_json
from ndb_helpers import normalise_ticket

BASE_DIR = Path(__file__).parent.parent
RAW_DIR = BASE_DIR / "data" / "raw" / "innovasjon_norge"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

CSV_PATH = OUT_DIR / "innovasjon_norge_grants.csv"
DB_PATH = BASE_DIR / "db.sqlite"
DEPLOYMENT_COUNTRY = "NO"
NDB_DISTRIBUTOR = "innovasjon_norge"

# NOK to EUR exchange rate (2024 average approx.)
NOK_EUR = 1 / 11.5

# Candidate download URLs in priority order
DOWNLOAD_URLS = [
    "https://data.innovasjonnorge.no/api/files?filename=Tildelinger.csv",
    # data.norge.no CKAN API — resource IDs to try (may change; find via search)
    "https://data.norge.no/api/3/action/datastore_search?resource_id=b7d76f48-b60d-4a38-93d5-8c89c78d7e1c&limit=50000",
]

# Innovation-relevant instruments to include (Norwegian term → English label → source slug)
# Map: lowercase substring in Virkemiddel field → source slug fragment
INSTRUMENT_MAP: dict[str, str] = {
    "innovasjonslaan": "loan_innovation",
    "innovasjonslån": "loan_innovation",
    "miljøteknologi": "grant_envirotech",
    "miljoteknologi": "grant_envirotech",
    "forsknings": "grant_rd",
    "etablerer": "grant_startup",
    "gründer": "grant_startup",
    "grunder": "grant_startup",
    "katapult": "grant_catapult",
    "klynge": "grant_cluster",
    "bio": "grant_bioeconomy",
    "global": "grant_global",
    "laerling": "grant_apprentice",
    "lærling": "grant_apprentice",
    "SMB": "grant_sme",
    "nyskapings": "grant_innovation",
    "nyskaping": "grant_innovation",
    "innovasjon": "grant_innovation",   # catch-all fallback
}

# Minimum year for the 2021-2026 scope window
MIN_YEAR = 2021


def _instrument_slug(virkemiddel: str) -> str:
    v_lower = (virkemiddel or "").lower()
    for key, slug in INSTRUMENT_MAP.items():
        if key.lower() in v_lower:
            return slug
    return "grant_other"


def _fetch_csv() -> str | None:
    """Try each URL in DOWNLOAD_URLS and return raw text of first that succeeds."""
    for url in DOWNLOAD_URLS:
        text = _ndb_fetch_text(url, timeout=60)
        if text:
            return text
    return None


def _parse_csv(text: str) -> list[dict]:
    """Parse Tildelinger.csv text → list of normalised row dicts."""
    rows = []
    # Try common delimiters (IN usually comma or semicolon)
    for delim in (";", ",", "\t"):
        sample = text[:2000]
        if sample.count(delim) > sample.count(",") or delim == ",":
            reader = csv.DictReader(io.StringIO(text), delimiter=delim)
            try:
                first = next(reader)
            except StopIteration:
                continue
            if len(first) < 4:
                continue
            # Reset
            reader = csv.DictReader(io.StringIO(text), delimiter=delim)
            rows = list(reader)
            break
    return rows


def _normalise_name(name: str) -> str:
    n = (name or "").upper()
    for suffix in [" AS", " ASA", " ANS", " DA", " SA", " BA", " SA.", " ASA.", " A/S"]:
        if n.endswith(suffix):
            n = n[: -len(suffix)]
    n = re.sub(r"[^A-Z0-9ÆØÅÉ ]+", " ", n).strip()
    return re.sub(r"\s+", " ", n)


def extract(raw_text: str) -> list[dict]:
    """Return cleaned grant rows from the CSV text."""
    raw_rows = _parse_csv(raw_text)
    if not raw_rows:
        print("  ERROR: could not parse CSV", file=sys.stderr)
        return []

    headers_lower = {k.lower().strip(): k for k in (raw_rows[0].keys() if raw_rows else [])}
    print(f"  CSV columns: {list(raw_rows[0].keys())[:8]}")

    # Flexible column detection
    def _col(row: dict, *candidates: str) -> str:
        for c in candidates:
            if c in row:
                return row[c].strip()
            c_low = c.lower()
            if c_low in headers_lower:
                return row[headers_lower[c_low]].strip()
        return ""

    out = []
    skipped_year = 0
    skipped_amount = 0
    for row in raw_rows:
        # Year filter
        year_str = _col(row, "Bevilgningsaar", "Bevilgningsår", "Aar", "År", "Year", "year")
        try:
            year = int(year_str)
        except ValueError:
            continue
        if year < MIN_YEAR:
            skipped_year += 1
            continue

        # Amount
        amt_str = _col(row, "Beloep", "Beløp", "Amount", "amount", "Innvilget", "Tildelt")
        amt_str = re.sub(r"[^\d.,]", "", amt_str).replace(",", ".").replace(" ", "")
        try:
            amount_nok = float(amt_str) if amt_str else 0.0
        except ValueError:
            amount_nok = 0.0
        if amount_nok <= 0:
            skipped_amount += 1
            continue
        amount_eur = amount_nok * NOK_EUR

        # Company name
        name = _col(row, "Kundenavn", "Navn", "Name", "Firmanavn", "Selskapsnavn")
        if not name:
            continue

        # Org number (Norwegian national company identifier)
        org_nr = _col(row, "Organisasjonsnummer", "OrganisasjonsNr", "OrgNr", "Orgnr")
        org_nr = re.sub(r"\s+", "", org_nr)

        # Instrument / virkemiddel
        virkemiddel = _col(row, "Virkemiddel", "Instrument", "Program", "Produkt")
        slug = _instrument_slug(virkemiddel)
        source = f"innovasjon_norge_{slug}_{year}"

        # Geography
        municipality = _col(row, "Kommune", "municipality")
        county = _col(row, "Fylke", "fylke")

        out.append({
            "source": source,
            "call_id": f"{source}_{org_nr or _normalise_name(name)[:30]}_{year}",
            "company_name": name,
            "company_name_norm": _normalise_name(name),
            "org_nr": org_nr,
            "country": DEPLOYMENT_COUNTRY,
            "city": municipality,
            "year": year,
            "instrument": virkemiddel,
            "grant_amount_eur": round(amount_eur, 2),
            "grant_amount_nok": amount_nok,
            "ndb_distributor": NDB_DISTRIBUTOR,
            "deployment_country": DEPLOYMENT_COUNTRY,
        })

    print(f"  Rows: {len(raw_rows)} total → {len(out)} kept "
          f"(skipped: {skipped_year} pre-{MIN_YEAR}, {skipped_amount} zero-amount)")
    return out


def _match_or_insert(con: sqlite3.Connection, norm_name: str, raw_name: str,
                     org_nr: str, city: str) -> int:
    cur = con.cursor()
    # 1. By org number (NO-specific national ID)
    if org_nr:
        cur.execute("SELECT id FROM companies WHERE national_id=? AND country='NO'", (org_nr,))
        row = cur.fetchone()
        if row:
            return row[0]
    # 2. Exact canonical name match
    cur.execute("SELECT id FROM companies WHERE canonical_name=? AND country='NO'",
                (norm_name,))
    row = cur.fetchone()
    if row:
        return row[0]
    # 3. Insert new
    cur.execute(
        """INSERT INTO companies (canonical_name, raw_name, country, city,
           national_id, entity_type, match_method, match_confidence)
           VALUES (?, ?, 'NO', ?, ?, 'unknown', 'innovasjon_norge', 'medium')""",
        (norm_name, raw_name, city or None, org_nr or None),
    )
    return cur.lastrowid


def _load_to_db(rows: list[dict]) -> dict:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    # Check if national_id column exists on companies
    cur.execute("PRAGMA table_info(companies)")
    col_names = {r[1] for r in cur.fetchall()}
    has_national_id = "national_id" in col_names

    counts = {"inserted": 0, "skipped_dup": 0, "errors": 0}
    for r in rows:
        try:
            norm = r["company_name_norm"]
            if has_national_id:
                cid = _match_or_insert(con, norm, r["company_name"],
                                       r["org_nr"], r["city"])
            else:
                cur.execute(
                    "SELECT id FROM companies WHERE canonical_name=? AND country='NO'",
                    (norm,))
                row = cur.fetchone()
                if row:
                    cid = row[0]
                else:
                    cur.execute(
                        """INSERT INTO companies (canonical_name, raw_name, country, city,
                           entity_type, match_method, match_confidence)
                           VALUES (?, ?, 'NO', ?, 'unknown', 'innovasjon_norge', 'medium')""",
                        (norm, r["company_name"], r["city"] or None),
                    )
                    cid = cur.lastrowid

            # Dedup by source + call_id
            cur.execute(
                "SELECT 1 FROM public_funding_events WHERE source=? AND call_id=?",
                (r["source"], r["call_id"]),
            )
            if cur.fetchone():
                counts["skipped_dup"] += 1
                continue

            cur.execute(
                """INSERT INTO public_funding_events
                   (company_id, source, call_id, role, coordinator_only,
                    project_started, grant_amount_eur,
                    grant_amount_basis, deployment_country, ndb_distributor)
                   VALUES (?, ?, ?, 'direct', 0, ?, ?, 'ndb_grant', ?, ?)""",
                (cid, r["source"], r["call_id"],
                 f"{r['year']}-01-01",
                 r["grant_amount_eur"],
                 r["deployment_country"],
                 r["ndb_distributor"]),
            )
            counts["inserted"] += 1
        except Exception as e:
            counts["errors"] += 1
            if counts["errors"] <= 3:
                print(f"  ERROR: {r['company_name']}: {e}", file=sys.stderr)

    con.commit()
    con.close()
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract Innovasjon Norge grants")
    parser.add_argument("--load-db", action="store_true", help="Load into db.sqlite")
    parser.add_argument("--probe", action="store_true", help="Test download URL only")
    parser.add_argument("--local", metavar="PATH", help="Use local CSV file instead of downloading")
    args = parser.parse_args()

    if args.local:
        text = Path(args.local).read_text(encoding="utf-8", errors="replace")
        print(f"  Using local file: {args.local}")
    else:
        print("Fetching Innovasjon Norge Tildelinger.csv ...")
        text = _fetch_csv()
        if not text:
            print(
                "\nERROR: Could not download the CSV. Manual steps:\n"
                "  1. Visit https://data.norge.no and search for 'Innovasjon Norge tildelinger'\n"
                "  2. Download the CSV file (Tildelinger.csv)\n"
                "  3. Re-run with: python extract_innovasjon_norge.py --local /path/to/Tildelinger.csv\n",
                file=sys.stderr,
            )
            sys.exit(1)
        if args.probe:
            print("  Probe OK — downloaded successfully")
            print("  First 200 chars:", text[:200])
            return
        # Cache raw file
        raw_path = RAW_DIR / "Tildelinger.csv"
        raw_path.write_text(text, encoding="utf-8")
        print(f"  Cached to {raw_path}")

    rows = extract(text)
    if not rows:
        print("  No rows extracted.")
        return

    # Save processed CSV
    out_fields = ["source", "call_id", "company_name", "org_nr", "country",
                  "city", "year", "instrument", "grant_amount_eur", "grant_amount_nok",
                  "ndb_distributor"]
    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=out_fields, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)
    print(f"  CSV → {CSV_PATH} ({len(rows)} rows)")

    from collections import Counter
    by_year = Counter(r["year"] for r in rows)
    for y, n in sorted(by_year.items()):
        total_eur = sum(r["grant_amount_eur"] for r in rows if r["year"] == y)
        print(f"    {y}: {n:>5} events  €{total_eur/1e6:.1f}M")

    if args.load_db:
        print("Loading into db.sqlite ...")
        counts = _load_to_db(rows)
        print(f"  Inserted: {counts['inserted']}, skipped dup: {counts['skipped_dup']}, errors: {counts['errors']}")
        print("  Run python3 classify.py after loading.")


if __name__ == "__main__":
    main()
