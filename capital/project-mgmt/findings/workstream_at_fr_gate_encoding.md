# WS-AT — the French text is now rules, and the rules do not rank

2026-08-08. Branch `workstream-at-fr-gates`. All figures read out of Postgres.

## What was asked, and the answer

Convert the eligibility prose 75 French funds carry but the ranker cannot read,
and measure what it buys.

**It buys separability, not accuracy.** The conversion worked: the gap closed
completely and French gate fit can now vary across siblings for 96% of replayed
founders instead of 32%. French EXACT@5 did not move — 17/15/18% before,
17/14/18% after, on the same three seeds and the same 300-row samples. Nothing
else moved either, so it is not a trade.

The reason is measurable and it is not an encoding failure. Inside the ADEME
regime, the leaf a company actually won passes its own encoded rules 50% of the
time; its 74 siblings pass theirs 49%. **A one-point difference cannot choose
between 75 doors.**

## The gap, before and after (Postgres, country=FR)

| | before | after |
|---|---|---|
| instruments with eligibility text | 99 | 99 |
| ...carrying any gate | 24 | 99 |
| ...carrying an encoded rule | 24 | 49 |
| **text but no gate at all** | **75** | **0** |

All 75 were children of one regime, `ademe_aid`. `mergeInheritedGates` gives
every child its parent's rules, so before this every ADEME leaf assessed
identically, `gateFitScorer` saw `hi === lo` and returned neutral for the whole
regime — the structural ceiling its own docstring names. The leaves publish 57
distinct texts between them, so the ceiling was breakable here.

358 gate rows written, at `llm_cited` with a verbatim quote checked
mechanically against the instrument's own text (2 rejected as non-verbatim, 0
with a NULL `gate_role`). 133 are filters; 30 carry a comparator after three
independent checks removed the rest.

## What the encoding actually changed

`measure_gate_separation.ts ANSWERS=real`, France, within-regime top-1:

| | before | after |
|---|---|---|
| pairs where gate fit CAN separate siblings | 215/675 (32%) | 646/675 (96%) |
| top-1 by gate fit | 4.2% | 3.8% |
| uniform baseline | 4.0% | 4.0% |
| lift | +0.2pp | **−0.2pp** |

Germany, unchanged by this work, is the contrast: 15.1% against a 2.9% uniform
baseline, +12.2pp. France now has as much separability as Germany and none of
the signal.

`measure_recall.ts SPLIT=holdout N=300`, EXACT@5 by founder country. The before
arm is the same corpus with these 30 comparators parked in Postgres and
restored from SQLite afterwards, so the difference is this change and not a
week of other people's publishes:

| seed | | FR | DE | SE | IT | NL | ES | GB | ALL |
|---|---|---|---|---|---|---|---|---|---|
| 20260806 | before | 17 | 28 | 25 | 24 | 45 | 25 | 28 | 26 |
| | after | 17 | 28 | 25 | 24 | 45 | 25 | 28 | 26 |
| 7 | before | 15 | 32 | 26 | 31 | 48 | 42 | 53 | 29 |
| | after | 14 | 32 | 26 | 31 | 48 | 42 | 53 | 29 |
| 99 | before | 18 | 31 | 41 | 41 | 50 | 25 | 33 | 31 |
| | after | 18 | 31 | 41 | 41 | 50 | 25 | 33 | 31 |

Floors held on every run: pool 95/95/95 (floor 93), EXACT@5 26/29/31 (floor
22), REGIME@5 82/85/86 (floor 80). Corpus sibling coverage is unchanged at mean
class 2.8 and an 88% @5 ceiling, by construction — `measure_sibling_coverage.ts`
reads instrument columns, not gates, and no column changed. French
`eligibility_text` coverage stands at 99/133 (74%).

## Why it does not rank, stated as arithmetic

The ADEME regime is 75 leaves and the holdout answers are spread almost evenly
across all of them, about 7 pairs each. What separates those leaves is the
TECHNOLOGY a call funds: biomass heat, plastic regeneration, cycle tourism,
forestry mechanisation, packaging reuse. The intake has no field for that. The
closest is `sector`, which has **11 values for a 75-leaf regime**, and ten of
the thirty comparators are on it.

A discriminator cannot resolve a choice of larger cardinality than itself. The
won leaf is top of its regime by gate fit on 23 of 534 pairs, and 20 of those 23
are ties with at least one sibling — three genuine unique wins against a uniform
expectation of seven.

**The missing thing is a QUESTION, not a rule.** This is the same evidence class
as the 485 filters no current question can decide, and it now has a specific
shape: the field that would pay is what the funded work IS about, at a grain
finer than eleven sectors. That is a decision for the intake, not for the
encoder, and it is the honest next step for French EXACT@5.

Two further gaps the run exposed, both cheap to close and both currently costing
measured coverage:

* `activityCountries` is encoded on 9 rules and the recall harness never answers
  it, so those rules are unevaluable in every measurement above. The product
  does ask it (adaptive round); the harness does not.
* `region` carries 5 rules and is answered only under `REGION=`/`ANSWERS=`.
* `developmentStage` is encoded on 1 rule and is not in the harness answer set
  at all.

Half the comparators this workstream produced are invisible to the number it
was asked to move.

## The two collection traps, as properties with a test

Both were handed over as facts about particular rows. Neither is stored that
way: `ETL/terms/check_gate_subject.py` states each as a property and tests it,
so it holds for text nobody has read yet.

**1. The eligible applicant is the entity that SUBMITS.** "Accompagnement des
agriculteurs" makes *organismes de conseil* eligible and then requires the
*bénéficiaire final* to be an agricultural PME; an exploitant agricole cannot
apply. "PACTE Entreprises" is an AMI for *structures relais* whose audience is
PMEs. Encoding either on "agriculteur" or "PME" would route exactly the founder
who cannot apply to a fund the brief would show as open.

Mechanically: the extractor labels every gate's `subject`, and a subject of
`final_beneficiary` or `fund` can never become a filter whatever role the model
asked for. Verified in the data — of 358 French rows, 5 are final-beneficiary
clauses and none is a filter; the applicant rules on both schemes resolve to a
field we do not ask, so they narrow nothing rather than narrowing wrongly.

**2. An enumeration is not an exclusion.** The test is stated so it survives a
new catalogue: strike the list out of the sentence and ask whether what remains
still says anyone outside it may not apply. If the only evidence is the list's
contents, it is an enumeration. Of 358 rows, 100 are labelled
`enumeration_only`, and none of them gates anyone — including "Bénéficiaires :
Commune, Intercommunalité / Pays, Département…" on the collectivité-facing
catalogue, whose missing "entreprise" row is a hole in their taxonomy. Where a
scheme really does exclude companies, AVELO says so in prose and that reads as
`stated_requirement`.

**Aliases.** 75 rows carry 57 distinct texts. Work is keyed on the normalised
text, so ORPLAST 3 (×2), ESPR Volet 2 (×2), the three ORMAT vintages, three
géothermie studies, three heavy-vehicle rows and eight other pairs were read
once and written to every alias. The four AVELO rows are four genuinely
different texts and got four readings; all four agree that the applicant is a
collectivité, and none of them gates, because the intake has no way to say
"public body".

## Three defects found, all the same shape

Each is a comparator the engine parses and can never satisfy, which is worse
than no rule: a failing cited structural rule is conclusive, so the fund is
dropped from the founder's brief entirely.

1. **A country field holding a region.** `activityCountries in
   ["Provence-Alpes-Côte d'Azur", "Pays de la Loire", …]` — a French founder
   answering France FAILS a rule written to admit them. Country fields are free
   text so `encode_gates`'s vocabulary check could not see them. Now guarded:
   `subnational_names()` in `ETL/lib/nuts_regions.py`, read by the encoder that
   refuses and by the check that asserts, so the two cannot drift. A naive read
   of the NUTS file calls Ireland, Luxembourg, Malta and Liechtenstein
   sub-national — they are single-region states — so anything `name_to_iso2`
   resolves is excluded. Corpus-wide: 2,845 encoded filters, 4 violations, all
   French, all repaired.
2. **`verify_encodings.py --fix` breaking region rules.** `spec_to_english` has
   no rendering for `region_within`, so it reports every regional rule as
   "unsupported" and re-encoded one onto `in` over region NAMES. That pass is
   now out of scope for the region field, which `encode_regions.py` owns.
3. **Eight rules quarantined by the independent second reading**, six of them
   geographic scope taken from a catalogue facet code (`PAYS-99100`) rather than
   asserted prose, and one an SME cap cut from text that says *tout type
   d'acteurs*. The regime's own France rule already covers those leaves, so the
   quarantine costs nothing.

`verify_encodings.py --country FR` agreed with 73% of French encodings, fixed 11
and dropped 5.

## Two things worth knowing about the measurement itself

* **Gate hydration degrades silently.** One run logged
  `hydration_degraded: timeout expired` — a 2,000 ms *connection* timeout, not a
  query timeout; the query itself takes 30-40 ms and connects run 151 ms at p50.
  When it fires, that founder's verdicts become `unknown` and the run reports a
  clean number measured on a system with no gates in it. Any future claim about
  gate work must check for that line.
* **The judge is not deterministic.** Two runs of the layer-2 reading on the
  same 41 rules disputed 4 and 8. It fails safe — the direction is always
  toward quarantine — but a single run is not a measurement.

## Ships

* `ETL/terms/encode_scheme_text_gates.py` — new. Cuts gates from
  `eligibility_text`, keyed on the normalised text so one call is read once.
  Now a step in `make eligibility`, so text a fetch lands is converted rather
  than stranded. 48 instruments across other markets are still waiting for it.
* `ETL/terms/check_gate_subject.py` — new. The two properties plus the
  corpus-wide spec-geography invariant. Layer 1 is free and is a `make
  eligibility` step that FAILS the target.
* `ETL/lib/nuts_regions.py` — `subnational_names()` / `is_subnational()`.
* `encode_gates.py`, `encode_regions.py`, `verify_encodings.py` — `--country`,
  so a workstream can encode and verify the market it is measuring without
  paying for, and silently moving, every other one inside its own before/after.

## What NOT to do next

Do not encode more French text expecting EXACT@5 to move. The 47 remaining
French leaves without a comparator would add separability of exactly the kind
just measured to be signal-free. The binding constraint is the cardinality of
the intake, not the coverage of the corpus.
