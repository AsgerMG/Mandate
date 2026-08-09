#!/usr/bin/env bash
# wsCU section 1 -- the blend, re-measured against a founder who exists.
#
# SEQUENTIAL, one harness at a time and nothing else on the machine. Two
# 600-pair harnesses sharing a box is how `check_recall_floor` printed 87% and
# then 96% on identical inputs: `semanticFundMatch` has a 3s connect and a 3s
# statement timeout and drops silently to the lexical index, so a loaded run
# averages two ranking systems and prints one number. Every dump below carries
# its own `ranker:` line and every one is checked before it is fitted.
#
# THREE ARMS, ONE VARIABLE AT A TIME:
#   OLD    exactly what wsCS fitted on -- "TestCo", pinned capitalSought,
#          `usedInField` false on every row. The control: if the +5.0 does not
#          reproduce here, the comparison below is not about the founder.
#   NEW    identity=real, own history WITHHELD, capitalSought neutral. One
#          change from OLD, and it is the change wsCQ made.
#   STRICT NEW plus per-founder ticket and region derived under the
#          `other_scheme` guard -- wsCQ's own headline founder (A3_new).
set -e
ROOT=/Users/asgermollergrimberg/Wincent/.claude/worktrees/wsCU-regain
OUT="$ROOT/project-mgmt/findings/regain_wsCU"
cd "$ROOT/website/frontend"
mkdir -p /tmp/wscu

cut () {  # cut <tag> <split> <env...>
  tag=$1; split=$2; shift 2
  echo "=== cutting $tag/$split ==="
  env "$@" SPLIT="$split" N=600 FEATURES_OUT="/tmp/wscu/$tag.$split.json" \
    npx tsx scripts/measure_signal_power.ts > "/tmp/wscu/$tag.$split.txt" 2>&1 \
    || { echo "FAILED $tag/$split"; tail -5 "/tmp/wscu/$tag.$split.txt"; }
  grep -aE "^ranker:|founder intake —" "/tmp/wscu/$tag.$split.txt" || true
}

OLD="IDENTITY=anonymous OWN_HISTORY=withheld CAPITAL=pinned ANSWERS=off"

cut OLD    tune    $OLD
cut OLD    holdout $OLD
cut NEW    tune    IDENTITY=real OWN_HISTORY=withheld CAPITAL=withheld ANSWERS=off
cut NEW    holdout IDENTITY=real OWN_HISTORY=withheld CAPITAL=withheld ANSWERS=off
cut STRICT tune    IDENTITY=real OWN_HISTORY=withheld CAPITAL=withheld ANSWERS=strict
cut STRICT holdout IDENTITY=real OWN_HISTORY=withheld CAPITAL=withheld ANSWERS=strict

for tag in OLD NEW STRICT; do
  echo "=== blend $tag ==="
  TUNE="/tmp/wscu/$tag.tune.json" HOLDOUT="/tmp/wscu/$tag.holdout.json" \
    npx tsx scripts/fit_signal_blend.ts > "$OUT/BLEND_$tag.txt" 2>&1 \
    || { echo "FAILED blend $tag"; tail -5 "$OUT/BLEND_$tag.txt"; }
  cp "/tmp/wscu/$tag.tune.txt"    "$OUT/SIGNALS_$tag.tune.txt"
  cp "/tmp/wscu/$tag.holdout.txt" "$OUT/SIGNALS_$tag.holdout.txt"
done
echo "=== BLEND ALL DONE ==="
