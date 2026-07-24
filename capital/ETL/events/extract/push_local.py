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
    print("=== Pulling fresh Railway DB ===")
    cmd = ["npx", "--yes", "@railway/cli", "volume", "files",
           "--volume", "etl-pipeline-volume", "download", "/db.sqlite",
           str(DB), "--overwrite"]
    rc = run(cmd, dry)
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


def push_db(dry: bool) -> None:
    print("\n=== Pushing db.sqlite back to the Railway volume ===")
    cmd = ["npx", "--yes", "@railway/cli", "volume", "files",
           "--volume", "etl-pipeline-volume", "upload",
           str(DB), "/db.sqlite", "--overwrite"]
    rc = run(cmd, dry)
    if rc != 0:
        sys.exit(f"push failed (rc={rc}) -- Railway volume still has the pre-push data")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                  formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="print commands, run nothing")
    ap.add_argument("--skip-pull", action="store_true", help="use local db.sqlite as-is")
    ap.add_argument("--skip-push", action="store_true", help="don't upload the result")
    args = ap.parse_args()

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
            push_db(args.dry_run)
    finally:
        if needs_wake and not args.dry_run:
            restore()

    print("\nDone.")


if __name__ == "__main__":
    main()
