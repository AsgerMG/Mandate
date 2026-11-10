# Data audit: what the brains use, what is strong, what is dead weight

Measured read-only in production on 2026-11-10. Tiers: CORE = DE, IT, FR, EU, GB;
HUB = SE, DK, NO, NL, BE; OUT = the rest. Input to master_plan.md rule 4b.

## Summary
1. 1.73 GB in Postgres (grounding 945 MB, capital 741 MB, policy 34 MB, mandate 1 MB) + 726 MB in the bucket. Storage costs <$1/month; the real costs are weekly run time (87 min), fragile scrapers and out-of-scope noise.
2. What a brain reads is small: instruments, gates + citations, routes, instrument vectors, award events (Wincent); documents, passages, vectors, 511 actors (Regina).
3. Strong: Regina's EU law; core gates 63% cited (2,670/4,221); 340/421 core instruments have a cited gate.
4. Strong but unreachable by any brain: 5,570 public equity stakes (UK Future Fund 2,030, HTGF 538, EIC Fund 233) and 19,963 news articles.
5. Dead weight: ~85 MB of retired sector-label tables; a 1:1 raw SATR copy (81 MB); 15,979 news articles our classifier marked irrelevant; 21 min/week refreshing Spain only.
6. OUT countries: ~31% of award events, 43% of instruments, 39% of gates, >=21 of 87 weekly minutes.
7. Core gaps: UK 5 instruments and 0 policy documents; Italy 0 policy documents and 2 news feeds; SATR (DE/FR/IT precedent backbone) last loaded 2026-05-28; news ingest gap 24 Jul - 9 Nov.
8. Usage is invisible: retrieval_events, eval_runs, artefact_releases all 0 rows.

## Scope enforcement today
One trigger on capital.companies (40 countries, corpus_schema.sql:308) + capital/reference/europe_scope.json via canonicalise_country (13 callers). Nothing on instruments, events, signals or policy. A tiered scope needs: a tier per country in europe_scope.json; a per-source tier in the extract manifest so renew/refresh skip OUT sources; find_instruments filtering OUT unless the client is established there; the trigger left as is (OUT rows stay as context).

## Datasets (readers: BRAIN direct / FEEDS / PIPE / NONE)
| Dataset | Rows | Size | Readers | Verdict |
|---|---|---|---|---|
| grounding.passage_embeddings | 125,069 | 670 MB | BRAIN | KEEP; take news >90 days out of the hot index (retrieval filter / partial index; store is append-only) |
| grounding passages/versions/documents/fetches | 125,745 / 13,420 / 11,457 / 18,496 | ~274 MB | BRAIN | KEEP (core); Wincent's research has stored only 12 versions |
| policy.documents (+links) | 11,166 | ~30 MB | BRAIN | KEEP; FIX: add IT and UK sources (0 each) |
| policy.actors | 511 | 0.9 MB | BRAIN | KEEP, thin (EP speakers only) |
| capital.funding_instruments | 1,118 | 3.9 MB | BRAIN | KEEP; core 421 (GB 5), hub 202, OUT 480; OUT not offered by default |
| capital.eligibility_gates / grounding | 9,773 / 6,852 | 13 MB | BRAIN | KEEP (core) |
| instrument_profiles / eligibility_embeddings / clauses | | 39 MB | BRAIN | KEEP |
| capital.instrument_application | 285 | 0.3 MB | BRAIN | REFRESH: cite routes for core |
| capital.public_funding_events | 314,063 | 319 MB | BRAIN (precedents) | KEEP; slim project_summary (92 MB, unread by find_precedents) after a reader check; FIX SATR currency |
| capital.companies | 165,240 | 89 MB | BRAIN (join) | KEEP |
| capital.public_equity_stakes | 5,570 | 2.2 MB | **NONE for a brain** | FIX: wire into find_precedents |
| capital.satr_staging | 122,814 | 81 MB | FEEDS (4 steps) | SLIM to the read columns; raw copy to bucket |
| capital.classify_audit | 420,416 | 66 MB | PIPE (one sanity_check block) | ARCHIVE |
| capital.company_sector_llm | 156,100 | 18 MB | NONE on the cron | ARCHIVE |
| capital._reconcile_20261105_sqlite_gates | 342 | 0.3 MB | NONE | ARCHIVE |
| capital.signals_* | 19,963 articles | ~74 MB | site/brief only; no tool | KEEP relevant 3,984; archive the 15,979 irrelevant texts; FIX: read_agenda tool + daily ingest |
| brief_records / request_log / event_log | small | <0.3 MB | retired /brief | ARCHIVE |
| mandate.actor_* (12 tables) | 0 | - | BRAIN | FIX: seed (Whoiswho, Transparency Register) |
| artefact_releases / eval_runs / retrieval_events | 0 / 0 / 0 | - | | FIX: publish releases; log usage |

## Slimming (archive, never delete) — ~170 MB, cents/month; the gain is 21+ min/week and fewer failure points
1. Stop the weekly refresh of OUT sources (refresh_open_calls = 100% ES, 21.3 min; bdns, cdti, business_finland, tesi, enterprise_ireland), adjusting the ES offerable-decay threshold in the same change. Their data stays as frozen context.
2. Archive classify_audit, company_sector_llm, the reconcile table to bucket archive/2026-11/ (remove sanity_check.py:706-715).
3. Slim satr_staging to the columns its 4 readers use; raw to bucket.
4. Archive the irrelevant news texts; archive /brief's tables.
5. Take news >90 days out of Regina's hot index (retrieval filter).

## Strengthening
1. Wire what we hold: public_equity_stakes into find_precedents; a read_agenda tool over the relevant news.
2. Make SATR current (monthly, from a host that can reach it).
3. Core gaps: UK (British Business Bank, Innovate UK loans, R&D tax relief; policy sources), Italy (Gazzetta Ufficiale, Normattiva, MIMIT decrees).
4. Ground the deciding core (KWG, CMF L.511, TUB 106-107, GBER, InvestEU, current MCC rules); seed the actors register.
5. Restore currency and make use visible: news ingest, artefact releases, a usage log of every tool call and retrieval hit.

## Currency
Weekly: core + hub award sources, instruments, gates, embeddings, Regina's legal sources. Monthly: SATR, deciding-core statute pages (sha256 change detection). Daily radar: EUR-Lex OJ + COM proposals, OEIL, Bundestag DIP, JORF, Gazzetta Ufficiale, EIF calls, closing consultations, change-watches on core programme pages, core/EU news. Live research: OUT programmes, the long tail, news >90 days, statute text beyond the core, people's current posts (verified at use, stored only as cited register entries).
