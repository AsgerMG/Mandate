"""Does this eligibility text describe the entity that APPLIES, or one it serves?

── The defect this exists to catch ─────────────────────────────────────────
Two of France's 26 ADEME leaves are DELIVERY schemes. ADEME pays an
intermediary to do something for a downstream population, and only the
intermediary may apply:

    "Accompagnement des agriculteurs face au changement climatique"
        ADEME's own page: "Les structures éligibles ... sont les organismes de
        conseil". The farmer is who the money is FOR. The farmer cannot apply.

    "PACTE Entreprises : Phase de dépôt"
        The programme's target is TPE-PME of private tertiary and industry.
        This leaf is the structures-relais AMI: the applicant is a relay body
        contracted to advise those SMEs.

A republished description of either reads, under the heading "who may apply",
as "farmers may apply" and "SMEs may apply". Both sentences are accurate about
the scheme and false about the reader. A founder matched on them is routed to a
fund they cannot apply to, which is worse than never being shown it: they spend
the effort and find out at the end.

── Why the pertinence classifier does not catch it ─────────────────────────
`classify_eligibility_pertinence.py` asks what KIND of statement a text is --
condition, demand_match or report. A two-tier text is a perfectly good
CONDITION. It names a checkable population, it discriminates, a reader can hold
themselves against it and get a real answer. It was judged `condition` on both
of these rows, correctly, because the question that classifier asks has nothing
wrong with the sentence.

The question this one asks is WHOSE test the sentence states. That is a
different axis and it needs its own verdict, not a widening of the other, whose
property has already been re-versioned three times and whose answers 578 rows
depend on.

── Why a property and not two ids ──────────────────────────────────────────
The two rows above are today's instances. A list of them would be an
enumeration -- it would go green the moment a loader writes a third, and every
delivery scheme in the corpus is a third waiting to happen: advisory
programmes, operator-mandate calls, animation networks, relay-structure AMIs,
technical-assistance envelopes. So the cache is DERIVED, per text, from the
property below, and `check_applicant_identity.ts` fails the build on any
published text judged `beneficiary_not_applicant` -- including one nobody has
seen yet.

The calibration file carries controls chosen to break a lexical shortcut: a
text that mentions an advisory relationship and is STILL the applicant's own
test must stay `applicant`, or the classifier has learned the word "conseil"
rather than the property.

── What this does NOT catch, stated plainly ───────────────────────────────
It reads the TEXT. It catches a delivery scheme whose text is visibly about the
downstream population. It cannot catch one whose text is genuinely ambiguous
without knowing the scheme's plumbing -- a page reading "the programme supports
SMEs" looks exactly like an ordinary SME scheme, and no sharpening of the
property changes that, because the information is not in the string.

That residue is closed UPSTREAM rather than here: take the text from the body's
own "who may apply" block, which states who submits, instead of from a
description of what the programme is for. Both of the rows above were fixed
that way -- a republished description said "farmers"/"SMEs" and the funder's own
page said "organismes de conseil" and "structures ... en mesure de déployer les
missions". So this classifier is the backstop for the case where that fails,
not the primary defence, and it should not be relied on as though it were.

Usage:
  python3 ETL/terms/classify_applicant_identity.py --report
  python3 ETL/terms/classify_applicant_identity.py --classify
  python3 ETL/terms/classify_applicant_identity.py --classify --limit 40
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

CACHE = ROOT / "data" / "applicant_identity.json"
CALIBRATION = ROOT / "reference" / "applicant_identity_calibration.json"
MODEL = "claude-opus-5"
CHUNK = 12
#: The applicant is named early in a "who may apply" block, and this judgement
#: does not need the aid rates and the annexes that follow.
MAX_CHARS = 1800
PRICE_IN, PRICE_OUT = 5.0, 25.0
SPEND = {"in": 0, "out": 0}

#: Bumped when PROPERTY changes in a way that could move a verdict. Same
#: contract as the pertinence classifier: the cache key is a digest of the
#: TEXT, so without a version a reworded question would keep answering with
#: verdicts nobody asked for.
PROPERTY_VERSION = 1
#: version -> the verdicts from that version the CURRENT property could move.
#: Empty at v1 because there is no older version to carry forward from.
REJUDGE: dict[int, set[str]] = {}

PROPERTY = """\
A published eligibility text is shown to a founder under the heading "who may \
apply". Judge, AS A WHOLE, WHOSE test it states, in whatever language it is \
written.

Two different populations can appear in such a text:
  * the entity that would SUBMIT the application and sign the funding \
contract, and
  * the entity that ultimately BENEFITS from what the money buys.

In most schemes these are the same population and the distinction does not \
arise. In a DELIVERY scheme they are different: the money pays an intermediary \
-- an adviser, an operator, an animator, a relay or technical-assistance body \
-- to do something for a downstream population, and that downstream population \
cannot apply.

  applicant                  -- the population the text describes is the one \
that would submit and sign. This is the normal case. It stays `applicant` when \
the text also mentions who will ultimately be served, so long as the population \
being TESTED is the applicant's.

  beneficiary_not_applicant  -- the population the text puts forward as its \
subject is a downstream one, served by the money rather than applying for it. A \
reader who matches the description would not be an eligible applicant. This is \
true however accurate the sentence is about the scheme.

  indeterminate              -- the text states a subject matter, a theme or a \
project type without identifying any population at all, so there is nothing to \
place on either side.

THE TEST, applied to the population the text describes: could a reader who \
matches it sign the funding contract? If the text describes the people the \
scheme is FOR while the money would be paid to somebody else who serves them, \
the answer is no and the verdict is `beneficiary_not_applicant`.

Two things that do NOT make a text `beneficiary_not_applicant`. Naming the \
final audience alongside a clear statement of who submits -- that is an \
applicant test with context. And a scheme whose applicants happen to be \
advisers, consultancies or public bodies IN THEIR OWN RIGHT, where the text is \
their test and they are the ones applying. The defect is a MISMATCH between the \
population described and the population that may apply, not the presence of an \
intermediary anywhere in the sentence."""


def _load_env() -> None:
    path = ROOT / ".env.local"
    if path.exists():
        for line in path.read_text().splitlines():
            m = re.match(r"^([A-Z_]+)=(.*)$", line)
            if m:
                os.environ.setdefault(m.group(1), m.group(2).strip("\"'"))


def digest(text: str) -> str:
    """Identity of a published string, whitespace-normalised. Deliberately the
    SAME function as the pertinence classifier's, so the two caches key the
    same text the same way and can be read side by side."""
    return hashlib.sha256(re.sub(r"\s+", " ", text or "").strip().encode()).hexdigest()[:16]


def load_cache() -> dict:
    return json.loads(CACHE.read_text())["verdicts"] if CACHE.exists() else {}


def is_stale(entry: dict) -> bool:
    v = entry.get("v", 1)
    if v >= PROPERTY_VERSION:
        return False
    return any(entry["verdict"] in moved
               for old, moved in REJUDGE.items() if v <= old)


def save_cache(cache: dict) -> None:
    CACHE.write_text(json.dumps({
        "_comment": (
            "Applicant-identity verdicts, keyed by a digest of the text itself so the "
            "same sentence is judged once wherever it appears. Written by "
            "ETL/terms/classify_applicant_identity.py; read by "
            "web/scripts/check_applicant_identity.ts, which FAILS THE "
            "BUILD on a published eligibility_text judged `beneficiary_not_applicant`. "
            "Do not hand-edit a verdict: fix the TEXT so it states the applicant's own "
            "test, or withdraw it."),
        "_property": PROPERTY.replace("\n", " "),
        "_property_version": PROPERTY_VERSION,
        "_model": MODEL,
        "verdicts": cache,
    }, indent=1, sort_keys=True) + "\n")


def _connect():
    import psycopg2
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is not set; this reads the PUBLISHED column.")
    return psycopg2.connect(url)


def rows_text() -> list[dict]:
    """Every published eligibility_text long enough to name a population."""
    import psycopg2.extras
    with _connect() as c:
        with c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """SELECT id AS ref, country, eligibility_text AS body
                     FROM funding_instruments
                    WHERE length(coalesce(eligibility_text,'')) > 40
                    ORDER BY id""")
            return [dict(r) for r in cur.fetchall()]


def rows_calibration() -> list[dict]:
    """Known-answer cases, judged in the same pass and into the same cache as
    the live corpus, so the classifier is measured on exactly the path it runs
    on rather than on a fixture that bypasses it."""
    if not CALIBRATION.exists():
        return []
    spec = json.loads(CALIBRATION.read_text())
    return [{"ref": f"calibration/{k}", "country": None, "body": v["text"]}
            for k, v in spec.get("cases", {}).items()]


def classify(batch: list[str]) -> dict[str, dict]:
    """One model call over a handful of distinct texts, keyed by digest."""
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
                        "verdict": {"type": "string", "enum": [
                            "applicant", "beneficiary_not_applicant", "indeterminate"]},
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
    # A ~40-call run meets a 529 often enough that "re-run it" is not a policy:
    # the first attempt died at chunk 17 of 41. The cache is written per chunk
    # so a crash loses only the chunk in flight, but retrying here means a run
    # finishes instead of needing a human to restart it. Bounded and
    # exponential, because an overloaded API is not helped by a tight loop.
    import time
    import anthropic as _a
    last: Exception | None = None
    for attempt in range(5):
        try:
            res = client.messages.create(
                model=MODEL,
                max_tokens=16000,
                system=PROPERTY,
                output_config={"format": {"type": "json_schema", "schema": schema},
                               "effort": "medium"},
                messages=[{"role": "user", "content":
                           "Judge each text below. Return one result per id, with a "
                           "reason of at most 20 words naming the population the text "
                           "describes and whether it is the one that applies.\n\n" + listing}],
            )
            break
        except (_a.OverloadedError, _a.RateLimitError, _a.APIConnectionError,
                _a.InternalServerError) as e:
            last = e
            wait = 4 * (2 ** attempt)
            print(f"  ..{type(e).__name__}, retrying in {wait}s "
                  f"(attempt {attempt + 1}/5)")
            time.sleep(wait)
    else:
        raise SystemExit(f"gave up after 5 attempts: {last}")
    if res.stop_reason == "refusal":
        raise SystemExit("classifier refused; re-run or reduce the batch")
    SPEND["in"] += res.usage.input_tokens
    SPEND["out"] += res.usage.output_tokens
    text = next(b.text for b in res.content if b.type == "text")
    return {r["id"]: {"verdict": r["verdict"], "reason": r["reason"]}
            for r in json.loads(text)["results"]}


def run(rows: list[dict], cache: dict, limit: int, do_classify: bool) -> None:
    todo: dict[str, str] = {}
    stale = 0
    for r in rows:
        d = digest(r["body"])
        if d in todo:
            continue
        entry = cache.get(d)
        if entry is None:
            todo[d] = r["body"]
        elif is_stale(entry):
            stale += 1
            todo[d] = r["body"]
        elif do_classify:
            entry["v"] = PROPERTY_VERSION
    print(f"  {len(rows)} rows, {len(set(digest(r['body']) for r in rows))} distinct texts, "
          f"{len(todo)} to judge ({len(todo) - stale} never judged, "
          f"{stale} judged under a superseded property)")
    if do_classify:
        save_cache(cache)
    if not (do_classify and todo):
        return
    batch_all = list(todo.values())[:limit] if limit else list(todo.values())
    for i in range(0, len(batch_all), CHUNK):
        batch = batch_all[i: i + CHUNK]
        got = classify(batch)
        for body in batch:
            d = digest(body)
            v = got.get(d)
            if not v:
                print(f"  !! no verdict returned for {d}: {body[:60]!r}")
                continue
            cache[d] = {"verdict": v["verdict"], "reason": v["reason"],
                        "v": PROPERTY_VERSION,
                        "sample": re.sub(r"\s+", " ", body).strip()[:220]}
        save_cache(cache)
        cost = SPEND["in"] / 1e6 * PRICE_IN + SPEND["out"] / 1e6 * PRICE_OUT
        print(f"  {min(i + CHUNK, len(batch_all))}/{len(batch_all)}"
              f"  (${cost:.2f} so far: {SPEND['in']:,} in / {SPEND['out']:,} out)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--classify", action="store_true",
                    help="call the model for texts with no current verdict")
    ap.add_argument("--report", action="store_true", help="read the cache, call nothing")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    if not (args.classify or args.report):
        ap.error("pass --classify or --report")
    _load_env()

    cache = load_cache()
    calib = rows_calibration()
    if calib:
        print("calibration:")
        run(calib, cache, args.limit, args.classify)
    rows = rows_text()
    print("eligibility_text:")
    run(rows, cache, args.limit, args.classify)

    judged = [cache[digest(r["body"])] for r in rows if digest(r["body"]) in cache]
    counts: dict[str, int] = {}
    for e in judged:
        counts[e["verdict"]] = counts.get(e["verdict"], 0) + 1
    print(f"\neligibility_text: {len(judged)}/{len(rows)} judged  " +
          "  ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    bad = counts.get("beneficiary_not_applicant", 0)
    if bad:
        print(f"  {bad} rows describe a population that CANNOT APPLY. "
              f"check_applicant_identity.ts fails the build on these.")
        for r in rows:
            e = cache.get(digest(r["body"]))
            if e and e["verdict"] == "beneficiary_not_applicant":
                print(f"    {r['ref']}: {e['reason']}")
    else:
        print("  0 describe a population that cannot apply.")


if __name__ == "__main__":
    main()
