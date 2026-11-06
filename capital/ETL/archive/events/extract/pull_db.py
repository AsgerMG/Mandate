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


def remedy(local, incoming) -> str:
    """What the operator does instead of overwriting. Built from the two real
    paths, so the commands offered at the moment of the refusal can be pasted
    rather than adapted.

    This text used to end "then push the result back:
    ETL/events/extract/push_local.py", and for a long time that instruction did
    not work. push_local uploads `local`, not `incoming`; and whichever of the
    two it uploaded, it could not be reached at all while this store was ahead
    — without --skip-pull it ran this script first and stopped on the refusal
    you are reading, and with --skip-pull it refused the upload for having
    skipped the pull. A refusal that names a fix which does not exist is worse
    than one that names none: it is followed, it fails somewhere else, and the
    guard gets blamed.

    CLOSED 2026-08-12. push_local's --skip-pull refusal was a second, weaker
    implementation of a rule `check_push_is_not_a_deletion` already enforces
    exactly, by downloading the record and comparing it at the moment of the
    upload — which a question about whether a pull happened recently cannot
    match. So the promotion path is `--carry-forward` here, then the union,
    then `push_local.py --skip-pull`, and this text says so. It still routes
    through `local`, so the union has to be built INTO the store push_local
    uploads; that is stated in the steps rather than left to be discovered.
    """
    return (
        f"  The fresh copy is at {incoming} — nothing has been overwritten.\n"
        "  These rows have no other copy. Overwriting them is not a sync, it is a\n"
        "  deletion, and the first version of this script did it silently as the\n"
        "  first step of `make republish`.\n\n"
        "  Keep them, here and now:\n"
        "    --carry-forward   merge them into the fresh copy before the swap.\n"
        "                      Nothing is lost locally. The corpus of record is\n"
        "                      still missing them, so this stays DIVERGED.\n"
        "    --discard-local   delete them, knowingly\n\n"
        "  PROMOTE them to the record, in this order:\n"
        "    1. --carry-forward here, so the fresh copy keeps them\n"
        "    2. build the union INTO the store push_local uploads:\n"
        "       python3 ETL/events/load/reconcile_stores.py \\\n"
        f"           --into {local} --from {incoming} --family instruments\n"
        "    3. python3 ETL/events/extract/push_local.py --skip-pull\n\n"
        "  Step 3 is guarded where it matters: check_push_is_not_a_deletion\n"
        "  downloads the record and compares it AT the upload, so a store that\n"
        "  is behind still cannot overwrite one that is ahead.\n\n"
        "  The direction in step 2 is not interchangeable. The record can hold\n"
        "  rows this laptop has never seen — on 2026-08-12 it held two nobody\n"
        "  else did — and the union has to end up in the file that gets\n"
        "  uploaded. Meanwhile the rows are safe either way: corpus-ledger/\n"
        "  holds a committed third copy of the authored corpus:\n"
        "    python3 ETL/events/load/instrument_ledger.py verify")


def swap_decision(local, incoming, carry_forward: bool, discard_local: bool):
    """May the fresh copy replace the local one, and what is the operator shown
    first? Reads only; the caller does the swapping.

    Split out from `main` so the DECISION can be tested where the transfer
    cannot run — `test_overwrite_refusal.py` drives this function against
    fixture stores with no credentials and no network. A guard whose only entry
    point needs a 645 MB download and a woken Railway service is a guard that
    is never exercised until the night it matters.

    Both flags are named resolutions and both make the gate itemise what is at
    risk before the caller acts. They differ in the verb, and the difference is
    real: `--carry-forward` merges the local-only rows into the fresh copy, so
    nothing is deleted, while `--discard-local` deletes them. Reporting the
    first as a destruction would spend the word on a case where it is untrue,
    and a word spent that way stops being read on the day it is true.
    """
    from reconcile_stores import overwrite_gate

    override, destroys = None, True
    if discard_local:
        override, destroys = "--discard-local", True
    elif carry_forward:
        override, destroys = "--carry-forward", False
    return overwrite_gate(str(local), str(incoming), override=override,
                          remedy=remedy(local, incoming), destroys=destroys)


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

    from reconcile_stores import proven_loss

    # The decision, and everything the operator is told, comes from one
    # function — the same one the push direction calls and the same one the
    # refusal test drives with no network. What is printed here is printed
    # BEFORE the swap on every path, including the overrides.
    proceed, told, lost = swap_decision(DB, incoming, args.carry_forward,
                                        args.discard_local)
    n_lost = proven_loss(lost)
    if told:
        print(told)
    if not proceed:
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
