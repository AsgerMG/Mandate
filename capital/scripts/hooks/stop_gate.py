#!/usr/bin/env python3
"""Stop hook: cheap, deterministic gates surfaced when work pauses.

Two checks, both WARN-ONLY (exit 0 always — a gate must never trap the user):
  1. Site-data freshness: any GENERATED file older than db.sqlite or missing.
  2. Methodology gate: any data source present in db.sqlite whose family token
     is not mentioned anywhere in docs/methodology.md (see ship-a-source step 8).

Silent when everything is clean. Never raises.
"""
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "db.sqlite"
SITE_DATA = ROOT / "site" / "public" / "data"
METHODOLOGY = ROOT / "docs" / "methodology.md"

# Keep in sync with scripts/build_site_data.py GENERATED.
GENERATED = [
    "coverage_ratings.json",
    "country_coverage.json",
    "country_map.json",
    "instrument_leaderboard.json",
    "synthesis.json",
    "investor_insights.json",
    "companies/manifest.json",
]


def check_freshness() -> list[str]:
    if not DB.exists():
        return []
    db_mtime = DB.stat().st_mtime
    stale = []
    for fname in GENERATED:
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
            "⚠ STALE site data — run `python3 scripts/build_site_data.py`:\n  "
            + "\n  ".join(stale)
        )
    undocumented = check_methodology()
    if undocumented:
        shown = ", ".join(undocumented[:8])
        more = "" if len(undocumented) <= 8 else f" (+{len(undocumented) - 8} more)"
        msgs.append(
            "⚠ Possible methodology gap — source families in db.sqlite not found "
            f"in docs/methodology.md: {shown}{more}\n"
            "  See the methodology gate in skills/ship-a-source step 8."
        )
    if msgs:
        sys.stderr.write("\n\n".join(msgs) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
