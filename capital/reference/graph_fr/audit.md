# France knowledge-map coverage audit (19 Nov 2026)

Held against: the PLF 2026 projets annuels de performances (PAP) of the missions that fund business, innovation, industry, energy transition, research and export (assemblee-nationale.fr copies of the budget annexes, read in full text), the Jaune "L'Etat actionnaire" (PLF 2025 annex), and the official pages cited per row. Map = `mandate/brains/wincent/knowledge_map.yaml` FR block (Bercy, MESR, SGPI, Bpifrance and its 8 divisions, Business France, ACPR, Parliament committees, 12 regional agencies, 17 products) and `capital/reference/graph_fr/{structure,offers}.yaml`. Amounts are PLF 2026 autorisations d'engagement (AE) in EUR as printed; the PDF table extraction is jumbled for some rows, so each figure is marked with the programme line it came from. Nothing in the map was edited; the paste-ready additions are the last block.

Not reachable from this machine (Cloudflare or maintenance, so nothing from them is quoted): legifrance.gouv.fr, economie.gouv.fr (APE, DGE pages), gouvernement.fr, info.gouv.fr (SGPI page), ademe.fr, caissedesdepots.fr site pages (maintenance). Budget annexe URLs: `https://www.assemblee-nationale.fr/dyn/contenu/visualisation/<id>/file/PAP2026_BG_<mission>.pdf`; budget.gouv.fr itself returned an empty page.

## 1. Budget owners (loi de finances missions)

| Mission / programme | PLF 2026 evidence | Official proof | In map? |
|---|---|---|---|
| Économie, P134 Développement des entreprises et régulations (DGE; Business France subsidy; Bpifrance Assurance Export; industrial decarbonisation tender run by ADEME) | AE 2,517,987,374 (LFI 2025: 3,855,871,041) | https://www.assemblee-nationale.fr/dyn/dyn/contenu/visualisation/1087972/file/PAP2026_BG_Economie_DB.pdf | yes (fr.mefsin, fr.dge) |
| Investir pour la France de 2030, P424 Financement des investissements stratégiques (AE 3,957,472,275 LFI 2025 to 3,753,875,009 PLF 2026; operators ADEME, ANR, Bpifrance, CDC), P425 Financement structurel des écosystèmes d'innovation (AE 1,374,439,597 PLF 2026 on the line read), P423 modernisation (AE 136,660,000), P422, P421 | mission total 5,497,829,332 (2026) | https://www.assemblee-nationale.fr/dyn/contenu/visualisation/1087987/file/PAP2026_BG_Investir_France_2030_AV.pdf | yes (fr.sgpi); the programme split is not a node |
| Recherche et enseignement supérieur, P172 (action 02 ANR AE 1,332,050,000), P192 Recherche et enseignement supérieur en matière économique et industrielle (AE 538,162,635), P193 / P190 | | https://www.assemblee-nationale.fr/dyn/dyn/contenu/visualisation/1088017/file/PAP2026_BG_Recherche_enseignement_superieur_RA.pdf | yes (fr.mesr, fr.dgri) |
| Écologie, développement et mobilité durables, P181 (action 12 ADEME AE 2,094,078,285 vs 888,360,313 in 2025), P174 Énergie, climat et après-mines, P345 Service public de l'énergie, P203 transport (not company finance) | | https://www.assemblee-nationale.fr/dyn/contenu/visualisation/1087969/file/x.pdf (PAP 2026 Écologie) | MISSING: no ministry node for ecology and energy (propose fr.mtes) |
| Engagements financiers de l'État, P114 Appels en garantie de l'État (export credit insurance, PGE, guarantees to company finance) | AE 985,272,597 (2025) vs 790,362,961 (2026) | https://www.assemblee-nationale.fr/dyn/contenu/visualisation/1087975/file/PAP2026_BG_Engagements_financiers_Etat_EB.pdf | MISSING as a node (propose fr.p114) |
| CAS Participations financières de l'État (APE capital operations) | | https://www.assemblee-nationale.fr/dyn/contenu/visualisation/1088068/file/PAP2026_CS_CAS_Participations_financieres_Etat_YC.pdf | MISSING (APE, see below); figures not read |
| Agriculture, alimentation, forêt et affaires rurales (FranceAgriMer, agri-investment aid) | not read | https://www.assemblee-nationale.fr/dyn/contenu/visualisation/1087945/file/PAP2026_BG_Agriculture_alimentation_foret_affaires_rurales_AC.pdf | MISSING, low priority; read before loading |
| Cohésion des territoires (ANCT, Territoires d'industrie) | not read | https://www.assemblee-nationale.fr/dyn/dyn/contenu/visualisation/1087954/file/PAP2026_BG_Cohesion_territoires_VA.pdf | MISSING, low; read before loading |
| Action extérieure de l'État (MEAE, co-supervises Business France) | not read; Business France page names the Foreign Affairs minister as joint supervisor | https://www.businessfrance.fr/qui-sommes-nous | MISSING (propose fr.meae), low |

Judgement: the money-carrying owners (DGE, SGPI, MESR) are in the map; the real hole is the ecology and energy ministry, which carries ADEME (AE 2.09bn in 2026, the largest single operator line outside Bpifrance), and the Treasury's guarantee line P114.

## 2. Operational arms

| Arm | Kind | In map? | Proof URL |
|---|---|---|---|
| ADEME (Agence de la transition écologique) | operator of programme 181; one of the four historic PIA / France 2030 operators; runs the AO GPID decarbonisation tender for the State; subsidies and repayable advances | MISSING | PAP Écologie above (action 12); org chart URL not reachable (ademe.fr is bot-blocked) |
| ADEME Investissement | private-law company held by the State, chaired by ADEME, takes equity | MISSING | PAP Écologie above |
| ANR (Agence nationale de la recherche) | EPA under the research ministry; PIA / France 2030 operator; funds PRCE, LabCom, chaires industrielles | MISSING | https://anr.fr/fr/lanr/ |
| Caisse des Dépôts and Banque des Territoires | public group, 49.18% co-owner of Bpifrance (with the State), PIA operator, Fonds d'épargne lender | MISSING | https://www.caissedesdepots.fr/sites/cdc.fr/files/2026-06/Rapport_activite_CS_2025_0.pdf |
| CDC Commission de surveillance | supervisory body (MPs, qualified persons, Treasury and staff representatives) | MISSING | same PDF |
| APE (Agence des participations de l'État) | State shareholder agency, sits on the Bpifrance board | MISSING | https://www.bpifrance.fr/nous-decouvrir/conseil-administration |
| Bpifrance Assurance Export and Bpifrance Participations / Investissement (legal entities) | Bpifrance subsidiaries; the map holds the divisions only | partial (fr.bpi.international) | https://www.bpifrance.fr/nous-decouvrir/gouvernance |
| Team France Export (Business France with Régions, State services, CCI, Bpifrance) | export partnership | MISSING (fr.bf.vie covers VIE only) | P134 PAP, indicator 2.1 |
| INPI, Atout France, ANFR | operators of programme 134 (IP, tourism, spectrum); not funders of companies | MISSING, low | PAP Économie |
| Research operators: CEA, BRGM, IFPEN, CNES, CNRS-type bodies, SATT (technology transfer, FNV post-maturation fund) | operators in programmes 172 / 190 / 192 / 422 | MISSING, low | PAP Recherche and PAP France 2030 above |
| Regional agencies, 12 held | | yes | structure.yaml; Hauts-de-France, Île-de-France etc. already there |

Not verified, therefore not proposed: ANCT, FranceAgriMer, Banque des Territoires as its own node, Coface (not found in any PAP read; Bpifrance Assurance Export took over the State export-insurance role from Natixis on 1 Jan 2023 per the P134 PAP), Business France regional offices.

## 3. Funding vehicles (about EUR 100M a year, a company can apply)

| Vehicle | Size evidence | In map? | Proof |
|---|---|---|---|
| France 2030 calls (AAP / AMI) | P424 AE 3.75bn PLF 2026 | yes (fr.f2030.calls) | PAP France 2030 |
| ADEME industrial decarbonisation (AO GPID, DecarbInd, BCIAT, DecarbFlash) | P134 and France 2030; ADEME action 12 AE 2.09bn | MISSING | PAP Économie and PAP Écologie |
| Bpifrance modernisation calls (AAP Modernisation Aéronautique, Automobile; Plan Hydrogène PIIEC, Bpifrance CP need 157.3M in 2026) | CP 27.7M and 58.3M (aero, auto) and 157.3M (hydrogen) in 2026 | MISSING | PAP Écologie (P174 action 03 text) |
| ADEME subsidies and repayable advances (Fonds chaleur, Fonds vert participation) | within action 12 | MISSING | PAP Écologie |
| Fonds national post-maturation "Frontier venture" and P425 bottom-up innovation aid (subventions et prêts AE 647,267,400; fonds propres AE 85,000,000) | P425 lines read | MISSING | PAP France 2030 |
| State export guarantees via Bpifrance Assurance Export (assurance prospection, assurance-crédit, garantie du risque exportateur) | P114 appels en garantie AE 790M | yes (fr.bpi.assurance_prospection, credit_export) | P134 and P114 PAPs |
| Bpifrance Fonds Défense | authorised by the CDC Commission de surveillance in 2025 | MISSING | CDC Commission de surveillance report |
| CIR / CII, JEI, regional aid | | yes | |
| Prêts garantis par l'État (PGE) run by Bpifrance | P114 indicator 5 | not proposed (crisis scheme) | P114 PAP |

## 4. Network, summary

`links.yaml` holds 28 cited ties: Bpifrance ownership (State 49.18%, CDC) and its board (State, DG Trésor, APE, CDC, Régions, Treasury censor), the CDC Supervisory Commission (appointed by the Assemblée and the Sénat, the Treasury seat), Business France and ANR supervision and funding, ADEME supervision, mandates and the four PIA operators that France 2030 delegates to. Not found in fetched text: the regional agencies' governance (Région as owner), Business France's board, SGPI attachment to the Prime Minister (info.gouv.fr blocked), ACPR links, the ministerial supervision of Bpifrance by DGE.

## 5. Proposed additions (paste into the FR block)

```yaml
institutions:
  - {key: fr.mtes, name: Ministry of Ecological Transition and Energy (écologie, énergie), kind: ministry, parent: fr.etat, level: national}
  - {key: fr.meae, name: Ministry for Europe and Foreign Affairs (co-supervises Business France), kind: ministry, parent: fr.etat, level: national}
  - {key: fr.ape, name: State Shareholding Agency (Agence des participations de l'Etat, APE), kind: division, parent: fr.mefsin, level: national}
  - {key: fr.cdc, name: Caisse des Dépôts et Consignations (CDC) and Banque des Territoires, kind: institution, parent: fr.etat, level: national}
  - {key: fr.cdc.cs, name: CDC Supervisory Commission (Commission de surveillance), kind: committee, parent: fr.cdc, level: national}
  - {key: fr.ademe, name: ADEME (Agence de la transition écologique), kind: institution, parent: fr.mtes, level: national}
  - {key: fr.ademe.invest, name: ADEME Investissement (equity arm of ADEME), kind: institution, parent: fr.ademe, level: national}
  - {key: fr.anr, name: National Research Agency (ANR), kind: institution, parent: fr.mesr, level: national}
  - {key: fr.bpi.export, name: Bpifrance Assurance Export (State export insurance and guarantees), kind: institution, parent: fr.bpi, level: national}
  - {key: fr.p114, name: Programme 114 Appels en garantie de l'Etat (guarantee call line), kind: programme, parent: fr.mefsin, level: national}
products:
  - {key: fr.ademe.decarb, name: ADEME industrial decarbonisation tenders (AO GPID, DecarbInd, BCIAT, DecarbFlash), offered_by: fr.ademe, type: grant}
  - {key: fr.ademe.aides, name: ADEME grants and repayable advances (Fonds chaleur, circular economy), offered_by: fr.ademe, type: grant}
  - {key: fr.bpi.modernisation, name: Bpifrance modernisation calls for aeronautics and automotive (AAP Modernisation), offered_by: fr.bpi, type: grant}
  - {key: fr.f2030.frontier, name: France 2030 post-maturation fund Frontier venture and bottom-up innovation aid (P425), offered_by: fr.sgpi, type: grant}
  - {key: fr.bpi.defense, name: Bpifrance Fonds Defense (equity), offered_by: fr.bpi.invest, type: equity}
processes:
  - {key: fr.p.ademe_decarb, title: An ADEME industrial decarbonisation tender application, for: fr.ademe.decarb}
  - {key: fr.p.bpi_modernisation, title: A Bpifrance AAP Modernisation application (aeronautics or automotive), for: fr.bpi.modernisation}
org_charts:
  - {key: fr.bpi, url: 'https://www.bpifrance.fr/nous-decouvrir/conseil-administration', cadence: monthly}  # verified 200: board of directors with names
  - {key: fr.bpi.gov, url: 'https://www.bpifrance.fr/nous-decouvrir/gouvernance', cadence: monthly}  # verified 200: executive committee
  - {key: fr.anr, url: 'https://anr.fr/fr/lanr/', cadence: monthly}  # verified 200: missions page, status and supervision
  - {key: fr.businessfrance, url: 'https://www.businessfrance.fr/qui-sommes-nous', cadence: monthly}  # verified 200: status, financing
  - {key: fr.cdc.cs, url: 'https://www.caissedesdepots.fr/sites/cdc.fr/files/2026-06/Rapport_activite_CS_2025_0.pdf', cadence: monthly}  # verified 200 PDF: members by seat
  - {key: fr.ademe, url: '', cadence: monthly}  # still to find (ademe.fr blocks automated fetch)
  - {key: fr.ape, url: '', cadence: monthly}  # still to find (economie.gouv.fr blocks automated fetch)
  - {key: fr.mtes, url: '', cadence: monthly}  # still to find (ecologie.gouv.fr organigramme)
```
