"""Extract EIFO co-investment rounds (Denmark) — Sprint 16.

EIFO (Eksport- og Investeringsfonden Danmark) publishes "Venturelisten" — a
Google Sheet of all known Danish venture rounds tracked by EIFO's analysts —
linked from `eifo.dk/for-dig-som-er/fond-eller-investor/investering-i-virksomheder`.

EIFO doesn't publish its own portfolio as a structured list. The Venturelisten
sheet is the closest central source: it's EIFO's curated record of *all* Danish
VC rounds 2021-2026, including the investor syndicate per round. Rows where
"EIFO" appears in the investors-in-round field are EIFO co-investments.

We capture those ~130 rows as EIFO co-invest events. We do NOT populate
`equity_amount_eur` (EIFO's ticket within the round is undisclosed); we
populate `total_project_cost_eur` with the headline round amount and leave
`grant_amount_eur` NULL — the row marks EIFO participation, not the EIFO
ticket size.

Source sheet URL:
  https://docs.google.com/spreadsheets/d/1Kjap3jD1JVOkf8kpvl9UX4kEXWshnmk_bJGnZcJ3rT0
Export CSV:
  /export?format=csv&gid=1799406216

Schema mapping (per row):
  source             = 'eifo_coinvest'
  role               = 'co_invest'
  grant_amount_eur   = NULL
  equity_amount_eur  = NULL  (EIFO ticket not disclosed in sheet)
  total_project_cost_eur = round total DKK → EUR
  grant_amount_basis = 'eifo_round_marker'
  deployment_country = 'DK'
  ndb_distributor    = 'eifo'
  eif_lp_backed      = 0
  coordinator_only   = 0

Note: this is not exhaustive EIFO portfolio coverage (EIFO does not publish a
proper portfolio list). It captures NEW Danish VC rounds 2021-2026 in which
EIFO participated as named co-investor. For a full EIFO portfolio sweep, the
ICIJ / OffshoreLeaks-style approach via Danish CVR registry would be needed.
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

from ndb_helpers import backfill_ipcei_linked, normalise_ticket

BASE_DIR = Path(__file__).parent.parent
RAW_DIR = BASE_DIR / "data" / "raw" / "eifo"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

SHEET_URL = ("https://docs.google.com/spreadsheets/d/"
             "1Kjap3jD1JVOkf8kpvl9UX4kEXWshnmk_bJGnZcJ3rT0/"
             "export?format=csv&gid=1799406216")
RAW_CSV = RAW_DIR / "venturelisten.csv"
OUT_CSV = OUT_DIR / "eifo_coinvest.csv"
MATCH_CSV_PATH = OUT_DIR / "eifo_coinvest_match_summary.csv"
DB_PATH = BASE_DIR / "db.sqlite"
DEPLOYMENT_COUNTRY = "DK"


EIFO_INDUSTRY_SECTOR: dict[str, str] = {
    "Software": "digital",
    "Life Science": "life_sciences",
    "Hardware": "deeptech_hardware",
    "Cleantech": "cleantech",
    "Climate": "cleantech",
    "Health": "life_sciences",
    "MedTech": "life_sciences",
    "BioTech": "life_sciences",
    "Industrial": "deeptech_hardware",
    "Fintech": "digital",
    "Robotics": "deeptech_hardware",
    "Space": "space",
    "Defense": "defense",
    "Defence": "defense",
}

EIFO_SOURCE_SECTOR: dict[str, str] = {"eifo_coinvest": "deeptech_hardware"}


_NORM_LEGAL_RE = re.compile(
    r"\b(A/S|ApS|I/S|K/S|P/S|IVS|SMBA|FMBA|AMBA|"
    r"GmbH|AG|BV|NV|Ltd|Limited|Inc|Corp|SAS|SARL|SpA|Srl|SE)\.?",
    re.IGNORECASE,
)
_NORM_PUNCT_RE = re.compile(r"[,.\-_/\\&]+")
_NORM_WS_RE = re.compile(r"\s+")


def normalize_name(s: str) -> str:
    s = _NORM_LEGAL_RE.sub("", s or "")
    s = _NORM_PUNCT_RE.sub(" ", s)
    return _NORM_WS_RE.sub(" ", s).strip().lower()


def _parse_dkk(s: str) -> float | None:
    """Parse '5.138.000,00 kr.' / '89.930.000,00 kr.' / '-'."""
    if not s or s.strip() == "-":
        return None
    s = s.replace("kr.", "").replace("kr", "").strip()
    # Danish: . = thousands separator, , = decimal
    s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def fetch(force: bool) -> None:
    if RAW_CSV.exists() and not force and RAW_CSV.stat().st_size > 5000:
        return
    subprocess.run(
        ["/usr/bin/curl", "-sL", "-A", "Mozilla/5.0", "--max-time", "60",
         "-o", str(RAW_CSV), SHEET_URL],
        check=False,
    )
    if not RAW_CSV.exists() or RAW_CSV.stat().st_size < 5000:
        raise RuntimeError(f"download failed → {RAW_CSV}")


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60]


def parse_csv() -> list[dict]:
    rows: list[dict] = []
    with RAW_CSV.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            investors = (r.get("Investors in round") or "")
            # Only keep rows where EIFO is explicitly in the investor list
            if "EIFO" not in investors:
                continue

            name = (r.get("Name of company") or "").strip()
            cvr = (r.get("CVR number") or "").strip() or None
            time_inv = (r.get("Time of investment") or "").strip()
            industry = (r.get("Industry") or "").strip()
            vertical = (r.get("Vertical") or "").strip()
            postal = (r.get("Postal code") or "").strip()
            region = (r.get("Region") or "").strip()
            amount_dkk = _parse_dkk(r.get("Invested amount (DKK)", ""))
            series = (r.get("Series") or "").strip()

            # Year derive: "2026-apr." → 2026
            ym = re.match(r"(\d{4})", time_inv)
            year = int(ym.group(1)) if ym else None
            if year is None or year < 2021:
                continue

            try:
                amount_eur = normalise_ticket(amount_dkk, "DKK", year)
            except KeyError:
                amount_eur = None

            sector_v1 = EIFO_INDUSTRY_SECTOR.get(industry, "deeptech_hardware")

            call_id = f"eifo_coinvest_{cvr or _slug(name)}_{year}_{_slug(series)[:20]}"
            rows.append({
                "source": "eifo_coinvest",
                "call_id": call_id,
                "raw_name": name,
                "cvr": cvr,
                "project_title": f"{series}".strip() or "EIFO co-investment",
                "project_summary": (
                    f"Co-investors: {investors[:600]}"
                    + (f" | Vertical: {vertical}" if vertical else "")
                ),
                "sector_tags_raw": f"{industry} | {vertical}",
                "sector_v1": sector_v1,
                "round_total_eur": amount_eur,
                "year": year,
                "doc_url": "https://eifo.dk/for-dig-som-er/fond-eller-investor/investering-i-virksomheder",
                "country": "DK",
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
    cur.execute("SELECT id, canonical_name, country FROM companies WHERE country='DK' OR country IS NULL")
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
                total_project_cost_eur, sector_tags_raw,
                raw_source_url, coordinator_only, grant_amount_basis,
                deployment_country, eif_lp_backed, ndb_distributor)
               VALUES (?, ?, 'co_invest', ?, ?, ?, ?, ?, ?, 0, 'eifo_round_marker',
                       ?, 0, 'eifo')""",
            (r["company_id"], r["source"], r["call_id"],
             r["project_title"], r["project_summary"],
             r["round_total_eur"],
             r["sector_tags_raw"], r["doc_url"], DEPLOYMENT_COUNTRY),
        )
        inserted += 1
    conn.commit()
    if skipped:
        print(f"  Skipped {skipped} duplicate (source, call_id) pairs")
    return inserted


CSV_FIELDNAMES = ["source", "call_id", "raw_name", "cvr", "project_title",
                  "sector_tags_raw", "sector_v1", "round_total_eur",
                  "year", "country", "doc_url"]


def main() -> None:
    args = set(sys.argv[1:])
    load_db = "--load-db" in args
    refresh = "--refresh" in args

    print("Fetching EIFO Venturelisten Google Sheet …")
    fetch(refresh)
    rows = parse_csv()
    print(f"Parsed {len(rows)} EIFO co-invest rounds (2021+)")

    total_round = sum((r["round_total_eur"] or 0) for r in rows)
    print(f"Total round volume (round size, not EIFO ticket): €{total_round/1e6:.1f}M")

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
    flagged = backfill_ipcei_linked(conn=conn, source_prefixes=("eifo_",))
    print(f"Inserted {inserted} events; flagged {flagged} as ipcei_linked")
    conn.close()
    print("next: run python3 classify.py")


if __name__ == "__main__":
    main()
