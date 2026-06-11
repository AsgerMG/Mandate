"""Sprint 19 — Bpifrance URD 2024 IFRS notes -> pct_exact stakes (Route A, FR).

Source: Document d'enregistrement universel 2024 (AMF-filed; fetched via
Wayback — bpifrance.fr blocks direct download), pages 328-329:
  - Note 9.3 associates (MEE) with "pourcentage de détention ultime"
  - Note 9.5 excluded >20% + significant non-consolidated <20% holdings

These 13 positions are the ONLY position-level disclosure Bpifrance makes,
and only because IFRS forces it (associates; holdings > 1% of own capital).
Doctolib 12.55% is France's single disclosed venture-ticket percentage —
the remaining ~65 Large Venture positions stay invisible. That asymmetry is
the FR scorecard line.

Values are hand-transcribed from the table (one page, auditable against
data/raw/bpifrance_urd/). as_of = 2024-12-31 (URD reference date).
Vehicles (Lac I fund, Tyrol/Labrador holdcos) get entity_type='other'.

Run: python3 scripts/extract_bpifrance_urd_stakes.py
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from lib.matching import CompanyMatcher, normalize_name

DB_PATH = Path(__file__).parent.parent / "db.sqlite"
URL = "https://www.bpifrance.fr/download/media-file/84054"
AS_OF = "2024-12-31"

# (name, pct, country, kind, note-context)
STAKES = [
    ("STMicroelectronics", 13.86, "CH", "company", "associate (MEE)"),
    ("Tyrol Acquisition 1 Cie SCA", 23.99, "LU", "vehicle", "associate (MEE) holdco"),
    ("Eutelsat Communications", 13.59, "FR", "company", "associate (MEE)"),
    ("Lac I", 32.95, "FR", "vehicle", "associate (MEE) fund vehicle"),
    ("Soitec", 11.47, "FR", "company", "associate (MEE)"),
    ("Labrador Investment Holdings Limited", 20.16, "GB", "vehicle",
     "excluded from consolidation; holds Cerba at 4.96% via holding"),
    ("Doctolib", 12.55, "FR", "company", "significant non-consolidated — France's only disclosed venture pct"),
    ("Orange", 8.01, "FR", "company", "significant non-consolidated"),
    ("Stellantis", 9.90, "NL", "company", "significant non-consolidated"),
    ("Technip Energies", 9.98, "NL", "company", "significant non-consolidated"),
    ("Valeo", 9.20, "FR", "company", "significant non-consolidated"),
    ("Verallia", 12.84, "FR", "company", "significant non-consolidated"),
    ("Worldline", 8.18, "FR", "company", "significant non-consolidated"),
]


def main() -> None:
    con = sqlite3.connect(DB_PATH)
    try:
        full = CompanyMatcher(con, country=None)
        scoped: dict[str, CompanyMatcher] = {}
        inserted = 0
        for name, pct, country, kind, _ctx in STAKES:
            if kind == "vehicle":
                row = con.execute(
                    "SELECT id FROM companies WHERE UPPER(canonical_name)=UPPER(?)",
                    (name,)).fetchone()
                cid = row[0] if row else con.execute(
                    """INSERT INTO companies (canonical_name, raw_name, country,
                       entity_type, match_method, match_confidence)
                       VALUES (?, ?, ?, 'other', 'bpifrance_urd', 'high')""",
                    (name, name, country)).lastrowid
                method = "vehicle"
            else:
                cid, method = full.match(name)
                if method != "exact":
                    m = scoped.setdefault(country,
                                          CompanyMatcher(con, country=country))
                    cid, method = m.match(name)
                if cid is None:
                    cid = con.execute(
                        """INSERT INTO companies (canonical_name, raw_name,
                           country, entity_type, match_method, match_confidence)
                           VALUES (?, ?, ?, 'company', 'bpifrance_urd', 'high')""",
                        (normalize_name(name), name, country)).lastrowid
                    method = "new"
                elif method in ("prefix", "reverse_prefix", "fuzzy"):
                    prev = con.execute(
                        "SELECT canonical_name FROM companies WHERE id=?",
                        (cid,)).fetchone()[0]
                    print(f"  AUDIT {method}: {name!r} -> {prev!r}")
            cur = con.execute(
                """INSERT OR IGNORE INTO public_equity_stakes
                   (company_id, holder, holder_type, stake_pct_min,
                    stake_pct_max, as_of, exited, source, raw_source_url,
                    disclosure_level)
                   VALUES (?, 'bpifrance', 'ndb', ?, ?, ?, 0,
                           'bpifrance_urd_2024_ifrs_notes', ?, 'pct_exact')""",
                (cid, pct, pct, AS_OF, URL),
            )
            inserted += cur.rowcount
            print(f"  {method:8s} {pct:6.2f}%  {name}")
        con.commit()
        print(f"stakes inserted: {inserted}")
    finally:
        con.close()


if __name__ == "__main__":
    main()
