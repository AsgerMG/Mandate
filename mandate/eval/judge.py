"""The Claude judge: reads a scenario's rubric and a run's stored record, and
says per checkpoint whether it was met, with a one-line reason.

A STUB in the honest sense: it runs (claude-opus-5-5, structured output) but
nothing is tuned on it yet. The owner's grades are the standard (plan: the
owner grades weekly); this judge exists so a run has a first reading and so
the judge's agreement with the owner can be measured once grades exist. It is
called only with `runner.py --judge`, because it costs money.
"""
from __future__ import annotations

import json

from .scenarios import Scenario

JUDGE_MODEL = "claude-opus-5-5"

SYSTEM = """You grade a public-affairs advisor's answer against a rubric written by a senior practitioner.
For each checkpoint decide met / not met / cannot tell, strictly from the advisor's record you are given.
A 'must' is met only if the record clearly does it. A 'must_not' is met only if the record clearly AVOIDS it.
Citations shown as [cN] with a source are grounded; claims labelled judgement or unverified are not.
A country-specific fact without a citation does not satisfy a checkpoint that asks for it cited.
Be terse: one sentence of reason per checkpoint."""

SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["checkpoints", "overall"],
    "properties": {
        "checkpoints": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["id", "met", "reason"],
            "properties": {"id": {"type": "string"},
                           "met": {"type": "string", "enum": ["met", "not_met", "cannot_tell"]},
                           "reason": {"type": "string"}}}},
        "overall": {"type": "string"},
    },
}


def render_record(mission: dict, events: list[dict]) -> str:
    """The advisor's record as the judge reads it: what was asked, what the
    specialists reported, and everything saved, with citations shown."""
    lines: list[str] = []
    for e in events:
        if e.get("type") == "questions":
            lines.append("MANDATE ASKED THE FOUNDER FIRST:")
            lines += [f"- {q.get('question')} (why: {q.get('why')})" for q in e.get("questions", [])]
    for m in mission.get("messages", []):
        who, text = m.get("created_by"), (m.get("content") or "").strip()
        if text and who in ("founder", "wincent", "regina"):
            lines.append(f"\n[{who.upper()}]\n{text}")

    def claims(cl, cits):
        out = []
        for c in cl or []:
            if c.get("basis") == "cited":
                srcs = "; ".join(f"[{i}] {(cits.get(i) or {}).get('canonical_url', '?')}" for i in c.get("citation_ids", []))
                out.append(f"  - {c['text']} (cited: {srcs})")
            else:
                out.append(f"  - {c['text']} ({c.get('basis')})")
        return out

    for f in mission.get("flags", []):
        lines.append(f"\nFLAG [{f.get('severity')}] {f.get('title')} -> fix: {f.get('fix')}")
        lines += claims(f.get("claims"), f.get("citations") or {})
    for d in mission.get("decisions", []):
        lines.append(f"\nDECISION {d.get('title')} ({d.get('confidence')}): {d.get('recommendation')}")
        lines += claims(d.get("claims"), d.get("citations") or {})
    for a in mission.get("actions", []):
        lines.append(f"\nACTION {a.get('title')}: {a.get('detail')}")
        if a.get("stakeholder"):
            lines.append(f"  to: {json.dumps(a['stakeholder'], ensure_ascii=False)}")
        if a.get("draft"):
            lines.append(f"  DRAFT:\n{a['draft']}")
    for p in mission.get("plan_steps", []):
        lines.append(f"\nPLAN {p.get('ordinal')}. [{p.get('horizon')}] {p.get('title')}: {p.get('detail')}")
    for w in mission.get("watchlist", []):
        lines.append(f"\nWATCH ({w.get('kind')}, {w.get('route_status')}) {w.get('subject')}: {w.get('trigger')}")
    for m in mission.get("messages", []):
        d = (m.get("payload") or {}).get("deliverable")
        if d:
            lines.append(f"\nDELIVERABLE: {d.get('title')}\n{d.get('summary')}")
            for s in d.get("sections", []):
                lines.append(f"\n## {s.get('heading')}")
                lines += claims(s.get("claims"), (m.get("payload") or {}).get("citations") or {})
            for q in d.get("questions", []):
                lines.append(f"QUESTION FOR FOUNDER: {q.get('question')} ({q.get('why')})")
    return "\n".join(lines)


def build_prompt(s: Scenario, record: str) -> str:
    rubric = "\n".join(f"{c['id']} ({c['kind']}): {c['text']}" for c in s.checkpoints())
    return (f"THE FOUNDER ASKED:\n{s.founder_says}\n\nRUBRIC:\n{rubric}\n\n"
            f"THE ADVISOR'S RECORD:\n{record}\n\nGrade every checkpoint id.")


def judge(s: Scenario, record: str, client=None) -> dict:
    import anthropic  # noqa: PLC0415

    client = client or anthropic.Anthropic()
    msg = client.messages.create(
        model=JUDGE_MODEL, max_tokens=8000, system=SYSTEM,
        messages=[{"role": "user", "content": build_prompt(s, record)}],
        thinking={"type": "adaptive"},
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": SCHEMA}},
    )
    text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
    out = json.loads(text)
    met = [c for c in out["checkpoints"] if c["met"] == "met"]
    out["score"] = len(met) / max(len(s.checkpoints()), 1)
    out["usage"] = {"input_tokens": msg.usage.input_tokens, "output_tokens": msg.usage.output_tokens}
    return out
