#!/usr/bin/env bash
# Retires the old Capina Railway project (the pre-Mandate Wincent stack: an
# idle Postgres + PgBouncer that bill every day, and the etl-pipeline service
# suspended on 2026-11-05). Mandate's capital schema holds the same corpus.
#
#   bash mandate/ops/retire_capina.sh            # dry run: verify, upload nothing, delete nothing
#   bash mandate/ops/retire_capina.sh --apply    # archive to the bucket, then delete (type the name)
#
# Refuses unless:
#   1. the live Capina DB still matches the 2026-11-05 archive table for table
#      (row counts from MANIFEST.json), i.e. nothing was written since;
#   2. the archive files' sha256 match the manifest and the dump lists its 12 tables;
#   3. nothing but this script is connected to the Capina DB.
# --apply then copies the archives OFF THE LAPTOP into the mandate-grounding
# bucket (content-addressed, verified on read-back), records them in
# mandate/ops/archives.json, and only then deletes the project.
set -euo pipefail
cd "$(dirname "$0")/../.."; ROOT=$PWD
source mandate/ops/_railway.sh
APPLY=0; [ "${1:-}" = "--apply" ] && APPLY=1
CAPINA_PROJECT=2a61c923-3a29-476e-b725-0f47b3c4ec0e
CAPINA_PG=4d53ffd7-473b-44ae-8df7-f3f5ac9682bf
B=~/Mandate-backups/2026-11-05
PY="$ROOT/policy/.venv/bin/python"

CU=$(railway_api "query{ variables(projectId:\"$CAPINA_PROJECT\", environmentId:\"$CAPINA_ENV\", serviceId:\"$CAPINA_PG\") }" 2>/dev/null |
     python3 -c "import json,sys;r=sys.stdin.read();print(json.loads(r[:r.rfind('}')+1])['data']['variables']['DATABASE_PUBLIC_URL'])")

echo "== 1. the live Capina DB is what was archived"
$PY - "$CU" "$B" <<'PY'
import hashlib, json, subprocess, sys, psycopg
url, b = sys.argv[1], sys.argv[2]
files = json.load(open(f"{b}/MANIFEST.json"))["files"]
rows = files["capina_postgres.dump"]["rows"]
c = psycopg.connect(url)
diff = [(t, v, c.execute(f"SELECT count(*) FROM {t}").fetchone()[0]) for t, v in rows.items()]
diff = [d for d in diff if d[1] != d[2]]
if diff: sys.exit(f"STOP: Capina changed since the archive: {diff}")
other = c.execute("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() "
                  "AND pid <> pg_backend_pid() AND backend_type = 'client backend'").fetchone()[0]
if other: sys.exit(f"STOP: {other} other connection(s) to the Capina DB: something still uses it")
print(f"  ok: {len(rows)} tables, row counts identical to the archive; no other connections")
for name in ("capina_postgres.dump", "railway_volume_db.sqlite"):
    h = hashlib.sha256(open(f"{b}/{name}", "rb").read()).hexdigest()
    if h != files[name]["sha256"]: sys.exit(f"STOP: {name} sha256 {h[:12]} is not the manifest's")
    print(f"  ok: {name} ({files[name]['bytes'] / 1e6:.0f} MB) matches its sha256")
n = subprocess.run(["pg_restore", "--list", f"{b}/capina_postgres.dump"], capture_output=True,
                   text=True, check=True).stdout.count("TABLE DATA")
if n != len(rows): sys.exit(f"STOP: the dump lists {n} tables, the manifest {len(rows)}")
print(f"  ok: the dump restores {n} tables")
PY

echo "== 2. what --apply does"
echo "  copy capina_postgres.dump + railway_volume_db.sqlite to bucket mandate-grounding, verify, record in mandate/ops/archives.json"
echo "  then DELETE Railway project Capina ($CAPINA_PROJECT): Postgres, PgBouncer, etl-pipeline"
[ "$APPLY" = 1 ] || { echo; echo "DRY RUN: nothing uploaded, nothing deleted. Next: bash $0 --apply"; exit 0; }

echo "== 3. archives off the laptop"
bucket_env
$PY - "$B" "$ROOT/mandate/ops/archives.json" <<'PY'
import hashlib, json, sys, datetime as dt
from pathlib import Path
sys.path.insert(0, str(Path(sys.argv[2]).parents[2]))
from mandate.grounding.bucket import bucket_from_env, key_for
b, idx = sys.argv[1], Path(sys.argv[2])
bk = bucket_from_env()
files = json.load(open(f"{b}/MANIFEST.json"))["files"]
out = json.loads(idx.read_text()) if idx.exists() else {"$why": "Archives kept OFF the laptop: content-addressed objects in the mandate-grounding bucket. Restore: fetch key, check sha256."}
for name in ("capina_postgres.dump", "railway_volume_db.sqlite"):
    data = open(f"{b}/{name}", "rb").read(); sha = hashlib.sha256(data).hexdigest(); key = key_for(sha)
    bk.put_if_absent(key, data, "application/octet-stream")
    assert hashlib.sha256(bk.get(key)).hexdigest() == sha, f"read-back of {name} does not match"
    out[f"capina/2026-11-05/{name}"] = {"key": key, "sha256": sha, "bytes": len(data),
        "what": "pre-Mandate Capina Railway project, archived 2026-11-05, unchanged when the project was deleted",
        "recorded": dt.date.today().isoformat()}
    print(f"  ok: {name} -> {key} (read back, sha256 matches)")
idx.write_text(json.dumps(out, indent=2) + "\n")
PY

echo "== 4. delete the project"
read -r -p "Type Capina to delete the Railway project: " ok
[ "$ok" = Capina ] || { echo "not confirmed; archives uploaded, project kept"; exit 1; }
railway_api "mutation{ projectDelete(id:\"$CAPINA_PROJECT\") }" >/dev/null
echo "DELETED: Railway project Capina. Archives: mandate/ops/archives.json (paste me this line; I commit it)."
