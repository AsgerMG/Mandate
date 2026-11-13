"""An eval run as a bench conversation: the writer loop.run_case calls, and the
importer for the runs already saved. No model, no network: fixtures only."""
from __future__ import annotations

import json
import os
import re
import stat
from types import SimpleNamespace

from mandate.eval import run_conversation as rc

ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{5,63}$")  # web/lib/bench/model.ts ID_RE

BENCH_MD = """# Bench run: fintech_guarantees, round 3 (2026-11-10)

Case: `mandate/eval/scenarios/fintech_guarantees.yaml`. Brain: Wincent.

## The case

> We are a fintech lender. We want our SME loan portfolio
> guaranteed. What are our routes?

## Turn 1: Wincent asks first

1. **Legal form?** It decides the gate.

## Turn 1: founder's answers (scenario `founder_followup`)

> We are a German GmbH with no
> branches.

## Tool calls (one line each)

1. `find_instruments`: six rows.

## Wincent's answer

### 1. Answer

Go to the EU first [c1].

```mandate-board
{"answer": {"lines": ["EU first"], "confidence": "medium"}}
```

### 2. Sources

- [c1] EIF call page.

## Self-score (written after reading must / must_not)

met 4 of 7.

## Grade (owner)

```
grade: 4
```
"""

LOOP_MD = """# Loop run: fintech_guarantees (loo)

Case: `mandate/eval/scenarios/fintech_guarantees.yaml`. Brain: Regina. Playbooks at abc. One-reply re-test on the bench (no API spend), 2026-11-13T07:19:46+00:00, 178.8s.

## The case

> We build an AI tutor.
>
> More about us, so you can answer in one go: UK company.
>
> (Bench re-test: work the case in full in this one reply; do not stop to ask questions first. Do not save the run.)

## Regina's answer

# The AI Act first

## 1. Answer

Classify the system first.
"""

LEDGER = [{"id": "c1", "citation": {"quote": "Deadline: 30 June 2027", "canonical_url": "urn:x", "title": None}, "label": "EIF call"}]


def test_the_id_is_stable_and_within_the_apps_id_rule():
    a = rc.conversation_id("mandate/eval/runs/loop/after_scaffold/robotics_deployment_it_2.md")
    assert a == rc.conversation_id("mandate/eval/runs/loop/after_scaffold/robotics_deployment_it_2.md")
    assert ID_RE.match(a) and a.startswith("run-loop-after-scaffold-robotics")
    long = rc.conversation_id("mandate/eval/runs/loop/" + "x" * 80 + "/" + "y" * 80 + ".md")
    assert ID_RE.match(long)
    assert a != rc.conversation_id("mandate/eval/runs/loop/after_scaffold/robotics_deployment_it.md")


def test_a_saved_bench_transcript_splits_into_founder_and_brain_turns(tmp_path):
    p = tmp_path / "runs" / "bench" / "2026-11-10_fintech_guarantees_round3.md"
    p.parent.mkdir(parents=True)
    p.write_text(BENCH_MD)
    p.with_suffix(".ledger.json").write_text(json.dumps(LEDGER))
    judged = {"2026-11-10_fintech_guarantees_round3": {"case": "fintech_guarantees", "grade": 3, "holistic_grade": 4, "must_met": 4,
                                                       "must_partly": 1, "must_total": 7, "must_not_hit": 0, "overall": "Right shape."}}
    c = rc.from_saved_run(p, judgements=judged, known_cases=["fintech_guarantees"])
    roles = [m["role"] for m in c["messages"]]
    assert roles == ["client", "agent", "client", "agent"]
    founder, ask, followup, answer = (m["text"] for m in c["messages"])
    assert founder == "We are a fintech lender. We want our SME loan portfolio guaranteed. What are our routes?"
    assert ask.startswith("1. **Legal form?**")
    assert followup == "We are a German GmbH with no branches."
    # the answer keeps its board block (the Board tab reads it) and stops before the run's bookkeeping
    assert "```mandate-board" in answer and "Go to the EU first [c1]." in answer
    assert "Self-score" not in answer and "find_instruments" not in answer and "grade: 4" not in answer
    t = c["eval_run"]
    assert c["kind"] == "eval_run" and c["case"] == "fintech_guarantees" and c["agent"] == c["brain"] == "wincent"
    assert t["case_id"] == "fintech_guarantees" and t["tag"] == "bench" and t["grade"] == 3 and t["owner_grade"] == 4
    assert t["judge"]["overall"] == "Right shape." and t["source"] == "bench"
    assert c["cites"] == {"c1": {"quote": "Deadline: 30 June 2027", "label": "EIF call", "url": "urn:x"}}
    assert c["title"] == "fintech guarantees (round3)"


def test_a_one_reply_loop_transcript_is_one_founder_message_and_the_answer(tmp_path):
    p = tmp_path / "runs" / "loop" / "loo" / "fintech_guarantees.md"
    p.parent.mkdir(parents=True)
    p.write_text(LOOP_MD)
    c = rc.from_saved_run(p, judgements={}, known_cases=[])
    assert [m["role"] for m in c["messages"]] == ["client", "agent"]
    assert c["messages"][0]["text"] == "We build an AI tutor.\n\nUK company."   # no bench instruction, no lead-in
    assert c["messages"][1]["text"].startswith("# The AI Act first") and "Classify the system first." in c["messages"][1]["text"]
    assert c["eval_run"]["tag"] == "loo" and c["eval_run"]["brain"] == "regina" and c["eval_run"]["grade"] is None
    assert c["created_at"] == "2026-11-13T07:19:46+00:00" and c["title"] == "fintech guarantees (loo)"


def test_the_loop_writer_writes_the_apps_conversation_file(tmp_path, monkeypatch):
    monkeypatch.setenv("MANDATE_BENCH_DATA", str(tmp_path))
    ledger = tmp_path / "ledger.json"
    ledger.write_text(json.dumps(LEDGER))
    s = SimpleNamespace(id="kids_policy", founder_says="We build an AI tutor.", founder_followup="UK company.")
    conv = rc.from_loop_run(s=s, brain="regina", tag="iter2", run_rel="mandate/eval/runs/loop/iter2/kids_policy.md", answer="## Answer\n\nAI Act.",
                            ran_at="2026-11-13T10:00:00+00:00", ledger=str(ledger),
                            judgement={"grade": 2, "holistic_grade": 3, "must_met": 1, "must_partly": 0, "must_total": 3, "must_not_hit": 1},
                            judgement_file=str(rc.JUDGEMENTS / "loop_iter2_kids_policy.x.json"))
    p = rc.write(conv)
    assert p == tmp_path / "conversations" / f"{conv['id']}.json"
    assert stat.S_IMODE(os.stat(p).st_mode) == 0o600
    saved = json.loads(p.read_text())
    # every field the app's BenchConversation requires
    for k in ("id", "mandate_id", "agent", "brain", "kind", "title", "session_id", "messages", "cites", "sources", "saved", "created_at", "updated_at"):
        assert k in saved, k
    assert saved["messages"] == [
        {"role": "client", "text": "We build an AI tutor.\n\nUK company.", "at": "2026-11-13T10:00:00+00:00"},
        {"role": "agent", "text": "## Answer\n\nAI Act.", "at": "2026-11-13T10:00:00+00:00"},
    ]
    assert saved["eval_run"]["grade"] == 2 and saved["eval_run"]["judge"]["judgement"] == "mandate/eval/judgements/loop_iter2_kids_policy.x.json"
    assert saved["eval_run"]["run_file"] == "mandate/eval/runs/loop/iter2/kids_policy.md" and saved["cites"]["c1"]["url"] == "urn:x"
    assert not list((tmp_path / "conversations").glob("*.tmp"))


def test_a_reimport_keeps_every_review_and_never_drops_one(tmp_path):
    base = dict(case_id="c", brain="wincent", tag="t", run_file="mandate/eval/runs/loop/t/c.md", ran_at="2026-11-13T10:00:00+00:00", source="loop")
    conv = rc.build(messages=[("client", "Q"), ("agent", "A1")], **base)
    p = rc.write(conv, tmp_path)
    saved = json.loads(p.read_text())
    review = {"item_id": "f-abc123", "reviewer": "Expert", "rating": "off", "note": "Wrong regime.", "at": "x"}
    saved["messages"][1]["reviews"] = [review]
    saved["review_grades"] = [{"item_id": "f-def456", "reviewer": "Expert", "grade": 2, "note": "", "at": "x"}]
    saved["grade"] = {"grade": 2, "item_id": "f-def456"}
    p.write_text(json.dumps(saved))
    # same text: the review stays on its message
    again = json.loads(rc.write(rc.build(messages=[("client", "Q"), ("agent", "A1")], **base), tmp_path).read_text())
    assert again["messages"][1]["reviews"] == [review] and again["grade"]["grade"] == 2 and len(again["review_grades"]) == 1
    # the reply's text changed: the review is kept aside, not lost
    changed = json.loads(rc.write(rc.build(messages=[("client", "Q"), ("agent", "A2")], **base), tmp_path).read_text())
    assert "reviews" not in changed["messages"][1]
    assert changed["orphan_reviews"][0]["reviews"] == [review] and changed["orphan_reviews"][0]["text"] == "A1"


def test_every_saved_run_in_the_repo_imports_with_a_reply(tmp_path):
    runs = rc.saved_runs()
    assert runs, "no saved runs to import"
    for p in runs:
        c = rc.from_saved_run(p, judgements={})
        assert ID_RE.match(c["id"]), c["id"]
        assert c["messages"][0]["role"] == "client", p.name
        assert c["messages"][-1]["role"] == "agent" and len(c["messages"][-1]["text"]) > 200, p.name
        assert c["eval_run"]["brain"] in ("wincent", "regina")
