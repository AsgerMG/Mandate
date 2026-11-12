"""The data-gap miner without a database: hosts are classified by role, signals
group into asks, owner cases weigh the ranking, and the miner runs on the repo
as it is."""
from __future__ import annotations

from mandate.eval import data_gaps as dg


def test_host_kind_is_a_property_of_the_publisher_not_a_name_list():
    assert dg.kind_of_host("www.legifrance.gouv.fr") == "statute"
    assert dg.kind_of_host("eur-lex.europa.eu") == "statute"
    assert dg.kind_of_host("www.eif.org") == "instrument"
    assert dg.kind_of_host("www.kfw.de") == "instrument"
    assert dg.kind_of_host("fintech.global") == "media"


def test_signals_group_by_shared_words_and_rank_by_answers_and_owner_cases():
    sigs = [
        {"run": "r1", "case": "fintech_guarantees", "kind": "statute", "signal": "German reform on non-bank access not identified", "source": "", "via": "judge"},
        {"run": "r2", "case": "fintech_guarantees", "kind": "statute", "signal": "the German reform admitting non-bank lenders not identified", "source": "dip.bundestag.de", "via": "judge"},
        {"run": "r3", "case": "heldout_x", "kind": "precedents", "signal": "EIF precedents none found", "source": "EIF signature list", "via": "judge"},
    ]
    asks = dg.group(sigs)
    assert len(asks) == 2
    top = asks[0]
    assert top["kind"] == "statute" and top["answers_improved"] == 2 and top["owner_cases"] == ["fintech_guarantees"]
    assert top["source"] == "dip.bundestag.de" and top["rank"] == 1
    assert asks[1]["load"].startswith("live research")


def test_miner_runs_on_the_repo_and_finds_the_known_gaps():
    m = dg.mine()
    assert m["signals"] > 20 and m["asks"]
    text = " ".join(a["ask"].lower() for a in m["asks"][:15])
    assert "reform" in text or "precedent" in text
    md = dg.markdown(m)
    assert md.startswith("# Data asks") and "| 1 |" in md
