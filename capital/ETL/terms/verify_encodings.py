"""Independently re-read each encoded rule against its own source quote.

── The gap this closes ──────────────────────────────────────────────────────
audit_encoding_vs_reality.py checks encodings against who ACTUALLY received
the money. That is the strongest evidence available, but it only reaches 108
of 593 rules — the rest concern things no recipient list can reveal (company
size, stage, ownership, what the money may be spent on).

For those, the only independent evidence is the source text itself. We stored
a verbatim quote alongside every gate when it was extracted, and never used it
for anything except display. This re-reads it.

Only 25 of 593 rules have ever had a second look (llm_2pass / human_verified).
Everything else is one model's assertion that nobody has checked.

── Why this is not a rubber stamp ───────────────────────────────────────────
Asking "is this encoding correct?" invites agreement — a model shown its own
kind of work will mostly say yes. So the task is inverted: the model is given
the quote and the SPEC IN PLAIN ENGLISH, without being told which was derived
from which, and asked to state what the source text actually requires. Only
then does it compare. Disagreement is cheap to express and costs it nothing,
which is the point.

A rule the check disputes is QUARANTINED, exactly like one its own recipients
contradict: the requirement text stays, the machine verdict stops. A wrong
rule that silently gates a founder out is the most expensive failure this
product has, because it is invisible to them and to us.

Usage:
  python3 ETL/terms/verify_encodings.py --limit 100        # sample first
  python3 ETL/terms/verify_encodings.py                    # everything unverified
  python3 ETL/terms/verify_encodings.py --dry-run          # no writes
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

MODELS = {"haiku": "claude-haiku-4-5-20251001", "sonnet": "claude-sonnet-5"}
CHUNK = 15

# The intake vocabulary, read from the same generated projection encode_gates.py
# uses. A corrected encoding that emits a value the product cannot match is not
# a correction, it is a rule that silently stops gating.
_VOCAB = json.loads((_Path(__file__).resolve().parents[2] / "data" / "vocabularies.json").read_text())
ENUM_VALUES: dict[str, list[str]] = _VOCAB["enumValues"]
BAND_ORDERS: dict[str, list[str]] = _VOCAB["bandOrders"]

REENCODE_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {"results": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "properties": {
            "id": {"type": "integer"},
            "op": {"type": "string", "enum": ["in", "not_in", "equals", "band_max", "band_min",
                                              "boolean_true", "boolean_false", "none"]},
            "field": {"type": "string"},
            "values": {"type": "array", "items": {"type": "string"}},
            "why": {"type": "string"},
        },
        "required": ["id", "op", "field", "values", "why"]}}},
    "required": ["results"],
}

REENCODE_PROMPT = """Re-encode eligibility rules that a review found do not match \
their own source text.

Each item gives you the verbatim QUOTE from the fund's documentation, what the \
review determined it ACTUALLY REQUIRES, the encoding we currently hold, and WHY \
that encoding was judged wrong. Produce a corrected machine-readable rule.

The failure that produced these is specific and worth naming, because it is the \
one to avoid repeating: compressing a paragraph into `field OP value` loses \
EXCEPTIONS AND DEROGATIONS, and losing them always makes a rule harsher than \
the document. "Projects should be commercial stage; exceptionally, \
pre-commercial may be accepted" became "must be commercial stage", which hides \
the fund from exactly the companies the exception exists for.

So:
- If the quote grants an exception, a derogation, or says "normally" / \
"generally" / "exceptionally", the rule must NOT exclude the excepted case. \
Usually that means a WIDER allowed set, or op "none".
- If the quote describes a different legal concept than the field tests, fix \
the FIELD. Insolvency, bankruptcy and liquidation are not the same as \
accumulated losses over half share capital; we hold separate values for both.
- Use op "none" when the quote does not support ANY machine-checkable rule. \
That is a perfectly good answer and better than a rule that is nearly right.
- Prefer being slightly too permissive over slightly too strict. The brief only \
ever claims that nothing rules a founder out; it never promises they qualify. \
A generous rule keeps a real option visible, a harsh one hides it forever.

"values" holds the allowed set for in/not_in, one element for equals/band_*, \
and is empty for boolean ops and for "none". "why" is one short sentence.

ITEMS:
"""

SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {"results": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "properties": {
            "id": {"type": "integer"},
            "source_says": {"type": "string"},
            "verdict": {"type": "string", "enum": ["matches", "too_strict", "too_loose", "wrong_field", "unsupported"]},
            "note": {"type": "string"},
        },
        "required": ["id", "source_says", "verdict", "note"]}}},
    "required": ["results"],
}

PROMPT = """You are auditing a database that decides which public funds European \
startups qualify for. A wrong rule silently hides funding from a company that \
was entitled to it, and neither they nor we would ever know. Being wrong is \
far more expensive than being unsure.

For each item below you get:
  QUOTE  - verbatim text from the fund's own documentation
  RULE   - what our engine currently enforces, written out in plain English

Do this, in order:
1. Read the QUOTE alone. In "source_says", state what it actually requires of \
an applicant, in one sentence. Do this BEFORE looking at the RULE.
2. Compare your reading to the RULE and choose a verdict:
   matches      - the rule enforces what the quote requires
   too_strict   - the rule would reject applicants the quote allows
   too_loose    - the rule would accept applicants the quote excludes
   wrong_field  - the rule tests the wrong attribute entirely
   unsupported  - the quote does not state an eligibility requirement at all, \
so nothing should be enforced from it

You are not expected to agree. These encodings were produced by a model \
working at speed from long documents; some are wrong, and finding them is the \
entire purpose. "matches" on something you have doubts about is the one answer \
that causes harm.

BEFORE you judge, three things about how our rules work. Getting these wrong \
produces false alarms, and a false alarm here DELETES A CORRECT RULE and hides \
a real fund — the exact harm we are trying to prevent:

1. BANDS ARE BUCKETS, AND THE TOP ONE IS OPEN-ENDED. Employee bands are \
1-9 / 10-49 / 50-249 / 250+, and "250+" means 250 or more with NO upper limit. \
So "at most 250+" places no constraint at all, and a quote allowing up to \
3,000 employees MATCHES it. Likewise "fewer than 250 employees" is exactly the \
band "50-249" — that is a match, not a boundary error. Never fault a rule for \
a boundary the bucket already expresses.

2. WE ASK COARSE QUESTIONS ON PURPOSE. A founder answers yes/no to \
"consortium", not "three independent entities in three member states". When a \
quote states a detailed requirement and the rule captures the gist with the \
coarser question we can actually ask, that is "matches". The brief never tells \
a founder they qualify — only that nothing rules them out — so an approximate \
gate is doing its job. Only say too_loose when the rule would admit someone \
the quote plainly EXCLUDES.

3. JUDGE THE RULE, NOT THE QUOTE'S COMPLETENESS. Quotes are short extracts. \
If a quote does not mention country but the rule sets one, that is only \
"unsupported" if the quote is clearly about something else entirely — not \
merely because this particular sentence omits it.

Keep "note" to one short sentence naming the specific discrepancy, or "" when \
the verdict is matches.

ITEMS:
"""


def spec_to_english(spec: dict) -> str:
    """Render a value_spec the way a person would read it, so the model is
    comparing meaning rather than pattern-matching our JSON."""
    op, field = spec.get("op"), spec.get("field")
    allowed = spec.get("allowed") or []
    if op == "in":
        return f"the applicant's {field} must be one of: {', '.join(allowed)}"
    if op == "not_in":
        return f"the applicant must NOT have {field} of: {', '.join(allowed)}"
    if op == "equals":
        return f"the applicant's {field} must be exactly '{spec.get('value')}'"
    if op == "band_max":
        return f"the applicant's {field} must be at most '{spec.get('maxAllowed')}'"
    if op == "band_min":
        return f"the applicant's {field} must be at least '{spec.get('minAllowed')}'"
    if op == "boolean_true":
        return f"the applicant must answer YES to {field}"
    if op == "boolean_false":
        return f"the applicant must answer NO to {field}"
    if op in ("numeric_gte", "numeric_lte"):
        rel = "at least" if op == "numeric_gte" else "at most"
        return f"the applicant's {field} must be {rel} {spec.get('threshold')}"
    return f"{op} on {field}"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, default=0, help="verify only N rules (sampling)")
    ap.add_argument("--model", default="haiku", help="haiku | sonnet | full model id")
    ap.add_argument("--dry-run", action="store_true", help="report without writing")
    ap.add_argument("--fix", action="store_true",
                    help="re-encode disputed rules from their quotes instead of quarantining")
    args = ap.parse_args()
    model = MODELS.get(args.model, args.model)

    conn = sqlite3.connect(DB)
    rows = conn.execute(
        """SELECT g.id, g.quote, g.requirement, g.value_spec, fi.name
             FROM eligibility_gates g JOIN funding_instruments fi ON fi.id = g.instrument_id
            WHERE g.value_spec IS NOT NULL AND g.gate_role = 'filter'
              AND g.quote IS NOT NULL AND g.quote <> ''
              AND g.verification_level NOT IN ('llm_2pass', 'human_verified')
            ORDER BY g.instrument_id, g.gate_key""").fetchall()
    if args.limit:
        # Spread the sample across the corpus rather than taking the first N,
        # which would all come from the same few instruments.
        step = max(1, len(rows) // args.limit)
        rows = rows[::step][:args.limit]
    print(f"verifying {len(rows):,} encoded rules against their source quotes ({model})")

    api = anthropic.Anthropic()
    tally: dict[str, int] = {}
    disputed: list[tuple] = []

    for i in range(0, len(rows), CHUNK):
        batch = rows[i:i + CHUNK]
        items = []
        for gid, quote, req, spec_json, _name in batch:
            spec = json.loads(spec_json)
            items.append(
                f'- id: {gid}\n  QUOTE: "{" ".join((quote or "").split())[:600]}"\n'
                f'  RULE: {spec_to_english(spec)}')
        res = api.messages.create(
            model=model, max_tokens=4000, thinking={"type": "disabled"},
            output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
            messages=[{"role": "user", "content": PROMPT + "\n".join(items)}],
        )
        text = "".join(b.text for b in res.content if b.type == "text")
        try:
            results = json.loads(text)["results"]
        except Exception as exc:  # noqa: BLE001
            print(f"  batch {i // CHUNK + 1}: unparseable response ({exc}) — skipped")
            continue
        by_id = {g[0]: g for g in batch}
        for r in results:
            v = r.get("verdict", "?")
            tally[v] = tally.get(v, 0) + 1
            if v != "matches" and r["id"] in by_id:
                disputed.append((by_id[r["id"]], r))
        print(f"  {min(i + CHUNK, len(rows))}/{len(rows)}  " +
              "  ".join(f"{k}={v}" for k, v in sorted(tally.items())))

    print(f"\n{'verdict':14} {'n':>5}")
    for k, v in sorted(tally.items(), key=lambda kv: -kv[1]):
        print(f"  {k:12} {v:5}")
    total = sum(tally.values()) or 1
    print(f"\n  agreement rate: {100 * tally.get('matches', 0) / total:.0f}%")

    if disputed:
        # Grouped, with examples of EVERY kind. A flat "worst first" list
        # truncated at 20 hid too_strict entirely on the first run -- and
        # too_strict is the category that matters most, because it is the one
        # that HIDES funds from founders who qualify.
        print(f"\n=== {len(disputed)} disputed ===")
        by_kind: dict[str, list] = {}
        for d in disputed:
            by_kind.setdefault(d[1]["verdict"], []).append(d)
        order = {"too_strict": 0, "wrong_field": 1, "too_loose": 2, "unsupported": 3}
        show = []
        for kind in sorted(by_kind, key=lambda k: order.get(k, 9)):
            print(f"\n-- {kind}: {len(by_kind[kind])} --")
            show = by_kind[kind][:4]
            for (gid, quote, req, spec_json, name), r in show:
                print(f"  {name} (gate {gid})")
                print(f"      quote : {' '.join((quote or '').split())[:94]}")
                print(f"      rule  : {spec_to_english(json.loads(spec_json))[:94]}")
                print(f"      issue : {(r.get('note') or '')[:94]}")

    if args.fix and disputed:
        print(f"\nre-encoding {len(disputed)} disputed rules from their quotes")
        fixed = dropped = kept_bad = 0
        for i in range(0, len(disputed), CHUNK):
            chunk = disputed[i:i + CHUNK]
            items = []
            for (gid, quote, _req, spec_json, _name), r in chunk:
                field = json.loads(spec_json).get("field")
                vocab = ENUM_VALUES.get(field)
                items.append(
                    f'- id: {gid}\n  QUOTE: "{" ".join((quote or "").split())[:600]}"\n'
                    f'  ACTUALLY REQUIRES: {r["source_says"]}\n'
                    f'  CURRENT (wrong): {spec_to_english(json.loads(spec_json))}\n'
                    f'  WHY WRONG: {r["verdict"]} — {r.get("note") or ""}\n'
                    f'  FIELD OPTIONS for {field}: {vocab if vocab else "(free text / numeric)"}')
            res = api.messages.create(
                model=model, max_tokens=4000, thinking={"type": "disabled"},
                output_config={"format": {"type": "json_schema", "schema": REENCODE_SCHEMA}},
                messages=[{"role": "user", "content": REENCODE_PROMPT + "\n".join(items)}])
            text = "".join(b.text for b in res.content if b.type == "text")
            try:
                results = json.loads(text)["results"]
            except Exception as exc:  # noqa: BLE001
                print(f"  batch {i // CHUNK + 1}: unparseable ({exc}) — left as-is")
                continue
            for r in results:
                gid, op, field = r["id"], r["op"], r["field"]
                vals = [v for v in r.get("values", []) if v]
                if op == "none":
                    if not args.dry_run:
                        conn.execute(
                            """UPDATE eligibility_gates SET value_spec = NULL,
                                      encoding_method = 'quarantined',
                                      verify_note = COALESCE(verify_note || ' | ', '')
                                        || 'second pass: quote supports no machine rule'
                                WHERE id = ?""", (gid,))
                    dropped += 1
                    continue
                vocab = ENUM_VALUES.get(field)
                if vocab:
                    good = [v for v in vals if v in vocab]
                    if len(good) != len(vals):
                        print(f"    gate {gid}: dropped out-of-vocabulary {sorted(set(vals) - set(good))}")
                    vals = good
                if op in ("in", "not_in") and not vals:
                    kept_bad += 1
                    continue
                spec: dict = {"op": op, "field": field}
                if op in ("in", "not_in"):
                    spec["allowed"] = vals
                elif op == "equals":
                    spec["value"] = vals[0]
                elif op in ("band_max", "band_min"):
                    order = BAND_ORDERS.get(field, [])
                    if not vals or vals[0] not in order:
                        kept_bad += 1
                        continue
                    spec["order"] = order
                    spec["maxAllowed" if op == "band_max" else "minAllowed"] = vals[0]
                if not args.dry_run:
                    conn.execute(
                        """UPDATE eligibility_gates SET value_spec = ?,
                                  verification_level = 'llm_2pass',
                                  verify_note = COALESCE(verify_note || ' | ', '')
                                    || 're-encoded after second pass: ' || ?
                            WHERE id = ?""",
                        (json.dumps(spec, ensure_ascii=False), (r.get("why") or "")[:200], gid))
                fixed += 1
        if not args.dry_run:
            # Everything the review agreed with gets its tier bumped too.
            disputed_ids = {d[0][0] for d in disputed}
            conn.executemany(
                "UPDATE eligibility_gates SET verification_level='llm_2pass' WHERE id=?",
                [(g[0],) for g in rows if g[0] not in disputed_ids])
            conn.commit()
        print(f"\n  {fixed} re-encoded, {dropped} dropped (quote supports no rule), "
              f"{kept_bad} left unchanged (unusable correction), "
              f"{len(rows) - len(disputed)} confirmed correct")
        return

    if args.dry_run:
        print("\n[dry-run] nothing written.")
        return


    # Agreement is recorded as a tier bump; disagreement quarantines, exactly as
    # a rule contradicted by its own recipients does.
    disputed_ids = {d[0][0] for d in disputed}
    conn.executemany(
        "UPDATE eligibility_gates SET verification_level='llm_2pass' WHERE id=?",
        [(g[0],) for g in rows if g[0] not in disputed_ids])
    for (gid, *_), r in disputed:
        conn.execute(
            """UPDATE eligibility_gates
                  SET value_spec = NULL, encoding_method = 'quarantined',
                      verify_note = COALESCE(verify_note || ' | ', '')
                        || 'second pass: ' || ? || ' — ' || ?
                WHERE id = ?""",
            (r["verdict"], (r.get("note") or "")[:200], gid))
    conn.commit()
    print(f"\n{len(rows) - len(disputed)} marked llm_2pass, {len(disputed)} quarantined")


if __name__ == "__main__":
    main()
