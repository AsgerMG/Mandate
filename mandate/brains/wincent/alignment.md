# Wincent vs the owner's method: can it do what a practitioner does?

Measured 2026-11-10 against production, read-only (`capital_ro`; policy API
public endpoints; mandate-api `GET /actors`). Method = `mandate/playbooks/funding-routes.md`.
Tools = `web/lib/mandate/agent/` (capital.ts, research.ts, mission.ts).

**Verdict.** Wincent can reason the method (the playbook is wired into the prompt)
and can research it live on the open web, cited. It cannot do it *from its own data*
on any of the owner's four cases. Its corpus is the **beneficiary side of grants**
(906 of 1,118 instruments are grants). The owner's method also needs three sides it
lacks: **the intermediary side** (who may lend or distribute under a scheme),
**the people side** (the actors register is empty) and **the startup-finance side**
(matchmaking loans, tax credits, export credit). Each mission today rebuilds those
from the web at about EUR 2 and 3 minutes, and nothing it finds is reused.

**Live run, 2026-11-10.** Both scenarios were sent to wincent-ai.eu. **The production
Anthropic account ran out of credit mid-run**: fintech spent EUR 1.64 on 23 tool calls,
then every model call returned `400 credit balance is too low`. Edtech failed on its first
call (EUR 0). Nothing was saved and there is no deliverable to grade. Transcripts are in
`mandate/eval/runs/alignment_2026-11-10/`. **The live advisor is down until the
account is topped up.** What the partial fintech run does show:
- Mandate did not ask the founder first. It went straight to the specialists, as in
  the 9 Nov baseline (`asked_first: false`). The structure check is skipped because the
  scenario phrasing looks "concrete enough".
- Wincent's first `find_instruments` filtered on `instrument_types: ["loan"]` for a
  guarantee question. There are 18 guarantee instruments, and none of them is in
  DE/FR/EU except one Bürgschaftsbank row.
- Its five `find_precedents` calls return, reproduced in SQL: EIF **0**, Bpifrance **0**,
  KfW **0**, Bürgschaftsbank 78, Mediocredito Centrale 14,343. All of these are SMEs
  that *received* a guarantee. None is a lender that was guaranteed.
- Everything that matters went to `research`: 3 Wincent calls plus 6 Regina calls on
  KWG, CMF, TUB, ECF and lobby registers. The 9 Nov baseline hit the research quota on
  exactly these and left DE/FR/IT "unverified".

## Moves x verdict

| # | Move (playbook §) | What serves it | Measured in production | Verdict |
|---|---|---|---|---|
| 1 | Structure check: legal form, establishments, licences (§1) | `profile_get`; gates on organisationType / entityCountries / region | 506 organisationType gates (359 instr.), 510 entityCountries (316), 424 region (305). **The profile has no field for licences or regulatory status** (vocabulary: 0 "licen", 0 "regulat"). In both runs Mandate skipped the question. | PARTLY |
| 2 | Diagnose intent: raising? R&D? tax credits? new market? (§1b) | playbook + `ask_founder` | Method wired. The profile has no "raising now" field. Not exercised: the edtech run died before the first call. | PARTLY (untested) |
| 3 | Matchmaking / co-investment loans (§1b) | `find_instruments` | 3 instruments are matchmaking-shaped (IVF *préstamo participativo en coinversión*, NL *Vroegefasefinanciering*, NRW.SeedCon), plus EIB Venture Debt (late stage). **No** ENISA, Bpifrance *prêt d'amorçage*, KfW/ERP start-up lines, Invitalia Smart&Start loans or Innovate UK Innovation Loans. | MISSING |
| 4 | R&D grants (§1b) | `find_instruments`, `assess_instrument` | 533 grant instruments in DE/FR/IT/ES/NL/EU; 174k R&D award records; 754 instruments with ≥1 gate grounded (5,961 gates). | SERVED |
| 5 | R&D tax credits (§1b) | `find_instruments` | 27 tax-credit rows, but only 9 schemes in 4 countries (DE Forschungszulage repeated once per Finanzamt, IT Mezzogiorno credit, NL, GB EIS). **No FR CIR/CII, ES deducción I+D, BE, AT Forschungsprämie.** Statute text in grounding: FZulG 0, CGI 244 quater B 0. | MISSING |
| 6 | Export-credit / market entry + "apply before you enter" (§1b, §4) | `find_instruments` | 5 export-tagged instruments (LV, EE, IT), **no ECA at all** (Euler Hermes, SACE/SIMEST, Bpifrance Assurance Export, EIFO, OeKB, CESCE); 21 export award records; 0 ECA pages in grounding. | MISSING |
| 7 | Precedents, beneficiary side (§1c) | `find_precedents` | 314,063 award records. Edtech: 722 companies, 1,003 records (33 equity/risk-finance). Guarantees to SMEs: IT 14,391, HU 1,978, NO 1,526, DE 106, **FR 1**. | SERVED (grants), PARTLY (debt) |
| 8 | Precedents, intermediary side ("you guaranteed a lender like us") (§1c) | `find_precedents` | **0** EIF guarantee/counter-guarantee transactions; no EIF/InvestEU signature list loaded; alternative lenders (Silvr, Defacto, Compeon) appear only as grant/loan *recipients*. | MISSING |
| 9 | Institution mapping per level: regional, local, national, EU (§2) | `administering_body`, `scheme_operators`, `actors_register_find` | Administering body on instruments; 346 with scheme operators, 232 with delivery region. **Actors register: 0 organisations** (every query, every kind). | PARTLY |
| 10 | P1 / P2 people, political + public-capital (§2b) | `actors_register_find`; Regina `actors` | **Register: 0 people, 0 roles, 0 email formats.** Regina's actors are EP debate speakers only ("minors" → 8 MEPs; "competition", "Google", "AI Act" → 0). No Commission, ministry, NPB or ECA officials. | MISSING |
| 11 | Outreach drafting, tailored to the person's function and agenda (§3) | the model; `suggest_email` | The model can draft. There is no person data to tailor to, and `suggest_email` has 0 formats to apply. Drafts can only go to "head of guarantees, name unknown". | PARTLY |
| 12 | Deal-breaker: formal applicant type / intermediary status (§4) | gates G2/G4, `fund_requirements` | Corpus is beneficiary-side. Gates mentioning licence / credit institution: 40 (28 instr.); "financial intermediary": 30 (17); house-bank / via-bank: 11 (7, mostly Latvia); `bankRelationship` field: 9 (7). | MISSING |
| 13 | Germany: Hausbank, KfW, Bürgschaftsbanken | instruments + grounding | 2 KfW instruments, 1 Bürgschaftsbank (Rückbürgschaften, 60 awards); 5 kfw.de pages, 1 VDB page. **KWG text 0.** | PARTLY |
| 14 | Italy: Art. 106 TUB, Fondo di Garanzia | instruments + grounding | 5 Fondo di Garanzia instruments, 14k award records. **TUB text 0; MCC Disposizioni operative 0.** | PARTLY |
| 15 | France: Bpifrance guarantees, Code monétaire et financier | instruments + grounding | 3 Bpifrance instruments, all innovation grants; **0 guarantee products; 0 Légifrance documents;** 1 FR guarantee award. | MISSING |
| 16 | EU: InvestEU / EIF → European Competitiveness Fund watch | instruments, grounding, signals | **0 EIF instruments, 0 eif.org pages, 0 InvestEU calls.** ECF: one press release in grounding; signals have `eif_news`, `ec_grow_ecf` and `ep_train_ecf` sources, but **no Wincent tool reads signals**. | MISSING (data), research-only |
| 17 | Sequencing (incentive effect, register before lobbying, apply before entering) (§4) | G6 gates, scheme dates | 29 gates on incentive effect / before start; 704 instruments with an end date; 54 with a successor scheme. EU Transparency Register: 0 documents. | PARTLY |
| 18 | Processes: channel, portal, deadline, documents (§4) | `application_route` | 285 instruments with a curated route row, 109 with an application URL; route marked uncited. | PARTLY |
| 19 | Agenda reading per institution and region (§3b) | none in Wincent's tools | 19,963 signal articles from 64 sources (EU, DE, FR, IT, IE), **not exposed to Wincent**. Regional strategies (e.g. Bavaria robotics, S3): 0. The 24 regional pages are instrument rules, not agendas. | MISSING |
| 20 | Watchlist: every route recommended or parked (§4b) | `save_watch` | The tool works (baseline saved 5 watches). Nothing re-checks a watched route when a rule changes. | PARTLY |
| 21 | Converge with Regina on regulated activity (§1b) | `consult_regina` | AI Act, GDPR and DSA in grounding; Regina returns DMA/Google enforcement (5 hits) and AI-in-education texts. | SERVED |

**Tally: 3 SERVED, 9 PARTLY, 9 MISSING.**

**Owner's cases.** *Fintech guarantees*: moves 8, 12, 15, 16 MISSING, so it is research-only.
*Edtech for kids*: grants and Regina are served. Matchmaking, tax credits and export are
MISSING. *Travel scale-up vs Google*: mostly Regina, who has the DMA decisions; Wincent's
only part (public customers, people) hits the empty register. *Trust-AI startup needing
media, journalists and parent associations*: **nothing**. No actors, no media, no associations.

## New data streams, ranked by moves unlocked x cases served

| Rank | Stream | Official sources | Moves | Cases | Load |
|---|---|---|---|---|---|
| 1 | **Actors: institutions, units, named officials, associations, media** | EU Whoiswho (op.europa.eu, open-data dump); EU Transparency Register (data.europa.eu XML; also lists parent/consumer associations and media orgs); org pages of KfW, Bpifrance, MCC, EIF, SACE, the Landesförderinstitute; German Lobbyregister, French HATVP répertoire | 9, 10, 11, 17, 19 | all 4 | One-off seed, then **weekly** (Whoiswho and the TR change weekly) |
| 2 | **Intermediary-side scheme rules + national banking law** | KfW Merkblätter + VDB Rückbürgschaft rules; MCC *Disposizioni operative* (fondidigaranzia.it); Bpifrance guarantee *conditions générales*; Légifrance API (CMF L.511-1/-5/-6); gesetze-im-internet.de (KWG §1, §32); Banca d'Italia TUB Art. 106-107 + *albo*; EIF InvestEU open calls (eif.org) and the ECF proposal COM(2025) 555 | 1, 12, 13, 14, 15, 16, 17 | fintech (+ every lender or distributor) | One-off load into grounding, **monthly** re-fetch (versions by sha256 show changes) |
| 3 | **Intermediary transaction lists (precedents for lenders and funds)** | EIF "where to find financing" intermediary list + InvestEU/COSME/EaSI signature press releases; EIB project list; Bpifrance/KfW annual partner lists | 8, 11, 16 | fintech; any "you did it before" outreach | One-off backfill, **weekly** (EIF publishes new signatures continuously) |
| 4 | **Startup-finance instruments: matchmaking, venture debt, start-up loans** | ENISA; Bpifrance *prêt d'amorçage* / French Tech Seed; KfW Capital + ERP start-up lines; HTGF; Invitalia Smart&Start; Innovate UK Innovation Loans; EIFO; Business Finland; EIC Fund rules | 2, 3, 7 | edtech, trust-AI (EUR 2M raise) | One-off per country, **quarterly** refresh |
| 5 | **R&D tax-credit statutes** | FR CGI art. 244 quater B (CIR/CII, Légifrance); DE FZulG (gesetze-im-internet); ES LIS art. 35 (BOE); IT L. 190/2014 + credito R&S (Agenzia Entrate); NL WBSO (RVO); BE; AT §108c EStG | 2, 5, 17 | edtech, trust-AI | One-off; **yearly** (finance acts) |
| 6 | **Export-credit agencies and market-entry support** | OECD list of ECAs / Berne Union members; Euler Hermes (exportkreditgarantien.de), SACE + SIMEST, Bpifrance Assurance Export, EIFO, OeKB, CESCE, Atradius DSB; Team France Export, GTAI, ICE | 6, 17 | edtech, travel scale-up | One-off, **quarterly** |
| 7 | **Agenda feed exposed to Wincent + regional strategies** | the existing 64 signal sources (a tool, not new data); EC S3 platform (regional smart-specialisation strategies); Land / Région strategy pages | 19, 20, 11 | all 4 | Already weekly; S3 one-off, **yearly** |

## What to build first

- **Top up the production Anthropic account and set a spend alert.** The live advisor is
  down. Without it nothing below can be measured. Re-run both scenarios afterwards
  (about EUR 4).
- **Seed the actors register from EU Whoiswho + the Transparency Register.** This fills
  the store that is completely empty. It unlocks P1/P2, institution mapping, outreach,
  the lobby-register sequencing step and the trust-AI case in one load, and feeds
  `actors_register_find` with no tool change.
- **Load the intermediary rules and banking law into grounding.** KWG, the CMF monopoly
  articles, TUB 106-107, MCC *Disposizioni operative*, Bpifrance guarantee conditions,
  EIF InvestEU calls, and the ECF proposal. Every fintech deal-breaker then becomes a
  `[cN]` from the store instead of a research call that runs out of quota.
- **Add two profile fields and make Mandate ask.** `licencesHeld` and `raisingNow` (round
  size, close date) go into the vocabulary. The mission must call `ask_founder` when they
  are absent on a funding-routes job. Today it skips the structure check in both runs.
- **Wire signals and an intermediary precedent source to Wincent.** Add a
  `read_agenda(institution | region)` tool over the 19,963 existing articles. Load the
  EIF signature list so `find_precedents(institution="EIF")` stops returning 0. Then add
  the matchmaking, tax-credit and ECA instruments (streams 4-6), country by country,
  starting with DE/FR/IT/ES.
