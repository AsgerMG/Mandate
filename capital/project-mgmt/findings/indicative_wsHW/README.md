# wsHW — a week of corpus work moved our own six on 37% of founders and gained half a point; the model's ordering is still a wash, and the wash now leans negative

**FOR THE OWNER, VERBATIM.** Three days ago wsHO spent EUR 3.69 and reported the
AI's ordering as a coin flip: **+1.68 points of population EXACT@6, interval
−5.84 to +9.20**. Six things then changed on the surface the model reads. I
fired the identical instrument again for **EUR 3.37** — same draw, same strata,
same rung, same rail, **76 of the 78 founders are literally the same people in
the same stratum** — and the answer is: **it is still a wash, and the point
estimate has crossed zero to −3.10, interval −11.66 to +5.47.** The two runs are
not distinguishable from each other and neither is distinguishable from nothing.
**So no, a week of work did not move the AI's ordering.**

What it DID move is our own scoring, and that is free and measurable on all 897:
**the six funds we show changed on 333 founders (37.1%)** and our own EXACT@6
went **345 → 350 of 897, 38.46% → 39.02%, +0.56 points.** Every one of those
points is ours, none of it is the model's, and it cost nothing to measure.

Three things follow and they all point the same way. **One: the instrument's own
re-test noise is bigger than the effect being chased.** On the 76 founders both
runs called, the model's answer flipped outcome on **10 of them (13%) — 4 for
the better, 6 for the worse** — with the rows nominally improved in between. At
n=78 this instrument cannot see anything smaller than that, and everything it
has ever been asked to see is smaller than that. **Two: the ceiling scare is
over and the opposite is true.** wsHO's largest reply was 92.3% of the 2,048
ceiling; at 8,192 the largest is **1,533 = 18.7%**, and replies got *shorter*,
not longer — mean 201 → 109 output tokens, and only **6 of 83 calls thought at
all** against 21 of 85. Quadrupling the ceiling bought nothing because the
ceiling was never binding. **Three: the slot-filling defect is untouched.**
48.0% of picks still fail the prompt's own two disqualifiers against wsHO's
48.4%, and **38.7% still do on founders with ample qualifying rows** against
39.0%. **A week of corpus work moved that number by three tenths of a point.
`atMost` is still the arm worth buying and the ranking still is not.**

**And production is not on Postgres.** `npm run prodcheck` closed this
workstream and found the live deployment serving the **committed snapshot**,
degraded, because Postgres answered `canceling statement due to statement
timeout`. Every figure above is measured on Postgres. wsHR and wsHS are
confirmed live in a real founder's brief; **wsHV's 63 corrected gates are the
only reason a degraded request is not also a wrong one.**

---

```
run                 2026-08-18/19, isolated worktree wsHW-reread, ONE session
population          897 founder(s), held out, described, one per company
draw fingerprint    13cb71cf3a1d1847   <- IDENTICAL to wsHO, asserted in code
corpus              postgres instruments=1088
ranker              all 819 request(s) on EMBEDDING          <- attested AND enforced
strata              R 316 / C 350 / D 153 / U 78    (wsHO: 324 / 345 / 159 / 69)
called              78 founder(s), 83 API calls, 0 fell back, 78/78 chose
SPEND               EUR 3.3681 on this key, + ONE prodcheck brief on the
                    deployment's own quota (~EUR 0.25) = ~EUR 3.62 of a
                    EUR 4.00 HARD CAP. No probe was needed; wsHO bought the
                    price already.
pre-registered      project-mgmt/wsHW_prereg.md, committed 98227c08 BEFORE the
                    first paid token, with its three deviations named in it.
reproduce           GUARD_NO_PUBLISH=1 AGENT_SELECT=adviser AGENT_SELECT_EFFORT=low \
                      AGENT_SELECT_UNSURE=declare WALK=897 MAX_EUR=3.55 MAX_CALLS=78 \
                      OUT_ROOT=indicative_wsHW OUT_TAG=main \
                      npx tsx scripts/_wsho_strata.ts
                    npx tsx scripts/_wsho_harvest.ts \
                      ../../project-mgmt/findings/indicative_wsHW/main_tape.jsonl
```

**INDICATIVE, n=78, and it may not reach the dashboard.** The headline is
`one_funnel` and nothing else. Two indicative runs of n=78 are not one run of
n=156: they share 76 founders.

---

## The full lever set, read from the SHIPPED constants

```
arm adviser · seam late · AWARD_TERM oneside · PROFILE_BLOCK complete
POOL_BLEND off · ROW_PROXIMITY off
VERDICT_POOL 40 · SELECT_DEPTH 40 · menu = min(depth, pool)
SELECT_COUNT 7 · SELECT_COUNT_MODE exactly · AGENT_SELECT_UNSURE declare · LOOKUP_MAX 5
WRITER_CANDIDATE_CAP 7 · published_cap 7 · shown 6
AGENT_SELECT_EFFORT low · max_tokens 8192 · clock 40,000ms
```

**Every value is the live default; nothing was tuned for the measurement.**
Two of them differ from wsHO's and BOTH are shipped changes, not arms:
`max_tokens` **2,048 → 8,192** and `WRITER_CANDIDATE_CAP` **8 → 7**. The second
was not on this workstream's list of six and the report caught it because it
reads the constant instead of the environment — which is the whole reason the
lever block exists. It cannot affect anything here: it bounds what reaches the
writer, and every figure below is `orderMemoCandidates` cut to six, upstream of it.

> `main.md` states its own rung correctly. wsHO's did not — it printed *"This
> run is at `medium`"* while running at `low`, because its addendum moved the
> rung and the report's fixed string did not. That paragraph is now a branch on
> `THINK_EFFORT` and no sentence in the writer can be true of one run and
> printed by another. **No measured quantity was touched.**

## What this run can attribute, and what it is blind to

`git diff 513cdf8a..HEAD -- lib/intelligence/agentSelect.ts` **is empty. The
selector's prompt template is byte-identical to wsHO's.** What moved is which
rows exist, what they are called, and the ceiling on the reply.

| | what moved | seen here? |
|---|---|---|
| **wsHQ** | 18 dead schemes out of `publishableInstruments()` | **YES** — and the strata prove it: `U` 69 → **78**, so nine founders' own won fund stopped being publishable |
| **wsHR** | rows named by register title, not an id slug | **YES** — `[1] Program na podporu průmyslového výzkumu … TREND` is the first line the model now reads |
| **wsHV** | 63 corrected gates + 22 titles in BOTH stores | **YES** — gates build `accessiblePool` |
| **ceiling** | `MAX_TOKENS_BY_EFFORT.low` 2,048 → 8,192 | **YES** |
| wsHS | no internal id in the WRITER's prose | **NO** — downstream of every figure here |
| wsHM | raise and award labelled apart in the WRITER's prompt | **NO** — same reason |

**Four of the six, not six.** Declared in the pre-registration before the data,
because an attribution written afterwards is a story. wsHS and wsHM are real and
are confirmed live by `prodcheck.txt`; **this instrument cannot price them and
does not pretend to.**

## 1. THE ORDERING — INDICATIVE, n=78

### Every void condition, checked and printed

| condition | | observed |
|---|---|---|
| `exits.threw` is zero | ok | 0 |
| slowest call ≤ 80% of the clock | ok | **22,487ms of 40,000ms = 56.2%** |
| no call cut off at `max_tokens` | ok | **0/83 API calls** (denominator: API calls, not seam calls) |
| ranker attestation clean | ok | `ranker: all 819 request(s) on EMBEDDING` |
| fell back on ≤ 5% of calls | ok | 0 of 78 |
| both arms handed the same pool array | ok | 78 of 78 |
| `menuMax` is 40 | ok | 40 |

### The two rates, beside wsHO's

| | wsHO | wsHW |
|---|---|---|
| **rescue** — won fund ENTERS the six under the model | 11/43 = **25.6% ±13.0** | 13/45 = **28.9% ±13.2** |
| **harm** — won fund LEAVES the six under the model | 7/35 = **20.0% ±13.3** | 11/33 = **33.3% ±16.1** |
| s_R, s_C | .391, .417 | .386, .427 |
| **delta, points of population EXACT@6** | **+1.68** | **−3.10** |
| 95% interval | −5.84 to +9.20 | **−11.66 to +5.47** |
| McNemar, paired, exact p | 0.481 on 18 discordant | **0.839 on 24 discordant** (model 13, us 11) |
| Wilcoxon on pool rank | −1.44, p 0.883 | −1.45, p 0.722 |

**The model rescued MORE founders than it did three days ago and harmed more
still.** The two intervals overlap over their whole length; the difference
between the runs is 4.8 points against a standard error of 5.8. **Nothing here
is distinguishable from anything else here.**

### CONCENTRATION — and one agency decides the sign in BOTH runs

| removed | wsHO delta | wsHW delta |
|---|---:|---:|
| nothing | **+1.68** | **−3.10** |
| **`innovate_uk`** (11 / 10 founders) | **+3.07** | **+3.71** |
| `satr_fr_rnd` (7 / 7) | −1.18 | −6.78 |
| `satr_de_rnd` (10 / 9) | −0.45 | −5.60 |
| `horizon_eu_partnership` (8 / 8) | +0.68 | −4.28 |

- **rescues: 13 across 6 regimes**; largest `satr_fr_rnd`, 5 = 38% of them.
- **harms: 11 across 5 regimes**; largest **`innovate_uk`, 7 = 64% of them**.

> **Take out one British agency and both runs turn positive by about the same
> amount.** That is the finding under the finding: the model is not on average
> worse than our score, it is **specifically and repeatedly worse on
> `innovate_uk`**, where our own score already had the answer in the six and the
> model pushed it out seven times. wsHO saw the same regime at the top of its
> harm list with 3 of 7. **This is where a euro buys something and the ranking is
> not.**

### The re-test noise floor, which is the number that decides the EUR 30.70 question

76 of the 78 called founders are the same person in the same stratum in both
runs. **The model's own outcome flipped on 10 of them — 4 to a hit, 6 to a
miss.** So running this instrument twice, three days apart, on rows we believe
improved, moves 13% of founders in both directions at once.

**An effect of ±2 points cannot be seen through that with n=78, and the full run
at n=666 is the only thing that could see it.** That is now the case FOR buying
it — and the case against is that two independent readings have both said the
number being bought is zero.

## 2. WHAT WE OURSELVES GAINED — FREE, ON ALL 897

Both runs walk the whole population without spending anything, so this is a
paired before/after on 897 founders at no cost:

| | wsHO 2026-08-18 | wsHW 2026-08-19 |
|---|---:|---:|
| our own EXACT@6 | 345 / 897 = **38.46%** | 350 / 897 = **39.02%** |
| won fund in the 40-row pool but not our six (R) | 324 | 316 |
| won fund not in the pool at all (D) | 159 | 153 |
| won fund not publishable (U) | 69 | **78** |
| **founders whose six changed MEMBERSHIP** | — | **333 of 897 = 37.1%** |
| founders whose six changed ORDER only | — | 11 |

**+0.56 points of EXACT@6 on the real draw, and a different table in front of
more than a third of founders.** `U` rising by nine is wsHQ working as intended:
nine of these founders won a scheme we have now correctly stopped offering, and
they leave the gradable set rather than being scored against a door that is shut.

## 3. THE CEILING — the scare is retired, in the opposite direction

| per API call | wsHO (ceiling 2,048) | wsHW (ceiling 8,192) |
|---|---:|---:|
| output tokens, mean | 201 | **109** |
| median | 30 | 30 |
| p95 | 999 | 834 |
| **max** | **1,891 = 92.3% of the ceiling** | **1,533 = 18.7% of the ceiling** |
| calls that thought at all | 21 / 85 | **6 / 83** |
| replies over 200 tokens | 21 | **6** |
| input tokens, mean | 21,882 | 21,507 |

**Replies did not get longer. They got shorter, and far fewer calls thought at
all.** `claude-sonnet-5` has no fixed thinking budget — thinking is adaptive and
`max_tokens` caps thinking and reply together — so the model was never being
cut off at 2,048; it was choosing to stop. **wsHO's 92.3% was one long reply, not
a ceiling under pressure, and the headroom question is closed.** The drop from
21 thinking calls to 6 is on n=83 and is NOT attributed here to anything.

### The price, re-measured

| | wsHO | wsHW |
|---|---:|---:|
| EUR per API call | 0.0421 | **0.0406** |
| EUR per founder | 0.0459 | **0.0432** |
| input share of the bill | 95.6% | **97.5%** |
| **the full run, 666 in-pool founders** | EUR 30.70 | **EUR 28.76** |
| whole population, 897 | EUR 41.16 | EUR 38.73 |
| after the 2026-08-31 price change | 46.05 / 61.74 | **43.14 / 58.10** |

**The prompt is what a forty-row call costs and it is now 97.5% of the bill.**
The only lever that moves the price is the number of rows.

## 4. THE FREE HARVEST — the slot-filling defect is exactly where wsHO left it

`_wsho_harvest.ts`, offline, no key, no DB, on this run's own tape. Same two
disqualifiers from the prompt itself, applied the same generous way, so every
number is an UPPER BOUND in the model's favour.

| | wsHO | wsHW |
|---|---:|---:|
| mean menu length | 37.8 | 37.9 |
| mean rows surviving the prompt's own two rules | 11.5 | 11.2 |
| founders with fewer survivors than the 7 seats | 26/78 = 33.3% | 27/78 = 34.6% |
| **picks failing the prompt's own rules, all** | **264/546 = 48.4%** | **262/546 = 48.0%** |
| **… on AMPLE founders (≥7 survivors, no seat pressure)** | **142/364 = 39.0%** | **138/357 = 38.7%** |
| … on TIGHT founders | 122/182 = 67.0% | 124/189 = 65.6% |
| founders whose reply carried ANY reasoning | 18/78 | **6/78** |
| briefs naming an `unsure` row | 7/78 = 9.0% | 5/78 = 6.4% |

> **THREE TENTHS OF A POINT.** wsHQ, wsHR and wsHV between them removed dead
> doors, gave every row its real name and corrected 63 gates, and the share of
> the model's picks that fail the money-or-theme rule the prompt itself states
> did not move. **So the defect is not in the rows and it is not in seat
> pressure — it is in how the model picks, and `SELECT_COUNT_MODE=exactly`
> forbids it from declining a seat.** `atMost` remains the arm with the clearest
> mechanism and the clearest before/after, and this run says so for the second
> time at no extra cost.

**Read it as "the two stated disqualifiers do not describe how it picks", not as
"38.7% of picks are wrong".** The prompt states more criteria than these two,
including a most-won prior that explicitly invites reaching off-theme.

## 5. PRODUCTION — the workstream's closing look, and it is red

`prodcheck.txt`, one founder, the default, through `euro-inv-tracker.vercel.app`:

```
source       SNAPSHOT
degraded     YES — Postgres was asked and refused: canceling statement due to
             statement timeout
██ STOP. This deployment is NOT on Postgres.
```

- **The live deployment ranked on the committed snapshot.** Every figure in this
  finding is measured on Postgres. A founder served in the last hours got the
  snapshot's corpus.
- **wsHV is why that is survivable rather than wrong.** It brought the corrected
  gates and register titles into BOTH stores three commits ago. Before it, this
  same degradation would have served a founder rules we know to be wrong.
- **wsHR and wsHS are confirmed LIVE in a real founder's brief**: rows are named
  by their register titles, and `memo ids ok — none of 283 founder-facing
  strings carries one of the 7 ids this deployment served`.
- The whole path returned 200: region 3,216ms, verdict 11,437ms, intake
  19,867ms, 192s wall clock, 4,889 characters of prose, memo ends on a closed
  sentence.

> **A DEFECT THIS RUN FOUND AND DID NOT FIX.** `prodcheck.ts` prints that STOP
> banner and **exits 0**. Its own header says it is *"a LOOK, not a number"*, so
> the exit code may be deliberate — but as it stands the single worst thing this
> file can discover cannot fail anything, and nobody who did not read the
> scrollback would know. Changing it turns a look into a gate, which is the
> owner's call and not mine.

## Files

| | |
|---|---|
| `main.md`, `main.json` | the run's own report and summary; `rows[].turns` stripped from the JSON, kept IN FULL in the tape |
| `main_tape.jsonl` | one line per founder, flushed as it went — every prompt, reply and reasoning block paid for |
| `free.md`, `free.json`, `free_tape.jsonl` | the free walk of all 897, no model, which produces the strata and the control's own six |
| `HARVEST.txt` | `_wsho_harvest.ts` in full, on this tape |
| `prodcheck.txt` | the closing production look |
| `../../wsHW_prereg.md` | the pre-registration, committed before the first paid token |

## Verification

`npx tsc --noEmit`, `npx vitest run` (62 files, 846 tests),
`npx tsx scripts/check_contracts.ts` — all green.

## What this does NOT settle

- **wsHS and wsHM.** Downstream of `orderMemoCandidates`; invisible to this
  instrument by construction, and confirmed live only by `prodcheck.txt`.
- **Significance, again.** n=78, and 76 of them are wsHO's own 78. The interval
  spans zero and this run was never powered to close it.
- **Why thinking fell from 21 calls to 6.** n=83, and no lever here is a
  candidate the evidence supports.
- **The writer.** Every figure is the code-side projection, cut to six.
