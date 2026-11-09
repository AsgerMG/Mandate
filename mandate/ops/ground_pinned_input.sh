#!/usr/bin/env bash
# Put one pinned capital input group into grounding, so the cron can read it.
#   bash mandate/ops/ground_pinned_input.sh bdns_open_calls           # dry run
#   bash mandate/ops/ground_pinned_input.sh bdns_open_calls --apply   # write
#
# WHY. capital/reference/grounded_inputs.json pins each input of a cron step by
# sha256, and materialise() finds it in grounding by that sha256. A group pinned
# in the repo but never recorded in grounding fails in the container exactly as
# a missing file did (run 113: state_aid_cases; run 114: found_ES_bdns.json).
# This records the group's files from the 2026-11-05 archive through
# register_manifest.py (store_original: bucket object + grounding version, both
# idempotent). Writes nothing without --apply; deletes nothing ever.
set -euo pipefail
cd "$(dirname "$0")/../.."; ROOT=$PWD
GROUP=${1:?usage: ground_pinned_input.sh GROUP [--apply]}
APPLY=${2:-}
source mandate/ops/_railway.sh
ARCHIVE=${ARCHIVE:-$HOME/Mandate-backups/2026-11-05/work/grounding/archive/raw}
PY="$ROOT/policy/.venv/bin/python"
MANIFEST=$(mktemp -t "grounding_manifest_${GROUP}.XXXX").jsonl
python3 - "$GROUP" "$ARCHIVE" > "$MANIFEST" <<'EOF'
import datetime as dt, json, sys
from pathlib import Path
group, archive = sys.argv[1], Path(sys.argv[2])
pins = json.loads(Path("capital/reference/grounded_inputs.json").read_text())["groups"][group]
mime = {".pdf": "application/pdf", ".csv": "text/csv", ".json": "application/json", ".html": "text/html"}
for f in pins["files"]:
    p = archive / f["path"]
    print(json.dumps({"sha256": f["sha256"], "bucket_key": f"sha256/{f['sha256'][:2]}/{f['sha256']}",
                      "byte_size": f["bytes"], "mime": mime.get(p.suffix.lower(), "application/octet-stream"),
                      "canonical_url": f["url"],
                      "fetched_at": dt.datetime.fromtimestamp(p.stat().st_mtime, dt.timezone.utc).isoformat(),
                      "fetched_at_basis": "file mtime in the 2026-11-05 archive",
                      "extractor": None, "kind": f"extractor_input:{group}",
                      "bytes_from": {"archive_file": f["path"]}}))
EOF
echo "manifest: $MANIFEST ($(wc -l < "$MANIFEST" | tr -d ' ') file(s))"
bucket_env
"$PY" mandate/grounding/migrations/register_manifest.py "$MANIFEST" --archive "$ARCHIVE" \
  --database-url "$(db_var CAPITAL_DATABASE_PUBLIC_URL)" $APPLY
