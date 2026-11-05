"""An operator may only be stored against a field whose answers it can act on.

FREE. No model calls, no network. Reads both stores and one generated file.

THE DEFECT (measured 2026-08-19, wsIG)
--------------------------------------
`comparator.ts` opens `numeric_gte` and `numeric_lte` with
`typeof answer === "number"`, and `EligibilityAnswers` declares exactly one
number -- `foundedYear`, which is `unreachable` and which no gate encodes on. So
all 46 numeric comparators in the corpus were keyed to fields answered with a
STRING. Not failing, not passing: `evaluateSpec` returned null for every founder
alive, and null renders as "not assessable" and never as a blocker.

Proved end to end rather than read off the source. 897 held-out founders against
all 34 instruments, with every band field ANSWERED and swept across its whole
vocabulary -- 174,915 assessments, and quarantining all 43 changed not one
status, not one filter checked, not one filter passed, not one blocking field.

AND THE NUMERIC OPERATOR IS ONE OF THREE ESCAPE HATCHES, WHICH IS WHY THIS CHECK
IS NOT ABOUT NUMBERS
--------------------------------------------------------------------------------
18 more comparators were inert on the same day for two sibling reasons, and a
guard written about `numeric_*` would have missed every one:

  boolean_false on `exclusionFlags`   `exclusionFlags` is a LIST. `boolean_false`
      returns true only for the literal "no", and an array is never "no". 8 of
      these, carrying real GBER exclusions -- undertaking in difficulty,
      liquidation, unrepaid rescue aid -- none of which has ever been applied.

  a band bound from ANOTHER field's vocabulary   Four "Applicant must be an SME"
      gates hold `turnoverBand band_max "50-249"`, and one holds
      `developmentStage band_max "50-249"`. "50-249" is an `fteBand` value.
      `indexOf` returns -1, `comparePosition` returns null, and the SME size
      rule those instruments believe they hold has never been applied either.

The common shape is not the operator. It is an encoder reaching for SOMETHING
storable when the sentence it is reading has no field that can carry it, and a
stored comparator that cannot fire looks exactly like one that agrees with
everybody.

THE PROPERTY, which names no gate, no field and no operator
-----------------------------------------------------------
    A stored comparator's OPERATOR must be able to act on the ANSWER SHAPE its
    FIELD admits. Where they disagree the comparator can never return true or
    false, for any founder, and it must not be stored.

Both halves are DERIVED, never restated here:

  the field's answer shape   from `data/vocabularies.json`, the generated
      projection of the intake vocabulary that `encode_gates.py` already reads.
      A field in `bandOrders` is answered with a member of that ordered list; one
      in `enumValues` with a member of its list; one in `multiValueFields` with a
      LIST of those; anything else with free text.
  the operator's required shape   from OPERATOR_NEEDS below, which is the one
      place this repo states what each branch of `evaluateSpec` tests. Adding an
      operator to comparator.ts without adding it here fails this check loudly
      (see `unknown operator`) rather than passing it silently, because an
      operator nobody has classified is an operator nobody has proved storable.

THE TEST FOR A CASE NOBODY HAS SEEN: take the field's declared answers and ask
whether ANY of them is a value the operator's branch could return true or false
on. A field, an operator or a band scale added tomorrow is judged by the same
question with no edit here. In particular this check does not know what a
currency, a country or an SME is, and it names none of the 64 gates it found.

WHY IT IS NOT `check_comparator_admits.ts`
------------------------------------------
That check is better than this one at what it does: it RUNS `evaluateSpec` and
`sanitizeEligibility`, so it cannot drift from the product. Keep it. Two things
it deliberately does not do, and this one does:

  it reads the committed snapshot, on purpose, so it cannot pass vacuously on a
      runner with no database. That leaves POSTGRES -- the store the product
      actually serves from -- unchecked between an ETL write and the next
      export, which is exactly the window an encoding pass runs in.
  it RATCHETS the inert class rather than failing it, because failing would have
      put two guards red for one cause (frozen band orders, cleared by
      reband_ticket_gates.py). That justification has expired: none of the 64
      inert comparators found today is caused by a frozen order.

So this runs inside `make eligibility`, beside the pass that writes the specs,
against the store that pass writes to, and it FAILS.

    python3 ETL/terms/check_comparator_storable.py   # the one store (Postgres)
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
from etl_env import ROOT  # noqa: E402
from store import connect  # noqa: E402

_VOCAB = json.loads((ROOT / "data" / "vocabularies.json").read_text())
BAND_ORDERS: dict[str, list[str]] = _VOCAB["bandOrders"]
ENUM_VALUES: dict[str, list[str]] = _VOCAB["enumValues"]
MULTI_VALUE_FIELDS: set[str] = set(_VOCAB["multiValueFields"])

#: What each branch of `evaluateSpec` must receive to be able to return true or
#: false. "number" is a JS number; "yesno" is the literal "yes"/"no" that
#: `boolean_true`/`boolean_false` compare against; "ordered" is a member of the
#: field's own band order, and additionally requires the spec's BOUND to be one;
#: "string" is any single string or a member of a list of them.
OPERATOR_NEEDS = {
    "numeric_gte": "number", "numeric_lte": "number",
    "boolean_true": "yesno", "boolean_false": "yesno",
    "band_max": "ordered", "band_min": "ordered",
    "in": "string", "not_in": "string", "equals": "string",
    "region_within": "string",
    # Describes the money, never the applicant; `isFilter` keeps it out of
    # verdicts entirely, so it has no answer shape to satisfy.
    "aid_intensity": None,
}

BOUND_KEY = {"band_max": "maxAllowed", "band_min": "minAllowed"}


def declared_answers(field: str) -> list[str] | None:
    """Every value a founder can give for `field`, or None when it is free text
    (a country name, a NUTS id) and the vocabulary cannot enumerate it."""
    if field in BAND_ORDERS:
        return list(BAND_ORDERS[field])
    if field in ENUM_VALUES:
        return list(ENUM_VALUES[field])
    return None


def unstorable(spec: dict) -> str | None:
    """Why this comparator can never return true or false, or None if it can."""
    op, field = spec.get("op"), spec.get("field")
    if not op or not field:
        return None
    if op not in OPERATOR_NEEDS:
        return (f"unknown operator `{op}`: it is not classified in OPERATOR_NEEDS, "
                f"so nothing here can show an answer exists that satisfies it")
    needs = OPERATOR_NEEDS[op]
    if needs is None:
        return None
    values = declared_answers(field)

    if needs == "number":
        # Satisfiable only if the field's own declared answers are numbers. No
        # intake field declares a numeric domain today; one that did would pass
        # here with no edit.
        if values is not None and values and all(_is_number(v) for v in values):
            return None
        shape = ("a list of named values" if field in MULTI_VALUE_FIELDS
                 else "a named value" if values else "free text")
        return (f"`{op}` compares a NUMBER, and `{field}` is answered with {shape}. "
                f"No founder's answer can be tested against the threshold")

    if needs == "yesno":
        if field in MULTI_VALUE_FIELDS:
            return (f"`{op}` compares the single answer \"yes\"/\"no\", and `{field}` "
                    f"is answered with a LIST, which is never either")
        if values is None or not {"yes", "no"} & set(values):
            return (f"`{op}` compares the answers \"yes\"/\"no\", and `{field}` does "
                    f"not offer them"
                    + (f" (its answers are {values})" if values else ""))
        return None

    if needs == "ordered":
        order = BAND_ORDERS.get(field)
        if not order:
            return (f"`{op}` compares positions in an ordered scale and `{field}` "
                    f"has none")
        bound = spec.get(BOUND_KEY[op])
        if bound not in order:
            return (f"`{op}` is bounded at \"{bound}\", which is not a value of "
                    f"`{field}` ({order}). Every comparison returns "
                    f"\"not assessable\"")
        return None

    if needs == "string":
        # `in`/`not_in`/`equals` name their own values; a value outside the
        # field's vocabulary is a different defect (check_gate_subject.py owns
        # the country case) and is not inertness -- the comparator still returns
        # false. Nothing to fail here.
        return None
    return None


def _is_number(v) -> bool:
    try:
        float(v)
        return True
    except (TypeError, ValueError):
        return False


QUERY = (
    "SELECT instrument_id, gate_key, value_spec, requirement "
    "FROM eligibility_gates "
    "WHERE value_spec IS NOT NULL AND value_spec <> '' "
    "  AND (gate_role IS NULL OR gate_role = 'filter')")


def violations(rows) -> list[dict]:
    out = []
    for iid, gk, vs, req in rows:
        try:
            spec = json.loads(vs)
        except (TypeError, ValueError):
            continue
        if not isinstance(spec, dict):
            continue
        why = unstorable(spec)
        if why:
            out.append({"instrument_id": iid, "gate_key": gk, "spec": spec,
                        "why": why, "requirement": (req or "")[:110]})
    return out


def fetch_rows():
    """The encoded filters, from the one store (schema capital in Postgres).
    There used to be two readers here, one per store, and the check reported
    the worse; with one store there is one reader."""
    with connect(readonly=True) as con:
        return con.execute(QUERY).fetchall()


#: ── RATCHET, AND WHAT IS LEFT IN IT ────────────────────────────────────────
#: It may fall, never rise.
#:
#: 64 when this check was written. 21 once wsIG's 43 quarantines land, and 18
#: once wsIE's three do -- both writes are prepared, unapplied and authorised by
#: the PM, and this target is deliberately red until they do.
#:
#: THE RESIDUAL IS NOT A REMAINDER, it is a named set of 18 that needs a CORPUS
#: decision rather than a code change, and every one of them is a rule the
#: funder really states and we really cannot express:
#:
#:   8  `exclusionFlags boolean_false` -- criminal conviction, pending
#:      execution proceedings, unrepaid rescue aid, liquidation. The field is a
#:      list, so the operator is wrong; but `not_in` needs a VALUE, and the
#:      vocabulary has none for "convicted of an economic offence". Widening the
#:      intake is the fix, not re-keying the gate.
#:   4  `turnoverBand band_max "50-249"` -- "Applicant must be an SME" with an
#:      `fteBand` value. Re-keying to `fteBand` is the obvious repair AND IT IS A
#:      NEW EXCLUSION on four Estonian instruments, so it needs measuring before
#:      it is written, exactly as wsIG measured its own.
#:   3  `cofinancingBand boolean_true` -- "all partners must be able to finance
#:      their own part". A commitment, not a band.
#:   1  `developmentStage band_max "50-249"` -- the same mis-key, and the
#:      instrument already carries two working `developmentStage` comparators, so
#:      a third would break check_gate_branches.py.
#:   1  `ticketBand band_min "b250k_2m5"` -- a band name from BEFORE the
#:      ticketBand rebanding. Its sibling `g3-ticket-band` states the same rule.
#:   1  `conditionality boolean_true` -- "must be a registered client of a state
#:      development agency". No value in the vocabulary names it.
CEILING = 21


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--postgres", action="store_true",
                    help="accepted and ignored: there is one store, and it is Postgres")
    ap.add_argument("--verbose", action="store_true")
    a = ap.parse_args()

    stores = [("postgres", fetch_rows)]
    worst, worst_store, worst_rows = 0, "", []
    for name, get in stores:
        bad = violations(get())
        # The WORST store, not the sum: the two hold the same corpus, and adding
        # them says there are twice as many broken rules as there are. wsIE's
        # own check had to be corrected for exactly this.
        print(f"{name}: {len(bad)} unstorable comparator(s)")
        if len(bad) > worst:
            worst, worst_store, worst_rows = len(bad), name, bad

    by_reason: dict[str, int] = {}
    for v in worst_rows:
        key = f"{v['spec'].get('field')} {v['spec'].get('op')}"
        by_reason[key] = by_reason.get(key, 0) + 1
    for k, n in sorted(by_reason.items(), key=lambda x: -x[1]):
        print(f"   {n:3}  {k}")
    if a.verbose:
        for v in worst_rows:
            print(f"\n  {v['instrument_id']} [{v['gate_key']}] {json.dumps(v['spec'])}")
            print(f"      {v['why']}")
            print(f"      {v['requirement']}")

    if worst > CEILING:
        print(f"\nFAIL — {worst} unstorable comparator(s) in `{worst_store}`, above the "
              f"ceiling of {CEILING}.\n"
              f"  A comparator whose operator cannot act on its field's answers is not a\n"
              f"  rule. It cannot pass, cannot fail and cannot rank -- while counting as\n"
              f"  an encoded rule everywhere we count them. Re-key it to the field whose\n"
              f"  answer its sentence really turns on, or quarantine it\n"
              f"  (encoding_method='quarantined', value_spec NULL) so the requirement is\n"
              f"  still shown and the machine verdict stops.\n"
              f"  RAISING THE CEILING IS NOT A FIX. Run with --verbose for every row.")
        return 1
    print(f"\nOK — {worst} unstorable comparator(s), at or below the ceiling of {CEILING}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
