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
#
# Known fragility, measured and left alone: this truncates at the first CAP
# pairs the scan returns, so WHICH cells a large instrument lands in is decided
# by row order rather than by its recipients. Spending the same budget
# proportionally instead (weight = min(1, CAP/pairs)) is the principled form and
# was tried: holdout in-cell recall rose 154 -> 172 but the won fund's REGIME
# left the cell's top five nine times more often (165 -> 156), because
# proportional weighting lets a fund with two thousand awards outrank one with
# eighty in every cell it touches -- which is the exact behaviour the cap exists
# to prevent. Reverted. If this is revisited, the fix is a per-cell floor on
# distinct recipients, not a different cap shape.
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
#
# ── The 227 instruments this join cannot see, and why it still ships ────────
# `scheme_code = call_id` is not the split `populate_funding_instruments.py`
# performs, and the gap is not small. That script splits a rollup two ways:
#
#   programme child   (fam, programme_name)              scheme_code = ''
#   scheme child      (fam, call_id, granting_authority) scheme_code = call_id
#
# The 227 PROGRAMME children -- ADEME 75, BDNS 87, Vinnova 49, Innovate UK 16 --
# carry an EMPTY scheme_code by construction, because their identity IS the
# programme name. They therefore never join here, and the prior cannot propose
# them at all. Four of the five largest sibling groups in the corpus are
# invisible to the strongest ranking signal the product has. Separately,
# `scheme_code` is shared by more than one instrument in 34 cases (SA.56245 by
# 18), so an award credits every delivery body of its notified scheme rather
# than the one that signed it.
#
# The corrected attribution was built and measured (2026-08-06), reproducing the
# ETL split exactly via funding_instrument_sources -> fam, then programme name,
# then (call_id, granting_authority). It reaches all 227 children and credits
# 990 instruments instead of 537. On holdout, N=200:
#
#   shipped join                          EXACT@5 32%   REGIME@5 87%
#   exact attribution                     EXACT@5 29%   REGIME@5 81%
#   exact + order-independent cap         EXACT@5 31%   REGIME@5 81%
#   exact + credit the notified scheme    EXACT@5 30%   REGIME@5 77%
#
# The reason is in the ground truth, not in the ranking: **0 of 1,988 recall
# pairs name a programme-split child.** `__recallSet.json` is traced from award
# history that resolves to SATR and EU leaves; ADEME, BDNS, Vinnova and Innovate
# UK children are never the answer. So every slot the corrected join gives them
# in a cell's top 30 is taken from a fund the harness CAN credit, and the
# measurement can only ever read the fix as a loss. Offline confirmation, over
# twelve build variants (cap by truncation or by scaling, with and without
# collapsing repeat recipients): making the children visible costs ~15 of 200 on
# "won fund in the cell's top five" every time, and no cap shape recovers it.
#
# This is the same shape as the audit's finding on `national_dev_banks` -- 12%
# of shown rows, 0% of ground truth. It is a MEASUREMENT gap, not a ranking one,
# and it must be closed by tracing ADEME/BDNS/Vinnova/Innovate UK awards into
# the recall set. Until then the corrected join cannot be shipped against a rule
# that says do not reduce EXACT@5, and shipping it blind would trade a real
# number for an unobservable one. The working implementation is recorded in this
# file's history; do not re-derive it from scratch.
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

    # Never rank a fund the founder could not be shown anyway.
    #
    # Each cell keeps KEEP entries and `applyPeerPrecedence` can only reorder
    # rows the screen already admitted, so an entry the shortlist can never
    # produce is not neutral -- it is one of thirty slots spent saying nothing.
    # Three classes qualify, and they are the same three `publishableInstruments()`
    # removes for the same reasons:
    #   - closed to new applicants (scheme_end_date in the past);
    #   - a FRAMEWORK record, which is a legal basis and not a fund;
    #   - a regime with children, which is the rollup a founder cannot apply to.
    # The last two were 10% of all entries in the shipped artifact. Note that
    # Q_EU joins through the source map and therefore returns exactly those
    # parent regimes, which is why the share is that high.
    unproposable = {r[0] for r in conn.execute(
        "SELECT id FROM funding_instruments "
        " WHERE (scheme_end_date IS NOT NULL AND scheme_end_date < date('now'))"
        "    OR is_framework = 1"
        "    OR id IN (SELECT parent_id FROM funding_instruments "
        "               WHERE parent_id IS NOT NULL)")}

    seen: collections.Counter = collections.Counter()
    prior: dict[tuple[str, str], collections.Counter] = collections.defaultdict(collections.Counter)
    for name, country, sector, iid in pairs:
        if name in excluded or iid in unproposable:
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
    print(f"unproposable dropped:   {len(unproposable):,}")
    print(f"cells (country,sector): {len(out):,}")
    print(f"instruments represented:{len(seen):,}  (cap {CAP} companies each)")

    if not args.write:
        print("\n[report only] --write to persist")
        return
    OUT.write_text(json.dumps(out, indent=0, sort_keys=True) + "\n")
    print(f"\nwrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
