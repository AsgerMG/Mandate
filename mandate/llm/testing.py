"""A fake Message Batches client, for tests: no network, no spend.

    fake = FakeBatchClient(lambda cid, params: ("ok", '{"x": 1}'))
    Batcher("k", store=MemoryStore(), client=fake)

`respond(custom_id, params)` returns one of
    ("ok", text[, usage])          a succeeded result whose first text block is `text`
    ("refusal",)                   succeeded, stop_reason refusal
    ("errored", error_type)        e.g. "overloaded_error", "invalid_request_error"
    ("expired",) / ("canceled",)
A batch ends after `polls_to_end` retrieves (0 = ended at once). `fake.created`
holds every submitted request list, `fake.cancelled` every cancelled id.
"""
from __future__ import annotations

import itertools
from types import SimpleNamespace as NS
from typing import Callable

DEFAULT_USAGE = {"input_tokens": 100, "output_tokens": 20,
                 "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0}


class _Batches:
    def __init__(self, outer: "FakeBatchClient"):
        self.o = outer

    def create(self, requests):
        bid = f"msgbatch_fake{next(self.o._ids):04d}"
        reqs = [dict(r) for r in requests]
        self.o.created.append((bid, reqs))
        self.o._state[bid] = {"requests": reqs, "polls": 0}
        if self.o.fail_create:
            raise RuntimeError("create failed")
        return NS(id=bid, processing_status="in_progress")

    def retrieve(self, bid):
        st = self.o._state[bid]
        st["polls"] += 1
        ended = st["polls"] > self.o.polls_to_end or bid in self.o.cancelled
        return NS(id=bid, processing_status="ended" if ended else "in_progress")

    def cancel(self, bid):
        self.o.cancelled.append(bid)
        return NS(id=bid, processing_status="canceling")

    def results(self, bid):
        for r in self.o._state[bid]["requests"]:
            cid, params = r["custom_id"], r["params"]
            if bid in self.o.cancelled:
                yield NS(custom_id=cid, result=NS(type="canceled"))
                continue
            ans = self.o.respond(cid, params)
            kind = ans[0]
            if kind in ("ok", "refusal"):
                text = ans[1] if kind == "ok" else ""
                usage = ans[2] if len(ans) > 2 else DEFAULT_USAGE
                msg = NS(model=params["model"], stop_reason="refusal" if kind == "refusal" else "end_turn",
                         content=[NS(type="text", text=text)] if kind == "ok" else [],
                         usage=NS(**usage))
                yield NS(custom_id=cid, result=NS(type="succeeded", message=msg))
            elif kind == "errored":
                err = NS(type="error", error=NS(type=ans[1], message="fake"))
                yield NS(custom_id=cid, result=NS(type="errored", error=err))
            else:
                yield NS(custom_id=cid, result=NS(type=kind))


class FakeBatchClient:
    def __init__(self, respond: Callable, *, polls_to_end: int = 0):
        self.respond = respond
        self.polls_to_end = polls_to_end
        self.created: list[tuple[str, list]] = []
        self.cancelled: list[str] = []
        self.fail_create = False
        self._state: dict[str, dict] = {}
        self._ids = itertools.count(1)
        self.messages = NS(batches=_Batches(self))

    @property
    def n_requests(self) -> int:
        return sum(len(r) for _, r in self.created)
