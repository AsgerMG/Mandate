#!/usr/bin/env bash
# wsCV -- the blend, END TO END, on the path that publishes.
#
# wsCU scored the blend as a PURE POOL RE-ORDERING and got +6.0 EXACT@5. That
# number has no channel cap, no dedupe, no sibling reassignment, no ticket
# multiplier and no peer precedence in it, and every one of those runs between
# the row sort and the founder's screen. A previous arm on this path bought
# +0.7 EXACT while losing 6 REGIME and 6 CHANNEL, so EXACT@5 alone cannot say
# whether an arm is a gain.
#
# SEQUENTIAL, one harness at a time and nothing else on the machine. Two
# 600-pair harnesses sharing a box is how `check_recall_floor` printed 87% and
# then 96% on identical inputs: `semanticFundMatch` has a 3s connect and a 3s
# statement timeout and drops silently to the lexical index, so a loaded run
# averages two ranking systems and prints one number. Every output below
# carries its own `ranker:` line and its own founder intake.
#
# THREE ARMS:
#   off   what ships today.
#   on    the blend as the base score, everything downstream unchanged.
#   pure  the blend as the WHOLE row score -- wsCU's own arm, reproduced on the
#         production path. `on` minus `pure` is what the machinery costs.
#
# HOLDOUT IS READ ONCE. The weights are wsCU's, fitted on tune, and nothing in
# this workstream refits them; the tune runs exist to show the arm behaves the
# same way on the split its weights came from, not to choose anything.
set -e
ROOT=/Users/asgermollergrimberg/Wincent/.claude/worktrees/wsCV-ship-blend
OUT="$ROOT/project-mgmt/findings/ship_blend_wsCV"
cd "$ROOT/website/frontend"
mkdir -p "$OUT"

# The founder is left at the resolver's defaults, which ARE the blend's founder:
# identity=real own-history=withheld capital=withheld answers=off consortium=yes.
# Set nothing, so nothing can disagree with BLEND_CT.txt by accident.

recall () { arm=$1; split=$2
  echo "=== recall $arm/$split ==="
  env POOL_BLEND="$arm" SPLIT="$split" N=600 \
    npx tsx scripts/measure_recall.ts > "$OUT/RECALL_$arm.$split.txt" 2>&1 \
    || echo "FAILED recall $arm/$split"
  grep -aE "^  ranker:|EXACT scheme|same REGIME|same CHANNEL" "$OUT/RECALL_$arm.$split.txt" || true
}

memo () { arm=$1; split=$2
  echo "=== memo $arm/$split ==="
  env POOL_BLEND="$arm" SPLIT="$split" N=250 \
    npx tsx scripts/_wscu_memo.ts > "$OUT/MEMO_$arm.$split.txt" 2>&1 \
    || echo "FAILED memo $arm/$split"
  grep -aE "^ranker:|^  ranker:|MEMO@6|SCREEN@6" "$OUT/MEMO_$arm.$split.txt" || true
}

for split in tune holdout; do
  for arm in off on pure; do recall "$arm" "$split"; done
done
for split in tune holdout; do
  for arm in off on; do memo "$arm" "$split"; done
done
echo "=== wsCV MEASUREMENT DONE ==="
