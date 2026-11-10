"""The usage log: one row in mandate.tool_calls per tool call or search.

Every writer goes through `record` (mandate-api's POST /usage/tool_calls and
Regina's /api/search), so the shape is checked in one place. Best-effort by
contract: logging must never fail the call it records, so callers catch.

    record(con, [{"brain": "wincent", "tool": "find_precedents", ...}])
"""
from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable, Mapping
from typing import Any

BRAINS = ("mandate", "wincent", "regina")
CALLERS = ("agent", "bench", "search", "eval")

COLUMNS = ("mission_id", "brain", "tool", "caller", "args_sha256", "args_summary", "ok",
           "result_count", "citations", "tables", "sources", "ms", "error")

INSERT = (f"INSERT INTO mandate.tool_calls ({', '.join(COLUMNS)}) VALUES "
          f"({', '.join('%(' + c + ')s' for c in COLUMNS)})")


class UsageError(ValueError):
    pass


def args_hash(args: Any) -> str:
    """sha256 of the canonical JSON of the arguments (sorted keys, no spaces):
    the same arguments hash the same in TypeScript (web/lib/mandate/agent/usage.ts)."""
    return hashlib.sha256(json.dumps(args, sort_keys=True, separators=(",", ":"),
                                     ensure_ascii=False).encode()).hexdigest()


def normalise(row: Mapping[str, Any]) -> dict[str, Any]:
    brain = str(row.get("brain") or "")
    if brain not in BRAINS:
        raise UsageError(f"brain must be one of {BRAINS}, not {brain!r}")
    tool = str(row.get("tool") or "").strip()
    if not tool:
        raise UsageError("tool is required")
    caller = str(row.get("caller") or "agent")
    if caller not in CALLERS:
        raise UsageError(f"caller must be one of {CALLERS}, not {caller!r}")
    sha = row.get("args_sha256")
    if sha is None and "args" in row:
        sha = args_hash(row["args"])
    def strs(v: Any) -> list[str]:
        return sorted({str(x) for x in (v or []) if str(x).strip()})[:50]
    def num(v: Any) -> int | None:
        return None if v is None else int(v)
    err = row.get("error")
    return {
        "mission_id": (str(row["mission_id"]) if row.get("mission_id") else None),
        "brain": brain, "tool": tool[:80], "caller": caller,
        "args_sha256": sha,
        "args_summary": str(row.get("args_summary") or "")[:240],
        "ok": bool(row.get("ok", True)),
        "result_count": num(row.get("result_count")),
        "citations": int(row.get("citations") or 0),
        "tables": strs(row.get("tables")), "sources": strs(row.get("sources")),
        "ms": num(row.get("ms")),
        "error": (str(err)[:500] if err else None),
    }


def record(con, rows: Iterable[Mapping[str, Any]]) -> int:
    """Insert the rows on `con` (a psycopg connection; the caller commits)."""
    clean = [normalise(r) for r in rows]
    if clean:
        with con.cursor() as cur:
            cur.executemany(INSERT, clean)
    return len(clean)
