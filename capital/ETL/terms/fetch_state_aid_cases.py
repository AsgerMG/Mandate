"""Give every notified state-aid scheme its own identity, from the Commission's
own case register.

── The problem this solves ────────────────────────────────────────────────
453 SATR scheme children are named after the BODY that granted the money, not
the scheme a founder applies to: nine rows reading "Bundesamt für Wirtschaft und
Ausfuhrkontrolle", told apart only by an SA number in the id. Worse, every one
of them inherits its eligibility criteria from its regime, and each regime was
characterised from a single document — so all 81 German R&D schemes display
rules extracted from one BMFTR security-research guideline.

Every one of those children carries an SA number (453 of 453, 376 distinct), and
the Commission publishes a case record per SA number. SA.63177 is not
"Bundesamt für Wirtschaft und Ausfuhrkontrolle"; it is "Federal support for
efficient heat networks".

── The source, and why this is not scraping ───────────────────────────────
competition-cases.ec.europa.eu is a client-rendered app over a public search
API, and the app ships its own API key in the page. This calls that API the way
the app calls it (POST, query parameters, no body — a GET returns HTTP 500,
which is what made it look unavailable at first). No block is being worked
around and no browser is being impersonated; contrast the three agencies
recorded in seed_agency_routes.py that actively refuse automated access and are
therefore left alone.

Requests are serialised with a delay. Results are cached on disk, so a re-run
costs nothing and the register is queried once per scheme.

── What is deliberately NOT done here ─────────────────────────────────────
Applying the titles. This script only fetches and records, for the same reason
as the agency catalogues: a name shown to a founder is a claim, and the pass
that decides which title replaces which instrument's name should read stored
evidence rather than a live network response.

Usage:
  python3 ETL/terms/fetch_state_aid_cases.py status
  python3 ETL/terms/fetch_state_aid_cases.py run [--limit N]
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import argparse
import json
import sqlite3
import subprocess
import time

OUT = ROOT / "data" / "raw" / "state_aid_cases"
API = ("https://webgate.ec.europa.eu/es/search-api/rest/search"
       "?text={sa}&pageNumber=1&pageSize=5&apiKey=CS_PROD_ODSE_PROD")
DELAY_S = 1.2

# Fields worth keeping. The record carries 47, most of them search-engine
# plumbing (checksums, ingest queue timestamps); these are the ones that say
# something about the scheme itself.
KEEP = ["caseTitle", "caseOriginalTitle", "caseObjectivesStr", "caseObjectives",
        "caseMemberState", "caseRegions", "caseAidInstruments", "caseAidCategory",
        "caseInitiationDate", "caseLastDecisionDate", "caseMeasureEndDate",
        "caseExpenditures", "caseLinks", "caseSimplifiedProcedure"]


def scheme_codes(conn: sqlite3.Connection) -> list[tuple[str, float]]:
    """Every notified scheme an instrument sits under, largest first — so a
    truncated run covers the schemes that carry the most money.

    Two ways an instrument can name its scheme, and the register's record is
    worth the same either way:

      - `scheme_code` on the row. SATR children get this from the transparency
        filing, which is where the column comes from.
      - `sa_number` in a fetch record, for a row whose `scheme_code` is empty
        because its source is not SATR. A national call register states the aid
        measure its calls are made under, and that statement is as good an
        identity as the filing's — it is the same field, from the member state
        rather than from the Commission's aggregation of it.

    The second route is read from `found_*.json` rather than from a column
    because writing `scheme_code` is a different decision with its own
    consequences (naming, the successor redirect, `live_codes`), and fetching a
    public case record should not require making it first.
    """
    weight: dict[str, float] = {}
    for sa, eur in conn.execute("""
        SELECT i.scheme_code, MAX(i.total_eur)
        FROM funding_instruments i
        JOIN funding_instruments p ON p.id = i.parent_id
        WHERE p.source_family_bucket = 'state_aid_satr'
          AND i.scheme_code IS NOT NULL AND TRIM(i.scheme_code) <> ''
        GROUP BY 1"""):
        weight[sa] = max(weight.get(sa, 0.0), eur or 0.0)

    total = {r[0]: (r[1] or 0.0) for r in
             conn.execute("SELECT id, total_eur FROM funding_instruments")}
    src = ROOT / "data" / "raw" / "scheme_enrichment"
    if src.exists():
        for f in sorted(src.glob("found_*.json")):
            try:
                recs = json.loads(f.read_text())
            except Exception:
                continue
            for rec in recs:
                sa = (rec.get("sa_number") or "").strip()
                if not sa:
                    continue
                weight[sa] = max(weight.get(sa, 0.0),
                                 total.get(rec.get("instrument_id"), 0.0))

    return sorted(weight.items(), key=lambda kv: -kv[1])


def fetch_case(sa: str) -> dict | None:
    """The register's record for one SA number, or None.

    POST, not GET: the same URL as a GET returns HTTP 500, which is why this
    source looked unavailable on first inspection.
    """
    try:
        out = subprocess.run(
            ["curl", "-sS", "-X", "POST", "-L", "--max-time", "30",
             "-H", "Content-Type: application/json", API.format(sa=sa)],
            capture_output=True, text=True, timeout=45)
    except Exception:
        return None
    try:
        data = json.loads(out.stdout)
    except Exception:
        return None
    # Match the reference exactly: a text search for "SA.57625" also returns
    # cases that merely CITE it, and naming a scheme after a case that mentions
    # it would be worse than leaving it unnamed.
    for r in data.get("results", []):
        if (r.get("reference") or "").strip() == sa:
            md = r.get("metadata") or {}
            keep = {k: md[k] for k in KEEP if md.get(k)}
            if not keep:
                return None
            keep["_reference"] = sa
            return keep
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["status", "run"])
    ap.add_argument("--limit", type=int)
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    store = OUT / "cases.json"
    cases = json.loads(store.read_text()) if store.exists() else {}

    conn = sqlite3.connect(DB)
    codes = scheme_codes(conn)
    todo = [(sa, eur) for sa, eur in codes if sa not in cases]

    if args.cmd == "status":
        got = sum(1 for sa, _ in codes if sa in cases)
        named = sum(1 for sa, _ in codes
                    if (cases.get(sa) or {}).get("caseTitle"))
        print(f"notified schemes under SATR regimes: {len(codes)}")
        print(f"  already fetched:                   {got}")
        print(f"  of those, carrying a case title:   {named}")
        print(f"  still to fetch:                    {len(todo)}")
        return

    for i, (sa, eur) in enumerate(todo[:args.limit] if args.limit else todo, 1):
        rec = fetch_case(sa)
        cases[sa] = rec or {"_reference": sa, "_miss": True}
        title = ((rec or {}).get("caseTitle") or [""])[0][:52]
        print(f"  [{i:>3}] {sa:12} EUR {eur/1e6:>7.0f}M  {title or '(no record)'}")
        store.write_text(json.dumps(cases, ensure_ascii=False, indent=1) + "\n")
        time.sleep(DELAY_S)

    named = sum(1 for v in cases.values() if v.get("caseTitle"))
    print(f"\n{len(cases)} cases on disk, {named} with a Commission title.")
    print("Applying them to instrument names is a separate pass over this file.")


if __name__ == "__main__":
    main()
