"""The loop's decision rule and bookkeeping, without a model: keep only when the
judged score improves and nothing regresses; the diagnosis groups failures by
senior check; proposals accept one playbook file block only."""
from __future__ import annotations

import json

from mandate.eval import loop


def _rec(case, grade, met, partly, hit, at):
    return {"case": case, "grade": grade, "must_met": met, "must_partly": partly, "must_not_hit": hit, "judged_at": at, "holistic_grade": grade,
            "must_total": 8, "checkpoints": []}


def test_decision_keeps_only_when_better_and_nothing_regresses(monkeypatch):
    byc = {
        "a": {"before": _rec("a", 3, 5, 1, 1, "1"), "after": _rec("a", 4, 6, 1, 0, "2")},
        "b": {"before": _rec("b", 4, 6, 0, 0, "1"), "after": _rec("b", 4, 6, 1, 0, "2")},
    }
    monkeypatch.setattr(loop, "judgements_by_case", lambda: byc)
    c = loop.compare("before", "after", ["a", "b"])
    assert c["keep"] is True and c["mean_before"] == 3.5 and c["mean_after"] == 4.0
    byc["b"]["after"] = _rec("b", 4, 6, 0, 1, "2")      # a new must_not hit on b
    c = loop.compare("before", "after", ["a", "b"])
    assert c["keep"] is False and "new must_not hits on ['b']" in c["reason"]
    byc["b"]["after"] = _rec("b", 3, 5, 0, 0, "2")      # b fell
    assert loop.compare("before", "after", ["a", "b"])["keep"] is False
    assert loop.compare("before", "after", ["zzz"])["keep"] is False


def test_check_of_maps_checkpoint_text_to_a_senior_check():
    assert loop.check_of("Names P1/P2 stakeholders per route by function") == "who_decides"
    assert loop.check_of("Uses precedents or says explicitly there is none") == "precedent"
    assert loop.check_of("Treats getting Art. 106 as a plan step with a sequence and a timeline") in ("status_unlocks", "sequencing")
    assert loop.check_of("Every factual claim about an Italian rule is cited [cN] or marked unverified") == "grounding"


def test_file_block_regex_accepts_playbook_paths_only():
    text = "````file path=mandate/playbooks/funding-routes.md\n# x\n````\n````file path=web/app/page.tsx\nnope\n````\n"
    blocks = [(m.group(2), m.group(3)) for m in loop.FILE_BLOCK.finditer(text)]
    assert [p for p, _ in blocks] == ["mandate/playbooks/funding-routes.md", "web/app/page.tsx"]
    assert [p for p, _ in blocks if loop.PROPOSAL_PATH.match(p)] == ["mandate/playbooks/funding-routes.md"]
    assert loop.PROPOSAL_PATH.match("mandate/playbooks/cases/wincent.md")
    assert not loop.PROPOSAL_PATH.match("mandate/playbooks/../x.md")


def test_retest_message_matches_the_bench_shape():
    s = loop.load("edtech_ai_kids")
    m = loop.retest_message(s)
    assert m.startswith("We're an AI-native startup") and "Bench re-test" in m and "More about us" not in m
    assert loop.brain_of(loop.load("ai_kids_regulatory")) == "regina" and loop.brain_of(s) == "wincent"


def test_table_renders_every_scenario_row():
    md = loop.table_markdown([])
    assert "| fintech_guarantees |" in md and "heldout_bnpl_ccd2_nl_it (held-out)" in md
    json.dumps(loop.diagnose("no-such-tag"))  # no judgements: empty, not an error


def test_run_case_gives_the_brain_a_leave_one_out_library_and_denies_the_answer_key(monkeypatch, tmp_path):
    seen = {}

    def fake_run_agent(agent, prompt, **kw):
        seen.update(kw, agent=agent)
        return {"text": "answer", "duration_s": 1.0}

    monkeypatch.setattr(loop.bench, "run_agent", fake_run_agent)
    monkeypatch.setattr(loop, "LOOP_RUNS", tmp_path / "runs")
    monkeypatch.setattr(loop, "LOO_DIR", tmp_path / "loo")
    rec = loop.run_case(loop.load("fintech_guarantees"), "t", judge=False)
    assert set(rec["leave_one_out"]) == {"fintech_eu_open_door", "fintech_shut_door_reform", "fintech_status_unlocks_market",
                                         "fintech_eu_product_fits_activity", "fintech_research_mechanics_not_instinct"}
    lib = tmp_path / "loo" / "t" / "fintech_guarantees" / "wincent.md"
    assert lib.exists() and "no way without a banking licence" not in lib.read_text()
    assert str(lib) in seen["append_system"] and "loop-t-fintech_guarantees" in seen["append_system"]
    assert set(loop.ANSWER_KEY_READS) <= set(seen["disallowed"])
    assert "Read(./mandate/eval/**)" in loop.ANSWER_KEY_READS and "Read(./mandate/playbooks/cases/**)" in loop.ANSWER_KEY_READS
