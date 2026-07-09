"""Extract French innovation-grant beneficiaries from central Opendatasoft registers.

Sprint 16 (2026-05-30): pivot from per-NDB scraping (Cloudflare-walled,
JS-rendered, brittle) to **central open-data portals** that already aggregate
the same information at company level.

Two ingested datasets (both administered by Bpifrance on behalf of French
state programmes; both publish company SIREN + subvention amount + project):

  1. **Concours d'innovation i-Nov**  (data.enseignementsup-recherche.gouv.fr)
     1,425 laureates 2018–2025. Sub-programme of France 2030 / PIA.
     Administered by Bpifrance under DGE mandate.
     source = 'bpifrance_inov'

  2. **PM'up Relance industrie — Île-de-France**  (data.iledefrance.fr)
     104 laureates 2020–2025. Regional industrial-recovery grants.
     Administered by Bpifrance under Région Île-de-France mandate.
     source = 'bpifrance_pmup_idf'

Why this approach:
- Bpifrance's own portfolio site (`bpifrance.fr`) is Cloudflare-walled (403 to
  curl + WebFetch). Le Hub sub-pages 403 via CloudFront. The EU SATR portal
  covers only state-aid-classified grants; commercial-conform Bpifrance equity
  is by design not state aid and not in SATR.
- These data.gouv.fr-mediated datasets are the **central public records** for
  Bpifrance-administered grant programmes. They sit on the Opendatasoft API
  platform (CSV/JSON exports, stable URLs), maintained by the ministries.
- The two datasets do not overlap: i-Nov is national (DGE), PM'up is regional
  (IDF). Both cite Bpifrance as the executing agency in their underlying
  award decisions.

Schema mapping (per row):
  source              = 'bpifrance_inov' | 'bpifrance_pmup_idf'
  role                = 'direct'
  grant_amount_eur    = subvention amount in EUR (already EUR)
  grant_amount_basis  = 'fr_innov_grant'
  equity_amount_eur   = NULL
  total_project_cost_eur = project cost in EUR (i-Nov + PM'up both expose this)
  deployment_country  = 'FR'
  ndb_distributor     = 'bpifrance'
  eif_lp_backed       = 0
  coordinator_only    = 0  (each laureate is the company; not a consortium-coord-only proxy)

Run modes:
  python extract_fr_innov_grants.py             → parse + CSV only
  python extract_fr_innov_grants.py --load-db   → parse + match + load
  python extract_fr_innov_grants.py --refresh   → re-download
"""
from __future__ import annotations


# --- ETL path bootstrap (auto-added; see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB as _ETL_DB, ROOT as _ETL_ROOT  # noqa: E402,F401
# --- end ETL path bootstrap ---

import csv
import re
import sqlite3
import subprocess
import sys
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

from ndb_helpers import backfill_ipcei_linked

BASE_DIR = _ETL_ROOT
RAW_DIR = BASE_DIR / "data" / "raw" / "fr_innov_grants"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

INOV_URL = ("https://data.enseignementsup-recherche.gouv.fr/api/explore/v2.1/"
            "catalog/datasets/fr-esr-laureats-concours-i-nov/exports/csv?use_labels=true")
PMUP_URL = ("https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/"
            "laureats-relance-industrie/exports/csv?use_labels=true")
INNOVUP_URL = ("https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/"
               "entreprises-laureates-innovup-leader-pia/exports/csv?use_labels=true")
PDR_INDUS_URL = ("https://data.economie.gouv.fr/api/explore/v2.1/catalog/"
                 "datasets/plan-de-relance/exports/csv?use_labels=true")

INOV_RAW = RAW_DIR / "inov.csv"
PMUP_RAW = RAW_DIR / "pmup.csv"
INNOVUP_RAW = RAW_DIR / "innovup_leader_pia.csv"
PDR_INDUS_RAW = RAW_DIR / "plan_de_relance_industriel.csv"

CSV_PATH = OUT_DIR / "fr_innov_grants.csv"
MATCH_CSV_PATH = OUT_DIR / "fr_innov_grants_match_summary.csv"
DB_PATH = _ETL_DB
DEPLOYMENT_COUNTRY = "FR"


# i-Nov "Thématique" → v1 sector
INOV_THEME_SECTOR: dict[str, str] = {
    "Agriculture innovante": "cleantech",
    "Sécurité": "defense",
    "Numérique": "digital",
    "Numérique – Deeptech": "digital",
    "Numérique deeptech": "digital",
    "Santé": "life_sciences",
    "Énergies renouvelables": "cleantech",
    "Energies renouvelables": "cleantech",
    "Économie circulaire": "cleantech",
    "Economie circulaire": "cleantech",
    "Industrie": "deeptech_hardware",
    "Aéronautique": "space",
    "Spatial": "space",
    "Transport": "cleantech",
    "Logistique": "cleantech",
    "Décarbonation": "cleantech",
    "Performance environnementale des bâtiments": "cleantech",
    "Construction": "deeptech_hardware",
    "Photonique-électronique": "deeptech_hardware",
    "Photonique électronique": "deeptech_hardware",
    "Quantique": "deeptech_hardware",
    "BioPharma": "life_sciences",
    "Biothérapies": "life_sciences",
    "Bioproduction": "life_sciences",
    "Cybersécurité": "digital",
    "Pédagogie et EdTech": "digital",
    "EdTech": "digital",
    "FoodTech / AgriTech": "cleantech",
    "Hydrogène": "cleantech",
}

# Sector fallback used by classify.py via source-family lookup
FR_INNOV_SOURCE_SECTOR: dict[str, str] = {
    "bpifrance_inov": "deeptech_hardware",
    "bpifrance_pmup_idf": "deeptech_hardware",
    "bpifrance_innovup_leader_idf": "deeptech_hardware",
    "fr_relance_industrie": "deeptech_hardware",
}


# Plan de Relance industrial FILIÈRE → sector
PDR_FILIERE_SECTOR: dict[str, str] = {
    "Automobile": "cleantech",  # mostly EV transition
    "Aéronautique": "space",
    "Agroalimentaire": "cleantech",
    "Santé": "life_sciences",
    "Nucléaire": "cleantech",
    "Chimie et Matériaux": "deeptech_hardware",
    "Electronique": "deeptech_hardware",
    "Construction": "deeptech_hardware",
    "Mines et métallurgie": "deeptech_hardware",
    "Intrants essentiels à l'industrie": "deeptech_hardware",
    "Défense": "defense",
    "Pharmaceutique": "life_sciences",
    "Numérique": "digital",
}


# ---------------------------------------------------------------------------
# Name normaliser
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Fetch
# ---------------------------------------------------------------------------

def fetch(url: str, out: Path, force: bool) -> None:
    if out.exists() and not force and out.stat().st_size > 2000:
        return
    subprocess.run(
        ["/usr/bin/curl", "-sL", "-A", "Mozilla/5.0", "--max-time", "60",
         "-o", str(out), url],
        check=False,
    )
    if not out.exists() or out.stat().st_size < 1000:
        raise RuntimeError(f"download failed: {url} → {out}")


# ---------------------------------------------------------------------------
# Parsers — one per dataset
# ---------------------------------------------------------------------------

def _to_eur(s: str) -> float | None:
    if not s: return None
    s = s.strip().replace("\xa0", "").replace(" ", "").replace(",", ".")
    try: return float(s)
    except ValueError: return None


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60]


def parse_inov(path: Path) -> list[dict]:
    rows: list[dict] = []
    with path.open(encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        for r in reader:
            name = (r.get("Entreprise") or "").strip()
            if not name:
                continue
            siren = (r.get("Identifiant SIREN de l'entreprise lauréate") or "").strip() or None
            theme = (r.get("Thématique") or "").strip()
            project = (r.get("Dénomination du projet lauréat") or "").strip()
            summary = (r.get("Résumé du projet lauréat") or "").strip()
            date = (r.get("Date de publication des résultats") or "").strip() or None
            grant = _to_eur(r.get("Montant de la subvention accordée (en €)", ""))
            project_cost = _to_eur(r.get("Montant total du projet lauréat (en €)", ""))
            sector_v1 = INOV_THEME_SECTOR.get(theme, FR_INNOV_SOURCE_SECTOR["bpifrance_inov"])

            call_id = f"bpifrance_inov_{_slug(name)}_{_slug(project)}"[:120]
            rows.append({
                "source": "bpifrance_inov",
                "call_id": call_id,
                "raw_name": name,
                "siren": siren,
                "project_title": project[:240] if project else None,
                "project_summary": summary[:1500] if summary else None,
                "sector_tags_raw": theme,
                "sector_v1": sector_v1,
                "grant_amount_eur": grant,
                "total_project_cost_eur": project_cost,
                "call_deadline": date,
                "doc_url": "https://data.enseignementsup-recherche.gouv.fr/explore/dataset/fr-esr-laureats-concours-i-nov/",
                "country": "FR",
            })
    return rows


def parse_innovup_leader(path: Path) -> list[dict]:
    """Innov'up Leader PIA — IDF region PIA programme, Bpifrance-administered."""
    rows: list[dict] = []
    with path.open(encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        for r in reader:
            name = (r.get("Raison Sociale") or "").strip()
            if not name:
                continue
            siren = (r.get("SIREN") or "").strip() or None
            activity = (r.get("Activité") or "").strip()
            project = (r.get("Projet") or "").strip()
            project_cost = _to_eur(r.get("Coût du projet", ""))
            grant = _to_eur(r.get("Montant Total Aide", ""))
            sector_label = (r.get("Secteur") or "").strip()

            sv = (sector_label + " " + activity + " " + project).lower()
            if any(k in sv for k in ("santé", "médica", "pharma", "biothér", "diagnos", "thérapie")):
                sector_v1 = "life_sciences"
            elif any(k in sv for k in ("hydrogène", "énergie", "décarbon", "biomasse", "solaire",
                                       "éolien", "recyclage", "économie circ", "véhicule",
                                       "mobilité électrique", "batterie", "climat")):
                sector_v1 = "cleantech"
            elif any(k in sv for k in ("logiciel", "saas", "cybersécur", "intelligence artificielle",
                                       "data", "plateforme", "numérique", "réalité virtuelle",
                                       "réalité augmentée", "edtech")):
                sector_v1 = "digital"
            elif any(k in sv for k in ("défense", "armement", "spatial", "aéronaut")):
                sector_v1 = "defense" if "défense" in sv or "armement" in sv else "space"
            else:
                sector_v1 = "deeptech_hardware"

            call_id = f"bpifrance_innovup_leader_idf_{_slug(name)}"[:120]
            rows.append({
                "source": "bpifrance_innovup_leader_idf",
                "call_id": call_id,
                "raw_name": name,
                "siren": siren,
                "project_title": (project or activity)[:240],
                "project_summary": (activity + " | " + project)[:1500] or None,
                "sector_tags_raw": f"Innov'up Leader PIA | {sector_label}",
                "sector_v1": sector_v1,
                "grant_amount_eur": grant,
                "total_project_cost_eur": project_cost,
                "call_deadline": None,
                "doc_url": "https://data.iledefrance.fr/explore/dataset/entreprises-laureates-innovup-leader-pia/",
                "country": "FR",
            })
    return rows


def parse_pdr_industriel(path: Path) -> list[dict]:
    """Plan de Relance industrial projects — Ministry of Industry / France Relance.
    No grant amounts published; row captures company-presence only."""
    rows: list[dict] = []
    with path.open(encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        for r in reader:
            name = (r.get("ENTREPRISE") or "").strip()
            if not name:
                continue
            siren = (r.get("SIREN") or "").strip() or None
            volet = (r.get("VOLET_RELANCE") or "").strip()
            mesure = (r.get("MESURE") or "").strip()
            desc = (r.get("DESCRIPTION_PROJET") or "").strip()
            filiere = (r.get("FILIÈRE") or "").strip()
            date = (r.get("MISE À JOUR") or r.get("MISE À JOUR ") or "").strip()
            tonnes_co2 = (r.get("TONNES EQUIVALENT CO2 (pour les projets décarbonation)") or "").strip()
            type_ent = (r.get("TYPE_ENTREPRISE") or "").strip()

            # Year derive: "2021-05-05" → 2021
            ym = re.match(r"(\d{4})", date)
            year = int(ym.group(1)) if ym else None

            sector_v1 = PDR_FILIERE_SECTOR.get(filiere, "deeptech_hardware")

            call_id = f"fr_relance_industrie_{siren or _slug(name)}_{_slug(mesure)[:30]}"[:120]
            rows.append({
                "source": "fr_relance_industrie",
                "call_id": call_id,
                "raw_name": name,
                "siren": siren,
                "project_title": mesure[:240] if mesure else None,
                "project_summary": (desc + (f" | {tonnes_co2}t CO2 evités" if tonnes_co2 else ""))[:1500] or None,
                "sector_tags_raw": f"{volet} | {filiere}",
                "sector_v1": sector_v1,
                "grant_amount_eur": None,  # not disclosed in this dataset
                "total_project_cost_eur": None,
                "call_deadline": date if year else None,
                "doc_url": "https://data.economie.gouv.fr/explore/dataset/plan-de-relance/",
                "country": "FR",
            })
    return rows


def parse_pmup(path: Path) -> list[dict]:
    rows: list[dict] = []
    with path.open(encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        for r in reader:
            name = (r.get("Nom de l'entreprise lauréate") or "").strip()
            if not name:
                continue
            siren = (r.get("SIREN") or "").strip() or None
            project_desc = (r.get("Description du projet") or "").strip()
            sector_desc = (r.get("Description de l'activité de l'entreprise") or "").strip()
            grant = _to_eur(r.get("Montant de la subvention :", ""))
            project_cost = _to_eur(r.get("Coût global du projet présenté par l'entreprise :", ""))
            # Heuristic sector from sector_desc keywords
            sv = (sector_desc or "").lower() + " " + (project_desc or "").lower()
            if any(k in sv for k in ("santé", "médica", "pharma", "biothér", "diagnos")):
                sector_v1 = "life_sciences"
            elif any(k in sv for k in ("hydrogène", "énergie renouv", "décarbon", "biomasse",
                                       "solaire", "éolien", "recyclage", "économie circ",
                                       "véhicule", "mobilité électrique", "batterie")):
                sector_v1 = "cleantech"
            elif any(k in sv for k in ("logiciel", "saas", "cybersécur", "intelligence artificielle",
                                       "data", "plateforme", "numérique")):
                sector_v1 = "digital"
            elif any(k in sv for k in ("défense", "défensive", "armement")):
                sector_v1 = "defense"
            elif any(k in sv for k in ("spatial", "satellite", "aéronaut", "aérospat")):
                sector_v1 = "space"
            else:
                sector_v1 = "deeptech_hardware"  # PM'up is industrial reshoring → deeptech default

            call_id = f"bpifrance_pmup_idf_{_slug(name)}"[:120]
            rows.append({
                "source": "bpifrance_pmup_idf",
                "call_id": call_id,
                "raw_name": name,
                "siren": siren,
                "project_title": project_desc[:240] if project_desc else None,
                "project_summary": (sector_desc + " | " + project_desc)[:1500] or None,
                "sector_tags_raw": "PM'up Relance industrie",
                "sector_v1": sector_v1,
                "grant_amount_eur": grant,
                "total_project_cost_eur": project_cost,
                "call_deadline": None,
                "doc_url": "https://data.iledefrance.fr/explore/dataset/laureats-relance-industrie/",
                "country": "FR",
            })
    return rows


# ---------------------------------------------------------------------------
# Matcher + loader
# ---------------------------------------------------------------------------

_FUZZY_THRESHOLD = 0.92

MATCH_FIELDNAMES = [
    "source", "call_id", "published_name", "country",
    "matched_company_id", "matched_canonical_name",
    "match_method", "match_confidence", "fuzzy_score",
]


def match_companies(rows: list[dict], conn: sqlite3.Connection):
    cur = conn.cursor()
    cur.execute("SELECT id, canonical_name, country FROM companies WHERE country='FR' OR country IS NULL")
    existing: dict[tuple[str, str], tuple[int, str]] = {}
    existing_list: list[tuple[str, str, int, str]] = []
    for row_id, cname, cntry in cur.fetchall():
        norm = normalize_name(cname)
        existing[(norm, (cntry or "").upper())] = (row_id, cname)
        existing_list.append((norm, (cntry or "").upper(), row_id, cname))

    enriched, summary = [], []
    for r in rows:
        raw_name = r["raw_name"]
        country = r["country"]
        norm = normalize_name(raw_name)

        cid: int | None = None
        method, conf = "none", "unmatched"
        matched_canonical = ""
        fuzzy_score = None

        if (norm, country) in existing:
            cid, matched_canonical = existing[(norm, country)]
            method, conf = "exact", "high"

        if cid is None and norm:
            best_ratio, best_id, best_name = 0.0, None, ""
            for ex_norm, ex_country, ex_id, ex_cname in existing_list:
                if ex_country and ex_country != country:
                    continue
                ratio = SequenceMatcher(None, norm, ex_norm).ratio()
                if ratio >= _FUZZY_THRESHOLD and ratio > best_ratio:
                    best_ratio, best_id, best_name = ratio, ex_id, ex_cname
            if best_id is not None:
                cid, matched_canonical = best_id, best_name
                method, conf, fuzzy_score = "fuzzy", "medium", round(best_ratio, 4)

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
            existing_list.append((norm, country, cid, raw_name))

        enriched.append({**r, "company_id": cid})
        summary.append({
            "source": r["source"], "call_id": r["call_id"],
            "published_name": raw_name, "country": country,
            "matched_company_id": cid, "matched_canonical_name": matched_canonical,
            "match_method": method, "match_confidence": conf, "fuzzy_score": fuzzy_score,
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
                grant_amount_eur, total_project_cost_eur, sector_tags_raw,
                raw_source_url, coordinator_only, grant_amount_basis,
                call_deadline, deployment_country, eif_lp_backed,
                ndb_distributor)
               VALUES (?, ?, 'direct', ?, ?, ?, ?, ?, ?, ?, 0, 'fr_innov_grant',
                       ?, ?, 0, 'bpifrance')""",
            (r["company_id"], r["source"], r["call_id"],
             r["project_title"], r["project_summary"],
             r["grant_amount_eur"], r["total_project_cost_eur"],
             r["sector_tags_raw"], r["doc_url"],
             r["call_deadline"], DEPLOYMENT_COUNTRY),
        )
        inserted += 1
    conn.commit()
    if skipped:
        print(f"  Skipped {skipped} duplicate (source, call_id) pairs")
    return inserted


CSV_FIELDNAMES = ["source", "call_id", "raw_name", "siren", "project_title",
                  "sector_tags_raw", "sector_v1", "grant_amount_eur",
                  "total_project_cost_eur", "call_deadline", "country", "doc_url"]


def main() -> None:
    args = set(sys.argv[1:])
    load_db = "--load-db" in args
    refresh = "--refresh" in args

    print("Fetching FR central innovation-grant registers …")
    fetch(INOV_URL, INOV_RAW, refresh)
    fetch(PMUP_URL, PMUP_RAW, refresh)
    fetch(INNOVUP_URL, INNOVUP_RAW, refresh)
    fetch(PDR_INDUS_URL, PDR_INDUS_RAW, refresh)

    inov_rows = parse_inov(INOV_RAW)
    pmup_rows = parse_pmup(PMUP_RAW)
    innovup_rows = parse_innovup_leader(INNOVUP_RAW)
    pdr_rows = parse_pdr_industriel(PDR_INDUS_RAW)
    rows = inov_rows + pmup_rows + innovup_rows + pdr_rows

    print(f"Parsed {len(inov_rows)} i-Nov + {len(pmup_rows)} PM'up + "
          f"{len(innovup_rows)} Innov'up Leader + {len(pdr_rows)} PdR-Industriel = {len(rows)} total")

    grand = sum((r["grant_amount_eur"] or 0) for r in rows)
    print(f"Headline grant volume: €{grand/1e6:.1f}M across rows with disclosed amount")

    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        # Restrict to declared columns; keys not in CSV_FIELDNAMES dropped via extrasaction
        w = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    print(f"CSV → {CSV_PATH}")

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
    flagged = backfill_ipcei_linked(conn=conn, source_prefixes=(
        "bpifrance_inov", "bpifrance_pmup_", "bpifrance_innovup_", "fr_relance_",
    ))
    print(f"Inserted {inserted} events; flagged {flagged} as ipcei_linked")
    conn.close()
    print("next: run python3 classify.py")


if __name__ == "__main__":
    main()
