# The questions the ranker would ask, for the twelve archetypes

intake state: `screen1` · ceiling: 4 questions · no model call

The SUBJECT of every question below is computed, not chosen: it is a
requirement a candidate imposes, whose value we do not hold, and whose answer
changes the qualification of at least one candidate. The MEANING of each
question is the shipped stem for that field, which is what the founder is
being asked whatever wording the model puts on it. The model's own turn
decides which of these are answerable and rewrites the wording and the
labels for this company; the answer space is fixed and is shown here.

## Neura Robotics — Robotics (Germany)

**Q. Could you run this project with three or more partners, or only on your own?**

- answers: Yes, we could run a 3+ partner consortium / No, single applicant only / Not sure
- grounded in Horizon EU CL1, verbatim: "A consortium must include at least three independent legal entities established in three different countries, with at least one in a Member State and at least two others in different Member States/Associated Countries."
- imposed by 14 of the 18 candidates
- separating. It moves 14: #1 Horizon EU CL1; #2 Horizon EU CL4; #3 Horizon EU Miss; #4 Horizon EU CL3; #5 Horizon EU CL6 (+9 more)
  - `yes` promotes #15 #16 #17
  - `no` promotes #15 #16 #17, drops #1 #2 #3 #4 #5 #6 #7 #8 #12 #14 #18
  - `unsure` drops #8

**Q. Do any of these apply to your company right now?**

- answers: None of these apply / In bankruptcy, insolvency or winding-up / Accumulated losses exceed half our share capital / Under an unpaid EU state-aid recovery order / Subject to EU sanctions or an exclusion decision / Overdue tax or social-security debt
- grounded in Horizon EU CL1, verbatim: "Applicants subject to EU administrative exclusion sanctions or in exclusion situations (e.g. bankruptcy) cannot participate."
- imposed by 9 of the 18 candidates
- separating. It moves 9: #1 Horizon EU CL1; #2 Horizon EU CL4; #4 Horizon EU CL3; #5 Horizon EU CL6; #6 ERC POC (+4 more)
  - `none` promotes #13
  - `insolvency` drops #1 #2 #4 #5 #6 #9 #10 #11 #13
  - `losses_over_half_capital` promotes #13, drops #9 #10 #11
  - `recovery_order` promotes #13, drops #9 #10 #11
  - `sanctions` drops #1 #5 #6 #9 #10 #11 #13
  - `tax_arrears` drops #9 #10 #11 #13

**Q. Is your company majority-owned or controlled from outside the EU?**

- answers: Yes / No / Not sure
- grounded in Horizon EU CL1, verbatim: "Legal entities established outside Russia but more than 50% owned by a Russia-established entity are also not eligible to participate."
- imposed by 4 of the 18 candidates
- separating. It moves 4: #1 Horizon EU CL1; #2 Horizon EU CL4; #4 Horizon EU CL3; #6 ERC POC
  - `yes` drops #1 #2 #4 #6

**Q. Does any single shareholder own more than 25% of your company?**

- answers: Yes / No / Not sure
- grounded in Horizon EU Miss, verbatim: "Legal entities established outside Russia but more than 50% owned, directly or indirectly, by a Russian-established entity are not eligible to participate in any capacity."
- imposed by 2 of the 18 candidates
- separating. It moves 2: #3 Horizon EU Miss; #5 Horizon EU CL6
  - `yes` drops #3 #5

## SMART Photonics — Hardware (Netherlands)

**Q. Do any of these apply to your company right now?**

- answers: None of these apply / In bankruptcy, insolvency or winding-up / Accumulated losses exceed half our share capital / Under an unpaid EU state-aid recovery order / Subject to EU sanctions or an exclusion decision / Overdue tax or social-security debt
- grounded in NL-EZK-B&I-I&K-RVO NGFNH2201 NXTGEN HIGHTECH, verbatim: "Aid is not available to an undertaking in difficulty, or to one subject to an outstanding recovery decision. Accumulated losses above half of subscribed capital, or insolvency proceedings, put a company in that position until the equity is restored."
- imposed by 14 of the 18 candidates
- separating. It moves 14: #2 NL-EZK-B&I-I&K-RVO NGFNH2201 NXTGEN HIGHTECH; #4 NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimulering topsectoren Zuid-Holland; #5 NL_BZK_CSDO_NB OP Zuid Subsidieregeling OPZuid 2021 - 2027 uitbreiding; #6 NL_BZK_CSDO_NB Subsidieregeling cofinanciering Europese programma’s 2021-2027 Noord-Brabant, verlenging onderdeel OPZuid; #7 NL-EZK-B&I-I&K Subsidieregeling JTF 2021 - 2027 (+9 more)
  - `none` promotes #11
  - `insolvency` drops #2 #4 #5 #6 #7 #8 #9 #10 #11 #12 #14 #15 #16 #18
  - `losses_over_half_capital` promotes #11, drops #2 #4 #5 #6 #7 #8 #10 #12 #14 #15 #16 #18
  - `recovery_order` promotes #11, drops #2 #4 #5 #6 #7 #8 #10 #12 #14 #15 #16 #18
  - `sanctions` drops #9 #11
  - `tax_arrears` drops #11

**Q. Which of these regulated activities does your company carry out?**

- answers: None of these / Lending, banking, insurance or payments (as the provider) / Primary agricultural production / Fisheries or aquaculture / Road freight transport for hire or reward / Real estate / Gambling or betting / Tobacco / Alcohol / Weapons or munitions
- grounded in NL-EZK-B&I-I&K-RVO NGFNH2201 NXTGEN HIGHTECH, verbatim: "Tobacco, gambling and betting, and weapons and munitions are outside the scope of this aid. The exclusion is set by the framework the scheme is notified under, not by the scheme itself."
- imposed by 12 of the 18 candidates
- separating. It moves 12: #2 NL-EZK-B&I-I&K-RVO NGFNH2201 NXTGEN HIGHTECH; #4 NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimulering topsectoren Zuid-Holland; #5 NL_BZK_CSDO_NB OP Zuid Subsidieregeling OPZuid 2021 - 2027 uitbreiding; #6 NL_BZK_CSDO_NB Subsidieregeling cofinanciering Europese programma’s 2021-2027 Noord-Brabant, verlenging onderdeel OPZuid; #7 NL-EZK-B&I-I&K Subsidieregeling JTF 2021 - 2027 (+7 more)
  - `gambling_betting` drops #2 #4 #5 #6 #7 #8 #10 #12 #14 #15 #16 #18
  - `tobacco` drops #2 #4 #5 #6 #7 #8 #10 #12 #14 #15 #16 #18
  - `weapons` drops #2 #4 #5 #6 #7 #8 #10 #12 #14 #15 #16 #18

**Q. Which region is your company established in?**

- answers: Drenthe / Flevoland / Friesland (NL) / Gelderland / Groningen / Limburg (NL) / Noord-Brabant / Noord-Holland / Noord-Nederland / Oost-Nederland / Overijssel / Utrecht / West-Nederland / Zeeland / Zuid-Holland / Zuid-Nederland
- grounded in NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimulering topsectoren Zuid-Holland, verbatim: "Subsidy for a feasibility project is granted to an SME enterprise with an establishment in the province of Zuid-Holland."
- imposed by 5 of the 18 candidates
- separating. It moves 5: #4 NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimulering topsectoren Zuid-Holland; #5 NL_BZK_CSDO_NB OP Zuid Subsidieregeling OPZuid 2021 - 2027 uitbreiding; #6 NL_BZK_CSDO_NB Subsidieregeling cofinanciering Europese programma’s 2021-2027 Noord-Brabant, verlenging onderdeel OPZuid; #7 NL-EZK-B&I-I&K Subsidieregeling JTF 2021 - 2027; #18 NL_BZK_CSDO_GD_Vierde wijziging Beleidsregel Programma EFRO Oost-Nederland 2022 (wijziging november 2024)
  - `NL13` drops #4 #5 #6 #7 #18
  - `NL23` drops #4 #5 #6 #7
  - `NL12` drops #4 #5 #6 #7 #18
  - `NL22` drops #4 #5 #6 #7
  - `NL11` drops #4 #5 #6 #7 #18
  - `NL42` drops #4 #6 #7 #18
  - `NL41` drops #4 #7 #18
  - `NL32` drops #4 #5 #6 #7 #18

**Q. Could you run this project with three or more partners, or only on your own?**

- answers: Yes, we could run a 3+ partner consortium / No, single applicant only / Not sure
- grounded in EIC Transition, verbatim: "Consortia must include entities established in different Member States or Associated Countries per applicable configuration."
- imposed by 5 of the 18 candidates
- narrowing. It moves 5: #3 EIC Transition; #9 ERC POC; #11 Chips JU KDT; #13 Chips JU KDT Unknown; #17 EIC Pathfinder
  - `yes` promotes #11 #13
  - `no` promotes #11 #13, drops #3 #9 #17
  - `unsure` drops #17

## Silvr — FinTech (business lending) (France)

**Q. Do any of these apply to your company right now?**

- answers: None of these apply / In bankruptcy, insolvency or winding-up / Accumulated losses exceed half our share capital / Under an unpaid EU state-aid recovery order / Subject to EU sanctions or an exclusion decision / Overdue tax or social-security debt
- grounded in Régime cadre exempté de notification relatif aux aides en faveur des PME pour la période 2024-2026, verbatim: "Aid is not available to an undertaking in difficulty, or to one subject to an outstanding recovery decision. Accumulated losses above half of subscribed capital, or insolvency proceedings, put a company in that position until the equity is restored."
- imposed by 16 of the 18 candidates
- separating. It moves 16: #1 Régime cadre exempté de notification relatif aux aides en faveur des PME pour la période 2024-2026; #2 Régime cadre exempté de notification relatif aux aides à la recherche, au développement et à l’innovation (RDI) pour la période 2014-2023; #3 Soutien à la modernisation des industries techniques et à l'innovation technologique; #4 Bpifrance; #5 Ministère de l'Agriculture et de l'alimentation (+11 more)
  - `insolvency` drops #1 #2 #3 #5 #6 #7 #8 #9 #10 #11 #12 #13 #14 #15 #16
  - `losses_over_half_capital` drops #1 #2 #3 #5 #6 #7 #8 #9 #10 #12 #13 #14 #15 #16
  - `recovery_order` drops #1 #2 #3 #5 #6 #7 #8 #9 #10 #12 #13 #14 #15 #16
  - `sanctions` drops #11
  - `tax_arrears` drops #4

**Q. Which region is your company established in?**

- answers: Alsace / Aquitaine / Auvergne / Auvergne-Rhône-Alpes / Basse-Normandie / Bourgogne / Bourgogne-Franche-Comté / Bretagne / Centre — Val de Loire / Champagne-Ardenne / Corse / Franche-Comté / Grand Est / Guadeloupe / Guyane / Haute-Normandie / Hauts-de-France / Ile-de-France / La Réunion / Languedoc-Roussillon / Limousin / Lorraine / Martinique / Mayotte / Midi-Pyrénées / Nord-Pas de Calais / Normandie / Nouvelle-Aquitaine / Occitanie / Pays de la Loire / Picardie / Poitou-Charentes / Provence-Alpes-Côte d’Azur / RUP FR — Régions Ultrapériphériques Françaises / Rhône-Alpes
- grounded in Régime cadre exempté de notification relatif aux aides à la recherche, au développement et à l’innovation (RDI) pour la période 2024-2026 · via Conseil régional d'Ile-de-France, verbatim: "Eligible applicants are start-ups, micro-enterprises, SMEs, mid-caps, and large Île-de-France companies, as well as regional research organisations."
- imposed by 3 of the 18 candidates
- separating. It moves 3: #10 Régime cadre exempté de notification relatif aux aides à la recherche, au développement et à l’innovation (RDI) pour la période 2024-2026 · via Conseil régional d'Ile-de-France; #14 Régime cadre exempté de notification relatif aux aides à la recherche, au développement et à l’innovation (RDI) pour la période 2024-2026 · via REGION GRAND EST; #15 Régime cadre exempté de notification relatif aux aides à la recherche, au développement et à l’innovation (RDI) pour la période 2024-2026 · via Conseil régional Nouvelle-Aquitaine
  - `FRF1` drops #10 #15
  - `FRI1` drops #10 #14
  - `FRK1` drops #10 #14 #15
  - `FRK` drops #10 #14 #15
  - `FRD1` drops #10 #14 #15
  - `FRC1` drops #10 #14 #15
  - `FRC` drops #10 #14 #15
  - `FRH` drops #10 #14 #15

**Q. Is your company majority-owned or controlled from outside the EU?**

- answers: Yes / No / Not sure
- grounded in Horizon EU CL1, verbatim: "Legal entities established outside Russia but more than 50% owned by a Russia-established entity are also not eligible to participate."
- imposed by 1 of the 18 candidates
- separating. It moves 1: #11 Horizon EU CL1
  - `yes` drops #11

**Q. Could you run this project with three or more partners, or only on your own?**

- answers: Yes, we could run a 3+ partner consortium / No, single applicant only / Not sure
- grounded in Horizon EU CL1, verbatim: "A consortium must include at least three independent legal entities established in three different countries, with at least one in a Member State and at least two others in different Member States/Associated Countries."
- imposed by 1 of the 18 candidates
- separating. It moves 1: #11 Horizon EU CL1
  - `no` drops #11

## bunq — FinTech (consumer banking) (Netherlands)

**Q. Do any of these apply to your company right now?**

- answers: None of these apply / In bankruptcy, insolvency or winding-up / Accumulated losses exceed half our share capital / Under an unpaid EU state-aid recovery order / Subject to EU sanctions or an exclusion decision / Overdue tax or social-security debt
- grounded in NL-EZK-KE: DEI+ wijziging en openstelling van de subsidiemodules inzake de DEI+, verbatim: "Aid is not available to an undertaking in difficulty, or to one subject to an outstanding recovery decision. Accumulated losses above half of subscribed capital, or insolvency proceedings, put a company in that position until the equity is restored."
- imposed by 17 of the 18 candidates
- separating. It moves 17: #1 NL-EZK-KE: DEI+ wijziging en openstelling van de subsidiemodules inzake de DEI+; #2 Horizon EU CL6; #3 NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimulering topsectoren Zuid-Holland; #5 NL_BZK_CSDO_NB Subsidieregeling cofinanciering Europese programma’s 2021-2027 Noord-Brabant, verlenging onderdeel OPZuid; #6 NL-EZK-B&I-I&K-RVO wijziging RNES 3.2 PPS-innovatie (+12 more)
  - `insolvency` drops #1 #2 #3 #5 #6 #7 #8 #9 #10 #11 #12 #13 #14 #15 #16 #17 #18
  - `losses_over_half_capital` drops #1 #3 #5 #6 #7 #8 #10 #12 #13 #14 #15 #16 #17 #18
  - `recovery_order` drops #1 #3 #5 #6 #7 #8 #10 #12 #13 #14 #15 #16 #17 #18
  - `sanctions` drops #2 #11

**Q. Which region is your company established in?**

- answers: Drenthe / Flevoland / Friesland (NL) / Gelderland / Groningen / Limburg (NL) / Noord-Brabant / Noord-Holland / Noord-Nederland / Oost-Nederland / Overijssel / Utrecht / West-Nederland / Zeeland / Zuid-Holland / Zuid-Nederland
- grounded in NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimulering topsectoren Zuid-Holland, verbatim: "Subsidy for a feasibility project is granted to an SME enterprise with an establishment in the province of Zuid-Holland."
- imposed by 6 of the 18 candidates
- separating. It moves 6: #3 NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimulering topsectoren Zuid-Holland; #5 NL_BZK_CSDO_NB Subsidieregeling cofinanciering Europese programma’s 2021-2027 Noord-Brabant, verlenging onderdeel OPZuid; #7 NL-EZK-B&I-I&K wijziging Subsidieregeling JTF 2021 - 2027; #13 NL_BZK_CSDO_GD_Vierde wijziging Beleidsregel Programma EFRO Oost-Nederland 2022 (wijziging november 2024); #14 NL_BZK_CSDO_NB OP Zuid Subsidieregeling OPZuid 2021 - 2027 uitbreiding (+1 more)
  - `NL13` drops #3 #5 #7 #13 #14 #15
  - `NL23` drops #3 #5 #7 #14 #15
  - `NL12` drops #3 #5 #7 #13 #14 #15
  - `NL22` drops #3 #5 #7 #14 #15
  - `NL11` drops #3 #5 #13 #14 #15
  - `NL42` drops #3 #5 #13 #15
  - `NL41` drops #3 #13 #15
  - `NL32` drops #3 #5 #13 #14 #15

**Q. Could you run this project with three or more partners, or only on your own?**

- answers: Yes, we could run a 3+ partner consortium / No, single applicant only / Not sure
- grounded in Horizon EU CL6, verbatim: "Standard collaborative actions require a consortium of at least three independent legal entities each established in a different Member State/Associated Country, with at least one in a Member State."
- imposed by 4 of the 18 candidates
- narrowing. It moves 4: #2 Horizon EU CL6; #4 EIC Transition; #9 Horizon EU CL3; #11 Horizon EU CL1
  - `no` drops #2 #4 #9 #11

**Q. Is your company majority-owned or controlled from outside the EU?**

- answers: Yes / No / Not sure
- grounded in Horizon EU CL3, verbatim: "Legal entities established outside Russia whose proprietary rights are more than 50% owned by a Russia-established entity are not eligible to participate."
- imposed by 2 of the 18 candidates
- separating. It moves 2: #9 Horizon EU CL3; #11 Horizon EU CL1
  - `yes` drops #9 #11

## Photoroom — AI B2C software (France)

**Q. Do any of these apply to your company right now?**

- answers: None of these apply / In bankruptcy, insolvency or winding-up / Accumulated losses exceed half our share capital / Under an unpaid EU state-aid recovery order / Subject to EU sanctions or an exclusion decision / Overdue tax or social-security debt
- grounded in Soutien à la modernisation des industries techniques et à l'innovation technologique, verbatim: "Aid is not available to an undertaking in difficulty, or to one subject to an outstanding recovery decision. Accumulated losses above half of subscribed capital, or insolvency proceedings, put a company in that position until the equity is restored."
- imposed by 13 of the 18 candidates
- separating. It moves 13: #1 Soutien à la modernisation des industries techniques et à l'innovation technologique; #2 Bpifrance; #3 Horizon EU CL1; #4 Régime exempté de notification N°SA.XXXXX relatif aux aides à la recherche et au développement pour la décarbonation, la compétitivité et la sécurité du transport aérien pour la période 2024-2026; #5 Régime cadre exempté de notification relatif aux aides à la recherche, au développement et à l’innovation (RDI) pour la période 2014-2023 (+8 more)
  - `insolvency` drops #1 #3 #4 #5 #8 #9 #10 #11 #12 #13 #14 #15
  - `losses_over_half_capital` drops #1 #4 #5 #8 #9 #10 #11 #12 #13 #14 #15
  - `recovery_order` drops #1 #4 #5 #8 #9 #10 #11 #12 #13 #14 #15
  - `sanctions` drops #3
  - `tax_arrears` drops #2

**Q. Which of these regulated activities does your company carry out?**

- answers: None of these / Lending, banking, insurance or payments (as the provider) / Primary agricultural production / Fisheries or aquaculture / Road freight transport for hire or reward / Real estate / Gambling or betting / Tobacco / Alcohol / Weapons or munitions
- grounded in Soutien à la modernisation des industries techniques et à l'innovation technologique, verbatim: "Tobacco, gambling and betting, and weapons and munitions are outside the scope of this aid. The exclusion is set by the framework the scheme is notified under, not by the scheme itself."
- imposed by 12 of the 18 candidates
- separating. It moves 12: #1 Soutien à la modernisation des industries techniques et à l'innovation technologique; #4 Régime exempté de notification N°SA.XXXXX relatif aux aides à la recherche et au développement pour la décarbonation, la compétitivité et la sécurité du transport aérien pour la période 2024-2026; #5 Régime cadre exempté de notification relatif aux aides à la recherche, au développement et à l’innovation (RDI) pour la période 2014-2023; #8 Tender for PV installations on buildings with a rated power between 100 kW and 8 MW; #9 Appels d'offres pour installations énergie solaire au sol entre 500 kWc et 17 MWc (+7 more)
  - `financial_services` drops #16
  - `primary_agriculture` drops #16
  - `fisheries_aquaculture` drops #16
  - `road_freight` drops #16
  - `real_estate` drops #16
  - `gambling_betting` drops #1 #4 #5 #8 #9 #10 #11 #12 #13 #14 #15
  - `tobacco` drops #1 #4 #5 #8 #9 #10 #11 #12 #13 #14 #15
  - `weapons` drops #1 #4 #5 #8 #9 #10 #11 #12 #13 #14 #15

**Q. Could you run this project with three or more partners, or only on your own?**

- answers: Yes, we could run a 3+ partner consortium / No, single applicant only / Not sure
- grounded in Horizon EU CL1, verbatim: "A consortium must include at least three independent legal entities established in three different countries, with at least one in a Member State and at least two others in different Member States/Associated Countries."
- imposed by 3 of the 18 candidates
- separating. It moves 3: #3 Horizon EU CL1; #17 EIC Transition; #18 EIC Pathfinder
  - `no` drops #3 #17 #18
  - `unsure` drops #18

**Q. Is your company majority-owned or controlled from outside the EU?**

- answers: Yes / No / Not sure
- grounded in Horizon EU CL1, verbatim: "Legal entities established outside Russia but more than 50% owned by a Russia-established entity are also not eligible to participate."
- imposed by 1 of the 18 candidates
- narrowing. It moves 1: #3 Horizon EU CL1
  - `yes` drops #3

## Aleph Alpha — AI B2B software (Germany)

**Q. Which of these regulated activities does your company carry out?**

- answers: None of these / Lending, banking, insurance or payments (as the provider) / Primary agricultural production / Fisheries or aquaculture / Road freight transport for hire or reward / Real estate / Gambling or betting / Tobacco / Alcohol / Weapons or munitions
- grounded in Quantencomputer-Demonstrationsaufbauten, verbatim: "Tobacco, gambling and betting, and weapons and munitions are outside the scope of this aid. The exclusion is set by the framework the scheme is notified under, not by the scheme itself."
- imposed by 18 of the 18 candidates
- narrowing. It moves 18: #1 Quantencomputer-Demonstrationsaufbauten; #2 NRW.SeedCon; #3 Richtlinie zur Förderung innovativer Netzarchitekturen im Mobilfunk [BMDV]; #4 Bayerische Richtlinien für die Förderung von Film-, Fernseh- und anderen audiovisuellen Projekten (Förderrichtlinien) / Verlängerung 2024 [BY]; #5 Richtlinie zur Fördermaßnahme: "KMU-innovativ: Informations- und Kommunikationstechnologie (IKT)" [BMBF] (+13 more)
  - `gambling_betting` drops #1 #2 #3 #4 #5 #6 #7 #8 #9 #10 #11 #12 #13 #14 #15 #16 #17 #18
  - `tobacco` drops #1 #2 #3 #4 #5 #6 #7 #8 #9 #10 #11 #12 #13 #14 #15 #16 #17 #18
  - `weapons` drops #1 #2 #3 #4 #5 #6 #7 #8 #9 #10 #11 #12 #13 #14 #15 #16 #17 #18

**Q. Do any of these apply to your company right now?**

- answers: None of these apply / In bankruptcy, insolvency or winding-up / Accumulated losses exceed half our share capital / Under an unpaid EU state-aid recovery order / Subject to EU sanctions or an exclusion decision / Overdue tax or social-security debt
- grounded in Quantencomputer-Demonstrationsaufbauten, verbatim: "Aid is not available to an undertaking in difficulty, or to one subject to an outstanding recovery decision. Accumulated losses above half of subscribed capital, or insolvency proceedings, put a company in that position until the equity is restored."
- imposed by 18 of the 18 candidates
- narrowing. It moves 18: #1 Quantencomputer-Demonstrationsaufbauten; #2 NRW.SeedCon; #3 Richtlinie zur Förderung innovativer Netzarchitekturen im Mobilfunk [BMDV]; #4 Bayerische Richtlinien für die Förderung von Film-, Fernseh- und anderen audiovisuellen Projekten (Förderrichtlinien) / Verlängerung 2024 [BY]; #5 Richtlinie zur Fördermaßnahme: "KMU-innovativ: Informations- und Kommunikationstechnologie (IKT)" [BMBF] (+13 more)
  - `insolvency` drops #1 #2 #3 #4 #5 #6 #7 #8 #9 #10 #11 #12 #13 #14 #15 #16 #17 #18
  - `losses_over_half_capital` drops #1 #2 #3 #4 #5 #6 #7 #8 #9 #10 #11 #12 #13 #14 #15 #16 #17 #18
  - `recovery_order` drops #1 #2 #3 #4 #5 #6 #7 #8 #9 #10 #11 #12 #13 #14 #15 #16 #17 #18

**Q. How much of the project cost could you cover from your own resources?**

- answers: Yes, more than half / Yes, 25–50% / Below 25% / Not sure
- grounded in Quantencomputer-Demonstrationsaufbauten, verbatim: "An appropriate own contribution to eligible costs is required, generally at least 75% of eligible costs for commercial enterprises and economically-active research bodies."
- imposed by 15 of the 18 candidates
- narrowing. It moves 15: #1 Quantencomputer-Demonstrationsaufbauten; #2 NRW.SeedCon; #3 Richtlinie zur Förderung innovativer Netzarchitekturen im Mobilfunk [BMDV]; #5 Richtlinie zur Fördermaßnahme: "KMU-innovativ: Informations- und Kommunikationstechnologie (IKT)" [BMBF]; #6 Programm zur Förderung von Forschung, Innovationen und Technologien (Pro FIT) (+10 more)
  - `25-50%` drops #1 #2 #3 #5 #6 #7 #9 #10 #11 #13 #14 #15 #16 #17 #18
  - `<25%` drops #1 #2 #3 #5 #6 #7 #9 #10 #11 #13 #14 #15 #16 #17 #18

**Q. Which region is your company established in?**

- answers: Arnsberg / Baden-Württemberg / Bayern / Berlin / Brandenburg / Braunschweig / Bremen / Chemnitz / Darmstadt / Detmold / Dresden / Düsseldorf / Freiburg / Gießen / Hamburg / Hannover / Hessen / Karlsruhe / Kassel / Koblenz / Köln / Leipzig / Lüneburg / Mecklenburg-Vorpommern / Mittelfranken / Münster / Niederbayern / Niedersachsen / Nordrhein-Westfalen / Oberbayern / Oberfranken / Oberpfalz / Rheinhessen-Pfalz / Rheinland-Pfalz / Saarland / Sachsen / Sachsen-Anhalt / Schleswig-Holstein / Schwaben / Stuttgart / Thüringen / Trier / Tübingen / Unterfranken / Weser-Ems
- grounded in NRW.SeedCon, verbatim: "Registered seat, branch or permanent establishment must be located in North Rhine-Westphalia."
- imposed by 7 of the 18 candidates
- separating. It moves 7: #2 NRW.SeedCon; #4 Bayerische Richtlinien für die Förderung von Film-, Fernseh- und anderen audiovisuellen Projekten (Förderrichtlinien) / Verlängerung 2024 [BY]; #6 Programm zur Förderung von Forschung, Innovationen und Technologien (Pro FIT); #7 Förderrichtlinie Business-Angel-Bonus JTF 2021–2027 [SN]; #8 Bayerische Richtlinien für die Förderung von Film-, Fernseh- und anderen audiovisuellen Projekten (Förderrichtlinien) Verlängerung 2025 [BY] (+2 more)
  - `DEA5` drops #4 #6 #7 #8 #12 #14
  - `DE1` drops #2 #4 #6 #7 #8 #12 #14
  - `DE2` drops #2 #6 #7 #12 #14
  - `DE3` drops #2 #4 #7 #8 #14
  - `DE4` drops #2 #4 #6 #7 #8 #14
  - `DE91` drops #2 #4 #6 #7 #8 #12 #14
  - `DE5` drops #2 #4 #6 #7 #8 #12 #14
  - `DED4` drops #2 #4 #6 #8 #12

## Nortal — GovTech (Estonia)

**Q. Which of these regulated activities does your company carry out?**

- answers: None of these / Lending, banking, insurance or payments (as the provider) / Primary agricultural production / Fisheries or aquaculture / Road freight transport for hire or reward / Real estate / Gambling or betting / Tobacco / Alcohol / Weapons or munitions
- grounded in Rakendusuuringu ja tootearenduse toetus, verbatim: "Tobacco, gambling and betting, and weapons and munitions are outside the scope of this aid. The exclusion is set by the framework the scheme is notified under, not by the scheme itself."
- imposed by 6 of the 18 candidates
- separating. It moves 6: #4 Rakendusuuringu ja tootearenduse toetus; #10 Ettevõtja rakendusuuringute toetus (alates 02.06.2023); #12 Ettevõtte arenguprogrammi toetus 2024-2027; #14 Ettevõtja rakendusuuringute toetus (2024 muutmine); #15 Ettevõtete digipöörde toetus (pikendamine kuni 31.12.2026) (+1 more)
  - `financial_services` drops #17
  - `primary_agriculture` drops #17
  - `fisheries_aquaculture` drops #17
  - `real_estate` drops #17
  - `gambling_betting` drops #4 #10 #12 #14 #15 #17
  - `tobacco` drops #4 #10 #12 #14 #15 #17
  - `weapons` drops #4 #10 #12 #14 #15

**Q. Do any of these apply to your company right now?**

- answers: None of these apply / In bankruptcy, insolvency or winding-up / Accumulated losses exceed half our share capital / Under an unpaid EU state-aid recovery order / Subject to EU sanctions or an exclusion decision / Overdue tax or social-security debt
- grounded in Rakendusuuringu ja tootearenduse toetus, verbatim: "Aid is not available to an undertaking in difficulty, or to one subject to an outstanding recovery decision. Accumulated losses above half of subscribed capital, or insolvency proceedings, put a company in that position until the equity is restored."
- imposed by 5 of the 18 candidates
- separating. It moves 5: #4 Rakendusuuringu ja tootearenduse toetus; #10 Ettevõtja rakendusuuringute toetus (alates 02.06.2023); #12 Ettevõtte arenguprogrammi toetus 2024-2027; #14 Ettevõtja rakendusuuringute toetus (2024 muutmine); #15 Ettevõtete digipöörde toetus (pikendamine kuni 31.12.2026)
  - `insolvency` drops #4 #10 #12 #14 #15
  - `losses_over_half_capital` drops #4 #10 #12 #14 #15
  - `recovery_order` drops #4 #10 #12 #14 #15
  - `tax_arrears` drops #4 #10 #12 #14 #15

**Q. How much of the project cost could you cover from your own resources?**

- answers: Yes, more than half / Yes, 25–50% / Below 25% / Not sure
- grounded in Rakendusuuringu ja tootearenduse toetus, verbatim: "Applicant must provide co-financing that covers the portion of eligible costs not covered by the grant, and the project budget must include the required co-financing."
- imposed by 6 of the 18 candidates
- narrowing. It moves 6: #4 Rakendusuuringu ja tootearenduse toetus; #10 Ettevõtja rakendusuuringute toetus (alates 02.06.2023); #12 Ettevõtte arenguprogrammi toetus 2024-2027; #13 Rakendusuuringute programm; #14 Ettevõtja rakendusuuringute toetus (2024 muutmine) (+1 more)
  - `>50%` drops #13
  - `25-50%` drops #4 #10 #12 #14 #15
  - `<25%` drops #4 #10 #12 #14 #15

**Q. What is your annual turnover?**

- answers: Under €2M / €2–10M / €10–50M / Over €50M
- grounded in Ettevotte arenguprogramm (enterprise development), verbatim: "Applicant must be an SME by turnover/balance sheet thresholds"
- imposed by 1 of the 18 candidates
- narrowing. It moves 1: #11 Ettevotte arenguprogramm (enterprise development)
  - `>50M` drops #11

## sennder — Platform (Germany)

**Q. Could you run this project with three or more partners, or only on your own?**

- answers: Yes, we could run a 3+ partner consortium / No, single applicant only / Not sure
- grounded in Clean Aviation, verbatim: "Consortia must include at least one independent legal entity established in a Member State and at least two other independent legal entities each established in different Member States or Associated Countries, unless otherwise provided."
- imposed by 17 of the 17 candidates
- separating. It moves 17: #1 Clean Aviation; #2 Europes Rail; #3 Sesar JU; #4 EIC Transition; #5 EIC Pathfinder (+12 more)
  - `yes` promotes #2 #7 #8 #10 #17
  - `no` promotes #2 #7 #8 #10 #17, drops #1 #3 #4 #5 #6 #9 #11 #12 #13 #14 #15 #16
  - `unsure` drops #5

**Q. Is your company majority-owned or controlled from outside the EU?**

- answers: Yes / No / Not sure
- grounded in Horizon EU CL1, verbatim: "Legal entities established outside Russia but more than 50% owned by a Russia-established entity are also not eligible to participate."
- imposed by 5 of the 17 candidates
- separating. It moves 5: #9 Horizon EU CL1; #11 Horizon EU CL4; #15 Horizon EU CL3; #16 ERC POC; #17 Euspa
  - `yes` drops #9 #11 #15 #16 #17
  - `no` promotes #17

**Q. Do any of these apply to your company right now?**

- answers: None of these apply / In bankruptcy, insolvency or winding-up / Accumulated losses exceed half our share capital / Under an unpaid EU state-aid recovery order / Subject to EU sanctions or an exclusion decision / Overdue tax or social-security debt
- grounded in Horizon EU CL1, verbatim: "Applicants subject to EU administrative exclusion sanctions or in exclusion situations (e.g. bankruptcy) cannot participate."
- imposed by 5 of the 17 candidates
- separating. It moves 5: #9 Horizon EU CL1; #11 Horizon EU CL4; #14 Horizon EU CL6; #15 Horizon EU CL3; #16 ERC POC
  - `insolvency` drops #9 #11 #14 #15 #16
  - `sanctions` drops #9 #14 #16

**Q. What is your annual turnover?**

- answers: Under €2M / €2–10M / €10–50M / Over €50M
- grounded in IHI, verbatim: "For-profit legal entities with an annual turnover of EUR 500 million or more, or entities controlling/controlled by such entities, participating in a two-stage call alongside a pre-identified entity, are not eligible for funding."
- imposed by 1 of the 17 candidates
- separating. It moves 1: #6 IHI
  - `>50M` drops #6

## Nebius — Cloud / NeoCloud (Netherlands)

**Q. Do any of these apply to your company right now?**

- answers: None of these apply / In bankruptcy, insolvency or winding-up / Accumulated losses exceed half our share capital / Under an unpaid EU state-aid recovery order / Subject to EU sanctions or an exclusion decision / Overdue tax or social-security debt
- grounded in NL-EZK-KE: DEI+ wijziging en openstelling van de subsidiemodules inzake de DEI+, verbatim: "Aid is not available to an undertaking in difficulty, or to one subject to an outstanding recovery decision. Accumulated losses above half of subscribed capital, or insolvency proceedings, put a company in that position until the equity is restored."
- imposed by 16 of the 18 candidates
- separating. It moves 16: #1 NL-EZK-KE: DEI+ wijziging en openstelling van de subsidiemodules inzake de DEI+; #2 Horizon EU CL6; #3 NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimulering topsectoren Zuid-Holland; #5 NL_BZK_CSDO_NB Subsidieregeling cofinanciering Europese programma’s 2021-2027 Noord-Brabant, verlenging onderdeel OPZuid; #6 NL-EZK-B&I-I&K-RVO wijziging RNES 3.2 PPS-innovatie (+11 more)
  - `insolvency` drops #1 #2 #3 #5 #6 #7 #8 #9 #10 #11 #12 #13 #15 #16 #17 #18
  - `losses_over_half_capital` drops #1 #3 #5 #6 #7 #8 #10 #12 #13 #15 #16 #17 #18
  - `recovery_order` drops #1 #3 #5 #6 #7 #8 #10 #12 #13 #15 #16 #17 #18
  - `sanctions` drops #2 #11

**Q. Which of these regulated activities does your company carry out?**

- answers: None of these / Lending, banking, insurance or payments (as the provider) / Primary agricultural production / Fisheries or aquaculture / Road freight transport for hire or reward / Real estate / Gambling or betting / Tobacco / Alcohol / Weapons or munitions
- grounded in NL-EZK-KE: DEI+ wijziging en openstelling van de subsidiemodules inzake de DEI+, verbatim: "Tobacco, gambling and betting, and weapons and munitions are outside the scope of this aid. The exclusion is set by the framework the scheme is notified under, not by the scheme itself."
- imposed by 13 of the 18 candidates
- separating. It moves 13: #1 NL-EZK-KE: DEI+ wijziging en openstelling van de subsidiemodules inzake de DEI+; #3 NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimulering topsectoren Zuid-Holland; #5 NL_BZK_CSDO_NB Subsidieregeling cofinanciering Europese programma’s 2021-2027 Noord-Brabant, verlenging onderdeel OPZuid; #6 NL-EZK-B&I-I&K-RVO wijziging RNES 3.2 PPS-innovatie; #7 NL-EZK-B&I-I&K wijziging Subsidieregeling JTF 2021 - 2027 (+8 more)
  - `gambling_betting` drops #1 #3 #5 #6 #7 #8 #10 #12 #13 #15 #16 #17 #18
  - `tobacco` drops #1 #3 #5 #6 #7 #8 #10 #12 #13 #15 #16 #17 #18
  - `weapons` drops #1 #3 #5 #6 #7 #8 #10 #12 #13 #15 #16 #17 #18

**Q. Could you run this project with three or more partners, or only on your own?**

- answers: Yes, we could run a 3+ partner consortium / No, single applicant only / Not sure
- grounded in Horizon EU CL6, verbatim: "Standard collaborative actions require a consortium of at least three independent legal entities each established in a different Member State/Associated Country, with at least one in a Member State."
- imposed by 5 of the 18 candidates
- separating. It moves 5: #2 Horizon EU CL6; #4 EIC Transition; #9 Horizon EU CL3; #11 Horizon EU CL1; #14 Eurohpc
  - `yes` promotes #14
  - `no` promotes #14, drops #2 #4 #9 #11

**Q. Which region is your company established in?**

- answers: Drenthe / Flevoland / Friesland (NL) / Gelderland / Groningen / Limburg (NL) / Noord-Brabant / Noord-Holland / Noord-Nederland / Oost-Nederland / Overijssel / Utrecht / West-Nederland / Zeeland / Zuid-Holland / Zuid-Nederland
- grounded in NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimulering topsectoren Zuid-Holland, verbatim: "Subsidy for a feasibility project is granted to an SME enterprise with an establishment in the province of Zuid-Holland."
- imposed by 6 of the 18 candidates
- separating. It moves 6: #3 NL_BZK_CSDO_ZH Verlenging Subsidieregeling MKB innovatiestimulering topsectoren Zuid-Holland; #5 NL_BZK_CSDO_NB Subsidieregeling cofinanciering Europese programma’s 2021-2027 Noord-Brabant, verlenging onderdeel OPZuid; #7 NL-EZK-B&I-I&K wijziging Subsidieregeling JTF 2021 - 2027; #13 NL_BZK_CSDO_GD_Vierde wijziging Beleidsregel Programma EFRO Oost-Nederland 2022 (wijziging november 2024); #15 NL_BZK_CSDO_NB OP Zuid Subsidieregeling OPZuid 2021 - 2027 uitbreiding (+1 more)
  - `NL13` drops #3 #5 #7 #13 #15 #16
  - `NL23` drops #3 #5 #7 #15 #16
  - `NL12` drops #3 #5 #7 #13 #15 #16
  - `NL22` drops #3 #5 #7 #15 #16
  - `NL11` drops #3 #5 #13 #15 #16
  - `NL42` drops #3 #5 #13 #16
  - `NL41` drops #3 #13 #16
  - `NL32` drops #3 #5 #13 #15 #16

## Corti — MedTech (Denmark)

**Q. Could you run this project with three or more partners, or only on your own?**

- answers: Yes, we could run a 3+ partner consortium / No, single applicant only / Not sure
- grounded in Grand Solutions, verbatim: "An application must have at least two project participants, of which at least one is not a public university (with an exception for quantum technology calls)."
- imposed by 14 of the 18 candidates
- separating. It moves 14: #1 Grand Solutions; #6 Erhvervsforsker; #7 ERC POC; #8 EIC Transition; #9 Horizon EU CL1 (+9 more)
  - `yes` promotes #17
  - `no` promotes #17, drops #1 #6 #7 #8 #9 #10 #11 #12 #13 #14 #15 #16 #18

**Q. Do any of these apply to your company right now?**

- answers: None of these apply / In bankruptcy, insolvency or winding-up / Accumulated losses exceed half our share capital / Under an unpaid EU state-aid recovery order / Subject to EU sanctions or an exclusion decision / Overdue tax or social-security debt
- grounded in Grand Solutions, verbatim: "An applicant that has previously received aid declared incompatible with the internal market and has not repaid it cannot receive an investment."
- imposed by 9 of the 18 candidates
- separating. It moves 9: #1 Grand Solutions; #5 Innobooster; #6 Erhvervsforsker; #7 ERC POC; #9 Horizon EU CL1 (+4 more)
  - `none` drops #1
  - `insolvency` drops #1 #5 #6 #7 #9 #10 #15 #16 #18
  - `losses_over_half_capital` drops #1
  - `recovery_order` drops #6
  - `sanctions` drops #1 #7 #9 #10 #18
  - `tax_arrears` drops #1

**Q. Is your company majority-owned or controlled from outside the EU?**

- answers: Yes / No / Not sure
- grounded in ERC POC, verbatim: "Legal entities established outside Russia that are more than 50% owned by a Russia-established person/entity are not eligible to participate in any capacity."
- imposed by 5 of the 18 candidates
- separating. It moves 5: #7 ERC POC; #9 Horizon EU CL1; #15 Horizon EU CL4; #16 Horizon EU CL5; #18 Horizon EU CBE
  - `yes` drops #7 #9 #15 #16 #18

**Q. Does any single shareholder own more than 25% of your company?**

- answers: Yes / No / Not sure
- grounded in Innobooster, verbatim: "Companies where more than 50 per cent is owned by the state, regions or municipalities are excluded from investment."
- imposed by 3 of the 18 candidates
- separating. It moves 3: #5 Innobooster; #10 Horizon EU CL6; #11 Horizon EU Miss
  - `yes` drops #5 #10 #11

## BioNTech — Life sciences (Germany)

**Q. Could you run this project with three or more partners, or only on your own?**

- answers: Yes, we could run a 3+ partner consortium / No, single applicant only / Not sure
- grounded in Gh Edctp3, verbatim: "Consortium must include at least three independent legal entities each established in a different eligible country."
- imposed by 17 of the 18 candidates
- separating. It moves 17: #1 Gh Edctp3; #2 Horizon EU CL1; #3 IHI; #4 Clean Aviation; #5 Horizon EU CL4 (+12 more)
  - `yes` promotes #7 #8 #10 #13 #14
  - `no` promotes #7 #8 #10 #13 #14, drops #1 #2 #3 #4 #5 #6 #9 #11 #12 #15 #16 #17
  - `unsure` drops #17

**Q. Do any of these apply to your company right now?**

- answers: None of these apply / In bankruptcy, insolvency or winding-up / Accumulated losses exceed half our share capital / Under an unpaid EU state-aid recovery order / Subject to EU sanctions or an exclusion decision / Overdue tax or social-security debt
- grounded in Horizon EU CL1, verbatim: "Applicants subject to EU administrative exclusion sanctions or in exclusion situations (e.g. bankruptcy) cannot participate."
- imposed by 6 of the 18 candidates
- separating. It moves 6: #2 Horizon EU CL1; #5 Horizon EU CL4; #9 Horizon EU CL3; #11 Horizon EU CL6; #12 ERC POC (+1 more)
  - `insolvency` drops #2 #5 #9 #11 #12 #18
  - `losses_over_half_capital` drops #18
  - `recovery_order` drops #18
  - `sanctions` drops #2 #11 #12 #18
  - `tax_arrears` drops #18

**Q. Is your company majority-owned or controlled from outside the EU?**

- answers: Yes / No / Not sure
- grounded in Horizon EU CL1, verbatim: "Legal entities established outside Russia but more than 50% owned by a Russia-established entity are also not eligible to participate."
- imposed by 5 of the 18 candidates
- separating. It moves 5: #2 Horizon EU CL1; #5 Horizon EU CL4; #9 Horizon EU CL3; #12 ERC POC; #14 Euspa
  - `yes` drops #2 #5 #9 #12 #14
  - `no` promotes #14

**Q. Does any single shareholder own more than 25% of your company?**

- answers: Yes / No / Not sure
- grounded in Horizon EU Miss, verbatim: "Legal entities established outside Russia but more than 50% owned, directly or indirectly, by a Russian-established entity are not eligible to participate in any capacity."
- imposed by 2 of the 18 candidates
- separating. It moves 2: #6 Horizon EU Miss; #11 Horizon EU CL6
  - `yes` drops #6 #11

## eAgronom — AgriTech (Estonia)

**Q. Which of these regulated activities does your company carry out?**

- answers: None of these / Lending, banking, insurance or payments (as the provider) / Primary agricultural production / Fisheries or aquaculture / Road freight transport for hire or reward / Real estate / Gambling or betting / Tobacco / Alcohol / Weapons or munitions
- grounded in Ettevõtja rakendusuuringute toetus (alates 02.06.2023), verbatim: "Tobacco, gambling and betting, and weapons and munitions are outside the scope of this aid. The exclusion is set by the framework the scheme is notified under, not by the scheme itself."
- imposed by 7 of the 18 candidates
- separating. It moves 7: #3 Ettevõtja rakendusuuringute toetus (alates 02.06.2023); #4 Ettevõtte arenguprogrammi toetus 2024-2027; #6 Digitaliseerimise teekaardi toetus; #9 Rakendusuuringu ja tootearenduse toetus; #10 Ettevotete digipoorde toetus (digital transformation) (+2 more)
  - `financial_services` drops #6 #10 #18
  - `primary_agriculture` drops #6 #10 #18
  - `fisheries_aquaculture` drops #6 #10 #18
  - `real_estate` drops #6 #10 #18
  - `gambling_betting` drops #3 #4 #6 #9 #10 #11 #18
  - `tobacco` drops #3 #4 #6 #9 #10 #11 #18
  - `weapons` drops #3 #4 #9 #11

**Q. Do any of these apply to your company right now?**

- answers: None of these apply / In bankruptcy, insolvency or winding-up / Accumulated losses exceed half our share capital / Under an unpaid EU state-aid recovery order / Subject to EU sanctions or an exclusion decision / Overdue tax or social-security debt
- grounded in Ettevõtja rakendusuuringute toetus (alates 02.06.2023), verbatim: "Aid is not available to an undertaking in difficulty, or to one subject to an outstanding recovery decision. Accumulated losses above half of subscribed capital, or insolvency proceedings, put a company in that position until the equity is restored."
- imposed by 5 of the 18 candidates
- separating. It moves 5: #3 Ettevõtja rakendusuuringute toetus (alates 02.06.2023); #4 Ettevõtte arenguprogrammi toetus 2024-2027; #9 Rakendusuuringu ja tootearenduse toetus; #10 Ettevotete digipoorde toetus (digital transformation); #11 Ettevõtja rakendusuuringute toetus (2024 muutmine)
  - `insolvency` drops #3 #4 #9 #10 #11
  - `losses_over_half_capital` drops #3 #4 #9 #10 #11
  - `recovery_order` drops #3 #4 #9 #10 #11
  - `sanctions` drops #10
  - `tax_arrears` drops #3 #4 #9 #10 #11

**Q. How much of the project cost could you cover from your own resources?**

- answers: Yes, more than half / Yes, 25–50% / Below 25% / Not sure
- grounded in Ettevõtja rakendusuuringute toetus (alates 02.06.2023), verbatim: "Applicant must provide co-financing that covers the portion of eligible costs not covered by the grant, and the project budget must include the required co-financing."
- imposed by 6 of the 18 candidates
- separating. It moves 5: #3 Ettevõtja rakendusuuringute toetus (alates 02.06.2023); #4 Ettevõtte arenguprogrammi toetus 2024-2027; #7 Rakendusuuringute programm; #9 Rakendusuuringu ja tootearenduse toetus; #11 Ettevõtja rakendusuuringute toetus (2024 muutmine)
  - `>50%` drops #7
  - `25-50%` drops #3 #4 #9 #11
  - `<25%` drops #3 #4 #9 #11

**Q. What is your annual turnover?**

- answers: Under €2M / €2–10M / €10–50M / Over €50M
- grounded in Ettevotte arenguprogramm (enterprise development), verbatim: "Applicant must be an SME by turnover/balance sheet thresholds"
- imposed by 3 of the 18 candidates
- narrowing. It moves 1: #1 Ettevotte arenguprogramm (enterprise development)
  - `>50M` drops #1

