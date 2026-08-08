# Workstream AE — what removes the 22 a German founder never sees

Workstream Z raised `POOL_LEAVES_PER_CHANNEL` 90 → 250 and measured that a
German founder gets **81 of 103 publishable SATR leaves at every cap from 90
upward**. The other 22 die before the cap is consulted. Z named the two
suspects — the capital filters and the one-row-per-institution-name dedupe —
and said the next pool-recall win was not in the cap.

This is the attribution, per instrument, from `ExclusionLog` rather than from
reading the code.

All figures below were read from **Postgres, 1,084 instruments, 814
publishable**, between 17:22 and 17:31 UTC on 2026-08-07. Every run asserts
`requireLiveCorpus` and prints its corpus.

---

## 1. The breakdown of the 22

`scripts/diagnose_pool_filters.ts` (new) replays one founder and attributes
every publishable, country-reachable leaf missing from
`candidateInstrumentIds` to the rule recorded against **its own id**. Z's
probe counted rules across the whole request, which cannot say which of the 22
died to what: `SEL-CAPITAL` fires 45 times for a German founder and only some
of those are SATR leaves.

```
DE/state_aid_satr: publishable=103 in pool=81 missing=22
     21  SEL-CAPITAL
      1  SEL-DUPE-NAME
```

**There is no third cause and nothing unattributed.** The split is 21/1, not a
mixture.

### The 21 — every one of them a tax credit

All 21 carry `capital_type = tax_credit`, and they are three notified schemes,
not 21 funds:

| notified scheme | leaves | what it is |
|---|---|---|
| SA.56245 | 18 | German R&D research allowance, delivered by 18 different tax offices |
| SA.114724 | 2 | the same allowance under a second notification |
| SA.103196 | 1 | a CHP surcharge reduction |

The removing rule is `instrumentServesCapital`, and the harness replays every
pair with `capitalSought: ["grant", "loan"]`.

### The 1 — a title collision, not a sibling

`satr_de_rnd__sa_112200__nbank`, removed because another row publishes under
the identical title.

---

## 2. The capital filter is CORRECT. No change.

The intake offers five capital options and `tax_credit` — "Tax credits &
reliefs" — is one of them. A founder who ticked Grants and Loans and did not
tick Tax credits is not being denied anything: they said they did not want a
tax credit, and the filter withheld tax credits. This is a filter on a
recorded fact about the instrument against a stated preference of the founder,
which is the shape of rule this project keeps and not the shape it replaces.

**The 22 are not a product defect. 21 of them are the product working.**

What the finding really exposes is a **measurement** property, and it is worth
recording because it has the same shape as the closed-scheme clamp workstream T
found — a ceiling that reads as a retrieval failure:

`measure_recall.ts` and `check_recall_floor.ts` both pass the same fixed
`capitalSought: ["grant","loan"]` for every replayed pair, so any pair whose won
fund is not a grant or a loan is unreachable by the founder's own stated
preference before ranking is consulted. `scripts/census_capital_reach.ts` (new)
prices it:

```
tune    1581 gradable   grant 94.5%  loan 4.6%  tax_credit 0.9%
        CEILING on pool imposed by capitalSought=[grant,loan]: 99.1%
holdout 2207 gradable   grant 94.8%  loan 4.1%  tax_credit 1.0%  equity 0.1%
        CEILING: 98.9%
```

So the constant costs about **one point of pool, permanently and invisibly**.
It is NOT changed here, for two reasons. It is uniform across every pair, which
is what makes it leak-free — the same argument that pins `useOfFunds` — and
widening it would move the population the floors in `check_recall_floor.ts` were
calibrated on, which is a separate decision from this workstream's. Recorded so
that nobody again attributes that point to the ranker.

### The one real capital defect: our encoding, not the fund's rule

The brief asked whether a fund is being cut by a mismatch that is our encoding.
One is, and it is not the 21.

Nine publishable instruments carry `capital_type = "unknown"`. **No intake
option maps to that value**, so `instrumentServesCapital` removes all nine from
the pool of every founder in every country, whatever they tick — five options
or one. The founder expressed no preference against them; we have no fact, and
the filter reads our silence as their refusal.

```
eit_climate_kic_asa, eit_climate_kic_cdr, eit_climate_kic_clean_cities_spain,
eit_digital_champions, eit_digital_vap, eit_food_rfs, eit_health_catapult,
eit_rawmaterials_portfolio          [eit/EU]
fr_relance_industrie                [national_dev_banks/FR]  2,835 awards
```

Confirmed live in every one of 22 countries replayed.

**Not fixed here, deliberately.** The honest fix is upstream: record the
capital type where the fund's own documents can settle it. Guessing in the
filter would be worse than the bug — three EIT vehicles that ARE typed carry
`equity`, and two of the untyped ones are named "portfolio" and "investments",
so admitting `unknown` to a grant-seeker's pool could put a cap-table investor
in front of someone who never asked for one. That is precisely what
`passesCapitalPreference` exists to prevent, and this project has already
shipped that failure once.

What is shipped instead is `scripts/check_capital_reach.ts`, in `npm run check`,
which states the property and ratchets the gap:

> Every `capital_type` carried by a publishable instrument must be reachable by
> at least one intake option. Absence of a recorded fact is not a mismatch.

Deliberately not "no instrument may carry `unknown`". A source that introduces
`mezzanine` or `convertible` tomorrow fails the same check without anybody
having thought of the word in advance. Ceiling 9; fixing the data lowers it and
the check says so; a rise fails the build.

These nine cost **zero measurable recall** — no answer key row names an
`unknown`-typed fund. They cost those funds their reach, which the recall
number cannot see. That is the whole reason the guard is a guard and not a
metric.

---

## 3. The dedupe is nearly dead, and what survives is a different rule

The dedupe collapses rows sharing a display label, keeping the one carrying
more of its own encoded gates. Measured, one founder per country, 22 markets:

```
DE 1    IT 1    CZ 2    the other 19 markets   0
```

Four rows in total. `distinguishRowNames` runs first and now separates almost
everything, because `administering_body` separates siblings in the
body-fragmented countries — DE's mean same-name class fell 91.8 → 4.2. The
dedupe is doing far less than the comment above it describes.

**What it still catches is not what it was written for.** The four survivors
are not two leaves of one fund; they are **distinct notified schemes sharing a
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

There is a mechanical reason these four slip through, and it is worth stating
because it will recur. `distinguishRowNames` groups rows by
`displayInstitutionName(r)`; the dedupe keys on `row.instrument ||
displayInstitutionName(row)`. **Two functions, two keys.** For these rows the
derived name differs (it embeds the scheme code) while the published title is
shared, so the disambiguator sees no collision to resolve and the dedupe then
collapses on a key the disambiguator never examined.

### The root cause: two functions, two keys

`distinguishRowNames` grouped rows by `displayInstitutionName(r)`. The dedupe
keyed on `row.instrument || displayInstitutionName(row)`. For a row carrying a
real published title the two differ — the derived name embeds the notified
scheme code and therefore *separates* the twins — so the disambiguator saw no
collision to resolve, and the dedupe then collapsed the pair on a key the
disambiguator had never examined. The comment above the dedupe already said
"key on the DISTINGUISHED label"; the disambiguator itself had not been changed
to match.

Sharing the key fixes it at the source. **`SEL-DUPE-NAME` now fires ZERO times
across all 22 markets**, and CZ SA.63670 is visible at rank 5 rather than
erased.

A scheme-code token branch was written alongside this and **removed**: measured
across 22 markets it produced a token zero times, because the granting body
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

`SEL-DUPE-NAME` in `rules.ts` is updated to say it demotes. A register entry
advertising a deletion the code no longer performs is the `SEL-BAND` defect
recorded in that same file.

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
change to fund selection. The label the change introduces is 165 characters;
the DE table already ships a 230-character row today and the IT table already
ships a `·` token, so the layout carries labels longer than this one before the
change.

---

## 4. Measured recall, three seeds

`measure_recall.ts`, holdout, N=250, `SEED=20260806 / 7 / 99`, before and final
interleaved per seed. **Postgres, 1,084 instruments on every one of the nine
runs**, 17:33 → 18:21 UTC on 2026-08-07, so the corpus other agents are writing
to did not move underneath the comparison.

```
                    seed 20260806        seed 7          seed 99
  in pool           96% -> 97%        96% -> 97%       97% -> 98%
                    239 -> 242/250    241 -> 242/250   242 -> 244/250
  EXACT@5           29% -> 29%        34% -> 34%       30% -> 30%
  REGIME@5          84% -> 84%        86% -> 86%       85% -> 85%
```

**Pool up on all three seeds, never down. EXACT@5 and REGIME@5 identical to the
case on all three** — which is the change doing exactly what it claims: it adds
to the universe and does not reorder what a founder sees.

### By regime-size stratum — the overfitting axis

```
                        seed 20260806      seed 7        seed 99
  regime 1 (alone)      100 -> 100      100 -> 100     100 -> 100
  regime 2-5             88 -> 88       100 -> 100      78 -> 78
  regime 6-20            93 -> 93        76 -> 76       87 -> 87
  regime 21-50          100 -> 100      100 -> 100     100 -> 100
  regime 51+             95 -> 97 +      97 -> 98 +     98 -> 100 +
```

The entire gain is in `regime 51+`, and that is the prediction the mechanism
makes rather than a result to be explained after the fact: a title collision
requires two schemes publishing under one name, which only happens in the
crowded national regimes. **No stratum loses on any seed** — including the
founder whose fund stands nearly alone, the one an overfitted change abandons.

### By founder country — the axis a per-country filter hides behind

```
                        seed 20260806      seed 7        seed 99
  IT   (n=25/28/22)      92 -> 100 +     93 -> 96 +     95 -> 100 +
  DE   (n=54/51/46)      89 -> 91  +     90 -> 90       96 -> 98  +
  FR, SE, NL, GB, ES, EE, DK              unchanged on every seed
```

It bites DE, as Z predicted, and IT harder still. **It costs nothing anywhere.**

### By population

```
  mode=profile          96 -> 98        98 -> 98       99 -> 100
  mode=project          93 -> 93        92 -> 92       91 -> 91
  original join         92 -> 94        93 -> 94       93 -> 95
  traced                100 -> 100      100 -> 100     100 -> 100
```

`original join` — the smaller, older population the floors keep a wide margin
for, and the one a change is most likely to trade away — **gains on all three
seeds**. `mode=project` is unchanged because project pairs are EU programmes and
the collision is a national-scheme phenomenon.

**Floors are untouched.** Pool 93 / EXACT@5 22 / REGIME@5 80 all still hold with
more headroom than before; another workstream is raising them and nothing here
pre-empts that.

---

## 5. What it is worth, honestly

This is a small recovery: one to two points of pool, concentrated in two
markets. Z was right that the next pool-recall win is not in the cap, and it is
not in these filters either.

What it is, is a **defect of a class this project has now hit four times**: a
rule that looked like hygiene was deleting the answer. The three before it were
the old name dedupe's `encodedCount` tie, the leaf cap binding silently, and
`channelServesBand` returning `true` while the register advertised a filter.
This one is the same shape — a display rule reaching into the universe — and,
like the scheme-repeat forty lines below it, the fix is that a rule about
PRESENTATION may not remove a fund from the POOL.

**The capital filter was measured and left alone.** That is the result on 21 of
the 22, and a deliberate non-change rather than an omission. What the
measurement found instead is a smaller and more permanent leak — nine funds
unreachable by any answer a founder can give — which costs zero measurable
recall and is now guarded rather than fixed, because the honest fix is upstream.
