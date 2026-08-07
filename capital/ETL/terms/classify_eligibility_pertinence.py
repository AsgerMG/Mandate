"""Is a published eligibility string a CONDITION, or a REPORT about someone else?

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

── Why this file judges TWO columns ───────────────────────────────────────
The 2026-08-07 retraction pulled that sentence out of `eligibility_text` and
stopped. It did not touch `eligibility_gates`, where the SAME quotations were
encoded with `gate_role='filter'` -- and a filter gate is strictly worse than a
paragraph of prose, because `verdict.ts::isFilter()` lets it DECIDE. A founder
is not merely shown a compatibility finding; they are silently removed from a
fund for not already having been chosen as a beneficiary of it.

Two columns, one question, so ONE property and ONE cache. The verdict is keyed
by a digest of the TEXT, not by the row that holds it: the same sentence
appearing as prose in `funding_instruments.eligibility_text` and as a
requirement in `eligibility_gates.requirement` is the same judgement, is paid
for once, and can never be answered two different ways in the two places. That
is the shape this repo has been bitten by three times; see
`website/frontend/lib/intelligence/evidenceTiers.json`.

── The property ───────────────────────────────────────────────────────────
    A published eligibility string must state a condition an applicant could
    satisfy, not a finding about someone else's completed grant.

── Why this is a model call and not a regex ───────────────────────────────
The corpus holds text in German, Spanish, French, Italian, Swedish, Estonian,
Czech and more, from statutes, call pages, decisions and guidance notes. Every
lexical rule anyone proposed for this is a list of the phrases in the original
defect -- "not available to all undertakings", "beneficiaries listed in
recital" -- which is an enumeration of the instances, not a statement of the
property, and it would pass the next occurrence in another language while
firing on any decision text that happens to quote a real condition.

The distinction is genuinely a judgement about the KIND of statement, which is
what a model is for. What makes it a TEST rather than an opinion is that the
verdict is cached against a hash of the text: the build fails on any published
string whose current text has no verdict, so a new or edited row cannot ship
until it has been judged. Nothing is graded twice, and nothing sneaks past.
The test is `website/frontend/scripts/check_gate_pertinence.ts`.

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
  python3 ETL/terms/classify_eligibility_pertinence.py --classify --only gates
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
#: Known-answer cases, judged in the same pass and into the same cache as the
#: live corpus so the classifier is measured on exactly the path it runs on.
#: The check asserts these; see the file's own _why_not_a_word_list.
CALIBRATION = ROOT / "data" / "reference" / "pertinence_calibration.json"
MODEL = "claude-opus-5"
#: Rows per model call. Small enough that one bad row cannot cost a whole
#: chunk, large enough that the instruction is amortised. Gate requirements are
#: one or two sentences, so they batch far larger than a page of prose.
CHUNK_TEXT = 12
CHUNK_GATES = 25
#: How much of a text the judgement needs. The KIND of statement is settled in
#: the first paragraph; the rest is more of the same and costs tokens.
MAX_CHARS = 1800
#: $/MTok for MODEL, so a run reports its own cost rather than being audited
#: afterwards from a dashboard.
PRICE_IN, PRICE_OUT = 5.0, 25.0
SPEND = {"in": 0, "out": 0}

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
thresholds apply. Some surrounding narrative is fine. A condition stays a \
condition even when it is narrow, hard to meet, or stated in the past tense \
about how the scheme has operated.
  report    -- it describes a decision already taken about named others, or \
states in substance that the money is not open to applicants at all. Nothing in \
it is a bar the reader could clear. Typical shapes: a state-aid compatibility \
or selectivity finding about a closed beneficiary list; a description of what \
the instrument IS or DOES rather than who may apply to it; an obligation that \
binds a beneficiary only after an award; a fragment or section heading that \
states no requirement at all.

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
    not force a re-judgement, but any change of wording does. This is the cache
    key for BOTH columns -- see the module docstring."""
    return hashlib.sha256(re.sub(r"\s+", " ", text or "").strip().encode()).hexdigest()[:16]


def load_cache() -> dict:
    return json.loads(CACHE.read_text())["verdicts"] if CACHE.exists() else {}


def save_cache(cache: dict) -> None:
    CACHE.write_text(json.dumps({
        "_comment": (
            "Pertinence verdicts, keyed by a digest of the text itself so the same "
            "sentence is judged once wherever it appears. Written by "
            "ETL/terms/classify_eligibility_pertinence.py; read by "
            "website/frontend/scripts/check_gate_pertinence.ts, which FAILS THE BUILD "
            "on a filter gate whose current text has no verdict here. Do not hand-edit "
            "a verdict: correct the text, or record the case in "
            "data/reference/gate_role_overrides.json where the reasoning lives."),
        "_property": PROPERTY.replace("\n", " "),
        "_model": MODEL,
        "verdicts": cache,
    }, indent=1, sort_keys=True) + "\n")


def _connect():
    import psycopg2
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is not set; this reads the PUBLISHED columns.")
    return psycopg2.connect(url)


def rows_text() -> list[dict]:
    """Every published eligibility_text long enough to make a claim."""
    import psycopg2.extras
    with _connect() as c:
        with c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """SELECT id AS ref, country, eligibility_text AS body
                     FROM funding_instruments
                    WHERE length(coalesce(eligibility_text,'')) > 40
                    ORDER BY id""")
            return [dict(r, column="eligibility_text") for r in cur.fetchall()]


def rows_gates() -> list[dict]:
    """Every gate that can DECIDE -- gate_role 'filter', or NULL, which
    `isFilter()` honours as a filter so the system degrades safely while
    encoding coverage grows. A gate already triaged to any other role is inert
    and is not this test's business."""
    import psycopg2.extras
    with _connect() as c:
        with c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """SELECT instrument_id || '/' || gate_key AS ref,
                          instrument_id, gate_key, gate_role, verification_level,
                          value_spec, requirement AS body
                     FROM eligibility_gates
                    WHERE gate_role IS NULL OR gate_role = 'filter'
                    ORDER BY instrument_id, gate_key""")
            return [dict(r, column="requirement") for r in cur.fetchall()]


def classify(batch: list[str]) -> dict[str, dict]:
    """One model call over a handful of distinct texts. Keyed by digest, so a
    text that appears on 40 gates is judged once and paid for once."""
    import anthropic
    client = anthropic.Anthropic()
    listing = "\n\n".join(f"### {digest(t)}\n{t[:MAX_CHARS]}" for t in batch)
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
        max_tokens=16000,
        system=PROPERTY,
        # Adaptive thinking is ON by default on this model and max_tokens caps
        # thinking AND text together, so the budget is sized for both. `effort`
        # is medium because this is a two-way judgement over a short string,
        # not a research task, and the run is ~100 calls wide.
        output_config={"format": {"type": "json_schema", "schema": schema},
                       "effort": "medium"},
        messages=[{"role": "user", "content":
                   "Judge each text below. Return one result per id, with a "
                   "reason of at most 20 words that names what in the text "
                   "decided it.\n\n" + listing}],
    )
    if res.stop_reason == "refusal":
        raise SystemExit("classifier refused; re-run or reduce the batch")
    # Printed, not accumulated silently: a run this wide should say what it
    # cost while it is still cheap to stop it.
    SPEND["in"] += res.usage.input_tokens
    SPEND["out"] += res.usage.output_tokens
    text = next(b.text for b in res.content if b.type == "text")
    return {r["id"]: {"verdict": r["verdict"], "reason": r["reason"]}
            for r in json.loads(text)["results"]}


def run(rows: list[dict], cache: dict, chunk: int, limit: int, do_classify: bool) -> None:
    """Judge every DISTINCT text in `rows` that has no cached verdict."""
    todo: dict[str, str] = {}
    for r in rows:
        d = digest(r["body"])
        if d not in cache and d not in todo:
            todo[d] = r["body"]
    print(f"  {len(rows)} rows, {len(set(digest(r['body']) for r in rows))} distinct texts, "
          f"{len(todo)} unjudged")
    if not (do_classify and todo):
        return
    batch_all = list(todo.values())[:limit] if limit else list(todo.values())
    for i in range(0, len(batch_all), chunk):
        batch = batch_all[i: i + chunk]
        got = classify(batch)
        for body in batch:
            d = digest(body)
            v = got.get(d)
            if not v:
                print(f"  !! no verdict returned for {d}: {body[:60]!r}")
                continue
            cache[d] = {"verdict": v["verdict"], "reason": v["reason"],
                        "sample": re.sub(r"\s+", " ", body).strip()[:220]}
        # Persist per chunk: a run cut off mid-way must not discard
        # classifications already paid for.
        save_cache(cache)
        cost = SPEND["in"] / 1e6 * PRICE_IN + SPEND["out"] / 1e6 * PRICE_OUT
        print(f"  {min(i + chunk, len(batch_all))}/{len(batch_all)}"
              f"  (${cost:.2f} so far: {SPEND['in']:,} in / {SPEND['out']:,} out)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--classify", action="store_true",
                    help="judge every published text whose hash is not cached")
    ap.add_argument("--report", action="store_true", help="read the cache, call nothing")
    ap.add_argument("--only", choices=["text", "gates"], default=None)
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    _load_env()

    cache = load_cache()
    populations = []
    # Calibration first, unconditionally and on every run: a run that judged
    # 2,500 live strings and never exercised the known answers would report
    # success without having shown the classifier still works.
    print("calibration:")
    cal = [{"ref": c["id"], "body": c["text"], "expect": c["expect"]}
           for c in json.loads(CALIBRATION.read_text())["cases"]]
    run(cal, cache, CHUNK_GATES, 0, args.classify)
    wrong = [c for c in cal
             if cache.get(digest(c["body"]), {}).get("verdict") not in (None, c["expect"])]
    for c in wrong:
        print(f"  !! MISCALIBRATED {c['ref']}: expected {c['expect']}, "
              f"got {cache[digest(c['body'])]['verdict']} "
              f"-- {cache[digest(c['body'])]['reason']}")

    if args.only in (None, "text"):
        print("eligibility_text:")
        populations.append(("eligibility_text", rows_text(), CHUNK_TEXT))
    if args.only in (None, "gates"):
        print("filter gates:")
        populations.append(("requirement", rows_gates(), CHUNK_GATES))
    for _, rows, chunk in populations:
        run(rows, cache, chunk, args.limit, args.classify)

    print()
    for name, rows, _ in populations:
        judged = [r for r in rows if digest(r["body"]) in cache]
        reports = [r for r in rows if cache.get(digest(r["body"]), {}).get("verdict") == "report"]
        print(f"{name}: {len(judged)}/{len(rows)} judged, {len(reports)} are REPORTS "
              f"about somebody else's grant rather than conditions")
        for r in reports:
            note = cache[digest(r["body"])]["reason"]
            decides = " <- HAS value_spec, CAN DECIDE" if r.get("value_spec") else ""
            print(f"  {r['ref']:<58} {note}{decides}")


if __name__ == "__main__":
    main()
