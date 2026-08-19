"""Make the eligibility corpus machine-decidable: triage every gate, re-file it
under the field that actually decides it, and encode it as a comparator the
product can run.

THE PROBLEM (measured 2026-07-26)
---------------------------------
`eligibility.ts` ships a working comparator engine (band_max / in / equals /
boolean_true / boolean_false / numeric_gte / numeric_lte) and a generic loop
that evaluates every gate carrying a value_spec. **0 of 4,018 gates carry one**,
so that loop has never executed. The product can say "this fund looks
thematically relevant" and "you answered N of its questions"; it cannot say
"you qualify".

Two further findings shape the design:

  * A 150-gate random audit of the llm_cited tier found only ~58% are genuine
    eligibility FILTERS. ~19% are obligations binding the beneficiary after
    award, ~21% are facts about the fund itself (funding rate, budget, call
    window), ~3% too vague to test. All four are stored identically today and
    all four are treated as answerable requirements — which is why the memo
    can tell a founder "your answers cover 20 of 30 requirements" when many of
    the 30 are not requirements they could ever answer.

  * Two independent passes disagreed with the stored `intake_field` on 52% and
    69% of samples. "Support is provided as non-dilutive grants" is filed under
    borrowerModel; "aid intensity capped at 20% of eligible costs" under
    turnoverBand. Encoding against those labels would make the mis-filing
    permanent, so triage MUST precede encoding.

WHAT THIS WRITES
----------------
  gate_role             filter | obligation | programme_fact | vague
  intake_field_resolved the field whose answer decides it, or 'none'
  value_spec            a comparator, for filters only
  encoding_method       provenance

It never touches `intake_field`, `requirement`, `value` or `quote`:
classify_gates_bulk.py's ON CONFLICT overwrites intake_field on every re-run,
so a correction written there would be silently reverted. Provenance stays,
curated truth lives beside it.

SCOPE: llm_cited and above by default. The llm_classified tier (1,551 gates)
has no quote at all — 0% — and 15% is visibly hedged prose ("typical of
national agencies"). Encoding guesses would manufacture false confidence, so
it is excluded unless --include-classified is passed.

Usage:
  python3 ETL/terms/encode_gates.py status
  python3 ETL/terms/encode_gates.py triage [--limit N] [--rebuild]
  python3 ETL/terms/encode_gates.py encode [--limit N] [--rebuild]
  python3 ETL/terms/encode_gates.py report
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB  # noqa: E402
from euro_money import euro_scales, stable_band  # noqa: E402
# --- end ETL path bootstrap ---

import argparse
import json
import os
import sqlite3

import anthropic

# Overridable per run: `--model haiku` (or a full model id). Triage and
# encoding are constrained classification against verbatim gate text with a
# fixed output schema, not open-ended writing, so the cheaper model is a
# reasonable default choice for bulk passes -- audit_encoding_vs_reality.py
# is the quality gate either way, and it checks encodings against who actually
# received the money rather than trusting the model.
MODELS = {
    "haiku": "claude-haiku-4-5-20251001",
    "sonnet": "claude-sonnet-5",
}
MODEL = MODELS["sonnet"]
TRIAGE_CHUNK = 20
ENCODE_CHUNK = 15
CITED_OR_BETTER = ("llm_cited", "llm_2pass", "human_verified")

# The intake vocabulary, READ rather than restated. These used to be three
# hand-copied dicts here carrying a "Mirrors types.ts -- keep in sync" comment.
# That comment was the bug: a vocabulary kept in sync by hand drifts, and when
# it drifts nothing fails -- the encoder just emits values the product cannot
# match, so the rule silently stops gating. Regenerate with
# `npx tsx scripts/emit_vocabulary.ts`; check_vocabularies.ts fails if stale.
_VOCAB_PATH = _Path(__file__).resolve().parents[2] / "data" / "vocabularies.json"
try:
    _VOCAB = json.loads(_VOCAB_PATH.read_text())
except FileNotFoundError:  # pragma: no cover
    raise SystemExit(
        f"missing {_VOCAB_PATH}. Generate it with:\n"
        f"  cd website/frontend && npx tsx scripts/emit_vocabulary.ts")

ENUM_VALUES: dict[str, list[str]] = _VOCAB["enumValues"]
BAND_ORDERS: dict[str, list[str]] = _VOCAB["bandOrders"]
MULTI_VALUE_FIELDS = set(_VOCAB["multiValueFields"])
#: field -> "applicant" | "project": what an answer to this field is ABOUT.
FIELD_SUBJECT: dict[str, str] = _VOCAB["fieldSubject"]
#: field -> the values meaning "a real member of this category our list does
#: not name". Read, never restated; see SECTOR_OPTIONS in types.ts.
UNNAMED_RESIDUALS: dict[str, list[str]] = _VOCAB["unnamedResidualValues"]
# How each intake field gets answered, and therefore which ones a rule may be
# keyed to at all. Read, never restated -- see FIELDS below.
FIELD_REACH: dict[str, str] = _VOCAB["fieldReach"]
ENCODABLE_FIELDS: list[str] = _VOCAB["encodableFields"]

ROLES = ["filter", "obligation", "programme_fact", "vague"]

# ── A country field must hold a country ──────────────────────────────────────
# `entityCountries` and `activityCountries` are free text, so the vocabulary
# check below cannot see them, and a rule restricting a scheme to named REGIONS
# was encoded as `activityCountries in ["Provence-Alpes-Cote d'Azur", "Pays de
# la Loire", ...]`. That is the defect encode_regions.py exists to prevent, one
# field over: a founder who answers "France" fails a rule that admits them, and
# the fund is dropped from their brief as conclusively blocked.
#
# The test is not "is this a country we know" — Russia and Belarus appear in
# real exclusion lists and are outside the European scope file, so requiring
# resolution would delete correct rules. The test is the precise one: does this
# value name an area INSIDE a country? The NUTS reference is the single source
# `encode_regions.py` already resolves against, so the two passes cannot
# disagree about what a region is.
COUNTRY_FIELDS = ("entityCountries", "activityCountries")
from nuts_regions import norm as _region_key, subnational_names  # noqa: E402

SUBNATIONAL = subnational_names()

# ── ...and it must be OUR name for that country ──────────────────────────────
# `entityCountries` and `activityCountries` have no entry in ENUM_VALUES,
# because their vocabulary is "the countries of Europe" rather than a short
# hand-written list. The consequence was a hole, not a convenience: the
# out-of-vocabulary guard below is written `if vocab and ...`, so for exactly
# these two fields it never ran and ANY string was stored as a live comparator.
#
# Measured against Postgres 2026-08-08: 9 encoded rules use a positive operator
# on a country field with a value no founder can answer. `SATR Gb Equity`
# carries entityCountries in ["East Midlands", "Eastern", "London", ...] -- the
# English regions of its scheme, in a field whose answers are countries. A
# British founder answers "United Kingdom", matches nothing, and the fund is
# hidden from precisely the population it was written for. Others read
# in ["EEA"], in ["European Union"], in ["Europe"], in ["Sub-Saharan Africa"],
# and in ["Slovak Republic"] -- a true rule that failed only because the name
# map had the country under "Slovakia".
#
# THE PROPERTY (not a list of the five strings that happened to break):
#   A value stored under a country-typed field must NAME A COUNTRY the corpus
#   recognises, and must be stored under the corpus's own name for it.
#
# The test for a value nobody has seen is `europe_scope.name_to_iso2`, which is
# the same resolver every extractor already uses, reading reference/europe_scope.json
# -- so the vocabulary is read, never restated, and check_country_gates.ts holds
# the published corpus to the same file.
#
# DIRECTION MATTERS, and the asymmetry is deliberate:
#   positive (in / equals) — an unresolvable value can never be satisfied, so
#       the rule silently hides the fund. Drop the value; drop the whole spec
#       if that empties it. No rule beats an unsatisfiable one.
#   negative (not_in)      — "not_in ['Russia']" excludes a real place that is
#       simply outside our founder population. Inert, but TRUE, and rewriting
#       the fund's own rule to make our bookkeeping tidy would be worse than
#       carrying a clause that never fires. Left exactly as stated.
def canonical_country_values(op: str, values: list[str]) -> tuple[list[str], list[str]]:
    """Resolve each value to the corpus's own country name.

    Returns (kept, dropped). For a negative operator nothing is ever dropped;
    resolvable values are still canonicalised so a founder's answer can match.
    """
    from europe_scope import COUNTRY_NAMES, name_to_iso2

    kept: list[str] = []
    dropped: list[str] = []
    for v in values:
        iso = name_to_iso2(v)
        if iso and iso in COUNTRY_NAMES:
            name = COUNTRY_NAMES[iso]
            if name not in kept:
                kept.append(name)
        elif op == "not_in":
            if v not in kept:
                kept.append(v)          # true exclusion of an out-of-scope place
        else:
            dropped.append(v)           # unsatisfiable under a positive operator
    return kept, dropped

# The founder attributes we actually collect (EligibilityAnswers in types.ts).
# 'none' is a first-class answer: most gates that look like filters turn out to
# be decidable by nothing the founder can tell us.
# The founder attributes a rule may be keyed to -- READ from the generated
# vocabulary, never restated. This was a hand-written list, and there were
# three of them (here, classify_gates_bulk.py, extract_terms.py). They had
# already drifted: the other two still lacked sector, exclusionFlags,
# activities and useOfFunds months after those fields were added, so two of the
# three extraction passes were hunting for a smaller world than the encoder
# could store.
#
# The list now excludes `unreachable` fields BY CONSTRUCTION, which is the
# point. A rule keyed to a question nobody is asked is inert: the evaluator
# looks up answers[spec.field], finds undefined, and returns null for every
# founder forever. It cannot pass, cannot fail, and cannot rank anything --
# and it looks exactly like a rule quietly agreeing with everyone. Two fields
# were in that state when this was written (activityCountries, foundedYear:
# 103 comparators on 95 instruments), and paying a model to produce more of
# them is the waste this closes.
#
# 'none' stays a first-class answer: most gates that look like filters turn out
# to be decidable by nothing the founder can tell us, and saying so is a real
# result rather than a failure to encode.
FIELDS = list(ENCODABLE_FIELDS)

#: Fields a rule may NOT be keyed to, with the reason, for the refusal message.
UNREACHABLE_FIELDS = {f for f, via in FIELD_REACH.items() if via == "unreachable"}


def refuse_unreachable(field: str, gid: int, what: str) -> bool:
    """True when `field` is one nothing can answer, with a printed reason.

    Enforced at BOTH writes -- triage, which chooses the field, and encode,
    which builds the comparator -- because the model picks the field at triage
    and the encoder trusts it. Stating the allowed set in a prompt is not
    enforcing it; that lesson is already written twice above this line.
    """
    if field in UNREACHABLE_FIELDS:
        print(f"    refused {what} on gate {gid}: nothing in the intake answers "
              f"`{field}`, so the rule could never be evaluated")
        return True
    return False


# ── ...and a region rule belongs to the pass that can write one ──────────────
# The country guard above stops a REGION reaching a country field. This is its
# mirror, and it was open until a Swedish rule went through it: "Applicant must
# be a Swedish company" was resolved to `region` and encoded as
# `{"op":"in","field":"region","allowed":["Sweden"]}`. A founder answers region
# as a NUTS code ("SE11"), `matchesAny` compares strings, and the rule is
# unsatisfiable — the fund is hidden from exactly the founders it admits.
#
# The defect is not that one value; it is structural, and that is why this is a
# refusal rather than a repair. `region` is evaluable through ONE operator:
# `region_within` in comparator.ts, the only branch that calls `regionsOverlap`
# and so the only one that understands a hierarchy of codes. That operator is
# not in ENCODE_SCHEMA's enum. **This encoder therefore cannot emit an
# evaluable region spec at all** — every region spec it writes is inert by
# construction, whatever the model returns and however correct the requirement.
#
# THE PROPERTY:
#   A comparator may only be written by a pass that can express the field's
#   evaluable operator. `region` is owned by encode_regions.py, which resolves
#   names onto the official classification and emits `region_within`.
#
# The emittable set is READ from ENCODE_SCHEMA rather than restated, so adding
# `region_within` to the schema is all it takes to lift the refusal — the two
# cannot drift into disagreeing about what this encoder can say.

#: Field -> the operator that makes it evaluable, where exactly one does.
SINGLE_OPERATOR_FIELDS = {"region": "region_within"}


def emittable_ops(schema: dict | None = None) -> frozenset[str]:
    """The operators an encoder's output schema permits the model to return.

    Takes the schema so the OTHER model-driven encoders can be held to the same
    property against their own enums — verify_encodings.py and
    reextract_dropped.py both take `field` from the model and both had no
    guard, which is one orphan per encoder rather than one for the repo.
    """
    s = ENCODE_SCHEMA if schema is None else schema
    return frozenset(s["properties"]["results"]["items"]["properties"]["op"]["enum"])


def refuse_unemittable(field: str, gid: int, what: str,
                       ops: frozenset[str] | None = None) -> bool:
    """True when `field` needs an operator this encoder cannot emit."""
    op = SINGLE_OPERATOR_FIELDS.get(field)
    if op and op not in (emittable_ops() if ops is None else ops):
        print(f"    refused {what} on gate {gid}: `{field}` is only evaluable "
              f"through `{op}`, which this encoder cannot emit — encode_regions.py "
              f"owns it")
        return True
    return False


# ── ...and a requirement may not be a gap in our own vocabulary ─────────────
# THE PROPERTY:
#   A positive comparator may not REQUIRE a value that means "a real member of
#   this category our list does not name".
#
# `sector` has eleven values and `other` is "Something else". Requiring it says
# the fund admits exactly those applicants our own list failed to place — a
# fact about types.ts, not about the fund. Five gates said it when this was
# written: two ADEME forestry schemes ("Applicant must be active in forestry,
# forest exploitation or sawing"), an Estonian tourism-software scheme, and two
# Estonian creative-economy schemes. Between them they deleted 26 companies
# from funds the award register says those companies won, four of them agrifood
# companies cut from a forestry scheme by a taxonomy whose `agrifood` label
# reads "Agritech, food or forestry".
#
# The test for a value nobody has seen is the declaration itself
# (`unnamedResidual` on the option, projected into data/vocabularies.json), so
# a residual added to any future enumeration is refused with no edit here. The
# direction is asymmetric for the same reason it is on country values:
#   positive (in / equals) — refuse. There is no sentence a funder can write
#       that this encodes correctly.
#   negative (not_in)      — allowed and meaningful. "not the ones we could not
#       place" is a real, if weak, restriction, and rewriting a fund's own rule
#       to tidy our bookkeeping is the worse error.
#
# WHAT THE ENCODER SHOULD DO INSTEAD, and it is the answer to the general
# question this defect poses: when a fund's stated purpose is NARROWER than any
# value the taxonomy holds, `skip`. Not the nearest value, not the catch-all,
# and not a widened allow-list — a widened list is still a conclusive claim,
# and `sector` is STRUCTURAL, so one false verdict deletes the fund outright.
# The purpose is not lost by skipping: it is what `instrument_profiles` embeds
# and what the ranker already orders on. A theme belongs to the ranker, which
# DEMOTES, not to the screen, which DELETES.
def refuse_unnamed_residual(field: str, op: str, values: list[str], gid: int) -> bool:
    """True when a positive comparator requires a residual value."""
    if op not in ("in", "equals"):
        return False
    residuals = set(UNNAMED_RESIDUALS.get(field, ()))
    hit = [v for v in values if v in residuals]
    if not hit:
        return False
    print(f"    refused encoding on gate {gid}: `{field} {op} {values}` requires "
          f"{hit}, which means 'an industry this list does not name'. A rule "
          f"stated in a vocabulary narrower than ours is skipped, never "
          f"approximated")
    return True


# ── ...and a rule about the PROJECT is not decided by a fact about the FIRM ──
# THE PROPERTY:
#   A rule may only be encoded against a field whose answer is about the same
#   subject the rule constrains.
#
# THE TEST, for a rule nobody has seen:
#   Take two applicants IDENTICAL in the attribute the field names. If the rule
#   can separate them, the field does not decide the rule.
#
# Two `software_data_ai` companies, one submitting an urban-mobility project
# and one not: EIT Urban Mobility's "the applicant's proposed innovations must
# target the urban mobility market" separates them and `sector` does not. The
# funder's own page enumerates energy, space tech, data/AI and health companies
# as eligible mobility verticals, so the comparator rejects four of the
# verticals it was written to attract.
#
# This is enforced here as far as it can be — the encoder is told the property
# and its test in ENCODE_PROMPT, and a subject label, where one exists, is
# checked mechanically by check_gate_subject.py against FIELD_SUBJECT. Stating
# it in a prompt is not enforcing it; that lesson is written twice above this
# line, and it is why the assertion lives in the checker as well.
def subject_of(field: str) -> str | None:
    return FIELD_SUBJECT.get(field)


def connect() -> sqlite3.Connection:
    return sqlite3.connect(DB)


def client() -> anthropic.Anthropic:
    return anthropic.Anthropic()


def extract_json(text: str) -> dict:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return json.loads(text[text.find("{") : text.rfind("}") + 1])


def tier_clause(include_classified: bool) -> tuple[str, tuple]:
    if include_classified:
        return "1=1", ()
    return f"verification_level IN ({','.join('?' * len(CITED_OR_BETTER))})", CITED_OR_BETTER


# ── status ──────────────────────────────────────────────────────────────────
def cmd_status(args) -> None:
    conn = connect()
    where, params = tier_clause(args.include_classified)
    q = lambda sql, p=(): conn.execute(sql, p).fetchone()[0]  # noqa: E731
    total = q(f"SELECT COUNT(*) FROM eligibility_gates WHERE {where}", params)
    triaged = q(f"SELECT COUNT(*) FROM eligibility_gates WHERE {where} AND gate_role IS NOT NULL", params)
    filters = q(f"SELECT COUNT(*) FROM eligibility_gates WHERE {where} AND gate_role='filter'", params)
    decidable = q(f"SELECT COUNT(*) FROM eligibility_gates WHERE {where} AND gate_role='filter' "
                  f"AND intake_field_resolved NOT IN ('none','')", params)
    encoded = q(f"SELECT COUNT(*) FROM eligibility_gates WHERE {where} AND value_spec IS NOT NULL", params)
    print(f"gates in scope:        {total:,}")
    print(f"  triaged:             {triaged:,}")
    print(f"  of which filters:    {filters:,}")
    print(f"  filters w/ a field:  {decidable:,}   <- the encodable set")
    print(f"  encoded (value_spec):{encoded:,}")
    if triaged:
        print("\nby role:")
        for role, n in conn.execute(
            f"SELECT gate_role, COUNT(*) FROM eligibility_gates WHERE {where} AND gate_role IS NOT NULL "
            f"GROUP BY 1 ORDER BY 2 DESC", params):
            print(f"  {role:16} {n:5,}  {100*n/triaged:5.1f}%")

    # What the founder actually experiences: how many funds we can say anything
    # verified about. Reported here because the numbers above are gate-level and
    # look healthy while more than half of instruments carry no machine-readable
    # rule at all — a gap invisible from "97% triaged".
    verified = q("SELECT COUNT(DISTINCT instrument_id) FROM eligibility_gates "
                 "WHERE value_spec IS NOT NULL")
    instruments = q("SELECT COUNT(*) FROM funding_instruments WHERE is_framework = 0")
    print(f"\ninstrument coverage:  {verified:,} of {instruments:,} carry at least one "
          f"encoded rule ({100*verified/max(1,instruments):.0f}%)")

    if not args.include_classified:
        out_of_scope = q("SELECT COUNT(*) FROM eligibility_gates "
                         "WHERE verification_level = 'llm_classified'")
        print(f"\nexcluded from scope:  {out_of_scope:,} llm_classified gates")
        print("  This exclusion is DELIBERATE and should stay. Those gates are model")
        print("  inference, not extracted rules -- their own text says so: 'LIKELY")
        print("  SME-scaled eligibility', 'scheme TYPICALLY targets SMEs', 'grant")
        print("  LIKELY requires co-financing'. Encoding a guess as a hard filter")
        print("  would block founders who actually qualify, which is the worst")
        print("  failure this product has: a thin brief is honest, a false block is")
        print("  invisible and wrong. They are why 155 instruments show no verified")
        print("  rule; the brief labels those rows 'not yet verified' rather than")
        print("  pretending. Closing the gap means better SOURCES, not --include-classified.")
    conn.close()


# ── triage ──────────────────────────────────────────────────────────────────
TRIAGE_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {"results": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "properties": {
            "id": {"type": "integer"},
            "role": {"type": "string", "enum": ROLES},
            "field": {"type": "string", "enum": FIELDS},
        },
        "required": ["id", "role", "field"]}}},
    "required": ["results"],
}

TRIAGE_PROMPT = """You are auditing an eligibility-rules database that tells European startups \
which public funds they qualify for. Accuracy matters more than generosity: a wrong \
"you qualify" costs a founder months.

For each rule, output TWO judgements.

1. role — what the rule actually IS:
   - filter: a testable condition on the COMPANY or its PROJECT. Could decide whether
     this applicant qualifies. ("Applicant must be an SME", "Minimum TRL 4",
     "must be established in Spain", "consortium of 3+ partners from 3+ countries")
   - obligation: binds the beneficiary AFTER an award, or governs how money is used
     and reported. Does not decide who may apply. ("works must not start before the
     grant decision", "costs must be net of VAT", "no cumulation with de minimis")
   - programme_fact: a fact about the FUND itself — funding rate, budget ceiling,
     call window, instrument type. Says nothing about this applicant.
     ("support is provided as non-dilutive grants", "aid intensity capped at 20%",
     "HTGF can invest up to EUR 30 million")
   - vague: too hedged or generic to test ("typical range", "game-changing innovators").

2. field — ONLY IF role is 'filter': which founder-supplied attribute decides it.
   Use 'none' when the condition is real but no attribute in the list could decide it
   (e.g. it depends on the technology domain, IP position, or a specific TRL number
   we do not collect). For every non-filter role, field MUST be 'none'.

Available attributes:
  ticketBand            how much money they want
  borrowerModel         who ends up owing (operating company / lender / originator / fund manager)
  entityCountries       where a legal entity exists
  wouldOpenEntity       willing to incorporate somewhere new
  organisationType      the CONSTITUTIONAL KIND of the applicant entity, one
                        of: company, sole_trader, research_org, public_body,
                        nonprofit. Use it when the rule turns on WHAT KIND OF
                        BODY may apply.
                        NOT A SIZE QUESTION. "must be an SME", "not a large
                        enterprise", "fewer than 250 employees" are fteBand or
                        turnoverBand rules, however the sentence is worded --
                        an SME and a large enterprise are the same kind of
                        body at two sizes. TEST: if two applicants of the same
                        kind could sit on opposite sides of the rule by
                        differing only in headcount, turnover, age, place or
                        sector, it is NOT this field.
                        A rule that admits a legal person "not carrying out an
                        economic activity" is an organisationType rule
                        admitting research_org, public_body and nonprofit --
                        trading is a status an entity starts and stops, so it
                        is never an option on its own.
  fteBand               headcount band
  turnoverBand          revenue band
  balanceBand           balance-sheet total band
  ownerOver25           any owner holding 25%+
  institutionalOwner    a corporate or fund on the cap table
  nonEuControl          controlled from outside the EU
  cofinancingBand       share of project cost they can self-fund
  foundedYear           year incorporated
  lossesOverHalfCapital undertaking-in-difficulty proxy
  conditionality        appetite for local entity / geographic / state-shareholder / job commitments
  developmentStage      research / prototype / pilot_customers / scaling_revenue
  activityCountries     where the funded work will physically happen
  consortium            able to run a 3+ partner consortium
  bankRelationship      a bank that would lend if guaranteed
  institutionalBacking  VC/institutional investors aboard
  needBy                how soon the money is needed
  sector                what the company BUILDS: software_data_ai,
                        health_life_sciences, energy_cleantech,
                        industrial_manufacturing, semiconductors_electronics,
                        mobility_transport, agrifood, materials_chemicals,
                        space, defense_security, other. Use this only for rules
                        about the FIELD a company works in.
  useOfFunds            what the money would be SPENT ON, multi-select:
                        industrial_research (research before there is a
                        product), experimental_development (building or
                        prototyping it), feasibility_study, rd_facilities
                        (R&D equipment or lab space), ip_protection,
                        production_capex (manufacturing or production
                        capacity), market_launch (commercialisation, scaling
                        sales), working_capital (general operations). Use this
                        for every "eligible costs" clause -- GBER Art. 25
                        splits research from development from feasibility, and
                        Art. 14/17 covers investment in capacity. A rule saying
                        funds may not cover general operating costs is
                        not_in [working_capital], NOT a developmentStage rule:
                        what a company IS and what the money BUYS are different
                        questions.
  activities            the regulated categories aid law names, multi-select:
                        financial_services (the company itself lends, banks,
                        insures or processes payments - NOT software sold to
                        banks), primary_agriculture, fisheries_aquaculture,
                        road_freight, real_estate, gambling_betting, tobacco,
                        alcohol, weapons, or none. Most GBER and de minimis
                        exclusion lists are written in exactly these terms, so
                        encode them here, not against sector. Encode each
                        exclusion against ONLY what it NAMES - a rule excluding
                        tobacco must not also exclude fintech, and vice versa.
  exclusionFlags        standard exclusion situations, multi-select: none apply /
                        insolvency / accumulated losses over half share capital /
                        unpaid state-aid recovery order / EU sanctions or exclusion
                        decision / overdue tax or social-security debt

Be strict. Most rules that mention money amounts are programme_facts about the fund's
budget, not filters on the applicant. Return ONLY the JSON object."""


def cmd_triage(args) -> None:
    conn = connect()
    where, params = tier_clause(args.include_classified)
    extra = "" if args.rebuild else " AND gate_role IS NULL"
    # Same exemption as encode and retriage: this UPDATE writes
    # encoding_method='llm_triage', so an unguarded --rebuild erases every
    # withdrawal record in the corpus and the encoder's exclusion then sees
    # nothing to exclude. The default pass is already safe (a quarantined gate
    # has a gate_role); --rebuild was not.
    extra += " AND (encoding_method IS NULL OR encoding_method != 'quarantined')"
    rows = conn.execute(
        f"""SELECT id, gate_family, intake_field, requirement, value
            FROM eligibility_gates WHERE {where}{extra}
            ORDER BY instrument_id, gate_key""", params).fetchall()
    if args.limit:
        rows = rows[: args.limit]
    print(f"triaging {len(rows):,} gates ({MODEL})")
    if not rows:
        return

    cl = client()
    done = 0
    for i in range(0, len(rows), TRIAGE_CHUNK):
        chunk = rows[i : i + TRIAGE_CHUNK]
        listing = "\n\n".join(
            f"id: {r[0]}\nfamily: {r[1]}\nrequirement: {r[3][:400]}\n"
            f"extracted_value: {r[4] or '(none)'}" for r in chunk)
        res = cl.messages.create(
            model=MODEL, max_tokens=4000, thinking={"type": "disabled"},
            output_config={"format": {"type": "json_schema", "schema": TRIAGE_SCHEMA}},
            messages=[{"role": "user", "content": TRIAGE_PROMPT + "\n\n" + listing}])
        text = "".join(b.text for b in res.content if b.type == "text")
        for r in extract_json(text)["results"]:
            role = r["role"]
            field = r["field"] if role == "filter" else "none"
            # The model chose this field. A rule filed under something nothing
            # answers is not a filter in any useful sense -- it is a fact we
            # cannot test -- so it is re-filed to 'none' rather than stored as
            # a filter the encoder will then be asked to pay for.
            if refuse_unreachable(field, r["id"], f"triage to `{field}`"):
                field = "none"
            conn.execute(
                """UPDATE eligibility_gates
                   SET gate_role=?, intake_field_resolved=?, encoding_method='llm_triage'
                   WHERE id=?""", (role, field, r["id"]))
        conn.commit()  # per-chunk — kill-safe
        done += len(chunk)
        print(f"  {done:,}/{len(rows):,}")
    conn.close()
    print("triage done.")


def cmd_retriage(args) -> None:
    """Re-judge filter gates the encoder could not turn into a comparator.

    A gate triaged `filter` and left without a value_spec is in limbo: the
    engine cannot decide it, and it counts against the instrument as an
    unevaluable rule. Two very different things end up there.

    Some are real conditions no comparator can settle -- "the applicant must
    genuinely aim for significant international growth". Those belong to the
    founder: they are what the assessor actually weighs, and the brief now
    shows them (judgementCriteria in shortlist.ts).

    The rest are programme facts wearing a filter's clothes -- "aid intensity
    depends on the size of the organisation", "state aid rules apply only to
    organisations carrying out economic activities". True, cited, and nothing
    a founder is assessed on. Surfacing those as assessment criteria is how a
    Swedish founder's Vinnova row led with two sentences about how state aid
    works instead of the one that mattered, its co-financing expectation.

    The triage prompt already draws this line correctly and names aid intensity
    as a programme_fact; these predate it or were simply judged wrong. Same
    prompt, run again on the gates that landed in limbo.
    """
    conn = connect()
    # A WITHDRAWN GATE IS NOT IN LIMBO, IT IS DECIDED. "filter with no spec" is
    # also the exact shape of every quarantine, so without this clause the pass
    # re-judges 186 gates whose comparator was deliberately removed and stamps
    # encoding_method='llm_retriage' over the record that says so -- which is
    # how a withdrawal stops being visible to the encoder's own exclusion.
    rows = conn.execute(
        """SELECT id, gate_family, intake_field, requirement, value
             FROM eligibility_gates
            WHERE gate_role = 'filter'
              AND (value_spec IS NULL OR value_spec = '')
              AND (encoding_method IS NULL OR encoding_method != 'quarantined')
            ORDER BY instrument_id, gate_key""").fetchall()
    if args.limit:
        rows = rows[: args.limit]
    print(f"re-triaging {len(rows):,} unencodable filter gates ({MODEL})")
    if not rows:
        return

    cl = client()
    done = 0
    moved: dict[str, int] = {}
    for i in range(0, len(rows), TRIAGE_CHUNK):
        chunk = rows[i : i + TRIAGE_CHUNK]
        listing = "\n\n".join(
            f"id: {r[0]}\nfamily: {r[1]}\nrequirement: {r[3][:400]}\n"
            f"extracted_value: {r[4] or '(none)'}" for r in chunk)
        res = cl.messages.create(
            model=MODEL, max_tokens=4000, thinking={"type": "disabled"},
            output_config={"format": {"type": "json_schema", "schema": TRIAGE_SCHEMA}},
            messages=[{"role": "user", "content": TRIAGE_PROMPT + "\n\n" + listing}])
        text = "".join(b.text for b in res.content if b.type == "text")
        for r in extract_json(text)["results"]:
            role = r["role"]
            moved[role] = moved.get(role, 0) + 1
            field = r["field"] if role == "filter" else "none"
            conn.execute(
                """UPDATE eligibility_gates
                      SET gate_role=?, intake_field_resolved=?,
                          encoding_method='llm_retriage'
                    WHERE id=?""", (role, field, r["id"]))
        conn.commit()
        done += len(chunk)
        print(f"  {done:,}/{len(rows):,}")
    conn.close()
    print("retriage done: " + ", ".join(f"{k}={v}" for k, v in sorted(moved.items(), key=lambda kv: -kv[1])))


# ── encode ──────────────────────────────────────────────────────────────────
ENCODE_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {"results": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "properties": {
            "id": {"type": "integer"},
            "op": {"type": "string", "enum": [
                "band_max", "band_min", "in", "not_in", "equals",
                "boolean_true", "boolean_false", "numeric_gte", "numeric_lte", "skip"]},
            "values": {"type": "array", "items": {"type": "string"}},
            "threshold": {"type": "number"},
            # ── The currency step ──────────────────────────────────────────
            # The band scales are EURO. `TICKET_BANDS` is labelled "EUR 100K -
            # EUR 500K"; turnoverBand and balanceBand carry the euro thresholds
            # of the SME definition. The funder writes the rule in the funder's
            # own money. Until 2026-08-19 nothing between the two, and
            # "maksimalt 500 000 kroner" -- EUR 46k -- was stored as a EUR 500k
            # ceiling.
            #
            # The model READS the unit off the sentence and returns it. The
            # model does NOT do the arithmetic: `amount` and `currency` go to
            # euro_money.stable_band, which converts at a pinned ECB rate and
            # refuses outright if the band would depend on which rate. Reading
            # a unit out of Norwegian prose is a language task; multiplying is
            # not, and a model that does both silently does the second badly.
            "currency": {"type": "string"},
            "amount": {"type": "number"},
        },
        "required": ["id", "op", "values"]}}},
    "required": ["results"],
}

ENCODE_PROMPT = """Encode each eligibility rule as a comparator the product can evaluate \
against a founder's answer. The field each rule is decided by is given; use it.

Operators:
  band_max      the founder's band must be AT OR BELOW a ceiling. values=[highest allowed band]
                e.g. "must be an SME" on fteBand -> band_max ["50-249"]
  band_min      the founder's band must be AT OR ABOVE a floor. values=[lowest allowed band]
  in            the answer must be one of these. values=[allowed...]
  not_in        the answer must NOT be one of these. values=[excluded...]
  equals        the answer must equal exactly one value. values=[the value]
  boolean_true  a yes/no field that must be "yes". values=[]
  boolean_false a yes/no field that must be "no". values=[]
  numeric_gte   numeric field at or above threshold. set "threshold".
  numeric_lte   numeric field at or below threshold. set "threshold".
  skip          the rule cannot be faithfully encoded against this field. values=[]

Use the EXACT band/enum vocabulary given for the field — never invent a value.
For country fields, values are full English country names ("Germany", "Spain").

MONEY: the ticketBand, turnoverBand and balanceBand scales are denominated in
EUROS. If the rule states an amount, return "currency" as its ISO 4217 code
exactly as the funder wrote it — "EUR" for euro, "NOK" for kroner, "SEK" for
kronor, "HUF" for forint, whatever the sentence says — and "amount" as the bound
itself in that currency, unrounded and unconverted. DO NOT convert it yourself
and DO NOT pick the band you think it lands in: return the number the funder
wrote and the code will convert it at a pinned rate. "maksimalt 500 000 kroner"
is currency NOK, amount 500000. If the rule states no amount, omit both.

CRITICAL — encode only RESTRICTIONS, never PERMISSIONS. These two read alike and
mean opposite things. Auditing the first pass against real recipients caught this
as the single biggest source of wrong verdicts:

  * "Entities established in Ukraine are eligible to participate under equivalent
    conditions" EXTENDS eligibility to Ukraine. It does NOT mean applicants must be
    Ukrainian. Encoding it as in["Ukraine"] wrongly excluded every actual recipient
    of that fund. -> skip
  * "Switzerland may participate on equivalent terms" -> skip. Additive.
  * "Poland requires organisations to be registered in Poland to receive national
    top-up funding" constrains ONE national sub-stream, not the instrument. -> skip

Likewise skip anything scoped to PART of a programme rather than the whole of it.
A rule that binds one call, topic, window or sub-track cannot decide whether an
applicant may approach the instrument at all, and presenting it as the single
obstacle sends a founder to fix something that is not broken:
  * "For a specific quantum navigation CSA topic, proposals must be submitted by a
    single legal entity" -> skip. One topic, not the programme.
  * "For the MARITIME topic, at least 60% of hydrogen must go to maritime
    off-takers" -> skip.
  * "For Large Scale Projects, a minimum percentage must be allocated to..." -> skip.
Signals to watch for: "for a specific...", "for certain...", "for the X topic",
"under this call", "in the second window". If the rule only bites inside part of
the programme, skip it.
  * "Applicant must be registered in Spain" IS a restriction. -> in["Spain"]
  * "Legal entities established in Russia and Belarus are not eligible"
    IS a restriction. -> not_in["Russia","Belarus"]

`consortium` means CAN THE APPLICANT FORM ONE, not "will they". A company that
could run a consortium can obviously also apply alone, so a rule requiring a
SOLO applicant excludes nobody on this field and must be skipped. Only encode
the direction that genuinely restricts:
  * "Consortium of 3+ partners from 3+ countries required" -> in["yes"]
  * "The project must be submitted by a single applicant, non-collaborative"
    -> skip. Encoding this as in["no"] wrongly hid the fund from every founder
    who said they COULD collaborate.

If a rule names an OPEN-ENDED or long membership set you cannot enumerate in full
("EU Member States or Associated Countries", "EuroHPC Participating States",
"digital tech, industrial tech, life sciences, chemistry OR RELATED BUSINESS
AREAS"), `skip` it. A partial list becomes a wrongful exclusion of everyone you
omitted.

CRITICAL — A RULE ABOUT THE PROJECT IS NOT DECIDED BY A FACT ABOUT THE COMPANY.
Every field is about one of two subjects. `sector`, `organisationType`,
`entityCountries`, `region`, the size and ownership bands, `activities` and
`exclusionFlags` are about the APPLICANT: what it is, where it is, what it has
done. `useOfFunds`, `developmentStage`, `consortium`, `cofinancingBand`,
`ticketBand`, `activityCountries` and `conditionality` are about the PROJECT.

A rule constraining the project may not be encoded against an applicant field.

  THE TEST: take two applicants IDENTICAL in the attribute the field names. If
  the rule can separate them, that field does not decide the rule -> skip.

  * "The applicant's proposed innovations must target the urban mobility
    market" -> two software companies, one with a mobility project and one
    without, sit on opposite sides. `sector` cannot decide it. -> skip
  * "Projects must fall within one of three defined themes" -> the theme is the
    project's. -> skip
  * "Submissions must fit at least one of the listed technology domains" ->
    the submission's. -> skip
  * "At least one consortium member must be an energy-intensive industrial
    company" -> a rule about the CONSORTIUM, and the coordinator may be
    anything. -> skip
  * "The company must be registered in Spain" -> two identically-registered
    applicants cannot differ on it. `entityCountries` decides it. -> in["Spain"]

Watch the sentence's own subject: "the project must...", "the solution must...",
"submissions must...", "proposed innovations must...", "at least one partner
must..." are all project-side. "The applicant must be...", "the company must
have..." are applicant-side — but only when what follows names an attribute of
the firm rather than of its work.

AND NEVER APPROXIMATE ONTO A CATCH-ALL. `sector` has eleven values and `other`
means "an industry this list does not name". When a fund's stated purpose is
narrower than any value the list holds — "a tourism service provider", "active
in forestry, forest exploitation or sawing", "an independent fuel-distribution
station (NAF 47.30Z)" — the honest output is `skip`. Not the nearest value, not
`other`, and not a widened allow-list: a widened list is still a conclusive
claim, and `sector` is structural, so one false verdict deletes the fund from a
founder entirely. Nothing is lost by skipping; a fund's purpose is already
carried by the semantic ranker, which DEMOTES, where the gate screen DELETES.

Prefer `skip` over a lossy encoding. A wrong comparator produces a confident wrong
verdict, which is far worse than no verdict — and for a country rule it hides a
fund the founder actually qualifies for. Return ONLY the JSON object."""


def cmd_encode(args) -> None:
    conn = connect()
    where, params = tier_clause(args.include_classified)
    # ── A WITHDRAWN COMPARATOR IS NOT A MISSING ONE ────────────────────────
    # This clause is unconditional, and it is the only thing that makes a
    # correction survive a pipeline pass. It used to live inside the --fresh
    # branch below, where it protected nothing: a quarantined gate has
    # value_spec NULL BY DEFINITION, so the default pass -- the one
    # `make eligibility` actually runs -- selected every quarantine in the
    # corpus and paid a model to invent the comparator that had just been
    # deliberately withdrawn. Measured 2026-08-19: 159 of the 186 quarantined
    # gates were in the default pass's working set, and it silently reverted
    # 22 rows across four hand-verified correction sets, the oldest six days
    # old. `--rebuild` was worse still: it cleared every spec first, so the
    # exclusion could not even be expressed.
    #
    # The property, stated so it holds for a gate nobody has seen yet: a gate
    # whose comparator was withdrawn by a decision outside this encoder must
    # not be handed back to this encoder, whatever flags it is run with. The
    # withdrawal is recorded as encoding_method='quarantined' and its test is
    # `check_corrections_applied.py`, which re-derives the population from the
    # evidence directory rather than naming a gate.
    not_withdrawn = (" AND (encoding_method IS NULL OR"
                     " encoding_method != 'quarantined')")
    if args.rebuild:
        # Clear first. Without this, a gate the re-run now (correctly) refuses
        # to encode keeps its previous, wrong spec — so a rebuild could never
        # actually remove a bad encoding, only add to it. A withdrawn gate is
        # exempt: there is nothing to clear (its spec is already NULL) and
        # clearing would be the first half of re-encoding it.
        cleared = conn.execute(
            f"UPDATE eligibility_gates SET value_spec=NULL WHERE {where} "
            f"AND value_spec IS NOT NULL{not_withdrawn}", params).rowcount
        conn.commit()
        print(f"cleared {cleared:,} existing specs (--rebuild)")
    extra = "" if args.rebuild else " AND value_spec IS NULL"
    extra += not_withdrawn
    # A gate with value_spec NULL is not the same as a gate never tried: most
    # of them have been through the encoder, which looked at the requirement
    # and correctly refused ("certain sectors are excluded, including..." names
    # no comparable set). Re-running those bills for the same refusal. --fresh
    # restricts the pass to gates triage has seen but encode never has, which
    # is the only set where new spend can produce new coverage.
    if getattr(args, "fresh", False):
        extra += " AND (encoding_method IS NULL OR encoding_method != 'llm_encode')"
    # Scoping a pass to one country is what lets a workstream encode the gates
    # it just cut without also paying for, and silently changing, every other
    # market's pending set in the middle of its own before/after measurement.
    scope, scope_params = "", ()
    if getattr(args, "country", None):
        scope = (" AND instrument_id IN (SELECT id FROM funding_instruments"
                 " WHERE country = ?)")
        scope_params = (args.country,)
    rows = conn.execute(
        f"""SELECT id, intake_field_resolved, requirement, value
            FROM eligibility_gates
            WHERE {where} AND gate_role='filter'
              AND intake_field_resolved NOT IN ('none',''){extra}{scope}
            ORDER BY instrument_id, gate_key""", params + scope_params).fetchall()
    if args.limit:
        rows = rows[: args.limit]
    print(f"encoding {len(rows):,} filter gates ({MODEL})")
    if not rows:
        return

    cl = client()
    done = skipped = 0
    fx_converted: set[int] = set()
    for i in range(0, len(rows), ENCODE_CHUNK):
        chunk = rows[i : i + ENCODE_CHUNK]
        parts = []
        for gid, field, req, val in chunk:
            vocab = ""
            if field in BAND_ORDERS:
                vocab = f"\nordered bands for {field}: {BAND_ORDERS[field]}"
            elif field in ENUM_VALUES:
                vocab = f"\nallowed values for {field}: {ENUM_VALUES[field]}"
            parts.append(f"id: {gid}\nfield: {field}{vocab}\n"
                         f"requirement: {req[:400]}\nextracted_value: {val or '(none)'}")
        res = cl.messages.create(
            model=MODEL, max_tokens=4000, thinking={"type": "disabled"},
            output_config={"format": {"type": "json_schema", "schema": ENCODE_SCHEMA}},
            messages=[{"role": "user", "content": ENCODE_PROMPT + "\n\n" + "\n\n".join(parts)}])
        text = "".join(b.text for b in res.content if b.type == "text")
        by_id = {r[0]: r[1] for r in chunk}
        for r in extract_json(text)["results"]:
            gid, op = r["id"], r["op"]
            if op == "skip" or gid not in by_id:
                skipped += 1
                continue
            field = by_id[gid]
            # Belt and braces with the triage refusal above: this pass can be
            # run over gates triaged before that guard existed, and the whole
            # point is that a comparator against an unanswerable field must
            # never reach the database.
            if refuse_unreachable(field, gid, "encoding"):
                skipped += 1
                continue
            # Refused HERE and not at triage, deliberately. `region` is the
            # right answer to "what decides this rule", and encode_regions.py
            # finds its candidates by requirement text, so re-filing it to
            # 'none' upstream would throw away a true label without helping
            # anyone. What must not happen is a spec: this encoder cannot emit
            # `region_within`, so anything it wrote here would be inert.
            if refuse_unemittable(field, gid, "encoding"):
                skipped += 1
                continue
            # A rule stated in a vocabulary narrower than ours must be skipped,
            # never approximated onto the catch-all. Checked here rather than
            # after `spec` is built so the refusal sees the model's own values
            # whichever operator it chose.
            if refuse_unnamed_residual(field, op, list(r.get("values") or []), gid):
                skipped += 1
                continue
            # A founder's answer for these fields is a LIST, so `equals` (a
            # strict string comparison in eligibility.ts) can never be true —
            # it would silently read "unknown" for everyone. The model reaches
            # for equals on single-country rules ("must be a Swedish startup"),
            # so coerce it deterministically rather than re-prompting.
            if op == "equals" and field in MULTI_VALUE_FIELDS:
                op = "in"
                r["values"] = r["values"][:1]
            # ── A numeric comparator needs a numeric answer ────────────────
            # comparator.ts's numeric_gte/numeric_lte both begin
            # `typeof answer === "number"`, and the only number in
            # EligibilityAnswers is `foundedYear`. Every field carrying a band
            # order or an enum is answered with a STRING, so a numeric op on
            # one evaluates to null for every founder alive -- not "fails", not
            # "passes", INERT, forever. All 46 numeric specs in the corpus on
            # 2026-08-19 are on such a field and not one of them has ever
            # decided anything.
            if op in ("numeric_gte", "numeric_lte") and (
                    field in BAND_ORDERS or field in ENUM_VALUES):
                print(f"    refused {op} on `{field}` for gate {gid}: its answer is a "
                      f"band/enum string and comparator.ts requires a number — the "
                      f"spec would be inert")
                skipped += 1
                continue

            # ── The currency step ─────────────────────────────────────────────
            # THE PROPERTY: a comparator on a euro-denominated scale may only be
            # derived from numerals denominated in euro, and a converted band is
            # admissible only if it is the same at every rate the currency has
            # held over the pinned ECB window. Otherwise the exchange rate is
            # deciding a hard eligibility verdict, and no rate is good enough.
            ccy = (r.get("currency") or "EUR").upper()
            if field in euro_scales() and ccy not in ("EUR", "", "NONE"):
                amount = r.get("amount")
                if amount is None:
                    print(f"    skipped gate {gid}: rule is in {ccy} and the bound "
                          f"was not returned, so it cannot be converted")
                    skipped += 1
                    continue
                if op not in ("band_max", "band_min"):
                    # A range in a foreign currency needs BOTH bounds converted
                    # and this schema carries one. Refuse rather than convert
                    # half of it and store the other half as written.
                    print(f"    skipped gate {gid}: `{op}` on a euro scale from a "
                          f"{ccy} amount needs every bound converted, not one")
                    skipped += 1
                    continue
                try:
                    band = stable_band(field, float(amount), ccy)
                except KeyError as e:
                    print(f"    skipped gate {gid}: {e}")
                    skipped += 1
                    continue
                if band is None:
                    print(f"    skipped gate {gid}: {amount:,.0f} {ccy} falls in "
                          f"different {field} bands across the pinned rate window — "
                          f"the exchange rate would be deciding the verdict")
                    skipped += 1
                    continue
                if r["values"] and r["values"][0] != band:
                    print(f"    gate {gid}: {amount:,.0f} {ccy} is `{band}` on {field}, "
                          f"not `{r['values'][0]}` as returned — converted")
                r["values"] = [band]
                fx_converted.add(gid)

            spec: dict = {"op": op, "field": field}
            if op in ("numeric_gte", "numeric_lte"):
                if r.get("threshold") is None:
                    skipped += 1
                    continue
                spec["threshold"] = r["threshold"]
            elif op in ("band_max", "band_min", "equals"):
                if not r["values"]:
                    skipped += 1
                    continue
                # Key names must match eligibility.ts's ValueSpec union exactly
                # — band_max reads `maxAllowed`, band_min reads `minAllowed`,
                # equals reads `value`. Emitting the wrong key produces a spec
                # the engine parses but silently evaluates to "unknown".
                #
                # The band list itself is NOT written into the spec. It used to
                # be, and a frozen copy can only go stale: rebanding ticketBand
                # turned all 33 of them inert in one commit, `indexOf` returning
                # -1 for a band the snapshot predated. comparator.ts reads the
                # live BAND_ORDERS, so the copy has no reader and one failure
                # mode. `order` is still validated against here — a banded op on
                # a field with no band order is dropped below.
                order = BAND_ORDERS.get(by_id[gid], [])
                if op == "band_max":
                    spec["maxAllowed"] = r["values"][0]
                elif op == "band_min":
                    spec["minAllowed"] = r["values"][0]
                else:
                    spec["value"] = r["values"][0]
                # A banded op against a field with no band order can never be
                # evaluated; drop it rather than store an inert spec.
                if op in ("band_max", "band_min") and not order:
                    skipped += 1
                    continue
            elif op in ("in", "not_in"):
                if not r["values"]:
                    skipped += 1
                    continue
                spec["allowed"] = r["values"]
            # Every emitted value must exist in the field's vocabulary. The
            # prompt states the allowed set, but stating is not enforcing: a
            # re-encode produced `activities not_in ['agrifood']`, borrowing a
            # SECTOR value for the activities field. Nothing downstream would
            # have noticed -- eligibility.ts compares strings, so the rule
            # simply never matches any founder and the gate silently stops
            # gating. Drop values the vocabulary does not contain, and drop the
            # whole spec if that empties it.
            # 'none' is the "nothing is wrong with me" sentinel on the
            # multi-select axes. Two shapes involving it are always mistakes,
            # and both were produced by a corrective re-encode pass:
            #   not_in ['none']  blocks exactly the founders for whom nothing
            #                    is wrong — an inversion, not a rule
            #   in ['none']      demands a clean sheet on EVERY flag, so an
            #                    unrelated tax arrear blocks an insolvency rule
            # A rule about insolvency must name insolvency.
            if field in ("exclusionFlags", "activities"):
                vals_now = r["values"]
                if (op == "not_in" and "none" in vals_now) or (op == "in" and vals_now == ["none"]):
                    print(f"    refused {op} {vals_now} on {field} for gate {gid}: "
                          f"name the specific flag, not the sentinel")
                    skipped += 1
                    continue

            # A country field carries no ENUM_VALUES entry, so the vocabulary
            # guard below skips it entirely. That is the hole COUNTRY_FIELDS
            # closes, and it takes TWO passes, in this order:
            #
            #   1. sub-national names are dropped whatever the operator. A
            #      region in a country field is a mis-encoding in both
            #      directions, and it belongs to encode_regions.py.
            #   2. what survives is resolved to the corpus's own country name,
            #      dropping anything a positive operator could never satisfy.
            #
            # Pass 1 must lead: canonical_country_values KEEPS an unresolvable
            # value under `not_in` as a true exclusion, which would let
            # "not_in ['Bretagne']" through as if it named a country.
            #
            # Both run before the spec is stored, so a spec emptied by either is
            # dropped rather than written.
            if field in COUNTRY_FIELDS and op in ("in", "not_in", "equals"):
                key = "allowed" if op in ("in", "not_in") else "value"
                vals = spec[key] if key == "allowed" else [spec[key]]
                national = [v for v in vals if _region_key(v) not in SUBNATIONAL]
                if len(national) != len(vals):
                    print(f"    gate {gid}: dropped sub-national values "
                          f"{sorted(set(vals) - set(national))} from {field} — a region "
                          f"rule belongs to encode_regions.py, not a country field")
                good, bad = canonical_country_values(op, national)
                if bad:
                    print(f"    dropped non-country {field} values {bad} on gate {gid}: "
                          f"a positive rule no founder answer can satisfy")
                if not good:
                    skipped += 1
                    continue
                if key == "allowed":
                    spec["allowed"] = good
                else:
                    spec["value"] = good[0]

            vocab = ENUM_VALUES.get(field)
            if vocab and op in ("in", "not_in", "equals"):
                key = "allowed" if op in ("in", "not_in") else "value"
                vals = spec[key] if key == "allowed" else [spec[key]]
                good = [v for v in vals if v in vocab]
                if len(good) != len(vals):
                    bad = sorted(set(vals) - set(good))
                    print(f"    dropped out-of-vocabulary {field} values {bad} on gate {gid}")
                if not good:
                    skipped += 1
                    continue
                if key == "allowed":
                    spec["allowed"] = good
                else:
                    spec["value"] = good[0]
            # A band that came THROUGH a currency conversion says so on the
            # row. `check_gate_currency.py` re-derives it rather than trusting
            # the label -- a mislabelled row still fails -- but the label is
            # what tells a reader why a Norwegian rule reading "500 000" is
            # stored as a EUR 25k-100k ceiling.
            method = "fx_converted" if gid in fx_converted else "llm_encode"
            conn.execute(
                "UPDATE eligibility_gates SET value_spec=?, encoding_method=? WHERE id=?",
                (json.dumps(spec, ensure_ascii=False), method, gid))
            done += 1
        conn.commit()
        print(f"  {min(i + ENCODE_CHUNK, len(rows)):,}/{len(rows):,}  encoded={done:,} skipped={skipped:,}")
    conn.close()
    print(f"encode done: {done:,} encoded, {skipped:,} skipped as unencodable.")


# ── repair-countries ────────────────────────────────────────────────────────
def cmd_repair_countries(args) -> None:
    """Apply the country-value property to specs that were written before it.

    Free -- no model calls. The rule is the same function the encoder now runs
    at write time, so there is one definition of what a country value may be
    and a repaired row and a fresh row cannot disagree.
    """
    conn = connect()
    rows = conn.execute(
        """SELECT id, intake_field_resolved, value_spec, substr(requirement,1,90)
             FROM eligibility_gates
            WHERE value_spec IS NOT NULL
              AND intake_field_resolved IN ('entityCountries','activityCountries')
            ORDER BY id""").fetchall()
    fixed = cleared = 0
    for gid, field, raw, req in rows:
        spec = json.loads(raw)
        op = spec.get("op")
        if op not in ("in", "not_in", "equals"):
            continue
        key = "allowed" if op in ("in", "not_in") else "value"
        vals = spec.get("allowed") if key == "allowed" else [spec.get("value")]
        vals = [v for v in (vals or []) if v]
        good, bad = canonical_country_values(op, vals)
        if good == vals and not bad:
            continue
        if not good:
            # Nothing survives: the rule was entirely about places that are not
            # countries. Quarantine rather than delete -- the requirement text
            # is still true and still shown, only the machine verdict stops.
            print(f"  gate {gid} {field} {op} {vals} -> QUARANTINED\n      {req}")
            if not args.dry_run:
                conn.execute(
                    """UPDATE eligibility_gates
                          SET value_spec=NULL, encoding_method='quarantined',
                              verify_note = COALESCE(verify_note || ' | ', '')
                                            || 'quarantined: country field held no country'
                        WHERE id=?""", (gid,))
            cleared += 1
            continue
        print(f"  gate {gid} {field} {op} {vals} -> {good}"
              + (f"  (dropped {bad})" if bad else ""))
        if key == "allowed":
            spec["allowed"] = good
        else:
            spec["value"] = good[0]
        if not args.dry_run:
            conn.execute("UPDATE eligibility_gates SET value_spec=? WHERE id=?",
                         (json.dumps(spec, ensure_ascii=False), gid))
        fixed += 1
    if not args.dry_run:
        conn.commit()
    print(f"\n{len(rows)} country-field specs read; {fixed} rewritten, "
          f"{cleared} quarantined" + (" [dry run]" if args.dry_run else ""))

    # SQLite is the authoring store and the product serves Postgres, so a repair
    # that stops here has changed nothing a founder can see. Scoped to the rows
    # this property owns -- country-typed comparators -- and NOT
    # migrate_to_postgres.py, which is a full truncate and reinsert that would
    # publish every other workstream's in-flight work alongside this one.
    if args.publish and not args.dry_run:
        dsn = os.environ.get("DATABASE_URL")
        if not dsn:
            raise SystemExit("DATABASE_URL not set (expected in repo-root .env.local)")
        import psycopg2
        # KEYED ON (instrument_id, gate_key), NEVER ON id. The two stores keep
        # independent surrogate keys -- SQLite's gates run 1..151,047 and
        # Postgres's 358,457..365,215 -- so an UPDATE ... WHERE id = ? silently
        # matches nothing, and would match the WRONG ROW if the ranges ever
        # overlapped. (instrument_id, gate_key) is the natural key both stores
        # share and the one their unique constraint is built on.
        out = conn.execute(
            """SELECT instrument_id, gate_key, value_spec, encoding_method, verify_note
                 FROM eligibility_gates
                WHERE intake_field_resolved IN ('entityCountries','activityCountries')
             """).fetchall()
        pg = psycopg2.connect(dsn)
        with pg, pg.cursor() as cur:
            cur.executemany(
                """UPDATE eligibility_gates
                      SET value_spec = %s, encoding_method = %s, verify_note = %s
                    WHERE instrument_id = %s AND gate_key = %s""",
                [(s, m, n, iid, gk) for iid, gk, s, m, n in out])
            touched = cur.rowcount
        pg.close()
        print(f"published {len(out)} country-field gates to Postgres "
              f"(last statement matched {touched})")
    conn.close()


# ── retract-unreachable ─────────────────────────────────────────────────────
def cmd_retract_unreachable(args) -> None:
    """Un-encode comparators keyed to a field nothing in the intake answers.

    Free -- no model calls. The set is computed from FIELD_REACH via the
    generated vocabulary, so this pass and the write-time refusal share one
    definition of what is answerable and cannot disagree about it.

    QUARANTINE, NEVER DELETE. The gate row, its requirement text, its quote and
    its locator all stay exactly as extracted -- they are what the fund's own
    document says and Rule Zero has not changed. Only the machine comparator
    goes, and it was returning null for every founder anyway, so nothing a
    founder sees moves. If the intake later gains the question, `encode` can
    write the spec back from text that never left.

    Also catches a field that is not an intake field in ANY state: the triage
    model invented `inExclusionConditions`, and a name nothing has ever
    answered is the same defect with a typo in front of it.
    """
    conn = connect()
    rows = conn.execute(
        """SELECT id, intake_field_resolved, value_spec, substr(requirement,1,80)
             FROM eligibility_gates
            WHERE value_spec IS NOT NULL AND value_spec <> ''
            ORDER BY id""").fetchall()
    known = set(FIELD_REACH)
    by_field: dict[str, int] = {}
    hit: list[tuple] = []
    for gid, resolved, raw, req in rows:
        try:
            spec = json.loads(raw)
        except json.JSONDecodeError:
            continue
        field = spec.get("field")
        # aid_intensity carries no field: statutory arithmetic, not a question.
        if not field:
            continue
        why = None
        if field not in known:
            why = f"`{field}` is not an intake field in any version of the product"
        elif FIELD_REACH.get(field) == "unreachable":
            why = f"nothing in the intake answers `{field}`"
        if not why:
            continue
        by_field[field] = by_field.get(field, 0) + 1
        hit.append((gid, field, why, req))
        print(f"  gate {gid} {field} {spec.get('op')} -> QUARANTINED ({why})\n      {req}")
        if not args.dry_run:
            conn.execute(
                """UPDATE eligibility_gates
                      SET value_spec=NULL, encoding_method='quarantined',
                          verify_note = COALESCE(verify_note || ' | ', '')
                                        || 'quarantined: no intake answer reaches this field'
                    WHERE id=?""", (gid,))
    if not args.dry_run:
        conn.commit()
    print(f"\n{len(rows)} encoded specs read; {len(hit)} quarantined"
          + (" [dry run]" if args.dry_run else ""))
    for f, n in sorted(by_field.items(), key=lambda kv: -kv[1]):
        print(f"  {f:24} {n:4}")

    # SQLite authors, Postgres serves. Scoped to the rows this property owns,
    # and never migrate_to_postgres.py, which truncates and reinserts and would
    # publish every other workstream's in-flight work alongside this one.
    # Keyed on (instrument_id, gate_key): the two stores keep independent
    # surrogate ids, so WHERE id = ? matches nothing at best.
    if args.publish and not args.dry_run and hit:
        dsn = os.environ.get("DATABASE_URL")
        if not dsn:
            raise SystemExit("DATABASE_URL not set (expected in repo-root .env.local)")
        import psycopg2
        ids = [h[0] for h in hit]
        qs = ",".join("?" * len(ids))
        out = conn.execute(
            f"""SELECT instrument_id, gate_key, value_spec, encoding_method, verify_note
                  FROM eligibility_gates WHERE id IN ({qs})""", ids).fetchall()
        pg = psycopg2.connect(dsn)
        with pg, pg.cursor() as cur:
            cur.executemany(
                """UPDATE eligibility_gates
                      SET value_spec = %s, encoding_method = %s, verify_note = %s
                    WHERE instrument_id = %s AND gate_key = %s""",
                [(s, m, n, iid, gk) for iid, gk, s, m, n in out])
        pg.close()
        print(f"published {len(out)} quarantined gates to Postgres")
    conn.close()


# ── report ──────────────────────────────────────────────────────────────────
def cmd_report(args) -> None:
    conn = connect()
    print("=== decidable gates per instrument (top 15 by euros) ===")
    for iid, name, eur, n_filter, n_spec in conn.execute(
        """SELECT fi.id, fi.name, fi.total_eur/1e6,
                  SUM(CASE WHEN g.gate_role='filter' THEN 1 ELSE 0 END),
                  SUM(CASE WHEN g.value_spec IS NOT NULL THEN 1 ELSE 0 END)
           FROM funding_instruments fi JOIN eligibility_gates g ON g.instrument_id=fi.id
           GROUP BY 1,2,3 ORDER BY fi.total_eur DESC LIMIT 15"""):
        print(f"  {name[:34]:36} EUR{eur:9,.0f}M  filters={n_filter:3}  encoded={n_spec:3}")
    print("\n=== encodable set by field ===")
    for field, n, enc in conn.execute(
        """SELECT intake_field_resolved, COUNT(*),
                  SUM(CASE WHEN value_spec IS NOT NULL THEN 1 ELSE 0 END)
           FROM eligibility_gates WHERE gate_role='filter'
             AND intake_field_resolved NOT IN ('none','')
           GROUP BY 1 ORDER BY 2 DESC"""):
        print(f"  {field:24} {n:5,} filters  {enc:5,} encoded")
    conn.close()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--include-classified", action="store_true",
                    help="also process the llm_classified tier (no quotes; off by default)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status").set_defaults(func=cmd_status)
    for name, fn in (("triage", cmd_triage), ("encode", cmd_encode),
                     ("retriage", cmd_retriage)):
        p = sub.add_parser(name)
        p.add_argument("--limit", type=int, default=0)
        p.add_argument("--rebuild", action="store_true")
        p.add_argument("--model", default="sonnet",
                       help="haiku | sonnet | a full model id")
        p.add_argument("--fresh", action="store_true",
                       help="only gates the encoder has never seen")
        p.add_argument("--country", default=None,
                       help="restrict the pass to one country's instruments")
        p.set_defaults(func=fn)
    rc = sub.add_parser("repair-countries")
    rc.add_argument("--dry-run", action="store_true")
    rc.add_argument("--publish", action="store_true",
                    help="mirror the repaired country specs into Postgres")
    rc.set_defaults(func=cmd_repair_countries)
    ru = sub.add_parser("retract-unreachable")
    ru.add_argument("--dry-run", action="store_true")
    ru.add_argument("--publish", action="store_true",
                    help="mirror the quarantined gates into Postgres")
    ru.set_defaults(func=cmd_retract_unreachable)
    sub.add_parser("report").set_defaults(func=cmd_report)
    args = ap.parse_args()
    global MODEL
    MODEL = MODELS.get(getattr(args, "model", "sonnet"), getattr(args, "model", MODEL))
    args.func(args)


if __name__ == "__main__":
    main()
