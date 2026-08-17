# wsHK — the pre-registered analysis for the forty-row confirming run

**Written by wsHI before any paid call is made. Nothing in this file may be
edited after the first call.** A pre-registration revised once the numbers are
in is a narrative with a timestamp.

The last paid run at this seam is **VOID by its own pre-registration**: wsGA
declared "no call cut off at `max_tokens`" a void condition, four of 210 calls
breached it, and its report renders that row as VOID. Its headline had to be
withdrawn. The failure was not the truncation. It was that **nobody could tell
from the report whether the condition had been breached** — the tally line
printed `4 CUT OFF` over the wrong denominator, next to a `depth=40` that
described a lever rather than the menu. This file exists to make that
impossible, and everything in §5 is written against that specific failure.

---

## 1. The question

`AWAITING_APPROVAL.md` §2. Eighteen rows was a stopgap. `BRIEF_VERDICT_POOL` is
now 40, which moves "the answer is on the list" from 36.7% to 78.3% for about
1.3 euro-cents a brief. **What has never been bought is whether the model's
accuracy holds on the longer list.**

> Does the selector put the fund a company actually won into the published
> table at least as often on a **forty**-row menu as the recorded eighteen-row
> run did, on the same founders, at the same effort?

One lever: the menu length. Not "is the ranker good", not "does thinking help".

## 2. Why this run and no other could be bought yet

Every recorded paid run at this seam ran an **eighteen**-row menu — including
the one whose tally line says `depth=40`, because `depth=` prints
`SELECT_DEPTH`, a cap that has read 40 since before the ranker shipped.
`findings/headtohead_wsGA/adviser_medium_n773_x2.json` records `menu: 18` on all
98 called founders, no pick index above 17, and accessible pools up to 128 rows.
`VERDICT_POOL` went 18 → 40 on 2026-08-13, **the day after that run**.

So the token ceiling in force was sized on evidence from a menu less than half
the length of the one shipping, and truncation at forty rows had never been
bounded by anything. `findings/tokens_wsHI/` closed that: the ceiling is now
derived against **this run's own abort condition** — P(any truncation in a
630-call run) < 5% under linear menu scaling — rather than against a quantile.

**This run is what supplies the line `check_maxtok_headroom` currently prints as
`0 recorded run(s) at the 40-row menu that ships`.**

## 3. The design

| | |
|---|---|
| **arms** | CONTROL = the eighteen-row menu (`BRIEF_VERDICT_POOL=18`). TREATMENT = forty (`BRIEF_VERDICT_POOL=40`). |
| **seam** | `late`, the shipped position. |
| **pairing** | Both arms on the SAME founders from the SAME draw, same seed, same corpus fingerprint. The menu is the only thing that differs. |
| **population** | `__recallSetDescribed.json`, the draw wsGA used — seed `20260806`, `n=773`, `ONLY_IN_POOL=1`, `MAX_COUNTRY_CALLS=40`. |
| **effort** | `medium`. Same rung wsGA used, so the comparison is against a recorded number rather than against a new one. |
| **samples** | `REPEAT=1`. wsGO measured multi-sampling dead (−6.0pp at @5, interval excluding any useful gain); a second sample here would buy variance nobody has a use for. |

## 4. The exact command

```
cd website/frontend

# CONTROL — eighteen rows, the menu every recorded run actually used
GUARD_NO_PUBLISH=1 \
AGENT_SELECT=adviser AGENT_SELECT_EFFORT=medium AGENT_SELECT_UNSURE=declare \
BRIEF_VERDICT_POOL=18 AGENT_SELECT_DEPTH=40 \
SEED=20260806 N=773 ONLY_IN_POOL=1 REPEAT=1 MAX_COUNTRY_CALLS=40 \
MAX_EUR=8 RUN_TAG=wshk_menu18 \
npx tsx scripts/_wsga_headtohead.ts

# TREATMENT — forty rows, what ships
GUARD_NO_PUBLISH=1 \
AGENT_SELECT=adviser AGENT_SELECT_EFFORT=medium AGENT_SELECT_UNSURE=declare \
BRIEF_VERDICT_POOL=40 AGENT_SELECT_DEPTH=40 \
SEED=20260806 N=773 ONLY_IN_POOL=1 REPEAT=1 MAX_COUNTRY_CALLS=40 \
MAX_EUR=8 RUN_TAG=wshk_menu40 \
npx tsx scripts/_wsga_headtohead.ts
```

`MAX_EUR` is a hard interlock, not an estimate. Two arms at EUR 8 each caps the
run at **EUR 16**; the expected spend is EUR 11–13 (`AWAITING_APPROVAL.md` §2),
and the treatment arm costs more per call than the control because a longer menu
is a longer prompt. **`NO_PG=1` is forbidden** — it silently causes both the
snapshot and the lexical fallback and has cost 5.3 points before.

## 5. VOID CONDITIONS — the part that failed last time

The run is void and its primary result discarded, with no post-hoc rescue, if
any of these hold. **Every one of them is now a field the tally line prints, so
a reader decides in one line rather than by inference.**

1. **`N/M CUT OFF at max_tokens` has a non-zero numerator on either arm.**
   Unchanged from wsGA. What changed is that `M` is now the API-call count, not
   the founder count — pinned by `lib/intelligence/tallyDenominator.test.ts`,
   which drives the seam with a scripted client and fails on the old
   denominator. A truncated reply is indistinguishable downstream from a model
   that declined, and both publish the control.

2. **`exits.threw` is non-zero on either arm.** NEW, and it is the hole wsGA
   could not have seen. A ceiling the clock cannot reach never truncates — the
   call times out first, and a timeout is counted in `exits.threw` while a
   truncation is counted in `truncated`. **A zero truncation count is therefore
   not on its own evidence that the ceiling held.** Raising the ceiling without
   this condition would relocate the fault into the quieter counter and clear
   the abort condition falsely, which is the second void nobody would notice.

3. **`slowest call Xms of Yms` exceeds 80% of the clock on either arm.** NEW.
   Below the timeout is not the same as clear of it: at 80% the next founder is
   a coin toss, and the run would be measuring latency at the margin. If this
   trips, the finding is "the clock binds before the ceiling does" — a real
   result, and one that must be reported rather than retried at a lower effort.

4. **`menu=` on the treatment arm is not `40`, or on the control is not `18`.**
   NEW, and it is the wsGA failure stated as a condition. A run whose menu the
   report cannot state cannot license a ceiling for any menu — see
   `check_maxtok_headroom.ts` property 4.

5. **The draw fingerprint differs between the two arms**, or differs from
   `37e0879c895d4d6a` without the corpus fingerprint also having moved. The seed
   pins the draw, not the population.

6. **The arm attestation does not print, or `ranker: all N request(s) on
   EMBEDDING` is missing.** Three headline figures in this project have been
   retracted for missing provenance.

7. **The fallback rate materially exceeds wsGA's 3/148 on either arm.** A
   fallback publishes the shipped order, so a run with many of them is measuring
   the control's agreement with itself under the treatment's banner.

**Reporting rule.** The report must quote both arms' tally lines **verbatim and
in full**, before any analysis. wsGA's did, which is the only reason its breach
was ever found; it took two workstreams and it should have taken one glance.

## 6. The primary test, declared before the data

**Primary.** EXACT@6 on the in-pool sub-population — the cut the funnel is
measured at — McNemar exact and signed, treatment against control, paired by
founder.

- **Forty rows is confirmed** if the point estimate is **≥ 0** and the 95%
  interval's lower bound is **above −3.0pp**. This is a NON-INFERIORITY test and
  the asymmetry is deliberate: the ceiling gain (36.7% → 78.3%) is already
  bought and free, so this run only has to show the model does not give it back.
  Demanding a *gain* would be asking the wrong question.
- **Forty rows is refuted** if the interval's lower bound falls below −3.0pp.
  That is a complete result: it closes the widening rather than leaving it open.
- **Secondary, and it may not carry the headline:** the won fund's pool rank,
  Wilcoxon signed-rank. A more powerful test of a different quantity is not a
  second chance at the same question.

**Why −3.0pp.** The widening moves the ceiling by 41.6 points. A loss inside
three points of accuracy against that is a trade worth taking on its face; a
larger one means the model is not using the rows it is being given, which is a
different finding and needs a different run.

## 7. What this run does NOT settle

- **Whether the ceiling is right at efforts above `medium`.** `high`, `xhigh`
  and `max` are projected from eighteen-row evidence and stay projected.
- **The menu-scaling relationship itself.** Two points (18 and 40) at one effort
  bound it; they do not describe it. The pessimistic linear assumption in
  `caps.ts` stands until something measures otherwise.
- **Throughput.** The run will produce the first recorded `slowest call` figure
  in this repo's history. That is a number to keep, not a result to publish.
