# wsGD — where the answer is cut away

```
corpus=postgres instruments=1088 at 2026-08-12T20:33:52.259Z
ranker: all 820 request(s) on EMBEDDING
n=820 holdout described founders, ANTHROPIC_API_KEY deleted before import
1763 pair(s) excluded before this run: the won fund is not publishable
```

> The recall set is CONDITIONED on the won fund being publishable, so the `publishableInstruments()` filters — closure, the capital-type editorial policy, the unconfirmed-open withholding — cannot appear as a miss below. 1763 pair(s) were removed by them before this measurement began.

## Every stage that removes the answer

| stage | list length (mean/median) | won fund still present | lost here |
|---|---:|---:|---:|
| in the corpus | 1088 | 820/820 — 100.0% | — |
| publishable | 771 | 820/820 — 100.0% | 0 |
| gate 1 `buildInstrumentTableHydrated` | 86.4 / 88 | 797/820 — 97.2% | 23 |
| `accessiblePool` (encoded verdict) | 71.6 / 73 | 613/820 — 74.8% | **184** |
| `orderMemoCandidates` (name collapse) | 71.6 / 73 | 613/820 — 74.8% | 0 |
| `.slice(0, 6)` | 6.0 | 211/820 — 25.7% | 402 (cumulative) |
| `.slice(0, 12)` | 12.0 | 302/820 — 36.8% | 311 (cumulative) |
| `.slice(0, 18)` | 17.9 | 355/820 — 43.3% | 258 (cumulative) |
| `.slice(0, 25)` | 24.3 | 410/820 — 50.0% | 203 (cumulative) |
| `.slice(0, 30)` | 28.4 | 449/820 — 54.8% | 164 (cumulative) |
| `.slice(0, 40)` | 36.4 | 501/820 — 61.1% | 112 (cumulative) |
| `.slice(0, 50)` | 44.2 | 519/820 — 63.3% | 94 (cumulative) |
| `.slice(0, 60)` | 51.9 | 541/820 — 66.0% | 72 (cumulative) |
| `.slice(0, 80)` | 63.8 | 570/820 — 69.5% | 43 (cumulative) |

## Recall, legibility and prompt size at each K

| K | mean rows shown | won fund inside | rows with a `funds:` line | prompt chars | ~tokens |
|---|---:|---:|---:|---:|---:|
| 6 | 6.0 | 211/820 — 25.7% | 87.5% | 10748 | 2986 |
| 12 | 12.0 | 302/820 — 36.8% | 88.1% | 16570 | 4603 |
| 18 | 17.9 | 355/820 — 43.3% | 87.4% | 22136 | 6149 |
| 25 | 24.3 | 410/820 — 50.0% | 87.0% | 27805 | 7723 |
| 30 | 28.4 | 449/820 — 54.8% | 86.8% | 31462 | 8739 |
| 40 | 36.4 | 501/820 — 61.1% | 86.5% | 38388 | 10663 |
| 50 | 44.2 | 519/820 — 63.3% | 85.9% | 44999 | 12500 |
| 60 | 51.9 | 541/820 — 66.0% | 85.5% | 51632 | 14342 |
| 80 | 63.8 | 570/820 — 69.5% | 85.2% | 62869 | 17464 |
| the whole pool | 71.6 | 613/820 — 74.8% | 86.3% | 71356 | 19821 |

## The encoded verdict deleted the answer — 184/820 founders (22.4%)

These are funds the company DEMONSTRABLY WON, on a row gate 1 had already selected, which `accessiblePool` then removed because our own encoded filters say the founder conclusively fails them. No depth reaches these: the row is gone before any K is applied. Grouped by the field whose filter fired.

`sole` counts the founders for whom removing THAT ONE ANSWER un-blocks the fund: the field is then the whole of the reason the answer was deleted. Several of these answers are DERIVED by the replay rather than stated by a founder — `ticketBand` from the median award under a different notified scheme, `region` from a different scheme's beneficiary region — so a high `sole` count on a derived field is a claim about our guess before it is a claim about our gates.

| intake field | founders whose answer it deleted | sole | cited | verified | a requirement it fired on |
|---|---:|---:|---:|---:|---|
| `ticketBand` | 120 | 104 | 117 | 116 | Projects of 6 to 18 months must have total eligible project costs between £100,000 and £500,000. |
| `organisationType` | 33 | 20 | 33 | 0 | The coordinator must be a municipality, a municipal association, or a civil society organisation |
| `region` | 16 | 16 | 16 | 16 | The applicant enterprise must be located in the target territories of the Programme (less developed regions: B |
| `sector` | 15 | 15 | 15 | 0 | Projects must fall within at least one of three defined themes (green transition; life science/health/welfare; |
| `useOfFunds` | 11 | 11 | 5 | 2 | Funds must be used to clarify uncertainty related to the commercial application of the research, resolving cri |
| `consortium` | 6 | 6 | 6 | 6 | Only individual projects carried by a single company are eligible (no consortia). |
| `borrowerModel` | 6 | 6 | 6 | 0 | Sole proprietorships (enkeltpersonforetak) are not eligible to apply. |

## Per founder

| founder | country | hydrated | accessible | ordered | rank hyd/acc/ord |
|---|---|---:|---:|---:|---|
| +ATLANTIC ASSOCIACAO PARA UM LABORATORIO COLABORATIVO DO ATLANTICO | DK | 38 | 30 | 30 | 2/2/2 |
| 120FT FACTORY AB | SE | 88 | 75 | 75 | 7/7/7 |
| 1749 LTD | GB | 19 | 16 | 16 | 1/—/— |
| 17CICADA | GB | 28 | 23 | 23 | 4/—/— |
| 1A KONSULT AB | SE | 81 | 72 | 72 | 24/23/23 |
| 1Health Gut Inn Balance APS | DK | 40 | 30 | 30 | 7/6/6 |
| 1SPATIAL GROUP | GB | 27 | 22 | 22 | 1/—/— |
| 1TO1DESIGN S.R.O. | CZ | 72 | 68 | 68 | 2/2/2 |
| 2 DTECH | GB | 33 | 24 | 24 | 1/—/— |
| 2030-SEKRETARIATET AB | SE | 81 | 70 | 70 | 17/15/15 |
| 21st.bio Laboratory | DK | 40 | 33 | 33 | 1/1/1 |
| 2D ApS | DK | 30 | 20 | 20 | 2/—/— |
| 2D FAB AB | SE | 81 | 71 | 71 | 19/16/16 |
| 2H OFFSHORE ENGINEERING | GB | 25 | 18 | 18 | 2/—/— |
| 2NDMED AB | SE | 90 | 74 | 74 | 4/4/4 |
| 2PD Ltd | GB | 27 | 21 | 21 | 1/—/— |
| 3 MINUTES WEST | GB | 28 | 23 | 23 | 3/—/— |
| 3 SCI | GB | 33 | 23 | 23 | 3/—/— |
| 300K SOLUTIONS SL | ES | 123 | 86 | 86 | 1/1/1 |
| 365Talents | FR | 114 | 107 | 107 | 5/4/4 |
| 3AI | GB | 27 | 22 | 22 | 2/—/— |
| 3D MEDICAL | FR | 106 | 99 | 99 | 11/10/10 |
| 3D REPO | GB | 27 | 22 | 22 | 2/—/— |
| 3FINERY | GB | 27 | 22 | 22 | 3/—/— |
| 3P TECHNOLOGY ApS | DK | 38 | 28 | 28 | 2/2/2 |
| 3PAQ ENGINEERING AB | SE | 80 | 69 | 69 | 6/6/6 |
| 3SHAPE A/S | DK | 24 | 22 | 22 | 1/1/1 |
| 3SHAPE TRIOS A/S | DK | 33 | 31 | 31 | 6/6/6 |
| 3SIX HEALTH | GB | 27 | 22 | 22 | 2/—/— |
| 3T ADDITIVE MANUFACTURING | GB | 33 | 24 | 24 | 4/—/— |
| 4COLORS | GB | 33 | 23 | 23 | 3/—/— |
| 4EI | GB | 27 | 22 | 22 | 4/—/— |
| 4i4 ApS | DK | 38 | 28 | 28 | 2/2/2 |
| 4JTECH S.R.O. | CZ | 70 | 62 | 62 | 2/2/2 |
| 4M SYSTEMS A.S. | CZ | 65 | 62 | 62 | 7/7/7 |
| 4Mvideo | DK | 33 | 30 | 30 | 6/6/6 |
| 50 WAYS TO COOK | GB | 27 | 21 | 21 | 5/—/— |
| 540 WORLD | GB | 25 | 17 | 17 | 3/—/— |
| 5G COMMUNICATIONS FOR FUTURE INDUSTRY VERTICALS | ES | 126 | 93 | 93 | 6/6/6 |
| 6D DEMENTIA LTD | GB | 27 | 21 | 21 | 1/—/— |
| 77 FOODS | FR | 120 | 100 | 100 | 101/85/85 |
| 7SENSE AGRITECH | NO | 99 | 91 | 91 | 8/—/— |
| A N TECHNOLOGY | GB | 25 | 18 | 18 | 3/—/— |
| A.M.L. MICROTECHNIQUE LORRAINE | FR | 112 | 100 | 100 | 8/7/7 |
| A.V. SIMULATION | FR | 115 | 108 | 108 | 10/9/9 |
| AALBORG KOMMUNE | DK | 38 | 26 | 26 | 4/4/4 |
| AALTO KORKEAKOULUSAATIO SR | FI | 39 | 32 | 32 | 13/12/12 |
| AARHUS UNIVERSITETSHOSPITAL | DK | 30 | 23 | 23 | 2/2/2 |
| AB GLADTJÄRNEN | SE | 79 | 68 | 68 | 17/17/17 |
| AB MARELD TECHNOLOGIES | SE | 88 | 74 | 74 | 5/5/5 |
| AB SVENSKA BOSTÄDER | SE | 82 | 72 | 72 | 5/—/— |
| AB TASTY | FR | 114 | 100 | 100 | 7/6/6 |
| AB VOLVO | SE | 87 | 73 | 73 | 1/1/1 |
| AB7 Industries | FR | 120 | 110 | 110 | 14/12/12 |
| ABALONEUK | GB | 25 | 18 | 18 | 1/—/— |
| ABB | GB | 33 | 23 | 23 | 5/—/— |
| ABB ELECTRIFICATION NORWAY | NO | 105 | 91 | 91 | 21/17/17 |
| ABBELIGHT | FR | 107 | 99 | 99 | 12/—/— |
| ABBEY GROUP INDUSTRIAL SERVICES | GB | 28 | 24 | 24 | 1/—/— |
| ABERA BIOSCIENCE AB | GB | 34 | 23 | 23 | 3/—/— |
| ABERDEEN HARBOUR BOARD | GB | 34 | 25 | 25 | 3/—/— |
| ABERTAY UNIVERSITY | GB | 33 | 20 | 20 | 3/—/— |
| ABERYSTWYTH UNIVERSITY | GB | 25 | 16 | 16 | 5/—/— |
| ABILION MEDICAL SYSTEMS AB | SE | 82 | 71 | 71 | 10/10/10 |
| ABIONICA SOLUTIONS SLP | ES | 132 | 98 | 98 | 2/2/2 |
| ABLE2B COMMUNITY INTEREST COMPANY | GB | 27 | 22 | 22 | 5/—/— |
| ABOVE THE CLOUD | GB | 27 | 22 | 22 | 4/—/— |
| ABSOLICON SOLAR COLLECTOR AB | SE | 87 | 72 | 72 | 17/15/15 |
| ABT BOLAGEN AB | SE | 81 | 71 | 71 | 11/9/9 |
| ABUNDANCE INVESTMENT | GB | 33 | 24 | 24 | 1/—/— |
| ACADEMISCH ZIEKENHUIS GRONINGEN | NL | 42 | 39 | 39 | 18/18/18 |
| ACC INNOVATION AB | SE | 87 | 73 | 73 | 9/9/9 |
| ACCADEMIA EUROPEA DI BOLZANO | IT | 98 | 90 | 90 | 36/36/36 |
| Accelink | DK | 24 | 20 | 20 | 4/3/3 |
| ACCEPTABLE CORPORATE(S) | BE | 42 | 38 | 38 | —/—/— |
| ACCIAI SPECIALI TERNI | IT | 99 | 79 | 79 | 37/29/29 |
| ACCIDENTAL THEATRE | GB | 27 | 22 | 22 | 3/—/— |
| ACCIONA CONSTRUCCION | ES | 132 | 106 | 106 | 4/4/4 |
| ACCONEER AB | SE | 74 | 65 | 65 | 5/5/5 |
| ACCURATE SAFETY MANUFACTURING | GB | 25 | 18 | 18 | 1/—/— |
| ACD PHARMACEUTICALS | NO | 98 | 90 | 90 | 7/6/6 |
| ACELLZ | GB | 28 | 23 | 23 | 5/—/— |
| ACHELOUS ENERGY | GB | 25 | 18 | 18 | 2/—/— |
| ACHESON ACHESON LIMITED T A THG LABS | GB | 34 | 23 | 23 | 5/—/— |
| ACOME | FR | 121 | 109 | 109 | 9/8/8 |
| ACONDICIONAMIENTO TARRASENSE ASSOCIACION | ES | 131 | 95 | 95 | 14/14/14 |
| ACORAI AB | SE | 80 | 65 | 65 | 32/28/28 |
| ACOSENSE AB | SE | 81 | 70 | 70 | 21/18/18 |
| ACOUBATT | GB | 25 | 18 | 18 | 1/—/— |
| ACS SOLUTIONS | DE | 130 | 129 | 129 | 120/119/119 |
| ACTA MOBILIER | FR | 112 | 101 | 101 | 16/15/15 |
| ACTIA AUTOMOTIVE | FR | 121 | 109 | 109 | 22/20/20 |
| ACTICOR BIOTECH | FR | 122 | 110 | 110 | 13/12/12 |
| ACTIONSENSE LTD | GB | 28 | 22 | 22 | 1/—/— |
| ACTYX | DE | 129 | 127 | 127 | 123/121/121 |
| ACUA OCEAN | GB | 34 | 25 | 25 | 3/—/— |
| AD HOC MARINE DESIGNS | GB | 33 | 22 | 22 | 1/—/— |
| AD SCIENTIAM | FR | 114 | 100 | 100 | 5/—/— |
| ADAPTAM THERAPEUTICS | ES | 127 | 95 | 95 | 18/17/17 |
| ADAPTIVITY AB | SE | 82 | 73 | 73 | 21/20/20 |
| ADD GENDER AB | SE | 88 | 74 | 74 | 10/—/— |
| ADD NORTH 3D AB | SE | 81 | 73 | 73 | 11/11/11 |
| ADDEV MATERIALS AEROSPACE SAS | FR | 120 | 103 | 103 | 39/32/32 |
| ADDHERE TECHNOLOGIES | GB | 19 | 15 | 15 | 1/—/— |
| ADDI MEDICAL AB | SE | 81 | 71 | 71 | 28/24/24 |
| ADDITIVE INNOVATION & MANUFACTURING SWEDEN AB | SE | 79 | 68 | 68 | 18/—/— |
| ADDITIVE INSTRUMENTS | GB | 27 | 22 | 22 | 1/—/— |
| ADDITIVE MANUFACTURING SOLUTIONS LTD | GB | 25 | 17 | 17 | 3/—/— |
| ADDRESSCLOUD | GB | 33 | 23 | 23 | 2/—/— |
| ADHEX TECHNOLOGIES | FR | 112 | 100 | 100 | 27/24/24 |
| ADIONICS | FR | 121 | 109 | 109 | 100/88/88 |
| ADRENALINE AND ENDORPHIN PRODUCTIONS | GB | 25 | 17 | 17 | 1/—/— |
| ADSORBI AB | SE | 87 | 72 | 72 | 6/5/5 |
| ADVANCE TRAINING AND CONSULTING | GB | 27 | 22 | 22 | 2/—/— |
| ADVANCED AIR MOBILITY AAM AB | SE | 82 | 73 | 73 | 9/—/— |
| ADVANCED ANALYTICS LABS | GB | 25 | 17 | 17 | 1/—/— |
| ADVANCED ELECTRIC MACHINES | GB | 25 | 17 | 17 | 1/—/— |
| ADVANCED MANUFACTURING SHEFFIELD | GB | 33 | 24 | 24 | 1/—/— |
| ADVANCED MARKER DISCOVERY SL | ES | 133 | 95 | 95 | 113/82/82 |
| ADVANCED WIRELESS SOLUTIONS AND SERVICES | FR | 114 | 106 | 106 | 9/8/8 |
| ADVANSCI RESEARCH SOLUTIONS AB | SE | 82 | 73 | 73 | 5/5/5 |
| AEGIS IT RESEARCH GMBH | DE | 129 | 120 | 120 | 1/1/1 |
| AENITIS TECHNOLOGIES | FR | 115 | 103 | 103 | 3/—/— |
| AERIAL ICON | GB | 27 | 22 | 22 | 4/—/— |
| AERNNOVA COMPOSITES ILLESCAS SA | ES | 133 | 99 | 99 | 2/2/2 |
| AEROSPACE CUTTING TOOL | GB | 25 | 18 | 18 | 1/—/— |
| AEROSPACE VALLEY | FR | 115 | 108 | 108 | 31/31/31 |
| AEROSPACEHV | GB | 34 | 24 | 24 | 4/—/— |
| AEROSPACELAB | BE | 48 | 40 | 40 | —/—/— |
| AEROTEX | GB | 34 | 24 | 24 | 5/—/— |
| AETHA DESIGN STUDIO | GB | 33 | 24 | 24 | 1/—/— |
| AF OFFSHORE DECOM | NO | 105 | 93 | 93 | 4/3/3 |
| AFFIBODY MEDICAL AB | SE | 82 | 72 | 72 | 65/58/58 |
| AFFINISEP | FR | 115 | 108 | 108 | 111/104/104 |
| AFIYET AB | SE | 81 | 71 | 71 | 20/18/18 |
| AFM RÅDGIVENDE INGENIØRER A/S | DK | 33 | 31 | 31 | 6/5/5 |
| AGCO A/S | DK | 33 | 30 | 30 | 13/12/12 |
| AGENCE LOCALE DE L ENERGIE ET DU CLIMAT | FR | 120 | 102 | 102 | 33/27/27 |
| AGENCIA ESTATAL CONSEJO SUPERIOR DE INVESTIGACIONES CIENTIFICAS | ES | 131 | 68 | 68 | 16/13/13 |
| AGENIUMSPACE | FR | 115 | 108 | 108 | 3/3/3 |
| AGENT | FR | 115 | 108 | 108 | 5/—/— |
| AGNOSTIX, S.R.O. | CZ | 72 | 69 | 69 | 8/8/8 |
| AGREKA BUILD | GB | 33 | 24 | 24 | 1/—/— |
| AGRIBIOTIX | NO | 98 | 90 | 90 | 3/3/3 |
| AGRIROBOT | DK | 38 | 30 | 30 | 6/5/5 |
| AGRISOUND | GB | 33 | 23 | 23 | 3/—/— |
| AGRO CS A.S. | CZ | 70 | 62 | 62 | 10/9/9 |
| AGROPROGRES KATEŘINKY S. R. O. | CZ | 70 | 62 | 62 | 10/9/9 |
| AGROSENSE | NO | 105 | 91 | 91 | 75/69/69 |
| AGROSOFT TÁBOR, S.R.O. | CZ | 73 | 70 | 70 | 3/3/3 |
| AI NERGY | DK | 38 | 32 | 32 | 6/6/6 |
| AI|FFINITY S.R.O. | CZ | 73 | 70 | 70 | 1/1/1 |
| AIM TECHNOLOGIES | GB | 25 | 17 | 17 | 1/—/— |
| AIMPLAS - ASOCIACION DE INVESTIGACION DE MATERIALES PLASTICOS Y CONEXAS | ES | 125 | 67 | 67 | 12/8/8 |
| AINIA | ES | 125 | 95 | 95 | 1/1/1 |
| AIOPT AB | SE | 89 | 75 | 75 | 33/30/30 |
| AIR GIANTS | GB | 33 | 24 | 24 | 4/—/— |
| AIR TECH INTEGRITY | GB | 25 | 18 | 18 | 1/—/— |
| AIR6 Systems | DK | 30 | 22 | 22 | 4/4/4 |
| AIRBORNE COMPOSITES | GB | 33 | 23 | 23 | 5/—/— |
| Airbus | FR | 113 | 89 | 89 | 3/3/3 |
| AIRBUS OPERATIONS LIMITED | GB | 33 | 22 | 22 | 3/—/— |
| AIRBUSDEFENCEANDSPACEGMBH | DE | 129 | 127 | 127 | 1/1/1 |
| AIRFORESTRY AB | SE | 88 | 75 | 75 | 1/1/1 |
| AIRHIVE | GB | 33 | 24 | 24 | 3/—/— |
| AIRINNOVA AB | SE | 89 | 75 | 75 | 34/33/33 |
| AIRSIDE INNOVATION | NO | 99 | 91 | 91 | 9/—/— |
| AIRY Automotive | DK | 39 | 31 | 31 | 4/4/4 |
| AIRZYME SWEDEN AB | SE | 87 | 73 | 73 | 14/9/9 |
| AISTI CORPORATION OY | FI | 40 | 32 | 32 | 32/29/29 |
| AIT AUSTRIAN INSTITUTE OF TECHNOLOGY GMBH | AT | 45 | 40 | 40 | 4/4/4 |
| aiXscale Photonics GmbH | DE | 128 | 119 | 119 | 16/—/— |
| AIXTRON SE | DE | 136 | 109 | 109 | 39/29/29 |
| AKADEMISKA HUS AB | SE | 79 | 65 | 65 | 5/—/— |
| AKER BP | NO | 98 | 92 | 92 | 2/2/2 |
| AKER SOLUTIONS HYDROPOWER | NO | 105 | 93 | 93 | 43/35/35 |
| AKIRA SCIENCE AB | SE | 79 | 65 | 65 | 61/55/55 |
| AKIRAM THERAPEUTICS AB | SE | 75 | 66 | 66 | 7/7/7 |
| AKKODIS DIGITAL | FR | 112 | 100 | 100 | 56/54/54 |
| AKKODIS ITALY | IT | 90 | 16 | 16 | 78/—/— |
| AKOUSTIC ARTS | FR | 115 | 108 | 108 | 13/—/— |
| ÅKP | NO | 105 | 91 | 91 | 79/73/73 |
| AKTIESELSKABET EINAR WILLUMSEN | DK | 32 | 29 | 29 | 11/10/10 |
| Aktiv | DK | 32 | 29 | 29 | 3/3/3 |
| AKVA GROUP | NO | 105 | 91 | 91 | 14/11/11 |
| ALBASENSE | GB | 25 | 17 | 17 | 1/—/— |
| ALBOTHERM | GB | 33 | 23 | 23 | 4/—/— |
| ALCEUS BIOSCIENCES | GB | 19 | 16 | 16 | 1/—/— |
| ALCOA NORWAY | NO | 97 | 85 | 85 | 4/4/4 |
| ALDER OLMAI SUPERNATURALCOLOURS AB | SE | 87 | 72 | 72 | 4/4/4 |
| ALDORIA | FR | 114 | 95 | 95 | —/—/— |
| ALEA QUANTUM TECHNOLOGIES | DK | 32 | 28 | 28 | 5/4/4 |
| ALERTIX VETERINARY DIAGNOSTICS AB | SE | 82 | 72 | 72 | 16/15/15 |
| ALGINOR BIOREFINERY | NO | 90 | 82 | 82 | 23/—/— |
| ALGIPHARMA | NO | 99 | 91 | 91 | 6/—/— |
| ALGODX AB | SE | 88 | 73 | 73 | 4/4/4 |
| ALGORYX SIMULATION | SE | 82 | 78 | 78 | 56/55/55 |
| ALINGSÅS KOMMUN | SE | 87 | 77 | 77 | 5/5/5 |
| ALIVE LABS | GB | 33 | 24 | 24 | 1/—/— |
| ALIXLABS AB | SE | 79 | 64 | 64 | 7/7/7 |
| ALL AXIS STUDIO | GB | 20 | 17 | 17 | 3/—/— |
| ALL SEEING EYE LTD | GB | 28 | 22 | 22 | 2/—/— |
| ALLFOCAL OPTICS | GB | 29 | 23 | 23 | 3/—/— |
| ALMA MATER STUDIORUM - UNIVERSITA DI BOLOGNA | IT | 92 | 21 | 21 | 15/4/4 |
| ALMI FÖRETAGSPARTNER UPPSALA AB | SE | 81 | 70 | 70 | 13/11/11 |
| ALOCALO GMBH | DE | 128 | 119 | 119 | 120/112/112 |
| ALPHAGENESIS CONSULTANCY | GB | 25 | 18 | 18 | 1/—/— |
| ALSYMEX | FR | 114 | 108 | 108 | 11/10/10 |
| ALTERED CARBON | GB | 25 | 16 | 16 | 1/—/— |
| ALTERNATIVE TECHNOLOGY SOLUTIONS | GB | 27 | 23 | 23 | 5/—/— |
| ALTEVAX | FR | 122 | 110 | 110 | 3/—/— |
| ALTILIUM METALS | GB | 25 | 18 | 18 | 5/—/— |
| ALVA INDUSTRIES | NO | 97 | 84 | 84 | 7/—/— |
| ALZINOVA AB | SE | 82 | 72 | 72 | 6/6/6 |
| AMBODY | GB | 27 | 22 | 22 | 1/—/— |
| AMBUSOL AB (PUBL) | SE | 90 | 74 | 74 | 2/2/2 |
| AMFERIA AB | SE | 82 | 72 | 72 | 6/6/6 |
| AMICOAT | NO | 98 | 90 | 90 | 7/6/6 |
| AMNIOTICS AB (PUBL) | SE | 82 | 72 | 72 | 6/6/6 |
| AMOREAQUA AB | SE | 81 | 71 | 71 | 17/15/15 |
| AMORPHOUS TECHNOLOGIES AND ENGINEERING | GB | 25 | 18 | 18 | 2/—/— |
| AMPLY DISCOVERY | GB | 34 | 24 | 24 | 3/—/— |
| AMSILK GMBH | CZ | 70 | 62 | 62 | —/—/— |
| ANDERSEN MEK VERKSTED | NO | 105 | 92 | 92 | 79/73/73 |
| ANFERRA AB | SE | 79 | 66 | 66 | 49/43/43 |
| ANGLIA RUSKIN UNIVERSITY | GB | 27 | 19 | 19 | 5/—/— |
| ANIMALIA | NO | 105 | 91 | 91 | 5/5/5 |
| ANOCCA AB | SE | 73 | 64 | 64 | 72/63/63 |
| ANSUR TECHNOLOGIES | NO | 99 | 91 | 91 | 72/67/67 |
| ANTEC BIOGAS | NO | 105 | 93 | 93 | 3/3/3 |
| ANYO LABS AB | SE | 82 | 71 | 71 | 33/29/29 |
| APLEX BIO AB | SE | 82 | 72 | 72 | 31/27/27 |
| APTUNION INDUSTRIE | FR | 112 | 102 | 102 | 5/4/4 |
| AQDOT | GB | 34 | 24 | 24 | 4/—/— |
| AQUAFOOD AB | SE | 87 | 72 | 72 | 28/26/26 |
| AQUALANDE | FR | 120 | 100 | 100 | 55/49/49 |
| AQUALUNG CARBON CAPTURE | NO | 97 | 85 | 85 | 2/2/2 |
| AQUAPREDICT | NO | 99 | 91 | 91 | 10/7/7 |
| AQUAPRO | NO | 105 | 91 | 91 | 12/9/9 |
| AR-Simply ApS | DK | 33 | 28 | 28 | 3/3/3 |
| ARBIO AB | SE | 79 | 65 | 65 | 25/22/22 |
| ARBISENSE AB | SE | 81 | 71 | 71 | 30/26/26 |
| ARBOAIR AB | SE | 87 | 73 | 73 | 8/—/— |
| ARCTIC KNOWLEDGE | NO | 105 | 91 | 91 | 57/52/52 |
| AREVO AB | SE | 81 | 71 | 71 | 36/33/33 |
| ARGYLL AND BUTE COUNCIL | GB | 33 | 23 | 23 | 5/—/— |
| ARIANEGROUP | DE | 135 | 118 | 118 | 2/2/2 |
| ARISTON | IT | 99 | 35 | 35 | 33/—/— |
| ARKEMA FRANCE SA | FR | 120 | 104 | 104 | 69/61/61 |
| ARLA FOODS AMBA | DK | 32 | 29 | 29 | 3/2/2 |
| Arsys | ES | 127 | 94 | 94 | 2/2/2 |
| ARTEC EUROPE SARL | LU | 36 | 29 | 29 | —/—/— |
| ARTELIA | FR | 115 | 99 | 99 | 39/34/34 |
| ARTIKEL 2 - PEACE AND SUSTAINABILITY | SE | 79 | 70 | 70 | 14/11/11 |
| ARTS UNIVERSITY BOURNEMOUTH | GB | 33 | 20 | 20 | 1/—/— |
| ARVIKA KOMMUN | SE | 81 | 76 | 76 | 2/2/2 |
| ARXUM GMBH | DE | 128 | 119 | 119 | 97/91/91 |
| AS TFTAK | EE | 80 | 72 | 72 | 7/7/7 |
| ASCENDANCE FLIGHT TECHNOLOGIES | FR | 120 | 98 | 98 | 113/95/95 |
| ASGARD THERAPEUTICS AB | SE | 82 | 72 | 72 | 7/7/7 |
| ASM TERNI | IT | 92 | 24 | 24 | 83/—/— |
| ASOCIACION CENTRO TECNOLOGICO CEIT | ES | 125 | 65 | 65 | 115/—/— |
| ASOCIACION DE INVESTIGACION DE INDUSTRIAS CARNICAS DEL PRINCIPADO DE ASTURIAS | ES | 125 | 68 | 68 | 5/—/— |
| ASOCIACION DE INVESTIGACION DE LA INDUSTRIA DEL JUGUETE CONEXAS Y AFINES | ES | 123 | 61 | 61 | 2/—/— |
| ASOCIACION DE INVESTIGACION METALURGICA DEL NOROESTE | ES | 131 | 73 | 73 | 14/8/8 |
| ASOCIACION DE LA INDUSTRIA NAVARRA | ES | 132 | 67 | 67 | 10/7/7 |
| ASOCIACION DE LA INVESTIGACION Y COOPERACION INDUSTRIAL DE ANDALUCIA F. DE PAULA ROJAS"" | ES | 131 | 67 | 67 | 19/—/— |
| ASOCIACION EMPRESARIAL DE INVESTIGACION CENTRO TECNOLOGICO DEL CALZADOY DEL PLASTICO DE LA REGION DE MURCIA | ES | 132 | 73 | 73 | 22/13/13 |
| ASTON UNIVERSITY | GB | 33 | 20 | 20 | 1/—/— |
| ASYMPTOTIC AB | SE | 83 | 74 | 74 | 20/19/19 |
| ATELIER TÔLERIE MÉCANIQUE PRÉCISION 77 | FR | 120 | 109 | 109 | 4/4/4 |
| ATIUM AB | SE | 80 | 69 | 69 | 31/30/30 |
| ATLANT 3D Nanosystems ApS | DK | 35 | 28 | 28 | 5/2/2 |
| ATOMCENT HOLDING | NO | 97 | 85 | 85 | 8/8/8 |
| ATRITEC AB | SE | 81 | 72 | 72 | 7/7/7 |
| Aubert & Duval | FR | 120 | 98 | 98 | 24/19/19 |
| AUGMENTCITY | NO | 105 | 91 | 91 | 88/81/81 |
| AUGMENTED KNEE ARTHROSCOPY AB | SE | 83 | 73 | 73 | 2/2/2 |
| AUGMENTEDREALM AB | SE | 82 | 73 | 73 | 8/—/— |
| AURORA PROPULSION TECHNOLOGIES OY | FI | 42 | 34 | 34 | —/—/— |
| AUTOLIV DEVELOPMENT AB | SE | 87 | 73 | 73 | 1/1/1 |
| AUTOMATION HERO GMBH | DE | 120 | 112 | 112 | 95/88/88 |
| AVA OCEAN | NO | 105 | 91 | 91 | 14/11/11 |
| AVADY POOL | FR | 112 | 101 | 101 | 38/33/33 |
| AVASSA SYSTEMS AB | SE | 81 | 71 | 71 | 26/—/— |
| AVENTURE AB | SE | 79 | 65 | 65 | 2/2/2 |
| AWARESOME AB | SE | 81 | 72 | 72 | 16/15/15 |
| AXON CABLE | FR | 106 | 99 | 99 | 7/5/5 |
| AZOTE AB | SE | 82 | 72 | 72 | 4/4/4 |
| B A U M CONSULT | DE | 134 | 127 | 127 | 54/54/54 |
| BAIKOWSKI | FR | 112 | 100 | 100 | 95/83/83 |
| BANGOR UNIVERSITY | GB | 28 | 21 | 21 | 3/—/— |
| BARCELONA SUPERCOMPUTING CENTER CENTRO NACIONAL DE SUPERCOMPUTACION | ES | 131 | 95 | 95 | 82/61/61 |
| BASEMARK OY | FI | 34 | 31 | 31 | —/—/— |
| BASIC GENOMICS AB | SE | 73 | 64 | 64 | 19/17/17 |
| BATH AND NORTH EAST SOMERSET COUNCIL | GB | 25 | 18 | 18 | 1/—/— |
| BAYERISCHE AKADEMIE DER WISSENSCHAFTEN | DE | 128 | 126 | 126 | 1/1/1 |
| BEAMMWAVE AB | SE | 83 | 72 | 72 | 54/—/— |
| BEDIMENSIONAL SPA | IT | 100 | 72 | 72 | 6/3/3 |
| BEEFUTURES HOLDING | NO | 90 | 82 | 82 | 5/5/5 |
| BENECKE KALIKO | DE | 126 | 108 | 108 | 1/1/1 |
| BERGEN ENGINES | NO | 105 | 92 | 92 | 17/13/13 |
| BERNHARD NOCHT INSTITUT FUER TROPENMEDIZIN | DE | 128 | 76 | 76 | 2/2/2 |
| BERRI | GB | 27 | 22 | 22 | 1/—/— |
| BESTLA HEALTH AB | SE | 87 | 72 | 72 | 4/4/4 |
| BETEENDELABBET AB | SE | 73 | 64 | 64 | 16/14/14 |
| BETENSID AB | SE | 79 | 65 | 65 | 4/4/4 |
| BEWI INSULATION NORGE | NO | 97 | 83 | 83 | 2/2/2 |
| BEYONDER | NO | 97 | 85 | 85 | 1/1/1 |
| BI-QEM RESINS AB | SE | 81 | 71 | 71 | 2/2/2 |
| BIG AKWA AB | SE | 80 | 66 | 66 | 22/21/21 |
| BIO ME | NO | 90 | 82 | 82 | 25/21/21 |
| BIOCERA MEDICAL | GB | 27 | 22 | 22 | 1/—/— |
| BIOECONOMY FOR CHANGE | FR | 121 | 101 | 101 | 54/43/43 |
| BIOFY | NO | 99 | 91 | 91 | 6/—/— |
| BIOMAR A S | NO | 105 | 91 | 91 | 67/61/61 |
| BIOMEDICAL BONDING AB | SE | 83 | 72 | 72 | 7/7/7 |
| BIOMOTIF AB | SE | 80 | 66 | 66 | 7/7/7 |
| BIOPOWER TECHNOLOGIES | GB | 33 | 23 | 23 | 5/—/— |
| BIORECRO AB | SE | 87 | 73 | 73 | 12/8/8 |
| BIOSERVO TECHNOLOGIES AB | SE | 90 | 74 | 74 | 1/1/1 |
| BIOSYNTHIS | FR | 120 | 100 | 100 | 20/19/19 |
| BIOVICA INTERNATIONAL AB | SE | 82 | 72 | 72 | 2/2/2 |
| BIRDIE CARE SERVICES | GB | 27 | 22 | 22 | 1/—/— |
| BIRMINGHAM CHAMBER OF COMMERCE | GB | 19 | 14 | 14 | 3/—/— |
| BIRMINGHAM CITY UNIVERSITY | GB | 27 | 19 | 19 | 3/—/— |
| BISHOP GROSSETESTE UNIVERSITY | GB | 27 | 20 | 20 | 3/—/— |
| BITEAM AB | SE | 81 | 73 | 73 | 50/—/— |
| BJØRK INNOVATION | NO | 105 | 91 | 91 | 52/46/46 |
| BLACKWING ENGINEERING AB | SE | 88 | 74 | 74 | 40/39/39 |
| BLEKINGE BUSINESS INCUBATOR AB | SE | 73 | 64 | 64 | 16/14/14 |
| BLEKINGE TEKNISKA HÖGSKOLA | SE | 74 | 69 | 69 | 17/—/— |
| BLIXT TECH AB | SE | 87 | 72 | 72 | 72/64/64 |
| BLUE SOLUTIONS | FR | 121 | 98 | 98 | 30/23/23 |
| BMOTION TECHNOLOGIES | FR | 107 | 90 | 90 | 88/75/75 |
| BMZ GERMANY | DE | 129 | 122 | 122 | 109/102/102 |
| BOARD ARCHITECT DESIGN AB | SE | 73 | 63 | 63 | 13/12/12 |
| BORALEX | FR | 112 | 101 | 101 | 31/—/— |
| BORLÄNGE KOMMUN | SE | 87 | 77 | 77 | 3/3/3 |
| BORMIOLI LUIGI SPA | ES | 123 | 94 | 94 | 5/4/4 |
| BOUYGUES IMMOBILIER | FR | 114 | 108 | 108 | 31/30/30 |
| BP EUROPA SE | DE | 126 | 114 | 114 | 9/9/9 |
| BRAINLINK AB | SE | 83 | 72 | 72 | 19/17/17 |
| BRETAGNE CHIMIE FINE SAS | FR | 121 | 102 | 102 | 6/6/6 |
| BREW HOUSE GÖTEBORG | SE | 81 | 76 | 76 | 17/17/17 |
| BRIGHT MATERIA AB | SE | 79 | 65 | 65 | 8/7/7 |
| BRIGHTPAGE TECHNOLOGIES | GB | 27 | 22 | 22 | 5/—/— |
| BRISTOL BATH REGIONAL CAPITAL | GB | 25 | 18 | 18 | 2/—/— |
| BRISTOL CITY COUNCIL | GB | 33 | 23 | 23 | 5/—/— |
| BRITEST LBG | GB | 27 | 22 | 22 | 4/—/— |
| BRON INNOVATION AB | SE | 81 | 71 | 71 | 5/5/5 |
| BRON INNOVATION AB (SVB) | SE | 88 | 73 | 73 | 1/1/1 |
| BRUNEL FLOATING | NO | 105 | 93 | 93 | 2/2/2 |
| BRUNEL UNIVERSITY LONDON | GB | 28 | 21 | 21 | 5/—/— |
| BUFFERLEAF AB | SE | 81 | 72 | 72 | 1/1/1 |
| BULL SAS | FR | 114 | 90 | 90 | 13/—/— |
| BURT INTELLIGENCE AB | SE | 81 | 72 | 72 | 7/7/7 |
| BUZZARD PHARMACEUTICALS AB | SE | 81 | 70 | 70 | 32/28/28 |
| BYGGDIALOG DALARNA | SE | 87 | 78 | 78 | 41/37/37 |
| Bygning 1481- 1483 | DK | 33 | 31 | 31 | 5/5/5 |
| Bygning 1520 | DK | 32 | 28 | 28 | 2/2/2 |
| BYUTVECKLING SVENSKA AB | SE | 81 | 71 | 71 | 25/24/24 |
| C I R A CENTRO ITALIANO RICERCHE AEROSPAZIALI SCPA | IT | 101 | 81 | 81 | 3/3/3 |
| C12 QUANTUM ELECTRONICS | FR | 106 | 88 | 88 | 95/81/81 |
| C26 BIOSCIENCE AB | SE | 82 | 72 | 72 | 5/5/5 |
| CACTUX S.R.O. | CZ | 72 | 70 | 70 | 37/37/37 |
| CAMBIO CDS AB | SE | 81 | 71 | 71 | 24/21/21 |
| CAMBRIDGE ELECTRIC CEMENT | GB | 25 | 18 | 18 | 1/—/— |
| CAMBRIS CARDIAC | GB | 19 | 16 | 16 | 1/—/— |
| CAMPUS ROSLAGEN AB | SE | 87 | 73 | 73 | 7/6/6 |
| CAPIO S:T GÖRANS SJUKHUS AB | SE | 81 | 71 | 71 | 30/26/26 |
| CAPTIVA ASSET MANAGEMENT | NO | 105 | 91 | 91 | 31/25/25 |
| CARBON COMPENSATE SCANDINAVIA AB | SE | 81 | 71 | 71 | 6/5/5 |
| CARDIFF METROPOLITAN UNIVERSITY | GB | 27 | 20 | 20 | 3/—/— |
| CARDIFF UNIVERSITY | GB | 25 | 16 | 16 | 1/—/— |
| CARIAD SE | DE | 128 | 105 | 105 | 42/35/35 |
| CARONTE TOURIST | IT | 98 | 75 | 75 | 23/19/19 |
| CASINVENT PHARMA, A.S. | CZ | 64 | 61 | 61 | 5/5/5 |
| CASS MATERIALS AB | SE | 79 | 65 | 65 | 4/4/4 |
| CDOTBIO | GB | 25 | 17 | 17 | 5/—/— |
| CEALTECH | NO | 97 | 85 | 85 | 22/16/16 |
| CEFRIEL SOCIETA CONSORTILE A RESPONSABILITA LIMITATA SOCIETA BENEFIT | IT | 98 | 24 | 24 | 18/7/7 |
| CELEMIAB INTERNATIONAL AB | SE | 87 | 73 | 73 | 3/3/3 |
| CELLEVATE AB | SE | 80 | 66 | 66 | 7/7/7 |
| CELLFION AB | SE | 87 | 73 | 73 | 3/3/3 |
| CELLHEAL | NO | 98 | 90 | 90 | 4/3/3 |
| CELLUGY | DK | 38 | 30 | 30 | 2/2/2 |
| CELLUXTREME AB | SE | 79 | 66 | 66 | 13/8/8 |
| CEMENTOS LA CRUZ, S.L. | ES | 123 | 94 | 94 | 5/4/4 |
| CEMONITE | NO | 97 | 83 | 83 | 22/18/18 |
| CENT S.R.O. | CZ | 71 | 64 | 64 | 8/8/8 |
| CENTRE FOR PROCESS INNOVATION LIMITED LBG | GB | 19 | 16 | 16 | 3/—/— |
| CENTRO DI COMPETENZA PER LA SICUREZZA E L OTTIMIZZAZIONE DELLE INFRASTRUTTURE STRATEGICHE START 4 0 | IT | 90 | 82 | 82 | 3/3/3 |
| CENTRO INTERPORTUALE MERCI C I M SPA NOVARA | IT | 92 | 68 | 68 | 3/3/3 |
| CERMAQ NORWAY | NO | 98 | 90 | 90 | 2/2/2 |
| CHALMERS NEXT LABS AB | SE | 79 | 65 | 65 | 1/1/1 |
| CHAMBERY GRAND LAC ECONOMIE | FR | 106 | 101 | 101 | 49/46/46 |
| CHANGERS HUB | SE | 81 | 76 | 76 | 1/1/1 |
| CHARITE - UNIVERSITAETSMEDIZIN BERLIN | DE | 120 | 118 | 118 | 1/1/1 |
| CHROMAFORA AB | SE | 81 | 71 | 71 | 49/45/45 |
| CIGNUS INSTRUMENTS | NO | 106 | 91 | 91 | 1/1/1 |
| CIOL | NO | 105 | 91 | 91 | 31/28/28 |
| CIPHERBIT SLU | ES | 128 | 94 | 94 | 9/9/9 |
| CIRCLE | FR | 112 | 90 | 90 | 94/76/76 |
| CIRCULAR MATERIALS SRL | IT | 99 | 72 | 72 | —/—/— |
| CIRCULAR NORWAY | NO | 105 | 93 | 93 | 47/39/39 |
| CITY I SAMVERKAN STOCKHOLM AB | SE | 82 | 72 | 72 | 1/1/1 |
| CITY UNIVERSITY OF LONDON | GB | 19 | 15 | 15 | 3/—/— |
| CLAY TECHNOLOGY LUND AB | SE | 87 | 72 | 72 | 10/8/8 |
| CLUSTER PARA LA MINERIA SOSTENIBLE Y SERVICIOS ASOCIADOS DE LA PENINSULA IBERICA IBERIAN SUSTAINABLE MINING CLUSTER | ES | 123 | 94 | 94 | —/—/— |
| CODASIP GMBH | DE | 120 | 101 | 101 | 4/3/3 |
| COINNOVATE AB | SE | 81 | 74 | 74 | 7/7/7 |
| COLAS | GB | 25 | 17 | 17 | 5/—/— |
| COMAT | FR | 113 | 89 | 89 | 94/75/75 |
| COMAU | IT | 94 | 26 | 26 | 5/—/— |
| COMING PLUS, A.S. | CZ | 71 | 63 | 63 | 22/22/22 |
| COMPOSITE SERVICE EUROPE AB | SE | 87 | 75 | 75 | 6/6/6 |
| COMPOUND SEMICONDUCTOR APPLICATIONS CATAPULT | GB | 27 | 22 | 22 | 3/—/— |
| COMPUTERWELL | NO | 98 | 89 | 89 | 4/—/— |
| COMTES FHT A.S. | CZ | 71 | 63 | 63 | 22/22/22 |
| CONCR3DE B V | NL | 49 | 41 | 41 | 17/16/16 |
| CONCULAR | DE | 128 | 126 | 126 | 117/115/115 |
| CONSCIENCE AB | SE | 87 | 72 | 72 | 6/5/5 |
| CONSTELLR GMBH | DE | 135 | 110 | 110 | 4/4/4 |
| CONSUPEDIA AB | SE | 79 | 66 | 66 | 51/48/48 |
| COOMPANION ROSLAGEN & NORRORT EK FÖR | SE | 87 | 77 | 77 | 60/59/59 |
| COOMPANION SJUHÄRAD EK FÖR | SE | 87 | 78 | 78 | 3/3/3 |
| Cordys Analytics B.V. | NL | 52 | 45 | 45 | 7/7/7 |
| CORPOWER OCEAN AB | SE | 87 | 73 | 73 | 42/36/36 |
| CORTEC GMBH | DE | 129 | 120 | 120 | 117/109/109 |
| CORVUS ENERGY FUEL CELL | NO | 106 | 94 | 94 | 28/—/— |
| CORVUS RESEARCH | GB | 27 | 21 | 21 | 3/—/— |
| COXA CARRY AB | SE | 82 | 73 | 73 | 2/2/2 |
| CR COMPETENCE AB | SE | 81 | 70 | 70 | 1/1/1 |
| CRCAM NORD MIDI PYRENEES | FR | 120 | 110 | 110 | 20/20/20 |
| CREPITANS AB | SE | 79 | 65 | 65 | 41/38/38 |
| CRYOLOGYX | GB | 34 | 24 | 24 | 4/—/— |
| CS GROUP -FRANCE | FR | 116 | 99 | 99 | —/—/— |
| CSTRIDER AB | SE | 87 | 73 | 73 | 69/63/63 |
| CTD | NO | 98 | 89 | 89 | 90/82/82 |
| CU SERVICES LIMITED | GB | 25 | 17 | 17 | 5/—/— |
| CUBOGAS S.R.L. | IT | 99 | 79 | 79 | 30/23/23 |
| CUREST AB | SE | 87 | 73 | 73 | 21/20/20 |
| CUROVIR AB | SE | 82 | 72 | 72 | 1/1/1 |
| CYBERSOCIAL LAB SRL IMPRESA SOCIALE | IT | 92 | 68 | 68 | 1/1/1 |
| CYTIVA TESTA CENTER AB | SE | 82 | 71 | 71 | 36/—/— |
| CYTO365 AB | SE | 83 | 72 | 72 | 31/27/27 |
| CZ TECH | NO | 105 | 93 | 93 | 81/73/73 |
| DANISI ENGINEERING S.R.L. | IT | 92 | 22 | 22 | 22/—/— |
| DAZETECHNOLOGY S.R.L. | IT | 91 | 18 | 18 | 83/—/— |
| DCIPHER ANALYTICS AB | SE | 81 | 71 | 71 | 3/3/3 |
| DECIMALEN AB | SE | 73 | 65 | 65 | 3/3/3 |
| DEEP BLUE | IT | 93 | 24 | 24 | 32/1/1 |
| DEEP SCIENCE VENTURES | GB | 28 | 23 | 23 | 3/—/— |
| DELTA ELECTRONICS NORWAY | NO | 105 | 91 | 91 | 52/47/47 |
| DENS | NL | 57 | 46 | 46 | 31/24/24 |
| DERMAGNOSTIX GMBH | DE | 128 | 119 | 119 | 1/1/1 |
| DERMICUS AB | SE | 82 | 72 | 72 | 1/1/1 |
| DESTINUS SPAIN | ES | 133 | 100 | 100 | 4/4/4 |
| DETAIL MERCHANDISING ONLINE DMO AB | SE | 73 | 65 | 65 | 3/3/3 |
| DEUTSCHE POST | DE | 134 | 114 | 114 | 7/7/7 |
| DEUTSCHES FORSCHUNGSZENTRUM FUR KUNSTLICHE INTELLIGENZ GMBH | DE | 127 | 100 | 100 | 48/37/37 |
| DEUTSCHES KLIMARECHENZENTRUM | DE | 135 | 128 | 128 | 54/54/54 |
| DIANOVATOR AB | SE | 82 | 72 | 72 | 28/24/24 |
| DIESELLAND OÜ | EE | 81 | 76 | 76 | 18/18/18 |
| DIGINNOCENT S.R.O. | CZ | 64 | 60 | 60 | 5/5/5 |
| DIPS | NO | 98 | 90 | 90 | 14/11/11 |
| DMK DEUTSCHES MILCHKONTOR | DE | 134 | 114 | 114 | 9/9/9 |
| DNV | NO | 99 | 92 | 92 | 17/13/13 |
| DOSCON | NO | 105 | 93 | 93 | 33/25/25 |
| DUMAREY AUTOMOTIVE ITALIA | IT | 90 | 16 | 16 | 31/—/— |
| DYNAMIC WELL SOLUTIONS | NO | 97 | 84 | 84 | 2/2/2 |
| EASTWING AB | SE | 89 | 75 | 75 | 4/4/4 |
| EASYARR AB | SE | 81 | 72 | 72 | 22/21/21 |
| ECM GREENTECH | FR | 112 | 90 | 90 | 96/79/79 |
| ECOLOOP AB | SE | 87 | 73 | 73 | 14/10/10 |
| ECOPLANTA MOLECULAR RECYCLING SOLUTIONS S.L. | ES | 131 | 102 | 102 | 6/—/— |
| EDEN TECH | FR | 114 | 108 | 108 | 97/91/91 |
| EFESTOS HUB | GB | 33 | 24 | 24 | 1/—/— |
| EFFECT INNOVATION AB | SE | 81 | 71 | 71 | 40/37/37 |
| EGGA UTVIKLING | NO | 99 | 91 | 91 | 10/7/7 |
| EGÚ BRNO, A.S. | CZ | 78 | 70 | 70 | 8/8/8 |
| EKERÖ KOMMUN | SE | 81 | 75 | 75 | 1/1/1 |
| EL SITIO DE VALDELATARRA | ES | 133 | 96 | 96 | 63/50/50 |
| ELEAF | NL | 50 | 46 | 46 | 37/35/35 |
| ELECTRICITY INNOVATION EK FÖR | SE | 87 | 78 | 78 | 35/31/31 |
| ELKEM TESTVIRKSOMHET | NO | 97 | 85 | 85 | 22/16/16 |
| Embedded Acoustics BV | NL | 51 | 46 | 46 | 17/17/17 |
| EMBEDDED BRAINS | DE | 136 | 129 | 129 | 101/101/101 |
| EMICKERS AB | SE | 88 | 74 | 74 | 34/31/31 |
| EMILIA FELDT PRODUCTIONS AB | SE | 88 | 73 | 73 | 22/20/20 |
| EMPLICURE AB (PUBL) | SE | 83 | 73 | 73 | 23/—/— |
| ENANTIS S.R.O. | CZ | 78 | 70 | 70 | 45/45/45 |
| ENERGY ROBOTICS GMBH | DE | 129 | 120 | 120 | 6/6/6 |
| Engineering | IT | 94 | 78 | 78 | 47/45/45 |
| ENVUE TECHNOLOGIES AB | SE | 83 | 73 | 73 | 21/19/19 |
| EODYNE SYSTEMS SL | ES | 127 | 93 | 93 | 3/3/3 |
| EP CENTER MANAGEMENT AB | SE | 81 | 72 | 72 | 15/14/14 |
| EQUINOR ENERGY | NO | 99 | 93 | 93 | 64/59/59 |
| Ericsson | DE | 128 | 113 | 113 | —/—/— |
| ERICSSON TELECOMUNICAZIONI | IT | 92 | 76 | 76 | 1/1/1 |
| ESK Schultze GmbH & Co. KG | DE | 135 | 122 | 122 | 65/60/60 |
| ESKILSTUNA KOMMUN | SE | 81 | 76 | 76 | 5/5/5 |
| ETT TAK AB | SE | 82 | 73 | 73 | 31/28/28 |
| EURNEX E V | DE | 135 | 128 | 128 | 7/7/7 |
| EURO WIPES | FR | 121 | 110 | 110 | 62/58/58 |
| EUROPEAN MUD COMPANY | NO | 97 | 83 | 83 | 1/1/1 |
| EVERDRONE AB | SE | 87 | 73 | 73 | 2/2/2 |
| EVIA AB | SE | 87 | 72 | 72 | 36/33/33 |
| EvoLogics GmbH | DE | 136 | 108 | 108 | 12/12/12 |
| EWOS | NO | 105 | 91 | 91 | 1/1/1 |
| EXACT THERAPEUTICS | NO | 99 | 91 | 91 | 1/1/1 |
| EXCESS ENGINEERING | NO | 97 | 83 | 83 | 1/1/1 |
| EXEDRA | NO | 97 | 84 | 84 | 1/1/1 |
| EXEMPLAS | GB | 33 | 23 | 23 | 2/—/— |
| FACTIVERSE | NO | 98 | 90 | 90 | 10/6/6 |
| FAIRMAT SAS | FR | 113 | 96 | 96 | 92/—/— |
| FASADGLAS BÄCKLIN AB | SE | 79 | 68 | 68 | 18/—/— |
| FBL INNOVATION EK FÖR | SE | 87 | 78 | 78 | 50/48/48 |
| FERRITICO AB | SE | 79 | 65 | 65 | 29/25/25 |
| FEV EUROPE | DE | 129 | 114 | 114 | 2/2/2 |
| FIBERCOP | IT | 95 | 25 | 25 | 3/—/— |
| FICONTEC SERVICE GMBH | DE | 128 | 119 | 119 | 2/2/2 |
| FILIATER | FR | 113 | 91 | 91 | 94/77/77 |
| FINANCE INNOVATION | NO | 90 | 81 | 81 | 6/3/3 |
| Fincantieri | IT | 90 | 16 | 16 | 3/—/— |
| FLASHEYE AB | SE | 87 | 72 | 72 | 44/40/40 |
| FLENDER GMBH | DE | 127 | 101 | 101 | 96/—/— |
| FLOWFOOD | NO | 98 | 90 | 90 | 1/1/1 |
| FLOWPHYS | NO | 97 | 84 | 84 | 41/36/36 |
| FLOX INTELLIGENCE AB | SE | 82 | 73 | 73 | 17/16/16 |
| FLUIDECT GMBH | DE | 136 | 108 | 108 | 32/28/28 |
| FOLKBILDNINGSRÅDET | SE | 81 | 76 | 76 | 3/3/3 |
| FOLKSPEL IDEELL FÖRENING | SE | 81 | 77 | 77 | 27/26/26 |
| FOLLOWHEALTH SL | ES | 126 | 93 | 93 | 7/7/7 |
| FONDAZIONE ICONS | IT | 92 | 58 | 58 | 43/26/26 |
| FÖRENINGEN FÖR BYGGEMENSKAPER | SE | 82 | 80 | 80 | 29/29/29 |
| FÖRENINGEN INSTALLATÖRSFÖRETAGEN | SE | 81 | 76 | 76 | 63/60/60 |
| FÖRENINGEN TEKNIKFÖRETAGEN I SVERIGE | SE | 87 | 77 | 77 | 33/32/32 |
| FORGES D'ALBERT | FR | 120 | 109 | 109 | 30/26/26 |
| FORNYBARAKADEMIET | NO | 99 | 93 | 93 | 1/1/1 |
| FORSKNINGSRÅDET F MILJÖ ARELLA NÄRINGAR & SAMH | SE | 82 | 77 | 77 | 5/5/5 |
| FORTIFIED TECHNOLOGIES | NO | 90 | 81 | 81 | 60/55/55 |
| FORUM - IDÉBURNA ORGANISATIONER MED SOCIAL INRIKTNING | SE | 81 | 75 | 75 | 1/1/1 |
| FRANZ SCHMIDT HAENSCH GMBH CO | DE | 129 | 107 | 107 | 4/4/4 |
| FREEN OÜ | EE | 73 | 66 | 66 | 28/25/25 |
| FRISK MAT | SE | 82 | 77 | 77 | 4/4/4 |
| Frontgrade Gaisler AB | SE | 73 | 63 | 63 | 22/20/20 |
| FSTECHNOLOGY | IT | 93 | 76 | 76 | 13/13/13 |
| FUNDACIO EURECAT | ES | 123 | 65 | 65 | —/—/— |
| FUNDACION ANDALUZA PARA EL DESARROLLO AEROESPACIAL | ES | 126 | 73 | 73 | 105/59/59 |
| FUNDACION I+D AUTOMOCION Y MECATRONICA | ES | 123 | 60 | 60 | 9/7/7 |
| FUNDACION PARA EL DESARROLLO DE LAS NUEVAS TECNOLOGIAS DEL HIDROGENO EN ARAGON | ES | 132 | 72 | 72 | 106/53/53 |
| FUNDACION TECNALIA RESEARCH & INNOVATION | ES | 131 | 66 | 66 | 3/3/3 |
| FUNDACION TEKNIKER | ES | 131 | 72 | 72 | 14/8/8 |
| FUREHO AB | SE | 79 | 65 | 65 | 8/—/— |
| FUTURASUN HOLDING SRL | IT | 90 | 64 | 64 | 74/—/— |
| FUTURE INNOVATIONS | NO | 105 | 93 | 93 | 22/16/16 |
| GAIA ARKITEKTUR AB | SE | 82 | 75 | 75 | 11/11/11 |
| GAS AND HEAT S.P.A. | IT | 101 | 28 | 28 | 15/—/— |
| GESYNTA PHARMA AB | SE | 88 | 73 | 73 | 36/32/32 |
| GI LIFT AB | SE | 81 | 72 | 72 | 57/—/— |
| GKN AEROSPACE SWEDEN AB | SE | 87 | 72 | 72 | 54/—/— |
| GLUCOSET | NO | 98 | 90 | 90 | 33/27/27 |
| GOCERAM AB | SE | 80 | 66 | 66 | 7/—/— |
| GOLIVER THERAPEUTICS | FR | 122 | 99 | 99 | 103/84/84 |
| GÖTEBORGS UNIVERSITET | SE | 81 | 76 | 76 | 57/56/56 |
| GÖTEBORGSREGIONENS KOMMUNALFÖRBUND | SE | 87 | 77 | 77 | 2/2/2 |
| GRAPHENSIC AB | SE | 81 | 71 | 71 | 36/32/32 |
| GRAPHMATECH AB | SE | 87 | 72 | 72 | 53/46/46 |
| GRASP | NO | 98 | 90 | 90 | 11/8/8 |
| GREEN 14 AB | SE | 81 | 72 | 72 | 1/1/1 |
| GREENERWAVE | FR | 120 | 98 | 98 | 17/16/16 |
| GREENIRON H2 AB | SE | 79 | 65 | 65 | 35/31/31 |
| GREENNA MINERAL AB | SE | 81 | 71 | 71 | 22/19/19 |
| GUTFEELING LABS AB | SE | 79 | 65 | 65 | 38/35/35 |
| GVS | IT | 100 | 26 | 26 | 62/—/— |
| HAFENSTROM | NO | 99 | 91 | 91 | 93/85/85 |
| HAGFORS KOMMUN | SE | 79 | 69 | 69 | 8/8/8 |
| HAGNESIA AB | SE | 87 | 75 | 75 | 41/40/40 |
| HAGNESIA MARITIME AB | SE | 79 | 65 | 65 | 48/45/45 |
| HANINGE KOMMUN | SE | 81 | 76 | 76 | 6/6/6 |
| HEIDELBERG MATERIALS CEMENT SVERIGE AB | SE | 79 | 65 | 65 | 20/17/17 |
| Heimann Sensor GmbH | DE | 128 | 107 | 107 | 6/6/6 |
| HELMHOLTZ ZENTRUM FUR UMWELTFORSCHUNG GMBH UFZ | DE | 129 | 110 | 110 | 43/37/37 |
| HELSINGBORGS KOMMUN | SE | 87 | 77 | 77 | 1/1/1 |
| HENNLICH S.R.O. | CZ | 71 | 64 | 64 | 26/26/26 |
| HISPASAT | ES | 133 | 95 | 95 | 7/7/7 |
| HÖGSKOLAN DALARNA | SE | 87 | 77 | 77 | 60/—/— |
| HÖGSKOLAN I BORÅS | SE | 81 | 76 | 76 | 42/39/39 |
| HÖGSKOLAN I GÄVLE | SE | 82 | 77 | 77 | 23/22/22 |
| HÖGSKOLAN I HALMSTAD | SE | 81 | 76 | 76 | 59/58/58 |
| HÖGSKOLAN VÄST | SE | 79 | 69 | 69 | 10/10/10 |
| HOLO INDUSTRIE 4 0 SOFTWARE | DE | 128 | 116 | 116 | 37/29/29 |
| HOPROD | FR | 120 | 109 | 109 | 30/26/26 |
| HQS QUANTUM SIMULATIONS GMBH | DE | 128 | 107 | 107 | 24/17/17 |
| HUBBLO | FR | 120 | 108 | 108 | 107/95/95 |
| HUSHÅLLNINGSSÄLLSKAPET SKÅNE | SE | 82 | 77 | 77 | 4/4/4 |
| HYDROGENIOUS LOHC TECHNOLOGIES GMBH | DE | 135 | 121 | 121 | 94/89/89 |
| HYDROGENPRO | NO | 105 | 91 | 91 | 3/3/3 |
| IDEELLA FÖRENINGEN SKÅNES LIVSMEDELSAKADEMI MED FIRMA SKÅNES LIVSMEDELSAKADEMI | SE | 81 | 76 | 76 | 4/4/4 |
| IDM | FR | 120 | 110 | 110 | 101/91/91 |
| ILICUT | FR | 120 | 109 | 109 | 40/35/35 |
| IMSYSTEMS HOLDING B.V. | NL | 43 | 40 | 40 | 36/34/34 |
| IN2GREAT MATERIALS AB | SE | 73 | 63 | 63 | 2/2/2 |
| INAVENTA SOLAR | NO | 97 | 85 | 85 | 45/37/37 |
| InBiot | ES | 126 | 94 | 94 | 116/—/— |
| INBRAIN NEUROELECTRONICS SL | ES | 133 | 94 | 94 | 1/1/1 |
| INCLUSIVE CREATION | NO | 99 | 91 | 91 | 16/11/11 |
| INDICUM INREDNINGSARKITEKTER AB | SE | 87 | 72 | 72 | 2/2/2 |
| INDRASISTEMASSA | ES | 126 | 94 | 94 | 4/4/4 |
| Infineon | DE | 128 | 126 | 126 | —/—/— |
| INFLUENCE AB | SE | 82 | 72 | 72 | 16/15/15 |
| INFUTURE | NO | 98 | 89 | 89 | 83/76/76 |
| INGENIARS | IT | 92 | 22 | 22 | 7/—/— |
| INGENJÖRSVETENSKAPSAKADEMIEN IVA | SE | 87 | 77 | 77 | 35/34/34 |
| INNOTEC21 | DE | 134 | 128 | 128 | 120/114/114 |
| INNOVATION SKÅNE AB | SE | 81 | 71 | 71 | 65/58/58 |
| INNOVATUM AB | SE | 79 | 68 | 68 | 64/—/— |
| INOCURE S.R.O. | CZ | 78 | 70 | 70 | 42/42/42 |
| INRAE TRANSFERT | FR | 114 | 109 | 109 | 1/1/1 |
| INSERM TRANSFERT | FR | 114 | 107 | 107 | 10/9/9 |
| INSPEK | FR | 116 | 99 | 99 | 15/14/14 |
| INSTITUT DE RECHERCHE POUR LE DEVELOPPEMENT | FR | 115 | 95 | 95 | 25/23/23 |
| INSTITUT GUSTAVE ROUSSY | FR | 114 | 86 | 86 | 28/23/23 |
| INSTITUT NATIONAL DE RECHERCHE POUR L'AGRICULTURE, L'ALIMENTATION ET L'ENVIRONNEMENT | FR | 115 | 86 | 86 | 33/23/23 |
| INSTITUT PASTEUR | FR | 115 | 87 | 87 | 1/1/1 |
| INSTITUT PHOTOVOLTAIQUE D ILE DE FRANCE IPVF | FR | 112 | 90 | 90 | 100/80/80 |
| INTEGRATED DETECTOR ELECTRONICS | NO | 98 | 89 | 89 | 31/27/27 |
| INTERACTIVE FULLY ELECTRICAL VEHICLES SRL | IT | 84 | 14 | 14 | 19/—/— |
| INTERNATIONELLA HANDELSHÖGSKOLAN I JÖNKÖPING AB | SE | 81 | 70 | 70 | 23/20/20 |
| INVENTYA | GB | 25 | 17 | 17 | 3/—/— |
| ION-X SAS | FR | 121 | 92 | 92 | 97/75/75 |
| IOTBRIDGE AB | SE | 81 | 72 | 72 | 18/17/17 |
| IQ SAMHÄLLSBYGGNAD AB | SE | 87 | 72 | 72 | 11/9/9 |
| IRNOVA | SE | 73 | 67 | 67 | 12/12/12 |
| ITEC B.V. | NL | 50 | 46 | 46 | 2/2/2 |
| JANSEN RECYCLING GROUP B V | NL | 56 | 46 | 46 | 31/24/24 |
| JOTUN | NO | 98 | 90 | 90 | 25/—/— |
| KARLSTADS UNIVERSITET | SE | 81 | 76 | 76 | 27/26/26 |
| KARLSTADS UNIVERSITET SAMHÄLLSNYTTA AB | SE | 87 | 72 | 72 | 28/—/— |
| KARLSTADS UNIVERSITETS INNOVATION AB | SE | 79 | 64 | 64 | 1/1/1 |
| KAROLINSKA INSTITUTET | SE | 79 | 68 | 68 | 36/34/34 |
| KATAPULT IMPACT PLATFORM | NO | 97 | 83 | 83 | 26/20/20 |
| KLINIKUM DER UNIVERSITAET ZU KOELN | DE | 128 | 126 | 126 | 2/2/2 |
| KLOSSER INNOVASJON | NO | 98 | 90 | 90 | 84/78/78 |
| KLYV THERAPEUTICS | NO | 106 | 92 | 92 | 6/5/5 |
| KNORR-BREMSE SYSTEME FUR NUTZFAHRZEUGE GMBH | DE | 120 | 103 | 103 | —/—/— |
| KNOWLEDGE DEVELOPMENT FOR POF SL | ES | 125 | 93 | 93 | —/—/— |
| KODETRACER | NO | 98 | 89 | 89 | 16/11/11 |
| KONGSBERG MARITIME | NO | 105 | 91 | 91 | 11/8/8 |
| KOSTFONDEN | SE | 81 | 76 | 76 | 4/4/4 |
| KRISTIANSTADS KOMMUN | SE | 81 | 76 | 76 | 6/6/6 |
| KUNNSKAPSPARKEN HELGELAND | NO | 98 | 92 | 92 | 73/68/68 |
| LA MANUFACTURE ABBEVILLOISE | FR | 120 | 109 | 109 | 94/83/83 |
| LAFARGE GRANULATS | FR | 112 | 101 | 101 | 97/86/86 |
| Latitudo 40 | IT | 93 | 74 | 74 | 85/67/67 |
| LAYERONE | NO | 98 | 90 | 90 | 1/1/1 |
| LCUBED AB | SE | 81 | 72 | 72 | 14/13/13 |
| LE BIO MARAIS | FR | 120 | 109 | 109 | 12/12/12 |
| LEDE | NO | 105 | 93 | 93 | 47/39/39 |
| LINJONWOOD AB | SE | 87 | 72 | 72 | 61/57/57 |
| LINKÖPINGS UNIVERSITET | SE | 88 | 79 | 79 | 36/35/35 |
| LU VENTURES AB | SE | 81 | 71 | 71 | 1/1/1 |
| LUCENTWAVE AB | SE | 83 | 74 | 74 | 34/31/31 |
| LULEA TEKNISKA UNIVERSITET | SE | 87 | 77 | 77 | 36/35/35 |
| LUTECH SPA | IT | 84 | 59 | 59 | 60/—/— |
| LYBE SCIENTIFIC | NO | 98 | 90 | 90 | 29/25/25 |
| MÄLARDALENS HÖGSKOLA | SE | 82 | 77 | 77 | 37/36/36 |
| MALMÖ UNIVERSITET | SE | 81 | 76 | 76 | 34/33/33 |
| MAN TRUCK BUS SE | DE | 135 | 111 | 111 | 7/6/6 |
| MANUFACTURE FRANCAISE DES PNEUMATIQUES MICHELIN | FR | 120 | 98 | 98 | 33/28/28 |
| MARITIME ROBOTICS | NO | 105 | 91 | 91 | 1/1/1 |
| MARTEL INNOVATE BV | NL | 57 | 47 | 47 | 31/29/29 |
| MAX-PLANCK-GESELLSCHAFT ZUR FORDERUNG DER WISSENSCHAFTEN EV | DE | 126 | 119 | 119 | —/—/— |
| MECACHROME FRANCE | FR | 121 | 96 | 96 | 7/6/6 |
| MEDIZINISCHE HOCHSCHULE HANNOVER | DE | 129 | 71 | 71 | 38/23/23 |
| MEDSENSIO | NO | 98 | 90 | 90 | 40/35/35 |
| MER MEC ENGINEERING | IT | 92 | 73 | 73 | 31/27/27 |
| MERCATOR RESEARCH INSTITUTE ON GLOBAL COMMONS AND CLIMATE CHANGE MCC GGMBH | DE | 126 | 120 | 120 | 1/1/1 |
| MEYER WERFT | DE | 126 | 106 | 106 | 6/6/6 |
| MICROTEC GESELLSCHAFT FUR MIKROTECHNOLOGIE MBH | DE | 134 | 120 | 120 | 1/1/1 |
| MINUS SOLUTIONS | NO | 91 | 83 | 83 | 60/54/54 |
| MONTIMAGE EURL | FR | 116 | 102 | 102 | 1/1/1 |
| MYCRONIC AB (PUBL) | SE | 82 | 75 | 75 | 1/1/1 |
| MYREMONO SRL | IT | 90 | 64 | 64 | 8/8/8 |
| NABOLAGSHAGER | NO | 98 | 90 | 90 | 47/41/41 |
| NANOSCRIBE GMBH CO KG | DE | 128 | 108 | 108 | 32/—/— |
| NAVAL GROUP | FR | 115 | 99 | 99 | 97/85/85 |
| NAVTOR | NO | 105 | 91 | 91 | 79/73/73 |
| NC SPECTRUM | NO | 99 | 91 | 91 | 9/8/8 |
| NELLIE TECHNOLOGIES | GB | 25 | 18 | 18 | 16/15/15 |
| NEOS NEW BORN SOLUTIONS SL | ES | 125 | 93 | 93 | 7/7/7 |
| NEXDOT | FR | 120 | 98 | 98 | 7/7/7 |
| NEXTWORKS | IT | 99 | 78 | 78 | 22/22/22 |
| NJØS FRUKT OG BÆRSENTER | NO | 90 | 81 | 81 | 19/14/14 |
| NOBATEK | FR | 112 | 101 | 101 | 94/83/83 |
| NODE PHARMA | NO | 98 | 90 | 90 | 1/1/1 |
| NOMMON SOLUTIONS AND TECHNOLOGIES | ES | 125 | 94 | 94 | 17/17/17 |
| NORDIC BRAIN TECH | NO | 98 | 90 | 90 | 24/20/20 |
| NORTURA | NO | 105 | 91 | 91 | 6/6/6 |
| NORVENTO ENERXIA SL | ES | 123 | 94 | 94 | 14/—/— |
| NORWEGIAN CIRCULAR MATERIAL TECHNOLOGY | NO | 98 | 92 | 92 | 38/33/33 |
| NOVA INNOVATION SOLUTIONS AB | SE | 79 | 68 | 68 | 1/1/1 |
| OHB System AG | DE | 129 | 106 | 106 | 5/4/4 |
| OIVI | NO | 98 | 90 | 90 | 1/1/1 |
| ORKLA FOODS NORGE | NO | 105 | 91 | 91 | 3/3/3 |
| OSPEDALE SAN RAFFAELE SRL | IT | 93 | 70 | 70 | 27/—/— |
| OXFORD PV GERMANY | DE | 134 | 116 | 116 | 85/79/79 |
| PARISOT INDUSTRIE | FR | 120 | 110 | 110 | 20/20/20 |
| PERHA PHARMACEUTICALS SAS | FR | 116 | 89 | 89 | 15/12/12 |
| PETROGAL SA | PT | 37 | 30 | 30 | 37/—/— |
| PHENIX GROUPE | FR | 120 | 108 | 108 | 108/96/96 |
| PHILIPS | DE | 128 | 112 | 112 | 33/29/29 |
| PHILIPS ELECTRONICS NEDERLAND B.V. | NL | 50 | 43 | 43 | —/—/— |
| PILI | FR | 121 | 97 | 97 | 104/85/85 |
| POLARBRÖD AB | SE | 81 | 70 | 70 | 1/1/1 |
| POLISMYNDIGHETEN SWEDISH POLICE AUTHORITY | SE | 87 | 78 | 78 | 1/1/1 |
| POLITECNICO DI BARI | IT | 90 | 66 | 66 | 35/30/30 |
| PPM ROBOTICS | NO | 98 | 91 | 91 | 38/33/33 |
| PREMIER TECH EAU ET ENVIRONNEMENT | FR | 120 | 109 | 109 | 105/94/94 |
| PRIMEBLADE SWEDEN AB | SE | 87 | 75 | 75 | 1/1/1 |
| PRISMATIC SENSORS AB | SE | 73 | 64 | 64 | 3/3/3 |
| PRO LIGNUM | FR | 112 | 90 | 90 | 93/76/76 |
| Pumacy Technologies AG | DE | 128 | 105 | 105 | 46/35/35 |
| QUANTUNE TECHNOLOGIES GMBH | DE | 130 | 120 | 120 | 30/26/26 |
| QUARKSLAB | FR | 116 | 109 | 109 | 97/90/90 |
| QUOBLY | FR | 106 | 98 | 98 | 89/81/81 |
| R2M SOLUTION SRL | IT | 90 | 17 | 17 | 36/—/— |
| RATIER-FIGEAC | FR | 121 | 108 | 108 | 13/12/12 |
| RECYC ELIT | FR | 122 | 111 | 111 | 109/98/98 |
| RESITEC | NO | 98 | 91 | 91 | 68/63/63 |
| REVERION GMBH | DE | 135 | 112 | 112 | 8/8/8 |
| RIJKSUNIVERSITEIT GRONINGEN | NL | 56 | 42 | 42 | 1/1/1 |
| RISE IVF AB | SE | 79 | 68 | 68 | 1/1/1 |
| RISE RESEARCH INSTITUTES OF SWEDEN AB | SE | 87 | 72 | 72 | 24/21/21 |
| RIVER BIOMEDICS B.V. | NL | 51 | 48 | 48 | 13/13/13 |
| ROOFSCAPES STUDIO | FR | 120 | 109 | 109 | 102/91/91 |
| ROSEAU TECHNOLOGIES | FR | 112 | 100 | 100 | 102/90/90 |
| SAFETEC NORDIC | NO | 106 | 94 | 94 | 35/27/27 |
| SAFRAN ELECTRONICS & DEFENSE | FR | 120 | 108 | 108 | —/—/— |
| SALT LOFOTEN | NO | 105 | 91 | 91 | 68/62/62 |
| SARL LES VIGNES | FR | 114 | 101 | 101 | 97/85/85 |
| SASMINIMUM | FR | 112 | 92 | 92 | 17/16/16 |
| SCANDINAVIAN REAL HEART AB | SE | 90 | 74 | 74 | 18/17/17 |
| SCANIA CV | SE | 81 | 71 | 71 | 15/13/13 |
| Scienion GmbH | DE | 120 | 111 | 111 | 2/2/2 |
| SENSOCURE | NO | 90 | 82 | 82 | 43/38/38 |
| SERMA Technologies | FR | 106 | 89 | 89 | 1/—/— |
| SERVIZO GALEGO DE SAUDE | ES | 126 | 94 | 94 | 2/2/2 |
| SHIFT MATERIALS | NO | 97 | 85 | 85 | 72/64/64 |
| SITAEL | IT | 90 | 67 | 67 | 3/3/3 |
| SKIS ROSSIGNOL - CLUB ROSSIGNOL | FR | 115 | 98 | 98 | 97/85/85 |
| SOCIETE EUROPEENNE DE CARDIOLOGIE | FR | 114 | 107 | 107 | 83/78/78 |
| SOGEI SOCIETA GENERALE D INFORMATICA | IT | 90 | 69 | 69 | —/—/— |
| SOLARGE INTERNATIONAL | NL | 56 | 44 | 44 | 24/23/23 |
| SOPAC MEDICAL | FR | 120 | 108 | 108 | 20/18/18 |
| SPHERICAL SYSTEMS BV | NL | 42 | 34 | 34 | —/—/— |
| STICHTING DELTARES | NL | 56 | 48 | 48 | 34/30/30 |
| STICHTING HOGESCHOOL ROTTERDAM | NL | 50 | 45 | 45 | 27/25/25 |
| STICHTING HOGESCHOOL VAN AMSTERDAM | NL | 56 | 47 | 47 | 33/32/32 |
| STICHTING KONINKLIJK NEDERLANDS LUCHT - EN RUIMTEVAARTCENTRUM | NL | 49 | 37 | 37 | —/—/— |
| STMICROELECTRONICS FRANCE | FR | 114 | 96 | 96 | 6/—/— |
| SUPRACON | DE | 126 | 105 | 105 | 10/10/10 |
| SURFUNCTION | DE | 135 | 115 | 115 | 41/34/34 |
| SWERIM | SE | 87 | 78 | 78 | 8/6/6 |
| Symphera GmbH | DE | 129 | 110 | 110 | 34/25/25 |
| SYNOVANCE | FR | 121 | 100 | 100 | 102/85/85 |
| SYNPO, AKCIOVÁ SPOLEČNOST | CZ | 78 | 70 | 70 | 42/41/41 |
| TAGWORKS PHARMACEUTICALS BV | NL | 51 | 47 | 47 | 20/20/20 |
| TALGA GROUP LTD | SE | 79 | 67 | 67 | 7/—/— |
| TAMPIERI FINANCIAL GROUP SPA | IT | 92 | 70 | 70 | —/—/— |
| TECHFEM | IT | 98 | 75 | 75 | 13/12/12 |
| TECHNISCHE HOCHSCHULE KOLN | DE | 129 | 77 | 77 | 38/16/16 |
| TECHNISCHE UNIVERSITAET DRESDEN | DE | 126 | 119 | 119 | —/—/— |
| TECHNISCHE UNIVERSITEIT DELFT | NL | 51 | 44 | 44 | 13/11/11 |
| TEEM PHOTONICS | FR | 121 | 109 | 109 | 119/107/107 |
| TELECOM ITALIA SPA O TIM | IT | 95 | 24 | 24 | 23/8/8 |
| TELEFONICA INNOVACION DIGITAL SL | ES | 126 | 93 | 93 | 1/1/1 |
| TERMIZO A.S. | CZ | 70 | 63 | 63 | 40/39/39 |
| TERRITOIRE D'ENERGIE SOMME | FR | 120 | 109 | 109 | 12/12/12 |
| TGS PREDIKTOR | NO | 97 | 83 | 83 | 31/25/25 |
| THINKQUANTUM SRL | IT | 98 | 70 | 70 | 28/20/20 |
| TINEXTA INNOVATION HUB S.P.A. | IT | 100 | 79 | 79 | 32/27/27 |
| TIOTECH | NO | 97 | 83 | 83 | 1/1/1 |
| TIPEE | FR | 120 | 109 | 109 | 106/95/95 |
| TOUL ENERGIE | FR | 120 | 100 | 100 | 12/9/9 |
| ÚJV ŘEŽ, A. S. | CZ | 78 | 71 | 71 | 47/46/46 |
| UNIVERSIDAD DE ALICANTE | ES | 131 | 67 | 67 | 1/1/1 |
| UNIVERSIDAD DE BURGOS | ES | 125 | 72 | 72 | 98/52/52 |
| UNIVERSITA CAMPUS BIO MEDICO DI ROMA | IT | 93 | 22 | 22 | 66/9/9 |
| UNIVERSITA COMMERCIALE LUIGI BOCCONI | IT | 98 | 69 | 69 | 14/9/9 |
| UNIVERSITA DEGLI STUDI DEL SANNIO | IT | 92 | 62 | 62 | 88/—/— |
| UNIVERSITA DEGLI STUDI DI NAPOLI PARTHENOPE | IT | 98 | 69 | 69 | 29/19/19 |
| UNIVERSITA DEGLI STUDI DI PERUGIA | IT | 92 | 62 | 62 | 3/3/3 |
| UNIVERSITA DELLA CALABRIA | IT | 90 | 56 | 56 | 31/24/24 |
| UNIVERSITA POLITECNICA DELLE MARCHE | IT | 99 | 22 | 22 | 11/4/4 |
| UNIVERSITA' DEGLI STUDI DI MILANO-BICOCCA | IT | 92 | 21 | 21 | 29/—/— |
| UNIVERSITAIR MEDISCH CENTRUM UTRECHT | NL | 42 | 36 | 36 | 1/1/1 |
| UNIVERSITAT POLITECNICA DE CATALUNYA | ES | 125 | 78 | 78 | 23/18/18 |
| UNIVERSITATSMEDIZIN GREIFSWALD KORPERSCHAFT DES OFFENTLICHEN RECHTS | DE | 134 | 127 | 127 | 6/6/6 |
| UNIVERSITE DE BORDEAUX | FR | 114 | 87 | 87 | 32/26/26 |
| UNIVERSITE DE STRASBOURG | FR | 120 | 95 | 95 | 29/25/25 |
| UNIVERSITEIT TWENTE | NL | 56 | 47 | 47 | 15/14/14 |
| VALEO EAUTOMOTIVE GERMANY | DE | 126 | 109 | 109 | 3/3/3 |
| VALEO SCHALTER UND SENSOREN | DE | 128 | 114 | 114 | 44/40/40 |
| VEGEA | IT | 100 | 79 | 79 | 2/2/2 |
| VERKOR | FR | 121 | 110 | 110 | 100/—/— |
| VIVALYX GMBH | DE | 120 | 112 | 112 | 115/108/108 |
| VOLVO TECHNOLOGY | SE | 82 | 77 | 77 | 25/24/24 |
| VSORA | FR | 116 | 98 | 98 | 14/11/11 |
| VÚTS, A.S. | CZ | 70 | 63 | 63 | 40/40/40 |
| VÝZKUMNÝ ÚSTAV STAVEBNÍCH HMOT,A.S. | CZ | 70 | 56 | 56 | 20/16/16 |
| WALTER TOSTO | IT | 99 | 88 | 88 | 32/30/30 |
| Water Horizon | FR | 112 | 89 | 89 | 16/13/13 |
| WATERJADE | IT | 99 | 79 | 79 | 32/24/24 |
| WISE SRL | IT | 85 | 15 | 15 | 3/—/— |
| X FAB DRESDEN | DE | 128 | 114 | 114 | 9/8/8 |
| ZF FRIEDRICHSHAFEN | DE | 127 | 109 | 109 | 62/57/57 |
| ZURICH INSTRUMENTS GERMANY | DE | 128 | 125 | 125 | 1/1/1 |
