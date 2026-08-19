# Resume here — 2026-08-19, ~17:00

**A snapshot, not a standing document.** If the date above is old, trust
`project-mgmt/findings/one_funnel/latest.md` and `git log` over anything here.

## The number

**39.0% at six rows**, n=897, run `2026-08-18T22:14`, draw `13cb71cf3a1d1847`,
`ranker: all 819 request(s) on EMBEDDING`.

**It is UNDERSTATED and the dashboard now says so.** The funnel builds the
instant screen's pool and then reports the memo's ordering out of it, with
`discoverAndResearch` stubbed out — a stage production runs on every brief.

**And it cannot be made faithful at any price.** Run the same founder through
that stage twice and it answers differently **nine times in twelve**. A faithful
funnel would print a new number daily and compare to nothing already published.
Reproducible-and-understated is the deliberate trade. `check_stage_declaration`
now forces any harness that stubs a production stage to say so in its output.

**NORTH STAR 86-90%**, milestone 50, goal 60. Both live once in
`refresh.py`; the north star is `reachCeiling`, derived, never typed. Note
`reachCeiling` is downstream of the stub.

## READ THIS BEFORE MEASURING ANYTHING

**NEVER score an ordering change on EXACT@6 alone.** Its half-width **floors near
4.1 points at any affordable price** and only 666 of 897 founders are reachable
at all. Twice today it called a real effect a null. Reciprocal rank is the
sensitive instrument — but wsIJ showed recip is the *wrong* primary for an arm
that is recip-neutral by construction, and wsIL showed the right primary can be
neither. **Argue the primary; never copy it.**

**Trace the READER before measuring the lever.** Eleven routes measured dead and
every one failed the same way: the consumer had already stopped reading it, and
the comment above it was the last thing still claiming otherwise. See
`project_dead_route_pattern` in memory.

**A key may only be priced on a population where it FIRES.** The `usedInField`
tier carried a "costs 51→49" note measured on a run where the key was false on
every row. `check_field_tier_priced` guards it now.

**The prompt is a function of the corpus statistic it measures** —
`poolRecall.ts:189` tells the model its own base rate, and that curve moved
between two preregistrations. Pin it by hash or the run is void.

## The strategy, corrected today

**The "LLM ordering is a wash" verdict is WITHDRAWN. It was our ruler.** On
reciprocal rank both paid runs are **positive and clear of zero** (+0.0739,
+0.0716), positive in **60/60** leave-one-regime-out, where the binary was 29/60
and crossed sign between runs.

**The one live candidate:** `AGENT_SELECT_ABSTAIN` — publish the model's order
only when its own first pick is not the row we offered first. **+4.96 EXACT@6,
60/60 LORO**, interval touches zero. **Confirmable FREE** alongside whatever is
bought next, because it applies after the reply is parsed. Default off.
`project-mgmt/wsIJ_prereg.md`.

## Waiting on the owner

1. **The promotion.** `make pull-db` then `promote_to_record.py --file
   data/db.sqlite` (dry run, then `--apply`). Local is a **superset on every
   table** — verified. His standing rule caught a stale union file that would
   have reverted his own corrections; it is renamed `STALE_DO_NOT_PUSH_*`.
   **The row-level gate does NOT protect column values.**
2. **Two German branch rules** — ~8,000 assessments, all toward open.
   `wsih_de_branch_corrections_2026-08-19.jsonl`, prepared, unapplied.
3. **Innovasjon Norge** — our six leaves are the funder's *category* column; the
   real offers are in a second column we never loaded. Name / re-split / collapse.
   155 founders gain a seat, 12 recover their won fund.
4. **The classifier backlog** — ~USD 5.40, 14,604 companies (10% of the shipped
   index) with a sector and no sub-sector. 113 of the 897.
5. **The one purchase worth making** — EUR 15-18, research-only paired subsample
   n≈60, twice per founder, against its own noise floor.

## Rules that cost something when broken

- `npm run stages` is **~2 hours at n=897** and it is `scripts/measure_funnel.ts`,
  **not** `_wsgd_stages.ts` — two briefs named the wrong file.
- `NO_PG=1` is **forbidden**. Any script reading `DATABASE_URL`/`VOYAGE_KEY` must
  `requireCredentials(...)`; a **half-declaration passes the gate and still ranks
  lexically**.
- **`npm run shadow` DOES NOT EXIST.** `npm run trace` does.
- **`npm run check --only=<label>` does not honour `--only`** — it runs all 61.
- **Never move a floor, tolerance or ceiling.** When a change *improves* one,
  lower it in the same commit — `check_channel_prior_complete` demanded exactly
  that today and it is the behaviour to copy.
- **Never delete data or structure.** Union and insert-only.
- **Agents do not touch Railway service configuration.** One took the weekly ETL
  down for 75 minutes.
- Agents **commit incrementally**, own worktree via `scripts/agent-worktree.sh`.
