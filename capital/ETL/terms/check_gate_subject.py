"""What a gate may gate on, and what its comparator may MEAN. Four properties.

Both properties came out of the French corpus, and neither is a fact about
France. They are stated here as properties with a machine test precisely so
they hold for text nobody has read yet — a note on the two rows that showed
them would protect those two rows and nothing else.

── PROPERTY 1 — the eligible applicant is the entity that SUBMITS ───────────
A rule may decide a founder's access only if it constrains the entity that
submits the application, or the project that entity submits.

Two-tier schemes are common and they read exactly like one-tier schemes.
"Accompagnement des agriculteurs face au changement climatique" says its
eligible structures are *organismes de conseil*, and then says the *bénéficiaire
final* must be a PME in primary agricultural production. An exploitant agricole
cannot apply to it. "PACTE Entreprises" is an AMI for *structures relais*; the
PMEs in its text are the audience the relais must serve. Encoding either scheme
on "agriculteur" or on "PME" would route precisely the founder who cannot apply
to a fund shown as open to them — worse than omitting the fund, because
`verdict.ts` would report it as open rather than unknown.

── PROPERTY 2 — an enumeration is not an exclusion ──────────────────────────
A rule may exclude only where the text asserts an exclusion. A list of
categories a scheme serves says nothing about who is left out of it.

Some source catalogues publish eligibility as taxonomy facets, and at least one
is maintained for collectivités: its beneficiary field offers Commune,
Intercommunalité, Département, Établissement public, Entreprise publique locale
and has no row for a private company at all. The absence is in their taxonomy,
not in the scheme — the framework rule these run on is "personne morale publique
ou privée (hors particulier ou service de l'État)". Where a scheme really does
exclude companies (AVELO) the text says so in prose.

── PROPERTY 4 — a comparator must mean what its sentence means ──────────────
Properties 1 and 2 ask whether a rule may gate at all. Both are satisfied by a
rule that is read perfectly and then encoded to say something the funder never
said, and that is where most of this corpus's wrongful deletions live.

4a  A rule about the PROJECT may not be decided by a field about the APPLICANT.
    TEST: take two applicants identical in the attribute the field names. If
    the rule can separate them, that field does not decide the rule.
4b  A positive comparator may not REQUIRE a value meaning "a member of this
    category our list does not name".

Both are stated in full beside the code that runs them, below. In short: when a
fund's stated purpose is narrower than any value the taxonomy holds, the
encoder must SKIP. Not the nearest value, not the catch-all, and not a widened
allow-list -- a widened list is still a conclusive claim, and `sector` is
structural, so one false verdict deletes the fund. Nothing is lost: a fund's
purpose is carried by `instrument_profiles` and ordered on by the semantic
ranker, which DEMOTES where this screen DELETES.

── The test, in two layers ──────────────────────────────────────────────────
LAYER 1 (free, mechanical, always runs). The extractor labels every gate with
`subject` and `basis` in verify_note and refuses to make a filter out of the
wrong ones. This asserts the invariant actually holds in the database, which is
the only claim that matters — an invariant enforced in code that was bypassed
by a later UPDATE is not an invariant. Any violation is a FAILURE, not a
warning.

LAYER 2 (paid, `--judge`). Layer 1 can only check the labels the extractor
wrote; it cannot check whether the labels are right. So an independent pass
re-reads the fund's own text alongside the rule that was encoded from it and
answers the two questions directly. The model is never shown the label it is
testing — it is asked what the text says, not whether we agree with ourselves.

A rule that fails layer 2 is QUARANTINED, the convention
`audit_encoding_vs_reality.py` and `verify_encodings.py` already use: the
requirement text stays and is still shown, the machine verdict stops. A wrong
rule that silently gates a founder out is the most expensive failure this
product has, because it is invisible to them and to us.

Usage:
  python3 ETL/terms/check_gate_subject.py                     # layer 1 only, free
  python3 ETL/terms/check_gate_subject.py --judge --country FR
  python3 ETL/terms/check_gate_subject.py --judge --country FR --dry-run
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

import argparse  # noqa: E402
import json  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402

MODEL = "claude-sonnet-5"
CHUNK = 8
OWNED = "g.gate_key LIKE 'scheme_text_%'"

FILTERABLE_SUBJECTS = {"applicant", "project"}
ASSERTING_BASES = {"stated_requirement", "stated_exclusion", "stated_exhaustive_list"}


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB, timeout=60)
    conn.row_factory = sqlite3.Row
    return conn


def label(note: str | None) -> tuple[str, str]:
    m = re.search(r"subject=(\w+)", note or "")
    n = re.search(r"basis=(\w+)", note or "")
    return (m.group(1) if m else ""), (n.group(1) if n else "")


# ── layer 1: the invariant, asserted against the database ───────────────────
def check_invariants(conn: sqlite3.Connection, country: str | None) -> int:
    scope, params = "", ()
    if country:
        scope = " AND fi.country = ?"
        params = (country,)
    rows = conn.execute(f"""
        SELECT g.id, g.instrument_id, g.gate_role, g.intake_field_resolved,
               g.verify_note, g.value_spec, substr(g.requirement, 1, 80) AS req
          FROM eligibility_gates g
          JOIN funding_instruments fi ON fi.id = g.instrument_id
         WHERE {OWNED}{scope}""", params).fetchall()
    bad: list[str] = []
    unlabelled = 0
    for r in rows:
        subject, basis = label(r["verify_note"])
        if not subject or not basis:
            unlabelled += 1
            continue
        gates_a_founder = r["gate_role"] == "filter" and r["value_spec"]
        if not gates_a_founder:
            continue
        if subject not in FILTERABLE_SUBJECTS:
            bad.append(f"  gate {r['id']} ({r['instrument_id']}): subject={subject} "
                       f"but decides a founder — {r['req']}")
        if basis not in ASSERTING_BASES:
            bad.append(f"  gate {r['id']} ({r['instrument_id']}): basis={basis} "
                       f"but decides a founder — {r['req']}")
    # A gate_role of NULL is not neutral: it is a rule that looks encoded and
    # decides nothing. 790 once landed that way from an INSERT that omitted it.
    null_role = sum(1 for r in rows if r["gate_role"] is None)
    print(f"layer 1: {len(rows)} scheme-text gates checked"
          + (f" ({country})" if country else ""))
    print(f"  unlabelled (no subject/basis in verify_note): {unlabelled}")
    print(f"  gate_role IS NULL:                            {null_role}")
    if null_role:
        bad.append(f"  {null_role} gates carry a NULL gate_role")
    if bad:
        print("\nFAIL — the invariant does not hold in the database:")
        for line in bad[:40]:
            print(line)
        return 1
    print("  PASS — no rule that decides a founder is about a downstream "
          "beneficiary, the fund itself, or a bare enumeration.")
    return check_spec_geography(conn, country)


# ── PROPERTY 3 — a spec must be readable by the engine that runs it ─────────
# Not specific to scheme text, so it runs over every gate. Both halves are the
# same failure: a comparator the engine parses and evaluates against the wrong
# vocabulary, which reads as a confident verdict and is silently always false.
#
#   * A COUNTRY field holding a REGION name. `activityCountries in
#     ["Provence-Alpes-Cote d'Azur", ...]` fails the French founder it was
#     written to admit, and `verdict.ts` treats a failing cited structural rule
#     as conclusive, so the fund is dropped from their brief entirely.
#   * A REGION field carrying anything but `region_within`. Region matching is
#     hierarchical over NUTS ids; an `in` over region NAMES never matches the
#     id a founder's answer resolves to.
def check_spec_geography(conn: sqlite3.Connection, country: str | None) -> int:
    from nuts_regions import norm as region_key, subnational_names

    subnational = subnational_names()
    if not subnational:
        print("  (no NUTS reference; geography check skipped)")
        return 0

    scope, params = "", ()
    if country:
        scope, params = " AND fi.country = ?", (country,)
    rows = conn.execute(f"""
        SELECT g.id, g.instrument_id, g.value_spec, substr(g.requirement, 1, 70) AS req
          FROM eligibility_gates g
          JOIN funding_instruments fi ON fi.id = g.instrument_id
         WHERE g.value_spec IS NOT NULL AND g.gate_role = 'filter'{scope}""",
                        params).fetchall()
    bad: list[str] = []
    for r in rows:
        try:
            spec = json.loads(r["value_spec"])
        except (json.JSONDecodeError, TypeError):
            bad.append(f"  gate {r['id']}: value_spec is not JSON")
            continue
        field, op = spec.get("field"), spec.get("op")
        vals = spec.get("allowed") or ([spec["value"]] if "value" in spec else [])
        if field in ("entityCountries", "activityCountries"):
            inside = [v for v in vals if region_key(str(v)) in subnational]
            if inside:
                bad.append(f"  gate {r['id']} ({r['instrument_id']}): {field} holds "
                           f"sub-national {inside} — {r['req']}")
        if field == "region" and op != "region_within":
            bad.append(f"  gate {r['id']} ({r['instrument_id']}): region field with "
                       f"op={op}, only region_within is evaluable — {r['req']}")
    print(f"\nlayer 1b: {len(rows)} encoded filters checked for spec geography")
    if bad:
        print("FAIL — a comparator the engine cannot evaluate as written:")
        for line in bad[:40]:
            print(line)
        return 1
    print("  PASS — every country field holds countries, every region rule uses "
          "region_within.")
    return check_spec_means_what_the_rule_means(conn, country)


# ── PROPERTY 4 — a comparator must MEAN what its sentence means ─────────────
# Properties 1-3 ask whether a rule may gate at all and whether the engine can
# read it. Both were satisfiable by a rule that is read perfectly and says
# something the funder never said. Two ways that happened, and between them
# they account for 132 of the 251 verified winners the gate screen deletes.
#
# ── 4a. SUBJECT AGREEMENT, IN THE DIRECTION THAT DELETES ───────────────────
#   A rule about the PROJECT may not be decided by a field about the APPLICANT.
#
# Property 1 admits both `applicant` and `project` as filterable subjects, and
# it is right to: a fund may restrict either. What nothing checked is that the
# FIELD chosen to decide a project rule is a field about the project. Vinnova's
# aviation programme is aimed at "alla organisationer inom flygområdet" and
# names universities and university colleges among its eligible party types; it
# is encoded `sector == mobility_transport`, and `sector` is what the COMPANY
# builds. GKN Aerospace Sweden is an industrial manufacturer, two Swedish
# university colleges are neither, and all three are deleted from a programme
# the register says they won.
#
#   THE TEST, for a rule nobody has read: take two applicants IDENTICAL in the
#   attribute the field names. If the rule can separate them, that field does
#   not decide the rule.
#
# ONE DIRECTION, and the asymmetry is the finding rather than a convenience.
# The symmetric version fires 117 times and 63 of those are the LABELLER being
# loose, not the encoder being wrong: "the company must co-finance at least
# 10%" is labelled `applicant` because the company is its grammatical subject,
# and `cofinancingBand` is nonetheless exactly the field that decides it. A
# project field asked to carry an applicant sentence is a wording mismatch. An
# applicant field asked to carry a project sentence is a DELETION: the founder
# answers truthfully about their company, the comparator reads it as an answer
# about their project, and a structural cited failure removes the fund. Only
# the second is this property's business.
#
# 54 today, of which 39 are `sector`.
#
# ── 4b. A REQUIREMENT MAY NOT BE A GAP IN OUR OWN VOCABULARY ────────────────
#   A positive comparator may not REQUIRE a value that means "a real member of
#   this category our list does not name".
#
# `sector other` is "Something else". Requiring it asserts that a fund admits
# exactly those applicants our eleven-value list failed to place — a fact about
# types.ts, not about the fund. Encoding a tourism scheme that way rejects
# every tourism company that named a nearer industry AND admits any space
# company that happened to pick "Something else".
#
# Both halves read declarations (FIELD_SUBJECT, unnamedResidualValues in
# data/vocabularies.json) rather than restating them, so a field or a residual
# added tomorrow is judged with no edit here. 4b is mechanical and complete;
# 4a can only be checked where a subject label exists, which today is the
# scheme-text gates.
#
# ── BOTH ARE DEBT, PINNED AT THE DAY THEY BECAME VISIBLE ────────────────────
# Neither is a pass at zero, and neither may rise. The fix for every row is a
# corpus write, and 63 of them are already written down with the funder's own
# page and quote per row in
# project-mgmt/evidence/wsgu_gate_encoding_corrections_2026-08-13.jsonl.
# Applying that file takes the residual count from 27 to 18 and the subject
# count from 54 to 50, and takes check_winner_not_gated from 251 to 14.
#
# The subject count barely moves and the reason matters more than the number:
# 4a can only judge a gate that CARRIES a subject label, and only the
# scheme-text extractor writes one. The 27 subject corrections in that file are
# mostly on gates named `g1-*` or `llm_classified_*`, which this check cannot
# see at all — so 54 is a floor on the real population, not a measure of it.
# The label does not survive publication either: `verify_note` is not in
# `public/data/instrument_terms.json`, so no hermetic guard can assert 4a over
# the shipped corpus. Labelling every gate, and carrying the label into the
# snapshot, is what would turn this ratchet into a real measurement.
#
# A ceiling raised here is a record that somebody accepted a new encoding that
# says something its funder did not.
RESIDUAL_CEILING = 27
SUBJECT_MISMATCH_CEILING = 54


def check_spec_means_what_the_rule_means(conn: sqlite3.Connection,
                                         country: str | None) -> int:
    vocab_path = _Path(__file__).resolve().parents[2] / "data" / "vocabularies.json"
    vocab = json.loads(vocab_path.read_text())
    field_subject: dict[str, str] = vocab["fieldSubject"]
    residuals: dict[str, list[str]] = vocab["unnamedResidualValues"]

    scope, params = "", ()
    if country:
        scope, params = " AND fi.country = ?", (country,)
    rows = conn.execute(f"""
        SELECT g.id, g.instrument_id, g.value_spec, g.verify_note,
               substr(g.requirement, 1, 90) AS req
          FROM eligibility_gates g
          JOIN funding_instruments fi ON fi.id = g.instrument_id
         WHERE g.value_spec IS NOT NULL AND g.gate_role = 'filter'{scope}""",
                        params).fetchall()

    residual_bad: list[str] = []
    subject_bad: list[str] = []
    for r in rows:
        try:
            spec = json.loads(r["value_spec"])
        except (json.JSONDecodeError, TypeError):
            continue
        field, op = spec.get("field"), spec.get("op")
        vals = spec.get("allowed") or ([spec["value"]] if "value" in spec else [])

        if op in ("in", "equals"):
            hit = [v for v in vals if v in set(residuals.get(field, ()))]
            if hit:
                residual_bad.append(
                    f"  gate {r['id']} ({r['instrument_id']}): `{field} {op} {vals}` "
                    f"REQUIRES {hit} — 'a member of this category our list does not "
                    f"name' — {r['req']}")

        # ONE DIRECTION. A project sentence carried by an applicant field is a
        # deletion; the reverse is a wording mismatch. See 4a above.
        subject, _ = label(r["verify_note"])
        if subject == "project" and field_subject.get(field) == "applicant":
            subject_bad.append(
                f"  gate {r['id']} ({r['instrument_id']}): the rule is about the "
                f"PROJECT, `{field}` is about the APPLICANT — {r['req']}")

    print(f"\nlayer 1c: {len(rows)} encoded filters checked for what they MEAN")
    print(f"  a requirement that is a gap in our vocabulary:  {len(residual_bad)} "
          f"(ceiling {RESIDUAL_CEILING})")
    print(f"  a rule decided by a field about something else: {len(subject_bad)} "
          f"(ceiling {SUBJECT_MISMATCH_CEILING})")
    if len(residual_bad) > RESIDUAL_CEILING:
        print(f"\nFAIL — {len(residual_bad)} positive comparators require a residual "
              f"value, above the ceiling of {RESIDUAL_CEILING}:")
        for line in residual_bad[:40]:
            print(line)
        print("\n  There is no sentence a funder can write that this encodes. When a "
              "fund's\n  stated purpose is narrower than any value the taxonomy holds, "
              "the encoder\n  must SKIP -- not pick the nearest value, and not the "
              "catch-all. The purpose\n  is not lost: it is what the semantic ranker "
              "already orders on, and the\n  ranker demotes where this screen deletes.")
        return 1
    if len(subject_bad) > SUBJECT_MISMATCH_CEILING:
        print(f"\nFAIL — {len(subject_bad)} rule(s) decided by a field about a "
              f"different subject, above the ceiling of {SUBJECT_MISMATCH_CEILING}:")
        for line in subject_bad[:40]:
            print(line)
        print("\n  Take two applicants identical in the attribute the field names. If "
              "the rule\n  can separate them, that field does not decide the rule. "
              "RAISING THIS CEILING\n  IS NOT A FIX.")
        return 1
    for line in residual_bad[:15]:
        print(line)
    for line in subject_bad[:15]:
        print(line)
    print("  DEBT, not a pass. Both counts are at their pinned ceilings and may only "
          "fall.")
    return 0


# ── layer 2: an independent reading of the fund's own text ──────────────────
JUDGE_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {"results": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "properties": {
            "id": {"type": "integer"},
            "decides_access": {"type": "boolean"},
            "restriction_is_asserted": {"type": "boolean"},
            "why": {"type": "string"},
        },
        "required": ["id", "decides_access",
                     "restriction_is_asserted", "why"]}}},
    "required": ["results"],
}

JUDGE_PROMPT = """You are testing rules a funding-eligibility engine will use to decide \
which public funds are open to a founder. Each item gives a scheme's own eligibility text \
and one rule that was derived from it. Read the TEXT and answer about the RULE. You are \
not being asked whether the rule is well written — only these two questions.

1. decides_access — could a company that wanted this money be turned away by this rule?

   Answer TRUE if the rule constrains the entity that submits the application (what it
   is, where it is registered, its size, its sector) OR the project that entity would
   submit (where the work happens, what sector it is in, what it costs, what the money
   buys). Both of those decide access; a project constraint is a real obstacle to a
   real applicant and belongs here.

   Answer FALSE in exactly two situations:
   (a) The rule restricts someone FURTHER DOWN THE CHAIN who cannot themselves apply.
       Some schemes have two tiers: an advisory body, operator, relais or intermediary
       applies, and the companies, farms or households it then serves are named as the
       beneficiaries. The audience is not the applicant, and a rule about the audience
       must never decide whether an applicant qualifies. Read the text for which entity
       actually files the application.
   (b) The rule is a fact about the FUND — its budget, aid rate, deadline, legal basis
       or granting body — dressed as a condition on the applicant.

2. restriction_is_asserted — does the TEXT actually assert this restriction?

   The test: strike the list or category out of the text. Does what remains still say
   that anyone outside it may not apply? If the only evidence for the restriction is
   that something does not appear in a list of categories the scheme serves, answer
   false. Some catalogues publish eligibility as taxonomy facets whose category set is
   incomplete, so an absence there is a gap in their taxonomy, not a rule in the
   scheme. A real exclusion is stated: the text says who is not eligible, or says the
   list is the only thing eligible.

   Answer true when the text states the condition outright, names an exclusion, or
   presents a list as closed.

`why` is one short sentence naming the sentence in the text you relied on. Return ONLY
the JSON object."""


def cmd_judge(conn: sqlite3.Connection, country: str | None, dry_run: bool,
              limit: int) -> int:
    import anthropic

    scope, params = "", ()
    if country:
        scope = " AND fi.country = ?"
        params = (country,)
    rows = conn.execute(f"""
        SELECT g.id, g.requirement, g.value_spec, g.quote, fi.name,
               fi.eligibility_text
          FROM eligibility_gates g
          JOIN funding_instruments fi ON fi.id = g.instrument_id
         WHERE {OWNED}{scope} AND g.gate_role = 'filter'
           AND g.value_spec IS NOT NULL
           AND g.encoding_method != 'quarantined'
         ORDER BY g.instrument_id, g.gate_key""", params).fetchall()
    if limit:
        rows = rows[:limit]
    print(f"\nlayer 2: judging {len(rows)} encoded rules against their own source text")
    if not rows:
        return 0

    cl = anthropic.Anthropic()
    failures: list[tuple[int, str, str]] = []
    for i in range(0, len(rows), CHUNK):
        chunk = rows[i: i + CHUNK]
        parts = []
        for r in chunk:
            spec = json.loads(r["value_spec"])
            parts.append(
                f"id: {r['id']}\nscheme: {r['name']}\n"
                f"eligibility text:\n{r['eligibility_text'][:2500]}\n"
                f"RULE derived from it: {r['requirement']}\n"
                f"encoded as: {json.dumps(spec, ensure_ascii=False)}")
        res = cl.messages.create(
            model=MODEL, max_tokens=3000, thinking={"type": "disabled"},
            output_config={"format": {"type": "json_schema", "schema": JUDGE_SCHEMA}},
            messages=[{"role": "user", "content": JUDGE_PROMPT + "\n\n" +
                       "\n\n---\n\n".join(parts)}])
        text = "".join(b.text for b in res.content if b.type == "text")
        try:
            out = json.loads(text)
        except json.JSONDecodeError:
            out = json.loads(text[text.find("{"): text.rfind("}") + 1])
        for r in out["results"]:
            if not r["decides_access"]:
                failures.append((r["id"], "does not decide access", r["why"]))
            elif not r["restriction_is_asserted"]:
                failures.append((r["id"], "not asserted", r["why"]))
        print(f"  {min(i + CHUNK, len(rows))}/{len(rows)}  disputed={len(failures)}")

    print(f"\nlayer 2: {len(failures)} of {len(rows)} disputed "
          f"({100 * len(failures) / len(rows):.0f}%)")
    for gid, why, note in failures:
        req = conn.execute("SELECT substr(requirement,1,90) FROM eligibility_gates "
                           "WHERE id=?", (gid,)).fetchone()[0]
        print(f"  {gid} [{why}] {req}\n      {note[:140]}")
    if failures and not dry_run:
        conn.executemany(
            """UPDATE eligibility_gates
                  SET value_spec = NULL, encoding_method = 'quarantined',
                      verify_note = COALESCE(verify_note || ' | ', '') || ?
                WHERE id = ?""",
            [(f"quarantined by check_gate_subject: {w}", g) for g, w, _ in failures])
        conn.commit()
        print(f"\nquarantined {len(failures)} rules: the requirement text stays, "
              f"the machine verdict stops.")
    elif failures:
        print("\n[dry run] nothing quarantined")
    return 0


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--country", default=None)
    ap.add_argument("--judge", action="store_true",
                    help="also run the paid independent reading (layer 2)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    conn = connect()
    rc = check_invariants(conn, args.country)
    if rc == 0 and args.judge:
        rc = cmd_judge(conn, args.country, args.dry_run, args.limit)
    conn.close()
    raise SystemExit(rc)


if __name__ == "__main__":
    main()
