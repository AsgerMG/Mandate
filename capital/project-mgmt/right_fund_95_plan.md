# Getting the right fund in front of the founder, 95% of the time

Written 2026-08-03. Every number measured by `scripts/measure_recall.ts`, which
replays real recipients from our own corpus. Re-measure before believing any
claim here.

## How we measure "right"

The only ground truth we own, and it is a strong one: **150k companies with
traced awards**. Replay a real recipient -- their country, sector, and the
project they were actually funded for -- and ask whether the fund that actually
paid them comes back.

```
N=80 npx tsx scripts/measure_recall.ts
```

Two numbers, and they mean different things:

- **Pool recall** -- is the fund among the candidates considered at all. A miss
  here is structural: the fund was eliminated before ranking saw it.
- **Recall@6** -- is it among the six rows a founder actually reads.

## Where we are

```
pool recall   94%          (was 68% this morning)
recall@6      14%
```

And the number that shapes this whole plan -- where the right fund sits in the
pool when it is not shown:

```
median rank 9    75th 11    90th 13    worst 16
rank 1-6: 11     7-10: 42   11-15: 20  16+: 2
```

**The ranking is not wrong by miles. It is wrong by three or four places.** In
56% of cases the right fund sits at rank 7 to 10, just under a display cap of 6.
That is why 95% is a credible target rather than an aspiration.

## What the target should actually be

Stating this plainly because the obvious reading of "95%" is the wrong goal.

**Recall@6 = 95% is not achievable and should not be chased.** A founder is
typically eligible for ~95 funds; six are shown; the fund they historically won
is one valid answer among several. Demanding the exact historical match 95% of
the time would mean overfitting the ranker to past awards, which is a different
product from advising on the best available route.

The targets worth committing to:

| Metric | Now | Target | Why this one |
|---|---:|---:|---|
| Pool recall | 94% | **>=95%** | a fund never considered cannot be advised on. This is a correctness floor. |
| Recall@6 | 14% | **>=60%** | the historically-won fund should usually be on the table |
| Recall@10 | ~71% | **>=95%** | the pool the WRITER sees must almost always contain it |
| Rank median | 9 | **<=4** | the ranking's actual job |

Recall@10 at 95% is the honest reading of "we always find the right fund": the
candidate set handed to the writer contains it, even when the six published rows
prioritise something else for good reason.

## Phase 1 -- Close the last of the pool gap (94% -> 95%+)

Four of 80 still never reach the pool. Each is a specific fund and a specific
reason; there is no general fix to guess at.

- Print the four with their channel and the exclusion rule that removed them.
- Expect the remaining causes to be `SEL-BAND` (ticket band outside a channel's
  hardcoded range) and `SEL-CHANNEL-CAP` (channel pool already full). Both are
  hardcoded constants that predate having any measurement.
- Fix only what the evidence names. Do not raise a cap because it might help.

## Phase 2 -- Fix the ranking, which is the real work

The distribution says something specific: roughly eight funds are consistently
ranked above the right one, and they are the same kind of fund each time. The
job is to find what they have in common.

**2a. Diagnose, do not guess.** For each miss, print the funds ranked above the
right one with their score components. Two sort-key changes have already been
tried and moved nothing (blending `sectorFit`, promoting EU-wide funds to
country parity), which is evidence that the current components do not separate
these cases. Find the discriminator before changing a weight again.

**2b. The candidate signals, in order of expected value.**

- **Award-history fit.** A fund that has paid 400 companies in this sector at
  this ticket size is a better bet than one that paid 3. We hold
  `award_p50`, `award_n`, `company_count` and `sector_mix` per instrument and
  none of them ranks a row today. This is the strongest untried signal.
- **Instrument-profile quality.** Semantic similarity is systematically weak for
  large generalist programmes because their profile is diluted across everything
  they fund: `horizon_eu_cl4` scored 203rd of 958 for a company it had actually
  funded. Consider embedding a fund's profile PER SECTOR rather than once, so a
  broad programme can match sharply on the slice that matters.
- **Peer precedent.** "Three companies in your sector, your country, your size
  took this route" is both a ranking signal and the single most persuasive line
  in the memo. It is computed nowhere today.

**2c. Row allocation is per channel, and that caps what ranking can do.** Rows
are assembled channel by channel, so the right fund must win its channel AND its
channel must win one of six slots. Score-first allocation across all candidates,
with a diversity floor rather than a hard per-channel quota, is the structural
change. Measure it: it may be worth more than any weight.

## Phase 3 -- Ask better questions, since the query bounds everything

Retrieval cannot beat the query. Two asks, failing differently:

- **Screen one** decides which funds are considered at all. A missing question
  silently removes funds, invisibly, because nobody sees what was never a
  candidate. Measure which fields actually change the shortlist: vary one field
  at a time across the archetypes and count how many rows move. A question that
  moves nothing costs a founder attention for no gain.
- **The adaptive round** already generates questions from the verbatim gate text
  of shortlisted funds, so it self-corrects as the corpus improves. In good
  shape; leave it alone until Phase 2 lands.

Specifically worth testing: the founder's free-text description is the entire
semantic query. One extra sentence of prompting ("what does the money pay for,
in one line") may be worth more than any ranking change.

## Phase 4 -- Lock it in

- `measure_recall.ts` runs on a fixed seed set of 120 recipients, committed, so
  the number is comparable across sessions.
- Add it to the check suite with a floor: **pool recall must not fall below
  95%**. A ranking change that quietly loses candidates should fail the build
  the way a coverage regression does.
- The archetypes stay as they are: 12 shapes across six markets and twelve hubs.
  They test that the pipeline behaves; `measure_recall` tests that it is right.
  Both are needed and neither substitutes for the other.

## Order

1. Phase 1 (four named misses) -- small, and it closes the correctness floor.
2. Phase 2a diagnosis -- one script, no changes, decides everything after it.
3. Phase 2c row allocation -- likely the largest single lever.
4. Phase 2b signals, guided by 2a.
5. Phase 3, in parallel; it gates nothing.

Phase 2a is the gate. Two ranking changes have already produced no movement, and
a third guess would be a third guess.
