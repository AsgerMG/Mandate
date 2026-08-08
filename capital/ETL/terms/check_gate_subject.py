"""Two properties every gate cut from scheme text must satisfy, and the test.

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
