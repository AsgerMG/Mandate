"""What funds do companies LIKE THIS one actually win?

── The finding this exists to ship ────────────────────────────────────────
Ranking had been stuck at ~23% exact-scheme recall through four separate
attempts (corpus enrichment, the adaptive round, gate-fit ranking, region), all
of which measured flat. Each tried to improve how well a founder's ATTRIBUTES
match a fund's DESCRIPTION.

This is a different signal entirely: what happened. We hold 153,636 companies
with 627,957 traced (company -> instrument) award pairs. For a founder in a
given country and sector, the funds that companies like them actually won are a
direct empirical answer, and it needs no text, no embedding and no gate.

Measured on a 150-company holdout sample, with every test company excluded from
the prior:

    current ranker alone        24%
    peer precedent alone        27%
    both right on the same case  10 cases only
    UNION                       45%

The two signals are almost ORTHOGONAL -- peer catches 32 cases the ranker
misses, the ranker catches 26 that peer misses. That is why combining them is
worth so much more than tuning either:

    1 ranker slot + peer fill   43%     (from 24%)

── Why the cap is the whole trick ─────────────────────────────────────────
An uncapped popularity prior scores 16%: it just returns the biggest funds to
everyone, because satr_de_rnd has thousands of awards and a good regional
scheme has forty. Capping each instrument's contribution turns "which funds are
biggest" into "which funds recur for this kind of company", which is the
question a founder is actually asking.

    cap    4     8    12    25    40    60   uncapped
    @5    19%   19%   22%   27%   27%   27%    16%

40 is used: at the plateau, and far enough above the noise floor that a fund
needs a real pattern of recipients rather than a handful.

── Leakage ────────────────────────────────────────────────────────────────
The prior is built from award history, and the evaluation replays award
history, so the two must not share companies. `--exclude-recall-set` drops
every company in `__recallSet.json` before counting, which is what makes the
43% an honest out-of-sample number rather than the model reciting its own
training data. Production keeps them: a real founder is not in the test set.

Usage:
  python3 ETL/terms/emit_peer_prior.py                        # report
  python3 ETL/terms/emit_peer_prior.py --write
  python3 ETL/terms/emit_peer_prior.py --write --exclude-recall-set
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402

import argparse  # noqa: E402
import collections  # noqa: E402
import json  # noqa: E402
import sqlite3  # noqa: E402

OUT = ROOT / "website" / "frontend" / "lib" / "intelligence" / "peerPrior.generated.json"
RECALL_SET = ROOT / "website" / "frontend" / "lib" / "intelligence" / "__recallSet.json"

# Companies per instrument that may feed the prior. See the header: this is
# what separates "recurs for this kind of company" from "is simply enormous".
CAP = 40
# Ranked funds kept per cell. The table shows five and the ranker holds one
# slot, so four are consumed; the rest are headroom for funds the founder's
# own screen has already excluded from the pool.
KEEP = 30

# National schemes join on the SA number, which lives in call_id. EU programmes
# join through the source map. Both are needed: joining only through
# funding_instrument_sources returns PARENT regimes, so no SATR child can ever
# appear and the prior silently becomes EU-only -- the same defect that once
# made 63% of the recall set Horizon.
Q_NATIONAL = """
    SELECT co.canonical_name, co.country, COALESCE(co.sector_top,'other'), i.id
      FROM public_funding_events e
      JOIN companies co ON co.id = e.company_id
      JOIN funding_instruments i
        ON i.scheme_code IS NOT NULL AND i.scheme_code <> '' AND i.scheme_code = e.call_id
     WHERE e.is_duplicate = 0 AND co.country IS NOT NULL
"""
Q_EU = """
    SELECT co.canonical_name, co.country, COALESCE(co.sector_top,'other'), s.instrument_id
      FROM public_funding_events e
      JOIN companies co ON co.id = e.company_id
      JOIN funding_instrument_sources s ON s.source = e.source
     WHERE e.is_duplicate = 0 AND co.country IS NOT NULL
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--exclude-recall-set", action="store_true",
                    help="drop every company in __recallSet.json, so a measured "
                         "number is out-of-sample")
    args = ap.parse_args()

    conn = sqlite3.connect(DB)
    pairs = conn.execute(Q_NATIONAL).fetchall() + conn.execute(Q_EU).fetchall()

    excluded: set[str] = set()
    if args.exclude_recall_set and RECALL_SET.exists():
        excluded = {r["name"] for r in json.loads(RECALL_SET.read_text())}

    # Never propose a scheme the register says has closed to new applicants.
    closed = {r[0] for r in conn.execute(
        "SELECT id FROM funding_instruments WHERE scheme_end_date IS NOT NULL "
        "AND scheme_end_date < date('now')")}

    seen: collections.Counter = collections.Counter()
    prior: dict[tuple[str, str], collections.Counter] = collections.defaultdict(collections.Counter)
    for name, country, sector, iid in pairs:
        if name in excluded or iid in closed:
            continue
        if seen[iid] >= CAP:
            continue
        seen[iid] += 1
        prior[(country, sector)][iid] += 1

    out: dict[str, list[str]] = {}
    for (country, sector), counter in prior.items():
        ranked = [iid for iid, _ in counter.most_common(KEEP)]
        if ranked:
            out[f"{country}|{sector}"] = ranked

    print(f"award pairs:            {len(pairs):,}")
    if excluded:
        print(f"companies excluded:     {len(excluded):,} (recall set)")
    print(f"closed schemes dropped: {len(closed):,}")
    print(f"cells (country,sector): {len(out):,}")
    print(f"instruments represented:{len(seen):,}  (cap {CAP} companies each)")

    if not args.write:
        print("\n[report only] --write to persist")
        return
    OUT.write_text(json.dumps(out, indent=0, sort_keys=True) + "\n")
    print(f"\nwrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
