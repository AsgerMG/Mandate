"""capital_url_citations: fetch a cited URL politely, link only where the quote is."""
from __future__ import annotations

import importlib.util
from pathlib import Path

import httpx
import psycopg
import pytest

from mandate.grounding.testing import EphemeralMandate

REPO = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location(
    "capital_url_citations", REPO / "mandate/grounding/migrations/capital_url_citations.py")
M = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(M)

MIG_034 = (REPO / "capital/ETL/schema/migrations/034_eligibility_grounding.sql").read_text()
PAGE = b"<html><body><p>Applicants must be SMEs   established in Latvia.</p></body></html>"


@pytest.fixture()
def own_db():
    """Its own database: this run COMMITS grounding rows, which must not leak
    into the session database other tests count in."""
    with EphemeralMandate() as m:
        yield m


def _capital(mdb):
    with psycopg.connect(mdb.admin_url, autocommit=True) as c:
        c.execute("SET search_path = capital, public")
        c.execute("CREATE TABLE IF NOT EXISTS eligibility_gates (instrument_id text, gate_key text, "
                  "source_file text, quote text)")
        c.execute("CREATE TABLE IF NOT EXISTS eligibility_clauses (instrument_id text, clause_type text, "
                  "clause_key text, source_file text, quote text)")
        c.execute(MIG_034)
        c.execute("GRANT ALL ON ALL TABLES IN SCHEMA capital TO capital_app, capital_ro")
        c.execute("GRANT ALL ON ALL SEQUENCES IN SCHEMA capital TO capital_app")
        c.execute("DELETE FROM eligibility_gates WHERE instrument_id LIKE 'urlcit_%'")
        c.execute("INSERT INTO eligibility_gates VALUES "
                  "('urlcit_a', 'sme', 'https://example.lv/call', 'must be SMEs established in Latvia'), "
                  "('urlcit_a', 'age', 'https://example.lv/call', 'younger than five years'), "
                  "('urlcit_b', 'x', 'https://gone.example/page', 'anything'), "
                  "('urlcit_c', 'y', 'https://example.lv/private/doc', 'secret')")


class Clock:
    def __init__(self):
        self.t = 0.0
        self.slept = []

    def sleep(self, s):
        self.slept.append(s)
        self.t += s

    def now(self):
        return self.t


def _polite(clock, seen):
    def handler(req: httpx.Request):
        seen.append(str(req.url))
        if req.url.path == "/robots.txt":
            if req.url.host == "example.lv":
                return httpx.Response(200, text="User-agent: *\nDisallow: /private/\n")
            return httpx.Response(404)
        if req.url.host == "gone.example":
            return httpx.Response(404)
        return httpx.Response(200, content=PAGE, headers={"content-type": "text/html; charset=utf-8"})
    client = httpx.Client(transport=httpx.MockTransport(handler), headers={"user-agent": M.USER_AGENT})
    return M.Polite(5.0, client=client, sleep=clock.sleep, clock=clock.now)


def test_links_only_found_quotes_reports_the_rest_and_is_polite(own_db, bucket, tmp_path):
    mdb = own_db
    _capital(mdb)
    urls = {"https://example.lv/call": 2, "https://gone.example/page": 1,
            "https://example.lv/private/doc": 1}
    clock, seen = Clock(), []
    with psycopg.connect(mdb.url("capital_app"), options="-c search_path=capital,public") as con:
        res = M.run(con, urls, tmp_path, apply=True, per_host_s=5.0, reuse_days=30,
                    polite=_polite(clock, seen), log=lambda *_: None)
        links = con.execute("SELECT instrument_id, source_key, method, char_start, char_end "
                            "FROM eligibility_grounding WHERE instrument_id LIKE 'urlcit_%'").fetchall()
        # a second run fetches nothing: the stored version is reused
        seen2 = []
        res2 = M.run(con, urls, tmp_path, apply=True, per_host_s=5.0, reuse_days=30,
                     polite=_polite(Clock(), seen2), log=lambda *_: None)
    assert links == [("urlcit_a", "sme", "url_fetched", links[0][3], links[0][4])]
    assert res["stats"]["linked"] == 1 and res["not_found"] == 1
    assert res["stats"]["robots_disallowed"] == 1 and res["stats"]["http_404"] == 1
    nf = (tmp_path / "quotes_not_found.jsonl").read_text()
    assert "younger than five years" in nf and "quote not in today's page" in nf
    assert not any("/private/" in u for u in seen if not u.endswith("robots.txt"))
    # never two requests to one host without the spacing between them
    assert all(s <= 5.0 for s in clock.slept) and clock.slept
    assert res2["stats"].get("fetched", 0) == 0 and res2["stats"]["reused"] == 1
    assert not any(u.endswith("/call") for u in seen2)


def test_apply_refuses_while_the_store_is_empty(own_db, bucket, tmp_path, monkeypatch, capsys):
    mdb = own_db
    _capital(mdb)
    monkeypatch.setattr(M, "store_live", lambda con: (0, True))
    monkeypatch.setattr("sys.argv", ["x", "--apply", "--database-url", mdb.url("capital_app"),
                                     "--urls", str(_urls(tmp_path)), "--out", str(tmp_path)])
    assert M.main() == 2
    assert "REFUSED" in capsys.readouterr().err


def _urls(tmp_path):
    p = tmp_path / "urls.json"
    p.write_text('{"https://example.lv/call": 2}')
    return p
