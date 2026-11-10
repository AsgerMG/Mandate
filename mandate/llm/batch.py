"""THE way a Mandate job sends many requests to Claude: one Message Batch helper.

    from mandate.llm.batch import Batcher, Item, PgStore, cached_system

    b = Batcher("capital.taxonomy", store=PgStore.from_env(), brain="capital")
    items = [Item("f123", params, meta={"top": "digital"}), ...]
    out = b.run(items, handle, max_usd=20, wait_minutes=60)
    # handle(results) is called once per ENDED batch with a list of Result, and the
    # batch is marked collected only after it returns. out.pending > 0 means some
    # batches had not ended inside the budget: the NEXT run collects them.

WHY BATCHES. The Message Batches API runs the same requests asynchronously at
HALF the price (input, output and cache tokens alike), usually inside an hour and
never past 24 h. Every bulk job here is an overnight or operator-run labelling
pass; none needs an answer in seconds. Interactive calls (a founder's brief, a
Regina answer) stay live and never come here.

THE CONTRACT, in the order a run goes through it:

  1. COLLECT FIRST. Any batch of this kind still recorded as submitted (from this
     run or any earlier one) is retrieved; an ended one has its results streamed,
     keyed by custom_id (never by position), handed to `handle`, and is then
     marked collected with its MEASURED cost. A batch still processing is left.
  2. NEVER RESUBMIT WHAT IS IN FLIGHT. Items whose custom_id is in an uncollected
     batch are dropped from the submission (`in_flight()`), so a job that derives
     its work list from "what has no result yet" can run every week without
     paying twice for a batch that has not ended.
  3. CAP BEFORE SUBMITTING. The estimate (batch prices) is checked against
     `max_usd` before anything is sent: over the cap, either nothing is submitted
     (`over_cap="skip"`, the cron's rule: a backlog spike waits for a human) or
     the list is cut to what fits (`"truncate"`, the operator's rule).
  4. DURABLE OR NOT AT ALL. The store is probed before the first submission; a
     batch id that could not be recorded is CANCELLED, because a batch nobody
     can find is money spent for nothing. No file state, ever: the cron's disk is
     scratch (capital migration 035 is the history).
  5. WAIT UP TO A BUDGET, NEVER FOREVER. `wait_minutes` bounds the poll. What has
     not ended by then stays recorded and is collected by the next run.
  6. RETRY WHAT IS RETRYABLE. Items that came back errored (other than an invalid
     request), or expired, are resubmitted once within the same run while the
     budget lasts. Their params are only held in this process, so an item that
     failed in an earlier run is simply re-derived by the caller's work list.

CACHE-FRIENDLY. `cached_system(text)` puts the shared instruction first with a
cache breakpoint, and a submission is ordered by system prompt so requests that
share one sit together. Caching inside a batch is best-effort; it is billed at
the batch rate when it lands, and `usage` records what it saved.

The state table is mandate.llm_batches (mandate/db/llm_batches.sql), one row per
batch, row-level security like mandate.runs. It is the platform's, not a brain's,
because batching is not a brain's concern; it supersedes capital.batch_state
(which the signals classifiers still use, listed for porting).
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable

from mandate.llm import budget

#: $/MTok at STANDARD rates: (input, output, cache read). A cache write costs
#: CACHE_WRITE x input. Batch pricing is BATCH_DISCOUNT x all of it. A model not
#: listed here cannot be estimated, so it cannot be submitted (a cap that cannot
#: be computed is not a cap).
PRICES: dict[str, tuple[float, float, float]] = {
    "claude-opus-5-5": (4.00, 20.00, 0.20),
    "claude-opus-5": (5.00, 25.00, 0.50),
    "claude-opus-4-8": (5.00, 25.00, 0.50),
    "claude-sonnet-5-5": (2.00, 10.00, 0.20),
    "claude-sonnet-5": (2.00, 10.00, 0.20),
    "claude-sonnet-4-6": (3.00, 15.00, 0.30),
    "claude-haiku-5-5": (0.10, 0.50, 0.01),
    "claude-haiku-4-5": (1.00, 5.00, 0.10),
}
CACHE_WRITE = 1.25
BATCH_DISCOUNT = 0.5
#: The API's own limits are 100,000 requests and 256 MB a batch; stay under both.
MAX_REQUESTS = 100_000
MAX_BYTES = 200 * 1024 * 1024
CHARS_PER_TOKEN = 4


def _warn(msg: str) -> None:
    print(f"[mandate.llm.batch] {msg}", file=sys.stderr, flush=True)


def cached_system(text: str) -> list[dict]:
    """The shared instruction as the first, cached block of the prompt."""
    return [{"type": "text", "text": text, "cache_control": {"type": "ephemeral"}}]


# ── cost ─────────────────────────────────────────────────────────────────────

def _price(model: str) -> tuple[float, float, float]:
    if model not in PRICES:
        raise ValueError(f"no price for model {model!r}: add it to mandate/llm/batch.py PRICES")
    return PRICES[model]


def _text_len(x: Any) -> int:
    if x is None:
        return 0
    if isinstance(x, str):
        return len(x)
    if isinstance(x, dict):
        return sum(_text_len(v) for k, v in x.items() if k in ("text", "content", "system"))
    if isinstance(x, (list, tuple)):
        return sum(_text_len(v) for v in x)
    return 0


def estimate_usd(params: dict, out_tokens: int | None = None) -> float:
    """An UPPER-leaning estimate of one request at batch prices: input from the
    prompt's characters (no cache credit), output = `out_tokens` or max_tokens."""
    p_in, p_out, _ = _price(params["model"])
    tin = (_text_len(params.get("system")) + _text_len(params.get("messages"))) / CHARS_PER_TOKEN
    tout = params.get("max_tokens", 0) if out_tokens is None else out_tokens
    return BATCH_DISCOUNT * (tin * p_in + tout * p_out) / 1e6


def usage_usd(model: str, usage: dict) -> float:
    """What a result actually cost, at batch prices, from its usage."""
    p_in, p_out, p_cr = _price(model)
    return BATCH_DISCOUNT * (
        usage.get("input_tokens", 0) * p_in
        + usage.get("cache_creation_input_tokens", 0) * p_in * CACHE_WRITE
        + usage.get("cache_read_input_tokens", 0) * p_cr
        + usage.get("output_tokens", 0) * p_out) / 1e6


USAGE_KEYS = ("input_tokens", "output_tokens", "cache_creation_input_tokens",
              "cache_read_input_tokens")


# ── data ─────────────────────────────────────────────────────────────────────

@dataclass
class Item:
    """One request. `meta` is stored with the batch (JSON) and handed back with
    the result, so a later run can write it back without this process."""
    custom_id: str
    params: dict
    meta: Any = None
    est_usd: float | None = None     # the caller's own estimate, if it has a better one

    def estimate(self) -> float:
        return self.est_usd if self.est_usd is not None else estimate_usd(self.params)


@dataclass
class Result:
    custom_id: str
    ok: bool                       # succeeded AND not a refusal
    text: str | None               # the first text block, when ok
    message: Any = None            # the SDK Message, when the request succeeded
    error: str | None = None       # errored:<type> | expired | canceled | refusal
    retryable: bool = False
    meta: Any = None
    usage: dict = field(default_factory=dict)
    batch_id: str = ""


@dataclass
class Outcome:
    submitted: int = 0             # requests sent this run (retries included)
    batches: list[str] = field(default_factory=list)   # submitted this run
    collected: int = 0             # batches collected this run
    succeeded: int = 0
    failed: int = 0
    retried: int = 0
    in_flight_skipped: int = 0
    pending: int = 0               # batches of this kind still processing at the end
    estimate_usd: float = 0.0
    cost_usd: float = 0.0          # measured, over the batches collected this run
    skipped: str = ""              # why nothing was submitted, if so
    truncated: int = 0             # items cut by the cap
    #: "" or budget.OFF / budget.EXHAUSTED: no paid call was (or could be) made,
    #: and `skipped` carries budget.skip_reason. The caller exits EXIT_SKIPPED.
    budget: str = ""

    def line(self) -> str:
        s = (f"submitted {self.submitted} request(s) in {len(self.batches)} batch(es) "
             f"(est ${self.estimate_usd:.2f}); collected {self.collected} batch(es): "
             f"{self.succeeded} ok, {self.failed} failed, {self.retried} retried; "
             f"measured ${self.cost_usd:.2f}; {self.pending} batch(es) still pending")
        if self.in_flight_skipped:
            s += f"; {self.in_flight_skipped} item(s) already in flight"
        if self.truncated:
            s += f"; {self.truncated} item(s) left for a later run by the cap"
        if self.skipped:
            s += f"; NOT SUBMITTED: {self.skipped}"
        return s


class StoreUnavailable(RuntimeError):
    """The batch store cannot record a batch: nothing may be submitted."""


# ── stores ───────────────────────────────────────────────────────────────────

class MemoryStore:
    """The store contract, in memory. For tests and --dry-run only: it is NOT
    durable, and PgStore is what every real run uses."""

    def __init__(self) -> None:
        self.rows: dict[str, dict] = {}

    def probe(self) -> None:
        return None

    def record(self, row: dict) -> None:
        self.rows[row["batch_id"]] = {**row, "status": "submitted"}

    def pending(self, kind: str) -> list[dict]:
        return [dict(r) for r in self.rows.values()
                if r["kind"] == kind and r["status"] == "submitted"]

    def mark_collected(self, batch_id: str, *, cost_usd: float, usage: dict,
                       counts: dict, status: str = "collected") -> None:
        self.rows[batch_id].update(status=status, cost_usd=cost_usd, usage=usage,
                                   counts=counts)


class PgStore:
    """mandate.llm_batches. Each call is its own short autocommit connection: a
    batch can take an hour and no transaction is held across it."""

    def __init__(self, url: str | None):
        self.url = url

    @classmethod
    def from_env(cls, url: str | None = None) -> "PgStore":
        return cls(url if url is not None else
                   (os.environ.get("MANDATE_BATCH_DATABASE_URL")
                    or os.environ.get("DATABASE_URL")))

    def _connect(self):
        if not self.url:
            raise StoreUnavailable("no database URL (DATABASE_URL) for mandate.llm_batches")
        import psycopg  # noqa: PLC0415
        return psycopg.connect(self.url, autocommit=True, connect_timeout=15)

    def probe(self) -> None:
        """Can this role record a batch? Checked BEFORE paying for one."""
        try:
            with self._connect() as c:
                ok = c.execute("SELECT has_table_privilege('mandate.llm_batches', 'INSERT') "
                               "AND has_table_privilege('mandate.llm_batches', 'UPDATE')"
                               ).fetchone()[0]
        except StoreUnavailable:
            raise
        except Exception as exc:  # noqa: BLE001
            raise StoreUnavailable(f"mandate.llm_batches unreachable "
                                   f"({type(exc).__name__}: {str(exc)[:200]})") from exc
        if not ok:
            raise StoreUnavailable("this role may not INSERT/UPDATE mandate.llm_batches")

    def record(self, row: dict) -> None:
        with self._connect() as c:
            c.execute(
                "INSERT INTO mandate.llm_batches (batch_id, kind, brain, run_id, attempt, items, "
                "request_count, models, estimate_usd) VALUES (%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s)",
                (row["batch_id"], row["kind"], row["brain"], row.get("run_id"),
                 row.get("attempt", 1), json.dumps(row["items"]), row["request_count"],
                 row.get("models", []), row.get("estimate_usd")))

    def pending(self, kind: str) -> list[dict]:
        with self._connect() as c:
            cur = c.execute(
                "SELECT batch_id, kind, attempt, items, request_count, models FROM mandate.llm_batches "
                "WHERE kind = %s AND status = 'submitted' ORDER BY submitted_at", (kind,))
            cols = [d.name for d in cur.description]
            return [dict(zip(cols, r)) for r in cur.fetchall()]

    def mark_collected(self, batch_id: str, *, cost_usd: float, usage: dict,
                       counts: dict, status: str = "collected") -> None:
        with self._connect() as c:
            c.execute(
                "UPDATE mandate.llm_batches SET status = %s, cost_usd = %s, usage = %s::jsonb, "
                "counts = %s::jsonb, collected_at = now() WHERE batch_id = %s",
                (status, round(cost_usd, 6), json.dumps(usage), json.dumps(counts), batch_id))


# ── the runner ───────────────────────────────────────────────────────────────

def _system_key(params: dict) -> str:
    return hashlib.sha1(json.dumps([params.get("model"), params.get("system")],
                                   sort_keys=True, default=str).encode()).hexdigest()


def _first_text(message: Any) -> str | None:
    for b in getattr(message, "content", None) or []:
        if getattr(b, "type", None) == "text":
            return b.text
    return None


def _usage_dict(message: Any) -> dict:
    u = getattr(message, "usage", None)
    return {k: int(getattr(u, k, 0) or 0) for k in USAGE_KEYS} if u is not None else {}


def _error_type(res: Any) -> str:
    """The error type of an errored result, however deep the SDK nests it."""
    err = getattr(res, "error", None)
    for _ in range(3):
        if err is None:
            break
        t = getattr(err, "type", None)
        inner = getattr(err, "error", None)
        if inner is None or t not in (None, "error"):
            return str(t or "unknown")
        err = inner
    return "unknown"


Handler = Callable[[list[Result]], None]


class Batcher:
    def __init__(self, kind: str, *, store, client=None, brain: str = "capital",
                 run_id: int | None = None, poll_seconds: float = 30.0,
                 max_attempts: int = 2, clock: Callable[[], float] = time.monotonic,
                 sleep: Callable[[float], None] = time.sleep, log: Callable[[str], None] = print):
        self.kind = kind
        self.store = store
        self._client = client
        self.brain = brain
        if run_id is None:
            rid = os.environ.get("MANDATE_RUN_ID", "").strip()
            run_id = int(rid) if rid.isdigit() else None
        self.run_id = run_id
        self.poll_seconds = poll_seconds
        self.max_attempts = max_attempts
        self.clock = clock
        self.sleep = sleep
        self.log = log
        #: custom_id -> (Item, attempt) for what THIS process submitted, so an
        #: errored item can be resubmitted without the caller.
        self._mine: dict[str, tuple[Item, int]] = {}

    @property
    def client(self):
        if self._client is None:
            import anthropic  # noqa: PLC0415
            self._client = anthropic.Anthropic()
        return self._client

    # ── what is in flight ──────────────────────────────────────────────────
    def in_flight(self) -> dict[str, Any]:
        """custom_id -> meta, over every batch of this kind not yet collected."""
        out: dict[str, Any] = {}
        for row in self.store.pending(self.kind):
            out.update(row.get("items") or {})
        return out

    # ── submit ─────────────────────────────────────────────────────────────
    def plan(self, items: Iterable[Item], *, max_usd: float,
             over_cap: str = "skip") -> tuple[list[Item], float, Outcome]:
        """What would be submitted, and its estimate. Calls nothing but the store."""
        if over_cap not in ("skip", "truncate"):
            raise ValueError("over_cap is 'skip' or 'truncate'")
        out = Outcome()
        flying = self.in_flight()
        todo, seen = [], set()
        for it in items:
            if it.custom_id in seen:
                raise ValueError(f"duplicate custom_id {it.custom_id!r}")
            seen.add(it.custom_id)
            if it.custom_id in flying:
                out.in_flight_skipped += 1
                continue
            todo.append(it)
        est = [it.estimate() for it in todo]
        total = sum(est)
        if total > max_usd:
            if over_cap == "skip":
                out.skipped = (f"estimated ${total:.2f} exceeds the cap ${max_usd:.2f} "
                               f"-- needs a human to raise it")
                out.estimate_usd = total
                return [], total, out
            keep, run = [], 0.0
            for it, e in zip(todo, est):
                if run + e > max_usd:
                    break
                keep.append(it)
                run += e
            out.truncated = len(todo) - len(keep)
            todo, total = keep, run
        out.estimate_usd = total
        return todo, total, out

    def _split(self, items: list[Item], chunk: int) -> list[list[Item]]:
        # Grouped by (model, system): requests that share a cached prefix sit
        # together. Stable, so the caller's order holds within a group.
        items = sorted(items, key=lambda it: _system_key(it.params))
        parts, cur, size = [], [], 0
        for it in items:
            n = len(json.dumps(it.params, default=str)) + len(it.custom_id) + 64
            if cur and (len(cur) >= min(chunk, MAX_REQUESTS) or size + n > MAX_BYTES):
                parts.append(cur)
                cur, size = [], 0
            cur.append(it)
            size += n
        if cur:
            parts.append(cur)
        return parts

    def submit(self, items: list[Item], *, chunk: int = 10_000, attempt: int = 1,
               out: Outcome | None = None) -> list[str]:
        """Submit `items` (already planned) and record every batch durably."""
        out = out or Outcome()
        if not items:
            return []
        self.store.probe()
        ids = []
        for part in self._split(items, chunk):
            batch = self.client.messages.batches.create(
                requests=[{"custom_id": it.custom_id, "params": it.params} for it in part])
            row = {"batch_id": batch.id, "kind": self.kind, "brain": self.brain,
                   "run_id": self.run_id, "attempt": attempt,
                   "items": {it.custom_id: it.meta for it in part},
                   "request_count": len(part),
                   "models": sorted({it.params["model"] for it in part}),
                   "estimate_usd": round(sum(it.estimate() for it in part), 6)}
            try:
                self._record(row)
            except Exception as exc:  # noqa: BLE001
                _warn(f"could NOT record {batch.id} ({type(exc).__name__}: {exc}); "
                      f"cancelling it so nothing is paid for that nobody can collect")
                try:
                    self.client.messages.batches.cancel(batch.id)
                except Exception as exc2:  # noqa: BLE001
                    _warn(f"cancel of {batch.id} ALSO failed ({exc2}): record it by hand")
                raise StoreUnavailable(f"batch {batch.id} could not be recorded") from exc
            for it in part:
                self._mine[it.custom_id] = (it, attempt)
            ids.append(batch.id)
            out.submitted += len(part)
            out.batches.append(batch.id)
            self.log(f"  [{self.kind}] submitted {batch.id}: {len(part)} request(s), "
                     f"est ${row['estimate_usd']:.2f}" + (f" (retry {attempt - 1})" if attempt > 1 else ""))
        return ids

    def _record(self, row: dict) -> None:
        last = None
        for i in range(3):
            try:
                return self.store.record(row)
            except StoreUnavailable:
                raise
            except Exception as exc:  # noqa: BLE001 -- a transient blip gets two more tries
                last = exc
                self.sleep(2 ** i)
        raise last  # type: ignore[misc]

    # ── collect ────────────────────────────────────────────────────────────
    def _results(self, batch_id: str, items: dict) -> list[Result]:
        out = []
        for res in self.client.messages.batches.results(batch_id):
            cid = res.custom_id
            r = res.result
            meta = items.get(cid) if items else None
            if r.type == "succeeded":
                msg = r.message
                refusal = getattr(msg, "stop_reason", None) == "refusal"
                out.append(Result(cid, ok=not refusal, text=None if refusal else _first_text(msg),
                                  message=msg, error="refusal" if refusal else None,
                                  meta=meta, usage=_usage_dict(msg), batch_id=batch_id))
            elif r.type == "errored":
                et = _error_type(r)
                out.append(Result(cid, ok=False, text=None, error=f"errored:{et}",
                                  retryable="invalid_request" not in et, meta=meta,
                                  batch_id=batch_id))
            else:   # expired | canceled
                out.append(Result(cid, ok=False, text=None, error=r.type,
                                  retryable=r.type == "expired", meta=meta, batch_id=batch_id))
        return out

    def collect(self, handle: Handler, out: Outcome | None = None) -> Outcome:
        """Write back every ENDED batch of this kind; leave the rest for later."""
        out = out or Outcome()
        retry: list[tuple[Item, int]] = []
        for row in self.store.pending(self.kind):
            bid = row["batch_id"]
            b = self.client.messages.batches.retrieve(bid)
            if b.processing_status != "ended":
                continue
            results = self._results(bid, row.get("items") or {})
            handle(results)        # raises -> the batch stays uncollected
            usage = {k: 0 for k in USAGE_KEYS}
            cost = 0.0
            unpriced: set = set()
            counts: dict[str, int] = {}
            for r in results:
                key = "succeeded" if r.ok else (r.error or "failed").split(":")[0]
                counts[key] = counts.get(key, 0) + 1
                for k in USAGE_KEYS:
                    usage[k] += r.usage.get(k, 0)
                if r.message is not None:
                    model = getattr(r.message, "model", None)
                    if model not in PRICES and len(row.get("models") or []) == 1:
                        model = row["models"][0]
                    if model in PRICES:
                        cost += usage_usd(model, r.usage)
                    else:
                        unpriced.add(model)
                if r.ok:
                    out.succeeded += 1
                else:
                    out.failed += 1
                    mine = self._mine.get(r.custom_id)
                    if r.retryable and mine and mine[1] < self.max_attempts:
                        retry.append((mine[0], mine[1] + 1))
            if unpriced:
                _warn(f"{bid}: no price for {sorted(map(str, unpriced))}; not counted in its cost")
            self.store.mark_collected(bid, cost_usd=cost, usage=usage, counts=counts)
            out.collected += 1
            out.cost_usd += cost
            self.log(f"  [{self.kind}] collected {bid}: "
                     + ", ".join(f"{k}={v}" for k, v in sorted(counts.items()))
                     + f", ${cost:.2f} measured")
        if retry:
            by_attempt: dict[int, list[Item]] = {}
            for it, a in retry:
                by_attempt.setdefault(a, []).append(it)
            for a, its in by_attempt.items():
                self.submit(its, attempt=a, out=out)
                out.retried += len(its)
        return out

    # ── the whole thing ────────────────────────────────────────────────────
    def run(self, items: Iterable[Item], handle: Handler, *, max_usd: float,
            wait_minutes: float = 0, over_cap: str = "skip", chunk: int = 10_000,
            submit: bool = True) -> Outcome:
        """Collect what has ended, submit what is new (capped), wait up to
        `wait_minutes` collecting as batches end, and return. Never blocks past
        the budget; what is still processing is recorded for the next run."""
        # The budget switch, and the credit-exhausted 400, are ONE outcome
        # (mandate/llm/budget.py): nothing submitted, nothing collected, every
        # recorded batch left for the run after the budget returns.
        if not budget.llm_enabled():
            return Outcome(budget=budget.OFF, skipped=budget.skip_reason(self.kind))
        out = Outcome()
        try:
            return self._run(items, handle, out, max_usd=max_usd, wait_minutes=wait_minutes,
                             over_cap=over_cap, chunk=chunk, submit=submit)
        except Exception as exc:  # noqa: BLE001 -- re-raised unless it is the credit error
            if not budget.is_budget_exhausted(exc):
                raise
            _warn(f"{self.kind}: Anthropic credit exhausted ({exc}); stopping, "
                  f"what was recorded stays recorded")
            out.budget = budget.EXHAUSTED
            out.skipped = budget.skip_reason(self.kind, budget.EXHAUSTED)
            out.pending = len(self.store.pending(self.kind))
            return out

    def _run(self, items, handle, out: Outcome, *, max_usd, wait_minutes, over_cap,
             chunk, submit) -> Outcome:
        deadline = self.clock() + 60.0 * max(0.0, wait_minutes)
        self.collect(handle, out)
        if submit:
            todo, _est, planned = self.plan(items, max_usd=max_usd, over_cap=over_cap)
            out.estimate_usd += planned.estimate_usd
            out.in_flight_skipped += planned.in_flight_skipped
            out.truncated += planned.truncated
            out.skipped = planned.skipped
            if todo:
                self.submit(todo, chunk=chunk, out=out)
        while True:
            pending = len(self.store.pending(self.kind))
            if not pending or self.clock() >= deadline:
                break
            self.sleep(min(self.poll_seconds, max(1.0, deadline - self.clock())))
            self.collect(handle, out)
        out.pending = len(self.store.pending(self.kind))
        return out
