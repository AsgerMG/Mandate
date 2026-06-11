"""Sprint 19 Step 6.1 — PFR Ventures look-through portfolio -> public_equity_stakes.

Source: the Airtable base embedded at pfrventures.pl/en/our-portfolio
(application appxHCgGmlAvUzDn4, share shrGZ7ojXzt25lDlc). The v0.3
application/read payload contains the full Companies table; raw JSON saved
under data/raw/pfr/.

CRITICAL SEMANTICS: PFR Ventures is a fund-of-funds manager. Every row is
LOOK-THROUGH LP exposure — the holder of record is the named private fund,
PFR's money sits inside it. Stored with holder='pfr_ventures' +
via_fund=<fund name(s)>; via_fund IS NOT NULL marks these as never
comparable with direct stakes. That PFR publishes this at all is the
scorecard finding: no other European FoF (EIF included) discloses
look-through.

Scope filter: equity-class fund types only (Venture Capital, Corporate
Venture Capital, Private Equity, Business Angel, Buyout). Private Credit /
Private Debt / Mezzanine rows are debt-shaped and skipped.

Matching: exact tier against the full corpus (cross-border companies like
1komma5deg are in the portfolio), fuzzy tiers PL-scoped only — a duplicate
company row is recoverable, a cross-country false merge is not. New inserts
get country='' (the base has no country field; EIT precedent).

Run: python3 scripts/extract_pfr_ventures.py data/raw/pfr/pfr_airtable_app_read_20260611.json 2026-06-11
"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from lib.matching import CompanyMatcher, normalize_name

BASE = Path(__file__).parent.parent
DB_PATH = BASE / "db.sqlite"
PAGE_URL = "https://pfrventures.pl/en/our-portfolio"
TABLE_ID = "tbl7wjcv6FCRPsSFG"
EQUITY_TYPES = {"Venture Capital", "Corporate Venture Capital",
                "Private Equity", "Business Angel", "Buyout"}


def load_rows(path: Path) -> list[dict]:
    data = json.loads(path.read_text())["data"]
    schema = next(t for t in data["tableSchemas"] if t["id"] == TABLE_ID)
    cols = {c["id"]: c["name"] for c in schema["columns"]}
    choices = {}
    for c in schema["columns"]:
        for cid, ch in (c.get("typeOptions") or {}).get("choices", {}).items():
            choices[cid] = ch.get("name")
    table = next(t for t in data["tableDatas"] if t["id"] == TABLE_ID)

    out = []
    for r in table["rows"]:
        cells = {cols.get(k, k): v
                 for k, v in (r.get("cellValuesByColumnId") or {}).items()}
        name = (cells.get("Company / spółka") or "").strip()
        if not name:
            continue
        types = [choices.get(s, s) for s in (cells.get("Type / Typ") or [])]
        programs = [choices.get(s, s) for s in (cells.get("Program") or [])]
        since_raw = cells.get("In portfolio since / W portfelu od")
        since = choices.get(since_raw) if isinstance(since_raw, str) else None
        funds = [f.get("foreignRowDisplayName", "")
                 for f in (cells.get("Investors / Inwestorzy") or [])]
        out.append({"name": name, "types": types, "programs": programs,
                    "since": since, "funds": [f for f in funds if f]})
    return out


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit("Usage: extract_pfr_ventures.py <app_read.json> <as-of YYYY-MM-DD>")
    rows = load_rows(Path(sys.argv[1]))
    as_of = sys.argv[2]
    print(f"parsed {len(rows)} portfolio rows")

    kept = [r for r in rows if not r["types"] or set(r["types"]) & EQUITY_TYPES]
    skipped = len(rows) - len(kept)
    print(f"equity-class rows: {len(kept)} (skipped {skipped} credit/debt/mezzanine)")

    con = sqlite3.connect(DB_PATH)
    try:
        full = CompanyMatcher(con, country=None)
        pl = CompanyMatcher(con, country="PL")
        counts: dict[str, int] = {}
        inserted = 0
        for r in kept:
            cid, method = full.match(r["name"])
            if method != "exact":            # only trust exact cross-country
                cid, method = pl.match(r["name"])
            if cid is None:
                cur = con.execute(
                    """INSERT INTO companies (canonical_name, raw_name, country,
                       entity_type, match_method, match_confidence)
                       VALUES (?, ?, '', 'company', 'pfr_ventures', 'medium')""",
                    (normalize_name(r["name"]), r["name"]),
                )
                cid = cur.lastrowid
                pl.register(cid, r["name"])
                full.register(cid, r["name"])
                method = "new"
            counts[method] = counts.get(method, 0) + 1
            first_seen = f"{r['since']}-01-01" if r["since"] else None
            cur = con.execute(
                """INSERT OR IGNORE INTO public_equity_stakes
                   (company_id, holder, holder_type, as_of, first_seen, exited,
                    source, raw_source_url, disclosure_level, via_fund)
                   VALUES (?, 'pfr_ventures', 'state_vc', ?, ?, 0,
                           'pfr_ventures_lookthrough', ?, 'name_only', ?)""",
                (cid, as_of, first_seen, PAGE_URL, "; ".join(r["funds"]) or None),
            )
            inserted += cur.rowcount
        con.commit()
        print(f"match methods: {counts}")
        print(f"stakes inserted: {inserted}")
        overlap = con.execute(
            """SELECT COUNT(DISTINCT s.company_id) FROM public_equity_stakes s
               WHERE s.holder='pfr_ventures' AND EXISTS
                 (SELECT 1 FROM public_funding_events e
                  WHERE e.company_id = s.company_id)"""
        ).fetchone()[0]
        print(f"corpus overlap (companies with funding events): {overlap}")
    finally:
        con.close()


if __name__ == "__main__":
    main()
