"""The simulated client conversation (mandate/eval/conversation.py, loop.py converse).
No model, no network: a fake runner plays the brain, the client and the judge."""
from __future__ import annotations

import json

import pytest

from mandate.eval import conversation as cv
from mandate.eval import loop, run_conversation
from mandate.eval.scenarios import all_scenarios, load

SCRIPTED = ["fintech_guarantees", "forklift_spatial_dk_de", "robotics_deployment_it", "edtech_ai_kids",
            "heldout_hardware_nl_rd_relief", "regina_edtech_fr_expansion", "regina_search_engine_dma",
            "regina_travel_google_dma", "ai_kids_regulatory"]

BOARD = """Here is the map.

```mandate-board
{"answer": {"lines": ["EU first"], "confidence": "medium", "open_question": "Which?"},
 "routes": {"levels": [{"level": "eu", "doors": [{"id": "eif", "label": "EIF guarantee"}, {"id": "x", "label": "y"}]}]},
 "process_maps": [{"id": "pm1", "title": "EIF guarantee application"}]}
```
"""


# ── the scripts ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("case", SCRIPTED)
def test_every_scripted_case_pushes_the_senior_moves(case):
    s = load(case)
    assert s.client, f"{case} needs a client block"
    moves = [st.move for st in s.client.script]
    assert 5 <= len(moves) <= 10
    assert moves[0] == "opener"
    for needed in ("pushback", "fact_change", "who_to_call", "full_plan"):
        assert needed in moves, f"{case}: the script never tests {needed}"
    assert all(m in cv.MOVES for m in moves), f"{case}: unknown move in {moves}"
    assert s.client.hidden_facts and s.client.persona.get("role")
    assert s.client.script[0].if_asked, f"{case}: the opener must answer the structure questions"


def test_cases_without_a_client_block_still_load():
    assert any(s.client is None for s in all_scenarios())


# ── reading a reply ──────────────────────────────────────────────────────────

def test_questions_check_ins_and_if_asked_answers():
    s = load("fintech_guarantees")
    reply = ("Two things decide this.\n\n1. **What is your legal form, and where are you incorporated?** It decides the gate.\n"
             "2. Do you hold any licence today?\n\nWhat is the colour of your logo?\n\nDoes that match what you have seen?\n" + BOARD)
    qs = cv.questions_in(reply)
    assert "Which?" not in " ".join(qs)  # the board is not prose
    answers, unmatched = cv.match_answers(qs, s.client.script[:1], s.client)
    assert any("GmbH" in a for a in answers) and any("No licence" in a for a in answers)
    assert unmatched == ["What is the colour of your logo?"]  # the check-in is not a gap


def test_board_summary_counts_sections():
    b = cv.board_summary(cv.board_blocks(BOARD))
    assert b["blocks"] == 1 and b["sections"]["routes"] == 2 and b["sections"]["process_maps"] == 1
    assert b["names"]["process_maps"] == ["EIF guarantee application"]
    assert cv.strip_board(BOARD) == "Here is the map."


# ── the run ──────────────────────────────────────────────────────────────────

class Fake:
    """Brain: asks the structure questions first, then a board on every turn.
    Client: answers one gap. Judge: a JUDGE line with a note per turn."""

    def __init__(self):
        self.calls: list[tuple[str, dict]] = []
        self.brain_turns = 0

    def __call__(self, agent, prompt, **kw):
        self.calls.append((agent, {**kw, "prompt": prompt}))
        if agent == "client":
            return {"text": "ANSWER: About 40 people, I think.", "session_id": "client-s", "duration_s": 0.1, "cost_usd": 0.01}
        if agent == "judge":
            n = prompt.count("· THE FOUNDER (")
            j = {"checkpoints": [{"id": "must_1", "verdict": "met", "reason": "asked"}], "holistic_grade": 3,
                 "overall": "ok", "turns": [{"turn": k, "verdict": "short" if k == 2 else "ok", "note": f"turn {k}",
                                              "fell_short": ["no process map"] if k == 2 else []} for k in range(1, n + 1)]}
            return {"text": "notes\nJUDGE " + json.dumps(j), "session_id": "judge-s", "duration_s": 0.1}
        self.brain_turns += 1
        if self.brain_turns == 1:
            text = "Before routes: what is your legal form? And how many staff do you have?"
        else:
            text = f"Reply {self.brain_turns}. Which way do you lean?\n" + BOARD
        return {"text": text, "session_id": "brain-s", "duration_s": 0.2, "cost_usd": 0.5}


def test_converse_runs_the_script_resumes_sessions_and_fills_gaps_with_the_client():
    s = load("fintech_guarantees")
    fake = Fake()
    res = cv.converse(s, brain="wincent", max_turns=4, runner=fake, log=lambda m: None)
    turns = res["turns"]
    # the arc's "options" cue comes after the opener (conversation.with_arc_moves)
    assert [t.move for t in turns] == ["opener", "answer", "options", "pushback"]
    assert turns[1].source == "if_asked+client_agent" and "GmbH" in turns[1].says and "40 people" in turns[1].says
    assert turns[2].says.startswith("OK, that is the picture") and turns[3].says.startswith("Hm. Germany is 70 percent")
    assert res["stopped"] == "max_turns" and res["client_calls"] == 1
    brain_calls = [kw for a, kw in fake.calls if a == "wincent"]
    assert brain_calls[0]["resume"] is None and all(kw["resume"] == "brain-s" for kw in brain_calls[1:])
    client_prompt = next(kw["prompt"] for a, kw in fake.calls if a == "client")
    assert "HIDDEN FACTS" in client_prompt and "how many staff" in client_prompt
    assert turns[2].board["sections"]["process_maps"] == 1


def test_max_cost_wraps_up_with_a_brief_instead_of_cutting_off():
    # at 80% of the budget the founder asks for the brief; that turn always finishes
    res = cv.converse(load("fintech_guarantees"), brain="wincent", max_turns=8, max_cost=0.9, runner=Fake(), log=lambda m: None)
    assert res["stopped"] == "wrapped_up" and res["turns"][-1].move == "brief" and len(res["turns"]) == 3


def test_the_judge_grades_the_whole_conversation_and_notes_every_turn():
    s = load("fintech_guarantees")
    fake = Fake()
    res = cv.converse(s, brain="wincent", max_turns=3, runner=fake, log=lambda m: None)
    j = cv.judge_conversation(s, res["turns"], "wincent", label="converse/x/fintech_guarantees", runner=fake)
    prompt = next(kw["prompt"] for a, kw in fake.calls if a == "judge")
    assert "MODE: CONVERSATION" in prompt and "WHAT THE MOVE ASKS" in prompt and "process_maps 1" in prompt
    assert "```mandate-board" not in prompt
    assert [t["verdict"] for t in j["turns"]] == ["ok", "short", "ok"]
    assert j["mode"] == "conversation" and j["grade"] >= 1


def test_saved_as_a_bench_conversation_with_moves_boards_and_turn_notes(monkeypatch, tmp_path):
    monkeypatch.setattr(cv, "CONVERSE_RUNS", tmp_path / "converse")
    s = load("fintech_guarantees")
    fake = Fake()
    res = cv.converse(s, brain="wincent", max_turns=3, runner=fake, log=lambda m: None)
    j = cv.judge_conversation(s, res["turns"], "wincent", label="converse/x/fintech_guarantees", runner=fake)
    out = cv.save(s, "wincent", res, judgement=j, judgement_file=None, ran_at="2026-11-16T10:00:00+00:00",
                  state={"sha": "abc", "dirty": False}, left_out=[])
    conv = json.loads((run_conversation.data_root() / "conversations" / f"{out['conversation']}.json").read_text())
    assert conv["kind"] == "eval_conversation" and conv["eval_run"]["mode"] == "conversation"
    assert conv["title"] == "Fintech guarantees, 16 Nov 2026 (3 turns)" and conv["eval_run"]["turns"] == 3
    roles = [m["role"] for m in conv["messages"]]
    assert roles == ["client", "agent"] * 3
    assert conv["messages"][0]["sim"]["move"] == "opener"
    assert conv["messages"][3]["judge_note"]["fell_short"] == ["no process map"]
    assert conv["messages"][3]["board"]["sections"]["process_maps"] == 1
    assert conv["eval_run"]["judge"]["turns_short"] == 1
    assert (tmp_path / "converse" / "2026-11-16_fintech_guarantees.md").exists()


def test_loop_converse_wires_the_leave_one_out_library(monkeypatch, tmp_path):
    fake = Fake()
    monkeypatch.setattr(loop.bench, "run_agent", fake)
    # CI has no database settings; the guard is tested on its own (test_loop.py)
    monkeypatch.setattr(loop.bench, "require_tools", lambda *a: None)
    monkeypatch.setattr(loop, "LOO_DIR", tmp_path / "loo")
    monkeypatch.setattr(loop, "LOG", tmp_path / "log.jsonl")
    monkeypatch.setattr(loop.bench_judge, "JUDGEMENTS", tmp_path / "judgements")
    monkeypatch.setattr(cv, "CONVERSE_RUNS", tmp_path / "converse")
    assert loop.main(["converse", "fintech_guarantees", "--turns", "2"]) == 0
    brain = [kw for a, kw in fake.calls if a == "wincent"]
    assert str(tmp_path / "loo") in brain[0]["append_system"]
    assert set(loop.ANSWER_KEY_READS) <= set(brain[0]["disallowed"])
    rec = json.loads((tmp_path / "log.jsonl").read_text().splitlines()[-1])
    assert rec["step"] == "converse" and rec["turns"] == 2 and "grade" in rec


def test_the_founder_never_repeats_an_answer():
    """A brain that re-asks what was answered gets the next scripted move, not the
    same canned answer again."""
    class Asker:
        def __call__(self, agent, prompt, **kw):
            if agent == "client":
                return {"text": "NONE", "session_id": "c", "duration_s": 0.1}
            return {"text": "What is your legal form? And where are you incorporated?", "session_id": "b", "duration_s": 0.1, "cost_usd": 0.1}
    res = cv.converse(load("fintech_guarantees"), brain="wincent", max_turns=5, runner=Asker(), log=lambda m: None)
    says = [t.says for t in res["turns"] if t.move == "answer"]
    assert len(says) == len(set(says))
    assert any(t.move not in ("opener", "answer") for t in res["turns"])  # the script moved on
