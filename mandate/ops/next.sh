#!/usr/bin/env bash
# What is left for the owner to run, and the exact command for the next one.
# Read-only: checks live state (Railway, Postgres, Vercel), changes nothing.
#
#   bash ~/Mandate/mandate/ops/next.sh
#
# Each line is DONE, NEXT (run this now), or LATER (waits on the line above).
# Run it again after every command; the list shrinks as loops close.
set -uo pipefail
cd "$(dirname "$0")"; source _railway.sh
OPS=~/Mandate/mandate/ops
RO=$(db_var CAPITAL_RO_DATABASE_PUBLIC_URL)
q() { psql "$RO" -XAtc "$1" 2>/dev/null; }
NEXT_GIVEN=0
say() {  # say <done 0|1> <title> <command> [why-later]
  if [ "$1" = 1 ]; then printf '  DONE   %s\n' "$2"
  elif [ "$NEXT_GIVEN" = 0 ] && [ -z "${4:-}" ]; then printf '  NEXT   %s\n         %s\n' "$2" "$3"; NEXT_GIVEN=1
  else printf '  LATER  %s%s\n' "$2" "${4:+  ($4)}"; fi
}

echo "== Mandate: what is left for you ($(date -u +'%a %H:%M') UTC)"

# 1. the dead regina Vercel project (the failed-deployment emails)
TOKEN=$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/Library/Application Support/com.vercel.cli/auth.json')))['token'])" 2>/dev/null)
LINKED=$(curl -fsS -H "Authorization: Bearer $TOKEN" https://api.vercel.com/v9/projects/regina 2>/dev/null |
  python3 -c "import json,sys;print('yes' if json.load(sys.stdin).get('link') else 'no')" 2>/dev/null || echo unknown)
[ "$LINKED" = no ] && d=1 || d=0
say $d "Stop the Vercel failure emails (old regina project)" "bash $OPS/retire_regina_vercel.sh"

# 2-3. the refresh: is one running, is the census fresh, is the cron weekly
LIVE=$(q "SELECT string_agg(id::text, ',') FROM mandate.runs WHERE status='running' AND heartbeat_at > now() - interval '30 minutes'")
LAST=$(q "SELECT id || ' ' || status FROM mandate.runs WHERE brain='mandate' AND status <> 'running' ORDER BY started_at DESC LIMIT 1")
CENSUS_H=$(q "SELECT round(extract(epoch FROM now() - max(taken_at)) / 3600) FROM capital.guard_verdicts WHERE guard = 'census' AND status = 'ok'")
CRON=$(railway_api 'query{ serviceInstance(serviceId:"4b6ee9af-6855-4c51-8058-a1d364cbfb12", environmentId:"'"$MANDATE_ENV"'"){ cronSchedule startCommand } }' 2>/dev/null |
  python3 -c "import json,sys;r=sys.stdin.read();s=json.loads(r[:r.rfind('}')+1])['data']['serviceInstance'];print(s['cronSchedule'],'|',s['startCommand'])" 2>/dev/null)
echo "   refresh: ${LIVE:+run $LIVE running now; }last finished run ${LAST:-none}; census last green ${CENSUS_H:-never} h ago; cron: $CRON"
WAIT=""; [ -n "$LIVE" ] && WAIT="waits for run $LIVE to finish"
if [ -n "$CENSUS_H" ] && [ "$CENSUS_H" -lt 48 ]; then d=1; else d=0; fi
say $d "Re-run the capital phase (publishes the census: GitHub's capital checks go green)" \
    "bash $OPS/rerun_capital.sh" "$WAIT"
case "$CRON" in "0 3 * * 0 | python3 /app/mandate/refresh/run.py") d=1 ;; *) d=0 ;; esac
W2="$WAIT"; [ -z "$W2" ] && [ "$NEXT_GIVEN" = 1 ] && W2="after the line above"
say $d "Put the refresh back on Sundays 03:00 UTC, full run" "bash $OPS/restore_weekly_cron.sh" "$W2"

# 4. the two deletions (archive first, both scripts dry-run by default)
OLD=$(q "SELECT count(*) FROM information_schema.columns WHERE table_schema='capital' AND column_name='embedding'
           AND table_name IN ('eligibility_embeddings','instrument_profiles','signals_chunk_embeddings')")
[ "${OLD:-1}" = 0 ] && d=1 || d=0
W3="$WAIT"; [ -z "$W3" ] && [ "$NEXT_GIVEN" = 1 ] && W3="after the lines above"
say $d "Drop the old embedding columns (~150 MB; archived first). Dry run, then add --apply" \
    "bash $OPS/one_model_drop_old.sh   then   bash $OPS/one_model_drop_old.sh --apply" "$W3"
DUP=$(q "SELECT (to_regclass('policy.passages') IS NOT NULL)::int + (to_regclass('policy.document_versions') IS NOT NULL)::int")
[ "${DUP:-1}" = 0 ] && d=1 || d=0
say $d "Drop Regina's duplicate copies (~1 GB; archived first). Dry run, then add --apply" \
    "bash $OPS/drop_policy_duplicates.sh   then   bash $OPS/drop_policy_duplicates.sh --apply" "$W3"

[ "$NEXT_GIVEN" = 0 ] && echo "   Nothing left for you here. Paste me the output of the last command you ran."
echo "   After each command: paste me its last lines (I commit/merge whatever it asks for), then run next.sh again."
