"""Top up the cached case records with the per-scheme fields the first pass dropped.

`fetch_state_aid_cases.py` keeps 14 of the record's 48 metadata fields, on the
judgement that the rest is "search-engine plumbing". Re-read against one live
record, five of the dropped fields are not plumbing and say something about the
scheme itself:

    caseSectors            NACE sectors the measure is scoped to
    casePrimaryLaws        the legal act it is granted under
    caseSecondaryLaws      the implementing act
    caseMeasureStartDate   when it opened (the cache kept only the end date)
    caseNotificationDate   when it was notified

That matters because `caseSectors` is the only unused register field that is
FOUNDER-TESTABLE: a founder has a sector, and "this measure is scoped to NACE
35.3" is a condition they can be checked against, where an SA number is an
identifier they can never match. Whether it actually VARIES between siblings is
a question the cache could not answer, so this fetches it.

Free: pure HTTP against the same public search API, same POST-not-GET rule,
same exact-`reference` match, same 1.2s delay, only for SA numbers already in
the cache. Writes back into `cases.json` in place, merging rather than
replacing, so nothing already relied on can be lost.

  python3 ETL/terms/fetch_case_extra_fields.py [--limit N]
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import ROOT  # noqa: E402

import argparse  # noqa: E402
import json  # noqa: E402
import subprocess  # noqa: E402
import time  # noqa: E402

OUT = ROOT / "data" / "raw" / "state_aid_cases"
API = ("https://webgate.ec.europa.eu/es/search-api/rest/search"
       "?text={sa}&pageNumber=1&pageSize=5&apiKey=CS_PROD_ODSE_PROD")
DELAY_S = 1.2
EXTRA = ["caseSectors", "casePrimaryLaws", "caseSecondaryLaws",
         "caseMeasureStartDate", "caseNotificationDate", "caseLegalBasis"]


def fetch(sa: str) -> dict | None:
    """POST, not GET -- a GET on this URL returns HTTP 500."""
    try:
        out = subprocess.run(
            ["curl", "-sS", "-X", "POST", "-L", "--max-time", "30",
             "-H", "Content-Type: application/json", API.format(sa=sa)],
            capture_output=True, text=True, timeout=45)
        data = json.loads(out.stdout)
    except Exception:
        return None
    for r in data.get("results", []):
        # Exact reference match: a text search for an SA number also returns
        # cases that merely CITE it, and a cited case is a different scheme.
        if (r.get("reference") or "").strip() == sa:
            md = r.get("metadata") or {}
            return {k: md[k] for k in EXTRA if md.get(k)}
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    args = ap.parse_args()

    store = OUT / "cases.json"
    if not store.exists():
        raise SystemExit(f"no cache at {store}; run fetch_state_aid_cases.py first")
    cases = json.loads(store.read_text())

    todo = [sa for sa, rec in cases.items()
            if not any(k in rec for k in EXTRA) and "_topped_up" not in rec]
    if args.limit:
        todo = todo[:args.limit]
    print(f"{len(cases)} cached cases, {len(todo)} to top up")

    got = 0
    for n, sa in enumerate(todo, 1):
        rec = fetch(sa)
        # Record the ATTEMPT either way. A case that genuinely carries none of
        # these fields is a finding; leaving it unmarked would make every
        # re-run pay for it again and read as "not fetched yet".
        cases[sa]["_topped_up"] = True
        if rec:
            cases[sa].update(rec)
            got += 1
        if n % 25 == 0 or n == len(todo):
            store.write_text(json.dumps(cases, ensure_ascii=False))
            print(f"  {n}/{len(todo)} fetched, {got} carried at least one field")
        time.sleep(DELAY_S)

    store.write_text(json.dumps(cases, ensure_ascii=False))
    have = {k: sum(1 for r in cases.values() if r.get(k)) for k in EXTRA}
    print("field presence over the whole cache:", have)


if __name__ == "__main__":
    main()
