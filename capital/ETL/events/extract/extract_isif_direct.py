"""Sprint 19 — ISIF Indigenous (Direct) commitments -> public_equity_stakes.

Source: NTMA Annual Report "Portfolio of Investments - ISIF" appendix
(data/raw/isif/), "Irish Portfolio - Schedule of Original Commitments",
Indigenous (Direct) pages only. The ONLY European institution found so far
that publishes per-company euro amounts -> disclosure_level='amount'.

Semantics (be precise, this is a register of COMMITMENTS, not holdings):
  - amounts are ORIGINAL commitments, "subsequent amendments ... not
    reflected"; positions may be written down or exited -> exited=0 is an
    assumption; ticket_eur = original commitment EUR m.
  - first_seen = first commitment year (vintages 2015-2023; pre-2021 rows
    are historical exposure — window on first_seen for corpus-aligned
    analysis); as_of = report balance date.
  - one row per (company, vintage year); follow-ons appear as separate
    rows with distinct as_of via first_seen-suffixed source? No: the
    UNIQUE key is (company, holder, source, as_of) and as_of is the report
    date, so follow-ons to the same company collapse — we SUM commitments
    per company instead and keep the earliest vintage.

Exclusions: lending facilities by name (the schedule mixes a Finance
Ireland loan/treasury line into the equity rows). Domicile: Inc/LLC -> ''
(US holdcos: Stripe, Xant, Vectra, GASL, Passiflora, Emerald), S.C.A. ->
LU, else IE.

Run: python3 scripts/extract_isif_direct.py data/raw/isif/isif_poi_fy2023.pdf 2023-12-31
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
from collections import defaultdict
from pathlib import Path

import pdfplumber

pass  # sys.path handled by etl_env bootstrap
from matching import CompanyMatcher, normalize_name

BASE = _ETL_ROOT
DB_PATH = _ETL_DB
URL = ("https://www.ntma.ie/annualreport2024/documents/"
       "Portfolio-of-Investments-ISIF.pdf")
EXCLUDE_RE = re.compile(r"(?i)loan and treasury|lending|corporate credit")


def parse_direct_pages(pdf_path: Path) -> list[dict]:
    pdf = pdfplumber.open(pdf_path)
    pages = [i for i, p in enumerate(pdf.pages)
             if "suonegidnI" in (p.extract_text() or "")
             and ")tceriD(" in (p.extract_text() or "")]
    entries, cur = [], None
    for pi in pages:
        lines = defaultdict(list)
        for w in pdf.pages[pi].extract_words():
            lines[round(w["top"])].append(w)
        for top in sorted(lines):
            if top < 95:
                continue
            ws = sorted(lines[top], key=lambda w: w["x0"])
            yearw = [w["text"] for w in ws
                     if w["x0"] < 125 and re.match(r"^[\d/]+$", w["text"])]
            namew = [w["text"] for w in ws if 125 <= w["x0"] < 270]
            amtw = [w["text"] for w in ws
                    if 270 <= w["x0"] < 330 and re.match(r"^[\d,]+$", w["text"])]
            if yearw and amtw:
                if cur:
                    entries.append(cur)
                cur = {"years": " ".join(yearw), "name": " ".join(namew),
                       "amount_m": float(amtw[0].replace(",", ""))}
            elif cur and namew and not yearw and not amtw:
                cur["name"] += " " + " ".join(namew)
            elif yearw and cur and not amtw:
                cur["years"] += " " + " ".join(yearw)
                if namew:
                    cur["name"] += " " + " ".join(namew)
        if cur:
            entries.append(cur)
            cur = None
    for e in entries:
        ys = re.findall(r"20\d\d", e["years"])
        e["first_year"] = min(ys) if ys else None
        e["name"] = re.sub(r"\s*(ISIF|REPORT|ANNUAL).*$", "", e["name"]).strip()
    return entries


def domicile(name: str) -> str:
    if re.search(r"(?i)\b(inc\.?|llc)\b", name):
        return ""
    if "S.C.A." in name or "Luxembourg" in name:
        return "LU"
    return "IE"


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit("Usage: extract_isif_direct.py <pdf> <as-of YYYY-MM-DD>")
    entries = parse_direct_pages(Path(sys.argv[1]))
    as_of = sys.argv[2]
    entries = [e for e in entries if not EXCLUDE_RE.search(e["name"])]

    # collapse follow-ons: sum commitments per company, keep earliest vintage
    by_co: dict[str, dict] = {}
    for e in entries:
        key = normalize_name(e["name"])
        if key in by_co:
            by_co[key]["amount_m"] += e["amount_m"]
            by_co[key]["first_year"] = min(by_co[key]["first_year"],
                                           e["first_year"])
        else:
            by_co[key] = e
    print(f"parsed {len(entries)} commitment rows -> {len(by_co)} companies")

    con = sqlite3.connect(DB_PATH)
    try:
        ie = CompanyMatcher(con, country="IE")
        full = CompanyMatcher(con, country=None)
        inserted = 0
        for e in by_co.values():
            cid, method = full.match(e["name"])
            if method != "exact":
                cid, method = ie.match(e["name"])
            if cid is None:
                cid = con.execute(
                    """INSERT INTO companies (canonical_name, raw_name, country,
                       entity_type, match_method, match_confidence)
                       VALUES (?, ?, ?, 'company', 'isif', 'medium')""",
                    (normalize_name(e["name"]), e["name"], domicile(e["name"])),
                ).lastrowid
                ie.register(cid, e["name"])
                full.register(cid, e["name"])
                method = "new"
            cur = con.execute(
                """INSERT OR IGNORE INTO public_equity_stakes
                   (company_id, holder, holder_type, ticket_eur, as_of,
                    first_seen, exited, source, raw_source_url,
                    disclosure_level)
                   VALUES (?, 'isif', 'sovereign_fund', ?, ?, ?, 0,
                           'isif_commitments_schedule', ?, 'amount')""",
                (cid, e["amount_m"] * 1e6, as_of,
                 f"{e['first_year']}-01-01", URL),
            )
            inserted += cur.rowcount
            print(f"  {method:14s} {e['first_year']}  "
                  f"€{e['amount_m']:6.0f}M  {e['name']}")
        con.commit()
        print(f"stakes inserted: {inserted}")
    finally:
        con.close()


if __name__ == "__main__":
    main()
