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
