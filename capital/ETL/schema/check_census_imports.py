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

Usage: python3 ETL/schema/check_census_imports.py
"""
from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENTRY = ROOT / "ETL/events/load/publish_corpus_census.py"

# The same directories etl_env.py and web_env.py put on sys.path. A module that
# resolves to a file under one of these is our own code and is followed.
SEARCH = [
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


def main() -> int:
    declared = declared_distributions()
    stdlib = set(sys.stdlib_module_names) | {"__future__"}

    seen: set[Path] = set()
    queue = [ENTRY]
    offenders: list[str] = []
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

    print(f"census import graph: {len(seen)} module(s) reachable from "
          f"{ENTRY.relative_to(ROOT)}")
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
          "or a declared dependency.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
