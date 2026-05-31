"""Extract ADEME grant beneficiaries — Sprint 16 follow-up.

ADEME (Agence de la transition écologique) is France's central cleantech /
energy-transition NDB. Under décret 2017-779, ADEME publishes every grant
convention as open data on `data.ademe.fr`.

Dataset: `les-aides-financieres-de-l'ademe`
Format: ~38,669 grant decisions 2021-2026 totalling ~€10.4B in cash aid
        ("aide en numéraire"). Average grant €268k.

Columns:
  Nom de l attribuant, idAttribuant, dateConvention, referenceDecision,
  nomBeneficiaire, idBeneficiaire (SIRET), objet, dispositifAide,
  montant, nature, conditionsVersement, datesPeriodeVersement, idRAE,
  notificationUE

We filter to:
  - Year ≥ 2021 (sprint scope window)
  - Beneficiary name does NOT match public-entity regex (commune, ville,
    département, région, SDIS, hôpital, université, etc.)

Schema mapping:
  source             = 'ademe_aid'
  role               = 'direct'
  grant_amount_eur   = montant (already EUR)
  grant_amount_basis = 'ademe_grant'
  deployment_country = 'FR'
  ndb_distributor    = 'ademe'
  eif_lp_backed      = 0
  coordinator_only   = 0

Run modes:
  python extract_ademe.py             → CSV only
  python extract_ademe.py --load-db   → match + load
  python extract_ademe.py --refresh   → re-download
"""
from __future__ import annotations

import csv
import re
import sqlite3
import subprocess
import sys
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

from ndb_helpers import backfill_ipcei_linked

BASE_DIR = Path(__file__).parent.parent
RAW_DIR = BASE_DIR / "data" / "raw" / "ademe"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

SOURCE_URL = ("https://data.ademe.fr/data-fair/api/v1/datasets/"
              "les-aides-financieres-de-l'ademe/convert")
RAW_CSV = RAW_DIR / "ademe_aides.csv"
OUT_CSV = OUT_DIR / "ademe_aids.csv"
MATCH_CSV_PATH = OUT_DIR / "ademe_match_summary.csv"
DB_PATH = BASE_DIR / "db.sqlite"
DEPLOYMENT_COUNTRY = "FR"

ADEME_SOURCE_SECTOR: dict[str, str] = {"ademe_aid": "cleantech"}

# Public/government beneficiary patterns — exclude
_PUBLIC_RE = re.compile(
    r"\b(COMMUNE|VILLE\s+DE|MAIRIE|DEPARTEMENT|RÉGION|REGION|"
    r"SDIS|SDEE|SDEC|SIVOM|SIVU|COMMUNAUTE|METROPOLE|MÉTROPOLE|"
    r"AGGLOM|ETAT|ETABLISSEMENT\s+PUBLIC|"
    r"PREFECTURE|GENDARMERIE|POLICE|"
    r"UNIVERSIT[EÉ]|CNRS|INSERM|INRAE|INRIA|CEA\b|"
    r"H[OÔ]PITAL|CHU\b|CHRU\b|CHR\b|CENTRE\s+HOSPITALIER|"
    r"COLL[EÈ]GE|LYC[EÉ]E|[EÉ]COLE|RECTORAT|ACADÉMIE|ACADEMIE|"
    r"OFFICE\s+PUBLIC|HABITAT|"
    r"PARC\s+NATUREL|RESERVE\s+NATURELLE|CONSERVATOIRE|"
    r"ASSOCIATION\s+(?:DES|DU|DE\s+LA)|ADIE\b|"
    r"FÉDÉRATION|FEDERATION\s+(?:DES|DU|DE\s+LA)|"
    r"SYNDICAT\s+MIXTE|SYNDICAT\s+INTERCOMM)\b",
    re.IGNORECASE,
)

_NORM_LEGAL_RE = re.compile(
    r"\b(?:SA|SAS|SASU|SARL|EURL|SCS|SCA|SNC|SE|SC|SCIC|SCOP|SCI|SCP|SELARL|"
    r"GIE|GAEC|SCM|SEM|SEMOP|SEML|GmbH|AG|BV|Ltd|Limited|Inc|Corp|"
    r"Holding|Group|Groupe)\b\.?", re.IGNORECASE,
)
_NORM_PUNCT_RE = re.compile(r"[,.\-_/\\&]+")
_NORM_WS_RE = re.compile(r"\s+")


def normalize_name(s: str) -> str:
    s = _NORM_LEGAL_RE.sub("", s or "")
    s = _NORM_PUNCT_RE.sub(" ", s)
    return _NORM_WS_RE.sub(" ", s).strip().lower()


def fetch(force: bool) -> None:
    if RAW_CSV.exists() and not force and RAW_CSV.stat().st_size > 1_000_000:
        return
    subprocess.run(
        ["/usr/bin/curl", "-sL", "-A", "Mozilla/5.0", "--max-time", "120",
         "-o", str(RAW_CSV), SOURCE_URL],
        check=False,
    )
    if not RAW_CSV.exists() or RAW_CSV.stat().st_size < 100_000:
        raise RuntimeError(f"ADEME download failed → {RAW_CSV}")


def _parse_amount(s: str) -> float | None:
    if not s: return None
    s = s.strip().replace(",", ".")
    try: return float(s)
    except ValueError: return None


def parse() -> list[dict]:
    rows: list[dict] = []
    skipped_public = 0
    skipped_pre_2021 = 0
    skipped_no_name = 0
    with RAW_CSV.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            name = (r.get("nomBeneficiaire") or "").strip()
            if not name:
                skipped_no_name += 1
                continue
            date = (r.get("dateConvention") or "").strip()
            try:
                year = int(date[:4])
            except ValueError:
                skipped_pre_2021 += 1
                continue
            if year < 2021:
                skipped_pre_2021 += 1
                continue

            if _PUBLIC_RE.search(name):
                skipped_public += 1
                continue

            siret = (r.get("idBeneficiaire") or "").strip() or None
            obj = (r.get("objet") or "").strip()
            disp = (r.get("dispositifAide") or "").strip()
            amount = _parse_amount(r.get("montant", ""))
            ref = (r.get("referenceDecision") or "").strip()

            call_id = f"ademe_{ref or siret}_{year}"
            rows.append({
                "source": "ademe_aid",
                "call_id": call_id[:120],
                "raw_name": name,
                "siret": siret,
                "project_title": obj[:240] if obj else None,
                "project_summary": (disp + (" | " + obj if obj else ""))[:1500] or None,
                "sector_tags_raw": f"ADEME | {disp}",
                "sector_v1": "cleantech",
                "grant_amount_eur": amount,
                "call_deadline": date,
                "doc_url": "https://data.ademe.fr/datasets/les-aides-financieres-de-l'ademe",
                "country": "FR",
            })
    print(f"  Skipped {skipped_no_name} (empty name), "
          f"{skipped_pre_2021} (pre-2021), {skipped_public} (public entity)")
    return rows


_FUZZY_THRESHOLD = 0.94  # higher than usual — 38k rows × O(n²) is expensive

MATCH_FIELDNAMES = [
    "source", "call_id", "published_name", "country",
    "matched_company_id", "matched_canonical_name",
    "match_method", "match_confidence", "fuzzy_score",
]


def match_companies(rows: list[dict], conn: sqlite3.Connection):
    cur = conn.cursor()
    cur.execute("SELECT id, canonical_name, country FROM companies WHERE country='FR' OR country IS NULL")
    existing: dict[tuple[str, str], tuple[int, str]] = {}
    for row_id, cname, cntry in cur.fetchall():
        norm = normalize_name(cname)
        existing[(norm, (cntry or "").upper())] = (row_id, cname)

    enriched, summary = [], []
    for r in rows:
        raw_name = r["raw_name"]
        country = r["country"]
        norm = normalize_name(raw_name)

        cid: int | None = None
        method, conf = "none", "unmatched"
        matched_canonical = ""

        if (norm, country) in existing:
            cid, matched_canonical = existing[(norm, country)]
            method, conf = "exact", "high"

        if cid is None:
            cur.execute(
                """INSERT INTO companies
                   (canonical_name, raw_name, country, entity_type, sector_inferred,
                    match_confidence, match_method)
                   VALUES (?, ?, ?, 'company', ?, 'unmatched', 'none')""",
                (raw_name, raw_name, country, r["sector_v1"]),
            )
            cid = cur.lastrowid
            matched_canonical = raw_name
            existing[(norm, country)] = (cid, raw_name)

        enriched.append({**r, "company_id": cid})
        summary.append({
            "source": r["source"], "call_id": r["call_id"],
            "published_name": raw_name, "country": country,
            "matched_company_id": cid, "matched_canonical_name": matched_canonical,
            "match_method": method, "match_confidence": conf, "fuzzy_score": None,
        })
    conn.commit()
    return enriched, summary


def load_events(rows: list[dict], conn: sqlite3.Connection) -> int:
    cur = conn.cursor()
    inserted, skipped = 0, 0
    for r in rows:
        cur.execute(
            "SELECT 1 FROM public_funding_events WHERE source=? AND call_id=?",
            (r["source"], r["call_id"]),
        )
        if cur.fetchone():
            skipped += 1
            continue
        cur.execute(
            """INSERT INTO public_funding_events
               (company_id, source, role, call_id, project_title, project_summary,
                grant_amount_eur, sector_tags_raw,
                raw_source_url, coordinator_only, grant_amount_basis,
                call_deadline, deployment_country, eif_lp_backed, ndb_distributor)
               VALUES (?, ?, 'direct', ?, ?, ?, ?, ?, ?, 0, 'ademe_grant',
                       ?, ?, 0, 'ademe')""",
            (r["company_id"], r["source"], r["call_id"],
             r["project_title"], r["project_summary"],
             r["grant_amount_eur"], r["sector_tags_raw"], r["doc_url"],
             r["call_deadline"], DEPLOYMENT_COUNTRY),
        )
        inserted += 1
    conn.commit()
    if skipped:
        print(f"  Skipped {skipped} duplicate (source, call_id) pairs")
    return inserted


CSV_FIELDNAMES = ["source", "call_id", "raw_name", "siret", "project_title",
                  "sector_tags_raw", "sector_v1", "grant_amount_eur",
                  "call_deadline", "country", "doc_url"]


def main() -> None:
    args = set(sys.argv[1:])
    load_db = "--load-db" in args
    refresh = "--refresh" in args

    print("Fetching ADEME aides financières …")
    fetch(refresh)
    rows = parse()
    print(f"Parsed {len(rows)} ADEME grant decisions (2021+, company recipients)")

    grand = sum((r["grant_amount_eur"] or 0) for r in rows)
    print(f"Headline grant volume: €{grand/1e6:.1f}M")

    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    print(f"CSV → {OUT_CSV}")

    if not load_db:
        print("(CSV only — pass --load-db to match and load into db.sqlite)")
        return

    conn = sqlite3.connect(DB_PATH)
    enriched, summary = match_companies(rows, conn)

    with MATCH_CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w2 = csv.DictWriter(f, fieldnames=MATCH_FIELDNAMES)
        w2.writeheader()
        w2.writerows(summary)
    method_counts: dict[str, int] = defaultdict(int)
    for s in summary:
        method_counts[s["match_method"]] += 1
    print("Match results:")
    for m, n in sorted(method_counts.items()):
        print(f"  {m:<20}  {n:>5}")

    inserted = load_events(enriched, conn)
    flagged = backfill_ipcei_linked(conn=conn, source_prefixes=("ademe_",))
    print(f"Inserted {inserted} events; flagged {flagged} as ipcei_linked")
    conn.close()
    print("next: run python3 classify.py")


if __name__ == "__main__":
    main()
