"""Site artefacts, built ONCE by the weekly run and downloaded by every deploy.

    python3 mandate/artefacts.py publish --web web --run-id 42   # the run: upload + manifest
    python3 mandate/artefacts.py fetch   --web web               # the prebuild: download
    python3 mandate/artefacts.py status                          # newest release, its age

WHY. The site's prebuild regenerated public/data from Postgres on every Vercel
deploy: slow, a database load per deploy, and it rebuilt from whatever state the
corpus was in mid-run. The run now builds them once, after every brain has
refreshed, and a deploy fetches that release in seconds.

THE SHAPE. Each file's bytes go into the grounding bucket under its sha256
(mandate.grounding.bucket.key_for), so an object is immutable, an unchanged file
costs nothing to re-publish, and a read is verified against its key. The
release is ONE row in mandate.artefact_releases mapping served path -> sha256,
inserted only after every object is uploaded: a deploy sees a whole release or
the previous one, never half of each.

WHAT IS PUBLISHED (paths relative to web/): every *.json the site-data builders
write into public/data/, and the runtime priors under lib/intelligence/
(*.generated.json, __objectives.json).

Configuration: the database URL from --db-url or CAPITAL_RO_DATABASE_URL (fetch,
status) / DATABASE_URL (publish, as capital_app); the bucket from BUCKET_*
(mandate/grounding/bucket.py). On Vercel: CAPITAL_RO_DATABASE_URL (exists) plus
BUCKET_ENDPOINT, BUCKET_ACCESS_KEY_ID, BUCKET_SECRET_ACCESS_KEY, BUCKET_NAME.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mandate.grounding.bucket import bucket_from_env, key_for  # noqa: E402

PATTERNS = ["public/data/*.json", "lib/intelligence/*.generated.json",
            "lib/intelligence/__objectives.json"]


def collect(web: Path) -> dict[str, Path]:
    out: dict[str, Path] = {}
    for pat in PATTERNS:
        for p in sorted(web.glob(pat)):
            out[str(p.relative_to(web))] = p
    return out


def publish(web: Path, db_url: str, run_id: int | None, *, bucket=None, git_sha: str | None = None) -> dict:
    import psycopg  # noqa: PLC0415
    bucket = bucket or bucket_from_env()
    files: dict[str, dict] = {}
    uploaded = 0
    for rel, p in collect(web).items():
        data = p.read_bytes()
        sha = hashlib.sha256(data).hexdigest()
        uploaded += bool(bucket.put_if_absent(key_for(sha), data, "application/json"))
        files[rel] = {"sha256": sha, "bytes": len(data)}
    if not files:
        raise SystemExit(f"no artefacts under {web}: nothing to publish")
    with psycopg.connect(db_url, autocommit=True) as c:
        rid = c.execute("INSERT INTO mandate.artefact_releases (run_id, files, git_sha) "
                        "VALUES (%s, %s::jsonb, %s) RETURNING id",
                        (run_id, json.dumps(files), git_sha)).fetchone()[0]
    print(f"artefacts: release {rid}: {len(files)} files, {uploaded} new objects")
    return {"release": rid, "files": len(files), "uploaded": uploaded}


def latest(db_url: str) -> tuple[int, str, dict] | None:
    import psycopg  # noqa: PLC0415
    with psycopg.connect(db_url, autocommit=True) as c:
        row = c.execute("SELECT id, created_at, files FROM mandate.artefact_releases "
                        "ORDER BY created_at DESC, id DESC LIMIT 1").fetchone()
    return (row[0], row[1].isoformat(), row[2]) if row else None


def fetch(web: Path, db_url: str, *, bucket=None) -> int:
    """Write the newest release into `web`. Returns the number of files written;
    raises when there is no release or an object cannot be read (the caller falls
    back to building from the database)."""
    rel = latest(db_url)
    if rel is None:
        raise LookupError("no artefact release published yet")
    rid, created, files = rel
    bucket = bucket or bucket_from_env()
    staged = [(web / path, bucket.get(key_for(meta["sha256"]))) for path, meta in files.items()]
    for dest, data in staged:        # every object read and verified BEFORE any write
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_name(dest.name + ".part")
        tmp.write_bytes(data)
        tmp.replace(dest)
    print(f"artefacts: release {rid} ({created}): {len(staged)} files written")
    return len(staged)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["publish", "fetch", "status"])
    ap.add_argument("--web", default=str(Path(__file__).resolve().parents[1] / "web"))
    ap.add_argument("--db-url")
    ap.add_argument("--run-id", type=int)
    a = ap.parse_args()
    web = Path(a.web)
    if a.cmd == "publish":
        url = a.db_url or os.environ["DATABASE_URL"]
        publish(web, url, a.run_id, git_sha=os.environ.get("RAILWAY_GIT_COMMIT_SHA"))
        return 0
    url = a.db_url or os.environ.get("CAPITAL_RO_DATABASE_URL") or os.environ["DATABASE_URL"]
    if a.cmd == "fetch":
        fetch(web, url)
        return 0
    rel = latest(url)
    print("no release" if rel is None else f"release {rel[0]} at {rel[1]}: {len(rel[2])} files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
