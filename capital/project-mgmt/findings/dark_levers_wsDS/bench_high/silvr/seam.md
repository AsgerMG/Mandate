# Silvr — FinTech (business lending)

arm=adviser · depth=40 · count=6 · effort=high · lookups=5 · pool=18 · published cap=7

## 1. The founder, as the system saw them

country `France` · sector `software_data_ai` · matched in the corpus: **true** (subsector ``)

description, verbatim:

```
Revenue-based financing for e-commerce and SME businesses
```

the intake lines handed to the selector:

- how much they are looking for: b2m5_15m
- what they build: software_data_ai
- what the money is for: experimental_development, industrial_research
- able to run in a 3+ partner consortium: unsure
- countries where they already have an entity: France
- stage: scaling_revenue
- headcount: 50-249
- regulated activities they are in: financial_services
- aid-law exclusions they declared: none
- accumulated losses over half of subscribed capital: no
- co-financing they can put up: >50%
- how they would borrow: balance_sheet_lender

ranking fields NOT answered: region

DB-native peers feeding tier 1: (none)

**Withheld from the selector by construction:** `usedInField` (tier 1 of the shipped row sort), `instrument_profiles.profile_text` (real winning project titles), and the company name — the prompt says the country and the sector and never who they are.

## 2. The pool the model read (18 rows, shipped order)

| # | fund | body · capital · typical award | our verdict | picked |
|---:|---|---|---|:---:|
| 0 | Régime cadre exempté de notification relatif aux aides en faveur des ... | Ministère de l'économie et des finances · grant · EUR 999k | nothing rules them out | **✓** |
| 1 | Régime cadre exempté de notification relatif aux aides à la recherche... | Ministère de l'économie et des finances · grant · EUR 953k | nothing rules them out | **✓** |
| 2 | Soutien à la modernisation des industries techniques et à l'innovatio... | CNC · grant · EUR 90k | nothing rules them out |  |
| 3 | Bpifrance · inov |  · grant · EUR 449k | one blocker: Applicant is a single operating company (not a fund or ho... |  |
| 4 | Ministère de l'Agriculture et de l'alimentation | Ministère de l'Agriculture et de l'al... · grant · EUR 454k | nothing rules them out |  |
| 5 | Régime cadre exempté de notification relatif aux aides à la recherche... | Ministère de l'économie et des finances · grant · EUR 375k | nothing rules them out |  |
| 6 | Régime cadre exempté de notification relatif aux aides à la recherche... | Ministère de la Transition écologique... · grant · EUR 243k | nothing rules them out |  |
| 7 | Ministère de l'économie et des finances · rnd sa 40391 ministere de l... | Ministère de l'économie et des finances · grant · EUR 899k | nothing rules them out |  |
| 8 | Régime cadre exempté de notification relatif aux aides à la recherche... | Ministère des Armées · grant · EUR 276k | nothing rules them out | **✓** |
| 9 | Régime cadre exempté de notification relatif aux aides à la recherche... | Conseil régional d'Ile-de-France · grant · EUR 250k | nothing rules them out | **✓** |
| 10 | Horizon EU CL1 |  · grant · EUR 415k | nothing rules them out |  |
| 11 | Régime exempté de notification N°SA.XXXXX relatif aux aides à la rech... | Ministère de la Transition écologique... · grant · EUR 484k | nothing rules them out |  |
| 12 | Régime cadre exempté de notification relatif aux aides à la recherche... | Conseil régional · grant · EUR 212k | nothing rules them out |  |
| 13 | Régime cadre exempté de notification relatif aux aides à la recherche... | REGION GRAND EST · grant · EUR 174k | nothing rules them out |  |
| 14 | Régime cadre exempté de notification relatif aux aides à la recherche... | Conseil régional Nouvelle-Aquitaine · grant · EUR 220k | nothing rules them out |  |
| 15 | Régime cadre exempté de notification relatif aux aides à la recherche... | Conseil régional Occitanie · grant · EUR 300k | nothing rules them out |  |
| 16 | EIC Accelerator |  · grant · EUR 2.5M | nothing rules them out | **✓** |
| 17 | EIB Venture |  · loan · EUR 20.0M | nothing rules them out | **✓** |

## 3. What the model chose

| its rank | pool rank | fund | what the scheme says it funds |
|---:|---:|---|---|
| 1 | 16 | EIC Accelerator | EIC Accelerator: blended finance for single companies taking a validated technology to ... |
| 2 | 17 | EIB Venture | Loans · mostly health & life sciences |
| 3 | 1 | Régime cadre exempté de notification relatif aux aides à la rec... | Grants · mostly software & AI |
| 4 | 0 | Régime cadre exempté de notification relatif aux aides en faveu... | Ce régime cadre d’aides en faveur des PME sert de base juridique nationale, conformémen... |
| 5 | 8 | Régime cadre exempté de notification relatif aux aides à la rec... | Le présent régime cadre a pour objet de servir de base juridique nationale aux aides d’... |
| 6 | 9 | Régime cadre exempté de notification relatif aux aides à la rec... | Appel à projets collaboratifs IRRI (Innovation de Rupture et Résilience Industrielle) -... |

Deepest reach: pool rank **17** of 17. Picks drawn from the shipped top 6: **2 of 6**.

It declared **nothing** unsure, so no retrieval fired and round two never ran.

Against the peer prior (what companies in this country and sector have really won): followed **6**, overrode **12**, reached past it for **0**.

## 4. What would publish (projection, 7-row cap)

Production's own `orderMemoCandidates` + `buildRowsForCheck` on each arm's pool. NOT a proof: the writer can reorder, omit and demote, and all three are model outputs.

| # | shipped order (arm off) | arm adviser |
|---:|---|---|
| 1 | Régime cadre exempté de notification relatif aux aides en... | EIC Accelerator |
| 2 | Régime cadre exempté de notification relatif aux aides à ... | EIB Venture |
| 3 | Soutien à la modernisation des industries techniques et à... | Régime cadre exempté de notification relatif aux aides à ... |
| 4 | Ministère de l'Agriculture et de l'alimentation | Régime cadre exempté de notification relatif aux aides en... |
| 5 | Régime cadre exempté de notification relatif aux aides à ... | Régime cadre exempté de notification relatif aux aides à ... |
| 6 | Régime cadre exempté de notification relatif aux aides à ... | Régime cadre exempté de notification relatif aux aides à ... |
| 7 | Ministère de l'économie et des finances · rnd sa 40391 mi... | Soutien à la modernisation des industries techniques et à... |

**Entered the table** (4): EIC Accelerator _(was pool rank 16)_; EIB Venture _(was pool rank 17)_; Régime cadre exempté de notification relatif aux aides à la recherc... _(was pool rank 8)_; Régime cadre exempté de notification relatif aux aides à la recherc... _(was pool rank 9)_

**Left the table** (4): Ministère de l'Agriculture et de l'alimentation _(was pool rank 4)_; Régime cadre exempté de notification relatif aux aides à la recherc... _(was pool rank 5)_; Régime cadre exempté de notification relatif aux aides à la recherc... _(was pool rank 6)_; Ministère de l'économie et des finances · rnd sa 40391 ministere de... _(was pool rank 7)_
