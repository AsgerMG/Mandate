"""Description coverage on the OPEN pool, read off the LOCAL store.

── Why this exists next to scripts/_wsey_census.ts and not instead of it ────
The census is the authority: it reads Postgres through the product's own
`publishableInstruments()` and `schemeText.ts` renderer, so its numbers are the
numbers a founder experiences. But this workstream loads with `--sqlite-only`
by deliberate instruction -- publishing is a separate human decision -- so the
census cannot see what a load just wrote, and an "after" taken from it would
report no change however much text landed.

So the before/after pair is taken HERE, over SQLite, and the census is run once
to anchor it: if this script and the census agree on the BEFORE, the delta this
script reports on the AFTER is the delta the census will report once someone
publishes. Anchoring is not optional -- it is printed on every run and any
divergence is the finding, not a rounding error.

Liveness is `live_ids()` imported from load_scheme_text, which is itself
`is_closed()` from ETL/lib/liveness.py, which is the projection of
lib/intelligence/liveness.ts. Four names, one definition, no hand-copy.

  python3 ETL/terms/_wsey_open_coverage.py
  python3 ETL/terms/_wsey_open_coverage.py --json /tmp/wsey_before.json
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB  # noqa: E402

import argparse  # noqa: E402
import collections  # noqa: E402
import json  # noqa: E402
import sqlite3  # noqa: E402

from load_scheme_text import live_ids  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", metavar="PATH", help="also write the counts here")
    ap.add_argument("--with-text", action="store_true",
                    help="include name+description per open row, so "
                         "scripts/_wsey_legible_staged.ts can run production's "
                         "own renderer over the staged text")
    args = ap.parse_args()

    conn = sqlite3.connect(DB)
    open_ids = live_ids(conn)
    names = dict(conn.execute("SELECT id, name FROM funding_instruments"))
    rows = {i: (c, (d or "").strip()) for i, c, d in conn.execute(
        "SELECT id, country, description FROM funding_instruments")}
    conn.close()

    described = {i for i in open_ids if rows.get(i, ("", ""))[1]}
    per = collections.defaultdict(lambda: [0, 0])
    for i in open_ids:
        cc, d = rows.get(i, ("??", ""))
        per[cc][0] += 1
        if d:
            per[cc][1] += 1

    n, k = len(open_ids), len(described)
    print(f"OPEN pool (SQLite, live_ids)  {n}")
    print(f"description present           {k}  {100 * k / (n or 1):.1f}%")
    print(f"undescribed                   {n - k}")
    print("\nby country (open, described, undescribed):")
    for cc, (o, dd) in sorted(per.items(), key=lambda x: -(x[1][0] - x[1][1])):
        if o - dd == 0:
            continue
        print(f"  {cc:<4} open={o:>4} described={dd:>4} "
              f"({100 * dd / (o or 1):>5.1f}%)  undescribed={o - dd:>4}")

    if args.json:
        _Path(args.json).write_text(json.dumps({
            "openPool": n, "described": k, "undescribed": n - k,
            "byCountry": {cc: {"open": o, "described": dd} for cc, (o, dd) in per.items()},
            "describedIds": sorted(described),
            **({"openRows": [
                {"id": i, "name": names.get(i) or "", "description": rows[i][1]}
                for i in sorted(open_ids)]} if args.with_text else {}),
        }, indent=1))
        print(f"\nwrote {args.json}")


if __name__ == "__main__":
    main()
