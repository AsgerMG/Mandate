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

MODEL = "claude-sonnet-5"
TRIAGE_CHUNK = 20
ENCODE_CHUNK = 15
CITED_OR_BETTER = ("llm_cited", "llm_2pass", "human_verified")

ROLES = ["filter", "obligation", "programme_fact", "vague"]

# The founder attributes we actually collect (EligibilityAnswers in types.ts).
# 'none' is a first-class answer: most gates that look like filters turn out to
# be decidable by nothing the founder can tell us.
FIELDS = [
    "ticketBand", "borrowerModel", "entityCountries", "wouldOpenEntity", "fteBand",
    "turnoverBand", "balanceBand", "ownerOver25", "institutionalOwner", "nonEuControl",
    "cofinancingBand", "foundedYear", "lossesOverHalfCapital", "conditionality",
    "developmentStage", "activityCountries", "consortium", "bankRelationship",
    "institutionalBacking", "needBy", "none",
]

# The ordered bands each banded field uses, so a band_max/band_min spec can be
# evaluated by position. Mirrors types.ts — keep in sync.
BAND_ORDERS = {
    "ticketBand": ["lt500k", "b500k_2m5", "b2m5_15m", "b15m_50m", "gt50m"],
    "fteBand": ["1-9", "10-49", "50-249", "250+"],
    "turnoverBand": ["<2M", "2-10M", "10-50M", ">50M"],
    "balanceBand": ["<2M", "2-43M", ">43M"],
    "cofinancingBand": ["<25%", "25-50%", ">50%"],
    "developmentStage": ["research", "prototype", "pilot_customers", "scaling_revenue"],
    "needBy": ["asap_weeks", "months_6", "months_18", "flexible"],
}

# Fields whose EligibilityAnswers value is a list, not a scalar. `equals` is
# meaningless against these (see the coercion in cmd_encode).
MULTI_VALUE_FIELDS = {"entityCountries", "activityCountries", "conditionality"}

ENUM_VALUES = {
    "borrowerModel": ["operating", "balance_sheet_lender", "originator", "fund_manager"],
    "conditionality": ["local_entity", "geo_commitments", "state_shareholder", "job_commitments"],
    "wouldOpenEntity": ["yes", "no", "depends"],
    **{f: ["yes", "no", "unsure"] for f in
       ("ownerOver25", "institutionalOwner", "nonEuControl", "lossesOverHalfCapital",
        "consortium", "bankRelationship", "institutionalBacking")},
}


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
    rows = conn.execute(
        f"""SELECT id, intake_field_resolved, requirement, value
            FROM eligibility_gates
            WHERE {where} AND gate_role='filter'
              AND intake_field_resolved NOT IN ('none',''){extra}
            ORDER BY instrument_id, gate_key""", params).fetchall()
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
    for name, fn in (("triage", cmd_triage), ("encode", cmd_encode)):
        p = sub.add_parser(name)
        p.add_argument("--limit", type=int, default=0)
        p.add_argument("--rebuild", action="store_true")
        p.set_defaults(func=fn)
    sub.add_parser("report").set_defaults(func=cmd_report)
    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
