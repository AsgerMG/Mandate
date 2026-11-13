"""The case library: every case is complete and owner-grounded or marked draft,
the generated playbook files are in sync, and retrieval finds the right war
story for an unseen ask."""
from __future__ import annotations

from mandate.eval import case_library as cl


def test_every_case_is_complete_and_names_real_checks():
    cases = cl.load_cases()
    assert len(cases) >= 4  # robotics_three_levels archived 13 Nov (it rested on a self-score)
    checks = {"open_door", "activity_vs_support", "status_unlocks", "reform_or_lobby", "sequencing", "who_decides", "what_not_yet", "precedent"}
    for c in cases:
        assert set(c["checks"]) <= checks, c["id"]
        assert c["status"] in ("owner_confirmed", "owner_habit", "draft"), c["id"]
        # essence, not literal: the senior move must not name a country, fund or company
        move = c["senior_move"].lower()
        for name in ("germany", "italy", "france", "kfw", "bpifrance", "eif", "tub", "bmwe", "lombardia"):
            assert name not in move, f"{c['id']}: senior_move names {name}; write the general move, keep names in owner_verdict/source"


def test_generated_case_files_match_the_yaml():
    assert cl.check() == [], "run: PYTHONPATH=. python3 -m mandate.eval.case_library build"


def test_retrieval_finds_the_status_case_for_an_unseen_lender_and_intent_for_a_vague_ask():
    top = cl.retrieve("A payment institution without a bank licence wants portfolio guarantees from a national fund that needs an intermediary registration", "wincent", k=1)
    assert top and top[0]["id"] == "fintech_status_unlocks_market"
    top = cl.retrieve("Early-stage AI company with private investors: how can public money help us?", "wincent", k=1)
    assert top and top[0]["id"] == "edtech_intent_first"
    assert cl.retrieve("the formal door is shut; a reform is moving in parliament", "regina", k=3)  # the shared reform case renders for Regina too
    assert all(r["status"] != "draft" for r in cl.retrieve("guarantee", None, k=10))


def test_the_library_holds_only_owner_validated_lessons():
    # a lesson written from a run the owner never graded is the brain grading itself
    for c in cl.load_cases():
        src = " ".join(str(c["source"]).split()).lower()
        assert "self-score" not in src and "not owner-graded" not in src, c["id"]


def test_leave_one_out_drops_every_entry_written_from_the_case_and_nothing_else():
    cases = cl.load_cases()
    derived = {c["id"] for c in cases if cl.derived_from(c, "fintech_guarantees")}
    assert derived == {"fintech_eu_open_door", "fintech_shut_door_reform", "fintech_status_unlocks_market"}
    text, out = cl.render_without("wincent", "fintech_guarantees")
    assert set(out) == derived
    for c in cases:
        if c["id"] in derived:
            assert " ".join(c["owner_verdict"].split())[:60] not in text, c["id"]
    assert "Diagnose intent before naming an instrument" in text  # the unrelated case stays
    assert "mandate/eval/" in text  # the run is told not to read the answer key
    # a case nobody wrote a lesson from keeps the whole library
    full, none = cl.render_without("wincent", "forklift_spatial_dk_de")
    assert none == [] and full.startswith(cl.render("wincent", cases).rstrip())


def test_a_run_file_names_the_case_but_a_longer_id_does_not():
    assert cl.derived_from({"source": "runs/bench/2026-11-10_fintech_guarantees_round3.md (owner grade)"}, "fintech_guarantees")
    assert not cl.derived_from({"source": "scenarios/xfintech_guarantees.yaml"}, "fintech_guarantees")
    assert not cl.derived_from({"source": "scenarios/fintech_guarantees2.yaml"}, "fintech_guarantees")
