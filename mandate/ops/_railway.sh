# Shared by the ops scripts: Railway ids and a variable reader. Sourced, not run.
MANDATE_PROJECT=6a8743db-3dc3-4a1c-94a5-78ac0a1e1bd9
MANDATE_ENV=7ca8ec0d-dc1c-4979-a602-04dd31efacbd
MANDATE_DB_SERVICE=921d5f94-90ac-4010-b3aa-31ebf125d30d
CAPINA_ENV=64585403-a342-48a0-8253-9936ae262b6c
CAPINA_ETL_SERVICE=f0b76865-5813-4027-9c6b-54b31f379c11
railway_api() { npx --yes @railway/cli api "$@"; }
# db_var NAME -> the value of NAME on the Mandate database service
db_var() {
  railway_api "query{ variables(projectId:\"$MANDATE_PROJECT\", environmentId:\"$MANDATE_ENV\", serviceId:\"$MANDATE_DB_SERVICE\") }" 2>/dev/null |
    python3 -c "import json,sys;r=sys.stdin.read();print(json.loads(r[:r.rfind('}')+1])['data']['variables']['$1'])"
}
# bucket_env -> exports BUCKET_* for the grounding bucket into this shell only
# (the same block go_live_grounding.sh inlines).
bucket_env() {
  eval "$(npx --yes @railway/cli bucket credentials --bucket mandate-grounding --json | python3 -c '
import json,sys,shlex; d=json.load(sys.stdin); d=d if isinstance(d,dict) else d[0]
for k,v in {"BUCKET_ENDPOINT":d["endpoint"],"BUCKET_NAME":d["bucketName"],"BUCKET_REGION":d["region"],
            "BUCKET_ACCESS_KEY_ID":d["accessKeyId"],"BUCKET_SECRET_ACCESS_KEY":d["secretAccessKey"],
            "BUCKET_ADDRESSING":"virtual" if d.get("urlStyle","virtual-host").startswith("virtual") else "path"}.items():
    print(f"export {k}={shlex.quote(v)}")')"
}
# no_live_run_or_stop -> exits the calling script if a refresh is genuinely
# running (a deploy would kill it). A run still marked 'running' whose heartbeat
# is over 30 minutes old is DEAD, not running: run.py heartbeats every poll while
# it waits on policy, so silence means its container was replaced (9 Nov: run
# 113, killed by a redeploy at 14:53). Those are marked 'abandoned' here, the
# same status void_test_runs.sh uses, so the health check's stuck-run alarm and
# these scripts stop tripping over them. Nothing is deleted.
no_live_run_or_stop() {
  local url; url=$(db_var CAPITAL_DATABASE_PUBLIC_URL)
  psql "$url" -XAtq -v ON_ERROR_STOP=1 -c "
    UPDATE mandate.runs SET status = 'abandoned', finished_at = now(),
           summary = coalesce(summary || '; ', '') || 'no heartbeat for over 30 min: container replaced (marked by ops script)'
     WHERE status = 'running' AND heartbeat_at < now() - interval '30 minutes'
    RETURNING 'marked dead run ' || id || ' abandoned (last heartbeat ' || heartbeat_at || ')'"
  # Only the runs a redeploy of THIS service would kill: the weekly job's
  # (brain 'mandate'/'capital', in capital-etl). Regina's refreshes run in her
  # own service, so they never block a capital-etl deploy (10 Nov: a slow
  # Regina refresh held restore_weekly_cron.sh for an hour for no reason).
  # Pass the brains to wait for, e.g. `no_live_run_or_stop policy`.
  local brains="${1:-mandate capital}" in_list
  in_list=$(printf "'%s'," $brains); in_list=${in_list%,}
  local live; live=$(psql "$url" -XAtc "SELECT string_agg(id || ' (heartbeat ' || to_char(heartbeat_at, 'HH24:MI') || ' UTC)', ', ')
                                          FROM mandate.runs WHERE status = 'running' AND brain IN ($in_list)")
  if [ -n "$live" ]; then
    # The one live state a deploy may end: the run's only open step is waiting
    # on Regina, and Regina says no refresh is running. That wait cannot end
    # (9 Nov: her record never reached mandate.runs), so it is closed, saying why.
    local stuck regina
    stuck=$(psql "$url" -XAtc "SELECT r.id FROM mandate.runs r WHERE r.status = 'running'
              AND (SELECT array_agg(name) FROM mandate.run_steps s WHERE s.run_id = r.id AND s.status = 'running') = ARRAY['policy refresh']")
    regina=$(curl -fsS https://regina-production.up.railway.app/api/refresh 2>/dev/null | python3 -c "import json,sys;print(json.load(sys.stdin).get('running'))" 2>/dev/null)
    if [ -n "$stuck" ] && [ "$stuck" = "$(echo "$live" | cut -d' ' -f1)" ] && [ "$regina" = False ]; then
      psql "$url" -XAtq -v ON_ERROR_STOP=1 -c "
        UPDATE mandate.run_steps SET status = 'failed', finished_at = now(),
               summary = 'waited on a policy record that could not be written (mandate.runs missing from the policy image); Regina is idle'
         WHERE run_id = $stuck AND status = 'running';
        UPDATE mandate.runs SET status = 'abandoned', finished_at = now(),
               summary = 'closed by ops script: only open step was the policy wait, and Regina was idle'
         WHERE id = $stuck"
      echo "closed run $stuck: it was only waiting on Regina, who is idle (her record could not be written)"
    else
      echo "NOT YET: run $live is still running; a deploy now would kill it. Run this again when it has finished."; exit 1
    fi
  fi
}
