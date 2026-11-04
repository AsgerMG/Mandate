"""Re-read the source document for rules the second pass had to drop.

── Why this exists ──────────────────────────────────────────────────────────
verify_encodings.py dropped 159 encoded rules because the stored `quote` did
not support any machine-checkable requirement. In most cases the DOCUMENT does
support one — the quote was just too short. Extraction stored a sentence
fragment where the eligibility condition spans a paragraph, so the second pass
was judging a rule against evidence that had been truncated before it ever saw
it.

A real example from the dropped set: a quote reading "cumplimiento de lo
declarado, determinará la imposibilidad de continuar con el procedimiento" is a
consequence clause. The requirement it belongs to sits two sentences earlier
and was never captured.

So this goes back to the file — all 86 are already on disk under
data/raw/instrument_docs, so it is a re-read and not a re-fetch — pulls a WIDE
window around where the quote actually sits, and re-encodes from that.

It reuses extract_terms.load_doc() rather than writing its own reader. A second
parser would produce subtly different text from the same PDF and reintroduce
exactly the quote-mismatch problem this is meant to fix.

Usage:
  python3 ETL/terms/reextract_dropped.py --limit 40 --dry-run
  python3 ETL/terms/reextract_dropped.py
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

from extract_terms import _norm as norm, load_doc   # same parser as the original pass
from encode_gates import emittable_ops, refuse_unemittable
from verify_encodings import BAND_ORDERS, ENUM_VALUES, MODELS, REENCODE_SCHEMA

REEXTRACT_SCHEMA = REENCODE_SCHEMA

CHUNK = 10

# How much text to hand the model around the quote. Generous on purpose: the
# whole failure being corrected is a window that was too small, and a paragraph
# of surrounding context costs a few hundred tokens against a Haiku call.
WINDOW = 2400

REEXTRACT_PROMPT = """These eligibility rules were DROPPED because the short quote
stored for them did not state a checkable requirement. You are seeing a much
wider window of the same source document, around where that quote sits.

Read the CONTEXT and decide what, if anything, the document actually requires of
an applicant — then express it as a machine rule.

Two things to get right, because both have caused real damage here:

1. KEEP EXCEPTIONS. If the text says "normally", "exceptionally", "by
   derogation", or grants any carve-out, the rule must NOT exclude the excepted
   case. Compressing a paragraph into `field OP value` loses exceptions, and
   losing one always makes the rule harsher than the document — which hides a
   fund from exactly the companies the exception was written for.

2. "none" IS A REAL ANSWER. If the wider context still does not state an
   eligibility requirement — it is a consequence clause, a procedural note, a
   definition, a description of the programme rather than of who may apply —
   return op "none". That is the correct outcome for a large share of these and
   is far better than a rule that is nearly right.

Prefer slightly too permissive over slightly too strict: the brief only ever
claims that nothing rules a founder out, never that they qualify.

"values" holds the allowed set for in/not_in, one element for equals/band_*,
and is empty for boolean ops and for "none". "why" is one short sentence.

ITEMS:
"""


def window_around(fname: str, locator: str | None, quote: str) -> str | None:
    """The document text surrounding `quote`, or None if it cannot be located."""
    try:
        pages = load_doc(fname)
    except Exception:                                   # noqa: BLE001
        return None
    if not pages:
        return None
    # source_locator is either "p.7" / "chunk 2" or "<file>#p.7". Narrow to that
    # page when we can; fall back to searching the whole document, since a
    # locator that no longer matches is not a reason to give up on the text.
    loc = (locator or "").split("#")[-1].strip()
    candidates = [t for l, t in pages if l == loc] or [t for _, t in pages]
    needle = norm(quote)[:80]
    for text in candidates:
        hay = norm(text)
        i = hay.find(needle) if needle else -1
        if i != -1:
            # Map back approximately: normalisation only collapses whitespace,
            # so proportional positioning lands within a few characters.
            approx = int(i * len(text) / max(len(hay), 1))
            return text[max(0, approx - WINDOW // 2): approx + WINDOW].strip()
    # Quote not found (PDF re-extraction drift). Give the head of the located
    # page anyway — it is still the right region of the right document.
    return candidates[0][:WINDOW].strip() if candidates else None


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--model", default="haiku")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    model = MODELS.get(args.model, args.model)

    conn = sqlite3.connect(DB)
    rows = conn.execute(
        """SELECT g.id, g.source_file, g.source_locator, g.quote, g.requirement,
                  g.intake_field_resolved, fi.name
             FROM eligibility_gates g JOIN funding_instruments fi ON fi.id = g.instrument_id
            WHERE g.value_spec IS NULL
              AND g.verify_note LIKE '%second pass%'
              AND g.source_file IS NOT NULL
              AND g.intake_field_resolved NOT IN ('none', '')
            ORDER BY g.source_file, g.id""").fetchall()
    if args.limit:
        rows = rows[:args.limit]
    print(f"re-reading source documents for {len(rows):,} dropped rules ({model})")

    prepared, unlocatable = [], 0
    for gid, fname, loc, quote, req, field, name in rows:
        ctx = window_around(fname, loc, quote or "")
        if not ctx:
            unlocatable += 1
            continue
        prepared.append((gid, field, name, req, ctx))
    print(f"  {len(prepared)} with usable context, {unlocatable} unlocatable")

    api = anthropic.Anthropic()
    recovered = still_none = rejected = 0

    for i in range(0, len(prepared), CHUNK):
        batch = prepared[i:i + CHUNK]
        items = []
        for gid, field, name, req, ctx in batch:
            vocab = ENUM_VALUES.get(field)
            items.append(
                f"- id: {gid}\n  FUND: {name}\n"
                f"  ORIGINAL REQUIREMENT (as extracted): {' '.join((req or '').split())[:200]}\n"
                f"  FIELD: {field}   OPTIONS: {vocab if vocab else '(free text / numeric)'}\n"
                f"  CONTEXT FROM THE DOCUMENT:\n  \"\"\"{ctx[:WINDOW]}\"\"\"")
        res = api.messages.create(
            model=model, max_tokens=4000, thinking={"type": "disabled"},
            output_config={"format": {"type": "json_schema", "schema": REEXTRACT_SCHEMA}},
            messages=[{"role": "user", "content": REEXTRACT_PROMPT + "\n\n".join(items)}])
        text = "".join(b.text for b in res.content if b.type == "text")
        try:
            results = json.loads(text)["results"]
        except Exception as exc:                        # noqa: BLE001
            print(f"  batch {i // CHUNK + 1}: unparseable ({exc}) — skipped")
            continue

        for r in results:
            gid, op, field = r["id"], r["op"], r["field"]
            vals = [v for v in r.get("values", []) if v]
            if op == "none":
                still_none += 1
                continue
            # Same refusal, same source: this pass also takes `field` from the
            # model and its schema (REENCODE_SCHEMA, shared with
            # verify_encodings.py) cannot express `region_within`.
            if refuse_unemittable(field, gid, "re-extract", emittable_ops(REENCODE_SCHEMA)):
                rejected += 1
                continue
            vocab = ENUM_VALUES.get(field)
            if vocab:
                vals = [v for v in vals if v in vocab]
            # The sentinel guard from encode_gates: a rule about insolvency must
            # name insolvency, never the "nothing is wrong" answer.
            if field in ("exclusionFlags", "activities"):
                if (op == "not_in" and "none" in vals) or (op == "in" and vals == ["none"]):
                    rejected += 1
                    continue
            spec: dict = {"op": op, "field": field}
            if op in ("in", "not_in"):
                if not vals:
                    rejected += 1
                    continue
                spec["allowed"] = vals
            elif op == "equals":
                if not vals:
                    rejected += 1
                    continue
                spec["value"] = vals[0]
            elif op in ("band_max", "band_min"):
                order = BAND_ORDERS.get(field, [])
                if not vals or vals[0] not in order:
                    rejected += 1
                    continue
                # No frozen copy of the band list — see verify_encodings.py.
                spec["maxAllowed" if op == "band_max" else "minAllowed"] = vals[0]
            if not args.dry_run:
                conn.execute(
                    """UPDATE eligibility_gates
                          SET value_spec = ?, verification_level = 'llm_2pass',
                              encoding_method = 'llm_encode',
                              verify_note = COALESCE(verify_note || ' | ', '')
                                || 're-extracted from source with wider context: ' || ?
                        WHERE id = ?""",
                    (json.dumps(spec, ensure_ascii=False), (r.get("why") or "")[:200], gid))
            recovered += 1
        print(f"  {min(i + CHUNK, len(prepared))}/{len(prepared)}  "
              f"recovered={recovered} still-none={still_none} rejected={rejected}")

    if not args.dry_run:
        conn.commit()
    print(f"\n{recovered} rules recovered, {still_none} confirmed unencodable even with "
          f"full context, {rejected} rejected as unusable"
          f"{' [dry-run: nothing written]' if args.dry_run else ''}")


if __name__ == "__main__":
    main()
