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
history, so the two must not share companies. Every company in EVERY
`__recallSet*.json` is dropped before counting, which is what makes the 43% an
honest out-of-sample number rather than the model reciting its own training
data. All of them, not the shipped one: a test set added later would otherwise
grade the model on its own training data and nothing would say so.

That rule now lives in `ETL/lib/recall_holdout.py` and is applied BY DEFAULT
rather than behind `--exclude-recall-set`. Both changes are the same finding:
this artifact once shipped built without the flag and the evaluation read its
own answer key for weeks, and the identical idea copied into
emit_region_prior.py named two sets in a tuple literal and silently stopped
covering the other three. One definition, discovered not enumerated, on by
default. `--exclude-recall-set` is still accepted and now says nothing new.

Usage:
  python3 ETL/terms/emit_peer_prior.py                        # report
  python3 ETL/terms/emit_peer_prior.py --write                # leak-free
  python3 ETL/terms/emit_peer_prior.py --write --include-recall-set
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

from attribution import Split  # noqa: E402
from recall_holdout import add_holdout_flags, resolve_holdout  # noqa: E402

OUT = ROOT / "website" / "frontend" / "lib" / "intelligence" / "peerPrior.generated.json"

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

# ── How an award is credited to a fund ─────────────────────────────────────
# `attribution.Split` reproduces the ETL's own split -- source -> family, then
# programme name, then (call_id, granting authority) -- and is shared with
# `extend_recall_set.py` so the prior and the ground truth cannot disagree about
# which fund a company won.
#
# It replaced two approximations, both wrong in ways that mattered:
#
#   `scheme_code = call_id`   cannot reach a PROGRAMME child. Such a child's
#                             identity IS the programme name, so it carries an
#                             empty scheme_code by construction: 299
#                             instruments, including four of the five largest
#                             sibling groups in the corpus (ADEME 75, BDNS 87,
#                             Vinnova 49, Innovate UK 16), were invisible to the
#                             strongest ranking signal the product has. And 34
#                             scheme codes are shared by more than one
#                             instrument (SA.56245 by 18), so an award credited
#                             every delivery body of its notified scheme rather
#                             than the one that signed it.
#   the source map alone      returns PARENT regimes, which are exactly the
#                             rollups a founder cannot apply to, and which the
#                             `unproposable` filter below then throws away. That
#                             is the defect that once made 63% of the recall set
#                             Horizon.
#
# `Split.credit` widens rather than guesses when the split cannot place an
# award: a scheme child exists only above MIN_CHILD_EVENTS, so 82% of awards --
# overwhelmingly SATR -- have no child of their own. Those fall back to every
# instrument sharing the notified scheme code, which is exactly what the old
# join did, and only then to the family. So this is a STRICT SUPERSET of the
# signal that shipped: 723 instruments credited against 491, with nothing
# dropped. Crediting only the exact leaf and discarding the rest was tried and
# is much worse -- it places 54k of 308k awards and throws away most of SATR.
#
# WHY THIS COULD NOT SHIP BEFORE. It measured 29% against 32% on
# `__recallSet.json` -- and the reason was in the ground truth, not the ranking:
# 0 of 1,988 pairs named a programme-split child, so every slot the corrected
# join won for those funds was taken from a fund the harness could credit. The
# measurement could only ever read the fix as a loss. That gap is closed
# (`extend_recall_set.py`, `__recallSetPlus.json`) and the numbers are in this
# file's commit.
QUERY = """
    SELECT co.canonical_name, co.country, COALESCE(co.sector_top,'other'),
           e.source, e.programme_name, e.granting_authority, e.call_id
      FROM public_funding_events e
      JOIN companies co ON co.id = e.company_id
     WHERE e.is_duplicate = 0 AND co.country IS NOT NULL
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--notified-scheme-too", action="store_true",
                    help="credit an award to its exact leaf AND every sibling "
                         "delivering the same notified scheme")
    ap.add_argument("--add-only", action="store_true",
                    help="keep the old crediting bit-for-bit and only ADD the "
                         "programme children it could never see")
    add_holdout_flags(ap)
    args = ap.parse_args()

    conn = sqlite3.connect(DB)
    split = Split(conn)
    pairs = []
    unplaceable = 0
    if args.add_only:
        # THE CONTROL, and the reason it exists: `seen[iid] >= CAP` truncates at
        # the first CAP rows the scan returns, so WHICH cells a large instrument
        # lands in is decided by row order. Changing the join changes the order
        # and therefore moves cells that have nothing to do with the fix. This
        # mode replays the old crediting in the old order -- every instrument
        # sharing the notified scheme, then the source map -- so the legacy
        # instruments' cell counts are bit-identical, and only then appends the
        # programme children the old join could not see. Any difference it
        # measures is the addition, not the reshuffle.
        rows = list(conn.execute(QUERY))
        for name, country, sector, source, _p, _b, call in rows:
            for iid in split.code2inst.get((call or "").strip(), []):
                pairs.append((name, country, sector, iid))
        for name, country, sector, source, _p, _b, _c in rows:
            for iid in split.families(source):
                pairs.append((name, country, sector, iid))
        for name, country, sector, source, prog, body, call in rows:
            leaf = split.leaf_for(source, prog, body, call)
            # A programme child is exactly what the old join could not reach:
            # its identity is the programme name, so it has no scheme code to
            # join on. A scheme child already had one and is left alone here.
            if leaf and not (split.inst_scheme_code.get(leaf) or ""):
                pairs.append((name, country, sector, leaf))
            elif leaf is None:
                unplaceable += 1
    else:
        for name, country, sector, source, prog, body, call in conn.execute(QUERY):
            credited = split.credit(source, prog, body, call,
                                    always_notified_scheme=args.notified_scheme_too)
            if credited[:1] != [split.leaf_for(source, prog, body, call)]:
                unplaceable += 1
            for iid in credited:
                pairs.append((name, country, sector, iid))

    # Every company in EVERY graded test set, not just the shipped one, and
    # discovered by glob rather than named -- see ETL/lib/recall_holdout.py for
    # both failures that rule was written from.
    holdout = resolve_holdout(args)
    excluded = holdout.names

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
    # The last two were 10% of all entries when the join was the source map,
    # which returns exactly those parent regimes. Under the corrected
    # attribution they are only what the split could not place.
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
    print(f"awards with no exact leaf:  {unplaceable:,} "
          f"(credited to the notified scheme instead)")
    holdout.report()
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
