import datetime as dt
import json

from bs4 import BeautifulSoup

from data.models import DocumentType, LifecycleStage
from etl.adapters.base import DocRef, RawDocument
from etl.adapters.eurlex import _classify_stage, _classify_type, _extract_text
from etl.adapters.eurlex_key_acts import KEY_ACTS, EurLexKeyActsAdapter


def test_regulation_celex():
    # GDPR: 32016R0679
    assert _classify_type("32016R0679") is DocumentType.REGULATION
    assert _classify_stage("32016R0679") is LifecycleStage.IN_FORCE


def test_directive_celex():
    assert _classify_type("32019L0790") is DocumentType.DIRECTIVE
    assert _classify_stage("32019L0790") is LifecycleStage.IN_FORCE


def test_proposal_celex():
    # A COM proposal, e.g. the AI Act proposal 52021PC0206
    assert _classify_type("52021PC0206") is DocumentType.PROPOSAL
    assert _classify_stage("52021PC0206") is LifecycleStage.PROPOSED


def test_communication_celex():
    assert _classify_type("52020DC0066") is DocumentType.COMMUNICATION
    # A communication is a preparatory act, never in-force law (regression:
    # sector-5 "DC" must not fall through to IN_FORCE via descriptor "D").
    assert _classify_stage("52020DC0066") is LifecycleStage.UNKNOWN
    assert _classify_stage("52026DC0247") is LifecycleStage.UNKNOWN


def test_unknown_descriptor_falls_back():
    assert _classify_type("3201X9999") is DocumentType.OTHER
    assert _classify_stage("3201X9999") is LifecycleStage.UNKNOWN


def test_extract_text_does_not_duplicate_nested_paragraphs():
    # Regression: real EUR-Lex markup nests <p> inside several levels of
    # <div>. Walking both tags without a leaf-only filter captured each
    # paragraph once via its wrapping <div>.get_text() and again via the <p>
    # itself, multiplying with nesting depth (confirmed live: MiCA came out
    # at 3.6M chars / ~11k repeats of "crypto-asset" for a ~150-page act).
    html = """
    <html><body>
      <div id="text">
        <div class="eli-subdivision">
          <div class="eli-subdivision">
            <p>Article 1: This Regulation applies to crypto-asset issuers.</p>
          </div>
          <p>Article 2: Definitions.</p>
        </div>
      </div>
    </body></html>
    """
    soup = BeautifulSoup(html, "lxml")
    text = _extract_text(soup)
    assert text.count("crypto-asset") == 1
    assert "Article 1" in text and "Article 2" in text


def test_key_acts_parse_replaces_manifestation_filename_title():
    # Regression: a COM proposal's raw <title> came back as a manifestation
    # filename ("IMMC.COM%282025%29836...v7.docx") — a real extension the
    # original ".xml"/".xhtml" allowlist didn't cover, so it slipped through
    # unreplaced into a citation. Detecting "no whitespace" instead of
    # enumerating extensions catches any manifestation filename.
    celex = "52025PC0836"
    html = (
        b"<html><head><title>IMMC.COM%282025%29836%20final.ENG.xhtml.1_EN_ACT_part1_v7.docx"
        b"</title></head><body><p>Some body text.</p></body></html>"
    )
    ref = DocRef(
        external_id=celex, url="http://x", hint={"celex": celex, "date": None, "type_uri": None}
    )
    raw = RawDocument(
        ref=ref, content=html, content_type="text/html", fetched_at=dt.datetime.now(dt.UTC)
    )
    adapter = EurLexKeyActsAdapter(http=None, settings=None)
    doc = adapter.parse(raw)
    assert doc.title == KEY_ACTS[celex]


class _FakeSparqlHttp:
    def __init__(self, dated_celex: dict[str, str]):
        self._payload = {
            "results": {
                "bindings": [
                    {"celex": {"value": celex}, "date": {"value": date}}
                    for celex, date in dated_celex.items()
                ]
            }
        }

    def get(self, url, **kw):
        payload = self._payload

        class R:
            content = json.dumps(payload).encode()

            def json(self):
                return payload

        return R()


def test_key_acts_discover_populates_date_from_sparql_lookup():
    # Regression: discover() used to hardcode hint={"date": None, ...} for
    # every canon act, so date_document was always null downstream (see
    # eurlex.py's parse(), which reads solely from this hint) — GDPR and
    # every other foundational act never got a real publication date.
    gdpr = "32016R0679"
    http = _FakeSparqlHttp({gdpr: "2016-04-27"})
    adapter = EurLexKeyActsAdapter(http=http, settings=None)
    refs = {r.external_id: r for r in adapter.discover(None, None)}
    assert refs[gdpr].hint["date"] == "2016-04-27"
    # An act absent from the SPARQL response (e.g. Cellar has no
    # work_date_document for it) falls back to None — no worse than before.
    other = next(c for c in KEY_ACTS if c != gdpr)
    assert refs[other].hint["date"] is None


# --- CELEX descriptors that used to fall through to OTHER -----------------
# Every case below was found live in the corpus on 2026-07-27, when 459 real
# EU legal acts were typed OTHER because the classifier handled only
# R/L/D/PC/DC. OTHER is sorted into the *commentary* tier by
# briefing._DEEPEN_QUOTAS, so each of these was a document the brief weighed
# as if it were a newsletter.


def test_staff_working_document_is_not_commentary_soup():
    # 85 of these were OTHER. They are the Commission's own reasoning, which
    # is real brief material — but it has to be identifiable as such.
    assert _classify_type("52007SC0403") is DocumentType.STAFF_WORKING_DOC


def test_institutional_opinions_are_classified_as_opinions():
    for celex in (
        "52006AP0370",  # EP legislative position
        "52010IP0046",  # EP resolution
        "52006AE1152",  # EESC opinion
        "52007IE0793",  # EESC own-initiative opinion
        "52016IR2880",  # Committee of the Regions
        "52008AR0304",  # CoR own-initiative
        "52014AB0009",  # ECB opinion
    ):
        assert _classify_type(celex) is DocumentType.OPINION, celex


def test_recommendations_and_notices_are_soft_law():
    assert _classify_type("32007H0879") is DocumentType.GUIDELINE  # recommendation
    assert _classify_type("52024XC01320") is DocumentType.GUIDELINE  # Commission notice
    assert _classify_type("52025XG02954") is DocumentType.GUIDELINE  # Council conclusions
    assert _classify_type("32023Q02189") is DocumentType.GUIDELINE  # EDPB decision


def test_budget_instruments_stay_out_of_the_binding_tier():
    """Budget-discharge decisions are binding but irrelevant to a compliance
    brief. Promoting them to DECISION would let them compete for depth slots
    against regulation the company is genuinely subject to — so accurate
    classification here means NOT calling them decisions."""
    from etl.intelligence.briefing import _DEEPEN_QUOTAS

    assert _classify_type("32015B1630") is DocumentType.BUDGET
    assert _classify_type("52006BP0427") is DocumentType.BUDGET
    binding = next(types for name, types, _ in _DEEPEN_QUOTAS if name == "binding")
    assert DocumentType.BUDGET.value not in binding


def test_joint_communication_is_a_communication():
    assert _classify_type("52013JC0001") is DocumentType.COMMUNICATION


# --- Sector 6: case law ---------------------------------------------------


def test_court_judgments_are_judgments_in_both_celex_forms():
    """Cellar carries each ruling twice: a full-text descriptor (CJ/TJ) and an
    OJ-notice descriptor (CA/TA). Verified live over 400 sector-6 works, CA
    alone was 83 of them — mapping only the full-text forms left a third of all
    case law in the commentary tier."""
    for celex in ("62025CJ0051", "62021CA0312", "62023TJ1078", "62023TA1078"):
        assert _classify_type(celex) is DocumentType.JUDGMENT, celex


def test_court_orders_are_judgments():
    for celex in ("62020CO0123", "62025CB0168", "62024TO0456", "62025TB0144"):
        assert _classify_type(celex) is DocumentType.JUDGMENT, celex


def test_advocate_general_opinion_is_persuasive_not_binding():
    assert _classify_type("62021CC0184") is DocumentType.OPINION


def test_pending_cases_are_not_citable_authority():
    """An appeal lodged or an action brought has produced no ruling, so there
    is nothing to cite. These must not reach the binding tier."""
    assert _classify_type("62025CN0744") is DocumentType.OTHER
    assert _classify_type("62026TN0182") is DocumentType.OTHER


def test_judgments_are_staged_adopted_not_in_force():
    """A judgment is handed down, not brought into force — and it is certainly
    not UNKNOWN, which is what sector 6 returned before."""
    assert _classify_stage("62025CJ0051") is LifecycleStage.ADOPTED
    assert _classify_stage("62021CA0312") is LifecycleStage.ADOPTED


def test_judgments_sit_in_their_own_small_precedent_tier():
    """Judgments were first put in the `binding` tier on the reasoning that a
    ruling on what a provision requires is as decisive as the provision's text.
    That conflated authority with relevance: a regulation either applies to a
    company or does not, whereas a ruling only matters if it construes a
    provision the brief is already giving a verdict on. Sharing the binding
    quota let the depth pass amplify 5 nominated rulings into 20 passages — 31%
    of a fintech profile's substantive context. Own tier, small share."""
    from etl.intelligence.briefing import _DEEPEN_QUOTAS

    shares = {name: share for name, _, share in _DEEPEN_QUOTAS}
    tier_of = {
        t: name for name, types, _ in _DEEPEN_QUOTAS for t in types
    }
    assert tier_of[DocumentType.JUDGMENT.value] == "precedent"
    assert tier_of[DocumentType.ENFORCEMENT_DECISION.value] == "precedent"
    # Available, but never at the expense of the binding text.
    assert shares["precedent"] < shares["binding"]


def test_short_or_malformed_celex_never_raises():
    for celex in ("", "3", "32016", "6"):
        assert _classify_type(celex) is DocumentType.OTHER


# --- CELEX recovery for documents already ingested without one -------------


def test_backfill_celex_from_title_fills_only_nulls(db_session):
    """A feed only carries recent items, so documents already stored would keep
    celex IS NULL essentially forever — and celex IS NULL is what makes
    reclassify_celex_documents and enrich_lifecycle skip a document entirely."""
    from data.models import Document, Jurisdiction, Source
    from etl.enrichment.reclassify import backfill_celex_from_title

    source = Source(key="eurlex_oj_l", name="OJ L", jurisdiction=Jurisdiction.EU)
    db_session.add(source)
    db_session.flush()
    needs_fill = Document(
        source_id=source.id,
        external_id="u1",
        title=(
            "CELEX:32026R1881: Regulation (EU) 2026/1881 of the European "
            "Parliament and of the Council"
        ),
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.OTHER,
        lifecycle_stage=LifecycleStage.UNKNOWN,
    )
    already_set = Document(
        source_id=source.id,
        external_id="u2",
        title="CELEX:32016R0679: GDPR",
        celex="ALREADY-SET",
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.REGULATION,
        lifecycle_stage=LifecycleStage.IN_FORCE,
    )
    no_celex = Document(
        source_id=source.id,
        external_id="u3",
        title="Commission opens consultation on AI",
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.OTHER,
        lifecycle_stage=LifecycleStage.UNKNOWN,
    )
    db_session.add_all([needs_fill, already_set, no_celex])
    db_session.commit()

    result = backfill_celex_from_title(db_session)
    assert result["celex_filled"] == 1
    db_session.refresh(needs_fill)
    db_session.refresh(already_set)
    db_session.refresh(no_celex)
    assert needs_fill.celex == "32026R1881"
    assert already_set.celex == "ALREADY-SET"  # never overwritten
    assert no_celex.celex is None

    # Idempotent.
    assert backfill_celex_from_title(db_session)["celex_filled"] == 0


def test_classify_by_source_types_eurlex_feed_acts_from_the_title():
    """Belt and braces for the backfill: if a title ever arrives in a shape the
    CELEX pattern misses, these acts must still not be left as OTHER."""
    from etl.enrichment.reclassify import _classify_by_source

    assert (
        _classify_by_source(
            "eurlex_oj_l", None, "CELEX:32026R1881: Regulation (EU) 2026/1881 of the..."
        )
        is DocumentType.REGULATION
    )
    assert (
        _classify_by_source("eurlex_ep_council_legislation", None, "CELEX:32026D1347: Decision")
        is DocumentType.DECISION
    )
    # No parseable CELEX -> left alone rather than guessed at.
    assert _classify_by_source("eurlex_oj_l", None, "Some untagged headline") is None
    # Unrelated sources are unaffected.
    assert _classify_by_source("netzpolitik", None, "CELEX:32026R1881: x") is DocumentType.PRESS


# --- duplicate ingestion between eurlex and eurlex_key_acts ----------------
# Verified live 2026-08-07: 16 CELEXes existed as two Document rows each — one
# from `eurlex`, one from `eurlex_key_acts` — every pair with exactly ONE
# distinct content_hash (AI Act ×434 passages, DSA ×333, GDPR ×278…; 3,290
# redundant passages total). uq_document_source_external never fires because
# source_id differs. eurlex_key_acts re-ingests all ~55 canon acts on EVERY run
# (`for celex in KEY_ACTS`), so it is a standing generator: cleaning the rows up
# in the database alone would be undone by the next refresh.


class _FakeResp:
    def __init__(self, payload):
        self._payload = payload

    def json(self):
        return self._payload


class _FakeHttp:
    def __init__(self, celexes):
        self._celexes = celexes
        self.calls = 0

    def get(self, url, **kwargs):
        self.calls += 1
        return _FakeResp(
            {
                "results": {
                    "bindings": [
                        {
                            "celex": {"value": c},
                            "title": {"value": f"Title for {c}"},
                            "date": {"value": "2026-07-01"},
                        }
                        for c in self._celexes
                    ]
                }
            }
        )


class _Settings:
    backfill_days = 730


def test_eurlex_discovery_skips_celexes_owned_by_key_acts():
    from etl.adapters.eurlex import EurLexAdapter

    canon = "32024R1689"  # the AI Act — one of the 16 confirmed duplicates
    assert canon in KEY_ACTS
    other = "32026R9999"

    http = _FakeHttp([canon, other])
    adapter = EurLexAdapter(http, _Settings())
    discovered = [ref.external_id for ref in adapter.discover(dt.date(2026, 1, 1), None)]

    assert canon not in discovered, (
        "eurlex re-discovered a CELEX eurlex_key_acts deterministically "
        "re-ingests every run — the duplicate generator is back"
    )
    assert other in discovered, "the guard must not suppress ordinary discovery"


def test_every_key_act_is_excluded_from_eurlex_discovery():
    from etl.adapters.eurlex import EurLexAdapter

    http = _FakeHttp(list(KEY_ACTS))
    adapter = EurLexAdapter(http, _Settings())
    assert list(adapter.discover(dt.date(2026, 1, 1), None)) == []


def test_key_acts_adapter_still_ingests_its_own_curated_list():
    """The guard makes eurlex_key_acts the SINGLE owner — it must not have
    silently disowned the canon set as well."""
    assert "32024R1689" in KEY_ACTS
    assert EurLexKeyActsAdapter.discover is not None
