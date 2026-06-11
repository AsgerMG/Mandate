"""Sprint 19 Step 6 — Investinor portfolio -> public_equity_stakes (NO).

Source: investinor.no/portefolje/ (WordPress, server-rendered; MixItUp facet
classes carry the structure). Three buckets via data-investment:
  selskapsportefolje  (40) -> active direct company stakes, exited=0
  avhendet-portefolje (72) -> divested/former positions, exited=1
  fondsportefolje     (27) -> fund-layer LP positions, stored against
                              entity_type='other' rows (EIFO Note 12 pattern)
Disclosure: names + region only -> name_only. This is Norway's E-B fallback
while aksjonaerregister access (the E-A route) is unconfirmed.

Country: 'NO' unless data-geography='utlandet' (3 foreign-domiciled) -> ''.
Matching: exact tier corpus-wide, fuzzy tiers NO-scoped (PFR pattern).

Run: python3 scripts/extract_investinor_portfolio.py data/raw/investinor/portefolje_20260611.html 2026-06-11
"""
from __future__ import annotations

import re
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from lib.matching import CompanyMatcher, normalize_name

BASE = Path(__file__).parent.parent
DB_PATH = BASE / "db.sqlite"
PAGE_URL = "https://investinor.no/portefolje/"

BUCKETS = {"selskapsportefolje": ("company", 0),
           "avhendet-portefolje": ("company", 1),
           "fondsportefolje": ("fund", 0)}


def parse(html: str) -> list[dict]:
    out = []
    for m in re.finditer(
        r'(?s)<article class="cell portfolio-card mix [^"]*"[^>]*'
        r'data-geography="([^"]*)"[^>]*data-investment="([^"]*)".*?'
        r"<h2>([^<]+)</h2>", html
    ):
        geo, inv, name = m.group(1), m.group(2), m.group(3).strip()
        if inv not in BUCKETS:
            continue
        kind, exited = BUCKETS[inv]
        out.append({"name": name, "kind": kind, "exited": exited,
                    "country": "" if geo == "utlandet" else "NO"})
    return out


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit("Usage: extract_investinor_portfolio.py <html> <as-of>")
    rows = parse(Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace"))
    as_of = sys.argv[2]
    print(f"parsed {len(rows)}: "
          f"{sum(r['kind']=='company' and not r['exited'] for r in rows)} active, "
          f"{sum(r['exited'] for r in rows)} divested, "
          f"{sum(r['kind']=='fund' for r in rows)} funds")

    con = sqlite3.connect(DB_PATH)
    try:
        full = CompanyMatcher(con, country=None)
        no = CompanyMatcher(con, country="NO")
        counts: dict[str, int] = {}
        inserted = 0
        for r in rows:
            if r["kind"] == "fund":
                row = con.execute(
                    "SELECT id FROM companies WHERE UPPER(canonical_name)=UPPER(?)",
                    (r["name"],)).fetchone()
                cid = row[0] if row else con.execute(
                    """INSERT INTO companies (canonical_name, raw_name, country,
                       entity_type, match_method, match_confidence)
                       VALUES (?, ?, ?, 'other', 'investinor', 'high')""",
                    (r["name"], r["name"], r["country"])).lastrowid
                method = "fund"
            else:
                cid, method = full.match(r["name"])
                if method != "exact":
                    cid, method = no.match(r["name"])
                if cid is None:
                    cid = con.execute(
                        """INSERT INTO companies (canonical_name, raw_name,
                           country, entity_type, match_method, match_confidence)
                           VALUES (?, ?, ?, 'company', 'investinor', 'medium')""",
                        (normalize_name(r["name"]), r["name"], r["country"]),
                    ).lastrowid
                    no.register(cid, r["name"])
                    full.register(cid, r["name"])
                    method = "new"
            counts[method] = counts.get(method, 0) + 1
            cur = con.execute(
                """INSERT OR IGNORE INTO public_equity_stakes
                   (company_id, holder, holder_type, as_of, exited, source,
                    raw_source_url, disclosure_level)
                   VALUES (?, 'investinor', 'state_vc', ?, ?,
                           'investinor_portfolio', ?, 'name_only')""",
                (cid, as_of, r["exited"], PAGE_URL),
            )
            inserted += cur.rowcount
        con.commit()
        print(f"match methods: {counts}")
        print(f"stakes inserted: {inserted}")
    finally:
        con.close()


if __name__ == "__main__":
    main()
