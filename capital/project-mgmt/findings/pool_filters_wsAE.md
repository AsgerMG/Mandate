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
DE 1    IT 1    CZ 2    the other 19 markets   0
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

The pool gains the fund and the visible order is untouched.

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
DE, IT, and the other 19 markets: table unchanged, pool +1 / +1 / 0.
```

Verified by dumping the rendered label of every visible row from both trees
against the same corpus, not by reasoning about the component. A browser render
was attempted and abandoned as theatre: `/brief/preview` renders a RECORDED
fixture, so it shows the same page before and after and proves nothing about a
change to fund selection. The label the change introduces is 165 characters; the
DE table already ships a 230-character row today and the IT table already ships
a `·` token, so the layout carries labels longer than this one before the change.

---

## 4. Measured recall, three seeds, interleaved

<!--RECALL-->

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

**`npm run check` was red on main before this branch and is now green.** Three
scripts from other workstreams (`diagnose_region_drop`, `diagnose_region_reach`,
`measure_gate_separation`) failed `check_env_loader`, and because the chain is
serial, **every check after it had stopped running — including
`check_recall_floor`**. The floors had not been evaluated on main since. Fixed
here only because this workstream could not otherwise verify its own floors.
