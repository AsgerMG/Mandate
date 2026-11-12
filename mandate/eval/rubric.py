"""The owner-calibrated rubric: how a brain's answer is judged.

Three things live here and nowhere else:

1. `build_judge_prompt`: what the judge is shown (the case, its must / must_not,
   the owner's model answer when there is one, the senior checks from
   method.md, and the answer under judgement with its questions and tool
   calls, but never the run's own self-score).
2. `parse_judgement`: the judge ends its reply with `JUDGE {...}`; this reads it.
3. `rule_grade`: the grade from the checkpoint verdicts, by the ONE rule in
   `grade_scale.json` (the bench app reads the same file). The judge's own
   holistic grade is recorded next to it; when the two differ by more than the
   tolerance, the run is a calibration ask for the owner.

The judge itself is `.claude/agents/judge.md`, run on the bench
(`mandate/eval/bench_judge.py`), never on the API.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from .scenarios import Scenario

HERE = Path(__file__).resolve().parent
SCALE_FILE = HERE / "grade_scale.json"
METHOD_FILE = HERE.parent / "playbooks" / "method.md"

_SCALE: dict | None = None


def scale() -> dict:
    global _SCALE
    if _SCALE is None:
        _SCALE = json.loads(SCALE_FILE.read_text())
    return _SCALE


# ── what the judge reads ─────────────────────────────────────────────────────

# A saved run carries, after the answer, its own self-score and the grading
# block. The judge must not see them: the self-score is the brain marking its
# own homework, and the owner's grade is what the judge is calibrated AGAINST.
_CUT_AT = re.compile(r"^## (Self-score|Self-check|Claim provenance|Claims ledger|Grade \(|Bench findings)", re.M)


def answer_from_run(md: str) -> str:
    """The part of a saved bench run the judge may read."""
    m = _CUT_AT.search(md)
    return (md[: m.start()] if m else md).rstrip() + "\n"


def senior_checks() -> str:
    """The 'Before answering' section of method.md, if present (the scaffold)."""
    text = METHOD_FILE.read_text() if METHOD_FILE.exists() else ""
    m = re.search(r"^## Before answering.*?(?=^## |\Z)", text, re.M | re.S)
    return m.group(0).strip() if m else ""


def build_judge_prompt(s: Scenario, answer: str, *, model_answer: str | None = None) -> str:
    rubric = "\n".join(f"- {c['id']} ({c['kind']}): {c['text']}" for c in s.checkpoints())
    parts = [
        f"CASE: {s.id}",
        f"THE FOUNDER ASKED:\n{s.founder_says}",
    ]
    if s.founder_followup:
        parts.append(f"THE FOUNDER'S FURTHER FACTS (given when asked):\n{s.founder_followup}")
    parts.append(f"RUBRIC (every id must be graded):\n{rubric}")
    if model_answer:
        parts.append("THE OWNER'S MODEL ANSWER (the standard for the holistic grade; the musts are graded on "
                     f"their own text, not on matching this word for word):\n{model_answer.strip()}")
    checks = senior_checks()
    if checks:
        parts.append(f"THE SENIOR CHECKS THE BRAIN IS MEANT TO RUN (method.md):\n{checks}")
    parts.append(f"THE ANSWER UNDER JUDGEMENT:\n<<<\n{answer.strip()}\n>>>")
    parts.append("Grade every checkpoint id, list the ungrounded facts and the data gaps, give your holistic "
                 "grade, and end with the JUDGE line exactly as your instructions specify.")
    return "\n\n".join(parts)


# ── what the judge says ──────────────────────────────────────────────────────

class JudgementError(ValueError):
    pass


def parse_judgement(text: str) -> dict:
    """The JSON object after the LAST `JUDGE` marker in the judge's reply."""
    at = text.rfind("JUDGE")
    if at < 0:
        raise JudgementError("no JUDGE line in the judge's reply")
    brace = text.find("{", at)
    if brace < 0:
        raise JudgementError("JUDGE line has no JSON object")
    try:
        obj, _ = json.JSONDecoder().raw_decode(text[brace:])
    except json.JSONDecodeError as e:
        raise JudgementError(f"JUDGE JSON does not parse: {e}") from e
    if not isinstance(obj, dict) or not isinstance(obj.get("checkpoints"), list):
        raise JudgementError("JUDGE JSON lacks a checkpoints list")
    return obj


def normalise(j: dict, s: Scenario) -> dict:
    """Every rubric id present once with a legal verdict; unknown ids dropped,
    missing ids `cannot_tell` (and reported), so a grade never rests on an
    id the judge forgot."""
    sc = scale()
    legal = {c["id"]: c["kind"] for c in s.checkpoints()}
    seen: dict[str, dict] = {}
    for c in j.get("checkpoints", []):
        cid = str(c.get("id", ""))
        if cid not in legal:
            continue
        allowed = sc["must_verdicts"] if legal[cid] == "must" else sc["must_not_verdicts"]
        v = str(c.get("verdict", "")).strip().lower().replace(" ", "_")
        if v not in allowed:
            v = "cannot_tell"
        seen[cid] = {"id": cid, "kind": legal[cid], "verdict": v, "reason": str(c.get("reason", ""))[:600]}
    missing = [cid for cid in legal if cid not in seen]
    for cid in missing:
        seen[cid] = {"id": cid, "kind": legal[cid], "verdict": "cannot_tell", "reason": "not graded by the judge"}
    hg = j.get("holistic_grade")
    try:
        hg = int(hg) if hg is not None else None
    except (TypeError, ValueError):
        hg = None
    if hg is not None and not 1 <= hg <= 5:
        hg = None
    return {
        "checkpoints": [seen[cid] for cid in legal],
        "missing_ids": missing,
        "ungrounded_facts": [str(x)[:300] for x in (j.get("ungrounded_facts") or [])][:40],
        "data_gaps": [_gap(g) for g in (j.get("data_gaps") or []) if isinstance(g, dict)][:40],
        "holistic_grade": hg,
        "strongest_move": str(j.get("strongest_move", ""))[:400],
        "weakest_move": str(j.get("weakest_move", ""))[:400],
        "overall": str(j.get("overall", ""))[:1200],
    }


def _gap(g: dict) -> dict:
    return {"signal": str(g.get("signal", ""))[:300], "kind": str(g.get("kind", "other"))[:40],
            "source": str(g.get("source", ""))[:300]}


# ── the one rule ─────────────────────────────────────────────────────────────

def counts(checkpoints: list[dict]) -> dict:
    musts = [c for c in checkpoints if c["kind"] == "must"]
    nots = [c for c in checkpoints if c["kind"] == "must_not"]
    return {
        "must_total": len(musts),
        "must_met": sum(1 for c in musts if c["verdict"] == "met"),
        "must_partly": sum(1 for c in musts if c["verdict"] == "partly"),
        "must_not_total": len(nots),
        "must_not_hit": sum(1 for c in nots if c["verdict"] == "hit"),
        "must_not_borderline": sum(1 for c in nots if c["verdict"] == "borderline"),
    }


def rule_grade(checkpoints: list[dict], ungrounded_facts: int = 0) -> int:
    """The grade the owner's scale implies from the verdicts. Deterministic."""
    sc = scale()
    n = counts(checkpoints)
    share = ((n["must_met"] + sc["partly_weight"] * n["must_partly"]) / n["must_total"]) if n["must_total"] else 0.0
    grade = 1
    for threshold, g in sc["base_by_must_share"]:
        if share >= threshold:
            grade = g
            break
    if n["must_not_hit"]:
        grade = min(grade - sc["must_not_hit_penalty"] * n["must_not_hit"], sc["cap_if_any_must_not_hit"])
    if n["must_not_borderline"]:
        grade = min(grade, sc["cap_if_borderline_must_not"])
    cap = sc["ungrounded_facts_cap"]
    if ungrounded_facts >= cap["from"]:
        grade = min(grade, cap["cap"])
    return max(1, min(5, int(grade)))


def judgement(s: Scenario, raw: dict) -> dict:
    """A full judgement record: verdicts, counts, rule grade, holistic grade,
    and whether the two agree within tolerance."""
    j = normalise(raw, s)
    n = counts(j["checkpoints"])
    g = rule_grade(j["checkpoints"], len(j["ungrounded_facts"]))
    tol = scale()["agreement_tolerance"]
    agree = j["holistic_grade"] is not None and abs(j["holistic_grade"] - g) <= tol
    return {**j, **n, "grade": g, "rule_and_holistic_agree": agree, "scale": scale()["scale"][str(g)]}


def score_line(j: dict) -> str:
    """The one-line SCORE the bench app parses (web/lib/bench/model.ts parseScore)."""
    return "SCORE " + json.dumps({"must_met": j["must_met"], "must_total": j["must_total"],
                                  "must_not_hit": j["must_not_hit"], "must_not_total": j["must_not_total"],
                                  "grade": j["grade"]})


def agreement(pairs: list[tuple[int, int]]) -> dict:
    """Judge-vs-owner agreement over (judge_grade, owner_grade) pairs."""
    tol = scale()["agreement_tolerance"]
    n = len(pairs)
    within = sum(1 for a, b in pairs if abs(a - b) <= tol)
    return {"n": n, "within_tolerance": within, "share": (within / n) if n else None, "tolerance": tol}
