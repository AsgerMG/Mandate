"""The grounding store: idempotent, deduplicated, append-only, citable."""
from __future__ import annotations

import datetime as dt
import hashlib

import psycopg
import pytest

from mandate.grounding import (
    canonical_url, cite, latest, locate, read_original, store_original, add_passages,
    fetch, record_fetch,
)

T0 = dt.datetime(2026, 11, 1, 9, 0, tzinfo=dt.timezone.utc)
T1 = dt.datetime(2026, 11, 8, 9, 0, tzinfo=dt.timezone.utc)
PDF = b"%PDF-1.4 call document: applicants must be SMEs established in the EU."
TEXT = "call document: applicants must be SMEs established in the EU."


def test_store_puts_bytes_then_row_and_reads_back(con, bucket):
    v = store_original(con, PDF, "https://EC.Europa.eu/call.pdf#p3", "application/pdf", T0,
                       text=TEXT, extractor="test")
    assert v.created and v.sha256 == hashlib.sha256(PDF).hexdigest()
    assert v.bucket_key == f"sha256/{v.sha256[:2]}/{v.sha256}"
    assert v.canonical_url == "https://ec.europa.eu/call.pdf"
    assert bucket.exists(v.bucket_key)
    assert read_original(v) == PDF


def test_same_bytes_twice_is_one_version_and_two_fetches(con):
    a = store_original(con, PDF, "https://ec.europa.eu/call.pdf", "application/pdf", T0, text=TEXT)
    b = store_original(con, PDF, "https://ec.europa.eu/call.pdf", "application/pdf", T1, text=TEXT)
    c = store_original(con, PDF, "https://mirror.example.org/call.pdf", "application/pdf", T1)
    assert a.id == b.id == c.id and not b.created and not c.created
    n = con.execute("SELECT count(*) FROM grounding.fetches WHERE version_id = %s", (a.id,)).fetchone()[0]
    assert n == 3
    assert con.execute("SELECT count(*) FROM grounding.document_versions").fetchone()[0] == 1
    # the first sighting is kept, and the latest fetch of each URL resolves
    assert a.fetched_at == T0
    assert latest(con, "https://mirror.example.org/call.pdf").id == a.id


def test_record_fetch_of_stored_bytes_is_one_fetch_row_and_no_upload(con, bucket):
    sha = hashlib.sha256(PDF).hexdigest()
    assert record_fetch(con, "https://ec.europa.eu/call.pdf", sha, T0) is None  # not stored yet
    a = store_original(con, PDF, "https://ec.europa.eu/call.pdf", "application/pdf", T0, text=TEXT)
    b = record_fetch(con, "https://ec.europa.eu/call.pdf", sha, T1, http_status=200)
    assert b.id == a.id
    assert con.execute("SELECT array_agg(fetched_at ORDER BY fetched_at) FROM grounding.fetches "
                       "WHERE version_id = %s", (a.id,)).fetchone()[0] == [T0, T1]
    assert latest(con, "https://ec.europa.eu/call.pdf").id == a.id


def test_new_bytes_at_same_url_is_a_new_version_and_latest_follows(con):
    a = store_original(con, PDF, "https://ec.europa.eu/call.pdf", "application/pdf", T0, text=TEXT)
    b = store_original(con, PDF + b" amended", "https://ec.europa.eu/call.pdf", "application/pdf", T1)
    assert a.id != b.id and b.document_id == a.document_id
    assert latest(con, "https://ec.europa.eu/call.pdf").id == b.id


def test_brain_role_cannot_update_or_delete(mdb, bucket):
    with psycopg.connect(mdb.url("policy_app")) as c:
        store_original(c, PDF, "https://ec.europa.eu/x.pdf", "application/pdf", T0)
        for stmt in ("UPDATE grounding.documents SET title = 'x'",
                     "DELETE FROM grounding.fetches",
                     "TRUNCATE grounding.passages"):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                with c.transaction():
                    c.execute(stmt)
        c.rollback()


def test_owner_is_stopped_by_the_trigger_unless_a_migration_says_so(mdb, bucket):
    with psycopg.connect(mdb.admin_url) as c:
        c.execute("SET ROLE grounding_owner")
        store_original(c, PDF, "https://ec.europa.eu/y.pdf", "application/pdf", T0)
        with pytest.raises(psycopg.errors.InsufficientPrivilege, match="append-only"):
            with c.transaction():
                c.execute("UPDATE grounding.documents SET title = 'rewritten'")
        with c.transaction():
            c.execute("SET LOCAL grounding.allow_rewrite = 'on'")
            c.execute("UPDATE grounding.documents SET title = 'by migration'")
        c.rollback()


def test_capital_ro_reads_and_cannot_insert(mdb, bucket):
    with psycopg.connect(mdb.url("capital_ro")) as c:
        c.execute("SELECT count(*) FROM grounding.document_versions")
        with pytest.raises(psycopg.Error):
            c.execute("INSERT INTO grounding.sources (key, name) VALUES ('x', 'x')")


def test_cite_returns_the_words_and_refuses_a_wrong_quote(con):
    v = store_original(con, PDF, "https://ec.europa.eu/call.pdf", "application/pdf", T0,
                       text=TEXT, title="Call document")
    span = locate(TEXT, "must be SMEs\n established")
    assert span is not None
    c = cite(con, v.id, span, quote="must be SMEs established")
    assert c.quote.replace("\n", " ").startswith("must be SMEs")
    assert c.fetched_at == T0 and "Call document" in c.line() and "2026-11-01" in c.line()
    with pytest.raises(ValueError, match="does not match"):
        cite(con, v.id, span, quote="must be large enterprises")
    with pytest.raises(ValueError, match="outside"):
        cite(con, v.id, (0, 10_000))


def test_passages_are_cut_from_the_version_text(con):
    v = store_original(con, PDF, "https://ec.europa.eu/call.pdf", "application/pdf", T0, text=TEXT)
    ids = add_passages(con, v.id, "test.v1", [(0, 13, "Title"), (15, 30, None)])
    again = add_passages(con, v.id, "test.v1", [(0, 13, "Title"), (15, 30, None)])
    assert ids == again
    rows = con.execute("SELECT text FROM grounding.passages WHERE version_id = %s ORDER BY ordinal",
                       (v.id,)).fetchall()
    assert [r[0] for r in rows] == [TEXT[0:13], TEXT[15:30]]


def test_canonical_url_is_conservative():
    assert canonical_url("HTTPS://Ex.org:443/a?utm_source=x&id=3#frag") == "https://ex.org/a?id=3"
    assert canonical_url("http://ex.org:8080/A") == "http://ex.org:8080/A"
    assert canonical_url("urn:mandate:capital:innovation_fund/projects_index.json").startswith("urn:")
    with pytest.raises(ValueError):
        canonical_url("/Users/me/file.pdf")


def test_naive_datetime_is_refused(con):
    with pytest.raises(ValueError, match="timezone"):
        store_original(con, PDF, "https://ec.europa.eu/z.pdf", "application/pdf", dt.datetime(2026, 1, 1))


def test_fetch_stores_what_the_server_served(con):
    import httpx

    def handler(request):
        return httpx.Response(200, content=PDF, headers={"content-type": "application/pdf; x=y"})
    client = httpx.Client(transport=httpx.MockTransport(handler))
    v = fetch(con, "https://ec.europa.eu/served.pdf", client=client,
              extractor=lambda data, mime: (data.decode()[9:], "decode"))
    assert v.mime == "application/pdf" and v.text == PDF.decode()[9:]
    assert con.execute("SELECT http_status FROM grounding.fetches WHERE version_id = %s",
                       (v.id,)).fetchone()[0] == 200
