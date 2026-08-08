"""Push the local corpus to the ETL volume, having PROVED it loses nothing.

`push_local.py` ends with a bare `railway volume files upload --overwrite`. That
is correct when the laptop is strictly ahead of the volume and catastrophic when
it is not -- and on 2026-08-07 it was not: the volume held 1,457 events worth
EUR 55.71B (IPCEI microelectronics/hydrogen/batteries, Spanish BDNS, ADEME) that
the weekly cron had collected and that had never reached the laptop, while the
laptop held 766 instruments the volume had never seen. Either direction of a
plain overwrite would have destroyed real, unrecoverable work.

So this refuses to upload until it has shown, from the two files as they are AT
THIS MOMENT, that the local corpus is a superset of the volume's:

  1. wake the service (a cron-idle container has no SFTP)
  2. download the volume to a dated backup file, and VERIFY that backup opens
     and counts -- a backup nobody has read back is a plan, not a backup
  3. prove superset, table by table, key by key:
       - tables present on the volume and absent locally      -> REFUSE
       - columns present on the volume and absent locally,
         holding any non-NULL value                           -> REFUSE
       - rows on the volume whose primary key is absent
         locally (or, for keyless tables, whose whole row is
         absent locally)                                      -> REFUSE
  4. upload, only with --write
  5. read the volume BACK and re-run the same superset proof against it, because
     an upload's exit code says the bytes were sent, not that they landed
  6. restore the cron schedule and confirm it from Railway -- a push that leaves
     the service awake has traded one database for the entire weekly refresh

Step 3 refusing is not a failure of this script; it is the script working. The
repair is a union, never an overwrite:

    python3 ETL/lib/merge_volume_into_local.py <the backup this wrote> --write

then run this again. Nothing here ever writes to the local corpus.

    python3 ETL/events/extract/push_db_verified.py             # prove only
    python3 ETL/events/extract/push_db_verified.py --write     # prove, then push
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB  # noqa: E402
from railway_service import wake, restore  # noqa: E402
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import datetime as dt  # noqa: E402
import sqlite3  # noqa: E402
import subprocess  # noqa: E402

VOLUME = "etl-pipeline-volume"
REMOTE = "/db.sqlite"

# Internal SQLite bookkeeping; a difference here is not corpus data.
IGNORED_TABLES = {"sqlite_sequence", "sqlite_stat1", "sqlite_stat4"}


# ---------------------------------------------------------------- transfers

def _railway(*args: str) -> int:
    return subprocess.run(["npx", "--yes", "@railway/cli", *args]).returncode


def download(dest: _Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    rc = _railway("volume", "files", "--volume", VOLUME, "download",
                  REMOTE, str(dest), "--overwrite")
    if rc != 0:
        raise SystemExit(f"download failed (rc={rc}); nothing was written to the volume")
    if not dest.exists() or dest.stat().st_size == 0:
        raise SystemExit(f"download reported success but {dest} is missing or empty")


def upload(src: _Path) -> None:
    rc = _railway("volume", "files", "--volume", VOLUME, "upload",
                  str(src), REMOTE, "--overwrite")
    if rc != 0:
        raise SystemExit(f"upload failed (rc={rc}); the volume still holds the pre-push data")


# ---------------------------------------------------------------- the proof

def _tables(con: sqlite3.Connection, schema: str) -> set[str]:
    return {r[0] for r in con.execute(
        f"SELECT name FROM {schema}.sqlite_master WHERE type='table'")} - IGNORED_TABLES


def _columns(con: sqlite3.Connection, schema: str, table: str) -> list[tuple[str, int]]:
    """(name, pk_position) for each column; pk_position 0 means not part of the key."""
    return [(r[1], r[5]) for r in con.execute(f"PRAGMA {schema}.table_info({table})")]


def verify_superset(local: _Path, other: _Path, other_label: str) -> list[str]:
    """Problems that mean uploading `local` over `other` would destroy data.

    Both files are opened read-only, and `other` is ATTACHed as a `mode=ro`
    URI -- which SQLite only honours because the connection itself was opened
    with uri=True. Nothing here can write to either file.
    """
    problems: list[str] = []
    con = sqlite3.connect(f"file:{local}?mode=ro", uri=True)
    con.execute("ATTACH DATABASE ? AS other", (f"file:{other}?mode=ro",))

    lt, ot = _tables(con, "main"), _tables(con, "other")

    for t in sorted(ot - lt):
        n = con.execute(f'SELECT count(*) FROM other."{t}"').fetchone()[0]
        problems.append(f"table {t!r} exists on {other_label} ({n:,} rows) and not locally")

    print(f"\n{'table':32s} {'local':>10s} {other_label[:10]:>10s} {'would lose':>11s}")
    for t in sorted(lt & ot):
        lcols = _columns(con, "main", t)
        ocols = _columns(con, "other", t)
        lnames = {c for c, _ in lcols}

        # A column only the other side has: its values have nowhere to land.
        # Empty ones are drift, not data -- reported by check_store_schema.py,
        # not a reason to block a push.
        for c, _ in ocols:
            if c in lnames:
                continue
            filled = con.execute(
                f'SELECT count(*) FROM other."{t}" WHERE "{c}" IS NOT NULL').fetchone()[0]
            if filled:
                problems.append(
                    f"{t}.{c} exists on {other_label} with {filled:,} non-NULL values "
                    f"and does not exist locally")
            else:
                print(f"  (schema drift, no data) {t}.{c} on {other_label} only")

        ln = con.execute(f'SELECT count(*) FROM main."{t}"').fetchone()[0]
        on = con.execute(f'SELECT count(*) FROM other."{t}"').fetchone()[0]

        key = [c for c, pk in sorted(ocols, key=lambda x: x[1]) if pk] or None
        if key and all(k in lnames for k in key):
            on_ = " AND ".join(f'm."{k}" = o."{k}"' for k in key)
            lost = con.execute(
                f'SELECT count(*) FROM other."{t}" o WHERE NOT EXISTS '
                f'(SELECT 1 FROM main."{t}" m WHERE {on_})').fetchone()[0]
        else:
            # No usable primary key: compare whole rows over the shared columns.
            shared = [c for c, _ in ocols if c in lnames]
            cols = ", ".join(f'"{c}"' for c in shared)
            lost = con.execute(
                f'SELECT count(*) FROM (SELECT {cols} FROM other."{t}" '
                f'EXCEPT SELECT {cols} FROM main."{t}")').fetchone()[0]

        print(f"{t:32s} {ln:>10,} {on:>10,} {lost:>11,}")
        if lost:
            problems.append(
                f"{lost:,} rows in {t} exist on {other_label} and not locally")

    con.close()
    return problems


# ---------------------------------------------------------------- the script

def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--write", action="store_true",
                    help="upload after the proof passes. Without it, this pulls, "
                         "backs up, proves and stops.")
    ap.add_argument("--backup-dir", default=None,
                    help="where the pre-push copy of the volume goes "
                         "(default ~/Wincent-backups-<today>)")
    ap.add_argument("--local", default=None,
                    help=f"the corpus to push (default {DB}). Needed when running "
                         f"from a git worktree, whose data/ is empty because the "
                         f"corpus is gitignored -- etl_env.DB would resolve to a "
                         f"file that does not exist.")
    args = ap.parse_args()

    local = _Path(args.local).expanduser().resolve() if args.local else _Path(DB).resolve()
    if not local.exists():
        return print(f"no local corpus at {local}", file=_sys.stderr) or 1

    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_dir = _Path(args.backup_dir).expanduser() if args.backup_dir else (
        _Path.home() / f"Wincent-backups-{dt.date.today():%Y%m%d}")
    backup = backup_dir / f"volume-db-pre-push-{stamp}.sqlite"
    readback = backup_dir / f"volume-db-readback-{stamp}.sqlite"

    # A WAL still holding committed pages would upload a file that is missing
    # them. Checkpoint first, on a throwaway connection, and leave the corpus
    # otherwise untouched.
    con = sqlite3.connect(local)
    con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    con.close()

    restore_problems: list[str] = []
    wake()
    try:
        print(f"\n=== volume -> {backup} (pre-push backup) ===")
        download(backup)
        n = _verified_size(backup)
        print(f"backup verified: {backup.stat().st_size:,} bytes, "
              f"{n:,} rows in funding_instruments")

        problems = verify_superset(local, backup, "volume")
        if problems:
            print(f"\nREFUSING TO PUSH — {len(problems)} thing(s) exist on the "
                  f"volume and not locally:")
            for p in problems:
                print(f"  - {p}")
            print(f"\nUnion them in first, then run this again:\n"
                  f"  python3 ETL/lib/merge_volume_into_local.py {backup} --write")
            return 1
        print("\nproof: the local corpus is a superset of the volume on every "
              "table, column and key.")

        if not args.write:
            print("\nPROOF ONLY — nothing uploaded. Re-run with --write.")
            return 0

        print(f"\n=== {local} -> volume ===")
        uploaded = _counts(local)
        upload(local)

        print(f"\n=== volume -> {readback} (confirming the upload landed) ===")
        download(readback)
        back = verify_superset(local, readback, "readback")
        if back:
            print("\nUPLOAD DID NOT LAND CLEANLY:")
            for p in back:
                print(f"  - {p}")
            return 1
        if not _same_shape(uploaded, readback):
            print("\nUPLOAD DID NOT LAND: the volume's row counts do not match "
                  "the file that was uploaded.")
            return 1
        print("\nconfirmed: the volume now holds the merged corpus.")
        readback.unlink(missing_ok=True)
    finally:
        restore_problems = restore()

    if restore_problems:
        print("\nPushed, but the cron schedule was NOT restored — the weekly ETL "
              "will not run. Repair before anything else:\n"
              "  python3 ETL/lib/verify_cron.py --deploy")
        return 1
    print("\nDone. Volume, laptop and the pre-push backup are all accounted for:")
    print(f"  backup  {backup}")
    return 0


def _verified_size(p: _Path) -> int:
    con = sqlite3.connect(f"file:{p}?mode=ro", uri=True)
    if con.execute("PRAGMA quick_check").fetchone()[0] != "ok":
        raise SystemExit(f"{p} downloaded but fails quick_check; it is not a backup")
    n = con.execute("SELECT count(*) FROM funding_instruments").fetchone()[0]
    con.close()
    return n


def _counts(p: _Path) -> dict[str, int]:
    con = sqlite3.connect(f"file:{p}?mode=ro", uri=True)
    out = {t: con.execute(f'SELECT count(*) FROM "{t}"').fetchone()[0]
           for t in _tables(con, "main")}
    con.close()
    return out


def _same_shape(uploaded: dict[str, int], b: _Path) -> bool:
    """Every table's row count, as it was AT UPLOAD, equal on the volume.

    The first version re-read the local file here instead. That is wrong, and
    visibly so within an hour of writing it: another job appended to
    data/db.sqlite between the upload and the readback, which would have made a
    correct transfer report UPLOAD DID NOT LAND. What was uploaded is a fact
    about a moment, so it is measured at that moment and carried.
    """
    got = _counts(b)
    ok = set(uploaded) == set(got)
    if not ok:
        print(f"  tables differ: only-uploaded={sorted(set(uploaded) - set(got))} "
              f"only-volume={sorted(set(got) - set(uploaded))}")
    for t in sorted(set(uploaded) & set(got)):
        if uploaded[t] != got[t]:
            ok = False
            print(f"  {t}: uploaded {uploaded[t]:,}, volume {got[t]:,}")
    return ok


if __name__ == "__main__":
    _sys.exit(main())
