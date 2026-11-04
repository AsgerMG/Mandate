# Workstream BA — the technology question, measured on all 780 leaves

Analysis only. Nothing in the intake, the ranker or the corpus is touched; both
scripts added are read-only, and the labelling run only fills the cache wsAY
already created.

wsAY stopped with 120 of 780 leaves labelled, so every technology figure it
reported was a floor and its four SATR zeroes meant "not measured". This finishes
the run. **Cost: $4.68** against the ~$5 approved (379,843 input / 111,099 output
tokens on `claude-opus-5`, 63 batches).

---

## The headline

The completed measurement **overturns wsAY's central claim about reach, and then
disqualifies the question anyway on a ground wsAY never tested.**

wsAY concluded that technology "takes ADEME from 0% to 91% and nothing else moves
past 7%" — a question worth a fraction of one that helps six families. That was an
artefact of which leaves had been labelled: ADEME and half of Spain. On the full
780, technology is the **strongest single question in the corpus** — 64% against
region's 39% — and it moves **37 regimes, 729 leaves, 19 countries**, not two
regimes and 164 leaves.

But the 64% is earned on **327 distinct free-text labels**. An intake cannot show a
founder 327 options. When the vocabulary is coarsened to a list a founder could
actually be shown, the advantage over region disappears: at 20 options technology
scores **40%**, against **39% for region — a question we already ask.**

**Recommendation: do not ship option C.** Not because technology is a bad question
— it is the best one available — but because at answerable granularity it
duplicates region, and in the two families it was meant to rescue no answer of any
kind can currently be acted on.

---

## 1. The completed table

CEILING@5 — the share of leaves whose residual class fits the five rows the product
shows, if every founder answered perfectly. Full output in
`question_design_wsBA_ceilings.txt`.

| regime | leaves | today | region | technology | region+tech |
|---|--:|--:|--:|--:|--:|
| satr_de_rnd | 103 | 0% | **57%** | 50% | 94% |
| bdns_es_ayudas | 88 | 0% | 0% | **58%** | 60% |
| ademe_aid | 76 | 0% | 7% | **91%** | 100% |
| satr_it_rnd | 68 | 0% | **49%** | 50% | 87% |
| vinnova_grant | 50 | 0% | 0% | **64%** | 72% |
| satr_fr_rnd | 43 | 0% | **44%** | 30% | 60% |
| satr_cz_rnd | 35 | 0% | 40% | **57%** | 100% |
| satr_nl_rnd | 28 | 0% | 25% | **64%** | 100% |
| satr_at_rnd | 23 | 0% | 26% | **35%** | 100% |
| satr_it_equity | 19 | 0% | 42% | **63%** | 100% |
| satr_be_rnd | 17 | 0% | **100%** | 35% | 100% |
| satr_de_equity | 15 | 0% | 53% | **100%** | 100% |
| ipcei | 12 | 0% | 0% | **100%** | 100% |
| satr_se_rnd | 12 | 0% | 25% | **100%** | 100% |
| satr_fi_rnd | 11 | 0% | **100%** | 36% | 100% |
| horizon_eu_partnership | 10 | 0% | 0% | **100%** | 100% |

Aggregate over all 780 leaves:

| question | mean class | alone | **CEILING@5** |
|---|--:|--:|--:|
| nothing asked (today) | 48.9 | 0% | 8% |
| money, finer low end | 27.1 | 5% | 24% |
| where you are (region) | 27.7 | 16% | 39% |
| what it pays for (stage) | 47.6 | 6% | 14% |
| what you are (who) | 46.7 | 8% | 18% |
| **technology / measure** | **10.8** | **39%** | **64%** |
| region + tech | 4.4 | 54% | 86% |
| all three | 3.4 | 64% | 90% |

The four rows the brief flagged as unmeasured are now measured: satr_de_rnd 50%,
satr_it_rnd 50%, vinnova_grant 64%, ademe_aid 91%. **None of the SATR zeroes was a
zero.**

---

## 2. ADEME's 91% — three tests, two passed

The number the case for option C rests on. It survives two attacks and fails the
third.

**Test 1 — is it reproducible? PASSED.** ADEME was re-labelled independently
(`_wsba_relabel_check.py`, `question_design_wsBA_reproducibility.txt`). Exact
string agreement is only 60%, but **the ceiling is 92% on both passes — zero
movement.** The disagreements are pure paraphrase: "cycling mobility policy" vs
"cycling mobility", "biowaste management and valorisation" vs "biowaste
management". `primary_axis` agrees 88%. The 91% is a stable measurement, not one
sampling of the model.

**Test 2 — is it just having been written down? PASSED.** wsAO's null model, applied
to technology: merely *having* a label scores 16%, against 64% for the label's
*value*. The information is in the content, not in the documentation volume.

**Test 3 — is it a question, or the fund catalogue restated? FAILED.**

| regime | leaves | distinct labels | labels naming exactly ONE leaf | distinct names |
|---|--:|--:|--:|--:|
| ademe_aid | 76 | 53 | **41** | 76 |
| vinnova_grant | 50 | 32 | **32** | 50 |
| satr_de_rnd | 103 | 47 | 44 | 96 |

ADEME's 75 labelled leaves carry 53 distinct labels, 41 of which identify exactly
one leaf. The regime has 76 distinct names. The label compresses 76 → 53, which is
real, but over half the regime is still separated by a string that belongs to it
alone.

Vinnova makes the mechanism unarguable: **32 distinct labels, all 32 singletons,
and a technology ceiling of exactly 32/50 = 64%.** The entire score is the leaves
whose label is unique; the other 18 leaves were given no label at all and sit in
one class of 18.

---

## 3. The curve — the decisive result

Ceiling@5 against the number of options the question would offer. Full output in
`question_design_wsBA_answerable.txt`.

| vocabulary | mean class | CEILING@5 (all) | ademe | vinnova |
|---|--:|--:|--:|--:|
| top 5 | 21.1 | 27% | 12% | 6% |
| top 10 | 17.6 | 32% | 17% | 12% |
| top 15 | 16.3 | 36% | 24% | 14% |
| top 20 | 15.3 | **40%** | 29% | 20% |
| top 30 | 14.0 | 43% | 39% | 22% |
| top 50 | 13.0 | 49% | 47% | 26% |
| top 100 | 11.9 | 54% | 63% | 38% |
| free text (327) | 10.8 | **64%** | **91%** | **64%** |

Region, which the intake already collects, scores **39%** and costs no new question.
Technology only overtakes it past ~20 options, and ADEME's headline needs the full
327-label free-text vocabulary to reach 91% — at 20 options it is 29%, a 62-point
fall.

**One thing the curve does support: the project/company distinction is real.**
Asked at the same vocabulary size, "what your project does" beats "what your
company is" — 35% vs 21% at 20 options, 28% vs 19% at 10. `sector` (11 values, first
page) is genuinely a different and weaker question. If technology is ever asked,
this is the reason it would be worth asking.

---

## 4. Reachability — wsAX confirmed, and it is worse than reported

wsAX's finding reproduces exactly: **57 of 76 ADEME leaves carry no decidable
comparator at all** (19 have one), across 15 distinct non-empty gate signatures.

| regime | leaves | any decidable filter gate | region gate | technology-shaped gate |
|---|--:|--:|--:|--:|
| ademe_aid | 76 | **19** | 5 | 11 |
| vinnova_grant | 50 | **1** | 0 | **0** |
| satr_de_rnd | 103 | 103 | 35 | 103 |
| bdns_es_ayudas | 88 | 88 | 0 | 88 |

"Technology-shaped" is generous — it counts `sector`, `activities`, `useOfFunds`
and `developmentStage`. **Not one gate in the entire corpus resolves to a
technology field, because no such intake field exists.** The nearest, `activities`,
is an *exclusion* list (gambling, tobacco, weapons) with one gate in the corpus.

Two further facts sharpen this:

- **Vinnova's 49 leaves have zero `eligibility_gates` rows between them.** Not "no
  decidable gates" — no rows at all. The one entry in the table above is the parent
  `vinnova_grant`, which carries 16 rows (3 decidable) that all 49 children inherit
  *identically*. Nothing a leaf owns distinguishes it from a sibling, which is the
  definition of unrankable.
- **bdns_es_ayudas has exactly one distinct gate signature across all 87 leaves** —
  every Spanish leaf is gate-identical, which is why region and money both score 0%
  there. This corroborates WS-AU's "sound and unscoreable by construction".

So the brief's hypothesis is **confirmed for exactly the two families the question
was meant to rescue**. ADEME and Vinnova are the two regimes where region does
nothing (7%, 0%) and technology looks best (91%, 64%) — and they are also the two
where almost nothing is encoded. A technology *answer* has nothing to meet. The
ceiling there is the encoding, not the question.

They are the same two regimes with **no `eligibility_embeddings` rows** (0 of 75 and
0 of 49); every other large regime is fully covered.

---

## 5. Vinnova — overturned on the number, upheld on the conclusion

wsAY called Vinnova an honest failure at 10%. **On the number that is wrong:
technology takes it to 64%**, because its leaves are named for technologies — 6G,
Artificiell intelligens, Avancerad digitalisering, Cirkulär och biobaserad ekonomi.

On the conclusion it stands, for three reasons the 64% conceals:

1. The 64% is exactly the 32 leaves with a unique label; the other 18 got none.
2. At a 20-option list it falls to **20%**, below wsAY's own money figure.
3. **It cannot be acted on.** Its 49 leaves carry no gate rows at all — only the
   parent does, and identically for every child; none carries a technology-shaped
   gate; there are no eligibility embeddings.

Vinnova's leaves have **no description text at all** (0 of 49), a median of 183
characters of eligibility text, and `delivery_region` and `catchment_regions` NULL
for all 49 — which is why region is structurally 0% and not merely unmeasured.

---

## 6. The question is already being asked, as prose

`shortlist.ts` already computes thematic relevance by embedding the founder's own
description and matching it against `instrument_profiles` — "what a fund funds" —
and this is the *primary* signal, applied ahead of every other key. That is the
technology question, asked as free text rather than as a menu, and it is already
shipped.

This cuts both ways and the caveat is load-bearing: for ADEME and Vinnova the
`instrument_profiles` text is built from **award titles** (avg 5.0 and 5.0 per
leaf), so for exactly those two regimes the semantic path is an award-derived
posterior and inherits the risk wsAY quantified. Re-running
`_wsay_stability.py` reproduces it: subsector agrees across an early/late award
split 59% against a 44% floor, sector_top 68% against 45%. By contrast
`satr_de_rnd` profiles carry **zero** award titles.

The technology labels themselves are **not** award-derived — `_wsay_label_axes.py`
reads the scheme title, register description, published eligibility text, scheme
code and granting body — so wsAY's early/late split is not defined for them and
running it would be theatre. The reproducibility test in §2 is the analogous check
for a model-produced label, and it passed.

---

## 7. Recommendation on option C

**Do not ship a technology question. Encode instead.**

- At any answerable granularity it buys what region already buys (40% vs 39% at 20
  options), while costing the most expensive question in the intake and a
  conditional to gate it behind.
- Its headline case, ADEME's 91%, requires a 327-option free-text vocabulary. At 20
  options ADEME is 29%.
- In ADEME and Vinnova — the families region cannot fix, and the whole argument for
  option C — 57/76 and 49/50 leaves have no rule of any kind to fire, no technology
  field exists to encode against, and no eligibility embeddings exist.
- The information already reaches the ranker through the semantic path, without a
  new question.

The measurement does point somewhere. **region + technology reaches 86%** against
region's 39%, and the project/company distinction is real. The binding constraint
is not that we lack the question; it is that in the two regimes that need it, there
is nothing encoded for any answer to meet. The same encoding work lifts the
questions already asked, and should be tested against the same self-consistency
rule before it is trusted.

**If option C is revisited, the gate should be: can a technology vocabulary of ≤30
options be built that holds its ceiling?** That is the number to beat — 43% at 30
options — and it must be shown before the question is worth a founder's time.

---

## Incidental — the AY branch fails CI

Not part of this workstream, not fixed here, and pre-existing:
`workstream-ay-question-design` carries **committed merge-conflict markers** in three
ETL scripts, so `python3 -m compileall -q ETL website/build` (ci.yml) fails on it.

    ETL/terms/check_gate_subject.py        1 marker
    ETL/terms/encode_gates.py              2 markers
    ETL/terms/encode_scheme_text_gates.py  8 markers

`main` is clean. These came in with the `workstream-au-es-gates` merge. Resolving
them is a decision about shipped gate-encoding behaviour, which this measurement
workstream was told not to touch — flagging for whoever merges AY.

---

## Reproducing

    python3 ETL/terms/_wsay_label_axes.py        # caches per leaf, resumes, $0 once cached
    python3 ETL/terms/_wsay_ceilings.py          # the completed table
    python3 ETL/terms/_wsba_tech_answerable.py   # cardinality, null models, the curve
    python3 ETL/terms/_wsba_relabel_check.py     # ADEME reproducibility (costs money)

`data/wsay_leaf_axes.json` (780 leaves) and `data/wsba_relabel_ademe.json` are
gitignored; the labelling script rebuilds the first for about $4.
