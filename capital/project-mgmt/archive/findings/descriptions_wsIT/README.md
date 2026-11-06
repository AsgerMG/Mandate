# wsIT — the 52% is the easy half of the population; the box is worth ten points to the founder who fills it in about the right thing

**Free. EUR 0.00, zero model calls, zero production writes, no Railway,
`data/db.sqlite` opened `mode=ro` only.** Six funnel runs at n=897, all on
Postgres, five attesting `ranker: all 819 request(s) on EMBEDDING` and the sixth
`nothing ranked` because it sends no description at all — which is the point of
it. `NO_PG` was never set. Every trace and every score is committed here.

---

## 0. THE ANSWER, unflattering half first

**The two strata are not comparable, and the brief that commissioned this — and
wsIR's §3 before it — mislabels both of them.**

1. **There is no "borrowed text" anywhere in this dataset.** wsIR calls the
   cross-regime stratum "*another company's* text"; the brief repeats it;
   `shortlist.ts:3001` carries it. `rebuild_recall_descriptions.py` keys its
   candidates on `cid_by_name[(name, country)]` — **the same company** — and its
   own docstring says so in capitals. **All four provenances are the founder's
   own words.** What differs is *which award they were written for*.

2. **So the 52.05% is not "a founder describing themselves".** It is the
   abstract or title of **the award that is the answer**. The 31.66% is the same
   founder describing **a different project of theirs**. The contrast was never
   own-versus-borrowed; it is on-point-versus-off-point.

3. **And the twenty points is mostly composition.** The own-words stratum is
   44% Swedish and spans 35 regimes; the cross-regime stratum is 24% French,
   20% Norwegian and spans 94. Regime total-variation distance **0.801**. Held
   fixed: **+8.80 within country [+2.01, +17.30]**, and **−1.68 [−19.34, +19.35]
   within regime** — where only 7 of 96 regimes hold both strata at all, so the
   right conclusion is that this data *cannot* separate provenance from regime.
   **Six of the twenty points are spent before a single character of text is
   read**, at `publishable`.

**So the owner's number is not 52%.** But the question underneath it has a real
answer, and it is a causal one rather than an observational one:

> **A description is worth −9.55 EXACT@6 [−13.18, −6.14] to a founder whose text
> is about the project the money is for, and +0.79 [−2.90, +4.22] — nothing at
> all — to a founder whose text is about something else they did.**

Same founders, same answers, ranked twice, the box emptied in the second arm.
McNemar z=5.09, clears its sign-flip null, sign holds in **29 of 29**
leave-one-regime-out folds.

**And the intake has been telling founders a number three to six times too
large.** `panel.tsx` said *"48.9% of the time, against 21.3% without one"*. That
came from `measure_description_lift.ts`, whose design is sound and whose two
foundations are not: it runs on `__recallSetEnriched.json`, which this repo's own
`RETIRED_RECALL_SETS` lists as retired, and it ranks through `computeVerdict`,
which returns `instrumentTable.slice(0, DISPLAY_CAP)` and **never calls
`orderMemoCandidates`** — the instrument table, not the six rows a founder reads,
missing the precedence stack `rank_shape_wsGY` prices at +7.2 points. On the
shipped path it is **38.9% against 34.6%**. Corrected in this branch; the
constant was **not** moved.

---

## 1. The strata are not comparable, and the direction is the surprise

`ETL/terms/_wsit_strata.py`, output `STRATA.txt`. The draw is rebuilt by
`website/frontend/scripts/_wsit_draw.ts` using the harness's own `localeCompare`
ordering and proved against the country **and** the provenance the committed
trace recorded at every index — **897/897**. A codepoint sort in another language
is not ICU collation, and an off-by-one join against a positional trace is
silent.

| axis | own-words (n=467) | cross-regime (n=430) | |
|---|---|---|---|
| regimes spanned | 35 | 94 | **total-variation 0.801** |
| country | 44% SE | 24% FR, 20% NO | total-variation 0.542 |
| sector | | | total-variation 0.228 |
| median lifetime award | **EUR 380,283** | **EUR 2,325,096** | 6.1x, p=2.9e-31 |
| median largest award | EUR 290,290 | EUR 964,099 | 3.3x, p=8.3e-30 |
| median award count | 2 | 5 | 2.5x, p=5.2e-35 |
| median last award year | 2024 | 2025 | p=6.2e-11 |
| mean instrument-table rows | 77.0 | 97.2 | a 26% larger haystack |

**The selection is mechanical and it runs the wrong way round.** A company only
*has* cross-regime text if it won under **two** regimes. That stratum is
therefore a selection on being bigger, more recent and better documented — and
it scores twenty points **worse**, because the funds those companies win are
pan-European and crowded while the own-words stratum sits in single national
agencies.

### Where the twenty points enter

| stage | own | cross | gap | **added here** |
|---|---:|---:|---:|---:|
| drawn | 467 | 430 | — | — |
| publishable | 94.22% | 88.14% | +6.08 | **+6.08** |
| founder_screen | 91.86% | 85.81% | +6.05 | +0.14 |
| gates_pass | 90.58% | 84.65% | +5.93 | −0.04 |
| **pool_cut@40** | 85.01% | 64.19% | +20.82 | **+18.03** |
| **writer_cap@7** | 52.89% | 29.53% | +23.36 | **+16.20** |
| top_6 | **49.04%** | **27.91%** | +21.13 | −1.78 |
| top_5 | 45.82% | 25.58% | +20.24 | +1.78 |

Reciprocal rank agrees with the binary throughout — **0.3377 against 0.1760** on
the writer order, 0.3567 against 0.2009 on the pool order — so this is not one
of the disagreements wsII and wsIP built the second measure for.

### What survives holding the composition fixed

| comparison | EXACT@6 gap | 95% | informative strata |
|---|---:|---|---|
| raw — wsIR's 52.05 against 31.66 | **+20.38** | [+13.95, +27.14] | — |
| within SECTOR | +18.87 | [+12.08, +25.90] | 11, covering 819 |
| **within COUNTRY** | **+8.80** | [+2.01, +17.30] | 10, covering 808 |
| within REGIME | −1.68 | [−19.34, +19.35] | 6, covering 299 |

A stratum in which every founder hits, or none does, is dropped: it carries
weight and no information, and one saturated 109-founder regime otherwise pulls
the estimate to zero while looking like evidence.

**Country is the well-powered adjustment and regime is the one that matters.**
Only **7 of 96 regimes hold both strata**, so provenance is very nearly collinear
with the answer. The wide within-regime interval is a reason to distrust the raw
number, not a reason to prefer it.

---

## 2. THE NUMBER THE OWNER WANTS — the same founder, less of what they said

The observational length curve cannot answer "how long should a description be",
because **length IS provenance here**: a recovered project title is ~90
characters and a recovered summary runs to the cap. The 600–1100 character band
scores 49.5% and 30% of it is one regime that scores 100% at every length. So
the same founders were asked twice and only the amount of their own text
changed.

`DESCRIPTION=full|300|120|60|template|none` on `founderIntake`, default `full`,
so every other harness in the repo is byte-identical. `ARMS.txt`, and one
`SCORE_*.txt` per arm from `_wsir_score.ts` — paired bootstrap, McNemar,
sign-flip null, leave-one-regime-out.

| stage | full | 300 | 120 | 60 | canned | **empty** |
|---|---:|---:|---:|---:|---:|---:|
| publishable | 819 | 819 | 819 | 819 | 819 | 819 |
| founder_screen | 798 | 796 | 796 | 792 | 794 | 792 |
| gates_pass | 787 | 786 | 785 | 781 | 784 | 782 |
| pool_cut@40 | 673 | 673 | 675 | 658 | 637 | 636 |
| writer_cap@7 | 374 | 375 | 374 | 372 | 332 | 327 |
| **top_6** | **349** | **349** | **349** | **341** | **303** | **310** |
| top_5 | 324 | 323 | 322 | 319 | 275 | 284 |

`publishable`, `founder_screen` and `gates_pass` move by at most six founders
and `publishable` not at all — the proof that a description arm changed only
what the ranker was given to read.

### Paired against `full`, over the 819 past the corpus stages

| arm | ranks moved | pool_cut | EXACT@6 | 95% | null |
|---|---:|---:|---:|---|---|
| capped 300 | 153 | +0.00 | **+0.00** | [−0.85, +0.85] | inside |
| capped 120 | 208 | +0.24 | **+0.00** | [−0.98, +0.98] | inside |
| capped 60 | 367 | **−1.83** [−3.42, −0.24] | −0.98 | [−2.81, +0.85] | pool CLEARS, page inside |
| canned sentence | 599 | −4.40 | **−5.62** | [−8.06, −3.17] | clears |
| **box empty** | 625 | −4.52 | **−4.76** | [−7.33, −2.20] | clears, z=3.61, **96/96 LORO** |

**The dose-response has a floor and a plateau, and the plateau starts at about
120 characters.** Removing 80% of every founder's text costs *nothing at the
page*. The first measurable loss is at 60, and it is loss of REACH — the fund
falls out of the 40-row pool — before it is loss of a row.

### And the split that answers the brief

| arm | own-words (n=440) | cross-regime (n=379) |
|---|---:|---:|
| full (shipped) | 52.05% | 31.66% |
| capped 60 | 51.59% (−0.45) | 30.08% (−1.58) |
| canned sentence | 42.73% (−9.32) | 30.34% (−1.32) |
| **box empty** | **42.50% (−9.55)** [−13.18, −6.14], z=5.09, 29/29 | **32.45% (+0.79)** [−2.90, +4.22], inside its null |

**A description is worth ten points when it is about the project the money is
for, and nothing at all when it is about something else the company did.** That
is the causal, within-founder version of the twenty-point observational gap: half
the size, and about RELEVANCE rather than provenance.

### What the population would score if every founder wrote on-point text

The cross-regime half currently scores 31.66% with text that is measurably worth
zero. Give them the effect measured on the founders whose text IS on-point
(+9.5) and the funnel's headline goes from **38.9% to about 43%** — 349 + ~36 of
897. **Not 52%.** That extrapolation is stated as one: the +9.5 is measured on
own-words founders and applied to a stratum in harder regimes, so it is an upper
bound rather than a forecast.

---

## 3. Where descriptions come from, and what could be got that is not

`ETL/terms/_wsit_headroom.py`, output `HEADROOM.txt`. Read-only against
`db.sqlite` and against `instrument_profiles` in Postgres, through the same
`LeakIndex` the ETL builds descriptions with.

The 887 "recovered from another regime" are the **same company's** prose from a
different programme. So the question is: for those founders, does the corpus hold
prose from **the won fund's own award**, and if not, why not?

| | n | share of the 430 |
|---|---:|---:|
| held, leak-free, and **not used** | **30** | **7.0%** |
| held, but every candidate fails a leak guard | 298 | 69.3% |
| no award prose under the won fund at all | 102 | 23.7% |

Of the 298 refusals, **201 are "is a fund's own sample title"** — the text is one
of the up-to-forty titles `instrument_profiles.profile_text` is built from, which
is the column retrieval scores against. Those are *correct* refusals.

**The headroom is 7%, and it improves the TEST SET ONLY.** Not one line of §3
changes what a founder receives.

---

## 4. What is in a description, and what pays

`ETL/terms/_wsit_content.py`, output `CONTENT.txt`.

**Answer proximity: near, but not quoting.** The own-words stratum shares 0.324
of its vocabulary with the won fund's own profile against a 0.133 random-fund
baseline (lift **+0.191**); cross-regime is 0.168 against 0.097 (+0.071). The
random-fund column is there because a raw overlap share is a function of query
length and the strata differ tenfold on that. **5-gram sharing is 0.8% and 0.0%
— there is no verbatim leak.** 2.7x nearer is what a description of the project
that won that fund looks like. The residual unfairness is narrower than "leak":
the abstract was written *for that call*, in that call's framing, and a founder's
would not be.

**What content pays: nothing measurable.** The form's coaching line asks for
"what problem, for whom, and what the project itself would build or prove". Each
turned into a detector and priced within regime, publishable prose rows, n=792:

| feature | n with | raw gap | within-regime | 95% |
|---|---:|---:|---:|---|
| what it BUILDS (a technology) | 440 | +4.6 | **+7.4** | [−3.0, +17.2] |
| what PROBLEM it solves | 368 | +7.8 | −1.7 | [−11.7, +9.1] |
| FOR WHOM (a market or user) | 280 | +2.9 | +1.8 | [−7.6, +12.3] |
| what it would PROVE (a verb) | 357 | +7.1 | +0.5 | [−11.2, +10.5] |
| a number or quantity | 321 | −2.6 | −5.9 | [−15.2, +4.4] |
| more than one sentence | 333 | +4.1 | −2.3 | [−17.4, +13.5] |

**Not one of the six clears its own interval**, and six detectors on 792 founders
will always produce a largest one. The honest reading: **there is no evidence
here for redesigning the question.** The only positive point estimate is "names a
technology", which is what the form's LABEL already asks for — *"What are you
building?"* — while the three things the *coaching line* asks for are the three
that do not separate.

### 23 rows are not descriptions at all

Reading the strata turned up a shape no guard catches: **`Authority: … | Sector:
… | Form: …`** — a register RECORD serialised into the description field, 22 of
them in one country, plus a handful of consortium partner lists.

**None of the 23 is publishable**, so the scored ladder is clean and no figure in
this workstream or wsIR's is affected. But they are counted as "described" in
every banner the repo prints, and the shape will recur the next time a register
that publishes structured records is loaded. Flagged, not fixed.

---

## 5. What touches a real founder, and what only touches our test set

The owner's standing rule is that improving the test set is not progress. Sorted
on that line:

**TOUCHES A REAL FOUNDER**

- **The intake's own claim was wrong by 3–6x and is now the funnel's.** 48.9%
  against 21.3% (retired key, instrument-table path) replaced by 38.9% against
  34.6%, plus 52% against 42% for on-point descriptions. `panel.tsx`.
- **`USEFUL_DESCRIPTION_CHARS = 60` is re-grounded and NOT moved**, with the
  reason it was kept at 60 rather than raised to 120 written into its docstring:
  60 is the first cap where a measurement moves, which is the right floor for a
  *nudge*; 120 is where the last point of value is already banked; and raising a
  floor makes the form nag more founders for something not shown to pay.
- **Nothing above 120 characters has ever been shown to pay.** If the form ever
  wants to ask for less, that is the evidence for it, and the loss at 60 is
  reach rather than rows.
- **The finding that should shape the ask**: relevance, not length or effort. A
  description of *a different project the company did* is worth measurably
  nothing.

**TEST SET ONLY**

- The 7% recovery headroom in §3.
- The 23 register-record rows in §4.
- Everything in §1 about strata comparability: it changes how figures are read,
  not what anyone receives.

---

## 6. Corrections to the brief, and to two committed documents

1. **There is no "borrowed text".** wsIR §3, this brief and `shortlist.ts:3001`
   all say another company's; the builder says the same company, in capitals.
2. **`descriptionSource` has six values, not five.** The sixth is
   `own_project_title_leaks`, which `isDescribed()` excludes from every measured
   population — 58 rows whose text was withdrawn for leaking.
3. **`own_award_text` is the abstract of the award that IS the answer**, built in
   `extend_recall_set.py` from the same `public_funding_events` row that defines
   the pair.
4. **The funnel did not need re-running on the own-words population.** Every
   stage is per founder, so stratifying the committed trace is exactly
   equivalent and free. I ran the baseline anyway and it reproduced wsIR's `off`
   arm to the founder at every row — 819 / 673 / 374 / **349 = 38.9%** — which is
   what makes the six arms cleanly paired and proves the corpus did not move
   under them.
5. **The intake does not ask "what problem, for whom, and what the project itself
   would build or prove".** The label is **"What are you building? (a sentence or
   two)"**. That sentence is the coaching line shown only once the answer is
   already under the floor (`panel.tsx:757`).
6. **`USEFUL_DESCRIPTION_CHARS`'s stated evidence had stopped being true**, and
   it was on screen for founders. See §0 and §5.
7. **Against myself: my first truncation was off by one.** `lastIndexOf` returns
   −1 when the cut holds no space, and −1 clears `limit - 120` for every cap
   under 120, so the naive form silently dropped a character from every short
   cap. `scripts/descriptionPolicy.test.ts` caught it in the same commit, before
   a single arm ran.

---

## 7. What this recommends, and what it does not

**Nothing about the ranker.** No floor, tolerance or ceiling was moved, and
`USEFUL_DESCRIPTION_CHARS` and `MIN_MATCHABLE_DESCRIPTION_CHARS` are untouched.

**What the evidence supports**

- Asking for **relevance, not volume**. "Describe the project the money would
  fund" is already the form's hint and is exactly the property that pays; the
  length of the answer is worth nothing past ~120 characters.
- Treating the description as a **reach** lever rather than a ranking one. Every
  arm's loss is larger at `pool_cut` than at `top_6`, and within regime the
  own-words advantage is +18.5 at `pool_cut` and −1.7 at the page. The row
  machinery between them gives most of it back, which is `rank_shape_wsGY`'s
  +7.2 precedence stack seen from the other side.

**What it does NOT support**

- Not "52% is what we would score if founders described themselves". The
  composition-adjusted gap is +8.8 within country and unmeasurable within
  regime, and the causal within-founder effect is +9.5 on the founders it
  applies to. The population ceiling from this lever is **about 43%**.
- Not "longer descriptions are better". Measured, causally, three times: no.
- Not "the intake should ask for problem and market". Measured: neither
  separates, and neither does a number, a second sentence, or a verb.

---

## 8. How to reproduce, and what was verified

Everything except the six runs is free and needs no credentials beyond a
read-only database:

```bash
cd website/frontend
TRACE=../../project-mgmt/findings/pool_blend_wsIR/traces/trace_off.jsonl \
  OUT=/tmp/draw.jsonl npx tsx scripts/_wsit_draw.ts        # 897/897 verified

cd ../..
python3 ETL/terms/_wsit_strata.py   --draw /tmp/draw.jsonl   # STRATA.txt
python3 ETL/terms/_wsit_headroom.py       /tmp/draw.jsonl    # HEADROOM.txt
python3 ETL/terms/_wsit_content.py        /tmp/draw.jsonl    # CONTENT.txt
python3 ETL/terms/_wsit_arms.py  project-mgmt/findings/descriptions_wsIT/traces

cd website/frontend                                          # SCORE_*.txt
BASE=../../project-mgmt/findings/descriptions_wsIT/traces/trace_full.jsonl \
ARM=../../project-mgmt/findings/descriptions_wsIT/traces/trace_none.jsonl \
  npx tsx scripts/_wsir_score.ts
STRATUM=own ... npx tsx scripts/_wsir_score.ts
```

The arms, ~14 minutes each, no model call, Postgres required:

```bash
DESCRIPTION=full|300|120|60|template|none \
  FUNNEL_TRACE=<path OUTSIDE the repo> npm run stages
```

### Attestation

- Six funnel runs. Five attest `ranker: all 819 request(s) on EMBEDDING`; the
  `none` arm attests `nothing ranked`, because with no description
  `semanticFundMatch` returns before it makes a request — which is the founder's
  own condition, not a fallback. **No run fell back to lexical.**
- `corpus postgres instruments=1088`, `store POSTGRES BY DECISION`,
  `AWARD_TERM=oneside`, `row_order=off` in every arm. **`NO_PG` never set.**
- **EUR 0.00.** `measure_funnel.ts` deletes `ANTHROPIC_API_KEY` at import. No
  paid call, no production write, no Railway. `db.sqlite` opened `mode=ro`.
- **The product's series was not touched.** A `DESCRIPTION=` arm is now a
  counterfactual *in code*: it writes `description_latest.md` and can no longer
  reach `latest.md`, `latest.json` or `runs/`. `one_funnel/` was additionally
  restored from git after every arm, including the baseline.
- The trace header now carries the description policy beside `rowOrder` and
  `awardTerm` — without it two description arms are positionally pairable and
  otherwise indistinguishable.
- `npx tsc --noEmit` clean · `npx vitest run` **951 passed** ·
  `check_contracts` ok · `check_rendered_numbers` ok ·
  `check_recall_leaks` ok · `node scripts/run_checks.mjs` exits 0 with the 11
  pre-existing accepted failures held in `guard_registry.json`, none of them
  this branch's.
- **No floor, tolerance or ceiling was moved.**
