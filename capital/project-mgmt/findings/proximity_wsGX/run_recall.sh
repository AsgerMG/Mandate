#!/usr/bin/env bash
# wsGX — the REGIME@5 / CHANNEL@5 trade, which EXACT@5 alone cannot show.
#
# The standing warning is wsBU's un-clipping arm: +0.7 EXACT@5 while costing 6
# points of REGIME@5 and 6 of CHANNEL@5, and 98% -> 83% REGIME@5 on exact
# attribution. So any arm that changes what the pool cut keeps has to be read on
# all three, and `measure_funnel` deliberately does not carry REGIME (it credits
# a SIBLING of the won fund, which breaks the nesting the ladder rests on).
# `measure_recall` is the harness that does.
#
# FREE — one Voyage embed and one Postgres read per pair, no model calls.
# STRICTLY SEQUENTIAL, for the same reason as run.sh: two harnesses on one box
# average two rankers and print one number. Read the `ranker:` line on each.
#
# Holdout, N=600, the population wsCS/wsCU/wsCV all reported on, so this table
# is comparable with the one in ship_blend_wsCV/ rather than merely adjacent to it.
set -u
ROOT=/Users/asgermollergrimberg/Wincent/.claude/worktrees/wsGX-proximity
OUT="$ROOT/project-mgmt/findings/proximity_wsGX"
cd "$ROOT/website/frontend" || exit 1
mkdir -p "$OUT"

recall () { arm=$1
  echo "=== recall POOL_BLEND=$arm  $(date -u +%FT%TZ) ==="
  env POOL_BLEND="$arm" SPLIT=holdout N=600 \
    npx tsx scripts/measure_recall.ts > "$OUT/RECALL_$arm.txt" 2>&1 \
    || echo "FAILED recall $arm"
  grep -aE "^  ranker:|EXACT scheme in top 5|same REGIME in top 5|same CHANNEL in top 5|in pool" \
    "$OUT/RECALL_$arm.txt" || true
}

for arm in "$@"; do recall "$arm"; done
echo "=== wsGX RECALL DONE $(date -u +%FT%TZ) ==="
