"""mandate-api against an ephemeral Postgres in the production layout.

The service connects as mandate_app, so every grant and trigger here is the one
production would enforce. Fetches go through an httpx MockTransport: no network.
"""
from __future__ import annotations

import datetime as dt
import hashlib

import httpx
import psycopg
import pytest
from fastapi.testclient import TestClient

from mandate.api.app import Config, create_app
from mandate.grounding import store_original
from mandate.grounding.testing import EphemeralMandate

TOKEN = "test-token"
H = {"Authorization": f"Bearer {TOKEN}"}

PAGE = ("<html><head><title>Bürgschaftsbank Berlin</title><script>x=1</script></head><body>"
        "<nav>menu</nav><h1>Ausfallbuergschaften</h1>"
        "<p>Die Buergschaft wird ueber die Hausbank beantragt.</p>"
        "<p>Presse: presse@buergschaftsbank-berlin.de</p>"
        "<p>Ansprechpartnerin: Anna Schmidt, anna.schmidt@buergschaftsbank-berlin.de; "
        "Jan Weber, jan.weber@buergschaftsbank-berlin.de; Eva Klein, eva.klein@buergschaftsbank-berlin.de</p>"
        "<p>Leiterin Kommunikation: Anna Schmidt</p></body></html>").encode("utf-8")
URL = "https://buergschaftsbank.example/garantien"


def _transport(request: httpx.Request) -> httpx.Response:
    if request.url.host == "buergschaftsbank.example":
        return httpx.Response(200, content=PAGE, headers={"content-type": "text/html; charset=utf-8"})
    return httpx.Response(404)


@pytest.fixture(scope="module")
def mdb():
    """Its OWN database: the service commits, and other modules count rows in the
    session database (test_grounding asserts global counts)."""
    with EphemeralMandate() as db:
        yield db


@pytest.fixture
def client(mdb, bucket):
    app = create_app(Config(database_url=mdb.url("mandate_app"), reference_url="", token=TOKEN,
                            http=httpx.Client(transport=httpx.MockTransport(_transport)),
                            allow_private_hosts=True))
    return TestClient(app)


@pytest.fixture
def page(client):
    r = client.post("/grounding/fetch", json={"url": URL}, headers=H)
    assert r.status_code == 200, r.text
    return r.json()


def _cite(client, page, quote):
    r = client.post("/grounding/cite", json={"sha256": page["sha256"], "quote": quote}, headers=H)
    assert r.status_code == 200, r.text
    return r.json()


def _workspace(client):
    r = client.post("/bootstrap", headers=H, json={
        "email": f"f{dt.datetime.now().timestamp()}@example.eu", "workspace_name": "Acme",
        "profile": {"name": "Acme Lending", "sector": "software_data_ai", "subsectors": ["fintech"]}})
    assert r.status_code == 200, r.text
    return r.json()


# ── auth ──────────────────────────────────────────────────────────────────

def test_no_token_configured_refuses_everything_but_health(mdb, bucket):
    c = TestClient(create_app(Config(database_url=mdb.url("mandate_app"), token="")))
    assert c.get("/health").status_code == 200
    assert c.post("/grounding/fetch", json={"url": URL}, headers=H).status_code == 503


def test_a_wrong_token_is_refused(client):
    r = client.post("/grounding/fetch", json={"url": URL}, headers={"Authorization": "Bearer nope"})
    assert r.status_code == 401


# ── grounding ─────────────────────────────────────────────────────────────

def test_fetch_stores_readable_text_and_reuses_a_fresh_fetch(client, page):
    assert page["citable"] and not page["reused"]
    assert page["title"] == "Bürgschaftsbank Berlin"
    again = client.post("/grounding/fetch", json={"url": URL}, headers=H).json()
    assert again["reused"] and again["sha256"] == page["sha256"]


def test_cite_locates_a_quote_and_refuses_one_the_page_does_not_make(client, page):
    c = _cite(client, page, "Die Buergschaft wird ueber die Hausbank beantragt.")
    assert c["canonical_url"] == URL and c["quote"].startswith("Die Buergschaft")
    r = client.post("/grounding/cite", json={"sha256": page["sha256"],
                                             "quote": "Die Buergschaft wird direkt beantragt."}, headers=H)
    assert r.status_code == 422
    # by URL too: the newest fetch of the page
    by_url = client.post("/grounding/cite", json={"url": URL, "quote": "ueber die Hausbank"}, headers=H)
    assert by_url.status_code == 200 and by_url.json()["sha256"] == page["sha256"]


def test_script_and_navigation_text_is_not_citable(client, page):
    r = client.post("/grounding/cite", json={"sha256": page["sha256"], "quote": "x=1"}, headers=H)
    assert r.status_code == 422


def test_verify_checks_the_quote_against_the_span(client, page):
    c = _cite(client, page, "ueber die Hausbank")
    bad = {**c, "quote": "ueber die Sparkasse"}
    res = client.post("/grounding/verify", json={"citations": [c, bad, {"sha256": "0" * 64,
                                                                      "span": [0, 1], "quote": "x"}]},
                      headers=H).json()["results"]
    assert res[0] == {"resolved": True, "quote_matched": True, "store": "primary", "reason": ""}
    assert res[1]["resolved"] and not res[1]["quote_matched"]
    assert not res[2]["resolved"]


def test_the_reference_store_is_read_by_sha256_and_never_written(mdb, bucket):
    """A rehearsal: a throwaway primary, and a reference store holding a version
    the primary does not. The citation resolves from the reference by content
    hash; a fetch writes to the primary only."""
    with EphemeralPair(mdb) as (primary_url, reference_url, ref_sha):
        c = TestClient(create_app(Config(database_url=primary_url, reference_url=reference_url,
                                         token=TOKEN, allow_private_hosts=True,
                                         http=httpx.Client(transport=httpx.MockTransport(_transport)))))
        r = c.post("/grounding/cite", json={"sha256": ref_sha, "quote": "Article 106"}, headers=H)
        assert r.status_code == 200, r.text
        assert r.json()["store"] == "reference"


class EphemeralPair:
    """The session database as the reference store, a second fresh database as
    the primary."""
    def __init__(self, mdb):
        self.mdb = mdb

    def __enter__(self):
        con = psycopg.connect(self.mdb.url("capital_app"))
        text = "TUB Article 106: lending to the public is reserved to authorised intermediaries."
        v = store_original(con, text.encode(), "https://www.bancaditalia.example/tub", "text/plain",
                           dt.datetime.now(dt.timezone.utc), text=text)
        con.commit()
        con.close()
        self.other = EphemeralMandate().__enter__()
        return self.other.url("mandate_app"), self.mdb.url("capital_ro"), v.sha256

    def __exit__(self, *exc):
        self.other.__exit__(*exc)


# ── profiles ──────────────────────────────────────────────────────────────

def test_profile_get_and_append_as_mandate(client):
    w = _workspace(client)
    got = client.get(f"/profiles/{w['profile_id']}", headers=H).json()
    assert got["version"] == 1
    r = client.post(f"/profiles/{w['profile_id']}/versions", headers=H, json={
        "payload": {"name": "Acme Lending", "sector": "software_data_ai", "incorporationCountry": "DE"},
        "source": "mandate", "expected": 1, "note": "founder said: incorporated in Berlin"})
    assert r.status_code == 200, r.text
    assert r.json()["version"] == 2
    # a stale writer conflicts rather than overwriting
    stale = client.post(f"/profiles/{w['profile_id']}/versions", headers=H, json={
        "payload": {"name": "Acme"}, "source": "regina", "expected": 1})
    assert stale.status_code == 409


# ── workspace ─────────────────────────────────────────────────────────────

def test_a_decision_needs_every_claim_cited_or_labelled(client, page):
    w = _workspace(client)
    m = client.post("/missions", headers=H, json={"workspace_id": w["workspace_id"],
        "objective": "Guarantee our loan book", "profile_id": w["profile_id"], "profile_version": 1}).json()
    c1 = _cite(client, page, "Die Buergschaft wird ueber die Hausbank beantragt.")
    base = {"title": "Go through a Hausbank in Germany", "recommendation": "Apply via a partner bank.",
            "confidence": "medium", "created_by": "wincent", "citations": {"c1": c1}}
    ok = client.post(f"/missions/{m['id']}/decisions", headers=H, json={**base, "claims": [
        {"text": "German guarantees are applied for through the Hausbank.", "basis": "cited", "citation_ids": ["c1"]},
        {"text": "A partnership is faster than a licence.", "basis": "judgement"}]})
    assert ok.status_code == 200, ok.text
    stored = ok.json()
    assert list(stored["citations"]) == ["c1"] and stored["citations"]["c1"]["sha256"] == page["sha256"]

    for bad_claims, why in [
        ([{"text": "Bare assertion."}], "no basis"),
        ([{"text": "Cited to nothing.", "basis": "cited", "citation_ids": []}], "cited without ids"),
        ([{"text": "Cited to a ghost.", "basis": "cited", "citation_ids": ["c9"]}], "unknown id"),
        ([{"text": "Judgement with ids.", "basis": "judgement", "citation_ids": ["c1"]}], "label with ids"),
    ]:
        r = client.post(f"/missions/{m['id']}/decisions", headers=H, json={**base, "claims": bad_claims})
        assert r.status_code == 422, why

    # a citation whose quote is not in the page is refused, whatever the agent says
    forged = {**c1, "quote": "Die Buergschaft wird ohne Bank beantragt."}
    r = client.post(f"/missions/{m['id']}/decisions", headers=H, json={**base, "citations": {"c1": forged},
        "claims": [{"text": "x", "basis": "cited", "citation_ids": ["c1"]}]})
    assert r.status_code == 422


def test_actions_flags_plan_and_snapshot_are_append_only(client, mdb):
    w = _workspace(client)
    m = client.post("/missions", headers=H, json={"workspace_id": w["workspace_id"],
                                                  "objective": "x"}).json()
    a = client.post(f"/missions/{m['id']}/actions", headers=H, json={
        "title": "Email the Bürgschaftsbank", "created_by": "mandate",
        "draft": "Sehr geehrte Damen und Herren, ..."}).json()
    client.post(f"/actions/{a['id']}/events", headers=H, json={"status": "done", "created_by": "founder"})
    f = client.post(f"/missions/{m['id']}/flags", headers=H, json={
        "title": "No banking licence", "severity": "blocker", "created_by": "wincent",
        "claims": [{"text": "Direct lending in Italy needs authorisation.", "basis": "unverified"}]}).json()
    client.post(f"/missions/{m['id']}/flags", headers=H, json={
        "title": "No banking licence", "severity": "blocker", "created_by": "founder",
        "status": "resolved", "supersedes": f["id"]})
    client.post(f"/missions/{m['id']}/plan_steps", headers=H, json={"title": "Pick a partner bank",
                                                                    "created_by": "mandate"})
    s2 = client.post(f"/missions/{m['id']}/plan_steps", headers=H, json={"title": "Apply",
                                                                         "created_by": "mandate"}).json()
    assert s2["ordinal"] == 2
    wl = client.post(f"/missions/{m['id']}/watchlist", headers=H, json={
        "kind": "rule", "subject": "InvestEU moving under the European Competitiveness Fund",
        "trigger": "alternative lenders lose or keep intermediary eligibility", "jurisdiction": "EU",
        "created_by": "mandate"})
    assert wl.status_code == 200, wl.text
    snap = client.get(f"/workspaces/{w['workspace_id']}/snapshot", headers=H).json()
    assert [x["subject"] for x in snap["watchlist"]] == ["InvestEU moving under the European Competitiveness Fund"]
    assert [x["status"] for x in snap["actions"]] == ["done"]
    assert [x["status"] for x in snap["flags"]] == ["resolved"]
    assert len(snap["plan_steps"]) == 2
    with psycopg.connect(mdb.url("mandate_app")) as con, pytest.raises(psycopg.errors.RaiseException):
        con.execute("UPDATE mandate.actions SET title = 'rewritten' WHERE id = %s", (a["id"],))


# ── actors register ───────────────────────────────────────────────────────

def _org(client, page):
    c = _cite(client, page, "Ausfallbuergschaften")
    r = client.post("/actors/organisations", headers=H, json={
        "name": "Bürgschaftsbank Berlin", "kind": "promotional_bank", "jurisdiction": "DE",
        "citation": c, "created_by": "wincent", "topics": ["loan guarantees"]})
    assert r.status_code == 200, r.text
    return r.json()


def test_a_published_contact_point_is_stored_and_an_unpublished_one_is_refused(client, page):
    org = _org(client, page)
    c = _cite(client, page, "Presse: presse@buergschaftsbank-berlin.de")
    ok = client.post("/actors/contact_points", headers=H, json={
        "organisation_id": org["id"], "kind": "press_office", "channel": "email",
        "value": "presse@buergschaftsbank-berlin.de", "citation": c, "created_by": "wincent"})
    assert ok.status_code == 200, ok.text
    guessed = client.post("/actors/contact_points", headers=H, json={
        "organisation_id": org["id"], "kind": "institutional_email", "channel": "email",
        "value": "ceo@buergschaftsbank-berlin.de", "citation": c, "created_by": "wincent"})
    assert guessed.status_code == 422
    found = client.get("/actors", params={"q": "loan guarantees"}, headers=H).json()["actors"]
    assert found[0]["name"] == "Bürgschaftsbank Berlin"
    assert [p["value"] for p in found[0]["contact_points"]] == ["presse@buergschaftsbank-berlin.de"]


def test_a_person_enters_only_through_a_published_role(client, page):
    org = _org(client, page)
    c = _cite(client, page, "Leiterin Kommunikation: Anna Schmidt")
    ok = client.post("/actors/roles", headers=H, json={"person_name": "Anna Schmidt", "organisation_id": org["id"],
        "title": "Leiterin Kommunikation", "citation": c, "created_by": "regina"})
    assert ok.status_code == 200, ok.text
    nobody = client.post("/actors/roles", headers=H, json={"person_name": "Max Mustermann",
        "organisation_id": org["id"], "title": "CEO", "citation": c, "created_by": "regina"})
    assert nobody.status_code == 422


def test_email_format_is_derived_with_computed_confidence_and_a_guess_is_never_stored(client, page, mdb):
    org = _org(client, page)
    q = ("Ansprechpartnerin: Anna Schmidt, anna.schmidt@buergschaftsbank-berlin.de; "
         "Jan Weber, jan.weber@buergschaftsbank-berlin.de; Eva Klein, eva.klein@buergschaftsbank-berlin.de")
    c = _cite(client, page, q)
    r = client.post("/actors/email_formats", headers=H, json={"organisation_id": org["id"], "created_by": "regina",
        "examples": [{"address": "anna.schmidt@buergschaftsbank-berlin.de", "first": "Anna", "last": "Schmidt", "citation": c},
                     {"address": "jan.weber@buergschaftsbank-berlin.de", "first": "Jan", "last": "Weber", "citation": c},
                     {"address": "eva.klein@buergschaftsbank-berlin.de", "first": "Eva", "last": "Klein", "citation": c}]})
    assert r.status_code == 200, r.text
    fmt = r.json()
    assert fmt["pattern"] == "{first}.{last}@buergschaftsbank-berlin.de" and fmt["confidence"] == "high"
    with psycopg.connect(mdb.url("mandate_app")) as con:
        before = con.execute("SELECT (SELECT count(*) FROM mandate.actor_contact_points), "
                             "(SELECT count(*) FROM mandate.actor_people)").fetchone()
    g = client.post(f"/actors/email_formats/{fmt['id']}/apply", headers=H,
                    json={"first": "Jürgen", "last": "Müller"}).json()
    assert g["address"] == "jurgen.muller@buergschaftsbank-berlin.de"
    assert g["verified"] is False and g["stored"] is False and "UNVERIFIED" in g["label"]
    with psycopg.connect(mdb.url("mandate_app")) as con:
        after = con.execute("SELECT (SELECT count(*) FROM mandate.actor_contact_points), "
                            "(SELECT count(*) FROM mandate.actor_people)").fetchone()
    assert before == after
    # an example that is not in its passage does not count
    bad = client.post("/actors/email_formats", headers=H, json={"organisation_id": org["id"], "created_by": "regina",
        "examples": [{"address": "max.mustermann@buergschaftsbank-berlin.de", "first": "Max",
                      "last": "Mustermann", "citation": c}]})
    assert bad.status_code == 422


def test_erasure_deletes_personal_data_and_records_only_that_it_happened(client, page, mdb):
    org = _org(client, page)
    c = _cite(client, page, "Leiterin Kommunikation: Anna Schmidt")
    role = client.post("/actors/roles", headers=H, json={"person_name": "Anna Schmidt", "organisation_id": org["id"],
        "title": "Leiterin Kommunikation", "citation": c, "created_by": "regina"}).json()
    with psycopg.connect(mdb.url("mandate_app")) as con, pytest.raises(psycopg.errors.RaiseException):
        con.execute("DELETE FROM mandate.actor_people WHERE id = %s", (role["person"]["id"],))
    r = client.post("/actors/erase", headers=H, json={"entity": "person", "entity_id": role["person"]["id"],
                                                      "reason": "on_request"})
    assert r.json()["erased"] is True
    with psycopg.connect(mdb.url("mandate_app")) as con:
        assert con.execute("SELECT count(*) FROM mandate.actor_people WHERE id = %s",
                           (role["person"]["id"],)).fetchone()[0] == 0
        log = con.execute("SELECT * FROM mandate.actor_erasures WHERE entity_id = %s",
                          (role["person"]["id"],)).fetchall()
        assert len(log) == 1 and "Anna" not in str(log)
        # organisations are never erasable
        with pytest.raises(psycopg.errors.RaiseException):
            with con.transaction():
                con.execute("SET LOCAL mandate.erasure = 'on'")
                con.execute("DELETE FROM mandate.actor_organisations WHERE id = %s", (org["id"],))


def test_pattern_derivation():
    from mandate.api.actors import confidence_for, pattern_of
    assert pattern_of("a.schmidt@x.eu", "Anna", "Schmidt") == "{f}.{last}@x.eu"
    assert pattern_of("anna_schmidt@x.eu", "Anna", "Schmidt") == "{first}_{last}@x.eu"
    assert pattern_of("schmidt@x.eu", "Anna", "Schmidt") == "{last}@x.eu"
    assert pattern_of("press@x.eu", "Anna", "Schmidt") is None
    assert confidence_for(1, 1) == "low" and confidence_for(2, 2) == "medium" and confidence_for(3, 3) == "high"
    assert confidence_for(3, 5) == "low"


def test_sha_is_the_key():
    assert len(hashlib.sha256(PAGE).hexdigest()) == 64


def test_the_deliverable_holds_its_claims_to_the_same_rule(client, page):
    w = _workspace(client)
    m = client.post("/missions", headers=H, json={"workspace_id": w["workspace_id"], "objective": "x"}).json()
    c1 = _cite(client, page, "ueber die Hausbank")
    ok = client.post(f"/missions/{m['id']}/deliverable", headers=H, json={
        "title": "Guarantee routes", "summary": "Two routes.", "citations": {"c1": c1},
        "sections": [{"heading": "Germany", "claims": [
            {"text": "Applied for through the Hausbank.", "basis": "cited", "citation_ids": ["c1"]},
            {"text": "Start with one partner bank.", "basis": "judgement"}]}],
        "questions": [{"question": "Do you hold a licence?", "why": "decides IT"}]})
    assert ok.status_code == 200, ok.text
    bad = client.post(f"/missions/{m['id']}/deliverable", headers=H, json={
        "title": "x", "sections": [{"heading": "Germany", "claims": [{"text": "Bare."}]}]})
    assert bad.status_code == 422
    got = client.get(f"/missions/{m['id']}", headers=H).json()
    d = got["messages"][-1]["payload"]["deliverable"]
    assert d["sections"][0]["claims"][0]["citation_ids"] == ["c1"]


def test_public_address_check_reads_the_ipv4_inside_nat64_and_mapped_addresses():
    from mandate.api.app import is_public_address
    assert is_public_address("104.151.29.97")
    assert is_public_address("64:ff9b::6897:1d61")          # NAT64 of 104.151.29.97
    assert not is_public_address("64:ff9b::a00:1")          # NAT64 of 10.0.0.1
    assert not is_public_address("::ffff:127.0.0.1")
    assert not is_public_address("169.254.169.254")         # cloud metadata
    assert not is_public_address("::1") and not is_public_address("fd00::1")
