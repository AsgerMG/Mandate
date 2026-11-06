# WS-AW — what a rule should do for a fund that has no siblings

**Date** 2026-08-08 · **Branch** `wsAW-standalone-gates` · follows WS-AU

## The answer in one line

**Nothing — and that is now a measured result rather than an omission.** Both
alternatives were built and measured end to end. Scoring a standalone fund
against the whole candidate pool is *worse*, and worse on the very leaves it
was built to serve; adding a separate absolute term is inert. The two are one
signal at two strengths, so the family is refuted at both ends rather than
untested in the middle. `gateFitScorer` ships unchanged, with the reason
written into it.

The one thing that did change is what a reader of the code is told. The
docstring now says, in the imperative, that a parent-less fund gets no credit
for passing its rules and no penalty for failing them, that this affects 36% of
the publishable corpus, and what was tried. `lib/intelligence/gateFit.test.ts`
makes it a property instead of a paragraph.

## This was never a Spanish problem

WS-AU established the mechanism on one market. Measured as a property of the
ranker, it is sixteen markets:

| | publishable leaves | sole leaf of their regime |
|---|---|---|
| **corpus** | **807** | **292 (36.2%)** |
| ES | 103 | 94 (91.3%) |
| NO | 74 | 73 (98.6%) |
| EE | 56 | 49 (87.5%) |
| LV | 31 | 26 (83.9%) |
| CZ | 47 | 15 (31.9%) |
| PL / DK / GB / HU / LT | 8 / 7 / 2 / 2 / 1 | all of them |
| EU | 45 | 6 (13.3%) |
| FR | 105 | 4 (3.8%) |
| AT, BE, DE, GR, IT, SE | 20, 16, 103, 6, 67, 56 | **0** |

269 of the 292 carry a decidable filter — **940 encoded filters the ranker
never reads**, against 4,366 on the 515 sibling-grouped leaves that it does.
Germany, Italy and Sweden are at zero, which is why a corpus-wide average has
never shown this and why the next register of standalone calls will hit it
again. It concentrates by (channel, country), not by country alone:

    state_aid_satr      ES     88 alone      9 sibling
    national_dev_banks  NO     73            0
    national_dev_banks  EE     48            2
    national_dev_banks  LV     25            0
    national_dev_banks  CZ     15            0

## They are not invisible — that was the surprise

The obvious explanation for WS-AU's bit-identical result would be that these
rows never reach a founder. They reach them in force. 200 holdout founders
replayed through `computeVerdict`, counting standalone leaves in the candidate
pool and in the five rows actually shown:

| | pool rows | standalone | share | of the 5 shown | share |
|---|---|---|---|---|---|
| ALL | 94.8 | 7.2 | 7.6% | 0.23 | 4.5% |
| **ES** | **123.9** | **94.1** | **75.9%** | **1.64** | **32.7%** |
| GB | 22.6 | 2.2 | 9.6% | 0.33 | 6.7% |
| FR | 126.0 | 4.1 | 3.2% | 0.27 | 5.4% |
| NL | 43.2 | 1.3 | 3.0% | 0.00 | 0.0% |
| DE / SE / IT | 101.9 / 77.0 / 87.3 | 0.2 | 0.2% | 0.00 | 0.0% |

**Three quarters of a Spanish founder's candidate pool, and a third of their
table, is funds whose rules the ranker cannot read.** They are not even in a
separate channel where they could do no harm: all 88 sit in `state_aid_satr`
alongside the nine sibling-grouped ES leaves — and every one of the 111
distinct ES holdout answers is sibling-grouped, in `state_aid_satr` (87),
`horizon_eu_partnership` (8), `horizon_eu_pillar_ii` (7), `innovation_fund` (4),
`eic` (2), `edf` (2), `chips_ju` (1). The 88 compete for slots with the answers
and are never one. WS-AU's "the intersection is empty" is confirmed from the
ranker's side.

So the question was live, and the pool was full of exactly the rows the change
would touch.

## Before spending a run: is pool-scope gate fit a size prior?

The objection to scoring across a channel is stated in `gateFitScorer`'s own
docstring: pass rate over one rule is not comparable to pass rate over nine, so
across a channel the statistic drifts towards *how much has been encoded about
this leaf*. Within a regime that is bounded, because siblings inherit a rule
set. Across a channel nothing bounds it.

Measured before implementing anything — the won fund's percentile among its
channel's reachable leaves, n=2,025 holdout pairs, `ANSWERS=real`. 0.500 is
what a statistic that knows nothing scores.

| statistic | ALL | ES | FR | DE | IT |
|---|---|---|---|---|---|
| `encoded` — null: anything encoded at all | 0.507 | 0.650 | 0.499 | 0.499 | 0.494 |
| `full` — verdict tier, then passed/checked | 0.523 | 0.372 | 0.473 | 0.577 | 0.608 |
| `checked` — **null: count of rules evaluated** | 0.528 | **0.733** | 0.472 | 0.562 | 0.540 |
| `passrate` — what `gateFitScorer` ranks on | **0.577** | 0.702 | 0.508 | 0.660 | 0.644 |

Corpus-wide, pass rate clears both nulls: +0.077 against +0.028 for
documentation depth. Not nothing. **In Spain it does not clear them** — 0.702
against a depth null of 0.733. Spain's apparent channel-scope signal *is*
documentation depth, which is precisely what WS-AU predicted from the fact that
zero of the 88 texts contains an assertion verb: a rule cut from budget,
deadline and legal basis describes how much we wrote down, not who qualifies.

That was enough to justify the runs and enough to expect them to disappoint.

## The three arms, end to end

Implemented as one switch so the arms differ **only in scope** — every arm uses
`GATE_MATCH` at the same strength, so a difference is the design and not a
tuning constant.

- **regime** — shipped. Rank inside a regime; skip a group of one.
- **pool** — rank across the whole channel the caller handed us.
- **both** — regime as shipped, times a second *absolute* term, `GATE_MATCH ^
  (2·rate − 1)`. A leaf standing alone gets only this term.

`SPLIT=holdout N=300 ANSWERS=real`, seeds 20260806 / 7 / 99. Raw counts.

| arm | seed 20260806 | seed 7 | seed 99 | **EXACT@5** | **REGIME@5** | standalone stratum |
|---|---|---|---|---|---|---|
| | pool/e5/r5 | pool/e5/r5 | pool/e5/r5 | /900 | /900 | |
| regime | 284/89/248 | 285/90/255 | 285/98/257 | **277** | **760** | 16/47 |
| pool | 284/85/248 | 285/88/254 | 285/98/256 | **271** | **758** | 15/47 |
| both | 284/89/248 | 285/90/255 | 285/99/257 | **278** | **760** | 16/47 |

`pool` loses six exact matches and two regime matches, and does **not** improve
the standalone stratum it was written for. `both` is a single exact match on
one seed — noise.

### The two arms are one signal, which is why this is a conclusion

Within a channel, min-max normalising a pass rate and raising a constant to
`2·rate − 1` are both **monotone in the same pass rate**: they order the leaves
identically. They differ only in authority. `pool` stretches the channel's own
observed range across the full multiplier; `both` leaves real rates — which
cluster well inside [0,1] — close to 1. So this is not two designs of which one
might be tuned into working. It is one signal measured weak and strong:
**nothing at weak, harmful at strong.** Interpolating cannot produce a win.

### What `pool` actually does, seen directly

The same 200 founders, the same replay, counting standalone leaves in the five
rows shown:

| arm | standalone share of the 5 shown, ALL | ES |
|---|---|---|
| regime | 4.5% | 32.7% |
| **pool** | **8.1%** | **34.5%** |
| both | 4.7% | 34.5% |

Scoring these rows nearly **doubles** their presence on founders' tables
corpus-wide. That is the mechanism behind the −6: the arm is not failing to
find a signal, it is finding documentation depth and promoting the
best-documented row — the same failure that cost the objective prior 21 points
and that this file's own comments already warn about for region and objective.
It is now measured for gate fit too.

## Spain, measured with power this time

WS-AU could not make a Spanish claim: at n=12–20 a 95% interval on exact5 is
about ±25pp. `COUNTRY=` restricts the population, so the whole graded ES
holdout can be run at once — **n=115, interval ±8.8pp**:

| arm | in pool | EXACT@5 | REGIME@5 |
|---|---|---|---|
| regime | 102/115 (89%) | 42/115 (37%) | 86/115 (75%) |
| pool | 102/115 | 42/115 | 86/115 |
| both | 102/115 | 42/115 | 86/115 |

**Bit-identical under all three designs.** This is not "unmeasurable" — it is
measured, on the entire population the answer key can grade, and it is flat.

The standalone stratum was given the same treatment. Every GB answer in the set
is the sole leaf of its regime, so `COUNTRY=GB` *is* that stratum, at n=123
instead of the n=17 a 300-row draw gives it (±8.0pp instead of ±24pp):

| arm | in pool | EXACT@5 = REGIME@5 |
|---|---|---|
| regime | 123/123 | 36/123 (29%) |
| pool | 123/123 | 37/123 (30%) |
| both | 123/123 | 37/123 (30%) |

One pair, inside ±8pp. There is no effect here to trade against the corpus-wide
loss.

**A caveat that cuts against my own instrument.** The standalone stratum in
this answer key is close to degenerate: GB's 123 pairs resolve to a single
re-attributed rollup, so "n=123" is 123 founders against *one* fund, not a
sample of standalone funds. It bounds how much a standalone leaf's rank can
move for a real founder; it does not sample the 292 standalone leaves. The
corpus is the wider evidence, and it points the same way.

## What ships

1. **`gateFitScorer` is unchanged.** `git diff main` on `shortlist.ts` touches
   exactly one non-comment line — the docstring terminator moving. The
   executable code is bit-identical, which is why no parity run was needed to
   claim it.
2. **The docstring says so, at the top of its voice.** A new final section
   states that a parent-less fund gets no credit and no penalty, gives the 36%
   and the per-market concentration, gives both arms' numbers, and points at
   the two things that *do* reach a standalone fund. It is addressed to the
   next person about to encode a register of standalone calls.
3. **`lib/intelligence/gateFit.test.ts`** — five hand-built cases making it a
   property: a standalone leaf scores 1 whether it passes its rules or fails
   them, *including* when siblings elsewhere in the same channel are being
   reordered around it. That is the Spanish case exactly. Fixtures are built by
   hand so a corpus refresh cannot make them red.
4. **`scripts/measure_gate_standalone.ts`** — the census, the two null models,
   the channel-scope percentile and the reach probe. Sections 1 and 4 are the
   questions to ask *before* paying to encode a register, and they cost nothing.
   AU shipped the same number on the Python side (`SCOREABLE BY THE RANKER`);
   this is the ranker's own side of it, read from the published corpus.

Nothing was hardcoded: "standalone" is `regimeSize(parentId ?? id) < 2` over
publishable leaves, the scorer's own predicate. No country, fund or scheme code
appears in any of it.

## Floors

`check_recall_floor.ts` after: pool **97%** (floor 93), exact5 **30%** (floor
22), regime5 **86%** (floor 80), plus both population sub-floors. Published as
verdict **#67**. No filter, cap or threshold was touched.

## Three checks are red on `main` and are not mine

Verified by running them on a clean `main` checkout, where they fail
identically:

- `check_corpus_census` — census #6 did not finish cleanly and is older than
  the committed `synthesis.json`. Its own message says only a person can clear
  it, and that `make republish` would make it worse.
- `check_gate_pertinence` — 266 gates await
  `classify_eligibility_pertinence.py --classify`, largely the ES and FR text
  gates encoded by WS-AU and WS-AT.
- `check_hydration_parity` — the SQLite and Postgres stores disagree on gate
  order for a `bdns_es_ayudas` instrument and on two `eit_climate_kic` rows.
  This one came in with the WS-AU merge and touches the ES gates directly;
  it is the most worth someone's time.

(`check_dependencies` is also red on a `nanoid` advisory with no exception
registered. Pre-existing.)

## What I would do next, and deliberately did not do here

**The lever for a standalone fund is selection, not ranking.** 76% of a Spanish
founder's candidate pool is standalone leaves competing in the same channel as
every ES answer. `gateFitScorer` cannot help them and cannot suppress them;
what decides how many of a channel's slots 88 parent-less convocatorias may
occupy is `selectLeafInstruments` and the per-(channel, country) pool cap. That
is a different mechanism with a different failure mode, and it deserves its own
before/after rather than being smuggled into this one.

Two things worth saying about it in advance, from what is above:

- The prize is bounded by what those slots are worth. ES `in pool` is already
  89% and REGIME@5 75%; the ceiling is real but it is not large.
- WS-AU's own recommendation — route `Ámbito regional` to `catchment_regions`
  — feeds selection, not this scorer, and is the better-evidenced version of
  the same idea. It should go first.

And the honest negative: **encoding eligibility rules for a parent-less fund
buys the ranker nothing today.** It still buys the eligibility *screen*, which
reads gates per fund and is what a founder actually reads on screen one. That
is a real product surface and a real reason to encode. It is not a reason to
expect recall to move, and WS-AU paid for that lesson once already.
