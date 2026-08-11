"""Pull the corpus of record down from the Railway ETL volume, without
destroying anything the local copy holds alone.

Wakes the cron-idle service first (SFTP needs a running container) and restores
the real cron schedule afterwards. See ETL/lib/railway_service.py.

── Why this is not a download any more ────────────────────────────────────
It used to be one `railway volume files download ... --overwrite` straight onto
data/db.sqlite. On 2026-08-07 that was found to be a live data-loss path: the
laptop's db.sqlite held 1,086 funding instruments and 6,368 encoded eligibility
gates, the volume's held 322 and 4,018, and the two stores had never had a
channel that could carry both. Running `make pull-db` — or `make republish`,
which is documented as THE command that makes the website serve the ETL's
corpus, and whose first step this is — would have deleted 764 instruments and
2,350 gates with no warning and no copy anywhere else.

So the download lands in a sidecar, the two stores are compared, and the swap
happens only when it costs nothing. When it would cost something, the operator
is told exactly what and has to say which of three things they mean. There is
no default that loses data.

Usage:
  python3 ETL/events/extract/pull_db.py                 (or `make pull-db`)
  python3 ETL/events/extract/pull_db.py --carry-forward  merge local-only rows
                                                         into the fresh copy
  python3 ETL/events/extract/pull_db.py --discard-local  named for what it is
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402
from railway_service import wake, restore  # noqa: E402
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import subprocess  # noqa: E402

_sys.path.insert(0, str(ROOT / "ETL" / "events" / "load"))
_sys.path.insert(0, str(ROOT / "website" / "build" / "lib"))


def verify(path: _Path) -> str | None:
    """Is this actually a whole, readable SQLite database? Returns a problem or None.

    ── Why ────────────────────────────────────────────────────────────────
    On 2026-08-07 a pull of the volume produced a 427,819,008-byte file whose
    own header declared 132,367 pages of 4,096 bytes — 542,175,232 bytes. It was
    21% truncated, it was not reported as an error, and `PRAGMA quick_check`
    on it says `database disk image is malformed`. The transfer had been
    interrupted and the file left behind looked like a database.

    The previous version of this script downloaded straight onto data/db.sqlite,
    so that file would have REPLACED the local corpus. Not a stale copy — an
    unopenable one, with the original gone. Checked here, on the sidecar, before
    anything is swapped.
    """
    import struct

    try:
        head = path.open("rb").read(100)
    except OSError as exc:
        return f"unreadable: {exc}"
    if head[:16] != b"SQLite format 3\x00":
        return "not a SQLite database (bad magic)"
    page_size = struct.unpack(">H", head[16:18])[0]
    page_size = 65536 if page_size == 1 else page_size
    declared = struct.unpack(">I", head[28:32])[0] * page_size
    actual = path.stat().st_size
    if declared and actual < declared:
        return (f"TRUNCATED — the header declares {declared:,} bytes, the file is "
                f"{actual:,} ({100 * actual / declared:.0f}%). The transfer did not "
                f"finish.")
    import sqlite3
    try:
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            res = con.execute("PRAGMA quick_check(1)").fetchone()[0]
        finally:
            con.close()
    except sqlite3.DatabaseError as exc:
        return f"unopenable: {exc}"
    return None if res == "ok" else f"quick_check: {res}"


def local_only_rows(local: _Path, incoming: _Path) -> dict:
    """What swapping `incoming` over `local` would destroy.

    Delegated to `reconcile_stores.would_be_lost`, which is the ONE definition
    of that question and is used by the push direction too — so "would be lost"
    and "would be carried" can never mean two different sets of rows.

    This function used to be its own copy of the comparison, and it `continue`d
    past every table whose identity it could not use. A skipped table
    contributed nothing to the result, which is indistinguishable from a table
    with nothing at risk — so `public_funding_events`, whose declared identity
    named four columns that do not exist, was NEVER COMPARED and always
    reported as safe. See `would_be_lost` for the three verdicts that replace
    that silence.
    """
    from reconcile_stores import would_be_lost

    return would_be_lost(str(local), str(incoming))


def main() -> int:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--carry-forward", action="store_true",
                   help="merge the rows only the local store has into the fresh "
                        "copy before swapping. Nothing is lost locally, but the "
                        "corpus of record is still missing them — promote them "
                        "with reconcile_stores.py.")
    g.add_argument("--discard-local", action="store_true",
                   help="throw away everything the local store holds alone")
    args = ap.parse_args()

    incoming = DB.with_suffix(".sqlite.incoming")

    wake()
    try:
        rc = subprocess.run(
            ["npx", "--yes", "@railway/cli", "volume", "files",
             "--volume", "etl-pipeline-volume", "download", "/db.sqlite",
             str(incoming), "--overwrite"]
        ).returncode
    finally:
        # Waking the service replaces the cron schedule with `sleep infinity`.
        # A pull that succeeds and leaves the service woken has traded one
        # db.sqlite for the entire weekly refresh, silently — so the restore is
        # confirmed from Railway and its failure is fatal here even though the
        # download worked.
        restore_problems = restore()
    if rc != 0:
        incoming.unlink(missing_ok=True)
        return _sys.exit(f"pull failed (rc={rc})")
    if restore_problems:
        return _sys.exit(
            "db.sqlite pulled, but the cron schedule was NOT restored. "
            "Fix before anything else: python3 ETL/lib/verify_cron.py --deploy")

    problem = verify(incoming)
    if problem:
        print(f"\nREFUSED — what arrived is not a usable database.\n  {problem}")
        print(f"  Left at {incoming} for inspection; nothing was overwritten.")
        print("  Re-run. A transfer this size is interrupted often enough that the "
              "check\n  matters more than the retry does.")
        return 2

    if not DB.exists():
        incoming.replace(DB)
        print(f"Pulled the corpus of record -> {DB}")
        return 0

    from reconcile_stores import format_loss, proven_loss, unknowns

    lost = local_only_rows(DB, incoming)
    n_lost = proven_loss(lost)
    unknown = unknowns(lost)

    # An UNCOMPARABLE table is not a safe one. It is printed on every pull,
    # including the ones that proceed, because the alternative is a swap that
    # reports "nothing at risk" about a table it never looked at.
    if unknown:
        print(f"\nNOT PROVEN SAFE — {len(unknown)} table(s) could not be compared "
              f"row by row:")
        for _f, t, d in unknown:
            print(f"    {t:<32} {d['rows_losing']:,} here vs {d['rows_winning']:,} "
                  f"there — {d['why']}")
        print("  Equal or smaller counts do not prove no rows are lost. This is what "
              "the\n  comparison could not see, stated rather than omitted.")

    if n_lost and not (args.carry_forward or args.discard_local):
        print(f"\nREFUSED — the local store holds rows the corpus of record does not.")
        print(format_loss(lost, indent="  "))
        print(f"\n  The fresh copy is at {incoming} — nothing has been overwritten.")
        print("  These rows have no other copy. Overwriting them is not a sync, it")
        print("  is a deletion, and the previous version of this script did it")
        print("  silently as the first step of `make republish`.")
        print("\n  Promote them to the corpus of record (the right answer):")
        print(f"    python3 ETL/events/load/reconcile_stores.py \\")
        print(f"        --into {incoming} --from {DB} --family instruments")
        print("    then push the result back: ETL/events/extract/push_local.py")
        print("\n  Or, to decide here:")
        print("    --carry-forward   keep them locally; the record still lacks them")
        print("    --discard-local   delete them, knowingly")
        return 2

    if n_lost and args.carry_forward:
        from reconcile_stores import main as reconcile_main
        for family, tables in lost.items():
            if not any(d["lost"] for d in tables.values()):
                continue
            print(f"\ncarrying {family} forward into the fresh copy...")
            _sys.argv = ["reconcile_stores.py", "--into", str(incoming),
                         "--from", str(DB), "--family", family]
            reconcile_main()

    incoming.replace(DB)
    print(f"\nPulled the corpus of record -> {DB}")
    if n_lost and args.carry_forward:
        print(f"WARNING: {n_lost:,} row(s) were carried forward and exist ONLY on this "
              f"machine.\n  The corpus of record still does not have them, and "
              f"check_corpus_census will\n  report DIVERGED until they are promoted.")
    if n_lost and args.discard_local:
        print(f"DISCARDED {n_lost:,} row(s) that existed only locally, as asked.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
