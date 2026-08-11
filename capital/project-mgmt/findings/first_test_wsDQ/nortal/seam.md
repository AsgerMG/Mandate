# Nortal — GovTech

arm=adviser · depth=40 · count=6 · effort=low · lookups=5 · pool=18 · published cap=7

## 1. The founder, as the system saw them

country `Estonia` · sector `software_data_ai` · matched in the corpus: **false**

description, verbatim:

```
Digital government platforms, e-identity and public sector data services
```

the intake lines handed to the selector:

- how much they are looking for: b2m5_15m
- what they build: software_data_ai
- what the money is for: experimental_development, industrial_research
- able to run in a 3+ partner consortium: unsure
- countries where they already have an entity: Estonia
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
| 0 | Ida-Viru ettevotluse investeeringute toetus |  · grant · EUR 4.6M | nothing rules them out | **✓** |
| 1 | Ettevotte investeeringu toetus (enterprise investment) |  · grant · EUR 1.9M | one blocker: Applicant must be an SME |  |
| 2 | Turismisektori kesksete digilahenduste toetus |  · grant · EUR 291k | nothing rules them out |  |
| 3 | Rakendusuuringu ja tootearenduse toetus | Ettevõtluse ja Innovatsiooni Sihtasutus · grant · EUR 232k | nothing rules them out | **✓** |
| 4 | Ettevõtete tootearendustoetus |  · grant · EUR 207k | nothing rules them out | **✓** |
| 5 | Ettevõtja teadus- ja arendustöötaja toetus 2025 | EIS (KredEx + Enterprise Estonia) · grant · EUR 6k | nothing rules them out |  |
| 6 | Starditoetus (start-up grant) |  · grant · EUR 20k | nothing rules them out |  |
| 7 | Ettevõtja teadus- ja arendustöötaja toetus 2024 | EIS (KredEx + Enterprise Estonia) · grant · EUR 5k | nothing rules them out |  |
| 8 | Innovatsiooniosak ja arendusosak |  · grant · EUR 7k | nothing rules them out |  |
| 9 | Ettevõtja rakendusuuringute toetus (alates 02.06.2023) | Ettevõtluse ja Innovatsiooni Sihtasutus · grant · EUR 116k | nothing rules them out | **✓** |
| 10 | Ettevotte arenguprogramm (enterprise development) |  · grant · EUR 214k | one blocker: Applicant must be an SME (within EU SME definition) by st... |  |
| 11 | Ettevõtte arenguprogrammi toetus 2024-2027 | Ettevõtluse ja Innovatsiooni Sihtasutus · grant · EUR 72k | nothing rules them out |  |
| 12 | Ettevõtja rakendusuuringute toetus (2024 muutmine) | Ettevõtluse ja Innovatsiooni Sihtasutus · grant · EUR 143k | nothing rules them out | **✓** |
| 13 | Ettevõtete digipöörde toetus (pikendamine kuni 31.12.2026) | Ettevõtluse ja Innovatsiooni Sihtasutus · grant · EUR 82k | nothing rules them out | **✓** |
| 14 | Loomeettevotjate ekspordivoimekuse toetus (creative export) |  · grant · EUR 50k | one blocker: Applicant must be an SME (per EU SME definition) |  |
| 15 | Digitaliseerimise teekaardi toetus | EIS (KredEx + Enterprise Estonia) · grant · EUR 7k | nothing rules them out |  |
| 16 | Loomeettevotjate arenguplaani toetus (creative sector) |  · grant · EUR 75k | nothing rules them out |  |
| 17 | E-veoselehe liidestamise toetus (e-waybill integration) |  · grant · EUR 15k | nothing rules them out |  |

## 3. What the model chose

| its rank | pool rank | fund | what the scheme says it funds |
|---:|---:|---|---|
| 1 | 0 | Ida-Viru ettevotluse investeeringute toetus | Grants |
| 2 | 3 | Rakendusuuringu ja tootearenduse toetus | The programme for applied research supports the development of innovative products and ... |
| 3 | 9 | Ettevõtja rakendusuuringute toetus (alates 02.06.2023) | Grants · mostly software & AI |
| 4 | 4 | Ettevõtete tootearendustoetus | Grants · mostly software & AI |
| 5 | 12 | Ettevõtja rakendusuuringute toetus (2024 muutmine) | Grants · Eesti · mostly software & AI |
| 6 | 13 | Ettevõtete digipöörde toetus (pikendamine kuni 31.12.2026) | Ettevõtete digipöörde toetus - tarkvarasüsteemid või masinõppe/masinnägemise süsteemid ... |

Deepest reach: pool rank **13** of 17. Picks drawn from the shipped top 6: **3 of 6**.

It declared **nothing** unsure, so no retrieval fired and round two never ran.

Against the peer prior (what companies in this country and sector have really won): followed **6**, overrode **10**, reached past it for **0**.

## 4. What would publish (projection, 7-row cap)

Production's own `orderMemoCandidates` + `buildRowsForCheck` on each arm's pool. NOT a proof: the writer can reorder, omit and demote, and all three are model outputs.

| # | shipped order (arm off) | arm adviser |
|---:|---|---|
| 1 | Ida-Viru ettevotluse investeeringute toetus | Ida-Viru ettevotluse investeeringute toetus |
| 2 | Turismisektori kesksete digilahenduste toetus | Rakendusuuringu ja tootearenduse toetus |
| 3 | Rakendusuuringu ja tootearenduse toetus | Ettevõtja rakendusuuringute toetus (alates 02.06.2023) |
| 4 | Ettevõtete tootearendustoetus | Ettevõtete tootearendustoetus |
| 5 | Ettevõtja teadus- ja arendustöötaja toetus 2025 | Ettevõtja rakendusuuringute toetus (2024 muutmine) |
| 6 | Starditoetus (start-up grant) | Ettevõtete digipöörde toetus (pikendamine kuni 31.12.2026) |
| 7 | Ettevõtja teadus- ja arendustöötaja toetus 2024 | Turismisektori kesksete digilahenduste toetus |

**Entered the table** (3): Ettevõtja rakendusuuringute toetus (alates 02.06.2023) _(was pool rank 9)_; Ettevõtja rakendusuuringute toetus (2024 muutmine) _(was pool rank 12)_; Ettevõtete digipöörde toetus (pikendamine kuni 31.12.2026) _(was pool rank 13)_

**Left the table** (3): Ettevõtja teadus- ja arendustöötaja toetus 2025 _(was pool rank 5)_; Starditoetus (start-up grant) _(was pool rank 6)_; Ettevõtja teadus- ja arendustöötaja toetus 2024 _(was pool rank 7)_
