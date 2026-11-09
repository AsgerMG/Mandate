"""Spain's open calls are DISCOVERED from the register each week, over a window
as long as a call stays open.

Run 116 (2026-11-09): ES offerable 102 -> 68 with every stage ok. The weekly
enumeration looked back 60 days, the container keeps no cache, and no run
happened between 2026-08-08 and 2026-11-09, so calls registered in that gap
were never seen. Pinned here: the window covers the measured life of a call,
narrowing the search by finalidad is lossless against `in_scope`, a partial
mapping never narrows, and a failed search stream is reported, not swallowed.

Run: python3 ETL/terms/test_bdns_discovery.py   (also collected by pytest)
"""
from __future__ import annotations

import contextlib
import io
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
import harvest_bdns_open_calls as h  # noqa: E402

LOOKUP = [{"id": 13, "descripcion": "INDUSTRIA Y ENERGÍA"},
          {"id": 17, "descripcion": "INVESTIGACIÓN, DESARROLLO E INNOVACIÓN"},
          {"id": 11, "descripcion": "CULTURA"},
          {"id": 6, "descripcion": "FOMENTO DEL EMPLEO"}]
POLICIES = frozenset({"Industria y Energía", "Investigación, desarrollo e innovación"})


def test_policies_resolve_to_register_ids_case_insensitively():
    assert h.finalidad_ids(POLICIES, LOOKUP) == ([13, 17], [])


def test_an_unknown_policy_is_reported_unresolved():
    ids, unresolved = h.finalidad_ids(POLICIES | {"Algo nuevo"}, LOOKUP)
    assert ids == [13, 17] and unresolved == ["Algo nuevo"]


def test_narrowing_is_lossless_against_in_scope():
    """Every finalidad the search leaves out is one `in_scope` would reject."""
    ids, _ = h.finalidad_ids(POLICIES, LOOKUP)
    for x in LOOKUP:
        if x["id"] not in ids:
            assert not h.in_scope({"descripcionFinalidad": x["descripcion"].title()}, POLICIES)
            assert not h.in_scope({"descripcionFinalidad": x["descripcion"]}, POLICIES)


def test_one_finalidad_and_one_level_per_request():
    streams = h.search_streams(["C", "A"], [13, 17])
    assert [s for s, _ in streams] == ["C/f13", "C/f17", "A/f13", "A/f17"]
    for _, extra in streams:
        assert sum(p.startswith("finalidad=") for p in extra) == 1
        assert not any("," in p for p in extra)
    assert h.search_streams(["L"], None) == [("L", ["tipoAdministracion=L"])]


@contextlib.contextmanager
def _fake_register(lookup, fail_on=None):
    """The register, faked: no network, a scratch candidates file. Restores h."""
    urls: list[str] = []

    def fake_fetch(url, timeout=30):
        urls.append(url)
        if fail_on and fail_on in url:
            return None
        return {"content": [{"numeroConvocatoria": str(len(urls)), "fechaRecepcion": "2026-11-01"}],
                "last": True, "totalElements": 1, "totalPages": 1}

    with tempfile.TemporaryDirectory() as tmp:
        patch = {"OUTDIR": Path(tmp), "CANDIDATES": Path(tmp) / "candidates.jsonl",
                 "DELAY_S": 0, "admissible_policies": lambda: POLICIES,
                 "register_finalidades": lambda: lookup, "fetch_json": fake_fetch}
        saved = {k: getattr(h, k) for k in patch}
        try:
            for k, v in patch.items():
                setattr(h, k, v)
            with contextlib.redirect_stdout(io.StringIO()):
                yield urls
        finally:
            for k, v in saved.items():
                setattr(h, k, v)


def test_enumerate_narrows_when_every_policy_resolves():
    with _fake_register(LOOKUP) as urls:
        assert h.enumerate_candidates("2026-05-13", None, ["C"]) == []
    assert sorted(u.split("finalidad=")[1].split("&")[0] for u in urls) == ["13", "17"]


def test_a_partial_mapping_never_narrows():
    with _fake_register(LOOKUP[:1]) as urls:   # 17 vanished from the lookup
        h.enumerate_candidates("2026-05-13", None, ["C"])
    assert urls and not any("finalidad=" in u for u in urls)


def test_a_failed_stream_is_reported():
    with _fake_register(LOOKUP, fail_on="finalidad=17"):
        assert h.enumerate_candidates("2026-05-13", None, ["C"]) == ["C/f17"]


def test_the_window_covers_the_life_of_a_call_not_the_cadence():
    import refresh_open_calls as r
    # p95 registration -> fechaFinSolicitud over the calls the August 2026
    # harvest admitted. A window shorter than this loses calls permanently
    # whenever a run is missed, because the container keeps no cache.
    MEASURED_P95_DAYS = 145
    assert r.LOOKBACK_DAYS >= MEASURED_P95_DAYS


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
    print("ok")
