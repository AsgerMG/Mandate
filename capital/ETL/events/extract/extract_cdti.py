"""Extract CDTI (Centro para el Desarrollo Tecnológico Industrial) awards via BDNS API.

Source: Spanish national subsidies database (BDNS / SNPSAP). CDTI awards must be
published there by law (Ley 38/2003). API base: `infosubvenciones.es/bdnstrans/api`.

Search strategy:
  - GET /api/concesiones/busqueda?vpd=GE&descripcion=CDTI&page=<N>
  - Default page size 50; ~40 pages total (~1,957 raw matches as of 2026-05-26).
  - Post-filter to nivel3 = "CENTRO PARA EL DESARROLLO TECNOLÓGICO Y LA INNOVACIÓN E.P.E"
    to strip the 77 cross-mentions from ISCIII, Galician Innovation, and a Lorca
    convocatoria that happens to reference CDTI in the title.

Coverage limits:
  - BDNS publishing window for CDTI starts 2022 — zero 2021 rows in the dataset.
  - The plan's "2021-01-01 to today" filter is bound by BDNS coverage, not by our
    query. Document.
  - `descripcion=CDTI` is a text match; CDTI grants whose convocatoria title doesn't
    contain "CDTI" would be missed. Spot-checked: every CDTI convocatoria observed
    contains "CDTI" in either the title ("Resolución ... CDTI") or programme name.

Instrument filtering (Sprint 13 scope rule — "direct equity, quasi-equity, strategic
R&D grants only; exclude plain SME loans"):
  - SUBVENCIÓN y ENTREGA DINERARIA SIN CONTRAPRESTACIÓN (1815 rows) → INCLUDE,
    `grant_amount_basis='cdti_grant'`
  - PRÉSTAMO (142 rows) → INCLUDE but flag — most CDTI loans are strategic
    (NEOTEC, PERTE Chip, Misiones partial-debt); pure liquidity/working-capital
    loans are rare. Loaded with `grant_amount_basis='cdti_loan'`. Filter at query
    time if a strict grants-only view is needed.

Schema mapping:
  source              = 'cdti_<programme>_<year>' where year = fechaConcesion year
  role                = 'direct'
  grant_amount_eur    = importe (SUBVENCIÓN) or ayudaEquivalente (PRÉSTAMO — the
                          subsidy-equivalent value, which is the EU-comparable
                          state-aid figure for a loan at below-market interest)
  grant_amount_basis  = 'cdti_grant' | 'cdti_loan'
  deployment_country  = 'ES'
  eif_lp_backed       = 0

Run modes:
  python extract_cdti.py              → parse + CSV only
  python extract_cdti.py --load-db    → parse + match + load
  python extract_cdti.py --refresh    → re-download pages
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
import json
import re
import sqlite3
import subprocess
import sys
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

from ndb_helpers import backfill_ipcei_linked

BASE_DIR = _ETL_ROOT
RAW_DIR = BASE_DIR / "data" / "raw" / "cdti"
PAGES_DIR = RAW_DIR / "pages"
OUT_DIR = BASE_DIR / "data" / "processed"
PAGES_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

API_BASE = "https://www.infosubvenciones.es/bdnstrans/api"
SEARCH_URL = f"{API_BASE}/concesiones/busqueda?vpd=GE&descripcion=CDTI&page={{p}}"
CDTI_ORGANO = "CENTRO PARA EL DESARROLLO TECNOLÓGICO Y LA INNOVACIÓN E.P.E"

CSV_PATH = OUT_DIR / "cdti_awards.csv"
MATCH_CSV_PATH = OUT_DIR / "cdti_match_summary.csv"
DB_PATH = _ETL_DB
DEPLOYMENT_COUNTRY = "ES"


# ---------------------------------------------------------------------------
# Programme classifier — maps convocatoria title text to a source-id template
# Each template uses {year} for the fechaConcesion year so we can produce
# stable source IDs like cdti_neotec_2024.
# ---------------------------------------------------------------------------

# Order matters — first hit wins. Match on substrings of the convocatoria title.
PROGRAMME_RULES: list[tuple[str, str, str]] = [
    # (substring to match — case-insensitive, source_template, sector_v1)
    ("NEOTEC",                          "cdti_neotec_{year}",          "deeptech_hardware"),
    ("PERTE Chip",                      "cdti_perte_chip_{year}",      "deeptech_hardware"),
    ("PERTE microelectrónica",          "cdti_perte_chip_{year}",      "deeptech_hardware"),
    ("PERTE Vehículo Eléctrico",        "cdti_perte_vec_{year}",       "cleantech"),
    ("PERTE VEC",                       "cdti_perte_vec_{year}",       "cleantech"),
    ("PERTE de Descarbonización",       "cdti_perte_desc_{year}",      "cleantech"),
    ("PERTE Aeroespacial",              "cdti_perte_aero_{year}",      "deeptech_hardware"),
    ("PERTE Naval",                     "cdti_perte_naval_{year}",     "deeptech_hardware"),
    ("PERTE de Salud",                  "cdti_perte_salud_{year}",     "life_sciences"),
    ("PERTES AEROESPACIAL Y DE SALUD",  "cdti_perte_aerosalud_{year}", "deeptech_hardware"),
    ("Misiones",                        "cdti_misiones_{year}",        "deeptech_hardware"),
    ("Cervera",                         "cdti_cervera_{year}",         "deeptech_hardware"),
    ("Línea Directa de Expansión",      "cdti_lic_{year}",             "deeptech_hardware"),
    ("LÍNEA DIRECTA DE EXPANSIÓ",       "cdti_lic_{year}",             "deeptech_hardware"),
    ("innovación tecnológica",          "cdti_idi_{year}",             "deeptech_hardware"),
    ("Innovación Global",               "cdti_idi_global_{year}",      "deeptech_hardware"),
    # Fallback — anything else from CDTI gets a generic R&D bucket
    ("CDTI",                            "cdti_idi_{year}",             "deeptech_hardware"),
]


def classify_programme(convocatoria: str, year: int) -> tuple[str, str]:
    """Return (source_id, sector_v1) for a CDTI convocatoria title."""
    title_norm = convocatoria.lower()
    for needle, tmpl, sector in PROGRAMME_RULES:
        if needle.lower() in title_norm:
            return tmpl.format(year=year), sector
    return f"cdti_idi_{year}", "deeptech_hardware"


# Sector hint for classify.py source-fallback
CDTI_SOURCE_SECTOR: dict[str, str] = {}
for _, _tmpl, _sector in PROGRAMME_RULES:
    CDTI_SOURCE_SECTOR[_tmpl.replace("_{year}", "")] = _sector


# ---------------------------------------------------------------------------
# Name normalisation
# ---------------------------------------------------------------------------

# Beneficiario is "<NIF> <NAME>" — split.
NIF_RE = re.compile(r"^([A-HJNP-SUVW]\d{8}|\d{8}[A-Z]|[A-HJNP-SUVW]\d{7}[A-Z0-9])\s+(.+)$")

_NORM_LEGAL_RE = re.compile(
    r"\b(?:SOCIEDAD LIMITADA UNIPERSONAL|SOCIEDAD LIMITADA|SOCIEDAD ANONIMA|"
    r"SOCIEDAD COOPERATIVA|S\.L\.U\.|S\.L\.|S\.A\.|S\.A\.U\.|"
    r"SLU|SLL|SLNE|SAU|SL|SA|S COOP|COOPERATIVA|"
    r"OP|EUROPEA|"
    r"GmbH|AG|BV|NV|Ltd|Limited|PLC|LLC|Inc|Corp|SE)\b\.?",
    re.IGNORECASE,
)
_NORM_PUNCT_RE = re.compile(r"[,.\-_/\\&]+")
_NORM_WS_RE = re.compile(r"\s+")


def normalize_name(s: str) -> str:
    s = _NORM_LEGAL_RE.sub("", s)
    s = _NORM_PUNCT_RE.sub(" ", s)
    return _NORM_WS_RE.sub(" ", s).strip().lower()


def parse_beneficiario(b: str) -> tuple[str | None, str]:
    """Split 'B12345678 NEURO COMMUNICATION SYSTEMS SL' → (NIF, name)."""
    m = NIF_RE.match(b.strip())
    if m:
        return m.group(1), m.group(2).strip()
    return None, b.strip()


# ---------------------------------------------------------------------------
# Fetch + parse
# ---------------------------------------------------------------------------

def fetch_all(force: bool, max_pages: int = 50) -> None:
    """Download all BDNS result pages until two consecutive empties or page count cap."""
    empties = 0
    for p in range(max_pages):
        out = PAGES_DIR / f"page_{p}.json"
        if out.exists() and not force and out.stat().st_size > 500:
            continue
        for attempt in range(3):
            subprocess.run(
                ["/usr/bin/curl", "-sL", "-A", "Mozilla/5.0",
                 "-H", "Accept: application/json",
                 "-o", str(out), "--max-time", "30",
                 SEARCH_URL.format(p=p)],
                check=False,
            )
            if out.exists() and out.stat().st_size > 500:
                break
        if not out.exists() or out.stat().st_size <= 500:
            empties += 1
            try: out.unlink()
            except FileNotFoundError: pass
            if empties >= 2:
                break
        else:
            empties = 0


def parse_all(only_cdti: bool = True) -> list[dict]:
    """Read all cached pages, dedupe by id, filter to CDTI nivel3, emit rows."""
    seen: set[int] = set()
    rows: list[dict] = []
    files = sorted(PAGES_DIR.glob("page_*.json"),
                   key=lambda f: int(f.stem.split("_")[1]))
    for f in files:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        for item in data.get("content", []):
            iid = item.get("id")
            if iid is None or iid in seen:
                continue
            seen.add(iid)

            nivel3 = (item.get("nivel3") or "").strip()
            if only_cdti and nivel3 != CDTI_ORGANO:
                continue

            fecha = item.get("fechaConcesion") or ""
            try:
                year = int(fecha[:4])
            except ValueError:
                continue
            if year < 2021:
                continue  # plan scope window

            beneficiario = item.get("beneficiario") or ""
            nif, name = parse_beneficiario(beneficiario)
            if not name:
                continue

            convocatoria = item.get("convocatoria") or ""
            source_id, sector_v1 = classify_programme(convocatoria, year)

            instrumento = (item.get("instrumento") or "").strip()
            is_loan = "PRÉSTAMO" in instrumento.upper()
            # Subsidy-equivalent for loans; nominal for grants.
            amount = item.get("ayudaEquivalente") if is_loan else item.get("importe")
            try:
                amount = float(amount) if amount is not None else None
            except (TypeError, ValueError):
                amount = None

            basis = "cdti_loan" if is_loan else "cdti_grant"

            rows.append({
                "id": iid,
                "source": source_id,
                "call_id": f"cdti_{iid}",
                "fecha_concesion": fecha,
                "nif": nif or "",
                "raw_name": name,
                "country": "ES",
                "convocatoria": convocatoria[:300],
                "convocatoria_num": item.get("numeroConvocatoria", ""),
                "id_convocatoria": item.get("idConvocatoria"),
                "instrumento": instrumento,
                "is_loan": is_loan,
                "importe_eur": item.get("importe"),
                "ayuda_equivalente_eur": item.get("ayudaEquivalente"),
                "grant_amount_eur": amount,
                "grant_amount_basis": basis,
                "sector_v1": sector_v1,
                "sector_tags_raw": convocatoria[:200],
                "doc_url": item.get("urlBR", ""),
            })
    return rows


# ---------------------------------------------------------------------------
# Matcher + loader
# ---------------------------------------------------------------------------

_FUZZY_THRESHOLD = 0.92

MATCH_FIELDNAMES = [
    "source", "call_id", "published_name", "nif", "country",
    "matched_company_id", "matched_canonical_name",
    "match_method", "match_confidence", "fuzzy_score",
]


def match_companies(rows: list[dict], conn: sqlite3.Connection):
    cur = conn.cursor()
    cur.execute("SELECT id, canonical_name, country FROM companies")
    existing: dict[tuple[str, str], tuple[int, str]] = {}
    existing_list: list[tuple[str, str, int, str]] = []
    for row_id, cname, cntry in cur.fetchall():
        norm = normalize_name(cname)
        existing[(norm, (cntry or "").upper())] = (row_id, cname)
        existing_list.append((norm, (cntry or "").upper(), row_id, cname))

    enriched, summary = [], []
    country = DEPLOYMENT_COUNTRY  # CDTI funds Spanish entities

    for r in rows:
        raw_name = r["raw_name"]
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
                if ex_country != country:
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
                   VALUES (?, ?, ?, 'unknown', ?, 'unmatched', 'none')""",
                (raw_name, raw_name, country, r["sector_v1"]),
            )
            cid = cur.lastrowid
            matched_canonical = raw_name
            existing[(norm, country)] = (cid, raw_name)
            existing_list.append((norm, country, cid, raw_name))

        enriched.append({**r, "company_id": cid})
        summary.append({
            "source": r["source"], "call_id": r["call_id"], "published_name": raw_name,
            "nif": r.get("nif", ""), "country": country, "matched_company_id": cid,
            "matched_canonical_name": matched_canonical,
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
               (company_id, source, role, call_id, project_title,
                project_summary, project_started,
                grant_amount_eur, sector_tags_raw, raw_source_url,
                coordinator_only, grant_amount_basis,
                deployment_country, eif_lp_backed)
               VALUES (?, ?, 'direct', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0)""",
            (
                r["company_id"], r["source"], r["call_id"],
                r["convocatoria"][:200], r["instrumento"],
                r["fecha_concesion"] or None,
                r["grant_amount_eur"],
                r["sector_tags_raw"],
                r["doc_url"],
                r["grant_amount_basis"],
                DEPLOYMENT_COUNTRY,
            ),
        )
        inserted += 1
    conn.commit()
    if skipped:
        print(f"  Skipped {skipped} duplicate (source, call_id) pairs")
    return inserted


# ---------------------------------------------------------------------------

CSV_FIELDNAMES = [
    "id", "source", "call_id", "fecha_concesion", "nif", "raw_name", "country",
    "convocatoria", "convocatoria_num", "id_convocatoria",
    "instrumento", "is_loan",
    "importe_eur", "ayuda_equivalente_eur", "grant_amount_eur",
    "grant_amount_basis", "sector_v1", "sector_tags_raw", "doc_url",
]


def main() -> None:
    args = set(sys.argv[1:])
    load_db = "--load-db" in args
    refresh = "--refresh" in args

    print(f"Fetching CDTI awards from BDNS (descripcion=CDTI) ...")
    fetch_all(force=refresh)
    rows = parse_all(only_cdti=True)

    counts: dict[str, int] = defaultdict(int)
    sums: dict[str, float] = defaultdict(float)
    for r in rows:
        counts[r["source"]] += 1
        if r["grant_amount_eur"]:
            sums[r["source"]] += r["grant_amount_eur"]

    print(f"Parsed {len(rows)} CDTI awards (filtered to nivel3=CDTI, year>=2021)")
    for src in sorted(counts):
        total_m = sums[src] / 1e6
        print(f"  {src:<40}  {counts[src]:>4} awards  €{total_m:,.1f}M")
    no_amt = sum(1 for r in rows if not r["grant_amount_eur"])
    print(f"  (events with NULL grant_amount: {no_amt})")

    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
        w.writeheader()
        w.writerows(rows)
    print(f"CSV → {CSV_PATH}")

    if not load_db:
        print("(CSV only — pass --load-db to match and load into db.sqlite)")
        return

    if not rows:
        print("Nothing to load.")
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
        print(f"  {m:<20}  {n:>4}")

    inserted = load_events(enriched, conn)
    flagged = backfill_ipcei_linked(conn=conn, source_prefixes=("cdti_",))
    print(f"Inserted {inserted} events; flagged {flagged} as ipcei_linked")
    conn.close()
    print("next: run python3 classify.py")


if __name__ == "__main__":
    main()
