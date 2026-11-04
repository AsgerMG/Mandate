"""Every guard in this repository runs somewhere, or says why it does not.

── The class this closes ──────────────────────────────────────────────────
`check_guard_registry.py` already asserts that every REGISTERED guard has a
publisher and every publisher is registered. That closes the loop for guards
somebody remembered to register. It cannot see the other direction, which is
the one that keeps happening:

    a file called check_*.py or check_*.ts exists, asserts a real property,
    and is named by no workflow, no cron, no registry and no npm script.

Nothing goes red. Nothing goes green. The guard simply is not there, and the
only way to find out is for somebody to audit the tree by hand — which is how
all eight of the ones below were found, days after they stopped mattering.

On 2026-08-08 that set was:

  check_applicant_identity   in NOTHING. Red at the time of writing: five
                             published eligibility texts describe a population
                             that cannot apply, so a founder is routed to a
                             fund they will be rejected from at the end.
  check_index_freshness      reachable only from ETL/refresh.py, itself only
                             reachable by a human typing `make refresh`. Red:
                             954 attributable gates the advisor may state and
                             cannot retrieve.
  check_capital_reach        `npm run check` only, and positioned after a link
                             that is red today, so it runs nowhere at all.
  check_country_gates        `npm run check` only.
  check_gate_field_reach     `npm run check` only.
  check_gate_pertinence      `npm run check` only, after the red link.
  check_gate_subject         one Makefile target only.
  check_ticket_effect        in NOTHING, and not a guard at all -- it prints a
                             table and asserts nothing. A measurement wearing a
                             guard's name, which is why it took an audit to
                             tell the two apart.

── The property, not the list ─────────────────────────────────────────────
The eight above are today's instances and the next one is already being
written. So the rule is derived, per file, from the tree:

    every check_* module is named by an AUTOMATIC path, or is declared in
    data/guard_registry.json under `manual` with a reason.

An automatic path is one that runs without anybody choosing to run it: a
GitHub workflow, the weekly Railway cron, or the guard registry (whose
verdicts a workflow asserts on). `npm run check` is deliberately NOT one --
it is a command a human types, and "somebody will run it" is the assumption
every entry in the list above was resting on.

Declaring a guard `manual` is a real answer -- some guards cost money, and
some need a credential no automatic runner should hold. It is just not an
answer anybody can give by accident, which is the whole difference.

── Why a manual declaration expires ───────────────────────────────────────
An escape hatch with no clock becomes the orphanage. "Declared manual, with a
reason" is one honest sentence away from "orphaned, with an excuse", and the
difference is invisible six weeks later when the reason has stopped being
true. So a manual entry carries a `review` date and this check FAILS once it
passes -- the same shape as the reviewed exceptions register in
website/frontend/scripts/check_dependencies.ts, and for the same reason: a
suppression nobody is forced to revisit is a suppression that outlives its
justification.

Reviewing costs one of three edits: wire the guard up, move the date and say
what changed, or delete the guard. All three are better than the silence.

Usage: python3 ETL/schema/check_guard_reachability.py
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REGISTRY = ROOT / "data" / "guard_registry.json"

# Paths that run without a human choosing to. A guard named in one of these is
# reachable; a guard named anywhere else is not, however often somebody means
# to type the command.
AUTOMATIC = {
    "ci.yml": ROOT / ".github" / "workflows" / "ci.yml",
    "corpus-currency.yml": ROOT / ".github" / "workflows" / "corpus-currency.yml",
    "railway_cron.py": ROOT / "ETL" / "events" / "extract" / "railway_cron.py",
    "guard_registry.json": REGISTRY,
}

# Where guards live. Both languages, because the split is an implementation
# detail and an orphan in either is the same defect.
GUARD_DIRS = [
    ROOT / "ETL" / "schema",
    ROOT / "ETL" / "terms",
    ROOT / "website" / "frontend" / "scripts",
]


def uncommented(text: str) -> str:
    """Source with comment lines removed.

    A guard's prose routinely NAMES other guards -- railway_cron.py explains at
    length which checks moved out of CI and why. Counting those as invocations
    would mark an orphan reachable because somebody documented it, which is
    exactly the wrong way round: the better the explanation, the greener the
    check. Only lines that could actually run count.
    """
    out = []
    for line in text.splitlines():
        stripped = line.lstrip()
        if stripped.startswith(("#", "//", "*", "/*")):
            continue
        out.append(line)
    return "\n".join(out)


def guard_modules() -> list[Path]:
    found = []
    for d in GUARD_DIRS:
        if not d.is_dir():
            continue
        for p in sorted(d.iterdir()):
            # A `*.test.ts` beside a check is not a second check needing a
            # runner: its automatic path is the test runner, by construction,
            # and `npx vitest run` is in CI and in every agent's verification
            # block. Demanding a CI step for it would be demanding that vitest
            # be invoked twice.
            if p.name.endswith(".test.ts"):
                continue
            if p.name.startswith("check_") and p.suffix in (".py", ".ts"):
                found.append(p)
    return found


def main() -> int:
    if not REGISTRY.exists():
        print(f"FAILED: {REGISTRY} does not exist; there is nowhere to declare "
              f"a guard's path.")
        return 1
    registry = json.loads(REGISTRY.read_text())
    manual = registry.get("manual", {})

    sources = {name: uncommented(p.read_text()) if p.exists() else ""
               for name, p in AUTOMATIC.items()}
    # The registry counts as an automatic path only through its `guards` array.
    # The `manual` block lives in the same file and names every orphan in it, so
    # reading the file whole would mark each one reachable BY ITS OWN
    # DECLARATION -- a check that goes green because you told it something is
    # broken. Only the array that actually causes a verdict to be published.
    missing_paths = [n for n, p in AUTOMATIC.items() if not p.exists()]
    sources["guard_registry.json"] = json.dumps(registry.get("guards", []))

    problems: list[str] = []
    reachable, declared = 0, 0

    for mod in guard_modules():
        stem = mod.stem
        rel = mod.relative_to(ROOT)
        hits = [n for n, text in sources.items() if stem in text]
        if hits:
            reachable += 1
            if stem in manual:
                problems.append(
                    f"{rel}\n"
                    f"      is declared `manual` in data/guard_registry.json, and is ALSO "
                    f"run by {', '.join(hits)}.\n"
                    f"      Two answers to 'when does this run'. Remove the manual "
                    f"declaration.")
            continue
        if stem in manual:
            declared += 1
            entry = manual[stem]
            reason = entry.get("reason") if isinstance(entry, dict) else None
            review = entry.get("review") if isinstance(entry, dict) else None
            if not isinstance(reason, str) or len(reason.strip()) < 20:
                problems.append(
                    f"{rel}\n"
                    f"      is declared `manual` with no real reason ({reason!r}).\n"
                    f"      A guard that runs only when somebody remembers needs to say "
                    f"what stops\n"
                    f"      that from being an accident -- what it costs, or which "
                    f"credential no\n"
                    f"      automatic runner may hold.")
                continue
            try:
                due = date.fromisoformat(str(review))
            except ValueError:
                problems.append(
                    f"{rel}\n"
                    f"      is declared `manual` with no usable `review` date "
                    f"({review!r}).\n"
                    f"      Manual declarations expire on purpose -- see the module "
                    f"docstring.\n"
                    f"      Use YYYY-MM-DD.")
                continue
            if due < date.today():
                problems.append(
                    f"{rel}\n"
                    f"      was declared `manual` for review by {due.isoformat()}, which "
                    f"has passed.\n"
                    f"      The reason on file: {reason.strip()}\n"
                    f"      Wire it into an automatic path, move the date and say what\n"
                    f"      changed, or delete the guard. Leaving it is the one option "
                    f"this\n"
                    f"      check exists to remove.")
            continue
        problems.append(
            f"{rel}\n"
            f"      is in NO automatic path: not {', '.join(AUTOMATIC)}.\n"
            f"      It runs only if somebody types the command, which is the same as "
            f"not\n"
            f"      running. Either wire it into one of those paths, or declare it "
            f"under\n"
            f"      `manual` in data/guard_registry.json with the reason it cannot be "
            f"wired.\n"
            f"      Note that `npm run check` does NOT count: it is a command a human "
            f"types.")

    if missing_paths:
        problems.append(
            f"automatic path(s) not found: {', '.join(missing_paths)}.\n"
            f"      Every guard would look unreachable, or -- worse -- reachable via "
            f"the\n"
            f"      ones that remain. Fix the path in AUTOMATIC above.")

    if problems:
        print("check_guard_reachability: FAILED\n")
        for p in problems:
            print(f"  - {p}\n")
        print(f"  {reachable} guard(s) reachable, {declared} declared manual, "
              f"{len(problems)} problem(s).")
        return 1

    print(f"check_guard_reachability: ok — {reachable} guard(s) run in an "
          f"automatic path, {declared} declared manual with a reason.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
