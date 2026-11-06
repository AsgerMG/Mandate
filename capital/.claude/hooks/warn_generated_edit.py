#!/usr/bin/env python3
"""PostToolUse hook: warn when a *generated* site-data file is hand-edited.

`web/public/data/*.json` is written by `website/build/build_site_data.py`
(see its GENERATED map). Editing it by hand is silently overwritten on the next build.
This hook surfaces that to the model (exit 2 feeds stderr back as feedback).

Reads the hook payload as JSON on stdin; never raises (a hook must not break the
session). The static geo asset world-110m.json is exempt.
"""
import json
import sys

EXEMPT = {"world-110m.json"}


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    path = ""
    try:
        path = (payload.get("tool_input") or {}).get("file_path", "") or ""
    except Exception:
        return 0

    norm = path.replace("\\", "/")
    if "web/public/data/" not in norm:
        return 0
    if norm.rsplit("/", 1)[-1] in EXEMPT:
        return 0

    sys.stderr.write(
        "⚠ You edited a GENERATED data file under web/public/data/.\n"
        "  These are written by website/build/build_site_data.py (see its GENERATED "
        "map) and will be overwritten on the next build.\n"
        "  Edit the upstream builder instead, then run "
        "`python3 website/build/build_site_data.py`.\n"
    )
    return 2  # surface to the model as actionable feedback


if __name__ == "__main__":
    sys.exit(main())
