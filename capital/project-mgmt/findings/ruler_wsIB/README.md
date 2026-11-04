# wsIB — the ruler behind "48%" was measuring a rendering artefact, and the written case for `atMost` does not survive its repair

**FOR THE OWNER.** wsHZ found that the instrument behind the 48% headline throws
out the fund the company actually won on 44% of founders. I was sent to fix it
or retire it. **It is fixed, and the fix is worse news for the numbers than the
defect was.** Once the ruler may not condemn the right answer, **48.4% becomes
3.3%** and **the founder the whole `atMost` argument is about does not exist:
0 of 156 across both paid runs hold fewer qualifying rows than seats.**

```
what this cost           EUR 0.00. No model call. No production write. No
                         database: DATABASE_URL and VOYAGE_KEY destroyed at
                         module scope in every script that touches this.
reproduce                cd website/frontend
                         npx tsx scripts/_wsib_ruler.ts          (both tapes)
                         npx tsx scripts/_wsib_ruler.ts --slots  (wsDY's 18)
shipped behaviour        UNCHANGED. AGENT_SELECT_SECTOR_NOTE ships `off` and
                         sends a byte-identical prompt, pinned by a test.
verification             npx tsc --noEmit · npx vitest run (889 tests, 65 files)
                         · check_contracts · check_answer_not_reachable
```

## 0. THE CONTAINMENT CLAIM HELD. No founder has been harmed.

Verified rather than taken:

- `SECTOR_WORD` has exactly four consumers outside the measurement scripts, and
  all four are in `shortlist.ts` **rendering** `sectorClause` — the `mostly X`
  string on a row. No filter, no score, no cut reads it.
- `checkSelection` in `lib/intelligence/selectionChecks.ts` is structural only:
  SELECT-1 counts distinct indices, SELECT-2 checks index range. Neither reads a
  sector, a label or an award median.
- Its one call site on the request path (`agentSelect.ts`) is inside a
  `try`/`catch`, **increments a tally and never repairs or gates.**

**Strict string equality appears on no founder-facing path.** The defect was in
the measurement, and the measurement's output was written into the source as
settled fact — which is the harm that was real.

## 1. TWO THINGS WERE WRONG, AND THE SECOND IS THE ONE NOBODY CHECKED

**The rule was never the prompt's.** Four scripts and `agentSelect.ts` call
these "the two disqualifiers THE PROMPT ITSELF STATES". Read `buildPrompt`. It
states three, and none of them is this one:

```
a scheme whose typical cheque is an order of magnitude away from what this
company needs is the wrong scheme however well the rest fits
a scheme whose stated demands this company plainly fails is the wrong scheme
a scheme that stopped paying out years ago is the wrong scheme
```

Its only sector sentence is a **tie-break about the TITLE** — "where two are
equally good, prefer the one whose title is specific to what this company does
over the one whose title is generic" — and it **disqualifies nothing.** So the
ruler graded one real disqualifier, invented a second, attributed it to the
prompt, and never tested the other two.

**And the invented one condemns the right answer by construction.** It was
strict equality between a row's `mostly X` clause and the founder's own sector
label. `mostly X` names **one bucket of a distribution** whose median top share
is 0.47, printed only when it clears `FOCUS_SHARE` and only when the vocabulary
can spell it. Measured on the answer key: **the founder's own sector is the
largest bucket of the fund they WON on 26 of 78 founders.** A perfect selector
fails that test two times in three before any judgement is involved.

## 2. THE FIX, AND ITS PROPERTY

> **A row is a category error for this founder when the fund's own award history
> is long enough to speak and records not one award in the founder's sector, nor
> in any sector that funds alongside it above chance.**

- **the whole distribution, not the headline** — reads `sectorMix`, which
  `mostly X` is a one-word summary of.
- **the neighbourhood, DERIVED** — `sectorNeighbourhood()` computes from the
  corpus alone which sectors are co-funded above their corpus-wide shares. **No
  pair is named in the code or the test.** `_ruler.test.ts` proves the relation
  on a synthetic corpus whose sector keys are `alpha`, `beta`, `gamma`, `delta`
  — none of which exists in this repo — including that a sector added tomorrow
  gets its neighbours on the day its first award lands.
- **long enough to speak** — with `n` awards and none in the family, the rule of
  three puts the 95% upper bound on the family's true share at `3/n`. The
  silence only counts if even that bound sits below the family's corpus-wide
  share. Short histories return **`null`, not `false`**, and no caller may
  collapse the two.

## 3. THE FALSE-DISQUALIFICATION RATE, BEFORE AND AFTER

`_wsib_ruler.ts` runs the retired ruler and the calibrated one from **one
implementation of each**, over the same tapes and menus. It reproduces every
published figure exactly before reporting a new one — 2.1 of 18, ten of the
twelve, 48.4%, 48.0%, 43.6%, 46.2%, 69.6%, 70.3% — which is what earns it the
right to be believed about the rest.

| | wsHO | wsHW |
|---|---:|---:|
| **won fund disqualified, RETIRED ruler** | **43.6%** | **46.2%** |
| **won fund disqualified, CALIBRATED** | **12.8%** | **14.1%** |
| …of which the MONEY rule alone | 11.5% | 12.8% |
| …of which the THEME rule | **1.3%** | **1.3%** |
| menu rows disqualified, retired | 69.6% | 70.3% |
| menu rows disqualified, calibrated | 20.0% | 20.7% |
| **picks called a failure, retired** | **48.4%** | **48.0%** |
| **picks called a failure, calibrated** | **3.3%** | **2.7%** |

**The theme rule fires on exactly one won fund across both tapes, and it is
named in the output every time the script runs.** AIXTRON SE answered
`industrial_manufacturing`; the Bundesministerium programme it won holds 25 of
30 awards in `semiconductors_electronics`. **No adjacency derived from this
corpus rescues it** — co-funding lift between those two is **0.85, below
chance**, so the corpus's own structure declines to call them neighbours. That
is not an adjacency failure. It is **the founder's self-declared sector
disagreeing with the corpus's classification of that same company's own award**,
and no corpus-derived theme test can be right when those two disagree. It is
left firing rather than tuned away.

**The brief's hypothesis — "semiconductors & electronics is inside industrial
manufacturing's neighbourhood and the taxonomy should be able to say so" — is
refuted.** `public/data/taxonomy.json` is a strict tree: 11 sectors, subsectors
under exactly one parent, **no cross-sector edges at all.** The only adjacency
this corpus can compute is co-funding, and it says the opposite.

## 4. "2.1 SURVIVORS" DOES NOT HOLD, AND THE CASE FOR `atMost` GOES WITH IT

| | wsHO | wsHW | wsDQ (18 rows) |
|---|---:|---:|---:|
| mean survivors, retired ruler | 11.5 | 11.2 | **2.1** |
| mean survivors, calibrated | 30.2 | 30.0 | **6.3** |
| **fewer survivors than seats, retired** | 26/78 | 27/78 | **10/12** |
| **fewer survivors than seats, calibrated** | **0/78** | **0/78** | **7/12** |

**At the depth that ships, the mechanism does not occur.** `atMost` exists to
relieve "a founder holds fewer qualifying rows than seats, so every pick beyond
them is a seat filled by construction". Re-derived at forty rows against seven
seats: **not one founder of 156.** wsHZ bracketed the forced-versus-elective
split at 26–69% forced; it is settled at **zero forced**.

At eighteen rows a residual remains — and it is **entirely the money rule**.
Money-only gives 6.8 survivors and the same seven of twelve.

## 5. THE MONEY RULE IS THE PROMPT'S OWN AND IT IS ALSO BADLY CALIBRATED

Checked against the same labelled set, as instructed, rather than assumed:

- It disqualifies the won fund on **11.5% and 12.8%** of founders while cutting
  18.3% of the menu. Separation barely better than chance.
- **The fund a company actually won writes a typical cheque of a median 0.45x
  the BOTTOM of the band the founder asked for**, and 0.19x at the quartile. A
  public grant is one component of a raise, not the raise, so sitting well under
  the band is the **normal shape of a right answer**.
- Pushed to where it stops condemning the answer key — floor/100 — it cuts 1.0%
  of the menu and is **inert**.

**It is left at floor/10 and reported with its false rate, not moved.** It is
the prompt's own sentence, and a measurement of the prompt has to grade the
prompt. Any figure quoted from the calibrated ruler carries its 11.5% with it.

## 6. WHAT THIS MEANS, IN ONE LINE

**Both disqualifiers behave the same way under calibration: nearly all of their
discriminating power was false positives.** A theme test that may not condemn
the right answer cuts 2.7% of a menu where the old one cut 64%. **48% was never
a measure of pick quality and 3.3% is not a defect worth an arm.**

## 7. WHAT I FIXED, RETIRED, AND LEFT ALONE

**Fixed.** `scripts/_ruler.ts` is the one implementation; `_wsdy_slots.ts`,
`_wsho_harvest.ts`, `_wshz_replay.ts` and `_wsec_compose.ts` import it and all
three that run offline produce **byte-identical output**. `_wsdy_slots.ts` also
had a real defect nobody had seen: **its sector map held six entries where
`shortlist.ts` holds ten**, so a founder in energy & cleantech, materials &
chemicals, space or defence & security had *every* described row counted
off-theme. None of the twelve bench companies is in one of those four, which is
why the output is unchanged and why it survived. The other three copies imported
`SECTOR_WORD`. **Four copies with a "keep in sync" note, and they had already
drifted.**

**Retired.** The strict-equality theme test, as a disqualifier and as anything
attributed to the prompt. `themeMismatch` is kept, marked retired, and exists
only so the withdrawn numbers reproduce.

**Corrected at the source.** The ~2,000-word `atMost` comment in
`agentSelect.ts` now carries the withdrawal, both reasons, the before-and-after
table, and the sentence that ends it. Its falsification paragraph is corrected
too: one of the two things it named as able to change the answer **has now been
done, and came back against the lever.**

**Left alone, deliberately.** The money rule's floor. The `atMost` code itself —
it is off, it is complete, and deleting it is a decision about dead surface
rather than about this measurement. `ROW_DESCRIPTOR=share`, which already exists
and is the cheaper arm of §8.

## 8. THE PROMPT CHANGE — proposed, OFF, and not the one I was asked for

I was asked whether the prompt should say a descriptor naming an *unrelated*
sector disqualifies a row rather than *another*. **It says neither. There is no
descriptor disqualifier in the prompt** (§1).

What is wrong is the opposite shape. **Every row prints `mostly X` and the
legend does not mention it** — six bullets explain the title, the body, the
cheque, the year, the qualification line and the row-specific requirement, and
the descriptor is not among them. So the model meets an unexplained sector label
and decides for itself. The reasoning wsDS already paid for says what it
decided: *"only #2 and #4 explicitly match the software and AI sector"*. **It
read the label as a restriction.** It is not one, and a model filtering on it
discards the right answer two times in three — the model making the ruler's
mistake first.

`AGENT_SELECT_SECTOR_NOTE=explain` adds one legend bullet stating what the
number is, and does **not** tell the model what to conclude from it.

- **OFF BY DEFAULT and it must stay off** until somebody buys the measurement.
  It changes the bytes a model reads, so every tape on disk answers a different
  question.
- `sectorNote.test.ts` pins that `off` and unset send a **byte-identical**
  prompt and that `explain` differs by **exactly one contiguous insertion**.
- **Sweep `ROW_DESCRIPTOR=share` first.** It already exists, renders
  "47% software & AI" on the row itself, and a skim cannot miss a number the way
  it can miss a legend.
- **What would falsify the whole idea, and it is free:** grade picks against the
  row's descriptor holding shipped rank fixed. If a matching descriptor is no
  likelier to be picked, do not buy it. Not done.

## 9. WHAT IN THE BRIEF TURNED OUT TO BE WRONG

1. **"The two disqualifiers are stated to the model in prose inside
   `agentSelect.ts`'s prompt."** They are stated in `agentSelect.ts`'s
   **comments**. The prompt states one of them and a tie-break about something
   else. This is the finding, not a quibble: the comment misquotes the prompt it
   sits fifteen hundred lines above.
2. **"Adjacency is computable from the taxonomy; semiconductors is inside
   industrial manufacturing's neighbourhood."** The taxonomy is a strict tree
   with no cross-sector relation, and the only adjacency the corpus can compute
   — co-funding lift — puts that pair **below chance**. The AIXTRON case is not
   an adjacency problem.
3. **"At least these four scripts carry it."** Five. `_wsec_compose.ts` carries
   it too, and its own §5 had already asked the right question — *"if the won
   fund is routinely ruled out by our own two tests, then those tests are
   wrong"* — and been ignored.
4. **"The award-median disqualifier may be fine."** It is not. 11.5% and 12.8%
   on the answer key, and inert wherever it stops being.

## 10. THE ANSWER-KEY LINE, FILE BY FILE

| file | side |
|---|---|
| `scripts/_ruler.ts` | reads the committed corpus snapshot only. Names no answer-bearing source. Imported by scripts; **not reachable from `pipeline.ts`** |
| `scripts/_ruler.test.ts` | synthetic data only |
| `scripts/_wsib_ruler.ts` | **reads `won` off a tape** — legitimate for an instrument, and it is a script the product cannot reach |
| `lib/intelligence/agentSelect.ts` | comments and one env-gated legend string. **Reads nothing new** |
| `lib/intelligence/sectorNote.test.ts` | synthetic rows, mocked SDK |
| `scripts/_wsho_strata.ts` | one lever recorded in its own provenance block |

`check_answer_not_reachable` green: 62 modules reachable from the request path,
none names an answer-bearing source.
