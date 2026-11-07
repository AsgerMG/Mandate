"""No code outside mandate/embedding names an embedding model or calls an embeddings API.

    python3 mandate/embedding/check_boundary.py            # check; exit 1 on a violation
    python3 mandate/embedding/check_boundary.py --write    # regenerate the TS mirror

THE PROPERTY. A model name is a decision about which vector space a query lands
in; an embeddings call is that decision being acted on. Both belong to one module
so that a table's vectors and the queries against them cannot disagree. So, in
any git-tracked .py/.ts/.tsx/.js/.mjs outside the allowed files:

  * no string literal (Python: any non-docstring str constant; TS/JS: any text
    outside comments) that matches an embedding MODEL NAME (the Voyage
    families, MiniLM, BGE, OpenAI text-embedding, Cohere embed-*), and
  * no EMBEDDINGS CALL: importing voyageai/fastembed/sentence_transformers, or
    naming the embeddings endpoint.

Comments and docstrings may name a model: they explain history. Code may not.
The test for an unseen case is the property, not a list of files: a new script
that pastes the Voyage URL fails here the day it is committed.

THE TS MIRROR. web/lib/embedding.ts carries a generated
block holding spaces.json. This check fails if the block is not byte-identical
to what --write would produce, which is how "the TS constant matches the Python
one" is enforced rather than hoped.

THE RATCHET. Scratch measurement scripts under the frontend's scripts/ that
predate this module and call Voyage directly are listed in boundary_ratchet.json.
The list may only shrink: a listed file that no longer offends must be removed
from it (the check says so), and a file not on it fails. Paths are recorded
relative to the frontend root so the move to web/ does not invalidate them.
"""
from __future__ import annotations

import ast
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
SPEC = HERE / "spaces.json"
RATCHET = HERE / "boundary_ratchet.json"
#: Frontend roots, old and new: the TS app is moving from capital/website/frontend to web/.
FRONTEND_ROOTS = ("capital/website/frontend/", "web/")
TS_MIRROR_REL = "lib/embedding.ts"

MODEL_NAME = re.compile(
    r"(?<![A-Za-z0-9_])("
    r"voyage-(?:\d[\w.\-]*|large[\w.\-]*|code[\w.\-]*|finance[\w.\-]*|law[\w.\-]*|multilingual[\w.\-]*|context[\w.\-]*|lite[\w.\-]*)"
    r"|[\w\-/]*MiniLM[\w\-]*"
    r"|(?:BAAI/)?bge-[\w.\-]+"
    r"|text-embedding-[\w\-]+"
    r"|embed-(?:english|multilingual)[\w.\-]*"
    r")")
API = re.compile(r"api\.voyageai\.com/v1/(?:embeddings|multimodalembeddings|contextualizedembeddings)"
                 r"|api\.openai\.com/v1/embeddings")
PY_IMPORTS = {"voyageai", "fastembed", "sentence_transformers"}
TS_IMPORT = re.compile(r"""(?:from\s+|require\(\s*|import\(\s*)["'](?:voyageai|fastembed|@xenova/transformers)["']""")


def tracked() -> list[str]:
    out = subprocess.run(["git", "-C", str(REPO), "ls-files", "*.py", "*.ts", "*.tsx", "*.js", "*.mjs"],
                         capture_output=True, text=True, check=True).stdout
    return [p for p in out.splitlines() if p]


def frontend_rel(path: str) -> str | None:
    for root in FRONTEND_ROOTS:
        if path.startswith(root):
            return path[len(root):]
    return None


def allowed(path: str) -> bool:
    if path.startswith("mandate/embedding/") or path.startswith("mandate/tests/"):
        return True
    return frontend_rel(path) == TS_MIRROR_REL


def _docstring_nodes(tree: ast.AST) -> set[int]:
    ids = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            body = getattr(node, "body", [])
            if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant) \
                    and isinstance(body[0].value.value, str):
                ids.add(id(body[0].value))
    return ids


def py_offences(src: str) -> list[str]:
    try:
        tree = ast.parse(src)
    except SyntaxError:
        return []
    docs = _docstring_nodes(tree)
    found = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in docs:
            for rx, what in ((MODEL_NAME, "model name"), (API, "embeddings endpoint")):
                m = rx.search(node.value)
                if m:
                    found.append(f"line {node.lineno}: {what} {m.group(0)!r}")
        elif isinstance(node, ast.Import):
            for a in node.names:
                if a.name.split(".")[0] in PY_IMPORTS:
                    found.append(f"line {node.lineno}: import {a.name}")
        elif isinstance(node, ast.ImportFrom) and node.module and node.module.split(".")[0] in PY_IMPORTS:
            found.append(f"line {node.lineno}: from {node.module} import")
    return found


_TS_COMMENT = re.compile(r"//[^\n]*|/\*.*?\*/", re.S)


def ts_strip_comments(src: str) -> str:
    """Remove comments, leaving string contents alone. A `//` inside a string
    (a URL) must survive, so strings are matched first and kept."""
    out, i, n = [], 0, len(src)
    while i < n:
        c = src[i]
        if c in "\"'`":
            j = i + 1
            while j < n and src[j] != c:
                j += 2 if src[j] == "\\" else 1
            out.append(src[i:j + 1])
            i = j + 1
        elif src.startswith("//", i):
            j = src.find("\n", i)
            i = n if j < 0 else j
        elif src.startswith("/*", i):
            j = src.find("*/", i + 2)
            out.append("\n" * src.count("\n", i, n if j < 0 else j))
            i = n if j < 0 else j + 2
        else:
            out.append(c)
            i += 1
    return "".join(out)


def ts_offences(src: str) -> list[str]:
    code = ts_strip_comments(src)
    found = []
    for lineno, line in enumerate(code.splitlines(), 1):
        for rx, what in ((MODEL_NAME, "model name"), (API, "embeddings endpoint"), (TS_IMPORT, "import")):
            m = rx.search(line)
            if m:
                found.append(f"line {lineno}: {what} {m.group(0)!r}")
    return found


def scan() -> dict[str, list[str]]:
    bad: dict[str, list[str]] = {}
    for path in tracked():
        if allowed(path):
            continue
        p = REPO / path
        if not p.exists():
            continue
        src = p.read_text(errors="replace")
        hits = py_offences(src) if path.endswith(".py") else ts_offences(src)
        if hits:
            bad[path] = hits
    return bad


# ── the TS mirror ───────────────────────────────────────────────────────────
BEGIN = "// BEGIN GENERATED from mandate/embedding/spaces.json by check_boundary.py --write. Do not edit."
END = "// END GENERATED"


def ts_block() -> str:
    spec = json.loads(SPEC.read_text())
    clean = {
        "model": spec["model"], "dim": spec["dim"], "queryModel": spec["query_model"],
        "spaces": {k: {kk: vv for kk, vv in v.items() if not kk.startswith("_")}
                   for k, v in spec["spaces"].items()},
        "stored": spec["stored"],
        "vectorColumns": spec["vector_columns"],
    }
    body = json.dumps(clean, indent=2)
    return f"{BEGIN}\nexport const SPEC = {body} as const;\n{END}"


def mirror_paths() -> list[Path]:
    return [REPO / root / TS_MIRROR_REL for root in FRONTEND_ROOTS if (REPO / root / TS_MIRROR_REL).exists()]


def mirror_problems(write: bool) -> list[str]:
    problems = []
    paths = mirror_paths()
    if not paths:
        return [f"no TS mirror found at any of {[r + TS_MIRROR_REL for r in FRONTEND_ROOTS]}"]
    want = ts_block()
    for p in paths:
        src = p.read_text()
        m = re.search(re.escape(BEGIN) + r".*?" + re.escape(END), src, re.S)
        if not m:
            problems.append(f"{p.relative_to(REPO)}: no generated block")
            continue
        if m.group(0) != want:
            if write:
                p.write_text(src[:m.start()] + want + src[m.end():])
                print(f"rewrote the generated block in {p.relative_to(REPO)}")
            else:
                problems.append(f"{p.relative_to(REPO)}: generated block differs from spaces.json "
                                f"(run: python3 mandate/embedding/check_boundary.py --write)")
    return problems


def main(argv: list[str]) -> int:
    write = "--write" in argv
    problems = mirror_problems(write)
    ratchet = set(json.loads(RATCHET.read_text())["frozen"]) if RATCHET.exists() else set()
    bad = scan()
    seen_frozen = set()
    for path, hits in sorted(bad.items()):
        rel = frontend_rel(path)
        key = f"<frontend>/{rel}" if rel is not None else path
        if key in ratchet:
            seen_frozen.add(key)
            continue
        problems.append(f"{path}: " + "; ".join(hits[:4]) + (" ..." if len(hits) > 4 else "")
                        + "\n    -> use mandate.embedding (Python) or lib/embedding.ts (TS)")
    for key in sorted(ratchet - seen_frozen):
        problems.append(f"{key}: no longer calls an embedding model directly -- remove it from "
                        f"mandate/embedding/boundary_ratchet.json (the ratchet only shrinks)")
    for p in problems:
        print("FAIL", p)
    print(f"embedding boundary: {len(bad) - len(seen_frozen)} violation(s), "
          f"{len(seen_frozen)} frozen legacy script(s)" if problems else
          f"embedding boundary sound ({len(seen_frozen)} frozen legacy scripts, ratchet only shrinks)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
