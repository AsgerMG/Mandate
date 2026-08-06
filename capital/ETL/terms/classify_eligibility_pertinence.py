"""Is a published eligibility text a CONDITION, or a REPORT about someone else?

── The defect this exists to catch ────────────────────────────────────────
On 2026-08-06 eleven IPCEI leaves were published with eligibility text taken
verbatim from Commission state-aid decisions. One of the strings read:

    "The Member States only grant support to the beneficiaries listed section
     2.2.6 and the funding is not available to all undertakings in a
     comparable situation."

Every word of that is in the source document. It is correctly attributed. It
passed every check the repo had, because every check the repo had asked
whether the quotation was FAITHFUL. None asked whether it was PERTINENT.

    A quote can be perfectly verbatim, perfectly attributed, and still be the
    wrong KIND of statement to show a founder.

── The property ───────────────────────────────────────────────────────────
    A published eligibility string must state a condition an applicant could
    satisfy, not a finding about someone else's completed grant.

── Why this is a model call and not a regex ───────────────────────────────
The corpus holds text in German, Spanish, French, Italian, Swedish, Estonian,
Czech and more, from statutes, call pages, decisions and guidance notes. Every
lexical rule anyone proposed for this is a list of the phrases in tonight's
defect -- "not available to all undertakings", "beneficiaries listed in
recital" -- which is an enumeration of the instances, not a statement of the
property, and it would pass the next occurrence in another language while
firing on any decision text that happens to quote a real condition.

The distinction is genuinely a judgement about the KIND of statement, which is
what a model is for. What makes it a TEST rather than an opinion is that the
verdict is cached against a hash of the text: the build fails on any published
string whose current text has no verdict, so a new or edited row cannot ship
until it has been judged. Nothing is graded twice, and nothing sneaks past.

── Its own blind spot, stated ─────────────────────────────────────────────
This checks the KIND of statement, not its truth, its currency, or whether it
belongs to the right instrument. `check_extracted_quotes.ts` checks that a
quotation is faithful. The two together are still not a guarantee that the
column is CORRECT -- they are a guarantee that it is a faithful quotation of
the right kind of thing.

Usage:
  python3 ETL/terms/classify_eligibility_pertinence.py --report
  python3 ETL/terms/classify_eligibility_pertinence.py --classify
  python3 ETL/terms/classify_eligibility_pertinence.py --classify --limit 40
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import hashlib  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402

CACHE = ROOT / "data" / "eligibility_pertinence.json"
MODEL = "claude-opus-5"
#: Rows per model call. Small enough that one bad row cannot cost a whole
#: chunk, large enough that the instruction is amortised.
CHUNK = 12
#: How much of a text the judgement needs. The KIND of statement is settled in
#: the first paragraph; the rest is more of the same and costs tokens.
MAX_CHARS = 1800

PROPERTY = """\
A published eligibility text is shown to a founder under the heading "who may \
apply". It must state CONDITIONS -- things a reader could check about their own \
company, project or plans to work out whether they qualify.

It must not be a REPORT: a finding, decision or narrative about aid that has \
already been allocated to parties the document names. A report may be perfectly \
accurate and still be useless to a founder, because there is nothing in it they \
could do or be.

Judge the text AS A WHOLE, in whatever language it is written.

  condition -- a reader could take something from this about whether THEY \
qualify: who may apply, what the project must be, what is excluded, what \
thresholds apply. Some surrounding narrative is fine.
  report    -- it describes a decision already taken about named others, or \
states in substance that the money is not open to applicants at all. Nothing in \
it is a bar the reader could clear.

If a text mixes both but a founder could still act on part of it, that is \
"condition". Answer "report" only when there is nothing to act on."""


def _load_env() -> None:
    path = ROOT / ".env.local"
    if path.exists():
        for line in path.read_text().splitlines():
            m = re.match(r"^([A-Z_]+)=(.*)$", line)
            if m:
                os.environ.setdefault(m.group(1), m.group(2).strip("\"'"))


def digest(text: str) -> str:
    """Identity of a published string. Whitespace-normalised, so a reflow does
    not force a re-judgement, but any change of wording does."""
    return hashlib.sha256(re.sub(r"\s+", " ", text or "").strip().encode()).hexdigest()[:16]


def load_cache() -> dict:
    return json.loads(CACHE.read_text()) if CACHE.exists() else {}


def rows_from_postgres() -> list[dict]:
    import psycopg2
    import psycopg2.extras
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is not set; this reads the PUBLISHED column.")
    with psycopg2.connect(url) as c:
        with c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """SELECT id, name, country, eligibility_text
                     FROM funding_instruments
                    WHERE length(coalesce(eligibility_text,'')) > 40
                    ORDER BY id""")
            return [dict(r) for r in cur.fetchall()]


def classify(batch: list[dict]) -> dict[str, dict]:
    """One model call over a handful of rows. Returns id -> {verdict, reason}."""
    import anthropic
    client = anthropic.Anthropic()
    listing = "\n\n".join(
        f"### {r['id']}\n{(r['eligibility_text'] or '')[:MAX_CHARS]}" for r in batch)
    schema = {
        "type": "object",
        "properties": {
            "results": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "verdict": {"type": "string", "enum": ["condition", "report"]},
                        "reason": {"type": "string"},
                    },
                    "required": ["id", "verdict", "reason"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["results"],
        "additionalProperties": False,
    }
    res = client.messages.create(
        model=MODEL,
        max_tokens=8000,
        system=PROPERTY,
        output_config={"format": {"type": "json_schema", "schema": schema}},
        messages=[{"role": "user", "content":
                   "Judge each text below. Return one result per id, with a "
                   "reason of at most 20 words that names what in the text "
                   "decided it.\n\n" + listing}],
    )
    if res.stop_reason == "refusal":
        raise SystemExit("classifier refused; re-run or reduce the batch")
    text = next(b.text for b in res.content if b.type == "text")
    return {r["id"]: {"verdict": r["verdict"], "reason": r["reason"]}
            for r in json.loads(text)["results"]}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--classify", action="store_true",
                    help="judge every published text whose hash is not cached")
    ap.add_argument("--report", action="store_true", help="read the cache, call nothing")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    _load_env()

    rows = rows_from_postgres()
    cache = load_cache()
    stale = [r for r in rows
             if cache.get(r["id"], {}).get("hash") != digest(r["eligibility_text"])]
    print(f"{len(rows)} published eligibility texts, {len(rows) - len(stale)} already judged, "
          f"{len(stale)} to judge")

    if args.classify and stale:
        todo = stale[: args.limit] if args.limit else stale
        for i in range(0, len(todo), CHUNK):
            batch = todo[i: i + CHUNK]
            got = classify(batch)
            for r in batch:
                v = got.get(r["id"])
                if not v:
                    print(f"  !! no verdict returned for {r['id']}")
                    continue
                cache[r["id"]] = {"hash": digest(r["eligibility_text"]),
                                  "verdict": v["verdict"], "reason": v["reason"]}
            # Persist per chunk: a run cut off mid-way must not discard
            # classifications already paid for.
            CACHE.write_text(json.dumps(cache, indent=1, sort_keys=True) + "\n")
            print(f"  {min(i + CHUNK, len(todo))}/{len(todo)}")

    reports = [(r["id"], r["country"], cache[r["id"]]["reason"])
               for r in rows
               if cache.get(r["id"], {}).get("hash") == digest(r["eligibility_text"])
               and cache[r["id"]]["verdict"] == "report"]
    judged = sum(1 for r in rows
                 if cache.get(r["id"], {}).get("hash") == digest(r["eligibility_text"]))
    print(f"\n{judged}/{len(rows)} judged, {len(reports)} are REPORTS about somebody "
          f"else's grant rather than conditions:")
    for iid, country, reason in reports:
        print(f"  {iid:<52} {country or '--':<3} {reason}")


if __name__ == "__main__":
    main()
