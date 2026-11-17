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

## Loose ends (17 Nov; owner: "finish all of this, you choose the sequencing")
Done 16-17 Nov: measure-heldout, simulated-conversations, bench-loop-wiring merged;
case board reader repairs near-misses (maps, over-long answers, a need without a
figure: replay of all 18 saved boards drops nothing); fintech and forklift judged
(3, 4); loop iter 2 KEPT (method.md check 3): fintech 3 -> 4.
In order:
1. Loop iter 3: check 4 (reform or lobby aim) as a research step; fintech must_3.
2. Re-measure the held-out six once (untouched by tuning). Bar: median 4; today 3.
3. First simulated conversation (fintech, 4 turns) via `loop.py converse`.
4. Every case as a scripted conversation; Regina's 4 into an expert review set
   before the interview. ~60-80 bench calls: pace across 5-hour windows.
5. Owner by hand: the click-through (Off -> Feedback -> Distil -> Accept) and the
   recorder (headless Chrome's fake mic gives silence).
Parked: `agent-on-railway` and Fable (API budget); the Regina interview (trigger).

## Waiting on the owner
- Review the kept loop change: `mandate/eval/loop/proposals/02_status_unlocks.md`.
- Spend limit: raise, or pace to the 5-hour windows.
- A few numeric grades (Train -> Review runs) so the judge can calibrate.
- Home copy: "advise and draft; you decide and send" instead of "do not draft"?
- 11 open Dependabot PRs (live folders): merge or leave.
