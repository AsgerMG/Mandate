# The intake architecture: what drives screen one and the adaptive round

Written 2026-08-05 from reading the code and measuring it, not from the
docstrings. Every claim below is either a file:function reference or a number
from a harness in the repo.

Companion documents:
- `screen_one_discrimination_plan.md` — why exact-scheme recall sits at 23%,
  and the four levers measured against it
- `scheme_text_corpus_plan.md` — the corpus enrichment that fed the gates
  these screens read

---

## 1. The funnel, end to end

```
  screen one  ──►  candidate pool  ──►  adaptive round  ──►  five rows  ──►  memo
  (fixed 6)        (~57 funds)         (6 fields +           (ease            (writer)
                                        5 gate qs)          re-rank)
```

| Stage | Code | Model call? |
|---|---|---|
| Screen one | `FIRST_PAGE_FIELDS`, `gateReach.ts:32` | no |
| Pool build + rank | `shortlist.ts` `selectInstrumentRows` / `materialiseInstrumentTable` | no (semantic optional) |
| Adaptive field pick | `gateReach.ts` `openFieldsForShortlist` | **no — deterministic** |
| Adaptive gate pick | `gateReach.ts` `openProjectGatesForShortlist` | **no — deterministic** |
| Question phrasing | `adaptiveRound.ts` `planAdaptiveScreen` | yes |
| Ease re-rank | `ease.ts` `scoreEase` | no |
| Brief | `pipeline.ts` `synthesize` | yes |

**The important consequence:** the model only PHRASES the adaptive questions.
Which fields and which gates get asked is decided by deterministic code. So the
discriminating behaviour of the funnel can be measured for free —
`scripts/measure_funnel_recall.ts` does exactly this.

---

## 2. Screen one

Six fixed fields (`gateReach.ts:32`):

```
entityCountries · sector · useOfFunds · fteBand · ticketBand · developmentStage
```

`useOfFunds` is on this list deliberately: it decides 58 filters, more than any
other single field, and demoting it starved it to 2 founders in 12.

**What screen one produces:** a pool averaging **57 funds**, with the won fund
present 94-98% of the time. Pool recall is not the problem.

**What ranks those 57 into five** (`shortlist.ts` `rowRelevance`):

```
rowRelevance = wTheme · themeRelevance(description) + (1 - wTheme) · sectorFit(sectorMix)
```

then sorted behind two hard tiers: `usedInField` (proven in the founder's
field), then a demotion for non-startup-ready capital.

**Gate assessment is NOT part of this.** `assessAll` is imported by
`pipeline.ts` and called at line 777 — inside `synthesize()`, i.e. the brief
path, AFTER the table exists. `shortlist.ts` contains zero references to it.
So screen-one ranking never consults whether a fund's own published rules match
the founder's answers.

That sounds like an obvious gap and it was measured before acting on it:

```
                  gates checked   pass rate   conclusively failed
WON fund              3.0            62%              0
POOL average          3.2            63%          0 of 2,666
```

The won fund is statistically indistinguishable from the pool, and **no
assessment ever conclusively fails**. Ranking on gate-fit would add noise.
Two reasons, and the second is structural: gates rarely resolve to `not_met`,
and the recall set carries no per-company intake attributes, so every replay
feeds an identical eligibility profile.

---

## 3. The adaptive round

Two independent halves, and conflating them caused a real measurement error
in this project's own harness.

### 3a. Open FIELDS — structured enum questions

`openFieldsForShortlist(instrumentIds, answers)`. Eligible if the field:
- is in `FIELD_ENUM_HINTS` (a real fixed answer set exists),
- is **not** on screen one,
- is not already answered,
- is backed by at least one triaged `filter` gate on a fund still in the running,
- has non-empty `optionsFor(answers)` where options are derived (this is what
  gates `region` behind knowing the country),
- is not already `coveredBy` another field's question.

Answers here flow into `eligibility` and therefore into gate assessment.

### 3b. Open project GATES — verbatim requirement questions

`openProjectGatesForShortlist(..., { limit: 5 })`. Produces up to five
questions quoting a fund's own requirement text. Answers become
`projectAnswers`, which `scoreEase` credits per `instrumentId::gateKey`.

### 3c. Ranking: the finding that mattered

Both halves are capped — six field slots, five gate slots — so ORDER decides
everything. Until 2026-08-05 `openFieldsForShortlist` sorted on `reachPct`
alone: the share of the shortlist's `eventCount` gated on that field.

Measured across 25 holdout replays, reach and discrimination are **inversely
correlated**:

| field | reach % | distinct-spec ratio |
|---|---:|---:|
| exclusionFlags | 82.8 | **0.11** |
| nonEuControl | 55.1 | **0.18** |
| ownerOver25 | 30.9 | 0.55 |
| needBy | 12.6 | **1.00** |
| cofinancingBand | 9.8 | 0.42 |
| region | 2.9 | 0.57 |
| turnoverBand | 1.1 | **1.00** |

The six fields that won every slot reach nearly the whole shortlist and demand
the SAME thing of nearly all of it — every fund wants a founder not in crisis
and not under a recovery order. Asking eliminates nobody. Meanwhile the fields
where every fund differs ranked 7th and below and were never asked.

**A question everyone answers identically carries no information.**

Fixed by ranking on `infoScore = reachPct × distinctness`. Reach still counts —
a perfectly discriminating question about one tiny fund is not worth a
founder's attention — so this reorders rather than inverts.

Effect on which fields win the six slots (25 holdout replays):

```
region        0/25  ->  14/25
conditionality  (displaced, 0.93 distinct but negligible reach)
```

`exclusionFlags` still wins every slot: 82.8 × 0.11 = 9.1 still beats region's
2.9 × 0.57 = 1.65. That is intended.

---

## 4. What the adaptive round can and cannot do

Measured with `scripts/measure_funnel_recall.ts` (model-free, full-engagement
ceiling case, no label leakage):

```
screen one only        EXACT 23%   REGIME 73%
after adaptive round   EXACT 22%   REGIME 70%
promoted into five: 0    demoted out: 1
```

Reach was the first hypothesis and it is wrong: the round asks about 5 of ~57
funds and the won fund is among them only 12.5% of the time, but raising the
limit 5 → 15 → 30 still yields 1 promoted / 2 demoted.

The real reason is effect size in `ease.ts`: `resolved` is one component beside
comparable-count, blocked-status and country-match, divided by
(total gates + shrinkage). Answering one or two of a fund's gates is noise.

**So the adaptive round, as wired, cannot move which five rows appear.** The
information-gain fix makes the QUESTIONS better — which is real value for the
founder and for the memo — without yet changing the table.

---

## 5. `region`: built, encoded, and inert

Worth its own section because it is the one input that genuinely splits
siblings, and it was half-built for a long time.

- **Declared**: `types.ts:672` (`region: "structural"`), with a question stem
  at `:734` — *"Which region is your company established in?"*
- **Options**: derived at runtime via `optionsFor`, reconciling
  `entityCountries` (English names) against `regions.generated.ts` (NUTS 2024,
  Eurostat GISCO, checked by `check_regions.ts`). This is why `region` is
  absent from `vocabularies.json` — it is dynamic, not a static enum. An
  earlier read of this file wrongly concluded it was "never asked".
- **Encoded on the fund side**: 142 gates across 149 instruments carry an
  evaluable spec, e.g. `{"op":"region_within","field":"region","allowed":["AT12"]}`.
- **Why it discriminates**: SA.111723 spans **14 French régions**, each running
  its own dispositif. SA.58995 spans 9. Region is exactly what separates
  schemes sharing one notified framework.
- **Status**: now reaches the six-slot cut in 14/25 replays (was 0).

**Its recall effect is still unmeasured, and honestly cannot be measured
today.** Three candidate sources for a ground-truth founder region were all
rejected — see `screen_one_discrimination_plan.md` §"Phase 1 RESULT". Briefly:
`companies.city` covers 17% (→ 20 usable pairs); `satr_staging.region` is
leaky (for a regional scheme the award's region IS the scheme's region, and
where independently derivable it self-agrees only 56%, so it is a property of
the scheme not the recipient); company size/financial fields do not exist.

---

## 6. Standing constraints on anything that touches these screens

- **A question that everyone answers the same way is not worth a slot.** That
  is now enforced by `infoScore`, not by convention.
- **The model does not choose questions.** It phrases them. Keep it that way:
  it is what makes the funnel measurable for free.
- **Ground truth carries no intake attributes.** Any change justified by
  "founders will answer X" is unfalsifiable here until the recall set gains
  per-company X. Say so rather than implying a measured gain.
- **Do not rank on gate-fit** while replays share one eligibility profile.
  Measured as noise, twice.
- **Exact-scheme 95% has no demonstrated route.** Regime-level (73-77%) is what
  the current inputs support. Four levers measured flat; see the companion doc.
