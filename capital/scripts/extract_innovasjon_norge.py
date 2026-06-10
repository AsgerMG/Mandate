"""Extract Innovasjon Norge grant/loan awards (Norway) — Sprint 17.

Data source:
  Innovasjon Norge publishes an open-data CSV of all financing decisions
  ("Tilsagn om finansiering") via data.norge.no. The dataset is CC0.

  Dataset page: https://data.norge.no/nb/datasets/d5f090ca-4e43-3303-a5e6-54247ea69d72
  Direct download (Azure blob, verified 2026-06-10):
    https://indatapublic.blob.core.windows.net/tildelingsrapport/Tildelinger.csv

  CSV is cp1252-encoded, semicolon-delimited, with columns:
    Fylkesnavn; Kommunenavn; Org-nr; Bedriftsnavn; Virkemiddelkategori;
    Underkategori; Innvilget beløp (NOK); Innvilget dato (DD.MM.YY);
    Beslutningsenhet; Næringshovedområde; Næring; Type finansiering

Scope decisions (Option A — direct funding to named companies):
  - 2021+ only (project scope window)
  - rows without Org-nr dropped (personal customers / "personkunder")
  - 'Landbrukstilskudd' excluded (farm subsidies, not innovation/industrial)
  - 'Ekstraordinære tiltak' excluded (COVID-era measures, consistent with the
    SATR COVID/TCTF exclusion)
  - Type finansiering: Tilskudd → grant_amount_eur;
    Lån / Garanti → debt_amount_eur (instrument-type integrity rule)

Schema mapping:
  source             = 'innovasjon_norge_<category_slug>_<year>'
  deployment_country = 'NO'
  ndb_distributor    = 'innovasjon_norge'

Run modes:
  python extract_innovasjon_norge.py             → fetch + CSV only
  python extract_innovasjon_norge.py --load-db   → fetch + match + load
  python extract_innovasjon_norge.py --probe     → test download URL only
  python extract_innovasjon_norge.py --local <path> → use local CSV file
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import re
import sqlite3
import sys
from pathlib import Path

_sys_path_dir = str(Path(__file__).parent)
if _sys_path_dir not in sys.path:
    sys.path.insert(0, _sys_path_dir)
from ndb_ssl import fetch_bytes as _ndb_fetch_bytes  # noqa: E402

BASE_DIR = Path(__file__).parent.parent
RAW_DIR = BASE_DIR / "data" / "raw" / "innovasjon_norge"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

CSV_PATH = OUT_DIR / "innovasjon_norge_grants.csv"
DB_PATH = BASE_DIR / "db.sqlite"
DEPLOYMENT_COUNTRY = "NO"
NDB_DISTRIBUTOR = "innovasjon_norge"

# ECB annual average NOK per EUR; fallback used for years not listed.
NOK_PER_EUR = {
    2021: 10.1633,
    2022: 10.1026,
    2023: 11.4248,
    2024: 11.6290,
    2025: 11.6700,
    2026: 11.6700,
}
NOK_PER_EUR_FALLBACK = 11.5

DOWNLOAD_URLS = [
    "https://indatapublic.blob.core.windows.net/tildelingsrapport/Tildelinger.csv",
    "https://data.innovasjonnorge.no/api/files?filename=Tildelinger.csv&container=innovasjonnorge&subfolder=tildelinger/csv",
]

MIN_YEAR = 2021

# Virkemiddelkategori → source slug. Categories not listed are excluded.
CATEGORY_MAP: dict[str, str] = {
    "Oppstartstilskudd": "grant_startup",
    "Innovasjonstilskudd": "grant_innovation",
    "Distriktsutviklingstilskudd": "grant_regional",
    "Distriksutviklingstilskudd": "grant_regional",  # source typo variant
    "Risikolån og garantier": "loan_risk",
    "Lavrisikolån": "loan_lowrisk",
    "Klynger og nettverk": "grant_cluster",
    "Internasjonale tilskuddsprogrammer": "grant_international",
    "Næringsspesifikke utviklingstiltak": "grant_sector",
}
EXCLUDED_CATEGORIES = {
    "Landbrukstilskudd",        # farm subsidies — out of scope
    "Ekstraordinære tiltak",    # COVID-era extraordinary measures
}


def _normalise_name(name: str) -> str:
    n = (name or "").upper()
    for suffix in [" AS", " ASA", " ANS", " DA", " SA", " BA", " A/S"]:
        if n.endswith(suffix):
            n = n[: -len(suffix)]
    n = re.sub(r"[^A-Z0-9ÆØÅÉ ]+", " ", n).strip()
    return re.sub(r"\s+", " ", n)


def _fetch_csv() -> str | None:
    for url in DOWNLOAD_URLS:
        data = _ndb_fetch_bytes(url, timeout=120)
        if data:
            return data.decode("cp1252", errors="replace")
    return None


def extract(text: str) -> list[dict]:
    """Parse Tildelinger.csv text → cleaned, in-scope rows."""
    reader = csv.DictReader(io.StringIO(text), delimiter=";")
    raw_rows = list(reader)
    if not raw_rows:
        print("  ERROR: could not parse CSV", file=sys.stderr)
        return []
    print(f"  CSV columns: {list(raw_rows[0].keys())}")

    out = []
    skipped = {"year": 0, "category": 0, "no_org": 0, "amount": 0, "unknown_cat": 0}
    for row in raw_rows:
        date_str = (row.get("Innvilget dato") or "").strip()
        m = re.match(r"(\d{2})\.(\d{2})\.(\d{2})$", date_str)
        if not m:
            continue
        year = 2000 + int(m.group(3))
        if year < MIN_YEAR:
            skipped["year"] += 1
            continue

        category = (row.get("Virkemiddelkategori") or "").strip()
        if category in EXCLUDED_CATEGORIES:
            skipped["category"] += 1
            continue
        slug = CATEGORY_MAP.get(category)
        if slug is None:
            skipped["unknown_cat"] += 1
            continue

        org_nr = re.sub(r"\D", "", row.get("Org-nr") or "")
        if not org_nr:
            skipped["no_org"] += 1
            continue

        amt_str = (row.get("Innvilget beløp") or "").replace(",", ".").strip()
        try:
            amount_nok = float(amt_str)
        except ValueError:
            amount_nok = 0.0
        if amount_nok <= 0:
            skipped["amount"] += 1
            continue
        amount_eur = amount_nok / NOK_PER_EUR.get(year, NOK_PER_EUR_FALLBACK)

        name = (row.get("Bedriftsnavn") or "").strip()
        if not name:
            continue

        fin_type = (row.get("Type finansiering") or "").strip()  # Tilskudd / Lån / Garanti
        is_debt = fin_type in ("Lån", "Garanti")

        source = f"innovasjon_norge_{slug}_{year}"
        # Stable per-row id: org + date + amount + subcategory
        sub = (row.get("Underkategori") or "").strip()
        key = f"{org_nr}|{date_str}|{amount_nok:.0f}|{sub}"
        call_id = f"in_{org_nr}_{hashlib.sha1(key.encode()).hexdigest()[:12]}"

        out.append({
            "source": source,
            "call_id": call_id,
            "company_name": name,
            "company_name_norm": _normalise_name(name),
            "org_nr": org_nr,
            "country": DEPLOYMENT_COUNTRY,
            "city": (row.get("Kommunenavn") or "").strip(),
            "year": year,
            "date": f"20{m.group(3)}-{m.group(2)}-{m.group(1)}",
            "category": category,
            "subcategory": sub,
            "fin_type": fin_type,
            "grant_amount_eur": round(amount_eur, 2) if not is_debt else None,
            "debt_amount_eur": round(amount_eur, 2) if is_debt else None,
            "amount_nok": amount_nok,
            "ndb_distributor": NDB_DISTRIBUTOR,
            "deployment_country": DEPLOYMENT_COUNTRY,
        })

    print(f"  Rows: {len(raw_rows)} total → {len(out)} kept (skipped: "
          f"{skipped['year']} pre-{MIN_YEAR}, {skipped['category']} excluded-category, "
          f"{skipped['unknown_cat']} unknown-category, {skipped['no_org']} no-org-nr, "
          f"{skipped['amount']} zero-amount)")
    return out


def _load_to_db(rows: list[dict]) -> dict:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    counts = {"inserted": 0, "skipped_dup": 0, "errors": 0, "grant": 0, "debt": 0}
    for r in rows:
        try:
            norm = r["company_name_norm"]
            cur.execute(
                "SELECT id FROM companies WHERE canonical_name=? AND country='NO'",
                (norm,))
            row = cur.fetchone()
            if row:
                cid = row[0]
            else:
                cur.execute(
                    """INSERT INTO companies (canonical_name, raw_name, country, city,
                       entity_type, match_method, match_confidence, notes)
                       VALUES (?, ?, 'NO', ?, 'unknown', 'innovasjon_norge', 'medium', ?)""",
                    (norm, r["company_name"], r["city"] or None,
                     f"org_nr:{r['org_nr']}"),
                )
                cid = cur.lastrowid

            cur.execute(
                "SELECT 1 FROM public_funding_events WHERE source=? AND call_id=?",
                (r["source"], r["call_id"]),
            )
            if cur.fetchone():
                counts["skipped_dup"] += 1
                continue

            basis = "ndb_grant" if r["grant_amount_eur"] else (
                "ndb_guarantee" if r["fin_type"] == "Garanti" else "ndb_loan_commitment")
            cur.execute(
                """INSERT INTO public_funding_events
                   (company_id, source, call_id, role, coordinator_only,
                    project_started, grant_amount_eur, debt_amount_eur,
                    grant_amount_basis, aid_instrument, deployment_country,
                    ndb_distributor)
                   VALUES (?, ?, ?, 'direct', 0, ?, ?, ?, ?, ?, ?, ?)""",
                (cid, r["source"], r["call_id"], r["date"],
                 r["grant_amount_eur"], r["debt_amount_eur"], basis,
                 r["fin_type"], r["deployment_country"], r["ndb_distributor"]),
            )
            counts["inserted"] += 1
            counts["debt" if r["debt_amount_eur"] else "grant"] += 1
        except Exception as e:
            counts["errors"] += 1
            if counts["errors"] <= 3:
                print(f"  ERROR: {r['company_name']}: {e}", file=sys.stderr)

    con.commit()
    con.close()
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract Innovasjon Norge awards")
    parser.add_argument("--load-db", action="store_true", help="Load into db.sqlite")
    parser.add_argument("--probe", action="store_true", help="Test download URL only")
    parser.add_argument("--local", metavar="PATH", help="Use local CSV file instead of downloading")
    args = parser.parse_args()

    if args.local:
        text = Path(args.local).read_bytes().decode("cp1252", errors="replace")
        print(f"  Using local file: {args.local}")
    else:
        print("Fetching Innovasjon Norge Tildelinger.csv ...")
        text = _fetch_csv()
        if not text:
            print(
                "\nERROR: Could not download the CSV. Manual steps:\n"
                "  1. Visit https://www.innovasjonnorge.no/artikkel/hvem-har-fatt-tilbud-om-finansiering-fra-oss\n"
                "  2. Download 'Last ned tildelinger i csv-format'\n"
                "  3. Re-run with: python extract_innovasjon_norge.py --local /path/to/Tildelinger.csv\n",
                file=sys.stderr,
            )
            sys.exit(1)
        if args.probe:
            print("  Probe OK — downloaded successfully")
            print("  First 200 chars:", text[:200])
            return
        raw_path = RAW_DIR / "Tildelinger.csv"
        raw_path.write_text(text, encoding="utf-8")
        print(f"  Cached to {raw_path} (re-encoded UTF-8)")

    rows = extract(text)
    if not rows:
        print("  No rows extracted.")
        return

    out_fields = ["source", "call_id", "company_name", "org_nr", "country",
                  "city", "year", "date", "category", "subcategory", "fin_type",
                  "grant_amount_eur", "debt_amount_eur", "amount_nok",
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
        g = sum(r["grant_amount_eur"] or 0 for r in rows if r["year"] == y)
        d = sum(r["debt_amount_eur"] or 0 for r in rows if r["year"] == y)
        print(f"    {y}: {n:>5} events  €{g/1e6:7.1f}M grants  €{d/1e6:7.1f}M debt")

    if args.load_db:
        print("Loading into db.sqlite ...")
        counts = _load_to_db(rows)
        print(f"  Inserted: {counts['inserted']} "
              f"(grant {counts['grant']} / debt {counts['debt']}), "
              f"skipped dup: {counts['skipped_dup']}, errors: {counts['errors']}")
        print("  Run python3 scripts/classify.py after loading.")


if __name__ == "__main__":
    main()
