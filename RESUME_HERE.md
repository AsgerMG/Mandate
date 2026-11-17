# RESUME HERE

One page: the current state, what is in flight, and what is next. The full history
(5-16 Nov) is archived in `docs/history/RESUME_HERE_2026-11-05_to_11-16.md`.

## Read first
- **The plan:** `mandate/plans/master_plan.md` (the "Decided" block, the brain factory,
  phases, rules incl. 4b "a brain, not an encyclopedia").
- **Owner's standing rules:** my memory index (build order data -> brains -> wiring ->
  exposure; own the first 80%, owner adds the senior 20%; finish before moving on;
  essence not literal; never commit -a; status table + "what I need from you" every update).
- **Scope:** CORE DE, IT, FR, EU, UK; HUBS SE, DK, NO, NL, BE, ES; the rest out.

## Where we are (16 Nov 2026)
**Foundation (done):** one Railway Postgres (schemas capital, policy, mandate, grounding),
one bucket, one embedding model, one weekly refresh (Sundays 03:00 UTC), health monitor,
all four CI workflows green, preflight runs all four before every push.
**Production data:** Italy deciding core and the EIFO/InvestEU core (incl. the
intermediaries table, 60 rows) live; 597 PDFs' text backfilled; dead weight archived.
**API budget OFF** (`LLM_BUDGET=off`): the brains run on the bench (Claude Code plan).
**Brains:**
- Wincent: playbook as general habits (`mandate/playbooks/funding-routes.md` §1-§5, no
  named answers), named examples in the case library (`mandate/eval/cases/`), pre-send
  checklist, case board required from the options stage, process + leverage maps.
- Regina: consultant conversation mode, bench agent, 4 expert cases
  (`regina_edtech_fr_expansion`, `regina_search_engine_dma`, `regina_travel_google_dma`,
  `ai_kids_regulatory`), interview guide `mandate/playbooks/interviews/regina_sme_interview.md`.
**Evaluation:** judge, leave-one-out case library, calibration (3 owner points, 0
numeric grades), held-out cases, data-gap miner (`mandate/eval/data_asks.md`).
Honest scores (leave-one-out, indicative): fintech 4 (after iter 2), forklift 4;
held-out ai_hiring 4, bnpl 4, marketplace_espr 3, hardware_nl 3, deeptech_fr 2, uk_scaleup 2. Report: `mandate/plans/fable_report.md`.
**Bench app** (`cd ~/Mandate/web && MANDATE_BENCH_LOCAL=1 npm run dev` ->
localhost:3000/bench): chat with Wincent/Regina (local Whisper), case board (routes,
funding stack, roadmap, mechanisms, process + leverage maps, stakeholders), Train
(feedback inbox, distil, re-test, interviews, review runs as chats with per-reply
comments, expert review links, playbooks, progress).

## Loose ends (17 Nov evening)
WARNING: every run 13-17 Nov had NO database (bare worktrees without web/.env.local);
those scores are records, not measurements (fable_report.md, top). Guard now in the runner.

Done 17 Nov: owner round 7 committed (5 grades: 2,2,4,2,2; discovery first, short turns,
an entity with staff is an opener); judge vs owner within 1 on 4/5 (misses: rewards the
long unscoped answer). The bench is one workspace per brain, opening on Needs you.
THE CONSULTATION ARC (owner, 17 Nov) is built: method.md + agents (qualify,
investigate, options, prioritise, advise, the brief; ~25-30 messages); the case board
draws hierarchies, networks and per-step eligibility gates (fixture:
/bench/board?fixture=landscape); every conversation is judged on the case plus
arc_checks.yaml; every scripted founder runs the whole arc; `loop run` = a conversation
by default (16 brain turns), `--one-shot` the old test.
In order (all need plan usage; pace across 5-hour windows):
1. One fintech arc conversation: `PYTHONPATH=. python3 -m mandate.eval.loop converse
   fintech_guarantees --tag arc1` (~16 brain turns + judge). Read it in the bench first,
   critique, fix, then show the owner.
2. forklift, discovery_first, the two training cases (tag arc1); then the loop on them.
3. The held-out six as conversations (they need scripted founders: free to write).
4. Bench: the Re-test button still runs the one-shot mode (mandate/eval/bench_retest.py);
   move it to a short conversation. A "Write the brief" button in the chat.
5. Preflight tests the working tree, not the commit: it passed edc8257e with an
   uncommitted test fix (CI for that one commit fails). Make it refuse a dirty tree in
   a worktree, or test `git stash`-free from the commit.
Parked: `agent-on-railway` and Fable (API budget); the Regina interview (trigger).

## Waiting on the owner
- Review the kept loop change: `mandate/eval/loop/proposals/02_status_unlocks.md`.
- Spend limit: raise, or pace to the 5-hour windows.
- A few numeric grades (Train -> Review runs) so the judge can calibrate.
- Home copy: "advise and draft; you decide and send" instead of "do not draft"?
- 11 open Dependabot PRs (live folders): merge or leave.
