# Workstream AE — what removes the 22 a German founder never sees

Workstream Z raised `POOL_LEAVES_PER_CHANNEL` 90 → 250 and measured that a
German founder gets **81 of 103 publishable SATR leaves at every cap from 90
upward**. The other 22 die before the cap is consulted. Z named the two
suspects — the capital filters and the one-row-per-institution-name dedupe —
and said the next pool-recall win was not in the cap.

This is the attribution, per instrument, from `ExclusionLog` rather than from
reading the code.

**The answer is 21 / 1, and the 21 are the product working.** One line of it is
a real defect, and it is the smaller half.

All figures below were read from **Postgres, 1,088 instruments**, on
2026-08-08. Every run asserts `requireLiveCorpus` and prints its corpus, and
every run declares its credentials through `requireCredentials`, so a run that
could only reach the lexical fallback ends rather than printing a number that
looks real.

---

## 1. The breakdown of the 22

`scripts/diagnose_pool_filters.ts` replays one founder and attributes every
publishable, country-reachable leaf missing from `candidateInstrumentIds` to the
rule recorded against **its own id**. Z's probe counted rules across the whole
request, which cannot say which of the 22 died to what: `SEL-CAPITAL` fires 45
times for a German founder and only some of those are SATR leaves.

On the corpus as it stood when the workstream opened:

```
DE/state_aid_satr: publishable=103 in pool=81 missing=22
     21  SEL-CAPITAL
      1  SEL-DUPE-NAME
```

**There is no third cause and nothing unattributed.** The split is 21/1, not a
mixture — which is what made it worth splitting: the two halves needed opposite
answers.

### The 21 — every one of them a tax credit

All 21 carry `capital_type = tax_credit`, verified per instrument, and they are
three notified schemes rather than 21 unrelated funds:

| notified scheme | leaves | what it is |
|---|---|---|
| SA.56245 | 18 | German R&D research allowance (Forschungszulage), delivered by 18 different tax offices |
| SA.114724 | 2 | the same allowance under a second notification |
| SA.103196 | 1 | a CHP surcharge reduction |

The removing rule is `instrumentServesCapital`, and the harness replays every
pair with `capitalSought: ["grant", "loan"]`.

### The 1 — a title collision, not a sibling

`satr_de_rnd__sa_112200__nbank`, removed because another row published under an
identical title.

---

## 2. The capital filter is CORRECT. No change. This half is handed to AR.

The intake offers five capital options and `tax_credit` — "Tax credits &
reliefs" — is one of them. A founder who ticked Grants and Loans and did not
tick Tax credits is not being denied anything: they said they did not want a tax
credit, and the filter withheld tax credits. This is a filter on a recorded fact
about the instrument against a stated preference of the founder, which is the
shape of rule this project keeps and not the shape it replaces.

**The 22 are not a product defect. 21 of them are the product working.** The
brief asked for a documented revert if the filters turned out to be right; on
this half, this is it.

### Coordination with workstream AR

AR opened on `passesCapitalPreference` the same day, asking whether it is too
strict for the pool points lost between 94% and 91% under realistic per-founder
answers. It is the same pair of functions. **It is not the same question**, and
AE took the dedupe half rather than duplicate the work:

- **AE** asked what the harness's FIXED `capitalSought=[grant,loan]` removes.
  Answer: tax credits, correctly.
- **AR** asks whether DERIVED answers make the filter cut funds a founder would
  have accepted. Untouched here.

Two things AE measured are stated here and in `WORKSTREAMS.md` so AR does not
pay for them again.

**(a) The harness constant imposes a ceiling on `pool` of about 99%.**
`measure_recall.ts` and `check_recall_floor.ts` both pass the same fixed
`capitalSought` for every replayed pair, so any pair whose won fund is not a
grant or a loan is unreachable by the founder's own stated preference before
ranking is consulted. `scripts/census_capital_reach.ts` prices it:

```
tune    1581 gradable   grant 94.5%  loan 4.6%  tax_credit 0.9%
        CEILING on pool imposed by capitalSought=[grant,loan]: 99.1%
holdout 2207 gradable   grant 94.8%  loan 4.1%  tax_credit 1.0%  equity 0.1%
        CEILING: 98.9%
```

So the constant costs about **one point of pool, permanently and invisibly**. It
is NOT changed here, for two reasons: it is uniform across every pair, which is
what makes it leak-free — the same argument that pins `useOfFunds` — and
widening it would move the population the floors in `check_recall_floor.ts` were
calibrated on, which is a decision belonging to whoever owns those floors.
Recorded so that nobody again attributes that point to the ranker. It has the
same shape as the closed-scheme clamp workstream T found: a ceiling that reads
as a retrieval failure.

**(b) The one real capital defect is our encoding, not the fund's rule.**

Eight publishable instruments carry `capital_type = "unknown"`. **No intake
option maps to that value**, so `instrumentServesCapital` removes all eight from
the pool of every founder in every country, whatever they tick — five options or
one. The founder expressed no preference against them; we have no fact, and the
filter reads our silence as their refusal.

```
eit_climate_kic_asa, eit_climate_kic_cdr, eit_climate_kic_clean_cities_spain,
eit_digital_champions, eit_digital_vap, eit_food_rfs, eit_health_catapult,
eit_rawmaterials_portfolio            [eit/EU]
```

Confirmed live in every one of the countries replayed.

**Not fixed here, deliberately.** The honest fix is upstream: record the capital
type where the fund's own documents can settle it. Guessing in the filter would
be worse than the bug — three EIT vehicles that ARE typed carry `equity`, and
two of the untyped ones are named "portfolio" and "investments", so admitting
`unknown` to a grant-seeker's pool could put a cap-table investor in front of
someone who never asked for one. That is precisely what `passesCapitalPreference`
exists to prevent, and this project has already shipped that failure once.

What is shipped instead is `scripts/check_capital_reach.ts`, in `npm run check`,
which states the property and ratchets the gap:

> Every `capital_type` carried by a publishable instrument must be reachable by
> at least one intake option. Absence of a recorded fact is not a mismatch.

Deliberately not "no instrument may carry `unknown`". A source that introduces
`mezzanine` or `convertible` tomorrow fails the same check without anybody
having thought of the word in advance. **The ratchet has already earned itself
once**: it was set at 9 against the 1,084 corpus and the re-derivation on 1,088
found 8, so it came down to 8. The gain cannot now be given back silently.

These instruments cost **zero measurable recall** — no answer key row names an
`unknown`-typed fund. They cost those funds their reach, which the recall number
cannot see. That is the whole reason the guard is a guard and not a metric.

---

## 3. The dedupe was obsolete, and what it still caught was the opposite of its purpose

The dedupe collapsed rows sharing a display label, keeping the one carrying more
of its own encoded gates. Measured before changing anything, one founder per
country:

```
DE 1    IT 1    CZ 2    the other 20 markets   0
```

Four rows in total. `distinguishRowNames` runs first and now separates almost
everything, because `administering_body` separates siblings in the
body-fragmented countries — DE's mean same-name class fell 91.8 → 4.2. **The
premise the rule was written on had expired**: it existed because siblings were
indistinguishable, and they no longer are.

**What it still caught was not what it was written for.** The four survivors are
not two leaves of one fund; they are **distinct notified schemes sharing a
published title**:

```
satr_cz_rnd__sa_63670__...  renders as "Podpora ze zdrojů Modernizačního Fondu
                            – program RES+, instalace do 1MW", the same label as
                            satr_cz_rnd__sa_111735__...
satr_de_rnd__sa_112200__nbank   collides on the full GRW scheme title
satr_it_rnd__sa_110595__...     collides on the full Avviso title
```

Different SA numbers, different budgets, different granting decisions. The
display rationale holds — a founder genuinely cannot tell them apart on the
page. The deletion does not: they are two funds.

### The root cause: two functions, two keys

`distinguishRowNames` grouped rows by `displayInstitutionName(r)`. The dedupe
keyed on `row.instrument || displayInstitutionName(row)`. For a row carrying a
real published title the two differ — the derived name embeds the notified
scheme code and therefore *separates* the twins — so the disambiguator saw no
collision to resolve, and the dedupe then collapsed the pair on a key the
disambiguator had never examined. The comment above the dedupe already said "key
on the DISTINGUISHED label"; the disambiguator itself had never been changed to
match.

That is not fixed by making the two spellings agree today. It is fixed by there
being one spelling: `rowDisplayLabel` is now the single label function, and the
collapse receives it as a callback rather than computing its own. A "keep these
in sync" comment IS the bug in this repo.

**`SEL-DUPE-NAME` now fires ZERO times across all 23 markets** on the live
corpus, and CZ SA.63670 is visible at rank 5 rather than erased.

A scheme-code token branch was written alongside this and **removed**: measured
across every market it produced a token zero times, because the granting body
separates every pair the corpus actually contains. A branch nothing can emit is
the `SEL-BAND` defect in code rather than in the register.

### The change that stays even so: demote, never drop

The array this filtered is the one the caller derives `candidateInstrumentIds`
from, so a **display** rule was deleting funds from the **writer's pool**, where
nothing downstream can recover them or even report their absence.

`applyPeerPrecedence` made exactly this correction for the notified-scheme
repeat forty lines below, on exactly this reasoning, with the measurement
attached: *"pool recall fell 97% -> 83% when this was a filter. Repeats go to
the back instead."* The two collapses were the same defect and only one of them
had been fixed.

The losers are now appended **after** `applyPeerPrecedence` rather than passed
through it, so they cannot take a visible slot. Verified by dumping the full
`instrumentTable` from both trees against the same corpus:

```
TABLE diff, DE IT CZ FR ES NO   IDENTICAL
POOL   DE 103 -> 104   IT 87 -> 88   CZ 67 -> 69   FR/ES/NO unchanged
```

The pool gains the fund and the visible order is untouched. Those three pool
deltas were re-measured on the 1,088 corpus with the same script run against
both trees and came back identical -- see section 4, where the sweep is
extended to all 23 markets and the other 20 are shown not to move.

The demotion is kept even though the key fix now leaves it dormant. It is the
INVARIANT — *a display rule may not delete from the universe* — and it is the
safety net for the case disambiguation genuinely cannot reach: two rows with no
distinguishing body, no region and no id difference. Deleting the drop is the
structural fix; the shared key is what makes it rarely needed.

### The invariant is now a test, not a comment

The demotion was correct and completely unguarded. Anyone reading that block
without the history reaches for the obvious simplification — turn it back into a
`.filter()` — and nothing in the build would have objected. **That is how the
rule became a deletion the first time.**

`lib/intelligence/nameCollision.ts` is the collapse as a pure function returning
BOTH halves, so the invariant is expressible and tested:

```
visible + demoted === input, always
```

Break-tested by returning `demoted: []` — four tests fail, including the
invariant by name. A guard is only worth the failure it can prove it produces.

`SEL-DUPE-NAME` in `rules.ts` is updated to say it demotes, and its log line now
names the label collided on AND the row shown instead — without both, the log
says a collision happened and nothing about whether the two rows were really
indistinguishable, which is the only question that decides whether this rule
still earns its place. A register entry advertising a deletion the code no
longer performs is the `SEL-BAND` defect recorded in that same file.

### What a founder sees

One market's table changes, and it changes by gaining a fund:

```
CZ   before   5. SA.111780 "…instalace nad 1MW"      6. SA.111730 "…alternativní paliva"
     after    5. SA.63670  "…instalace do 1MW · MINISTERSTVO ŽIVOTNÍHO PROSTŘEDÍ ČR, …"
              6. SA.111780 "…instalace nad 1MW · Ministerstvo životního prostředí"
DE, IT, and the other 20 markets: table unchanged, pool +1 / +1 / 0.
```

Verified by dumping the rendered label of every visible row from both trees
against the same corpus, not by reasoning about the component. A browser render
was attempted and abandoned as theatre: `/brief/preview` renders a RECORDED
fixture, so it shows the same page before and after and proves nothing about a
change to fund selection. The label the change introduces is 165 characters; the
DE table already ships a 230-character row today and the IT table already ships
a `·` token, so the layout carries labels longer than this one before the change.

---

## 4. Measured, both arms interleaved on one corpus

The corpus moved under this workstream twice, so **every number below is a pair
of runs on the same 1,088-instrument Postgres corpus**, base immediately
followed by after, using the SAME diagnostic script against both trees. Raw
records are committed beside this file (`_recall_base.txt`, `_recall_after.txt`,
`_sweep_base.txt`, `_sweep_after.txt`).

### The dedupe, per market: 4 rows recovered, nothing else moves

`diagnose_pool_filters.ts` across all 23 markets holding publishable
instruments, one founder each, both arms:

```
mkt   publishable   pool base -> after   SEL-DUPE-NAME base -> after
CZ         92            67 -> 69  +2            2 -> 0
DE        148           103 -> 104  +1           1 -> 0
IT        112            87 -> 88  +1            1 -> 0
the other 20 markets      unchanged              0 -> 0
TOTAL                  1226 -> 1230  +4          4 -> 0
```

**The recovered rows are exactly the rows the rule deleted, and nothing else
changed anywhere.** That is the whole claim of the change, measured rather than
argued: `SEL-DUPE-NAME` fired four times and now fires zero times, because the
shared label key lets `distinguishRowNames` separate the pairs before anything
collapses them.

### Recall, three seeds, holdout, N=250

`measure_recall.ts`, `SPLIT=holdout`, `SEED=20260806 / 7 / 99`, `corpus=postgres
instruments=1088` printed by all six runs.

```
                    seed 20260806        seed 7            seed 99
  in pool           234 -> 235  +     233 -> 237  +     234 -> 238  +
                     94% -> 94%        93% -> 95%        94% -> 95%
  EXACT@5            62 ->  62          69 ->  69         78 ->  75  -
                     25% -> 25%        28% -> 28%        31% -> 30%
  REGIME@5          206 -> 206         208 -> 208        213 -> 213
                     82% -> 82%        83% -> 83%        85% -> 85%
```

**Pool is up on all three seeds and down on none: +1, +4, +4 pairs.**
**REGIME@5 — the operational number — is identical on all three, to the pair.**

**EXACT@5 is unchanged on two seeds and loses three pairs on the third**, and
that is stated rather than averaged away. It is well inside the interval
(±5.7pp at this N), but it is not nothing and it has a mechanism: rows that were
previously DELETED on a title collision are now separated and both shown, so an
extra row competes for the five visible slots and can displace an exact answer.
The trade is +9 pool pairs across the three seeds against −3 exact pairs on one
of them, with the regime number untouched — a wider universe at no cost to the
operational metric. Two of three seeds show literally zero movement in EXACT@5,
which is what a change of this size should look like.

### By founder country — the axis a per-country filter hides behind

Pool, base → after:

```
                        seed 20260806      seed 7        seed 99
  DE   (n=51/51/46)      86 -> 88  +     88 -> 92  +    83 -> 90  +
  IT   (n=30/26/32)      93 -> 93        92 -> 96  +    88 -> 91  +
  FR   (n=74/78/79)      97 -> 97        98 -> 98       98 -> 98
  SE, NL, ES, GB, EE, DK          unchanged on every seed
```

**DE gains on all three seeds**, which is the market the brief said this bites
hardest, and IT on two. **France — the worst market at 16-18% EXACT and the
largest single country in the population — does not move on any seed, in pool or
in EXACT.** Nothing is taken from it to pay for DE. No country's pool falls on
any seed.

### By regime-size stratum — the overfitting axis

Pool, base → after:

```
                        seed 20260806      seed 7        seed 99
  regime 1 (alone)      100 -> 100      100 -> 100     100 -> 100
  regime 2-5             75 -> 75        67 -> 67       92 -> 92
  regime 6-20            74 -> 74        85 -> 85       79 -> 79
  regime 21-50          100 -> 100      100 -> 100     100 -> 100
  regime 51+             96 -> 97  +     93 -> 97  +    93 -> 97  +
```

The entire gain sits in `regime 51+` on every seed, and that is the prediction
the mechanism makes rather than a result explained after the fact: a title
collision requires two schemes publishing under one name, which only happens in
the crowded national regimes. **No stratum loses on any seed** — including the
founder whose fund stands nearly alone, the one an overfitted change abandons.

### By population

Pool, base → after:

```
                        seed 20260806      seed 7        seed 99
  mode=profile           97 -> 98  +     96 -> 98  +    96 -> 98  +
  mode=project           83 -> 83        85 -> 85       88 -> 88
  original join          89 -> 89        89 -> 91  +    88 -> 91  +
  traced                100 -> 100      100 -> 100     100 -> 100
```

`original join` — the smaller, older population the floors keep a wide margin
for, and the one a change is most likely to trade away — gains on two seeds and
loses on none. `mode=project` is unchanged because project pairs are EU
programmes and the collision is a national-scheme phenomenon.

### Floors

```
                 floor    worst observed AFTER the change
  pool             93            95   (237/250, seed 7)
  EXACT@5          22            25   (62/250, seed 20260806)
  REGIME@5         80            82   (206/250, seed 20260806)
```

**All three hold with margin, and none was lowered.** `check_recall_floor.ts`
pins its own seed and passes.

One thing the baseline itself says, worth recording because it is not this
workstream's to fix: on seed 7 the BASE pool is 93% — exactly on the floor, with
no margin at all. The change moves it to 95%.

---

## 5. What it is worth, honestly

This is a small recovery: one to two points of pool, concentrated in two
markets. Z was right that the next pool-recall win is not in the cap, and it is
not in these filters either. **The mandate's premise — that 22 unreachable funds
were capping `EXACT@5` — was true in form and wrong in size: 21 of the 22 are
correctly excluded, and the reachable gain was one fund.**

What the workstream is, is a **defect of a class this project has now hit four
times**: a rule that looked like hygiene was deleting the answer. The three
before it were the old name dedupe's `encodedCount` tie, the leaf cap binding
silently, and `channelServesBand` returning `true` while the register advertised
a filter. This one is the same shape — a display rule reaching into the universe
— and, like the scheme-repeat forty lines below it, the fix is that a rule about
PRESENTATION may not remove a fund from the POOL. It is the first of the four to
leave a test behind that fails on its own recurrence.

**The capital filter was measured and left alone.** That is the result on 21 of
the 22, and a deliberate non-change rather than an omission. What the
measurement found instead is a smaller and more permanent leak — eight funds
unreachable by any answer a founder can give — which costs zero measurable
recall and is now guarded rather than fixed, because the honest fix is upstream.

## 6. Found, not fixed

**Channel-level removal records no per-instrument rule.** Attributing across all
channels rather than SATR alone leaves 12-13 publishable instruments per market
absent from the pool with NO `ExclusionLog` event against their id — every one
an EU-wide leaf (`innovation_fund`, `chips_ju`, `edf`, `eib`) in a channel the
founder's request never selected. The pool is not wrong here; the log is silent
about an entire stage. It matters because "absent with no event recorded" is the
signature this project has now chased four times, and the next person to see it
will spend the same afternoon AE did establishing that this instance is benign.
Worth a channel-stage rule id. Not done here: it is a reporting change to a
stage this workstream did not otherwise touch.

**`check_env_loader` was red on main and is green here.** Three scripts from
other workstreams (`diagnose_region_drop`, `diagnose_region_reach`,
`measure_gate_separation`) read `DATABASE_URL`/`VOYAGE_KEY` through the import
graph and declared nothing. Because `npm run check` is a serial `&&` chain,
**every check after it had stopped running** — which on main includes
`check_recall_floor`. Fixed here only because this workstream could not
otherwise verify its own floors, and the fix is three declarations.

### The build state this branch actually leaves, stated exactly

`npm run check` does NOT go green, and none of what stops it belongs to AE. Each
was run individually against this branch and against main at `425119ed`, and
each fails **identically on both**:

```
                          this branch   main 425119ed
  check_corpus_census        FAILED        FAILED      census #6 degraded / behind (AG, AK)
  check_dependencies         FAILED        FAILED
  check_gate_pertinence      FAILED        FAILED
  check_hydration_parity     FAILED        FAILED
  check_env_loader             ok          FAILED      <- fixed here
  check_recall_floor           ok           ---        <- never reached on main
  everything else              ok            ok
```

`check_recall_floor` run directly against this branch: **pool 97% (floor 93),
exact5 30% (floor 22), regime5 86% (floor 80)**, plus both population floors —
all met, none lowered. `npx vitest run`: 241 tests, 19 files, all pass.

This is recorded rather than quietly worked around because "the build was
already red" is exactly how a real regression gets attributed to whoever merges
next.
