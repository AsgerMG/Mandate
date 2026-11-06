# wsIM — the stage is real, the gap is real, and the headline cannot be made faithful at any price

**Free. No paid model call, no production write, no Railway, no `data/db.sqlite`.**
Everything below is either read out of source, computed offline from
`public/data/companies_index.json`, or recovered from runs somebody already
paid for.

---

## 1. THE CLAIM HELD. THREE THINGS IN THE BRIEF DID NOT.

wsIL's finding is confirmed against the code, and independently — three
separate files in this repo already say it in their own headers
(`_wscu_memo.ts:25-38`, `_wsdq_run.ts:22-27`, `archive/_wsdq_seam.ts:33-39`),
which is itself worth noticing: the fact was written down three times and never
once reached the instrument.

`pipeline.ts:1836`, in `runIntelligence`:

```ts
const fieldChannels = new Set<string>([
  ...(selfRecord.matched ? selfRecord.channels : []),
  ...records.flatMap((r) => (r.matched ? r.channels : [])),   // <- the paid search
  ...dbPeers.flatMap((r) => r.channels),
]);
```

`measure_funnel.ts:832` and `:872`: `fieldChannels` from `dbPeers` alone,
`records: []`. Same at `_wsgd_stages.ts:185`, `_wsdr_curve.ts:112`, and 30-odd
harnesses in `scripts/`.

**Three corrections, all of which strengthen the finding rather than weaken it.**

1. **`npm run stages` is `scripts/measure_funnel.ts`, not `_wsgd_stages.ts`.**
   The brief and wsIL's pre-registration both name `_wsgd_stages.ts:185` as
   "what `npm run stages` runs". `package.json` says
   `"stages": "npx tsx scripts/measure_funnel.ts"`. The claim is true of
   `measure_funnel.ts` at line 832 — a different file, the same defect, and the
   figure that gets quoted comes from the one nobody had checked.

2. **"The request path" is two paths, and one of them genuinely has no such
   stage.** `computeVerdict` — the instant verdict route, what a founder sees
   first — is *model-free by contract* and has never called
   `discoverAndResearch` for anybody. So a harness reproducing that path is not
   short a stage. `measure_funnel` is not such a harness: it cuts to the
   writer's candidates and reports EXACT@K on that order, which is the memo's
   path. The precise statement of the defect is narrower than "every free
   instrument measures a pipeline missing a stage", and more useful:
   **the funnel builds the instant screen's pool and then reports the memo's
   ordering out of it.**

3. **`fieldChannels` and `dbPeers` do not "mostly agree" — and the reason is
   not the one anybody expected.** See §2.

**And `reachCeiling` is downstream of it.** `refresh.py:565` derives it from
`share("gates_pass")`; `gates_pass` in `measure_funnel.ts:534` is
`rankAccessible != null`, conditioned on `founder_screen` = the won fund being
in `buildInstrumentTableHydrated`'s output — which is built *from*
`fieldChannels`. The 86 is a ceiling on the harness's pipeline. **Nothing here
touches it.**

---

## 2. HOW BIG, ON REAL DATA, WITH THE SAMPLE STATED

`npx tsx scripts/_wsim_mediator.ts` — offline, free. Output in `mediator.txt`.

`fieldChannels` is the **mediator**: identical on two paths ⇒ everything
downstream is bit-identical for that founder. So its move rate is a **hard
upper bound** on the share of founders whose published rows can differ. That is
wsIL's own primary, and it is the only part of the chain measurable at EUR 0.

### A. The harness's own population — n = 897, exact, offline

| | |
|---|---|
| founders whose `fieldChannels` is **EMPTY** | **308 / 897 (34.3%)** |
| ...because the founder is not in the corpus | 24 |
| ...because their sub-sector is a **catch-all** | **284** |
| `fieldChannels` of 1–2 channels | 228 (25.4%) |

**That 284 is the finding I did not expect and it is bigger than the web
search.** `findPeersBySubsector` returns nothing for a generic bucket *on
purpose*, so for a third of the population the harness's tier-1 sort key is
false on every row and the ordering is the score alone. Production has a second
door into that same slot — the modal sub-sector of the matched web peers
(`pipeline.ts:1814-1820`) — and it fires precisely when the first door is shut.
The harness has neither door.

### B. Recovered production runs — n = 51 runs, 13 companies, live web search

Recovered, not simulated. `memo-bench/` holds 50 real `runIntelligence` briefs
(gitignored, now archived here as `recovered_runs.json`) and git history holds a
51st: `first_test_wsDQ/cisteo_medical/run_off.json`, deleted in `85de7c2c`. Each
report names its comparable firms; `matchCompany` resolves a name to its
channels out of a static committed file. What the paid search returned is
therefore recoverable **exactly, offline, for nothing**.

The stage is isolated from the funnel's *other* declared difference — the
funnel withholds the founder's own traced channels on purpose, so those are
counted on both sides.

| | |
|---|---|
| runs where the **paid stage** added ≥1 channel | **27 / 51 (52.9%)** |
| runs where `fieldChannels` was empty without it | 7 |
| the whole harness gap (stage **and** withheld own history) | 34 / 51 (66.7%) |
| companies with ≥1 such run | 9 / 13 |

**This is a LOWER bound.** A comparable is recorded only where its channel
became a published row, at most three per channel, so channels the search
produced that never surfaced as an institution are invisible here.

**Thirteen bench companies are not the 897 and nothing here generalises from
them.** They are scale-ups with web presence; the 897 are award recipients who
are in the corpus by construction. The direction of that bias is stated in §4
because it decides the recommendation.

### C. Does the published six differ? — NOT ANSWERABLE AT EUR 0, AND SAY SO

`codes` and the six need the live corpus (Postgres) and the embedding ranker
(Voyage), and this workstream may touch neither. What is available is the
bound, and it is not a tight one: the mediator moves on at least 52.9% of
recovered runs, so **at least half the founders in that sample are founders on
whom the six *may* differ.** Anyone quoting a share of six-row changes without
having run the selector is quoting an estimate, and the honest answer is that
nobody has measured it.

### D. THE STAGE DISAGREES WITH ITSELF — an arm wsIL was about to buy

wsIL §5 pre-registers a control-vs-control noise arm because "nobody has
measured this stage's self-disagreement". Twelve of these companies were run
**more than once** against the same frozen request:

| companies run more than once | 12 |
|---|---|
| **whose `fieldChannels` was NOT stable across runs** | **9** |

Nortal: 3 runs, 3 distinct sets. eAgronom: 6 runs, 4 distinct sets. sennder: 6
runs, 4 distinct sets. **Part of §5's arm has already been paid for and never
read.** It does not replace the arm — these runs were days apart, not
interleaved, so day-drift and self-disagreement are not separated — but it
settles the direction, and the direction decides §4.

---

## 3. THE DECLARATION, AND WHY IT IS A PROPERTY

> **A stage the request path runs must either run in the harness, or be
> declared absent in that harness's own output.**

**The compiler is the test for the unseen STAGE.** `HarnessStages` is
`Record<PipelineStep, StageDisposition>` over the request path's *own* stage
vocabulary — the literals `runIntelligence` emits and the panel renders to the
founder while they wait. Add a stage to the request path and every declaring
harness stops building until somebody answers for it. There is **no list of
stage names** in any check; `check_contracts` fails the build on that shape,
and a list would be correct today and silently short on the day it mattered.

**`check_stage_declaration.ts` is the test for the unseen HARNESS,** and which
scripts owe a declaration is *derived*: an npm script whose import graph reaches
`lib/intelligence/memoCandidates` reproduces the request path as far as the
candidates a brief publishes from, so whatever it prints will be read as a
statement about the product. Five today (`stages`, `trace`, `bench`, `funnel`,
`redteam`); the sixth is in scope the day it is wired into `package.json`, with
no edit to the check. The line is drawn at `package.json` and not at a filename
pattern because a workstream's own `_wsXX_` harness is read by the person who
wrote it in the week they wrote it, and a ceremony is how a real banner stops
being read.

**Nothing may declare a stage missing without saying what went missing.** An
empty reason throws. This repo has shipped `ok — every value carried by the 0
publishable instruments is reachable`.

**`not_on_this_path` exists because §1.2 is true**, and it costs the author a
sentence naming which path — the sentence a reader checks the claim against.
`npm run redteam` uses it honestly; `measure_funnel` may not.

What `npm run stages` now prints, above every number:

```
██ THE REQUEST PATH'S `discovering` STAGE IS ABSENT IN THIS RUN.
   `discoverAndResearch` is a paid web-search-grounded call the request path
   makes on every brief; this run passes `records: []`, so no web-found
   comparable's channels union into `fieldChannels` — which seeds `codes` in
   `selectInstrumentRows` (pool membership) and sets `usedInField` (tier 1 of
   the row sort, above the entire score). Every number below is a measurement
   of a pipeline that DOES NOT HAVE that stage, not of the one a founder is
   served. Do not quote a figure from this run as end-to-end without saying so.
```

`querying_db` is declared REDUCED with the 34.3% in it, and `generating` ABSENT
because there is no writer call.

---

## 4. THE PRICE, AND WHY I RECOMMEND NOT PAYING IT

### What one `discoverAndResearch` call costs

Derived from the tapes and from **production's own `costOf`**, not assumed.
The sent half is exact and offline: `assembleInstructions("screen")` is 6,796
chars, the fixed user turn 1,053, the context a median 497 (wsIL) — **8,346
chars ≈ 2,318 tokens**. What is *not* knowable without a call is how much the
web search pulls into context, which is what dominates.

| | EUR |
|---|---|
| 1 search, nothing retained (floor, not realistic) | 0.022 |
| 4 searches, +10k result tokens | 0.068 |
| 4 searches, +25k result tokens | 0.095 |
| 4 searches, +50k, plus one `pause_turn` resume (the cap) | 0.246 |
| **measured ceiling: cisteo_medical, research + writer, 2 calls** | **0.2390** |

The measured tape caps it: research **< EUR 0.239** because the writer is
positive. Backing out a plausible writer (≈8k output at $10/MTok plus ~20k
input ≈ EUR 0.11) puts the research call at **≈ EUR 0.13**, inside the bracket
and consistent with wsIL's $0.10–0.20 estimate.

### The funnel with the real search, n = 897

`measure_funnel` is free apart from one Voyage embedding, so adding the stage
adds **exactly one paid call per founder**:

> **EUR 45–135 for one full-population run, hard-capped at EUR 214.**

Cheaper than wsIL's EUR 200–400, because that priced *two interleaved arms* and
this is one.

### THE RECOMMENDATION: DO NOT BUY IT. ACCEPT THE STUB AND LABEL IT — WHICH IS NOW ENFORCED.

Not on cost. EUR 115 is affordable. Three reasons, in order of weight:

1. **THE HEADLINE CANNOT BE MADE FAITHFUL AT ANY PRICE.** The stage's input is
   the live web. Nine of twelve companies produced a *different* `fieldChannels`
   on a repeat run against the same frozen request (§2D). A funnel that ran the
   real search would print a different number every day, would not be comparable
   to the 39.0% or to any figure already published, and would need re-buying to
   compare with anything. Today's number is reproducible and understated; that
   is a better instrument than one that is faithful and non-reproducible. **The
   answer to "can our headline be made faithful" is no, and the right response
   is the label, not the purchase.**

2. **A run at n=897 would price the stage where it matters least.** The recall
   founders are award recipients and therefore in the corpus by construction —
   only 24 of 897 are unmatched. Production's founders mostly are not, and for
   an unmatched founder the search is the *only* source of both peers and
   channels. In the recovered sample, 4 of 13 companies were unmatched and the
   stage carried everything for them. Buying the arm would measure it on the
   population where its contribution is smallest and then quote the result as
   the product's.

3. **A paid instrument stops being run.** `measure_funnel` is the one
   measurement taken on every change, and it is free by construction — the
   header says so and refuses `NO_PG` to keep it honest. EUR 115 a run makes it
   a thing somebody has to decide to afford.

**The one purchase worth considering, and it is small.** If the owner wants a
*bound* on the headline's error rather than the headline itself: a research-only
paired subsample, **n ≈ 60, run twice per founder to separate the stage's
effect from its own noise — EUR 15–18 total.** It buys one sentence the label
cannot: "the mediator moves on X% of founders against a self-disagreement floor
of Y%". That converts "we cannot say how wrong 39.0 is" into a number. Nothing
larger is worth buying, and the full arm least of all.

---

## 5. WHAT WAS NOT DONE, DELIBERATELY

- **No number was changed.** Not the headline, not `reachCeiling`, not a floor,
  a tolerance or a ceiling. §1 says the 86 is downstream of the stubbed stage;
  that is a finding for the owner, not an edit.
- **No paid call, no Railway, no `data/db.sqlite`.** The one scripted run that
  reached Postgres was `npm run check` invoked with npm's `--only` instead of
  the runner's; it was stopped and wrote nothing. The single check was then
  recorded through `node scripts/run_checks.mjs --only=...`, which is hermetic.
- **The other ~30 `_wsXX_` harnesses were left alone.** They are dead
  investigations; requiring a declaration in each is the ceremony §3 argues
  against.
