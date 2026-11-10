"""Running without a model budget: a paid step skips cleanly. No model, no spend, no DB.

    python3 ETL/events/extract/test_budget_skip.py

CRON:   railway_cron.main over three fake steps. The paid one exits
        budget.EXIT_SKIPPED with its reason: it is recorded `skipped` in
        mandate.run_steps with that reason, its corpus mark closes OK (the store
        is whole), the census is NOT degraded, the steps after it still run, the
        run finishes `ok` and its summary names the pause.
SCRIPTS: with LLM_BUDGET=off the real paid scripts exit EXIT_SKIPPED with the
        reason as their last line, before touching the API or the database.
"""
from __future__ import annotations

import contextlib
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ETL = HERE.parents[1]
os.environ.pop("DATABASE_URL", None)
os.environ.pop("MANDATE_RUN_ID", None)
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ETL.parents[1]))

from mandate.llm import budget  # noqa: E402

FAILS: list[str] = []


def check(ok: bool, what: str) -> None:
    print(("  ok    " if ok else "  FAIL  ") + what)
    if not ok:
        FAILS.append(what)


class FakeRun:
    def __init__(self):
        self.closed: dict[str, tuple[str, str]] = {}
        self.names: dict[int, str] = {}
        self.finished: tuple[str, str] | None = None

    def open_step(self, name):
        sid = len(self.names) + 1
        self.names[sid] = name
        return sid

    def close_step(self, sid, status, *, summary="", detail=None, exit_code=None):
        self.closed[self.names[sid]] = (status, summary)

    def skip_step(self, name, why):
        self.closed[name] = ("skipped", why)

    def finish(self, status, summary="", detail=None):
        self.finished = (status, summary)


def cron() -> None:
    print("CRON: a budget-skipped step")
    import railway_cron as R  # noqa: PLC0415  (importing records nothing)

    run = FakeRun()
    marks: dict[str, str] = {}
    censuses: list[str] = []

    @contextlib.contextmanager
    def mark(label, runner):
        yield lambda outcome, detail="": marks.__setitem__(label, outcome)

    R._run_log = lambda **kw: (run, True)
    R.corpus_marks.mark = mark
    R.census = censuses.append
    R.guards = lambda: []
    with tempfile.TemporaryDirectory() as d:
        free = Path(d) / "free_step.py"
        free.write_text("print('free work done')\n")
        paid = Path(d) / "paid_step.py"
        paid.write_text("import sys\nsys.path.insert(0, %r)\nfrom mandate.llm import budget\n"
                        "budget.exit_if_off('paid_step.py')\n" % str(ETL.parents[1]))
        after = Path(d) / "after_step.py"
        after.write_text("print('after')\n")
        os.environ[budget.ENV] = "off"
        try:
            R.main([[sys.executable, str(free)], [sys.executable, str(paid)],
                    [sys.executable, str(after)]])
        except SystemExit as e:
            check(False, f"main exited {e.code}; a budget skip must not end the run")
        finally:
            os.environ.pop(budget.ENV, None)
    status, summary = run.closed.get("paid_step.py", ("missing", ""))
    check(status == "skipped", f"paid step recorded `skipped` (got {status})")
    check(summary == budget.skip_reason("paid_step.py"), f"with its reason: {summary!r}")
    check(marks.get("paid_step.py") == R.corpus_marks.OK, "its corpus mark closes OK")
    check(run.closed.get("after_step.py", ("",))[0] == "ok", "the step after it still ran")
    check(censuses == ["ok"], f"the census is not degraded: {censuses}")
    check(run.finished is not None and run.finished[0] == "ok", f"run finished ok: {run.finished}")
    check(run.finished is not None and "paid steps paused (LLM budget off): paid_step.py"
          in run.finished[1], "and its summary names the pause")


def scripts() -> None:
    print("SCRIPTS: LLM_BUDGET=off, the real paid steps")
    env = {**os.environ, budget.ENV: "off", "ANTHROPIC_API_KEY": "", "DATABASE_URL": ""}
    for argv, step in (
        (["ETL/intelligence/transform/classify_relevance.py", "submit"], "classify_relevance.py submit"),
        (["ETL/intelligence/transform/classify_signals.py", "collect"], "classify_signals.py collect"),
        (["ETL/intelligence/transform/entity_link_articles.py", "submit"], "entity_link_articles.py submit"),
        (["ETL/events/transform/classify_taxonomy.py", "run"], "classify_taxonomy run"),
    ):
        p = subprocess.run([sys.executable, *argv], cwd=ETL.parent, env=env,
                           capture_output=True, text=True, timeout=120)
        last = (p.stdout.strip().splitlines() or [""])[-1]
        check(p.returncode == budget.EXIT_SKIPPED and last == budget.skip_reason(step),
              f"{step}: rc={p.returncode}, last line {last!r}"
              + (f"\n{p.stderr[-600:]}" if p.returncode != budget.EXIT_SKIPPED else ""))


if __name__ == "__main__":
    cron()
    scripts()
    if FAILS:
        print(f"\n{len(FAILS)} FAILED")
        sys.exit(1)
    print("\nall ok")
