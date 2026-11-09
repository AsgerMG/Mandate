"""Record a manifest's archive files as grounding versions. Dry run unless --apply.

    python3 mandate/grounding/migrations/register_manifest.py MANIFEST.jsonl --archive DIR \
        --database-url URL [--apply]

WHY. upload_manifest.py puts bytes in the bucket and nothing else. The cron
finds its pinned inputs (capital/ETL/lib/grounded_inputs.py materialise) by
looking up the grounding VERSION with that sha256, so on 2026-11-09 the first
real weekly run found 11 of 542 uploaded inputs and the instrument rebuild
refused (state_aid_cases). This records each file through
mandate.grounding.store_original: document (its canonical URL or urn), version
(sha256, mime, size, bucket key) and the fetch with its date. Idempotent:
store_original skips the bucket write when the object exists and inserts with
ON CONFLICT DO NOTHING, so a re-run changes nothing.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import psycopg  # noqa: E402

from mandate.grounding.store import store_original, version_by_sha  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("manifest", type=Path)
    ap.add_argument("--archive", type=Path, required=True)
    ap.add_argument("--database-url", required=True)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    lines = [json.loads(x) for x in a.manifest.read_text().splitlines() if x.strip()]
    if any(next(iter(l["bytes_from"])) != "archive_file" for l in lines):
        sys.exit("only archive_file entries are registered here")
    todo, done, bad = [], 0, []
    with psycopg.connect(a.database_url, autocommit=True) as con:
        for l in lines:
            try:
                version_by_sha(con, l["sha256"])
                done += 1
                continue
            except LookupError:
                pass
            p = a.archive / l["bytes_from"]["archive_file"]
            data = p.read_bytes()
            if hashlib.sha256(data).hexdigest() != l["sha256"]:
                bad.append(str(p))
                continue
            todo.append((l, data))
        print(f"{a.manifest.name}: {len(lines)} entries, {done} already recorded, "
              f"{len(todo)} to record, {len(bad)} whose bytes do not match the manifest")
        for b in bad[:5]:
            print("  MISMATCH", b)
        if bad:
            return 1
        if not a.apply:
            print("DRY RUN: nothing written. Re-run with --apply.")
            return 0
        for i, (l, data) in enumerate(todo, 1):
            store_original(con, data, l["canonical_url"], l["mime"],
                           dt.datetime.fromisoformat(l["fetched_at"]),
                           extractor=l.get("extractor"), kind=l.get("kind"))
            if i % 50 == 0:
                print(f"  recorded {i}/{len(todo)}")
        print(f"recorded {len(todo)} versions")
    return 0


if __name__ == "__main__":
    sys.exit(main())
