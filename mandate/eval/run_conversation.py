"""An eval run as a bench conversation, so it can be read and reviewed as a chat.

    PYTHONPATH=. python3 -m mandate.eval.run_conversation import          # every saved run
    PYTHONPATH=. python3 -m mandate.eval.run_conversation import --dry-run

The bench app (web/app/bench) keeps its conversations as one JSON file each,
outside the repo (~/Mandate-backups/bench/conversations, MANDATE_BENCH_DATA
overrides). An eval run written here is one of those files with
`kind: "eval_run"` and an `eval_run` tag (case, brain, run tag, the run file,
the judge's grade), the founder's messages and the brain's replies as separate
messages, and the run's citations as `cites`. Train, Review runs lists them; a
reviewer comments on each reply and the comments join the feedback queue
linked to the run, the case and the message.

Two writers, one format (web/lib/bench/model.ts BenchConversation, EvalRun):
  loop.run_case   writes the conversation as the run is saved (from the pieces);
  import          converts the runs already saved (mandate/eval/runs/bench/*.md,
                  mandate/eval/runs/loop/<tag>/*.md) by splitting the transcript.
The id is derived from the run file, so re-importing updates in place, and a
reviewer's comments on a message whose text did not change are kept: never
deleted by a re-import.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
RUNS = HERE / "runs"
JUDGEMENTS = HERE / "judgements"
BRAIN_LABEL = {"wincent": "Wincent", "regina": "Regina"}
BENCH_NOTE = re.compile(r"^\(Bench re-test:.*\)$")
FOLLOWUP_LEAD = "More about us, so you can answer in one go: "
# Sections that end the brain's answer in a saved bench transcript: the run's own
# bookkeeping, for the owner, never part of what the founder was told.
AFTER_ANSWER = re.compile(r"^##\s+(Self-|Claim|Bench (findings|notes)|Grade\b|Owner|Judge)", re.I)


def data_root() -> Path:
    return Path(os.environ.get("MANDATE_BENCH_DATA") or Path.home() / "Mandate-backups" / "bench")


def conversation_id(run_rel: str) -> str:
    """`run-<readable slug>-<hash>` from the run's repo path: stable, within the
    app's id rule (^[a-z0-9][a-z0-9-]{5,63}$)."""
    p = run_rel.replace("mandate/eval/runs/", "").removesuffix(".md")
    slug = re.sub(r"[^a-z0-9]+", "-", p.lower()).strip("-")
    h = hashlib.sha256(run_rel.encode()).hexdigest()[:8]
    return f"run-{slug[:50].strip('-')}-{h}"


def cites_from_ledger(path: Path | str | None) -> dict:
    """The run's claims ledger ([{id, citation: {quote, canonical_url}, label}])
    as the app's `cites` ({id: {quote, label, url}})."""
    if not path:
        return {}
    try:
        rows = json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return {}
    out = {}
    for r in rows if isinstance(rows, list) else []:
        if not isinstance(r, dict) or not r.get("id"):
            continue
        c = r.get("citation") or {}
        out[str(r["id"])] = {k: v for k, v in {"quote": c.get("quote"), "label": r.get("label") or c.get("title"),
                                               "url": c.get("canonical_url")}.items() if v}
    return out


def judge_summary(rec: dict | None) -> dict | None:
    if not rec:
        return None
    return {
        "grade": rec.get("grade"), "holistic": rec.get("holistic_grade"), "scale": rec.get("scale"),
        "must_met": rec.get("must_met"), "must_partly": rec.get("must_partly"), "must_total": rec.get("must_total"),
        "must_not_hit": rec.get("must_not_hit"), "must_not_total": rec.get("must_not_total"),
        "overall": rec.get("overall"), "strongest": rec.get("strongest_move"), "weakest": rec.get("weakest_move"),
        "judged_at": rec.get("judged_at"),
        "judgement": os.path.relpath(rec["_file"], REPO) if rec.get("_file") else None,
    }


def build(*, case_id: str, brain: str, tag: str, run_file: str, messages: list[tuple[str, str]], ran_at: str,
          source: str, cites: dict | None = None, judge: dict | None = None, owner_grade: int | None = None,
          instruction: str | None = None, title: str | None = None) -> dict:
    """The conversation, in the app's BenchConversation shape."""
    if brain not in BRAIN_LABEL:
        raise ValueError(f"unknown brain {brain!r}")
    msgs = [{"role": "client" if r == "client" else "agent", "text": t.strip(), "at": ran_at} for r, t in messages if t.strip()]
    if not any(m["role"] == "agent" for m in msgs):
        raise ValueError(f"{run_file}: no reply from the brain")
    tag_rec = {"kind": "eval_run", "case_id": case_id, "brain": brain, "tag": tag, "run_file": run_file, "source": source,
               "ran_at": ran_at, "grade": (judge or {}).get("grade"), "judge": judge, "owner_grade": owner_grade}
    if instruction:
        tag_rec["instruction"] = instruction
    return {
        "id": conversation_id(run_file), "mandate_id": None, "agent": brain, "brain": brain, "kind": "eval_run",
        "title": title or f"{case_id.replace('_', ' ')} ({tag})", "session_id": None, "messages": msgs,
        "cites": cites or {}, "sources": [], "saved": [], "case": case_id, "eval_run": tag_rec,
        "created_at": ran_at, "updated_at": ran_at,
    }


REVIEW_KEYS_MSG = ("feedback", "reviews")
REVIEW_KEYS_CONV = ("grade", "review_grades")


def merge_reviews(new: dict, old: dict | None) -> dict:
    """Keep what reviewers wrote: a message's comments stay when its text is the
    same; the conversation's grades always stay. Nothing of theirs is dropped."""
    if not old:
        return new
    for k in REVIEW_KEYS_CONV:
        if k in old:
            new[k] = old[k]
    old_msgs = old.get("messages") or []
    orphans = []
    for i, om in enumerate(old_msgs):
        kept = {k: om[k] for k in REVIEW_KEYS_MSG if k in om}
        if not kept:
            continue
        nm = new["messages"][i] if i < len(new["messages"]) else None
        if nm and nm["role"] == om.get("role") and nm["text"] == om.get("text"):
            nm.update(kept)
        else:
            orphans.append({"index": i, "text": (om.get("text") or "")[:600], **kept})
    if orphans or old.get("orphan_reviews"):
        new["orphan_reviews"] = [*(old.get("orphan_reviews") or []), *orphans]
    new["created_at"] = old.get("created_at") or new["created_at"]
    new["updated_at"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    return new


def write(conv: dict, root: Path | None = None) -> Path:
    """Write (or update in place) the conversation file, atomically, owner-only."""
    d = (root or data_root()) / "conversations"
    d.mkdir(parents=True, exist_ok=True, mode=0o700)
    p = d / f"{conv['id']}.json"
    old = None
    if p.exists():
        try:
            old = json.loads(p.read_text())
        except ValueError:
            old = None
    conv = merge_reviews(conv, old)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=f".{conv['id']}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            f.write(json.dumps(conv, indent=2, ensure_ascii=False))
        os.chmod(tmp, 0o600)
        os.replace(tmp, p)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise
    return p


# ── from a live loop run ─────────────────────────────────────────────────────

def founder_message(founder_says: str, founder_followup: str = "") -> str:
    return "\n\n".join(x for x in [founder_says.strip(), founder_followup.strip()] if x)


def from_loop_run(*, s, brain: str, tag: str, run_rel: str, answer: str, ran_at: str, ledger: str | None,
                  judgement: dict | None = None, judgement_file: str | None = None) -> dict:
    """The conversation for a run loop.run_case just made: the founder's one
    message (the brain worked it in one reply, so the follow-up is in it) and
    the answer, with the judge's grade when it judged."""
    rec = {**judgement, "_file": judgement_file} if judgement else None
    return build(case_id=s.id, brain=brain, tag=tag, run_file=run_rel, source="loop", ran_at=ran_at,
                 messages=[("client", founder_message(s.founder_says, s.founder_followup or "")), ("agent", answer)],
                 cites=cites_from_ledger(ledger), judge=judge_summary(rec),
                 instruction="Bench re-test: worked in full in one reply, no questions first.")


# ── from a saved transcript (the importer) ───────────────────────────────────

def _sections(md: str) -> list[tuple[str, list[str]]]:
    """Top-level (##) sections in order; a `#` line before the first `##` is the title."""
    out: list[tuple[str, list[str]]] = [("", [])]
    fence = False
    for line in md.split("\n"):
        if re.match(r"^(`{3,}|~{3,})", line):
            fence = not fence
        if not fence and re.match(r"^##\s", line):
            out.append((line, []))
        else:
            out[-1][1].append(line)
    return out


def _unquote(lines: list[str]) -> str:
    """The blockquoted text of a section (the founder's words), else all of it."""
    q = [re.sub(r"^>\s?", "", l) for l in lines if l.startswith(">")]
    text = "\n".join(q if q else lines)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    # a blockquote wraps at ~90 columns: rejoin its lines into paragraphs
    return "\n\n".join(re.sub(r"\s*\n\s*", " ", p).strip() for p in text.split("\n\n"))


def split_transcript(md: str, brain: str) -> list[tuple[str, str]]:
    """Best effort: the founder's turns and the brain's replies of a saved run.

    The case section -> the founder; "<Brain> asks first" -> a reply (an inline
    "**Founder ...:**" paragraph in it becomes the founder's answer); "founder's
    answers" -> the founder; the answer section, up to the run's own bookkeeping
    (self-score, claims ledger, bench findings, grade) -> the reply. Tool-call
    logs are left out: they are the run's working, not what was said."""
    msgs: list[tuple[str, str]] = []
    answer: list[str] | None = None
    for head, body in _sections(md)[1:]:
        h = head.lower()
        if answer is not None:
            if AFTER_ANSWER.match(head):
                break
            answer += [head, *body]
            continue
        if re.search(r"^##\s+(turn \d+:\s*)?the case\b", h):
            text = _unquote(body)
            if FOLLOWUP_LEAD in text:  # a one-reply run: the follow-up is part of the case message
                text = text.replace(FOLLOWUP_LEAD, "")
            msgs.append(("client", "\n\n".join(p for p in text.split("\n\n") if not BENCH_NOTE.match(p.strip()))))
        elif "asks first" in h:
            text = "\n".join(body).strip()
            m = re.search(r"^\*\*Founder[^*]*\*\*:?\s*", text, re.M)
            if m:
                msgs.append(("agent", text[:m.start()].strip()))
                msgs.append(("client", re.sub(r"\s*\n\s*", " ", text[m.end():]).strip()))
            else:
                msgs.append(("agent", text))
        elif "founder's answers" in h or "founder answers" in h:
            msgs.append(("client", _unquote(body)))
        elif re.search(r"^##\s+(\w+'s )?answer\b", h):
            answer = [*body] if re.search(r"'s answer", h) else [head.replace("## Answer", "## The answer"), *body]
    if answer is not None:
        msgs.append(("agent", "\n".join(answer).strip()))
    return msgs


def _owner_grade(md: str) -> int | None:
    m = re.search(r"^##\s+Grade\b[^\n]*\n+```[^\n]*\n([\s\S]*?)\n```", md, re.M)
    g = m and re.search(r"^grade:\s*([1-5])(?:\s|$|#)", m.group(1), re.M)
    return int(g.group(1)) if g else None


def _latest_judgements() -> dict[str, dict]:
    out: dict[str, dict] = {}
    for p in sorted(JUDGEMENTS.glob("*.json")):
        try:
            rec = json.loads(p.read_text())
        except ValueError:
            continue
        if rec.get("label"):
            out[rec["label"]] = {**rec, "_file": str(p)}
    return out


def _case_of(md: str, stem: str, judged: dict | None, known: list[str]) -> str:
    m = re.search(r"mandate/eval/scenarios/([a-z0-9_-]+)\.yaml", md[:3000])
    if m:
        return m.group(1)
    if judged and judged.get("case"):
        return judged["case"]
    base = re.sub(r"^\d{4}-\d{2}-\d{2}_", "", stem)
    return max((k for k in known if base.startswith(k)), key=len, default=base)


def _brain_of(md: str, case_id: str, file: str) -> str:
    m = re.search(r"\bBrain:\s*(Wincent|Regina)\b", md[:2000])
    if m:
        return m.group(1).lower()
    try:
        from .loop import brain_of
        from .scenarios import load
        return brain_of(load(case_id))
    except Exception:  # noqa: BLE001 (an archived case: read the transcript)
        return "regina" if re.search(r"\bregina\b", md[:1500], re.I) or re.search(r"regulatory|policy", file) else "wincent"


def _ran_at(md: str, path: Path) -> str:
    m = re.search(r"\b(20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:[+-]\d\d:\d\d|Z))", md[:2000])
    if m:
        return m.group(1)
    d = re.match(r"(\d{4}-\d{2}-\d{2})_", path.name)
    if d:
        return f"{d.group(1)}T12:00:00+00:00"
    return dt.datetime.fromtimestamp(path.stat().st_mtime, dt.timezone.utc).isoformat(timespec="seconds")


def from_saved_run(path: Path, *, judgements: dict[str, dict] | None = None, known_cases: list[str] | None = None) -> dict:
    """The conversation for a run already on disk (runs/bench/*.md or runs/loop/<tag>/*.md)."""
    md = path.read_text()
    rel = os.path.relpath(path, REPO)
    judgements = _latest_judgements() if judgements is None else judgements
    if path.parent.parent.name == "loop":
        tag, label, source = path.parent.name, f"loop/{path.parent.name}/{path.stem}", "loop"
        ledger = Path(f"/tmp/{{brain}}-bench-loop-{tag}-{path.stem}.ledger.json")
    else:
        tag, label, source = "bench", path.stem, "bench"
        ledger = path.with_suffix(".ledger.json")
    judged = judgements.get(label)
    if known_cases is None:
        known_cases = sorted(p.stem for p in (HERE / "scenarios").glob("*.yaml"))
    case_id = _case_of(md, path.stem, judged, known_cases)
    brain = _brain_of(md, case_id, path.name)
    ledger = Path(str(ledger).replace("{brain}", brain))
    msgs = split_transcript(md, brain)
    if not any(r == "agent" for r, _ in msgs):  # an unrecognised layout: the whole transcript is the reply
        msgs = [("agent", md)]
    title_tag = tag if tag != "bench" else re.sub(r"^\d{4}-\d{2}-\d{2}_", "", path.stem).removeprefix(case_id).strip("_") or "saved run"
    return build(case_id=case_id, brain=brain, tag=tag, run_file=rel, source=source, ran_at=_ran_at(md, path),
                 messages=msgs, cites=cites_from_ledger(ledger if ledger.exists() else None), judge=judge_summary(judged),
                 owner_grade=_owner_grade(md), title=f"{case_id.replace('_', ' ')} ({title_tag.replace('_', ' ')})")


def saved_runs() -> list[Path]:
    return sorted([*(RUNS / "bench").glob("*.md"), *(RUNS / "loop").glob("*/*.md")])


def cmd_import(a) -> int:
    judgements = _latest_judgements()
    n = 0
    for p in saved_runs():
        try:
            conv = from_saved_run(p, judgements=judgements)
        except (ValueError, OSError) as e:
            print(f"skip {p.relative_to(REPO)}: {e}", file=sys.stderr)
            continue
        roles = "".join("F" if m["role"] == "client" else "B" for m in conv["messages"])
        where = "(dry run)" if a.dry_run else write(conv)
        print(f"{conv['id']}  {conv['eval_run']['brain']:7} {conv['eval_run']['tag']:14} grade {conv['eval_run']['grade']}  {roles}  {where}")
        n += 1
    print(f"{n} runs {'would be ' if a.dry_run else ''}written as conversations under {data_root() / 'conversations'}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    i = sub.add_parser("import")
    i.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    return cmd_import(a)


if __name__ == "__main__":
    sys.exit(main())
