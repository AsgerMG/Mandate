"""The corpus census must run in the ETL image, which has only requirements.txt.

── Why ────────────────────────────────────────────────────────────────────
The census is the only channel by which the website can learn what the ETL's
corpus contains. It runs inside `python:3.11-slim` plus requirements.txt —
no pandas, no numpy, nothing the website build layer takes for granted.

On its first real run in the container it recorded:

    kpis: ModuleNotFoundError: No module named 'pandas'

It had imported the canonical KPI definitions from synthesis.py, which opens
`from helpers import ...`, and helpers.py imports pandas for charting work the
KPI queries have nothing to do with. The census catches a failed block and
records it rather than crashing — which is right — so the effect would have
been a census published every week with no numbers in it and a guard failing
DEGRADED forever, for a reason nobody would read down to.

Fixing the import was a minute. Making it impossible to reintroduce is this:
the census's whole transitive import graph must resolve to the standard library,
to modules inside this repository, or to a distribution actually declared in
requirements.txt. Nothing else may creep in through a helper three levels down.

── The same applies to everything else the container publishes ────────────
`ETL/lib/guard_verdicts.py` runs the corpus-side guards inside the same image
and writes their verdicts to the same Postgres. It is checked here for the same
reason and by the same walk: an import it picks up three modules down fails in
the container, at 03:00 on a Sunday, and the only symptom is a verdict that
never appears.

── And the fingerprint must stay ONE function ─────────────────────────────
`guard_verdicts.fingerprint` generalises `publish_corpus_census.code_fingerprint`
and its docstring claims that, over the census's own paths, it reproduces that
function exactly. Two hashes that are supposed to be equal and are only believed
to be equal is how the census would start reading DRIFTED against itself, on a
week when nothing had drifted. So it is asserted, not believed.

Usage: python3 ETL/schema/check_census_imports.py
"""
from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# Everything the ETL image is expected to execute for the reporting channel.
# One walk, both entry points: the census, and the runner that publishes the
# corpus-side guards' verdicts alongside it.
ENTRIES = [
    ROOT / "ETL/events/load/publish_corpus_census.py",
    ROOT / "ETL/lib/guard_verdicts.py",
]

# The directories etl_env.py and web_env.py put on sys.path, plus the ones a
# followed module inserts for itself. A module that resolves to a file under one
# of these is our own code and is followed.
SEARCH = [
    # Not on etl_env's path: publish_corpus_census.py inserts it itself, to read
    # the store's migration state through the one runner rather than reimplementing
    # "which migrations does this store have". It is in the image (COPY . .) and
    # imports only the standard library and etl_env.
    ROOT / "ETL/events/load/migrations",
    ROOT / "ETL/lib", ROOT / "ETL/terms",
    ROOT / "ETL/events/extract", ROOT / "ETL/events/transform",
    ROOT / "ETL/events/load", ROOT / "ETL/events/load/qa",
    ROOT / "ETL/intelligence/extract", ROOT / "ETL/intelligence/transform",
    ROOT / "ETL/intelligence/load",
    ROOT / "website/build", ROOT / "website/build/lib",
]

# Import name -> distribution, where they differ. Only for what requirements.txt
# actually declares; anything not declared fails whatever it is called.
IMPORT_TO_DIST = {
    "dotenv": "python-dotenv",
    "yaml": "PyYAML",
    "psycopg": "psycopg",
    "voyageai": "voyageai",
    "anthropic": "anthropic",
    "openai": "openai",
    "pdfplumber": "pdfplumber",
}


def declared_distributions() -> set[str]:
    out = set()
    for line in (ROOT / "requirements.txt").read_text().splitlines():
        line = line.split("#")[0].strip()
        if not line:
            continue
        name = re.split(r"[<>=!\[]", line)[0].strip()
        if name:
            out.add(name.lower())
    return out


def resolve(module: str) -> Path | None:
    """Where a top-level import name lives in this repo, if it does."""
    for base in SEARCH:
        for candidate in (base / f"{module}.py", base / module / "__init__.py"):
            if candidate.exists():
                return candidate
    return None


def top_level_imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(), filename=str(path))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names |= {a.name.split(".")[0] for a in node.names}
        elif isinstance(node, ast.ImportFrom):
            # Relative imports stay inside the package we are already walking.
            if node.level == 0 and node.module:
                names.add(node.module.split(".")[0])
    return names


def one_fingerprint() -> list[str]:
    """The generalised hash must equal the one it generalises.

    Imported rather than re-derived: if either implementation moves, this fails
    to import and says so, which is the outcome we want from a check whose whole
    subject is two things that must not diverge.
    """
    sys.path.insert(0, str(ROOT / "ETL/lib"))
    sys.path.insert(0, str(ROOT / "ETL/events/load"))
    import json

    from guard_verdicts import guard_fingerprint  # noqa: E402
    from publish_corpus_census import code_fingerprint  # noqa: E402

    reg = json.loads((ROOT / "data/guard_registry.json").read_text())
    census = next(g for g in reg["guards"] if g["id"] == "census")
    generic, specific = guard_fingerprint(census), code_fingerprint()
    if generic != specific:
        return [f"guard_verdicts.fingerprint over {census['code']} gives {generic}, "
                f"publish_corpus_census.code_fingerprint gives {specific}.\n"
                f"    The census would read DRIFTED against a container running "
                f"exactly this code. Make one call the other."]
    return []


def root_relative_constant(node: ast.Assign) -> str | None:
    """`NAME = ROOT / "a" / "b"` -> "a/b", for a module-level assignment.

    Module level and upper-case on purpose: that is the shape a JUDGEMENT INPUT
    takes -- a file the module grades against, resolved once at import. The
    hundreds of `ROOT / "data" / ...` paths built inside functions are working
    files of one step, not the bar a published verdict is computed against, and
    requiring every one of them to be declared would make this check noise.
    """
    parts: list[tuple[str, str | None]] = []

    def walk(n: ast.expr) -> None:
        if isinstance(n, ast.BinOp) and isinstance(n.op, ast.Div):
            walk(n.left)
            walk(n.right)
        elif isinstance(n, ast.Name):
            parts.append(("name", n.id))
        elif isinstance(n, ast.Constant) and isinstance(n.value, str):
            parts.append(("str", n.value))
        else:
            parts.append(("other", None))

    walk(node.value)
    if not parts or parts[0] != ("name", "ROOT") or len(parts) < 2:
        return None
    if any(kind != "str" for kind, _ in parts[1:]):
        return None
    return "/".join(v for _, v in parts[1:] if v)


def in_the_image(rel: str) -> bool:
    """Would `COPY . .` carry this file into the ETL image?

    Read from `.dockerignore`, which is the one committed statement of what the
    build context excludes. Deliberately not a second opinion about it: a file
    the container does not have cannot be part of a fingerprint the container
    could reproduce, and demanding one would produce a permanent false DRIFTED.
    """
    patterns = [ln.strip() for ln in (ROOT / ".dockerignore").read_text().splitlines()
                if ln.strip() and not ln.startswith("#")]
    excluded = False
    for pattern in patterns:
        negate = pattern.startswith("!")
        body = pattern.lstrip("!").rstrip("/")
        if rel == body or rel.startswith(body + "/") or Path(rel).name == body:
            excluded = not negate
    return not excluded


def bar_is_fingerprinted(modules: set[Path]) -> list[str]:
    """Every input the census GRADES AGAINST is inside the fingerprint it publishes.

    ── The failure ────────────────────────────────────────────────────────
    Census #11 published `LOSS eligibility: 898, down from a high of 913` while
    `project-mgmt/coverage_baseline.json` in this checkout says 937 -- `fe75156a`
    raised thirteen fields the morning after the running image was built, every
    one of them BELOW the mark the corpus had actually reached. The fingerprint
    hashed `ETL/**.py` and `website/build/**.py`; the bar is neither, so a reader
    of that verdict had no way to know which bar produced it. DRIFTED fired only
    because the Python happened to drift in the same deploy.

    ── Why this is derived and not a list ─────────────────────────────────
    `publish_corpus_census.JUDGEMENT_INPUTS` DECLARES the inputs, so the hash
    stays a dumb content hash that two machines cannot disagree about. This
    proves the declaration COMPLETE, by walking the census's own import graph --
    the same walk `main()` already does for dependencies -- and reading the
    module-level path constants out of it. A second bar added next year fails
    here the day its constant appears, with no edit to this function.
    """
    sys.path.insert(0, str(ROOT / "ETL/events/load"))
    from publish_corpus_census import FINGERPRINTED, JUDGEMENT_INPUTS  # noqa: PLC0415

    def is_hashed(rel: str) -> bool:
        """Is this file ACTUALLY inside the hash — not merely under a path the
        hash walks. `code_fingerprint` takes a named file whole and takes only
        `.py` from a named directory, so `ETL/schema/guard_verdicts.sql` sits
        under a fingerprinted tree and contributes nothing to the hash. Reading
        "under ETL/" as "covered" would put the same hole in the check that the
        check exists to close."""
        if rel in JUDGEMENT_INPUTS:
            return True
        return (rel.endswith(".py")
                and any(rel.startswith(tree.rstrip("/") + "/") for tree in FINGERPRINTED))

    problems: list[str] = []
    for module in sorted(modules):
        for node in ast.parse(module.read_text(), filename=str(module)).body:
            if not isinstance(node, ast.Assign):
                continue
            rel = root_relative_constant(node)
            if rel is None or not (ROOT / rel).is_file():
                continue
            name = getattr(node.targets[0], "id", "?")
            where = f"{module.relative_to(ROOT)}:{node.lineno} {name}"
            if is_hashed(rel):
                continue
            if not in_the_image(rel):
                problems.append(
                    f"{where} reads `{rel}`, which .dockerignore keeps OUT of the "
                    f"image.\n    The container executes this module and the file "
                    f"is not there to read. Either the\n    module cannot run in "
                    f"the image, or .dockerignore needs an exception -- it cannot "
                    f"be\n    fingerprinted either way, because a hash the "
                    f"container cannot reproduce is a permanent\n    false DRIFTED.")
                continue
            problems.append(
                f"{where} grades against `{rel}`, which is in the image and NOT in "
                f"the fingerprint.\n    A verdict computed against it carries a hash "
                f"that does not move when it moves, so\n    two verdicts from two "
                f"different bars are indistinguishable to every reader. Add it to\n"
                f"    publish_corpus_census.JUDGEMENT_INPUTS and to the census "
                f"entry's `code` in\n    data/guard_registry.json.")
    return problems


def main() -> int:
    declared = declared_distributions()
    stdlib = set(sys.stdlib_module_names) | {"__future__"}

    seen: set[Path] = set()
    queue = list(ENTRIES)
    offenders: list[str] = one_fingerprint()
    while queue:
        path = queue.pop()
        if path in seen:
            continue
        seen.add(path)
        for module in sorted(top_level_imports(path)):
            if module in stdlib:
                continue
            local = resolve(module)
            if local is not None:
                queue.append(local)
                continue
            dist = IMPORT_TO_DIST.get(module, module).lower()
            if dist not in declared:
                offenders.append(
                    f"{path.relative_to(ROOT)} imports `{module}`, which is neither "
                    f"in the standard library, nor in this repository, nor declared "
                    f"in requirements.txt")

    offenders += bar_is_fingerprinted(seen)

    print(f"census import graph: {len(seen)} module(s) reachable from "
          + ", ".join(str(e.relative_to(ROOT)) for e in ENTRIES))
    if offenders:
        print("\nFAILED — the census cannot run in the ETL image:")
        for o in sorted(set(offenders)):
            print(f"  {o}")
        print("\n  Either move the code it needs into a module that imports only")
        print("  the standard library (see website/build/lib/corpus_kpis.py, which")
        print("  exists for exactly this reason), or add the dependency to")
        print("  requirements.txt if the image genuinely needs it.")
        return 1
    print("ok — every import resolves to the standard library, this repository, "
          "or a declared dependency; every input the census grades against is "
          "inside the fingerprint it publishes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
