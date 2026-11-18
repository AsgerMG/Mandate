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

## Where the arc runs stand (18 Nov)
First conversations WITH the database (tag arc1, `loop.py converse <case> --tag arc1 --max-cost 25`,
run from a worktree made by scripts/agent-worktree.sh):
| case | grade | database / web cites | brief | plan cost |
|---|---|---|---|---|
| fintech_guarantees | 2 (holistic 3) | 13 / 7 | no (repeat bug, fixed) | ~33 |
| forklift_spatial_dk_de | 4 | 14 / 4 | yes | ~29 |
| discovery_first_three_questions | 4 | 5 / 10 (PT outside scope) | yes | ~27 |
| train_agritech_es_it | re-running (first try cut at 2 turns by the spend limit, kept) | | | |
| train_cleantech_se_de | next | | | |
No API money: `claude` is on the claude.ai Pro plan and the runner strips API keys; the USD figures
are plan-equivalent. Owner: keep "extra usage" off.
Safeguards now in the runner: refuses without the database; stops on a reply that reports it
unreachable; never repeats a founder answer; retries a failed call once, then saves; saves on the
usage limit; at 80% of --max-cost the founder asks for the brief; `loop.py judge-saved` grades later.
Patterns across the three graded runs (next loop proposals, method not data): turns too long (300-450
words); Wincent starts Regina's regulatory analysis before handing over; a second market or front is
parked (France, EU guarantees, Spain).
Open: the spend limit shows as a bare "claude exited 1" (saved as stopped=error, not usage_limit);
the held-out six need scripted founders before re-measuring; bench Re-test still one-shot; preflight
tests the working tree, not the commit.

## Waiting on the owner
- Review the kept loop change: `mandate/eval/loop/proposals/02_status_unlocks.md`.
- Spend limit: raise, or pace to the 5-hour windows.
- A few numeric grades (Train -> Review runs) so the judge can calibrate.
- Home copy: "advise and draft; you decide and send" instead of "do not draft"?
- 11 open Dependabot PRs (live folders): merge or leave.
