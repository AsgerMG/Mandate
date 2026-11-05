"""Extract Spain BDNS state-aid register (ayudasestado) — Sprint 17.

BREAKTHROUGH (2026-06-01): the legacy pap.hacienda.gob.es API is IP-WAF-blocked
from cloud/datacenter networks. Spain's state aid register is MIRRORED at
`www.infosubvenciones.es/bdnstrans/api` (same SNPSAP backend, no WAF). Discovered
via the data.europa.eu catalogue entry for the BDNS dataset.

This is Spain's equivalent of the EU SATR register — Spain opted out of the
central EC Transparency Award Module (TAM), so its company-level state aid is
ONLY here. The `ayudasestado` endpoint = notified + GBER block-exemption aid
(the direct analogue of our SATR corpus); `minimis` = de minimis (excluded per
methodology, will come via eAid 2027); `concesiones` = ALL grants incl. tiny
municipal subsidies (25M rows, out of scope).

Working endpoint (no portal/lang segments in the API path):
    GET {BASE}/ayudasestado/busqueda
        ?objetivos=<gber_objective_id>          (repeatable; ≤20 per query)
        &fechaDesde=dd/mm/yyyy&fechaHasta=dd/mm/yyyy   (NOTE: dd/mm/yyyy, not ISO)
        &page=N&pageSize=5000

Record shape (per concession):
    beneficiario      "B71408660 - VISCOFAN ESPAÑA SL"  (CIF/NIF - name)
    importe           nominal amount (grant face value / loan principal)
    ayudaEquivalente  aid-equivalent (subsidy element — used for loans/guarantees)
    instrumento       SUBVENCIÓN | PRÉSTAMO | (equity: PARTICIPACIÓN/CAPITAL)
    tipoBeneficiario  GRAN EMPRESA | PYME | PERSONA FÍSICA (filter out individuals)
    objetivo          "ART. 25 AYUDAS A PROYECTOS DE I+D"  (GBER article)
    reglamento        "REG (UE) 651/2014 ..."
    convocante        granting authority (long form, region + agency)
    region            "ES220 - Navarra"  (NUTS)
    ayudaEstado       "SA.113403"  (EU state-aid case number)

Scope mirrors SATR methodology: GBER Art. 21-30 (R&D&I) + 36-49 (environmental/
energy, non-agri variants only). De minimis and COVID/TCTF excluded.

Instrument → amount column:
    SUBVENCIÓN / ENTREGA DINERARIA   → grant_amount_eur
    PRÉSTAMO / ANTICIPO REEMBOLSABLE → debt_amount_eur (aid-equivalent → grant_amount_eur)
    PARTICIPACIÓN / CAPITAL / TOMA    → equity_amount_eur

CDTI dedup: CDTI grants are already loaded via extract_cdti.py (1,880 events).
BDNS rows whose convocante contains the CDTI marker are SKIPPED here.

Run modes:
    python extract_bdns.py --probe                 → connectivity test
    python extract_bdns.py --load-db               → full fetch + dedup + load
    python extract_bdns.py --objetivo 167          → single GBER objective (test)
    python extract_bdns.py --local <jsonl>         → load pre-downloaded rows
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
from store import columns, connect  # noqa: E402
# --- end ETL path bootstrap ---

import argparse
import json
import re
import sys
import time
from pathlib import Path

pass  # sys.path handled by etl_env bootstrap
from ndb_ssl import fetch_json  # noqa: E402

BASE_DIR = _ETL_ROOT
RAW_DIR = BASE_DIR / "data" / "raw" / "bdns"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)
CSV_PATH = OUT_DIR / "bdns_ayudas.csv"
DB_PATH = _ETL_DB

API_BASE = "https://www.infosubvenciones.es/bdnstrans/api"
DEPLOYMENT_COUNTRY = "ES"
MIN_YEAR = 2021
PAGE_SIZE = 5000
# SATR publishes only aid >= EUR100k for the other 24 countries. BDNS publishes
# everything down to ~EUR1k (rooftop-solar/EV deployment subsidies). To keep Spain
# CONSISTENT with the rest of the SATR corpus — and exclude deployment noise — we
# apply the same EUR100k floor. Sub-threshold Spanish innovation aid is captured
# separately via the CDTI direct scraper (the Spanish analogue of HTGF for DE).
MIN_AMOUNT_EUR = 100_000
DATE_FROM = "01/01/2021"
DATE_TO = "31/12/2026"

# GBER objective id → (article label, sector hint). Mirrors SATR scope:
# R&D&I block (Art. 21-30) + environmental/energy (Art. 36-49, non-agri variants).
# objetivo ids resolved from {BASE}/objetivos (2026-06-01).
OBJECTIVES: dict[int, tuple[str, str]] = {
    # ── R&D & Innovation (Art. 21-30) ────────────────────────────────────────
    167: ("Art.25 R&D projects", "unclassified"),
    168: ("Art.25bis seal of excellence", "unclassified"),
    170: ("Art.25quater cofunded R&D", "unclassified"),
    171: ("Art.25quinquies teaming", "unclassified"),
    50:  ("Art.26 research infrastructure", "unclassified"),
    313: ("Art.26bis test & experimentation infra", "deeptech_hardware"),
    51:  ("Art.27 innovation clusters", "unclassified"),
    52:  ("Art.28 innovation aid for SMEs", "unclassified"),
    53:  ("Art.29 process & organisational innovation", "unclassified"),
    43:  ("Art.22 start-up aid", "unclassified"),
    42:  ("Art.21 risk finance", "unclassified"),
    # ── Environmental / Energy (Art. 36-49, non-agri) ────────────────────────
    60:  ("Art.36 environmental investment", "cleantech"),
    172: ("Art.36bis recharging/refuelling infra", "cleantech"),
    314: ("Art.36ter clean vehicles", "cleantech"),
    62:  ("Art.38 energy efficiency", "cleantech"),
    315: ("Art.38bis energy efficiency", "cleantech"),
    316: ("Art.38ter energy performance contracts", "cleantech"),
    63:  ("Art.39 energy-efficient buildings", "cleantech"),
    65:  ("Art.41 renewable energy investment", "cleantech"),
    66:  ("Art.42 renewable operating aid", "cleantech"),
    70:  ("Art.46 district heating/cooling", "cleantech"),
    71:  ("Art.47 resource efficiency / circular", "cleantech"),
    72:  ("Art.48 energy infrastructure", "cleantech"),
}

# bdns source slugs that are intrinsically cleantech (for classify.py fallback)
BDNS_SOURCE_SECTOR: dict[str, str] = {}  # populated at import (per-year sources)

# convocante substring → canonical NDB id (genuine agencies only, per
# "only tag if sure" rule — generic ministries are NOT tagged).
NDB_MARKERS: list[tuple[str, str]] = [
    ("CENTRO PARA EL DESARROLLO TECNOLÓGICO", "cdti"),  # used only for dedup-skip
    ("ENISA", "enisa"),
    ("EMPRESA NACIONAL DE INNOVACI", "enisa"),
    ("INSTITUTO DE CRÉDITO OFICIAL", "ico"),
    ("INSTITUTO PARA LA DIVERSIFICACIÓN Y AHORRO", "idae"),
    ("IDAE", "idae"),
    ("INSTITUT CATALÀ D'ENERGIA", "icaen"),
    ("ICAEN", "icaen"),
    ("INSTITUTO VALENCIANO DE COMPETITIVIDAD EMPRESARIAL", "ivace"),
    ("IVACE", "ivace"),
    ("AGENCIA GALLEGA DE INNOVACIÓN", "gain"),
    ("INSTITUTO GALLEGO DE PROMOCIÓN ECONÓMICA", "igape"),
    ("IGAPE", "igape"),
    ("AGÈNCIA PER A LA COMPETITIVITAT DE L'EMPRESA", "accio"),
    ("ACCIÓ", "accio"),
    ("AGENCIA DE DESARROLLO ECONÓMICO DE LA RIOJA", "ader"),
    ("SOCIEDAD PARA EL DESARROLLO REGIONAL DE CANTABRIA", "sodercan"),
    ("AGENCIA ANDALUZA DE LA ENERGÍA", "agencia_andaluza_energia"),
    ("AGENCIA DE CIENCIA, COMPETITIVIDAD EMPRESARIAL E INNOVACI", "sekuens"),
    ("INSTITUTO PARA LA COMPETITIVIDAD EMPRESARIAL DE CASTILLA Y LE", "icecyl"),
    ("FUNDACIÓN EOI", "eoi"),
]

CDTI_MARKER = "CENTRO PARA EL DESARROLLO TECNOLÓGICO"

# Instrument classification
_GRANT_RE = re.compile(r"SUBVENCI|ENTREGA DINERARIA|SUBSIDIO", re.I)
_DEBT_RE = re.compile(r"PR[EÉ]STAMO|ANTICIPO|CR[EÉ]DITO|REEMBOLSABLE", re.I)
_EQUITY_RE = re.compile(r"PARTICIPACI|CAPITAL|TOMA DE PARTICIP|APORTACI[OÓ]N PATRIM|ACCIONES", re.I)

# COVID/TCTF exclusion (mirror SATR staging filter)
_COVID_RE = re.compile(r"COVID|CORONAVIRUS|TCTF|TEMPORARY CRISIS|MARCO TEMPORAL|PANDEMIA", re.I)

# Company beneficiary types (exclude natural persons)
_COMPANY_TIPOS = {
    "GRAN EMPRESA", "PYME", "MEDIANA EMPRESA", "PEQUEÑA EMPRESA",
    "MICROEMPRESA", "MEDIANA EMPRESA, PEQUEÑA EMPRESA Y MICROEMPRESA",
}

# Spanish company CIF prefixes (legal entities). Natural-person NIFs are masked
# as ***####** so they're filtered anyway, but this is a second guard.
_CIF_RE = re.compile(r"^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$")


def _ndb_from_convocante(convocante: str) -> str | None:
    up = (convocante or "").upper()
    for marker, ndb in NDB_MARKERS:
        if marker.upper() in up:
            return ndb
    return None


def _instrument_amounts(instrumento: str, importe: float, ayuda_eq: float
                        ) -> tuple[float | None, float | None, float | None, str]:
    """Return (grant_eur, debt_eur, equity_eur, basis) for the instrument."""
    instr = instrumento or ""
    if _EQUITY_RE.search(instr):
        return None, None, (importe or ayuda_eq or None), "bdns_equity"
    if _DEBT_RE.search(instr):
        # Loan: principal in debt, subsidy element in grant
        return (ayuda_eq or None), (importe or None), None, "bdns_loan_aid_element"
    if _GRANT_RE.search(instr):
        return (importe or ayuda_eq or None), None, None, "bdns_grant"
    # Unknown instrument → treat face value as grant, flag in basis
    return (importe or ayuda_eq or None), None, None, "bdns_other"


def _parse_record(rec: dict, article: str, sector: str) -> dict | None:
    tipo = (rec.get("tipoBeneficiario") or "").strip().upper()
    if "PERSONA F" in tipo:  # PERSONA FÍSICA — natural person
        return None

    benef = (rec.get("beneficiario") or "").strip()
    if not benef or benef.startswith("***"):  # masked natural person
        return None
    # Split "CIF - NAME"
    if " - " in benef:
        nif, name = benef.split(" - ", 1)
        nif = nif.strip()
        name = name.strip()
    else:
        nif, name = "", benef
    if not name:
        return None
    # If we have a tipo that's a company OR the nif looks like a CIF, keep it.
    if tipo not in _COMPANY_TIPOS and not _CIF_RE.match(nif.upper()):
        # No company signal — skip to stay disciplined (avoid natural persons)
        return None

    fecha = (rec.get("fechaConcesion") or "").strip()
    ym = re.match(r"(\d{4})", fecha)
    if not ym:
        return None
    year = int(ym.group(1))
    if year < MIN_YEAR:
        return None

    convocatoria = (rec.get("convocatoria") or "")
    objetivo = (rec.get("objetivo") or "")
    if _COVID_RE.search(convocatoria) or _COVID_RE.search(objetivo):
        return None  # COVID/TCTF emergency aid out of scope

    convocante = (rec.get("convocante") or "").strip()
    # CDTI is loaded via extract_cdti.py — skip to avoid double-count
    if CDTI_MARKER in convocante.upper():
        return {"_skip_cdti": True}

    try:
        importe = float(rec.get("importe") or 0)
    except (ValueError, TypeError):
        importe = 0.0
    try:
        ayuda_eq = float(rec.get("ayudaEquivalente") or 0)
    except (ValueError, TypeError):
        ayuda_eq = 0.0

    instrumento = (rec.get("instrumento") or "").strip()
    grant_eur, debt_eur, equity_eur, basis = _instrument_amounts(instrumento, importe, ayuda_eq)
    # Skip zero-value rows
    if not any([grant_eur, debt_eur, equity_eur]):
        return None
    # SATR-consistency floor: keep only aid >= EUR100k (face value of any instrument).
    # Excludes the rooftop-solar / EV deployment-subsidy noise (mostly EUR1-40k).
    face_value = max(importe or 0, ayuda_eq or 0)
    if face_value < MIN_AMOUNT_EUR:
        return None

    ndb = _ndb_from_convocante(convocante)
    sa_number = (rec.get("ayudaEstado") or "").strip() or None
    region = (rec.get("region") or "").strip()
    cod = (rec.get("codConcesion") or rec.get("idConcesion") or "").strip()
    source = f"bdns_es_ayudas_{year}"

    return {
        "source": source,
        "call_id": f"{source}_{cod or (nif + name[:15])}",
        "company_name": name,
        "company_name_norm": name.upper(),
        "nif": nif.upper() if _CIF_RE.match(nif.upper()) else None,
        "country": DEPLOYMENT_COUNTRY,
        "year": year,
        "project_title": convocatoria[:240] or None,
        # The actual scheme identity, so downstream splitting can see it. Two
        # bugs used to hide this and collapsed all 23k Spanish awards into one
        # instrument, "Spain BDNS (regional agencies)":
        #
        #  1. This dict used the key "satr_sa_number", but the real column in
        #     public_funding_events is `satr_tm_id` (see below) -- the presence
        #     check silently found nothing and the SA number was dropped on
        #     every load, though it was fetched correctly from the API.
        #  2. `convocatoria` was stored only as `project_title`. The general
        #     instrument split in populate_funding_instruments.py looks for
        #     `programme_name` specifically (>=40 events/source), the same
        #     field every other register uses -- SATR gets its split from
        #     scheme_code, ADEME's 458 programmes came from this exact column.
        #     Spain's convocatoria is that same signal and was never written
        #     to the column the split logic reads.
        "programme_name": convocatoria[:240] or None,
        "sector_tags_raw": f"{objetivo}||{sector}",
        "grant_amount_eur": grant_eur,
        "debt_amount_eur": debt_eur,
        "equity_amount_eur": equity_eur,
        "grant_amount_basis": basis,
        "ndb_distributor": ndb,
        "deployment_country": DEPLOYMENT_COUNTRY,
        # Matches the real column name (see note above).
        "satr_tm_id": sa_number,
        "region": region,
        "instrumento": instrumento,
        "objetivo": objetivo,
    }


def _fetch_objective(obj_id: int) -> list[dict]:
    """Paginate ayudasestado for one GBER objective, return parsed rows."""
    article, sector = OBJECTIVES[obj_id]
    rows: list[dict] = []
    skipped_cdti = 0
    page = 0
    while True:
        url = (f"{API_BASE}/ayudasestado/busqueda"
               f"?objetivos={obj_id}"
               f"&fechaDesde={DATE_FROM}&fechaHasta={DATE_TO}"
               f"&page={page}&pageSize={PAGE_SIZE}")
        data = fetch_json(url, timeout=60)
        if not data:
            print(f"    obj {obj_id} page {page}: request failed", file=sys.stderr)
            break
        content = data.get("content") or []
        if not content:
            break
        for rec in content:
            parsed = _parse_record(rec, article, sector)
            if parsed is None:
                continue
            if parsed.get("_skip_cdti"):
                skipped_cdti += 1
                continue
            rows.append(parsed)
        total_pages = data.get("totalPages", 1)
        page += 1
        if page >= total_pages:
            break
        time.sleep(0.3)  # polite
    print(f"  obj {obj_id} [{article}]: {len(rows)} company rows "
          f"(skipped {skipped_cdti} CDTI)")
    return rows


def _load_to_db(rows: list[dict]) -> dict:
    with connect() as con:
        cur = con.cursor()
        cols = set(columns(con, "companies"))
        has_natid = "national_id" in cols
        pfe_cols = set(columns(con, "public_funding_events"))
        # The real column is `satr_tm_id` (see the note in _parse_record). This used
        # to check for a column named "satr_sa_number", which does not exist, so
        # the SA number was silently discarded on every load.
        has_sa = "satr_tm_id" in pfe_cols
        has_prog = "programme_name" in pfe_cols

        counts = {"inserted": 0, "skipped_dup": 0, "errors": 0,
                  "grant": 0, "debt": 0, "equity": 0}
        for r in rows:
            try:
              # A savepoint per row. The except below skips a bad row and goes on,
              # which SQLite allowed; in Postgres a failed statement aborts the
              # whole transaction, so without this every later row would fail too.
              with con.transaction():
                norm = r["company_name_norm"]
                cid = None
                if has_natid and r.get("nif"):
                    cur.execute("SELECT id FROM companies WHERE national_id=%s AND country='ES' ORDER BY id",
                                (r["nif"],))
                    row = cur.fetchone()
                    cid = row[0] if row else None
                if cid is None:
                    cur.execute("SELECT id FROM companies WHERE canonical_name=%s AND country='ES' ORDER BY id",
                                (norm,))
                    row = cur.fetchone()
                    cid = row[0] if row else None
                if cid is None:
                    if has_natid:
                        cur.execute(
                            """INSERT INTO companies (canonical_name, raw_name, country, national_id,
                               entity_type, match_method, match_confidence)
                               VALUES (%s, %s, 'ES', %s, 'unknown', 'bdns', 'medium') RETURNING id""",
                            (norm, r["company_name"], r.get("nif")))
                    else:
                        cur.execute(
                            """INSERT INTO companies (canonical_name, raw_name, country,
                               entity_type, match_method, match_confidence)
                               VALUES (%s, %s, 'ES', 'unknown', 'bdns', 'medium') RETURNING id""",
                            (norm, r["company_name"]))
                    cid = cur.fetchone()[0]

                cur.execute("SELECT 1 FROM public_funding_events WHERE source=%s AND call_id=%s",
                            (r["source"], r["call_id"]))
                if cur.fetchone():
                    counts["skipped_dup"] += 1
                    continue

                cols_sql = ["company_id", "source", "call_id", "role", "coordinator_only",
                            "project_title", "project_started", "grant_amount_eur",
                            "debt_amount_eur", "equity_amount_eur", "sector_tags_raw",
                            "grant_amount_basis", "deployment_country", "ndb_distributor"]
                vals = [cid, r["source"], r["call_id"], "direct", 0,
                        r.get("project_title"), f"{r['year']}-01-01",
                        r.get("grant_amount_eur"), r.get("debt_amount_eur"),
                        r.get("equity_amount_eur"), r.get("sector_tags_raw"),
                        r["grant_amount_basis"], r["deployment_country"], r.get("ndb_distributor")]
                if has_sa:
                    cols_sql.append("satr_tm_id")
                    vals.append(r.get("satr_tm_id"))
                if has_prog:
                    cols_sql.append("programme_name")
                    vals.append(r.get("programme_name"))
                placeholders = ", ".join(["%s"] * len(cols_sql))
                cur.execute(f"INSERT INTO public_funding_events ({', '.join(cols_sql)}) "
                            f"VALUES ({placeholders})", vals)
                counts["inserted"] += 1
                if r.get("equity_amount_eur"):
                    counts["equity"] += 1
                elif r.get("debt_amount_eur"):
                    counts["debt"] += 1
                else:
                    counts["grant"] += 1
            except Exception as e:
                counts["errors"] += 1
                if counts["errors"] <= 5:
                    print(f"  ERROR {r.get('company_name','?')}: {e}", file=sys.stderr)
        con.commit()
    return counts


def main() -> None:
    ap = argparse.ArgumentParser(description="Extract Spain BDNS state aid (infosubvenciones.es)")
    ap.add_argument("--load-db", action="store_true")
    ap.add_argument("--probe", action="store_true")
    ap.add_argument("--objetivo", type=int, help="single GBER objective id (test)")
    ap.add_argument("--local", metavar="PATH", help="load from local JSONL")
    args = ap.parse_args()

    if args.probe:
        d = fetch_json(f"{API_BASE}/ayudasestado/busqueda?objetivos=167"
                       f"&fechaDesde={DATE_FROM}&fechaHasta={DATE_TO}&page=0&pageSize=2",
                       timeout=20)
        if d and d.get("content"):
            print(f"✓ infosubvenciones.es API live. Art.25 R&D 2021-2026 total="
                  f"{d.get('totalElements','?'):,}")
            print(f"  Sample: {d['content'][0].get('beneficiario')}")
        else:
            print("✗ API probe failed", file=sys.stderr)
            sys.exit(1)
        return

    if args.local:
        rows = []
        with open(args.local, encoding="utf-8") as f:
            for line in f:
                rec = json.loads(line)
                # local rows are already parsed dicts — apply the EUR100k floor
                # (cache may pre-date the threshold) using the stored amounts.
                face = max(rec.get("grant_amount_eur") or 0,
                           rec.get("debt_amount_eur") or 0,
                           rec.get("equity_amount_eur") or 0)
                if face >= MIN_AMOUNT_EUR:
                    rows.append(rec)
    else:
        objectives = [args.objetivo] if args.objetivo else list(OBJECTIVES.keys())
        rows = []
        for obj_id in objectives:
            rows.extend(_fetch_objective(obj_id))

    if not rows:
        print("  No rows extracted.")
        return

    # Dedup rows within this run by call_id (same company can hit multiple objectives)
    seen = set()
    deduped = []
    for r in rows:
        if r["call_id"] in seen:
            continue
        seen.add(r["call_id"])
        deduped.append(r)
    rows = deduped

    # Save JSONL cache
    raw_path = RAW_DIR / "bdns_ayudas.jsonl"
    with raw_path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    from collections import Counter
    by_year = Counter(r["year"] for r in rows)
    print(f"\nTotal: {len(rows):,} company state-aid rows")
    for y in sorted(by_year):
        g = sum(r.get("grant_amount_eur") or 0 for r in rows if r["year"] == y)
        print(f"  {y}: {by_year[y]:>6,} rows  €{g/1e6:>8.1f}M grants")
    n_equity = sum(1 for r in rows if r.get("equity_amount_eur"))
    n_debt = sum(1 for r in rows if r.get("debt_amount_eur"))
    print(f"  Instruments: {len(rows)-n_debt-n_equity:,} grant | {n_debt:,} loan | {n_equity:,} equity")
    print(f"  CSV/JSONL → {raw_path}")

    if args.load_db:
        print("Loading into db.sqlite ...")
        counts = _load_to_db(rows)
        print(f"  Inserted {counts['inserted']:,} "
              f"(grant {counts['grant']:,} / loan {counts['debt']:,} / equity {counts['equity']:,}), "
              f"dup {counts['skipped_dup']:,}, errors {counts['errors']}")
        print("  Run python3 classify.py after loading.")


if __name__ == "__main__":
    main()
