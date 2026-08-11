# Archive — superseded plans, closed workstreams and one-shot probes

Nothing here is current. These are plans and investigations that were real
work at the time and that the strategy has since moved past. They are kept,
not deleted, for one reason: **a plan that was tried and abandoned is the
cheapest way to stop someone trying it again.**

**Read the index below before opening anything.** One line per file, saying
what it proved. That is the whole point of this directory: an answer without
a read.

## What made a file eligible to move here

Three tests, all mechanical, all applied before the move:

1. **No code, CI step, Makefile target or check reads it.** Files in
   `project-mgmt/` that something running reads stayed where they are —
   `RESUME_HERE.md` (`check_published_figures.ts`), `europe_scope.md` (the
   scope module and `sanity_check.py`), `coverage.md` (written by
   `coverage_report.py`), `methodology.md`, `nace_taxonomy.md`, `llm_eval.md`,
   `notes.md`, `CONTINUE_HERE.md`, and the eight `plans/` files named in
   `lib/intelligence/` or `ETL/` comments.
2. **Every file that still points at it can be edited in the same commit.**
   A moved file that something still points at is a broken link, and broken
   links are how a repo starts lying about itself. Files pointed at from
   `website/frontend/lib/` or `ETL/` were left alone rather than reached into —
   this is why `fund_selection_state.md` stayed: `lib/intelligence/ARCHITECTURE.md`
   names it as the numbered record.
3. **It is not a live register.** `plans/backlog/` is deferred work with a
   stated revival trigger per entry, and `WORKSTREAMS.md` is the current board.
   Deferred is not abandoned; neither moved.

## Index — what each archived document proved

### The retrieval / grounding arc (2026-08-01 → 08-05), superseded by the six-step architecture

| File | What it proved |
|---|---|
| `retrieval_plan.md` | The vector index we paid for was **queried by nothing** — no read path in `lib/` or `app/` touched it. Opened the retrieval work. |
| `advisor_retrieval_plan.md` | The plan that acted on the above: every advisor claim must trace to a DB row. Superseded `retrieval_plan.md`'s open questions. |
| `policy_grounding_implementation.md` | The signals DB holds **3,752 usable articles, not 19,281** — the rest were fetched and unusable. Build plan for grounding the memo's back half. |
| `data_corpus_judgement.md` | Verdict: the corpus is good enough for a senior advisor to act on, and **further corpus work is not the constraint**. Closed the grounding push. |
| `analyst_grounding_plan.md` | What a senior analyst needs that the corpus still cannot tell them, measured against 780 instruments. |
| `session_2026-08-01_grounding.md` | Session record, `afd00d9`→`24964b0`: named the funds, gave them rules, and found five things computed correctly that never reached a founder. |
| `fund_specific_rules_plan.md` | Guard the pipeline, name the funds, give them their own rules — measured at 932 instruments, 743 of 861 complete on six evidence axes. |
| `structuring_backend_plan.md` | A capital-**structuring** answer needs things the corpus does not hold; the product, not the corpus, was the gap. |
| `substreams_and_refresh_plan.md` | Carrying source identifiers through unchanged matters more than the coverage numbers suggest. Phase 4 gate. |

### The ranking / intake arc (2026-08-05 → 08-09), closed by measurement

| File | What it proved |
|---|---|
| `screen_one_discrimination_plan.md` | Three levers measured, **two dead**; corpus enrichment is DEAD for ranking. Its surviving lever (rebuilding founder descriptions) was itself later measured dead — see the dead-route register in `lib/intelligence/ARCHITECTURE.md`. |
| `two_gate_strategy.md` | Overturned the above's "no demonstrated route" conclusion: the four levers shared one assumption and the assumption was the problem. |
| `intake_architecture.md` | What actually drives screen one and the adaptive round, read from the code rather than the docstrings. |
| `right_fund_95_plan.md` | **The 95% in its own title is not achievable**, measured not argued: 65.9% EXACT@5 under full founder information, 58.3% CEILING@5 as the planning number. Do not subtract them — different metrics, different populations. |
| `scheme_text_corpus_plan.md` | Gave 496 national schemes their own text, with an explicit "already exhausted, do not re-try" section and an active-schemes-only fetch rule. |

### Closed country / coverage workstreams

| File | What it proved |
|---|---|
| `workstream_l_france.md` | FR per-leaf eligibility coverage; scope narrowed to FR mid-task, one artifact kept from before the narrowing. |
| `workstream_L_ES_findings.md` | The shape of the Spanish corpus — read before proposing a Spain fix. Only 6 of 93 leaves will ever carry text. |
| `workstream_L_no_eu.md` | NO + EU-level instruments, 141 rows, both populations at 0% `eligibility_text` at start. |
| `workstream_U_eu_discriminator.md` | The EU discriminator one level below the boilerplate; EU is ~8% of the leaf-weighted global metric. |
| `gap_analysis_2026.md` | Point-in-time coverage audit (June 2026) against the full universe of EU vehicles. Section 6 is the channel-completeness audit that found the **equity channel effectively absent**. |
| `cdti_discovery_notes.md` | CDTI: Imperva blocked the portal, the BDNS API did not. **RESOLVED** — 1,880 events / €1.04B loaded. |
| `sprint_17_coverage_recovery.md` | Completed sprint plan — the national loads that landed Innovasjon Norge, NFR, Innosuisse, TAČR, EIS, ALTUM. |
| `sprint_19_equity_tickets.md` | Completed sprint plan — `public_equity_stakes`, and the rule that SATR `PRVRISKFIN` rows are scheme-level aid amounts, never tickets. |
| `capital_routing_for_companies.md` | Spec for `/for-companies`, a page that no longer exists. Partially actioned: the agent rubric was augmented; the form and filter never were. |

### Probes (Python, not markdown)

`probe_eu_regimes.py`, `probe_publishable_class.py`, `probe_vinnova_rounds.py` —
one-shot steering probes kept beside the workstreams that ran them.

## What is still live, and where

The current architecture and the routes measured dead are recorded in the
repo's live documents, not here:

- `website/frontend/lib/intelligence/ARCHITECTURE.md` — the six-step
  architecture and the register of routes measured dead. Read this first.
- `project-mgmt/RESUME_HERE.md`, `CONTINUE_HERE.md`, `WORKSTREAMS.md` — state.
- `project-mgmt/findings/` and `project-mgmt/research/` — the numbered record of
  what was measured. Where a finding and `ARCHITECTURE.md` disagree about a
  measurement, the finding wins.
- `project-mgmt/plans/backlog/` — deferred, not abandoned. Each entry states
  its revival trigger.
- The progress brief is `project-mgmt/dashboard/precision.html`, regenerated
  from the database by `refresh.py` — every figure on it is derived, none typed.

## If you are about to redo something

Search here first. In particular, the ranking work in these plans was
measured to zero across ten separate routes, including an oracle that held
the answer key. That is expensive knowledge and it is written down.
