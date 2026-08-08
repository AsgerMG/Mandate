# The question we ask badly, and the three we could ask instead

**Workstream AY · 2026-08-08 · isolated worktree off `main` at `e760f555`.**

Analysis and design only. No change to the intake, the ranker or the corpus.
Every figure printed `corpus=postgres instruments=1088` or `corpus=sqlite` on the
run that produced it, and every raw output is beside this file:
`question_design_wsAY_{axes,ceilings,stability,own_gates,subsector}.txt`.

---

## 1. The headline, in three sentences

**The cheap fix does not work, and we can now prove why.** Subsector — the
94-value tier we already hold — scores 39.4% top-5 when its fund-side map may see
the awards it is predicting and **13.5% when it may not**, on the same 1,546
pairs against the same 11.2% baseline. That is the 34.5%/10.9% collapse
`CONTINUE_HERE.md` already records, reproduced at a finer grain.

**wsAT's diagnosis is right about ADEME and wrong about everywhere else.** Inside
ADEME, technology takes the @5 ceiling from 0% to **91%** and nothing else moves
it past 7%. Across the other large families the separating axis is **region**,
which lifts satr_de_rnd from 0% to 57%, satr_it_rnd to 49%, satr_fr_rnd to 44%,
satr_be_rnd and satr_fi_rnd to 100%.

**The best question is one we already ask, and ask last.** Region is 42% of every
decidable filter a leaf owns rather than inherits — 181 gates on 155 leaves
across 19 regimes — and the intake asks it adaptively, so most founders are never
asked at all.

---

## 2. Sizing the problem: it is not one problem

52 multi-leaf regimes hold 780 leaves. Six of them hold 428 — over half — and
they do not fail for the same reason.

| regime | leaves | what actually separates the leaves |
|---|--:|---|
| `satr_de_rnd` | 103 | granting body and notified scheme, and the body is a **Land ministry** |
| `bdns_es_ayudas` | 88 | the **measure or technology** the call names (autoconsumo, fleet conversion, AI) |
| `ademe_aid` | 76 | the **decarbonisation measure**, and study-vs-investment within it |
| `satr_it_rnd` | 68 | granting body and notified scheme, largely **regional** |
| `vinnova_grant` | 50 | the call's **theme** (6G, IoT, incubators, skills) — and nothing we can ask |
| `satr_fr_rnd` | 43 | granting body, split between national ministries and **conseils régionaux** |

This falls out of how the corpus splits a rollup, which is itself a fact about
the registers. A state-aid rollup splits by *(granting body, notified scheme)* —
so its leaves differ by **who runs the call**. ADEME splits by *programme name* —
so its leaves differ by **what the call funds**. The same product is looking at
two structurally different objects and has one question for both.

**The answer to "is it always technology" is a clear no.** Technology takes ADEME
to 91% and does nothing at all for the five SATR families; region takes four SATR
families past 40% and does nothing for ADEME (7%) or Vinnova (0%).

### What the leaves' own rules say

The corpus's own answer, read from official eligibility text rather than
inferred. Only a leaf's **own** decidable filter can separate it from a sibling —
an inherited one is constant across the group by construction. There are 428 such
filters on multi-leaf regimes:

| intake field | gates | share | leaves | regimes |
|---|--:|--:|--:|--:|
| **region** | **181** | **42%** | 155 | 19 |
| consortium | 51 | 12% | 31 | 9 |
| entityCountries | 33 | 8% | 16 | 5 |
| developmentStage | 29 | 7% | 21 | 8 |
| sector | 25 | 6% | 21 | 6 |
| exclusionFlags | 25 | 6% | 18 | 4 |
| useOfFunds | 23 | 5% | 20 | 6 |
| ticketBand | 13 | 3% | 11 | 5 |

Per regime, `satr_de_rnd` has 46 leaf-own filters and **all 46 are region**. So do
`satr_cz_rnd` (32/32), `satr_be_rnd` (19/19), `satr_it_rnd` (11/11),
`satr_nl_rnd` (10/10). ADEME's 21 are sector 10, region 5, entityCountries 2.

One clean negative worth recording: **zero** leaf-own decidable filters resolve to
no intake field. There is no population of official conditions we are unable to
ask about. The gap is not a missing field; it is a field we do not ask.

---

## 3. The cheap fix, priced and rejected

The brief asked this to be tested first, and it was. The result is worth more
than the option it kills.

Subsector is scored the most generous way possible: the fund-side map is fitted
directly to award history, which Rule Zero forbids encoding and which is the
optimistic bound on any honest map. Four arms, one script:

| arm | pairs | top-5 | uniform | lift |
|---|--:|--:|--:|--:|
| `GUARD=peer` — holdout companies withheld | 2,694 | 38.6% | 14.6% | +24.0pp |
| `FIT=size` — the popularity null model | 2,694 | 15.9% | 14.6% | +1.4pp |
| **`POP=post_cut GUARD=peer`** — post-2023 pairs, full-history map | 1,546 | **39.4%** | 11.2% | **+28.2pp** |
| **`GUARD=temporal CUT=2023`** — same pairs, pre-2024 map | 1,546 | **13.5%** | 11.2% | **+2.3pp** |

The last two rows are the finding. **Identical population, identical baseline.**
The only difference is whether the map was allowed to see the awards it is being
asked to predict. The lift falls from +28.2pp to +2.3pp — 92% of it was the map
reading its own answer key. `sector_top` does worse than chance out of sample
(−1.7pp).

The `FIT=size` row matters because it rules out the *other* explanation. A
smoothed posterior over 94 classes flatters large leaves, and the largest leaf of
a regime is also the one most companies win — the mistake that cost the objective
prior 21 points. The popularity null scores +1.4pp, so the in-sample 38.6% is
genuinely subsector signal. It is real, and it does not survive contact with a
call the map has not already seen.

### Why this generalises past subsector

Measured directly on the corpus rather than through the recall set: for the 274
leaves with at least 8 awards on each side of the cut, does an attribute computed
on the early awards agree with the same attribute computed on the late awards?
Reported against a naive floor — predicting the whole regime's dominant value.

| fund-side attribute | agrees with itself | naive floor | margin |
|---|--:|--:|--:|
| award decade (log10) | 83% | 79% | +5pp |
| ticketBand of median award (shipped 5) | 81% | 72% | +8pp |
| **award band, finer low end (6)** | **70%** | 56% | **+14pp** |
| sector_top argmax (11) | 68% | 45% | +23pp |
| **subsector argmax (94)** | **59%** | 44% | **+15pp** |

**Subsector is the least self-consistent attribute in the corpus**, and going from
11 values to 94 makes stability worse, not better. This is the same shape as the
recall collapse, seen on every leaf rather than only the ones holdout happens to
contain.

**Recommendation: do not use subsector, and do not ask for it.** The finding is
not "subsector is a weak signal"; it is that *any* fund-side attribute learned
from award history is, and the finer the grain the worse it gets. This test —
compute the attribute on early awards, compute it on late awards, see if they
agree — should be run **before** the next discriminator is built rather than after.

---

## 4. What each candidate question actually buys

`measure_sibling_coverage.ts` reasoning, applied to questions. Fund sides are
built from official sources only: encoded filter gates, register award
percentiles, declared catchment, and official call text. **Ceiling@5** is the share
of leaves whose residual class fits in the five rows the product renders — what a
*perfect* answer would buy, before any ranking.

### All 780 multi-leaf leaves

| question | mean class | alone | **ceiling@5** | regimes it moves | leaves | countries |
|---|--:|--:|--:|--:|--:|--:|
| nothing asked (today) | 48.9 | 0% | **8%** | — | — | — |
| money, shipped bands | 34.5 | 3% | 17% | 29 | 684 | 16 |
| money, finer low end | 27.1 | 5% | 24% | 36 | 731 | 19 |
| **where you are (region)** | **27.7** | **16%** | **39%** | 32 | 559 | 18 |
| what it pays for (stage) | 47.6 | 6% | 14% | 23 | 317 | 13 |
| what you are (applicant shape) | 46.7 | 8% | 18% | 40 | 703 | 20 |
| technology / measure † | 37.2 | 7% | 19% † | 2 † | 164 † | 2 † |
| money(fine) + region | 15.1 | 23% | **51%** | 42 | 751 | 21 |
| region + tech † | 17.0 | 23% | 50% | 33 | 647 | 19 |
| all three † | 9.9 | 31% | **62%** | 42 | 751 | 21 |

† **Understated, and it is the one number here that is not final.** The
technology label exists for 120 of 780 leaves — ADEME complete (76/76) and
`bdns_es_ayudas` half (44/88) — because the Anthropic credit balance was
exhausted mid-run. Every technology row is therefore a floor. §7 has the exact
cost to finish it.

### ADEME, the only fully labelled regime

| question | mean class | ceiling@5 |
|---|--:|--:|
| nothing asked (today) | 76.0 | **0%** |
| money, shipped bands | 68.3 | 5% |
| money, finer low end | 28.2 | 5% |
| where you are (region) | 66.4 | 7% |
| what it pays for (stage) | 72.1 | 3% |
| **technology / measure** | **2.1** | **91%** |
| **money(fine) + technology** | **1.6** | **100%** |

wsAT was right. Inside ADEME the technology question is not one option among
several; it is the only thing that works, and it works almost completely.

### Ceiling@5 per regime — the six-family picture

| regime | n | today | money (fine) | **region** | stage | **technology** |
|---|--:|--:|--:|--:|--:|--:|
| `satr_de_rnd` | 103 | 0% | 2% | **57%** | 1% | 0% † |
| `bdns_es_ayudas` | 88 | 0% | 0% | 0% | 0% | 26% † |
| `ademe_aid` | 76 | 0% | 5% | 7% | 3% | **91%** |
| `satr_it_rnd` | 68 | 0% | 12% | **49%** | 0% | 0% † |
| `vinnova_grant` | 50 | 0% | 10% | 0% | 0% | 0% † |
| `satr_fr_rnd` | 43 | 0% | 7% | **44%** | 0% | 0% † |
| `satr_cz_rnd` | 35 | 0% | 0% | **40%** | 0% | 0% † |
| `satr_nl_rnd` | 28 | 0% | 11% | 25% | 0% | 0% † |
| `satr_at_rnd` | 23 | 0% | 22% | 26% | 0% | 0% † |
| `satr_be_rnd` | 17 | 0% | 35% | **100%** | 0% | 0% † |
| `satr_fi_rnd` | 11 | 0% | 36% | **100%** | 0% | 0% † |

**Vinnova is the honest failure.** 50 Swedish leaves, and the best single question
reaches 10%. Its calls are themes — *6G*, *Internet of Things Sverige*,
*Kompetensförsörjning*, *Inkubatorprogrammet* — that share a body, a country, a
region and an award size. A technology question would help it, but only once its
leaves are labelled, and its themes are closer to research-programme titles than
to anything a founder describes about themselves.

### The region null model

Before recommending region, the wsAO trap had to be excluded: a leaf that carries
a rule differs from its siblings partly in *how much has been written down about
it*, and the best-documented leaf is also the one most companies win.

| key | mean class | alone | ceiling@5 |
|---|--:|--:|--:|
| region: full (gates + footprint + catchment) | 27.7 | 16% | **39%** |
| region: encoded gate VALUE only | 35.5 | 6% | 23% |
| **NULL: merely HAS a region gate** | 38.2 | 1% | **12%** |
| region: footprint + catchment only | 28.8 | 14% | 36% |

Documentation volume alone buys 12%; the region's actual value buys 39%. **The
signal is the region, not the paperwork.** Note also that footprint+catchment
(36%) nearly matches the full key — so most of the ceiling is available on leaves
where nobody has encoded a region gate at all.

---

## 5. Three options for the PM

Every one is answerable by a founder about their own company, and none requires
them to know anything about aid law.

### Option A — Ask where they are, on the first screen, and pre-fill it

**What the founder is asked.** "Where is the establishment that would run this
project?" — a region, offered as the NUTS-2 list for the countries already on
record, which is what `adaptiveRound.ts` already builds.

**What it separates.** 559 leaves across 32 regimes and 18 countries. Ceiling@5
goes 8% → **39%** overall, and 0% → 57% / 49% / 44% / 40% / 100% / 100% for the
German, Italian, French, Czech, Belgian and Finnish SATR families.

**Effort cost: near zero, and possibly negative.** We already ask this. It sits in
the adaptive round, so it reaches a minority of founders — wsAO measured a region
supplied for 46% of graded pairs. Moving it to screen 1 spends one field on the
page that currently spends six, and it is the single question this analysis ranks
highest.

**It is the only candidate we can verify.** A company's registered address gives
its NUTS region. We can pre-fill it and ask the founder to confirm, which is
strictly better than self-report and is the brief's stated preference.

**The caveat, stated plainly.** wsAO measured *region as a ranking signal* and
found it dead at regime width — "which body has paid most into this region"
becomes a size prior. This option is **not** that. It is region as a **filter**,
against 181 encoded, official, decidable region gates on 155 leaves. wsAO's own
conclusion was "region as a FACT is still wanted; region as a ranking signal is
dead", and this is the fact. It must not be implemented as a scorer.

### Option B — Ask how much money, on a scale that fits Europe

**What the founder is asked.** The `ticketBand` question we already ask, rebanded.
The shipped scale spends four of its five bands above €500k and one band on
everything below it — and everything below it is most of the national grant
corpus. ADEME's studies pay €3,800–€37,000 and its capex pays €22,000–€3.5M, and
the shipped scale calls all of that `lt500k`.

**What it separates.** 731 leaves across 36 regimes and 19 countries — the widest
reach of any candidate. Ceiling@5 goes 17% → **24%** on the rebanding alone, and
combined with region reaches **51%**.

**Effort cost: zero.** It is the same question with different buckets. No new
field, no new screen.

**It survives the stability test**, which is why it is here and subsector is not:
the finer band agrees with itself across the cut year 70% of the time against a
56% floor (+14pp margin), and inside ADEME 90%. Award percentiles come from the
transparency register, so this is official-source data, not a derived posterior.

**What it does not do.** It is a broad, shallow win. It never takes a regime past
36% on its own, and it does nothing for the German or Spanish families.

### Option C — Ask what the project physically does

**What the founder is asked.** For a founder whose project is a transition or
deployment project: which measure is it? Installing renewable heat, recycling
plastics, electrifying a fleet, a feasibility study on geothermal. Not what the
company *is* — what this project *does*.

**What it separates.** Inside ADEME: ceiling@5 0% → **91%**, and 100% combined
with the money band. Across the two labelled regimes it already reaches 164
leaves; the full number needs §7.

**Effort cost: the highest of the three, and it must be conditional.** The option
list is long and it is meaningless to a company that is not running a physical
project. It only earns its place if it is asked adaptively, gated on the
founder's country and sector, and never shown to a software company.

**This is a real distinction the corpus makes and the intake does not.** ADEME's
76 calls are not 76 sectors — a hotel, a foundry and a farm can all apply to the
solar-thermal feasibility call. `sector` cannot express that, and neither can
subsector, because both describe the applicant and this describes the project.
That is the precise sense in which wsAT's "11 values for a 75-leaf regime" is
true: the cardinality is a symptom, and the wrong *kind* of question is the cause.

---

## 6. Recommendation

**Take A and B. Hold C until it is measured properly.**

A and B together take the ceiling from 8% to **51%**, reach 751 of 780 leaves
across 21 countries, cost the founder no new question, and are both verifiable or
pre-fillable. They are also the two the evidence is complete for.

C has the largest single effect measured anywhere in this workstream — 0% to 91%
inside a 76-leaf regime — on 15% of the leaves it would need to be judged on.
That is a strong signal from an incomplete sample, and the honest position is
that it is *promising and unfinished*, not that it is third.

**On France specifically.** wsAM and wsAO both concluded FR needs data rather than
ranking. This does not overturn that, but it sharpens it: the French problem is
two problems. `ademe_aid` needs option C and nothing else touches it.
`satr_fr_rnd` needs option A and is 44% reachable today. They have been counted as
one market and they are not one problem.

**On whether any question works at all.** The brief asked for this to be said
plainly if true. It is not true in general — region and money reach 751 leaves and
technology takes ADEME to 91%. It **is** true of `vinnova_grant`: 50 Swedish leaves
whose best available question reaches 10%, separated by research-programme themes
that a founder has no way to state about themselves. If Sweden matters, the answer
there is corpus work, not intake work.

---

## 7. The one thing this workstream could not finish

The technology labelling ran on 120 of 780 leaves and stopped on
`400 invalid_request_error: Your credit balance is too low`. ADEME is complete
(76/76); `bdns_es_ayudas` is half (44/88); the other 50 regimes are unlabelled.

Every `technology / measure` figure in §4 is therefore a **floor**, and the
per-regime 0% for the SATR families means *not measured*, not *measured as zero*.
The structural evidence still argues those families are region-separated rather
than technology-separated — their leaf-own filters are 100% region — but option C
cannot be ranked against A and B until the run completes.

**Cost to finish: about $5.** 660 leaves at the measured rate (~13k input, ~3.9k
output per 12-leaf batch) is ~360k input and ~110k output tokens on `claude-opus-5`
— roughly $1.80 + $2.75. The script is idempotent and caches per leaf, so it
resumes where it stopped:

```
python3 ETL/terms/_wsay_label_axes.py
```

---

## 8. What was added

All read-only measurement. Nothing in the intake, the ranker or the corpus was
touched.

- `ETL/terms/_wsay_axes.py` — which corpus facet separates each regime's leaves.
- `ETL/terms/_wsay_subsector.py` — the four-arm subsector test, with the
  `POP`/`GUARD` split that separates "the map does not generalise" from "the map
  got thinner", and the `FIT=size` popularity null.
- `ETL/terms/_wsay_stability.py` — does a fund-side attribute agree with itself
  across a cut year, against a regime-dominant floor.
- `ETL/terms/_wsay_own_gates.py` — which intake field a leaf's OWN decidable
  filters turn on.
- `ETL/terms/_wsay_label_axes.py` — official-text axis labels (partial; §7).
- `ETL/terms/_wsay_ceilings.py` — the ceiling each candidate question buys, plus
  the region null model.
- `data/wsay_leaf_axes.json` — the label cache, 120 leaves.

## Reproducing this

```
python3 ETL/terms/_wsay_axes.py
python3 ETL/terms/_wsay_own_gates.py
python3 ETL/terms/_wsay_ceilings.py
python3 ETL/terms/_wsay_stability.py

GUARD=peer                python3 ETL/terms/_wsay_subsector.py
GUARD=peer FIT=size       python3 ETL/terms/_wsay_subsector.py
POP=post_cut GUARD=peer   python3 ETL/terms/_wsay_subsector.py
GUARD=temporal CUT=2023   python3 ETL/terms/_wsay_subsector.py
```
