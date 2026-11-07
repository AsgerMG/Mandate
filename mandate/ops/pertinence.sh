#!/usr/bin/env bash
# The pertinence classification: is each published eligibility requirement a
# CONDITION a founder can clear, a DEMAND_MATCH (the shape of the offer), or a
# REPORT about someone else's grant? Owner-approved 6 Nov (< $20), because it
# decides which requirements bear on a founder, which the conversational agent
# needs. Run it AFTER a Sunday refresh, so it classifies the current gates.
#
#   bash mandate/ops/pertinence.sh            # dry run: counts + estimated cost, no call
#   bash mandate/ops/pertinence.sh --apply    # judge them (claude-opus-5), capped at $20
#
# Reads the corpus READ-ONLY (store.connect(readonly=True): capital_ro). Writes
# ONE file: capital/data/eligibility_pertinence.json, saved after every model
# call, so a run cut off loses nothing it paid for. Idempotent: verdicts are
# keyed by a digest of the text, so a re-run judges only what is still unjudged
# (a second --apply right after the first costs $0). No database write.
#
# DURABLE means committed: the verdicts live in git, and check_gate_pertinence
# (capital CI) reads them from there. The script snapshots the file before and
# after into ~/Mandate-backups/pertinence/, and ends by printing the commit.
#
# Measured 7 Nov 2026 (dry run): 1,345 never-judged filter gates + 2 texts,
# 55 calls, estimated $7.29 (output-heavy: thinking is billed as output, and
# the estimate assumes 4,000 output tokens a call, which is generous).
# Duration: ~55 calls x 30-60 s = 30-55 minutes.
set -euo pipefail
cd "$(dirname "$0")/../.."; ROOT=$PWD
APPLY=0; MAX_USD=20
for a in "$@"; do
  case "$a" in
    --apply) APPLY=1 ;;
    --max-usd=*) MAX_USD="${a#*=}" ;;
    *) echo "usage: $0 [--apply] [--max-usd=20]" >&2; exit 2 ;;
  esac
done
CACHE=capital/data/eligibility_pertinence.json
CLS="python3 capital/ETL/terms/classify_eligibility_pertinence.py"

python3 -c "import psycopg, anthropic" 2>/dev/null || {
  echo "needs psycopg (3) and anthropic: pip install 'psycopg[binary]' anthropic" >&2; exit 1; }

if [ "$APPLY" = 0 ]; then
  echo "== DRY RUN: what would be judged, and what it would cost. Nothing is called."
  $CLS --report --only gates --max-usd "$MAX_USD" | /usr/bin/grep -v '^  [A-Za-z0-9_.-]*/'
  $CLS --report --only text --max-usd "$MAX_USD" | /usr/bin/grep -E 'to judge|estimate|PLAN'
  echo
  echo "To run it: bash mandate/ops/pertinence.sh --apply   (stops before exceeding \$$MAX_USD)"
  exit 0
fi

[ -n "${ANTHROPIC_API_KEY:-}" ] || /usr/bin/grep -q '^ANTHROPIC_API_KEY=' capital/.env.local 2>/dev/null || {
  echo "ANTHROPIC_API_KEY is not set (env or capital/.env.local)" >&2; exit 1; }

B=~/Mandate-backups/pertinence; mkdir -p "$B"; TS=$(date -u +%Y%m%dT%H%M%SZ)
cp "$CACHE" "$B/eligibility_pertinence.before.$TS.json"
echo "== judging (cap \$$MAX_USD); the cache is saved after every call"
$CLS --classify --max-usd "$MAX_USD" | /usr/bin/grep -v '^  [A-Za-z0-9_.-]*/  *'
cp "$CACHE" "$B/eligibility_pertinence.after.$TS.json"

echo
echo "== what is left unjudged (should be 0):"
$CLS --report | /usr/bin/grep -E 'to judge|PLAN'
echo
echo "== make it durable (commit the verdicts; CI's check_gate_pertinence reads them):"
echo "   git switch -c pertinence-$TS && git add $CACHE && \\"
echo "   git commit -m 'Pertinence: judge the unjudged filter gates' && git push -u origin HEAD"
echo "   Snapshots: $B/eligibility_pertinence.{before,after}.$TS.json"
