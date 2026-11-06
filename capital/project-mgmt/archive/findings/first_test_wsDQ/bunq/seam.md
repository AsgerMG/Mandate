# bunq — FinTech (consumer banking)

arm=adviser · depth=40 · count=6 · effort=low · lookups=5 · pool=18 · published cap=7

## 1. The founder, as the system saw them

country `Netherlands` · sector `software_data_ai` · matched in the corpus: **false**

description, verbatim:

```
Licensed consumer neobank offering current accounts, cards and savings
```

the intake lines handed to the selector:

- how much they are looking for: b15m_50m
- what they build: software_data_ai
- what the money is for: experimental_development, industrial_research
- able to run in a 3+ partner consortium: unsure
- countries where they already have an entity: Netherlands
- stage: scaling_revenue
- headcount: 250+
- regulated activities they are in: financial_services
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
| 0 | NL-EZK-KE: DEI+ wijziging en openstelling van de subsidiemodules inza... | Ministerie van Economische Zaken en K... · grant · EUR 2.7M | nothing rules them out |  |
| 1 | Horizon EU CL6 |  · grant · EUR 282k | one blocker: Company's share of project funding (ticket) typically fal... |  |
| 2 | NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimulering t... | provincie Zuid-Holland · grant · EUR 200k | nothing rules them out | **✓** |
| 3 | EIC Transition |  · grant · EUR 660k | nothing rules them out | **✓** |
| 4 | NL_BZK_CSDO_NB Subsidieregeling cofinanciering Europese programma’s 2... | provincie Noord-Brabant · grant · EUR 146k | nothing rules them out | **✓** |
| 5 | NL-EZK-B&I-I&K-RVO wijziging RNES 3.2 PPS-innovatie | Ministerie van Economische Zaken en K... · grant · EUR 244k | nothing rules them out |  |
| 6 | NL-EZK-B&I-I&K wijziging Subsidieregeling JTF 2021 - 2027 | Samenwerkingsverband Noord-Nederland · grant · EUR 271k | nothing rules them out |  |
| 7 | NL-EZK-KE: DEI+ budgetophoging subsidiemodules inzake de DEI+ juli 20... | Ministerie van Economische Zaken en K... · grant · EUR 822k | nothing rules them out |  |
| 8 | Horizon EU CL3 |  · grant · EUR 272k | nothing rules them out |  |
| 9 | NL-EZK-KE: RTE wijziging en openstelling van de subsidiemodules inzak... | Ministerie van Economische Zaken en K... · grant · EUR 678k | nothing rules them out |  |
| 10 | Horizon EU CL1 |  · grant · EUR 415k | nothing rules them out | **✓** |
| 11 | NL/IenW/_Tijdelijke subsidieregeling zero-emissie mobiliteit - Paragr... | Ministerie van Economische Zaken en K... · grant · EUR 107k | nothing rules them out |  |
| 12 | NL_BZK_CSDO_GD_Vierde wijziging Beleidsregel Programma EFRO Oost-Nede... | Provincie Gelderland · grant · EUR 282k | nothing rules them out | **✓** |
| 13 | NL_BZK_CSDO_NB OP Zuid Subsidieregeling OPZuid 2021 - 2027 uitbreiding | provincie Noord-Brabant · grant · EUR 226k | nothing rules them out | **✓** |
| 14 | NL-EZK-B&I-I&K Subsidieregeling JTF 2021 - 2027 | Kansen voor West · grant · EUR 713k | nothing rules them out |  |
| 15 | NL_EZK_K&E_Regeling nationale EZK- en LNV-subsidies, artikel 4.2.17 T... | Ministerie van Economische Zaken en K... · grant · EUR 200k | nothing rules them out |  |
| 16 | NL-EZK-B&I-I&K-RVO NGFNH2201 NXTGEN HIGHTECH | Ministerie van Economische Zaken en K... · grant · EUR 606k | nothing rules them out |  |
| 17 | NL/IenW/_Tijdelijke subsidieregeling zero-emissie mobiliteit - Paragr... | Ministerie van Economische Zaken en K... · grant · EUR 284k | nothing rules them out |  |

## 3. What the model chose

| its rank | pool rank | fund | what the scheme says it funds |
|---:|---:|---|---|
| 1 | 2 | NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimule... | Subsidie op grond van deze regeling kan slechts worden verstrekt voor activiteiten die ... |
| 2 | 4 | NL_BZK_CSDO_NB Subsidieregeling cofinanciering Europese program... | Subsidie kan worden verstrekt voor projecten gericht op: a. het bevorderen van innovati... |
| 3 | 13 | NL_BZK_CSDO_NB OP Zuid Subsidieregeling OPZuid 2021 - 2027 uitb... | Subsidieregeling OPZuid 2021-2027. Paragraaf 2 Maatschappelijke Transities: |
| 4 | 12 | NL_BZK_CSDO_GD_Vierde wijziging Beleidsregel Programma EFRO Oos... | De activiteiten zijn gericht op marktgerichte innovatie in een samenwerking van mkb-ond... |
| 5 | 3 | EIC Transition | EIC Transition: maturing a proof of concept from an earlier EU-funded project towards m... |
| 6 | 10 | Horizon EU CL1 | Collaborative R&I grants for health research that generates clinical evidence — disease... |

Deepest reach: pool rank **13** of 17. Picks drawn from the shipped top 6: **3 of 6**.

It declared **nothing** unsure, so no retrieval fired and round two never ran.

Against the peer prior (what companies in this country and sector have really won): followed **6**, overrode **12**, reached past it for **0**.

## 4. What would publish (projection, 7-row cap)

Production's own `orderMemoCandidates` + `buildRowsForCheck` on each arm's pool. NOT a proof: the writer can reorder, omit and demote, and all three are model outputs.

| # | shipped order (arm off) | arm adviser |
|---:|---|---|
| 1 | NL-EZK-KE: DEI+ wijziging en openstelling van de subsidie... | NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovaties... |
| 2 | NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovaties... | NL_BZK_CSDO_NB Subsidieregeling cofinanciering Europese p... |
| 3 | EIC Transition | NL_BZK_CSDO_NB OP Zuid Subsidieregeling OPZuid 2021 - 202... |
| 4 | NL_BZK_CSDO_NB Subsidieregeling cofinanciering Europese p... | NL_BZK_CSDO_GD_Vierde wijziging Beleidsregel Programma EF... |
| 5 | NL-EZK-B&I-I&K-RVO wijziging RNES 3.2 PPS-innovatie | EIC Transition |
| 6 | NL-EZK-B&I-I&K wijziging Subsidieregeling JTF 2021 - 2027 | Horizon EU CL1 |
| 7 | NL-EZK-KE: DEI+ budgetophoging subsidiemodules inzake de ... | NL-EZK-KE: DEI+ wijziging en openstelling van de subsidie... |

**Entered the table** (3): NL_BZK_CSDO_NB OP Zuid Subsidieregeling OPZuid 2021 - 2027 uitbreiding _(was pool rank 13)_; NL_BZK_CSDO_GD_Vierde wijziging Beleidsregel Programma EFRO Oost-Ne... _(was pool rank 12)_; Horizon EU CL1 _(was pool rank 10)_

**Left the table** (3): NL-EZK-B&I-I&K-RVO wijziging RNES 3.2 PPS-innovatie _(was pool rank 5)_; NL-EZK-B&I-I&K wijziging Subsidieregeling JTF 2021 - 2027 _(was pool rank 6)_; NL-EZK-KE: DEI+ budgetophoging subsidiemodules inzake de DEI+ juli ... _(was pool rank 7)_
