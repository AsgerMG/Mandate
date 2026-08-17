"""A verdict must be inseparable from the bar it was computed against.

FREE, hermetic. Builds a synthetic tree in a temp directory and hashes it. No
database, no network, no model call, and it never touches the real repository.

── THE FAILURE THIS ENCODES ───────────────────────────────────────────────
Census #11, taken inside the Railway container on 2026-08-16, published a gate
verdict reading

    LOSS  eligibility: 898 instruments, down from a high of 913

while `project-mgmt/coverage_baseline.json` in this repository says 937. Commit
`fe75156a`, 2026-08-12 09:45 — the morning after the image was built — raised
thirteen fields of that file, every one of which had been BELOW the mark the
corpus had actually reached. So the container graded the corpus of record
against a bar already known to be too low, and published the result as a
measurement. Against the right bar the same census fails on four counts with a
39-row shortfall, not two counts and 15.

`code_fingerprint()` hashed `ETL/**.py` and `website/build/**.py`. The baseline
is neither. DRIFTED fired anyway — by luck, because the Python happened to move
in the same deploy. Redeploy the container with unchanged code and a stale
baseline and the census publishes a verdict computed against a bar nobody can
identify, with no class firing and nothing to notice.

── THE PROPERTY, not the file ─────────────────────────────────────────────
The fix is not "also hash coverage_baseline.json". That is one instance, and a
list of instances only ever covers what somebody has already been bitten by.

    A FINGERPRINT PUBLISHED WITH A VERDICT COVERS EVERY INPUT THAT CAN CHANGE
    THAT VERDICT. Code is one of those inputs. It is not the only one, and
    nothing about a file's suffix decides whether it is one.

The test that decides an unseen case: take any file the judging code grades
against, change one byte of it, and the fingerprint must move. That question is
answerable about a file nobody has thought of yet, in a format nobody has used
yet, which is what a register of blessed filenames can never be.

Two halves, and they live in two places on purpose:

  THE ALGORITHM  is here. It must move for a declared non-code input, and it
                 must do so generically — this file asserts it on a suffix and
                 a filename that appear nowhere in the product.
  THE DECLARATION  is complete, proved in ETL/schema/check_census_imports.py by
                 deriving the true input set from the census's own import graph
                 rather than from a list. An input added next year fails there
                 the day its constant appears.

Usage: python3 ETL/schema/test_verdict_bar_fingerprinted.py
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ETL/lib"))
sys.path.insert(0, str(ROOT / "ETL/events/load"))

from guard_verdicts import fingerprint as generic_fingerprint  # noqa: E402
from publish_corpus_census import (  # noqa: E402
    FINGERPRINTED, JUDGEMENT_INPUTS, code_fingerprint,
)

FAILURES: list[str] = []


def fail(msg: str) -> None:
    FAILURES.append(msg)


def build_tree(base: Path, bar: str, code: str = "x = 1\n") -> None:
    """A repository in miniature: the two code trees, and a bar to grade against."""
    for rel in FINGERPRINTED:
        (base / rel).mkdir(parents=True, exist_ok=True)
        (base / rel / "module.py").write_text(code)
    for rel in JUDGEMENT_INPUTS:
        path = base / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(bar)


def test_the_bar_moves_the_fingerprint() -> None:
    """One byte of the bar, and nothing else. This is the real failure."""
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        build_tree(base, '{"highWater": {"eligibility": 913}}\n')
        before = code_fingerprint(base)
        build_tree(base, '{"highWater": {"eligibility": 937}}\n')
        after = code_fingerprint(base)
    if before == after:
        fail("the bar changed 913 -> 937, the code did not, and the fingerprint "
             "did not move.\n    A verdict computed against the old bar and one "
             "computed against the new are\n    indistinguishable to every reader "
             "downstream. That is census #11.")


def test_the_code_still_moves_it() -> None:
    """The obvious half, asserted because widening a hash is a good way to
    break it: a fingerprint that stopped tracking code would pass the test
    above and be worthless."""
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        build_tree(base, "same bar\n", code="x = 1\n")
        before = code_fingerprint(base)
        build_tree(base, "same bar\n", code="x = 2\n")
        after = code_fingerprint(base)
    if before == after:
        fail("the code changed and the fingerprint did not. Widening the hash "
             "must not narrow it.")


def test_it_is_the_content_not_the_name() -> None:
    """A fingerprint that moved on a filename but not on content would pass
    every test above and catch nothing real."""
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        build_tree(base, "bar\n")
        a = code_fingerprint(base)
        build_tree(base, "bar\n")
        b = code_fingerprint(base)
    if a != b:
        fail("two identical trees fingerprinted differently. The hash depends on "
             "something other than content and cannot be compared across "
             "machines, which is the one thing it exists to do.")


def test_a_suffix_nobody_has_used() -> None:
    """The test for the unseen case.

    A bar added next year will not be a `.json` under `project-mgmt/`. It might
    be a `.yaml`, a `.sql`, a `.csv`, or a shape nobody has proposed. The
    algorithm must take a NAMED FILE WHOLE, whatever it is called — so that
    declaring it is the only work, and no suffix rule has to be revisited.
    """
    for suffix in (".yaml", ".sql", ".csv", ".txt", ""):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            rel = f"project-mgmt/a_bar_nobody_has_written_yet{suffix}"
            for tree in FINGERPRINTED:
                (base / tree).mkdir(parents=True, exist_ok=True)
                (base / tree / "module.py").write_text("x = 1\n")
            (base / rel).parent.mkdir(parents=True, exist_ok=True)

            (base / rel).write_text("threshold: 913\n")
            before = generic_fingerprint([*FINGERPRINTED, rel], (".py",), base)
            (base / rel).write_text("threshold: 937\n")
            after = generic_fingerprint([*FINGERPRINTED, rel], (".py",), base)
            if before == after:
                fail(f"a declared input named `{rel}` changed and the fingerprint "
                     f"did not move.\n    Only a `.json` bar would be covered, "
                     f"which makes the property a special case for the one file\n"
                     f"    that has already gone wrong.")


def test_the_two_implementations_agree_on_the_new_shape() -> None:
    """`guard_verdicts.fingerprint` generalises `code_fingerprint`, and
    check_census_imports.py asserts they agree on the REAL tree. They must also
    agree on a tree containing a named non-code input, or the equality holds
    today and breaks the first time anybody declares a second bar."""
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        build_tree(base, "the bar\n")
        specific = code_fingerprint(base)
        generic = generic_fingerprint([*FINGERPRINTED, *JUDGEMENT_INPUTS], (".py",), base)
    if specific != generic:
        fail(f"publish_corpus_census.code_fingerprint gives {specific} and "
             f"guard_verdicts.fingerprint gives {generic}\n    over the same paths. "
             f"The census would read DRIFTED against a container running exactly "
             f"this code.")


def main() -> None:
    if not JUDGEMENT_INPUTS:
        fail("publish_corpus_census.JUDGEMENT_INPUTS is empty. The census grades "
             "against `project-mgmt/coverage_baseline.json` and publishes the "
             "result as a verdict;\n    a fingerprint that covers no input covers "
             "nothing this file is about.")
    else:
        test_the_bar_moves_the_fingerprint()
        test_the_code_still_moves_it()
        test_it_is_the_content_not_the_name()
        test_a_suffix_nobody_has_used()
        test_the_two_implementations_agree_on_the_new_shape()

    if FAILURES:
        print("FAIL: a verdict can be published against a bar nobody can identify\n")
        for f in FAILURES:
            print(f"  - {f}\n")
        sys.exit(1)
    print(f"ok: the fingerprint moves for every declared input "
          f"({', '.join(JUDGEMENT_INPUTS)}) and for the code, on content and not "
          f"on names, whatever an input is called")


if __name__ == "__main__":
    main()
