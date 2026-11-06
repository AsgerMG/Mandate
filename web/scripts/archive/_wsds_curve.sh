#!/usr/bin/env bash
# wsDS — THE THINKING CURVE. One lever, four settings, one founder set.
#
# `_wscu_memo.ts` is the ONLY harness at HEAD wired to the memo seam, so it is
# the only one whose numbers move with AGENT_SELECT at all. measure_recall.ts
# and check_recall_floor.ts grade `computeVerdict`, which the seam left when
# wsDL moved it -- they would return the CONTROL's numbers under any arm, which
# is precisely the failure this workstream exists to stop repeating.
#
# The metric is MEMO@5 / MEMO@6: the won leaf's rank in the order handed to the
# writer. SCREEN@5 / SCREEN@6 print alongside from `computeVerdict` and are
# arm-INDEPENDENT by construction, so they are the run's own drift check: if
# they move between two levels, the corpus moved between two processes and no
# difference in MEMO@k can be attributed to thinking.
#
# STRICTLY SEQUENTIAL, and that is not politeness. Two harnesses at once starve
# `semanticFundMatch`'s 3s timeout, it drops to the lexical index, and the same
# gate has printed 87% and then 96% on identical inputs. A curve assembled from
# concurrent runs measures contention.
#
#   bash scripts/_wsds_curve.sh
set -uo pipefail

N="${N:-36}"
SPLIT="${SPLIT:-tune}"
OUTDIR="$(cd "$(dirname "$0")/../../capital" && pwd)/project-mgmt/findings/dark_levers_wsDS"
mkdir -p "$OUTDIR/curve"

for EFFORT in off low medium high; do
  echo "════════ effort=$EFFORT  N=$N  split=$SPLIT ════════"
  AGENT_SELECT=adviser \
  AGENT_SELECT_EFFORT="$EFFORT" \
  SPLIT="$SPLIT" N="$N" \
  OUT="$OUTDIR/curve/pairs_$EFFORT.json" \
    npx tsx scripts/_wscu_memo.ts 2>&1 | tee "$OUTDIR/curve/$EFFORT.txt"
  echo
done

echo "════════ THE CURVE ════════"
for EFFORT in off low medium high; do
  F="$OUTDIR/curve/$EFFORT.txt"
  [ -f "$F" ] || continue
  echo "-- effort=$EFFORT"
  grep -E "MEMO@5|MEMO@6|SCREEN@5|SCREEN@6|agent-select:|^ranker:" "$F" | sed 's/^/   /'
done
