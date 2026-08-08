"""Every registered guard has a publisher, and every publisher is registered.

── What this is defending ─────────────────────────────────────────────────
The verdict channel replaces "the check runs in CI" with "the check ran
somewhere, and said so". That buys a great deal — the guards that need a corpus
CI may not see now run where the corpus is, and nothing has to hand GitHub a
connection string to the production database — and it introduces one new way to
be wrong that the old arrangement did not have:

    a guard can be listed as required and have nobody publishing it,
    or publish under a name nothing is looking for.

Neither shows up as a failure. The first goes red forever, which gets muted; the
second goes green forever, which is worse. Both are the same defect this repo
keeps finding in a new place: work reporting success having checked nothing.

So the registry, the cron, and the scripts are checked against each other:

  1. every id is unique, and every path a verdict is bound to exists
  2. every `weekly` guard is actually driven by ETL/events/extract/railway_cron.py
     (or by the census, which publishes itself)
  3. every `on_change` guard is claimed by exactly one frontend script
  4. nothing publishes under an id the registry does not know
  5. a guard's fingerprint covers its own implementation -- otherwise editing
     the guard leaves its old verdict looking current
  6. `npm run check` still ends in check_verdicts, which is what closes the
     loop on the machine that has the credentials
  7. no workflow holds a secret of ours

── On (7), which is the reason for the other six ──────────────────────────
This whole channel exists so that GitHub Actions never needs a connection
string to the production database. The cheap way to make any of the checks
above go green is to put one back, and it would work, and it would silently
undo the thing that was bought. So the property is asserted directly, and as a
PROPERTY rather than a list of forbidden variable names:

    every workflow must be able to run every step it has with an empty
    secret store.

The single exception is `secrets.GITHUB_TOKEN`, which Actions provides
intrinsically and which the `permissions:` block scopes; it is not a credential
we hold or could leak from here. Anything else fails, including a name nobody
has thought of yet — which is the point, since the next one will not be called
DATABASE_URL.

Usage: python3 ETL/schema/check_guard_registry.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REGISTRY = ROOT / "data" / "guard_registry.json"
CRON = ROOT / "ETL" / "events" / "extract" / "railway_cron.py"
SCRIPTS = ROOT / "website" / "frontend" / "scripts"
PACKAGE = ROOT / "website" / "frontend" / "package.json"
CENSUS = ROOT / "ETL" / "events" / "load" / "publish_corpus_census.py"
WORKFLOWS = ROOT / ".github" / "workflows"

# Provided by Actions itself and scoped by each workflow's `permissions:` block.
# Not a credential this repository holds, so not one a workflow can leak.
INTRINSIC_SECRETS = {"GITHUB_TOKEN"}


def workflow_secrets() -> list[str]:
    """Every `secrets.X` reference in every workflow, except the intrinsic one."""
    out = []
    for wf in sorted(WORKFLOWS.glob("*.y*ml")):
        # Comment lines are dropped: a workflow's prose explains why it no
        # longer holds a secret, and a check that could not tell that apart from
        # holding one would make writing the explanation impossible.
        live = "\n".join(ln for ln in wf.read_text().splitlines()
                         if not ln.lstrip().startswith("#"))
        for name in re.findall(r"secrets\.([A-Za-z_][A-Za-z0-9_]*)", live):
            if name not in INTRINSIC_SECRETS:
                out.append(f"{wf.relative_to(ROOT)} reads secrets.{name}")
    return sorted(set(out))


def cron_guards() -> set[str]:
    """The ids railway_cron.py actually runs. Parsed from its GUARDS list rather
    than from a copy kept here, which would be the very duplication this file
    exists to catch."""
    m = re.search(r"^GUARDS\s*=\s*\[(.*?)\]", CRON.read_text(), re.S | re.M)
    if not m:
        return set()
    return set(re.findall(r'"([^"]+)"', m.group(1)))


def script_guards() -> dict[str, list[str]]:
    """id -> the frontend scripts that publish under it."""
    out: dict[str, list[str]] = {}
    for f in sorted(SCRIPTS.glob("*.ts")):
        for gid in re.findall(r'^const GUARD = "([^"]+)";', f.read_text(), re.M):
            out.setdefault(gid, []).append(f.name)
    return out


def main() -> int:
    reg = json.loads(REGISTRY.read_text())
    guards = reg["guards"]
    problems: list[str] = []

    ids = [g["id"] for g in guards]
    for dupe in {i for i in ids if ids.count(i) > 1}:
        problems.append(f"'{dupe}' is registered twice; a verdict would be attributed "
                        f"to whichever entry was read last")

    from_cron = cron_guards()
    from_scripts = script_guards()

    for g in guards:
        gid = g["id"]

        # 1. Everything a verdict is bound to has to exist, or the fingerprint
        #    silently covers less than it claims to.
        for rel in g["code"]:
            if not (ROOT / rel).exists():
                problems.append(f"{gid}: `code` names {rel}, which does not exist. Its "
                                f"fingerprint covers nothing there, so a change under "
                                f"that path would not invalidate the verdict")
        if "command" in g and not (ROOT / g["command"][1]).exists():
            problems.append(f"{gid}: `command` runs {g['command'][1]}, which does not exist")

        # 2/3. Somebody must actually publish it, and the guard's own code has
        #      to be identifiable -- which is not the same file. A cron guard is
        #      DRIVEN by railway_cron.py and IMPLEMENTED by its command.
        implementation: str | None = None
        if gid == "census":
            published_by = "publish_corpus_census.py" if CENSUS.exists() else None
            implementation = "publish_corpus_census.py"
        elif g["cadence"] == "weekly":
            published_by = "railway_cron.py" if gid in from_cron else None
            implementation = Path(g["command"][1]).name if "command" in g else None
            if published_by is None:
                problems.append(
                    f"{gid}: cadence 'weekly', but ETL/events/extract/railway_cron.py "
                    f"does not run it. Nothing publishes it, so check_verdicts.ts will "
                    f"report SILENT every week and there is no command that fixes it")
        else:
            owners = from_scripts.get(gid, [])
            published_by = owners[0] if len(owners) == 1 else None
            implementation = published_by
            if not owners:
                problems.append(
                    f"{gid}: cadence 'on_change', but no script in website/frontend/scripts "
                    f"declares `const GUARD = \"{gid}\"`. Nothing publishes it")
            elif len(owners) > 1:
                problems.append(
                    f"{gid}: published by {len(owners)} scripts ({', '.join(owners)}). "
                    f"Two publishers means the newest verdict depends on which ran last")

        # 5. Editing a guard must invalidate its own verdict. Otherwise a
        #    weakened check keeps its old pass, which is the one failure mode
        #    that makes the whole channel worse than no channel.
        if implementation and not any(
                Path(rel).name == implementation
                or ((ROOT / rel).is_dir()
                    and any(p.name == implementation for p in (ROOT / rel).rglob("*")))
                for rel in g["code"]):
            problems.append(
                f"{gid}: its own implementation ({implementation}) is not covered by "
                f"`code` {g['code']}. Editing the guard would leave its previous "
                f"verdict looking current")

    # 4. And nothing may publish under an id nobody is looking for.
    known = set(ids)
    for gid in sorted(from_cron - known):
        problems.append(f"railway_cron.py runs guard '{gid}', which is not in the "
                        f"registry. Its verdict would be written and never read")
    for gid, owners in sorted(from_scripts.items()):
        if gid not in known:
            problems.append(f"{', '.join(owners)} publishes under '{gid}', which is not "
                            f"in the registry. Its verdict would be written and never read")

    # 6. The loop has to close somewhere a person will see it.
    #
    # The list of checks used to be a 27-link `&&` chain in package.json's
    # `check` script and now lives in scripts/run_checks.mjs, because `&&`
    # stopped the whole suite at the first failure and thirteen checks —
    # check_verdicts among them — had not been running at all. So this reads the
    # runner, and asserts the stronger property the old prose already claimed:
    # check_verdicts is not merely present, it is LAST. It refreshes the
    # verdicts every credential-free path then depends on, so a check that ran
    # before it read the previous run's answers.
    check = json.loads(PACKAGE.read_text())["scripts"].get("check", "")
    runner = ROOT / "website" / "frontend" / "scripts" / "run_checks.mjs"
    if "run_checks" not in check:
        problems.append("`npm run check` no longer runs scripts/run_checks.mjs, which "
                        "is where the list of checks lives. If the list moved again, "
                        "move this assertion with it — the thing being protected is "
                        "that SOME automatic-to-a-human command still ends in "
                        "check_verdicts")
    elif not runner.exists():
        problems.append(f"`npm run check` runs {runner.name}, which does not exist")
    else:
        ordered = re.findall(r'scripts/(check_\w+)\.ts', runner.read_text())
        if "check_verdicts" not in ordered:
            problems.append("run_checks.mjs no longer runs check_verdicts.ts. That is "
                            "the step where a machine WITH credentials refreshes the "
                            "verdicts the credential-free paths depend on")
        elif ordered[-1] != "check_verdicts":
            problems.append(f"run_checks.mjs ends in {ordered[-1]}, not check_verdicts. "
                            f"check_verdicts refreshes the verdicts the checks before "
                            f"it read, so it has to be last or they read stale ones")

    # 7. And the reason for all of it.
    for held in workflow_secrets():
        problems.append(
            f"{held}. The verdict channel exists so that no workflow needs a "
            f"credential of ours; a guard that only passes because one was added "
            f"back has not been made to run, it has been made to be trusted. If "
            f"this secret is genuinely not a data credential, say why here and "
            f"add it to INTRINSIC_SECRETS deliberately.")

    print(f"guard registry: {len(guards)} guard(s) — "
          f"{len(from_cron)} run by the cron, {len(from_scripts)} by frontend scripts")
    for g in guards:
        print(f"  {g['id']:24} {g['cadence']}")
    if problems:
        print("\nFAILED:")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("ok — every registered guard has exactly one publisher, every publisher is "
          "registered, and each verdict is bound to its own implementation.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
