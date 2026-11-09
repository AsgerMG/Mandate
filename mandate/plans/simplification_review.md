# Simplification review: the simplest rock-solid Mandate

Read-only review of the whole monorepo, measured 2026-11-10 (wc -l, git ls-files,
git log, the Actions API, and an import graph over `web/`). Nothing was changed.
Input to `mandate/plans/master_plan.md`.

## 1. The system on one page

| # | Part | What it does | Where |
|---|---|---|---|
| 1 | Source library | Every official document we cite, stored once by fingerprint, with every fetch date; split into quotable passages with vectors. Append-only. | `mandate/grounding`, schema `grounding`, bucket `mandate-grounding` |
| 2 | One database | One Postgres, one compartment per brain (`capital`, `policy`, `mandate`); each brain writes only its own. | Railway `pgvector`, `mandate/db/roles.sql` |
| 3 | Weekly refresh | One Sunday job: pull every source, rebuild, embed, refresh Regina, build site data, record every step. | `mandate/refresh/run.py` -> `capital/ETL/events/extract/railway_cron.py` |
| 4 | Brains | Knowledge + tools + a playbook of how a practitioner works. Wincent: tools over `capital`. Regina: her API over `policy`. | `web/lib/mandate/agent/capital.ts`, `policy/etl/api.py`, `mandate/playbooks/` |
| 5 | Record keeper | The only writer of client work (profiles, missions, decisions, actions, watches, actors); checks citations. | `mandate/api` |
| 6 | Orchestrator | Mandate takes a question, consults the brains, returns a cited answer and saved next steps. | `web/lib/mandate/agent/`, `web/app/api/mandate/mission` |
| 7 | Site | Public pages + the conversation endpoint. | `web/` on Vercel |
| 8 | Health + evals | A daily check that every brain is current; scripted client cases graded by the owner. | `mandate/health`, `mandate/eval` |

Shared contracts (one vocabulary, one company profile, one embedding model) are sound and small.

## 2. Keep

`mandate/*` (db, grounding, embedding, vocabulary, profile, llm/batch, runs, artefacts,
refresh, health, api, eval, playbooks, tests); `web/lib/mandate/**` + the mission route;
the capital extractors, terms encoders, curated rule YAMLs (403), reference data,
news/signals; `policy/etl`, `policy/data`, `policy/tests`; mandate-ci, policy-ci,
mandate-health; from capital-ci the typecheck/vitest/lint/build/boundary/vocabulary
steps and the ETL unit tests. Guards worth keeping: `census`, `store_schema`,
`corpus_marks`, `offerable_decay`, `applicant_identity`; nightly `check_extracted_quotes`
and `check_prod_corpus`.

## 3. Cut or archive

**Correction to the brief:** the agent's `find_instruments` imports `computeVerdict`,
which pulls in 66 of 171 `web/lib/intelligence` files (28,044 lines): the old gate-1
ranker is "retired as a product, live as a search engine". Without it the agent needs
24 files (8,265 lines).

### (a) Safe to archive now (a reader was checked for every item)

| Item | Size | Read by | Risk |
|---|---|---|---|
| 30 brief-only capital-ci checks (`check_contracts`, `recall_floor`, `hydration_parity`, `degradation`, `memo_table`, `answer_reach`, ... ) | 30 files, 8,693 lines | capital-ci, `run_checks.mjs` only | Low; `recall_floor` alone is 6.75 min per run |
| Brief-only nightly checks + the corpus-currency workflow | ~7 files, ~2,400 lines, 5-6 min/day | nightly only | Low; keep quote-match + prod_corpus (move into mandate-health) |
| Ranker measurement harnesses (`measure_funnel`, `memo_bench`, `trace_pool`, `measure_recall`, ...) + 10 npm scripts | 27 files, 9,699 lines | each other; 14 run nowhere | Low |
| Recall sets + leak index (`__recallSet*.json`, `profileLeakIndex.generated.json`) | 3 files, 242k lines, 11.5 MB | the checks above, one ETL leak check (3b) | Low once 3b is cut |
| `emit_profile_leak_index.py` cron step | 186 lines + 1 step | leak guards only | Low |
| `country_coverage.json`, `instrument_leaderboard.json` builders | 2 outputs | **no reader** | None |
| `capital/ETL/refresh.py` + sqlite-era Makefile targets | 630+ lines | nothing; a second runner | Low |
| `capital/project-mgmt/CONTINUE_HERE.md`, its `RESUME_HERE.md` | 1,475 lines | nothing; compete with root RESUME_HERE | None |
| Stray logs and editor files | 5 files | nothing | None |
| One-off ops scripts as their loop closes | ~13 scripts, ~550 lines | `next.sh`, open loops | Archive in the closing commit |

**Total: ~75 files, ~22,000 lines + 11.5 MB of recall JSON; 30 CI steps, ~7 nightly checks.**

### (b) Needs a decision

| Item | Size | Recommendation |
|---|---|---|
| The `/brief` product surface (4 pages, 4 API routes, 12 lib modules) | ~7,100 lines | Retire: archive, redirect `/brief` -> `/wincent` |
| The ranker as the agent's search (`computeVerdict` + 5 weekly prior steps + their guards) | ~20k lines, 5 cron steps | Replace with a plain search (SQL filters + `evaluateEligibility` + vectors) when Wincent's tools are reworked (plan phase 2) |
| The snapshot fallback (34 MB of JSON on every deploy, the reason for 3 parity guards) | 34 MB | Postgres as the one store; fail loudly. Decide with the ranker |
| Recall-set coupling in production ETL (`recall_holdout`, the leak gate in `load_scheme_text`) | ~3,000 lines | Remove in one deliberate change, then archive |
| Guard meta-machinery (registry, verdict feeds, red-debt, suite tiers) | ~5,000 lines | Collapse into mandate-health: one `targets.json`, one issue |
| In-tree archive folders | ~962 files, ~73 MB | Tag `archive/2026-11`, remove from main (history keeps them); owner's yes |
| Regina's one-pager brief | ~3k lines | Same product shape as /brief: retire with it |
| Policy's local embedded DB default | small | Require a real DATABASE_URL |

### (c) Keep for now
Ranker priors (until the search decision); 85 capital files still importing sqlite3
(none on the cron path); project-mgmt history.

**CI today:** capital CI used 408 wall-minutes in 46 runs since 6 Nov (~80% of all
Actions minutes) and **has not passed in its last 40 runs**. With the brief checks gone
and the prebuild fetching the weekly artefact release instead of rebuilding: ~3-5 min.

## 4. Simplify the structure

1. **Split web CI from capital CI** (`web-ci.yml` ~3 min; slim `capital-ci.yml` ~1 min). Half a day. Now: an always-red check protects nothing.
2. **One health monitor instead of four** (mandate-health over `targets.json` + the 5 kept guards + quote match). 1 day. Now.
3. **One `mandate/brains.json`** read by roles, nav, health, CI filters, cron lists. 1-2 days. When brain 3 arrives.
4. **A brain is schema + refresh step + tool module + playbook**; a service only for long jobs. Doc change. Now.
5. **One refresh runner** (archive `ETL/refresh.py`). An hour. Now.
6. **Spend metering per workspace in `mandate`**, plus an account spend alert. 1 day. Before any client mandate.
7. **Not worth changing now:** generated vocabulary, the separate capital vector tables, the sqlite remnant ratchet.

## 5. Risks to scale (5 brains, 10 mandates, daily triage)

1. Daily triage has nowhere to run (one serial weekly job); needs its own daily worker and `mandate.signals`.
2. Vercel's 300 s ceiling: missions already take ~3 min; assessments must run in a worker.
3. No separation between clients: one shared bearer token; nothing stops one workspace reading another's records.
4. Cost: IP-based quota, no per-mandate budget, no alert (the advisor went down on 10 Nov).
5. CI cost grows with every web change while capital CI owns the web.
6. Railway stops reading `railway.json` on 1 Dec 2026.
7. Empty stores the method needs (actors, lender rules): more brains on thin data multiply EUR 2 research calls.

## 6. Executive summary

1. The working system is 8 parts: source library, one database, one weekly refresh, brains, record keeper, orchestrator, site, health/evals.
2. They are sound and small; "one database, a compartment per brain" holds.
3. Around them sits the retired one-pager product: ~22k lines, 11.5 MB of test data, 30 build checks, 6 of 11 guards.
4. That legacy is why the main build has failed 40 runs in a row and uses ~80% of build minutes.
5. Archiving it is low risk (every item checked for readers); builds drop from ~20 to ~4 min.
6. One real decision: the agent still uses the old ranker as its fund search. Replace it when Wincent's tools are reworked.
7. Fix now: split the web build from the capital build; one health monitor instead of four.
8. Do not rebuild for neatness: brain templates, vector tables, remaining sqlite code can wait.
9. Before scaling: a daily worker, per-client separation, per-client spend budgets, the Railway config move before 1 Dec.
10. What limits value today is missing data (actors, lender rules), not architecture.
