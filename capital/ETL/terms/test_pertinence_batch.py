"""classify_eligibility_pertinence.py on the Message Batch path: no model, no DB.

    python3 ETL/terms/test_pertinence_batch.py

A fake batch client answers each request from the ids in its own listing; the
corpus readers are replaced by fixed rows; the cache is a temp file. Proves:
  * the cache entries are the same shape the live path wrote
    ({verdict, reason, v, sample}, sample = whitespace-normalised body[:220]);
  * a text in two populations is asked about once;
  * a batch that has not ended is collected by the NEXT run, which writes the
    same entries and does not resubmit what is in flight;
  * --max-usd truncates BEFORE submitting; --report submits nothing;
  * a failed request leaves its texts unjudged rather than guessed.
"""
from __future__ import annotations

import contextlib
import io
import json
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import classify_eligibility_pertinence as P  # noqa: E402
from mandate.llm.batch import Batcher, MemoryStore  # noqa: E402
from mandate.llm.testing import FakeBatchClient  # noqa: E402

GATES = [{"ref": f"inst{i}/g", "body": f"Applicants must be SMEs  with\nfewer than {i} staff.",
          "value_spec": None} for i in range(30)]
TEXTS = [{"ref": "inst0", "body": "Only companies registered in Estonia may apply. " * 3}]


def respond(failing: set[str] = frozenset()):
    def answer(cid, params):
        listing = params["messages"][0]["content"]
        ids = re.findall(r"^### ([0-9a-f]{16})$", listing, re.M)
        if any(i in failing for i in ids):
            return ("errored", "invalid_request_error")
        return ("ok", json.dumps({"results": [
            {"id": i, "verdict": "condition", "reason": f"reason {i[:4]}"} for i in ids]}))
    return answer


def harness(tmp: Path, fake, store):
    P.CACHE = tmp / "eligibility_pertinence.json"
    P.rows_gates = lambda: [dict(r) for r in GATES]
    P.rows_text = lambda: [dict(r) for r in TEXTS]
    cal = json.loads(P.CALIBRATION.read_text())["cases"]

    def go(*argv):
        b = Batcher(P.BATCH_KIND, store=store, client=fake, log=lambda s: None,
                    sleep=lambda s: None)
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            P.main(list(argv), batcher=b)
        return buf.getvalue()
    return go, cal


def test_entries_have_the_live_shape_and_nothing_is_asked_twice() -> None:
    with tempfile.TemporaryDirectory() as t:
        fake = FakeBatchClient(respond())
        go, cal = harness(Path(t), fake, MemoryStore())
        go("--classify", "--wait-minutes", "1")
        cache = json.loads(P.CACHE.read_text())
        v = cache["verdicts"]
        for r in GATES + TEXTS:
            e = v[P.digest(r["body"])]
            assert e == {"verdict": "condition", "reason": f"reason {P.digest(r['body'])[:4]}",
                         "v": P.PROPERTY_VERSION,
                         "sample": re.sub(r"\s+", " ", r["body"]).strip()[:220]}, e
        assert set(cache) == {"_comment", "_property", "_property_version", "_versions",
                              "_model", "verdicts"}
        asked = [d for _, reqs in fake.created for r in reqs
                 for d in re.findall(r"^### ([0-9a-f]{16})$", r["params"]["messages"][0]["content"], re.M)]
        assert len(asked) == len(set(asked)), "a text was paid for twice"
        n_distinct = len({P.digest(r["body"]) for r in GATES + TEXTS} |
                         {P.digest(c["text"]) for c in cal})
        assert len(asked) == n_distinct
        # the shared instruction is the first, cached block
        sysblk = fake.created[0][1][0]["params"]["system"]
        assert sysblk[0]["text"] == P.PROPERTY and sysblk[0]["cache_control"]
        # a second run has nothing to judge and submits nothing
        before = len(fake.created)
        go("--classify")
        assert len(fake.created) == before
    print("  ok    entries keep the live shape; each text asked once; a re-run is free")


def test_a_batch_that_has_not_ended_is_collected_next_run_and_not_resubmitted() -> None:
    with tempfile.TemporaryDirectory() as t:
        fake = FakeBatchClient(respond(), polls_to_end=10**9)
        store = MemoryStore()
        go, _ = harness(Path(t), fake, store)
        out = go("--classify", "--wait-minutes", "0")
        assert "PENDING: 1 batch(es)" in out, out
        assert not json.loads(P.CACHE.read_text())["verdicts"].get(P.digest(GATES[0]["body"]))
        n = fake.n_requests
        out2 = go("--classify", "--wait-minutes", "0")          # still processing
        assert fake.n_requests == n, "resubmitted work that is in flight"
        assert "already in a submitted batch" in out2
        fake.polls_to_end = 0
        go("--classify", "--wait-minutes", "0")
        v = json.loads(P.CACHE.read_text())["verdicts"]
        assert all(P.digest(r["body"]) in v for r in GATES + TEXTS)
        assert fake.n_requests == n
    print("  ok    a pending batch is collected by the next run, never resubmitted")


def test_the_cap_truncates_before_submitting_and_report_calls_nothing() -> None:
    with tempfile.TemporaryDirectory() as t:
        fake = FakeBatchClient(respond())
        go, _ = harness(Path(t), fake, MemoryStore())
        out = go("--report")
        assert fake.created == [] and "at batch prices" in out and "PLAN:" in out
        one = P.estimate([GATES[0]["body"]] * P.CHUNK_GATES, P.CHUNK_GATES)[3]
        go("--classify", "--max-usd", f"{one * 1.5:.6f}", "--wait-minutes", "1")
        assert fake.n_requests == 1, fake.n_requests
    print("  ok    --max-usd cuts the submission to fit; --report submits nothing")


def test_a_failed_request_leaves_its_texts_unjudged() -> None:
    with tempfile.TemporaryDirectory() as t:
        bad = P.digest(GATES[3]["body"])
        fake = FakeBatchClient(respond({bad}))
        go, _ = harness(Path(t), fake, MemoryStore())
        out = go("--classify", "--wait-minutes", "1")
        v = json.loads(P.CACHE.read_text())["verdicts"]
        assert bad not in v and "failed (errored:invalid_request_error)" in out
    print("  ok    a failed request leaves its texts unjudged, and says so")


if __name__ == "__main__":
    print("pertinence on the batch path:")
    test_entries_have_the_live_shape_and_nothing_is_asked_twice()
    test_a_batch_that_has_not_ended_is_collected_next_run_and_not_resubmitted()
    test_the_cap_truncates_before_submitting_and_report_calls_nothing()
    test_a_failed_request_leaves_its_texts_unjudged()
    print("all passed")
