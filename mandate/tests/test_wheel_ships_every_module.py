"""The installed `mandate` package must hold every module the source tree has.

Laptops and tests import mandate/ as a directory (editable install), so a module
missing from the WHEEL is invisible everywhere except a container: on 7-9 Nov
2026 the policy image had no `mandate.runs` and every Regina refresh ran
unrecorded. This builds the wheel and compares it with the tree, so a new
module can never again exist only on laptops.
"""
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

import pytest

PKG = Path(__file__).resolve().parents[1]
NOT_SHIPPED = {"tests", "ops", "eval/runs"}


def _source_modules() -> set[str]:
    out = set()
    for p in PKG.rglob("*.py"):
        rel = p.relative_to(PKG).as_posix()
        if any(rel == d or rel.startswith(d + "/") for d in NOT_SHIPPED) or "/.venv/" in f"/{rel}":
            continue
        out.add(f"mandate/{rel}")
    return out


@pytest.mark.skipif(shutil.which("uv") is None, reason="needs uv to build the wheel")
def test_wheel_ships_every_module():
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(["uv", "build", "--wheel", "-o", d, str(PKG)], check=True,
                       capture_output=True)
        whl = next(Path(d).glob("*.whl"))
        shipped = {n for n in zipfile.ZipFile(whl).namelist() if n.endswith(".py")}
    missing = sorted(_source_modules() - shipped)
    assert not missing, f"in the source tree but not in the installed package: {missing}"
