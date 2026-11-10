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
  7. no workflow holds a secret of ours -- except the read-only corpus
     credential, and only where its read-only-ness is proved first

── On (7), which is the reason for the other six ──────────────────────────
This whole channel exists so that GitHub Actions never needs a connection
string to the production database. The cheap way to make any of the checks
above go green is to put one back, and it would work, and it would silently
undo the thing that was bought. So the property is asserted directly, and as a
PROPERTY rather than a list of forbidden variable names:

    every workflow must be able to run every step it has with an empty
    secret store.

The exception is `secrets.GITHUB_TOKEN`, which Actions provides intrinsically
and which the `permissions:` block scopes; it is not a credential we hold or
could leak from here. Anything else fails, including a name nobody has thought
of yet — which is the point, since the next one will not be called
DATABASE_URL.

── The one credential CI may hold (2026-11-05) ────────────────────────────
The corpus moved into Postgres and the site's data is now generated from it
rather than committed, so the owner approved giving CI ONE credential: the
capital_ro URL, as `secrets.CAPITAL_RO_DATABASE_URL`. What was bought above was
"CI cannot change production", and a role that cannot write keeps that. It is
admitted under three conditions, all checked here, because a secret's NAME says
nothing about its contents:

  a. it is bound to an env var of the same name, CAPITAL_RO_DATABASE_URL, and
     nothing else. ETL/lib/store.py reads that name only for read-only
     connections; bound to DATABASE_URL it would be what a WRITING script uses.
  b. in every job that references it, the FIRST step that does runs
     ETL/schema/check_readonly_credential.py, which asks the database what the
     role may do and fails the job if it can write, create or grant anything.
     So a read-write URL pasted under the read-only name stops the job before
     any other step has received it.
  c. no other data credential: everything else still fails, as before.

── The one spend credential CI may hold (2026-11-07) ──────────────────────
Six founder-tier guards (memo table, answer reach, degradation, hydration
parity, recall floor, pool curve) grade the SHIPPED ranker, which embeds the
founder's description; without a Voyage key they would grade the lexical
fallback, the wrong ranker. The owner approved a repository secret VOYAGE_KEY
on 2026-11-06. It cannot change production -- it can only buy query
embeddings, measured at ~10,600 tokens (~$0.001) for all six on 2026-11-07 --
so it is admitted on conditions of its own, checked here:

  d. bound to an env var of the same name, VOYAGE_KEY, and nothing else, and
     never inside an expression;
  e. per STEP: never at workflow or job level, so only the steps that grade
     the ranker receive it;
  f. every step given it also sets GUARD_NO_PUBLISH, so a run from a branch
     cannot stamp the shared verdict feed (scripts/guardVerdict.ts).

Usage: python3 ETL/schema/check_guard_registry.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ETL" / "lib"))
from web_path import WEB  # noqa: E402  (the web app, <monorepo>/web)
REGISTRY = ROOT / "data" / "guard_registry.json"
CRON = ROOT / "ETL" / "events" / "extract" / "railway_cron.py"
SCRIPTS = WEB / "scripts"
CENSUS = ROOT / "ETL" / "events" / "load" / "publish_corpus_census.py"
# The monorepo root, not this brain's: GitHub runs workflows only from the
# repository's top-level .github/, and every workflow there is in scope, because
# a credential in ANY of them is reachable from this brain's checkout.
WORKFLOWS = ROOT.parent / ".github" / "workflows"

# Provided by Actions itself and scoped by each workflow's `permissions:` block.
# Not a credential this repository holds, so not one a workflow can leak.
INTRINSIC_SECRETS = {"GITHUB_TOKEN"}

# The read-only corpus credential: admitted on conditions (a)-(b) above.
READONLY_SECRET = "CAPITAL_RO_DATABASE_URL"
READONLY_PROOF = "ETL/schema/check_readonly_credential.py"
# The query-embedding key: admitted on conditions (d)-(f) above.
SPEND_SECRET = "VOYAGE_KEY"


def spend_secret_problems(rel, live: str) -> list[str]:
    """Conditions (d)-(f) for SPEND_SECRET in one workflow's uncommented text."""
    out: list[str] = []
    ref = f"secrets.{SPEND_SECRET}"
    if ref not in live:
        return out
    for var in re.findall(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\$\{\{\s*secrets\." + SPEND_SECRET + r"\b",
                          live, re.M):
        if var != SPEND_SECRET:
            out.append(f"{rel} binds {ref} to {var}; it may be bound only to {SPEND_SECRET}")
    if re.search(r"secrets\." + SPEND_SECRET + r"\b[^\n]*\}\}[^\n]*\S|"
                 r"\$\{\{[^}]*\S\s*secrets\." + SPEND_SECRET + r"\b", live):
        out.append(f"{rel} uses {ref} inside an expression; it may only be bound as an env value")
    if ref in live.split("\njobs:", 1)[0]:
        out.append(f"{rel} binds {ref} at workflow level; it may be given to a step only")
    for job_id, job in _jobs(live).items():
        if ref not in job:
            continue
        if ref in job.split("steps:", 1)[0]:
            out.append(f"{rel} job `{job_id}` binds {ref} at job level; it may be given to a step only")
            continue
        for step in _steps(job):
            if ref in step and "GUARD_NO_PUBLISH" not in step:
                name = re.search(r"name:\s*(.+)", step)
                out.append(f"{rel} job `{job_id}` step {name.group(1).strip() if name else '?'!r} "
                           f"holds {ref} without GUARD_NO_PUBLISH")
    return out


def _jobs(live: str) -> dict[str, str]:
    """job id -> its text. Jobs are the 2-space keys under the top-level `jobs:`."""
    m = re.search(r"^jobs:\s*$", live, re.M)
    if not m:
        return {}
    body = live[m.end():]
    heads = list(re.finditer(r"^  ([A-Za-z0-9_-]+):\s*$", body, re.M))
    return {h.group(1): body[h.end(): heads[i + 1].start() if i + 1 < len(heads) else len(body)]
            for i, h in enumerate(heads)}


def _steps(job: str) -> list[str]:
    """A job's steps, each as its text. A step starts at a `- ` list item
    under `steps:`."""
    m = re.search(r"^(\s*)steps:\s*$", job, re.M)
    if not m:
        return []
    body = job[m.end():]
    starts = [s.start() for s in re.finditer(r"^\s*- ", body, re.M)]
    return [body[a: starts[i + 1] if i + 1 < len(starts) else len(body)]
            for i, a in enumerate(starts)]


def workflow_secrets() -> list[str]:
    """Every `secrets.X` a workflow holds that it may not: any non-intrinsic
    secret, except the read-only corpus credential used on conditions (a)-(b)."""
    out = []
    for wf in sorted(WORKFLOWS.glob("*.y*ml")):
        # Comment lines are dropped: a workflow's prose explains why it no
        # longer holds a secret, and a check that could not tell that apart from
        # holding one would make writing the explanation impossible.
        live = "\n".join(ln for ln in wf.read_text().splitlines()
                         if not ln.lstrip().startswith("#"))
        rel = wf.relative_to(ROOT.parent)
        for name in re.findall(r"secrets\.([A-Za-z_][A-Za-z0-9_]*)", live):
            if name not in INTRINSIC_SECRETS and name not in (READONLY_SECRET, SPEND_SECRET):
                out.append(f"{rel} reads secrets.{name}")
        out.extend(spend_secret_problems(rel, live))
        if f"secrets.{READONLY_SECRET}" not in live:
            continue
        # (a) bound only under its own name.
        for var in re.findall(
                r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\$\{\{\s*secrets\." + READONLY_SECRET,
                live, re.M):
            if var != READONLY_SECRET:
                out.append(f"{rel} binds secrets.{READONLY_SECRET} to {var}; it may be "
                           f"bound only to {READONLY_SECRET}, the name store.py reads for "
                           f"read-only connections")
        if re.search(r"secrets\." + READONLY_SECRET + r"[^\n]*\}\}[^\n]*\S|"
                     r"\$\{\{[^}]*\S\s*secrets\." + READONLY_SECRET, live):
            out.append(f"{rel} uses secrets.{READONLY_SECRET} inside an expression; it may "
                       f"only be bound as an env value on its own")
        # (b) proved first, per job.
        top_level = live.split("\njobs:", 1)[0]
        if f"secrets.{READONLY_SECRET}" in top_level:
            out.append(f"{rel} binds secrets.{READONLY_SECRET} at workflow level, which "
                       f"hands it to every step of every job before any proof runs")
        for job_id, job in _jobs(live).items():
            if f"secrets.{READONLY_SECRET}" not in job:
                continue
            steps = _steps(job)
            pre_steps = job.split("steps:", 1)[0]
            if f"secrets.{READONLY_SECRET}" in pre_steps:
                out.append(f"{rel} job `{job_id}` binds secrets.{READONLY_SECRET} at job "
                           f"level, which hands it to every step before any proof runs")
                continue
            first = next((s for s in steps if f"secrets.{READONLY_SECRET}" in s), None)
            if first is not None and READONLY_PROOF.split("/")[-1] not in first:
                out.append(f"{rel} job `{job_id}`: the first step given "
                           f"secrets.{READONLY_SECRET} does not run {READONLY_PROOF}. "
                           f"A read-write URL stored under the read-only name would "
                           f"reach that step unproved")
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
        elif "command" in g:
            # An on_change guard that ETL/lib/guard_verdicts.py DRIVES, the same
            # arrangement a weekly guard uses -- the only difference is what
            # triggers it, and this file's question is who publishes it.
            #
            # This branch was missing, and the omission read as a rule: it said
            # an on_change guard must be TypeScript. `index_freshness` is
            # Python, has a `command`, and names `guard_verdicts.py run
            # index_freshness` as its own `refresh` line -- and this check went
            # red on it saying "nothing publishes it", about a guard whose
            # publisher is named in its own entry. A schema check that is wrong
            # about a correct registry is the kind of red people learn to step
            # over, which is how the next real one gets stepped over too.
            published_by = "guard_verdicts.py"
            implementation = Path(g["command"][1]).name
        else:
            owners = from_scripts.get(gid, [])
            published_by = owners[0] if len(owners) == 1 else None
            implementation = published_by
            if not owners:
                problems.append(
                    f"{gid}: cadence 'on_change', but nothing publishes it -- no script in "
                    f"web/scripts declares `const GUARD = \"{gid}\"`, and it "
                    f"declares no `command` for ETL/lib/guard_verdicts.py to run")
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

    # 7. And the reason for all of it.
    for held in workflow_secrets():
        problems.append(
            f"{held}. The verdict channel exists so that no workflow needs a "
            f"credential of ours; a guard that only passes because one was added "
            f"back has not been made to run, it has been made to be trusted. The "
            f"one exception is the read-only corpus credential, on the conditions "
            f"in this file's header. If this secret is genuinely not a data "
            f"credential, say why here and add it to INTRINSIC_SECRETS "
            f"deliberately.")

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
