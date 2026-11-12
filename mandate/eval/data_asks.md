# Data asks: which data would most improve the answers

Mined from 130 signals across 5 runs and judgements (judge, transcripts, owner notes, usage log: judge 73, owner 1, transcript 43, web source 13). Re-run: `PYTHONPATH=. python3 -m mandate.eval.data_gaps --write`.
Rank = answers it would have improved x (1 + owner cases it touched). The miner loads nothing.

| # | ask | kind | concrete source | answers | owner cases | load |
|---|---|---|---|---|---|---|
| 1 | BdI 106 consultation unverified | statute / rule text | Banca d'Italia Circolare 288/2015 | 3 | fintech_guarantees, robotics_deployment_it | one-off load into grounding, monthly re-fetch (sha256 shows changes) |
| 2 | No Fondo award records | precedents | MCC Fondo di Garanzia operating rules | 3 | fintech_guarantees, robotics_deployment_it | one-off backfill from the institution's published transaction list, then a weekly feed |
| 3 | German reform on non-bank access not identified | statute / rule text | BMWE / Bundestag reform file | 3 | fintech_guarantees | one-off load into grounding, monthly re-fetch (sha256 shows changes) |
| 4 | EIF and Bpifrance precedents none found | precedents | EIF InvestEU signature list | 3 | fintech_guarantees | one-off backfill from the institution's published transaction list, then a weekly feed |
| 5 | No ECF text in corpus | statute / rule text | Commission ECF regulation proposal | 3 | fintech_guarantees | one-off load into grounding, monthly re-fetch (sha256 shows changes) |
| 6 | ungrounded: Mediocredito Centrale, head of the Fondo di Garanzia | stakeholders / people | (none named) | 2 | fintech_guarantees, robotics_deployment_it | one-off seed from the official directory or register, weekly refresh |
| 7 | 2027 Fondo cover reform unverified | statute / rule text | MIMIT decree | 2 | fintech_guarantees, robotics_deployment_it | one-off load into grounding, monthly re-fetch (sha256 shows changes) |
| 8 | German actors register empty | stakeholders / people | BMWE organisation chart | 2 | fintech_guarantees | one-off seed from the official directory or register, weekly refresh |
| 9 | fetched live, should be held: www.bancaditalia.it | statute / rule text | https://www.bancaditalia.it/compiti/vigilanza/accesso-mercato/intermediari-finanziari/index.html | 2 | fintech_guarantees | one-off load into grounding, monthly re-fetch (sha256 shows changes) |
| 10 | No French guarantee product in corpus | financial instrument intel | Bpifrance and EIF product pages | 2 | fintech_guarantees | one-off load of the scheme's own rules and product sheets, weekly refresh |
| 11 | ER SME machinery measure aggregator only | financial instrument intel | Lombardia and Emilia-Romagna regional calls | 1 | robotics_deployment_it | one-off load of the scheme's own rules and product sheets, weekly refresh |
| 12 | fetched live, should be held: www.eif.org | financial instrument intel | https://www.eif.org/guarantee-products/all/investeu-competitiveness-capped-guarantee | 1 | fintech_guarantees | one-off load of the scheme's own rules and product sheets, weekly refresh |
| 13 | read_agenda empty | free media / news / agendas | (none named) | 1 | robotics_deployment_it | a feed (the institution's or region's own channels), read by a tool |
| 14 | First-of-a-kind in Germany (medium). No precedent of a non-bank on a German public | precedents | (none named) | 1 | fintech_guarantees | one-off backfill from the institution's published transaction list, then a weekly feed |
| 15 | EIF contact person unverified | stakeholders / people | EIF InvestEU guarantees team | 1 | fintech_guarantees | one-off seed from the official directory or register, weekly refresh |
| 16 | FdG gates citation null; 106 TUB requesting-entity rule unverified | statute / rule text | FdG Disposizioni operative; TUB Art. 106 | 1 | fintech_guarantees | one-off load into grounding, monthly re-fetch (sha256 shows changes) |
| 17 | Société de financement capital and timeline unverified | statute / rule text | ACPR authorisation guidance | 1 | fintech_guarantees | one-off load into grounding, monthly re-fetch (sha256 shows changes) |
| 18 | No DE/FR doors seeded in match_status | financial instrument intel | KfW/Bürgschaftsbank guidelines; Bpifrance guarantee conditions | 1 | fintech_guarantees | one-off load of the scheme's own rules and product sheets, weekly refresh |
| 19 | No Sabatini row in corpus | financial instrument intel | MIMIT Nuova Sabatini page | 1 | robotics_deployment_it | one-off load of the scheme's own rules and product sheets, weekly refresh |
| 20 | eligible? Regina's corpus returned no ECF text (calls 10: [c12]-[c15] are older | financial instrument intel | (none named) | 1 | fintech_guarantees | one-off load of the scheme's own rules and product sheets, weekly refresh |
| 21 | fetched live, should be held: www.fondidigaranzia.it | financial instrument intel | https://www.fondidigaranzia.it/wp-content/uploads/2019/12/Modalità-operative-portafogli-20121218.pdf | 1 | fintech_guarantees | one-off load of the scheme's own rules and product sheets, weekly refresh |
| 22 | fetched live, should be held: www.kfw.de | financial instrument intel | https://www.kfw.de/PDF/Download-Center/F%C3%B6rderprogramme-(Inlandsf%C3%B6rderung)/PDF-Dokumente/6000004843_M_366.pdf | 1 | fintech_guarantees | one-off load of the scheme's own rules and product sheets, weekly refresh |
| 23 | find_instruments {IT}: 0 rows (the screen drops Italian rows: no Italian entity yet). | financial instrument intel | (none named) | 1 | robotics_deployment_it | one-off load of the scheme's own rules and product sheets, weekly refresh |
| 24 | ungrounded: Digitalisation product where loans fund digital uptake | financial instrument intel | (none named) | 1 | fintech_guarantees | one-off load of the scheme's own rules and product sheets, weekly refresh |
| 25 | ungrounded: The EIF signs with the entity that bears the credit risk on the loans | financial instrument intel | (none named) | 1 | fintech_guarantees | one-off load of the scheme's own rules and product sheets, weekly refresh |
| 26 | unverified: Competitiveness Fund | financial instrument intel | (none named) | 1 | fintech_guarantees | one-off load of the scheme's own rules and product sheets, weekly refresh |
| 27 | Credimi 106 status and abcfinance regulatory status unverified | precedents | Banca d'Italia 106 register | 1 | fintech_guarantees | one-off backfill from the institution's published transaction list, then a weekly feed |
| 28 | find_precedents {Mediocredito Centrale, robotics}: same list. No precedent. | precedents | (none named) | 1 | robotics_deployment_it | one-off backfill from the institution's published transaction list, then a weekly feed |
| 29 | ungrounded: Fondo guarantees to three SMEs in May 2026 under SA.109544 (register record) | precedents | (none named) | 1 | fintech_guarantees | one-off backfill from the institution's published transaction list, then a weekly feed |
| 30 | ER attraction desk and contacts unverified | stakeholders / people | (none named) | 1 | robotics_deployment_it | one-off seed from the official directory or register, weekly refresh |

86 asks in all; by kind: financial instrument intel 13, free media / news / agendas 2, other 26, precedents 7, stakeholders / people 11, statute / rule text 27.
