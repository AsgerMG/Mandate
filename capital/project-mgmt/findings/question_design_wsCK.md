# The residual is a TOPIC residual, the topic cannot be asked, and 95% is not reachable.

**Workstream CK · 2026-08-09 · isolated worktree off `main` at `7190de32`.**

Reproduce (FREE — Postgres reads plus Voyage embeds, no model calls, nothing
written to the database):

```
cd website/frontend
npx tsx scripts/_wsck_residual.ts                       # what must be distinguished
SPLIT=tune    N=250 OUT=/tmp/wsck/tune.json    npx tsx scripts/_wsci_autopsy.ts
SPLIT=holdout N=250 OUT=/tmp/wsck/holdout.json npx tsx scripts/_wsci_autopsy.ts
npx tsx scripts/_wsck_topic.ts                          # the topic oracle, as a curve in K
npx tsx scripts/_wsck_oracle.ts                         # every candidate question, bounded
SPACE=profile SPLIT=tune npx tsx scripts/_wsck_real.ts  # the same question, answered by a founder
SPLIT=tune N=250 npx tsx scripts/_wsck_money.ts         # the money question, answered for real
npx tsx scripts/_wsck_probe.ts                          # proof that money path is live
```

Every replay printed `ranker: all N request(s) on EMBEDDING` and reproduced the
shipped baseline exactly: **26.4% tune, 24.0% holdout**.

---

## 1. What the residual actually needs distinguished

Not a guess and not a question — the inverse. Take the 598 leaves sitting in a
residual class larger than one under the six fields that already rank, and ask
what their class-mates disagree on.

```
fact                       answerable   mean class   alone   within five rows
TOPIC   call title words       yes           1.4      78%          98%
BODY    administering body     no           16.8      13%          52%
WINDOW  closing date           yes          22.0      17%          56%
MONEY   capital type           yes          26.6       3%          28%
WINDOW  source policy          yes          29.8       0%          25%
```

and from the other side, the clustering — which facts split each class:

```
TOPIC + WINDOW      33 classes   201 leaves   33.6%
TOPIC alone         25 classes   150 leaves   25.1%
MONEY+TOPIC+WINDOW  11 classes   137 leaves   22.9%
MONEY + TOPIC        4 classes    99 leaves   16.6%
WINDOW alone         3 classes     6 leaves    1.0%
NOTHING SPLITS IT    2 classes     5 leaves    0.8%
```

**TOPIC is in the separating set of 98.2% of residual leaves and is the only
separator for 25.1% of them.** 36 regimes, largest 15%, so this is not one
programme. Three columns — `route_status`, `intensity_p50`, `application_url` —
are empty across the entire residual and can separate nothing today.

The four award-derived facts are reported under a CIRCULAR heading and never
folded in: the answer key's own award is one of the awards they are computed
from, which is what retracted wsBY's 85.5%.

## 2. Every candidate question, bounded by a perfect answer

From the wsCI pool dumps, exactly, no replay. PARTITION (matching candidates
first, order preserved) is the shippable arm; it cannot remove a row, so it
cannot hide a fund.

| question | tier | present | tune | holdout | gain concentration |
|---|:--:|--:|--:|--:|---|
| TOPIC 8 options | 1 | 100% | +14.0 | +18.4 | 20–23 regimes, max 20% |
| **TOPIC 16 options** | 1 | 100% | **+22.0** | **+24.4** | 28–29 regimes, max 22% |
| TOPIC 24 options | 1 | 100% | +25.2 | +27.6 | 27–31 regimes, max 20% |
| TOPIC nested (≈250 cells) | 1 | 100% | +42.4 | +40.0 | 35–40 regimes, max 26% |
| WINDOW quarter needed | 1 | 27–30% | +14.0 | +14.8 | 10–12 regimes, max 35% |
| WINDOW source policy | 2 | 100% | +2.0 | +4.4 | 3–5 regimes, max 40% |
| **MONEY award magnitude** | 1 | 97% | **+20.0** | **+21.6** | 27–31 regimes, max 17% |
| MONEY capital type | 1 | 100% | +7.6 | +8.8 | 10–12 regimes, max 26% |
| MONEY co-financing band | 2 | 0–2% | +0.0 | +2.0 | — |
| SHAPE framework flag | — | 100% | +0.0 | +0.0 | — |
| *CONTROL* perfect programme | — | 100% | +26.8 | +28.4 | 50 regimes, max 7% |
| *CONTROL* perfect leaf | — | 100% | +70.0 | +67.6 | = the pool ceiling |

**Killed on the bound, before anything was built:** co-financing band (the
column is empty), source-window policy (under a point on tune and concentrated
in 3 regimes), the framework flag (exactly zero).

**Two integrity checks, both of which had to pass before the table was
believed.** The perfect-leaf row must equal the pool ceiling to the pair, and it
does (241/250 tune, 229/250 holdout) — if it had not, every other row would be
fiction. And award magnitude is re-read on the 94% of pairs where one award
cannot move the median: **+19.6 / +21.7 clean against +20.0 / +21.6 blended**,
so it is not circular.

**The perfect-programme control is the one that matters for design.** TOPIC at
16–24 options scores within 2 points of knowing which programme is yours. A
coarse topic question is not a new signal; it is "which programme", asked in a
form a founder might answer.

## 3. The designed set, and its ceiling

Compound key, perfect answers throughout, marginal shown because two questions
that cut the same way buy the second one nothing.

| | tune | holdout |
|---|--:|--:|
| base (shipped) | 26.4% | 24.0% |
| + TOPIC 16 options | 48.4% (+22.0) | 48.4% (+24.4) |
| + MONEY award magnitude | 68.4% (+20.0) | 62.4% (+14.0) |
| + WINDOW quarter needed | 76.4% (+8.0) | 70.4% (+8.0) |
| + MONEY capital type | **79.6%** (+3.2) | **73.2%** (+2.8) |
| *ceiling of any question whatever* | *96.4%* | *91.6%* |

## 4. **NO. 95% is not reachable, and two separate things stop it.**

**The hard stop is arithmetic and it is not about questions at all.** A perfect
answer to "which exact leaf is yours" scores **91.6% on holdout**, because for
8.4% of pairs the won leaf is not in the candidate pool for any ranker to order.
No question can beat that, since a question can only reorder what is there.
(Part of that 8.4% is the harness's fixed `capitalSought`, so a genuinely
complete intake would raise this bar somewhat — but not to 95%, and it is a
pool change, not a question.)

**The soft stop is the one that decides the roadmap: 79.6 / 73.2 is a bound on
PERFECT answers, and no realistic answer gets near it.**

- **Topic, answered by the founder.** The bridge does not hold, in either
  space. Matching each founder's own leak-free project text to the nearest
  topic centroid agrees with the topic of the fund they won **19–26% of the
  time at K=16**, falling to 4% at K=96. PARTITION is *negative at every K in
  both spaces*, and a K=16 FILTER blocks **42–46 of 57 verified winners**, named
  in the output. Measured in the source-text space and again in the production
  `instrument_profiles` space, with the same answer.
  The reason is structural, and it generalises: **a call's topic is not a
  project's topic.** A graphene-battery company wins "Innovativa startups"; a
  medical centre wins a health cluster call. Much of this corpus is horizontal
  by design, and a horizontal fund has no topic to match against. Forcing every
  fund into one topic cell is what makes the oracle look reachable.
- **Money, answered by the founder.** Paired test, same draw, same fund, one
  difference — the constant band `b500k_2m5` against the band this company's own
  history implies. **+0.0 on both splits, with ZERO discordant pairs over the
  102 founders who answered differently**, and zero winners pushed off the table.
  Proved to be a real null and not a dead flag: `_wsck_probe.ts` shows the
  ticket answer produces 4 distinct published-fives out of 4 bands in every
  country probed, and throws when sabotaged to a single band.
- **Description, which is the topic question the product already asks.** The
  paired lift is **+1.2 tune / +4.0 holdout**, and it is carried entirely by one
  shape of answer: a *short, specific project statement* is +27.8 / +19.4, while
  a long narrative is −3.6 / +0.0.

**So the reachable ceiling for the designed set is 73–80% with perfect answers,
≈ 25% with real ones, and 95% is not among them at any question budget.**

## 5. What this means

Seven routes have now returned ≈ +0.0: ranking (wsBU), per-fund evidence (wsBY),
stage-2 questions (wsCE), door-level rows (wsCG2), pool and permutation rules
(wsCI), the address (wsCJ), and now **every question a founder can actually
answer** (here). This one differs from all six in a way worth stating.

The previous six failed because the *fact* was not there. This one fails with
the fact plainly there: **the topic of the call is exactly what separates the
residual — 98% of it — and it is not a fact about the founder.** The founder
knows their project. The corpus knows the call. The two are only weakly related,
because European innovation funding is largely horizontal: the same company
qualifies for the mobility call, the startup call and the R&D tax credit, and
which one they won is a fact about the calendar and the queue, not about them.

The honest product statement is the one wsCI reached from the other side, and
this workstream now supports it from the question side rather than the corpus
side: **name the programme, which we get right three times in four, and say that
the specific call follows from what is open when the founder applies.**

**Do not re-propose**, now measured rather than argued:

- a topic, theme, or "what is your project about" multiple-choice question at
  any option count, in either tier (§4 — the oracle is +22 and the realistic arm
  is negative in both embedding spaces, and a filter form blocks four fifths of
  verified winners);
- a finer or re-banded ticket-size question (§4 — +0.0 with zero discordant
  pairs on 102 founders, on a path proved live);
- co-financing band, source-window policy, or the framework flag as questions
  (§2 — killed on the bound at 0–2% presence or under a point);
- **any target above ~91% EXACT@5, at any intake, until the pool is changed**
  (§4 — that is where a perfect answer to the fund's own identity lands).

## What was changed

Nothing a founder sees. No intake field, no flag, no floor, no product code, no
database write. Five measurement scripts, all free to re-run:

- `_wsck_residual.ts` — the residual characterisation and the fact clustering.
- `_wsck_topic.ts` — the topic oracle as a curve in the option count K.
- `_wsck_oracle.ts` — every candidate question bounded, with the two controls.
- `_wsck_real.ts` — the same question answered by the founder, `SPACE=source|profile`.
- `_wsck_money.ts` — the paired ticket test, split by provenance.
- `_wsck_probe.ts` — the live-path control for the paired null.

`python3 -m compileall -q ETL/` clean. `npx tsc --noEmit` clean.
`check_comparator_admits.ts` PASS. `check_recall_floor.ts` **ok**, all floors
met, `ranker: all 297 request(s) on EMBEDDING`, recorded beside this file. No
floor added, removed, raised or lowered.

**Guards proved to fail rather than assumed green**, each by running it:

- `_wsck_probe.ts` was sabotaged to four identical bands and **threw**
  (`ticketBand changed nothing in 1 of 1 countries`) — without it, the +0.0 in §4
  is indistinguishable from the `ticketBand`-dropped-from-the-expression defect
  this repo has already had once.
- `_wsck_oracle.ts` asserts the perfect-leaf identity against the pool ceiling
  and throws on any drift; every dump simulation asserts `pool[0..4]` IS the
  published five before computing a single delta.
- `_wsck_real.ts` rebuilds the draw and asserts it row-for-row against the dump,
  and its blocked-winner check **throws when it finds nothing**, because a silent
  zero there would mean the founder's words already name the fund.
- `_wsck_residual.ts` and `_wsck_money.ts` both throw on an empty population
  rather than reporting a clean zero over nothing.
- k-means throws on a collapsed vocabulary, and an unknown `SPACE=` or `CLASS=`
  throws rather than being read as a default.

**No question, option or rule in this workstream names a fund, a country or a
sector.** The topic vocabulary is derived by k-means over each instrument's own
source text, so an instrument loaded tomorrow is labelled by the same distance
rule with nothing edited here.
