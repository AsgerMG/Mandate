#!/usr/bin/env python3
"""Stop hook: cheap, deterministic gates surfaced when work pauses.

Two checks, both WARN-ONLY (exit 0 always — a gate must never trap the user):
  1. Site-data freshness: any GENERATED file older than db.sqlite or missing.
  2. Methodology gate: any data source present in db.sqlite whose family token
     is not mentioned anywhere in project-mgmt/methodology.md (update it when
     adding a source).

Silent when everything is clean. Never raises.
"""
import importlib.util
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ETL" / "lib"))
from web_path import WEB  # noqa: E402  (the web app, <monorepo>/web)
DB = ROOT / "data" / "db.sqlite"
SITE_DATA = WEB / "public" / "data"
METHODOLOGY = ROOT / "project-mgmt" / "methodology.md"
BUILDER = ROOT / "website" / "build" / "build_site_data.py"


def generated() -> tuple[list[str], str | None]:
    """The list of generated site-data files, READ FROM THE BUILDER.

    This used to be a copy, under a comment saying "keep in sync with
    website/build/build_site_data.py GENERATED". It was not in sync, and the
    standing rule in this repo is that such a comment IS the bug. The two lists
    disagreed in three places on 2026-08-08:

      * this one named `companies/manifest.json`, which does not exist anywhere
        in the repo, so the hook reported one MISSING file unconditionally
        whenever db.sqlite was present -- a warning that is always on, which is
        a warning nobody reads;
      * and it was missing `taxonomy.json` and `companies_index.json`, so two
        files that DO go stale were the two it could never report.

    A hook that cries wolf about a phantom while staying quiet about two real
    files is worse than no hook. Importing the builder's own dict means the next
    generated file is covered the moment it is added there.

    Returns (files, error). Never raises: this is a Stop hook and it must not be
    able to trap the user. But an import failure is REPORTED rather than
    swallowed -- silently checking nothing is the failure being fixed.
    """
    try:
        sys.path.insert(0, str(BUILDER.parent / "lib"))
        sys.path.insert(0, str(BUILDER.parent))
        spec = importlib.util.spec_from_file_location("_bsd", BUILDER)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return list(mod.GENERATED), None
    except Exception as e:  # noqa: BLE001
        return [], f"{type(e).__name__}: {e}"


def check_freshness() -> list[str]:
    if not DB.exists():
        return []
    files, err = generated()
    if err:
        return [f"(could not read the file list from "
                f"{BUILDER.relative_to(ROOT)}: {err} — nothing was checked)"]
    db_mtime = DB.stat().st_mtime
    stale = []
    for fname in files:
        p = SITE_DATA / fname
        if not p.exists():
            stale.append(f"{fname} (MISSING)")
        elif p.stat().st_mtime < db_mtime:
            stale.append(f"{fname} (older than db.sqlite)")
    return stale


def check_methodology() -> list[str]:
    if not DB.exists() or not METHODOLOGY.exists():
        return []
    raw = METHODOLOGY.read_text(errors="ignore").lower()
    # Normalised text strips punctuation/spaces so a source token like
    # "europes" matches prose "Europe's Rail" → "europesrail".
    text_norm = re.sub(r"[^a-z0-9]", "", raw)
    try:
        con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
        rows = con.execute(
            "SELECT DISTINCT source FROM public_funding_events "
            "WHERE source IS NOT NULL"
        ).fetchall()
        con.close()
    except Exception:
        return []
    # Family token = leading alphabetic run, lowercased.
    families = set()
    for (src,) in rows:
        m = re.match(r"[a-zA-Z]+", str(src))
        if m and len(m.group(0)) >= 3:
            families.add(m.group(0).lower())
    return sorted(f for f in families if f not in text_norm)


def main() -> int:
    msgs = []
    stale = check_freshness()
    if stale:
        msgs.append(
            "⚠ STALE site data — run `python3 website/build/build_site_data.py`:\n  "
            + "\n  ".join(stale)
        )
    undocumented = check_methodology()
    if undocumented:
        shown = ", ".join(undocumented[:8])
        more = "" if len(undocumented) <= 8 else f" (+{len(undocumented) - 8} more)"
        msgs.append(
            "⚠ Possible methodology gap — source families in db.sqlite not found "
            f"in project-mgmt/methodology.md: {shown}{more}\n"
            "  Add the new source to project-mgmt/methodology.md."
        )
    if msgs:
        sys.stderr.write("\n\n".join(msgs) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
