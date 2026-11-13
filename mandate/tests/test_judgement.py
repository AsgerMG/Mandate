"""The judge without a model: the one grade rule, the judge's reply parsing,
the run text the judge may see, and the calibration bookkeeping."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from mandate.eval import rubric
from mandate.eval.scenarios import load

ROOT = Path(__file__).resolve().parents[2]


def _verdicts(s, musts: list[str], nots: list[str]) -> list[dict]:
    cps = s.checkpoints()
    out = []
    mi = ni = 0
    for c in cps:
        if c["kind"] == "must":
            out.append({**c, "verdict": musts[mi % len(musts)]}); mi += 1
        else:
            out.append({**c, "verdict": nots[ni % len(nots)]}); ni += 1
    return out


def test_grade_scale_is_one_file_both_sides_read():
    sc = json.loads((ROOT / "mandate/eval/grade_scale.json").read_text())
    assert set(sc["scale"]) == {"1", "2", "3", "4", "5"}
    assert sc["base_by_must_share"][0] == [0.9, 5] and sc["base_by_must_share"][-1][0] == 0.0
    # the bench app reads the same file: it must stay where web/lib/bench looks for it
    assert "web/lib/bench" in sc["_about"]


def test_rule_grade_all_met_is_five_and_any_hit_caps_at_three():
    s = load("fintech_guarantees")
    assert rubric.rule_grade(_verdicts(s, ["met"], ["avoided"])) == 5
    assert rubric.rule_grade(_verdicts(s, ["met"], ["borderline", "avoided"])) == 4
    one_hit = _verdicts(s, ["met"], ["avoided"])
    one_hit[-1]["verdict"] = "hit"
    assert rubric.rule_grade(one_hit) == 3
    assert rubric.rule_grade(_verdicts(s, ["met"], ["avoided"]), ungrounded_facts=3) == 4


def test_rule_grade_reproduces_the_owners_round_one_reading():
    """Owner, 10 Nov: Germany wrong, Italy wrong, EU right: 'none of that'. Two
    musts not met, two must_nots hit -> the rule says 2 (misses the point)."""
    s = load("fintech_guarantees")
    cps = _verdicts(s, ["met"], ["avoided"])
    by = {c["id"]: c for c in cps}
    by["must_3"]["verdict"] = "not_met"; by["must_4"]["verdict"] = "not_met"
    by["must_not_1"]["verdict"] = "hit"; by["must_not_2"]["verdict"] = "hit"
    assert rubric.rule_grade(cps) == 2


def test_rule_grade_partly_weighs_half_and_floors_at_one():
    s = load("edtech_ai_kids")           # 8 musts, 3 must_nots
    assert rubric.rule_grade(_verdicts(s, ["partly"], ["avoided"])) == 3      # share 0.5
    assert rubric.rule_grade(_verdicts(s, ["not_met"], ["hit"])) == 1


def test_parse_judgement_reads_the_last_judge_line_and_normalises_ids():
    s = load("edtech_ai_kids")
    reply = ("must_1: met, asks first.\nJUDGE not this one\n\nmore text\n"
             'JUDGE {"checkpoints":[{"id":"must_1","verdict":"Met","reason":"asks"},{"id":"must_not_1","verdict":"HIT","reason":"lists"},'
             '{"id":"bogus","verdict":"met","reason":""}],"ungrounded_facts":["FR CIR is 30%"],'
             '"data_gaps":[{"signal":"no precedent for matchmaking loans","kind":"precedents","source":"Bpifrance activity report"}],'
             '"holistic_grade":2,"overall":"thin"}')
    j = rubric.judgement(s, rubric.parse_judgement(reply))
    by = {c["id"]: c["verdict"] for c in j["checkpoints"]}
    assert by["must_1"] == "met" and by["must_not_1"] == "hit" and "bogus" not in by
    assert by["must_2"] == "cannot_tell" and "must_2" in j["missing_ids"]
    assert j["must_total"] == 8 and j["must_not_total"] == 3 and j["must_not_hit"] == 1
    assert j["grade"] == 1 and j["holistic_grade"] == 2 and j["rule_and_holistic_agree"] is True
    assert j["data_gaps"][0]["kind"] == "precedents"
    assert rubric.score_line(j).startswith('SCORE {"must_met": 1, "must_total": 8, "must_not_hit": 1, "must_not_total": 3, "grade": 1}')


def test_parse_judgement_rejects_a_reply_without_a_judge_line():
    with pytest.raises(rubric.JudgementError):
        rubric.parse_judgement("I think it is fine.")


def test_answer_from_run_cuts_the_self_score_and_grade_block():
    md = "# Run\n\n## The case\nx\n\n## Wincent's answer\nGo EU first [c1].\n\n## Self-score (after)\nall met\n\n## Grade (owner)\ngrade: 1\n"
    out = rubric.answer_from_run(md)
    assert "Go EU first" in out and "Self-score" not in out and "grade: 1" not in out
    for p in (ROOT / "mandate/eval/runs/bench").glob("*.md"):
        cut = rubric.answer_from_run(p.read_text())
        assert "## Grade (" not in cut and "## Self-score" not in cut, p.name


def test_judge_prompt_carries_rubric_model_answer_and_senior_checks():
    s = load("fintech_guarantees")
    p = rubric.build_judge_prompt(s, "the answer", model_answer="Go to the EU.")
    assert "must_not_8 (must_not)" in p and "THE OWNER'S MODEL ANSWER" in p and "<<<\nthe answer\n>>>" in p
    assert "Which level has the open door" in p      # the scaffold in method.md reaches the judge
    assert "Self-score" not in p


def test_agreement_counts_within_tolerance():
    assert rubric.agreement([(4, 5), (2, 4), (3, 3)]) == {"n": 3, "within_tolerance": 2, "share": pytest.approx(2 / 3), "tolerance": 1}
    assert rubric.agreement([])["share"] is None


def test_calibration_counts_owner_points_and_keeps_model_answers_out_of_agreement():
    from mandate.eval import bench_judge
    r = bench_judge.calibration_report()
    c = r["counts"]
    assert c["owner_model_answers"] >= 2 and c["owner_graded_runs"] >= 1
    assert c["owner_points"] == c["owner_graded_runs"] + c["owner_model_answers"]
    # a model answer is an anchor of what a 5 reads like, never a judge-vs-owner pair
    assert all(row["kind"] != "owner_model_answer" or row["owner_grade"] == 5 for row in r["rows"])
