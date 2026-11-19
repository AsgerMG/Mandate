"""The one list of open loops (mandate/plans/open_loops.yaml): load, check, print.

    python3 -m mandate.eval.open_loops            # the open items, grouped by state
    python3 -m mandate.eval.open_loops --json     # for the bench (Needs you -> Open loops)

The property the list exists for (owner, 19 Nov 2026: "we never really finish anything"): every item
says how it ends. `done` carries the date it closed; `parked` the TRIGGER that reopens it; `open`,
`in_progress` and `waiting_owner` the NEXT step (or, for the owner, the trigger phrase). A test fails
the build on an item that does not.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml

LIST = Path(__file__).resolve().parents[2] / "mandate" / "plans" / "open_loops.yaml"
STATES = ("in_progress", "open", "waiting_owner", "parked", "done")
BRAINS = ("wincent", "regina", "both")


def load(path: Path = LIST) -> list[dict]:
    return (yaml.safe_load(path.read_text()) or {}).get("loops") or []


def problems(loops: list[dict]) -> list[str]:
    out, seen = [], set()
    for x in loops:
        i = x.get("id") or "?"
        if i in seen:
            out.append(f"{i}: duplicate id")
        seen.add(i)
        if not x.get("title"):
            out.append(f"{i}: no title")
        if x.get("state") not in STATES:
            out.append(f"{i}: state must be one of {STATES}")
        if x.get("brain") not in BRAINS:
            out.append(f"{i}: brain must be one of {BRAINS}")
        need = {"done": ("closed",), "parked": ("trigger",)}.get(x.get("state"), ("next", "trigger"))
        if not any(x.get(k) for k in need):
            out.append(f"{i}: a {x.get('state')} item needs {' or '.join(need)}")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    loops = load()
    bad = problems(loops)
    if a.json:
        print(json.dumps({"loops": loops, "problems": bad}, ensure_ascii=False))
        return 0
    for s in STATES[:-1]:
        items = [x for x in loops if x.get("state") == s]
        if items:
            print(f"\n{s.upper()} ({len(items)})")
            for x in items:
                print(f"  - {x['title']}\n      {x.get('next') or x.get('trigger')}")
    print(f"\nclosed: {sum(x.get('state') == 'done' for x in loops)}")
    for b in bad:
        print(f"PROBLEM: {b}", file=sys.stderr)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
