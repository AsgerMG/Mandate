# WS-AU — Spain's 88 unconverted eligibility texts

**Date** 2026-08-08 · **Branch** `workstream-au-es-gates`

## The answer in one line

The 88 rows were converted, end to end, and the conversion is sound by every
check the repo has. It buys nothing, and the reason is structural rather than a
quality problem in the encoding: **`gateFitScorer` only scores leaves inside a
multi-leaf regime, and all 88 rows are parent-less.** Their gates are never
evaluated by the ranker. Separately, **none of the 88 is ever an answer in the
recall set**, so no amount of gate quality on them can move EXACT@5.

The row-count metric moves beautifully and means nothing:

| | before | after |
|---|---|---|
| ES instruments with text | 99 | 99 |
| ... carrying any gate | 11 | **99** |
| ... carrying an encoded comparator | 11 | **76** |
| ES text with no gate ("UNUSED") | 88 | **0** |

That table is the reason this finding exists. Read alone it says the workstream
succeeded.

## Reading AT first, as instructed

WS-AT (French gates, `wsAT-fr-gates`) had **not** produced a recall measurement
when this workstream started; its two commits build the extractor and the
subject/basis invariants, and stop before the after-measurement. So the question
"did conversion move France?" was still open, and this workstream could not lean
on its answer.

What AT *did* provide was reusable machinery, and it was reused rather than
copied: `encode_scheme_text_gates.py` and `check_gate_subject.py` were
cherry-picked onto this branch and run with `--country ES`. Both were already
country-parameterised. Nothing was duplicated.

## Why the Spanish text is not the French case

The brief's warning was about BDNS boilerplate being identical across children.
Measured, that is **not** what is wrong here — and the real problem is worse.

All 88 texts are distinct (88/88). But the distinctness is in the wrong place.
The text is not scheme prose at all: it is composed by our own
`load_bdns_open_calls.compose()` out of BDNS register facets. Splitting it back
into those facets:

| facet | distinct values / 88 | mean class | could it ever be a filter? |
|---|---|---|---|
| Beneficiarios | 10 | 27.2 | yes |
| Ámbito regional | 25 | 13.2 | yes |
| Sectores elegibles | 45 | 3.2 | yes |
| Finalidad | 7 | 20.8 | no — programme fact |
| Tipo de convocatoria | 1 | 88.0 | no |
| Instrumento | 4 | 63.7 | no |
| Régimen de ayudas | 7 | 29.3 | no |
| Presupuesto total | 62 | 2.3 | no |
| Plazo de solicitud | 67 | 1.7 | no |
| Bases reguladoras | 71 | 1.6 | no |

- The **factual** facets alone are 88/88 distinct. That is where the 100% comes
  from — budget figures, deadlines, and the title of the bases reguladoras.
- The **filterable** facets jointly give 64 signatures, mean class 2.2, and that
  64 is itself inflated by the regional facet, which is subnational and cannot
  be a country rule.

And the decisive property: **0 of 88 texts contain any assertion verb** — no
`deberán`, `no serán elegibles`, `quedan excluidos`, `únicamente`,
`exclusivamente`, `requisitos`. Under AT's Property 2, which is already
mechanically enforced, a filter may be cut only from text that asserts a
restriction. This corpus asserts none.

## What the conversion actually produced

596 gate rows, 220 filters, **88 comparators on 65 of the 88 instruments**.
`check_gate_subject.py` layer 1 passes: 0 NULL `gate_role`, 0 unlabelled.

Of the 88 comparators:

- **51 (58%) are `activityCountries`/`entityCountries` `in ['Spain']`**, on
  funds whose applicants are Spanish by construction. They separate nothing.
- **36 further region gates were dropped** by the country-field guard added in
  this workstream, because their value was `ES51 - CATALUÑA`, a NUTS region in
  a field whose answers are countries.
- 29 are `sector` rules. **12 of those encode `other`, the residual bucket**,
  and 9 use `equals`, a hard single-value match: `sector equals ['other']`
  fails every founder whose sector is anything else.

Distinct comparator signatures over the 65 rows that carry one: **21**. Mean
sibling class on that signature: **15.2**.

> **Correction to the WIP commit message.** That commit said 10 sector
> comparators encoding `other` were "cut from a facet that literally says *sin
> restricción sectorial efectiva*". Checked properly: 12 encode `other`, but
> only **2 of 29** sector rules came from a `sin restricción` facet. The two
> claims were conflated. The `equals ['other']` problem is real; the "stated
> non-restriction became a rule" framing applies to 2 rows, not 10.

## The three reasons it cannot pay, in order of finality

**1. The ranker never reads these gates.** `gateFitScorer` (shortlist.ts:375)
opens with `if (group.length < 2) continue`, where the group is a regime. The 88
BDNS convocatorias are deliberately parent-less — `load_bdns_open_calls.py` says
so and is right to: they come from dozens of bodies under dozens of regulatory
bases, and inventing a parent would assert a regime that does not exist. The
consequence is that each is a group of one and is skipped. **This is not a
tuning problem. No gate on a parent-less row can ever be scored.**

**2. They are never the answer.** Of the 4,796 recall pairs, 1,118 are Spanish
and name 112 distinct answer instruments. **The intersection with the 88 is
empty.** They can appear only as distractors, so EXACT@5 and REGIME@5 for Spain
cannot rise from converting them. The only available channel is *suppressing*
them — and suppression runs through `verdict.ts`, not `gateFitScorer`.

**3. Spain's sibling problem is already solved.** `measure_sibling_by_country`
puts ES at mean class **1.2**, 78% uniquely identified on body+region+text — the
best of any large market. The 88 do not even enter that measurement, being
parent-less. Corpus-wide sibling coverage is unchanged: mean class 2.5, ceiling
@5 88%.

## What it bought, measured

`SPLIT=holdout N=300`, three seeds, before and after. Raw counts, not just
percentages, because the percentages round away the movement.

| seed | | pool | EXACT@5 | REGIME@5 | **ES** n | ES pool | ES exact5 | ES regime5 |
|---|---|---|---|---|---|---|---|---|
| 20260806 | before | 284/300 | 77/300 | 247/300 | 20 | 85% | 25% | 70% |
| 20260806 | after | 284/300 | 77/300 | 247/300 | 20 | 85% | 25% | 70% |
| 7 | before | 285/300 | 87/300 | 256/300 | 12 | 67% | 42% | 58% |
| 7 | after | 285/300 | 85/300 | 254/300 | 12 | 67% | 42% | 58% |
| 99 | before | 285/300 | 93/300 | 257/300 | 12 | 75% | 25% | 50% |
| 99 | after | 285/300 | 94/300 | 259/300 | 12 | 75% | 25% | 50% |

**Spain is bit-identical on every metric, on all three seeds.** Not "within
noise" — the same integers.

Corpus-wide across 900 replays: EXACT@5 257 → 256 (−1), REGIME@5 760 → 760 (0).

**Attribution caveat, stated because it cuts against the tidy story.** The
after-run contains *two* changes, not one: the Spanish conversion **and** the
country-gate repair, which touches nine markets. So the ±2 swings on seeds 7 and
99 belong to the repair, not to Spain. Spain's own rows moved nothing, which is
the cleaner claim and the one the table supports.

`check_recall_floor.ts` after: pool 97% (floor 93), exact5 30% (floor 22),
regime5 86% (floor 80) — **all floors met**, published as verdict #44.

**The ES stratum is too small to have detected a gain anyway**: n = 20, 12, 12.
At n=12 a 95% interval on exact5 is roughly ±25pp. Any honest Spain-specific
claim from this recall set — in either direction — would have been unsupportable.
That is a limitation of the instrument, and it applies equally to the French
numbers this workstream was asked to compare against: the "18/15/20% vs
17/15/17%" that reportedly showed no movement is well inside noise at n≈87.

## An independent reading disputes almost none of it

`check_gate_subject.py --judge --country ES` (layer 2 — the model is shown the
fund's text and the derived rule, never the label it is testing) disputed
**5 of 88, 6%**, against France's 8 of 41 (20%). **4 were quarantined.**

That low rate is itself the finding: *the rules are faithful to the text.*
Fidelity was never the problem. The problems are that the text is ours and the
rows cannot be scored. Two of the four quarantined rules are the region facet
being read as `in ['Spain']` — the judge's own words: "rule mismaps to country
Spain".

## The one thing in this text that is worth having

`Ámbito regional` is real, register-stated, and takes 25 distinct values across
the 88 — and `catchment_region`, `catchment_regions` and `delivery_region` are
**NULL on all 88**. `measure_sibling_coverage` already ranks
`catchment_regions` as a discriminator the ranker uses.

So the conversion Spain needs is **facet → `catchment_regions`**, not
text → gates, and the raw NUTS codes are already on disk in
`data/raw/bdns_open/details.jsonl`. `encode_declared_catchment.py` is the model
to follow: translate to NUTS 2024 through `nuts_names.json`, keep country-level
catchments, never write `delivery_region`. That is the route that could demote a
Catalonia-only call for a Galician founder, which is the *only* channel by which
these 88 rows can improve Spanish recall.

**Not built here** — it is a different mechanism from gate encoding and deserves
its own before/after rather than being smuggled into this one.

## A defect found on the way, and fixed

Pointing the extractor at a register that publishes subnational scope exposed a
live hole in `encode_gates.py`. `entityCountries` and `activityCountries` are
the only gated fields with no `data/vocabularies.json` entry, and the
out-of-vocabulary guard reads `if vocab and ...` — so for exactly those two
fields it never ran, and any string became a live comparator.

Measured over 371 encoded country rules in Postgres:

- `satr_gb_equity` held `entityCountries in ["East Midlands", "Eastern",
  "London", ...]` — the English **regions** of its own scheme, in a field whose
  answers are countries. A British founder answers "United Kingdom", matches
  nothing, and the fund is hidden from the only population it was written for.
- **20 rules stored a raw ISO code**: `in ["ES"]`, `["NO"]`, `["SE"]`, `["LV"]`,
  `["EE"]`. A Spanish founder answers "Spain". Those rules had never once fired.
- Also `["EEA"]`, `["European Union"]`, `["Europe"]`, `["Sub-Saharan Africa"]`,
  `["Slovak Republic"]`, `["Czech Republic"]`.

Nothing failed, because a rule that silently stops gating is indistinguishable
from one that passes.

**The property**, not the seven strings that broke: *a value stored under a
country-typed field must name a country the corpus recognises, and be stored
under the corpus's own name for it.* The test for an unseen value is
`europe_scope.name_to_iso2` reading `data/europe_scope.json`, and
`check_country_gates.ts` (now in `npm run check`) holds the **published** corpus
to that same file — one canon, both languages, restated by neither.

Direction is part of the property. A positive rule with an unresolvable value
can never be satisfied and hides its fund, so the value is dropped and the spec
quarantined if that empties it. `not_in ["Russia"]` names a real place outside
our founder population: inert, but true, and rewriting a fund's own rule to tidy
our bookkeeping would be the worse error. Those are reported and never failed.

**31 specs rewritten, 5 quarantined**, published and verified back out of
Postgres. This is a real product improvement and it is independent of Spain.

Two further traps encoded while fixing it:

- The publish keys on `(instrument_id, gate_key)`, **never on `id`**. The stores
  keep independent surrogate keys — SQLite 1..151,047, Postgres
  358,457..365,215 — so the first attempt at `UPDATE ... WHERE id = ?` matched
  zero rows and would have hit the *wrong* rows had the ranges ever met.
- `europe_scope` gained `"slovak republic": "SK"`. It is a real name variant of
  an in-scope country, and its absence had turned a true Slovak rule inert.

## A structural risk this raises, not fixed here

`encode_scheme_text_gates.py` earns the `llm_cited` tier by checking that a
gate's quote is a verbatim substring of `funding_instruments.eligibility_text`.
For these 88 rows that check is **vacuous**: `eligibility_text` was composed by
our own loader from facet codes, so the extractor is quoting us, not the fund.
`verdict.ts` reserves condemning power for cited rules — "only a rule we can
point at in the fund's own text can end the conversation" — and here the fund's
own text is our column.

`eligibility_confidence` does not catch this: it is `high` on 98 of 99 ES rows,
because `compose()` computes it from how many facets were *populated*, not from
source fidelity. Nothing in the schema records that a text was composed rather
than fetched.

**The property that is missing:** a gate may hold a citing tier only if its
quote is verifiable against text obtained from the fund's own source. Making
that testable needs a provenance marker on `eligibility_text` — declared per
source, the way a gate must declare `gate_role` — so a source that publishes
facets can never mint citable rules. Deliberately not bolted on mid-flight here:
it is a two-store schema change while several workstreams are writing, and it
deserves its own measurement.

## Rules, floors, other markets

- Floors untouched. No filter, cap or threshold was changed by this workstream.
- The country-gate repair touches 9 markets and is reported as such; its effect
  is to make rules that never fired start firing, all of them in the direction
  their own source text states.
- `check_gate_subject.py --country ES` layer 1: PASS.
- `intake_field` was never written. No `gate_role` is NULL. `name_basis` was not
  disturbed. Liveness was not re-implemented — no `notified_duration` was
  written for a convocatoria.

## Recommendation

1. **Keep** the country-field guard, the repair, and `check_country_gates.ts`.
   That is the workstream's real yield and it is market-independent: 31 rules
   that had never fired now fire, in the direction their own source states.
2. **Keep the 88 rows' gates, minus the 4 quarantined.** Retention is the
   evidence-led call, not enthusiasm: layer 2 disputes only 6%, recall is
   unchanged, and the country rules do stop a German founder being shown a
   Catalan grant. But **do not read ES coverage 11 → 99 as progress** — that
   metric counts rows, and the ranker counts siblings.
3. **Route `Ámbito regional` to `catchment_regions`** as its own workstream with
   its own before/after. It is the only part of this text with genuine unused
   discriminating power, and unlike gates it feeds a facet the ranker reads.
4. **`plan` now answers this before any money is spent** — shipped in this
   branch. It reports what fraction of the target rows `gateFitScorer` can ever
   score, using the scorer's own regime key:

       ES   SCOREABLE BY THE RANKER: 5 of 99 (5%)
       FR   SCOREABLE BY THE RANKER: 99 of 99 (100%)

   That single number is the whole difference between this workstream and AT's,
   and it was free and knowable in advance. It is a property of the ranker, not
   a note about Spain: the next register publishing standalone calls hits it too.
5. **Grow the ES recall stratum before making any Spain-specific claim.** At
   n=12–20 the instrument cannot see a real effect of plausible size.
