"""Trigger a data renewal — one source, a whole tier, or list what's available.

The single entry point for "pull fresh data". Reads the source registry in
`manifest.py` and runs the matching extractor with the arguments that load a fresh
pull into `db.sqlite`. After any renewal, re-derive and snapshot:

    python3 ETL/events/transform/classify.py
    python3 ETL/events/load/qa/sanity_check.py
    python3 ETL/events/load/backup.py

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
    for s in targets:
        rc = run_source(s, extra, args.dry_run)
        if rc != 0:
            failures.append((s.key, rc))
        print()

    if failures:
        print("FAILED:", ", ".join(f"{k}(rc={rc})" for k, rc in failures))
        sys.exit(1)
    if not args.dry_run:
        print("Done. Next: python3 ETL/events/transform/classify.py "
              "&& python3 ETL/events/load/qa/sanity_check.py && python3 ETL/events/load/backup.py")


if __name__ == "__main__":
    main()
