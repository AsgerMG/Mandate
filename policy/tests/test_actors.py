"""Actor extraction from verbatim debate passages (Phase 5.1).

The parsing functions are pure and carry most of the risk, because this reads a
serialization the verbatim adapters wrote (``"{name} ({role}) — {speech}"``) and
a sloppy pattern would fill the actor table with procedural noise. Every case
below was taken from real corpus text.
"""

from __future__ import annotations

from data.models import ActorRole
from etl.enrichment.actors import (
    classify_role,
    own_institution,
    parse_attribution,
    political_group,
)

# --- attribution parsing --------------------------------------------------


def test_parses_name_and_role_from_a_real_passage():
    """Verbatim from the corpus — and note the role is German, which is why the
    role map cannot be English-only."""
    text = "René Repasi (Berichterstatter) — Frau Präsidentin, Herr Kommissar, liebe Kolleginnen!"
    assert parse_attribution(text) == ("René Repasi", "Berichterstatter")


def test_parses_a_name_with_no_role():
    assert parse_attribution("Alex Agius Saliba — Madam President, the Digital...") == (
        "Alex Agius Saliba",
        None,
    )


def test_the_presiding_chair_is_not_an_actor():
    """Real corpus text. Whoever presides says "the next vote is on…" — that is
    procedural, not a stakeholder position. Without this filter the chair would
    be the most prolific actor in the corpus by an order of magnitude and would
    dominate every stakeholder block."""
    text = "President. ((see minutes, item 6.8)) — The next vote is on 'European..."
    assert parse_attribution(text) is None
    for chair in (
        "Die Präsidentin — Das Wort hat...",
        "Mme la présidente — La parole est à...",
        "Vice-President — Thank you...",
        "Der Präsident — Das Wort hat...",
        "Vizepräsidentin — Vielen Dank...",
        "M. le président — La parole est à...",
    ):
        assert parse_attribution(chair) is None, chair


def test_real_actor_names_are_not_mistaken_for_the_chair():
    """The chair filter uses truncated roots, so this guards the other direction:
    it must not swallow actual MEPs."""
    for name in ("René Repasi", "Brando Benifei", "Henna Virkkunen", "Leila Chaibi"):
        parsed = parse_attribution(f"{name} — Madam President, I want to say...")
        assert parsed is not None and parsed[0] == name, name


def test_unknown_speaker_is_not_an_actor():
    """The adapter writes "Unknown speaker" when it cannot attribute a turn;
    storing that as a person would be worse than storing nothing."""
    assert parse_attribution("Unknown speaker — Mr President, I would like...") is None


def test_a_passage_with_no_attribution_returns_none():
    """Continuation turns, vote records and title-only passages must not be
    coerced into actors."""
    assert parse_attribution("8. European technological sovereignty (vote)") is None
    assert parse_attribution("") is None


def test_the_en_dash_is_required_so_prose_does_not_match():
    """The adapters always write an en-dash (the source renders &#8211;), so
    anchoring on it keeps ordinary prose containing parentheses out."""
    assert parse_attribution("Regulation (EU) 2024/1689 - a hyphen, not an en-dash") is None


def test_names_are_whitespace_normalised():
    assert parse_attribution("  Brando   Benifei  — text here")[0] == "Brando Benifei"


# --- role classification --------------------------------------------------


def test_rapporteur_is_detected_across_languages():
    for role_text in ("Rapporteur", "rapporteure", "Berichterstatter", "relatore"):
        assert classify_role(role_text) is ActorRole.RAPPORTEUR, role_text


def test_shadow_rapporteur_wins_over_rapporteur():
    """"shadow rapporteur" contains "rapporteur", so cue order is load-bearing."""
    assert classify_role("shadow rapporteur") is ActorRole.SHADOW_RAPPORTEUR
    assert classify_role("Schattenberichterstatter") is ActorRole.SHADOW_RAPPORTEUR


def test_speaker_is_the_honest_default():
    """The person demonstrably spoke; claiming more from an absent cue would
    invent a relationship."""
    assert classify_role(None) is ActorRole.SPEAKER
    assert classify_role("on behalf of the EPP Group") is ActorRole.SPEAKER


# --- institution ----------------------------------------------------------


def test_a_commissioner_speaking_in_parliament_belongs_to_the_commission():
    """Found on the first real run: Henna Virkkunen, an Executive Vice-President
    of the Commission, was recorded under "European Parliament" because that is
    where she was speaking — mislabelling exactly the actors that matter most."""
    assert own_institution("Member of the Commission", "European Parliament") == (
        "European Commission"
    )
    assert own_institution("Kommissar", "Bundestag") == "European Commission"


def test_the_venue_is_used_when_the_role_says_nothing():
    assert own_institution(None, "European Parliament") == "European Parliament"
    assert own_institution("on behalf of the S&D Group", "Bundestag") == "Bundestag"


def test_political_group_is_extracted_when_stated():
    assert political_group("on behalf of the EPP Group") == "EPP Group"
    assert political_group("im Namen der EVP-Fraktion") == "EVP-Fraktion"
    assert political_group("Rapporteur") is None
    assert political_group(None) is None
