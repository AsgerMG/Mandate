# RESUME HERE

One page: the current state, what is in flight, and what is next. The full history
(5-16 Nov) is archived in `docs/history/RESUME_HERE_2026-11-05_to_11-16.md`.

## Stopped 16 Nov on budget (two branches pushed, NOT merged; review then merge)
- `measure-heldout` (14065b78): held-out median 3 vs the bar of 4 (Regina ai_hiring 4,
  bnpl 4, marketplace_espr 3; Wincent hardware_nl 3, deeptech_fr 2, uk_scaleup 2; the
  judge is uncalibrated, so these are indicative). Boards are valid, but 0 process maps
  survive: the brain omits `explains`. Left: judge the fintech and forklift transcripts
  in runs/loop/measure/. Top fixes: emit `explains`, an answer of 3 lines or fewer, the
  deciding gate first, cite the second country and the regional layer.
- `simulated-conversations` (2fa7e06d): client.md, scripted founders for 9 cases,
  `loop.py converse`, the Review runs view, test-run isolation (14 junk runs archived).
  Left: the 4-turn fintech smoke conversation and screenshots. Merge it soon: until it
  is on main, pytest in old checkouts keeps writing junk runs.

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
Honest scores so far: fintech 3, forklift 4, held-out: ai_hiring 4, bnpl 4,
deeptech_fr 2, hardware_nl 2-3. Report: `mandate/plans/fable_report.md`.
**Bench app** (`cd ~/Mandate/web && MANDATE_BENCH_LOCAL=1 npm run dev` ->
localhost:3000/bench): chat with Wincent/Regina (local Whisper), case board (routes,
funding stack, roadmap, mechanisms, process + leverage maps, stakeholders), Train
(feedback inbox, distil, re-test, interviews, review runs as chats with per-reply
comments, expert review links, playbooks, progress).

## In flight (branches, not merged)
- `measure-heldout`: remaining held-out runs + live board/process-map check + verdict.
- `simulated-conversations`: scripted 5-10 message client conversations per case,
  converse runner, test-pollution fix, Review runs list quality.
- `bench-loop-wiring`: MERGED 16 Nov (judge in Re-test, Keep/Revert). Left: the
  click-through (Off -> Feedback -> Distil -> Accept; headless Chrome's fake mic gives
  silence, so test the recorder by hand or post a clip).
- `agent-on-railway`: PARKED until API budget (design only).

## Next
1. Merge the three in-flight branches when they report (review first).
2. Full re-run of every case as scripted conversations; Regina's 4 runs into an expert
   review set (`/bench/review/<id>`) before the expert interview.
3. Fix what the measurement shows (method vs data); load the next deciding core from
   `data_asks.md` only where it moves a graded case.
4. Fable: parked until budget; best used on a hard design problem.

## Waiting on the owner
- `bash ~/Mandate/mandate/ops/finish_railway_config.sh` (before 1 Dec; Regina's last
  settings onto the service).
- Spend limit: raise, or pace to the 5-hour windows.
- A few numeric grades (Train -> Review runs) so the judge can calibrate.
- Home copy: "advise and draft; you decide and send" instead of "do not draft"?
- 11 open Dependabot PRs (live folders): merge or leave.
