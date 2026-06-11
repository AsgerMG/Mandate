"""Sprint 19 — Estonian e-Business Register shareholdings -> stakes (E-A).

Source: RIK open data, `ettevotja_rekvisiidid__osanikud.json` (752MB bulk
dump of ALL Estonian OU shareholders, free since 2022, refreshed daily,
ownership verified against Nasdaq CSD). A streaming scan (documented in the
decision log) extracted every holding of AS SmartCap (registrikood
12071991, incl. its Green Fund / Venture Capital Fund owner accounts) into
data/raw/ee_register/smartcap_stakes_*.json.

This is REGISTER-GRADE disclosure: exact percentages, start/end dates,
independent of the institution's goodwill -> disclosure_level='pct_exact',
EE earns E-A on achieved data. Multiple share lots of the same company are
summed. Wise Guys Investment OU is an investment vehicle -> entity_type
'other' (fund-layer pattern).

Limitation: the osanikud dataset covers OU (private limited) shareholders
only; AS (public limited) ownership lives in the securities register and is
not in this dump. Estonian startups are overwhelmingly OU.

Run: python3 scripts/extract_ee_register_stakes.py data/raw/ee_register/smartcap_stakes_20260611.json 2026-06-11
"""
from __future__ import annotations

import json
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from lib.matching import CompanyMatcher, normalize_name

DB_PATH = Path(__file__).parent.parent / "db.sqlite"
URL = "https://avaandmed.ariregister.rik.ee/en/downloading-open-data"
FUND_VEHICLES = {"Wise Guys Investment OÜ"}


def _iso(d: str | None) -> str | None:
    if not d:
        return None
    return datetime.strptime(d, "%d.%m.%Y").strftime("%Y-%m-%d")


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit("Usage: extract_ee_register_stakes.py <stakes.json> <as-of>")
    raw = json.loads(Path(sys.argv[1]).read_text())
    as_of = sys.argv[2]

    # sum share lots per company; keep earliest start date; skip ended lots
    by_co: dict[str, dict] = {}
    for r in raw:
        if r.get("until"):
            continue
        name = r["company"]
        e = by_co.setdefault(name, {"pct": 0.0, "since": None})
        e["pct"] += float(r["pct"] or 0)
        s = _iso(r.get("since"))
        if s and (e["since"] is None or s < e["since"]):
            e["since"] = s
    print(f"{len(raw)} register lots -> {len(by_co)} companies")

    con = sqlite3.connect(DB_PATH)
    try:
        full = CompanyMatcher(con, country=None)
        ee = CompanyMatcher(con, country="EE")
        inserted = 0
        for name, e in by_co.items():
            is_fund = name in FUND_VEHICLES
            if is_fund:
                row = con.execute(
                    "SELECT id FROM companies WHERE UPPER(canonical_name)=UPPER(?)",
                    (name,)).fetchone()
                cid = row[0] if row else con.execute(
                    """INSERT INTO companies (canonical_name, raw_name, country,
                       entity_type, match_method, match_confidence)
                       VALUES (?, ?, 'EE', 'other', 'ee_register', 'high')""",
                    (name, name)).lastrowid
                method = "fund"
            else:
                cid, method = full.match(name)
                if method != "exact":
                    cid, method = ee.match(name)
                if cid is None:
                    cid = con.execute(
                        """INSERT INTO companies (canonical_name, raw_name,
                           country, entity_type, match_method, match_confidence)
                           VALUES (?, ?, 'EE', 'company', 'ee_register', 'high')""",
                        (normalize_name(name), name)).lastrowid
                    ee.register(cid, name)
                    full.register(cid, name)
                    method = "new"
            cur = con.execute(
                """INSERT OR IGNORE INTO public_equity_stakes
                   (company_id, holder, holder_type, stake_pct_min,
                    stake_pct_max, as_of, first_seen, exited, source,
                    raw_source_url, disclosure_level)
                   VALUES (?, 'smartcap', 'state_vc', ?, ?, ?, ?, 0,
                           'ee_ariregister_osanikud', ?, 'pct_exact')""",
                (cid, round(e["pct"], 2), round(e["pct"], 2), as_of,
                 e["since"], URL),
            )
            inserted += cur.rowcount
            print(f"  {method:8s} {e['pct']:6.2f}%  since {e['since']}  {name}")
        con.commit()
        print(f"stakes inserted: {inserted}")
    finally:
        con.close()


if __name__ == "__main__":
    main()
