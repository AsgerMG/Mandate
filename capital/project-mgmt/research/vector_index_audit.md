# Vector index audit — are the embeddings good enough to pick 1 of 58?

Date: 2026-08-06. Read-only audit of `instrument_profiles` and `eligibility_embeddings`
against the live Postgres, with live `voyage-3.5` query embeddings.

## Verdict first

**The embedding layer is not one thing, and it does not have one answer.**

| Population | Share of holdout | Embedding-only top-5 of 58 | Is it the bottleneck? |
|---|---|---|---|
| Company with a **real project description** (EU programmes) | 16% | **79.4%** (50.0% under an adversarial slate) | **No.** Embeddings already beat the 25% the product achieves. |
| Company described only by **sector** (national / SATR schemes) | 84% | **17.2%** (random = 8.6%) | **Yes**, but the cause is not the model. |

The embedding model is **not** the problem. The oracle test settles it: when the query
names the scheme it is looking for, the correct leaf comes back at **median rank 1,
top-1 80%, top-10 100%** out of 1,014. The vectors are separable. Nothing downstream is
blocked by voyage-3.5.

Ranked causes of the national-scheme failure:

1. **Query-side information starvation** (dominant). 982 of 1,170 holdout rows carry no
   description at all — only one of **11 template strings** derived from the sector. One
   string, `"We develop and commercialise software, data and AI products…"`, is the query
   for 179 rows with **87 different correct answers**. A perfect index caps at ~1/87 there.
2. **Sibling near-duplication.** 119 SATR leaves share a scheme name with at least one
   other leaf; their profile embeddings sit at **mean cosine 0.947** (88 of 205 pairs
   above 0.95). Retrieval cannot separate them — and should not be asked to.
3. **Coverage holes in exactly the wrong places.** 169 profiles have zero funded-project
   titles, including the five largest instruments in the corpus. Spain: 7 instruments,
   none with titles, covering 16,642 events.
4. **`eligibility_embeddings` is not a matching index** and must never sit in the
   selection path. 26.8% of its chunks are text that appears verbatim under another
   instrument; 284 of 497 SATR leaves have **zero** chunks unique to them.

---

## 1. Coverage

### instrument_profiles

| Metric | Value |
|---|---|
| Non-framework instruments | 950 |
| …with a profile | **919 (96.7%)** |
| …without | 31 (3.3%) — all `national_dev_banks` |
| Rows in `instrument_profiles` | 1,014 |
| **Orphans** (profile whose instrument no longer exists) | **87 (8.6%)** |
| Null/short profile_text, null embedding | 0 / 0 |
| Model | `voyage-3.5`, 100% |

The 31 missing are entirely Baltic/Nordic development-bank lines — Altum (LV), EIS (EE),
NFR (NO), Innovationsfonden (DK). The largest is `altum_mvu_izaugsmes_aizdevumi…` at 937
events. Not material by volume, but LV and EE are the weakest countries overall.

The 87 orphans are stale vectors that still rank in every query. `cmd_run` prunes them on
an incremental run, so the index has drifted since the last build.

### The real coverage problem is not rows, it is titles

`profile_text` gets its discriminating power from **real funded project titles**. That
signal is thin or absent across most of the corpus:

| n_titles | profiles | share |
|---|---|---|
| 0 | 169 | 16.7% |
| 1–2 | 568 | 56.0% |
| 3–9 | 172 | 17.0% |
| 10–39 | 39 | 3.8% |
| 40 (capped) | 66 | 6.5% |

**Only 10.4% of profiles carry 10 or more titles.** Event-weighted, 270,823 of 439,808
events (61.6%) belong to an instrument with any title text at all.

Worse, the **five largest instruments in the corpus have zero titles**, because the
title-kind classifier correctly marked their `project_title` column as holding aid-scheme
names rather than projects:

| instrument | events | n_titles | elig chunks |
|---|---|---|---|
| `satr_de_rnd` | 27,423 | **0** | 31 |
| `satr_it_equity` | 16,697 | **0** | 14 |
| `bdns_es_ayudas` | 14,330 | **0** | 30 |
| `satr_fr_rnd` | 11,954 | **0** | 33 |
| `satr_it_rnd` | 11,823 | **0** | 22 |
| `innovate_uk__collaborative_r_d_a57e15` | 10,271 | 3 | **0** |

Contrast `ademe_aid` (26,700 events, 40 titles) and `innovate_uk` (17,012, 40), which are
well served. The classifier is doing the right thing — the raw titles genuinely are
statute names — but the consequence is that the corpus's strongest asset is missing
precisely where the volume is.

### eligibility_embeddings

| Metric | Value |
|---|---|
| Chunks | 4,720 (3,843 `gate`, 877 `clause`) |
| Distinct instruments | 634 |
| Non-framework instruments with any chunk | **626 / 950 (65.9%)** |
| …without | **324 (34.1%)** |
| Event-weighted coverage | 390,188 / 439,808 (88.7%) |

Coverage is bimodal by channel:

| bucket | instruments | w/ profile | w/ titles | w/ elig |
|---|---|---|---|---|
| `state_aid_satr` | 497 | 497 | 459 | **497 (100%)** |
| `national_dev_banks` | 379 | 348 | 252 | **70 (18.5%)** |
| `horizon_eu_pillar_ii` | 9 | 9 | 9 | 9 |
| `horizon_eu_partnership` | 9 | 9 | 9 | 9 |
| `eit` | 13 | 13 | 13 | 13 |
| `ipcei` | 11 | 11 | **0** | 11 |
| `innovation_fund` | 8 | 8 | 8 | 8 |
| `eic` | 4 | 4 | 3 | 4 |
| (null bucket) | 15 | 15 | 0 | 0 |

**National development banks are the hole: 309 of 379 (81.5%) have no eligibility text.**
That is 135,560 events — Innovasjon Norge, Vinnova lines, Altum, EIS, Bpifrance lines,
TACR, Enterprise Ireland.

### Thin countries

| country | instruments | w/ titles | w/ elig | events |
|---|---|---|---|---|
| **ES** | 7 | **0** | 5 | 16,642 |
| PL | 8 | 2 | 8 | 3,830 |
| **GB** | 21 | 19 | **5** | 34,598 |
| HU | 8 | 6 | 8 | 11,362 |
| DK | 14 | 10 | 7 | 7,092 |
| **EE** | 72 | **8** | 19 | — |
| **LV** | 45 | **7** | 22 | — |
| DE | 121 | 119 | 119 | — |
| IT | 88 | 86 | 88 | — |
| FR | 133 | 130 | 57 | — |

Spain is the standout failure: the third-largest country by holdout share (52 of my 188
described rows), 16,642 events, and **not one instrument with funded-project text**. The
live query test confirms the consequence — a Galician dairy company describing an
experimental development project retrieves EIT Food and four **Norwegian** biotech
programmes ahead of anything Spanish; the best in-country hit is `Linea Directa de
Expansion` at 0.536, below six foreign funds.

---

## 2. Text quality

### Profile length by channel

| bucket | n | mean chars | median |
|---|---|---|---|
| `horizon_eu_pillar_ii` | 9 | 4,241 | 4,400 |
| `horizon_eu_partnership` | 9 | 3,624 | 3,578 |
| `edf` | 2 | 3,115 | 3,115 |
| `eit` | 13 | 3,057 | 2,427 |
| `eic` | 4 | 2,846 | 3,694 |
| `state_aid_satr` | 497 | 1,302 | 1,210 |
| `national_dev_banks` | 348 | **944** | **635** |
| `ipcei` | 11 | 607 | 601 |
| (null) | 15 | 193 | 180 |

### Best examples — specific and genuinely discriminating

`chips_ju_kdt` (4,160 chars). The stated scope plus 40 verbatim titles:

> Projects it has actually funded: Shift2SDV - a common Software development framework and
> hardware independent microservice-oriented middleware architecture for the stepwise
> migration to the Software Defined Vehicle of the Future; … RISC-V GENERATION OF HIGH
> PERFORMANCE AUTOMOTIVE PROCESSORS AND COMPUTING PLATFORMS; …
> Sectors it has actually funded: semiconductors electronics (79%), software data ai (7%)…
> Typical award: around EUR 241,151 across 2174 recorded awards.

`eit_food_rfs` — every title is a one-line description of a real company's work:

> Uses precision fermentation to produce dairy proteins without animals for cheese and
> yogurt applications.; Upcycles fruit pits (apricot, cherry, plum) into plant-based oils,
> proteins and flour ingredients.; …

This is why it scores **0.6165** on the precision-fermentation query — the single highest
similarity observed anywhere in the audit.

`satr_pt_rnd__sa_110394__tamprcentro` shows the SATR format working when the scheme's own
page was fetched:

> What it funds, from the scheme's own page: Apoio a contratacao de Recursos Humanos
> Altamente Qualificados (RHAQ) por PME na Regiao Centro de Portugal…
> Who may apply…: Micro, pequenas e medias empresas (PME). Dois avisos distintos consoante
> a localizacao…

### Worst examples — boilerplate with no retrieval surface

`eit_climate_kic`, 147 chars, the entire document:

> EIT Climate-KIC (EU) — unknown funding.
> What it funds: Funds/support restricted to climate-related innovation, mitigation, or
> adaptation activities

`innovate_uk__collaborative_r_d_a57e15` — **10,271 events**, 488 chars, 3 titles, zero
eligibility chunks.

`bdns_es_ayudas` — **14,330 events**, 456 chars, the whole scope statement being:

> Funded projects must be collaborative experimental development projects carried out
> effectively by several beneficiary entities, per the definitions in Annex II, sections 8
> and 9.

`satr_de_rnd` — **27,423 events**, 713 chars, and its "what it funds" is pure procedure:

> Selected projects must not have started before the grant decision is issued; work
> commencement is defined as conclusion of a binding supply/service contract.

`ipcei_hy2tech` and `ipcei_eubatin` (601–904 chars, 0 titles) are legal definitions of
"first industrial deployment" — correct, and useless for matching a founder.

### The crux: do siblings read alike?

**Yes, and severely — but for a legitimate reason.**

Global background: mean pairwise cosine between 300 random profiles is **0.7559**
(min 0.587, p95 0.842). These embeddings are already crowded.

Within parent groups (29 groups of 3–40 children):

- mean of group-mean cosine **0.8557**, median 0.8568
- 28 / 29 groups above 0.80; 16 above 0.85; 2 above 0.90
- worst: `satr_pt_rnd` 0.9143, `satr_fi_equity` 0.9047, `satr_fr_equity` 0.8988,
  `satr_lv_rnd` 0.8943
- best (most separated): `horizon_eu_partnership` 0.7753, `satr_de_equity` 0.8067

The sharp end is **43 SATR name-groups covering 119 leaves that share an identical scheme
name**. Across their 205 pairs:

| metric | value |
|---|---|
| mean cosine | **0.9465** |
| median | 0.9434 |
| min / max | 0.886 / 0.9989 |
| pairs above 0.95 | **88 (43%)** |

Verbatim, three siblings under `satr_pt_rnd` — the text is identical except the
administering body and the sector percentages:

```
satr_pt_rnd__sa_41942__compete_2030
  Investigação e Desenvolvimento Tecnológico, administered by COMPETE 2030 (PT) — grant funding.
  Notified scheme: Investigação e Desenvolvimento Tecnológico.
  Registered aid objective: Industrial research (Art. 25(2)(b)).
  Sectors it has actually funded: software data ai (32%), industrial manufacturing (26%)…

satr_pt_rnd__sa_41942__centro_2030
  Investigação e Desenvolvimento Tecnológico, administered by Centro 2030 (PT) — grant funding.
  Notified scheme: Investigação e Desenvolvimento Tecnológico.
  Registered aid objective: Industrial research (Art. 25(2)(b)).
  Sectors it has actually funded: software data ai (50%), industrial manufacturing (15%)…

satr_pt_rnd__sa_41942__norte_2030
  Investigação e Desenvolvimento Tecnológico, administered by Norte 2030 (PT) — grant funding.
  Notified scheme: Investigação e Desenvolvimento Tecnológico.
  Registered aid objective: Industrial research (Art. 25(2)(b)).
  Sectors it has actually funded: software data ai (54%), industrial manufacturing (15%)…
```

Fourteen leaves share the name *"Régime cadre exempté de notification relatif aux aides à
la recherche, au développement et à l'innovation (RDI) pour la période 2024-2026"* — one
national regime, delivered by Ministère de l'économie, Caisse des dépôts, Région
Normandie, Conseil régional Nouvelle-Aquitaine and ten others.

**This is not an embedding defect. It is a data-model defect.** These are one scheme with
many granting authorities. What separates them is the applicant's *region*, which is not
in the founder's description and never will be. Asking a semantic index to choose between
them is asking it to guess. Nine of the top 20 holdout targets are exactly these leaves.

Note also: only **one** exact-duplicate `profile_text` pair exists (`eu_de_minimis` /
`eu_de_minimis_ceiling`), and only 24 of 124,750 random pairs exceed 0.98 cosine. The
problem is concentrated in the sibling groups, not diffuse.

### eligibility_embeddings text quality

Read of 20 random chunks: overwhelmingly **administrative, not thematic**. Bank-account
requirements, open-access publishing terms, AIE exclusions, "undertaking in difficulty"
definitions, GBER intensity ceilings.

| metric | value |
|---|---|
| Chunks whose exact text appears under another instrument | **1,267 (26.8%)** |
| Chunks accounted for by the **two** most-repeated strings | **994 (21.1%)** |
| SATR leaves with **zero** chunks unique to them | **284 / 497 (57.1%)** |

Those two strings, each replicated across **497 instruments**:

> Aid is not available to an undertaking in difficulty, or to one subject to an outstanding
> recovery decision. …

> Tobacco, gambling and betting, and weapons and munitions are outside the scope of this
> aid. The exclusion is set by the framework the scheme is notified under, not by the
> scheme itself.

For 57% of SATR leaves, the entire eligibility representation is text shared with 496
other funds. This index carries essentially no per-instrument identity for the largest
channel in the corpus.

---

## 3. Retrieval behaviour

10 realistic founder descriptions, `voyage-3.5`, `input_type: "query"`, cosine over both
indexes, top 10 each.

### Diversity

| index | distinct instruments in 100 slots | most repeated |
|---|---|---|
| `instrument_profiles` | **81 / 100** | `eit_food_rfs` 3, `tacr_tk` 3, `eit_innoenergy_highway` 3 |
| `eligibility_embeddings` | **51 / 100** | `innovation_fund_hbank_2024_maritime` **8/10 queries**, `eit_manufacturing_boostup` **7/10** |

Similarity band across all top-10 hits: 0.308 – 0.617, mean 0.444. Narrow, which is why
`semantic.ts` normalises by percentile rank rather than by best score — that decision is
sound and confirmed by this data.

### `instrument_profiles` — sensible

- *"lightweight composite structures for regional aircraft"* → **Clean Aviation** 0.463,
  then SIP LIGHTer (SE), NFFP (SE), Luftfahrtforschungsprogramm (DE). Correct, and the
  national analogues are correct too.
- *"precision fermentation dairy proteins"* → **EIT Food RFS** 0.617, then Norwegian
  biotech programmes. Correct.
- *"green hydrogen … alkaline electrolyser stack"* → **Innovation Fund Hbank Maritime**
  0.525, Innovation Fund Hbank, EIT InnoEnergy, CHP. Correct.
- *"quantum computing control stack with cryogenic electronics"* →
  **Quantencomputer-Demonstrationsaufbauten** (DE) 0.364, Chips JU, EuroHPC. Correct, but
  note the absolute similarity has collapsed to 0.36 — the corpus genuinely has little
  quantum text.

### `eligibility_embeddings` — not sensible

- *"SaaS platform for hospital patient scheduling"* → hit #2, #3, #8, #9 are all
  **"Turismisektori tarkvarade liitumis- ja liidestamise toetus"**, an Estonian tourism
  software-integration voucher, above IHI and every health programme.
- *"quantum computing control stack"* → top hit is **ISO 22734:2019 for hydrogen
  generators using water electrolysis**; hits 1, 3 are hydrogen electrolyser sourcing
  rules; #2 and #4 are EUSPA supply-chain security clauses.
- *"machine learning software for industrial process optimisation"* → Miljøteknologi,
  EIT Climate KIC CDR, Innovation Fund pilots.

This reproduces exactly the failure documented in the header of
`build_instrument_profiles.py`. The conclusion holds and should be enforced: **this index
must not appear in the fund-selection path.** It is for RAG over requirements once a fund
is already chosen.

---

## 4. The decisive test

`__recallSet.json`, `split=holdout`, 1,170 rows. Embed the company description, rank the
fund it actually won.

### First, a finding about the eval itself

| | rows |
|---|---|
| holdout total | 1,170 |
| `mode=project` with a **real** description | **188 (16%)** |
| `mode=profile` with `description: ""` | **982 (84%)** |

The 982 carry only a `selfDescription`, and there are **11 distinct such strings in total**:

| n rows | distinct correct answers | string |
|---|---|---|
| 179 | **87** | "We develop and commercialise software, data and AI products. We are seeking public funding for research and development work." |
| 176 | **84** | "…industrial manufacturing and machinery…" |
| 157 | **64** | "…energy and clean technology…" |
| 153 | **73** | "…other…" |
| 85 | 39 | "…mobility, transport and logistics…" |
| 71 | 43 | "…health, medtech and life sciences…" |
| 67 | 43 | "…semiconductors, electronics and photonics…" |
| 39 | 23 | "…agritech, food and forestry…" |
| 34 | 29 | "…advanced materials and chemicals…" |
| 14 | 6 | "…space technology…" |
| 7 | 7 | "…defence and security…" |

**84% of the holdout set asks the index to distinguish up to 87 different correct answers
from a single identical query vector.** No retrieval system can score above ~1/87 there.
Any headline recall number computed over the whole holdout set is measuring this, not the
index.

All targets are present in `instrument_profiles` (0 absent), so this is not a coverage
artefact.

### 4a. Rows with a real description (n=188, all EU programmes)

| | exact instrument | sibling group | within country+EU pool (mean 243) |
|---|---|---|---|
| median rank | **6** | 3 | 3 |
| mean | 39 | 16 | 12 |
| top-1 | 29.8% | 36.7% | 35.6% |
| **top-5** | **50.0%** | 60.6% | 62.2% |
| top-10 | 62.8% | 71.8% | 79.3% |
| top-20 | 70.7% | 79.8% | 84.6% |
| top-50 | 81.9% | 91.0% | 95.7% |

Out of 1,014. By bucket:

| bucket | n | median rank | top-20 |
|---|---|---|---|
| `horizon_eu_partnership` | 60 | **1** | 91.7% |
| `horizon_eu_pillar_ii` | 55 | 7 | 69.1% |
| `innovation_fund` | 25 | 12 | 60.0% |
| `edf` | 18 | 14 | 61.1% |
| `chips_ju` | 6 | 19 | 66.7% |
| `eic` | 24 | 22 | 41.7% |

Best cases land at rank 1 and are obviously right: Alstom → `europes_rail`, PHYSIO MRI
TECH → `eic_transition`, Barcelona Supercomputing Centre → `ihi`, NEXTWORKS → `sns_ju`.

Worst cases are all *thematic near-misses on horizontal programmes*: Engineering (IT) →
`horizon_eu_cl4` at rank 380, MYREMONO → `innovation_fund_ssp` at 627. These are funds
whose scope is so broad that no description pins them.

### 4b. Rows with only a sector template (n=300, all SATR)

| | exact instrument | sibling group | within country+EU pool (mean 273) |
|---|---|---|---|
| median rank | **272** | 23 | 58 |
| top-5 | **3.7%** | 17.0% | 5.0% |
| top-20 | **7.7%** | 35.7% | 18.0% |
| top-50 | 11.3% | 61.3% | 46.7% |
| random baseline top-20 | 2.0% | — | 7.3% |

Barely better than chance. But note the **sibling-group column**: median rank drops from
272 to 23 — a 12x improvement — when we only ask "did it find the right *scheme family*"
rather than "the right granting authority". The index knows roughly where to look; it
cannot pick the branch office.

### 4c. Ranking within a 58-candidate slate (most decision-relevant)

Slate = correct answer + 57 others drawn from the same country + EU pool, 3 draws per row.

| population | n | median | top-1 | top-3 | **top-5** | top-10 |
|---|---|---|---|---|---|---|
| EU rows, real description | 564 | 2 | 48.6% | 72.0% | **79.4%** | 89.7% |
| National rows, sector template | 900 | 16 | 5.8% | 12.2% | **17.2%** | 33.6% |
| random baseline | — | 29 | 1.7% | 5.2% | 8.6% | 17.2% |

Under a harder, adversarial slate (57 nearest neighbours rather than 57 random), the EU
number is bounded below by the global top-5 of **50.0%**.

**So for a founder who describes what they actually do, embedding retrieval alone puts the
correct fund in the top 5 of 58 somewhere between 50% and 79% of the time — against the
25% the product currently achieves end-to-end.**

### 4d. Oracle test — the ceiling

Query = the leaf's **own notified scheme name**, 120 random SATR leaves, ranked against
all 1,014 profiles:

| metric | value |
|---|---|
| median rank | **1** |
| mean | 2 |
| worst | 8 |
| top-1 | **80.0%** |
| top-5 | 95.8% |
| top-10 | **100.0%** |

Every one of 120 SATR leaves — including the ones sitting at 0.947 cosine from their
siblings — is recoverable at rank ≤8 when the query carries the right information. **The
index is separable. The model is fine. The vectors are not the bottleneck.**

### 4e. Rich realistic queries, live

Six hand-written multi-clause descriptions, top 8 over all 1,014:

- **FR**, chemical recycling of mixed plastics → `Investissements de recyclage des déchets
  (dont ORPLAST régénération)` 0.646, then ORPLAST 3, PDR-AAP ORPLAST 3, Fonds Économie
  Circulaire. **Exactly right.**
- **IT**, Lombardy packaging machinery, Transizione 4.0 → `Investimenti sostenibili 4.0 (PN
  RIC 2021-2027)` 0.651. **Right.**
- **SE**, lightweight vehicle composites → NFFP etapp 8 0.535, SIP LIGHTer, FFI. **Right.**
- **NL**, Brabant photonics → OPZuid / NXTGEN HIGHTECH / IPCEI Micro. **Right.**
- **DE**, Bavarian machine-tool AI predictive maintenance → top hit is
  `FRL MINT-Fachkräfteprogramm ESF Plus` (a **STEM-workforce** programme). **Miss** — the
  correct `Bayerisches Technologieförderungsprogramm` family is present but below.
- **ES**, Galician dairy experimental development → EIT Food, then **four Norwegian**
  programmes. Best in-country is 0.536, below six foreign funds. **Hard failure, and it is
  a coverage failure**: ES has 7 instruments, none with title text.

The pattern is clear — where the corpus has scheme-level text, retrieval is good; where it
does not (ES, and Germany's thinly-profiled SATR leaves), it fails.

---

## 5. What to do

In descending order of expected effect on the 25%:

1. **Get a real description into the query.** This is the single largest lever and it is
   not an ML problem. 84% of the eval — and, by implication, a large share of production
   intake — is a sector label. The gap between 17.2% and 79.4% top-5 is almost entirely
   this. Nothing else on this list matters as much.

2. **Stop asking retrieval to choose between regional delivery bodies.** Collapse the 119
   same-name SATR leaves into one instrument per notified scheme, and make the granting
   authority a *routing attribute* resolved by the applicant's region, not a retrieval
   target. This converts an impossible semantic decision into a deterministic filter. It
   also makes the eval honest: the sibling-group median rank of 23 is the number that
   would then apply, not 272.

3. **Remove `eligibility_embeddings` from the selection path entirely**, if it is still
   there. 57% of SATR leaves have no unique chunk in it, 21% of the index is two boilerplate
   strings, and its live behaviour (Estonian tourism vouchers for hospital software) is
   actively harmful. Keep it for post-selection requirement RAG, which is what it is for.

4. **Fix Spain, then EE/LV/PL/GB-eligibility.** ES is 16,642 events with zero title text
   and demonstrably retrieves foreign funds for domestic companies. The per-scheme page
   fetch that produced the good `satr_pt_rnd__sa_110394` profile is the proven remedy.

5. **Prune the 87 orphan profiles** — stale vectors that still rank in every query. One
   incremental `build_instrument_profiles.py run`.

6. **Backfill titles for the six largest zero-title instruments.** `satr_de_rnd`,
   `satr_it_equity`, `bdns_es_ayudas`, `satr_fr_rnd`, `satr_it_rnd` and
   `innovate_uk__collaborative_r_d` are 92,000 events profiled on procedure text alone.
   Their per-child `sample_project_titles` path already exists; the title-kind classifier
   is (correctly) suppressing the parent's, so the fix is child-level.

7. **Consider ranking with the embedding rather than only re-ranking with the LLM.** At
   50–79% top-5 of 58 on described companies against 25% observed, the embedding is
   currently *more* accurate than the stage consuming it. Worth measuring directly before
   investing further in the prompt.

Minor: the comment in `website/frontend/lib/intelligence/semantic.ts` still says
"instrument_profiles holds one row per instrument (322 of them)". It is 1,014. The logic
is unaffected — it scores every row — but the number misleads.
