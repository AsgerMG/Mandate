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

── Regenerating this is not free ──────────────────────────────────────────
The artifact is a rendering of a corpus that moves, so a correct rebuild can
still be a ranking regression -- one did, and cost ten graded cases. The two
kinds of evidence are therefore ranked separately (see INTERLEAVE) so the shape
of a cell no longer depends on what fraction of the corpus happens to be
placeable, and `npx tsx scripts/check_peer_prior_canary.ts` scores the rebuilt
file against the answer key in under a second with no credentials. RUN IT.

Usage:
  python3 ETL/terms/emit_peer_prior.py                        # report
  python3 ETL/terms/emit_peer_prior.py --write                # leak-free
  python3 ETL/terms/emit_peer_prior.py --write --include-recall-set
  python3 ETL/terms/emit_peer_prior.py --unattributable blended   # the control
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402
from liveness import closed_sql  # noqa: E402

import argparse  # noqa: E402
import collections  # noqa: E402
import itertools  # noqa: E402
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
# Ranked funds kept per cell PER KIND OF EVIDENCE -- see INTERLEAVE below. The
# table shows five and the ranker holds one slot, so four are consumed; the rest
# are headroom for funds the founder's own screen has already excluded from the
# pool.
KEEP = 30

# ── What an award that cannot be placed on a leaf is allowed to do ─────────
#
# THE FAILURE THIS ENCODES. This file is regenerated from the corpus, and on
# 2026-08-08 a correct regeneration cost ten cases: `check_recall_floor` fell to
# 81.8% on `traced:exact_attribution` against an 84 floor. Nothing about the
# generator had changed and the artifact was a faithful rendering of the corpus
# -- `emit_peer_prior.py --write` reproduces the committed file. What moved was
# the corpus underneath it: 272,307 of 492,319 award pairs no longer resolve to
# an exact leaf, so `Split.credit` widened them to the notified scheme, and
# those rollups took 34% -> 44% of the prior's slots and pushed out the ADEME
# and EIS leaves the answer key names.
#
# So the defect is not the artifact and not the corpus. It is that this file
# RANKED TWO KINDS OF EVIDENCE IN ONE COLUMN. "Company X won ADEME's
# autoconsommation aid" and "company Y won something under SA.56245, delivered
# by one of eighteen bodies, we cannot tell which" were both a +1, and the
# second kind is now nine awards in ten. A count that mixes them measures how
# much of the corpus is unplaceable, not what companies like this one win.
#
# THE PROPERTY. Exact and inferred evidence are ranked SEPARATELY and neither
# may monopolise the cell. `KEEP` entries of each kind, alternating, so the top
# of every cell is half exact leaves and half notified-scheme inference however
# the placement rate moves. A future corpus that places 5% of awards or 95% of
# them produces the same shape here, which is exactly what the regenerate-on-
# refresh cycle needs and what a single blended count could never give.
#
# MEASURED, by `website/frontend/scripts/check_peer_prior_canary.ts` over two
# committed JSONs -- the share of answer-key pairs whose REGIME appears in the
# first five entries of their own `country|sector` cell, tune split, n=1,161
# and n=818, no sampling and no credentials:
#
#                              exact_attribution   original join
#     pre-merge artifact             97.4               71.9
#     blended count (the bug)        92.7               79.3
#     exact-first, then inferred     98.7               69.3
#     INTERLEAVED                    98.3               81.3
#     inferred dropped entirely      94.0               52.9
#
# Dropping is the wrong shape and the table says why: only 241 leaves exist
# corpus-wide, 113 of them unproposable, so 185 of 260 cells would hold nothing
# at all. Exact-first fixes the population that regressed and spends the other
# one to do it. Interleaving is the only row that beats the PRE-MERGE artifact
# on the population that broke and on the one that did not, at once.
#
# Confirmed on the graded metric, `check_recall_floor` at its pinned seed:
# REGIME@5 on traced:exact_attribution 82% -> 94% (floor 84), original join
# 86% -> 89% (floor 70), headline 84% -> 91%, EXACT@5 27% -> 29%, pool 98%
# unmoved. Three seeds in the commit message.
INTERLEAVE = "interleave"
EXACT_FIRST = "exact-first"
BLENDED = "blended"
DROP = "drop"

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
    ap.add_argument("--out", default=None,
                    help="write somewhere other than the shipped artifact; used "
                         "to MEASURE a corpus correction before Railway is "
                         "written, never to ship one")
    # ── The evidence property, applied to the cell key ──────────────────────
    # A peer-prior cell is `country|sector`, and the sector is the RECIPIENT's
    # `sector_top`. So this artifact inherits the taxonomy wholesale: while a
    # Bavarian film scheme's recipients read as software_data_ai, that scheme
    # sits in the DE|software_data_ai cell, and `applyPeerPrecedence` puts it
    # ahead of anything peer-unknown however well the unknown scored. Correcting
    # `sector_mix` cannot touch that -- the artifact has no mix column.
    #
    # Off by default: once the correction lands in `companies.sector_top` this
    # flag is unnecessary, because the query below already reads that column.
    # It exists so the end-to-end effect can be measured first.
    ap.add_argument("--evidence-veto", action="store_true",
                    help="apply ETL/events/transform/classify_taxonomy.py's "
                         "technology_veto to each recipient's sector before "
                         "keying its cell")
    ap.add_argument("--notified-scheme-too", action="store_true",
                    help="credit an award to its exact leaf AND every sibling "
                         "delivering the same notified scheme")
    ap.add_argument("--add-only", action="store_true",
                    help="keep the old crediting bit-for-bit and only ADD the "
                         "programme children it could never see")
    ap.add_argument("--unattributable", default=INTERLEAVE,
                    choices=[INTERLEAVE, EXACT_FIRST, BLENDED, DROP],
                    help="how an award with no exact leaf may rank against one "
                         "that has one; see the block above the constants. The "
                         "three non-default values are the controls the default "
                         "was measured against, kept so the next corpus refresh "
                         "can re-measure rather than re-argue.")
    add_holdout_flags(ap)
    args = ap.parse_args()

    conn = sqlite3.connect(DB)
    veto: set[str] = set()
    if args.evidence_veto:
        _sys.path.insert(0, str(ROOT / "ETL" / "events" / "transform"))
        from apply_sector_evidence import vetoed_companies  # noqa: E402
        ids = set(vetoed_companies(conn))
        veto = {n for (i, n) in conn.execute(
            "SELECT id, canonical_name FROM companies") if i in ids}
        print(f"evidence veto: {len(veto):,} recipients re-keyed to `other`")
    split = Split(conn)
    # (name, country, sector, instrument, exact) -- `exact` is the whole point:
    # it is what lets the two kinds of evidence be ranked in separate columns
    # instead of summed into one. See INTERLEAVE.
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
        if veto:
            # A recipient whose every official activity descriptor names a
            # non-technology activity keys the `other` cell, not the technology
            # one it was labelled with. Nothing is dropped -- the award still
            # counts, in the cell its recipient actually belongs to.
            rows = [(n, c, ("other" if n in veto else sec)) + rest
                    for (n, c, sec, *rest_l) in rows
                    for rest in [tuple(rest_l)]]
        for name, country, sector, source, _p, _b, call in rows:
            for iid in split.code2inst.get((call or "").strip(), []):
                pairs.append((name, country, sector, iid, False))
        for name, country, sector, source, _p, _b, _c in rows:
            for iid in split.families(source):
                pairs.append((name, country, sector, iid, False))
        for name, country, sector, source, prog, body, call in rows:
            leaf = split.leaf_for(source, prog, body, call)
            # A programme child is exactly what the old join could not reach:
            # its identity is the programme name, so it has no scheme code to
            # join on. A scheme child already had one and is left alone here.
            if leaf and not (split.inst_scheme_code.get(leaf) or ""):
                pairs.append((name, country, sector, leaf, True))
            elif leaf is None:
                unplaceable += 1
    else:
        for name, country, sector, source, prog, body, call in conn.execute(QUERY):
            leaf = split.leaf_for(source, prog, body, call)
            credited = split.credit(source, prog, body, call,
                                    always_notified_scheme=args.notified_scheme_too)
            if leaf is None:
                unplaceable += 1
            for iid in credited:
                # An award is EXACT evidence only for the one instrument the
                # split actually placed it on. Under --notified-scheme-too the
                # co-delivered siblings ride along on the same award and are
                # inference, not placement, which is the distinction the whole
                # ranking below turns on.
                pairs.append((name, country, sector, iid, iid == leaf))

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
    #   - closed to new applicants, by the ONE liveness test in
    #     ETL/lib/liveness.py -- a past end date closes a row only
    #     according to what that date is (a call deadline, or a notified
    #     duration that award activity has not overruled);
    #   - a FRAMEWORK record, which is a legal basis and not a fund;
    #   - a regime with children, which is the rollup a founder cannot apply to.
    # The last two were 10% of all entries when the join was the source map,
    # which returns exactly those parent regimes. Under the corrected
    # attribution they are only what the split could not place.
    unproposable = {r[0] for r in conn.execute(
        "SELECT id FROM funding_instruments "
        f" WHERE {closed_sql()}"
        "    OR is_framework = 1"
        "    OR id IN (SELECT parent_id FROM funding_instruments "
        "               WHERE parent_id IS NOT NULL)")}

    # ONE cap across both columns, deliberately. CAP is a statement about an
    # instrument -- "at most forty companies of yours may speak for you" -- and
    # it would stop being one if a fund could spend forty as a placed leaf and
    # forty more as an inferred sibling. It also keeps the scan-order fragility
    # documented at CAP to exactly the size it already was.
    seen: collections.Counter = collections.Counter()
    exact_cells: dict[tuple[str, str], collections.Counter] = \
        collections.defaultdict(collections.Counter)
    inferred_cells: dict[tuple[str, str], collections.Counter] = \
        collections.defaultdict(collections.Counter)
    # Which (cell, instrument) an award was actually PLACED on, tracked
    # separately from the ranking columns so the share reported at the end
    # means the same thing under every policy -- including BLENDED, which by
    # construction files everything in one column.
    placed_anywhere: set[tuple[tuple[str, str], str]] = set()
    for name, country, sector, iid, is_exact in pairs:
        if name in excluded or iid in unproposable:
            continue
        if args.unattributable == DROP and not is_exact:
            continue
        if seen[iid] >= CAP:
            continue
        seen[iid] += 1
        if is_exact:
            placed_anywhere.add(((country, sector), iid))
        column = exact_cells if is_exact or args.unattributable == BLENDED \
            else inferred_cells
        column[(country, sector)][iid] += 1

    out: dict[str, list[str]] = {}
    inferred_slots = total_slots = 0
    for cell in set(exact_cells) | set(inferred_cells):
        exact = [iid for iid, _ in exact_cells[cell].most_common(KEEP)]
        placed = set(exact)
        inferred = [iid for iid, _ in inferred_cells[cell].most_common(KEEP)
                    if iid not in placed]
        if args.unattributable == INTERLEAVE:
            # Alternate, so neither kind of evidence can take the visible slots
            # from the other however the corpus's placement rate moves. Whichever
            # column runs out first, the rest of the other simply follows.
            ranked = [iid for pair in itertools.zip_longest(exact, inferred)
                      for iid in pair if iid is not None]
        else:
            # BLENDED puts everything in `exact` by construction above, so this
            # one branch is also the legacy single-column behaviour.
            ranked = exact + inferred
        if ranked:
            out[f"{cell[0]}|{cell[1]}"] = ranked
            total_slots += len(ranked)
            inferred_slots += sum(1 for iid in ranked
                                  if (cell, iid) not in placed_anywhere)

    print(f"award pairs:            {len(pairs):,}")
    print(f"awards with no exact leaf:  {unplaceable:,} "
          f"({args.unattributable})")
    holdout.report()
    print(f"unproposable dropped:   {len(unproposable):,}")
    print(f"cells (country,sector): {len(out):,}")
    print(f"instruments represented:{len(seen):,}  (cap {CAP} companies each)")
    # How much of this artifact is inference rather than placement. It is 88%
    # under BLENDED today, and it was a far smaller share on the corpus this
    # file was calibrated against -- that RISE, on a regeneration nobody had
    # changed, is the whole regression. Printed every run so the next corpus
    # move is visible in the generator's own output before a floor has to catch
    # it. Under INTERLEAVE the number is descriptive rather than dangerous: the
    # top of a cell alternates regardless of what this reads.
    print(f"slots held by inference:{inferred_slots:,} of {total_slots:,} "
          f"({100 * inferred_slots / max(total_slots, 1):.0f}%)")

    if not args.write:
        print("\n[report only] --write to persist")
        return
    dest = _Path(args.out) if args.out else OUT
    dest.write_text(json.dumps(out, indent=0, sort_keys=True) + "\n")
    print(f"\nwrote {dest}")


if __name__ == "__main__":
    main()
