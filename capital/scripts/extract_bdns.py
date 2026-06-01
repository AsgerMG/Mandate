"""Extract Spain BDNS (Base de Datos Nacional de Subvenciones) — Sprint 17.

Data source:
  BDNS REST API: https://pap.hacienda.gob.es/bdnstrans/GE/es/
  NOTE: The server uses IP-based WAF filtering. Run from a residential/VPN
  network, not cloud/CI. Sprint 16 hit this block; confirmed IP-restricted.

  Key endpoints:
    /concesiones.json   — company-level grant awards (beneficiario data)
    /convocatorias.json — grant calls index

  Core parameters for concesiones:
    page           = 0, 1, 2, …
    pageSize       = 200 (max)
    tipoBeneficiario = 1 (empresas / companies)
    organo         = <granting body code>
    anio           = 2021|2022|…  (year filter)
    fechaDesde, fechaHasta = date range

  Key organo codes for innovation-relevant bodies:
    EA0028053   — CDTI (Centro para el Desarrollo Tecnológico e Industrial)
    E04990001   — AEI (Agencia Estatal de Investigación)
    EA0042577   — ENISA (Empresa Nacional de Innovación)
    E04921901   — CDTI regional Cantabria
    GV01002000  — Generalitat Valencia / IVACE+i
    AV01002000  — Generalitat Catalunya / AGAUR / ACCIÓ
    EV01002000  — Gobierno Vasco / SPRI
    RA01902001  — Junta de Andalucía
    GA01002001  — Xunta de Galicia / GAIN

  CDTI dedup: extract_cdti.py already loads 1,880 CDTI grants.
  On BDNS load, skip rows where organo=EA0028053 (CDTI) to avoid duplicates.
  OR dedup by NIF + year against existing cdti_ events.

Run modes:
  python extract_bdns.py --probe                  → test connectivity
  python extract_bdns.py --load-db                → fetch all innovation organos + load
  python extract_bdns.py --organo EA0028053        → single organo (test)
  python extract_bdns.py --local <csv_path>        → load pre-downloaded file
  python extract_bdns.py --year 2024               → single year
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sqlite3
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
RAW_DIR = BASE_DIR / "data" / "raw" / "bdns"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

CSV_PATH = OUT_DIR / "bdns_grants.csv"
DB_PATH = BASE_DIR / "db.sqlite"
DEPLOYMENT_COUNTRY = "ES"
MIN_YEAR = 2021
PAGE_SIZE = 200

BDNS_BASE = "https://pap.hacienda.gob.es/bdnstrans/GE/es"

# Innovation-relevant organos to extract (code → label → source slug)
# CDTI is skipped by default (already loaded via extract_cdti.py)
INNOVATION_ORGANOS: dict[str, dict] = {
    "E04990001":  {"label": "AEI",        "slug": "aei",    "skip_cdti_dedup": False},
    "EA0042577":  {"label": "ENISA",      "slug": "enisa",  "skip_cdti_dedup": False},
    "EA0028053":  {"label": "CDTI",       "slug": "cdti",   "skip_cdti_dedup": True},   # already loaded
    # Regional agencies (top 6 by innovation volume)
    "GV01002000": {"label": "IVACE_Valencia", "slug": "ivace",  "skip_cdti_dedup": False},
    "AV01002000": {"label": "AGAUR_Catalonia", "slug": "agaur", "skip_cdti_dedup": False},
    "EV01002000": {"label": "SPRI_Basque",  "slug": "spri",   "skip_cdti_dedup": False},
    "RA01902001": {"label": "JUNTA_Andalucia", "slug": "junta_and", "skip_cdti_dedup": False},
    "GA01002001": {"label": "GAIN_Galicia", "slug": "gain",  "skip_cdti_dedup": False},
}

# Minimum grant amount to reduce noise (€ equivalent)
MIN_AMOUNT_EUR = 10_000


def _get_json(url: str, timeout: int = 30) -> dict | list | None:
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; EuroInvTracker/1.0)",
                "Accept": "application/json",
                "Referer": "https://pap.hacienda.gob.es/bdnstrans/GE/es/concesiones",
            },
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if e.code == 403:
            print(
                f"\nHTTP 403 from BDNS. WAF IP-block active.\n"
                f"Run this script from a residential or VPN network.\n"
                f"The BDNS API blocks cloud/datacenter IP ranges (Sprint 16 known issue).\n",
                file=sys.stderr)
        return None
    except Exception as e:
        print(f"  Request error: {e}", file=sys.stderr)
        return None


def _fetch_concesiones(organo: str, year: int) -> list[dict]:
    """Fetch all concesiones (company grant awards) for one organo+year."""
    records = []
    page = 0
    while True:
        url = (
            f"{BDNS_BASE}/concesiones.json"
            f"?page={page}&pageSize={PAGE_SIZE}"
            f"&tipoBeneficiario=1"          # 1 = empresas (companies)
            f"&organo={organo}"
            f"&anio={year}"
        )
        data = _get_json(url)
        if data is None:
            break
        if isinstance(data, dict):
            batch = data.get("content") or data.get("concesiones") or data.get("data") or []
            total = data.get("totalElements") or data.get("total") or 0
        elif isinstance(data, list):
            batch = data
            total = len(data)
        else:
            break
        if not batch:
            break
        records.extend(batch)
        if len(records) >= total or len(batch) < PAGE_SIZE:
            break
        page += 1
        time.sleep(0.5)  # polite rate-limit
    return records


def _parse_concesion(rec: dict, organo_cfg: dict, year: int) -> dict | None:
    def _f(*keys: str) -> str:
        for k in keys:
            v = rec.get(k)
            if v is not None:
                return str(v).strip()
        return ""

    name = _f("beneficiario", "nombreBeneficiario", "razonSocial", "name")
    if not name:
        return None

    nif = _f("nifBeneficiario", "nif", "cifBeneficiario")
    nif = re.sub(r"\s+", "", nif)

    amt_str = _f("importeConcedido", "importe", "importeTotal", "amount")
    amt_str = re.sub(r"[^\d.,]", "", amt_str).replace(",", ".").replace(" ", "")
    try:
        amount_eur = float(amt_str) if amt_str else 0.0
    except ValueError:
        amount_eur = 0.0
    if amount_eur < MIN_AMOUNT_EUR:
        return None

    convoc = _f("convocatoria", "codigoConvocatoria", "numConvocatoria")
    slug = organo_cfg["slug"]
    source = f"bdns_{slug}_{year}"
    call_id = f"{source}_{nif or name[:25]}_{convoc or ''}"

    return {
        "source": source,
        "call_id": call_id,
        "company_name": name,
        "company_name_norm": name.upper(),
        "nif": nif,
        "country": DEPLOYMENT_COUNTRY,
        "year": year,
        "organo": organo_cfg["label"],
        "convocatoria": convoc,
        "grant_amount_eur": round(amount_eur, 2),
        "ndb_distributor": organo_cfg.get("ndb_distributor", "bdns"),
        "deployment_country": DEPLOYMENT_COUNTRY,
    }


def _cdti_nifs(con: sqlite3.Connection) -> set[str]:
    """Return NIFs of companies already loaded via extract_cdti.py."""
    cur = con.cursor()
    cur.execute(
        """SELECT c.national_id FROM companies c
           JOIN public_funding_events pfe ON pfe.company_id = c.id
           WHERE pfe.source LIKE 'cdti_%' AND c.national_id IS NOT NULL""")
    return {row[0] for row in cur.fetchall() if row[0]}


def _load_to_db(rows: list[dict]) -> dict:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cdti_nifs = _cdti_nifs(con)
    print(f"  CDTI NIF dedup set: {len(cdti_nifs)} NIFs already loaded via extract_cdti.py")

    cur.execute("PRAGMA table_info(companies)")
    col_names = {r[1] for r in cur.fetchall()}
    has_national_id = "national_id" in col_names

    counts = {"inserted": 0, "cdti_deduped": 0, "skipped_dup": 0, "errors": 0}
    for r in rows:
        norm = r["company_name_norm"]
        nif = r.get("nif", "")

        # Skip CDTI organo rows — already loaded via extract_cdti.py
        if r.get("organo") == "CDTI":
            counts["cdti_deduped"] += 1
            continue
        # Also skip by NIF match if the company is already in CDTI set
        if nif and nif in cdti_nifs:
            counts["cdti_deduped"] += 1
            continue

        try:
            cid = None
            if has_national_id and nif:
                cur.execute(
                    "SELECT id FROM companies WHERE national_id=? AND country='ES'", (nif,))
                row = cur.fetchone()
                cid = row[0] if row else None
            if cid is None:
                cur.execute(
                    "SELECT id FROM companies WHERE canonical_name=? AND country='ES'", (norm,))
                row = cur.fetchone()
                cid = row[0] if row else None
            if cid is None:
                if has_national_id:
                    cur.execute(
                        """INSERT INTO companies (canonical_name, raw_name, country, national_id,
                           entity_type, match_method, match_confidence)
                           VALUES (?, ?, 'ES', ?, 'unknown', 'bdns', 'medium')""",
                        (norm, r["company_name"], nif or None))
                else:
                    cur.execute(
                        """INSERT INTO companies (canonical_name, raw_name, country,
                           entity_type, match_method, match_confidence)
                           VALUES (?, ?, 'ES', 'unknown', 'bdns', 'medium')""",
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
                    project_started, grant_amount_eur, grant_amount_basis,
                    deployment_country, ndb_distributor)
                   VALUES (?, ?, ?, 'direct', 0, ?, ?, 'ndb_grant', ?, ?)""",
                (cid, r["source"], r["call_id"], f"{r['year']}-01-01",
                 r["grant_amount_eur"], r["deployment_country"], r["ndb_distributor"]))
            counts["inserted"] += 1
        except Exception as e:
            counts["errors"] += 1
            if counts["errors"] <= 3:
                print(f"  ERROR {r.get('company_name','?')}: {e}", file=sys.stderr)
    con.commit()
    con.close()
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract Spain BDNS innovation grants")
    parser.add_argument("--load-db", action="store_true")
    parser.add_argument("--probe", action="store_true", help="Test BDNS connectivity")
    parser.add_argument("--organo", metavar="CODE", help="Single organo code to test")
    parser.add_argument("--year", type=int, help="Single year to fetch")
    parser.add_argument("--local", metavar="PATH", help="Load pre-downloaded CSV")
    args = parser.parse_args()

    if args.local:
        rows = []
        with open(args.local, encoding="utf-8", errors="replace") as f:
            for delim in (";", ",", "\t"):
                f.seek(0)
                reader = csv.DictReader(f, delimiter=delim)
                sample = next(reader, None)
                if sample and len(sample) >= 3:
                    f.seek(0)
                    for raw_row in csv.DictReader(f, delimiter=delim):
                        organo_label = raw_row.get("organo", "unknown")
                        cfg = {"label": organo_label, "slug": organo_label.lower()}
                        yr = int(raw_row.get("year", 2021))
                        r = _parse_concesion({k.strip(): v for k, v in raw_row.items()}, cfg, yr)
                        if r:
                            rows.append(r)
                    break
    elif args.probe:
        print("Testing BDNS connectivity ...")
        url = f"{BDNS_BASE}/concesiones.json?page=0&pageSize=2&tipoBeneficiario=1&organo=EA0028053&anio=2023"
        print(f"  GET {url}")
        data = _get_json(url)
        if data:
            print(f"  ✓ Connected. Response shape: {str(data)[:200]}")
        else:
            print(
                "\n  FAILED. Known WAF issue from cloud IPs.\n"
                "  Resolution: run from a home/residential/VPN network.\n"
                "  Alternative: download BDNS bulk data from:\n"
                "    https://www.pap.hacienda.gob.es/bdnstrans/GE/es/concesiones\n"
                "    (filter: Tipo=Empresa, Año=2021-2026, Órgano concedente=innovation body)\n"
                "    Export as CSV then: python extract_bdns.py --local <file.csv> --load-db\n"
            )
        return
    else:
        years = [args.year] if args.year else list(range(MIN_YEAR, 2027))
        organos = ([args.organo] if args.organo else
                   [k for k, v in INNOVATION_ORGANOS.items() if not v.get("skip_cdti_dedup")])
        rows = []
        for organo in organos:
            cfg = INNOVATION_ORGANOS.get(organo, {"label": organo, "slug": organo.lower()})
            if cfg.get("skip_cdti_dedup"):
                print(f"  Skipping {cfg['label']} (already loaded via extract_cdti.py)")
                continue
            for year in years:
                print(f"  Fetching {cfg['label']} ({organo}) {year} ...")
                records = _fetch_concesiones(organo, year)
                for rec in records:
                    r = _parse_concesion(rec, cfg, year)
                    if r:
                        rows.append(r)
                print(f"    → {len([r for r in rows if r['year'] == year])} rows so far")

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
        print(f"  Inserted: {counts['inserted']}, CDTI-deduped: {counts['cdti_deduped']}, "
              f"dup: {counts['skipped_dup']}, errors: {counts['errors']}")
        print("  Run python3 classify.py after loading.")


if __name__ == "__main__":
    main()
