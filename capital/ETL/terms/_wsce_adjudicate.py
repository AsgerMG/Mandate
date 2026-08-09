#!/usr/bin/env python3
"""wsCE — adjudicate the crisp/fuzzy split against a reader, and price the encoder.

`_wsce_split.ts` decides crisp vs fuzzy from notation alone: does the requirement
text supply a value in the field's live domain? Reading its output showed the
limit of that test. A quantity is self-dimensioning as to its UNIT but not as to
its SUBJECT -- "EUR 500m valuation" and "EUR 50m ticket" are both money, and only
one of them is a ticket size. Notation cannot tell them apart, and a comparator
that gets it wrong hides the fund from every founder who qualifies.

So the free test states a NECESSARY condition, not a sufficient one. This harness
measures how far short of sufficient it falls, on a stratified sample, by asking
a reader the one question the property defines:

    does this text supply a determinant -- a value in the field's own domain --
    that a comparator could compare the founder's answer against?

and, when it does not, WHICH of the four ways it fails. The four are not invented
here: they are the refusals `encode_gates.py`'s own prompt already teaches, which
is the strongest evidence available that they are the real failure modes.

  permission_not_restriction  "Ukraine may participate on equivalent terms"
                              extends eligibility. Encoded as in[Ukraine] it
                              excluded every actual recipient.
  scoped_to_part              binds one call, topic or window, so it cannot
                              decide whether a founder may approach at all.
  open_ended_set              "Member States or Associated Countries" -- a
                              partial list is a wrongful exclusion of the rest.
  requires_assessment         the truth is settled by someone reading the
                              application, not by the founder's answer.

READ-ONLY. Selects from Postgres, calls the model, prints a confusion matrix and
a measured cost. Writes nothing, to either store. The output is an argument for a
costed plan, not an encoding.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# The intake vocabulary, READ rather than restated -- same single source the
# encoder reads. A frozen copy is the Innovate UK defect.
_VOCAB = json.loads((ROOT / "data" / "vocabularies.json").read_text())
FIELD_REACH: dict[str, str] = _VOCAB["fieldReach"]
ENUM_VALUES: dict[str, list[str]] = _VOCAB["enumValues"]
BAND_ORDERS: dict[str, list[str]] = _VOCAB["bandOrders"]
ENCODABLE: list[str] = _VOCAB["encodableFields"]

MODEL = "claude-sonnet-5"
CHUNK = 15

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "results": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "id": {"type": "integer"},
                    "verdict": {"type": "string", "enum": ["crisp", "fuzzy"]},
                    "field": {"type": "string"},
                    "basis": {
                        "type": "string",
                        "enum": ["quantity", "closed_set", "defined_standard",
                                 "polarity", "none"],
                    },
                    "blocker": {
                        "type": "string",
                        "enum": ["none", "permission_not_restriction", "scoped_to_part",
                                 "open_ended_set", "requires_assessment",
                                 "no_field_reaches_it"],
                    },
                },
                "required": ["id", "verdict", "field", "basis", "blocker"],
            },
        }
    },
    "required": ["results"],
}

PROMPT = """You are deciding which eligibility rules a COMPARATOR can settle and \
which need a reader's judgement. A comparator compares a founder's structured \
answer against a VALUE. So it can decide a rule only if the rule's text supplies \
a value in the field's own domain. Call that a determinant.

Answer per rule:

verdict  "crisp" if the text supplies a determinant, so a comparator over the
         founder's own answer would be RIGHT and not a guess.
         "fuzzy" otherwise.

field    which intake field decides it, from the list below, or "none".

basis    how the determinant is supplied, when it is:
  quantity          a number with a unit ON THE SUBJECT THE FIELD MEASURES.
                    This is the distinction that matters most. "turnover of at
                    least EUR 40,000" is a quantity for turnoverBand. "EUR 500m
                    pre-money valuation" and "200 EUR per tonne CO2" are NOT
                    ticket sizes -- same notation, different subject. If the
                    number measures something the field does not measure, the
                    basis is not quantity.
  closed_set        names members of a set that can be enumerated in full: a
                    country, a NUTS region, a legal form.
  defined_standard  names a class whose thresholds are published elsewhere and
                    are arithmetic once resolved -- "SME" and "micro-enterprise"
                    are defined by staff headcount and turnover/balance-sheet
                    ceilings, so they land on a band. Use this only where the
                    definition is genuinely published, not merely conventional.
  polarity          a yes/no property the founder can state about themselves.
  none              no determinant.

blocker  when fuzzy, WHY. Four of these are ways a rule can look decidable and
         not be, and each has produced a real wrongful exclusion:
  permission_not_restriction  the rule EXTENDS eligibility rather than
      restricting it. "Entities established in Ukraine are eligible under
      equivalent conditions" does not mean applicants must be Ukrainian.
  scoped_to_part  binds one call, topic, window or sub-track rather than the
      instrument, so it cannot decide whether a founder may approach at all.
      Signals: "for the X topic", "under this call", "in the second window".
  open_ended_set  names a membership set too long or open to enumerate --
      "EU Member States or Associated Countries". A partial list wrongly
      excludes everyone omitted.
  requires_assessment  the truth is settled by someone reading the application:
      a quality, a plan, a purpose, or an assessor's discretion.
  no_field_reaches_it  nothing the founder is asked can express it.
  none  only when the verdict is crisp.

Be strict. A wrongly-encoded rule hides a fund from someone who qualifies, so
when the determinant is not clearly present, answer fuzzy. Return ONLY JSON."""


def field_menu() -> str:
    lines = []
    for f in sorted(ENCODABLE):
        if f == "none":
            continue
        reach = FIELD_REACH.get(f, "?")
        if f in BAND_ORDERS:
            dom = "bands " + "|".join(BAND_ORDERS[f])
        elif f in ENUM_VALUES:
            dom = "values " + "|".join(ENUM_VALUES[f])
        else:
            dom = "free text"
        lines.append(f"  {f} [{reach}] {dom}")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=300)
    ap.add_argument("--per-class", type=int, default=0,
                    help="cap per free-classifier class; 0 = proportional")
    ap.add_argument("--classified", required=True,
                    help="JSON from _wsce_split.ts --emit: [{id, cls, field, text}]")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    rows = json.loads(Path(args.classified).read_text())
    by_cls: dict[str, list] = defaultdict(list)
    for r in rows:
        by_cls[r["cls"]].append(r)

    rng = random.Random(20260809)
    picked = []
    if args.per_class:
        for cls, rs in sorted(by_cls.items()):
            rng.shuffle(rs)
            picked.extend(rs[: args.per_class])
    else:
        n = args.sample
        for cls, rs in sorted(by_cls.items()):
            rng.shuffle(rs)
            take = max(8, round(n * len(rs) / len(rows)))
            picked.extend(rs[:take])
    rng.shuffle(picked)
    print(f"sample {len(picked)} of {len(rows)} unencoded filter gates, "
          f"stratified over {len(by_cls)} free-classifier classes")
    for cls, rs in sorted(by_cls.items(), key=lambda kv: -len(kv[1])):
        got = sum(1 for p in picked if p["cls"] == cls)
        print(f"  {cls:<28} population {len(rs):>5}   sampled {got:>4}")

    menu = field_menu()
    chunks = [picked[i:i + CHUNK] for i in range(0, len(picked), CHUNK)]
    approx_in = sum(len(PROMPT) + len(menu) + sum(len(str(g["text"])[:400]) + 60 for g in c)
                    for c in chunks) / 3.7
    print(f"\n{len(chunks)} calls of {CHUNK}, model {MODEL}")
    print(f"  approx input {approx_in/1000:.0f}k tokens, output <= {len(picked)*60/1000:.0f}k")
    print(f"  approx cost at intro $2/$10 per MTok: "
          f"${approx_in/1e6*2 + len(picked)*60/1e6*10:.2f}")
    if args.dry_run:
        print("\n--dry-run: no model calls made")
        return

    import anthropic
    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit("ANTHROPIC_API_KEY not set")
    client = anthropic.Anthropic()

    verdicts: dict[int, dict] = {}
    tin = tout = 0
    for i, chunk in enumerate(chunks, 1):
        body = "\n\n".join(
            f"id: {g['id']}\nfiled under: {g['field']}\nrule: "
            f"{' '.join(str(g['text']).split())[:400]}"
            for g in chunk)
        msg = client.messages.create(
            model=MODEL, max_tokens=4000, thinking={"type": "disabled"},
            output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
            messages=[{"role": "user",
                       "content": f"{PROMPT}\n\nintake fields:\n{menu}\n\nrules:\n{body}"}],
        )
        tin += msg.usage.input_tokens
        tout += msg.usage.output_tokens
        text = next(b.text for b in msg.content if b.type == "text")
        for r in json.loads(text)["results"]:
            verdicts[int(r["id"])] = r
        print(f"  call {i}/{len(chunks)}  {len(verdicts)} adjudicated", flush=True)

    cost = tin / 1e6 * 2 + tout / 1e6 * 10
    print(f"\nMEASURED: {tin:,} input + {tout:,} output tokens = ${cost:.2f} "
          f"(intro $2/$10 per MTok, {MODEL})")

    # ── the confusion matrix the split is judged on ──────────────────────────
    by_id = {r["id"]: r for r in picked}
    free_crisp = lambda c: c.startswith("CRISP")
    cm = Counter()
    per_cls = defaultdict(Counter)
    for gid, v in verdicts.items():
        g = by_id.get(gid)
        if not g:
            continue
        f = "crisp" if free_crisp(g["cls"]) else "fuzzy"
        cm[(f, v["verdict"])] += 1
        per_cls[g["cls"]][v["verdict"]] += 1

    print("\nCONFUSION -- free classifier (rows) against the reader (columns)")
    print(f"{'':<18}{'reader crisp':>14}{'reader fuzzy':>14}")
    for f in ("crisp", "fuzzy"):
        print(f"free {f:<13}{cm[(f,'crisp')]:>14}{cm[(f,'fuzzy')]:>14}")
    tp, fp = cm[("crisp", "crisp")], cm[("crisp", "fuzzy")]
    fn, tn = cm[("fuzzy", "crisp")], cm[("fuzzy", "fuzzy")]
    if tp + fp:
        print(f"\nPRECISION of the free CRISP call: {100*tp/(tp+fp):.0f}%  "
              f"({fp} of {tp+fp} would be encoded on a determinant that is not there)")
    if tp + fn:
        print(f"RECALL: {100*tp/(tp+fn):.0f}%  "
              f"({fn} genuinely crisp gates the free test threw away)")

    print("\nBY CLASS")
    print(f"{'free class':<28}{'n':>5}{'reader crisp':>14}{'reader fuzzy':>14}")
    for cls, c in sorted(per_cls.items(), key=lambda kv: -sum(kv[1].values())):
        n = sum(c.values())
        print(f"{cls:<28}{n:>5}{c['crisp']:>14}{c['fuzzy']:>14}")

    print("\nWHY FUZZY (reader's blocker, over every gate it called fuzzy)")
    for b, n in Counter(v["blocker"] for v in verdicts.values()
                        if v["verdict"] == "fuzzy").most_common():
        print(f"  {n:>5}  {b}")
    print("\nBASIS (reader's determinant kind, over every gate it called crisp)")
    for b, n in Counter(v["basis"] for v in verdicts.values()
                        if v["verdict"] == "crisp").most_common():
        print(f"  {n:>5}  {b}")

    print("\nFIELD the reader would file the CRISP gates under")
    for f, n in Counter(v["field"] for v in verdicts.values()
                        if v["verdict"] == "crisp").most_common(14):
        reach = FIELD_REACH.get(f, "NOT A FIELD")
        print(f"  {n:>5}  {f} [{reach}]")

    if args.out:
        Path(args.out).write_text(json.dumps(
            {"cost_usd": round(cost, 4), "input_tokens": tin, "output_tokens": tout,
             "model": MODEL,
             "adjudications": [{**by_id[g], **verdicts[g]} for g in verdicts if g in by_id]},
            indent=1))
        print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
