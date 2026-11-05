"""How the run that built this store went, recorded IN the store.

── The defect this closes ─────────────────────────────────────────────────
A partial run has always produced an artifact indistinguishable from a whole
one. On 2026-08-09 `refresh_open_calls.py` exited 3 inside the Railway
container, `railway_cron.py` correctly continued, and the census recorded
`partial: refresh_open_calls.py` — into POSTGRES. The corpus the run had just
half-refreshed sat on a volume, byte-for-byte a valid SQLite file, carrying no
trace of it.

That separation is the whole problem, and it is not a reporting bug. The
outcome of a run is a property OF THE CORPUS THAT RUN PRODUCED, and it was
being stored somewhere the corpus does not go. `make pull-db` copies rows;
`push_db_verified.py` copies rows; `merge_volume_into_local.py` unions rows.
None of them copies a Postgres census, so on the far side of any of them a
half-built corpus is simply a corpus, and `refresh.py` will happily publish it
and record `ok`.

── The property ───────────────────────────────────────────────────────────
    A STORE CARRIES THE OUTCOME OF THE LAST RUN OF EVERY PIPELINE STEP THAT
    WRITES TO IT. A step is UNRESOLVED when it was opened and never closed, or
    closed with an outcome other than 'ok'. No corpus holding an unresolved
    step may be published, and no census may describe one as 'ok'.

Two things follow from stating it that way rather than as a list:

  It covers steps nobody has written yet. The RUNNERS open and close the marks
  (ETL/refresh.py, ETL/events/extract/railway_cron.py), around every step in
  their own step list — so a step added next year is marked without anybody
  remembering, exactly as PYTHONUNBUFFERED is set on the environment in
  refresh_open_calls.py rather than inside each stage.

  It cannot be satisfied by a log line. `check_corpus_marks.py` reads the
  table, `publish_corpus_census.py` folds it into `run_outcome`, and
  `corpusCensus.ts::admissibility` — which BOTH the guard and the home page
  already call — refuses any run_outcome that is not exactly 'ok'. There is no
  consumer that can acknowledge the corpus without acknowledging this.

── Why an open mark and a failed mark mean the same thing ─────────────────
Deliberately. A mark is written and COMMITTED before the step runs, so a
container killed by an OOM, a Railway deploy, or a timeout leaves it open. That
is not a transaction — five subprocesses each committing their own
writes cannot share one, and claiming a boundary that is not enforced is the
shape this repo keeps paying for. What it gives instead is durable intent: the
store always knows that something began writing to it and never said it was
done. A real transactional boundary would need every step to write through one
connection, one `BEGIN`, and a single `COMMIT` at the end — which would mean the
whole weekly refresh holding a write lock on a file the website reads, and
losing a completed step's work because a later one failed. Durable intent is
the honest version of the same guarantee.

── What ABSENCE means, and why it is not 'ok' ─────────────────────────────
An absent table is NOT an empty one, and neither is a pass. This repo has
already deleted 141 correct filters by reading an absent register as empty.

  table absent   the store's schema predates the marks (corpus_schema.sql
                 declares the table). That is a SCHEMA fact, already carried by
                 the census's `schema_state` and checked by
                 check_store_schema.py, so it is reported here as
                 UNKNOWN rather than counted as clean or double-reported as a
                 failure.
  table empty    no marked run has ever touched this store. Reported as
                 UNKNOWN for the same reason, and it arms itself: the first
                 marked run fills it and from then on a missing mark for a step
                 that ran is an unresolved one. Nobody has to re-arm it.

UNKNOWN is not a pass either — callers are handed it separately and decide.
`check_corpus_marks.py` prints it and stays green only while NO store has ever
been marked, which is a condition that ends on the next run and cannot be
re-entered.
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

_sys.path.insert(0, str(_Path(__file__).resolve().parent))

import contextlib  # noqa: E402
import datetime as _dt  # noqa: E402
import os  # noqa: E402
import uuid  # noqa: E402

from store import connect, table_exists  # noqa: E402

TABLE = "corpus_run_marks"

#: The environment variable a runner exports so every subprocess it launches —
#: and every check it runs — agrees about which run is in flight. Read rather
#: than passed, so a step that shells out to another step inherits it.
RUN_ID_ENV = "WINCENT_RUN_ID"

OK = "ok"
PARTIAL = "partial"
FAILED = "failed"


def run_id() -> str:
    """This run's id, minted once and inherited by everything it launches."""
    existing = os.environ.get(RUN_ID_ENV)
    if existing:
        return existing
    fresh = f"{_dt.datetime.now(_dt.timezone.utc):%Y%m%dT%H%M%S}-{uuid.uuid4().hex[:6]}"
    os.environ[RUN_ID_ENV] = fresh
    return fresh


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds")


@contextlib.contextmanager
def _session(con=None, readonly: bool = False):
    """The caller's connection when given (the self-test's, holding a TEMP
    table), otherwise a fresh one of our own that commits on exit -- which is
    the point for open_mark: the mark must be durable before the step runs."""
    if con is not None:
        yield con
        return
    with connect(readonly=readonly) as own:
        yield own


def exists(con) -> bool:
    return table_exists(con, TABLE)


def open_mark(step: str, runner: str, con=None) -> None:
    """Say that `step` has begun writing to this store, and COMMIT it.

    Committed before the step runs, which is the entire point: a process that
    dies between here and `close_mark` leaves the store saying so. The table is
    created by the schema (ETL/schema/corpus_schema.sql), not here: a missing
    table is a schema fact the cron's first step already fails on.
    """
    with _session(con) as c:
        c.execute(
            f"INSERT INTO {TABLE} (step, run_id, runner, opened_at, closed_at, "
            f"outcome, detail) VALUES (%s, %s, %s, %s, NULL, NULL, NULL) "
            f"ON CONFLICT (step) DO UPDATE SET run_id = EXCLUDED.run_id, "
            f"runner = EXCLUDED.runner, opened_at = EXCLUDED.opened_at, "
            f"closed_at = NULL, outcome = NULL, detail = NULL",
            (step, run_id(), runner, _now()))


def close_mark(step: str, outcome: str, detail: str = "", con=None) -> None:
    """Say how `step` ended. Only ('ok', closed) resolves it."""
    if outcome not in (OK, PARTIAL, FAILED):
        raise ValueError(f"outcome must be one of ok/partial/failed, not {outcome!r}")
    with _session(con) as c:
        c.execute(
            f"UPDATE {TABLE} SET closed_at = %s, outcome = %s, detail = %s "
            f"WHERE step = %s AND run_id = %s",
            (_now(), outcome, detail[:500], step, run_id()))


@contextlib.contextmanager
def mark(step: str, runner: str, con=None):
    """Wrap a step. The caller reports the outcome; an escaping exception — or a
    process that never gets here at all — leaves the mark open, which reads as
    unresolved by design.

        with mark("reload open calls", "refresh.py") as m:
            rc = subprocess.run(...).returncode
            m(OK if rc == 0 else PARTIAL if rc in tolerated else FAILED, f"rc={rc}")
    """
    open_mark(step, runner, con)
    state: dict[str, tuple[str, str]] = {}

    def report(outcome: str, detail: str = "") -> None:
        state["v"] = (outcome, detail)

    try:
        yield report
    finally:
        if "v" in state:
            close_mark(step, state["v"][0], state["v"][1], con)


def read(con=None) -> tuple[list[dict], str | None]:
    """Every mark in the store.

    Returns (marks, unknown_reason). `unknown_reason` is set — and `marks` is
    empty — when the store cannot answer the question at all, which is a
    different fact from answering "nothing is wrong". See the module docstring.
    """
    with _session(con, readonly=True) as c:
        if not exists(c):
            return [], (f"the store has no {TABLE} table — its schema predates "
                        f"the run marks, so it cannot say how its last run went")
        cols = ("step", "run_id", "runner", "opened_at", "closed_at", "outcome", "detail")
        rows = [dict(zip(cols, r)) for r in c.execute(
            f"SELECT {', '.join(cols)} FROM {TABLE} ORDER BY opened_at").fetchall()]
    if not rows:
        return [], (f"the store has an empty {TABLE} — no marked run has "
                    f"touched it yet")
    return rows, None


def is_unresolved(m: dict) -> bool:
    """The one definition. Open, or closed as anything but ok."""
    return not m.get("closed_at") or m.get("outcome") != OK


def unresolved(con=None,
               ignore_run: str | None = None) -> tuple[list[dict], str | None]:
    """The marks that say this store is not whole.

    `ignore_run` drops marks belonging to a run still in flight — a runner
    asking the question about the state the store ARRIVED in must not trip over
    its own open mark. It is an id, never a name: dropping by runner name would
    let a second concurrent run of the same script hide a real finding.
    """
    marks, unknown = read(con)
    bad = [m for m in marks
           if is_unresolved(m) and not (ignore_run and m["run_id"] == ignore_run)]
    return bad, unknown


def summarise(bad: list[dict]) -> str:
    """The census's vocabulary, so this fact travels on the channel that already
    exists rather than inventing a second one. `publish_corpus_census.py` and
    `corpusCensus.ts::admissibility` both key on the 'partial: ' / 'failed at '
    prefixes; anything here that does not start with one of them would be read
    as a clean run."""
    if not bad:
        return OK
    hard = [m for m in bad if m.get("outcome") == FAILED]
    if hard:
        return (f"failed at {hard[0]['step']} (recorded in the store"
                + (f"; +{len(bad) - 1} more" if len(bad) > 1 else "") + ")")
    return ("partial: " + ", ".join(
        f"{m['step']}"
        + ("(never closed)" if not m.get("closed_at") else "")
        for m in bad) + " (recorded in the store)")


def worse_of(claimed: str, store: str) -> str:
    """The run_outcome a census must record.

    `claimed` is what the runner says about the run it just did; `store` is what
    the corpus itself remembers, including from runs on other machines that this
    file has since been copied out of. A census must never be cleaner than
    either. Ordering, worst first: failed, partial, unknown, ok.
    """
    def rank(v: str) -> int:
        if v.startswith("failed"):
            return 0
        if v.startswith("partial"):
            return 1
        if v == OK:
            return 3
        return 2  # 'unknown', and anything unrecognised: not evidence of success
    return claimed if rank(claimed) <= rank(store) else store
