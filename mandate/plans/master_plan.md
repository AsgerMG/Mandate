# Mandate: the end-to-end plan

From an expert's instinct to a working public-affairs operating system, Wincent first,
then every other domain the same way. Written 2026-11-10. Builds on three measured
inputs: `mandate/brains/wincent/alignment.md` (can Wincent do the method with our
data?), `mandate/plans/pa_os.md` (the OS: workflows, screens, JEV loop, evals) and
`mandate/plans/simplification_review.md` (what the codebase needs and does not).

---

## 0. The whole thing in one paragraph

A public-affairs team runs client **mandates**. Mandate gives that team **brains**:
specialists that think like a senior practitioner in one domain (Wincent: public
capital; Regina: EU law and policy; more later). A brain is made from **an expert's
method** (interviews), **grounded data** (official sources, every claim cited) and
**tools** that let it use that data in conversation. **JEV** watches the outside world
and decides what is worth a brain's time; the brain assesses it for each mandate and
proposes an action; **a human decides and sends**. We know it works when the team would
send its output with light edits. That is the only test that counts, so every piece is
tested as real PA work, graded by the owner.

## 1. Where we are (10 Nov 2026)

| Layer | State | Evidence |
|---|---|---|
| Foundation (one database, one source library, one model, one weekly refresh, health) | **Done** | Run 116 ok; census green; weekly cron restored; ~1.3 GB of duplicates archived and dropped |
| Wincent's method | **Captured** | `funding-routes.md` from two interview rounds; persona; 2 eval cases |
| Wincent's data | **One side of three** | Alignment: 3 of 21 moves served, 9 partly, 9 missing. Grants/beneficiaries yes; lender rules, people, startup finance no |
| Conversation | **Works, untested by the owner** | Live advisor (mandate-api + mission route); one fintech run: 53 citations, all resolved |
| Regina | Data strong, method absent | 11.6k documents, 125k cited passages; no interview, no playbook |
| JEV / monitoring | Designed, not built | pa_os section 4 |
| Interface | Owner's visual session (figures, workspace demo) | Not wired to real data |
| Blocking today | **Anthropic credit exhausted** (the live advisor is down); capital CI red 40 runs in a row (legacy checks) | |

**The honest diagnosis.** The architecture is right and small (8 parts). What slowed us
was (1) the retired one-pager product still wrapped around it (~22k lines, 30 build
checks: the source of most red builds and emails), and (2) brains running on one side
of the data their method needs. Neither needs a rebuild. The first is an archive job;
the second is a data roadmap that the alignment audit has already ranked.

## 2. The brain factory: one loop, every domain

Every brain, Wincent now and Regina next, is built and improved by the same six-step
loop. This is the core of the plan: it is how expertise becomes software, and it is what
scales to new domains.

```
 1 INTERVIEW  ->  2 PLAYBOOK  ->  3 CASES  ->  4 RUN + GRADE  ->  5 ALIGN  ->  6 FEED
 the expert      the method      scripted     the brain does      which move   new data
 (owner/SME)     in markdown     mandates     the case; owner     lacks which  stream into
                 (committed)     with model   grades 1-5 and      data/tool?   grounding,
                                 answers      edits the output                 then a tool
       ^                                                                          |
       +-------------------- repeat until the pass bars hold ---------------------+
```

1. **Interview** (owner or a subject-matter expert, ~45-60 min per job type): how a
   senior works, the questions they ask first, the traps, the deal-breakers, the people,
   the tone, what great looks like. Mentality, not encyclopedia.
2. **Playbook** (`mandate/playbooks/<job>.md`): the method, loaded by the brain.
3. **Cases** (`mandate/eval/scenarios/*.yaml`): real-shaped mandates with must / must-not
   checkpoints and the expert's model answer.
4. **Run and grade**: the brain works the case through the normal conversation; the
   owner grades (5 = send as is ... 1 = wrong) and edits. The edit is stored; a Claude
   judge pre-grades and is trusted alone only once it agrees with the owner >= 80%.
5. **Align**: for each move in the playbook, is there data and a tool? (alignment.md is
   the template.) Gaps become a ranked list of data streams.
6. **Feed**: each stream follows one recipe: official source -> grounding (cited,
   versioned) -> a table or tool the brain calls -> re-run the cases -> measure the
   delta. A stream that does not move a grade is not loaded further.

A brain "graduates" a workflow when it clears the bars in section 6.

## 3. The phases

Dates assume ~3 focused sessions a week and the owner's ~1-2 hours a week of interviews
and grading. Each phase has an exit test; nothing starts on top of a phase that has not
passed it.

### Phase 0. Clear the decks (this week, ~2 sessions)
Goal: green builds, quiet inbox, live advisor, nothing legacy left to trip on.
- **Owner:** top up the Anthropic account and set a spend alert.
- **Archive the retired one-pager product** (review 3a, plus 3b's /brief surfaces if
  approved): ~75 files, ~22k lines, 30 CI steps, the recall test data. Archived, not
  deleted: a git tag plus the bucket for any measurement record.
- **Split web CI from capital CI; one health monitor instead of four.** Builds from
  ~20 min to ~4; one issue tracks health.
- **Railway config migration** (deadline 1 Dec): settings move from `railway.json` to
  Railway's new format, start commands verified.
- **Per-workspace spend ledger** in `mandate` (replaces the IP quota in `capital`).
- Exit: every CI workflow green 5 days running; no alert email that is not a real
  problem; the advisor answers a live mission.

### Phase 1. Wincent pilot through plain conversation (weeks 1-2)
Goal: the owner talks to Wincent about real-shaped cases and grades what comes back.
- **A plain internal chat page** (team-only, key-protected) on the existing mission
  route: conversation on the left, what landed (decisions, flags, actions, drafts) on
  the right. This is pa_os screen S4 in raw form; the owner's visual session styles it
  later. No portfolio, no inbox yet.
- **Three fixes the alignment run exposed:** Mandate must ask the structure questions
  first (it skipped them twice); add `licencesHeld` and `raisingNow` to the profile;
  `find_instruments` must search guarantees as guarantees.
- **Interview round 3, by grading:** the owner grades the fintech and edtech runs;
  every correction goes into the playbook. **Round 4:** three new cases (public
  procurement, a rule change mid-process, "don't do this yet").
- Exit: the owner has graded 2 rounds of 4 cases; ask-first happens 100% of the time;
  median grade measured (the baseline, whatever it is).

### Phase 2. Wire Wincent to the data its method needs (weeks 2-5)
Goal: the 9 missing moves become served from our own grounded data, not live web research.
Streams, in the order the alignment ranked them, each through the factory's step 6:
1. **People and institutions**: EU Whoiswho + EU Transparency Register (+ German
   Lobbyregister, French HATVP) into the actors register; weekly. Unlocks P1/P2,
   institution maps, outreach, the lobby-register step, and the trust-AI case.
2. **Lender-side rules and banking law** into grounding: KWG, the Code monetaire et
   financier monopoly articles, TUB 106-107, MCC operating rules, Bpifrance guarantee
   conditions, EIF InvestEU calls, the European Competitiveness Fund proposal; monthly.
3. **Lender precedents**: EIF/EIB signature lists; weekly.
4. Startup finance (matchmaking loans, venture debt, start-up loans: ENISA, Bpifrance,
   KfW/ERP, Invitalia, Innovate UK), country by country; quarterly.
5. R&D tax-credit statutes (CIR, FZulG, Spain, Italy, NL); yearly.
6. Export-credit agencies and market entry; quarterly.
7. **A `read_agenda` tool** over the 19,963 news/signal articles we already hold.
- **Replace the old ranker with a plain search** for `find_instruments` (SQL filters +
  eligibility + vectors). This is when the remaining ~20k lines of ranker and its 5
  weekly steps are archived (review 3b).
- Exit: alignment >= 15 of 21 moves served; research calls per mission halved; cost per
  mission under EUR 1; median owner grade >= 4 on W6 (funding route plan).

### Phase 3. Workflows and JEV: from conversation to operating system (weeks 4-8)
Goal: the brain works mandates over time, not only when asked.
- **The mandate model** (pa_os section 2): portfolio, charter, files, signals and
  scores, draft versions, decision outcomes, file stakeholders. Insert-only, in `mandate`.
- **A daily worker** (a Railway job, not a page request: missions already take ~3 min
  and Vercel stops at 5) that runs triage and assessments.
- **Client separation**: every mandate's records readable only by its team (per-mandate
  scoping in mandate-api, not one shared token).
- **JEV** as in section 4, benchmarked before it is trusted.
- **The pilot workflows**: W6 funding route plan, W3 monitor-assess-recommend, W11
  targeted outreach, W9 weekly client report (pa_os D4), tested on a replayed real week.
- Exit: pa_os pass bars on all four pilot workflows, on at least 3 of the 4 scripted mandates.

### Phase 4. The interface (weeks 6-10, overlapping)
Screens arrive only when their workflow passes, in this order: S4 conversation inside a
mandate -> S3 signal inbox -> S5 draft review -> S2 mandate cockpit -> S1 portfolio
overview. The owner's visual session owns the look; I own the API each screen reads.

### Phase 5. Regina, the second brain (from week 3, in parallel)
The same factory: interview (consultation responses, enforcement watch, stakeholder
maps), playbook, cases (travel scale-up vs Google; AI Act for a kids product), alignment,
streams (a case tracker for antitrust and DMA; the media, journalist and association
layer of the actors register, which also serves the trust-AI case). Her one-pager brief
retires with Wincent's.

### Phase 6. First live mandate (around week 10)
One real mandate of the owner's team, with the client's consent, once the pilot
workflows pass on the scripted cases (pa_os D8). From here, every new domain (media,
coalitions, a sector) is another pass of the factory, not new architecture.

## 4. JEV: the monitoring and trigger loop

What it is for: the team must never miss what matters to a mandate, and never wade
through what does not. JEV (TypeSafe System One) is a cheap, fast classifier that
decides which incoming item is worth a brain's time. It does not advise; the brain does.

```
 feeds (daily) -> 1 store -> 2 prefilter -> 3 triage -> 4 threshold -> 5 assess -> 6 inbox
 EUR-Lex, EP,     grounding   free: same     JEV or      pass if     the owning    max 5 per
 consultations,   sha256,     jurisdiction,  Haiku:      relevant    brain, with   mandate per
 regulators,      no dupes    kind, vector   relevant?   and sure    the mandate's week; rest
 funds, press                 match to       urgency?    enough      context:      "below the
                              watch terms    which watch?            act / no      line",
                              (recall-first) confidence?             change        auditable
```

- **What is watched:** each mandate's watchlist, created by the brains whenever they
  recommend or park a route (the playbook already requires it) and edited by the team.
  Each watch carries short machine-readable terms (instrument, case number, institution,
  unit, jurisdiction).
- **Two speeds:** a daily worker for triage and assessment; a live fast path for rapid
  reaction (a vote, a leak, a ruling), because batch triage can take hours.
- **Learning:** every "dismiss, because..." and every audited sample becomes a labelled
  example; thresholds are tuned for >= 95% recall on what must be flagged.
- **Benchmark before trust:** ~600 real item-watch pairs from a frozen 4-week window over
  the four scripted mandates; Claude pre-labels, the owner labels 200 and settles
  disagreements. JEV is adopted if its must-flag recall is within 2 points of Claude Haiku
  (Batches) and its confidence is as well calibrated; otherwise Haiku, already in our
  stack. One `triage(item, watch_terms)` interface, so switching is one line.
- **Privacy:** watch terms are themselves client strategy. Until JEV wins the benchmark,
  triage runs on Claude only. After that, JEV sees public item text and one pooled term
  set across all mandates, never a client name, profile or plan (pa_os D2). Open checks:
  EU hosting and a data processing agreement.

## 5. How we know it works

The test is the work. Every workflow is a scripted case run through the same
conversation the team will use.
- **Automated, every run, near-free:** every citation resolves and its quote matches;
  zero unlabelled claims; the workflow saved what it must; nothing left Mandate; triage
  recall on planted events; cost and time per workflow.
- **Owner, ~45 min a week:** grade each output 1-5 ("would I send or act on this?"),
  edit the drafts (the edit is measured), and answer the pivot question per mandate-week:
  did we find something worth acting on?
- **A simulated week:** a frozen real week of items replayed, with planted events
  (an InvestEU eligibility amendment, a step in a Google case, AI Act guidance on minors)
  and near-miss distractors.

## 6. Pass bars (a workflow ships to the interface when it clears them)

- Citations: 100% resolve and match; 0 unlabelled claims.
- Owner: median grade >= 4 on that workflow across >= 3 of the 4 mandates.
- Triage: >= 95% recall on planted must-flags; <= 5 surfaced per mandate per week.
- Pivot metric: "worth acting on" in >= 3 of 4 mandate-weeks.
- Judge: agrees with the owner >= 80% before it may guard regressions alone.

## 7. Rules that keep it simple

1. **The order is fixed:** data and grounding -> brains -> brains wired to data ->
   interface last. A piece of work that does not move one of the first three waits.
2. **A brain is four things:** a compartment in the database, a refresh step, a tool
   module, a playbook. A service of its own only if it runs long jobs.
3. **One of everything:** one database, one source library, one model, one weekly
   refresh, one daily worker, one health monitor, one record keeper.
4. **Grounded or labelled:** every factual claim is cited or marked as judgement.
5. **Advise and draft; humans send.** Nothing leaves Mandate on its own.
6. **Archive, never delete.** Retired code goes to a tag; data to the bucket.
7. **Instinct over neatness:** rebuild only where the foundation is wrong (CI that is
   always red, one test env that differs from another). Small inefficiencies wait.
8. **Before a push, the same checks CI runs** (`scripts/preflight.sh`); a red build
   costs the owner an email.

## 8. Risks and what we do about them

| Risk | Mitigation | When |
|---|---|---|
| Money runs out mid-run (it did on 10 Nov) | Spend alert on the account; per-workspace budgets | Phase 0 |
| Railway stops reading `railway.json` on 1 Dec | Migrate the three services' settings | Phase 0 |
| Missions outgrow Vercel's 5-minute limit | Daily worker on Railway for long work | Phase 3 |
| One client sees another's file | Per-mandate scoping in mandate-api | Before any live mandate |
| Watch terms leak strategy to a third party | Claude-only triage until benchmark; pooled terms after | Phase 3 |
| The brain sounds right but is not | Citations verified on every run; owner grades; judge only after agreement | Always |
| More brains on thin data cost EUR 2 a question | Factory step 6: feed data before adding brains | Phase 2 onwards |

## 9. Decisions for the owner

Recommended defaults are marked; the ones asked now are the first four.
1. **Retire the one-pager product** (Wincent's /brief, Regina's brief, their checks and
   test data), archived, with /brief redirecting to /wincent. *Recommended: yes.*
2. **How the owner tests the pilot:** a plain internal chat page (recommended) vs the
   terminal.
3. **The pilot workflows:** W6 funding route plan, W3 monitor-assess, W11 outreach, W9
   weekly client report. *Recommended.*
4. **What JEV may see:** Claude-only triage until JEV wins the benchmark, then pooled
   terms only. *Recommended.*
5. A workspace is one client mandate, with a portfolio level above it. *Recommended.*
6. The owner grades the first two rounds of each workflow, then 20% spot checks.
   *Recommended.*
7. The OS is team-only; clients get exported reports. *Recommended.*
8. Stakeholder stance stored per file, for public-role people only, labelled as our
   judgement. *Recommended.*
9. One live mandate, with consent, once the pilot bars hold. *Recommended.*
10. In-tree archive folders (~73 MB) leave main for a git tag. *Recommended.*
