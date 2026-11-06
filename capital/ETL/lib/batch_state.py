"""Pending LLM batch ids, kept in the store (table batch_state, migration 035).

    from batch_state import load, save
    st = load("signals_relevance")        # {"batches": [...], "collected": [...]}
    st["batches"].append(batch.id); save("signals_relevance", st)

A submitted batch is paid for when it is submitted, and its results are only
worth anything if a later run can find it. The id used to be written to a file
under data/, which the weekly container throws away. The first load of a kind
seeds from that legacy file if it exists, so batches submitted from a laptop
before the move are still collected.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from etl_env import DATA  # noqa: E402
from store import connect  # noqa: E402

LEGACY = {
    "signals_relevance": DATA / ".signals_relevance_batches.json",
    "signals_entities": DATA / ".signals_entities_batches.json",
    "signals_signals": DATA / ".signals_signals_batches.json",
}
EMPTY = {"batches": [], "collected": []}


def load(kind: str) -> dict:
    with connect() as con:
        row = con.execute("SELECT state FROM batch_state WHERE kind = %s", (kind,)).fetchone()
        if row is not None:
            return row[0]
        legacy = LEGACY.get(kind)
        st = json.loads(legacy.read_text()) if legacy and legacy.exists() else dict(EMPTY)
        con.execute("INSERT INTO batch_state (kind, state) VALUES (%s, %s::jsonb) "
                    "ON CONFLICT (kind) DO NOTHING", (kind, json.dumps(st)))
        return st


def save(kind: str, st: dict) -> None:
    """Union with what is stored: a batch id, once recorded, is never dropped."""
    with connect() as con:
        row = con.execute("SELECT state FROM batch_state WHERE kind = %s FOR UPDATE",
                          (kind,)).fetchone()
        old = row[0] if row else EMPTY
        merged = {k: list(dict.fromkeys(list(old.get(k, [])) + list(st.get(k, []))))
                  for k in ("batches", "collected")}
        con.execute("INSERT INTO batch_state (kind, state, updated_at) VALUES (%s, %s::jsonb, now()) "
                    "ON CONFLICT (kind) DO UPDATE SET state = excluded.state, updated_at = now()",
                    (kind, json.dumps(merged)))


def pending(kind: str) -> list[str]:
    st = load(kind)
    return [b for b in st["batches"] if b not in st["collected"]]
