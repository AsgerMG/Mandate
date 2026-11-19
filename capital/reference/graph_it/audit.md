# Italy knowledge-map coverage audit (19 Nov 2026)

Held against: the 2026 State budget (Legge 30 dicembre 2025, n. 199) as read in the MIMIT budget table, the Camera "Assestamento 2026" dossier (AP0229), the Camera "bilancio del MAECI" theme page, the Camera dossier on public holdings (CP0725S, CP1025S: shareholders, boards, activity per company), MIMIT's incentives list, and the official pages cited per row. Map = `mandate/brains/wincent/knowledge_map.yaml` IT block (MIMIT and two DGs, MEF, MUR, CDP and management, MCC, Invitalia and board, SIMEST, SACE, Banca d'Italia, confidi, Parliament committees, 11 regional finance companies, 13 products) and `capital/reference/graph_it/{structure,offers}.yaml`. Amounts are 2026 stanziamenti di competenza as printed. Nothing in the map was edited; the paste-ready additions are the last block.

Not reachable from this machine (bot challenge, so nothing from them is quoted): cdp.it (Radware captcha), sace.it and its governance page (Cloudflare), esteri.it (captcha since the second request; the text used was read on the first request), bilancio.mef.gov.it, MIMIT's "il-ministero" pages (404).

## 1. Budget owners (ministries in the State budget)

| Ministry | 2026 evidence | Official proof | In map? |
|---|---|---|---|
| MIMIT | competenza 2026 EUR 9,383,734,179; Missione 11 "Competitività e sviluppo delle imprese" EUR 8,879,346,553 (down 38.06% on 2025); Dipartimento per le politiche per le imprese about EUR 5.52bn. In the 2025 assestamento: programme 11.7 Incentivazione del sistema produttivo EUR 7,342.2M, 11.13 Politiche industriali EUR 4,235.2M | https://www.mimit.gov.it/images/stories/trasparenza/2026/TABELLE_BILANCIO_2026.pdf ; https://documenti.camera.it/leg19/dossier/Pdf/AP0229.pdf | yes (it.mimit, DGIAI, DG industrial policy) |
| MEF | owns CDP (82.77%), SACE and Invitalia (100%) per the Camera holdings dossier; guarantees; Transizione 5.0 credits are budgeted on MIMIT cap. 7497 | https://documenti.camera.it/leg19/dossier/testi/CP1025S.htm | yes (it.mef) |
| MUR (research, PRIN, FIS, PNRR research) | not read | https://www.mur.gov.it/it/ministero/organizzazione/articolazione-degli-uffici-mur | yes (it.mur) |
| MAECI (Farnesina) | spese finali EUR 3,833.9M 2026 (3,381.1M 2025); programme 16.5 Sostegno all'internazionalizzazione delle imprese e promozione del made in Italy EUR 647.1M (524.3M LB 2026 before the Section II change); direction and supervision of ICE; titolare of the Fondo 394 run by SIMEST | https://temi.camera.it/leg19/temi/il-bilancio-del-maeci.html | MISSING (it.maeci) |
| MASE (Ambiente e sicurezza energetica: energy transition, hydrogen, GSE oversight) | not read; stanziamenti not retrieved | https://www.mase.gov.it/ (not fetched) | MISSING, to read before loading |
| MASAF (Agricoltura, sovranità alimentare e foreste), Ministero del Lavoro, MIT | not read | | MISSING, low until read |

Judgement: the money carrier (MIMIT) and its owner (MEF) are held. The structural hole is MAECI, which owns the export side (ICE, Fondo 394 at SIMEST, co-chair of the Cabina di regia with MIMIT) and is not a node. MASE carries the energy-transition lines (not measured here).

## 2. Operational arms

| Arm | Kind | In map? | Proof URL |
|---|---|---|---|
| CDP, SIMEST, SACE, Invitalia, Mediocredito Centrale, Banca d'Italia, confidi, 11 regional finance companies | | yes | structure.yaml |
| ICE-Agenzia (Italian Trade Agency): promotion abroad, supervised by MAECI | federal agency | MISSING | https://www.ice.it/it/chi-siamo |
| CDP Equity and CDP Venture Capital SGR (CDP second-level companies named in the dossier; the map has the CDP VC product only) | CDP subsidiaries | MISSING as nodes | https://documenti.camera.it/leg19/dossier/testi/CP1025S.htm |
| Fondazioni bancarie (15.93% of CDP) | shareholders | MISSING | same dossier |
| GSE (Gestore dei servizi energetici, MEF 100%: renewables incentives) | state company | MISSING, medium (a funder of energy projects; not a company grant maker in the pages read) | same dossier |
| Infratel Italia (broadband subsidy contracts, Invitalia group) | state company | MISSING, low | https://www.invitalia.it/chi-siamo/il-gruppo/mediocredito-centrale (group list) |
| CAIE (Comitato interministeriale per l'attrazione degli investimenti esteri, chaired by MIMIT) and the Cabina di regia per l'internazionalizzazione (MIMIT and MAECI) | committees | MISSING | https://www.esteri.it/en/temi/diplomazia_economica/l-attrazione-degli-investimenti/governance/ ; https://www.mimit.gov.it/it/notizie-stampa/internazionalizzazione-riunita-la-cabina-di-regia-mimit-maeci |
| Comitato interministeriale agevolazioni (PNRR M1C2 5.1, Fondo 394) | committee | MISSING, low | https://documenti.camera.it/leg19/dossier/testi/CP0725S.htm |
| Regional companies: the map has 11; Bolzano and Trento provincial bodies and Marche, Abruzzo, Calabria, Umbria, Molise, Basilicata, Valle d'Aosta are not covered | | partial | not read |
| ENEA, Sviluppo Lavoro Italia, Mediocredito Trentino-Alto Adige | | not verified, not proposed | |

Not verified, therefore not proposed: SACE's relationship to CDP (the Camera dossier shows MEF as 100% shareholder of SACE; SIMEST's 76% moved from SACE to CDP on 22 Jan 2022), ENEA, Federconfidi governance beyond the held page.

## 3. Funding vehicles (about EUR 100M a year, a company can apply)

| Vehicle | Size evidence | In map? | Proof |
|---|---|---|---|
| Contratti di sviluppo | programme 11.7 up EUR 242M in 2025 assestamento, mostly contratti di sviluppo (cap. 7343) | yes | AP0229 |
| Transizione 5.0 (tax credits, new Iperammortamento plan) | new cap. 7497, EUR 250M added; MIMIT list "Nuovo Piano Transizione 5.0 - Iperammortamento" | MISSING (map holds only the research tax credit it.mef.credito_rs) | https://www.mimit.gov.it/it/incentivi ; AP0229 |
| Fondo per la crescita sostenibile (R&D, Accordi per l'innovazione, IPCEI, Automotive accordi) | MIMIT list entries "Fondo per la crescita sostenibile", "Accordi per l'innovazione" | MISSING | https://www.mimit.gov.it/it/incentivi |
| IPCEI funding (IPCEI INT, Biochem and Advanced Materials, microelectronics Chips JU) | MIMIT list | MISSING | same |
| Mini Contratti di Sviluppo Automotive; Investimenti sostenibili 4.0; agevolazioni PMI del Mezzogiorno (DM 18 marzo 2026) | MIMIT list | MISSING | same |
| Fondo 394/81 (SIMEST-managed export promotion fund, titolare MAECI) | refinanced by the 2026 budget law (amount not read) | MISSING | https://documenti.camera.it/leg19/dossier/testi/CP0725S.htm |
| Fondo di garanzia PMI | run by Mediocredito Centrale for MIMIT; 1 Jan to 30 Jun 2026: 128,218 applications, EUR 23bn financing, EUR 16.2bn guaranteed | yes | https://www.fondidigaranzia.it/ |
| Nuova Sabatini, Smart&Start, Resto al Sud, CDP plafond, SIMEST finance, SACE guarantees | | yes | offers.yaml |
| Fondo nazionale innovazione (CDP Venture Capital) | | yes (it.cdp.vc) | |

## 4. Network, summary

`links.yaml` holds 20 cited ties: MEF ownership of CDP, SACE and Invitalia; banking foundations in CDP; CDP ownership and direction of SIMEST; MAECI as owner of Fondo 394 and supervisor of ICE; MIMIT supervision of Invitalia and its mandate to Mediocredito Centrale for the Fondo di garanzia; Invitalia ownership of MCC; the CAIE membership; Regions directing Veneto Sviluppo, Sviluppo Campania, Lazio Innova and sharing in ART-ER. Not found in fetched text: SACE and CDP board seats and CDP's governance (cdp.it bot-blocked), Finlombarda, Finpiemonte, Puglia Sviluppo, IRFIS, Fidi Toscana, Friulia, Filse and SFIRS ownership statements, MIMIT's supervision of the Fondo di garanzia management board, MEF-appointed directors.

## 5. Proposed additions (paste into the IT block)

```yaml
institutions:
  - {key: it.maeci, name: Ministry of Foreign Affairs and International Cooperation (MAECI, Farnesina), kind: ministry, parent: it.stato, level: national}
  - {key: it.ice, name: ICE - Italian Trade and Investment Agency, kind: institution, parent: it.maeci, level: national}
  - {key: it.caie, name: Interministerial Committee for the Attraction of Foreign Investment (CAIE, chaired by MIMIT), kind: committee, parent: it.mimit, level: national}
  - {key: it.fondazioni, name: Banking foundations (shareholders of CDP), kind: institution, level: national}
  - {key: it.cdp.equity, name: CDP Equity (CDP strategic equity arm), kind: institution, parent: it.cdp, level: national}
  - {key: it.cdp.vcsgr, name: CDP Venture Capital SGR, kind: institution, parent: it.cdp, level: national}
  - {key: it.gse, name: Gestore dei servizi energetici (GSE, MEF 100%), kind: institution, parent: it.mef, level: national}
  - {key: it.infratel, name: Infratel Italia (Invitalia group, broadband subsidies), kind: institution, parent: it.invitalia, level: national}
products:
  - {key: it.mimit.transizione50, name: Transizione 5.0 tax credits and the new Iperammortamento plan, offered_by: it.mimit, type: tax_credit}
  - {key: it.mimit.fcs, name: Fondo per la crescita sostenibile (R&D projects, Accordi per l'innovazione), offered_by: it.mimit, type: grant}
  - {key: it.mimit.ipcei, name: IPCEI national funding (nuclear technologies, biotech chemistry and advanced materials, microelectronics), offered_by: it.mimit, type: grant}
  - {key: it.simest.fondo394, name: Fondo 394/81 (export promotion finance run by SIMEST for MAECI), offered_by: it.simest, type: loan}
processes:
  - {key: it.p.fcs, title: A Fondo per la crescita sostenibile or Accordi per l'innovazione application, for: it.mimit.fcs}
  - {key: it.p.fondo394, title: A SIMEST Fondo 394 application, for: it.simest.fondo394}
org_charts:
  - {key: it.mcc, url: 'https://www.mcc.it/organi-sociali/', cadence: monthly}  # verified 200: board and auditors (already in the map)
  - {key: it.simest, url: 'https://www.simest.it/chi-siamo/corporate-governance/', cadence: monthly}  # verified 200: board, shareholders (76% CDP), Corte dei conti delegate
  - {key: it.invitalia.board, url: 'https://www.invitalia.it/chi-siamo/management/cda-e-collegio-sindacale', cadence: monthly}  # verified 200
  - {key: it.ice, url: 'https://www.ice.it/it/chi-siamo', cadence: monthly}  # verified 200: general page; president, director general and organigramma pages linked, paths still to find
  - {key: it.fdg, url: 'https://www.fondidigaranzia.it/gestore/', cadence: monthly}  # verified 200: MCC consortium as manager
  - {key: it.maeci, url: '', cadence: monthly}  # still to find (esteri.it answers bots with a captcha)
  - {key: it.caie, url: '', cadence: monthly}  # still to find (no own page; described at esteri.it governance page)
  - {key: it.gse, url: '', cadence: monthly}  # still to find
```
