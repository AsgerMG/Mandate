"""Judge a brain's answer on the bench (the owner's plan, no API spend).

    PYTHONPATH=. python3 -m mandate.eval.bench_judge --run mandate/eval/runs/bench/2026-11-10_fintech_guarantees_round3.md
    PYTHONPATH=. python3 -m mandate.eval.bench_judge --case fintech_guarantees --answer answer.md
    PYTHONPATH=. python3 -m mandate.eval.bench_judge --calibration        # judge vs owner, from calibration.yaml

A judgement is a measurement record: it is written, never overwritten, to
mandate/eval/judgements/<run-stem>.<utc-timestamp>.json, with the prompt's
sha256, the case's sha256, the playbooks' git commit, the verdicts, the rule
grade and the judge's holistic grade. `--dry-run` prints the prompt and stops.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

import yaml

from . import bench, rubric
from .scenarios import Scenario, load

HERE = Path(__file__).resolve().parent
JUDGEMENTS = HERE / "judgements"
CALIBRATION = HERE / "calibration.yaml"
RUN_CASE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}_(.+?)(?:_round\d+|_italycore|_DRAFT|_\d+)?\.md$")


def case_of_run(path: Path, explicit: str | None = None) -> Scenario:
    if explicit:
        return load(explicit)
    m = re.search(r"mandate/eval/scenarios/([a-z0-9_-]+)\.yaml", path.read_text())
    if m:
        return load(m.group(1))
    m = RUN_CASE_RE.match(path.name)
    if not m:
        raise SystemExit(f"cannot tell the case of {path.name}; pass --case")
    return load(m.group(1))


def model_answer_of(s: Scenario) -> str | None:
    data = yaml.safe_load(Path(s.path).read_bytes())
    ma = data.get("model_answer")
    return " ".join(str(ma).split()) if ma else None


def _git() -> str | None:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short=10", "HEAD"], text=True, cwd=HERE).strip()
    except Exception:  # noqa: BLE001
        return None


def judge_answer(s: Scenario, answer: str, *, label: str, model: str | None = None, dry_run: bool = False) -> dict | None:
    prompt = rubric.build_judge_prompt(s, answer, model_answer=model_answer_of(s))
    if dry_run:
        print(prompt)
        return None
    out = bench.run_agent("judge", prompt, tools=bench.JUDGE_TOOLS, model=model, timeout_s=900)
    raw = rubric.parse_judgement(out["text"])
    j = rubric.judgement(s, raw)
    rec = {
        "label": label, "case": s.id, "case_sha256": s.sha256, "prompt_sha256": hashlib.sha256(prompt.encode()).hexdigest(),
        "git_commit": _git(), "judged_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "judge": {"agent": "judge", "model": out.get("model"), "duration_s": out["duration_s"], "session_id": out["session_id"]},
        **j, "reply": out["text"],
    }
    return rec


def save(rec: dict) -> Path:
    JUDGEMENTS.mkdir(exist_ok=True)
    stamp = rec["judged_at"].replace("+00:00", "Z").replace(":", "-")
    stem = re.sub(r"[^A-Za-z0-9_.-]", "_", rec["label"])
    p = JUDGEMENTS / f"{stem}.{stamp}.json"
    p.write_text(json.dumps(rec, indent=1, ensure_ascii=False) + "\n")
    return p


def latest_judgements() -> dict[str, dict]:
    """label -> newest judgement record on disk."""
    out: dict[str, dict] = {}
    for p in sorted(JUDGEMENTS.glob("*.json")):
        rec = json.loads(p.read_text())
        out[rec["label"]] = {**rec, "_file": str(p)}
    return out


def one_line(rec: dict) -> str:
    return (f"{rec['label']}: grade {rec['grade']} ({rec['scale']}), holistic {rec['holistic_grade']}, "
            f"musts {rec['must_met']}+{rec['must_partly']}p/{rec['must_total']}, must_not hit {rec['must_not_hit']}"
            f"{' borderline ' + str(rec['must_not_borderline']) if rec['must_not_borderline'] else ''}, "
            f"ungrounded {len(rec['ungrounded_facts'])}, gaps {len(rec['data_gaps'])}")


def calibration_report() -> dict:
    """Judge vs owner over calibration.yaml, using the newest judgement per run."""
    anchors = yaml.safe_load(CALIBRATION.read_text())["anchors"]
    latest = latest_judgements()
    rows, pairs, must_not_caught = [], [], []
    for a in anchors:
        label = Path(a["run"]).stem
        rec = latest.get(label)
        row = {"run": a["run"], "graded_by": a["graded_by"], "owner_grade": a.get("grade"),
               "owner_range": a.get("grade_range"), "judge_grade": rec["grade"] if rec else None,
               "judge_holistic": rec["holistic_grade"] if rec else None}
        if rec and a["graded_by"] == "owner":
            if a.get("grade") is not None:
                pairs.append((rec["grade"], a["grade"]))
            elif a.get("grade_range"):
                lo, hi = a["grade_range"]
                tol = rubric.scale()["agreement_tolerance"]
                row["within_range_tolerance"] = (lo - tol) <= rec["grade"] <= (hi + tol)
            verdict = {c["id"]: c["verdict"] for c in rec["checkpoints"]}
            for cid in a.get("owner_must_not_hit", []):
                must_not_caught.append({"run": a["run"], "id": cid, "judge": verdict.get(cid), "caught": verdict.get(cid) in ("hit", "borderline")})
            for cid in a.get("owner_must_failed", []):
                must_not_caught.append({"run": a["run"], "id": cid, "judge": verdict.get(cid), "caught": verdict.get(cid) in ("not_met", "partly")})
        rows.append(row)
    return {"rows": rows, "agreement": rubric.agreement(pairs), "owner_flags": must_not_caught,
            "owner_flags_caught": sum(1 for f in must_not_caught if f["caught"]), "owner_flags_total": len(must_not_caught)}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run", action="append", default=[], help="a saved bench run (.md); repeatable")
    ap.add_argument("--case", help="scenario id (needed with --answer; optional with --run)")
    ap.add_argument("--answer", help="a file holding the answer text to judge")
    ap.add_argument("--label", help="label for the judgement record (default: the file stem)")
    ap.add_argument("--model", help="claude model alias for the judge (default: the agent's)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--calibration", action="store_true", help="print judge-vs-owner agreement and stop")
    a = ap.parse_args(argv)
    if a.calibration:
        print(json.dumps(calibration_report(), indent=1, ensure_ascii=False))
        return 0
    jobs: list[tuple[Scenario, str, str]] = []
    for r in a.run:
        p = Path(r)
        jobs.append((case_of_run(p, a.case), rubric.answer_from_run(p.read_text()), a.label or p.stem))
    if a.answer:
        if not a.case:
            raise SystemExit("--answer needs --case")
        p = Path(a.answer)
        jobs.append((load(a.case), p.read_text(), a.label or p.stem))
    if not jobs:
        ap.error("give --run or --answer")
    for s, answer, label in jobs:
        try:
            rec = judge_answer(s, answer, label=label, model=a.model, dry_run=a.dry_run)
        except bench.UsageLimit as e:
            print(f"STOP: {e}", file=sys.stderr)
            return 3
        if rec:
            out = save(rec)
            print(f"{one_line(rec)}\n   -> {out.relative_to(HERE.parent.parent)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
