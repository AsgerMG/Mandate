"""The shared vocabulary and company profile (mandate/vocabulary, mandate/profile).

No database: the store's tests are in test_profile_store.py.
"""
from __future__ import annotations

import json

import pytest

from mandate.profile import ProfileError, size_class, sme_status, validate
from mandate.profile import fixtures
from mandate.profile.adapters import (
    from_capital_request, from_policy_request, to_capital_request, to_policy_profile,
)
from mandate.vocabulary import (
    BALANCE_BANDS, FTE_BANDS, POLICY_SECTOR_LIFT, SIZE_CLASSES, TURNOVER_BANDS, check, emit,
)

RANK = {"micro": 0, "small": 1, "medium": 2, "large": 3}


def test_the_vocabulary_check_is_green():
    check.problems.clear()
    assert check.main() == 0, check.problems


def test_the_check_catches_a_stale_projection(tmp_path, monkeypatch):
    monkeypatch.setattr(emit, "PY_OUT", tmp_path / "generated.py")
    assert emit.stale() == [tmp_path / "generated.py"]


def test_fixtures_are_what_python_computes():
    assert fixtures.OUT.read_text() == fixtures.render(), "run python3 mandate/profile/fixtures.py"


def test_the_capital_lift_round_trips_every_body():
    for body in fixtures.capital_requests():
        assert to_capital_request(from_capital_request(body)) == body


def test_the_policy_lift_round_trips_every_request():
    for req in fixtures.policy_requests():
        out = to_policy_profile(from_policy_request(req))
        for k, v in req.items():
            assert out[k] == (v or ["EU"] if k == "markets" else v), (k, req)


def test_every_size_class_lift_derives_its_own_class():
    for cid, c in SIZE_CLASSES.items():
        assert size_class(c["lift"]) == cid


def test_finer_bands_never_make_a_company_bigger():
    """A fine band is a subset of the capital band it projects onto, so knowing
    it can only resolve doubt in the founder's favour, never against them."""
    for row in json.loads(fixtures.OUT.read_text())["bandGrid"]:
        p = {k: row[k] for k in ("fteBand", "turnoverBand", "balanceBand") if k in row}
        coarse = {"fteBand": FTE_BANDS[p["fteBand"]]["capital"]}
        if "turnoverBand" in p:
            coarse["turnoverBand"] = TURNOVER_BANDS[p["turnoverBand"]]["capital"]
        if "balanceBand" in p:
            coarse["balanceBand"] = BALANCE_BANDS[p["balanceBand"]]["capital"]
        fine, cap = sme_status(p), sme_status(coarse)
        if cap is not None:
            assert fine is not None and RANK[fine] <= RANK[cap], (p, fine, cap)


def test_the_ten_million_balance_rung_now_counts():
    # capital's documented hole: 30 staff, EUR 9M balance, no turnover read medium
    assert sme_status({"fteBand": "10-49", "balanceBand": "2-43M"}) == "medium"
    assert sme_status({"fteBand": "10-49", "balanceBand": "2-10M"}) == "small"


def test_validate_refuses_what_the_vocabulary_lacks():
    with pytest.raises(ProfileError):
        validate({"name": "A", "sector": "fintech"})
    with pytest.raises(ProfileError):
        validate({"name": "A", "company_size": "small"})  # never a field: derived
    with pytest.raises(ProfileError):
        validate({"description": "no name"})
    assert validate({"name": " A ", "subsectors": [], "usesAi": None}) == {"name": "A"}


def test_every_policy_slug_lifts_into_its_family():
    for slug, (family, sub) in POLICY_SECTOR_LIFT.items():
        p = from_policy_request({"name": "A", "sectors": [slug]})
        assert (p["sector"], p["subsectors"]) == (family, [sub])
        assert to_policy_profile(p)["sectors"] == [slug]
