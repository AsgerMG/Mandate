# wsHZ — the 48% that has been quoted twice is the pool's number and the ruler's, not the count mode's; `atMost` is refuted, and it was never unbuilt

> ██ **WITHDRAWN IN PART, 2026-08-19 — read `findings/ruler_wsIB/` first.** ██
>
> Every figure below of the form "fails the prompt's own two disqualifiers" is a
> figure about **strict string equality between one taxonomy label and another**,
> and about a sector rule **that is not in the prompt** — `buildPrompt`'s only
> sector sentence is a tie-break about the TITLE and disqualifies nothing. The
> same ruler throws out the fund the company ACTUALLY WON on 43.6% and 46.2% of
> founders. Re-derived with a ruler calibrated against that labelled set:
> **48.4% / 48.0% of picks becomes 3.3% / 2.7%**, mean survivors of forty rows
> goes 11.5 → 30.2, and **the founders holding fewer qualifying rows than seats
> goes from 26/78 and 27/78 to 0/78 and 0/78.** The mechanism does not occur at
> the depth that ships. Reproduce free: `npx tsx scripts/_wsib_ruler.ts`.

**FOR THE OWNER, VERBATIM.** I was handed a conclusion drawn from an aggregate
rate and asked to check it against the tapes before building on it. **It does not
survive.** Three things, and the third is the one that ends it.

**One: there is nothing to build.** `AGENT_SELECT_COUNT_MODE=atMost` has been in
`agentSelect.ts` since wsDY, complete — the prompt shape, the licence sentence,
the reply template, `checkSelection`'s branch, and its own tally counters. wsHW
proposed buying an arm that has been sitting off by default for weeks with a
2,000-word note beside it explaining why it is off.

**Two: a short list was never a short brief.** `agentSelectRows` returns a
PERMUTATION of the pool — chosen first, everyone else keeping the shipped order
behind them — so a declined seat is handed back to the empirical ranker, not left
empty. There is no product decision waiting about publishing four rows: the
founder always receives the full table. That was true in the code and pinned by
nothing, and it is pinned now.

**Three, and this is the finding: the metric that motivated the arm disqualifies
the right answer 44% of the time.** The ruler behind "48.0% of picks fail the
prompt's own two disqualifiers" was pointed at the one row on every menu we know
is correct — the fund the company actually won — and it **throws that row out on
34 of 78 founders in wsHO and 36 of 78 in wsHW.** AIXTRON SE won a German
microelectronics research programme and the ruler kills it because AIXTRON
answered "industrial manufacturing" and the row is labelled "semiconductors &
electronics". Bouyer Leroux won an ADEME industrial-decarbonisation call and the
ruler kills it for saying "energy & cleantech" against "materials & chemicals".

**So 48% is not a count of wrong picks.** It is a count of rows a strict
string-equality theme test and a one-sided money test reject, and it rejects the
ground truth at nearly the same rate it rejects the model. **A number that
condemns the right answer half the time cannot be the reason to change how the
product picks.**

**And the licence drops the won fund.** Replaying the most favourable `atMost`
there is, the won fund LEAVES the six on **four founders in each run, three of
them the same companies both times.** The owner's own disqualifying condition,
found for free, before the money.

**My recommendation: do not buy this arm. Nothing here is worth EUR 28.76.**

---

```
what this cost           EUR 0.00. No model call was made. No production write.
                         Two paid tapes replayed offline; DATABASE_URL and
                         VOYAGE_KEY destroyed at module scope so "no DB, no key"
                         is enforced rather than stated.
reproduce                cd website/frontend && npx tsx scripts/_wshz_replay.ts
                         (defaults to both tapes; takes paths to override)
shipped behaviour        UNCHANGED. AGENT_SELECT_COUNT_MODE still defaults to
                         `exactly`. No founder receives anything different.
verification             npx tsc --noEmit · npx vitest run (63 files, 861 tests)
                         · npx tsx scripts/check_contracts.ts — all green
```

---

## 0. The reconstruction earns the right to speak, first

Every counterfactual below rests on one identity: `agentSelectRows` returns
`[...chosen, ...everything else in the shipped order]`, so **the seat any row
lands in is a pure function of the pick list and that row's shipped rank** —
both recorded on the tape. The script rebuilds `poolRankTreatment` from `picks`
and `poolRankControl` alone and compares it to what the run recorded:

| | wsHO | wsHW |
|---|---:|---:|
| founders whose won fund is on the menu | 78 | 78 |
| **rebuilt rank matches the tape** | **78/78** | **78/78** |

It aborts if that ever fails. A model of the permutation that cannot reproduce
the run that happened may not be believed about one that did not.

## 1. THE DIAGNOSIS, TESTED THREE WAYS

wsHW's mechanism is: *fewer qualifying rows than seats, so the model fills the
rest with rows it has just been told are disqualified.* That is one of two
defects an aggregate rate cannot tell apart.

- **FORCED** — the founder held fewer survivors than seats. `atMost` fixes this.
- **ELECTIVE** — a qualifying row sat UNPICKED while the seat went to a
  disqualified one. `atMost` cannot fix this; the model was not short of
  somewhere better to go.

### Test one: the split — points the right way, and does NOT survive its own sensitivity

| | wsHO | wsHW |
|---|---:|---:|
| picks failing the two rules | 264 (48.4%) | 262 (48.0%) |
| …FORCED, generous survivor set | 69 (26.1%) | 76 (29.0%) |
| **…ELECTIVE, generous** | **195 (73.9%)** | **186 (71.0%)** |
| founders who left a qualifying row unpicked and spent the seat elsewhere | 68/78 (87.2%) | 65/78 (83.3%) |
| qualifying rows left on the table, mean | 6.2 | 6.3 |
| …FORCED, **strict** survivor set | 242 (66.3%) | 251 (68.8%) |
| …ELECTIVE, **strict** | 123 (33.7%) | 114 (31.2%) |

The generous set is the harvest's own: an unpriced row, an undescribed row and
an unknown band all survive. The strict set says a row we cannot check is not a
row we can vouch for. **The two bracket the answer at 26–69% forced, and on that
alone the split decides nothing.** Recorded rather than buried, because a
sensitivity that goes the other way is the part a reader needs.

### Test two: the control — and this one is not bracketed

Our own free empirical score never reads the prompt, cannot be told to fill a
seat, and has no count mode at all. Graded on the SAME ruler:

| rows graded | wsHO | wsHW |
|---|---:|---:|
| the WHOLE 40-row menu | **69.6% fail** | **70.4% fail** |
| **the control's six — no model** | **44.9% fail** | **44.7% fail** |
| **the model's six** | **45.7% fail** | **46.2% fail** |
| the model's seven picks | 48.4% | 48.0% |

**A selector that never saw the prompt scores the same as the model, and both
are ~25 points better than the menu they were cut from.** So ~45% is what the
top of a forty-row pool looks like under this ruler. It is a property of the
POOL, and **no count mode can move a base rate.**

### Test three: does the model select on these rules at all?

Generosity cannot be argued away, so test the thing generosity cannot touch —
how much likelier a survivor is to be picked than a failure.

| | wsHO | wsHW |
|---|---:|---:|
| P(picked \| survives both rules) | 31.5% | 32.4% |
| P(picked \| fails at least one) | 12.9% | 12.6% |
| **enrichment** | **2.45x** | **2.57x** |

**The model is not ignoring the rules it stands accused of ignoring.** Against a
17.5% base rate it picks survivors at nearly twice that and failures at well
below it. That is not the profile of a model filling seats blind.

## 2. THE RULER, POINTED AT THE ONE ROW WE KNOW IS RIGHT

Everything above grades against two rules reconstructed from the prompt. There
is exactly one row on every menu whose correctness is not in question: **the
fund the company actually won.**

| | wsHO | wsHW |
|---|---:|---:|
| won fund on the menu | 78 | 78 |
| **won fund SURVIVES both rules** | **44 (56.4%)** | **42 (53.8%)** |
| **won fund is DISQUALIFIED** | **34 (43.6%)** | **36 (46.2%)** |
| …under the strict reading, survives | 25 (32.1%) | 24 (30.8%) |
| model picked the won fund AND the ruler calls that pick a failure | **10** | **10** |

**The ruler rejects the ground truth at 43.6% and 46.2%, against the 48.4% and
48.0% at which it rejects the model's picks.** Those two numbers are not
distinguishable. The named cases say why, and they are legible:

```
AIXTRON SE            won a Bundesministerium MICROELECTRONICS research programme
                      THEME: the founder answered "industrial manufacturing",
                             the row is labelled "semiconductors & electronics"

Bouyer Leroux         won ADEME's industrial decarbonisation call
                      THEME: the founder is "materials & chemicals",
                             the row is "energy & cleantech"

JANSEN RECYCLING      won a Noord-Brabant OPZuid scheme
                      MONEY: typical EUR 226k against a band floor/10 of EUR 250k
```

The theme test is **strict string equality between one taxonomy label and
another**. It does not distinguish a category error from an adjacency, and the
adjacency is where most right answers live. This is the door-separation problem
wearing a different hat, and it means **the 48% headline has never been a
measure of pick quality.**

## 3. WHAT SHORTENING COSTS THE FOUNDER — measured free

Replaying the **most favourable `atMost` there is**: the model declines
precisely the picks that fail the ruler and keeps every other pick. A real model
would not be that obedient, so this is an **upper bound on the gain and a lower
bound on the harm.**

| | wsHO | wsHW |
|---|---:|---:|
| founders who would return FEWER picks | 69/78 (88.5%) | 70/78 (89.7%) |
| seats handed back, mean on those founders | 3.8 | 3.7 |
| **founders who would receive FEWER ROWS** | **0** | **0** |
| **won fund GAINED** | 2 | 6 |
| **██ won fund LOST** | **4** | **4** |
| net EXACT@6 on the called 78 | **−2** | **+2** |

**The won fund is lost on four founders in each run, and three are the same
companies both times: AIXTRON SE, ARISTON, X FAB DRESDEN.** The owner named this
as disqualifying. It is found, and it is found for free.

Two more the pick-rate could never have shown:

- **Of the rows promoted into the six because a seat was handed back, 66.3% and
  61.7% FAIL THE SAME TWO RULES.** Declining mostly swaps one disqualified row
  for another. The seat reverts to the empirical ranker, and the empirical
  ranker's rows fail this ruler at 44.9%.
- The net effect on EXACT@6 is **−2 and +2**. A wash, for the fourth independent
  time this quarter.

## 4. THE DOWNSTREAM QUESTION, ANSWERED IN CODE AND NOW PINNED

> *"If the selector returns 4 where the writer expects 7, does the memo publish
> four rows or backfill from the score?"*

**It backfills, and it always has.** `agentSelectRows` returns a permutation of
the pool it was handed. `WRITER_CANDIDATE_CAP` cuts that at 7 and the page shows
6, unchanged. **A declined seat is not empty — it keeps the empirical ranker's
own choice, the order that ships without any model at all.**

So the product decision the brief anticipated does not exist. What did exist was
a load-bearing claim stated in three comments and tested by nothing, in a repo
whose dominant failure mode is a comment that is no longer true.

`lib/intelligence/declinedSeat.test.ts` states it as a **property over every
reply length the contract admits, 1 to `SELECT_COUNT`, under BOTH modes**: the
output is a permutation of the input, and the rows the model did not pick appear
in their original relative order. A length nobody has tried is covered; so is a
future repair that quietly drops a row it dislikes. Running it under `exactly`
too is deliberate — **the founder-facing guarantee must not depend on which mode
is set.** Verified by simulating the disaster: return `[...frozen, ...chosen]`
and all fifteen cases fail with a table shorter than the pool.

## 5. THE PRE-REGISTRATION — and why it is a recommendation NOT to run

**I am not pre-registering the `atMost` arm, and the reason is the evidence
above, not caution.** A pre-registration commits to a primary outcome before the
data. The only primary outcome this arm has ever been offered is the share of
picks failing the two disqualifiers, and **that outcome is now known to be
invalid in two independent ways:**

1. **It is mechanically guaranteed to improve.** A pick-rate falls whenever
   picks fall. `atMost` reduces picks by construction, so the headline moves
   without anything about the founder's table changing. A measurement whose
   result is entailed by its treatment measures nothing.
2. **It disqualifies the right answer 44% of the time.** Even repaired to grade
   the SIX SHOWN rather than the picks, it would be scoring against a ruler that
   throws out the fund the company won on a third to a half of founders.

And the secondary outcome — population EXACT@6 — has now been read as a wash
**four times**: wsHO +1.68, wsHW −3.10, and this replay's −2 and +2 on the same
founders. wsHW's own re-test noise floor is 10 flipped founders in 78. **An arm
whose free upper bound is ±2 cannot be seen by an instrument whose noise is
±13%.**

### What I would pre-register instead, if the owner wants a euro spent here

Not the count mode. **`innovate_uk`.** It is the one place two independent paid
runs agree and the effect is not a wash: removing that single agency turns wsHO
from +1.68 to +3.07 and wsHW from −3.10 to +3.71, and **7 of wsHW's 11 harms are
it.** That is a concentrated, diagnosable, reproducible defect on one regime,
and unlike the count mode it has never been shown to be an artefact of the
instrument. It is also almost certainly free to diagnose first — the regime's
gates and door encodings are on disk.

### And the free repair that should come before any spend

**Fix the ruler, or retire it.** If we want a real measure of "did the model pick
a row that does not belong", it must be one that does not reject AIXTRON's own
microelectronics grant for being labelled semiconductors. Until then, no run
should quote the 48% again — including as background.

## Files

| | |
|---|---|
| `replay.txt` | `_wshz_replay.ts` in full, on both tapes |
| `../../../website/frontend/scripts/_wshz_replay.ts` | the tool; free, offline, re-runnable forever |
| `../../../website/frontend/lib/intelligence/declinedSeat.test.ts` | the permutation property, both modes, every admissible length |

## What this does NOT settle

- **Whether `atMost` would help if the ruler were fixed.** Unknown, and it stays
  unknown until there is a valid ruler. The arm is not deleted; it is where it
  was, off by default, with this finding beside it.
- **The 2.45x enrichment.** It says the model tracks these rules better than
  chance. It does not say the rules are the ones it should be tracking.
- **Anything about the writer.** Every figure here is the code-side projection
  cut to six, upstream of `WRITER_CANDIDATE_CAP`.
- **wsHO's and wsHW's spend.** Both runs were correctly executed and correctly
  reported; the harvest even flagged its own caveat — *"read it as 'the two
  stated disqualifiers do not describe how it picks'"*. **The defect is in the
  inference drawn from it afterwards, twice, and I nearly made it a third time.**
