"""Sprint 19 Step 6.5 — EIFO årsrapport 2025 Note 12 -> fund-layer stakes.

Route A (accounting disclosure): Danish law forces EIFO to list ALL fund
stakes with ownership >=20% at exact percentages (årsrapport 2025 p.82).
These are FUND-layER positions — EIFO's LP stakes in venture funds, not
company stakes. Stored with:
  - the fund as a companies row, entity_type='other' (never enters the
    company cohort; analyses filter entity_type='company'),
  - disclosure_level='pct_exact' — the only institution-forced exact-pct
    disclosure in the corpus so far; the Route A precedent the scorecard
    is built on,
  - domicile kept where in Europe scope (DK/LU/NL), '' for US/Cayman
    vehicles (the scope trigger guards companies.country; these are legal
    domiciles of funds held by a Danish institution).

Direct company tickets are aggregate-only in Note 13 — that asymmetry
(funds forced out by accounting law, companies not) is itself a scorecard
data point.

Run: python3 scripts/extract_eifo_note12.py
"""
from __future__ import annotations

import re
import sqlite3
import sys
from pathlib import Path

import pdfplumber

sys.path.insert(0, str(Path(__file__).parent))
from lib.matching import normalize_name

BASE = Path(__file__).parent.parent
DB_PATH = BASE / "db.sqlite"
PDF = BASE / "data/raw/eifo/eifo-aarsrapport-2025.pdf"
AS_OF = "2025-12-31"  # FY2025 balance-sheet date
SOURCE = "eifo_aarsrapport_2025_note12"
URL = "https://www.eifo.dk/media/o3wp0lqs/eifo-aarsrapport-2025.pdf"

DOMICILE = {"Denmark": "DK", "Luxembourg": "LU", "Netherlands": "NL",
            "USA": "", "Cayman": ""}
LINE_RE = re.compile(
    r"^(?P<name>.+?)\s+(?:DKK|EUR|USD)\s+.*?(?P<pct>\d+)%\s+(?P<dom>\w+)\s*$")


def parse_note12(page_text: str) -> list[tuple[str, int, str]]:
    out = []
    pending = ""  # wrapped fund-name fragment
    for line in page_text.splitlines():
        line = line.strip()
        m = LINE_RE.match(line)
        if m:
            name = (pending + " " + m.group("name")).strip()
            name = name.replace("*", "").strip()
            out.append((name, int(m.group("pct")), m.group("dom")))
            pending = ""
        elif (line and not line.startswith(("Note", "Kapitalandele", "pct.",
                                            "*Iht", "regnskabspraksis"))
              and not re.match(r"^\d+$", line)
              and "%" not in line and len(line.split()) <= 8
              and re.search(r"[A-Za-z]", line)):
            # candidate wrapped name fragment (e.g. "Rockstart Emerging ...")
            if re.search(r"(Fund|K/S|ApS|Coöperatief|L\.P\.|SICAR|Ventures|"
                         r"Capital|Invest)", line):
                pending = line
            else:
                pending = ""
    return out


def main() -> None:
    with pdfplumber.open(PDF) as pdf:
        text = pdf.pages[81].extract_text()  # page 82 (0-indexed 81)
    stakes = parse_note12(text)
    print(f"parsed {len(stakes)} fund stakes (expect 43)")
    for n, p, d in stakes:
        print(f"  {p:3d}%  {DOMICILE.get(d, d):2s}  {n}")

    con = sqlite3.connect(DB_PATH)
    try:
        inserted = 0
        for name, pct, dom in stakes:
            country = DOMICILE.get(dom, "")
            row = con.execute(
                "SELECT id FROM companies WHERE UPPER(canonical_name)=UPPER(?)",
                (name,),
            ).fetchone()
            if row:
                cid = row[0]
            else:
                cid = con.execute(
                    """INSERT INTO companies (canonical_name, raw_name, country,
                       entity_type, match_method, match_confidence)
                       VALUES (?, ?, ?, 'other', 'eifo_note12', 'high')""",
                    (name, name, country),
                ).lastrowid
            cur = con.execute(
                """INSERT OR IGNORE INTO public_equity_stakes
                   (company_id, holder, holder_type, stake_pct_min,
                    stake_pct_max, as_of, exited, source, raw_source_url,
                    disclosure_level)
                   VALUES (?, 'eifo', 'ndb', ?, ?, ?, 0, ?, ?, 'pct_exact')""",
                (cid, pct, pct, AS_OF, SOURCE, URL),
            )
            inserted += cur.rowcount
        con.commit()
        print(f"stakes inserted: {inserted}")
    finally:
        con.close()


if __name__ == "__main__":
    main()
