# Germany knowledge-map coverage audit (19 Nov 2026)

Held against: the federal budget 2026 (Soll, bundeshaushalt.de Einzelplan PDFs, read in full text), the VÖB list of Förderbanken, and the official pages cited per row. Map = `mandate/brains/wincent/knowledge_map.yaml` DE block (24 institutions at federal level plus 16 Land banks, 15 products, 8 processes) and `capital/reference/graph_de/{structure,offers}.yaml`. Amounts are 2026 Soll in EUR thousand as printed in the Einzelplan. Nothing in the map was edited; the paste-ready additions are the last block.

## 1. Budget owners (Einzelpläne)

Official proof for every row: `https://www.bundeshaushalt.de/static/daten/2026/soll/epl<NN>.pdf` (EPL NN as below); the Einzelplan list itself is `.../Vorspann_2026.pdf`.

| Einzelplan | Ministry | Business-finance lines found in the budget text | In map? |
|---|---|---|---|
| 09 | BMWE | Kap. 0902 "Mittelstand: Gründen, Wachsen, Investieren": ZIM 558,441; Innovative Unternehmensgründungen 176,006; Mittelstand Digital 53,174; Zinszuschüsse ERP-Förderprogramme 45,660; Zukunftsfonds Automobilindustrie 87,983; IPCEI Cloud 250,348; Sprunginnovationen 28,986; GTAI (687 02); Kap. 0916 BAFA | yes (de.bmwe) |
| 30 | BMFTR | Forschungszulage (686 06) 24,935; Sprunginnovationen (685 14) 237,900; Innovativer Transfer, regionale Innovationsökosysteme (683 10) 476,653; Energietechnologien/Grüner Wasserstoff (685 41) 260,604; Raumfahrt (683 90) 282,058; Mikroelektronik (894 23) 137,400 | yes (de.bmftr) |
| 08 / 60 | BMF (EPL 08) and Allgemeine Finanzverwaltung (EPL 60) | EPL 60 carries the KfW guarantee reimbursements (671 04 790,000; 671 05 start-up package 240,000), the Klima- und Transformationsfonds plan (Anlage 3: Energieeffizienz in Industrie und Gewerbe 918,317 and 973,194; Mikroelektronik 2,900,000; Wasserstoff in der Industrie 1,259,000; IPCEI Wasserstoff 680,000; Transformation Wärmenetze 979,000) | yes (de.bmf); the KTF itself has no node |
| 16 | BMUKN (Umwelt, Klimaschutz, Naturschutz, nukleare Sicherheit) | no line of 100M+ for company finance surfaced in the keyword scan; Projektträger-run grant lines exist (24 mentions). Needed because the KTF and the Verwaltungsrat context touch it. LOWER PRIORITY, verify the Titelgruppen before loading | MISSING (de.bmukn) |
| 12 | BMV (Verkehr) | Motoren/Modernisierung Binnenschifffahrt 35,096; company grants for vehicle development; sits on the KfW Verwaltungsrat | MISSING (de.bmv) |
| 10 | BMLEH (Landwirtschaft, Ernährung, Heimat) | legal supervisor of the Landwirtschaftliche Rentenbank; GAK (Gemeinschaftsaufgabe Agrarstruktur) | MISSING (de.bmleh) |
| 23 | BMZ | KfW development finance lines (7 KfW mentions); sits on KfW Verwaltungsrat and the Hermes IMA | MISSING (de.bmz) |
| 24 | BMDS (Digitales und Staatsmodernisierung) | 686 01 software-controlled vehicle development grants 18,000; small | MISSING, low (de.bmds) |
| 25 | BMWSB (Wohnen, Stadtentwicklung, Bauwesen) | housing and urban finance via KfW; not company finance | MISSING, low (de.bmwsb) |
| 11 | BMAS | ESF Plus programme lines (co-finances EXIST per exist.de) | MISSING, low |
| 05 | Auswärtiges Amt | member of the Hermes IMA only | MISSING, low |

Judgement: the three ministries that carry the company-finance money (BMWE, BMFTR, BMF) are all in the map. The KTF (Klima- und Transformationsfonds, EPL 60 Anlage 3, about EUR 33bn in 2026) is the largest pot behind industry transformation and is not represented as a node; propose `de.ktf`.

## 2. Operational arms

| Arm | Kind | In map? | Proof URL |
|---|---|---|---|
| KfW, KfW Capital, HTGF, coparion, BSFZ, Hermes (Allianz Trade), 16 Land banks, Bürgschaftsbanken | institutions | yes | see structure.yaml |
| Landwirtschaftliche Rentenbank | federal Förderbank (VÖB list) | MISSING | https://www.voeb.de/fileadmin/Dateien/Presse/News/Pressemitteilungen_PDFs/Liste_Foerderbanken.pdf ; https://www.rentenbank.de/ueber-uns/ |
| BayernLabo (Bayerische Landesbodenkreditanstalt) | Land Förderbank (housing, VÖB list) | MISSING, low | same VÖB list; https://bayernlabo.de/ |
| Projektträger Jülich (PtJ) | project management agency (runs EXIST) | MISSING (only generic de.pt) | https://exist.de/impressum/ |
| VDI/VDE Innovation + Technik (VDI/VDE-IT) | Projektträger (ZIM contact point) | MISSING | https://www.foerderdatenbank.de/FDB/Content/DE/Foerderprogramm/Bund/BMWi/fue-einzelprojekte-zim.html |
| VDI Technologiezentrum (VDI TZ), AiF Projekt GmbH, DLR Projektträger | Projektträger; BSFZ consortium | MISSING | https://www.bescheinigung-forschungszulage.de/impressum ; https://www.aif-projekt-gmbh.de/ |
| BAFA (Bundesamt für Wirtschaft und Ausfuhrkontrolle) | federal agency, EPL 09 Kap. 0916; BEG and energy-efficiency subsidies | MISSING | https://www.bafa.de/ (EPL 09 Kap. 0916) |
| GTAI (Germany Trade and Invest) | federal agency for foreign trade promotion, EPL 09 Titel 687 02 | MISSING | https://www.bundeshaushalt.de/static/daten/2026/soll/epl09.pdf |
| SPRIND (Bundesagentur für Sprunginnovationen) | federal GmbH, challenges and Funken | MISSING | https://www.sprind.org/de/ ; https://bundesrecht.juris.de/sprindfg/SPRINDFG.pdf |
| Deutschlandfonds | KfW-coordinated umbrella of guarantees, loans, equity (about EUR 30bn federal funds and guarantees) | MISSING | https://www.kfw.de/%c3%9cber-die-KfW/Newsroom/Aktuelles/Deutschlandfonds.html |
| Zukunftsfonds | federal VC programme running through KfW Capital | MISSING | https://www.kfw-capital.de/%C3%9Cber-uns/ |
| DeepTech & Climate Fonds (DTCF) | HTGF public early-growth vehicle | MISSING | https://www.htgf.de/en/investors/ |
| KfW IPEX-Bank | KfW export and project finance subsidiary | MISSING | https://www.kfw-ipex-bank.de/ |
| dena (Deutsche Energie-Agentur) | federal energy agency | MISSING, low (not a funder of companies in the pages read) | https://www.dena.de/ueber-die-dena/ |
| DBU (Deutsche Bundesstiftung Umwelt) | foundation, Green Start-up and SME environment grants | MISSING, low | https://www.dbu.de/ueber-uns/ |

Not verified, therefore not proposed: EURONORM GmbH and AiF Projekt as ZIM administrators (only VDI/VDE-IT was stated on the page read), DEG, Mittelständische Beteiligungsgesellschaften, DLR PT website (blocked from here), PtJ own site (HTTP 401 from here).

## 3. Funding vehicles (about EUR 100M a year and a company can apply)

| Vehicle | Size evidence | In map? | Proof |
|---|---|---|---|
| ERP promotional loans (KMU, StartGeld, Digitalisierung) | KfW pages | yes | offers.yaml |
| ZIM | 558,441 TEUR (EPL 09, 683 01) | yes (de.zim) | epl09.pdf |
| EXIST | EPL 09 686 07 "Innovative Unternehmensgründungen" 176,006 (EXIST named on exist.de; the line-to-programme mapping is inferred) | yes (de.exist) | exist.de |
| GRW | federal half of Land spend, GRWG | yes | GRWG text |
| Forschungszulage | 24,935 TEUR administrative line; the tax credit itself is not in the Einzelplan | yes | |
| Hermes export cover | | yes | |
| HTGF seed, coparion, KfW Capital | | yes | |
| Deutschlandfonds products (Absicherungsinstrument für Transformationsindustrien, KfW Kredit Nr. 877, guarantees from EUR 100M with up to 50 percent KfW share; Rohstofffonds) | EUR 30bn federal funds/guarantees | MISSING | KfW Deutschlandfonds page |
| KfW Capital Tech-Fondsinvest, Scale-up Direct | | MISSING | https://www.kfw-capital.de/Investmentprogramme/ |
| SPRIND challenges (Challenges, Funken) | 237,900 TEUR (EPL 30, 685 14) | MISSING | https://www.sprind.org/de/ |
| BEG / energy efficiency and renewables subsidies (BAFA and KfW) | KTF "Förderung von Maßnahmen der Energieeffizienz und erneuerbarer Energien" 11,964,506; "Energieeffizienz in Industrie und Gewerbe" 918,317 | MISSING | epl60.pdf (Anlage 3); https://www.bafa.de/ |
| IPCEI national funding (Wasserstoff 680,000; Cloud 250,348; Mikroelektronik 2,900,000) | | MISSING | epl60.pdf, epl09.pdf |
| Zukunftsfonds Automobilindustrie | 87,983 (below threshold, listed for the automotive case) | MISSING | epl09.pdf (686 11) |
| Mittelstand Digital | 53,174 (below threshold) | skip | |
| Innovativer Transfer / regionale Innovationsökosysteme (BMFTR, e.g. the successor lines of Start-up Factories and WIR/RUBIN style programmes) | 476,653 TEUR line only; no single programme named | NOT PROPOSED (no programme page read) | epl30.pdf |
| KMU-innovativ, IGF (AiF) | named in the brief; no line surfaced under those names in the 2026 Soll text and I did not source a programme page | NOT PROPOSED, to source | |

## 4. Network, summary

`links.yaml` holds the statute- and page-stated links (Bund and Länder as KfW owners, BMF legal supervision, the finance and economy ministers alternating in the KfW chair, ERP administered by BMWE with BMF consent, coparion and HTGF shareholders, ZIM and EXIST delegation to VDI/VDE-IT and PtJ, GRW coordination committee, Hermes IMA, SPRIND ownership and supervision, Land ministries on Land bank boards). Links on proposed keys carry `proposed: true`.

## 5. Proposed additions (paste into the DE block)

Keys follow the map's `de.*` convention. URLs marked `# loaded` returned 200 with page text from this machine; `url: ''` means the loader's first job is to find the org chart.

```yaml
institutions:
  # ministries (budget sections)
  - {key: de.bmukn, name: Federal Ministry for Environment, Climate Action, Nature Conservation and Nuclear Safety (BMUKN), kind: ministry, parent: de.bund, level: national}
  - {key: de.bmv, name: Federal Ministry of Transport (BMV), kind: ministry, parent: de.bund, level: national}
  - {key: de.bmleh, name: Federal Ministry of Agriculture, Food and Homeland (BMLEH), kind: ministry, parent: de.bund, level: national}
  - {key: de.bmz, name: Federal Ministry for Economic Cooperation and Development (BMZ), kind: ministry, parent: de.bund, level: national}
  - {key: de.bmds, name: Federal Ministry for Digital and State Modernisation (BMDS), kind: ministry, parent: de.bund, level: national}
  - {key: de.bmwsb, name: Federal Ministry for Housing, Urban Development and Building (BMWSB), kind: ministry, parent: de.bund, level: national}
  - {key: de.ktf, name: Climate and Transformation Fund (KTF, economic plan 6092), kind: programme, parent: de.bmf, level: national}
  - {key: de.laender, name: Länder (state governments), kind: ministry, parent: de.bund, level: regional}
  - {key: de.br, name: Bundesrat, kind: committee, level: national}
  # arms
  - {key: de.rentenbank, name: Landwirtschaftliche Rentenbank, kind: institution, parent: de.bmleh, level: national}
  - {key: de.kfw.ipex, name: KfW IPEX-Bank (export and project finance), kind: institution, parent: de.kfw, level: national}
  - {key: de.deutschlandfonds, name: Deutschlandfonds (coordinated by KfW), kind: programme, parent: de.kfw, level: national}
  - {key: de.zukunftsfonds, name: Zukunftsfonds of the Bund (via KfW Capital), kind: programme, parent: de.kfw.capital, level: national}
  - {key: de.htgf.dtcf, name: DeepTech & Climate Fonds (HTGF), kind: programme, parent: de.htgf, level: national}
  - {key: de.sprind, name: SPRIND Federal Agency for Disruptive Innovation, kind: institution, parent: de.bmftr, level: national}
  - {key: de.bafa, name: Federal Office for Economic Affairs and Export Control (BAFA), kind: institution, parent: de.bmwe, level: national}
  - {key: de.gtai, name: Germany Trade and Invest (GTAI), kind: institution, parent: de.bmwe, level: national}
  - {key: de.pt.ptj, name: Projektträger Jülich (PtJ), kind: institution, parent: de.pt, level: national}
  - {key: de.pt.vdivdeit, name: VDI/VDE Innovation + Technik (project management agency), kind: institution, parent: de.pt, level: national}
  - {key: de.pt.vditz, name: VDI Technologiezentrum (project management agency), kind: institution, parent: de.pt, level: national}
  - {key: de.pt.aif, name: AiF Projekt GmbH (project management agency), kind: institution, parent: de.pt, level: national}
  - {key: de.pt.dlrpt, name: DLR Projektträger (project management agency), kind: institution, parent: de.pt, level: national}
  - {key: de.by.bayernlabo, name: BayernLabo (Bayerische Landesbodenkreditanstalt), kind: regional_body, level: regional, region: DE2}
  - {key: de.dena, name: Deutsche Energie-Agentur (dena), kind: institution, parent: de.bund, level: national}
products:
  - {key: de.kfw.deutschlandfonds877, name: KfW Absicherungsinstrument fuer Transformationsindustrien (Kredit Nr. 877), offered_by: de.deutschlandfonds, type: guarantee}
  - {key: de.kfwcap.techfondsinvest, name: KfW Capital Tech-Fondsinvest (Deutschlandfonds), offered_by: de.kfw.capital, type: equity}
  - {key: de.kfwcap.scaleupdirect, name: KfW Capital Scale-up Direct co-investment, offered_by: de.kfw.capital, type: equity}
  - {key: de.sprind.challenge, name: SPRIND Challenges and Funken, offered_by: de.sprind, type: grant}
  - {key: de.ktf.efficiency, name: KTF energy efficiency and renewables subsidies (BEG, industry efficiency), offered_by: de.bafa, type: grant}
  - {key: de.ipcei.national, name: National IPCEI funding (hydrogen, microelectronics, cloud), offered_by: de.bmwe, type: grant}
processes:
  - {key: de.p.deutschlandfonds, title: A Deutschlandfonds guarantee or KfW Capital co-investment, for: de.kfw.deutschlandfonds877}
  - {key: de.p.sprind, title: A SPRIND challenge or Funke application, for: de.sprind.challenge}
  - {key: de.p.bafa_efficiency, title: A BAFA or KfW energy-efficiency subsidy application, for: de.ktf.efficiency}
org_charts:
  - {key: de.rentenbank, url: 'https://www.rentenbank.de/ueber-uns/', cadence: monthly}  # loaded; general page, Vorstand pages below
  - {key: de.kfw.ipex, url: 'https://www.kfw-ipex-bank.de/%C3%9Cber-uns/Organisation/', cadence: monthly}  # loaded
  - {key: de.deutschlandfonds, url: 'https://www.kfw.de/%c3%9cber-die-KfW/Newsroom/Aktuelles/Deutschlandfonds.html', cadence: monthly}  # loaded; programme page, no org chart
  - {key: de.sprind, url: 'https://www.sprind.org/de/wir', cadence: monthly}  # loaded; team page
  - {key: de.dena, url: 'https://www.dena.de/ueber-die-dena/', cadence: monthly}  # loaded
  - {key: de.pt.aif, url: 'https://www.aif-projekt-gmbh.de/', cadence: monthly}  # loaded; home page
  - {key: de.by.bayernlabo, url: 'https://bayernlabo.de/', cadence: monthly}  # loaded; home page, organ pages to find
  - {key: de.bmukn, url: 'https://www.bundesumweltministerium.de/', cadence: monthly}  # loaded landing page; Organisationsplan PDF to find
  - {key: de.bmds, url: 'https://bmds.bund.de/', cadence: monthly}  # loaded landing page; Organisationsplan to find
  - {key: de.bmz, url: 'https://www.bmz.de/de/ministerium', cadence: monthly}  # loaded landing page
  - {key: de.bmwsb, url: 'https://www.bmwsb.bund.de/DE/home/home_node.html', cadence: monthly}  # loaded landing page
  - {key: de.bmv, url: '', cadence: monthly}  # still to find (site not reachable from here)
  - {key: de.bmleh, url: '', cadence: monthly}  # still to find (site not reachable from here)
  - {key: de.pt.ptj, url: '', cadence: monthly}  # still to find (fz-juelich.de/ptj returned 401)
  - {key: de.pt.vdivdeit, url: '', cadence: monthly}  # still to find
  - {key: de.pt.vditz, url: '', cadence: monthly}  # still to find
  - {key: de.pt.dlrpt, url: '', cadence: monthly}  # still to find (site not reachable from here)
  - {key: de.bafa, url: '', cadence: monthly}  # still to find (organisation page path changed)
  - {key: de.gtai, url: '', cadence: monthly}  # still to find (bot-blocked from here)
```
