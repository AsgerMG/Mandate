"""Run one of the bench agents headless on the owner's Claude Code plan.

    text = run_agent("judge", prompt, tools=["Read"])

Mirrors what the bench app does per turn (web/lib/bench/turns.ts): `claude -p
--agent <name>`, the API key and the nested-session markers stripped from the
environment so the call bills the plan and never the API, tools restricted to
what the agent may use, no MCP servers. The app is the interactive path; this
is the batch path the eval loop and the judge use. No production writes: the
brains reach production only through web/scripts/brain_tool.ts, read-only.
"""
from __future__ import annotations

import json
import os
import subprocess
import time
import uuid
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
RUNS_DIR = "mandate/eval/runs/bench"

STRIP = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "CLAUDE_CODE_USE_BEDROCK",
         "CLAUDE_CODE_USE_VERTEX", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "NODE_OPTIONS", "MANDATE_BENCH_LOCAL")

BRAIN_TOOLS = ["Bash(npx tsx web/scripts/brain_tool.ts *)", "Read", "WebSearch", "WebFetch"]
JUDGE_TOOLS = ["Read"]
INTERVIEWER_TOOLS = ["Read", "Glob", "Grep"]


class BenchError(RuntimeError):
    pass


class UsageLimit(BenchError):
    """Claude Code says the plan's limit is reached: stop, do not retry."""


def child_env() -> dict[str, str]:
    env = {k: v for k, v in os.environ.items() if k not in STRIP and k != "NODE_ENV"}
    return env


def ledger_path(agent: str, sid: str) -> str:
    return f"/tmp/{agent}-bench-{sid}.ledger.json"


def brain_session_note(agent: str, sid: str) -> str:
    """The same note the app appends for a brain turn (turns.ts sessionNote)."""
    return (f"You are talking with the client through the Mandate bench (batch eval run).\n"
            f"Session note: use the scratch ledger {ledger_path(agent, sid)} for every brain_tool call in this run (--run).\n"
            "Reply in plain markdown. Tables are fine. Never show tool names, commands, JSON or file paths.")


def run_agent(agent: str, prompt: str, *, tools: list[str], append_system: str | None = None,
              model: str | None = None, timeout_s: int = 1800, cwd: Path = REPO) -> dict:
    """One headless turn. Returns {text, session_id, duration_s, cost_usd?, usage?}."""
    sid = str(uuid.uuid4())
    args = [os.environ.get("CLAUDE_BIN", "claude"), "-p", "--agent", agent, "--output-format", "json",
            "--session-id", sid, "--permission-mode", "dontAsk", "--strict-mcp-config",
            "--allowedTools", *tools]
    if append_system:
        args += ["--append-system-prompt", append_system]
    if model:
        args += ["--model", model]
    t0 = time.time()
    try:
        p = subprocess.run(args, input=prompt, text=True, capture_output=True, cwd=str(cwd),
                           env=child_env(), timeout=timeout_s, check=False)
    except subprocess.TimeoutExpired as e:
        raise BenchError(f"{agent}: no answer within {timeout_s}s") from e
    tail = (p.stderr or "")[-2000:]
    if p.returncode != 0:
        if _limit(tail) or _limit(p.stdout or ""):
            raise UsageLimit(f"{agent}: usage limit reached. {tail.strip()[-300:]}")
        raise BenchError(f"{agent}: claude exited {p.returncode}: {tail.strip()[-600:]}")
    try:
        out = json.loads(p.stdout)
    except json.JSONDecodeError as e:
        raise BenchError(f"{agent}: claude printed no JSON result: {(p.stdout or '')[:300]}") from e
    if out.get("is_error"):
        msg = str(out.get("result", ""))
        if _limit(msg):
            raise UsageLimit(f"{agent}: usage limit reached. {msg[:300]}")
        raise BenchError(f"{agent}: {msg[:600]}")
    return {"text": str(out.get("result", "")), "session_id": sid, "duration_s": round(time.time() - t0, 1),
            "cost_usd": out.get("total_cost_usd"), "usage": out.get("usage"), "model": out.get("model")}


def _limit(s: str) -> bool:
    s = s.lower()
    return any(k in s for k in ("usage limit", "rate limit", "limit reached", "out of extra usage", "hit your limit"))
