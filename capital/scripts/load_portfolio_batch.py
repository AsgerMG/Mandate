"""Sprint 19 — load a unified portfolio-page batch into public_equity_stakes.

Input CSV (data/raw/portfolio_batch_YYYYMMDD.csv) with columns:
  name, country, holder, holder_type, exited, kind, source, url
built from server-rendered portfolio pages (parsers documented in the
decision log; raw HTML snapshots in /tmp are disposable — the CSV is the
reproducibility artifact).

All rows are disclosure_level='name_only' (these pages publish names, never
percentages or tickets). kind='fund' rows are fund-layer LP positions and
get entity_type='other' company rows (EIFO Note 12 pattern). Self-published
holdings pages -> as_of = scrape date; survivorship-bias caveat applies
(Portugal Ventures is the exception: it publishes its exits, loaded with
exited=1).

Matching: exact tier corpus-wide, fuzzy tiers country-scoped; non-exact
matches against pre-existing companies are printed for manual audit.

Run: python3 scripts/load_portfolio_batch.py data/raw/portfolio_batch_20260611.csv 2026-06-11
"""
from __future__ import annotations

import csv
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from lib.matching import CompanyMatcher, normalize_name

DB_PATH = Path(__file__).parent.parent / "db.sqlite"


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit("Usage: load_portfolio_batch.py <batch.csv> <as-of YYYY-MM-DD>")
    rows = list(csv.DictReader(open(sys.argv[1], encoding="utf-8")))
    as_of = sys.argv[2]

    con = sqlite3.connect(DB_PATH)
    try:
        full = CompanyMatcher(con, country=None)
        scoped: dict[str, CompanyMatcher] = {}
        counts: dict[str, int] = {}
        inserted = 0
        audits = []
        for r in rows:
            name, country = r["name"].strip(), r["country"]
            if not name:
                continue
            if r["kind"] == "fund":
                row = con.execute(
                    "SELECT id FROM companies WHERE UPPER(canonical_name)=UPPER(?)",
                    (name,)).fetchone()
                cid = row[0] if row else con.execute(
                    """INSERT INTO companies (canonical_name, raw_name, country,
                       entity_type, match_method, match_confidence)
                       VALUES (?, ?, ?, 'other', ?, 'high')""",
                    (name, name, country, r["holder"])).lastrowid
                method = "fund"
            else:
                cid, method = full.match(name)
                if method != "exact":
                    if country not in scoped:
                        scoped[country] = CompanyMatcher(con, country=country)
                    cid, method = scoped[country].match(name)
                if cid is None:
                    cid = con.execute(
                        """INSERT INTO companies (canonical_name, raw_name,
                           country, entity_type, match_method, match_confidence)
                           VALUES (?, ?, ?, 'company', ?, 'medium')""",
                        (normalize_name(name), name, country, r["holder"]),
                    ).lastrowid
                    scoped.setdefault(
                        country, CompanyMatcher(con, country=country)
                    ).register(cid, name)
                    full.register(cid, name)
                    method = "new"
                elif method in ("prefix", "reverse_prefix", "fuzzy"):
                    prev = con.execute(
                        "SELECT canonical_name, match_method FROM companies "
                        "WHERE id=?", (cid,)).fetchone()
                    if prev[1] != r["holder"]:
                        audits.append((method, name, prev[0], r["holder"]))
            counts[method] = counts.get(method, 0) + 1
            cur = con.execute(
                """INSERT OR IGNORE INTO public_equity_stakes
                   (company_id, holder, holder_type, as_of, exited, source,
                    raw_source_url, disclosure_level)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'name_only')""",
                (cid, r["holder"], r["holder_type"], as_of,
                 int(r["exited"]), r["source"], r["url"]),
            )
            inserted += cur.rowcount
        con.commit()
        print(f"match methods: {counts}")
        print(f"stakes inserted: {inserted}")
        if audits:
            print("\nAUDIT — non-exact matches against pre-existing companies:")
            for method, raw, prev, holder in audits:
                print(f"  {method:15s} [{holder}] {raw!r} -> {prev!r}")
        for row in con.execute(
            "SELECT holder, COUNT(*), SUM(exited) FROM public_equity_stakes "
            "WHERE source LIKE '%portfolio' GROUP BY 1 ORDER BY 2 DESC LIMIT 20"
        ):
            print(f"  {row[0]:25s} {row[1]:4d} stakes ({row[2]} exited)")
    finally:
        con.close()


if __name__ == "__main__":
    main()
