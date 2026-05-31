#!/bin/bash
# Run SATR extraction for all remaining countries sequentially.
# Resumable: skips already-cached batches via the _index.jsonl.
# Stops only on Ctrl-C; per-country errors are caught and logged.
#
# Usage:
#   ./scripts/run_satr_all.sh                  # run remaining 19 (skip the 6 done)
#   ./scripts/run_satr_all.sh BG CY GR HU       # specific subset
#
# Country order is roughly small-to-large to fail fast on issues.

set -u
cd "$(dirname "$0")/.."

# 6 already done in overlap-audit phase: AT FI NL SE IT DE
# Remaining 19 EC-portal countries:
DEFAULT_COUNTRIES="MT CY EE LV LT LU BG IS HR SK SI HU CZ IE GR PT BE FR GB"

COUNTRIES="${@:-$DEFAULT_COUNTRIES}"

echo "Countries to run: $COUNTRIES"
echo "Start: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo

for c in $COUNTRIES; do
  echo "============================================================"
  echo "  Country: $c   (start: $(date +%H:%M:%S))"
  echo "============================================================"
  if python3 -m scripts.extract_satr --country "$c"; then
    echo "  $c: DONE"
  else
    echo "  $c: FAILED — continuing with next"
  fi
  echo
done

echo "Finished: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo
echo "Run \`python3 scripts/load_satr.py --staging --report\` to consolidate."
