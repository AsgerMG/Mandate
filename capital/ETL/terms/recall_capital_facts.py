"""What the register says a company was ACTUALLY paid, per (company, scheme).

Reads a JSON list of {"name", "instrument"} on stdin and writes a JSON object
keyed "<name> <instrument>" on stdout:

    ownKinds        capital kinds this company was paid UNDER this scheme
    schemeKinds     capital kinds this scheme has paid ANYONE
    elsewhereKinds  capital kinds this company took anywhere EXCEPT this scheme

── Why this is a separate file and not a copy of the mapping ───────────────
`capital_kind` is IMPORTED from `enrich_recall_answers.py`, which is the module
that wrote the derived answers in the first place. A second copy of that
keyword table here could disagree with the one under test, and the only
question this data is used to settle -- does a fund pay the kind of capital the
founder asked for -- would then be decided by the divergence rather than by the
register.

Consumed by website/frontend/scripts/diagnose_capital_pool.ts.
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
_sys.path.insert(0, str(_Path(__file__).resolve().parent))
from etl_env import DB  # noqa: E402

import collections  # noqa: E402
import json  # noqa: E402
import sqlite3  # noqa: E402

from enrich_recall_answers import capital_kind  # noqa: E402


def main() -> None:
    pairs = json.load(_sys.stdin)
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row

    inst = {r["id"]: (r["scheme_code"] or "").strip()
            for r in conn.execute("SELECT id, scheme_code FROM funding_instruments")}
    company: dict[str, int] = {}
    for r in conn.execute("SELECT id, canonical_name FROM companies"):
        company.setdefault(r["canonical_name"], r["id"])

    own: dict[tuple[int, str], set] = collections.defaultdict(set)
    by_company: dict[int, dict[str, set]] = collections.defaultdict(
        lambda: collections.defaultdict(set))
    scheme: dict[str, set] = collections.defaultdict(set)
    for r in conn.execute("""
            SELECT company_id, sa_number, aid_instrument_text
              FROM satr_staging
             WHERE sa_number IS NOT NULL AND TRIM(sa_number) <> ''"""):
        kind = capital_kind(r["aid_instrument_text"])
        if not kind:
            continue
        sa = r["sa_number"].strip()
        scheme[sa].add(kind)
        cid = r["company_id"]
        if cid is None:
            continue
        own[(cid, sa)].add(kind)
        by_company[cid][sa].add(kind)

    out = {}
    for p in pairs:
        code = inst.get(p["instrument"], "")
        cid = company.get(p["name"])
        elsewhere: set = set()
        if cid is not None:
            for sa, kinds in by_company[cid].items():
                if sa != code:
                    elsewhere |= kinds
        out[f"{p['name']} {p['instrument']}"] = {
            "ownKinds": sorted(own.get((cid, code), set())) if cid is not None else [],
            "schemeKinds": sorted(scheme.get(code, set())),
            "elsewhereKinds": sorted(elsewhere),
        }
    json.dump(out, _sys.stdout)


if __name__ == "__main__":
    main()
