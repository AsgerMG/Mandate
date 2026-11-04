# Neura Robotics — Robotics

arm=adviser · depth=40 · count=6 · effort=low · lookups=5 · pool=18 · published cap=7

## 1. The founder, as the system saw them

country `Germany` · sector `industrial_manufacturing` · matched in the corpus: **true** (subsector `robotics_automation`)

description, verbatim:

```
Cognitive humanoid and cobot systems for industrial automation
```

the intake lines handed to the selector:

- how much they are looking for: b15m_50m
- what they build: industrial_manufacturing
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

DB-native peers feeding tier 1: GERMAN BIONIC SYSTEMS GMBH, FFT PRODUKTIONSSYSTEME, Schneider Electic Automation, Neura Robotics GmbH

**Withheld from the selector by construction:** `usedInField` (tier 1 of the shipped row sort), `instrument_profiles.profile_text` (real winning project titles), and the company name — the prompt says the country and the sector and never who they are.

## 2. The pool the model read (18 rows, shipped order)

| # | fund | body · capital · typical award | our verdict | picked |
|---:|---|---|---|:---:|
| 0 | Horizon EU CL1 |  · grant · EUR 415k | nothing rules them out |  |
| 1 | Horizon EU CL4 |  · grant · EUR 382k | nothing rules them out | **✓** |
| 2 | Horizon EU Miss |  · grant · EUR 294k | nothing rules them out | **✓** |
| 3 | Horizon EU CL3 |  · grant · EUR 272k | nothing rules them out | **✓** |
| 4 | Horizon EU CL6 |  · grant · EUR 282k | one blocker: Company's share of project funding (ticket) typically fal... | **✓** |
| 5 | ERC POC |  · grant · EUR 150k | nothing rules them out |  |
| 6 | EIC Transition |  · grant · EUR 660k | nothing rules them out |  |
| 7 | EIC Pathfinder |  · grant · EUR 495k | one blocker: Applicants must form a consortium of at least three diffe... | **✓** |
| 8 | Innovation Fund SSP |  · grant · EUR 4.0M | nothing rules them out |  |
| 9 | Innovation Fund Battery |  · grant · EUR 90.8M | one blocker: Project must be at commercial demonstration scale, requir... |  |
| 10 | Innovation Fund MSP |  · grant · EUR 29.4M | one blocker: Funds must finance first-of-a-kind commercial-scale net-z... |  |
| 11 | Clean Aviation |  · grant · EUR 653k | nothing rules them out | **✓** |
| 12 | IHI |  · grant · EUR 448k | nothing rules them out |  |
| 13 | CHP |  · grant · EUR 405k | no rule evaluable |  |
| 14 | Sns JU |  · grant · EUR 386k | no rule evaluable |  |
| 15 | Eurohpc |  · grant · EUR 327k | no rule evaluable |  |
| 16 | Gh Edctp3 |  · grant · EUR 325k | nothing rules them out |  |
| 17 | Europes Rail |  · grant · EUR 281k | no rule evaluable |  |

## 3. What the model chose

| its rank | pool rank | fund | what the scheme says it funds |
|---:|---:|---|---|
| 1 | 1 | Horizon EU CL4 | Collaborative R&I and innovation grants for the EU's technology sovereignty stack — AI,... |
| 2 | 7 | EIC Pathfinder | EIC Pathfinder: early-stage research on future and emerging technologies. Distinguishin... |
| 3 | 4 | Horizon EU CL6 | Collaborative research and innovation grants for food systems, farming, forestry, fishe... |
| 4 | 3 | Horizon EU CL3 | Collaborative R&I and innovation grants for civil security technology — fighting crime ... |
| 5 | 2 | Horizon EU Miss | Grants that implement five named EU Missions — Adaptation to Climate Change, Cancer, 10... |
| 6 | 11 | Clean Aviation | Grants · mostly mobility & transport |

Deepest reach: pool rank **11** of 17. Picks drawn from the shipped top 6: **4 of 6**.

It declared **nothing** unsure, so no retrieval fired and round two never ran.

Against the peer prior (what companies in this country and sector have really won): followed **0**, overrode **0**, reached past it for **6**.

## 4. What would publish (projection, 7-row cap)

Production's own `orderMemoCandidates` + `buildRowsForCheck` on each arm's pool. NOT a proof: the writer can reorder, omit and demote, and all three are model outputs.

| # | shipped order (arm off) | arm adviser |
|---:|---|---|
| 1 | Horizon EU CL1 | Horizon EU CL4 |
| 2 | Horizon EU CL4 | Horizon EU CL3 |
| 3 | Horizon EU Miss | Horizon EU Miss |
| 4 | Horizon EU CL3 | Clean Aviation |
| 5 | ERC POC | Horizon EU CL1 |
| 6 | EIC Transition | ERC POC |
| 7 | Innovation Fund SSP | EIC Transition |

**Entered the table** (1): Clean Aviation _(was pool rank 11)_

**Left the table** (1): Innovation Fund SSP _(was pool rank 8)_
