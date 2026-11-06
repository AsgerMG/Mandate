"""Trigger a data renewal — one source, a whole tier, or list what's available.

The single entry point for "pull fresh data". Reads the source registry in
`manifest.py` and runs the matching extractor with the arguments that load a fresh
pull into `db.sqlite`. After any renewal, re-derive and snapshot:

    python3 ETL/events/transform/classify_taxonomy.py apply-nace
    python3 ETL/events/transform/classify_taxonomy.py run --max-cost 20
    python3 ETL/events/load/qa/sanity_check.py
    make backup                     # ETL/lib/backup_postgres.py

Usage:
  python3 ETL/events/extract/renew.py --list                 # registry, grouped by tier
  python3 ETL/events/extract/renew.py --auto                  # run every AUTO source
  python3 ETL/events/extract/renew.py --auto --dry-run        # show the commands only
  python3 ETL/events/extract/renew.py --source ademe cdti     # run specific sources
  python3 ETL/events/extract/renew.py --source isif_direct -- annual.pdf 2024-12-31   # MANUAL: pass the file
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import ETL  # noqa: E402
# --- end ETL path bootstrap ---

import argparse
import subprocess
import sys

from manifest import SOURCES, BY_KEY, TIERS

EXTRACT_DIR = ETL / "events" / "extract"
ICON = {"AUTO": "🟢", "NETWORK": "🟡", "MANUAL": "📄", "REJECTED": "⛔"}


def print_list() -> None:
    for tier in TIERS:
        rows = [s for s in SOURCES if s.tier == tier]
        if not rows:
            continue
        print(f"\n{ICON[tier]} {tier}  ({len(rows)})")
        for s in rows:
            cmd = " ".join(s.renew) if s.renew else "(needs file / not auto)"
            print(f"  {s.key:<22} {s.title:<42} {cmd}")
            if s.note:
                print(f"  {'':<22} └ {s.note}")
    print("\nAfter a renewal: classify -> sanity_check -> backup (see module docstring).")


def run_source(s, extra: list[str], dry: bool) -> int:
    module_path = EXTRACT_DIR / f"{s.module}.py"
    if s.tier == "REJECTED":
        print(f"⛔ {s.key}: deliberately not loaded — {s.note}")
        return 0
    if s.tier == "MANUAL" and not extra:
        print(f"📄 {s.key}: MANUAL — {s.note}")
        print(f"   run: python3 {module_path.relative_to(ETL.parent)} <file> [as_of]")
        return 0
    args = [sys.executable, str(module_path), *s.renew, *extra]
    pretty = " ".join([sys.executable.split('/')[-1], str(module_path.relative_to(ETL.parent)), *s.renew, *extra])
    if s.tier == "NETWORK":
        print(f"🟡 {s.key}: endpoint may need a specific host/network — {s.note or s.dep}")
    print(("DRY " if dry else "RUN ") + pretty)
    if dry:
        return 0
    return subprocess.run(args).returncode


def main() -> None:
    ap = argparse.ArgumentParser(description="Trigger a data renewal from the source registry.")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--list", action="store_true", help="show the source registry and exit")
    g.add_argument("--auto", action="store_true", help="run every AUTO-tier source")
    g.add_argument("--network", action="store_true", help="run every NETWORK-tier source (host-dependent)")
    g.add_argument("--source", nargs="+", metavar="KEY", help="run specific source keys")
    ap.add_argument("--dry-run", action="store_true", help="print commands, run nothing")
    ap.add_argument("extra", nargs="*", help="extra args passed through (after --) to a single MANUAL source")
    args = ap.parse_args()

    if args.list or not (args.auto or args.network or args.source):
        print_list()
        return

    if args.auto:
        targets = [s for s in SOURCES if s.tier == "AUTO"]
    elif args.network:
        targets = [s for s in SOURCES if s.tier == "NETWORK"]
    else:
        unknown = [k for k in args.source if k not in BY_KEY]
        if unknown:
            ap.error(f"unknown source key(s): {', '.join(unknown)}  (try --list)")
        targets = [BY_KEY[k] for k in args.source]

    extra = args.extra if len(targets) == 1 else []
    failures = []
    outcomes: dict[str, int] = {}
    for s in targets:
        rc = run_source(s, extra, args.dry_run)
        outcomes[s.key] = rc
        if rc != 0:
            failures.append((s.key, rc))
        print()
    # Per-source outcome for the run log (railway_cron.py attaches it to this
    # step in mandate.run_steps); the health check holds each AUTO source to
    # its cadence from it. Written only when asked for.
    import os  # noqa: PLC0415
    if os.environ.get("RENEW_RESULTS") and not args.dry_run:
        import json  # noqa: PLC0415
        _Path(os.environ["RENEW_RESULTS"]).write_text(json.dumps(outcomes))

    if failures:
        print("FAILED:", ", ".join(f"{k}(rc={rc})" for k, rc in failures))
        # ── Why a failed source does not always fail the run ──────────────────
        # Sources are other people's websites. They 403 behind Cloudflare, they
        # rate-limit, their TLS expires, they move a path. That is an external
        # condition and it is not a reason to throw away the sources that DID
        # publish -- but until now it was: renew.py exited 1 on any failure,
        # railway_cron.py exits on the first non-zero step, so ONE blocked
        # source cancelled classification, the sanity check and gap detection
        # for the whole week.
        #
        # Observed 2026-08-06 23:33 UTC: a single source failed and the weekly
        # refresh stopped there, having ingested nothing downstream.
        #
        # So the exit code now says which KIND of failure it was, rather than
        # only that there was one:
        #
        #   0  everything ran
        #   3  some sources failed, most succeeded -- a PARTIAL refresh. The
        #      caller should continue with what arrived and surface the list.
        #   1  most sources failed -- that is not the internet having a bad day,
        #      it is our pipeline, our credentials or our network being broken,
        #      and continuing would publish a corpus built from a fraction of
        #      the data.
        #
        # The threshold is a property, not a list: no source is named here, and
        # a source that starts failing forever shows up as a persistent partial
        # rather than being quietly tolerated -- `detect_eligibility_gaps.py`
        # and the coverage gate are what catch that.
        attempted = len(targets)
        if len(failures) * 2 <= attempted:
            print(f"PARTIAL: {len(failures)} of {attempted} source(s) failed; "
                  f"continuing with the {attempted - len(failures)} that "
                  f"published. Exit 3.")
            sys.exit(3)
        print(f"ABORT: {len(failures)} of {attempted} source(s) failed. That is "
              f"most of them, so this is a pipeline fault rather than an "
              f"unreachable source. Exit 1.")
        sys.exit(1)
    if not args.dry_run:
        print("Done. Next: python3 ETL/events/transform/classify_taxonomy.py apply-nace "
              "&& python3 ETL/events/transform/classify_taxonomy.py run --max-cost 20 "
              "&& python3 ETL/events/load/qa/sanity_check.py && make backup")


if __name__ == "__main__":
    main()
