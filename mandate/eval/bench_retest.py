"""The bench app's Re-test, judged the loop's way. Called by web/app/api/bench/retest
(spawned per step; JSON or text in on stdin, out on stdout), so the app and the
loop share ONE judge prompt, ONE grade rule and ONE keep / revert rule:

    python3 -m mandate.eval.bench_retest prompt --scenario <yaml>   < answer.md    -> the judge's prompt
    python3 -m mandate.eval.bench_retest grade  --scenario <yaml>   < reply.md     -> the judgement (JSON)
    python3 -m mandate.eval.bench_retest decide --case <id>         < {before, after} -> KEEP / REVERT (JSON)

prompt is rubric.build_judge_prompt with the case's model answer (bench_judge), grade
is rubric.parse_judgement + rubric.judgement, decide is loop.decide on one case.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys

from . import bench_judge, loop, rubric
from .scenarios import load


def prompt(scenario: str, answer: str) -> str:
    s = load(scenario)
    return rubric.build_judge_prompt(s, rubric.answer_from_run(answer), model_answer=bench_judge.model_answer_of(s))


def grade(scenario: str, reply: str) -> dict:
    s = load(scenario)
    j = rubric.judgement(s, rubric.parse_judgement(reply))
    return {"case": s.id, "case_sha256": s.sha256, "judged_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), **j}


def decide(case: str, before: dict, after: dict) -> dict:
    return {**loop.decide([loop.decide_row(case, before, after)]), "case": case}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("step", choices=["prompt", "grade", "decide"])
    ap.add_argument("--scenario", help="the case's yaml (prompt, grade)")
    ap.add_argument("--case", help="the case id (decide)")
    a = ap.parse_args(argv)
    stdin = sys.stdin.read()
    try:
        if a.step == "prompt":
            sys.stdout.write(prompt(a.scenario, stdin))
        elif a.step == "grade":
            sys.stdout.write(json.dumps(grade(a.scenario, stdin), ensure_ascii=False))
        else:
            d = json.loads(stdin)
            sys.stdout.write(json.dumps(decide(a.case or "", d["before"], d["after"])))
    except rubric.JudgementError as e:
        print(f"the judge's reply has no usable JUDGE line: {e}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
