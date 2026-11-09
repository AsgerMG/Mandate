"""Signal tagging for the news/signals layer (stage 3 of 4).

Turns each relevant, entity-linked article into zero or more typed signals —
the "what to anticipate / who to monitor" payload the rebuilt brief consumes.

REGISTER (site-wide rule, non-negotiable): public-awards intelligence, never
competitive urgency. Summaries state where, for what and how entities received
or may receive public funding. No FOMO framing, no "act before X gets ahead",
no race metaphors. The taxonomy names themselves follow the rule
(stakeholder_appointment not personnel-move, partnership_collaboration not
competitive-move).

Six signal types:
  funding_award             an entity received public support per the article
                            (press often precedes the official registers)
  funding_pipeline_signal   an entity is in-process (shortlisted, applying,
                            call opening) — the core "what to anticipate"
  programme_policy_change   a programme's budget/rules/eligibility/timeline moved
  stakeholder_appointment   a decision-shaping person took a new role — the
                            core "who to monitor"
  partnership_collaboration entities or funders formed a consortium/partnership
  regulatory_development    EU/national policy affecting funding access

Model: claude-sonnet-5 (judgement-heavy: typed extraction + impact text),
Message Batches. Note: Sonnet 5 enables adaptive thinking by default — it is
explicitly disabled here so the structured output keeps the whole budget.

Usage:
  python3 ETL/intelligence/transform/classify_signals.py status
  python3 ETL/intelligence/transform/classify_signals.py submit [--limit N] [--dry-run]
  python3 ETL/intelligence/transform/classify_signals.py collect
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
from datetime import datetime, timezone

MODEL = "claude-sonnet-5"
MAX_TOKENS = 900           # a handful of signal objects with impact text
TEXT_CAP = 6000
CHUNK = 2_000
STATE_FILE = DATA / ".signals_signals_batches.json"

SIGNAL_TYPES = [
    "funding_award", "funding_pipeline_signal", "programme_policy_change",
    "stakeholder_appointment", "partnership_collaboration", "regulatory_development",
]

SYSTEM = """You tag press articles with public-funding signals for a database serving European tech companies that seek public support.

Signal types (tag every one the article substantiates; an article may yield none):
- funding_award: an entity received support from a public institution (grant, public equity or debt, tax credit).
- funding_pipeline_signal: an entity is in-process for a programme (shortlisted, applying, negotiating) or a call/tranche is opening.
- programme_policy_change: a funding programme's budget, rules, eligibility or timeline changed.
- stakeholder_appointment: a named person took a decision-shaping role at a funder, ministry or programme.
- partnership_collaboration: entities or funders formed a partnership, consortium or joint programme relevant to public funding.
- regulatory_development: an EU or national regulatory/policy development that changes funding access.

For each signal:
- "summary": ONE declarative sentence. State where, for what and how — who, which instrument, which amount if printed. Data-desk register (Economist/FT): active voice, no hype.
- "anticipated_impact": one or two sentences on what a funding-seeking company can usefully take from this — a programme to examine, a precedent that clarifies what an instrument funds, a person or decision worth monitoring. Omit the field when there is nothing actionable.
- "confidence": 0.0-1.0 — how directly the article substantiates the signal (stated fact ~0.9; strong implication ~0.6; weak inference: do not tag).

REGISTER RULES (mandatory): informational and benchmarking, never alarmist. FORBIDDEN: urgency framing about other companies ("rivals are pulling ahead", "act now", "don't miss"), race metaphors, and the words "significant", "leverage" (as a verb), "ecosystem", "synergies", "stakeholders", "innovative". No em-dashes. Private VC/PE activity with no public-institution angle is never a signal.

Articles may be in English, German or French; write signals in English. Reply JSON only:
{"signals": [{"signal_type": "...", "confidence": 0.9, "summary": "...", "anticipated_impact": "..."}]}"""

SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "signals": {
            "type": "array",
            "items": {
                "type": "object", "additionalProperties": False,
                "properties": {
                    "signal_type": {"type": "string", "enum": SIGNAL_TYPES},
                    "confidence": {"type": "number"},
                    "summary": {"type": "string"},
                    "anticipated_impact": {"type": "string"},
                },
                "required": ["signal_type", "confidence", "summary"],
            },
        },
    },
    "required": ["signals"],
}


def _params(title: str, text: str, source_name: str) -> dict:
    user = f"Source: {source_name}\nTitle: {title}\n\n{text[:TEXT_CAP]}"
    return {"model": MODEL, "max_tokens": MAX_TOKENS,
            "thinking": {"type": "disabled"},
            "system": [{"type": "text", "text": SYSTEM,
                        "cache_control": {"type": "ephemeral"}}],
            "output_config": {"format": {"type": "json_schema", "schema": SCHEMA}},
            "messages": [{"role": "user", "content": user}]}


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
    return batch_state.load("signals_signals")


def _state_save(st: dict) -> None:
    import batch_state  # noqa: PLC0415
    batch_state.save("signals_signals", st)


def cmd_status(_args) -> None:
    with connect(readonly=True) as con:
        pending = con.execute(
            "SELECT COUNT(*) FROM signals_articles WHERE is_relevant = 1 "
            "AND full_text_fetched = 1 AND signals_extracted_at IS NULL").fetchone()[0]
        by_type = con.execute(
            "SELECT signal_type, COUNT(*) FROM signals_article_signals "
            "GROUP BY signal_type ORDER BY 2 DESC").fetchall()
    st = _state_load()
    uncollected = [b for b in st["batches"] if b not in st["collected"]]
    print(f"awaiting signal tagging: {pending:,}")
    for stype, n in by_type:
        print(f"  {stype:<26} {n:>6,}")
    if uncollected:
        print(f"uncollected batches: {len(uncollected)} — run `collect`")


def cmd_submit(args) -> None:
    sql = ("SELECT a.id, a.title, a.raw_text, s.name AS source_name "
           "FROM signals_articles a JOIN signals_sources s ON s.id = a.source_id "
           "WHERE a.is_relevant = 1 AND a.full_text_fetched = 1 "
           "AND a.signals_extracted_at IS NULL ORDER BY a.id")
    if args.limit:
        sql += f" LIMIT {int(args.limit)}"
    with connect(readonly=True, dict_rows=True) as con:
        rows = con.execute(sql).fetchall()
    if not rows:
        print("nothing pending — no relevant articles awaiting signal tagging.")
        return
    requests = [{"custom_id": f"g{r['id']}",
                 "params": _params(r["title"], r["raw_text"], r["source_name"])}
                for r in rows]
    est = len(requests) * 0.002  # Sonnet batch, full-article-text signal extraction
    print(f"submitting {len(requests):,} signal requests ({MODEL}, batched)")
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
    print("all submitted — run `collect` once the batches end.")


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
        written, tagged, errored, still = _collect(client, st, pending_ids, con)
    print(f"\n{written} articles processed, {tagged} signals written "
          f"({errored} errored, {still} batch(es) still processing).")


def write_signals(con, aid: int, signals: list[dict], now: str) -> int:
    """Idempotent per article: replace any earlier tagging wholesale with the
    model's latest answer, and stamp the article. Returns how many were written."""
    rows = []
    for s in signals:
        stype = s.get("signal_type")
        summary = (s.get("summary") or "").strip()
        if stype not in SIGNAL_TYPES or not summary:
            continue
        try:
            conf = min(1.0, max(0.0, float(s.get("confidence", 0.0))))
        except (TypeError, ValueError):
            conf = 0.0
        impact = (s.get("anticipated_impact") or "").strip() or None
        rows.append((aid, stype, conf, summary, impact))
    con.execute("DELETE FROM signals_article_signals WHERE article_id = %s", (aid,))
    con.cursor().executemany(
        "INSERT INTO signals_article_signals (article_id, signal_type, confidence,"
        " summary, anticipated_impact) VALUES (%s,%s,%s,%s,%s)", rows)
    con.execute(
        "UPDATE signals_articles SET signals_extracted_at = %s WHERE id = %s", (now, aid))
    return len(rows)


def _collect(client, st: dict, pending_ids: list[str], con) -> tuple[int, int, int, int]:
    written = tagged = errored = still = 0
    for bid in pending_ids:
        b = client.messages.batches.retrieve(bid)
        if b.processing_status != "ended":
            still += 1
            print(f"  {bid}: {b.processing_status} — leaving for later")
            continue
        import batch_state  # noqa: PLC0415
        why = batch_state.unrecoverable(b)
        if why:
            # Results purged or never produced: nothing to write, and asking
            # raises. Retired with the reason; the articles go out again.
            batch_state.retire("signals_signals", st, bid, why)
            continue
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        for res in client.messages.batches.results(bid):
            aid = int(res.custom_id[1:])
            if res.result.type != "succeeded":
                errored += 1
                continue
            text = next((bl.text for bl in res.result.message.content
                         if bl.type == "text"), "{}")
            signals = _parse_json(text).get("signals", [])
            tagged += write_signals(con, aid, signals, now)
            written += 1
        con.commit()
        st["collected"].append(bid)
        _state_save(st)
        print(f"  {bid}: collected")
    return written, tagged, errored, still


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
