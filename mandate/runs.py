"""The run log: every refresh, and every step of it, in mandate.runs / run_steps.

    from mandate.runs import RunLog
    log = RunLog.start(url, brain="capital", kind="weekly_refresh", trigger="cron")
    with log.step("populate instruments") as step:
        ...                       # step.detail["rows"] = 1092 ; step.status = "partial"
    log.finish("ok", "all steps ran")

WHY A DATABASE AND NOT A PROCESS. Policy's refresh state lived in the API's
memory and a redeploy erased it: its data went 12 days stale with nothing to
show it had (found 2026-11-06). A run here is a row that outlives the
container, the deploy and the person who started it, and the daily health check
(mandate/health/check.py) reads it.

NEVER THE REASON A REFRESH FAILS. The log is a reporting channel. If the
database cannot be reached, or the table does not exist yet, every method here
degrades to a printed warning and a no-op: a refresh that cannot be recorded
must still refresh. (The health check then reports the missing run, which is
the accurate description.) Pass `strict=True` to raise instead, which tests do.

Each call uses its OWN short connection in autocommit, so a step's row is
committed the moment it opens -- a container that dies mid-step leaves a row
saying the step began and never finished, which is the fact worth having.
"""
from __future__ import annotations

import contextlib
import json
import os
import socket
import sys
from dataclasses import dataclass, field
from typing import Any, Iterator

STATUSES = ("running", "ok", "partial", "failed", "abandoned")
STEP_STATUSES = ("running", "ok", "partial", "failed", "skipped")

#: Env var naming the run a child process belongs to: the orchestrator sets it,
#: and a brain's runner started under it records its steps on that run.
RUN_ID_ENV = "MANDATE_RUN_ID"


def _warn(msg: str) -> None:
    print(f"[mandate.runs] {msg}", file=sys.stderr, flush=True)


@dataclass
class Step:
    name: str
    status: str = "ok"
    summary: str = ""
    detail: dict = field(default_factory=dict)
    exit_code: int | None = None


class RunLog:
    """One run. Construct with `start` (new row) or `attach` (an existing id)."""

    def __init__(self, url: str | None, run_id: int | None, *, strict: bool = False):
        self.url = url
        self.id = run_id
        self.strict = strict
        self._ord = 0

    # ── connection ─────────────────────────────────────────────────────────
    def _exec(self, sql: str, params: tuple = (), *, fetch: bool = False):
        if not self.url:
            return None
        try:
            import psycopg  # noqa: PLC0415
            with psycopg.connect(self.url, autocommit=True, connect_timeout=15) as c:
                cur = c.execute(sql, params)
                return cur.fetchone() if fetch else None
        except Exception as exc:  # noqa: BLE001 -- see the module docstring
            if self.strict:
                raise
            _warn(f"could not record ({type(exc).__name__}: {str(exc)[:200]})")
            return None

    # ── runs ───────────────────────────────────────────────────────────────
    @classmethod
    def start(cls, url: str | None, *, brain: str, kind: str, trigger: str = "manual",
              parent_id: int | None = None, detail: dict | None = None,
              strict: bool = False) -> "RunLog":
        log = cls(url, None, strict=strict)
        row = log._exec(
            "INSERT INTO mandate.runs (brain, kind, trigger, parent_id, detail, host) "
            "VALUES (%s, %s, %s, %s, %s::jsonb, %s) RETURNING id",
            (brain, kind, trigger, parent_id, json.dumps(detail or {}), socket.gethostname()),
            fetch=True)
        log.id = row[0] if row else None
        return log

    @classmethod
    def attach(cls, url: str | None, run_id: int | None, *, strict: bool = False) -> "RunLog":
        """A handle on a run another process started (MANDATE_RUN_ID)."""
        log = cls(url, run_id, strict=strict)
        if run_id is not None:
            row = log._exec("SELECT COALESCE(max(ord), 0) FROM mandate.run_steps "
                            "WHERE run_id = %s", (run_id,), fetch=True)
            log._ord = row[0] if row else 0
        return log

    def heartbeat(self, detail: dict | None = None) -> None:
        if self.id is None:
            return
        if detail:
            self._exec("UPDATE mandate.runs SET heartbeat_at = now(), "
                       "detail = detail || %s::jsonb WHERE id = %s",
                       (json.dumps(detail), self.id))
        else:
            self._exec("UPDATE mandate.runs SET heartbeat_at = now() WHERE id = %s", (self.id,))

    def finish(self, status: str, summary: str = "", detail: dict | None = None) -> None:
        if status not in STATUSES:
            raise ValueError(f"run status {status!r} not in {STATUSES}")
        if self.id is None:
            return
        self._exec("UPDATE mandate.runs SET status = %s, summary = %s, finished_at = now(), "
                   "heartbeat_at = now(), detail = detail || %s::jsonb WHERE id = %s",
                   (status, summary[:2000], json.dumps(detail or {}), self.id))

    # ── steps ──────────────────────────────────────────────────────────────
    def open_step(self, name: str) -> int | None:
        self._ord += 1
        if self.id is None:
            return None
        row = self._exec("INSERT INTO mandate.run_steps (run_id, ord, name) VALUES (%s, %s, %s) "
                         "RETURNING id", (self.id, self._ord, name[:200]), fetch=True)
        self.heartbeat()
        return row[0] if row else None

    def close_step(self, step_id: int | None, status: str, *, summary: str = "",
                   detail: dict | None = None, exit_code: int | None = None) -> None:
        if status not in STEP_STATUSES:
            raise ValueError(f"step status {status!r} not in {STEP_STATUSES}")
        if step_id is None:
            return
        self._exec("UPDATE mandate.run_steps SET status = %s, summary = %s, detail = %s::jsonb, "
                   "exit_code = %s, finished_at = now() WHERE id = %s",
                   (status, summary[:2000], json.dumps(detail or {}, default=str), exit_code, step_id))
        self.heartbeat()

    def skip_step(self, name: str, why: str) -> None:
        sid = self.open_step(name)
        self.close_step(sid, "skipped", summary=why)

    @contextlib.contextmanager
    def step(self, name: str) -> Iterator[Step]:
        """Open a step, yield a Step to fill in, close it with what was set.
        An exception closes it `failed` (with the exception as summary) and re-raises."""
        s = Step(name)
        sid = self.open_step(name)
        try:
            yield s
        except BaseException as exc:
            self.close_step(sid, "failed", summary=f"{type(exc).__name__}: {exc}"[:2000],
                            detail=s.detail, exit_code=s.exit_code)
            raise
        self.close_step(sid, s.status, summary=s.summary, detail=s.detail, exit_code=s.exit_code)

    # ── reading ────────────────────────────────────────────────────────────
    def status(self) -> tuple[str, str] | None:
        row = self._exec("SELECT status, summary FROM mandate.runs WHERE id = %s",
                         (self.id,), fetch=True) if self.id is not None else None
        return (row[0], row[1]) if row else None


def from_env(url: str | None = None, *, brain: str, kind: str, trigger: str = "cron",
             strict: bool = False) -> tuple[RunLog, bool]:
    """The run this process should record on: the orchestrator's (MANDATE_RUN_ID,
    attached) or a new one. Returns (log, owned) -- `owned` False means somebody
    else will finish it."""
    url = url if url is not None else os.environ.get("DATABASE_URL")
    rid = os.environ.get(RUN_ID_ENV, "").strip()
    if rid.isdigit():
        return RunLog.attach(url, int(rid), strict=strict), False
    return RunLog.start(url, brain=brain, kind=kind, trigger=trigger, strict=strict), True


def latest(url: str, *, brain: str, kind: str | None = None) -> dict[str, Any] | None:
    """The newest run of a brain (optionally of one kind), as a dict, or None."""
    import psycopg  # noqa: PLC0415
    from psycopg.rows import dict_row  # noqa: PLC0415
    with psycopg.connect(url, autocommit=True, row_factory=dict_row) as c:
        return c.execute(
            "SELECT * FROM mandate.runs WHERE brain = %s AND (%s::text IS NULL OR kind = %s) "
            "ORDER BY started_at DESC LIMIT 1", (brain, kind, kind)).fetchone()
