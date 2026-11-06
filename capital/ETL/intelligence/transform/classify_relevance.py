"""Relevance gate for the news/signals layer (stage 1 of 4).

Runs BEFORE anything else touches an article: general/national press (Politico,
FT, local DE/FR outlets) carries far more noise than signal, and without this
gate the embeddings corpus drowns in politics and sport. Mirrors the SATR
GBER-filter precedent: filter at ingestion, not at query time.

An article is RELEVANT when it informs public-awards intelligence for European
tech companies — any of:
  * public funding to a company (grant, equity, debt, tax credit) or a
    programme/call that awards it;
  * changes to a funding programme's budget, rules, eligibility or timeline;
  * appointments/decisions at funders, ministries or programmes that shape
    future awards;
  * EU/national policy or regulation that changes funding access.
Plain private VC rounds with no public-institution angle are NOT relevant —
the study tracks public support, not the venture market.

Model: claude-haiku-4-5 via Message Batches (50% off), structured JSON output.
Same submit/collect pattern as classify_taxonomy.py: `submit` fires batches and
records IDs; `collect` writes verdicts back whenever the batches end.

Usage:
  python3 ETL/intelligence/transform/classify_relevance.py status
  python3 ETL/intelligence/transform/classify_relevance.py submit [--limit N] [--dry-run]
  python3 ETL/intelligence/transform/classify_relevance.py collect
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DATA  # noqa: E402
from store import connect  # noqa: E402
# --- end ETL path bootstrap ---

import argparse
import json
import os

MODEL = "claude-haiku-4-5"
MAX_TOKENS = 120           # verdict + one short reason
TEXT_CAP = 4000            # chars of article body the gate sees — enough to judge
CHUNK = 5_000              # requests per Message Batch
STATE_FILE = DATA / ".signals_relevance_batches.json"

SYSTEM = """You screen press articles for a database of public funding to European tech companies.

Mark an article RELEVANT only if it informs at least one of:
- a company receiving support from a public institution (grant, public equity or debt, tax credit), or a programme/call that awards such support;
- a change to a public funding programme (budget, rules, eligibility, timeline);
- an appointment or decision at a funder, ministry or programme that shapes future awards;
- EU or national policy/regulation that changes funding access for tech companies.

NOT relevant: private VC/PE rounds with no public-institution involvement, general business or market news, politics without a funding angle, sport, culture.

Articles may be in English, German or French. Reply JSON only:
{"relevant": true/false, "reason": "<one short sentence>"}"""

SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "relevant": {"type": "boolean"},
        "reason": {"type": "string"},
    },
    "required": ["relevant", "reason"],
}


def _params(title: str, text: str, source_name: str) -> dict:
    user = f"Source: {source_name}\nTitle: {title}\n\n{text[:TEXT_CAP]}"
    return {"model": MODEL, "max_tokens": MAX_TOKENS,
            "system": [{"type": "text", "text": SYSTEM,
                        "cache_control": {"type": "ephemeral"}}],
            "output_config": {"format": {"type": "json_schema", "schema": SCHEMA}},
            "messages": [{"role": "user", "content": user}]}


def _pending(con, limit: int | None) -> list[dict]:
    sql = """SELECT a.id, a.title, a.raw_text, s.name AS source_name
             FROM signals_articles a JOIN signals_sources s ON s.id = a.source_id
             WHERE a.is_relevant IS NULL ORDER BY a.id"""
    if limit:
        sql += f" LIMIT {int(limit)}"
    return con.execute(sql).fetchall()


def _parse_json(text: str) -> dict:
    try:
        return json.loads(text)
    except Exception:
        return {}


def _state_load() -> dict:
    # In the store, not in STATE_FILE: the weekly container's disk is scratch,
    # and a batch id lost there is a batch paid for and never collected.
    # STATE_FILE is read once, as the seed (ETL/lib/batch_state.py).
    import batch_state  # noqa: PLC0415
    return batch_state.load("signals_relevance")


def _state_save(st: dict) -> None:
    import batch_state  # noqa: PLC0415
    batch_state.save("signals_relevance", st)


def cmd_status(_args) -> None:
    with connect(readonly=True) as con:
        pending = con.execute(
            "SELECT COUNT(*) FROM signals_articles WHERE is_relevant IS NULL").fetchone()[0]
        done = con.execute(
            "SELECT is_relevant, COUNT(*) FROM signals_articles "
            "WHERE is_relevant IS NOT NULL GROUP BY is_relevant ORDER BY is_relevant"
        ).fetchall()
    st = _state_load()
    uncollected = [b for b in st["batches"] if b not in st["collected"]]
    print(f"pending relevance verdicts: {pending:,}")
    for flag, n in done:
        print(f"  {'relevant' if flag else 'rejected'}: {n:,}")
    if uncollected:
        print(f"uncollected batches: {len(uncollected)} — run `collect`")


def cmd_submit(args) -> None:
    with connect(readonly=True, dict_rows=True) as con:
        rows = _pending(con, args.limit)
    if not rows:
        print("nothing pending — no articles awaiting a relevance verdict.")
        return
    requests = [{"custom_id": f"r{r['id']}",
                 "params": _params(r["title"], r["raw_text"], r["source_name"])}
                for r in rows]
    est = len(requests) * 0.0005  # Haiku batch, small classification prompt
    print(f"submitting {len(requests):,} relevance requests ({MODEL}, batched)")
    print(f"estimated batch cost: ~${est:.0f}")
    if args.dry_run:
        print("dry-run: not submitting.")
        return
    if args.max_cost is not None and est > args.max_cost:
        print(f"SKIPPED: estimated ~${est:.0f} exceeds --max-cost ${args.max_cost:.0f} "
              f"-- needs manual approval. Not submitting.")
        return
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY not set (checked env + .env.local)")
    import anthropic
    client = anthropic.Anthropic()
    st = _state_load()
    for start in range(0, len(requests), CHUNK):
        part = requests[start:start + CHUNK]
        batch = client.messages.batches.create(requests=part)
        st["batches"].append(batch.id)
        _state_save(st)
        print(f"  submitted {batch.id} ({len(part)} requests)")
    print("all submitted — run `collect` once the batches end (usually <1h).")


def cmd_collect(_args) -> None:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY not set")
    import anthropic
    client = anthropic.Anthropic()
    st = _state_load()
    pending_ids = [b for b in st["batches"] if b not in st["collected"]]
    if not pending_ids:
        print("no uncollected batches recorded.")
        return
    with connect() as con:
        written, errored, still = _collect(client, st, pending_ids, con)
    print(f"\ncollected {written} verdicts ({errored} errored, {still} still processing).")


def _collect(client, st: dict, pending_ids: list[str], con) -> tuple[int, int, int]:
    written = errored = still = 0
    for bid in pending_ids:
        b = client.messages.batches.retrieve(bid)
        if b.processing_status != "ended":
            still += 1
            print(f"  {bid}: {b.processing_status} — leaving for later")
            continue
        updates = []
        for res in client.messages.batches.results(bid):
            aid = int(res.custom_id[1:])
            if res.result.type != "succeeded":
                errored += 1
                continue
            text = next((bl.text for bl in res.result.message.content
                         if bl.type == "text"), "{}")
            data = _parse_json(text)
            if "relevant" not in data:
                errored += 1
                continue
            updates.append((1 if data["relevant"] else 0,
                            (data.get("reason") or "")[:300], aid))
            written += 1
        con.cursor().executemany(
            "UPDATE signals_articles SET is_relevant = %s, relevance_reason = %s "
            "WHERE id = %s", updates)
        con.commit()
        st["collected"].append(bid)
        _state_save(st)
        print(f"  {bid}: wrote {len(updates)} verdicts")
    return written, errored, still


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    p = sub.add_parser("submit")
    p.add_argument("--limit", type=int)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--max-cost", type=float, default=None,
                   help="skip submitting if estimated cost exceeds this (cron use)")
    p.set_defaults(fn=cmd_submit)
    sub.add_parser("collect").set_defaults(fn=cmd_collect)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
