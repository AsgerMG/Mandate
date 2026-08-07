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


def local_only_rows(local: _Path, incoming: _Path) -> dict[str, dict[str, int]]:
    """Per family, per table, how many rows the LOCAL store holds alone.

    The one thing that decides whether the swap is safe. Uses the same identity
    definitions the reconciler merges on, so "would be lost" and "would be
    carried" can never mean two different sets of rows.
    """
    import sqlite3

    from corpus_stores import FAMILIES
    from reconcile_stores import IDENTITY, cols, has, load

    out: dict[str, dict[str, int]] = {}
    a = sqlite3.connect(f"file:{local}?mode=ro", uri=True)
    a.row_factory = sqlite3.Row
    b = sqlite3.connect(f"file:{incoming}?mode=ro", uri=True)
    b.row_factory = sqlite3.Row
    try:
        for family, tables in FAMILIES.items():
            for t in tables:
                if not has(a, t):
                    continue
                keys = IDENTITY.get(t)
                if not keys or any(k not in cols(a, t) for k in keys):
                    continue
                if not has(b, t):
                    n = a.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
                else:
                    n = len(set(load(a, t, keys)) - set(load(b, t, keys)))
                if n:
                    out.setdefault(family, {})[t] = n
    finally:
        a.close()
        b.close()
    return out


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

    if not DB.exists():
        incoming.replace(DB)
        print(f"Pulled the corpus of record -> {DB}")
        return 0

    lost = local_only_rows(DB, incoming)
    if lost and not (args.carry_forward or args.discard_local):
        print(f"\nREFUSED — the local store holds rows the corpus of record does not.")
        for family, tables in lost.items():
            print(f"  {family}:")
            for t, n in sorted(tables.items(), key=lambda kv: -kv[1]):
                print(f"    {t:<32} {n:>8,} rows exist ONLY here")
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

    if lost and args.carry_forward:
        from reconcile_stores import main as reconcile_main
        for family in lost:
            print(f"\ncarrying {family} forward into the fresh copy...")
            _sys.argv = ["reconcile_stores.py", "--into", str(incoming),
                         "--from", str(DB), "--family", family]
            reconcile_main()

    incoming.replace(DB)
    print(f"\nPulled the corpus of record -> {DB}")
    if lost and args.carry_forward:
        n = sum(sum(t.values()) for t in lost.values())
        print(f"WARNING: {n:,} row(s) were carried forward and exist ONLY on this "
              f"machine.\n  The corpus of record still does not have them, and "
              f"check_corpus_census will\n  report DIVERGED until they are promoted.")
    if lost and args.discard_local:
        n = sum(sum(t.values()) for t in lost.values())
        print(f"DISCARDED {n:,} row(s) that existed only locally, as asked.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
