# BioNTech — Life sciences

arm=adviser · depth=40 · count=6 · effort=high · lookups=5 · pool=18 · published cap=7

## 1. The founder, as the system saw them

country `Germany` · sector `health_life_sciences` · matched in the corpus: **true** (subsector `pharma_drug_discovery`)

description, verbatim:

```
mRNA immunotherapies and vaccines, clinical and commercial stage
```

the intake lines handed to the selector:

- how much they are looking for: gt50m
- what they build: health_life_sciences
- what the money is for: experimental_development, industrial_research
- able to run in a 3+ partner consortium: unsure
- countries where they already have an entity: Germany
- stage: scaling_revenue
- headcount: 250+
- aid-law exclusions they declared: none
- accumulated losses over half of subscribed capital: no
- co-financing they can put up: >50%
- how they would borrow: operating

ranking fields NOT answered: region

DB-native peers feeding tier 1: Pharmaserv GmbH, Roche Diagnostics GmbH, LANXESS Deutschland GmbH, Takeda GmbH

**Withheld from the selector by construction:** `usedInField` (tier 1 of the shipped row sort), `instrument_profiles.profile_text` (real winning project titles), and the company name — the prompt says the country and the sector and never who they are.

## 2. The pool the model read (18 rows, shipped order)

| # | fund | body · capital · typical award | our verdict | picked |
|---:|---|---|---|:---:|
| 0 | Gh Edctp3 |  · grant · EUR 325k | nothing rules them out | **✓** |
| 1 | Horizon EU CL1 |  · grant · EUR 415k | nothing rules them out | **✓** |
| 2 | IHI |  · grant · EUR 448k | nothing rules them out | **✓** |
| 3 | Clean Aviation |  · grant · EUR 653k | nothing rules them out |  |
| 4 | Horizon EU CL4 |  · grant · EUR 382k | nothing rules them out |  |
| 5 | Horizon EU Miss |  · grant · EUR 294k | nothing rules them out | **✓** |
| 6 | CHP |  · grant · EUR 405k | no rule evaluable |  |
| 7 | Sns JU |  · grant · EUR 386k | no rule evaluable |  |
| 8 | Horizon EU CL3 |  · grant · EUR 272k | nothing rules them out |  |
| 9 | Eurohpc |  · grant · EUR 327k | no rule evaluable |  |
| 10 | Horizon EU CL6 |  · grant · EUR 282k | one blocker: Company's share of project funding (ticket) typically fal... |  |
| 11 | ERC POC |  · grant · EUR 150k | nothing rules them out | **✓** |
| 12 | Europes Rail |  · grant · EUR 281k | no rule evaluable |  |
| 13 | Euspa |  · grant · EUR 246k | no rule evaluable |  |
| 14 | Sesar JU |  · grant · EUR 245k | nothing rules them out |  |
| 15 | EIC Transition |  · grant · EUR 660k | nothing rules them out | **✓** |
| 16 | EIC Pathfinder |  · grant · EUR 495k | one blocker: Applicants must form a consortium of at least three diffe... |  |
| 17 | Innovation Fund Battery |  · grant · EUR 90.8M | nothing rules them out |  |

## 3. What the model chose

| its rank | pool rank | fund | what the scheme says it funds |
|---:|---:|---|---|
| 1 | 1 | Horizon EU CL1 | Collaborative R&I grants for health research that generates clinical evidence — disease... |
| 2 | 0 | Gh Edctp3 | Grants · mostly health & life sciences |
| 3 | 2 | IHI | Grants · mostly health & life sciences |
| 4 | 15 | EIC Transition | EIC Transition: maturing a proof of concept from an earlier EU-funded project towards m... |
| 5 | 5 | Horizon EU Miss | Grants that implement five named EU Missions — Adaptation to Climate Change, Cancer, 10... |
| 6 | 11 | ERC POC | A EUR 150 000, 18-month lump sum that lets a current or recent ERC frontier-research gr... |

Deepest reach: pool rank **15** of 17. Picks drawn from the shipped top 6: **4 of 6**.

It declared **nothing** unsure, so no retrieval fired and round two never ran.

Against the peer prior (what companies in this country and sector have really won): followed **3**, overrode **0**, reached past it for **3**.

## 4. What would publish (projection, 7-row cap)

Production's own `orderMemoCandidates` + `buildRowsForCheck` on each arm's pool. NOT a proof: the writer can reorder, omit and demote, and all three are model outputs.

| # | shipped order (arm off) | arm adviser |
|---:|---|---|
| 1 | Gh Edctp3 | Horizon EU CL1 |
| 2 | Horizon EU CL1 | Gh Edctp3 |
| 3 | IHI | IHI |
| 4 | Clean Aviation | EIC Transition |
| 5 | Horizon EU CL4 | Horizon EU Miss |
| 6 | Horizon EU Miss | ERC POC |
| 7 | Horizon EU CL3 | Clean Aviation |

**Entered the table** (2): EIC Transition _(was pool rank 15)_; ERC POC _(was pool rank 11)_

**Left the table** (2): Horizon EU CL4 _(was pool rank 4)_; Horizon EU CL3 _(was pool rank 8)_
