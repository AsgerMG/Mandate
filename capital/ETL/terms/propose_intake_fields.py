"""Which NEW intake questions would unlock the most funds?

After triage (encode_gates.py) the corpus splits three ways: filters we can
decide from what we already ask, filters we CANNOT decide because no current
question touches them, and non-filters. This reads the second group — 485 real
eligibility conditions on 200+ instruments — and proposes the smallest set of
new questions that would decide the most of them.

This is the evidence-backed answer to "should we ask founders more?", replacing
a guess about what founders might want to tell us with a count of what the
funds actually require. Each proposal carries the instruments it unlocks, so the
question set can be cut at whatever length the intake screen can afford.

Clustering is a judgement task, not a regex one — the same requirement appears
in twenty phrasings across twenty languages — so it runs through a model.

Usage: python3 ETL/terms/propose_intake_fields.py [--max-fields 8]
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from store import connect  # noqa: E402
# --- end ETL path bootstrap ---

import argparse
import json

import anthropic

MODEL = "claude-sonnet-5"


def undecidable_filters() -> list[tuple]:
    """Filters no current intake question decides, largest funds first.
    NULLS LAST and the id tie-break: SQLite sorted a NULL total last under
    DESC and broke ties by scan order; Postgres sorts NULL first."""
    with connect(readonly=True) as conn:
        return conn.execute(
            """SELECT g.instrument_id, g.gate_family, g.requirement, fi.total_eur
               FROM eligibility_gates g JOIN funding_instruments fi ON fi.id = g.instrument_id
               WHERE g.gate_role = 'filter' AND g.intake_field_resolved = 'none'
               ORDER BY fi.total_eur DESC NULLS LAST, g.id"""
        ).fetchall()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--max-fields", type=int, default=8)
    args = ap.parse_args()

    rows = undecidable_filters()
    print(f"reading {len(rows):,} undecidable filters across "
          f"{len({r[0] for r in rows}):,} instruments\n")

    listing = "\n".join(
        f"- [{fam}] {' '.join(req.split())[:170]}" for _iid, fam, req, _eur in rows)

    schema = {
        "type": "object", "additionalProperties": False,
        "properties": {"fields": {"type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "properties": {
                "name": {"type": "string"},
                "question": {"type": "string"},
                "options": {"type": "array", "items": {"type": "string"}},
                "decides_roughly": {"type": "integer"},
                "why": {"type": "string"},
            },
            "required": ["name", "question", "options", "decides_roughly", "why"]}}},
        "required": ["fields"],
    }

    client = anthropic.Anthropic()
    res = client.messages.create(
        model=MODEL, max_tokens=4000, thinking={"type": "disabled"},
        output_config={"format": {"type": "json_schema", "schema": schema}},
        messages=[{"role": "user", "content":
            "Below are real eligibility conditions from European public funding instruments "
            "that our intake cannot currently decide, because we do not ask anything that "
            "bears on them.\n\n"
            "We already ask: ticket size, who borrows, countries of establishment, willingness "
            "to open an entity, headcount band, turnover band, balance-sheet band, owner over "
            "25%, institutional owner, non-EU control, co-financing capacity, founded year, "
            "accumulated losses, conditionality appetite, development stage, activity "
            "countries, consortium ability, bank relationship, institutional backing, timing.\n\n"
            f"Propose AT MOST {args.max_fields} NEW questions that would decide the most of "
            "these conditions. Rules:\n"
            "- Each must be answerable by a founder from memory in a few seconds, one tap.\n"
            "- Give concrete, mutually exclusive options — never yes/no/unsure.\n"
            "- Prefer one question that decides many conditions over several narrow ones.\n"
            "- Do not restate something we already ask.\n"
            "- 'decides_roughly' = your honest count of the conditions below it would settle.\n"
            "- Order by how many conditions each decides, most first.\n\n"
            + listing + "\n\nReturn ONLY the JSON object."}])
    text = "".join(b.text for b in res.content if b.type == "text")
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        parsed = json.loads(text[text.find("{"):text.rfind("}") + 1])

    total = 0
    for i, f in enumerate(parsed["fields"], 1):
        total += f["decides_roughly"]
        print(f"{i}. {f['name']}  — decides ~{f['decides_roughly']} conditions")
        print(f"   Q: {f['question']}")
        print(f"   options: {' / '.join(f['options'][:6])}")
        print(f"   why: {f['why']}\n")
    print(f"together these would decide roughly {total} of {len(rows)} "
          f"({100*total/max(len(rows),1):.0f}%) undecidable filters")


if __name__ == "__main__":
    main()
