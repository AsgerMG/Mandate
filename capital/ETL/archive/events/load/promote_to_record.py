"""Upload a prepared store over the corpus of record — guarded, at the moment
of the upload, and WITHOUT running the extractor cycle.

── Why this exists beside push_local.py ───────────────────────────────────
`push_local.py` is the weekly local half of the pipeline: 43 extractors, a
manual inbox, `classify_taxonomy.py run --max-cost 20` — a PAID model call —
and then the upload. Its `--skip-pull` flag skips the pull and nothing else, so
until now the only way to reach the guarded upload was to pay for a
classification pass and wait hours for sources nobody asked to refresh.

That is why the promotion of 3,362 encoded eligibility gates sat undone for ten
days while being described, correctly, as one command.

So this is the upload and its guard, and nothing else. It shares BOTH halves
with push_local rather than restating either: `judge_push` for the decision and
`pull_db.verify` for "is what came back a whole database". A second
implementation of an interlock is a second thing that can be wrong, in the
direction nobody tested.

── What it will not do ────────────────────────────────────────────────────
It has no `--force-overwrite`. push_local has one because the weekly cycle must
be able to finish on an operator's judgement; a promotion has no such deadline,
and the honest answer to "the record holds rows this file lacks" is to union
them in and run again. `reconcile_stores.py --inserts-only` is that command and
the refusal prints it.

Usage:
  # what it would do, changing nothing
  python3 ETL/events/load/promote_to_record.py --file data/prepared.sqlite

  # do it
  python3 ETL/events/load/promote_to_record.py --file data/prepared.sqlite --apply
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402,F401
from railway_service import wake, restore  # noqa: E402
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import sqlite3  # noqa: E402
import subprocess  # noqa: E402

_sys.path.insert(0, str(ROOT / "ETL" / "events" / "extract"))
_sys.path.insert(0, str(ROOT / "ETL" / "events" / "load"))
_sys.path.insert(0, str(ROOT / "website" / "build" / "lib"))

VOLUME = ["npx", "--yes", "@railway/cli", "volume", "files",
          "--volume", "etl-pipeline-volume"]


def checkpoint(path: _Path) -> str | None:
    """Fold the write-ahead log back into the file, or say why it cannot be.

    A volume upload carries ONE file. Anything still in `-wal` stays on this
    machine, and what arrives is a database missing its most recent
    transactions — which `PRAGMA quick_check` calls perfectly fine, because it
    is. Checked here rather than trusted, because a store built minutes ago by
    another script is exactly the case where the WAL is not empty.
    """
    con = sqlite3.connect(path)
    try:
        con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    finally:
        con.close()
    wal = path.with_name(path.name + "-wal")
    if wal.exists() and wal.stat().st_size:
        return (f"{wal.name} still holds {wal.stat().st_size:,} bytes after a "
                f"TRUNCATE checkpoint. A single-file upload would leave them behind.")
    return None


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--file", required=True,
                    help="the store to upload. NOT defaulted to data/db.sqlite: "
                         "uploading the working corpus by forgetting an argument is "
                         "the accident this tool must not make convenient.")
    ap.add_argument("--apply", action="store_true",
                    help="upload. Without it the record is fetched and judged and "
                         "nothing is written.")
    args = ap.parse_args()

    from pull_db import verify
    from push_local import judge_push

    src = _Path(args.file).resolve()
    if not src.exists():
        return _sys.exit(f"no such file: {src}")
    problem = checkpoint(src) or verify(src)
    if problem:
        return _sys.exit(f"REFUSED — the file to upload is not usable:\n  {problem}")
    print(f"uploading  {src}  {src.stat().st_size:,} bytes — verified, wal empty")

    witness = DB.with_suffix(".sqlite.record-witness")
    wake()
    try:
        print("\n=== the corpus of record, as it is NOW ===")
        rc = subprocess.run(VOLUME + ["download", "/db.sqlite", str(witness),
                                      "--overwrite"]).returncode
        problem = verify(witness) if rc == 0 else f"the download failed (rc={rc})"
        if problem:
            witness.unlink(missing_ok=True)
            # No override exists here on purpose. An unmeasurable cost is not a
            # zero cost, and a promotion can always wait for a readable record.
            return _sys.exit(
                f"\nREFUSED — the record could not be read:\n  {problem}\n"
                f"  An overwrite whose cost is unknown is not a promotion. Re-run.")

        proceed, told, _lost = judge_push(witness, src, force=False)
        print("\n=== what this upload would delete from the record ===")
        print(told or "  ok — the record holds no row this file lacks.")
        if not proceed:
            return 2
        witness.unlink(missing_ok=True)

        if not args.apply:
            print("\nDRY RUN — the gate passed. Re-run with --apply to upload.")
            return 0
        print("\n=== uploading ===")
        rc = subprocess.run(VOLUME + ["upload", str(src), "/db.sqlite",
                                      "--overwrite"]).returncode
        if rc != 0:
            return _sys.exit(f"upload failed (rc={rc}) — the volume still holds the "
                             f"pre-push data")
        print("uploaded.")
    finally:
        # Waking replaces the cron schedule with `sleep infinity`. An upload
        # that succeeds and leaves the service woken has traded one db.sqlite
        # for the entire weekly refresh, silently.
        restore_problems = restore()
    if restore_problems:
        return _sys.exit(
            "\nUploaded, but the cron schedule was NOT restored. Fix before "
            "anything else:\n  python3 ETL/lib/verify_cron.py --deploy")
    print("\nDone. PROVE IT by re-reading the record — an exit code is not a "
          "census:\n  python3 ETL/events/extract/pull_db.py   (or a bare volume "
          "download + COUNT)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
