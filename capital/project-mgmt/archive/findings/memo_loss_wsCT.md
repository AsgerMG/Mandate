# The memo was not half as good as the screen. The measurement was.

**Workstream CT · 2026-08-09 · isolated worktree, branch `wsCT-memo-loss`.**

Reproduce (FREE — one Voyage embed and one Postgres read per pair, no model
calls). Every figure below carries its attestation line.

```
cd website/frontend
SPLIT=tune    N=250 npx tsx scripts/_wsct_blocks.ts   # why VER-BLOCKED fires
SPLIT=tune    N=250 npx tsx scripts/_wsct_order.ts    # the three orderings
SPLIT=tune    N=250 npx tsx scripts/_wscr_sixth.ts    # the shipped path
npx tsx scripts/check_winner_not_gated.ts             # hermetic, sub-second
```

---

## 1. All 58 blocks, classified. 51 of them were one line of code.

wsCR found that every won leaf the memo pool held and the memo order lost was
lost to `VER-BLOCKED` — 58 on tune, 71 on holdout — and asked whether the rule,
the evidence or the founder's answers were wrong.

**It was none of the three. It was the comparator.**

```
tune n=250 seed 20260806   ranker: all 245 request(s) on EMBEDDING

  DECIDING FIELD                          count    share
  entityCountries                            51    87.9%
  sector                                      3     5.2%
  entityCountries + ticketBand                2     3.4%
  entityCountries + sector                    1     1.7%
  consortium + entityCountries + ticketBand   1     1.7%
```

The corpus encodes "must be established in X" with the country's **English
name**. Live Postgres and the committed snapshot agree exactly:

```
  307  entityCountries  in      NAME   role=filter    248 instruments
   29  entityCountries  not_in  NAME   role=filter     12 instruments
    2  entityCountries  in      ISO2   role=programme_fact
    1  entityCountries  in      NAME   role=programme_fact
```

`matchesAny` compared those against the founder's answer as **strings**. So
`["Denmark"]` was FALSE for `["DK"]`. `entityCountries` is structural and those
gates are cited, so one false is conclusive: `blocked`, and blocked never
reaches the founder. **The fund was deleted for founders who are Danish.**

This is the same shape as the `region`/"Sweden" bug that
`check_comparator_admits` exists for, and that check cannot see it: it derives a
field's candidate answers from the values the spec itself names, so "Denmark" is
a candidate that makes the gate true and the gate looks satisfiable.

### The confound, resolved per case rather than in aggregate

The harness replays every founder as `"TestCo"` and wsCQ has established that 18
of 23 intake fields are never supplied. Each of the 58 was re-assessed through
the SAME production function (`assessInstrument`) on register-derived facts
only:

```
  SURVIVES REAL ANSWERS?
  YES — the rule, the evidence or the attribution                55   94.8%
  NO  — an invented answer produced a correct block               3    5.2%
```

**And 51 of those 55 survivors are the format defect above, not a defect in any
gate.** So the honest classification of wsCR's 58 is:

```
  51   a comparator that could not tell "DK" from "Denmark"     FIXED here
   4   a cited structural `sector` gate that genuinely fails    REAL, open
   3   two curable CHOICE blockers on invented answers          harness artefact
```

### The four that are real, and why they are not fixed here

All four are `sector`: a narrow scheme purpose flattened onto this product's
eleven-value taxonomy, which cannot express it.

- `equals sector "other"` for "applicant must be a tourism service provider".
  A **catch-all bucket used as a positive requirement** — no company can satisfy
  it on purpose.
- "must offer a solution in the realm of manufacturing technologies",
  "programmes must be aimed at manufacturing activities", "at least one
  consortium member must be an energy-intensive industrial company", each
  encoded as sector equality against the company's register sector.

These are encoding defects in `ETL/terms/encode_gates.py`, they write to Railway
Postgres, and they are **not** an argument for weakening the rule. Recorded as
standing debt at the new guard's ceiling.

## 2. `scoreFit`: what it sorts on, and what actually calls it

**Verified rather than trusted, because the repo's own record was wrong twice.**

- `rankByFit` — no production caller. Correct as documented; only
  `scripts/shadow_fit.ts`.
- `scoreFit` — fit.ts said "one production caller: `synthesize()` in
  pipeline.ts". **False since wsCR.** The caller is `orderMemoCandidates`
  (memoCandidates.ts), and `pipeline.ts` carried a dead
  `import { scoreFit, sectorFitScorer }` for the whole of that time. Both
  corrected in the files.
- It re-sorted the entire `VERDICT_POOL` of 18 on nine weighted components
  (eligibility .24, theme .16, proximity .13, sector .12, scale .12, structure
  .08, capital .08, precedent .04, liveness .03), times 0.75 for thin evidence,
  with pool position as the only tie-break. `ease` is computed in the same
  function and **is not in the sort at all** — pipeline.ts's comment says it
  re-ranks "on EASE before cutting to five", and it has never done so.

### Should it run at all: three arms, one replay, one pool

```
tune    n=250   ranker: all 245 request(s) on EMBEDDING
                         fit (shipped)   pool      verdict
  MEMO@6                     24.0%       28.8%      27.6%
  off-country rows in six        0           0          0
  published rows `open`       100%       95.4%       100%

holdout n=250   ranker: all 250 request(s) on EMBEDDING
  MEMO@6                     19.6%       21.6%      22.0%
  published rows `open`      99.9%       96.2%       100%
```

`pool` scores highest on tune and is **not** what ships. It buys its last 1.2
points by publishing rows carrying an obstacle or no assessable verdict at all,
and here a wrongly-shown row costs more than a missing one.

**`verdict` ships** — qualification first, the pool's own order inside each
band. It keeps the whole of `fit`'s published-row quality (100% `open`, better
than `fit`'s own 99.9% on holdout), zero off-country rows, and it is the better
arm on holdout as well as within 1.2 points on tune. What it discards is the
seven components fit.ts itself records as never reaching a founder's table and
which nothing had ever measured against the shortlist's ranking.

Regime concentration on the 21 pairs the re-sort was demoting: 14 regimes / 11
countries on tune, 14 regimes / 7 countries on holdout, largest regime 4. No
programme carries this.

## 3. The guard: `check_winner_not_gated.ts`

> **No pair the award register records as a WIN may be judged `blocked` by the
> encoded gate layer on the strength of facts the register itself states about
> that company.**

Register-derived facts only — country and sector, both attributes of the firm
independent of the award under test. Every field a replay would invent is left
**unanswered**, because `evaluateSpec` returns null for an unanswered field and
a guard built on invented answers would ratchet on fiction. Names no fund, no
country, no sector, no body. Hermetic: committed snapshot, committed answer key,
`delete process.env.DATABASE_URL` at the top. In `npm run check`, 1.1s.

**Proved able to fail, both ways, rather than assumed:**

```
  GREEN   207 of 6,155 judgeable pairs (3.4%), ceiling 207, floor 6,000
  RED 1   revert comparator.ts + FIELD_VALUE_DOMAIN to 6ef92151
          -> 3,818 of the SAME 6,155 = 62.0%, and the ceiling reds
  RED 2   strip every valueSpec from the snapshot
          -> a serene "0 blocked", and the anti-vacuity branch reds instead
```

**Sixty-two per cent.** That is what the encoded gate screen was doing to the
answer key, on the stage that ships, and nothing in this repo could see it
because nothing measured that stage.

## 4. MEMO@6, before and after

```
                          tune                    holdout
  MEMO@6  before          15.6%                    14.0%
  MEMO@6  after           27.6%  (+12.0)           22.0%  (+8.0)
  SCREEN@6 after          30.4%                    26.0%
  VER-BLOCKED             58 -> 7                  71 -> 17
  memo order depth        median 9 -> 18           median 8 -> 18
  screen/memo rank agree  12/72 -> 62/72            7/28 -> 47/51
```

Attested: tune before/after `ranker: all 490 request(s) on EMBEDDING`; holdout
before/after `ranker: all 500 request(s) on EMBEDDING`. Both "before" runs were
taken on this branch with only `comparator.ts`, `types.ts`, `memoCandidates.ts`,
`fit.ts` and `pipeline.ts` reverted to `6ef92151`, so the A/B is the change and
nothing else. Both reproduce wsCR pair for pair (15.6 / 14.0, 58 / 71 blocks).

**The memo is no longer half the screen. It is 2.8 points behind it on tune and
4.0 on holdout**, and the whole of that residual is now attributable: 7 and 17
`VER-BLOCKED`, plus the demotions the verdict banding makes.

## 5. ██ How much of that is a product gain, and how much is a retraction ██

**Be exact about this, because it is the kind of number this project has
retracted three of today.**

Production's `entityCountries` comes from one control — the panel's country
select, which emits full English names (`COUNTRIES`, panel.tsx) — folded in
server-side by `withIncorporationCountry`. **A real founder was never blocked by
a country gate.** Every recall harness in this repo, `check_recall_floor.ts`
included, supplies `entityCountries: [t.country]` as ISO2.

So decompose the +12.0:

| | tune MEMO@6 | what it is |
|---|---|---|
| 15.6% | measured | **not the product.** A country answer no founder sends |
| 24.0% | comparator fixed, old order | **what the product already delivered** |
| 27.6% | comparator fixed, new order | what the product delivers now |

**The genuine product gain this branch ships is +3.6 tune / +2.4 holdout, from
the ordering change.** The other +8.4 is the repair of a measurement defect.

That makes wsCR §3 — "the memo publishes a table half as good as the screen it
follows" — **substantially wrong, and this workstream's own premise with it.**
The memo was never half the screen. Its *measurement* was, and it has been for
as long as anything has measured the memo path, which is two days.

The comparator fix is still a real hardening rather than only a test repair:
two `programme_fact` gates already carry ISO2 today, `not_in` is tightened in
the same stroke (a rule reading "not established in the United Kingdom" now
catches a founder who answered "GB", which is the opposite harm), and the
encoder's choice of spelling can no longer decide whether a founder sees a fund.

**FOR wsCQ, who owns the harness:** the confound is not only the 18 missing
fields. One of the five fields that IS supplied is supplied in a format the
product never produces, and it was worth 62% of the answer key. Do not fix it in
the replay — it is fixed in the comparator, where both spellings now work.

## 6. Two things found while verifying, neither mine

- **`check_comparator_admits` is vacuous for `entityCountries`.** Its candidate
  answers for a field come from the values the spec itself names plus the
  field's declared vocabulary, and `VOCABULARY.entityCountries.values` is `[]`
  by design. So for the single most-encoded field in the corpus its whole
  candidate set is the gate's own allowed list, which trivially satisfies the
  gate. The property it states is right; the population it states it over cannot
  see the answer a founder actually gives.
- **`pipeline.ts` claimed the memo re-ranks on EASE.** It does not and, on the
  evidence of the code, never has: `scoreEase` reaches `whyEasyLine` and the
  sort key has always been `fit.score`. The variable is still called
  `rankedByEase`.

---

## What was changed

- `lib/intelligence/types.ts` — `FIELD_VALUE_DOMAIN`, keyed on
  `keyof EligibilityAnswers` so the compiler demands a domain for every intake
  field added later. That is the test for the unseen case.
- `lib/intelligence/comparator.ts` — `in`, `not_in` and `equals` compare
  countries rather than spellings on a country-domain field, symmetrically, with
  a fallback to the previous string behaviour whenever either side fails to
  resolve. A blanket `toIso2` would map the answer "no" onto Norway; that is
  pinned by a test.
- `lib/intelligence/comparator.test.ts` — 8 cases, including the "no"/Norway
  collision and `"Ukraine non-government controlled"`, a real corpus value that
  names no ISO2.
- `lib/intelligence/memoCandidates.ts` — `MemoOrderArm`, `ORDER_ARM = "verdict"`
  with the three-arm measurement written at the constant.
- `lib/intelligence/fit.ts`, `lib/intelligence/pipeline.ts` — the caller
  documentation corrected, and a dead import deleted.
- `scripts/check_winner_not_gated.ts` — new, in `npm run check`.
- `scripts/_wsct_blocks.ts`, `scripts/_wsct_order.ts` — the measurements.

`npx tsc --noEmit` clean. 360 unit tests pass. `check_winner_not_blocked` PASS
at 15 before and after. `check_recall_floor` all floors met, EXACT@5 27%.
`check_env_loader` ok. `check_corpus_census` and `check_verdicts` fail
identically on `6ef92151` and are not this branch's.

No floor added, removed, raised or lowered.
