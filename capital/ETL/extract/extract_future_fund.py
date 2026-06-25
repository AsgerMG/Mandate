"""Sprint 19 Step 5a — UK Future Fund equity register -> public_equity_stakes.

Source: British Business Bank quarterly register of companies in which the
Future Fund (COVID-era convertible loan scheme, 1,193 loans) holds an equity
interest after conversion. The live page is Cloudflare-gated; we parse a
Wayback Machine snapshot saved under data/raw/future_fund/ (re-run with a
newer snapshot to roll the register forward — the UNIQUE key dedups).

Register layout (three relevant tables, identified by preceding caption):
  "Company names: equity interests"  -> active stakes (exited=0)
  "Company names: insolvencies"      -> former stakes, company insolvent
                                        (exited=1; programme-lifetime list)
Disclosure: names + UK region only — no percentages, no ticket sizes ->
disclosure_level='name_only'. The UK still earns E-A because the register is
mandatory-publication, near-complete, and independent of investee goodwill.

Run: python3 scripts/extract_future_fund.py data/raw/future_fund/<snapshot>.html <as-of-date>
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

pass  # sys.path handled by etl_env bootstrap
from matching import CompanyMatcher, normalize_name

BASE = _ETL_ROOT
DB_PATH = _ETL_DB
PAGE_URL = ("https://www.british-business-bank.co.uk/finance-options/"
            "legacy-programmes/future-fund/future-fund-companies")
HOLDER = "uk_future_fund"


def parse_register(html: str) -> dict[str, list[str]]:
    """Return {'equity_interests': [names], 'insolvencies': [names]}."""
    out: dict[str, list[str]] = {"equity_interests": [], "insolvencies": []}
    for m in re.finditer(r"(?s)<table.*?</table>", html):
        caption = re.sub(r"<[^>]+>", " ", html[max(0, m.start() - 400):m.start()])
        caption = re.sub(r"\s+", " ", caption).lower()
        if "company names: equity interests" in caption:
            bucket = "equity_interests"
        elif "company names: insolvencies" in caption:
            bucket = "insolvencies"
        else:
            continue
        for row in re.findall(r"(?s)<tr.*?</tr>", m.group(0)):
            cells = [re.sub(r"<[^>]+>", "", c).strip()
                     for c in re.findall(r"(?s)<td.*?</td>", row)]
            if not cells or not cells[0] or cells[0].lower() == "company name":
                continue
            # strip footnote markers like ** and trailing whitespace artifacts
            name = re.sub(r"\*+$", "", cells[0]).strip()
            if name:
                out[bucket].append(name)
    return out


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit("Usage: extract_future_fund.py <snapshot.html> <as-of YYYY-MM-DD>")
    snapshot, as_of = Path(sys.argv[1]), sys.argv[2]
    html = snapshot.read_text(encoding="utf-8", errors="replace")
    register = parse_register(html)
    print(f"parsed: {len(register['equity_interests'])} equity interests, "
          f"{len(register['insolvencies'])} insolvencies")

    con = sqlite3.connect(DB_PATH)
    try:
        matcher = CompanyMatcher(con, country="GB")
        counts: dict[str, int] = {}
        inserted = 0
        for bucket, exited in (("equity_interests", 0), ("insolvencies", 1)):
            for raw_name in register[bucket]:
                cid, method = matcher.match(raw_name)
                if cid is None:
                    cur = con.execute(
                        """INSERT INTO companies (canonical_name, raw_name,
                           country, entity_type, match_method, match_confidence)
                           VALUES (?, ?, 'GB', 'company', 'future_fund', 'medium')""",
                        (normalize_name(raw_name), raw_name),
                    )
                    cid = cur.lastrowid
                    matcher.register(cid, raw_name)
                    method = "new"
                counts[method] = counts.get(method, 0) + 1
                cur = con.execute(
                    """INSERT OR IGNORE INTO public_equity_stakes
                       (company_id, holder, holder_type, as_of, first_seen,
                        exited, source, raw_source_url, disclosure_level)
                       VALUES (?, ?, 'ndb', ?, ?, ?, 'future_fund_register',
                               ?, 'name_only')""",
                    (cid, HOLDER, as_of, as_of, exited, PAGE_URL),
                )
                inserted += cur.rowcount
        con.commit()
        print(f"match methods: {counts}")
        print(f"stakes inserted: {inserted}")
        for row in con.execute(
            "SELECT exited, COUNT(*) FROM public_equity_stakes "
            "WHERE holder=? GROUP BY 1", (HOLDER,)
        ):
            print(f"  exited={row[0]}: {row[1]}")
        overlap = con.execute(
            """SELECT COUNT(DISTINCT s.company_id) FROM public_equity_stakes s
               WHERE s.holder=? AND EXISTS (SELECT 1 FROM public_funding_events e
                                            WHERE e.company_id = s.company_id)""",
            (HOLDER,),
        ).fetchone()[0]
        print(f"  companies also holding funding events (corpus overlap): {overlap}")
    finally:
        con.close()


if __name__ == "__main__":
    main()
