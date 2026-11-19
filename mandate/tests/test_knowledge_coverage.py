"""The knowledge map is a valid checklist and coverage counts held keys against it."""
from mandate.eval import knowledge_coverage as kc


def test_the_map_is_a_valid_checklist():
    m = kc.load_map()
    assert {"DE", "FR", "IT", "EU", "UK"} <= set(m)
    for market, parts in m.items():
        inst_keys = {x["key"] for x in parts.get("institutions") or []}
        assert parts.get("org_charts"), f"{market}: no org charts listed"
        assert all(c["key"] in inst_keys for c in parts["org_charts"]), f"{market}: an org chart for an unknown node"
    for market, parts in m.items():
        inst = {x["key"] for x in parts.get("institutions") or []}
        for part in kc.PARTS:  # unique within each part (an org chart reuses its institution's key)
            keys = [x["key"] for x in parts.get(part) or []]
            assert len(keys) == len(set(keys)), f"{market} {part}: duplicate keys"
        for x in parts.get("institutions") or []:
            assert not x.get("parent") or x["parent"] in inst, f"{market}: {x['key']} has an unknown parent"
        for x in parts.get("products") or []:
            assert x["offered_by"] in inst, f"{market}: product {x['key']} offered by an unknown node"
    assert len(m["DE"]["institutions"]) >= 30 and m["DE"]["processes"]  # the pilot is mapped in depth


def test_no_entry_was_cut_apart_by_yaml():
    """An unquoted comma in a flow-mapping value makes yaml split it into a stray key with a null
    value (19 Nov: 53 names cut, 33 of them loaded to production). Every entry holds only known fields."""
    known = {"key", "name", "name_local", "kind", "parent", "level", "region", "role", "offered_by",
             "type", "title", "for", "url", "cadence", "note"}
    for market, parts in kc.load_map().items():
        for part in kc.PARTS:
            for x in parts.get(part) or []:
                assert not set(x) - known, f"{market} {x['key']}: stray fields {set(x) - known} (quote the value)"


def test_coverage_counts_held_against_expected():
    kmap = {"DE": {"institutions": [{"key": "a"}, {"key": "b"}], "products": [], "processes": [{"key": "p"}]}}
    cov = kc.coverage(kmap, {"institutions": {"a"}, "processes": set()}, {"DE": 7})
    assert cov["DE"]["institutions"] == {"expected": 2, "held": 1, "missing": ["b"]}
    assert cov["DE"]["processes"]["missing"] == ["p"]
    assert "1/2" in kc.render(cov) and "not mapped" in kc.render(cov) and "| 7 |" in kc.render(cov)
