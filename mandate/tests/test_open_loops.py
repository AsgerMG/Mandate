"""The one list of open loops: every item says how it ends (owner, 19 Nov 2026)."""
from mandate.eval import open_loops as ol


def test_every_item_says_how_it_ends():
    loops = ol.load()
    assert loops, "the list is empty"
    assert ol.problems(loops) == []


def test_the_rule_catches_an_item_without_an_end():
    assert ol.problems([{"id": "a", "title": "t", "brain": "both", "state": "parked"}]) == ["a: a parked item needs trigger"]
    assert ol.problems([{"id": "b", "title": "t", "brain": "both", "state": "done"}]) == ["b: a done item needs closed"]
    assert ol.problems([{"id": "c", "title": "t", "brain": "both", "state": "open", "next": "x"}]) == []
