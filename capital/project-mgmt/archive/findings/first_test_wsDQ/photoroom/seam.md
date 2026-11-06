# Photoroom — AI B2C software

arm=adviser · depth=40 · count=6 · effort=low · lookups=5 · pool=18 · published cap=7

## 1. The founder, as the system saw them

country `France` · sector `software_data_ai` · matched in the corpus: **true** (subsector ``)

description, verbatim:

```
Consumer generative AI app for product photography and image editing
```

the intake lines handed to the selector:

- how much they are looking for: b2m5_15m
- what they build: software_data_ai
- what the money is for: experimental_development, industrial_research
- able to run in a 3+ partner consortium: unsure
- countries where they already have an entity: France
- stage: scaling_revenue
- headcount: 50-249
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
| 0 | Soutien à la modernisation des industries techniques et à l'innovatio... | CNC · grant · EUR 90k | nothing rules them out | **✓** |
| 1 | Bpifrance · inov |  · grant · EUR 449k | nothing rules them out | **✓** |
| 2 | Horizon EU CL1 |  · grant · EUR 415k | nothing rules them out |  |
| 3 | Régime exempté de notification N°SA.XXXXX relatif aux aides à la rech... | Ministère de la Transition écologique... · grant · EUR 484k | nothing rules them out |  |
| 4 | Régime cadre exempté de notification relatif aux aides à la recherche... | Ministère de l'économie et des finances · grant · EUR 953k | nothing rules them out | **✓** |
| 5 | EIC Accelerator |  · grant · EUR 2.5M | nothing rules them out | **✓** |
| 6 | EIB Venture |  · loan · EUR 20.0M | nothing rules them out | **✓** |
| 7 | Tender for PV installations on buildings with a rated power between 1... | Ministère de la Transition écologique... · grant · EUR 1.3M | nothing rules them out |  |
| 8 | Appels d'offres pour installations énergie solaire au sol entre 500 k... | Ministère de la Transition écologique... · grant · EUR 4.8M | nothing rules them out |  |
| 9 | Complément de rémunération pour l'éolien terrestre àpd 2017 | Ministère de la Transition écologique... · grant · EUR 14.9M | nothing rules them out |  |
| 10 | Régime cadre exempté de notification relatif aux aides en faveur des ... | Ministère de l'économie et des finances · grant · EUR 981k | nothing rules them out |  |
| 11 | Régime cadre exempté de notification relatif aux aides à la protectio... | Conseil régional Nouvelle-Aquitaine · grant · EUR 750k | nothing rules them out |  |
| 12 | Régime d’aides de l’ADEME exempté de notification relatif aux aides à... | Ministère de la Transition écologique... · grant · EUR 1.1M | nothing rules them out |  |
| 13 | Régime cadre exempté de notification relatif aux aides à la protectio... | Ministère de la Transition écologique... · grant · EUR 1.8M | nothing rules them out |  |
| 14 | Régime cadre exempté relatif aux aides en faveur de la protection de ... | Ministère de la Transition écologique... · grant · EUR 432k | nothing rules them out |  |
| 15 | Bpifrance · pmup idf |  · grant · EUR 500k | nothing rules them out | **✓** |
| 16 | EIC Transition |  · grant · EUR 660k | nothing rules them out |  |
| 17 | EIC Pathfinder |  · grant · EUR 495k | one blocker: Applicants must form a consortium of at least three diffe... |  |

## 3. What the model chose

| its rank | pool rank | fund | what the scheme says it funds |
|---:|---:|---|---|
| 1 | 1 | Bpifrance · inov | Grants · mostly software & AI |
| 2 | 0 | Soutien à la modernisation des industries techniques et à l'inn... | Aides aux moyens techniques de production et de diffusion, CNC. |
| 3 | 4 | Régime cadre exempté de notification relatif aux aides à la rec... | Grants · mostly software & AI |
| 4 | 5 | EIC Accelerator | EIC Accelerator: blended finance for single companies taking a validated technology to ... |
| 5 | 6 | EIB Venture | Loans · mostly health & life sciences |
| 6 | 15 | Bpifrance · pmup idf | Grants · 2 regions · mostly industrial manufacturing |

Deepest reach: pool rank **15** of 17. Picks drawn from the shipped top 6: **4 of 6**.

It declared **nothing** unsure, so no retrieval fired and round two never ran.

Against the peer prior (what companies in this country and sector have really won): followed **5**, overrode **2**, reached past it for **1**.

## 4. What would publish (projection, 7-row cap)

Production's own `orderMemoCandidates` + `buildRowsForCheck` on each arm's pool. NOT a proof: the writer can reorder, omit and demote, and all three are model outputs.

| # | shipped order (arm off) | arm adviser |
|---:|---|---|
| 1 | Soutien à la modernisation des industries techniques et à... | Bpifrance · inov |
| 2 | Bpifrance · inov | Soutien à la modernisation des industries techniques et à... |
| 3 | Horizon EU CL1 | Régime cadre exempté de notification relatif aux aides à ... |
| 4 | Régime exempté de notification N°SA.XXXXX relatif aux aid... | EIC Accelerator |
| 5 | Régime cadre exempté de notification relatif aux aides à ... | EIB Venture |
| 6 | EIC Accelerator | Bpifrance · pmup idf |
| 7 | EIB Venture | Horizon EU CL1 |

**Entered the table** (1): Bpifrance · pmup idf _(was pool rank 15)_

**Left the table** (1): Régime exempté de notification N°SA.XXXXX relatif aux aides à la re... _(was pool rank 3)_
