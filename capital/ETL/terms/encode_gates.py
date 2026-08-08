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
# --- end ETL path bootstrap ---

import argparse
import json
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

ROLES = ["filter", "obligation", "programme_fact", "vague"]

# The founder attributes we actually collect (EligibilityAnswers in types.ts).
# 'none' is a first-class answer: most gates that look like filters turn out to
# be decidable by nothing the founder can tell us.
FIELDS = [
    "ticketBand", "borrowerModel", "entityCountries", "wouldOpenEntity", "fteBand",
    "turnoverBand", "balanceBand", "ownerOver25", "institutionalOwner", "nonEuControl",
    "cofinancingBand", "foundedYear", "lossesOverHalfCapital", "conditionality",
    "developmentStage", "activityCountries", "consortium", "bankRelationship",
    "institutionalBacking", "needBy",
    # Added 2026-07-26 from propose_intake_fields.py: these two were the
    # highest-yield questions the intake was missing, measured against the 485
    # filters nothing we asked could decide.
    "sector", "exclusionFlags",
    # Split out of `sector` 2026-07-27: what a company BUILDS and what aid law
    # RESTRICTS are different questions, and merging them made a lending
    # fintech inherit exclusions written for tobacco.
    "activities",
    # Added 2026-07-27. 585 gates on 266 instruments turn on eligible costs and
    # 59 are hard filters, but with no field to resolve to they were forced onto
    # developmentStage (16), consortium (10) and cofinancingBand (9), and 12
    # landed on 'none' -- undecidable only because nobody was asked.
    "useOfFunds",
    "none",
]




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
    rows = conn.execute(
        """SELECT id, gate_family, intake_field, requirement, value
             FROM eligibility_gates
            WHERE gate_role = 'filter'
              AND (value_spec IS NULL OR value_spec = '')
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
("EU Member States or Associated Countries", "EuroHPC Participating States"),
`skip` it. A partial list becomes a wrongful exclusion of everyone you omitted.

Prefer `skip` over a lossy encoding. A wrong comparator produces a confident wrong
verdict, which is far worse than no verdict — and for a country rule it hides a
fund the founder actually qualifies for. Return ONLY the JSON object."""


def cmd_encode(args) -> None:
    conn = connect()
    where, params = tier_clause(args.include_classified)
    if args.rebuild:
        # Clear first. Without this, a gate the re-run now (correctly) refuses
        # to encode keeps its previous, wrong spec — so a rebuild could never
        # actually remove a bad encoding, only add to it.
        cleared = conn.execute(
            f"UPDATE eligibility_gates SET value_spec=NULL WHERE {where} AND value_spec IS NOT NULL",
            params).rowcount
        conn.commit()
        print(f"cleared {cleared:,} existing specs (--rebuild)")
    extra = "" if args.rebuild else " AND value_spec IS NULL"
    # A gate with value_spec NULL is not the same as a gate never tried: most
    # of them have been through the encoder, which looked at the requirement
    # and correctly refused ("certain sectors are excluded, including..." names
    # no comparable set). Re-running those bills for the same refusal. --fresh
    # restricts the pass to gates triage has seen but encode never has, which
    # is the only set where new spend can produce new coverage.
    if getattr(args, "fresh", False):
        # 'quarantined' is excluded alongside 'llm_encode': those specs were
        # cleared by audit_encoding_vs_reality.py because their own recipients
        # contradicted them, and re-deriving from the same text would just put
        # the same wrong rule back.
        extra += (" AND (encoding_method IS NULL OR"
                  " encoding_method NOT IN ('llm_encode', 'quarantined'))")
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
            # A founder's answer for these fields is a LIST, so `equals` (a
            # strict string comparison in eligibility.ts) can never be true —
            # it would silently read "unknown" for everyone. The model reaches
            # for equals on single-country rules ("must be a Swedish startup"),
            # so coerce it deterministically rather than re-prompting.
            if op == "equals" and field in MULTI_VALUE_FIELDS:
                op = "in"
                r["values"] = r["values"][:1]
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
                order = BAND_ORDERS.get(by_id[gid], [])
                if op == "band_max":
                    spec["maxAllowed"], spec["order"] = r["values"][0], order
                elif op == "band_min":
                    spec["minAllowed"], spec["order"] = r["values"][0], order
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
            conn.execute(
                "UPDATE eligibility_gates SET value_spec=?, encoding_method='llm_encode' WHERE id=?",
                (json.dumps(spec, ensure_ascii=False), gid))
            done += 1
        conn.commit()
        print(f"  {min(i + ENCODE_CHUNK, len(rows)):,}/{len(rows):,}  encoded={done:,} skipped={skipped:,}")
    conn.close()
    print(f"encode done: {done:,} encoded, {skipped:,} skipped as unencodable.")


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
    sub.add_parser("report").set_defaults(func=cmd_report)
    args = ap.parse_args()
    global MODEL
    MODEL = MODELS.get(getattr(args, "model", "sonnet"), getattr(args, "model", MODEL))
    args.func(args)


if __name__ == "__main__":
    main()
