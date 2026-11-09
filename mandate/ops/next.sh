#!/usr/bin/env bash
# What is left for the owner to run, and the exact command for the next one.
# Read-only: checks live state (Railway, Postgres, Vercel), changes nothing.
#
#   bash ~/Mandate/mandate/ops/next.sh
#
# Each line is DONE, NEXT (run this now), or LATER (waits on something, said in
# brackets). Run it again after every command; the list shrinks as loops close.
set -uo pipefail
cd "$(dirname "$0")"; source _railway.sh
OPS=~/Mandate/mandate/ops
RO=$(db_var CAPITAL_RO_DATABASE_PUBLIC_URL)
q() { psql "$RO" -XAtc "$1" 2>/dev/null; }
hold_for() { /usr/bin/grep -v '^#' "$OPS/holds.txt" 2>/dev/null | awk -F' [|] ' -v s="$1" '$1==s{print $2; exit}'; }
NEXT_GIVEN=0; LATER_N=0
say() {  # say <done 0|1> <title> <command> [why-later]
  local script; script=$(basename "$(echo "$3" | awk '{print $2}')")
  local why="${4:-}"; [ -z "$why" ] && why=$(hold_for "$script")
  if [ "$1" = 1 ]; then printf '  DONE   %s\n' "$2"
  elif [ -z "$why" ]; then
    if [ "$NEXT_GIVEN" = 0 ]; then printf '  NEXT   %s\n         %s\n' "$2" "$3"; NEXT_GIVEN=1
    else printf '  ALSO   %s (can run now, in another terminal)\n         %s\n' "$2" "$3"; fi
  else printf '  LATER  %s  (%s)\n' "$2" "$why"; LATER_N=$((LATER_N + 1)); fi
}

echo "== Mandate: what is left for you ($(date -u +'%a %H:%M') UTC)"

# state
TOKEN=$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/Library/Application Support/com.vercel.cli/auth.json')))['token'])" 2>/dev/null)
vgone() { [ "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "https://api.vercel.com/v9/projects/$1")" = 404 ]; }
CAPINA=$(railway_api 'query{ project(id:"2a61c923-3a29-476e-b725-0f47b3c4ec0e"){ deletedAt } }' 2>/dev/null |
  python3 -c "import json,sys;r=sys.stdin.read();d=json.loads(r[:r.rfind('}')+1]).get('data') or {};p=d.get('project');print('gone' if not p or p.get('deletedAt') else 'live')" 2>/dev/null)
LIVE=$(q "SELECT string_agg(id::text, ',') FROM mandate.runs WHERE status='running' AND heartbeat_at > now() - interval '30 minutes'")
CENSUS_H=$(q "SELECT round(extract(epoch FROM now() - max(taken_at)) / 3600) FROM capital.guard_verdicts WHERE guard = 'census' AND status = 'ok'")
POLICY_REC=$(q "SELECT count(*) FROM mandate.runs WHERE brain = 'policy' AND started_at > now() - interval '6 hours' AND coalesce(summary, '') NOT LIKE 'TEST POLLUTION%'")
CRON=$(railway_api 'query{ serviceInstance(serviceId:"4b6ee9af-6855-4c51-8058-a1d364cbfb12", environmentId:"'"$MANDATE_ENV"'"){ cronSchedule startCommand } }' 2>/dev/null |
  python3 -c "import json,sys;r=sys.stdin.read();s=json.loads(r[:r.rfind('}')+1])['data']['serviceInstance'];print(s['cronSchedule'],'|',s['startCommand'])" 2>/dev/null)
echo "   refresh: ${LIVE:+run $LIVE running now; }census last green ${CENSUS_H:-never} h ago; cron: $CRON"
WAIT_RUN=""; [ -n "$LIVE" ] && WAIT_RUN="waits for run $LIVE to finish"

# cleanup already asked for
{ vgone regina && vgone the-memory-studio-web && [ "$CAPINA" = gone ]; } && d=1 || d=0
say $d "Old projects deleted (Vercel regina + memory studio, Railway Capina)" "(dashboards)"

# 1. schema for Batches + the advisor
[ "$(q "SELECT (to_regclass('mandate.llm_batches') IS NOT NULL AND to_regclass('mandate.missions') IS NOT NULL)::int")" = 1 ] && d=1 || d=0
say $d "Database tables for the Batches API and the advisor (adds only)" "bash $OPS/apply_platform_sql.sh"
SQL_DONE=$d

# 2. Regina on the fixed image, with one recorded refresh
[ "${POLICY_REC:-0}" -gt 0 ] && d=1 || d=0
# after the re-run has started: a Regina refresh in progress would make rerun_capital wait for it
case "$CRON" in *"--only capital"*) RERUN_ON=1 ;; *) RERUN_ON=0 ;; esac
[ -n "$CENSUS_H" ] && [ "$CENSUS_H" -lt 24 ] && RERUN_ON=1
W=""; [ "$RERUN_ON" = 0 ] && [ "$d" = 0 ] && W="right after the capital re-run starts"
say $d "Deploy Regina's fix (~5 min), which starts one refresh that is now recorded" "bash $OPS/deploy_regina.sh" "$W"

# 3. the capital re-run: publishes the census, GitHub goes green
if [ -n "$CENSUS_H" ] && [ "$CENSUS_H" -lt 24 ]; then d=1; else d=0; fi
W=""; [ "$SQL_DONE" = 0 ] && W="after the database tables line"
say $d "Re-run the capital phase (~60 min on Railway; publishes the census, GitHub goes green)" "bash $OPS/rerun_capital.sh" "$W"

# 4. Regina's duplicate tables: other tables than the capital run touches, so it may run during it
DUP=$(q "SELECT (to_regclass('policy.passages') IS NOT NULL)::int + (to_regclass('policy.document_versions') IS NOT NULL)::int")
[ "${DUP:-1}" = 0 ] && d=1 || d=0
say $d "Drop Regina's duplicate copies (~1 GB; archived first). Dry run, then add --apply" \
    "bash $OPS/drop_policy_duplicates.sh   then   bash $OPS/drop_policy_duplicates.sh --apply"

# 5. weekly schedule back, after the run
case "$CRON" in "0 3 * * 0 | python3 /app/mandate/refresh/run.py") d=1 ;; *) d=0 ;; esac
W="$WAIT_RUN"; [ -z "$W" ] && [ "${CENSUS_H:-999}" -ge 24 ] && W="after the capital re-run"
say $d "Put the refresh back on Sundays 03:00 UTC, full run" "bash $OPS/restore_weekly_cron.sh" "$W"

# 6. old vectors: after the run (it rewrites tables the run writes)
OLD=$(q "SELECT count(*) FROM information_schema.columns WHERE table_schema='capital' AND column_name='embedding'
           AND table_name IN ('eligibility_embeddings','instrument_profiles','signals_chunk_embeddings')")
[ "${OLD:-1}" = 0 ] && d=1 || d=0
say $d "Drop the old embedding columns (~150 MB; archived first). Dry run, then add --apply" \
    "bash $OPS/one_model_drop_old.sh   then   bash $OPS/one_model_drop_old.sh --apply" "$W"

# 7. the advisor service
MAPI=$(railway_api 'query{ project(id:"'"$MANDATE_PROJECT"'"){ services{ edges{ node{ name } } } } }' 2>/dev/null | /usr/bin/grep -c '"mandate-api"' || true)
[ "${MAPI:-0}" -gt 0 ] && d=1 || d=0
W=""; [ "$SQL_DONE" = 0 ] && W="after the database tables line"
say $d "The advisor service on Railway + 3 Vercel settings (Claude gives you the clicks)" "(ask Claude)" "$W"

if [ "$NEXT_GIVEN" = 0 ] && [ "$LATER_N" -gt 0 ]; then
  echo "   NOTHING TO RUN RIGHT NOW. $LATER_N item(s) are waiting (reason in brackets); Claude messages you when the first unlocks."
elif [ "$NEXT_GIVEN" = 0 ]; then
  echo "   ALL DONE. Nothing left for you."
fi
echo "   After each command: paste me its last lines, then run next.sh again."
