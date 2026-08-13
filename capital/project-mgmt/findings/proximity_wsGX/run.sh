#!/usr/bin/env bash
# wsGX — does a PROXIMITY term in the order that feeds the POOL CUT move the
# one funnel?
#
# The question is NOT wsCV's. wsCV asked what the blend does to EXACT@5 on the
# screen and got a null. This asks what it does to `pool_cut` — the whole-pool
# to 40-row cut that the funnel of record prices at ~15 points, the largest
# reachability loss on the ladder. A better order there ranks nothing; it
# changes which rows the model is allowed to see.
#
# FREE. One Voyage embed and one Postgres read per founder, no model calls.
# `npm run stages` deletes ANTHROPIC_API_KEY at import.
#
# STRICTLY SEQUENTIAL, one harness at a time and nothing else on the machine.
# `semanticFundMatch` has a 3s statement timeout and drops silently to the
# lexical index, so two funnels sharing a box average two ranking systems and
# print one number. Every output below carries its own `ranker:` line, and
# `requireCleanRanker` refuses to write a run that fell back.
#
# ONE ARM PER PROCESS, because `POOL_BLEND` is read once at module scope in
# `poolBlend.ts` and cannot differ within a run.
#
#   off   what ships today — the baseline this workstream is judged against.
#   on    the fourteen-signal blend as the base score, everything downstream
#         (sibling reassignment, ticket multiplier, name collapse, peer
#         precedence, the caps) unchanged.
#   pure  the blend as the WHOLE row score. `on` minus `pure` is what the
#         machinery between the sort and the page costs.
#
# `npm run stages` writes `../../project-mgmt/findings/one_funnel/latest.md`
# and appends a point to `one_funnel/runs/`. An ARM run is not a measurement of
# the product, so its `latest.*` is copied here and the shipped pair is
# restored from git; its `runs/` point is moved here too. The banner this
# workstream added to `measure_funnel.ts` means a stray arm file could be
# identified even if this script were not run — belt and braces, because the
# file that gets quoted is `latest.md`.
set -u
ROOT=/Users/asgermollergrimberg/Wincent/.claude/worktrees/wsGX-proximity
OUT="$ROOT/project-mgmt/findings/proximity_wsGX"
FUNNEL="$ROOT/project-mgmt/findings/one_funnel"
cd "$ROOT/website/frontend" || exit 1
mkdir -p "$OUT"

# The per-founder traces are PAIRED across arms — same draw, same order, checked
# by the draw fingerprint — and each carries the REGIME of a fund a real company
# really won. `measure_funnel` refuses to write one inside the tree, so they land
# in the scratchpad and only AGGREGATE concentration figures reach the finding.
TRACE=/private/tmp/claude-501/-Users-asgermollergrimberg-Wincent/1f599910-047b-4d24-8947-cb1c67ef6560/scratchpad/wsgx

# `prox` is the ROW_PROXIMITY arm and every other name is a POOL_BLEND arm. The
# two flags REFUSE to be set together (`assertOneOrdering`), so the arm name is
# translated here once rather than at each call site.
stages () { arm=$1
  echo "=== stages arm=$arm  $(date -u +%FT%TZ) ==="
  before=$(ls "$FUNNEL/runs" 2>/dev/null | wc -l)
  # An arm NAME is not a flag VALUE. `off2` is a repeat of the shipped arm under
  # a distinct name so its outputs do not overwrite the first one's, and passing
  # it through as POOL_BLEND=off2 is what the first attempt did -- caught at
  # import by `parsePoolBlend`, which is exactly the throw it exists for.
  case "$arm" in
    prox) blend=off;   prox=first ;;
    off2) blend=off;   prox=off   ;;
    *)    blend=$arm;  prox=off   ;;
  esac
  env POOL_BLEND="$blend" ROW_PROXIMITY="$prox" FUNNEL_TRACE="$TRACE/trace_$arm.jsonl" \
    npm run stages > "$OUT/STAGES_$arm.txt" 2>&1 \
    || echo "FAILED stages $arm"
  cp "$FUNNEL/latest.md"   "$OUT/FUNNEL_$arm.md"   2>/dev/null
  cp "$FUNNEL/latest.json" "$OUT/FUNNEL_$arm.json" 2>/dev/null
  if [ "$arm" != "off" ]; then
    # Move this arm's history point out of the product's series.
    after=$(ls "$FUNNEL/runs" 2>/dev/null | wc -l)
    if [ "$before" -ne "$after" ]; then
      newest=$(ls -t "$FUNNEL/runs" | head -1)
      mv "$FUNNEL/runs/$newest" "$OUT/run_$arm.json"
    fi
    git -C "$ROOT" checkout -- \
      project-mgmt/findings/one_funnel/latest.md \
      project-mgmt/findings/one_funnel/latest.json 2>/dev/null
  fi
  grep -aE "^ranker:|row_order=|pool_cut|and it is in the first 5" "$OUT/STAGES_$arm.txt" | head -8
}

for arm in "$@"; do stages "$arm"; done
echo "=== wsGX STAGES DONE $(date -u +%FT%TZ) ==="
