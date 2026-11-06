recall set: __recallSetDescribed.json  7,095 pairs, 661 instruments nameable, 1,898 leak-free descriptions  [wsHA gate separation]
  descriptions: 1,898 (27%) with one, median 125 chars; 887 (13%) recovered from another regime; 5,197 (73%) STILL BLANK — those founders query with one of eleven canned sector sentences
# wsHA — do the encoded gates separate the two doors

```
draw fingerprint    13cb71cf3a1d1847
corpus              postgres instruments=1088
pairs               287
```

## 1. The encoded verdict on each door, for this founder

```
pairs evaluated                                  287
verdict STATUS identical on both doors           274  95.5%
  ...both "unknown" — no filter could be run     0  0.0%
  ...both "open"                                 263  91.6%
verdict STATUS differs                           13  4.5%
number of filters CHECKED differs                167  58.2%
number of BLOCKERS differs                       11  3.8%
```

| verdict pair (WON / SHOWN) | pairs | share |
|---|--:|--:|
| open / open | 263 | 91.6% |
| one_blocker / one_blocker | 11 | 3.8% |
| one_blocker / open | 9 | 3.1% |
| unknown / open | 2 | 0.7% |
| open / one_blocker | 1 | 0.3% |
| one_blocker / unknown | 1 | 0.3% |

## 2. The registered purpose — the corpus alone, no founder in it

```
both doors declare a purpose                     96  33.4%
  ...their GBER ARTICLES differ                  88  30.7%
  ...their USE OF FUNDS differ                   86  30.0%
      (the coarse half, the one the intake asks)
exactly one door declares a purpose              15  5.2%
neither door declares one                        176  61.3%
```

## 3. Does the shipped sibling reassignment have an opinion

| scorer | has an opinion | favours the WON door | favours the SHOWN door |
|---|--:|--:|--:|
| `objective` | 7.3% | 4.5% | 2.8% |
| `award` | 38.7% | 5.6% | 33.1% |
| `region` | 0.0% | 0.0% | 0.0% |
| `gateFit` | 5.6% | 2.4% | 3.1% |
| **COMBINED (the product's `pref`)** | 48.1% | 12.2% | 35.9% |

## 4. Pairs where our OWN preference already picked the won door

```
pool rank of the won door on these 35 pairs:  min 7  p25 14  MEDIAN 27  p75 72  max 94
  ...at rank 7 or better (the preference reached the order, something after it removed the row)   0
  ...outside the 40-row pool cut (the preference never reached the order)                     11

A.M.L. MICROTECHNIQUE LORRAINE (FR) · pref won=1.8225 shown=1.0000 · won door at pool rank 8/109 · satr_fr_rnd__sa_40391__ministere_de_l_economie_et_des_finances OVER satr_fr_rnd__sa_40453__ministere_de_l_economie_et_des_finances
A.V. SIMULATION (FR) · pref won=1.3500 shown=1.2330 · won door at pool rank 9/112 · satr_fr_rnd__sa_40391__ministere_de_l_economie_et_des_finances OVER satr_fr_rnd__sa_111938__cnc
ACOME (FR) · pref won=1.8225 shown=1.0000 · won door at pool rank 9/118 · satr_fr_rnd__sa_40391__ministere_de_l_economie_et_des_finances OVER satr_fr_rnd__sa_40453__ministere_de_l_economie_et_des_finances
ADHEX TECHNOLOGIES (FR) · pref won=1.8225 shown=1.0000 · won door at pool rank 27/109 · satr_fr_rnd__sa_40391__ministere_de_l_economie_et_des_finances OVER satr_fr_rnd__sa_40405__ministere_de_la_transition_ecologique_et_solidai
ADVANCED WIRELESS SOLUTIONS AND SERVICES (FR) · pref won=1.8225 shown=1.0000 · won door at pool rank 9/111 · satr_fr_rnd__sa_40391__ministere_de_l_economie_et_des_finances OVER satr_fr_rnd__sa_40453__ministere_de_l_economie_et_des_finances
AFIYET AB (SE) · pref won=1.3500 shown=0.7549 · won door at pool rank 20/76 · vinnova_grant__accelerationsprogram_for_deeptech_foretag_b345cd OVER vinnova_grant__sip_medtech4health_d1e079
AIOPT AB (SE) · pref won=1.3500 shown=0.7302 · won door at pool rank 32/84 · vinnova_grant__6g_615e28 OVER vinnova_grant__inkubatorprogrammet_cc56dc
ALGORYX SIMULATION (SE) · pref won=1.8225 shown=1.0000 · won door at pool rank 55/78 · satr_se_rnd__sa_119375__rymdstyrelsen OVER satr_se_rnd__sa_112283__tillvaxtverket
ARISTON (IT) · pref won=1.8225 shown=1.0000 · won door at pool rank 27/87 · satr_it_rnd__sa_120576__ministero_della_transizione_ecologica_direzione_ OVER satr_it_rnd__sa_47037__ministero_dell_istruzione_dell_universita_e_dell
ASGARD THERAPEUTICS AB (SE) · pref won=1.3500 shown=0.7549 · won door at pool rank 7/77 · vinnova_grant__ep_eureka_eurostars_362d22 OVER vinnova_grant__sip_medtech4health_d1e079
ASM TERNI (IT) · pref won=1.8225 shown=1.0000 · won door at pool rank 72/81 · satr_it_rnd__sa_120577__ministero_della_transizione_ecologica_direzione_ OVER satr_it_rnd__sa_53347__gse_gestore_servizi_energetici_s_p_a
Aubert & Duval (FR) · pref won=1.8225 shown=1.0000 · won door at pool rank 22/107 · satr_fr_rnd__sa_112158__ministere_de_la_transition_ecologique_et_solidai OVER satr_fr_rnd__sa_40405__ministere_de_la_transition_ecologique_et_solidai
BAIKOWSKI (FR) · pref won=1.8225 shown=1.0000 · won door at pool rank 92/109 · satr_fr_rnd__sa_111723__ministere_de_la_transition_ecologique_et_solidai OVER satr_fr_rnd__sa_40405__ministere_de_la_transition_ecologique_et_solidai
BIOMEDICAL BONDING AB (SE) · pref won=1.3500 shown=0.7549 · won door at pool rank 7/77 · vinnova_grant__ep_eureka_eurostars_362d22 OVER vinnova_grant__sip_medtech4health_d1e079
BIOMOTIF AB (SE) · pref won=1.3500 shown=0.7549 · won door at pool rank 7/74 · vinnova_grant__ep_eureka_eurostars_362d22 OVER vinnova_grant__sip_medtech4health_d1e079
BMOTION TECHNOLOGIES (FR) · pref won=1.3500 shown=1.2330 · won door at pool rank 79/94 · satr_fr_rnd__sa_111723__ministere_de_l_economie_et_des_finances OVER satr_fr_rnd__sa_111938__cnc
BOARD ARCHITECT DESIGN AB (SE) · pref won=1.1512 shown=0.9818 · won door at pool rank 13/67 · vinnova_grant__innovationsprogrammet_for_civil_militara_synergi_42185d OVER vinnova_grant__sip_grafen_5f4b32
CAPIO S:T GÖRANS SJUKHUS AB (SE) · pref won=1.1512 shown=0.7549 · won door at pool rank 29/76 · vinnova_grant__innovationsprogrammet_for_civil_militara_synergi_42185d OVER vinnova_grant__sip_medtech4health_d1e079
DAZETECHNOLOGY S.R.L. (IT) · pref won=1.8225 shown=1.0000 · won door at pool rank 72/80 · satr_it_rnd__sa_120577__ministero_della_transizione_ecologica_direzione_ OVER satr_it_rnd__sa_110595__ministero_dell_universita_e_della_ricerca_direzi
DIANOVATOR AB (SE) · pref won=1.0985 shown=0.7549 · won door at pool rank 27/77 · vinnova_grant__digital_omstallning_b3bb76 OVER vinnova_grant__sip_medtech4health_d1e079
DUMAREY AUTOMOTIVE ITALIA (IT) · pref won=1.8225 shown=1.0000 · won door at pool rank 26/78 · satr_it_rnd__sa_115378__finpiemonte_s_p_a OVER satr_it_rnd__sa_110595__ministero_dell_universita_e_della_ricerca_direzi
EMICKERS AB (SE) · pref won=1.3500 shown=0.7302 · won door at pool rank 33/83 · vinnova_grant__6g_615e28 OVER vinnova_grant__inkubatorprogrammet_cc56dc
EMPLICURE AB (PUBL) (SE) · pref won=1.1440 shown=0.7549 · won door at pool rank 23/78 · vinnova_grant__kompetenscentrumprogrammet_07f833 OVER vinnova_grant__sip_medtech4health_d1e079
FLASHEYE AB (SE) · pref won=1.3500 shown=0.9818 · won door at pool rank 43/81 · vinnova_grant__impact_innovation_gemensam_798995 OVER vinnova_grant__sip_grafen_5f4b32
GAS AND HEAT S.P.A. (IT) · pref won=1.8225 shown=1.0000 · won door at pool rank 15/89 · satr_it_rnd__sa_119109__ministero_della_transizione_ecologica_direzione_ OVER satr_it_rnd__sa_53347__gse_gestore_servizi_energetici_s_p_a
```

