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
    monkeypatch.setattr(loop.bench, "require_tools", lambda *a: None)
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


def test_revert_restores_the_files_from_the_proposals_base_commit(monkeypatch, tmp_path):
    """A proposal committed before its re-test (the incremental-commit rule) must
    still be reverted: decide checks the files out of the commit the proposal was
    made on, not HEAD (17 Nov: proposal 03's revert was a no-op)."""
    log = tmp_path / "log.jsonl"
    log.write_text(json.dumps({"step": "propose", "n": 7, "files": ["mandate/playbooks/method.md"],
                               "affected_cases": ["a"], "applied": True, "base_commit": "abc123"}) + "\n")
    monkeypatch.setattr(loop, "LOG", log)
    monkeypatch.setattr(loop, "LOOP_DIR", tmp_path)
    monkeypatch.setattr(loop, "compare", lambda b, a, c: {"keep": False, "reason": "fell", "rows": []})
    calls = []
    monkeypatch.setattr(loop.subprocess, "run", lambda args, **k: calls.append(args))
    a = type("A", (), {"proposal": 7, "cases": None, "before": "x", "after": "y", "dry_run": False})()
    loop.cmd_decide(a)
    assert calls and calls[0][:3] == ["git", "checkout", "abc123"]
    assert "mandate/playbooks/method.md" in calls[0]


def test_conversations_are_judged_on_the_case_plus_the_consultation_arc():
    """Every conversation judgement carries the arc's checks (arc_checks.yaml) after
    the case's own, prefixed [arc], so the case's must_N ids keep their meaning."""
    from mandate.eval import conversation
    from mandate.eval.scenarios import load
    s = load("fintech_guarantees")
    a = conversation.with_arc_checks(s)
    assert a.must[: len(s.must)] == s.must and a.must_not[: len(s.must_not)] == s.must_not
    added = a.must[len(s.must):] + a.must_not[len(s.must_not):]
    assert len(added) >= 8 and all(x.startswith("[arc] ") for x in added)
    assert any("first reply" in x for x in a.must_not[len(s.must_not):])
    assert conversation.DEFAULT_TURNS >= 12  # the arc runs to ~25 messages


def test_run_tests_a_conversation_by_default_and_one_shot_only_on_request(monkeypatch):
    calls = []
    monkeypatch.setattr(loop, "converse_case", lambda s, **k: calls.append(("conv", s.id, k["tag"])) or {"case": s.id})
    monkeypatch.setattr(loop, "run_case", lambda s, tag, **k: calls.append(("one", s.id, tag)) or {"case": s.id})
    monkeypatch.setattr(loop, "_append_log", lambda rec: None)
    A = lambda one_shot: type("A", (), {"cases": ["fintech_guarantees"], "tag": "t", "no_judge": True, "model": None,
                                       "parallel": 1, "one_shot": one_shot, "turns": 14})()
    loop.cmd_run(A(False)); loop.cmd_run(A(True))
    assert calls == [("conv", "fintech_guarantees", "t"), ("one", "fintech_guarantees", "t")]


def test_every_scripted_founder_runs_the_whole_arc():
    """The arc's founder cues are slotted into every script (options after the
    opener, prioritise and expect before the plan, the brief at the end); a case's
    own move of that name is kept, never doubled; the turn cap fits the arc."""
    from mandate.eval import conversation
    from mandate.eval.scenarios import load
    c = conversation.with_arc_moves(load("fintech_guarantees").client)
    moves = [st.move for st in c.script]
    assert moves[0] == "opener" and moves[1] == "options" and moves[-1] == "brief"
    assert moves.index("prioritise") < moves.index("expect") < moves.index("full_plan")
    d = [st.move for st in conversation.with_arc_moves(load("discovery_first_three_questions").client).script]
    assert "options" not in d and d.count("narrow") == 1  # its own 'narrow' stands in for options
    assert conversation.DEFAULT_TURNS >= len(moves)


def test_the_founder_side_is_conversational():
    """Owner, 17 Nov: test cases mimic a real conversation on both sides. A founder
    writes a line or two and reveals facts when asked: every scripted message stays
    under 30 words and every canned answer under 45; the arc cues too."""
    import glob
    from pathlib import Path
    from mandate.eval.scenarios import SCENARIO_DIR, load
    from mandate.eval import conversation
    for f in sorted(glob.glob(str(Path(SCENARIO_DIR) / "*.yaml"))):
        s = load(f)
        if s.client is None:
            continue
        for st in conversation.with_arc_moves(s.client).script:
            assert len(st.says.split()) <= 30, (s.id, st.move, len(st.says.split()))
            for a in st.if_asked:
                assert len(a["answer"].split()) <= 45, (s.id, st.move, a["answer"][:60])


def test_no_measurement_without_the_database(tmp_path):
    """13-17 Nov: runs from a worktree without web/.env.local had no database and
    were graded anyway. The runner refuses to start, and a reply that reports the
    database unreachable invalidates the run."""
    from mandate.eval import bench
    assert "agent-worktree.sh" in (bench.tools_ready(tmp_path) or "")
    (tmp_path / "web").mkdir(); (tmp_path / "web" / ".env.local").write_text("DATABASE_URL=postgres://x\n")
    assert bench.tools_ready(tmp_path) is None
    for said in ["One limit first: our internal law library could not be reached in this run.",
                 "I could not reach our internal funding database in this session.",
                 "the bench tools could not reach the funding database (its access setting is missing in this worktree)",
                 "I had no access to our internal funding database for this run."]:
        assert bench.db_unreachable(said), said
    assert not bench.db_unreachable("The guarantee bank could not reach a decision before June.")


def test_a_conversation_stops_when_the_brain_has_no_database():
    from mandate.eval import conversation
    from mandate.eval.scenarios import load

    def fake(agent, prompt, **kw):
        return {"text": "One note first: I could not reach our internal funding database. What is your legal form?",
                "session_id": "s", "duration_s": 0.1, "cost_usd": 0.1}
    res = conversation.converse(load("fintech_guarantees"), brain="wincent", max_turns=6, runner=fake, log=lambda m: None)
    assert res["stopped"] == "db_unreachable" and len(res["turns"]) == 1


def test_the_usage_limit_never_loses_a_conversation(tmp_path, monkeypatch):
    """Mid-conversation the plan's limit stops a call: the turns so far come back
    (stopped = usage_limit), are saved with a turns file, and can be judged later."""
    from mandate.eval import bench, conversation
    from mandate.eval.scenarios import load
    calls = {"n": 0}

    def fake(agent, prompt, **kw):
        calls["n"] += 1
        if calls["n"] == 3:
            raise bench.UsageLimit("limit reached")
        return {"text": "Noted. Which bank holds your account?", "session_id": "s", "duration_s": 0.1, "cost_usd": 0.1}
    res = conversation.converse(load("fintech_guarantees"), brain="wincent", max_turns=8, runner=fake, log=lambda m: None)
    assert res["stopped"] == "usage_limit" and len(res["turns"]) >= 1
    monkeypatch.setattr(conversation, "CONVERSE_RUNS", tmp_path)
    monkeypatch.setattr(conversation.run_conversation, "write", lambda conv: tmp_path / "conv.json")
    out = conversation.save(load("fintech_guarantees"), "wincent", res, judgement=None, judgement_file=None,
                            ran_at="2026-11-17T20:00:00+00:00", state={"sha": "x", "dirty": False}, left_out=[], tag="arc1")
    side = json.loads(next(tmp_path.glob("*.turns.json")).read_text())
    assert side["stopped"] == "usage_limit" and side["tag"] == "arc1" and len(side["turns"]) == len(res["turns"])
    assert conversation.Turn(**side["turns"][0]).says


def test_near_the_budget_the_founder_asks_for_the_brief():
    from mandate.eval import conversation
    from mandate.eval.scenarios import load

    def fake(agent, prompt, **kw):
        return {"text": "Here is where we are. What do you lean toward?", "session_id": "s", "duration_s": 0.1, "cost_usd": 1.0}
    res = conversation.converse(load("fintech_guarantees"), brain="wincent", max_turns=16, max_cost=3.0, runner=fake, log=lambda m: None)
    assert res["stopped"] == "wrapped_up"
    assert res["turns"][-1].move == "brief" and "brief" in res["turns"][-1].says
