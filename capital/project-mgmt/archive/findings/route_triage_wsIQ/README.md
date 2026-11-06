# wsIQ — the closed routes, triaged by HOW they were closed. Three real nulls, five real negatives, and eight that were never measured.

**FOR THE OWNER.** You asked whether the ranking routes this project closed were
closed by a genuine null or by a ruler that could not see. **Both, and the split
is not the one the memory records.** Four things, and the second is the one that
cost us.

**One, and say the unflattering thing first: reciprocal rank did NOT rescue
anything here.** The one closed route whose per-founder ranks are committed —
wsGA's `adviser` arm, 98 founders — re-scores at **EXACT@6 +9.18 points
[−4.08, +22.45]** and **reciprocal rank +0.0155 [−0.0372, +0.0694]**. On this
tape the binary is the *flattering* measure and recip is the shy one, the exact
reverse of wsII. **Recip is not a sharper instrument in general; it was sharper
for wsII's contrast.** Anyone quoting "recip is the sensitive one" as a rule is
quoting a result, not a property.

**Two: the memory's grounds for closing the single-signal route are a misreading
of wsCS's own sentence, and I can show it.** The line quoted as *"not one signal
changes rank order against SHIPPED"* sits directly under wsCS §1's **wsBU-column
against wsCS-column** table and is followed by *"Every wsBU finding on this table
stands"*. It says the **leaderboard** did not move between two studies. It does
not say any arm left the pool ordering untouched — every single-signal arm is a
**total re-ordering of the pool by construction**; that is what
`measure_signal_power.ts` does. The route is still mostly closed, but for a
different reason (sixteen of eighteen signals sit 3–20 points below SHIPPED, far
outside any half-width). **The two that are not — collaborative prior 22.6 ±3.3
and semantic 20.7 ±3.2 against SHIPPED 23.0 ±3.4 — were closed by exactly the
error wsCS itself names forty lines later: two marginal intervals answering a
paired question, with the paired column sitting in `/tmp` and thrown away.**

**Three: the honest answer to "were they all real nulls" is NO, and the
underpowered class is eight routes deep.** The table is §1. The worst case is
`ship_blend_wsCV`: a **+6.0 ±3.3 paired result, McNemar z = 3.5** (wsCU) was
overturned end to end by **three marginal count sets with no discordant count
computed anywhere**, whose sign flips between splits — **−7 on tune, +4 on
holdout.** That is not a measurement of the blend.

**Four: the instrument that resolves this already exists, is free, and ran
yesterday.** `field_tier_wsIP` scored one arm on the **full 897-founder funnel**
with a 4,000-resample paired bootstrap of mean reciprocal rank:
`dRecip +0.02464 [+0.01663, +0.03337]` — three times its own half-width — while
**EXACT@6 on the same founders in the same run read 219 against 214, +0.56 points
against a ±2.85 half-width, unreadable.** Same n, same zero cost, same run.
**Every deterministic route in the underpowered class can be re-scored through
that harness for EUR 0.00.**

Everything below is free and offline: `npx tsx scripts/_wsiq_rescore.ts`,
output committed as `rescore.txt`. No paid call. No production write. No Railway.

---

## 1. THE TRIAGE

**Genuine null** = the arm produced no change in rank order, so no outcome
measure could have seen anything. **Real negative** = it moved the order and lost
by a margin no plausible half-width covers, or on a paired test excluding zero.
**Unmeasurable** = it moved the order and was judged against a half-width that
could not resolve it. **Never measured** = no outcome was computed at all.

| route | artefact | did the order move? | closed on | verdict |
|---|---|---|---|---|
| single signals, one at a time | `ranking_reopen_wsCS` §1 | **yes, totally** — each arm re-orders the whole pool | 18 **marginal** EXACT@5 intervals, holdout n=600 | **16 real negative, 2 UNMEASURABLE** (peer, semantic) |
| the blend as a pure re-ordering | `wsCS` §2, `regain_wsCU` | yes | PAIRED, +5.0 ±3.4 z=2.9; +6.0 ±3.3 z=3.5, 20 regimes | **not a null — positive, and open** |
| **the blend END TO END** | `ship_blend_wsCV` | **yes** — won leaf's median rank after the sort **29 → 25**; 61/250 → 55/250 cross the five-row line | **three marginal count sets, no discordant count, sign flips −7 / +4** | **UNMEASURABLE — the worst closure in the set** |
| proximity | `proximity_wsGX` | yes — 416/828 founders, median 2 rows, and it says so before the outcome | PAIRED McNemar, `pool_cut` −1.9 z=2.87 | **real negative, properly closed** |
| seat allocation / per-row routing | `seats_wsCW`, `wsCS` §4 | yes (+45/−72 etc.); genuine no-op at depth ≥ 13 | PAIRED discordant + z on every sweep row, tape reproduces the published five 600/600 | **real negative, properly closed** |
| consensus sampling | `consensus_wsGO` | yes — 66 of 350 seats change occupant | McNemar on **7 discordant of 50**, bootstrap [−16.0, +4.0] | **UNMEASURABLE by the number — but the MECHANISM closes it** (the won fund is the *less* stable row, 2.04 vs 1.49, reproduced by wsII on a different pair of runs) |
| per-fund evidence | `scheme_evidence_wsBY` | **no** — every register fact is constant inside a leaf's own cell, keyed on the SA number | +0.0 to the tenth, no interval needed | **GENUINE NULL, structural** |
| sibling embeddings | `sibling_embedding_wsHH` | **no** — `semanticFundMatch` is a rank transform, so a monotone re-expression cannot reorder; 0/287 disagreements | pairwise separation vs a measured null | **GENUINE NULL, provable** |
| head-to-head `arm=off` | `headtohead_wsGA` | **no** — 324/324 published lists identical, 0 discordant | McNemar z=0.00 on 0 discordant | **GENUINE NULL by construction** (the harness anchor) |
| head-to-head `arm=reverse` | `headtohead_wsGA` | yes — 120/120 lists differ | McNemar z=−3.93 / −4.41, p<0.001 | **real negative by design** (the positive control) |
| **head-to-head `arm=adviser`** | `headtohead_wsGA` | **yes** — 97/98 published lists differ, the won fund's pool rank moves on **75/98** | PAIRED EXACT@5 z=+0.80 p=0.522, EXACT@6 z=+0.95 p=0.430, **and a raw-rank Wilcoxon p=0.414** | **UNMEASURABLE — and re-scored in §2** |
| **depth / the seam** | `seam_wsDR` | yes — 2.2 and 3.1 rows of 7 change; pool membership identical by construction | two marginal EXACT@5 columns on n=45, **no interval printed at all** | **UNMEASURABLE — 14 movable founders, a two-founder difference** |
| collapsing siblings | `sibling_collapse_wsM` | yes, heavily — 46 programmes folded off one founder's page | 4 policies × 3 seeds, n=200, **no half-width, no paired test** | **UNMEASURABLE** |
| collapsing recurring calls | `call_residual_wsCL` | STRICT: **no, +0.0 on every arm of both splits**; loose keys: yes | placebo band of 25 regroupings — a good design | **STRICT genuine null; loose keys real negative** |
| address / territory | `address_door_wsCJ` | the **oracle** moves 0 pairs on holdout (60/250 → 60/250) because only 22/250 pairs sit in a territorial cluster | EXACT@5, no interval on the delta | **GENUINE NULL for the oracle; the screen arm is a real negative** (it removes the winner 3× per 250) |
| `atMost` | `atmost_wsHZ` | yes in replay — 88.5% / 89.7% of pick lists change | net EXACT@6 **−2 / +2** on 78, against a **10-founder** re-test churn floor | **UNMEASURABLE — still the arm to buy** |
| channel prior | `channel_prior_wsIO` | barely — 5 founders' won-fund rank | EXACT@6 +0 vs ±2.85 **and** meanRecip −0.000005 | **effectively a genuine null, and scored on BOTH — correct practice** |
| field tier, peers vs constant | `field_tier_wsIP` | yes — 498 founders moved | paired bootstrap recip [−0.0073, +0.0112], EXACT@6 −11 | **properly closed on both measures** |
| catch-all sector | `catchall_wsIN` | **unknown** — it says so | mediator proxy only | **NEVER MEASURED, not null** |
| title cut / instrument names | `title_cut_wsID`, `instrument_names_wsIF` | yes — 8/300 and 155/897 published sixes change | **no outcome metric and no interval at all** | **NEVER MEASURED** |
| door-level rows | `door_separation_wsHA` | **not an arm** — a single-arm audit of 287 pairs | share-of-287 counts | **NOT A ROUTE.** The memory's *"0 of 29 points"* appears nowhere in the tree |

### Where the artefact does not record enough to tell

- **`sibling_collapse_wsM`** — the code is deleted (`archive/wsM-sibling-collapse`)
  and no sidecar was committed. The only evidence that the order moved is one
  prose example.
- **`catchall_wsIN`** and **`title_cut_wsID`** — no outcome was computed, so
  there is nothing to re-score and nothing to call a null.
- **`dead_ranker_wsDO`** — the N=40 gate-2 ladder's fixture and harness are
  deleted. The six-row table survives; the cases do not.

## 2. RE-SCORED ON BOTH MEASURES — and only one route survives to be re-scored

**The estimator is validated against known answers first.** §7 of the script
reproduces wsII's published figures on the two paid tapes to four decimals:
wsHO EXACT@6 **+1.6768**, recip **+0.0739**; wsHW **−3.0986** / **+0.0716**.

**Then the reconstruction is proven before it is used**, as wsIJ did: the
treatment pool rank rebuilt from `picks` matches the recorded
`poolRankRanker` on **98 of 98** wsGA calls.

### wsGA `arm=adviser`, 98 founders, medium effort, 2026-08-12

| measure | estimate | 95% (6,000-draw paired bootstrap) | P(>0) |
|---|---:|---|---:|
| EXACT@5, points | **+6.12** | [−7.14, +18.37] | 0.817 |
| **EXACT@6, points** | **+9.18** | [−4.08, +22.45] | **0.900** |
| reciprocal rank | +0.0155 | [−0.0372, +0.0694] | 0.716 |

Leave-one-country-out: **EXACT@6 positive in 10/10 folds, recip in 9/10.**

> **The binary is the stronger reading on this tape and the honest lead.** wsII's
> rule — *never score an ordering change on EXACT@6 alone* — stands as a warning
> against a single measure, not as a claim that recip always wins. Here it loses.
>
> **And nothing here has helped anybody yet.** The interval spans zero on both
> measures, and the run is **VOID by its own pre-registration** (`no call cut off
> at max_tokens` — four were). It is a third tape consistent with wsII's sign, not
> a confirmation of it.

### The null test, because wsIJ's trap kills exactly this shape

Both nulls simulated on wsGA's own 18-row menus, 4,000 draws each.

| what picks the seven rows | EXACT@5 | EXACT@6 | recip |
|---|---:|---:|---:|
| **null A** — seven rows drawn uniformly | −16.33 | −14.92 | −0.0976 |
| **null B** — depth profile transferred from a random donor | −9.51 | −7.65 | −0.0471 |
| **the model** | **+6.12** | **+9.18** | **+0.0155** |
| p(null ≥ model), null B | 0.0003 | 0.0003 | **0.0055** |
| `arm=reverse`, the order deliberately inverted (n=120) | — | −36.67 | −0.1358 |

**The arm clears both nulls on all three measures**, and the deliberate inversion
signs strongly negative, so neither measure has a mechanical offset. The
regression-to-the-mean artefact wsIJ found is real and is *not* what is happening
here.

### wsDR — the depth route, as far as the artefact allows

**14 of 45 founders have the won fund in the pool at all**, and those 14 are the
entire evidence base of *"depth is not the constraint"*. The published ladder —
off 9/45, late 10/45, early 8/45 — is a **two-founder difference with no interval
printed.**

Worse, **the artefact never records the won fund's id.** It is recoverable only
where the fund reached some arm's published seven — **13 of 14** — so the
recovered set is conditioned on success and biased toward the top. On it:
seam=late EXACT@5 −23.08, recip −0.0444 [−0.2137, +0.1230]; seam=early
EXACT@5 −23.08, recip −0.1012 [−0.2379, −0.0025]. **Quote none of these as a
measurement.** The finding is that the route was closed on fourteen people.

### Every other route cannot be re-scored, and the reason is one line

**The per-pair dump went to `/tmp` or to the scratchpad, every time.**
`/tmp/wsbu/*.json`, `/tmp/wscu/*.json`, `/tmp/wscw_tape.*.json`,
`/tmp/wsCM/stages_tune.json`, `/tmp/wsgy_full.json`, `/tmp/wsco/*.json`,
`/tmp/wscl/*.json`, `/tmp/wscj/*.json`, `scratchpad/wsgx/trace_{off,on}.jsonl`,
`channel_prior_wsIO`'s `/tmp/x.json`. `ship_blend_wsCV` never dumped one at all.

> **So for every arm that produced discordant pairs — wsCM's 27, wsGY's 241 —
> the identity of the flipped founders is not recoverable from the repository.**
> The aggregate is committed and the evidence is not. That is the single cheapest
> thing to fix and it changes nothing about how a run is executed: write the
> trace, commit the trace.

## 3. WHERE THE 36 POINTS ACTUALLY GO

The brief said the ordering leak between `pool_cut` and `top_6` is ours. It is —
and it is **not spread over four stages.** From today's ladder:

```
pool_cut     672  74.9%
writer_cap   374  41.7%   -298 founders, -33.2 pts   orderMemoCandidates().toWriter
published    374  41.7%      0
top_6        349  38.9%    -25 founders,  -2.8 pts
```

**33.2 of the 36 points are one cut, 40 rows to 7.** The 7 → 6 shuffle is worth
2.8. Any ordering work aimed below the writer cap is aimed at a tenth of the
leak. `POOL_BLEND` acts exactly on the 40 → 7 cut; wsGY measured the funds that
lose it sitting at **median rank 27, p75 46** of the pool.

## 4. TWO ROUTES TO REOPEN, AND WHAT EACH COSTS

**1. `POOL_BLEND` end to end, scored on reciprocal rank. EUR 0.00 in model
calls.** It is the only route in the set where a paired result excluding zero
(+6.0 ±3.3, z = 3.5, spread over 20 regimes) was overturned by an unpaired one
whose sign flipped between splits. It acts on the 40 → 7 cut, which is 33.2 of
the 36 points. **Cost: two `measure_funnel.ts` runs (~2h each, Voyage + Postgres,
no model call), plus `FUNNEL_TRACE` to a path outside the tree** — wsGX already
built that lever and already refuses in-tree paths. Score it through
`_wsip_fieldtier.ts`'s paired bootstrap, and **run the within-pool shuffle null
beside it**, because a re-ordering that only moves buried rows up will score on
recip without moving a seat.

**2. The single-signal feature dump, re-scored paired. EUR 0.00 in model
calls.** Two arms — collaborative prior and semantic — sit inside SHIPPED's
half-width on a question the harness was built to answer paired, and the memory
records the route as *closed for good* on a sentence about a leaderboard.
**Cost: one `measure_signal_power.ts` run per split (Postgres + Voyage, no model
call), and `FEATURES_OUT` pointed at a committed path instead of `/tmp`.**

**What I am not recommending, and why.** `atMost` remains the only arm worth
money and this triage does not change that — but note wsHZ's replay already
shows it moving **88.5% of pick lists for net EXACT@6 −2 / +2**, so it is going
to be measured against the same 10-founder churn floor unless it is bought as a
**census** with both it and wsIJ's abstain rule scored off the same calls.
EUR 28.76. **The depth route deserves reopening on the evidence (it was closed on
fourteen people) but it costs EUR 28.76 for one arm and it loses to `atMost` if
only one can be bought.**

## 5. WHERE THE BRIEF AND THE MEMORY WERE WRONG

1. **"wsCS's *not one signal changes rank order against SHIPPED* reads like a
   genuine null — verify it."** It is neither a genuine null nor an underpowered
   one, because **it is not a statement about the pool ordering at all.** §1.
2. **"The first three arms scored 17% / 19% / 15% against a shipped 27%."** Those
   numbers are in `adviser_design.md` (N=120), not in `headtohead_wsGA`, and
   `adviser_audit.md` records that comparison as **invalid**: 5,670 of 7,095
   answer-key pairs carry no founder description, so it is a judge with no case
   file against a ranker that never needed one. `findings/README.md` marks both
   superseded by wsGA, whose figures are **control 45.9% → ranker 51.0%**. The
   memory still quotes the retired pair.
3. **"door-level rows — 0 of 29 points."** That string appears nowhere in the
   tree. `door_separation_wsHA` is a single-arm audit, not a route with an arm.
4. **"Recip is the sensitive instrument."** True of wsII's contrast, false of
   wsGA's, where EXACT@6 reads P(>0) = 0.900 and recip 0.716 on the same 98
   founders. Report both, every time, and let the contrast decide which leads.
5. **The reference funnel is not the shipped order.** `latest.md` carries its own
   banner: `AWARD_TERM=oneside`, an arm no founder receives, with `discovering`
   absent and `querying_db` reduced. The 74.92 / 38.91 pair is an arm
   measurement. wsII said this too and it is still being quoted bare.

## Verification

`npx tsc --noEmit` clean. `npx tsx scripts/check_contracts.ts` ok (10 contracts,
105 rules). `npx tsx scripts/check_answer_not_reachable.ts` ok. `npx vitest run`
— **931 of 933 pass; the two failures are `check_red_debt.test.ts` and they fail
identically on `main` in the primary checkout.** They are the inert-comparator
ceiling (64 against 45) and the requirement-judgement ceiling (1,130 against
400), neither touched here. No floor, tolerance or ceiling moved.

## What this does NOT settle

- **Whether the blend is worth anything end to end.** Recommendation 1 is a
  design, not a result.
- **Anything about routes whose per-pair dump is gone.** wsM, wsCM, wsGY, wsCW,
  wsGX, wsBU, wsCU and wsCV are triaged from their summaries and cannot be
  re-scored without re-running them.
- **Whether the wsGA adviser sign is real.** The run is VOID by its own
  pre-registration and its interval spans zero on both measures.
