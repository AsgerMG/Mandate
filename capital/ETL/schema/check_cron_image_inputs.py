"""The weekly cron can read, in its image, every file it reads at import.

── The failure, 2026-08-16 ────────────────────────────────────────────────
wsCZ added `data/reference/activity_codebook.json` on 2026-08-10 and
`classify_taxonomy.py` reads it at module level. Six days later the first cron
run on an image built from that commit raised FileNotFoundError before the
script's first statement. `railway_cron.py` exits on a non-tolerated failure, so
`persist`, the sanity check, gap detection, both window refreshes and all four
corpus-side guards never ran. Census #11 recorded `failed at
classify_taxonomy.py (rc=1)` and the corpus of record has not moved since.

Nothing caught it, and nothing could have: the file is committed, it is present
on every laptop, and CI reads it happily. The one place it does not exist is the
only place that matters.

── The property ───────────────────────────────────────────────────────────
`data/` is the CORPUS. `.gitignore` matches the whole tree (a bare `data`, which
having no slash matches at any depth), `railway up` applies `.gitignore` to the
upload, and on the Railway service `/app/data` is a mounted volume. So a
committed file under `data/` reaches the container only if a human copies it
onto the volume, and no `!data/...` line in `.dockerignore` can change that.

    No module reachable from railway_cron.py's steps may read a git-tracked
    file under data/ while it is being imported.

Tracked is the whole test. An UNtracked file under `data/` is a corpus artifact
the pipeline itself writes and the volume therefore holds — `db.sqlite`, the
source-hash caches, the batch state. A TRACKED one is input somebody committed,
which is what `reference/` at the repo root is for.

── Why it runs the imports instead of reading them ────────────────────────
`ETL/lib/liveness.py` reads its projection through a helper called at module
level. A static walk that looked for `ROOT / "data" / ...` inside the module
body would not see it, and that file was the SECOND failure waiting behind the
first: `fetch_ademe_windows.py` is a fatal step and imports it. So the check
imports each entry for real, under an audit hook that makes every tracked
`data/` path unreadable — which is exactly what the container is. A read through
six helpers, a computed path, an importlib trick: all the same to it.

Import-time only, on purpose. A read inside a function is one step's working
file and it fails where a human can see which step it was; an import-time read
kills the run before it can name itself.

Usage: python3 ETL/schema/check_cron_image_inputs.py
"""
from __future__ import annotations

import ast
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CRON = ROOT / "ETL/events/extract/railway_cron.py"
REGISTRY = ROOT / "data" / "guard_registry.json"


def cron_scripts() -> list[Path]:
    """Every .py the cron executes, read out of the cron itself.

    Derived and not listed: a step added to `STEPS` next year is covered the day
    it is added. The guards come the same way -- `railway_cron.GUARDS` names
    ids, and the registry says what each id runs -- so a guard that starts
    reading a committed `data/` path is covered too, which is the case
    `check_offerable_decay.py` already is.
    """
    tree = ast.parse(CRON.read_text(), filename=str(CRON))
    found: list[Path] = []

    def strings(node: ast.AST) -> list[str]:
        """`ROOT / "a/b.py"` and plain "a/b.py", anywhere in an expression."""
        out = []
        for sub in ast.walk(node):
            if isinstance(sub, ast.Constant) and isinstance(sub.value, str):
                out.append(sub.value)
        return out

    guard_ids: list[str] = []
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        name = getattr(node.targets[0], "id", "")
        if name == "GUARDS":
            guard_ids = [s for s in strings(node.value)]
            continue
        for s in strings(node.value):
            if s.endswith(".py") and (ROOT / s).is_file():
                found.append(ROOT / s)

    if guard_ids:
        registry = json.loads(REGISTRY.read_text())
        by_id = {g["id"]: g for g in registry["guards"]}
        for gid in guard_ids:
            command = (by_id.get(gid) or {}).get("command") or []
            for part in command:
                if part.endswith(".py") and (ROOT / part).is_file():
                    found.append(ROOT / part)

    return sorted(set(found))


PROBE = r'''
import importlib.util, subprocess, sys
from pathlib import Path

ROOT = Path(sys.argv[1])
DATA = ROOT / "data"
entries = [Path(p) for p in sys.argv[2:]]

tracked = {
    (ROOT / line).resolve()
    for line in subprocess.run(
        ["git", "-C", str(ROOT), "ls-files", "data"],
        capture_output=True, text=True, check=True).stdout.splitlines()
    if line
}

def hook(event, args):
    # The container has the volume mounted at data/: it holds what the pipeline
    # wrote there, and nothing anybody committed.
    if event != "open" or not args:
        return
    target = args[0]
    if not isinstance(target, (str, bytes, Path)):
        return
    try:
        resolved = Path(target if not isinstance(target, bytes)
                        else target.decode()).resolve()
    except (OSError, ValueError, UnicodeDecodeError):
        return
    if resolved in tracked:
        raise FileNotFoundError(
            2, "not in the ETL image", str(resolved.relative_to(ROOT)))

sys.addaudithook(hook)

for entry in entries:
    name = "cronprobe_" + entry.stem
    spec = importlib.util.spec_from_file_location(name, entry)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    try:
        spec.loader.exec_module(module)
    except FileNotFoundError as exc:
        if exc.strerror == "not in the ETL image":
            print(f"MISSING\t{entry.relative_to(ROOT)}\t{exc.filename}")
        else:
            print(f"ABSENT\t{entry.relative_to(ROOT)}\t{exc.filename}")
    except BaseException as exc:                      # noqa: BLE001
        # Anything else is this machine's problem, not the image's: no corpus,
        # no credentials, a step that refuses to import outside a real run. The
        # check has one subject and does not get to fail on another.
        print(f"SKIP\t{entry.relative_to(ROOT)}\t{type(exc).__name__}: "
              f"{str(exc).splitlines()[0][:120] if str(exc) else ''}")
    else:
        print(f"OK\t{entry.relative_to(ROOT)}\t")
'''


def main() -> int:
    entries = cron_scripts()
    if not entries:
        print("FAILED — railway_cron.py names no step this check could find. "
              "Either the cron moved or the shape it declares its steps in did; "
              "a check that silently watches nothing is worse than no check.")
        return 1

    result = subprocess.run(
        [sys.executable, "-c", PROBE, str(ROOT), *[str(e) for e in entries]],
        capture_output=True, text=True, cwd=ROOT)
    if result.returncode != 0:
        print("FAILED — the probe itself did not run:")
        print(result.stderr.strip()[-2000:])
        return 1

    problems, skipped, ok = [], [], []
    for line in result.stdout.splitlines():
        if "\t" not in line:
            continue
        status, entry, detail = line.split("\t", 2)
        if status == "MISSING":
            problems.append((entry, detail))
        elif status == "ABSENT":
            skipped.append((entry, f"a file missing from this checkout: {detail}"))
        elif status == "SKIP":
            skipped.append((entry, detail))
        else:
            ok.append(entry)

    print(f"cron steps imported: {len(ok)} clean, {len(skipped)} not testable "
          f"here, {len(problems)} reading a committed data/ path at import")
    for entry, why in skipped:
        print(f"  - {entry}: {why}")

    if problems:
        print("\nFAILED — the weekly ETL would stop at the first of these, "
              "before it ran:")
        for entry, rel in sorted(set(problems)):
            print(f"  {entry} reads `{rel}` while being imported.")
        print("\n  That path is committed and it is under data/, which is the "
              "Railway volume:\n"
              "  git ignores the tree whole, `railway up` applies .gitignore to "
              "the upload, and\n"
              "  /app/data is the mount. The container has never had the file "
              "and no .dockerignore\n"
              "  line can give it one. Move it to reference/ and update its "
              "readers — see\n"
              "  reference/README.md. A load-bearing corpus artifact belongs on "
              "the volume and\n"
              "  must not be committed at all.")
        return 1

    print("ok — every module the weekly cron imports can read, in the image, "
          "everything it reads at import.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
