# What the ranker would ask — twelve archetypes, no model call

intake state: `screen1` · decision window: 18 candidates

Every demand below is a requirement one of the candidate funds imposes, in
its own words, whose value we do not hold for this founder, and which
changes the qualification of at least one candidate depending on how it is
answered. All three are decided in code. Nothing here was written by a model.

## Neura Robotics — Robotics (Germany)

pool 22 · window 18 · demands surviving all three legs: **7**

- **field `consortium`** (separating) — asked because Horizon EU CL1 requires:
  > A consortium must include at least three independent legal entities established in three different countries, with at least one in a Member State and at least two others in different Member States/Associated Countries.
  14 of the 18 candidates impose it, in their own wordings.
  > Horizon EU CL1: Must join or form a consortium of 3+ independent legal entities from 3+ member/associated states, answering a specific call topic
  > Horizon EU CL4: Unless the call/topic conditions provide otherwise, a consortium must include at least three independent legal entities each established in a different country, with at least one in a Member State and at least two others in different Member States or Associated Countries.
  moves 14 candidate(s): #1 Horizon EU CL1; #2 Horizon EU CL4; #3 Horizon EU Miss; #4 Horizon EU CL3; #5 Horizon EU CL6; #6 ERC POC; #7 EIC Transition; #8 EIC Pathfinder (+6 more)
  - answer `yes`: opens #15 #16 #17
  - answer `no`: opens #15 #16 #17, closes #1 #2 #3 #4 #5 #6 #7 #8 #12 #14 #18
  - answer `unsure`: closes #8

- **field `exclusionFlags`** (separating) — asked because Horizon EU CL1 requires:
  > Applicants subject to EU administrative exclusion sanctions or in exclusion situations (e.g. bankruptcy) cannot participate.
  9 of the 18 candidates impose it, in their own wordings.
  > Horizon EU CL4: Applicants subject to EU administrative sanctions (exclusion) or in situations such as bankruptcy, winding up, court-administered affairs, arrangement with creditors, or suspended business activities cannot participate.
  > Horizon EU CL3: Applicants subject to EU administrative sanctions or in exclusion situations such as bankruptcy, winding-up, or court-administered affairs cannot participate.
  moves 9 candidate(s): #1 Horizon EU CL1; #2 Horizon EU CL4; #4 Horizon EU CL3; #5 Horizon EU CL6; #6 ERC POC; #9 Innovation Fund Battery; #10 Innovation Fund LSP; #11 Innovation Fund MSP (+1 more)
  - answer `none`: opens #13
  - answer `insolvency`: closes #1 #2 #4 #5 #6 #9 #10 #11 #13
  - answer `losses_over_half_capital`: opens #13, closes #9 #10 #11
  - answer `recovery_order`: opens #13, closes #9 #10 #11
  - answer `sanctions`: closes #1 #5 #6 #9 #10 #11 #13
  - answer `tax_arrears`: closes #9 #10 #11 #13

- **field `nonEuControl`** (separating) — asked because Horizon EU CL1 requires:
  > Legal entities established outside Russia but more than 50% owned by a Russia-established entity are also not eligible to participate.
  4 of the 18 candidates impose it, in their own wordings.
  > Horizon EU CL4: Legal entities established outside Russia whose proprietary rights are more than 50% owned directly or indirectly by a Russian-established person, entity, or body are not eligible to participate in any capacity.
  > Horizon EU CL3: Legal entities established outside Russia whose proprietary rights are more than 50% owned by a Russia-established entity are not eligible to participate.
  moves 4 candidate(s): #1 Horizon EU CL1; #2 Horizon EU CL4; #4 Horizon EU CL3; #6 ERC POC
  - answer `yes`: closes #1 #2 #4 #6

- **field `ownerOver25`** (separating) — asked because Horizon EU Miss requires:
  > Legal entities established outside Russia but more than 50% owned, directly or indirectly, by a Russian-established entity are not eligible to participate in any capacity.
  2 of the 18 candidates impose it, in their own wordings.
  > Horizon EU CL6: Legal entities established outside Russia but more than 50% owned by a Russia-established entity are not eligible to participate.
  moves 2 candidate(s): #3 Horizon EU Miss; #5 Horizon EU CL6
  - answer `yes`: closes #3 #5

- **field `activities`** (separating) — asked because Horizon EU Miss requires:
  > Projects must focus exclusively on civil applications and must not involve human cloning, heritable genetic modification, or creation of human embryos solely for research.
  moves 1 candidate(s): #3 Horizon EU Miss
  - answer `weapons`: closes #3

- **field `cofinancingBand`** (separating) — asked because Innovation Fund LSP requires:
  > Requires matched private co-financing (grant covers up to 60% of additional relevant costs)
  2 of the 18 candidates impose it, in their own wordings.
  > IHI: Applicant consortia must ensure at least 45% of the action's eligible costs (and costs for related additional activities) are provided by industry contributions (IKOP, FC, IKAA) from private members/contributing partners; this is a strict eligibility criterion for evaluation.
  moves 1 candidate(s): #10 Innovation Fund LSP
  - answer `>50%`: closes #10

- **field `turnoverBand`** (separating) — asked because IHI requires:
  > For-profit legal entities with an annual turnover of EUR 500 million or more, or entities controlling/controlled by such entities, participating in a two-stage call alongside a pre-identified entity, are not eligible for funding.
  moves 1 candidate(s): #14 IHI
  - answer `>50M`: closes #14

## SMART Photonics — Hardware (Netherlands)

pool 39 · window 18 · demands surviving all three legs: **8**

- **field `exclusionFlags`** (separating) — asked because NL-EZK-B&I-I&K-RVO NGFNH2201 NXTGEN HIGHTECH requires:
  > Aid is not available to an undertaking in difficulty, or to one subject to an outstanding recovery decision. Accumulated losses above half of subscribed capital, or insolvency proceedings, put a company in that position until the equity is restored.
  14 of the 18 candidates impose it, in their own wordings.
  > ERC POC: Applicants subject to EU administrative sanctions or in exclusion situations (e.g. bankruptcy, winding up) cannot participate.
  > Chips JU KDT: Applicants subject to an EU exclusion decision or in specified exclusion situations (bankruptcy, tax/social security breach, grave professional misconduct, fraud/corruption, deficiencies in EU contract obligations, irregularities, circumvention of legal obligations) cannot receive EU funding.
  moves 14 candidate(s): #2 NL-EZK-B&I-I&K-RVO NGFNH2201 NXTGEN HIGHTECH; #4 NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimulering topsectoren Zuid-Holland; #5 NL_BZK_CSDO_NB OP Zuid Subsidieregeling OPZuid 2021 - 2027 uitbreiding; #6 NL_BZK_CSDO_NB Subsidieregeling cofinanciering Europese programma’s 2021-2027 Noord-Brabant, verlenging onderdeel OPZuid; #7 NL-EZK-B&I-I&K Subsidieregeling JTF 2021 - 2027; #8 NL-EZK-B&I-I&K-RVO wijziging RNES 3.2 PPS-innovatie; #9 ERC POC; #10 NL_EZK_K&E_Regeling nationale EZK- en LNV-subsidies, artikel 4.2.17 TSE industrie Studies (wijziging en openstelling 2024) (+6 more)
  - answer `none`: opens #11
  - answer `insolvency`: closes #2 #4 #5 #6 #7 #8 #9 #10 #11 #12 #14 #15 #16 #18
  - answer `losses_over_half_capital`: opens #11, closes #2 #4 #5 #6 #7 #8 #10 #12 #14 #15 #16 #18
  - answer `recovery_order`: opens #11, closes #2 #4 #5 #6 #7 #8 #10 #12 #14 #15 #16 #18
  - answer `sanctions`: closes #9 #11
  - answer `tax_arrears`: closes #11

- **field `activities`** (separating) — asked because NL-EZK-B&I-I&K-RVO NGFNH2201 NXTGEN HIGHTECH requires:
  > Tobacco, gambling and betting, and weapons and munitions are outside the scope of this aid. The exclusion is set by the framework the scheme is notified under, not by the scheme itself.
  12 of the 18 candidates impose it, in their own wordings.
  moves 12 candidate(s): #2 NL-EZK-B&I-I&K-RVO NGFNH2201 NXTGEN HIGHTECH; #4 NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimulering topsectoren Zuid-Holland; #5 NL_BZK_CSDO_NB OP Zuid Subsidieregeling OPZuid 2021 - 2027 uitbreiding; #6 NL_BZK_CSDO_NB Subsidieregeling cofinanciering Europese programma’s 2021-2027 Noord-Brabant, verlenging onderdeel OPZuid; #7 NL-EZK-B&I-I&K Subsidieregeling JTF 2021 - 2027; #8 NL-EZK-B&I-I&K-RVO wijziging RNES 3.2 PPS-innovatie; #10 NL_EZK_K&E_Regeling nationale EZK- en LNV-subsidies, artikel 4.2.17 TSE industrie Studies (wijziging en openstelling 2024); #12 NL-EZK-KE: RTE wijziging en openstelling van de subsidiemodules inzake de Topsector energieprojecten wijziging juli 2019 (+4 more)
  - answer `gambling_betting`: closes #2 #4 #5 #6 #7 #8 #10 #12 #14 #15 #16 #18
  - answer `tobacco`: closes #2 #4 #5 #6 #7 #8 #10 #12 #14 #15 #16 #18
  - answer `weapons`: closes #2 #4 #5 #6 #7 #8 #10 #12 #14 #15 #16 #18

- **field `region`** (separating) — asked because NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimulering topsectoren Zuid-Holland requires:
  > Subsidy for a feasibility project is granted to an SME enterprise with an establishment in the province of Zuid-Holland.
  5 of the 18 candidates impose it, in their own wordings.
  > NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimulering topsectoren Zuid-Holland: Registered with the European Commission as applying in NL3. A company established outside those regions is not eligible under this scheme.
  > NL_BZK_CSDO_NB OP Zuid Subsidieregeling OPZuid 2021 - 2027 uitbreiding: Registered with the European Commission as applying in NL34, NL41, NL42. A company established outside those regions is not eligible under this scheme.
  moves 5 candidate(s): #4 NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimulering topsectoren Zuid-Holland; #5 NL_BZK_CSDO_NB OP Zuid Subsidieregeling OPZuid 2021 - 2027 uitbreiding; #6 NL_BZK_CSDO_NB Subsidieregeling cofinanciering Europese programma’s 2021-2027 Noord-Brabant, verlenging onderdeel OPZuid; #7 NL-EZK-B&I-I&K Subsidieregeling JTF 2021 - 2027; #18 NL_BZK_CSDO_GD_Vierde wijziging Beleidsregel Programma EFRO Oost-Nederland 2022 (wijziging november 2024)
  - answer `NL13`: closes #4 #5 #6 #7 #18
  - answer `NL23`: closes #4 #5 #6 #7
  - answer `NL12`: closes #4 #5 #6 #7 #18
  - answer `NL22`: closes #4 #5 #6 #7
  - answer `NL11`: closes #4 #5 #6 #7 #18
  - answer `NL42`: closes #4 #6 #7 #18
  - answer `NL41`: closes #4 #7 #18
  - answer `NL32`: closes #4 #5 #6 #7 #18
  - answer `NL1`: closes #4 #5 #6 #7 #18
  - answer `NL2`: closes #4 #5 #6 #7
  - answer `NL21`: closes #4 #5 #6 #7
  - answer `NL35`: closes #4 #5 #6 #7 #18
  - answer `NL3`: closes #6 #18
  - answer `NL34`: closes #4 #6 #7 #18
  - answer `NL36`: closes #5 #6 #18
  - answer `NL4`: closes #4 #7 #18

- **field `consortium`** (narrowing) — asked because EIC Transition requires:
  > Consortia must include entities established in different Member States or Associated Countries per applicable configuration.
  5 of the 18 candidates impose it, in their own wordings.
  > EIC Transition: Consortia must comprise a minimum of 2 and maximum of 5 independent legal entities.
  > ERC POC: Unless call conditions provide otherwise, the consortium must include at least three independent legal entities established in three different countries: one in a Member State and two others each in different Member States or Associated Countries.
  moves 5 candidate(s): #3 EIC Transition; #9 ERC POC; #11 Chips JU KDT; #13 Chips JU KDT Unknown; #17 EIC Pathfinder
  - answer `yes`: opens #11 #13
  - answer `no`: opens #11 #13, closes #3 #9 #17
  - answer `unsure`: closes #17

- **field `wouldOpenEntity`** (narrowing) — asked because EIC Accelerator requires:
  > Natural persons or legal entities intending to set up an SME or mid-cap are eligible applicants.
  moves 1 candidate(s): #1 EIC Accelerator
  - answer `no`: closes #1

- **field `nonEuControl`** (separating) — asked because ERC POC requires:
  > Legal entities established outside Russia that are more than 50% owned by a Russia-established person/entity are not eligible to participate in any capacity.
  2 of the 18 candidates impose it, in their own wordings.
  > Chips JU KDT: Entities established in a Member State, Associated Country or eligible third country that are directly or indirectly controlled by China or a Chinese-established legal entity are not eligible to participate in Innovation Actions (and RIAs where specified) in critical technology areas (advanced semiconductors, AI, quantum, biotech).
  moves 2 candidate(s): #9 ERC POC; #11 Chips JU KDT
  - answer `yes`: closes #9 #11
  - answer `no`: opens #11

- **field `conditionality`** (narrowing) — asked because Chips JU KDT requires:
  > Entities subject to EU conditionality measures under Regulation 2020/2092 (e.g., certain Hungarian public interest trusts) are not eligible to participate in any funded role.
  moves 1 candidate(s): #11 Chips JU KDT
  - answer `local_entity`: opens #11
  - answer `geo_commitments`: opens #11
  - answer `state_shareholder`: opens #11
  - answer `job_commitments`: opens #11

- **field `needBy`** (narrowing) — asked because Chips JU KDT requires:
  > Realistic timeline requires ability to wait for a call-based, multi-month-to-year process to grant
  moves 1 candidate(s): #11 Chips JU KDT
  - answer `asap_weeks`: opens #11
  - answer `months_6`: opens #11
  - answer `months_18`: opens #11
  - answer `flexible`: opens #11

## Silvr — FinTech (business lending) (France)

pool 46 · window 18 · demands surviving all three legs: **7**

- **field `exclusionFlags`** (separating) — asked because Régime cadre exempté de notification relatif aux aides en faveur des PME pour la période 2024-2026 requires:
  > Aid is not available to an undertaking in difficulty, or to one subject to an outstanding recovery decision. Accumulated losses above half of subscribed capital, or insolvency proceedings, put a company in that position until the equity is restored.
  16 of the 18 candidates impose it, in their own wordings.
  > Régime cadre exempté de notification relatif aux aides en faveur des PME pour la période 2024-2026: Aid is excluded for an undertaking subject to an outstanding recovery order following a prior Commission decision declaring aid granted by France illegal and incompatible with the internal market.
  > Régime cadre exempté de notification relatif aux aides en faveur des PME pour la période 2024-2026: Company must not be in financial difficulty (excludes firms with losses exceeding half of subscribed capital, per GBER undertaking-in-difficulty rules)
  moves 16 candidate(s): #1 Régime cadre exempté de notification relatif aux aides en faveur des PME pour la période 2024-2026; #2 Régime cadre exempté de notification relatif aux aides à la recherche, au développement et à l’innovation (RDI) pour la période 2014-2023; #3 Soutien à la modernisation des industries techniques et à l'innovation technologique; #4 Bpifrance; #5 Ministère de l'Agriculture et de l'alimentation; #6 Régime cadre exempté de notification relatif aux aides à la recherche, au développement et à l’innovation (RDI) pour la période 2024-2026; #7 Régime cadre exempté de notification relatif aux aides à la recherche, au développement et à l’innovation (RDI) pour la période 2024-2026; #8 Ministère de l'économie et des finances (+8 more)
  - answer `insolvency`: closes #1 #2 #3 #5 #6 #7 #8 #9 #10 #11 #12 #13 #14 #15 #16
  - answer `losses_over_half_capital`: closes #1 #2 #3 #5 #6 #7 #8 #9 #10 #12 #13 #14 #15 #16
  - answer `recovery_order`: closes #1 #2 #3 #5 #6 #7 #8 #9 #10 #12 #13 #14 #15 #16
  - answer `sanctions`: closes #11
  - answer `tax_arrears`: closes #4

- **field `region`** (separating) — asked because Régime cadre exempté de notification relatif aux aides à la recherche, au développement et à l’innovation (RDI) pour la période 2024-2026 · via Conseil régional d'Ile-de-France requires:
  > Eligible applicants are start-ups, micro-enterprises, SMEs, mid-caps, and large Île-de-France companies, as well as regional research organisations.
  3 of the 18 candidates impose it, in their own wordings.
  > Régime cadre exempté de notification relatif aux aides à la recherche, au développement et à l’innovation (RDI) pour la période 2024-2026 · via REGION GRAND EST: Also eligible are start-ups, CRITT and CRT technology-transfer centres, university laboratories, and research structures located in the Grand Est region.
  > Régime cadre exempté de notification relatif aux aides à la recherche, au développement et à l’innovation (RDI) pour la période 2024-2026 · via Conseil régional Nouvelle-Aquitaine: Enterprises of any size located in Nouvelle-Aquitaine are concerned by this call.
  moves 3 candidate(s): #10 Régime cadre exempté de notification relatif aux aides à la recherche, au développement et à l’innovation (RDI) pour la période 2024-2026 · via Conseil régional d'Ile-de-France; #14 Régime cadre exempté de notification relatif aux aides à la recherche, au développement et à l’innovation (RDI) pour la période 2024-2026 · via REGION GRAND EST; #15 Régime cadre exempté de notification relatif aux aides à la recherche, au développement et à l’innovation (RDI) pour la période 2024-2026 · via Conseil régional Nouvelle-Aquitaine
  - answer `FRF1`: closes #10 #15
  - answer `FRI1`: closes #10 #14
  - answer `FRK1`: closes #10 #14 #15
  - answer `FRK`: closes #10 #14 #15
  - answer `FRD1`: closes #10 #14 #15
  - answer `FRC1`: closes #10 #14 #15
  - answer `FRC`: closes #10 #14 #15
  - answer `FRH`: closes #10 #14 #15
  - answer `FRB`: closes #10 #14 #15
  - answer `FRF2`: closes #10 #15
  - answer `FRM`: closes #10 #14 #15
  - answer `FRC2`: closes #10 #14 #15
  - answer `FRF`: closes #10 #15
  - answer `FRY1`: closes #10 #14 #15
  - answer `FRY3`: closes #10 #14 #15
  - answer `FRD2`: closes #10 #14 #15
  - answer `FRE`: closes #10 #14 #15
  - answer `FR1`: closes #14 #15
  - answer `FRY4`: closes #10 #14 #15
  - answer `FRJ1`: closes #10 #14 #15
  - answer `FRI2`: closes #10 #14
  - answer `FRF3`: closes #10 #15
  - answer `FRY2`: closes #10 #14 #15
  - answer `FRY5`: closes #10 #14 #15
  - answer `FRJ2`: closes #10 #14 #15
  - answer `FRE1`: closes #10 #14 #15
  - answer `FRD`: closes #10 #14 #15
  - answer `FRI`: closes #10 #14
  - answer `FRJ`: closes #10 #14 #15
  - answer `FRG`: closes #10 #14 #15
  - answer `FRE2`: closes #10 #14 #15
  - answer `FRI3`: closes #10 #14
  - answer `FRL`: closes #10 #14 #15
  - answer `FRY`: closes #10 #14 #15
  - answer `FRK2`: closes #10 #14 #15

- **field `nonEuControl`** (separating) — asked because Horizon EU CL1 requires:
  > Legal entities established outside Russia but more than 50% owned by a Russia-established entity are also not eligible to participate.
  moves 1 candidate(s): #11 Horizon EU CL1
  - answer `yes`: closes #11

- **field `consortium`** (separating) — asked because Horizon EU CL1 requires:
  > A consortium must include at least three independent legal entities established in three different countries, with at least one in a Member State and at least two others in different Member States/Associated Countries.
  moves 1 candidate(s): #11 Horizon EU CL1
  - answer `no`: closes #11

- **field `turnoverBand`** (separating) — asked because EIB Venture requires:
  > Eligible applicants are SMEs and mid-caps developing highly innovative technologies, solutions or platforms.
  moves 1 candidate(s): #18 EIB Venture
  - answer `>50M`: closes #18

- **field `wouldOpenEntity`** (narrowing) — asked because EIC Accelerator requires:
  > Natural persons or legal entities intending to set up an SME or mid-cap are eligible applicants.
  moves 1 candidate(s): #17 EIC Accelerator
  - answer `no`: closes #17

- **field `institutionalBacking`** (narrowing) — asked because EIB Venture requires:
  > An applicant must have already raised equity from professional investors, have a sustainable business model and business plan, and have solid corporate governance in place.
  moves 1 candidate(s): #18 EIB Venture
  - answer `no`: closes #18

## bunq — FinTech (consumer banking) (Netherlands)

pool 35 · window 18 · demands surviving all three legs: **5**

- **field `exclusionFlags`** (separating) — asked because NL-EZK-KE: DEI+ wijziging en openstelling van de subsidiemodules inzake de DEI+ requires:
  > Aid is not available to an undertaking in difficulty, or to one subject to an outstanding recovery decision. Accumulated losses above half of subscribed capital, or insolvency proceedings, put a company in that position until the equity is restored.
  17 of the 18 candidates impose it, in their own wordings.
  > Horizon EU CL6: Applicants subject to EU administrative sanctions or in exclusion situations (e.g. bankruptcy, winding up) cannot participate.
  > Horizon EU CL3: Applicants subject to EU administrative sanctions or in exclusion situations such as bankruptcy, winding-up, or court-administered affairs cannot participate.
  moves 17 candidate(s): #1 NL-EZK-KE: DEI+ wijziging en openstelling van de subsidiemodules inzake de DEI+; #2 Horizon EU CL6; #3 NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimulering topsectoren Zuid-Holland; #5 NL_BZK_CSDO_NB Subsidieregeling cofinanciering Europese programma’s 2021-2027 Noord-Brabant, verlenging onderdeel OPZuid; #6 NL-EZK-B&I-I&K-RVO wijziging RNES 3.2 PPS-innovatie; #7 NL-EZK-B&I-I&K wijziging Subsidieregeling JTF 2021 - 2027; #8 NL-EZK-KE: DEI+ budgetophoging subsidiemodules inzake de DEI+ juli 2019 (verlenging AGVV); #9 Horizon EU CL3 (+9 more)
  - answer `insolvency`: closes #1 #2 #3 #5 #6 #7 #8 #9 #10 #11 #12 #13 #14 #15 #16 #17 #18
  - answer `losses_over_half_capital`: closes #1 #3 #5 #6 #7 #8 #10 #12 #13 #14 #15 #16 #17 #18
  - answer `recovery_order`: closes #1 #3 #5 #6 #7 #8 #10 #12 #13 #14 #15 #16 #17 #18
  - answer `sanctions`: closes #2 #11

- **field `region`** (separating) — asked because NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimulering topsectoren Zuid-Holland requires:
  > Subsidy for a feasibility project is granted to an SME enterprise with an establishment in the province of Zuid-Holland.
  6 of the 18 candidates impose it, in their own wordings.
  > NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimulering topsectoren Zuid-Holland: Registered with the European Commission as applying in NL3. A company established outside those regions is not eligible under this scheme.
  > NL_BZK_CSDO_NB Subsidieregeling cofinanciering Europese programma’s 2021-2027 Noord-Brabant, verlenging onderdeel OPZuid: A project counts as benefiting Noord-Brabant only if more than half of the eligible costs are incurred by participants established in the province of Noord-Brabant.
  moves 6 candidate(s): #3 NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimulering topsectoren Zuid-Holland; #5 NL_BZK_CSDO_NB Subsidieregeling cofinanciering Europese programma’s 2021-2027 Noord-Brabant, verlenging onderdeel OPZuid; #7 NL-EZK-B&I-I&K wijziging Subsidieregeling JTF 2021 - 2027; #13 NL_BZK_CSDO_GD_Vierde wijziging Beleidsregel Programma EFRO Oost-Nederland 2022 (wijziging november 2024); #14 NL_BZK_CSDO_NB OP Zuid Subsidieregeling OPZuid 2021 - 2027 uitbreiding; #15 NL-EZK-B&I-I&K Subsidieregeling JTF 2021 - 2027
  - answer `NL13`: closes #3 #5 #7 #13 #14 #15
  - answer `NL23`: closes #3 #5 #7 #14 #15
  - answer `NL12`: closes #3 #5 #7 #13 #14 #15
  - answer `NL22`: closes #3 #5 #7 #14 #15
  - answer `NL11`: closes #3 #5 #13 #14 #15
  - answer `NL42`: closes #3 #5 #13 #15
  - answer `NL41`: closes #3 #13 #15
  - answer `NL32`: closes #3 #5 #13 #14 #15
  - answer `NL1`: closes #3 #5 #13 #14 #15
  - answer `NL2`: closes #3 #5 #7 #14 #15
  - answer `NL21`: closes #3 #5 #7 #14 #15
  - answer `NL35`: closes #3 #5 #13 #14 #15
  - answer `NL3`: closes #5 #13
  - answer `NL34`: closes #3 #5 #13 #15
  - answer `NL36`: closes #5 #13 #14
  - answer `NL4`: closes #3 #13 #15

- **field `consortium`** (narrowing) — asked because Horizon EU CL6 requires:
  > Standard collaborative actions require a consortium of at least three independent legal entities each established in a different Member State/Associated Country, with at least one in a Member State.
  4 of the 18 candidates impose it, in their own wordings.
  > Horizon EU CL6: Must apply as part of a multi-partner consortium (typically 3+ organisations from 3+ eligible countries), not as a solo applicant
  > EIC Transition: Consortia must include entities established in different Member States or Associated Countries per applicable configuration.
  moves 4 candidate(s): #2 Horizon EU CL6; #4 EIC Transition; #9 Horizon EU CL3; #11 Horizon EU CL1
  - answer `no`: closes #2 #4 #9 #11

- **field `nonEuControl`** (separating) — asked because Horizon EU CL3 requires:
  > Legal entities established outside Russia whose proprietary rights are more than 50% owned by a Russia-established entity are not eligible to participate.
  2 of the 18 candidates impose it, in their own wordings.
  > Horizon EU CL1: Legal entities established outside Russia but more than 50% owned by a Russia-established entity are also not eligible to participate.
  moves 2 candidate(s): #9 Horizon EU CL3; #11 Horizon EU CL1
  - answer `yes`: closes #9 #11

- **field `ownerOver25`** (narrowing) — asked because Horizon EU CL6 requires:
  > Legal entities established outside Russia but more than 50% owned by a Russia-established entity are not eligible to participate.
  moves 1 candidate(s): #2 Horizon EU CL6
  - answer `yes`: closes #2

## Photoroom — AI B2C software (France)

pool 47 · window 18 · demands surviving all three legs: **8**

- **field `exclusionFlags`** (separating) — asked because Soutien à la modernisation des industries techniques et à l'innovation technologique requires:
  > Aid is not available to an undertaking in difficulty, or to one subject to an outstanding recovery decision. Accumulated losses above half of subscribed capital, or insolvency proceedings, put a company in that position until the equity is restored.
  13 of the 18 candidates impose it, in their own wordings.
  > Soutien à la modernisation des industries techniques et à l'innovation technologique: Aid is excluded for an undertaking subject to an outstanding recovery order following a prior Commission decision declaring aid granted by France illegal and incompatible with the internal market.
  > Soutien à la modernisation des industries techniques et à l'innovation technologique: Company must not be in financial difficulty (excludes firms with losses exceeding half of subscribed capital, per GBER undertaking-in-difficulty rules)
  moves 13 candidate(s): #1 Soutien à la modernisation des industries techniques et à l'innovation technologique; #2 Bpifrance; #3 Horizon EU CL1; #4 Régime exempté de notification N°SA.XXXXX relatif aux aides à la recherche et au développement pour la décarbonation, la compétitivité et la sécurité du transport aérien pour la période 2024-2026; #5 Régime cadre exempté de notification relatif aux aides à la recherche, au développement et à l’innovation (RDI) pour la période 2014-2023; #8 Tender for PV installations on buildings with a rated power between 100 kW and 8 MW; #9 Appels d'offres pour installations énergie solaire au sol entre 500 kWc et 17 MWc; #10 Complément de rémunération pour l'éolien terrestre àpd 2017 (+5 more)
  - answer `insolvency`: closes #1 #3 #4 #5 #8 #9 #10 #11 #12 #13 #14 #15
  - answer `losses_over_half_capital`: closes #1 #4 #5 #8 #9 #10 #11 #12 #13 #14 #15
  - answer `recovery_order`: closes #1 #4 #5 #8 #9 #10 #11 #12 #13 #14 #15
  - answer `sanctions`: closes #3
  - answer `tax_arrears`: closes #2

- **field `activities`** (separating) — asked because Soutien à la modernisation des industries techniques et à l'innovation technologique requires:
  > Tobacco, gambling and betting, and weapons and munitions are outside the scope of this aid. The exclusion is set by the framework the scheme is notified under, not by the scheme itself.
  12 of the 18 candidates impose it, in their own wordings.
  > Bpifrance: Companies operating in listed excluded sectors (trading, business consulting, regulated professions, financial/insurance/real estate activities, cafés/hotels/restaurants, training bodies, road freight transport, logistics, digital services consulting/maintenance/training, personal services, communication/multimedia, primary agriculture/fishing/aquaculture/forestry) are excluded from the scheme.
  moves 12 candidate(s): #1 Soutien à la modernisation des industries techniques et à l'innovation technologique; #4 Régime exempté de notification N°SA.XXXXX relatif aux aides à la recherche et au développement pour la décarbonation, la compétitivité et la sécurité du transport aérien pour la période 2024-2026; #5 Régime cadre exempté de notification relatif aux aides à la recherche, au développement et à l’innovation (RDI) pour la période 2014-2023; #8 Tender for PV installations on buildings with a rated power between 100 kW and 8 MW; #9 Appels d'offres pour installations énergie solaire au sol entre 500 kWc et 17 MWc; #10 Complément de rémunération pour l'éolien terrestre àpd 2017; #11 Régime cadre exempté de notification relatif aux aides en faveur des PME pour la période 2014-2020; #12 Régime cadre exempté de notification relatif aux aides à la protection de l’environnement pour la période 2014-2023 (+4 more)
  - answer `financial_services`: closes #16
  - answer `primary_agriculture`: closes #16
  - answer `fisheries_aquaculture`: closes #16
  - answer `road_freight`: closes #16
  - answer `real_estate`: closes #16
  - answer `gambling_betting`: closes #1 #4 #5 #8 #9 #10 #11 #12 #13 #14 #15
  - answer `tobacco`: closes #1 #4 #5 #8 #9 #10 #11 #12 #13 #14 #15
  - answer `weapons`: closes #1 #4 #5 #8 #9 #10 #11 #12 #13 #14 #15

- **field `consortium`** (separating) — asked because Horizon EU CL1 requires:
  > A consortium must include at least three independent legal entities established in three different countries, with at least one in a Member State and at least two others in different Member States/Associated Countries.
  3 of the 18 candidates impose it, in their own wordings.
  > Horizon EU CL1: Must join or form a consortium of 3+ independent legal entities from 3+ member/associated states, answering a specific call topic
  > EIC Transition: Consortia must include entities established in different Member States or Associated Countries per applicable configuration.
  moves 3 candidate(s): #3 Horizon EU CL1; #17 EIC Transition; #18 EIC Pathfinder
  - answer `no`: closes #3 #17 #18
  - answer `unsure`: closes #18

- **field `nonEuControl`** (narrowing) — asked because Horizon EU CL1 requires:
  > Legal entities established outside Russia but more than 50% owned by a Russia-established entity are also not eligible to participate.
  moves 1 candidate(s): #3 Horizon EU CL1
  - answer `yes`: closes #3

- **field `turnoverBand`** (narrowing) — asked because EIB Venture requires:
  > Eligible applicants are SMEs and mid-caps developing highly innovative technologies, solutions or platforms.
  2 of the 18 candidates impose it, in their own wordings.
  > EIB Venture: To qualify as a fast-growing enterprise by turnover growth, a firm must show average annualised turnover growth greater than 10% per year over a three-year period.
  > Bpifrance: The company's turnover must not exceed €50M or its balance sheet total must not exceed €43M.
  moves 2 candidate(s): #7 EIB Venture; #16 Bpifrance
  - answer `>50M`: closes #7 #16

- **field `wouldOpenEntity`** (narrowing) — asked because EIC Accelerator requires:
  > Natural persons or legal entities intending to set up an SME or mid-cap are eligible applicants.
  moves 1 candidate(s): #6 EIC Accelerator
  - answer `no`: closes #6

- **field `institutionalBacking`** (narrowing) — asked because EIB Venture requires:
  > An applicant must have already raised equity from professional investors, have a sustainable business model and business plan, and have solid corporate governance in place.
  moves 1 candidate(s): #7 EIB Venture
  - answer `no`: closes #7

- **field `region`** (narrowing) — asked because Bpifrance requires:
  > The company must have at least one establishment located in Île-de-France.
  moves 1 candidate(s): #16 Bpifrance
  - answer `FRF1`: closes #16
  - answer `FRI1`: closes #16
  - answer `FRK1`: closes #16
  - answer `FRK`: closes #16
  - answer `FRD1`: closes #16
  - answer `FRC1`: closes #16
  - answer `FRC`: closes #16
  - answer `FRH`: closes #16
  - answer `FRB`: closes #16
  - answer `FRF2`: closes #16
  - answer `FRM`: closes #16
  - answer `FRC2`: closes #16
  - answer `FRF`: closes #16
  - answer `FRY1`: closes #16
  - answer `FRY3`: closes #16
  - answer `FRD2`: closes #16
  - answer `FRE`: closes #16
  - answer `FRY4`: closes #16
  - answer `FRJ1`: closes #16
  - answer `FRI2`: closes #16
  - answer `FRF3`: closes #16
  - answer `FRY2`: closes #16
  - answer `FRY5`: closes #16
  - answer `FRJ2`: closes #16
  - answer `FRE1`: closes #16
  - answer `FRD`: closes #16
  - answer `FRI`: closes #16
  - answer `FRJ`: closes #16
  - answer `FRG`: closes #16
  - answer `FRE2`: closes #16
  - answer `FRI3`: closes #16
  - answer `FRL`: closes #16
  - answer `FRY`: closes #16
  - answer `FRK2`: closes #16

## Aleph Alpha — AI B2B software (Germany)

pool 105 · window 18 · demands surviving all three legs: **4**

- **field `activities`** (narrowing) — asked because Quantencomputer-Demonstrationsaufbauten requires:
  > Tobacco, gambling and betting, and weapons and munitions are outside the scope of this aid. The exclusion is set by the framework the scheme is notified under, not by the scheme itself.
  18 of the 18 candidates impose it, in their own wordings.
  moves 18 candidate(s): #1 Quantencomputer-Demonstrationsaufbauten; #2 NRW.SeedCon; #3 Richtlinie zur Förderung innovativer Netzarchitekturen im Mobilfunk [BMDV]; #4 Bayerische Richtlinien für die Förderung von Film-, Fernseh- und anderen audiovisuellen Projekten (Förderrichtlinien) / Verlängerung 2024 [BY]; #5 Richtlinie zur Fördermaßnahme: "KMU-innovativ: Informations- und Kommunikationstechnologie (IKT)" [BMBF]; #6 Programm zur Förderung von Forschung, Innovationen und Technologien (Pro FIT); #7 Förderrichtlinie Business-Angel-Bonus JTF 2021–2027 [SN]; #8 Bayerische Richtlinien für die Förderung von Film-, Fernseh- und anderen audiovisuellen Projekten (Förderrichtlinien) Verlängerung 2025 [BY] (+10 more)
  - answer `gambling_betting`: closes #1 #2 #3 #4 #5 #6 #7 #8 #9 #10 #11 #12 #13 #14 #15 #16 #17 #18
  - answer `tobacco`: closes #1 #2 #3 #4 #5 #6 #7 #8 #9 #10 #11 #12 #13 #14 #15 #16 #17 #18
  - answer `weapons`: closes #1 #2 #3 #4 #5 #6 #7 #8 #9 #10 #11 #12 #13 #14 #15 #16 #17 #18

- **field `exclusionFlags`** (narrowing) — asked because Quantencomputer-Demonstrationsaufbauten requires:
  > Aid is not available to an undertaking in difficulty, or to one subject to an outstanding recovery decision. Accumulated losses above half of subscribed capital, or insolvency proceedings, put a company in that position until the equity is restored.
  18 of the 18 candidates impose it, in their own wordings.
  > Quantencomputer-Demonstrationsaufbauten: Companies that have failed to comply with a prior Commission recovery order are excluded from applying, as are companies in insolvency proceedings.
  > NRW.SeedCon: Companies that have failed to comply with a prior Commission recovery order are excluded from applying, as are companies in insolvency proceedings.
  moves 18 candidate(s): #1 Quantencomputer-Demonstrationsaufbauten; #2 NRW.SeedCon; #3 Richtlinie zur Förderung innovativer Netzarchitekturen im Mobilfunk [BMDV]; #4 Bayerische Richtlinien für die Förderung von Film-, Fernseh- und anderen audiovisuellen Projekten (Förderrichtlinien) / Verlängerung 2024 [BY]; #5 Richtlinie zur Fördermaßnahme: "KMU-innovativ: Informations- und Kommunikationstechnologie (IKT)" [BMBF]; #6 Programm zur Förderung von Forschung, Innovationen und Technologien (Pro FIT); #7 Förderrichtlinie Business-Angel-Bonus JTF 2021–2027 [SN]; #8 Bayerische Richtlinien für die Förderung von Film-, Fernseh- und anderen audiovisuellen Projekten (Förderrichtlinien) Verlängerung 2025 [BY] (+10 more)
  - answer `insolvency`: closes #1 #2 #3 #4 #5 #6 #7 #8 #9 #10 #11 #12 #13 #14 #15 #16 #17 #18
  - answer `losses_over_half_capital`: closes #1 #2 #3 #4 #5 #6 #7 #8 #9 #10 #11 #12 #13 #14 #15 #16 #17 #18
  - answer `recovery_order`: closes #1 #2 #3 #4 #5 #6 #7 #8 #9 #10 #11 #12 #13 #14 #15 #16 #17 #18

- **field `cofinancingBand`** (narrowing) — asked because Quantencomputer-Demonstrationsaufbauten requires:
  > An appropriate own contribution to eligible costs is required, generally at least 75% of eligible costs for commercial enterprises and economically-active research bodies.
  15 of the 18 candidates impose it, in their own wordings.
  moves 15 candidate(s): #1 Quantencomputer-Demonstrationsaufbauten; #2 NRW.SeedCon; #3 Richtlinie zur Förderung innovativer Netzarchitekturen im Mobilfunk [BMDV]; #5 Richtlinie zur Fördermaßnahme: "KMU-innovativ: Informations- und Kommunikationstechnologie (IKT)" [BMBF]; #6 Programm zur Förderung von Forschung, Innovationen und Technologien (Pro FIT); #7 Förderrichtlinie Business-Angel-Bonus JTF 2021–2027 [SN]; #9 Förderrichtlinie
„Digitalisierung der Fahrzeughersteller und Zulieferindustrie und industrieller Lieferketten“ im Förderrahmen „Zukunftsinvestitionen Fahrzeughersteller und Zulieferindustrie“ [BMWK, IVA3]; #10 EXIST Forschungstransfer (Förderphase II) [BMWK VIIC4] (+7 more)
  - answer `25-50%`: closes #1 #2 #3 #5 #6 #7 #9 #10 #11 #13 #14 #15 #16 #17 #18
  - answer `<25%`: closes #1 #2 #3 #5 #6 #7 #9 #10 #11 #13 #14 #15 #16 #17 #18

- **field `region`** (separating) — asked because NRW.SeedCon requires:
  > Registered seat, branch or permanent establishment must be located in North Rhine-Westphalia.
  7 of the 18 candidates impose it, in their own wordings.
  > NRW.SeedCon: Registered with the European Commission as applying in DEA. A company established outside those regions is not eligible under this scheme.
  > Bayerische Richtlinien für die Förderung von Film-, Fernseh- und anderen audiovisuellen Projekten (Förderrichtlinien) / Verlängerung 2024 [BY]: Registered with the European Commission as applying in DE2. A company established outside those regions is not eligible under this scheme.
  moves 7 candidate(s): #2 NRW.SeedCon; #4 Bayerische Richtlinien für die Förderung von Film-, Fernseh- und anderen audiovisuellen Projekten (Förderrichtlinien) / Verlängerung 2024 [BY]; #6 Programm zur Förderung von Forschung, Innovationen und Technologien (Pro FIT); #7 Förderrichtlinie Business-Angel-Bonus JTF 2021–2027 [SN]; #8 Bayerische Richtlinien für die Förderung von Film-, Fernseh- und anderen audiovisuellen Projekten (Förderrichtlinien) Verlängerung 2025 [BY]; #12 Förderrichtlinie der medienboard Berlin-Brandenburg GmbH [BB]; #14 FRL MINT-Fachkräfteprogramm ESF Plus 2021–2027 [SN]
  - answer `DEA5`: closes #4 #6 #7 #8 #12 #14
  - answer `DE1`: closes #2 #4 #6 #7 #8 #12 #14
  - answer `DE2`: closes #2 #6 #7 #12 #14
  - answer `DE3`: closes #2 #4 #7 #8 #14
  - answer `DE4`: closes #2 #4 #6 #7 #8 #14
  - answer `DE91`: closes #2 #4 #6 #7 #8 #12 #14
  - answer `DE5`: closes #2 #4 #6 #7 #8 #12 #14
  - answer `DED4`: closes #2 #4 #6 #8 #12
  - answer `DE71`: closes #2 #4 #6 #7 #8 #12 #14
  - answer `DEA4`: closes #4 #6 #7 #8 #12 #14
  - answer `DED2`: closes #2 #4 #6 #8 #12
  - answer `DEA1`: closes #4 #6 #7 #8 #12 #14
  - answer `DE13`: closes #2 #4 #6 #7 #8 #12 #14
  - answer `DE72`: closes #2 #4 #6 #7 #8 #12 #14
  - answer `DE6`: closes #2 #4 #6 #7 #8 #12 #14
  - answer `DE92`: closes #2 #4 #6 #7 #8 #12 #14
  - answer `DE7`: closes #2 #4 #6 #7 #8 #12 #14
  - answer `DE12`: closes #2 #4 #6 #7 #8 #12 #14
  - answer `DE73`: closes #2 #4 #6 #7 #8 #12 #14
  - answer `DEB1`: closes #2 #4 #6 #7 #8 #12 #14
  - answer `DEA2`: closes #4 #6 #7 #8 #12 #14
  - answer `DED5`: closes #2 #4 #6 #8 #12
  - answer `DE93`: closes #2 #4 #6 #7 #8 #12 #14
  - answer `DE8`: closes #2 #4 #6 #7 #8 #12 #14
  - answer `DE25`: closes #2 #6 #7 #12 #14
  - answer `DEA3`: closes #4 #6 #7 #8 #12 #14
  - answer `DE22`: closes #2 #6 #7 #12 #14
  - answer `DE9`: closes #2 #4 #6 #7 #8 #12 #14
  - answer `DEA`: closes #4 #6 #7 #8 #12 #14
  - answer `DE21`: closes #2 #6 #7 #12 #14
  - answer `DE24`: closes #2 #6 #7 #12 #14
  - answer `DE23`: closes #2 #6 #7 #12 #14
  - answer `DEB3`: closes #2 #4 #6 #7 #8 #12 #14
  - answer `DEB`: closes #2 #4 #6 #7 #8 #12 #14
  - answer `DEC`: closes #2 #4 #6 #7 #8 #12 #14
  - answer `DED`: closes #2 #4 #6 #8 #12
  - answer `DEE`: closes #2 #4 #6 #7 #8 #12 #14
  - answer `DEF`: closes #2 #4 #6 #7 #8 #12 #14
  - answer `DE27`: closes #2 #6 #7 #12 #14
  - answer `DE11`: closes #2 #4 #6 #7 #8 #12 #14
  - answer `DEG`: closes #2 #4 #6 #7 #8 #12 #14
  - answer `DEB2`: closes #2 #4 #6 #7 #8 #12 #14
  - answer `DE14`: closes #2 #4 #6 #7 #8 #12 #14
  - answer `DE26`: closes #2 #6 #7 #12 #14
  - answer `DE94`: closes #2 #4 #6 #7 #8 #12 #14

## Nortal — GovTech (Estonia)

pool 67 · window 18 · demands surviving all three legs: **4**

- **field `activities`** (separating) — asked because Rakendusuuringu ja tootearenduse toetus requires:
  > Tobacco, gambling and betting, and weapons and munitions are outside the scope of this aid. The exclusion is set by the framework the scheme is notified under, not by the scheme itself.
  6 of the 18 candidates impose it, in their own wordings.
  > Digitaliseerimise teekaardi toetus: Companies operating in certain excluded sectors cannot apply for the digitalisation roadmap support.
  > Digitaliseerimise teekaardi toetus: Detailed NACE-coded exclusion list defines ineligible sectors for the digitalisation roadmap support.
  moves 6 candidate(s): #4 Rakendusuuringu ja tootearenduse toetus; #10 Ettevõtja rakendusuuringute toetus (alates 02.06.2023); #12 Ettevõtte arenguprogrammi toetus 2024-2027; #14 Ettevõtja rakendusuuringute toetus (2024 muutmine); #15 Ettevõtete digipöörde toetus (pikendamine kuni 31.12.2026); #17 Digitaliseerimise teekaardi toetus
  - answer `financial_services`: closes #17
  - answer `primary_agriculture`: closes #17
  - answer `fisheries_aquaculture`: closes #17
  - answer `real_estate`: closes #17
  - answer `gambling_betting`: closes #4 #10 #12 #14 #15 #17
  - answer `tobacco`: closes #4 #10 #12 #14 #15 #17
  - answer `weapons`: closes #4 #10 #12 #14 #15

- **field `exclusionFlags`** (separating) — asked because Rakendusuuringu ja tootearenduse toetus requires:
  > Aid is not available to an undertaking in difficulty, or to one subject to an outstanding recovery decision. Accumulated losses above half of subscribed capital, or insolvency proceedings, put a company in that position until the equity is restored.
  5 of the 18 candidates impose it, in their own wordings.
  > Rakendusuuringu ja tootearenduse toetus: No liquidation, compulsory dissolution or bankruptcy proceedings may be initiated against the applicant, partner, or the person exercising controlling influence over them.
  > Rakendusuuringu ja tootearenduse toetus: Applicant and partner's tax and payment debt including interest must not exceed EUR 100, or its payment must be scheduled, and mandatory tax declarations and annual reports must have been filed.
  moves 5 candidate(s): #4 Rakendusuuringu ja tootearenduse toetus; #10 Ettevõtja rakendusuuringute toetus (alates 02.06.2023); #12 Ettevõtte arenguprogrammi toetus 2024-2027; #14 Ettevõtja rakendusuuringute toetus (2024 muutmine); #15 Ettevõtete digipöörde toetus (pikendamine kuni 31.12.2026)
  - answer `insolvency`: closes #4 #10 #12 #14 #15
  - answer `losses_over_half_capital`: closes #4 #10 #12 #14 #15
  - answer `recovery_order`: closes #4 #10 #12 #14 #15
  - answer `tax_arrears`: closes #4 #10 #12 #14 #15

- **field `cofinancingBand`** (narrowing) — asked because Rakendusuuringu ja tootearenduse toetus requires:
  > Applicant must provide co-financing that covers the portion of eligible costs not covered by the grant, and the project budget must include the required co-financing.
  6 of the 18 candidates impose it, in their own wordings.
  > Rakendusuuringute programm: Applicant must provide self-financing (co-financing) of between 20% and 75% depending on activity and company size.
  moves 6 candidate(s): #4 Rakendusuuringu ja tootearenduse toetus; #10 Ettevõtja rakendusuuringute toetus (alates 02.06.2023); #12 Ettevõtte arenguprogrammi toetus 2024-2027; #13 Rakendusuuringute programm; #14 Ettevõtja rakendusuuringute toetus (2024 muutmine); #15 Ettevõtete digipöörde toetus (pikendamine kuni 31.12.2026)
  - answer `>50%`: closes #13
  - answer `25-50%`: closes #4 #10 #12 #14 #15
  - answer `<25%`: closes #4 #10 #12 #14 #15

- **field `turnoverBand`** (narrowing) — asked because Ettevotte arenguprogramm (enterprise development) requires:
  > Applicant must be an SME by turnover/balance sheet thresholds
  moves 1 candidate(s): #11 Ettevotte arenguprogramm (enterprise development)
  - answer `>50M`: closes #11

## sennder — Platform (Germany)

pool 17 · window 17 · demands surviving all three legs: **6**

- **field `consortium`** (separating) — asked because Clean Aviation requires:
  > Consortia must include at least one independent legal entity established in a Member State and at least two other independent legal entities each established in different Member States or Associated Countries, unless otherwise provided.
  17 of the 17 candidates impose it, in their own wordings.
  > Clean Aviation: Must participate as part of a consortium aligned to the Clean Aviation partnership roadmap, not as a solo applicant
  > Europes Rail: Applicant must be a formal consortium (multiple legal entities) rather than a solo company
  moves 17 candidate(s): #1 Clean Aviation; #2 Europes Rail; #3 Sesar JU; #4 EIC Transition; #5 EIC Pathfinder; #6 IHI; #7 CHP; #8 Sns JU (+9 more)
  - answer `yes`: opens #2 #7 #8 #10 #17
  - answer `no`: opens #2 #7 #8 #10 #17, closes #1 #3 #4 #5 #6 #9 #11 #12 #13 #14 #15 #16
  - answer `unsure`: closes #5

- **field `nonEuControl`** (separating) — asked because Horizon EU CL1 requires:
  > Legal entities established outside Russia but more than 50% owned by a Russia-established entity are also not eligible to participate.
  5 of the 17 candidates impose it, in their own wordings.
  > Horizon EU CL4: Legal entities established outside Russia whose proprietary rights are more than 50% owned directly or indirectly by a Russian-established person, entity, or body are not eligible to participate in any capacity.
  > Horizon EU CL3: Legal entities established outside Russia whose proprietary rights are more than 50% owned by a Russia-established entity are not eligible to participate.
  moves 5 candidate(s): #9 Horizon EU CL1; #11 Horizon EU CL4; #15 Horizon EU CL3; #16 ERC POC; #17 Euspa
  - answer `yes`: closes #9 #11 #15 #16 #17
  - answer `no`: opens #17

- **field `exclusionFlags`** (separating) — asked because Horizon EU CL1 requires:
  > Applicants subject to EU administrative exclusion sanctions or in exclusion situations (e.g. bankruptcy) cannot participate.
  5 of the 17 candidates impose it, in their own wordings.
  > Horizon EU CL4: Applicants subject to EU administrative sanctions (exclusion) or in situations such as bankruptcy, winding up, court-administered affairs, arrangement with creditors, or suspended business activities cannot participate.
  > Horizon EU CL6: Applicants subject to EU administrative sanctions or in exclusion situations (e.g. bankruptcy, winding up) cannot participate.
  moves 5 candidate(s): #9 Horizon EU CL1; #11 Horizon EU CL4; #14 Horizon EU CL6; #15 Horizon EU CL3; #16 ERC POC
  - answer `insolvency`: closes #9 #11 #14 #15 #16
  - answer `sanctions`: closes #9 #14 #16

- **field `turnoverBand`** (separating) — asked because IHI requires:
  > For-profit legal entities with an annual turnover of EUR 500 million or more, or entities controlling/controlled by such entities, participating in a two-stage call alongside a pre-identified entity, are not eligible for funding.
  moves 1 candidate(s): #6 IHI
  - answer `>50M`: closes #6

- **field `ownerOver25`** (separating) — asked because Horizon EU Miss requires:
  > Legal entities established outside Russia but more than 50% owned, directly or indirectly, by a Russian-established entity are not eligible to participate in any capacity.
  2 of the 17 candidates impose it, in their own wordings.
  > Horizon EU CL6: Legal entities established outside Russia but more than 50% owned by a Russia-established entity are not eligible to participate.
  moves 2 candidate(s): #13 Horizon EU Miss; #14 Horizon EU CL6
  - answer `yes`: closes #13 #14

- **field `activities`** (separating) — asked because Horizon EU Miss requires:
  > Projects must focus exclusively on civil applications and must not involve human cloning, heritable genetic modification, or creation of human embryos solely for research.
  moves 1 candidate(s): #13 Horizon EU Miss
  - answer `weapons`: closes #13

## Nebius — Cloud / NeoCloud (Netherlands)

pool 44 · window 18 · demands surviving all three legs: **6**

- **field `exclusionFlags`** (separating) — asked because NL-EZK-KE: DEI+ wijziging en openstelling van de subsidiemodules inzake de DEI+ requires:
  > Aid is not available to an undertaking in difficulty, or to one subject to an outstanding recovery decision. Accumulated losses above half of subscribed capital, or insolvency proceedings, put a company in that position until the equity is restored.
  16 of the 18 candidates impose it, in their own wordings.
  > Horizon EU CL6: Applicants subject to EU administrative sanctions or in exclusion situations (e.g. bankruptcy, winding up) cannot participate.
  > Horizon EU CL3: Applicants subject to EU administrative sanctions or in exclusion situations such as bankruptcy, winding-up, or court-administered affairs cannot participate.
  moves 16 candidate(s): #1 NL-EZK-KE: DEI+ wijziging en openstelling van de subsidiemodules inzake de DEI+; #2 Horizon EU CL6; #3 NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimulering topsectoren Zuid-Holland; #5 NL_BZK_CSDO_NB Subsidieregeling cofinanciering Europese programma’s 2021-2027 Noord-Brabant, verlenging onderdeel OPZuid; #6 NL-EZK-B&I-I&K-RVO wijziging RNES 3.2 PPS-innovatie; #7 NL-EZK-B&I-I&K wijziging Subsidieregeling JTF 2021 - 2027; #8 NL-EZK-KE: DEI+ budgetophoging subsidiemodules inzake de DEI+ juli 2019 (verlenging AGVV); #9 Horizon EU CL3 (+8 more)
  - answer `insolvency`: closes #1 #2 #3 #5 #6 #7 #8 #9 #10 #11 #12 #13 #15 #16 #17 #18
  - answer `losses_over_half_capital`: closes #1 #3 #5 #6 #7 #8 #10 #12 #13 #15 #16 #17 #18
  - answer `recovery_order`: closes #1 #3 #5 #6 #7 #8 #10 #12 #13 #15 #16 #17 #18
  - answer `sanctions`: closes #2 #11

- **field `activities`** (separating) — asked because NL-EZK-KE: DEI+ wijziging en openstelling van de subsidiemodules inzake de DEI+ requires:
  > Tobacco, gambling and betting, and weapons and munitions are outside the scope of this aid. The exclusion is set by the framework the scheme is notified under, not by the scheme itself.
  13 of the 18 candidates impose it, in their own wordings.
  moves 13 candidate(s): #1 NL-EZK-KE: DEI+ wijziging en openstelling van de subsidiemodules inzake de DEI+; #3 NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimulering topsectoren Zuid-Holland; #5 NL_BZK_CSDO_NB Subsidieregeling cofinanciering Europese programma’s 2021-2027 Noord-Brabant, verlenging onderdeel OPZuid; #6 NL-EZK-B&I-I&K-RVO wijziging RNES 3.2 PPS-innovatie; #7 NL-EZK-B&I-I&K wijziging Subsidieregeling JTF 2021 - 2027; #8 NL-EZK-KE: DEI+ budgetophoging subsidiemodules inzake de DEI+ juli 2019 (verlenging AGVV); #10 NL-EZK-KE: RTE wijziging en openstelling van de subsidiemodules inzake de Topsector energieprojecten wijziging juli 2019; #12 NL/IenW/_Tijdelijke subsidieregeling zero-emissie mobiliteit - Paragraaf 2.3 Private laadinfrastructuur elektrische voertuigen (+5 more)
  - answer `gambling_betting`: closes #1 #3 #5 #6 #7 #8 #10 #12 #13 #15 #16 #17 #18
  - answer `tobacco`: closes #1 #3 #5 #6 #7 #8 #10 #12 #13 #15 #16 #17 #18
  - answer `weapons`: closes #1 #3 #5 #6 #7 #8 #10 #12 #13 #15 #16 #17 #18

- **field `consortium`** (separating) — asked because Horizon EU CL6 requires:
  > Standard collaborative actions require a consortium of at least three independent legal entities each established in a different Member State/Associated Country, with at least one in a Member State.
  5 of the 18 candidates impose it, in their own wordings.
  > Horizon EU CL6: Must apply as part of a multi-partner consortium (typically 3+ organisations from 3+ eligible countries), not as a solo applicant
  > EIC Transition: Consortia must include entities established in different Member States or Associated Countries per applicable configuration.
  moves 5 candidate(s): #2 Horizon EU CL6; #4 EIC Transition; #9 Horizon EU CL3; #11 Horizon EU CL1; #14 Eurohpc
  - answer `yes`: opens #14
  - answer `no`: opens #14, closes #2 #4 #9 #11

- **field `region`** (separating) — asked because NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimulering topsectoren Zuid-Holland requires:
  > Subsidy for a feasibility project is granted to an SME enterprise with an establishment in the province of Zuid-Holland.
  6 of the 18 candidates impose it, in their own wordings.
  > NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimulering topsectoren Zuid-Holland: Registered with the European Commission as applying in NL3. A company established outside those regions is not eligible under this scheme.
  > NL_BZK_CSDO_NB Subsidieregeling cofinanciering Europese programma’s 2021-2027 Noord-Brabant, verlenging onderdeel OPZuid: A project counts as benefiting Noord-Brabant only if more than half of the eligible costs are incurred by participants established in the province of Noord-Brabant.
  moves 6 candidate(s): #3 NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimulering topsectoren Zuid-Holland; #5 NL_BZK_CSDO_NB Subsidieregeling cofinanciering Europese programma’s 2021-2027 Noord-Brabant, verlenging onderdeel OPZuid; #7 NL-EZK-B&I-I&K wijziging Subsidieregeling JTF 2021 - 2027; #13 NL_BZK_CSDO_GD_Vierde wijziging Beleidsregel Programma EFRO Oost-Nederland 2022 (wijziging november 2024); #15 NL_BZK_CSDO_NB OP Zuid Subsidieregeling OPZuid 2021 - 2027 uitbreiding; #16 NL-EZK-B&I-I&K Subsidieregeling JTF 2021 - 2027
  - answer `NL13`: closes #3 #5 #7 #13 #15 #16
  - answer `NL23`: closes #3 #5 #7 #15 #16
  - answer `NL12`: closes #3 #5 #7 #13 #15 #16
  - answer `NL22`: closes #3 #5 #7 #15 #16
  - answer `NL11`: closes #3 #5 #13 #15 #16
  - answer `NL42`: closes #3 #5 #13 #16
  - answer `NL41`: closes #3 #13 #16
  - answer `NL32`: closes #3 #5 #13 #15 #16
  - answer `NL1`: closes #3 #5 #13 #15 #16
  - answer `NL2`: closes #3 #5 #7 #15 #16
  - answer `NL21`: closes #3 #5 #7 #15 #16
  - answer `NL35`: closes #3 #5 #13 #15 #16
  - answer `NL3`: closes #5 #13
  - answer `NL34`: closes #3 #5 #13 #16
  - answer `NL36`: closes #5 #13 #15
  - answer `NL4`: closes #3 #13 #16

- **field `ownerOver25`** (separating) — asked because Horizon EU CL6 requires:
  > Legal entities established outside Russia but more than 50% owned by a Russia-established entity are not eligible to participate.
  moves 1 candidate(s): #2 Horizon EU CL6
  - answer `yes`: closes #2

- **field `nonEuControl`** (separating) — asked because Horizon EU CL3 requires:
  > Legal entities established outside Russia whose proprietary rights are more than 50% owned by a Russia-established entity are not eligible to participate.
  2 of the 18 candidates impose it, in their own wordings.
  > Horizon EU CL1: Legal entities established outside Russia but more than 50% owned by a Russia-established entity are also not eligible to participate.
  moves 2 candidate(s): #9 Horizon EU CL3; #11 Horizon EU CL1
  - answer `yes`: closes #9 #11

## Corti — MedTech (Denmark)

pool 28 · window 18 · demands surviving all three legs: **7**

- **field `consortium`** (separating) — asked because Grand Solutions requires:
  > An application must have at least two project participants, of which at least one is not a public university (with an exception for quantum technology calls).
  14 of the 18 candidates impose it, in their own wordings.
  > Erhvervsforsker: An Industrial PhD project must be a collaboration between a company, a university, and an Industrial PhD student.
  > ERC POC: Unless call conditions provide otherwise, the consortium must include at least three independent legal entities established in three different countries: one in a Member State and two others each in different Member States or Associated Countries.
  moves 14 candidate(s): #1 Grand Solutions; #6 Erhvervsforsker; #7 ERC POC; #8 EIC Transition; #9 Horizon EU CL1; #10 Horizon EU CL6; #11 Horizon EU Miss; #12 IHI (+6 more)
  - answer `yes`: opens #17
  - answer `no`: opens #17, closes #1 #6 #7 #8 #9 #10 #11 #12 #13 #14 #15 #16 #18

- **field `exclusionFlags`** (separating) — asked because Grand Solutions requires:
  > An applicant that has previously received aid declared incompatible with the internal market and has not repaid it cannot receive an investment.
  9 of the 18 candidates impose it, in their own wordings.
  > Grand Solutions: An investment must not contravene national or international sanctions, including asset freezes and prohibitions on provision of funds to listed persons/entities.
  > Innobooster: Companies under compulsory dissolution, bankruptcy, voluntary liquidation, or suspension of payments cannot receive Innobooster investment.
  moves 9 candidate(s): #1 Grand Solutions; #5 Innobooster; #6 Erhvervsforsker; #7 ERC POC; #9 Horizon EU CL1; #10 Horizon EU CL6; #15 Horizon EU CL4; #16 Horizon EU CL5 (+1 more)
  - answer `none`: closes #1
  - answer `insolvency`: closes #1 #5 #6 #7 #9 #10 #15 #16 #18
  - answer `losses_over_half_capital`: closes #1
  - answer `recovery_order`: closes #6
  - answer `sanctions`: closes #1 #7 #9 #10 #18
  - answer `tax_arrears`: closes #1

- **field `nonEuControl`** (separating) — asked because ERC POC requires:
  > Legal entities established outside Russia that are more than 50% owned by a Russia-established person/entity are not eligible to participate in any capacity.
  5 of the 18 candidates impose it, in their own wordings.
  > Horizon EU CL1: Legal entities established outside Russia but more than 50% owned by a Russia-established entity are also not eligible to participate.
  > Horizon EU CL4: Legal entities established outside Russia whose proprietary rights are more than 50% owned directly or indirectly by a Russian-established person, entity, or body are not eligible to participate in any capacity.
  moves 5 candidate(s): #7 ERC POC; #9 Horizon EU CL1; #15 Horizon EU CL4; #16 Horizon EU CL5; #18 Horizon EU CBE
  - answer `yes`: closes #7 #9 #15 #16 #18

- **field `ownerOver25`** (separating) — asked because Innobooster requires:
  > Companies where more than 50 per cent is owned by the state, regions or municipalities are excluded from investment.
  3 of the 18 candidates impose it, in their own wordings.
  > Horizon EU CL6: Legal entities established outside Russia but more than 50% owned by a Russia-established entity are not eligible to participate.
  > Horizon EU Miss: Legal entities established outside Russia but more than 50% owned, directly or indirectly, by a Russian-established entity are not eligible to participate in any capacity.
  moves 3 candidate(s): #5 Innobooster; #10 Horizon EU CL6; #11 Horizon EU Miss
  - answer `yes`: closes #5 #10 #11

- **field `cofinancingBand`** (narrowing) — asked because Innobooster requires:
  > Innovation Fund Denmark co-finances a maximum of 35 per cent of the company's relevant project expenses.
  2 of the 18 candidates impose it, in their own wordings.
  > IHI: Applicant consortia must ensure at least 45% of the action's eligible costs (and costs for related additional activities) are provided by industry contributions (IKOP, FC, IKAA) from private members/contributing partners; this is a strict eligibility criterion for evaluation.
  moves 1 candidate(s): #5 Innobooster
  - answer `>50%`: closes #5

- **field `activities`** (separating) — asked because Horizon EU Miss requires:
  > Projects must focus exclusively on civil applications and must not involve human cloning, heritable genetic modification, or creation of human embryos solely for research.
  moves 1 candidate(s): #11 Horizon EU Miss
  - answer `weapons`: closes #11

- **field `turnoverBand`** (separating) — asked because IHI requires:
  > For-profit legal entities with an annual turnover of EUR 500 million or more, or entities controlling/controlled by such entities, participating in a two-stage call alongside a pre-identified entity, are not eligible for funding.
  moves 1 candidate(s): #12 IHI
  - answer `>50M`: closes #12

## BioNTech — Life sciences (Germany)

pool 21 · window 18 · demands surviving all three legs: **6**

- **field `consortium`** (separating) — asked because Gh Edctp3 requires:
  > Consortium must include at least three independent legal entities each established in a different eligible country.
  17 of the 18 candidates impose it, in their own wordings.
  > Gh Edctp3: Consortium must include at least one independent legal entity established in a sub-Saharan African country that is a member of the EDCTP Association.
  > Gh Edctp3: All topics require at least one partner from EU/Horizon-Europe-associated countries that is an EDCTP Association member and at least one partner from SSA countries that are EDCTP Association members.
  moves 17 candidate(s): #1 Gh Edctp3; #2 Horizon EU CL1; #3 IHI; #4 Clean Aviation; #5 Horizon EU CL4; #6 Horizon EU Miss; #7 CHP; #8 Sns JU (+9 more)
  - answer `yes`: opens #7 #8 #10 #13 #14
  - answer `no`: opens #7 #8 #10 #13 #14, closes #1 #2 #3 #4 #5 #6 #9 #11 #12 #15 #16 #17
  - answer `unsure`: closes #17

- **field `exclusionFlags`** (separating) — asked because Horizon EU CL1 requires:
  > Applicants subject to EU administrative exclusion sanctions or in exclusion situations (e.g. bankruptcy) cannot participate.
  6 of the 18 candidates impose it, in their own wordings.
  > Horizon EU CL4: Applicants subject to EU administrative sanctions (exclusion) or in situations such as bankruptcy, winding up, court-administered affairs, arrangement with creditors, or suspended business activities cannot participate.
  > Horizon EU CL3: Applicants subject to EU administrative sanctions or in exclusion situations such as bankruptcy, winding-up, or court-administered affairs cannot participate.
  moves 6 candidate(s): #2 Horizon EU CL1; #5 Horizon EU CL4; #9 Horizon EU CL3; #11 Horizon EU CL6; #12 ERC POC; #18 Innovation Fund Battery
  - answer `insolvency`: closes #2 #5 #9 #11 #12 #18
  - answer `losses_over_half_capital`: closes #18
  - answer `recovery_order`: closes #18
  - answer `sanctions`: closes #2 #11 #12 #18
  - answer `tax_arrears`: closes #18

- **field `nonEuControl`** (separating) — asked because Horizon EU CL1 requires:
  > Legal entities established outside Russia but more than 50% owned by a Russia-established entity are also not eligible to participate.
  5 of the 18 candidates impose it, in their own wordings.
  > Horizon EU CL4: Legal entities established outside Russia whose proprietary rights are more than 50% owned directly or indirectly by a Russian-established person, entity, or body are not eligible to participate in any capacity.
  > Horizon EU CL3: Legal entities established outside Russia whose proprietary rights are more than 50% owned by a Russia-established entity are not eligible to participate.
  moves 5 candidate(s): #2 Horizon EU CL1; #5 Horizon EU CL4; #9 Horizon EU CL3; #12 ERC POC; #14 Euspa
  - answer `yes`: closes #2 #5 #9 #12 #14
  - answer `no`: opens #14

- **field `ownerOver25`** (separating) — asked because Horizon EU Miss requires:
  > Legal entities established outside Russia but more than 50% owned, directly or indirectly, by a Russian-established entity are not eligible to participate in any capacity.
  2 of the 18 candidates impose it, in their own wordings.
  > Horizon EU CL6: Legal entities established outside Russia but more than 50% owned by a Russia-established entity are not eligible to participate.
  moves 2 candidate(s): #6 Horizon EU Miss; #11 Horizon EU CL6
  - answer `yes`: closes #6 #11

- **field `turnoverBand`** (separating) — asked because IHI requires:
  > For-profit legal entities with an annual turnover of EUR 500 million or more, or entities controlling/controlled by such entities, participating in a two-stage call alongside a pre-identified entity, are not eligible for funding.
  moves 1 candidate(s): #3 IHI
  - answer `>50M`: closes #3

- **field `activities`** (separating) — asked because Horizon EU Miss requires:
  > Projects must focus exclusively on civil applications and must not involve human cloning, heritable genetic modification, or creation of human embryos solely for research.
  moves 1 candidate(s): #6 Horizon EU Miss
  - answer `weapons`: closes #6

## eAgronom — AgriTech (Estonia)

pool 78 · window 18 · demands surviving all three legs: **4**

- **field `activities`** (separating) — asked because Ettevõtja rakendusuuringute toetus (alates 02.06.2023) requires:
  > Tobacco, gambling and betting, and weapons and munitions are outside the scope of this aid. The exclusion is set by the framework the scheme is notified under, not by the scheme itself.
  7 of the 18 candidates impose it, in their own wordings.
  > Digitaliseerimise teekaardi toetus: Companies operating in certain excluded sectors cannot apply for the digitalisation roadmap support.
  > Digitaliseerimise teekaardi toetus: Detailed NACE-coded exclusion list defines ineligible sectors for the digitalisation roadmap support.
  moves 7 candidate(s): #3 Ettevõtja rakendusuuringute toetus (alates 02.06.2023); #4 Ettevõtte arenguprogrammi toetus 2024-2027; #6 Digitaliseerimise teekaardi toetus; #9 Rakendusuuringu ja tootearenduse toetus; #10 Ettevotete digipoorde toetus (digital transformation); #11 Ettevõtja rakendusuuringute toetus (2024 muutmine); #18 Ettevotja varustuskindluse toetus (security of supply)
  - answer `financial_services`: closes #6 #10 #18
  - answer `primary_agriculture`: closes #6 #10 #18
  - answer `fisheries_aquaculture`: closes #6 #10 #18
  - answer `real_estate`: closes #6 #10 #18
  - answer `gambling_betting`: closes #3 #4 #6 #9 #10 #11 #18
  - answer `tobacco`: closes #3 #4 #6 #9 #10 #11 #18
  - answer `weapons`: closes #3 #4 #9 #11

- **field `exclusionFlags`** (separating) — asked because Ettevõtja rakendusuuringute toetus (alates 02.06.2023) requires:
  > Aid is not available to an undertaking in difficulty, or to one subject to an outstanding recovery decision. Accumulated losses above half of subscribed capital, or insolvency proceedings, put a company in that position until the equity is restored.
  5 of the 18 candidates impose it, in their own wordings.
  > Ettevõtja rakendusuuringute toetus (alates 02.06.2023): No liquidation, compulsory dissolution or bankruptcy proceedings may be initiated against the applicant, partner, or the person exercising controlling influence over them.
  > Ettevõtja rakendusuuringute toetus (alates 02.06.2023): Applicant and partner's tax and payment debt including interest must not exceed EUR 100, or its payment must be scheduled, and mandatory tax declarations and annual reports must have been filed.
  moves 5 candidate(s): #3 Ettevõtja rakendusuuringute toetus (alates 02.06.2023); #4 Ettevõtte arenguprogrammi toetus 2024-2027; #9 Rakendusuuringu ja tootearenduse toetus; #10 Ettevotete digipoorde toetus (digital transformation); #11 Ettevõtja rakendusuuringute toetus (2024 muutmine)
  - answer `insolvency`: closes #3 #4 #9 #10 #11
  - answer `losses_over_half_capital`: closes #3 #4 #9 #10 #11
  - answer `recovery_order`: closes #3 #4 #9 #10 #11
  - answer `sanctions`: closes #10
  - answer `tax_arrears`: closes #3 #4 #9 #10 #11

- **field `cofinancingBand`** (separating) — asked because Ettevõtja rakendusuuringute toetus (alates 02.06.2023) requires:
  > Applicant must provide co-financing that covers the portion of eligible costs not covered by the grant, and the project budget must include the required co-financing.
  6 of the 18 candidates impose it, in their own wordings.
  > Rakendusuuringute programm: Applicant must provide self-financing (co-financing) of between 20% and 75% depending on activity and company size.
  > Ettevotete digipoorde toetus (digital transformation): De minimis (VTA) aid to the applicant must not exceed €300,000.
  moves 5 candidate(s): #3 Ettevõtja rakendusuuringute toetus (alates 02.06.2023); #4 Ettevõtte arenguprogrammi toetus 2024-2027; #7 Rakendusuuringute programm; #9 Rakendusuuringu ja tootearenduse toetus; #11 Ettevõtja rakendusuuringute toetus (2024 muutmine)
  - answer `>50%`: closes #7
  - answer `25-50%`: closes #3 #4 #9 #11
  - answer `<25%`: closes #3 #4 #9 #11

- **field `turnoverBand`** (narrowing) — asked because Ettevotte arenguprogramm (enterprise development) requires:
  > Applicant must be an SME by turnover/balance sheet thresholds
  3 of the 18 candidates impose it, in their own wordings.
  > Rohetoetus: arendustegevuse elluviimine ja ärimudeli muutmise rakendamine: Applicant must be an SME (per EU SME definition)
  > Ettevotete digipoorde toetus (digital transformation): Applicant's average sales revenue in its main activity area in Estonia over the two financial years preceding the application must be at least €200,000, per the annual reports submitted to the Business Register.
  moves 1 candidate(s): #1 Ettevotte arenguprogramm (enterprise development)
  - answer `>50M`: closes #1

## Summary

| company | window | demands | fields |
| --- | ---: | ---: | --- |
| Neura Robotics | 18 | 7 | consortium*, exclusionFlags*, nonEuControl*, ownerOver25*, activities*, cofinancingBand*, turnoverBand* |
| SMART Photonics | 18 | 8 | exclusionFlags*, activities*, region*, consortium, wouldOpenEntity, nonEuControl*, conditionality, needBy |
| Silvr | 18 | 7 | exclusionFlags*, region*, nonEuControl*, consortium*, turnoverBand*, wouldOpenEntity, institutionalBacking |
| bunq | 18 | 5 | exclusionFlags*, region*, consortium, nonEuControl*, ownerOver25 |
| Photoroom | 18 | 8 | exclusionFlags*, activities*, consortium*, nonEuControl, turnoverBand, wouldOpenEntity, institutionalBacking, region |
| Aleph Alpha | 18 | 4 | activities, exclusionFlags, cofinancingBand, region* |
| Nortal | 18 | 4 | activities*, exclusionFlags*, cofinancingBand, turnoverBand |
| sennder | 17 | 6 | consortium*, nonEuControl*, exclusionFlags*, turnoverBand*, ownerOver25*, activities* |
| Nebius | 18 | 6 | exclusionFlags*, activities*, consortium*, region*, ownerOver25*, nonEuControl* |
| Corti | 18 | 7 | consortium*, exclusionFlags*, nonEuControl*, ownerOver25*, cofinancingBand, activities*, turnoverBand* |
| BioNTech | 18 | 6 | consortium*, exclusionFlags*, nonEuControl*, ownerOver25*, turnoverBand*, activities* |
| eAgronom | 18 | 4 | activities*, exclusionFlags*, cofinancingBand*, turnoverBand |


`*` marks a SEPARATING demand: two answers send the founder to different
candidates. An unmarked one only NARROWS — some answers remove candidates,
none is promoted past another.

12 of 12 founders have at least one demand that would
change the outcome. The rest get no questions, and that is the designed output.
12 of 12 have at least one demand that SEPARATES.
