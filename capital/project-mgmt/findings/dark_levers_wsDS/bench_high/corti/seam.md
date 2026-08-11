# Corti — MedTech

arm=adviser · depth=40 · count=6 · effort=high · lookups=5 · pool=18 · published cap=7

## 1. The founder, as the system saw them

country `Denmark` · sector `health_life_sciences` · matched in the corpus: **true** (subsector `digital_health`)

description, verbatim:

```
Real-time AI copilot for clinical consultations and emergency triage
```

the intake lines handed to the selector:

- how much they are looking for: b2m5_15m
- what they build: health_life_sciences
- what the money is for: experimental_development, industrial_research
- able to run in a 3+ partner consortium: unsure
- countries where they already have an entity: Denmark
- stage: pilot_customers
- headcount: 50-249
- aid-law exclusions they declared: none
- accumulated losses over half of subscribed capital: no
- co-financing they can put up: >50%
- how they would borrow: operating

ranking fields NOT answered: region

DB-native peers feeding tier 1: AATE VR, DemensAI ApS, Centre for Telepsychiatry, LAEGEMIDDELSTYRELSEN

**Withheld from the selector by construction:** `usedInField` (tier 1 of the shipped row sort), `instrument_profiles.profile_text` (real winning project titles), and the company name — the prompt says the country and the sector and never who they are.

## 2. The pool the model read (18 rows, shipped order)

| # | fund | body · capital · typical award | our verdict | picked |
|---:|---|---|---|:---:|
| 0 | Internationale Samarbejder |  · grant · EUR 390k | nothing rules them out | **✓** |
| 1 | Global Research Collaborations |  · grant · EUR 349k | nothing rules them out |  |
| 2 | Innoexplorer | Innovationsfonden · grant · EUR 201k | nothing rules them out |  |
| 3 | Innobooster | Innovationsfonden · grant · EUR 80k | one blocker: Innovation Fund Denmark co-finances a maximum of 35 per c... |  |
| 4 | Erhvervsforsker |  · grant · EUR 148k | nothing rules them out |  |
| 5 | ERC POC |  · grant · EUR 150k | nothing rules them out |  |
| 6 | EIC Transition |  · grant · EUR 660k | nothing rules them out | **✓** |
| 7 | Horizon EU CL1 |  · grant · EUR 415k | nothing rules them out | **✓** |
| 8 | Horizon EU CL6 |  · grant · EUR 282k | nothing rules them out |  |
| 9 | Horizon EU Miss |  · grant · EUR 294k | nothing rules them out |  |
| 10 | IHI |  · grant · EUR 448k | nothing rules them out | **✓** |
| 11 | Gh Edctp3 |  · grant · EUR 325k | nothing rules them out | **✓** |
| 12 | Clean Aviation |  · grant · EUR 653k | nothing rules them out |  |
| 13 | Horizon EU CL4 |  · grant · EUR 382k | nothing rules them out | **✓** |
| 14 | Horizon EU CL5 |  · grant · EUR 339k | nothing rules them out |  |
| 15 | CHP |  · grant · EUR 405k | no rule evaluable |  |
| 16 | Horizon EU CBE |  · grant · EUR 324k | nothing rules them out |  |
| 17 | Sns JU |  · grant · EUR 386k | no rule evaluable |  |

## 3. What the model chose

| its rank | pool rank | fund | what the scheme says it funds |
|---:|---:|---|---|
| 1 | 10 | IHI | Grants · mostly health & life sciences |
| 2 | 6 | EIC Transition | EIC Transition: maturing a proof of concept from an earlier EU-funded project towards m... |
| 3 | 7 | Horizon EU CL1 | Collaborative R&I grants for health research that generates clinical evidence — disease... |
| 4 | 0 | Internationale Samarbejder | Grants · mostly health & life sciences |
| 5 | 11 | Gh Edctp3 | Grants · mostly health & life sciences |
| 6 | 13 | Horizon EU CL4 | Collaborative R&I and innovation grants for the EU's technology sovereignty stack — AI,... |

Deepest reach: pool rank **13** of 17. Picks drawn from the shipped top 6: **1 of 6**.

It declared **nothing** unsure, so no retrieval fired and round two never ran.

Against the peer prior (what companies in this country and sector have really won): followed **5**, overrode **6**, reached past it for **1**.

## 4. What would publish (projection, 7-row cap)

Production's own `orderMemoCandidates` + `buildRowsForCheck` on each arm's pool. NOT a proof: the writer can reorder, omit and demote, and all three are model outputs.

| # | shipped order (arm off) | arm adviser |
|---:|---|---|
| 1 | Internationale Samarbejder | IHI |
| 2 | Global Research Collaborations | EIC Transition |
| 3 | Innoexplorer | Horizon EU CL1 |
| 4 | Erhvervsforsker | Internationale Samarbejder |
| 5 | ERC POC | Gh Edctp3 |
| 6 | EIC Transition | Horizon EU CL4 |
| 7 | Horizon EU CL1 | Global Research Collaborations |

**Entered the table** (3): IHI _(was pool rank 10)_; Gh Edctp3 _(was pool rank 11)_; Horizon EU CL4 _(was pool rank 13)_

**Left the table** (3): Innoexplorer _(was pool rank 2)_; Erhvervsforsker _(was pool rank 4)_; ERC POC _(was pool rank 5)_
