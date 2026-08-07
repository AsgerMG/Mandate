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

### The change: demote, never drop

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

Nothing a founder sees changes. The pool gains the fund.

`SEL-DUPE-NAME` in `rules.ts` is updated to say it demotes. A register entry
advertising a deletion the code no longer performs is the `SEL-BAND` defect
recorded in that same file.

---

## 4. What it is worth

See `## 5` for the three-seed numbers. The honest summary in advance: this is a
small recovery. Four rows across 22 markets is not the next pool-recall win
either — but it is four funds a founder qualifies for that the writer could not
have mentioned, and the rule that removed them was a display rule reaching into
the universe. Z was right that the win is not in the cap; it is not in these
filters either.

**The capital filter was measured and left alone.** That is the result on the
larger half of the 22, and it is a deliberate non-change, not an omission.

---

## 5. Measured recall, three seeds

`SEED=20260806 / 7 / 99`, `measure_recall.ts`, holdout, N=250, before and after
interleaved per seed so each pair sits inside minutes of the other on a corpus
that other agents are writing to.

<!-- RESULTS -->
