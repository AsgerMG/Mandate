# eAgronom — AgriTech

arm=adviser · depth=40 · count=6 · effort=low · lookups=5 · pool=18 · published cap=7

## 1. The founder, as the system saw them

country `Estonia` · sector `agrifood` · matched in the corpus: **true** (subsector ``)

description, verbatim:

```
Farm management software and soil carbon programmes for arable growers
```

the intake lines handed to the selector:

- how much they are looking for: b500k_2m5
- what they build: agrifood
- what the money is for: experimental_development, industrial_research
- able to run in a 3+ partner consortium: unsure
- countries where they already have an entity: Estonia
- stage: pilot_customers
- headcount: 10-49
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
| 0 | Ettevotte arenguprogramm (enterprise development) |  · grant · EUR 214k | nothing rules them out |  |
| 1 | Toetus ettevõtjate toote-, teenuse ja protsessiarenduse ja innovatsio... |  · grant · EUR 231k | nothing rules them out | **✓** |
| 2 | Ettevõtja rakendusuuringute toetus (alates 02.06.2023) | Ettevõtluse ja Innovatsiooni Sihtasutus · grant · EUR 116k | nothing rules them out | **✓** |
| 3 | Ettevõtte arenguprogrammi toetus 2024-2027 | Ettevõtluse ja Innovatsiooni Sihtasutus · grant · EUR 72k | nothing rules them out |  |
| 4 | Rohetoetus: roheauditi läbiviimine |  · grant · EUR 7k | nothing rules them out |  |
| 5 | Digitaliseerimise teekaardi toetus | EIS (KredEx + Enterprise Estonia) · grant · EUR 7k | nothing rules them out |  |
| 6 | Rakendusuuringute programm |  · grant · EUR 242k | one blocker: Applicant must provide self-financing (co-financing) of b... | **✓** |
| 7 | Rohetoetus: arendustegevuse elluviimine ja ärimudeli muutmise rakenda... |  · grant · EUR 98k | nothing rules them out |  |
| 8 | Rakendusuuringu ja tootearenduse toetus | Ettevõtluse ja Innovatsiooni Sihtasutus · grant · EUR 232k | nothing rules them out | **✓** |
| 9 | Ettevotete digipoorde toetus (digital transformation) |  · grant · EUR 152k | nothing rules them out |  |
| 10 | Ettevõtja rakendusuuringute toetus (2024 muutmine) | Ettevõtluse ja Innovatsiooni Sihtasutus · grant · EUR 143k | nothing rules them out | **✓** |
| 11 | Turismisektori tootearenduse toetus |  · grant · EUR 176k | one blocker: Ticket size fits grant-scale awards typical of this progr... |  |
| 12 | Ettevõtja teadus- ja arendustöötaja toetus 2025 | EIS (KredEx + Enterprise Estonia) · grant · EUR 6k | nothing rules them out |  |
| 13 | Innovatsiooniosak ja arendusosak |  · grant · EUR 7k | nothing rules them out |  |
| 14 | Ettevõtja teadus- ja arendustöötaja toetus 2024 | EIS (KredEx + Enterprise Estonia) · grant · EUR 5k | nothing rules them out |  |
| 15 | Ettevõtete tootearendustoetus |  · grant · EUR 207k | nothing rules them out | **✓** |
| 16 | E-veoselehe liidestamise toetus (e-waybill integration) |  · grant · EUR 15k | nothing rules them out |  |
| 17 | Ettevotja varustuskindluse toetus (security of supply) |  · grant · EUR 56k | nothing rules them out |  |

## 3. What the model chose

| its rank | pool rank | fund | what the scheme says it funds |
|---:|---:|---|---|
| 1 | 6 | Rakendusuuringute programm | Grants · mostly software & AI |
| 2 | 8 | Rakendusuuringu ja tootearenduse toetus | The programme for applied research supports the development of innovative products and ... |
| 3 | 2 | Ettevõtja rakendusuuringute toetus (alates 02.06.2023) | Grants · mostly software & AI |
| 4 | 10 | Ettevõtja rakendusuuringute toetus (2024 muutmine) | Grants · Eesti · mostly software & AI |
| 5 | 1 | Toetus ettevõtjate toote-, teenuse ja protsessiarenduse ja inno... | Grants · mostly agrifood |
| 6 | 15 | Ettevõtete tootearendustoetus | Grants · mostly software & AI |

Deepest reach: pool rank **15** of 17. Picks drawn from the shipped top 6: **2 of 6**.

It declared **nothing** unsure, so no retrieval fired and round two never ran.

Against the peer prior (what companies in this country and sector have really won): followed **5**, overrode **12**, reached past it for **1**.

## 4. What would publish (projection, 7-row cap)

Production's own `orderMemoCandidates` + `buildRowsForCheck` on each arm's pool. NOT a proof: the writer can reorder, omit and demote, and all three are model outputs.

| # | shipped order (arm off) | arm adviser |
|---:|---|---|
| 1 | Ettevotte arenguprogramm (enterprise development) | Rakendusuuringu ja tootearenduse toetus |
| 2 | Toetus ettevõtjate toote-, teenuse ja protsessiarenduse j... | Ettevõtja rakendusuuringute toetus (alates 02.06.2023) |
| 3 | Ettevõtja rakendusuuringute toetus (alates 02.06.2023) | Ettevõtja rakendusuuringute toetus (2024 muutmine) |
| 4 | Ettevõtte arenguprogrammi toetus 2024-2027 | Toetus ettevõtjate toote-, teenuse ja protsessiarenduse j... |
| 5 | Rohetoetus: roheauditi läbiviimine | Ettevõtete tootearendustoetus |
| 6 | Digitaliseerimise teekaardi toetus | Ettevotte arenguprogramm (enterprise development) |
| 7 | Rohetoetus: arendustegevuse elluviimine ja ärimudeli muut... | Ettevõtte arenguprogrammi toetus 2024-2027 |

**Entered the table** (3): Rakendusuuringu ja tootearenduse toetus _(was pool rank 8)_; Ettevõtja rakendusuuringute toetus (2024 muutmine) _(was pool rank 10)_; Ettevõtete tootearendustoetus _(was pool rank 15)_

**Left the table** (3): Rohetoetus: roheauditi läbiviimine _(was pool rank 4)_; Digitaliseerimise teekaardi toetus _(was pool rank 5)_; Rohetoetus: arendustegevuse elluviimine ja ärimudeli muutmise raken... _(was pool rank 7)_
