"""The knowledge map is a valid checklist and coverage counts held keys against it."""
from mandate.eval import knowledge_coverage as kc


def test_the_map_is_a_valid_checklist():
    m = kc.load_map()
    assert {"DE", "FR", "IT", "EU", "UK"} <= set(m)
    for market, parts in m.items():
        inst = {x["key"] for x in parts.get("institutions") or []}
        keys = [x["key"] for part in kc.PARTS for x in parts.get(part) or []]
        assert len(keys) == len(set(keys)), f"{market}: duplicate keys"
        for x in parts.get("institutions") or []:
            assert not x.get("parent") or x["parent"] in inst, f"{market}: {x['key']} has an unknown parent"
        for x in parts.get("products") or []:
            assert x["offered_by"] in inst, f"{market}: product {x['key']} offered by an unknown node"
        for x in parts.get("roles") or []:
            assert x["at"] in inst, f"{market}: role {x['key']} at an unknown node"
    assert len(m["DE"]["institutions"]) >= 30 and m["DE"]["processes"]  # the pilot is mapped in depth


def test_coverage_counts_held_against_expected():
    kmap = {"DE": {"institutions": [{"key": "a"}, {"key": "b"}], "products": [], "processes": [{"key": "p"}], "roles": []}}
    cov = kc.coverage(kmap, {"institutions": {"a"}, "processes": set()})
    assert cov["DE"]["institutions"] == {"expected": 2, "held": 1, "missing": ["b"]}
    assert cov["DE"]["processes"]["missing"] == ["p"]
    assert "1/2" in kc.render(cov) and "not mapped" in kc.render(cov)
