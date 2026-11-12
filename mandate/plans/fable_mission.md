# Mission: crack the senior-judgement loop

For a Fable session working autonomously in `~/Mandate`. Read this whole file first.

## Why this, of everything

Mandate is an operating system for a public-affairs team: brains (Wincent: public
capital; Regina: EU policy and regulation) that advise on client mandates the way a
senior practitioner does. The foundation is done: one database, a grounded source
library, a weekly refresh, a local app to talk to the brains and train them
(`web/app/bench`). What is NOT done, and what decides whether the product has value:

> **Does a brain reliably give advice a senior would send, and does it improve on its
> own from the owner's feedback, without a human hand-tuning the playbook after every run?**

Today the quality comes from the owner's interviews written into playbooks
(`mandate/playbooks/`) plus hand iteration. It works on the cases we tuned
(`mandate/eval/runs/bench/`: fintech guarantees now matches the owner's answer in all four
markets; the Italian robot case misses no must) and does not yet generalise or self-improve.
Your job is to build the loop that makes it do both.

## What "cracked" means (the bar)

1. **An owner-calibrated judge.** A grader that scores a brain's answer the way the owner
   does: 1-5 plus the must/must_not checks, with its reasons. Calibrated on every owner
   grade and model answer we have; it must agree with the owner's grade within ±1 on
   >= 80% of graded runs and catch every must_not the owner flagged. Where it cannot be
   calibrated (too little owner data), say so and design the smallest set of owner
   gradings that would calibrate it.
2. **A senior reasoning scaffold** the brains run before answering: explicit checks
   derived from the owner's habits (playbook §4d/§4e and method.md): which level has the
   open door; may we do the ACTIVITY vs may we access the SUPPORT (they are different
   questions, e.g. a credit fund may lend under AIFMD II yet guarantees still run
   through banks); which status unlocks what; is the route a reform or a lobby aim;
   sequencing; who decides (by function); what not to do yet; precedent. Short, general,
   no country or company names in the rules (owner rule: essence, not literal).
3. **A case library** of the owner's model answers and graded runs, retrieved by
   similarity and shown to the brain as worked examples ("war stories"), so instinct
   transfers through cases, not an ever-growing rulebook.
4. **The self-improvement loop, closed:** run the eval cases on the bench -> judge ->
   diagnose the weakest moves -> propose ONE playbook/scaffold change -> re-run the
   affected cases -> keep the change only if the judged score improves and nothing
   regresses -> record it. The owner reviews the accepted diffs weekly; nothing ships to
   the playbooks without passing re-test. This loop already has a UI home in the bench
   (Train: Feedback inbox, Distil, Re-test); make it actually work end to end.
5. **Generalisation proof:** 3 NEW held-out cases per brain (write them from the owner's
   method and the grounding map; do not tune on them) scoring >= 4 by the calibrated
   judge, with no must_not violated.

6. **A data-gap miner** (owner, 12 Nov: "a mechanism to identify the data that would make
   every answer better"). Every run leaves signals of missing data: claims labelled
   "unverified", live research that fetched what should be held, tools returning empty
   (no named people, no precedent, no instrument), owner "off" notes about a missing
   fact, judge deductions for missing evidence. Mine them across all runs and the
   usage log (`mandate.tool_calls`) into ONE ranked list of data asks: per ask, the kind
   (free media/news source, stakeholders/people, financial instrument intel,
   precedents, statute/rule text), the concrete official or free source, how many
   answers and owner cases it would have improved, and whether it is a one-off load,
   a feed, or better left to live research. Make it re-runnable (a command or a Train
   view in the bench) so the list refreshes as runs accumulate. It does not load data;
   it tells the owner which data earns its place (master plan rule 4b).

## What exists (read before you change anything)

- The plan and the rules: `mandate/plans/master_plan.md` (esp. section 2, the brain
  factory, and section 7 rules incl. 4b), `RESUME_HERE.md` (top section), PLATFORM.md.
- The method: `mandate/playbooks/method.md`, `funding-routes.md` (rounds 1-3b),
  `wincent.md`, `regina.md`; Regina's expert interview runs `mandate/playbooks/interviews/regina_sme_interview.md`
  (results may land while you work: incorporate them).
- The brains on the bench: `.claude/agents/wincent.md`, `regina.md`, `interviewer.md`;
  tools via `web/scripts/brain_tool.ts` (production, read-only); the local app
  `web/app/bench` and its routes (`web/app/api/bench/*`) which run
  `claude -p --agent <brain>`.
- Evidence of quality: `mandate/eval/scenarios/*.yaml` (must / must_not / model_answer),
  `mandate/eval/runs/bench/*.md` (runs, some graded), the feedback queue in
  `~/Mandate-backups/bench/` (owner ratings and notes), `mandate/eval/judge.py`,
  `runner.py`, `citations.py`.
- What the data can and cannot serve: `mandate/brains/wincent/alignment.md`,
  `grounding_map.md`, `mandate/plans/data_audit.md`.

## Hard rules (the owner's standing rules; breaking them is failure)

- **No Anthropic API spend.** The production API budget is off on purpose. Run brains
  and the judge on the bench (Claude Code, the owner's plan): `claude -p --agent ...`.
  Be economical: the owner's plan has a weekly limit. Prefer few, decisive runs; batch
  your evaluations; never loop blindly.
- **No production writes.** Read production through the existing read-only tools only.
- **Git:** work on branches in your own worktree (`git worktree add`); stage named paths
  only (never `git add -A` / `commit -a`: other sessions edit the main checkout);
  commit incrementally; run `bash scripts/preflight.sh` before every push; never force-
  push; end commit messages with your co-author line. Do not merge to main: the owner
  (or the main session) reviews and merges.
- **Archive, never delete** data or measurement records.
- **Essence, not literal:** every rule you write must hold when the country, company or
  fund is swapped. A rule that names a specific case is a patch.
- **Grounded or labelled:** never let a brain state a fact without a citation or a
  "judgement"/"unverified" label; the judge must penalise it.
- Figures are not gendered: Wincent and Regina, never he or she.

## Suggested route (yours to improve)

1. **Measure first (half a day).** Build the judge from existing owner signal; run it on
   every graded run; report agreement. Decide what extra owner gradings would calibrate
   it and prepare them as a short list (the owner grades in the bench's Grade runs).
2. **Diagnose.** On the eval cases, where exactly do answers fall short of the model
   answers: missing checks, wrong framing, tone, data gaps? Separate METHOD gaps (yours
   to fix) from DATA gaps (write them down as data asks; do not load data).
3. **Scaffold + case library.** Implement them in the agent files and playbooks (small,
   general); wire the case library retrieval into the bench agents.
4. **Close the loop** in the bench (Distil -> propose -> re-test -> keep if better),
   then run it for a few iterations and show the score trend.
5. **Prove generalisation** on held-out cases.

## Deliverables

- Branch(es) with the judge, scaffold, case library, working loop, held-out cases,
  tests, preflight green.
- The data-gap miner and its first ranked list of data asks.
- `mandate/plans/fable_report.md`: the score table before/after (per case, per brain,
  judge vs owner agreement), every accepted change with its measured effect, the
  remaining METHOD gaps, the DATA asks ranked, and the 5-10 owner gradings that would
  most improve calibration. Executive summary first (10 lines, plain words).

## Stop when

The bar above is met, or you have run out of decisive next steps, or the plan's weekly
usage nears its limit. Then write the report and stop; do not spend on marginal runs.
