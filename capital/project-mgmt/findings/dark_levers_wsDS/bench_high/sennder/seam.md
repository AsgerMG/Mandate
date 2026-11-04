# sennder — Platform

arm=adviser · depth=40 · count=6 · effort=high · lookups=5 · pool=18 · published cap=7

## 1. The founder, as the system saw them

country `Germany` · sector `mobility_transport` · matched in the corpus: **false**

description, verbatim:

```
Digital road freight forwarding platform matching shippers with carriers
```

the intake lines handed to the selector:

- how much they are looking for: b2m5_15m
- what they build: mobility_transport
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

DB-native peers feeding tier 1: (none)

**Withheld from the selector by construction:** `usedInField` (tier 1 of the shipped row sort), `instrument_profiles.profile_text` (real winning project titles), and the company name — the prompt says the country and the sector and never who they are.

## 2. The pool the model read (18 rows, shipped order)

| # | fund | body · capital · typical award | our verdict | picked |
|---:|---|---|---|:---:|
| 0 | Clean Aviation |  · grant · EUR 653k | nothing rules them out | **✓** |
| 1 | Europes Rail |  · grant · EUR 281k | no rule evaluable | **✓** |
| 2 | Sesar JU |  · grant · EUR 245k | nothing rules them out | **✓** |
| 3 | EIC Transition |  · grant · EUR 660k | nothing rules them out |  |
| 4 | EIC Pathfinder |  · grant · EUR 495k | one blocker: Applicants must form a consortium of at least three diffe... |  |
| 5 | IHI |  · grant · EUR 448k | nothing rules them out |  |
| 6 | CHP |  · grant · EUR 405k | no rule evaluable |  |
| 7 | Sns JU |  · grant · EUR 386k | no rule evaluable |  |
| 8 | Horizon EU CL1 |  · grant · EUR 415k | nothing rules them out |  |
| 9 | Eurohpc |  · grant · EUR 327k | no rule evaluable |  |
| 10 | Horizon EU CL4 |  · grant · EUR 382k | nothing rules them out | **✓** |
| 11 | Gh Edctp3 |  · grant · EUR 325k | nothing rules them out |  |
| 12 | Horizon EU Miss |  · grant · EUR 294k | nothing rules them out | **✓** |
| 13 | Horizon EU CL6 |  · grant · EUR 282k | nothing rules them out |  |
| 14 | Horizon EU CL3 |  · grant · EUR 272k | nothing rules them out |  |
| 15 | ERC POC |  · grant · EUR 150k | nothing rules them out |  |
| 16 | Euspa |  · grant · EUR 246k | no rule evaluable |  |
| 17 | IPCEI |  · ? · no median | no rule evaluable | **✓** |

## 3. What the model chose

| its rank | pool rank | fund | what the scheme says it funds |
|---:|---:|---|---|
| 1 | 1 | Europes Rail | Grants · mostly mobility & transport |
| 2 | 0 | Clean Aviation | Grants · mostly mobility & transport |
| 3 | 10 | Horizon EU CL4 | Collaborative R&I and innovation grants for the EU's technology sovereignty stack — AI,... |
| 4 | 17 | IPCEI |  |
| 5 | 12 | Horizon EU Miss | Grants that implement five named EU Missions — Adaptation to Climate Change, Cancer, 10... |
| 6 | 2 | Sesar JU | Grants · mostly mobility & transport |

Deepest reach: pool rank **17** of 17. Picks drawn from the shipped top 6: **3 of 6**.

It declared **nothing** unsure, so no retrieval fired and round two never ran.

Against the peer prior (what companies in this country and sector have really won): followed **3**, overrode **0**, reached past it for **2**.

## 4. What would publish (projection, 7-row cap)

Production's own `orderMemoCandidates` + `buildRowsForCheck` on each arm's pool. NOT a proof: the writer can reorder, omit and demote, and all three are model outputs.

| # | shipped order (arm off) | arm adviser |
|---:|---|---|
| 1 | Clean Aviation | Clean Aviation |
| 2 | Sesar JU | Horizon EU CL4 |
| 3 | EIC Transition | Horizon EU Miss |
| 4 | IHI | Sesar JU |
| 5 | Horizon EU CL1 | EIC Transition |
| 6 | Horizon EU CL4 | IHI |
| 7 | Gh Edctp3 | Horizon EU CL1 |

**Entered the table** (1): Horizon EU Miss _(was pool rank 12)_

**Left the table** (1): Gh Edctp3 _(was pool rank 11)_
