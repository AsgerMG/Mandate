"""Local push: run every source that can't run on Railway, then push the
result back to the Railway volume. This is the other half of the automation
split -- 26 of 43 sources run unattended on the Sunday Railway cron
(railway_cron.py); everything else runs here, on your own machine, on
whatever cadence you trigger it.

Three groups, run in order:
  1. NETWORK-tier sources confirmed/likely blocked from cloud infrastructure
     (innovationsfonden, innovasjon_norge, nfr, innosuisse, tacr, baltic_ndbs,
     sudop) -- run via renew.py --source, plus a second baltic_ndbs pass for
     Estonia (its default args only cover Latvia). `satr` is deliberately
     excluded: it's a two-step human-reviewed stage->apply process, not a
     plain fetch-and-load -- run it by hand (see manifest.py's note).
  2. MANUAL sources that take a <file> [as_of] argument: drop the source's
     document into data/manual_inbox/<source_key>.<ext> and this picks it up
     automatically, using today's date as `as_of`. Two MANUAL sources
     (bpifrance_urd_stakes, eifo_note12) are NOT included here -- their
     main() hardcodes the data/PDF-page rather than accepting a file
     argument, so a new annual report needs an actual code edit, not a
     file drop.
  3. classify + sanity_check, then push data/db.sqlite back to the Railway
     volume (single-file upload -- NOT a directory upload, which nests
     incorrectly; see project history).

Usage:
  python3 ETL/events/extract/push_local.py            # full cycle
  python3 ETL/events/extract/push_local.py --dry-run   # show what would run
  python3 ETL/events/extract/push_local.py --skip-pull # use local db.sqlite as-is
  python3 ETL/events/extract/push_local.py --skip-push # don't upload the result
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

import argparse
import datetime
import subprocess
import sys

INBOX = ROOT / "data" / "manual_inbox"

# NETWORK-tier sources safe to batch-run with their default args (no per-run
# extra arguments needed). `satr` is deliberately excluded -- see docstring.
NETWORK_BATCH = [
    "innovationsfonden", "innovasjon_norge", "nfr", "innosuisse", "tacr",
    "baltic_ndbs",  # default args cover Latvia only
    "sudop",
]

# MANUAL sources that accept `<file> <as_of>` (or `<file>` for a couple) via
# `renew.py --source <key> -- ...`. Value = number of positional args after
# the file path (0 = file only, 1 = file + as_of).
MANUAL_FILE_SOURCES = {
    "future_fund": 1,
    "ee_register_stakes": 1,
    "investinor_portfolio": 1,
    "isif_direct": 1,
    "pfr_ventures": 1,
    "tesi_directs": 1,
}

RENEW = [sys.executable, str(ROOT / "ETL/events/extract/renew.py")]


def run(cmd: list[str], dry: bool) -> int:
    print("DRY " if dry else "RUN ", " ".join(cmd))
    if dry:
        return 0
    return subprocess.run(cmd).returncode


def pull_db(dry: bool) -> None:
    """Delegated to pull_db.py rather than repeated here.

    This function used to be its own copy of the download, with the same
    `--overwrite` onto data/db.sqlite — so the safety added to pull_db.py would
    have applied to `make pull-db` and not to the push cycle, which is the same
    deletion by a different route. One implementation, one refusal.
    """
    print("=== Pulling the corpus of record ===")
    rc = run([sys.executable, str(ROOT / "ETL/events/extract/pull_db.py")], dry)
    if rc == 2:
        sys.exit("\nThe pull refused: this machine holds rows the corpus of record "
                 "does not.\nResolve as it instructs, then re-run. Pushing on top of "
                 "this would\noverwrite the record with a store that is "
                 "simultaneously ahead and behind.")
    if rc != 0:
        sys.exit(f"pull failed (rc={rc}) -- aborting before touching local data")


def run_network_sources(dry: bool) -> list[str]:
    print("\n=== NETWORK-tier sources (local egress) ===")
    failures = []
    rc = run(RENEW + ["--source", *NETWORK_BATCH], dry)
    if rc != 0:
        failures.append("network-batch")
    rc = run(RENEW + ["--source", "baltic_ndbs", "--", "--country", "EE"], dry)
    if rc != 0:
        failures.append("baltic_ndbs(EE)")
    print("NOTE: 'satr' is not run automatically -- it's a deliberate two-step "
          "human-reviewed process (run_satr_all.sh, then load_satr.py --staging "
          "--apply). Run it by hand when you want a fresh pull.")
    return failures


def run_manual_inbox(dry: bool) -> list[str]:
    print(f"\n=== MANUAL inbox ({INBOX}) ===")
    if not INBOX.exists():
        print("(inbox directory doesn't exist yet, nothing to pick up)")
        return []
    today = datetime.date.today().isoformat()
    failures = []
    found_any = False
    for key, extra_args in MANUAL_FILE_SOURCES.items():
        matches = sorted(p for p in INBOX.glob(f"{key}.*") if p.is_file())
        if not matches:
            continue
        found_any = True
        doc = matches[0]
        args = [str(doc)] if extra_args == 0 else [str(doc), today]
        rc = run(RENEW + ["--source", key, "--", *args], dry)
        if rc != 0:
            failures.append(key)
    if not found_any:
        print(f"(no files in {INBOX} matching a known MANUAL source key)")
    print("NOTE: bpifrance_urd_stakes and eifo_note12 are NOT picked up here -- "
          "their extractors hardcode the source data/PDF page, so a new annual "
          "report needs a code edit, not a file drop.")
    return failures


def push_db(dry: bool, skipped_pull: bool, force: bool = False) -> None:
    """Upload the local store over the corpus of record — after proving it costs
    nothing, at the moment of the upload.

    ── Why the pull is not the proof ──────────────────────────────────────
    This used to reason: the pull at the top of the cycle refused if the local
    store was ahead, therefore this upload is the record plus this run's
    additions, therefore it is safe. Three things break that argument, and all
    three are ordinary:

      · the cycle between the pull and this line runs 43 extractors and a
        classification pass. It takes hours. The Sunday cron can fire inside it.
      · `pull_db.py --carry-forward` is a documented, sanctioned exit that
        proceeds while the record is missing rows — and its own advice is to
        promote them by pushing, i.e. through here.
      · the pull's comparison was, until 2026-08-11, blind to
        `public_funding_events` entirely. An argument built on it inherited the
        blindness.

    So the check happens HERE, against the record as it is now, immediately
    before the overwrite. It costs one download of a file we are about to
    replace; the thing it protects is a table of awards from registers that
    republish a current file and keep no history, where a deleted row has no
    second copy anywhere in the world.
    """
    if skipped_pull and not dry:
        sys.exit("\nREFUSED: --skip-push is missing and --skip-pull was given.\n"
                 "  This would upload a local copy of unknown age over the corpus of\n"
                 "  record, deleting whatever the weekly cron has gathered since it\n"
                 "  was taken. Either drop --skip-pull, or add --skip-push, or\n"
                 "  reconcile explicitly:\n"
                 "    python3 ETL/events/load/reconcile_stores.py --report <record> <local>")

    if not dry and not force:
        check_push_is_not_a_deletion()

    print("\n=== Pushing db.sqlite back to the Railway volume ===")
    cmd = ["npx", "--yes", "@railway/cli", "volume", "files",
           "--volume", "etl-pipeline-volume", "upload",
           str(DB), "/db.sqlite", "--overwrite"]
    rc = run(cmd, dry)
    if rc != 0:
        sys.exit(f"push failed (rc={rc}) -- Railway volume still has the pre-push data")


def check_push_is_not_a_deletion() -> None:
    """Refuse the upload if the record holds rows this file does not.

    The losing store is the RECORD and the winning store is the laptop — the
    opposite assignment from the pull, and the same one measurement, so the two
    directions cannot come to disagree about what "would be lost" means.
    """
    sys.path.insert(0, str(ROOT / "ETL" / "events" / "load"))
    sys.path.insert(0, str(ROOT / "website" / "build" / "lib"))
    from reconcile_stores import format_loss, proven_loss, unknowns  # noqa: E402

    sys.path.insert(0, str(ROOT / "ETL" / "events" / "extract"))
    from pull_db import verify  # noqa: E402

    witness = DB.with_suffix(".sqlite.record-witness")
    print("\n=== Checking what this push would delete from the corpus of record ===")
    rc = subprocess.run(
        ["npx", "--yes", "@railway/cli", "volume", "files",
         "--volume", "etl-pipeline-volume", "download", "/db.sqlite",
         str(witness), "--overwrite"]).returncode
    if rc != 0:
        witness.unlink(missing_ok=True)
        sys.exit(f"\nREFUSED: could not read the corpus of record (rc={rc}), so this "
                 f"push\n  cannot be shown to be safe. An overwrite whose cost is "
                 f"unknown is not a\n  sync. Re-run, or --force-overwrite if you have "
                 f"another reason to believe\n  the record holds nothing this file "
                 f"lacks.")
    problem = verify(witness)
    if problem:
        witness.unlink(missing_ok=True)
        sys.exit(f"\nREFUSED: what came back from the volume is not a usable database "
                 f"—\n  {problem}\n  The comparison cannot be made, so the push does "
                 f"not happen.")

    lost = would_be_lost_wrapper(witness)
    n = proven_loss(lost)
    unk = unknowns(lost)
    if unk:
        print(f"\nNOT PROVEN SAFE — {len(unk)} table(s) on the record could not be "
              f"compared row by row:")
        for _f, t, d in unk:
            print(f"    {t:<32} {d['rows_losing']:,} on the record vs "
                  f"{d['rows_winning']:,} here — {d['why']}")
    if n:
        witness_note = f"  A copy of the record is at {witness} — it has not been touched."
        sys.exit(f"\nREFUSED — the corpus of record holds {n:,} row(s) this file does "
                 f"not.\n  Uploading over it is a deletion, not a sync.\n\n"
                 f"{format_loss(lost, indent='  ')}\n\n{witness_note}\n\n"
                 f"  Merge them in rather than deleting them:\n"
                 f"    python3 ETL/events/load/reconcile_stores.py \\\n"
                 f"        --into {DB} --from {witness} --family events\n"
                 f"    then re-run this push.\n\n"
                 f"  Or --force-overwrite to destroy them knowingly.")
    witness.unlink(missing_ok=True)
    print(f"  ok — the record holds no row this file lacks. Safe to overwrite.")


def would_be_lost_wrapper(witness) -> dict:
    """The record is the LOSING store here: it is the one about to be replaced."""
    from reconcile_stores import would_be_lost
    return would_be_lost(str(witness), str(DB))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                  formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="print commands, run nothing")
    ap.add_argument("--skip-pull", action="store_true", help="use local db.sqlite as-is")
    ap.add_argument("--skip-push", action="store_true", help="don't upload the result")
    ap.add_argument("--force-overwrite", action="store_true",
                    help="upload even though the corpus of record holds rows this "
                         "file does not. Named for what it does: it deletes them.")
    args = ap.parse_args()

    restore_problems: list[str] = []
    needs_wake = not (args.skip_pull and args.skip_push)
    if needs_wake and not args.dry_run:
        wake()
    try:
        if not args.skip_pull:
            pull_db(args.dry_run)

        failures = []
        failures += run_network_sources(args.dry_run)
        failures += run_manual_inbox(args.dry_run)

        print("\n=== classify_taxonomy + sanity_check ===")
        run([sys.executable, str(ROOT / "ETL/events/transform/classify_taxonomy.py"),
             "apply-nace"], args.dry_run)
        run([sys.executable, str(ROOT / "ETL/events/transform/classify_taxonomy.py"),
             "run", "--max-cost", "20"], args.dry_run)
        run([sys.executable, str(ROOT / "ETL/events/load/qa/sanity_check.py")], args.dry_run)
        run([sys.executable, str(ROOT / "ETL/terms/detect_eligibility_gaps.py")], args.dry_run)

        if failures:
            print(f"\nFAILED: {', '.join(failures)} -- pushing anyway (partial "
                  f"progress is still progress; re-run to retry the failed ones).")

        if not args.skip_push:
            push_db(args.dry_run, skipped_pull=args.skip_pull,
                    force=args.force_overwrite)
    finally:
        if needs_wake and not args.dry_run:
            restore_problems = restore()

    if restore_problems:
        # The push succeeded; the weekly refresh did not survive it. That is
        # worse than a failed push and must not be reported as "Done."
        sys.exit("\nPushed, but the cron schedule was NOT restored — the weekly "
                 "ETL will not run. Repair first:\n"
                 "  python3 ETL/lib/verify_cron.py --deploy")
    print("\nDone.")


if __name__ == "__main__":
    main()
