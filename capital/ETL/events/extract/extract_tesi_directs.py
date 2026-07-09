"""Sprint 19 — Tesi Financial Review note 4.2 -> pct_exact direct stakes (FI).

Route A: Tesi's Financial Review (note 4.2 "Direct VC & PE investments")
publishes the ENTIRE direct portfolio with exact ownership percentages —
the only institution found so far that does this voluntarily for every
position (ICEYE 6.7%, IQM 6.6%, Oura 3.4%, Valmet Automotive 45.0%...).
Upgrades FI from name_only (Sprint 13 portfolio listing) to pct_exact
across the board.

Footnotes: '*' = held via Tesi Industrial Management Oy (state, still
Tesi); '**' = held via EAKR-Aloitusrahasto Oy (Tesi-managed ERDF seed
fund; recorded in via_fund); '***' = debt instrument, no ownership ->
skipped. as_of = FY balance date.

NOTE on current-view queries: Sprint 13 tesi_portfolio rows carry a LATER
as_of (scrape date) than this FY2024 note; MAX(as_of) picks the name_only
row. Disclosure aggregation uses best-level-across-rows so the pct_exact
still grades FI correctly.

Run: python3 scripts/extract_tesi_directs.py data/raw/tesi/financial_review_2024.pdf 2024-12-31
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

import re
import sqlite3
import sys
from pathlib import Path

import pdfplumber

pass  # sys.path handled by etl_env bootstrap
from matching import CompanyMatcher, normalize_name

DB_PATH = _ETL_DB
URL = "https://tesi.fi/wp-content/uploads/2025/03/Financial-Review_2024_final.pdf"
EAKR = "EAKR-Aloitusrahasto Oy"
PAIR_RE = re.compile(r"(\S(?:.*?\S)?)\s*(\*{1,3})?\s+(\d+\.\d)%")


def parse_directs(pdf_path: Path) -> list[dict]:
    pdf = pdfplumber.open(pdf_path)
    page = next(p for p in pdf.pages
                if "4.2 Direct VC & PE investments" in (p.extract_text() or ""))
    out = []
    for line in (page.extract_text() or "").splitlines():
        if "OWNERSHIP %" in line or line.startswith(("4.2", "*", "Annual Report")):
            continue
        for m in PAIR_RE.finditer(line):
            name, stars, pct = m.group(1).strip(), m.group(2) or "", m.group(3)
            name = re.sub(r"\s*\*+$", "", name).strip()
            if len(name) < 3 or name.endswith("%"):
                continue
            out.append({"name": name, "pct": float(pct),
                        "via": EAKR if stars == "**" else None})
    return out


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit("Usage: extract_tesi_directs.py <pdf> <as-of>")
    rows = parse_directs(Path(sys.argv[1]))
    as_of = sys.argv[2]
    print(f"parsed {len(rows)} direct holdings (expect ~74)")

    con = sqlite3.connect(DB_PATH)
    try:
        full = CompanyMatcher(con, country=None)
        fi = CompanyMatcher(con, country="FI")
        inserted = 0
        for r in rows:
            cid, method = full.match(r["name"])
            if method != "exact":
                cid, method = fi.match(r["name"])
            if cid is None:
                cid = con.execute(
                    """INSERT INTO companies (canonical_name, raw_name, country,
                       entity_type, match_method, match_confidence)
                       VALUES (?, ?, 'FI', 'company', 'tesi_fr2024', 'high')""",
                    (normalize_name(r["name"]), r["name"])).lastrowid
                fi.register(cid, r["name"])
                full.register(cid, r["name"])
                method = "new"
            elif method in ("prefix", "reverse_prefix", "fuzzy"):
                prev = con.execute(
                    "SELECT canonical_name, match_method FROM companies WHERE id=?",
                    (cid,)).fetchone()
                if prev[1] not in ("tesi_fr2024",):
                    print(f"  AUDIT {method}: {r['name']!r} -> {prev[0]!r}")
            cur = con.execute(
                """INSERT OR IGNORE INTO public_equity_stakes
                   (company_id, holder, holder_type, stake_pct_min,
                    stake_pct_max, as_of, exited, source, raw_source_url,
                    disclosure_level, via_fund)
                   VALUES (?, 'tesi', 'state_vc', ?, ?, ?, 0,
                           'tesi_financial_review_2024', ?, 'pct_exact', ?)""",
                (cid, r["pct"], r["pct"], as_of, URL, r["via"]),
            )
            inserted += cur.rowcount
        con.commit()
        print(f"stakes inserted: {inserted}")
    finally:
        con.close()


if __name__ == "__main__":
    main()
