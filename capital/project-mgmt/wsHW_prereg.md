# wsHW — the pre-registration for the SECOND reading of wsHO's instrument

**Written and committed before the first paid token.** Nothing in this file may
be edited after the first call. A pre-registration revised once the numbers are
in is a narrative with a timestamp. wsHO honoured that by leaving its original
untouched and writing a separate addendum; the same rule binds here.

---

## 0. WHAT THIS RUN IS, AND WHAT IT IS NOT

It is **not a new experiment.** It is `_wsho_strata.ts`, fired again, on the
same draw, in the same strata, at the same rung, under the same rail, on a
corpus that six workstreams have changed since.

wsHO, 2026-08-18, EUR 3.69, reported the model's ordering as **a wash**: rescue
11/43 = 25.6%, harm 7/35 = 20.0%, **delta +1.68 points of population EXACT@6,
95% interval −5.84 to +9.20**, McNemar exact p = 0.481 on 18 discordant, n=78 —
and removing **one** regime of seven founders (`satr_fr_rnd`) flipped the sign
to **−1.50**.

**The only thing this run is for is the DIFFERENCE from that.** So the method is
frozen and the corpus is not. Every deviation from wsHO's method is enumerated
in §4 and there are exactly three, none of them touching what is measured.

## 1. WHAT CHANGED ON THE MODEL-FACING SURFACE, AND WHICH OF IT THIS CAN SEE

Six things were named to this workstream. **The selector's prompt template is
byte-identical** — `git diff 513cdf8a..HEAD -- lib/intelligence/agentSelect.ts`
is empty. What moved is the ROWS rendered into it, which rows exist at all, and
the ceiling on the reply. Stated before the data, because an attribution written
afterwards is a story:

| | what moved | does the SELECTOR see it? |
|---|---|---|
| **wsHQ** | 18 dead schemes dropped from `publishableInstruments()`; one had been published to a real founder and had ended 2020 | **YES** — the pool is a different set |
| **wsHR** | rows named by their register title instead of an id slug | **YES** — `[i] <title>` is the first line of every candidate |
| **wsHV** | 63 corrected gates + 22 register titles now in BOTH stores | **YES** — gates build `accessiblePool`, the largest filter in the funnel |
| **ceiling** | `MAX_TOKENS_BY_EFFORT.low` 2,048 → 8,192 | **YES** — directly |
| wsHS | no internal identifier in the WRITER's prose | **NO** — strictly downstream of `orderMemoCandidates`, which is where every figure here is read |
| wsHM | founder's raise and fund's award labelled as different quantities in the WRITER's prompt | **NO** — same reason |

**So this run can attribute FOUR of the six and is blind to two by construction,
and that is a property of the instrument rather than a shortcoming of the run.**
wsHO said the same thing in its own §"What this does NOT settle": every figure is
the code-side projection, and the finished brief is downstream of it. Anything
wsHS or wsHM did is invisible here and must not be claimed either way.

## 2. FROZEN: EVERYTHING wsHO DECLARED

`project-mgmt/wsHO_prereg.md` §§2–7 are adopted **verbatim and unmodified** and
are not restated here, because restating a specification is how two copies of it
come to disagree. In particular:

- **the population** — `__recallSetDescribed.json`, `split=holdout`, described,
  one row per company, sorted by name, fingerprint **`13cb71cf3a1d1847`**,
  asserted in code. The harness throws if the draw is not that one.
- **the strata** R / C / D, computed free before either arm runs, with **D never
  called** and **C carried deliberately** — without the control stratum a run
  measures gain and can never measure harm.
- **the pairing** — one pool object per founder, both arms handed the same
  array, asserted per founder rather than promised.
- **the leak bar** — `cross_regime` descriptions only on paid calls.
- **`NO_PG` is FORBIDDEN.** One flag, two defects, 5.3 points. The harness
  refuses to start if it is set.
- **the estimand** `delta = s_R * rescue − s_C * harm`, its 95% interval beside
  it, and **no direction claimed below 15 called in EACH stratum**.
- **CONCENTRATION reported beside any direction, without exception** — how many
  regimes the rescues come from and the largest one's share, and the same for
  the harms. wsHO's sign was decided by seven founders and it said so.
- **§6's seven VOID CONDITIONS**, unchanged, each a field the report prints,
  with condition 2 read against `TIMEOUT_BY_EFFORT.low = 40,000ms` and condition
  3 counted over **API calls, not seam invocations**.

## 3. THE RUN

```
GUARD_NO_PUBLISH=1 AGENT_SELECT=adviser AGENT_SELECT_EFFORT=low \
  AGENT_SELECT_UNSURE=declare WALK=897 MAX_EUR=3.55 MAX_CALLS=78 \
  OUT_ROOT=indicative_wsHW OUT_TAG=main npx tsx scripts/_wsho_strata.ts
```

**HARD CAP EUR 4.00 across everything this workstream spends**, which includes
the closing `npm run prodcheck` (~EUR 0.25). The rail is checked against billed
usage before each call; a founder it stops on is `called=false` and is excluded
from every graded set, so a spend limit can never turn itself into a result.

## 4. THE THREE DEVIATIONS FROM wsHO, DECLARED

1. **`OUT_ROOT=indicative_wsHW`.** wsHO's artefact is the thing this one is
   compared against and may not be written on top of. Default unchanged, so
   wsHO's own reproduce line still reproduces wsHO.
2. **`MAX_CALLS=78`.** wsHO's n was decided by its rail: it stopped at EUR
   3.5792 having called 78 and turned 188 away. If the price per call has
   FALLEN, the same rail would buy MORE than 78 here and the two runs would no
   longer have the same n. The cap pins the sample size to wsHO's. It cannot
   bias: the walk is a seeded shuffle, so stopping it early leaves the called
   set a random sample of R u C exactly as the rail did. If the price has RISEN
   the rail binds first and n is smaller — reported, never topped up.
3. **The report writer prints the run's own rung instead of a fixed sentence.**
   wsHO's `main.md` carries the paragraph *"This run is at `medium`"* while
   having run at `low`: the addendum moved the rung and the string did not.
   That paragraph is now a branch on `THINK_EFFORT`. **No measured quantity is
   touched** — it is prose in the report, and a paid artefact that misstates its
   own rung composes with nothing.

Nothing else. Same script, same draw, same strata, same rail, same seed, same
company-selection rule, same seam, same arm, same rung.

## 5. WHAT IS BOUGHT FREE FROM THE SAME REPLIES, AND MUST NOT COST A EURO

`_wsho_harvest.ts`, offline, no key, no DB, against this run's own tape:

- **THE NEW CEILING.** wsHO's largest reply was 1,891 of 2,048 — **92.3% of the
  ceiling that shipped**. At 8,192 the model can finish a sentence it was
  cutting. Reported: the output-token distribution against the new ceiling, and
  **whether replies actually got longer**.
- **[WITHDRAWN 2026-08-19 — see `findings/ruler_wsIB/`. The instrument behind
  these two numbers disqualifies the fund the company actually won on 43.6% of
  founders, and the sector rule it attributes to the prompt is not in the
  prompt. Re-derived: 48.4% is 3.3%, and 0 of 156 founders hold fewer
  qualifying rows than seats.]**
- **IS THE SLOT-FILLING DEFECT STILL REAL.** wsHO measured **48.4% of picks
  failing the prompt's own two disqualifiers, and 39.0% on founders with ample
  qualifying rows**, and concluded `atMost` is worth an arm. Re-read on these
  replies, it decides whether that arm is worth buying — at no extra cost.
  Reported the same generous way, as an UPPER BOUND in the model's favour.

## 6. LABELLING, AND THE ONE THING THAT MAY NOT HAPPEN

**Every figure carries `indicative, n=`.** No figure from this run may reach the
dashboard headline; that is `one_funnel` and nothing else. n=78 was never
powered to close an interval and n=78 twice is not either.

**If it is still a wash, the finding says so plainly.** That is a real answer and
it is the one that decides whether the EUR 30.70 full run is worth buying at
all. A second reading that can only report good news is not an instrument.
