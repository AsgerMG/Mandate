"""The case library: every case is complete and owner-grounded or marked draft,
the generated playbook files are in sync, and retrieval finds the right war
story for an unseen ask."""
from __future__ import annotations

from mandate.eval import case_library as cl


def test_every_case_is_complete_and_names_real_checks():
    cases = cl.load_cases()
    assert len(cases) >= 5
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
