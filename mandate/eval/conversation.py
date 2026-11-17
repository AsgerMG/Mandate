"""A full simulated client conversation on the bench, end to end, judged as a whole.

    PYTHONPATH=. python3 -m mandate.eval.loop converse fintech_guarantees            # at most 8 turns (and the case's max_turns)
    PYTHONPATH=. python3 -m mandate.eval.loop converse fintech_guarantees --turns 4 --max-cost 5

A one-shot re-test shows one reply to one message. A senior is judged on the
moves of a real conversation: the questions first, the diagnosis, holding or
updating under pushback, a fact that changes midway, who to call and the draft,
what to do this week, the full plan as a board. This runs that conversation.

The founder's side is SCRIPTED (the scenario's `client.script`: the anticipated
5-10 messages, each a named move), so the same script before and after a
playbook change is a real measurement, and the client model is rarely called.
After each brain reply:
  1. the brain's questions are matched to the script's `if_asked` answers
     (keywords; the current message's first, then earlier ones, then the
     client-wide list): the founder answers them, and the script waits;
  2. a question nothing answers goes to the client agent (.claude/agents/client.md),
     which answers in one short reply from `hidden_facts` (or NONE);
  3. a check-in ("does that match what you have seen?") or no question: the
     script's next message.
It stops at the script's end, at --turns, or at --max-cost.

The brain (claude -p --agent wincent|regina) keeps one session (--resume), reads a
leave-one-out case library and may not read the answer key. Every message and
every mandate-board block is recorded; the conversation is saved as a bench
conversation (kind eval_conversation) and as a transcript under
mandate/eval/runs/converse/; the judge then grades the WHOLE conversation: the
case's must / must_not over the conversation, and a note per turn (did the reply
do what the move asks; what fell short: no process map when a decision chain
appeared, a dropped habit, an unsourced claim), stored with the conversation.
"""
from __future__ import annotations

import dataclasses
import datetime as dt
import hashlib
import json
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from . import bench, bench_judge, rubric, run_conversation
from .scenarios import Client, Scenario, ScriptStep

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
CONVERSE_RUNS = HERE / "runs" / "converse"
BRAIN_LABEL = {"wincent": "Wincent", "regina": "Regina"}
CLIENT_TOOLS = ["Read"]
DEFAULT_TURNS = 14  # brain turns: the consultation arc runs to some 25-28 messages
MAX_CLIENT_CALLS = 4  # the client model fills gaps; it never drives

# What a senior does with each move. The judge checks each reply against its
# move (plus the script step's own `expect`). A move not listed here is judged
# on its `expect` alone.
MOVES: dict[str, str] = {
    "opener": "Asks only what is decisive and missing (structure first: legal form, establishment, licences or statuses, intent), one or two questions with why each changes the answer; or, when the facts are there, a short diagnosis. Never a list of instruments or laws before the structure is known.",
    "answer": "Uses what the founder just said: diagnoses (the open door, the deal-breaker, what it hinges on), cited or labelled, and checks it with the founder; does not re-ask what was answered.",
    "pushback": "Holds the position or updates it, either way with the reason and the source; never folds to please the client and never digs in without a reason.",
    "fact_change": "Re-runs what the new fact touches, says plainly what changes and what does not, and updates the board (same ids, changed status) rather than starting over.",
    "who_to_call": "Names P1 and P2 by function for each main route, on both sides (political and public-capital, or regulatory), names only when verified, and gives a short formal draft that passes the paper-stack test.",
    "this_week": "A sequenced first week: what first (the filings and registrations that keep later steps possible), who does it, and the one obvious move that is premature.",
    "full_plan": "The plan on the board: every front with its door status, a roadmap with tracks and a watch track, a process map for each decision chain the plan depends on, stakeholders P1/P2 per route, risks and flags; prose short, no tables repeating the board.",
    "decide": "The written deliverable in the playbook order, consistent with the board, with the drafts and the watchlist.",
    "regulatory": "Flags the regulatory question in one line and hands it to Regina, without doing the analysis.",
    "funding": "Flags the funding question in one line and hands it to Wincent, without working it.",
    "narrow": "Narrows to the few that fit, with the reason, instead of listing everything.",
    "use_right": "Grounds the right in the operative provision, cited, and says concretely how to exercise it and what to do if refused.",
    "practical": "Answers concretely (named public sources, costs, steps), nothing generic.",
    "media": "Names outlets and beats (people only when verified) and says when press helps and when it hurts.",
    "timing": "States the dates as they stand today, researched and cited, never from memory.",
}

BOARD_BLOCK = re.compile(r"^(`{3,}|~{3,})mandate-board[^\n]*\n([\s\S]*?)^\1[ \t]*$", re.M)
CHECK_IN = re.compile(
    r"\b(does (that|this) (match|fit|sound|make sense|land|work)|make sense\?|which (way|route|option|one|path) (do|would) you|"
    r"do you (lean|prefer|agree|want me)|shall i|should i (draft|write|put|go)|want me to|would you like( me)?|"
    r"happy (with|to)|ok(ay)? with (that|this)|anything (else|i missed)|is that (right|fair)\?)", re.I)


# ── reading a reply ──────────────────────────────────────────────────────────

def board_blocks(text: str) -> list[dict | None]:
    """The reply's mandate-board blocks, parsed (None for a block that does not parse)."""
    out: list[dict | None] = []
    for m in BOARD_BLOCK.finditer(text):
        try:
            v = json.loads(m.group(2))
            out.append(v if isinstance(v, dict) else None)
        except ValueError:
            out.append(None)
    return out


def _name(x) -> str:
    if isinstance(x, dict):
        for k in ("title", "name", "label", "text", "id"):
            if isinstance(x.get(k), str):
                return x[k][:60]
    return str(x)[:60]


def board_summary(blocks: list[dict | None]) -> dict:
    """Per section, how much is on the board this turn: what the judge reads
    (a process map is there or not) and what the review list shows."""
    sections: dict[str, int] = {}
    names: dict[str, list[str]] = {}
    broken = 0
    for b in blocks:
        if b is None:
            broken += 1
            continue
        for k, v in b.items():
            if k == "routes" and isinstance(v, dict):
                items = [d for lv in v.get("levels") or [] if isinstance(lv, dict) for d in lv.get("doors") or []]
            elif k == "roadmap" and isinstance(v, dict):
                items = v.get("tracks") or []
            elif k == "stakeholders" and isinstance(v, dict):
                items = v.get("institutions") or []
            elif k == "funding_stack" and isinstance(v, dict):
                items = v.get("instruments") or []
            elif isinstance(v, list):
                items = v
            else:
                items = [v]
            sections[k] = sections.get(k, 0) + len(items)
            names.setdefault(k, []).extend(_name(i) for i in items[:6])
    return {"blocks": len(blocks), "broken": broken, "sections": sections, "names": {k: v[:6] for k, v in names.items()}}


def strip_board(text: str) -> str:
    return BOARD_BLOCK.sub("", text).strip()


def questions_in(reply: str) -> list[str]:
    """The sentences of the reply (board left out) that ask the founder something."""
    prose = re.sub(r"`[^`]*`", "", strip_board(reply))
    qs = []
    for line in prose.split("\n"):
        line = re.sub(r"^\s*(?:[-*>]|\d+[.)])\s*", "", line).replace("**", "")
        for sent in re.split(r"(?<=[.?!])\s+", line):
            sent = sent.strip()
            if sent.endswith("?") and len(sent) > 8:
                qs.append(sent)
    return qs


def is_check_in(q: str) -> bool:
    return bool(CHECK_IN.search(q))


def match_answers(questions: list[str], steps: list[ScriptStep], client: Client) -> tuple[list[str], list[str]]:
    """(answers, unmatched questions). The current step's if_asked first, then the
    earlier steps' (latest first), then the client-wide list; each answer once."""
    pools = [a for st in reversed(steps) for a in st.if_asked] + list(client.if_asked)
    answers: list[str] = []
    unmatched: list[str] = []
    for q in questions:
        ql = q.lower()
        hit = next((a for a in pools if any(str(k).lower() in ql for k in a["keywords"])), None)
        if hit:
            if hit["answer"] not in answers:
                answers.append(str(hit["answer"]).strip())
        elif not is_check_in(q):
            unmatched.append(q)
    return answers, unmatched


# ── the client agent (only for the gaps) ─────────────────────────────────────

def client_brief(s: Scenario) -> str:
    c = s.client
    assert c is not None
    p = c.persona
    script = "\n".join(f"{i + 1}. ({st.move}) {st.says}" for i, st in enumerate(c.script))
    facts = "\n".join(f"- {f}" for f in c.hidden_facts)
    return f"""You are the founder in this case.

WHO YOU ARE: {p.get('role', 'the founder')}. Tone: {p.get('tone', 'plain')}. Sophistication: {p.get('sophistication', 'average')}.

THE COMPANY, as you first described it:
{s.founder_says}

YOUR HIDDEN FACTS (reveal one only when asked, or when a founder would say it in the same breath):
{facts}

YOUR SCRIPT (the runner sends these for you, in order; never say them early):
{script}
"""


def client_prompt(reply: str, unmatched: list[str], next_step: ScriptStep | None, first: bool, brief: str) -> str:
    qs = "\n".join(f"- {q}" for q in unmatched)
    nxt = f"Your next scripted message would be: \"{next_step.says}\"" if next_step else "Your script has ended."
    return ((brief + "\n") if first else "") + f"""THE ADVISOR JUST SAID (board data left out):
<<<
{strip_board(reply)[:6000]}
>>>

The questions in it that the script does not answer:
{qs}

{nxt}

Reply with ANSWER: <your short founder reply> or NONE, exactly as your instructions say."""


def parse_client(text: str) -> str | None:
    t = text.strip()
    m = re.search(r"ANSWER:\s*([\s\S]+)", t)
    if m:
        ans = m.group(1).strip().strip('"').strip()
        return ans or None
    return None


# ── the run ──────────────────────────────────────────────────────────────────

@dataclass
class Turn:
    n: int
    move: str
    source: str            # script | if_asked | client_agent
    says: str
    reply: str = ""
    expect: str = ""
    step: int | None = None
    board: dict = field(default_factory=dict)
    duration_s: float = 0.0
    cost_usd: float | None = None


class Budget(Exception):
    pass


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def converse(s: Scenario, *, brain: str, max_turns: int | None = None, max_cost: float | None = None,
             model: str | None = None, tag: str = "converse", runner=None,
             lib_path: Path | None = None, session_note=None, disallowed: list[str] | None = None,
             log=lambda m: print(m, file=sys.stderr, flush=True)) -> dict:
    """Run the conversation. Returns {turns, stopped, client_calls, cost_usd, brain_session, sid}."""
    runner = runner or bench.run_agent
    c = s.client
    if c is None:
        raise ValueError(f"{s.id}: no client block in the scenario")
    # --turns (default 8), never past the case's own max_turns
    limit = min(max_turns or DEFAULT_TURNS, c.max_turns or DEFAULT_TURNS)
    sid = f"converse-{s.id}-{hashlib.sha256(_now().encode()).hexdigest()[:6]}"
    note = session_note(sid) if session_note else bench.brain_session_note(brain, sid)
    note += ("\nThis is a working conversation with the client, not a one-reply re-test: converse step by step "
             "(section 5), and draw the board from the options stage onward.")
    brief = client_brief(s)
    turns: list[Turn] = []
    i = 0
    pending = Turn(n=1, move=c.script[0].move, source="script", says=c.script[0].says, expect=c.script[0].expect, step=0)
    brain_session: str | None = None
    client_session: str | None = None
    client_calls = 0
    cost = 0.0
    stopped = "script_end"
    while True:
        if len(turns) >= limit:
            stopped = "max_turns"
            break
        if max_cost is not None and cost >= max_cost:
            stopped = "max_cost"
            break
        log(f"turn {pending.n} ({pending.move}, {pending.source}): {pending.says[:90]}")
        t = runner(brain, pending.says, tools=bench.BRAIN_TOOLS, model=model, append_system=note, timeout_s=2400,
                   disallowed=disallowed, resume=brain_session)
        brain_session = t["session_id"]
        pending.reply = t["text"].strip()
        pending.duration_s = t.get("duration_s") or 0.0
        pending.cost_usd = t.get("cost_usd")
        cost += float(t.get("cost_usd") or 0.0)
        pending.board = board_summary(board_blocks(pending.reply))
        turns.append(pending)
        log(f"   {BRAIN_LABEL[brain]}: {len(pending.reply)} chars, board {pending.board['sections'] or '-'}, {pending.duration_s}s")
        # what the founder says next
        qs = questions_in(pending.reply)
        answers, unmatched = match_answers(qs, c.script[: i + 1], c)
        nxt = c.script[i + 1] if i + 1 < len(c.script) else None
        source = "if_asked"
        if unmatched and client_calls < MAX_CLIENT_CALLS:
            ct = runner("client", client_prompt(pending.reply, unmatched, nxt, client_session is None, brief),
                        tools=CLIENT_TOOLS, model=model, timeout_s=600, resume=client_session)
            client_session = ct["session_id"]
            client_calls += 1
            cost += float(ct.get("cost_usd") or 0.0)
            extra = parse_client(ct["text"])
            if extra:
                answers.append(extra)
                source = "client_agent" if len(answers) == 1 else "if_asked+client_agent"
        n = len(turns) + 1
        if answers:
            pending = Turn(n=n, move="answer", source=source, says="\n\n".join(answers), step=i)
            continue
        i += 1
        if i >= len(c.script):
            stopped = "script_end"
            break
        st = c.script[i]
        pending = Turn(n=n, move=st.move, source="script", says=st.says, expect=st.expect, step=i)
    return {"turns": turns, "stopped": stopped, "client_calls": client_calls, "cost_usd": round(cost, 4),
            "brain_session": brain_session, "sid": sid, "turn_limit": limit, "script_len": len(c.script),
            "script_reached": max((t.step or 0) for t in turns) + 1 if turns else 0}


# ── the judge, over the whole conversation ───────────────────────────────────

def _board_line(b: dict) -> str:
    if not b or not b.get("blocks"):
        return "no board block"
    parts = [f"{k} {n}" + (f" ({', '.join(b['names'].get(k, [])[:3])})" if k in ("process_maps", "roadmap", "process") else "")
             for k, n in b["sections"].items()]
    return f"board block(s): {', '.join(parts)}" + (f"; {b['broken']} block(s) did not parse" if b.get("broken") else "")


def transcript_for_judge(turns: list[Turn], brain: str) -> str:
    out = []
    for t in turns:
        move = MOVES.get(t.move, "")
        exp = " ".join(x for x in [move, t.expect] if x)
        out.append(f"TURN {t.n} · THE FOUNDER (move: {t.move}; {t.source})\n{t.says}")
        if exp:
            out.append(f"TURN {t.n} · WHAT THE MOVE ASKS OF {BRAIN_LABEL[brain].upper()}: {exp}")
        out.append(f"TURN {t.n} · {BRAIN_LABEL[brain].upper()} ({_board_line(t.board)})\n<<<\n{strip_board(t.reply)}\n>>>")
    return "\n\n".join(out)


def build_conversation_judge_prompt(s: Scenario, turns: list[Turn], brain: str, model_answer: str | None) -> str:
    rub = "\n".join(f"- {c['id']} ({c['kind']}): {c['text']}" for c in s.checkpoints())
    parts = [
        f"CASE: {s.id}",
        "MODE: CONVERSATION. Judge the WHOLE conversation below, not one reply (your instructions, 'Conversations').",
        f"THE CASE AS FIRST STATED:\n{s.founder_says}",
        f"RUBRIC (graded over the whole conversation; every id must be graded):\n{rub}",
    ]
    if model_answer:
        parts.append(f"THE OWNER'S MODEL ANSWER (the standard for the holistic grade):\n{model_answer.strip()}")
    checks = rubric.senior_checks()
    if checks:
        parts.append(f"THE SENIOR CHECKS THE BRAIN IS MEANT TO RUN (method.md):\n{checks}")
    parts.append("THE CONVERSATION (the founder's side is scripted; each founder message names the move it tests; "
                 "the board each reply drew is summarised in its header, its JSON left out):\n\n"
                 + transcript_for_judge(turns, brain))
    parts.append("Grade every checkpoint id over the conversation, give a note for EVERY turn (1 to "
                 f"{len(turns)}), list the ungrounded facts and the data gaps, give your holistic grade, and end "
                 "with the JUDGE line exactly as your instructions specify for a conversation.")
    return "\n\n".join(parts)


TURN_VERDICTS = ("strong", "ok", "short", "wrong")


def normalise_turns(raw: dict, n: int) -> list[dict]:
    got: dict[int, dict] = {}
    for x in raw.get("turns") or []:
        if not isinstance(x, dict):
            continue
        try:
            k = int(x.get("turn"))
        except (TypeError, ValueError):
            continue
        if not 1 <= k <= n:
            continue
        v = str(x.get("verdict", "")).strip().lower()
        got[k] = {"turn": k, "verdict": v if v in TURN_VERDICTS else "ok", "note": str(x.get("note", ""))[:800],
                  "fell_short": [str(f)[:200] for f in (x.get("fell_short") or []) if str(f).strip()][:8]}
    return [got.get(k, {"turn": k, "verdict": None, "note": "not noted by the judge", "fell_short": []}) for k in range(1, n + 1)]


ARC_CHECKS = Path(__file__).resolve().parent / "arc_checks.yaml"


def with_arc_checks(s: Scenario) -> Scenario:
    """The case's rubric plus the consultation arc's checks (arc_checks.yaml),
    appended after the case's own and prefixed "[arc]": how the case is run is
    graded on every conversation, whatever the case."""
    try:
        arc = yaml.safe_load(ARC_CHECKS.read_text()) or {}
    except FileNotFoundError:
        return s
    must = [f"[arc] {x['text']}" for x in arc.get("must") or []]
    must_not = [f"[arc] {x['text']}" for x in arc.get("must_not") or []]
    return dataclasses.replace(s, must=[*s.must, *must], must_not=[*s.must_not, *must_not])


def judge_conversation(s: Scenario, turns: list[Turn], brain: str, *, label: str, runner=None,
                       model: str | None = None) -> dict:
    runner = runner or bench.run_agent
    s = with_arc_checks(s)
    prompt = build_conversation_judge_prompt(s, turns, brain, bench_judge.model_answer_of(s))
    out = runner("judge", prompt, tools=bench.JUDGE_TOOLS, model=model, timeout_s=1200)
    raw = rubric.parse_judgement(out["text"])
    j = rubric.judgement(s, raw)
    return {
        "label": label, "case": s.id, "mode": "conversation", "case_sha256": s.sha256,
        "prompt_sha256": hashlib.sha256(prompt.encode()).hexdigest(), "git_commit": bench_judge._git(),
        "judged_at": _now(), "judge": {"agent": "judge", "model": out.get("model"), "duration_s": out.get("duration_s"),
                                       "session_id": out.get("session_id")},
        **j, "turns": normalise_turns(raw, len(turns)), "reply": out["text"],
    }


# ── saving ───────────────────────────────────────────────────────────────────

def transcript_md(s: Scenario, brain: str, res: dict, ran_at: str, state: dict, left_out: list[str]) -> str:
    lines = [f"# Simulated conversation: {s.id}", "",
             f"Case: `mandate/eval/scenarios/{s.id}.yaml`. Brain: {BRAIN_LABEL[brain]}. Playbooks at {state.get('sha')}"
             f"{' (+uncommitted edits)' if state.get('dirty') else ''}. {ran_at}. {len(res['turns'])} turns "
             f"(script {res['script_reached']}/{res['script_len']}; stopped: {res['stopped']}; client agent called "
             f"{res['client_calls']}x).",
             f"Leave-one-out case library: {len(left_out)} entr{'y' if len(left_out) == 1 else 'ies'} left out"
             f"{' (' + ', '.join(left_out) + ')' if left_out else ''}.", ""]
    for t in res["turns"]:
        lines += [f"## Turn {t.n}: the founder ({t.move}, {t.source})", "", *[f"> {x}" for x in t.says.split("\n")], "",
                  f"## Turn {t.n}: {BRAIN_LABEL[brain]}", "", t.reply, ""]
    return "\n".join(lines)


def conversation_title(case_id: str, ran_at: str, n_turns: int) -> str:
    d = dt.datetime.fromisoformat(ran_at).strftime("%-d %b %Y")
    return f"{case_id.replace('_', ' ').capitalize()}, {d} ({n_turns} turn{'' if n_turns == 1 else 's'})"


def to_bench_conversation(s: Scenario, brain: str, res: dict, *, run_rel: str, ran_at: str, ledger: str | None,
                          judgement: dict | None, judgement_file: str | None, tag: str) -> dict:
    msgs = []
    for t in res["turns"]:
        msgs.append(("client", t.says))
        msgs.append(("agent", t.reply))
    rec = {**judgement, "_file": judgement_file} if judgement else None
    conv = run_conversation.build(case_id=s.id, brain=brain, tag=tag, run_file=run_rel, source="conversation",
                                  ran_at=ran_at, messages=msgs, cites=run_conversation.cites_from_ledger(ledger),
                                  judge=run_conversation.judge_summary(rec),
                                  title=conversation_title(s.id, ran_at, len(res["turns"])))
    conv["kind"] = "eval_conversation"
    er = conv["eval_run"]
    er["mode"] = "conversation"
    er["turns"] = len(res["turns"])
    er["stopped"] = res["stopped"]
    er["script"] = {"reached": res["script_reached"], "length": res["script_len"], "client_calls": res["client_calls"]}
    notes = {x["turn"]: x for x in (judgement or {}).get("turns") or []}
    # every message carries its turn and move; each reply its board summary and the judge's note
    k = 0
    for t in res["turns"]:
        for role in ("client", "agent"):
            if k >= len(conv["messages"]):
                break
            m = conv["messages"][k]
            if m["role"] != role:
                continue
            m["turn"] = t.n
            if role == "client":
                m["sim"] = {"move": t.move, "source": t.source, **({"expect": t.expect} if t.expect else {})}
            else:
                m["board"] = {"blocks": t.board.get("blocks", 0), "sections": t.board.get("sections", {})}
                if t.n in notes:
                    m["judge_note"] = {kk: notes[t.n][kk] for kk in ("verdict", "note", "fell_short")}
            k += 1
    if judgement:
        er["judge"]["turns_short"] = sum(1 for x in judgement.get("turns") or [] if x.get("verdict") in ("short", "wrong"))
    return conv


def save(s: Scenario, brain: str, res: dict, *, judgement: dict | None, judgement_file: str | None, ran_at: str,
         state: dict, left_out: list[str], tag: str = "converse") -> dict:
    CONVERSE_RUNS.mkdir(parents=True, exist_ok=True)
    stem = f"{ran_at[:10]}_{s.id}"
    p = CONVERSE_RUNS / f"{stem}.md"
    n = 2
    while p.exists():
        p, n = CONVERSE_RUNS / f"{stem}_{n}.md", n + 1
    p.write_text(transcript_md(s, brain, res, ran_at, state, left_out))
    run_rel = os.path.relpath(p, REPO)
    conv = to_bench_conversation(s, brain, res, run_rel=run_rel, ran_at=ran_at, ledger=bench.ledger_path(brain, res["sid"]),
                                 judgement=judgement, judgement_file=judgement_file, tag=tag)
    where = run_conversation.write(conv)
    return {"transcript": run_rel, "conversation": conv["id"], "file": str(where)}
