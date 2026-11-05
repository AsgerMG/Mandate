"""mandate.embedding: one model, the right space per table, bounded requests,
honest retries, counted cost. And the boundary check that keeps it the only one."""
from __future__ import annotations

import json

import httpx
import pytest

from mandate import embedding as E
from mandate.embedding import check_boundary as CB


def _client(responses, calls):
    it = iter(responses)

    def handler(req: httpx.Request):
        calls.append(json.loads(req.content))
        r = next(it)
        if isinstance(r, Exception):
            raise r
        return r
    return httpx.Client(transport=httpx.MockTransport(handler))


def ok(vectors, tokens=7):
    return httpx.Response(200, json={"data": [{"embedding": v, "index": i} for i, v in enumerate(vectors)],
                                     "usage": {"total_tokens": tokens}})


V = [0.0] * 1024


def test_one_model_and_it_is_the_target():
    assert E.MODEL == "voyage-4-large" and E.DIM == 1024
    assert E.SPACES[E.MODEL].status == "target"
    assert [s for s in E.SPACES.values() if s.status == "target"] == [E.SPACES[E.MODEL]]
    # every legacy space is still stored somewhere, or it should have been deleted
    for name, s in E.SPACES.items():
        if s.status == "legacy":
            assert name in E.STORED.values(), f"{name} is legacy and no table is in it: delete it"


def test_body_matches_what_policy_has_always_sent(monkeypatch):
    calls = []
    e = E.Embedder(key="k", client=_client([ok([V])], calls))
    assert e.embed(["hello"]) == [V]
    assert calls[0] == {"input": ["hello"], "model": "voyage-4-large", "output_dimension": 1024}


def test_legacy_space_sends_input_type_as_capital_did():
    calls = []
    e = E.for_table("capital.instrument_profiles", key="k", client=_client([ok([V]), ok([V])], calls))
    e.embed_documents(["fund profile"])
    e.embed_query("a rail company")
    assert [c["input_type"] for c in calls] == ["document", "query"]
    assert {c["model"] for c in calls} == {"voyage-3.5"}


def test_unregistered_table_is_an_error_not_a_default():
    with pytest.raises(KeyError, match="not a registered vector table"):
        E.for_table("capital.something_new", key="k")


def test_token_aware_batching_splits_and_preserves_order():
    # a row-count batch of a few huge legacy passages blew Voyage's 120K cap in production
    big_a, big_b, small = "x" * 350_000, "y" * 350_000, "z" * 100
    calls = []
    e = E.Embedder(key="k", client=_client([ok([[1.0] * 1024]), ok([[2.0] * 1024, [3.0] * 1024])], calls))
    out = e.embed([big_a, big_b, small])
    assert [v[0] for v in out] == [1.0, 2.0, 3.0]
    assert [c["input"] for c in calls] == [[big_a], [big_b, small]]


def test_list_cap_is_respected():
    e = E.Embedder(key="k", client=httpx.Client())
    assert [len(b) for b in e.batches(["a"] * 2500)] == [1000, 1000, 500]


def test_retries_429_and_5xx_but_not_400():
    calls = []
    e = E.Embedder(key="k", sleep=lambda s: None,
                   client=_client([httpx.Response(429), httpx.Response(503), ok([V])], calls))
    assert e.embed(["x"]) == [V] and len(calls) == 3
    calls = []
    e = E.Embedder(key="k", sleep=lambda s: None, client=_client([httpx.Response(400)], calls))
    with pytest.raises(E.EmbeddingError):
        e.embed(["x"])
    assert len(calls) == 1


def test_wrong_dimension_is_refused():
    e = E.Embedder(key="k", client=_client([ok([[1.0, 2.0]])], []))
    with pytest.raises(E.EmbeddingError, match="dims"):
        e.embed(["x"])


def test_cost_is_counted_from_billed_tokens():
    e = E.Embedder(key="k", client=_client([ok([V], tokens=1_000_000)], []))
    e.embed(["x"])
    assert e.usage.tokens == 1_000_000 and e.usage.cost_usd == pytest.approx(0.12)
    assert E.estimate_cost_usd(2_000_000, "voyage-3.5") == pytest.approx(0.12)


def test_no_key_is_an_error_and_empty_input_calls_nothing(monkeypatch):
    monkeypatch.delenv("VOYAGE_API_KEY", raising=False)
    monkeypatch.delenv("VOYAGE_KEY", raising=False)
    with pytest.raises(E.EmbeddingError, match="VOYAGE"):
        E.Embedder()
    calls = []
    assert E.Embedder(key="k", client=_client([], calls)).embed([]) == [] and calls == []


def test_vector_literal():
    assert E.vector_literal([1, 0.5]) == "[1.0,0.5]"


# ── the boundary check ──────────────────────────────────────────────────────
def test_check_finds_a_model_name_in_code_but_not_in_a_docstring_or_comment():
    src = '"""Uses voyage-3.5 historically."""\n# voyage-4-large in a comment\nMODEL = "voyage-4-lite"\n'
    hits = CB.py_offences(src)
    assert len(hits) == 1 and "voyage-4-lite" in hits[0]
    assert CB.py_offences("import voyageai\n") and CB.py_offences("from fastembed import X\n")
    assert not CB.py_offences('RERANK = "rerank-2.5"\n')


def test_check_ts_keeps_urls_in_strings_and_drops_comments():
    src = ('// "voyage-3.5" was the model\n/* api.voyageai.com/v1/embeddings */\n'
           'const U = "https://api.voyageai.com/v1/embeddings";\n')
    hits = CB.ts_offences(src)
    assert len(hits) == 1 and "line 3" in hits[0]


def test_the_repo_is_clean_and_the_ts_mirror_is_current(capsys):
    assert CB.main([]) == 0, capsys.readouterr().out
