"""mandate.llm.batch: the one Message Batches helper. A fake client; no spend."""
from __future__ import annotations

import psycopg
import pytest

from mandate.llm.batch import (Batcher, Item, MemoryStore, PgStore, StoreUnavailable,
                               cached_system, estimate_usd, usage_usd)
from mandate.llm.testing import FakeBatchClient


def params(text="hello", model="claude-haiku-4-5", system="SYS"):
    return {"model": model, "max_tokens": 50, "system": cached_system(system),
            "messages": [{"role": "user", "content": text}]}


def items(n, **kw):
    return [Item(f"c{i}", params(f"text {i}", **kw), meta={"i": i}) for i in range(n)]


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t

    def sleep(self, s):
        self.t += s


def batcher(client, store=None, **kw):
    clock = Clock()
    return Batcher("test.kind", store=store or MemoryStore(), client=client, clock=clock,
                   sleep=clock.sleep, log=lambda s: None, **kw), clock


def collector():
    got = []
    return got, (lambda rs: got.extend(rs))


def test_results_are_mapped_by_custom_id_with_their_meta_and_measured_cost():
    fake = FakeBatchClient(lambda cid, p: ("ok", f"answer-{cid}"))
    b, _ = batcher(fake)
    got, handle = collector()
    out = b.run(items(3), handle, max_usd=1.0, wait_minutes=5)
    assert {r.custom_id: (r.text, r.meta) for r in got} == {
        "c0": ("answer-c0", {"i": 0}), "c1": ("answer-c1", {"i": 1}), "c2": ("answer-c2", {"i": 2})}
    assert out.succeeded == 3 and out.pending == 0 and out.collected == 1
    # 100 in + 20 out a request on haiku-4-5, at HALF price
    assert out.cost_usd == pytest.approx(3 * 0.5 * (100 * 1.0 + 20 * 5.0) / 1e6)
    row = next(iter(b.store.rows.values()))
    assert row["status"] == "collected" and row["counts"] == {"succeeded": 3}


def test_batch_pricing_is_half_and_cache_is_counted():
    u = {"input_tokens": 1_000_000, "output_tokens": 1_000_000,
         "cache_creation_input_tokens": 1_000_000, "cache_read_input_tokens": 1_000_000}
    assert usage_usd("claude-opus-5", u) == pytest.approx(0.5 * (5 + 25 + 5 * 1.25 + 0.5))
    e = estimate_usd({"model": "claude-sonnet-5", "max_tokens": 1000,
                      "messages": [{"role": "user", "content": "x" * 4000}]})
    assert e == pytest.approx(0.5 * (1000 * 2 + 1000 * 10) / 1e6)
    with pytest.raises(ValueError):
        estimate_usd({"model": "claude-unknown", "max_tokens": 1, "messages": []})


def test_the_cap_skips_or_truncates_BEFORE_anything_is_submitted():
    fake = FakeBatchClient(lambda cid, p: ("ok", "x"))
    its = [Item(f"c{i}", params(), est_usd=1.0) for i in range(5)]
    b, _ = batcher(fake)
    out = b.run(its, lambda rs: None, max_usd=3.5, over_cap="skip")
    assert fake.created == [] and "exceeds the cap" in out.skipped
    out = b.run(its, lambda rs: None, max_usd=3.5, over_cap="truncate", wait_minutes=1)
    assert fake.n_requests == 3 and out.truncated == 2 and out.estimate_usd == 3.0


def test_what_is_in_flight_is_never_submitted_twice_and_the_next_run_collects_it():
    fake = FakeBatchClient(lambda cid, p: ("ok", cid), polls_to_end=10**9)
    store = MemoryStore()
    b, _ = batcher(fake, store)
    got, handle = collector()
    out = b.run(items(3), handle, max_usd=1, wait_minutes=0)
    assert out.pending == 1 and got == []
    # next week: the same work list plus one new item; the 3 are still in flight
    b2, _ = batcher(fake, store)
    out2 = b2.run(items(4), handle, max_usd=1, wait_minutes=0)
    assert out2.in_flight_skipped == 3 and [r["custom_id"] for r in fake.created[-1][1]] == ["c3"]
    # the batches end; a run that submits nothing collects both, by custom_id
    fake.polls_to_end = 0
    b3, _ = batcher(fake, store)
    b3.run([], handle, max_usd=1)
    assert sorted(r.custom_id for r in got) == ["c0", "c1", "c2", "c3"]
    assert all(r["status"] == "collected" for r in store.rows.values())


def test_the_wait_is_bounded_and_never_blocks_forever():
    fake = FakeBatchClient(lambda cid, p: ("ok", "x"), polls_to_end=10**9)
    b, clock = batcher(fake, poll_seconds=30)
    out = b.run(items(2), lambda rs: None, max_usd=1, wait_minutes=7)
    assert out.pending == 1 and 7 * 60 <= clock.t <= 7 * 60 + 30


def test_retryable_errors_are_resubmitted_once_and_invalid_requests_are_not():
    calls: dict[str, int] = {}

    def respond(cid, p):
        calls[cid] = calls.get(cid, 0) + 1
        if cid == "c0":
            return ("errored", "overloaded_error")          # retryable, fails twice
        if cid == "c1" and calls[cid] == 1:
            return ("expired",)                              # retryable, then fine
        if cid == "c2":
            return ("errored", "invalid_request_error")     # never retried
        if cid == "c3":
            return ("refusal",)
        return ("ok", "fine")

    fake = FakeBatchClient(respond)
    b, _ = batcher(fake)
    got, handle = collector()
    out = b.run(items(5), handle, max_usd=1, wait_minutes=10)
    final = {}
    for r in got:
        final[r.custom_id] = r
    assert final["c1"].ok and final["c4"].ok
    assert final["c0"].error == "errored:overloaded_error"
    assert final["c2"].error == "errored:invalid_request_error" and not final["c2"].retryable
    assert final["c3"].error == "refusal" and final["c3"].text is None
    assert calls == {"c0": 2, "c1": 2, "c2": 1, "c3": 1, "c4": 1}   # max_attempts=2
    assert out.retried == 2 and out.pending == 0


def test_a_handler_that_fails_leaves_the_batch_to_be_collected_again():
    fake = FakeBatchClient(lambda cid, p: ("ok", "x"))
    store = MemoryStore()
    b, _ = batcher(fake, store)

    def boom(rs):
        raise RuntimeError("db down")
    with pytest.raises(RuntimeError):
        b.run(items(2), boom, max_usd=1, wait_minutes=1)
    assert [r["status"] for r in store.rows.values()] == ["submitted"]
    got, handle = collector()
    batcher(fake, store)[0].run([], handle, max_usd=1)
    assert len(got) == 2


def test_an_unrecordable_batch_is_cancelled_and_nothing_is_submitted_without_a_store():
    class Broken(MemoryStore):
        def record(self, row):
            raise StoreUnavailable("gone")
    fake = FakeBatchClient(lambda cid, p: ("ok", "x"))
    b, _ = batcher(fake, Broken())
    with pytest.raises(StoreUnavailable):
        b.run(items(2), lambda rs: None, max_usd=1)
    assert fake.cancelled == [fake.created[0][0]]

    class Unreachable(MemoryStore):
        def probe(self):
            raise StoreUnavailable("no table")
    fake2 = FakeBatchClient(lambda cid, p: ("ok", "x"))
    with pytest.raises(StoreUnavailable):
        batcher(fake2, Unreachable())[0].run(items(2), lambda rs: None, max_usd=1)
    assert fake2.created == []


def test_requests_are_split_by_count_and_grouped_by_shared_system_prompt():
    fake = FakeBatchClient(lambda cid, p: ("ok", "x"))
    its = [Item(f"a{i}", params(system="A")) for i in range(3)] + \
          [Item(f"b{i}", params(system="B")) for i in range(3)]
    its = [its[0], its[3], its[1], its[4], its[2], its[5]]          # interleaved
    b, _ = batcher(fake)
    b.run(its, lambda rs: None, max_usd=1, chunk=3, wait_minutes=1)
    assert [[r["custom_id"] for r in reqs] for _, reqs in fake.created] == [
        ["a0", "a1", "a2"], ["b0", "b1", "b2"]] or \
        [[r["custom_id"] for r in reqs] for _, reqs in fake.created] == [
        ["b0", "b1", "b2"], ["a0", "a1", "a2"]]
    sysblock = fake.created[0][1][0]["params"]["system"][0]
    assert sysblock["cache_control"] == {"type": "ephemeral"}


def test_duplicate_custom_ids_are_refused():
    b, _ = batcher(FakeBatchClient(lambda cid, p: ("ok", "x")))
    with pytest.raises(ValueError):
        b.run([Item("x", params()), Item("x", params())], lambda rs: None, max_usd=1)


# ── the real table, in the production layout ─────────────────────────────────

def test_pgstore_is_durable_across_processes_and_holds_each_brain_to_its_rows(mdb):
    fake = FakeBatchClient(lambda cid, p: ("ok", "x"), polls_to_end=10**9)
    store = PgStore(mdb.url("capital_app"))
    b, _ = batcher(fake, store)
    out = b.run(items(3), lambda rs: None, max_usd=1, wait_minutes=0)
    assert out.pending == 1
    # a NEW Batcher (a later run) sees the in-flight items from the table alone
    b2, _ = batcher(fake, PgStore(mdb.url("capital_app")))
    assert set(b2.in_flight()) == {"c0", "c1", "c2"} and b2.in_flight()["c1"] == {"i": 1}
    fake.polls_to_end = 0
    got, handle = collector()
    b2.run([], handle, max_usd=1)
    assert len(got) == 3
    with psycopg.connect(mdb.url("capital_ro")) as c:
        row = c.execute("SELECT status, request_count, counts, cost_usd > 0, models "
                        "FROM mandate.llm_batches WHERE batch_id = %s", (out.batches[0],)).fetchone()
    assert row == ("collected", 3, {"succeeded": 3}, True, ["claude-haiku-4-5"])
    with psycopg.connect(mdb.url("policy_app"), autocommit=True) as c:
        assert c.execute("UPDATE mandate.llm_batches SET status = 'abandoned' "
                         "WHERE batch_id = %s", (out.batches[0],)).rowcount == 0
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("DELETE FROM mandate.llm_batches")


def test_pgstore_probe_refuses_a_read_only_role(mdb):
    with pytest.raises(StoreUnavailable):
        PgStore(mdb.url("capital_ro")).probe()
    with pytest.raises(StoreUnavailable):
        PgStore(None).probe()
    PgStore(mdb.url("capital_app")).probe()
