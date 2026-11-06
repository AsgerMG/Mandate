"""Upload a grounding manifest's objects to the bucket. Dry run unless --apply.

    python3 mandate/grounding/migrations/upload_manifest.py MANIFEST.jsonl [--archive DIR] [--db-url URL] [--apply]

Each manifest line names an object by sha256 and says where its bytes come from:
  {"archive_file": rel}                 a file under --archive (migration b, cron inputs)
  {"grounding_version_text": id}        grounding.document_versions.text, UTF-8 (migration a)
  {"funding_instruments.eligibility_text": id}   capital's stored text (migration b)
The bytes are hashed before every PUT and must equal the manifest's sha256; the
key is a function of that hash, so a re-run uploads nothing twice (HEAD first).
Bucket from BUCKET_* (bucket.py). Writes nothing to any database.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from mandate.grounding.bucket import bucket_from_env  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("manifest", type=Path)
    ap.add_argument("--archive", type=Path)
    ap.add_argument("--db-url")
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    lines = [json.loads(l) for l in a.manifest.read_text().splitlines() if l.strip()]
    kinds = Counter(next(iter(l["bytes_from"])) for l in lines)
    total = sum(l["byte_size"] for l in lines)
    print(f"{a.manifest.name}: {len(lines):,} objects, {total:,} bytes, from {dict(kinds)}")
    if not a.apply:
        print("dry run: nothing uploaded. --apply uploads (bucket from BUCKET_*).")
        return 0
    bucket = bucket_from_env()
    con = None
    if any(k != "archive_file" for k in kinds):
        import psycopg  # noqa: PLC0415
        con = psycopg.connect(a.db_url, options="-c default_transaction_read_only=on")
    put = 0
    for l in lines:
        src = l["bytes_from"]
        if "archive_file" in src:
            data = (a.archive / src["archive_file"]).read_bytes()
        elif "grounding_version_text" in src:
            data = con.execute("SELECT text FROM grounding.document_versions WHERE id = %s",
                               (src["grounding_version_text"],)).fetchone()[0].encode("utf-8")
        else:
            data = con.execute("SELECT eligibility_text FROM funding_instruments WHERE id = %s",
                               (src["funding_instruments.eligibility_text"],)).fetchone()[0].encode("utf-8")
        if hashlib.sha256(data).hexdigest() != l["sha256"]:
            raise SystemExit(f"bytes for {l['bucket_key']} do not match the manifest: refusing")
        put += bucket.put_if_absent(l["bucket_key"], data, l["mime"])
    print(f"uploaded {put:,} new objects ({len(lines) - put:,} were already there)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
