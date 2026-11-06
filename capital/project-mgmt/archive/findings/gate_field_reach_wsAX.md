# Workstream AX — rules encoded against answers nobody is asked for

2026-08-08. All numbers read out of Postgres (`corpus=postgres instruments=1088`),
not from a snapshot.

## The short version

We were paying to extract rules keyed to questions the intake never asks. 104 of
3,125 encoded comparators — on 95 instruments — could never be evaluated by
anyone. That is the finding the workstream was sent to get.

It is not the important one. The important one is what the inertness was hiding:

- **`region` was asked, answered, and thrown away at the door.** It has been in
  `EligibilityAnswers`, in `FIELD_ENUM_HINTS` and in the adaptive round's
  evidence path the whole time, and was never listed in `sanitizeEligibility`.
  193 `region_within` rules on 163 instruments evaluated as unanswered on every
  real request. Measured across the eight largest sibling families, **region is
  the only field whose demands differ between siblings at all.** It is the
  discriminator the ranker was missing, and it was being discarded before it
  arrived.
- **41 region rules had been filed as country rules.** `activityCountries in
  ["Spain"]` over requirement text reading *"Project must be located in Catalonia
  (ES51)"* — the NUTS code sitting in the fund's own document. Wrong field
  (nothing answers it) and wrong value (widened from a region to the whole
  country). Had anyone ever answered it, the rule would have admitted every
  Spanish founder: the exact inversion `encode_regions.py` exists to prevent,
  arriving through a field that pass does not police.
- **`foundedYear` quietly went incoherent.** Nine specs hold an AGE
  (`numeric_lte 3`, "no older than three years"), three hold a CALENDAR YEAR
  (`numeric_gte 2015`), and one reads `numeric_gte -5`. Two incompatible units in
  one numeric field, stable and unremarked — because a field nothing answers is a
  field nothing can contradict.

A rule that never fires is a rule nothing can prove wrong. Inertness is not only
waste; it is where wrongness goes to keep.

## The inventory

Every field carrying an encoded comparator, read from `value_spec->>'field'`.
`ev%` is the share of the 424,244 corpus events on instruments carrying the
field. `sib` is how many of those instruments have a sibling — `gateFitScorer`
and `regionScorer` both open with `if (group.length < 2) continue`, so a rule on
a parent-less row is never seen by the within-family ranker.

| field | specs | insts | ev% | sib | reach | classification |
|---|---:|---:|---:|---:|---|---|
| exclusionFlags | 678 | 626 | 77.2 | 594 | adaptive | reachable |
| activities | 611 | 598 | 65.9 | 576 | adaptive | reachable |
| entityCountries | 332 | 255 | 62.3 | 56 | first page | reachable |
| region | 193 | 163 | 8.8 | 158 | adaptive | **asked, then discarded — FIXED** |
| lossesOverHalfCapital | 153 | 125 | 47.8 | 39 | derived | reachable |
| fteBand | 147 | 112 | 37.5 | 32 | first page | reachable |
| useOfFunds | 138 | 123 | 20.0 | 33 | first page | reachable |
| borrowerModel | 99 | 94 | 21.0 | 13 | constant | reachable, always the same answer |
| activityCountries | 86 | 80 | 17.1 | 23 | none | **41 re-filed, 45 retracted** |
| consortium | 83 | 54 | 28.0 | 41 | adaptive | reachable |
| sector | 76 | 66 | 7.4 | 24 | first page | reachable |
| developmentStage | 63 | 42 | 9.3 | 25 | first page | reachable |
| ticketBand | 44 | 39 | 13.7 | 15 | first page | reachable |
| cofinancingBand | 39 | 32 | 13.5 | 17 | adaptive | reachable |
| turnoverBand | 25 | 23 | 2.5 | 5 | adaptive | reachable |
| nonEuControl | 17 | 14 | 13.5 | 11 | adaptive | reachable |
| foundedYear | 17 | 15 | 3.0 | 9 | none | **retracted** |
| ownerOver25 | 14 | 14 | 8.9 | 8 | adaptive | reachable |
| institutionalBacking | 12 | 11 | 0.4 | 2 | adaptive | reachable |
| bankRelationship | 8 | 7 | 0.2 | 0 | adaptive | reachable, never scoreable |
| conditionality | 7 | 7 | 0.7 | 6 | adaptive | reachable |
| wouldOpenEntity | 4 | 4 | 0.6 | 2 | adaptive | reachable |
| balanceBand | 4 | 3 | 0.1 | 0 | adaptive | reachable, never scoreable |
| institutionalOwner | 2 | 2 | 0.2 | 0 | adaptive | reachable, never scoreable |
| needBy | 2 | 2 | 0.6 | 1 | adaptive | reachable |
| inExclusionConditions | 1 | 1 | 1.4 | 1 | — | **not a field at all — retracted** |

270 further comparators are `aid_intensity`, which carries no field: statutory
arithmetic about a ceiling, not a question put to a founder. Out of scope by
construction.

## The three classifications, as asked

**1. The intake should ask it.** Nothing landed here, and that is the result
rather than an absence of one — see "What the ADEME family actually says" below.

**2. Answerable from something we already hold.** `activityCountries`, 41 of 86.
The fund had already written the NUTS code down; we widened it to the country and
filed it under a field nobody answers. Re-filed deterministically to `region`,
which the intake does ask and the evaluator does support. No model call, no
judgement: the id is accepted only when it is a real NUTS id belonging to the
instrument's own country.

**3. Cannot be answered; encoding it is waste.** 64 specs retracted.

- `activityCountries`, the remaining 45. 79 of the original 84 `in` rules demand
  exactly the fund's own country — and `selectLeafInstruments` already filters
  the pool by `instrumentServesCountry`, so a French founder never sees a Latvian
  fund in the first place. The rule restates a constraint the pool has already
  applied and can eliminate nobody. The five exceptions are Innovation Fund
  rules demanding the project sit in the EU/EEA, which is true of essentially
  every founder in a European corpus.
- `foundedYear`, all 17 — see the unit incoherence above. Company age is a real
  and common eligibility criterion, so this one is a candidate to come back; it
  must be re-encoded to ONE unit first, and today's specs cannot be trusted.
- `inExclusionConditions`, 1. The triage model invented the name.

Retraction is **quarantine, never deletion**: `value_spec` is nulled,
`encoding_method` becomes `quarantined`, and the requirement, quote and locator
are untouched — they are what the fund's document says and Rule Zero has not
changed. Every retracted comparator was returning null for every founder, so
nothing a founder sees moved. The pre-state is in
`gate_field_reach_wsAX_before.json`, keyed by gate id.

## The guard

`website/frontend/scripts/check_gate_field_reach.ts`, wired into `npm run check`
after `check_country_gates`. FREE — one Postgres read.

> **A rule may only be encoded against a field some answer can reach:** a real key
> of `EligibilityAnswers`, with a declared answer path, whose value survives
> `sanitizeEligibility` into the evaluator.

The field list is **read from the corpus**, never enumerated, so a field
tomorrow's extraction run invents is in scope the moment it is written.
Reachability comes from `FIELD_REACH` in `types.ts` — keyed on `keyof
EligibilityAnswers`, so the compiler refuses a new intake field until someone has
said how it gets answered, the same enforcement `FIELD_SEVERITY` already uses.

A declaration is a claim, so the check proves it rather than trusting it:
`via: "adaptive"` must correspond to a real `FIELD_ENUM_HINTS` entry (the only
table the grounded round can pick from), and every path must survive the
sanitiser.

**It fails on a field it cannot probe, rather than skipping it.**
`check_vocabularies.ts` already probes the sanitiser and opens with
`if (!vocab.values.length) continue` — and the fields with no enumerable value
list are `entityCountries`, `activityCountries` and `region`, which is to say the
skip covered exactly the fields that have broken three times now. An unprobeable
field is an unproven field, and the two must not be the same colour.

`via: "constant"` (`borrowerModel`, pinned to `"operating"`) is reported and
never failed. Those rules evaluate; they just always evaluate the same way. That
is a decision about who the tool serves, and it should be visible as one.

### Closed at the write side too

A check catches it after we have paid. `FIELD_REACH` is now projected into
`data/vocabularies.json` as `fieldReach` / `encodableFields`, and
`encode_gates.py` derives `FIELDS` from it, refusing an unreachable field at both
writes — triage, which chooses the field, and encode, which builds the
comparator. A rule keyed to a question nobody is asked can no longer be written.

That also killed three hand-copied `INTAKE_FIELDS` lists (`encode_gates`,
`classify_gates_bulk`, `extract_terms`), which had **already drifted**: two of the
three still lacked `sector`, `exclusionFlags`, `activities` and `useOfFunds`
months after those were added, so two of the three extraction passes were hunting
for a smaller world than the encoder could store.

## What the ADEME family actually says

The brief framed this as a cardinality problem: we ask a sector question with 11
values and try to separate 76 ADEME funds. A discriminator cannot resolve a
choice of larger cardinality than itself — true, and not the binding constraint
here.

    ademe_aid, 76 leaves
      57 of 76 carry NO encoded comparator at all
      19 carry any
       9 carry a sector rule (7 distinct demands)
      15 distinct gate signatures across all 76

A finer sector question cannot separate ADEME. Even at 94 subsector values, 57 of
the 76 would still carry identical (empty) rules and remain one undifferentiated
block. **The ceiling is the ENCODING, not the question.** Same shape elsewhere:

| regime | leaves | distinct gate signatures | what varies |
|---|---:|---:|---|
| satr_de_rnd | 103 | 16 | region 14 specs / 35 leaves; exclusionFlags 2/103 |
| bdns_es_ayudas | 88 | 2 | almost nothing |
| ademe_aid | 76 | 15 | sector 7/9; region 3/5 |
| satr_it_rnd | 68 | 9 | region 9/12 |
| vinnova_grant | 50 | 1 | nothing at all |
| satr_fr_rnd | 43 | 8 | region 6/8 |
| satr_nl_rnd | 28 | 8 | region 7/6 |

Region is the discriminator in five of seven. `exclusionFlags` and `activities` —
the two most-encoded fields in the corpus, 1,289 comparators between them — are
IDENTICAL across every leaf of the families they cover. Every fund wants a
founder not in crisis and not under a recovery order. Asking eliminates nobody.

## Measured effect

Recall floors after the corpus change (`check_recall_floor`, 300 tune pairs, seed
20260806): **pool 97% (floor 93), EXACT@5 30% (floor 22), REGIME@5 86% (floor
80).** Nothing lowered, all met with headroom.

Those floors do not answer region — it is opt-in in the harness — so they show
the re-file and the retraction cost nothing, and nothing more. For the region
signal itself, `measure_recall` at N=250, holdout, seed 20260806:

    without region answers   pool 96%   EXACT@5 26%   REGIME@5 84%
    REGION=strict            pool 95%   EXACT@5 33%   REGIME@5 83%

**+7pp on EXACT@5**, the metric with the 95%-in-top-5 target.

**Caveat, stated because it matters:** `REGION=strict` also changes which pairs
are drawn (it selects pairs with a leak-free region), so this is two draws rather
than a clean A/B on one population. The direction and size are unambiguous; the
precise number is not. A clean measurement needs a harness flag that supplies or
withholds region over a FIXED population, which does not exist yet.

## Coordination with AW

`gateFitScorer` and `regionScorer` both skip groups of one. The 41 re-filed rules
sit on `bdns_conv_*` rows, which are parent-less standalone calls — AW's subject
— so **they are not seen by the within-family ranker.** They are not wasted: the
deterministic verdict path is per-instrument and not sibling-gated, so a Madrid
founder now correctly reads a Catalonia-only scheme as one they do not meet,
instead of "not assessable".

This is a concrete data point for AW's question. Before this workstream those 41
rules were inert on both paths. They are now live on the verdict path and still
dark on the ranker, and the gap is exactly the group-of-one rule.

## Two decisions for the PM

Both are about what founders get asked, so neither was taken here.

**1. Company age.** 15 instruments, 3.0% of corpus events, currently retracted.
It is a real statutory category ("young innovative enterprise", GBER Art. 22
start-up aid) and the rules are genuinely about it. It is one question with an
obvious answer a founder always knows. Against: 3% of events is thin, it would
compete for one of six adaptive slots, and the 17 existing specs must be
re-encoded to a single unit before any of them can be trusted. Recommendation:
worth asking, but only after re-encoding; not urgent.

**2. Where the funded work will physically happen.** Retracted as waste on
today's corpus, because the pool's country filter already enforces it. It becomes
a real question only for the founder whose activity sits outside their own
country — a thin but real population we currently serve wrongly by assumption.
Recommendation: do not ask. Revisit if the corpus gains cross-border schemes
where project location and entity location genuinely diverge.

The question the evidence does support asking is neither of these: it is
**region**, which the intake already asks, already had 193 rules waiting for it,
and was silently discarding. That is now fixed rather than proposed.

## Out of scope, found on the way

`main` at `e760f555` had committed **unresolved merge conflict markers** in three
`ETL/terms` Python files. All three were a `SyntaxError`, so the gate encoder,
the scheme-text encoder and the gate-subject check had been unrunnable since that
merge. Nothing reported it: `npm run check` is TypeScript, and these are invoked
by hand from the Makefile. Resolved as the merge commit said it intended — the
union, not a side. Details in the commit.
