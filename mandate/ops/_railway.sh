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
