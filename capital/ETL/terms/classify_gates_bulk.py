"""Tier 1: cheap, bulk, GROUNDED eligibility-gate classification across every
non-framework funding_instruments row. One Sonnet call per instrument, via
the Anthropic Message Batches API (50% off, same pattern as
ETL/events/transform/classify_taxonomy.py's submit/collect).

Grounded, not blind: each instrument's `source_family_bucket` (the existing
11-channel v_events.source_family grain) points at a real, human/Opus-authored
fund-process brief (web/fund-processes/<bucket>.md) — the model
reads that real text plus the instrument's own corpus facts (name, country,
capital_type, scale, sample SATR scheme titles where available) and proposes
gates *tailored to this specific instrument* within that family, rather than
guessing from a bare id. This is still below llm_2pass — no primary legal
text, no citation, no mechanical/entailment verification — so every gate
lands at verification_level='llm_classified' and can only ever render as
"likely_met"/"likely_not_met" in the frontend (see eligibility.ts).

Usage:
  python3 ETL/terms/classify_gates_bulk.py plan            # cost estimate, no submit
  python3 ETL/terms/classify_gates_bulk.py run              # submit + poll + write (small run, synchronous)
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT, WEB  # noqa: E402
# --- end ETL path bootstrap ---

import argparse
import json
import os
import sqlite3
import time

GATE_FAMILIES = ["G1_nexus", "G2_size_ownership", "G3_financial",
                  "G4_borrower_model", "G5_use_of_funds", "G6_conditionality"]
# READ from the generated vocabulary, never restated. This was a hand-written
# copy of encode_gates.FIELDS, and it had drifted: it still lacked sector,
# exclusionFlags, activities and useOfFunds long after the encoder gained them,
# so this pass was hunting for a smaller world than the encoder could store.
# `unreachable` fields are excluded by construction -- a rule keyed to a
# question nobody is asked can never be evaluated.
from encode_gates import ENCODABLE_FIELDS as INTAKE_FIELDS  # noqa: E402

MODEL = "claude-sonnet-5"
BRIEFS = WEB / "fund-processes"

SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "gates": {
            "type": "array",
            "items": {
                "type": "object", "additionalProperties": False,
                "properties": {
                    "gate_family": {"type": "string", "enum": GATE_FAMILIES},
                    "requirement": {"type": "string"},
                    "value": {"type": "string"},
                    "intake_field": {"type": "string", "enum": INTAKE_FIELDS},
                },
                "required": ["gate_family", "requirement", "value", "intake_field"],
            },
        },
    },
    "required": ["gates"],
}

SYSTEM = (
    "You classify likely ELIGIBILITY GATES for a specific European public-funding "
    "instrument, for a qualification engine used by startup founders. You are given "
    "a real briefing on the wider family this instrument belongs to, plus facts "
    "about this specific instrument from a funding-events database. Propose up to "
    "5 gates: which structural requirement families plausibly apply, a one-line "
    "requirement guess, a threshold/value if the briefing supports one, and which "
    "intake field would test it. This is a CLASSIFICATION pass, not verified legal "
    "research — do not invent specific numeric thresholds the briefing doesn't "
    "support; when unsure of a number, describe the requirement qualitatively and "
    "leave value empty. Skip a gate family entirely if nothing in the briefing or "
    "the instrument's own facts supports it — fewer, better-grounded gates beat "
    "five weak ones."
)


def load_brief(bucket: str | None) -> str:
    if not bucket:
        return ""
    f = BRIEFS / f"{bucket}.md"
    return f.read_text() if f.exists() else ""


def user_prompt(row: sqlite3.Row, brief: str) -> str:
    facts = [
        f"Instrument id: {row['id']}",
        f"Display name: {row['name']}",
        f"Country: {row['country'] or 'unknown'}",
        f"Capital type: {row['capital_type']}",
        f"Historical scale: {row['event_count']} awards to {row['company_count']} companies, "
        f"total EUR {row['total_eur']:.0f}, {row['first_year']}-{row['last_year']}" if row['event_count'] else
        "Historical scale: no direct awards recorded (this may be a rollup/umbrella id)",
    ]
    if row["sample_project_titles"]:
        titles = json.loads(row["sample_project_titles"])
        facts.append("Example scheme titles seen in the register: " + "; ".join(titles[:5]))
    body = "\n".join(facts)
    if brief:
        return (f"Family briefing (covers this instrument and its siblings):\n{brief}\n\n"
                f"This specific instrument:\n{body}")
    return f"No family briefing available. This specific instrument:\n{body}"


def params_for(row: sqlite3.Row) -> dict:
    brief = load_brief(row["source_family_bucket"])
    return {
        "model": MODEL, "max_tokens": 700,
        "thinking": {"type": "disabled"},
        "system": [{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
        "output_config": {"format": {"type": "json_schema", "schema": SCHEMA}},
        "messages": [{"role": "user", "content": user_prompt(row, brief)}],
    }


def load_work(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM funding_instruments WHERE is_framework = 0"
    ).fetchall()


def _parse_json(text: str) -> dict:
    try:
        return json.loads(text)
    except Exception:
        return {}


def cmd_plan(args) -> None:
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    work = load_work(conn)
    grounded = sum(1 for r in work if load_brief(r["source_family_bucket"]))
    print(f"{len(work)} instruments to classify ({grounded} grounded in a real "
          f"fund-process brief, {len(work) - grounded} facts-only)")
    # Batches API: ~50% off standard pricing. Rough estimate assuming brief
    # text (~1-2k tokens) is cache-hit after the first call per bucket.
    est_usd = len(work) * 0.003
    print(f"estimated cost: ~${est_usd:.2f} (Sonnet 5, batch pricing, cached briefs)")
    conn.close()


def cmd_run(args) -> None:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY not set (checked env + .env.local)")
    import anthropic
    client = anthropic.Anthropic()

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    work = load_work(conn)
    if args.limit:
        work = work[: args.limit]
    print(f"submitting {len(work)} requests...")

    requests = [{"custom_id": r["id"], "params": params_for(r)} for r in work]
    batch = client.messages.batches.create(requests=requests)
    print(f"batch {batch.id} submitted, polling...")
    while True:
        b = client.messages.batches.retrieve(batch.id)
        if b.processing_status == "ended":
            break
        time.sleep(15)
    print("batch ended, collecting results...")

    n_gates = n_errored = n_empty = 0
    for res in client.messages.batches.results(batch.id):
        inst_id = res.custom_id
        if res.result.type != "succeeded":
            n_errored += 1
            continue
        text = next((b.text for b in res.result.message.content if b.type == "text"), "{}")
        data = _parse_json(text)
        gates = data.get("gates", [])[:5]
        if not gates:
            n_empty += 1
            continue
        for i, g in enumerate(gates):
            gate_family = g.get("gate_family")
            intake_field = g.get("intake_field", "none")
            if gate_family not in GATE_FAMILIES or intake_field not in INTAKE_FIELDS:
                continue
            conn.execute("""
                INSERT INTO eligibility_gates
                  (instrument_id, gate_key, gate_family, requirement, value,
                   intake_field, verification_level, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 'llm_classified', CURRENT_TIMESTAMP)
                ON CONFLICT (instrument_id, gate_key) DO UPDATE SET
                  gate_family=excluded.gate_family, requirement=excluded.requirement,
                  value=excluded.value, intake_field=excluded.intake_field,
                  updated_at=CURRENT_TIMESTAMP
            """, (inst_id, f"llm_classified_{i}", gate_family,
                  g.get("requirement", ""), g.get("value") or None, intake_field))
            n_gates += 1
    conn.commit()
    conn.close()
    print(f"\ndone: {n_gates} gates written, {n_empty} instruments with no gate "
          f"proposed, {n_errored} errored requests.")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                  formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("plan").set_defaults(fn=cmd_plan)
    p = sub.add_parser("run")
    p.add_argument("--limit", type=int, default=None)
    p.set_defaults(fn=cmd_run)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
