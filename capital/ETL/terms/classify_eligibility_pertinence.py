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
`web/lib/intelligence/evidenceTiers.json`.

── The property ───────────────────────────────────────────────────────────
    A published eligibility string must state something an applicant could act
    on -- a condition they could satisfy, or an offer they could want -- and
    not a finding about someone else's completed grant.

── Why there are THREE verdicts and not two (2026-08-08) ──────────────────
The first version of this asked one binary question: condition, or report? Run
over the whole corpus it judged 40 deciding gates `report`, and it was right
about the sentences -- but only about five of them were the defect. The rest
read like this:

    "The maximum loan amount is EUR 250,000."        -> ticketBand
    "Invest-NL invests as a limited partner into venture capital funds
     rather than lending or granting directly to companies." -> borrowerModel

As prose those ARE descriptions of the instrument rather than of the applicant,
which is what the binary property called a report. But the product deliberately
matches the shape of the offer against a demand the founder states in intake:
`ticketBand`, `borrowerModel`, `cofinancingBand` and `developmentStage` are all
questions we ask them. A founder seeking EUR 20m is genuinely not served by a
EUR 250k micro-loan, and the gate that says so is doing its job.

Demoting those would have cost real matching precision to fix a defect they are
not an instance of. So the property gains a third answer, `demand_match`: a fact
about what the instrument OFFERS, of a kind the applicant is asked to state
their own counterpart for. It may decide, because what it is compared against is
the founder's own declared want.

This is a carve-out from `report`, never from `condition`, and it is NOT a
loophole for "any fact about the money": a total programme budget, a
disbursement calendar and a legal basis stay reports, because no one is asked
what budget they would prefer a scheme to have. The calibration file pins both
sides of that line, including `ipcei_hy2use_country_framing` -- a selectivity
finding that happens to name countries, which intake DOES ask about, and which
must still come back `report`.

── What v3 fixed, and how it was caught (2026-08-08) ──────────────────────
Rewriting the property to add `demand_match` moved a line nobody meant to move.
The v2 run promoted a live Latvian gate --

    "Project applications may only be submitted by a closed, named list of
     eight competence centres ... 'LEO petijumu centrs', the Latvian Food
     Competence Centre, the IT Competence Centre, ..."

-- from `report` to `condition`, because "a reader can check whether they are a
listed centre". They can. The answer is no. It is no for every reader who will
ever see it, which is the original defect in the grammar of a requirement, and
the four IPCEI calibration cases did not catch it because they are decision
prose about aid already granted and this is a call page saying who may apply.

So v3 states the thing that was implicit all along and is the real property:

    A condition DISCRIMINATES. It is true of some readers and false of others.
    A statement whose answer is the same for every possible applicant is not a
    condition, whatever grammatical form it takes.

That is why the classifier is versioned. The regression was invisible in the
diff, invisible in the calibration set as it then stood, and showed up only
because the run was read row by row against the corpus it had just judged.

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
The test is `web/scripts/check_gate_pertinence.ts`.

── Its own blind spot, stated ─────────────────────────────────────────────
This checks the KIND of statement, not its truth, its currency, or whether it
belongs to the right instrument. `check_extracted_quotes.ts` checks that a
quotation is faithful. The two together are still not a guarantee that the
column is CORRECT -- they are a guarantee that it is a faithful quotation of
the right kind of thing.

── How it runs: a Message Batch (2026-11-07) ──────────────────────────────
--classify submits the unjudged texts as ONE Message Batch through
mandate/llm/batch.py (half price; usually done inside the hour), waits up to
--wait-minutes, and writes what has come back. A batch still processing is
recorded in mandate.llm_batches with each request's {digest: sample}, so the
NEXT --classify collects it first and never resubmits a text that is in flight.
The cache file below is written exactly as it always was.

Usage:
  python3 ETL/terms/classify_eligibility_pertinence.py --report
  python3 ETL/terms/classify_eligibility_pertinence.py --classify [--max-usd 20] [--wait-minutes 60]
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
from store import connect  # noqa: E402
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
CALIBRATION = ROOT / "reference" / "pertinence_calibration.json"
MODEL = "claude-opus-5"
#: Rows per model call. Small enough that one bad row cannot cost a whole
#: chunk, large enough that the instruction is amortised. Gate requirements are
#: one or two sentences, so they batch far larger than a page of prose.
CHUNK_TEXT = 12
CHUNK_GATES = 25
#: How much of a text the judgement needs. The KIND of statement is settled in
#: the first paragraph; the rest is more of the same and costs tokens.
MAX_CHARS = 1800
#: $/MTok for MODEL lives in ONE table, mandate/llm/batch.py PRICES, and every
#: figure this script prints is at BATCH prices (half the standard rate): the
#: judging runs as a Message Batch (see run()).
#: The estimate's assumptions, stated so a reader can check them against a run's
#: own SPENT line. Input: the PROPERTY system prompt once per request plus the
#: listing (chars/4). Output: adaptive thinking at effort medium plus ~40 tokens
#: of JSON per verdict; OUT_PER_CALL is deliberately generous (thinking is
#: billed as output and is the bulk of the bill).
CHARS_PER_TOKEN = 4
OUT_PER_CALL = 4000
OUT_PER_VERDICT = 40
#: --max-usd: a run submits only what its estimate says fits under this.
MAX_USD_DEFAULT = 20.0
#: --wait-minutes: how long a --classify run polls for its batch before leaving
#: the rest for the next run to collect (the batch id is in mandate.llm_batches).
WAIT_MINUTES_DEFAULT = 60
#: The batch store's name for this job (mandate.llm_batches.kind).
BATCH_KIND = "capital.pertinence"


def estimate(texts: list[str], chunk: int) -> tuple[int, int, int, float]:
    """(requests, input tokens, output tokens, USD at batch prices) to judge
    `texts` in `chunk`s."""
    from mandate.llm.batch import BATCH_DISCOUNT, PRICES  # noqa: PLC0415
    p_in, p_out, _ = PRICES[MODEL]
    calls = -(-len(texts) // chunk) if texts else 0
    sys_tok = len(PROPERTY) // CHARS_PER_TOKEN + 60
    tin = calls * sys_tok + sum(min(len(t), MAX_CHARS) + 24 for t in texts) // CHARS_PER_TOKEN
    tout = calls * OUT_PER_CALL + len(texts) * OUT_PER_VERDICT
    return calls, tin, tout, BATCH_DISCOUNT * (tin / 1e6 * p_in + tout / 1e6 * p_out)

#: Bumped when PROPERTY changes in a way that could move a verdict. The cache
#: key is a digest of the TEXT, so without this a reworded question would keep
#: answering with verdicts nobody asked for -- a check that is green on stale
#: judgements. See REJUDGE for which old answers a bump actually invalidates.
PROPERTY_VERSION = 3
#: version -> the verdicts from that version that the CURRENT property could
#: move, and which must therefore be paid for again. Stated as data rather than
#: a comment because the check enforces it: a verdict left at a version whose
#: answers this table says are stale FAILS the build.
#:
#: v2 subdivided `report` into `report` and `demand_match` without touching the
#: condition/not-condition line, so a v1 `condition` was still a v2 `condition`
#: and re-judging 2,533 of them would have bought nothing.
#:
#: v3 moves that line, so everything at v2 is stale. The v2 run demoted the
#: IPCEI findings correctly but promoted a Latvian gate reading "applications
#: may only be submitted by a closed, named list of eight competence centres"
#: from `report` to `condition`, on the reasoning that a reader "can check
#: whether they are a listed centre". They can, and the answer is no, and it is
#: no for every reader -- which is the original defect wearing the grammar of a
#: requirement. v3 states the discrimination test that rules it out.
REJUDGE: dict[int, set[str]] = {1: {"report"},
                                2: {"condition", "demand_match", "report"}}

PROPERTY = """\
A published eligibility text is shown to a founder under the heading "who may \
apply". Judge what KIND of statement it is, AS A WHOLE, in whatever language it \
is written.

  condition    -- a requirement about the applicant: who may apply, what the \
project must be, what is excluded, what thresholds apply. A reader can check it \
against their own company, project or plans. It stays a condition when it is \
narrow, hard to meet, or stated in the past tense about how the scheme has \
operated.
                  A condition DISCRIMINATES: it is true of some readers and \
false of others. A requirement stated as a list of NAMED parties -- particular \
companies, named centres, an enumerated set of beneficiaries -- is not a \
condition however checkable the list looks, because no reader can come to be one \
of them and the answer is therefore the same for everyone. Being told to check \
whether you are on a closed list is not a test you can pass. Those are reports.

  demand_match -- a fact about what the instrument OFFERS, of a kind an \
applicant is separately asked to state their own counterpart for: how much \
money it provides, in what form (grant, loan, equity, guarantee), to what kind \
of counterparty it provides it, what share of costs it covers, what maturity of \
company it backs. It says nothing about the applicant's merit, but an applicant \
who has said what they are looking for can be compared against it and the \
comparison means something to them -- someone seeking EUR 20 million is \
genuinely not served by a EUR 250,000 micro-loan.

  report       -- a decision, finding or narrative about aid already allocated \
to parties the document names; a compatibility or selectivity conclusion; an \
administrative, procedural, legal-basis or budgetary fact about the scheme; a \
duty that binds a beneficiary only after an award; a fragment or section \
heading stating no requirement. There is nothing in it the reader could clear \
and nothing in it for them to want.

The line between demand_match and report is whether the statement is about the \
SHAPE OF THE OFFER, which an applicant has a preference about, or about the \
SCHEME'S ADMINISTRATION and decisions already taken, which they do not. A total \
programme budget, a disbursement calendar, an aid legal basis and a list of \
chosen beneficiaries are all reports even though they are facts about the \
money. Mentioning something an applicant is asked about -- a country, a sector, \
a date -- does not make a finding into a demand_match: if the statement records \
a decision already taken about named others, it is a report.

If a text mixes kinds and a founder could still act on part of it, prefer \
"condition". Answer "report" only when there is nothing to act on and nothing \
to want."""


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


def is_stale(entry: dict) -> bool:
    """Was this answer given to a question we have since changed?

    A verdict carries the PROPERTY_VERSION it was judged under. Entries written
    before versioning existed are version 1. REJUDGE says which of an old
    version's answers the current property could actually move; anything else
    carries forward, because paying again for an answer that cannot change is
    just spending. Unknown future versions are never stale.
    """
    v = entry.get("v", 1)
    if v >= PROPERTY_VERSION:
        return False
    return any(entry["verdict"] in moved
               for old, moved in REJUDGE.items() if v <= old)


def save_cache(cache: dict) -> None:
    CACHE.write_text(json.dumps({
        "_comment": (
            "Pertinence verdicts, keyed by a digest of the text itself so the same "
            "sentence is judged once wherever it appears. Written by "
            "ETL/terms/classify_eligibility_pertinence.py; read by "
            "web/scripts/check_gate_pertinence.ts, which FAILS THE BUILD "
            "on a filter gate whose current text has no verdict here. Do not hand-edit "
            "a verdict: correct the text, or record the case in "
            "reference/gate_role_overrides.json where the reasoning lives."),
        "_property": PROPERTY.replace("\n", " "),
        "_property_version": PROPERTY_VERSION,
        "_versions": (
            "Each verdict carries `v`, the property version it was judged under; "
            "absent means 1. REJUDGE in the classifier declares which of an old "
            "version's answers the current property could move, and the check "
            "fails on any that are still carried at a stale version. Without this "
            "a reworded property would keep answering with verdicts nobody asked "
            "for, and the build would be green on them."),
        "_model": MODEL,
        "verdicts": cache,
    }, indent=1, sort_keys=True) + "\n")


def rows_text() -> list[dict]:
    """Every published eligibility_text long enough to make a claim.

    Read through store.connect(readonly=True): capital_ro where configured, and
    a read-only session in any case. This script WRITES only its cache file;
    it had a psycopg2 connection on DATABASE_URL (the read-write role) for a
    read, which is one forgotten statement from a write it never needed."""
    with connect(readonly=True, dict_rows=True) as c:
        rows = c.execute(
            """SELECT id AS ref, country, eligibility_text AS body
                 FROM funding_instruments
                WHERE length(coalesce(eligibility_text,'')) > 40
                ORDER BY id""").fetchall()
    return [dict(r, column="eligibility_text") for r in rows]


def rows_gates() -> list[dict]:
    """Every gate that can DECIDE -- gate_role 'filter', or NULL, which
    `isFilter()` honours as a filter so the system degrades safely while
    encoding coverage grows. A gate already triaged to any other role is inert
    and is not this test's business."""
    with connect(readonly=True, dict_rows=True) as c:
        rows = c.execute(
            """SELECT instrument_id || '/' || gate_key AS ref,
                      instrument_id, gate_key, gate_role, verification_level,
                      value_spec, requirement AS body
                 FROM eligibility_gates
                WHERE gate_role IS NULL OR gate_role = 'filter'
                ORDER BY instrument_id, gate_key""").fetchall()
    return [dict(r, column="requirement") for r in rows]


SCHEMA = {
    "type": "object",
    "properties": {
        "results": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "verdict": {"type": "string",
                                "enum": ["condition", "demand_match", "report"]},
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


def request(batch: list[str]) -> dict:
    """The Messages params for one request over a handful of distinct texts.
    Keyed by digest, so a text that appears on 40 gates is judged once and paid
    for once. PROPERTY is the first, cached block: it is identical on every
    request of a run."""
    from mandate.llm.batch import cached_system  # noqa: PLC0415
    listing = "\n\n".join(f"### {digest(t)}\n{t[:MAX_CHARS]}" for t in batch)
    return dict(
        model=MODEL,
        max_tokens=16000,
        system=cached_system(PROPERTY),
        # Adaptive thinking is ON by default on this model and max_tokens caps
        # thinking AND text together, so the budget is sized for both. `effort`
        # is medium because this is a two-way judgement over a short string,
        # not a research task, and the run is ~100 requests wide.
        output_config={"format": {"type": "json_schema", "schema": SCHEMA},
                       "effort": "medium"},
        messages=[{"role": "user", "content":
                   "Judge each text below. Return one result per id, with a "
                   "reason of at most 20 words that names what in the text "
                   "decided it.\n\n" + listing}],
    )


def parse(text: str | None) -> dict[str, dict]:
    """digest -> {verdict, reason} from one response's JSON."""
    try:
        return {r["id"]: {"verdict": r["verdict"], "reason": r["reason"]}
                for r in json.loads(text or "")["results"]}
    except (ValueError, KeyError, TypeError):
        return {}


def handler(cache: dict):
    """Write one collected batch's verdicts into the cache, and save it.

    Each request's stored meta is {digest: sample}, so this needs nothing from
    the run that submitted it: a batch collected a week later writes exactly
    what it would have written the same night."""
    def handle(results) -> None:
        for res in results:
            meta = res.meta or {}
            got = parse(res.text) if res.ok else {}
            if not res.ok:
                print(f"  !! request {res.custom_id} failed ({res.error}); its "
                      f"{len(meta)} text(s) stay unjudged -- re-run to retry")
                continue
            for d, sample in meta.items():
                v = got.get(d)
                if not v:
                    print(f"  !! no verdict returned for {d}: {sample[:60]!r}")
                    continue
                cache[d] = {"verdict": v["verdict"], "reason": v["reason"],
                            "v": PROPERTY_VERSION, "sample": sample}
        # Persist per batch: a run cut off mid-way must not discard
        # classifications already paid for.
        save_cache(cache)
    return handle


def run(rows: list[dict], cache: dict, chunk: int, limit: int, do_classify: bool,
        plan: list | None = None, in_flight: set[str] | None = None,
        claimed: set[str] | None = None) -> list:
    """The requests that judge every DISTINCT text in `rows` that has no cached
    verdict and is not already in a submitted batch. Returns mandate Items.

    `claimed` is shared across the populations of one run and gains every
    digest this call asks about, so a text that is both a calibration case and a
    gate (or prose and a gate) is asked about once."""
    from mandate.llm.batch import Item  # noqa: PLC0415
    todo: dict[str, str] = {}
    stale = 0
    flying = 0
    for r in rows:
        d = digest(r["body"])
        if d in todo:
            continue
        entry = cache.get(d)
        if entry is not None and not is_stale(entry):
            if do_classify:
                # Carried forward: REJUDGE says the current property cannot move
                # this answer, so it is re-stamped rather than re-paid for. The
                # stamp is what lets check_gate_pertinence.ts test staleness with a
                # plain `v == _property_version` and hold no copy of the policy --
                # one table, in one language, decides re-pay vs re-stamp. Only a
                # --classify run may stamp: a --report run that laundered the
                # version without paying would be a green build over stale answers.
                entry["v"] = PROPERTY_VERSION
            continue
        if in_flight and d in in_flight:
            flying += 1
            continue
        if claimed is not None and d in claimed:
            continue
        if entry is not None:
            stale += 1
        todo[d] = r["body"]
    print(f"  {len(rows)} rows, {len(set(digest(r['body']) for r in rows))} distinct texts, "
          f"{len(todo)} to judge ({len(todo) - stale} never judged, "
          f"{stale} judged under a superseded property"
          + (f"; {flying} more already in a submitted batch" if flying else "") + ")")
    batch_all = list(todo.values())[:limit] if limit else list(todo.values())
    if claimed is not None:
        claimed.update(digest(t) for t in batch_all)
    calls, tin, tout, usd = estimate(batch_all, chunk)
    print(f"  estimate: {calls} batch requests, ~{tin:,} in / ~{tout:,} out tokens, "
          f"~${usd:.2f} on {MODEL} at batch prices (50%)")
    if plan is not None:
        plan.append((len(batch_all), calls, tin, tout, usd))
    if do_classify:
        save_cache(cache)  # persist the re-stamps even if nothing needs judging
    items = []
    for i in range(0, len(batch_all), chunk):
        part = batch_all[i: i + chunk]
        ds = [digest(t) for t in part]
        items.append(Item(
            custom_id="p" + hashlib.sha256("".join(ds).encode()).hexdigest()[:40],
            params=request(part),
            meta={d: re.sub(r"\s+", " ", t).strip()[:220] for d, t in zip(ds, part)},
            est_usd=estimate(part, chunk)[3]))
    return items


def main(argv: list[str] | None = None, batcher=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--classify", action="store_true",
                    help="judge every published text whose hash is not cached, as a "
                         "Message Batch (collects any earlier batch first)")
    ap.add_argument("--report", action="store_true", help="read the cache, call nothing")
    ap.add_argument("--only", choices=["text", "gates"], default=None)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--max-usd", type=float, default=MAX_USD_DEFAULT,
                    help="submit only what the batch-price estimate says fits under this")
    ap.add_argument("--wait-minutes", type=float, default=WAIT_MINUTES_DEFAULT,
                    help="poll for the batch this long; what has not ended is "
                         "collected by the next --classify run")
    args = ap.parse_args(argv)
    plan: list = []
    _load_env()
    from mandate.llm.batch import Batcher, PgStore  # noqa: PLC0415  (etl_env puts mandate/ on the path)

    cache = load_cache()
    if batcher is None:
        batcher = Batcher(BATCH_KIND, store=PgStore.from_env(), brain="capital")
    try:
        in_flight = {d for meta in batcher.in_flight().values() for d in (meta or {})}
    except Exception as exc:  # noqa: BLE001
        if args.classify:
            raise SystemExit(f"the batch store (mandate.llm_batches) is unreachable: "
                             f"{str(exc).splitlines()[0]}. "
                             "Nothing was submitted: a batch nobody can find is money "
                             "spent for nothing.")
        print(f"(batch store unreachable, so in-flight texts are not netted out: "
              f"{str(exc).splitlines()[0]})")
        in_flight = set()
    populations = []
    items = []
    claimed: set[str] = set()
    # Calibration first, unconditionally and on every run: a run that judged
    # 2,500 live strings and never exercised the known answers would report
    # success without having shown the classifier still works.
    print("calibration:")
    cal = [{"ref": c["id"], "body": c["text"], "expect": c["expect"]}
           for c in json.loads(CALIBRATION.read_text())["cases"]]
    items += run(cal, cache, CHUNK_GATES, 0, args.classify, plan, in_flight, claimed)

    if args.only in (None, "text"):
        print("eligibility_text:")
        populations.append(("eligibility_text", rows_text(), CHUNK_TEXT))
        items += run(populations[-1][1], cache, CHUNK_TEXT, args.limit, args.classify,
                     plan, in_flight, claimed)
    if args.only in (None, "gates"):
        print("filter gates:")
        populations.append(("requirement", rows_gates(), CHUNK_GATES))
        items += run(populations[-1][1], cache, CHUNK_GATES, args.limit, args.classify,
                     plan, in_flight, claimed)
    n_t = sum(p[0] for p in plan); usd_t = sum(p[4] for p in plan)
    print(f"\nPLAN: {n_t} distinct texts to judge, {sum(p[1] for p in plan)} batch requests, "
          f"estimated ${usd_t:.2f} at batch prices (cap --max-usd ${args.max_usd:.2f})"
          + ("" if args.classify else "; nothing was called (--report)"))
    if args.classify:
        out = batcher.run(items, handler(cache), max_usd=args.max_usd,
                          wait_minutes=args.wait_minutes, over_cap="truncate")
        print(f"BATCH: {out.line()}")
        print(f"SPENT: ${out.cost_usd:.2f} measured at batch prices over the batches "
              f"collected this run")
        if out.pending:
            print(f"PENDING: {out.pending} batch(es) still processing; re-run --classify "
                  f"to collect them (their ids are in mandate.llm_batches)")

    wrong = [c for c in cal
             if cache.get(digest(c["body"]), {}).get("verdict") not in (None, c["expect"])]
    for c in wrong:
        print(f"  !! MISCALIBRATED {c['ref']}: expected {c['expect']}, "
              f"got {cache[digest(c['body'])]['verdict']} "
              f"-- {cache[digest(c['body'])]['reason']}")

    print()
    for name, rows, _ in populations:
        judged = [r for r in rows if digest(r["body"]) in cache]
        kinds: dict[str, int] = {}
        for r in judged:
            k = cache[digest(r["body"])]["verdict"]
            kinds[k] = kinds.get(k, 0) + 1
        reports = [r for r in rows if cache.get(digest(r["body"]), {}).get("verdict") == "report"]
        print(f"{name}: {len(judged)}/{len(rows)} judged  "
              + ", ".join(f"{k}={n}" for k, n in sorted(kinds.items())))
        print(f"  {len(reports)} are REPORTS -- nothing to clear and nothing to want; "
              f"these may not decide")
        for r in reports:
            note = cache[digest(r["body"])]["reason"]
            decides = " <- HAS value_spec, CAN DECIDE" if r.get("value_spec") else ""
            print(f"  {r['ref']:<58} {note}{decides}")


if __name__ == "__main__":
    main()
