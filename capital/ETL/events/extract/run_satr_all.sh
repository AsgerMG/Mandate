#!/bin/bash
# Run SATR extraction for all remaining countries sequentially.
# Resumable: skips already-cached batches via the _index.jsonl.
# Stops only on Ctrl-C; per-country errors are caught and logged.
#
# Usage:
#   ./ETL/events/extract/run_satr_all.sh                  # run remaining 19 (skip the 6 done)
#   ./ETL/events/extract/run_satr_all.sh BG CY GR HU       # specific subset
#
# Country order is roughly small-to-large to fail fast on issues.

set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../.."   # repo root

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
  if python3 "$HERE/extract_satr.py" --country "$c"; then
    echo "  $c: DONE"
  else
    echo "  $c: FAILED — continuing with next"
  fi
  echo
done

echo "Finished: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo
echo "Run \`python3 ETL/events/load/load_satr.py --staging --report\` to consolidate."
