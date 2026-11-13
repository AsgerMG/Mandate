"""The self-improvement loop, closed, on the bench (no API spend).

    PYTHONPATH=. python3 -m mandate.eval.loop run fintech_guarantees robotics_deployment_it --tag after_scaffold
    PYTHONPATH=. python3 -m mandate.eval.loop table                      # every case: baseline vs each tag
    PYTHONPATH=. python3 -m mandate.eval.loop diagnose --tag after_scaffold
    PYTHONPATH=. python3 -m mandate.eval.loop propose --tag after_scaffold --apply
    PYTHONPATH=. python3 -m mandate.eval.loop decide --proposal 1 --before after_scaffold --after iter1

run      the brain works each case in one reply (the bench's re-test mode), the
         answer is saved under mandate/eval/runs/loop/<tag>/<case>.md, and the
         judge grades it (a judgement record under mandate/eval/judgements/);
         the run is also written as a bench conversation (run_conversation.py),
         to read and comment as a chat in the bench app's Train, Review runs.
table    the score table from the newest judgement per (case, tag); baseline =
         the saved bench runs (runs/bench) judged as they were.
diagnose the weakest moves across a tag's judgements: every must not met or
         partly, every must_not hit, grouped by the senior check it belongs to.
propose  the interviewer proposes ONE smallest playbook change for the weakest
         move, in the bench's file-block format; --apply writes it into the
         working tree (git shows the diff) and names the cases to re-test.
decide   compare the proposal's affected cases before and after: KEEP when the
         mean grade does not fall, no case falls, no new must_not is hit;
         otherwise REVERT the proposal's files (git checkout). Appended to
         mandate/eval/loop/log.jsonl either way: the record is the point.

Every step stops at the plan's usage limit (exit 3) rather than looping.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import bench, bench_judge, case_library, rubric, run_conversation
from .scenarios import Scenario, all_scenarios, load

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
LOOP_RUNS = HERE / "runs" / "loop"
LOOP_DIR = HERE / "loop"
PROPOSALS = LOOP_DIR / "proposals"
LOG = LOOP_DIR / "log.jsonl"
PLAYBOOKS = REPO / "mandate" / "playbooks"
BENCH_RUNS = HERE / "runs" / "bench"
BRAIN_LABEL = {"wincent": "Wincent", "regina": "Regina"}
# The app reads the playbooks through a generated TS mirror (a vitest fails when it drifts):
# every write to, or revert of, a playbook regenerates or reverts it too.
PLAYBOOKS_TS = "web/lib/mandate/agent/playbooks.generated.ts"


def emit_playbooks_ts() -> None:
    subprocess.run(["npx", "tsx", "scripts/emit_playbooks.ts"], cwd=REPO / "web", check=False, capture_output=True)

CHECKS = {
    "open_door": r"level|open door|lead with|regional|national|local",
    "activity_vs_support": r"activity|support|access the|permission to|may (the|we|it)",
    "status_unlocks": r"status|licen|authoris|registration|regime|intermediar",
    "reform_or_lobby": r"reform|lobby|rule change|parliament|ministry|political",
    "sequencing": r"sequenc|before|first|order|incentive effect|timeline|plan step",
    "who_decides": r"p1|p2|function|who decides|stakeholder|bodies|names",
    "what_not_yet": r"not to do|premature|default first step|claim|certif",
    "precedent": r"precedent|none was found|none found",
    "grounding": r"cited|citation|unverified|assert|generalis",
    "structure_first": r"structure|establish|entity|ask",
}


def brain_of(s: Scenario) -> str:
    return "regina" if re.search(r"policy|regulat", f"{s.job} {s.id}") else "wincent"


def retest_message(s: Scenario) -> str:
    return "\n\n".join(x for x in [
        s.founder_says,
        f"More about us, so you can answer in one go: {s.founder_followup}" if s.founder_followup else "",
        "(Bench re-test: work the case in full in this one reply; do not stop to ask questions first. Do not save the run.)",
    ] if x)


def _git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=REPO, text=True, capture_output=True, check=False).stdout.strip()


def playbooks_state() -> dict:
    files = sorted(str(p.relative_to(REPO)) for p in PLAYBOOKS.rglob("*.md"))
    return {"sha": _git("rev-parse", "--short=10", "HEAD"), "dirty": _git("status", "--porcelain", "--", *files) != ""}


# ── leave-one-out ────────────────────────────────────────────────────────────
# An evaluated case must never see its own answer key: the library entries written
# from it, the scenario yaml (must / must_not / model_answer), its saved runs, its
# judgements. The brain reads a per-run library (named in the session note) and is
# denied Read on the answer-key paths. The static library stays for live use.

LOO_DIR = Path("/tmp/mandate-loo")
ANSWER_KEY_READS = ["Read(./mandate/eval/**)", "Read(./mandate/playbooks/cases/**)"]


def write_loo_library(brain: str, case_id: str, tag: str, root: Path | None = None) -> tuple[Path, list[str]]:
    text, left_out = case_library.render_without(brain, case_id)
    p = (root or LOO_DIR) / tag / case_id / f"{brain}.md"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)
    return p, left_out


def loo_session_note(brain: str, sid: str, lib_path: Path) -> str:
    return (bench.brain_session_note(brain, sid) + "\n"
            f"Case library for this run: read {lib_path} INSTEAD of mandate/playbooks/cases/{brain}.md "
            "(an eval run; the case's own lessons are left out). Do not read anything under mandate/eval/.")


# ── run ──────────────────────────────────────────────────────────────────────

def run_case(s: Scenario, tag: str, *, judge: bool = True, model: str | None = None) -> dict:
    brain = brain_of(s)
    out_dir = LOOP_RUNS / tag
    out_dir.mkdir(parents=True, exist_ok=True)
    md_path = out_dir / f"{s.id}.md"
    if md_path.exists():
        n = 2
        while (out_dir / f"{s.id}_{n}.md").exists():
            n += 1
        md_path = out_dir / f"{s.id}_{n}.md"
    state = playbooks_state()
    sid = f"loop-{tag}-{s.id}"  # one ledger per case: parallel runs must not share citation ids
    lib_path, left_out = write_loo_library(brain, s.id, tag)
    t = bench.run_agent(brain, retest_message(s), tools=bench.BRAIN_TOOLS, model=model,
                        append_system=loo_session_note(brain, sid, lib_path), timeout_s=2400,
                        disallowed=ANSWER_KEY_READS)
    md = "\n".join([
        f"# Loop run: {s.id} ({tag})",
        "",
        f"Case: `mandate/eval/scenarios/{s.id}.yaml`. Brain: {BRAIN_LABEL[brain]}. Playbooks at {state['sha']}"
        f"{' (+uncommitted edits)' if state['dirty'] else ''}. One-reply re-test on the bench (no API spend), "
        f"{dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')}, {t['duration_s']}s.",
        f"Leave-one-out case library: {len(left_out)} entr{'y' if len(left_out) == 1 else 'ies'} derived from this case left out"
        f"{' (' + ', '.join(left_out) + ')' if left_out else ''}; reads of mandate/eval/ and mandate/playbooks/cases/ denied.",
        "",
        "## The case",
        "",
        *[f"> {line}" for line in retest_message(s).split("\n")],
        "",
        f"## {BRAIN_LABEL[brain]}'s answer",
        "",
        t["text"].strip(),
        "",
    ])
    md_path.write_text(md)
    rec = {"case": s.id, "tag": tag, "brain": brain, "run": os.path.relpath(md_path, REPO), "duration_s": t["duration_s"],
           "leave_one_out": left_out}
    if judge:
        j = bench_judge.judge_answer(s, md, label=f"loop/{tag}/{md_path.stem}")
        p = bench_judge.save(j)
        rec.update({"grade": j["grade"], "holistic": j["holistic_grade"], "must_met": j["must_met"], "must_partly": j["must_partly"],
                    "must_total": j["must_total"], "must_not_hit": j["must_not_hit"], "judgement": str(p.relative_to(REPO))})
    rec["conversation"] = save_as_conversation(s, brain=brain, tag=tag, md_path=md_path, answer=t["text"], sid=sid,
                                               judgement=j if judge else None, judgement_file=str(p) if judge else None)
    return rec


def save_as_conversation(s: Scenario, *, brain: str, tag: str, md_path: Path, answer: str, sid: str,
                         judgement: dict | None, judgement_file: str | None) -> str | None:
    """The run as a bench conversation (Train, Review runs), next to the transcript.
    A failure here never fails the run: the transcript is the record."""
    try:
        conv = run_conversation.from_loop_run(
            s=s, brain=brain, tag=tag, run_rel=os.path.relpath(md_path, REPO), answer=answer, ran_at=_now(),
            ledger=bench.ledger_path(brain, sid), judgement=judgement, judgement_file=judgement_file)
        run_conversation.write(conv)
        return conv["id"]
    except Exception as e:  # noqa: BLE001
        print(f"warning: the run was not written as a conversation: {e}", file=sys.stderr)
        return None


def cmd_run(a) -> int:
    cases = [load(c) for c in a.cases]
    results: list[dict] = []
    stop = False

    def one(s: Scenario):
        nonlocal stop
        if stop:
            return None
        try:
            r = run_case(s, a.tag, judge=not a.no_judge, model=a.model)
            print(json.dumps(r), flush=True)
            return r
        except bench.UsageLimit as e:
            stop = True
            print(f"STOP: {e}", file=sys.stderr, flush=True)
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"case": s.id, "tag": a.tag, "error": str(e)[:500]}), flush=True)
        return None

    with ThreadPoolExecutor(max_workers=a.parallel) as ex:
        for r in ex.map(one, cases):
            if r:
                results.append(r)
    _append_log({"step": "run", "tag": a.tag, "at": _now(), "results": results})
    return 3 if stop else 0


# ── table ────────────────────────────────────────────────────────────────────

def judgements_by_case() -> dict[str, dict[str, dict]]:
    """case -> tag -> newest judgement for a loop tag; the saved bench runs are
    each their own 'baseline' entry under `baseline_runs` (one case may have
    several saved runs, every one a measurement)."""
    out: dict[str, dict[str, dict]] = {}
    for label, rec in bench_judge.latest_judgements().items():
        case = out.setdefault(rec["case"], {})
        if label.startswith("loop/"):
            tag = label.split("/")[1]
            if tag not in case or rec["judged_at"] > case[tag]["judged_at"]:
                case[tag] = rec
        else:
            case.setdefault("baseline_runs", {})[label] = rec
    return out


def _cell(r: dict) -> str:
    return f"**{r['grade']}** (h{r['holistic_grade'] or '?'}; {r['must_met']}+{r['must_partly']}p/{r['must_total']}; hit {r['must_not_hit']})"


def table_markdown(tags: list[str] | None = None) -> str:
    byc = judgements_by_case()
    all_tags = tags or sorted({t for v in byc.values() for t in v} - {"baseline_runs"})
    cols = ["baseline (saved runs)", *all_tags]
    lines = ["| case | brain | " + " | ".join(cols) + " |", "|---|---|" + "---|" * len(cols)]
    for s in all_scenarios():
        row = byc.get(s.id, {})
        base = row.get("baseline_runs", {})
        cells = ["<br>".join(f"{lab.split('_', 1)[-1]}: {_cell(r)}" for lab, r in sorted(base.items()))]
        for t in all_tags:
            r = row.get(t)
            cells.append("" if not r else _cell(r))
        flag = " (held-out)" if s.id.startswith("heldout_") else ""
        lines.append(f"| {s.id}{flag} | {brain_of(s)} | " + " | ".join(cells) + " |")
    lines.append("")
    lines.append("Cell: rule grade (judge's holistic grade; musts met + partly / total; must_nots hit). Baseline = the saved bench runs as they were.")
    return "\n".join(lines)


# ── diagnose ─────────────────────────────────────────────────────────────────

def check_of(text: str) -> str:
    t = text.lower()
    best, hits = "other", 0
    for name, pat in CHECKS.items():
        n = len(re.findall(pat, t))
        if n > hits:
            best, hits = name, n
    return best


def diagnose(tag: str) -> dict:
    byc = judgements_by_case()
    moves: dict[str, dict] = {}
    cases_seen = []
    for case, tags in byc.items():
        rec = tags.get(tag)
        if not rec:
            continue
        cases_seen.append(case)
        s = load(case)
        texts = {c["id"]: c["text"] for c in s.checkpoints()}
        for c in rec["checkpoints"]:
            w = {"not_met": 1.0, "partly": 0.5, "hit": 1.5, "borderline": 0.5}.get(c["verdict"], 0.0)
            if not w:
                continue
            chk = check_of(texts[c["id"]])
            m = moves.setdefault(chk, {"check": chk, "weight": 0.0, "failures": []})
            m["weight"] += w
            m["failures"].append({"case": case, "id": c["id"], "verdict": c["verdict"], "checkpoint": texts[c["id"]][:200], "reason": c["reason"]})
    ranked = sorted(moves.values(), key=lambda m: -m["weight"])
    return {"tag": tag, "cases": cases_seen, "weakest": ranked}


def cmd_diagnose(a) -> int:
    d = diagnose(a.tag)
    print(f"Diagnosis of tag {a.tag!r} over {len(d['cases'])} cases: {', '.join(d['cases'])}\n")
    for m in d["weakest"]:
        print(f"- {m['check']}: weight {m['weight']:.1f}, {len(m['failures'])} failures")
        for f in m["failures"][:6]:
            print(f"    {f['case']} {f['id']} {f['verdict']}: {f['reason'][:110]}")
    LOOP_DIR.mkdir(exist_ok=True)
    (LOOP_DIR / f"diagnosis_{a.tag}.json").write_text(json.dumps(d, indent=1, ensure_ascii=False) + "\n")
    return 0


# ── propose ──────────────────────────────────────────────────────────────────

FILE_BLOCK = re.compile(r"^(`{3,}|~{3,})file\s+path=[\"']?([^\s\"'`]+)[\"']?[^\n]*\n([\s\S]*?)^\1[ \t]*$", re.M)
PROPOSAL_PATH = re.compile(r"^mandate/playbooks/(?:[a-z0-9][a-z0-9_.-]*\.md|cases/[a-z]+\.md)$")


def propose_prompt(d: dict, brain: str) -> str:
    top = d["weakest"][0]
    fails = "\n".join(f"- {f['case']} / {f['id']} ({f['verdict']}): checkpoint: {f['checkpoint']} | judge: {f['reason']}" for f in top["failures"])
    files = ", ".join(f"mandate/playbooks/{p.name}" for p in sorted(PLAYBOOKS.glob("*.md")) if p.name != "README.md")
    return f"""The eval loop judged {BRAIN_LABEL[brain]}'s answers on {len(d['cases'])} cases ({', '.join(d['cases'])}).
The weakest move, by weight of failed checkpoints, is the senior check "{top['check']}". The failures:

{fails}

Read the playbooks ({files}) and the senior checks in mandate/playbooks/method.md ("Before answering").
Propose exactly ONE change, the smallest playbook edit that would have prevented these failures: a habit,
general (essence, not literal: no country, company or fund names in the rule), in the owner's register.
Write it as a complete new version of ONE file in the file-block format (four backticks, info string
`file path=mandate/playbooks/<name>.md`). Keep everything in the file that is still true. Then, outside
the block, one line: which cases to re-test (the ones that failed this move) and why this habit, in the
owner's words where possible. Do not propose a second file."""


def cmd_propose(a) -> int:
    d = diagnose(a.tag)
    if not d["weakest"]:
        print("nothing to fix: no failed checkpoints in this tag")
        return 0
    brain = a.brain or brain_of(load(d["cases"][0]))
    try:
        t = bench.run_agent("interviewer", propose_prompt(d, brain), tools=bench.INTERVIEWER_TOOLS, timeout_s=900)
    except bench.UsageLimit as e:
        print(f"STOP: {e}", file=sys.stderr)
        return 3
    blocks = [(m.group(2).lstrip("./"), m.group(3)) for m in FILE_BLOCK.finditer(t["text"])]
    blocks = [(p, c) for p, c in blocks if PROPOSAL_PATH.match(p) and ".." not in p]
    PROPOSALS.mkdir(parents=True, exist_ok=True)
    n = len(list(PROPOSALS.glob("*.md"))) + 1
    top = d["weakest"][0]
    affected = sorted({f["case"] for f in top["failures"]})
    rec = {"n": n, "tag": a.tag, "check": top["check"], "brain": brain, "files": [p for p, _ in blocks], "affected_cases": affected,
           "at": _now(), "applied": False}
    out = PROPOSALS / f"{n:02d}_{top['check']}.md"
    out.write_text(f"# Proposal {n}: {top['check']} (from tag {a.tag})\n\n{t['text'].strip()}\n")
    if not blocks:
        print(f"the interviewer proposed no file block; see {out.relative_to(REPO)}")
        _append_log({"step": "propose", **rec, "note": "no file block"})
        return 1
    if len(blocks) > 1:
        print(f"the interviewer proposed {len(blocks)} files; only the first is used: {blocks[0][0]}")
        blocks = blocks[:1]
        rec["files"] = [blocks[0][0]]
    if a.apply:
        for p, content in blocks:
            (REPO / p).write_text(content if content.endswith("\n") else content + "\n")
        emit_playbooks_ts()
        rec["applied"] = True
    _append_log({"step": "propose", **rec})
    print(json.dumps(rec, indent=1))
    print(f"proposal saved: {out.relative_to(REPO)}" + (" (applied to the working tree)" if a.apply else " (not applied: --apply)"))
    return 0


# ── decide ───────────────────────────────────────────────────────────────────

def compare(before_tag: str, after_tag: str, cases: list[str]) -> dict:
    byc = judgements_by_case()
    rows, missing = [], []
    for c in cases:
        b, af = byc.get(c, {}).get(before_tag), byc.get(c, {}).get(after_tag)
        if not b or not af:
            missing.append(c)
            continue
        rows.append({"case": c, "before": b["grade"], "after": af["grade"], "must_before": b["must_met"] + 0.5 * b["must_partly"],
                     "must_after": af["must_met"] + 0.5 * af["must_partly"], "hit_before": b["must_not_hit"], "hit_after": af["must_not_hit"]})
    if not rows:
        return {"keep": False, "reason": "no case has both before and after judgements", "rows": rows, "missing": missing}
    mean_b = sum(r["before"] for r in rows) / len(rows)
    mean_a = sum(r["after"] for r in rows) / len(rows)
    fell = [r["case"] for r in rows if r["after"] < r["before"]]
    new_hits = [r["case"] for r in rows if r["hit_after"] > r["hit_before"]]
    must_down = [r["case"] for r in rows if r["must_after"] < r["must_before"]]
    improved = mean_a > mean_b or (mean_a == mean_b and sum(r["must_after"] for r in rows) > sum(r["must_before"] for r in rows))
    keep = improved and not fell and not new_hits and not must_down
    reason = ("improved and nothing regressed" if keep else
              "; ".join(x for x in [
                  "" if improved else f"mean grade {mean_b:.2f} -> {mean_a:.2f} did not improve",
                  f"fell on {fell}" if fell else "", f"new must_not hits on {new_hits}" if new_hits else "",
                  f"musts down on {must_down}" if must_down else ""] if x))
    return {"keep": keep, "reason": reason, "mean_before": round(mean_b, 2), "mean_after": round(mean_a, 2), "rows": rows, "missing": missing}


def cmd_decide(a) -> int:
    props = [json.loads(l) for l in LOG.read_text().splitlines() if l.strip()] if LOG.exists() else []
    prop = next((p for p in reversed(props) if p.get("step") == "propose" and p.get("n") == a.proposal), None)
    if not prop:
        raise SystemExit(f"no proposal {a.proposal} in {LOG}")
    cases = a.cases or prop["affected_cases"]
    c = compare(a.before, a.after, cases)
    verdict = "KEEP" if c["keep"] else "REVERT"
    if not c["keep"] and prop.get("applied") and not a.dry_run:
        subprocess.run(["git", "checkout", "--", *prop["files"], PLAYBOOKS_TS], cwd=REPO, check=False)
    rec = {"step": "decide", "proposal": a.proposal, "before": a.before, "after": a.after, "verdict": verdict, **c, "at": _now(), "files": prop["files"]}
    _append_log(rec)
    print(json.dumps(rec, indent=1))
    return 0


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def _append_log(rec: dict) -> None:
    LOOP_DIR.mkdir(exist_ok=True)
    with LOG.open("a") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run"); r.add_argument("cases", nargs="+"); r.add_argument("--tag", required=True)
    r.add_argument("--no-judge", action="store_true"); r.add_argument("--parallel", type=int, default=3); r.add_argument("--model")
    t = sub.add_parser("table"); t.add_argument("--tags", nargs="*")
    d = sub.add_parser("diagnose"); d.add_argument("--tag", required=True)
    p = sub.add_parser("propose"); p.add_argument("--tag", required=True); p.add_argument("--apply", action="store_true"); p.add_argument("--brain", choices=["wincent", "regina"])
    e = sub.add_parser("decide"); e.add_argument("--proposal", type=int, required=True); e.add_argument("--before", required=True)
    e.add_argument("--after", required=True); e.add_argument("--cases", nargs="*"); e.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    if a.cmd == "run":
        return cmd_run(a)
    if a.cmd == "table":
        print(table_markdown(a.tags)); return 0
    if a.cmd == "diagnose":
        return cmd_diagnose(a)
    if a.cmd == "propose":
        return cmd_propose(a)
    return cmd_decide(a)


if __name__ == "__main__":
    sys.exit(main())
