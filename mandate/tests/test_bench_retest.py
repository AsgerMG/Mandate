"""The bench's Re-test uses the loop's judge prompt, grade rule and keep / revert
rule through mandate.eval.bench_retest (the app spawns it); here without a model."""
from __future__ import annotations

import io
import json
import sys

from mandate.eval import bench_retest, rubric
from mandate.eval.scenarios import load

CASE = "fintech_guarantees"


def _judge_reply(s, verdict_must="met", verdict_not="avoided", holistic=4):
    cps = [{"id": c["id"], "verdict": verdict_must if c["kind"] == "must" else verdict_not, "reason": "r"} for c in s.checkpoints()]
    return "Must 1 met.\n\nJUDGE " + json.dumps({"checkpoints": cps, "ungrounded_facts": [], "data_gaps": [], "holistic_grade": holistic,
                                                 "strongest_move": "s", "weakest_move": "w", "overall": "o"})


def test_prompt_is_the_loops_judge_prompt_without_the_self_score():
    s = load(CASE)
    p = bench_retest.prompt(s.path, "The answer.\n\n## Self-score\n\n5/5")
    assert p == rubric.build_judge_prompt(s, "The answer.\n", model_answer=bench_retest.bench_judge.model_answer_of(s))
    assert "must_1" in p and "Self-score" not in p and "<<<\nThe answer.\n>>>" in p


def test_grade_applies_the_one_rule():
    s = load(CASE)
    j = bench_retest.grade(s.path, _judge_reply(s))
    assert j["case"] == CASE and j["grade"] == 5 and j["must_met"] == j["must_total"] == len(s.must)
    hit = bench_retest.grade(s.path, _judge_reply(s, verdict_not="hit"))
    assert hit["grade"] <= 3 and hit["must_not_hit"] == len(s.must_not)


def test_decide_keeps_an_improvement_and_reverts_a_regression():
    before = {"grade": 3, "must_met": 3, "must_partly": 1, "must_not_hit": 0}
    assert bench_retest.decide(CASE, before, {**before, "grade": 4, "must_met": 4})["keep"] is True
    same = bench_retest.decide(CASE, before, before)
    assert same["keep"] is False and "did not improve" in same["reason"]
    assert bench_retest.decide(CASE, before, {**before, "grade": 4, "must_not_hit": 1})["keep"] is False


def test_cli_grade_fails_cleanly_without_a_judge_line(monkeypatch, capsys):
    monkeypatch.setattr(sys, "stdin", io.StringIO("no verdict here"))
    assert bench_retest.main(["grade", "--scenario", load(CASE).path]) == 2
    assert "no usable JUDGE line" in capsys.readouterr().err
