#!/usr/bin/env bash
# wsCU, re-run ON TOP OF wsCT.
#
# wsCT merged while this workstream was measuring, and it repaired the
# `entityCountries` comparator: the corpus encodes "must be established in X"
# with the country's ENGLISH NAME and `matchesAny` compared strings, so
# `["Denmark"]` was false for `["DK"]` and 51 of the 58 `VER-BLOCKED` deletions
# were an artefact of the replay's ISO codes. That fix moves the memo path
# directly and the screen path by about a point, so every figure this
# workstream measured on `d7c36ba7` is superseded for the memo and has to be
# re-established rather than carried forward.
#
# Re-run: the memo probe on both splits, and the blend's real-founder arm.
# The OLD (fictional-founder) controls are NOT re-run -- they exist to prove
# the harness reproduces wsCR/wsCS, they did, and wsCT has published the
# corrected memo baseline itself.
set -e
ROOT=/Users/asgermollergrimberg/Wincent/.claude/worktrees/wsCU-regain
OUT="$ROOT/project-mgmt/findings/regain_wsCU"
cd "$ROOT/website/frontend"
mkdir -p /tmp/wscu2

m () { name=$1; script=$2; shift 2; echo "=== $name ==="
  env "$@" npx tsx "scripts/$script" > "$OUT/$name.txt" 2>&1 || echo "FAILED $name"
  grep -aE "^ranker:|SCREEN@|MEMO@[56] |gain of the sixth|██|VER-BLOCKED|re-sort moves|tier 1 " "$OUT/$name.txt" || true
}

m CT_MEMO_tune _wscu_memo.ts SPLIT=tune    N=250
m CT_MEMO_hold _wscu_memo.ts SPLIT=holdout N=250

cut () { split=$1
  echo "=== cutting CT/$split ==="
  env SPLIT="$split" N=600 FEATURES_OUT="/tmp/wscu2/CT.$split.json" \
    npx tsx scripts/measure_signal_power.ts > "$OUT/SIGNALS_CT.$split.txt" 2>&1 \
    || echo "FAILED CT/$split"
  grep -aE "^ranker:|founder intake —" "$OUT/SIGNALS_CT.$split.txt" || true
}
cut tune
cut holdout
echo "=== blend CT ==="
TUNE=/tmp/wscu2/CT.tune.json HOLDOUT=/tmp/wscu2/CT.holdout.json \
  npx tsx scripts/fit_signal_blend.ts > "$OUT/BLEND_CT.txt" 2>&1 || echo "FAILED blend CT"
grep -aE "^founder|PAIRED|McNemar|blend x shipped|EXACT@5 blended|SHIPPED \(the|gains  spread|losses spread" "$OUT/BLEND_CT.txt" || true
echo "=== POST-wsCT DONE ==="
