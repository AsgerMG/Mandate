# wsIR — `POOL_BLEND` end to end: it was already measured, it is a real negative, and the damage falls on exactly the founders who typed something real

**Free. EUR 0.00, zero model calls, zero production writes, no Railway, no
`data/db.sqlite`.** Five funnel runs, every one on Postgres attesting
`ranker: all 819 request(s) on EMBEDDING`; `NO_PG=1` never set. Nothing here
changes a default.

---

## 0. THE ANSWER, unflattering half first

**The brief that commissioned this workstream is wrong on its central claim, and
I should say so before any number of mine.** It calls `POOL_BLEND` end to end
"the single most valuable unmeasured thing left". **It was measured, end to end,
on this instrument, on this draw, six days ago.** `proximity_wsGX`, 2026-08-13,
`measure_funnel.ts` at n=897 on draw `13cb71cf3a1d1847`, paired per founder
through `_wsgx_pairs.ts` with discordant counts and McNemar at every cut. Its
committed `PAIRS_on.txt` is a `row_order=on` against `row_order=off` pairing:
**−1.9 points of `pool_cut`, z=2.87**.

**And the brief's second instruction inverts the attribution.** It warns that
`ROW_PROXIMITY` "is a *separate* lever measured −1.9 points on the production
path, so do not conflate them." The two levers are indeed separate — but the
−1.9 is **`POOL_BLEND=on`'s** `pool_cut` loss. The number the brief hands to
`ROW_PROXIMITY` belongs to the arm it sent me to measure.

**So: did the +6.0 survive contact with the production path, or was wsCV right
for the wrong reasons?** *wsCV was right, for the wrong reasons — and the right
reason is arithmetic that was already on the board.*

- wsCV's **verdict** (no gain end to end) is correct and now confirmed twice
  over, by wsGX's paired funnel and by mine.
- wsCV's **evidence** was not a measurement of the blend: three marginal count
  sets, no discordant count anywhere, sign flipping −7 tune / +4 holdout. wsIQ
  is right to call it the worst closure in the archive.
- But the +6.0 **never predicted a gain**, and `rank_shape_wsGY` had already
  shown why. The precedence stack is worth **+7.2 points of EXACT@6**
  (`score_only` 28.4% → `shipped` 35.7%, z=+4.19), so wsGY states the rule
  outright: *"any arm scored as a pure re-ordering must clear 7.2 before it is
  news."* The blend scored **+5.0 (wsCS), +5.7 (wsCU)** in that frame. **It
  never cleared the bar.** Predicted end-to-end effect ≈ 5.7 − 7.2 = **−1.5**.
  wsGX measured −1.0 to −1.9. I measure −2.3. The prediction and three
  measurements agree.

**What this workstream adds is not the sign. It is that the negative is now
resolved on both measures with a null beside it — and one thing nobody was
looking for, in §3, which is larger than the lever.**

---

## 1. Today's measurement — three arms, one draw, both measures

n=897 drawn, **819 paired** past the corpus stages. Every arm identical above
the row sort (`publishable` 819, `founder_screen` 798, `gates_pass` 787), which
is the proof that an ORDERING arm changed only the ordering.

`off` reproduces the published reference `2026-08-19T16-14-25` exactly on every
row but one — `top_6` **349 = 38.9%**, the shipped headline — differing only at
`pool_cut` (673 against 672). wsGX's repeat arm (`off` vs `off2`) shows this
harness has a **zero** re-test floor, so that one founder is a real corpus shift
in the intervening 70 minutes, not noise. It does not propagate. **The baseline
used throughout is my own `off`, not the published reference.**

| stage | off | on | pure | on−off | pure−off |
|---|---:|---:|---:|---:|---:|
| `pool_cut` | 673 | 656 | 667 | **−17** | −6 |
| `writer_cap` / `published` | 374 | 343 | 339 | **−31** | −35 |
| `top_6` | **349** | 328 | 325 | **−21** | −24 |
| `top_5` | 324 | 304 | 301 | −20 | −23 |

### `POOL_BLEND=on`, paired, both measures

The arm arrived: the won fund's pool rank differs for **456/819** founders,
median shift 2 rows.

| measure | paired delta | 95% (6,000-draw bootstrap) | discordant | McNemar z | sign-flip null | LORO |
|---|---:|---|---|---:|---|---|
| `pool_cut@40` | **−2.08** | [−3.54, −0.61] | 39 (11/28) | **2.72** | clears, p=0.010 | **96/96** |
| `published@7` | **−3.79** | [−5.74, −1.95] | 61 (15/46) | **3.97** | clears, p=0.0002 | **96/96** |
| **EXACT@6** | **−2.56** | [−4.64, −0.49] | 73 (26/47) | **2.46** | clears, p=0.018 | **96/96** |
| EXACT@5 | −2.44 | [−4.64, −0.24] | 82 (31/51) | 2.21 | clears, p=0.035 | 96/96 |
| recip (writer) | +0.0172 | [−0.0053, +0.0388] | — | — | **INSIDE**, p=0.115 | 95/96 |
| recip (pool) | +0.0193 | [−0.0027, +0.0402] | — | — | **INSIDE**, p=0.070 | 95/96 |

**The two measures disagree in sign, and that is the finding rather than a
choice.** Every binary cut is negative, significant, and clears its own null.
Both reciprocal ranks are *positive* — and neither is distinguishable from
churn. Leave-one-regime-out says why: drop `innovate_uk` (n=109) and recip goes
**−0.029**. The positive is one regime; the negative survives the removal of any
of the 96, including `horizon_eu_pillar_ii`, which alone is 57% of its net mass.

The mechanism behind the disagreement is visible in the counts: the blend ranks
its winners higher (mean recip rises) while pushing **31 more founders off the
page entirely**. It concentrates. That trade is invisible to recip alone and
invisible to the binary alone, which is why wsII's rule is "never on EXACT@6
alone" and wsIQ's correction is "recip is not sharper as a rule".

### `pure` — and the "the machinery ate it" hypothesis is refuted

`pure` bypasses the ticket multiplier and the sibling reassignment. If the
shipped machinery were absorbing the blend, `pure` is where it would come back.
**It does not: EXACT@6 −2.93 [−4.88, −0.98], z=2.91, clears its null, 96/96
folds — worse at the page than `on`.**

Two corrections fall out of it:

- **`pure` is not wsCU's arm**, though `ship_blend_wsCV/run.sh` says it is
  ("*pure — the blend as the WHOLE row score, wsCU's own arm, reproduced on the
  production path*"). wsCU measured with **no peer precedence at all**, on a
  different harness. `pure` still runs peer precedence, the caps and the name
  collapse. No arm on the production path has ever reproduced wsCU's frame, and
  none can — that frame is 7.2 points below the product.
- **`on` and `pure` are not identical here**, though they were in wsCV
  (holdout 143/416/523 in both). At `pool_cut` they differ by 11 founders, so
  the ticket multiplier does interact with the cut on this harness. Different
  instrument, different population, nine days of corpus.

---

## 2. The null

<!--NULL-->

---

## 3. THE THING NOBODY WAS LOOKING FOR, and it is bigger than the lever

The coordinator asked, mid-run, for one extra column in the trace:
`descriptionSource` — where each founder's query text came from. It cost no
re-run (§5) and it is the most valuable thing in this workstream.

**First, a premise that does not survive checking.** The concern was that
`THEME_WEIGHT = 0.6` weights a theme cosine taken against a description, and
that on the holdout **76.2%** of companies (2,836 of 3,720) have no description
and query with one of eleven canned sector sentences — so every flat ranking
result might be a property of a signal-less population.

The distribution is exactly right, and **it does not apply to the funnel.**
`measure_funnel.ts` draws through `isDescribed(r)`, which requires a non-empty
description. So `descriptionSource: "none"` is **0 of 897**. The canned-sentence
founders are excluded by construction, and always have been. **Every funnel
figure ever published — the 38.9% headline, wsGY's 86.3% ceiling, wsGX's −1.9,
everything above — is already measured on founders who have real text.** The
76.2% is a true fact about the answer key and a false one about the funnel.

**But the intuition underneath it is right, and larger than any ranking lever
ever measured on this product.** The funnel population splits 52.0% the
company's own words against 47.9% *another company's* text borrowed across
regimes, and the two are not the same product:

| stratum | n paired | base `pool_cut` | base **EXACT@6** | blend delta EXACT@6 | McNemar z | null |
|---|---:|---:|---:|---|---:|---|
| **own words** | 440 | 90.23% | **52.05%** | **−4.55** [−7.50, −1.82] | 3.09 | **clears** |
| **cross-regime borrowed** | 379 | 72.82% | **31.66%** | −0.26 [−3.17, +2.64] | 0.18 | inside |
| all | 819 | 82.17% | 42.61% | −2.56 [−4.64, −0.49] | 2.46 | clears |

**Two findings, and the first one dwarfs this workstream's subject.**

1. **Description provenance is worth ~20 points of EXACT@6** — 52.05% against
   31.66% — and 17 points of reach at the pool cut. Nothing in the ranking
   archive is that size. The largest shipped ordering gain in a month was +2.4,
   and the entire precedence stack is +7.2.
2. **The blend's damage falls entirely on the founders with real text.** −4.55
   where the words are the company's own, −0.26 and indistinguishable from
   nothing where they are borrowed. The mechanism is legible in the weights:
   the blend puts **proximity at 4.062** and **semantic at 1.519**, while the
   shipped score is `0.6 × semantic`. Where the text carries signal, demoting
   semantic behind a national-vs-EU-wide bit destroys it; where the text is
   another company's, there was nothing to destroy.

This also sharpens what the door-separation diagnosis has been calling
indifference. On this population the score is **not** indifferent to the answer
— it is worth 20 points — and the blend is a measured way of throwing that away.

**What it does not license.** This is an observational split, not an arm: own-words
founders differ from borrowed-text founders in more than their text (they are the
companies whose award records carry usable prose at all). It does **not** show
that asking a founder for a description would move a real founder from 31.66% to
52.05%. It shows the population is heterogeneous by 20 points on a field we
already record, and that no ranking result should be quoted without it. The
committed trace carries the column so any closed route can be re-scored this way
for EUR 0.00.

---

## 4. The harm side — coverage, not only accuracy

<!--COVERAGE-->

**`check_winner_not_gated`'s standing debt of 207 cannot move here, and the
funnel proves it rather than the argument doing so.** That check measures the
ENCODED GATE layer deleting a verified winner from its own fund; `POOL_BLEND`
substitutes a base score below the gates. The proof is on the ladder above:
`gates_pass` is **787 in all three arms**, identical, as are `publishable` and
`founder_screen`. An arm that changes no founder's gate outcome cannot raise a
gate debt.

---

## 5. Where the trace is committed, and what was dropped

**Every per-pair dump this project has ever made went to a scratchpad, and this
workstream watched one of them die.** wsGX wrote its traces to
`…/scratchpad/wsgx`. **That directory still exists and is empty.** Its binary
pairing survived only because `PAIRS_on.txt` happened to be committed; the
per-founder ranks that reciprocal rank needs are gone, so wsGX's arm could not
be re-scored on the measure that resolves it and had to be re-run from scratch.

`traces/` here is the fix, and it is committed:

```
project-mgmt/findings/pool_blend_wsIR/traces/trace_{off,on,pure,shuffle1,shuffle2}.jsonl
```

**`measure_funnel.ts` refuses to write a `FUNNEL_TRACE` inside the working tree,
and it is right to.** Each raw line carries `regime` — the won fund's rollup,
which for a standalone fund is that fund's own id — so a raw dump is a partial
copy of the answer key, and `check_answer_not_reachable` is an import-graph
check that would never see a data file in `project-mgmt/`. Both constraints are
real, so neither was broken. `scripts/_wsir_redact.ts` writes the trace with the
one answer-bearing field replaced:

| field | committed as |
|---|---|
| `regime` | **dropped** → opaque `g0…g110`, assigned by descending frequency, **identical across arms** |
| everything else | verbatim — `i`, `country`, `offerable`, `rankTable`, `rankAccessible`, `rankWriter`, `tableLen`, `accessibleLen` |
| `descriptionSource` | **added**, joined on a rebuilt draw |

**What a re-scoring keeps:** positional pairing, all three ranks, the movable
population, and grouping — so the paired bootstrap, McNemar, leave-one-regime-out
and concentration in this report are all reproducible from the committed files
by someone who never sees a fund name. `_wsir_score.ts` reads `group` or
`regime` interchangeably for exactly this reason.

**What was dropped:** the map from group id to regime NAME. That is the part
that would make the file an answer key. The named breakdown is reported as
aggregates in this README instead — per-founder is the leak, per-regime counts
are not, which is the same line `PAIRS_on.txt` already sits on.

**The `descriptionSource` join needed no re-run and is proven before it is
used.** The trace is positional over a draw that is reproducible offline —
holdout + `isDescribed`, sorted by `name.localeCompare`, deduped to one row per
company, unsampled — and `reattributeMissingAnswers` only rewrites `instrument`,
never membership or order. The rebuild is not trusted: every reconstructed
founder must carry the country the trace recorded at that index, and it throws
otherwise. **897/897 agree.** Same discipline wsIQ used on wsGA (98/98).

---

## 6. Corrections to the brief

Every agent this week has corrected the brief and been right; here are mine,
including one against myself.

1. **`POOL_BLEND` end to end was not unmeasured.** wsGX measured it on this
   instrument, this draw, paired, on 2026-08-13. §0.
2. **The −1.9 is `POOL_BLEND=on`, not `ROW_PROXIMITY`.** §0.
3. **The funnel takes ~14 minutes at n=897, not ~2 hours.** Five runs fitted in
   the window budgeted for two, which is why there is a null and a coverage arm
   in this report at all.
4. **The trace cannot go to a committed path as raw output** — the harness
   refuses, deliberately and correctly. It goes there redacted. §5.
5. **Step 4's false `AWARD_TERM` banner is already fixed**, in `fa10fa1b`, the
   commit this worktree is based on. `RANKING_ARMS` now reads `shipped` from
   `parsePoolBlend(undefined)`. No run in this workstream printed the false
   banner.
6. **Against myself: my first null was not a null.** It walked the pool with one
   generator, so each candidate's "random" draw depended on its position in the
   incoming array — the null was correlated with the very order it existed to
   test. A unit test written in the same commit caught it before it ran. The
   fix and the test are in `e5f673df`.
7. **`ship_blend_wsCV/run.sh` mis-describes its own `pure` arm** as "wsCU's own
   arm, reproduced on the production path". It is not. §1.
8. **`shortlist.ts:2968` is stale in the repo's dominant failure mode.** The
   comment above the blend still quotes "+6.0 ±3.3" and frames the question as
   open — *"the whole question wsCV exists to answer"* — with no record that
   wsCV, wsGX and now this workstream all measured it negative end to end. A
   reader of that comment today would conclude the blend is a promising unshipped
   win. Fixed in this branch.
