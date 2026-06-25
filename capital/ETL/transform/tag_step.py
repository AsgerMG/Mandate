"""Sprint 8 workstream A — STEP Seal tagging.

Reads the Commission's "SEAL - data set" Excel export (companies awarded the
STEP Sovereignty Seal across HORIZON/DIGITAL/EDF/InnovFund/EU4H) and flags
matching rows in the companies table.

Two modes:
  python3 tag_step.py             -> write data/processed/step_match_summary.csv
                                      (no DB write)
  python3 tag_step.py --load-db   -> also UPDATE companies.step_flagged=1 on matches

Match strategy (single tier, deliberately strict):
  exact (normalize_name, country_iso2)
  with EL<->GR and UK<->GB country aliases

Idempotent: re-running with same input flips no rows.
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

import argparse
import csv
import re
import sqlite3
from collections import defaultdict
from pathlib import Path

import openpyxl

ROOT = _ETL_ROOT
DB = _ETL_DB
SEAL_XLSX = ROOT / "data" / "raw" / "step" / "seal_data_set.xlsx"
OUT_CSV = ROOT / "data" / "processed" / "step_match_summary.csv"

# Mirror of extract_chips_ju.normalize_name (shared canonical form).
_NORM_LEGAL_RE = re.compile(
    r"\b(?:GmbH|gGmbH|mbH|AG|KG|UG|GesmbH|"
    r"BV|NV|"
    r"SAS|SARL|SASU|SCA|"
    r"SRL|S\.r\.l\.|SpA|S\.p\.A\.|Srls|SCPA|"
    r"SRO|s\.r\.o\.|"
    r"SL|SLU|SLL|SLNE|SAU|"
    r"Ltd|Limited|PLC|LLC|LLP|Inc|Corp|"
    r"AB|ApS|AS|"
    r"Oy|Oyj|hf|ehf|"
    r"DOO|d\.o\.o\.|DD|UAB|OOO|"
    r"Lda|CRL|Scrl|"
    r"EE|IKE|"
    r"Zrt|Kft|Nyrt|"
    r"SE|SA)\b",
    re.IGNORECASE,
)
_NORM_PUNCT_RE = re.compile(r"[,.\-_/\\&]+")
_NORM_PAREN_RE = re.compile(r"\([^)]*\)")
_NORM_WS_RE = re.compile(r"\s+")


def normalize_name(s: str) -> str:
    if not s:
        return ""
    s = _NORM_PAREN_RE.sub(" ", s)
    s = _NORM_LEGAL_RE.sub("", s)
    s = _NORM_PUNCT_RE.sub(" ", s)
    return _NORM_WS_RE.sub(" ", s).strip().lower()


# Commission country full-name → ISO2 (Eurostat EL for Greece; map UK to itself
# and add GB alias at match time since the DB uses both).
COUNTRY_TO_ISO = {
    "spain": "ES", "germany": "DE", "france": "FR", "italy": "IT",
    "netherlands": "NL", "belgium": "BE", "greece": "EL", "sweden": "SE",
    "poland": "PL", "portugal": "PT", "finland": "FI",
    "norge": "NO", "norway": "NO",
    "denmark": "DK", "austria": "AT", "united kingdom": "GB",
    "ireland": "IE", "switzerland": "CH", "israel": "IL",
    "czechia": "CZ", "czech republic": "CZ", "hungary": "HU",
    "romania": "RO", "bulgaria": "BG", "slovakia": "SK", "slovenia": "SI",
    "lithuania": "LT", "latvia": "LV", "estonia": "EE", "luxembourg": "LU",
    "iceland": "IS", "cyprus": "CY", "malta": "MT", "croatia": "HR",
    "ukraine": "UA", "turkey": "TR", "türkiye": "TR", "turkiye": "TR",
    "serbia": "RS", "republic of serbia": "RS",
    "north macedonia": "MK", "macedonia": "MK",
    "albania": "AL", "bosnia and herzegovina": "BA",
    "montenegro": "ME", "republic of montenegro": "ME",
    "moldova": "MD", "georgia": "GE", "armenia": "AM",
    "canada": "CA", "united states": "US", "usa": "US",
    "tunisia": "TN", "morocco": "MA", "kosovo": "XK", "faroe islands": "FO",
    # Non-mappable multi-country consortia entries return None below
}

# Country-equivalence sets — DB has both members of each set in use.
COUNTRY_ALIASES = [{"EL", "GR"}, {"UK", "GB"}]


def parse_country(field: str) -> str | None:
    if not field:
        return None
    name = re.match(r"^([^(]+)", field)
    if not name:
        return None
    key = name.group(1).strip().lower()
    # Skip multi-country consortium entries like "Denmark,France,Germany"
    if "," in key:
        return None
    return COUNTRY_TO_ISO.get(key)


def aliases_for(country: str | None) -> list[str | None]:
    if country is None:
        return [None]
    for s in COUNTRY_ALIASES:
        if country in s:
            return list(s)
    return [country]


def load_seal(path: Path) -> list[dict]:
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb["Data"]
    rows = list(ws.iter_rows(values_only=True))
    header = rows[0]
    idx = {h: i for i, h in enumerate(header)}
    out = []
    for r in rows[1:]:
        name = r[idx["Applicant Legal Name"]]
        if not name:
            continue
        out.append({
            "norm_name": normalize_name(name),
            "country": parse_country(r[idx["Project Country (Region)"]]),
            "raw_name": name,
            "programme": r[idx["Programme"]],
            "sector": r[idx["Sector"]],
            "proposal_title": r[idx["Proposal title"]],
            "participant_type": r[idx["Participant Type"]],
            "awarded": r[idx["Awarded EU funding"]],
        })
    return out


def match(con: sqlite3.Connection, seal: list[dict]):
    db_rows = con.execute(
        "SELECT id, canonical_name, country FROM companies"
    ).fetchall()
    db_idx: dict[tuple[str, str | None], int] = {}
    for cid, name, country in db_rows:
        n = normalize_name(name)
        if not n:
            continue
        db_idx[(n, country)] = cid

    matches: dict[int, list[dict]] = defaultdict(list)
    unmatched: list[dict] = []
    for entry in seal:
        n = entry["norm_name"]
        if not n:
            unmatched.append(entry)
            continue
        hit = None
        for c in aliases_for(entry["country"]):
            cid = db_idx.get((n, c))
            if cid:
                hit = cid
                break
        if hit:
            matches[hit].append(entry)
        else:
            unmatched.append(entry)
    return matches, unmatched


def write_csv(matches: dict[int, list[dict]], con: sqlite3.Connection) -> None:
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "company_id", "canonical_name", "country", "n_seal_entries",
        "programmes", "sectors", "any_funded",
    ]
    with OUT_CSV.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for cid in sorted(matches):
            entries = matches[cid]
            row = con.execute(
                "SELECT canonical_name, country FROM companies WHERE id=?", (cid,)
            ).fetchone()
            w.writerow({
                "company_id": cid,
                "canonical_name": row[0],
                "country": row[1],
                "n_seal_entries": len(entries),
                "programmes": ",".join(sorted({str(e["programme"]) for e in entries if e["programme"]})),
                "sectors": ",".join(sorted({str(e["sector"]) for e in entries if e["sector"]})),
                "any_funded": "Yes" if any(e["awarded"] == "Yes" for e in entries) else "No",
            })


def apply(con: sqlite3.Connection, matched_ids: set[int]) -> tuple[int, int]:
    cur = con.cursor()
    # Determine actual flip count (idempotence)
    placeholders = ",".join("?" * len(matched_ids))
    if not matched_ids:
        return 0, 0
    cur.execute(
        f"SELECT COUNT(*) FROM companies WHERE id IN ({placeholders}) AND COALESCE(step_flagged,0) = 0",
        list(matched_ids),
    )
    flips = cur.fetchone()[0]
    cur.execute(
        f"UPDATE companies SET step_flagged = 1 WHERE id IN ({placeholders}) AND COALESCE(step_flagged,0) = 0",
        list(matched_ids),
    )
    # Also re-zero anything that fell off (no longer in match set) — keeps the column reproducible
    cur.execute(
        f"SELECT COUNT(*) FROM companies WHERE step_flagged = 1 AND id NOT IN ({placeholders})",
        list(matched_ids),
    )
    revoked = cur.fetchone()[0]
    cur.execute(
        f"UPDATE companies SET step_flagged = 0 WHERE step_flagged = 1 AND id NOT IN ({placeholders})",
        list(matched_ids),
    )
    con.commit()
    return flips, revoked


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--load-db", action="store_true", help="apply step_flagged on matched companies")
    args = ap.parse_args()

    con = sqlite3.connect(DB)
    try:
        seal = load_seal(SEAL_XLSX)
        print(f"SEAL rows:                 {len(seal)}")
        print(f"SEAL unique applicants:    {len({(s['norm_name'], s['country']) for s in seal})}")

        matches, unmatched = match(con, seal)
        write_csv(matches, con)
        print(f"Matched DB companies:      {len(matches)}")
        print(f"Unmatched SEAL rows:       {len(unmatched)}")
        print(f"csv: {OUT_CSV}")

        if args.load_db:
            flips, revoked = apply(con, set(matches))
            print(f"step_flagged set:          {flips}")
            print(f"step_flagged revoked:      {revoked} (idempotency cleanup)")
            total = con.execute(
                "SELECT COUNT(*) FROM companies WHERE step_flagged = 1"
            ).fetchone()[0]
            print(f"step_flagged=1 total:      {total}")
    finally:
        con.close()


if __name__ == "__main__":
    main()
