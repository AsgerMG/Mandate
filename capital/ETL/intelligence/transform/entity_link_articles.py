"""Entity linking for the news/signals layer (stage 2 of 4).

Two halves, deliberately split:
  * NER (model, batched)  — extract candidate mentions (company / investor /
    person / program) from relevant articles. Haiku, structured output.
  * Resolution (local)    — match company/investor mentions against
    `companies` (same schema, same connection) with the canonical 5-tier matcher (ETL/lib/matching.py — the
    same one every extractor uses, so a company named in the press resolves to
    the same id its funding events sit under). person/program mentions stay
    unresolved (company_id NULL) by design — they are retrieval hooks, not rows
    to merge.

This is the load-bearing half of the signals layer: embeddings answer "what is
semantically similar", these links answer "who is actually involved".

Usage:
  python3 ETL/intelligence/transform/entity_link_articles.py status
  python3 ETL/intelligence/transform/entity_link_articles.py submit [--limit N] [--dry-run]
  python3 ETL/intelligence/transform/entity_link_articles.py collect   # writes mentions + resolves
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

from matching import CompanyMatcher  # noqa: E402

MODEL = "claude-haiku-4-5"
MAX_TOKENS = 700           # up to ~25 mention objects
TEXT_CAP = 6000
CHUNK = 5_000
STATE_FILE = DATA / ".signals_entities_batches.json"

# Match-method → confidence, mirroring the tiers in lib/matching.py. Fuzzy is
# real but reviewable; below that we keep the mention unresolved.
METHOD_CONFIDENCE = {"exact": 1.0, "prefix": 0.9, "reverse_prefix": 0.85, "fuzzy": 0.7}

SYSTEM = """You extract named entities from press articles for a database of public funding to European tech companies.

List every distinct mention of:
- "company": a company or startup (the organisation itself, not products);
- "investor": a fund, development bank, public investor or VC firm;
- "person": a named individual in a decision-shaping role (fund manager, ministry official, programme director, founder/executive);
- "program": a named funding programme, call, scheme or instrument (e.g. EIC Accelerator, IPCEI Hydrogen, France 2030).

Rules: use the surface form as written (keep legal suffixes like GmbH/SAS if printed). One entry per distinct entity, not per occurrence. Articles may be in English, German or French — do not translate names. Reply JSON only:
{"entities": [{"type": "company", "mention": "..."}]}"""

SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "entities": {
            "type": "array",
            "items": {
                "type": "object", "additionalProperties": False,
                "properties": {
                    "type": {"type": "string",
                             "enum": ["company", "investor", "person", "program"]},
                    "mention": {"type": "string"},
                },
                "required": ["type", "mention"],
            },
        },
    },
    "required": ["entities"],
}


def _params(title: str, text: str) -> dict:
    return {"model": MODEL, "max_tokens": MAX_TOKENS,
            "system": [{"type": "text", "text": SYSTEM,
                        "cache_control": {"type": "ephemeral"}}],
            "output_config": {"format": {"type": "json_schema", "schema": SCHEMA}},
            "messages": [{"role": "user",
                          "content": f"Title: {title}\n\n{text[:TEXT_CAP]}"}]}


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
    return batch_state.load("signals_entities")


def _state_save(st: dict) -> None:
    import batch_state  # noqa: PLC0415
    batch_state.save("signals_entities", st)


def cmd_status(_args) -> None:
    with connect(readonly=True) as con:
        pending = con.execute(
            "SELECT COUNT(*) FROM signals_articles WHERE is_relevant = 1 "
            "AND full_text_fetched = 1 AND entities_extracted_at IS NULL").fetchone()[0]
        done = con.execute(
            "SELECT COUNT(*) FROM signals_articles WHERE entities_extracted_at IS NOT NULL"
        ).fetchone()[0]
        by_type = con.execute(
            "SELECT entity_type, COUNT(*), COUNT(company_id) "
            "FROM signals_article_entities GROUP BY entity_type "
            "ORDER BY entity_type COLLATE \"C\"").fetchall()
    st = _state_load()
    uncollected = [b for b in st["batches"] if b not in st["collected"]]
    print(f"awaiting NER: {pending:,}   extracted: {done:,}")
    for etype, n, resolved in by_type:
        print(f"  {etype:<9} {n:>6,} mentions, {resolved or 0:>6,} resolved to companies")
    if uncollected:
        print(f"uncollected batches: {len(uncollected)} — run `collect`")


def cmd_submit(args) -> None:
    sql = ("SELECT id, title, raw_text FROM signals_articles "
           "WHERE is_relevant = 1 AND full_text_fetched = 1 "
           "AND entities_extracted_at IS NULL ORDER BY id")
    if args.limit:
        sql += f" LIMIT {int(args.limit)}"
    with connect(readonly=True, dict_rows=True) as con:
        rows = con.execute(sql).fetchall()
    if not rows:
        print("nothing pending — no relevant articles awaiting NER.")
        return
    requests = [{"custom_id": f"e{r['id']}",
                 "params": _params(r["title"], r["raw_text"])} for r in rows]
    est = len(requests) * 0.001  # Haiku batch, full-article-text NER prompt
    print(f"submitting {len(requests):,} NER requests ({MODEL}, batched)")
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

    with connect() as sig:
        # Resolution runs against `companies` with the canonical matcher.
        # country=None: press mentions carry no reliable HQ country (and it
        # issues one parameterless SELECT, which runs unchanged on psycopg).
        matcher = CompanyMatcher(sig, country=None)
        written, resolved, errored, still = _collect(client, st, pending_ids, sig, matcher)
    print(f"\n{written} articles entity-linked, {resolved} mentions resolved "
          f"({errored} errored, {still} batch(es) still processing).")


def write_entities(sig, matcher, aid: int, entities: list[dict], now: str) -> int:
    """Idempotent per article: replace any earlier extraction wholesale,
    resolving company/investor mentions. Returns how many resolved."""
    rows = []
    resolved = 0
    for ent in entities:
        etype, mention = ent.get("type"), (ent.get("mention") or "").strip()
        if not mention or etype not in ("company", "investor", "person", "program"):
            continue
        cid = method = conf = None
        if etype in ("company", "investor"):
            cid, method = matcher.match(mention)
            if method == "none":
                cid = method = None
            else:
                conf = METHOD_CONFIDENCE.get(method)
                resolved += 1
        rows.append((aid, etype, mention[:300], cid, method, conf))
    sig.execute("DELETE FROM signals_article_entities WHERE article_id = %s", (aid,))
    sig.cursor().executemany(
        "INSERT INTO signals_article_entities (article_id, entity_type, mention_text,"
        " company_id, match_method, match_confidence) VALUES (%s,%s,%s,%s,%s,%s)",
        rows)
    sig.execute(
        "UPDATE signals_articles SET entities_extracted_at = %s WHERE id = %s", (now, aid))
    return resolved


def _collect(client, st: dict, pending_ids: list[str], sig, matcher
             ) -> tuple[int, int, int, int]:
    written = resolved = errored = still = 0
    for bid in pending_ids:
        b = client.messages.batches.retrieve(bid)
        if b.processing_status != "ended":
            still += 1
            print(f"  {bid}: {b.processing_status} — leaving for later")
            continue
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        for res in client.messages.batches.results(bid):
            aid = int(res.custom_id[1:])
            if res.result.type != "succeeded":
                errored += 1
                continue
            text = next((bl.text for bl in res.result.message.content
                         if bl.type == "text"), "{}")
            entities = _parse_json(text).get("entities", [])
            resolved += write_entities(sig, matcher, aid, entities, now)
            written += 1
        sig.commit()
        st["collected"].append(bid)
        _state_save(st)
        print(f"  {bid}: collected")
    return written, resolved, errored, still


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
