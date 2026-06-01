"""Extract French regional innovation grants via data.gouv.fr SCDL standard — Sprint 17.

Data source:
  French public bodies are required (Decree 2017-779) to publish "données essentielles
  des conventions de subvention" for grants ≥ €23,000 on data.gouv.fr.
  This covers all 12 metropolitan French regions' innovation and enterprise grants.

  Standard: SCDL (Schéma Commun des Données Locales)
  SCDL subvention fields:
    nomAttribuant        — granting organisation name
    idAttribuant         — SIRET/SIREN of grantor
    nomBeneficiaire      — beneficiary company name
    idBeneficiaire       — SIRET (14 digits) or SIREN (9 digits) of beneficiary
    objet                — grant purpose description
    montant              — grant amount EUR
    nature               — type (subvention en numéraires, etc.)
    dateDecision         — ISO date of decision

  Scope: company beneficiaries only (idBeneficiaire is a SIRET/SIREN, not an
  association RNA number which starts with W).
  Innovation filter: objet contains keywords like "innovation", "numérique",
  "R&D", "entreprise", "startup", "technologie", "export", "développement industriel".

  Dedup against: existing bpifrance_ rows (IDF already loaded) and ademe_ rows.

  Direct CSV URLs for major regions:
    Occitanie:           data.occitanie.fr / data.gouv.fr
    Auvergne-Rhône-Alpes: opendata.auvergnerhonealpes.eu
    PACA:                trouver-une-aide.fr or region-sud.fr open data
    Grand Est:           opendata.grandest.fr
    Bretagne:            data.bretagne.bzh
    Nouvelle-Aquitaine:  data.laregion.fr
    Pays de la Loire:    data.paysdelaloire.fr
    Normandie:           data.normandie.fr
    Hauts-de-France:     opendata.hautsdefrance.fr
    Bourgogne-FC:        opendata.bourgognefranchecomte.fr

Run modes:
  python extract_fr_regions.py --probe           → discover available datasets
  python extract_fr_regions.py --load-db         → fetch + load all regions
  python extract_fr_regions.py --region occ      → single region
  python extract_fr_regions.py --local <path>    → load local SCDL CSV
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sqlite3
import sys
import urllib.request
from pathlib import Path

import sys as _sys
_sys.path.insert(0, str(Path(__file__).parent))
from ndb_ssl import fetch_text as _fetch_text_ssl, fetch_json as _fetch_json_ssl

BASE_DIR = Path(__file__).parent.parent
RAW_DIR = BASE_DIR / "data" / "raw" / "fr_regions"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

CSV_PATH = OUT_DIR / "fr_regions_grants.csv"
DB_PATH = BASE_DIR / "db.sqlite"
DEPLOYMENT_COUNTRY = "FR"
NDB_DISTRIBUTOR = "fr_region"
MIN_YEAR = 2021
MIN_AMOUNT = 23_000  # SCDL minimum disclosure threshold

# data.gouv.fr API
DATAGOUV_API = "https://www.data.gouv.fr/api/1"

# Known regional SCDL dataset CSV URLs and fallback search terms
# Format: {region_slug: {label, direct_url, search_terms}}
REGIONS: dict[str, dict] = {
    "occ": {
        "label": "Occitanie",
        "search": "subventions région occitanie",
        "direct_urls": [
            "https://data.occitanie.fr/api/explore/v2.1/catalog/datasets/subventions_attributaires/exports/csv",
            "https://www.data.gouv.fr/fr/datasets/r/occitanie-subventions",
        ],
        "slug": "occ",
    },
    "aura": {
        "label": "Auvergne-Rhône-Alpes",
        "search": "subventions auvergne rhône alpes region",
        "direct_urls": [
            "https://opendata.auvergnerhonealpes.eu/api/explore/v2.1/catalog/datasets/subventions/exports/csv",
        ],
        "slug": "aura",
    },
    "paca": {
        "label": "Provence-Alpes-Côte d'Azur",
        "search": "subventions région sud paca",
        "direct_urls": [
            "https://opendata.maregionsud.fr/api/explore/v2.1/catalog/datasets/subventions-region-sud/exports/csv",
        ],
        "slug": "paca",
    },
    "gest": {
        "label": "Grand Est",
        "search": "subventions grand est region",
        "direct_urls": [
            "https://opendata.grandest.fr/api/explore/v2.1/catalog/datasets/subventions-region-grand-est/exports/csv",
        ],
        "slug": "gest",
    },
    "bzh": {
        "label": "Bretagne",
        "search": "subventions région bretagne",
        "direct_urls": [
            "https://data.bretagne.bzh/api/explore/v2.1/catalog/datasets/subventions-region-bretagne/exports/csv",
        ],
        "slug": "bzh",
    },
    "naq": {
        "label": "Nouvelle-Aquitaine",
        "search": "subventions nouvelle aquitaine région",
        "direct_urls": [
            "https://data.laregion.fr/api/explore/v2.1/catalog/datasets/subventions/exports/csv",
        ],
        "slug": "naq",
    },
    "pdl": {
        "label": "Pays de la Loire",
        "search": "subventions pays de la loire région",
        "direct_urls": [
            "https://data.paysdelaloire.fr/api/explore/v2.1/catalog/datasets/subventions/exports/csv",
        ],
        "slug": "pdl",
    },
    "hdf": {
        "label": "Hauts-de-France",
        "search": "subventions hauts-de-france région",
        "direct_urls": [
            "https://opendata.hautsdefrance.fr/api/explore/v2.1/catalog/datasets/subventions/exports/csv",
        ],
        "slug": "hdf",
    },
}

# Innovation-filter keywords in objet (French) — at least one must match
INNOVATION_KEYWORDS = [
    "innovation", "innovant", "numérique", "digital", "r&d", "recherche et développement",
    "recherche-développement", "technologie", "technologique", "startup", "start-up",
    "développement industriel", "développement économique", "export", "internationalisation",
    "industrie du futur", "transition numérique", "transition digitale", "transformation",
    "incubat", "accompagnement d'entreprise", "création d'entreprise",
    "deeptech", "efficacité énergétique", "transition énergétique",
    "intelligence artificielle", "IA", "biotechnologie", "cleantech", "greentech",
]


def _innovation_relevant(objet: str) -> bool:
    if not objet:
        return False
    lower = objet.lower()
    return any(kw.lower() in lower for kw in INNOVATION_KEYWORDS)


def _is_company_siren(id_str: str) -> bool:
    """Return True if the beneficiary ID looks like a SIRET/SIREN (not an RNA association)."""
    clean = re.sub(r"\s+", "", id_str)
    if not clean:
        return False
    # RNA association numbers start with W
    if clean.upper().startswith("W"):
        return False
    # SIREN = 9 digits, SIRET = 14 digits
    if re.match(r"^\d{9,14}$", clean):
        return True
    return False


def _fetch_csv(url: str) -> str | None:
    return _fetch_text_ssl(url, timeout=60)


def _search_datagouv(search_term: str) -> list[str]:
    """Search data.gouv.fr for a region's subvention dataset, return CSV resource URLs."""
    url = f"{DATAGOUV_API}/datasets/?q={urllib.request.quote(search_term)}&page_size=5"
    data = _fetch_json_ssl(url, timeout=15)
    if not data:
        return []
    csv_urls = []
    for ds in data.get("data", []):
        for res in ds.get("resources", []):
            if (res.get("format", "").lower() in ("csv", "text/csv") and
                    "subvention" in (res.get("title") or "").lower()):
                csv_urls.append(res.get("url") or res.get("latest") or "")
    return [u for u in csv_urls if u]


def _parse_scdl_csv(text: str, region_slug: str) -> list[dict]:
    """Parse SCDL subvention CSV → clean rows for innovation-relevant company grants."""
    rows = []
    for delim in (";", ",", "\t"):
        reader = csv.DictReader(io.StringIO(text), delimiter=delim)
        sample = next(reader, None)
        if not sample or len(sample) < 3:
            continue
        reader = csv.DictReader(io.StringIO(text), delimiter=delim)
        break
    else:
        return []

    for raw_row in reader:
        def _f(*keys: str) -> str:
            for k in keys:
                v = raw_row.get(k) or raw_row.get(k.lower()) or raw_row.get(k.upper())
                if v:
                    return str(v).strip()
            return ""

        # Date / year
        date_str = _f("dateDecision", "date_decision", "date", "annee", "exercise")
        year_match = re.search(r"(20\d{2})", date_str)
        if not year_match:
            continue
        year = int(year_match.group(1))
        if year < MIN_YEAR:
            continue

        # Beneficiary
        name = _f("nomBeneficiaire", "nom_beneficiaire", "beneficiaire", "name")
        if not name:
            continue

        # SIRET/SIREN
        id_ben = _f("idBeneficiaire", "id_beneficiaire", "siret", "siren", "nif")
        if not _is_company_siren(id_ben):
            continue  # skip associations

        # Grant amount
        amt_str = _f("montant", "Montant", "amount", "montantTotal")
        amt_str = re.sub(r"[^\d.,]", "", amt_str).replace(",", ".").replace(" ", "")
        try:
            amount_eur = float(amt_str) if amt_str else 0.0
        except ValueError:
            amount_eur = 0.0
        if amount_eur < MIN_AMOUNT:
            continue

        # Innovation filter
        objet = _f("objet", "Objet", "description", "libelle", "object")
        if not _innovation_relevant(objet):
            continue

        source = f"fr_region_{region_slug}_{year}"
        call_id = f"{source}_{id_ben or name[:25]}"

        rows.append({
            "source": source,
            "call_id": call_id,
            "company_name": name,
            "company_name_norm": name.upper(),
            "siret": re.sub(r"\s+", "", id_ben),
            "country": DEPLOYMENT_COUNTRY,
            "year": year,
            "objet": objet[:200],
            "grant_amount_eur": round(amount_eur, 2),
            "ndb_distributor": NDB_DISTRIBUTOR,
            "deployment_country": DEPLOYMENT_COUNTRY,
            "region": region_slug,
        })
    return rows


def _load_to_db(rows: list[dict]) -> dict:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("PRAGMA table_info(companies)")
    col_names = {r[1] for r in cur.fetchall()}
    has_national_id = "national_id" in col_names

    # Dedup against existing Bpifrance (IDF) and ADEME rows
    cur.execute(
        """SELECT UPPER(c.canonical_name) FROM companies c
           JOIN public_funding_events pfe ON pfe.company_id = c.id
           WHERE pfe.source LIKE 'bpifrance_%' OR pfe.source LIKE 'ademe_%'
             AND c.country = 'FR'""")
    existing_fr = {row[0] for row in cur.fetchall()}
    print(f"  Dedup against {len(existing_fr)} existing FR company names (bpifrance+ademe)")

    counts = {"inserted": 0, "fr_deduped": 0, "skipped_dup": 0, "errors": 0}
    for r in rows:
        norm = r["company_name_norm"]
        if norm in existing_fr:
            counts["fr_deduped"] += 1
            continue
        try:
            cid = None
            siret = r.get("siret", "")
            if has_national_id and siret:
                cur.execute(
                    "SELECT id FROM companies WHERE national_id=? AND country='FR'", (siret,))
                row = cur.fetchone()
                cid = row[0] if row else None
            if cid is None:
                cur.execute(
                    "SELECT id FROM companies WHERE canonical_name=? AND country='FR'", (norm,))
                row = cur.fetchone()
                cid = row[0] if row else None
            if cid is None:
                if has_national_id:
                    cur.execute(
                        """INSERT INTO companies (canonical_name, raw_name, country, national_id,
                           entity_type, match_method, match_confidence)
                           VALUES (?, ?, 'FR', ?, 'unknown', 'fr_region', 'medium')""",
                        (norm, r["company_name"], siret or None))
                else:
                    cur.execute(
                        """INSERT INTO companies (canonical_name, raw_name, country,
                           entity_type, match_method, match_confidence)
                           VALUES (?, ?, 'FR', 'unknown', 'fr_region', 'medium')""",
                        (norm, r["company_name"]))
                cid = cur.lastrowid
            cur.execute(
                "SELECT 1 FROM public_funding_events WHERE source=? AND call_id=?",
                (r["source"], r["call_id"]))
            if cur.fetchone():
                counts["skipped_dup"] += 1
                continue
            cur.execute(
                """INSERT INTO public_funding_events
                   (company_id, source, call_id, role, coordinator_only,
                    project_title, project_started, grant_amount_eur,
                    grant_amount_basis, deployment_country, ndb_distributor)
                   VALUES (?, ?, ?, 'direct', 0, ?, ?, ?, 'ndb_grant', ?, ?)""",
                (cid, r["source"], r["call_id"], r.get("objet") or None,
                 f"{r['year']}-01-01", r["grant_amount_eur"],
                 r["deployment_country"], r["ndb_distributor"]))
            counts["inserted"] += 1
        except Exception as e:
            counts["errors"] += 1
            if counts["errors"] <= 3:
                print(f"  ERROR {r.get('company_name','?')}: {e}", file=sys.stderr)
    con.commit()
    con.close()
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract French regional innovation grants")
    parser.add_argument("--load-db", action="store_true")
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--region", choices=list(REGIONS.keys()) + ["all"],
                        default="all", help="Region to fetch")
    parser.add_argument("--local", metavar="PATH", help="Local SCDL CSV file")
    parser.add_argument("--local-region", metavar="SLUG", default="manual",
                        help="Region slug for --local file")
    args = parser.parse_args()

    if args.local:
        text = Path(args.local).read_text(encoding="utf-8", errors="replace")
        rows = _parse_scdl_csv(text, args.local_region)
        print(f"  Loaded {len(rows)} rows from {args.local}")
    else:
        target_regions = (
            list(REGIONS.keys()) if args.region == "all" else [args.region]
        )
        all_rows = []
        for slug in target_regions:
            cfg = REGIONS[slug]
            print(f"  Fetching {cfg['label']} ...")
            text = None
            # Try direct URLs first
            for url in cfg.get("direct_urls", []):
                text = _fetch_csv(url)
                if text and len(text) > 100:
                    print(f"    ✓ Got {len(text):,} chars from {url}")
                    break
                text = None
            # Fall back to data.gouv.fr search
            if not text:
                print(f"    Searching data.gouv.fr for: {cfg['search']}")
                csv_urls = _search_datagouv(cfg["search"])
                for url in csv_urls[:3]:
                    text = _fetch_csv(url)
                    if text and len(text) > 100:
                        print(f"    ✓ Got {len(text):,} chars via search")
                        break
                    text = None
            if not text:
                print(f"    ✗ Could not fetch {cfg['label']}")
                if args.probe:
                    print(
                        f"    Manual: visit your region's open data portal and\n"
                        f"    download the subventions CSV.\n"
                        f"    Then: python extract_fr_regions.py "
                        f"--local <file.csv> --local-region {slug} --load-db\n"
                    )
                continue
            # Cache raw
            (RAW_DIR / f"{slug}_subventions.csv").write_text(text, encoding="utf-8")
            region_rows = _parse_scdl_csv(text, slug)
            print(f"    → {len(region_rows)} innovation-relevant company grants")
            all_rows.extend(region_rows)
        rows = all_rows

    if not rows:
        print("  No rows extracted.")
        return

    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        if rows:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()), extrasaction="ignore")
            w.writeheader()
            for r in rows:
                w.writerow(r)
    print(f"  CSV → {CSV_PATH} ({len(rows)} rows)")
    from collections import Counter
    for y, n in sorted(Counter(r["year"] for r in rows).items()):
        print(f"    {y}: {n:>5}  €{sum(r['grant_amount_eur'] for r in rows if r['year']==y)/1e6:.1f}M")

    if args.load_db:
        counts = _load_to_db(rows)
        print(f"  Inserted: {counts['inserted']}, FR-deduped: {counts['fr_deduped']}, "
              f"dup: {counts['skipped_dup']}, errors: {counts['errors']}")
        print("  Run python3 classify.py after loading.")


if __name__ == "__main__":
    main()
