"""The eval harness without a model: scenarios load, profiles are built from
the vocabulary only, the citation validator catches a forged quote against a
real grounding store, and the judge reads the rubric."""
from __future__ import annotations

import datetime as dt
import json
from types import SimpleNamespace

import psycopg
import pytest

from mandate.api.citations import Stores, resolve, verify
from mandate.eval import citations as cit
from mandate.eval import judge as jdg
from mandate.eval.scenarios import all_scenarios, load, profile_from_hint
from mandate.grounding import store_original


def test_both_owner_scenarios_load_with_must_and_must_not():
    ids = {s.id for s in all_scenarios()}
    assert {"fintech_guarantees", "edtech_ai_kids"} <= ids
    for s in all_scenarios():
        assert s.must and s.must_not and len(s.sha256) == 64
        assert s.checkpoints()[0]["id"] == "must_1"


def test_profile_hint_keeps_only_vocabulary_values_and_says_what_it_dropped():
    prof, dropped = profile_from_hint(load("edtech_ai_kids"))
    assert prof["subsectors"] == ["edtech"] and prof["usesAi"] is True
    assert "developmentStage" not in prof and "customerType" not in prof
    assert any(d.startswith("developmentStage=") for d in dropped)
    prof1, dropped1 = profile_from_hint(load("fintech_guarantees"))
    assert dropped1 == [] and prof1["subsectors"] == ["fintech"] and "IT" in prof1["markets"]


def _mission(c_ok, c_forged):
    return {
        "decisions": [{"title": "d", "claims": [
            {"text": "a", "basis": "cited", "citation_ids": ["c1"]},
            {"text": "b", "basis": "judgement", "citation_ids": []}], "citations": {"c1": c_ok}}],
        "flags": [{"title": "f", "claims": [{"text": "x", "basis": "unverified"}], "citations": {}}],
        "messages": [{"payload": {"deliverable": {"sections": [{"heading": "IT", "claims": [
            {"text": "c", "basis": "cited", "citation_ids": ["c2"]}]}]}, "citations": {"c2": c_forged}}}],
    }


def test_validator_resolves_against_grounding_and_catches_a_forged_quote(mdb, bucket):
    con = psycopg.connect(mdb.url("capital_app"))
    try:
        text = "Art. 106 TUB: l'esercizio dell'attivita di concessione di finanziamenti e riservato."
        v = store_original(con, text.encode(), "https://www.bancaditalia.example/tub106", "text/plain",
                           dt.datetime.now(dt.timezone.utc), text=text)
        stores = Stores(con, None)
        ok = resolve(stores, sha256=v.sha256, quote="Art. 106 TUB")
        forged = {**ok, "quote": "Art. 107 TUB"}
        out = cit.validate(_mission(ok, forged), lambda cs: [verify(stores, c) for c in cs])
    finally:
        con.rollback()
        con.close()
    assert out["total"] == 2 and out["quote_matched"] == 1 and out["score"] == 0.5
    assert out["failures"][0]["where"] == "deliverable:IT"
    assert out["claims"] == {"cited": 2, "judgement": 1, "unverified": 1, "unlabelled": 0, "cited_to_missing_id": 0}


def test_judge_reads_the_rubric_and_scores_met_checkpoints():
    s = load("fintech_guarantees")
    record = jdg.render_record(_mission({"canonical_url": "https://x"}, {"canonical_url": "https://y"}),
                               [{"type": "questions", "questions": [{"question": "Licence?", "why": "IT"}]}])
    assert "MANDATE ASKED THE FOUNDER FIRST" in record and "(cited: [c1] https://x)" in record
    prompt = jdg.build_prompt(s, record)
    assert "must_not_1 (must_not)" in prompt and "Hausbank" in prompt
    n = len(s.checkpoints())
    answer = {"checkpoints": [{"id": c["id"], "met": "met" if i < n // 2 else "not_met", "reason": "r"}
                              for i, c in enumerate(s.checkpoints())], "overall": "ok"}
    fake = SimpleNamespace(messages=SimpleNamespace(create=lambda **kw: SimpleNamespace(
        content=[SimpleNamespace(type="text", text=json.dumps(answer))],
        usage=SimpleNamespace(input_tokens=1, output_tokens=1))))
    out = jdg.judge(s, record, client=fake)
    assert out["score"] == pytest.approx((n // 2) / n)
