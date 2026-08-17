# wsHA — does a fact separate two doors of one regime

```
draw fingerprint    13cb71cf3a1d1847
population          897 founder(s)
corpus              postgres instruments=1088
ranker              ranker: all 828 request(s) on EMBEDDING
```

## 1. The working set

```
offerable won door                      828
...gates pass                           774
......won door in the six (HIT)         321  41.5%
......miss                              453
.........SIBLING of the won door shown  287  63.4%  <- the working set
.........same CHANNEL shown             388  85.7%
distinct regimes in the working set     15
siblings shown per founder              mean 3.43  1:46  2:42  3+:199
```

| regime | founders | share of working set | cumulative |
|---|--:|--:|--:|
| `vinnova_grant` | 126 | 43.9% | 43.9% |
| `satr_fr_rnd` | 45 | 15.7% | 59.6% |
| `satr_de_rnd` | 32 | 11.1% | 70.7% |
| `satr_it_rnd` | 24 | 8.4% | 79.1% |
| `horizon_eu_pillar_ii` | 15 | 5.2% | 84.3% |
| `ademe_aid` | 11 | 3.8% | 88.2% |
| `horizon_eu_partnership` | 11 | 3.8% | 92.0% |
| `satr_nl_rnd` | 6 | 2.1% | 94.1% |
| `eic` | 5 | 1.7% | 95.8% |
| `bdns_es_ayudas` | 3 | 1.0% | 96.9% |
| `innovation_fund` | 3 | 1.0% | 97.9% |
| `satr_fr_equity` | 2 | 0.7% | 98.6% |

## 2. What varies inside the cell, column by column

n = 287 pairs (won door vs the highest-ranked shown sibling)

| column | differ | BOTH KNOWN | one known only | both blank | separates from ALL shown siblings | |
|---|--:|--:|--:|--:|--:|---|
| `id` | 100.0% | **100.0%** | 0.0% | 0.0% | 100.0% | structural |
| `sectorMix` | 100.0% | **100.0%** | 0.0% | 0.0% | 100.0% | award-derived |
| `awardP25` | 99.7% | **99.7%** | 0.0% | 0.3% | 98.6% | award-derived |
| `awardP50` | 99.7% | **99.7%** | 0.0% | 0.3% | 98.3% | award-derived |
| `totalEur` | 99.7% | **99.7%** | 0.0% | 0.0% | 99.7% | award-derived |
| `awardP75` | 99.3% | **99.3%** | 0.0% | 0.3% | 99.0% | award-derived |
| `awardN` | 98.6% | **98.6%** | 0.0% | 0.0% | 95.5% | award-derived |
| `eventCount` | 98.6% | **98.6%** | 0.0% | 0.0% | 95.5% | award-derived |
| `name` | 98.6% | **98.6%** | 0.0% | 0.0% | 98.3% | structural |
| `companyCount` | 97.6% | **97.6%** | 0.0% | 0.0% | 95.8% | award-derived |
| `description` | 99.3% | **95.8%** | 3.5% | 0.7% | 98.3% |  |
| `eligibilityText` | 96.5% | **79.1%** | 17.4% | 3.5% | 93.0% |  |
| `lastYear` | 66.2% | **66.2%** | 0.0% | 0.0% | 26.1% | award-derived |
| `schemeCode` | 37.3% | **37.3%** | 0.0% | 61.3% | 36.9% |  |
| `administeringBody` | 38.0% | **35.2%** | 2.8% | 2.1% | 32.8% | award-derived |
| `schemeEndDate` | 30.0% | **24.4%** | 5.6% | 57.8% | 21.6% |  |
| `schemeOperators` | 33.4% | **23.3%** | 10.1% | 63.8% | 30.3% | award-derived |
| `application.timeline` | 12.5% | **12.5%** | 0.0% | 0.0% | 12.5% |  |
| `nameSource` | 9.8% | **9.8%** | 0.0% | 0.0% | 6.6% |  |
| `application.channel` | 7.3% | **7.3%** | 0.0% | 0.0% | 7.3% |  |
| `capitalType` | 4.5% | **4.5%** | 0.0% | 0.0% | 1.7% |  |
| `deliveryRegionShare` | 19.9% | **2.4%** | 17.4% | 79.8% | 12.2% | award-derived |
| `deliveryRegion` | 19.5% | **2.1%** | 17.4% | 79.8% | 12.5% | award-derived |
| `administeringBodyShare` | 0.3% | **0.0%** | 0.3% | 13.2% | 0.3% | award-derived |
| `application.url` | 0.0% | **0.0%** | 0.0% | 88.9% | 0.0% |  |
| `applicationOwn` | 0.0% | **0.0%** | 0.0% | 0.0% | 0.0% |  |
| `applicationUrl` | 0.0% | **0.0%** | 0.0% | 100.0% | 0.0% |  |
| `callRecurrence` | 10.8% | **0.0%** | 10.8% | 88.5% | 3.5% |  |
| `country` | 0.0% | **0.0%** | 0.0% | 0.0% | 0.0% |  |
| `intensityN` | 0.0% | **0.0%** | 0.0% | 0.0% | 0.0% | award-derived |
| `intensityP50` | 0.0% | **0.0%** | 0.0% | 100.0% | 0.0% | award-derived |
| `isFramework` | 0.0% | **0.0%** | 0.0% | 0.0% | 0.0% |  |
| `parentId` | 0.0% | **0.0%** | 0.0% | 0.0% | 0.0% | structural |
| `routeStatus` | 0.0% | **0.0%** | 0.0% | 100.0% | 0.0% |  |
| `routeStatusSource` | 0.0% | **0.0%** | 0.0% | 100.0% | 0.0% |  |
| `schemeEndBasis` | 5.6% | **0.0%** | 5.6% | 57.8% | 1.4% |  |
| `sourceFamilyBucket` | 0.0% | **0.0%** | 0.0% | 0.0% | 0.0% |  |
| `sourceWindowPolicy` | 0.0% | **0.0%** | 0.0% | 0.0% | 0.0% |  |
| `successorScheme` | 4.5% | **0.0%** | 4.5% | 95.5% | 2.8% |  |
| `successorTitle` | 4.5% | **0.0%** | 4.5% | 95.5% | 2.8% |  |

## 3. Do the ENCODED gates already separate the two doors

```
pairs                                            287
effective gate set IDENTICAL on both doors       3  1.0%
  ...differs in any way                          284  99.0%
DECIDABLE rule set (role=filter + valueSpec):
  identical on both doors                        17  5.9%
  DIFFERS                                        270  94.1%
  ...of the identical, neither door has ANY      0  0.0%
the door's OWN (non-inherited) gates differ      284  99.0%
```

| intake field a DIFFERING decidable gate reads | pairs | share |
|---|--:|--:|
| `consortium` | 138 | 48.1% |
| `organisationType` | 95 | 33.1% |
| `entityCountries` | 63 | 22.0% |
| `fteBand` | 58 | 20.2% |
| `exclusionFlags` | 53 | 18.5% |
| `useOfFunds` | 42 | 14.6% |
| `region` | 24 | 8.4% |
| `turnoverBand` | 22 | 7.7% |
| `developmentStage` | 22 | 7.7% |
| `activities` | 21 | 7.3% |
| `sector` | 13 | 4.5% |
| `ticketBand` | 11 | 3.8% |
| `nonEuControl` | 10 | 3.5% |
| `cofinancingBand` | 4 | 1.4% |
| `borrowerModel` | 2 | 0.7% |
| `wouldOpenEntity` | 2 | 0.7% |
| `institutionalOwner` | 1 | 0.3% |

## 4. Named pairs, largest regimes first

- **120FT FACTORY AB** (SE), regime `vinnova_grant`
  - WON   `vinnova_grant__avancerad_digitalisering_eb7eab` — Avancerad digitalisering
  - SHOWN `vinnova_grant__sip_piia_8c6020` — SIP - PiiA
- **1A KONSULT AB** (SE), regime `vinnova_grant`
  - WON   `vinnova_grant__sip_internet_of_things_sverige_7419c7` — SIP - Internet of Things Sverige
  - SHOWN `vinnova_grant__sip_drive_sweden_1c1174` — SIP - Drive Sweden
- **3D MEDICAL** (FR), regime `satr_fr_rnd`
  - WON   `satr_fr_rnd__sa_40391__ministere_de_l_economie_et_des_finances` — Ministère de l'économie et des finances
  - SHOWN `satr_fr_rnd__sa_111728__ministere_de_l_economie_et_des_finances` — Régime cadre exempté de notification relatif aux aides en faveur des PME pour la période 2024-2026
- **77 FOODS** (FR), regime `satr_fr_rnd`
  - WON   `satr_fr_rnd__sa_111723__ministere_de_l_economie_et_des_finances` — Régime cadre exempté de notification relatif aux aides à la recherche, au développement et à l’innovation (RDI) pour la période 2024-2026
  - SHOWN `satr_fr_rnd__sa_111728__conseil_regional_d_ile_de_france` — Régime cadre exempté de notification relatif aux aides en faveur des PME pour la période 2024-2026
- **ACS SOLUTIONS** (DE), regime `satr_de_rnd`
  - WON   `satr_de_rnd__sa_56245__mfw_sl` — MFW SL
  - SHOWN `satr_de_rnd__sa_109254__bundesministerium_fur_wirtschaft_und_klimaschutz` — Förderrichtlinie
„Digitalisierung der Fahrzeughersteller und Zulieferindustrie und industrieller Lieferketten“ im Förderrahmen „Zukunftsinvestitionen Fahrzeughersteller und Zulieferindustrie“ [BMWK, IVA3]
- **ACTYX** (DE), regime `satr_de_rnd`
  - WON   `satr_de_rnd__sa_56245__finanzamt_munchen_abt_3` — Finanzamt München Abt. 3
  - SHOWN `satr_de_rnd__sa_113475__tuv_rheinland_forschungs_und_innovationsmanageme` — Richtlinie zur Förderung von Forschungs- und Entwicklungsprojekten im Rahmen des Förderprogramms „Neue Fahrzeug- und Systemtechnologien“   [BMWK IVA3]
- **ACCIAI SPECIALI TERNI** (IT), regime `satr_it_rnd`
  - WON   `satr_it_rnd__sa_49781__ministero_delle_imprese_e_del_made_in_italy_dire` — Ministero delle Imprese e del Made in Italy - Direzione generale per gli incentivi alle imprese
  - SHOWN `satr_it_rnd__sa_118710__ministero_della_transizione_ecologica_direzione_` — AVVISO pubblico per la presentazione di Progetti di ricerca, sviluppo e innovazione tecnologica riguardanti l’intera catena del valore delle Materie Prime Critiche (MPC) e delle Materie Prime Strategiche (MPS), finanziabili nell’ambito dell’iniziativa “Mission Innovation 2.0”
- **AKKODIS ITALY** (IT), regime `satr_it_rnd`
  - WON   `satr_it_rnd__sa_107368__bi_rex_big_data_innovation_research_excellence` — Aiuti ai centri di trasferimento tecnologico
  - SHOWN `satr_it_rnd__sa_106430__ministero_delle_imprese_e_del_made_in_italy_dire` — Sostegno ai progetti di ricerca industriale e sviluppo sperimentale delle imprese italiane, selezionati nei bandi emanati dalle istituzioni UE - Partenariati Horizon Europe - Modifica del regime <b>SA</b>.103171
- **AALTO KORKEAKOULUSAATIO SR** (FI), regime `horizon_eu_pillar_ii`
  - WON   `erc_poc` — ERC POC
  - SHOWN `horizon_eu_miss` — Horizon EU Miss
- **ACADEMISCH ZIEKENHUIS GRONINGEN** (NL), regime `horizon_eu_pillar_ii`
  - WON   `erc_poc` — ERC POC
  - SHOWN `horizon_eu_cl1` — Horizon EU CL1
- **ACTA MOBILIER** (FR), regime `ademe_aid`
  - WON   `ademe_aid__etudes_de_faisabilite_des_projets_de_chaufferie__9c6257` — Études de faisabilité des projets de chaufferie biomasse
  - SHOWN `ademe_aid__aap_decarb_ind_pdr_fdi_43019f` — AAP DECARB IND (PDR-FDI)
- **AGENCE LOCALE DE L ENERGIE ET DU CLIMAT** (FR), regime `ademe_aid`
  - WON   `ademe_aid__aide_a_l_installation_de_production_de_chaleur_b_5ea921` — Aide à l’installation de production de chaleur biomasse/bois
  - SHOWN `ademe_aid__pacte_entreprises_phase_de_depot_93b45f` — PACTE Entreprises : Phase de dépôt
- **ASOCIACION CENTRO TECNOLOGICO CEIT** (ES), regime `horizon_eu_partnership`
  - WON   `euspa` — Euspa
  - SHOWN `eurohpc` — Eurohpc
- **BARCELONA SUPERCOMPUTING CENTER CENTRO NACIONAL DE SUPERCOMPUTACION** (ES), regime `horizon_eu_partnership`
  - WON   `ihi` — IHI
  - SHOWN `eurohpc` — Eurohpc
- **CONCR3DE B V** (NL), regime `satr_nl_rnd`
  - WON   `satr_nl_rnd__sa_106413__kansen_voor_west` — NL-EZK-B&I-I&K Subsidieregeling JTF 2021 - 2027
  - SHOWN `satr_nl_rnd__sa_53946__ministerie_van_economische_zaken_en_klimaat` — NL-EZK-KE: DEI+ wijziging en openstelling van de subsidiemodules inzake de DEI+
- **Cordys Analytics B.V.** (NL), regime `satr_nl_rnd`
  - WON   `satr_nl_rnd__sa_109782__ministerie_van_economische_zaken_en_klimaat` — NL-EZK-B&I-I&K-RVO wijziging RNES 3.2 PPS-innovatie
  - SHOWN `satr_nl_rnd__sa_114170__ministerie_van_volksgezondheid_welzijn_sport` — NL_VWS_[SG]_[DMO]_3796593-1063655-DMO_Stimuleringsregeling Technologie in Ondersteuning en Zorg

## 5. Example value differences on the columns that vary

`sectorMix` — 100.0% both-known
  120FT FACTORY AB · sectorMix: WON={"defense_security":6,"energy_cleantech":5,"health_life_sciences":10,"industrial_manufactu | SHOWN={"industrial_manufacturing":7,"semiconductors_electronics":2,"software_data_ai":4}
  1A KONSULT AB · sectorMix: WON={"defense_security":1,"energy_cleantech":4,"health_life_sciences":16,"other":19,"semicondu | SHOWN={"health_life_sciences":1,"industrial_manufacturing":1,"mobility_transport":19,"other":2,"
  2030-SEKRETARIATET AB · sectorMix: WON={"agrifood":21,"energy_cleantech":50,"health_life_sciences":154,"industrial_manufacturing" | SHOWN={"defense_security":1,"energy_cleantech":4,"health_life_sciences":16,"other":19,"semicondu
`awardP25` — 99.7% both-known
  120FT FACTORY AB · awardP25: WON=91000 | SHOWN=58616.77
  1A KONSULT AB · awardP25: WON=39473.84 | SHOWN=49025.6
  2030-SEKRETARIATET AB · awardP25: WON=2181.75 | SHOWN=39473.84
`awardP50` — 99.7% both-known
  120FT FACTORY AB · awardP50: WON=328814.51 | SHOWN=159777.3
  1A KONSULT AB · awardP50: WON=172435.07 | SHOWN=150848
  2030-SEKRETARIATET AB · awardP50: WON=2357 | SHOWN=172435.07
`totalEur` — 99.7% both-known
  120FT FACTORY AB · totalEur: WON=139369230.71 | SHOWN=12534448.77
  1A KONSULT AB · totalEur: WON=18425973.78 | SHOWN=11028834.92
  2030-SEKRETARIATET AB · totalEur: WON=23336646.46 | SHOWN=18425973.78
`awardP75` — 99.3% both-known
  120FT FACTORY AB · awardP75: WON=536624.72 | SHOWN=295440
  1A KONSULT AB · awardP75: WON=335293.67 | SHOWN=206834.33
  2030-SEKRETARIATET AB · awardP75: WON=27180 | SHOWN=335293.67
`awardN` — 98.6% both-known
  120FT FACTORY AB · awardN: WON=285 | SHOWN=51
  1A KONSULT AB · awardN: WON=75 | SHOWN=68
  2030-SEKRETARIATET AB · awardN: WON=660 | SHOWN=75
`eventCount` — 98.6% both-known
  120FT FACTORY AB · eventCount: WON=285 | SHOWN=51
  1A KONSULT AB · eventCount: WON=75 | SHOWN=69
  2030-SEKRETARIATET AB · eventCount: WON=726 | SHOWN=75
`companyCount` — 97.6% both-known
  120FT FACTORY AB · companyCount: WON=126 | SHOWN=24
  1A KONSULT AB · companyCount: WON=52 | SHOWN=35
  2030-SEKRETARIATET AB · companyCount: WON=447 | SHOWN=52
`description` — 95.8% both-known
  120FT FACTORY AB · description: WON=Forsknings- och innovationsprojekt som använder avancerad digital teknik för att göra elin | SHOWN=Initiera och genomföra forsknings-, utvecklings- och innovationsprojekt (FUI-projekt) med 
  1A KONSULT AB · description: WON=Anpassning och storskalad testning av IoT-lösningar i verkliga miljöer. Vidareutveckling a | SHOWN=Projekt som i bred aktörssamverkan adresserar systemfrågor som bedöms nödvändiga för att m
  2030-SEKRETARIATET AB · description: WON=FoU-projekt inom ett internationell samverkansprojekt för utveckling av lösningar för håll | SHOWN=Anpassning och storskalad testning av IoT-lösningar i verkliga miljöer. Vidareutveckling a
`eligibilityText` — 79.1% both-known
  120FT FACTORY AB · eligibilityText: WON=Minst två projektparter, varav minst ett elintensivt industriföretag som samverkar, t ex i | SHOWN=Utlysningen riktar sig till konsortier som innehåller minst två företag, samt andra för pr
  1A KONSULT AB · eligibilityText: WON=Kommuner och regioner i samverkan med minst ett företag eller en forsknings- och innovatio | SHOWN=Aktörer inom mobilitet- och transportsektorn. Behovsägare ska ha en central roll och konso
  2030-SEKRETARIATET AB · eligibilityText: WON=Varje projektkonsortium måste omfatta minst en organisation från Sverige och minst en orga | SHOWN=Kommuner och regioner i samverkan med minst ett företag eller en forsknings- och innovatio
`lastYear` — 66.2% both-known
  120FT FACTORY AB · lastYear: WON=2026 | SHOWN=2024
  2030-SEKRETARIATET AB · lastYear: WON=2026 | SHOWN=2025
  2D FAB AB · lastYear: WON=2026 | SHOWN=2024
`schemeCode` — 37.3% both-known
  3D MEDICAL · schemeCode: WON=SA.40391 | SHOWN=SA.111728
  77 FOODS · schemeCode: WON=SA.111723 | SHOWN=SA.111728
  A.M.L. MICROTECHNIQUE LORRAINE · schemeCode: WON=SA.40391 | SHOWN=SA.40453
`administeringBody` — 35.2% both-known
  77 FOODS · administeringBody: WON=Ministère de l'économie et des finances | SHOWN=Conseil régional d'Ile-de-France
  A.V. SIMULATION · administeringBody: WON=Ministère de l'économie et des finances | SHOWN=CNC
  ACCIAI SPECIALI TERNI · administeringBody: WON=Ministero delle Imprese e del Made in Italy - Direzione generale per gli incentivi alle im | SHOWN=Ministero della Transizione Ecologica - Direzione Generale Incentivi Energia (IE)
`schemeEndDate` — 24.4% both-known
  3D MEDICAL · schemeEndDate: WON=2020-12-30 | SHOWN=2026-12-30
  A.V. SIMULATION · schemeEndDate: WON=2020-12-30 | SHOWN=2026-12-30
  ACCIAI SPECIALI TERNI · schemeEndDate: WON=2020-12-30 | SHOWN=2026-12-30
`schemeOperators` — 23.3% both-known
  3D MEDICAL · schemeOperators: WON=["Conseil régional Occitanie","Conseil régional Nouvelle-Aquitaine","Région Pays de la Loi | SHOWN=["Conseil régional","Conseil régional d'Ile-de-France","REGION GRAND EST","Conseil régiona
  77 FOODS · schemeOperators: WON=["Conseil régional Nouvelle-Aquitaine","Conseil régional","REGION GRAND EST","Caisse des D | SHOWN=["Conseil régional","Conseil régional d'Ile-de-France","REGION GRAND EST","Conseil régiona
  A.M.L. MICROTECHNIQUE LORRAINE · schemeOperators: WON=["Conseil régional Occitanie","Conseil régional Nouvelle-Aquitaine","Région Pays de la Loi | SHOWN=["Conseil régional Occitanie","Conseil régional","Conseil régional Nouvelle-Aquitaine","RE
`application.timeline` — 12.5% both-known
  AALTO KORKEAKOULUSAATIO SR · application.timeline: WON=Around 5 months from submission deadline for evaluation outcome; around 8 months from subm | SHOWN=Evaluation outcome around 5 months from submission deadline; grant agreement signature aro
  ACADEMISCH ZIEKENHUIS GRONINGEN · application.timeline: WON=Around 5 months from submission deadline for evaluation outcome; around 8 months from subm | SHOWN=Around 5 months from submission deadline for evaluation outcome; around 8 months from subm
  AGENCIA ESTATAL CONSEJO SUPERIOR DE INVESTIGACIONES CIENTIFICAS · application.timeline: WON=Evaluation outcome around 5 months from submission deadline; grant agreement signature aro | SHOWN=Around 5 months from submission deadline for evaluation outcome; around 8 months from subm
`nameSource` — 9.8% both-known
  3D MEDICAL · nameSource: WON=deterministic | SHOWN=case_register
  A.M.L. MICROTECHNIQUE LORRAINE · nameSource: WON=deterministic | SHOWN=case_register
  A.V. SIMULATION · nameSource: WON=deterministic | SHOWN=case_register
`application.channel` — 7.3% both-known
  ASOCIACION CENTRO TECNOLOGICO CEIT · application.channel: WON=Not specified in extracted sections beyond reference to General Annexes and Funding and Te | SHOWN=Calls for proposals (Horizon Europe grants), calls for tenders/procurements, and inducemen
  BARCELONA SUPERCOMPUTING CENTER CENTRO NACIONAL DE SUPERCOMPUTACION · application.channel: WON=Electronic Submission System of the EU Funding & Tenders Portal (SEDIA), submitted online  | SHOWN=Calls for proposals (Horizon Europe grants), calls for tenders/procurements, and inducemen
  BULL SAS · application.channel: WON=Calls for proposals (Horizon Europe grants), calls for tenders/procurements, and inducemen | SHOWN=EU Funding & Tenders Portal call process under Horizon Europe, managed by the SNS JU
`capitalType` — 4.5% both-known
  ACS SOLUTIONS · capitalType: WON=tax_credit | SHOWN=grant
  ACTYX · capitalType: WON=tax_credit | SHOWN=grant
  ALOCALO GMBH · capitalType: WON=tax_credit | SHOWN=grant
`deliveryRegionShare` — 2.4% both-known
  ALOCALO GMBH · deliveryRegionShare: WON=0.9807692307692307 | SHOWN=0.9259259259259259
  AQUALANDE · deliveryRegionShare: WON=0.971830985915493 | SHOWN=0.9891304347826086
  IDM · deliveryRegionShare: WON=0.883495145631068 | SHOWN=0.9891304347826086
`deliveryRegion` — 2.1% both-known
  ALOCALO GMBH · deliveryRegion: WON=DEC0 | SHOWN=DE40
  AQUALANDE · deliveryRegion: WON=FRI | SHOWN=FR10
  IDM · deliveryRegion: WON=FRK2 | SHOWN=FR10

wrote /tmp/wsha_pairs.txt  (287 pairs, in full)
