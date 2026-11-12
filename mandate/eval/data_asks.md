# Data asks: which data would most improve the answers

Mined from 210 signals across 9 runs and judgements (judge, transcripts, owner notes, usage log: judge 115, owner 1, transcript 60, usage log 11, web source 23). Re-run: `PYTHONPATH=. python3 -m mandate.eval.data_gaps --write`.
Rank = answers it would have improved x (1 + owner cases it touched). The miner loads nothing.

| # | ask | kind | concrete source | answers | owner cases | load |
|---|---|---|---|---|---|---|
| 1 | EIF transaction list not checked | precedents | EIF transaction list | 8 | fintech_guarantees, robotics_deployment_it | one-off backfill from the institution's published transaction list, then a weekly feed |
| 2 | BdI 106 consultation unverified | statute / rule text | Banca d'Italia Circolare 288/2015 | 5 | fintech_guarantees, robotics_deployment_it | one-off load into grounding, monthly re-fetch (sha256 shows changes) |
| 3 | 2027 Fondo cover reform unverified | statute / rule text | MIMIT decree | 5 | fintech_guarantees, robotics_deployment_it | one-off load into grounding, monthly re-fetch (sha256 shows changes) |
| 4 | No ECF text in corpus | statute / rule text | Commission ECF regulation proposal | 5 | fintech_guarantees, robotics_deployment_it | one-off load into grounding, monthly re-fetch (sha256 shows changes) |
| 5 | ungrounded: Mediocredito Centrale, accreditation unit | stakeholders / people | (none named) | 4 | fintech_guarantees, robotics_deployment_it | one-off seed from the official directory or register, weekly refresh |
| 6 | No Fondo award records | financial instrument intel | MCC Fondo di Garanzia operating rules | 3 | fintech_guarantees, robotics_deployment_it | one-off load of the scheme's own rules and product sheets, weekly refresh |
| 7 | fetched live, should be held: www.eif.org | financial instrument intel | https://www.eif.org/guarantee-products/all/investeu-competitiveness-capped-guarantee | 3 | fintech_guarantees, robotics_deployment_it | one-off load of the scheme's own rules and product sheets, weekly refresh |
| 8 | fetched live, should be held: www.bancaditalia.it | financial instrument intel | https://www.bancaditalia.it/compiti/vigilanza/accesso-mercato/intermediari-finanziari/index.html | 3 | fintech_guarantees, robotics_deployment_it | one-off load of the scheme's own rules and product sheets, weekly refresh |
| 9 | German reform moving in parliament not found | statute / rule text | BMWE / Bundestag reform file | 4 | fintech_guarantees | one-off load into grounding, monthly re-fetch (sha256 shows changes) |
| 10 | Collabora&Innova II unverified | financial instrument intel | Lombardia and Emilia-Romagna regional calls | 3 | robotics_deployment_it | one-off load of the scheme's own rules and product sheets, weekly refresh |
| 11 | German actors register empty | stakeholders / people | BMWE organisation chart | 3 | fintech_guarantees | one-off seed from the official directory or register, weekly refresh |
| 12 | KWG §1/§32 fetched live | statute / rule text | https://www.gesetze-im-internet.de/kredwg/__1.html | 3 | fintech_guarantees | one-off load into grounding, monthly re-fetch (sha256 shows changes) |
| 13 | fetched live, should be held: www.normattiva.it | statute / rule text | https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legge:2012-10-18;179~art25 | 3 | robotics_deployment_it | one-off load into grounding, monthly re-fetch (sha256 shows changes) |
| 14 | No French guarantee product in corpus | financial instrument intel | Bpifrance and EIF product pages | 3 | fintech_guarantees | one-off load of the scheme's own rules and product sheets, weekly refresh |
| 15 | unverified: Competitiveness Fund | financial instrument intel | (none named) | 2 | fintech_guarantees | one-off load of the scheme's own rules and product sheets, weekly refresh |
| 16 | CMF L511-5 text not served | statute / rule text | Légifrance | 2 | fintech_guarantees | one-off load into grounding, monthly re-fetch (sha256 shows changes) |
| 17 | Iperammortamento on operating rental unverified | statute / rule text | L. 199/2025 c.427-436 and decree | 2 | robotics_deployment_it | one-off load into grounding, monthly re-fetch (sha256 shows changes) |
| 18 | unverified: bank, not your own application [w2] (FR); | other | (none named) | 2 | fintech_guarantees | live research, cached when fetched |
| 19 | Sabatini refinancing unverified | free media / news / agendas | 2027 budget law | 1 | robotics_deployment_it | a feed (the institution's or region's own channels), read by a tool |
| 20 | read_agenda empty | free media / news / agendas | (none named) | 1 | robotics_deployment_it | a feed (the institution's or region's own channels), read by a tool |
| 21 | Germany, France: none found. | other | (none named) | 2 | fintech_guarantees | live research, cached when fetched |
| 22 | ungrounded: the Bank of Italy's supervision of financial intermediaries | other | (none named) | 2 | fintech_guarantees | live research, cached when fetched |
| 23 | First-of-a-kind in Germany (medium). No precedent of a non-bank on a German public | precedents | (none named) | 1 | fintech_guarantees | one-off backfill from the institution's published transaction list, then a weekly feed |
| 24 | EIF contact person unverified | stakeholders / people | EIF InvestEU guarantees team | 1 | fintech_guarantees | one-off seed from the official directory or register, weekly refresh |
| 25 | FdG gates citation null; 106 TUB requesting-entity rule unverified | statute / rule text | FdG Disposizioni operative; TUB Art. 106 | 1 | fintech_guarantees | one-off load into grounding, monthly re-fetch (sha256 shows changes) |
| 26 | Sabatini apply-before-order rule unverified | statute / rule text | MIMIT Sabatini circular | 1 | robotics_deployment_it | one-off load into grounding, monthly re-fetch (sha256 shows changes) |
| 27 | Société de financement capital and timeline unverified | statute / rule text | ACPR authorisation guidance | 1 | fintech_guarantees | one-off load into grounding, monthly re-fetch (sha256 shows changes) |
| 28 | No DE/FR doors seeded in match_status | financial instrument intel | KfW/Bürgschaftsbank guidelines; Bpifrance guarantee conditions | 1 | fintech_guarantees | one-off load of the scheme's own rules and product sheets, weekly refresh |
| 29 | No Sabatini row in corpus | financial instrument intel | MIMIT Nuova Sabatini page | 1 | robotics_deployment_it | one-off load of the scheme's own rules and product sheets, weekly refresh |
| 30 | SI4.0 2026 call unverified | financial instrument intel | Unioncamere Lombardia determinazione 217-2026 | 1 | robotics_deployment_it | one-off load of the scheme's own rules and product sheets, weekly refresh |

110 asks in all; by kind: financial instrument intel 18, free media / news / agendas 4, other 38, precedents 7, stakeholders / people 12, statute / rule text 31.
