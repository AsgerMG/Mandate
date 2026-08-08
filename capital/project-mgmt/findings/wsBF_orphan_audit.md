# Workstream BF — the orphan audit

*2026-08-08. Audited on `main` at `b11ef5b3`, in a worktree.*

The brief named a class rather than a list: **something produced that nothing
consumes, something consumed that nothing produces, or something checked that
never runs.** Every serious defect of the past week was one of those, and each
was found by accident, days apart.

This is the register. Twenty-seven orphans, in five shapes. Ten are fixed here.
The rest are sequenced, and the reason for each deferral is on the record rather
than in somebody's head.

Two of them were **red at the moment they were found**, and nobody had been
told, because the guard that would have said so was itself an orphan.

---

## The two that were already failing

### `check_applicant_identity` — in no path at all

Not in CI, not in `npm run check`, not in the guard registry, not in the cron.
Its own producer (`ETL/terms/classify_applicant_identity.py:186`) tells you it
"FAILS THE BUILD". It is in no build.

Run on 2026-08-08 against Postgres:

```
check_applicant_identity: FAILED
  5 of 578 published eligibility texts describe a population that CANNOT APPLY
```

Two Latvian guarantee schemes where the financier submits, an Innovasjon Norge
cluster programme where the cluster organisation is the applicant, a UK risk-
finance scheme awarded by department, and an Irish community energy scheme whose
text expressly names the beneficiaries rather than the applicants.

**What it costs when it fires:** a founder is shown a fund, prepares an
application, and is rejected at the end for being the wrong kind of entity. That
is worse than never showing it — the effort is spent before the answer arrives.
The guard is free to run; the paid judgement is already cached in
`data/applicant_identity.json`.

### `check_index_freshness` — reachable only from a command nobody types

Its only caller is `ETL/refresh.py`, which is itself reachable only by a human
typing `make refresh`. Verified out of Postgres:

| | |
|---|---|
| attributable gates | 5,804 |
| of those, **unembedded** | **954** (16.4%) |
| instruments affected | 163 |

**What it costs:** the invariant is `retrievable == showable`. 954 gates are
things the advisor may state and cannot retrieve.

**And the reason it is red is itself an orphan.** `refresh.py` is a 23-step
serial chain that hard-stops on any non-zero exit. Step 13 is
`check_hydration_parity`, which is red on main today (confirmed, exit 1). So
steps 14–23 have not been running:

```
13. check both stores agree      <-- RED, and the chain stops here
14. embed instrument profiles    ($)   <-- the fix for the 954
15. embed eligibility            ($)   <-- the fix for the 954
16. check indexes are fresh            <-- the guard that reports the 954
17-22. persist labels, signals, site data, coverage report/dashboard
23. record the census
```

The fix sits below the blockage, and the guard that reports it sits below the
fix. This is shape 5 and shape 3 compounding: a job that runs, produces nothing,
and tells nobody.

---

## Shape 3 — checked, never runs

| # | Orphan | Status |
|---|---|---|
| 1 | `check_applicant_identity` — in nothing. **Red: 5 texts** | declared, sequenced |
| 2 | `check_index_freshness` — `refresh.py` only. **Red: 954 gates** | declared, sequenced |
| 3 | `check_capital_reach` — `npm run check` only, *after* a red link, so it ran nowhere | **fixed: in CI** |
| 4 | `check_country_gates` — `npm run check` only | declared, sequenced |
| 5 | `check_gate_field_reach` — `npm run check` only | declared, sequenced |
| 6 | `check_gate_pertinence` — `npm run check` only, after the red link | declared (known-red) |
| 7 | `check_gate_subject` — one Makefile target | declared, sequenced |
| 8 | `check_ticket_effect` — in nothing, **and not a guard**: it prints a table and asserts nothing | **fixed: renamed `measure_ticket_effect`** |

### 9. `npm run check` was still a serial `&&` chain

CI was fixed months ago with `if: always()`. The command humans type was not.
27 links, `&&`-joined; link 14 (`check_corpus_census`) is red on main, so
**thirteen checks had not been executing at all**:

> check_verdicts, check_leaf_cap, check_capital_reach, check_payload_budget,
> check_client_boundary, check_dependencies, check_env_loader,
> check_recall_leaks, check_extracted_quotes, check_gate_pertinence,
> check_degradation, check_hydration_parity, check_recall_floor

Four of those run nowhere else. One of them is `check_recall_floor` — the guard
that was fixed last week *specifically* so it could not skip itself and exit 0.
It had been sitting behind a red link ever since, not running for a different
reason. Fixing a guard does not help if the runner never reaches it.

**Fixed:** the list moved to `website/frontend/scripts/run_checks.mjs`, which
runs every check, accumulates failures, and prints the whole picture.
`--bail` restores the old behaviour for an edit loop and is deliberately not the
default.

### 10. Two guards passed on an empty corpus

`check_capital_reach` printed, in full:

```
check_capital_reach: ok — every value carried by the 0 publishable instruments
is reachable by some intake answer
```

Nothing was wrong with the corpus. The process had been started from the repo
root; `snapshotPath()` resolves from `process.cwd()`, the file was not there,
and a bare `catch { return null }` in `corpus.ts` turned "not where I looked"
into "empty corpus". `check_leaf_cap` did the same, reporting full headroom
across 0 channels — the most reassuring number it can print and the least true.

**Fixed:** non-zero floors on both, the `catch` now names the path it tried, and
`run_checks.mjs` forces its own working directory.

### 10a. CI's `Lint` step is red on `main`, and was not on anybody's list

Not a skip and not an orphan — the opposite failure, and it belongs in the same
register because the effect is identical. Measured on the pristine `main`
checkout, not in my worktree:

```
$ npx eslint .            # website/frontend
✖ 199 problems (177 errors, 22 warnings)     exit 1
```

28 files under `scripts/`, 5 under `lib/`, 3 under `app/`. My branch leaves the
count unchanged at 177.

The CI workflow's own prose, about a different check, states the rule this
breaks: *"A check that cannot pass is a check people learn to skip."* A step
that has been red long enough to be normal has stopped being a signal — the
`Lint` line in a run summary now carries no information, and a genuine
regression arriving in it would be invisible.

**Not fixed here.** 177 errors is the large refactor the brief excluded, and
most are `no-explicit-any` in diagnostic scripts where the judgement is a real
one. It is listed so that it is a decision rather than a habit.

---

## Shape 2 — consumed, never produced

| # | Orphan | Cost if it fires |
|---|---|---|
| 11 | `profileLeakIndex.generated.json` — **CI's `check_recall_leaks` asserts against it**, and its only generator (`emit_profile_leak_index.py`) is referenced by nothing but its own usage line | Partly mitigated: `check_corpus_currency.ts:213` does test its staleness — but that is an `on_change` guard needing `DATABASE_URL`, so the detection is credentialled while the CI step that trusts the artifact is not. Regeneration remains manual. |
| 12 | `data/reference/nuts_regions.json` — four readers including the generator of the production `regions.generated.ts`; **no committed regenerator anywhere** | This is the PM's exact shape. Lose the file and regions cannot be rebuilt. |
| 13 | `.claude/hooks/stop_gate.py:25` checks `companies/manifest.json` — **no such file exists in the repo** | The hook reports MISSING unconditionally whenever `db.sqlite` is present. |
| 14 | `__objectives.json`, `channelPrior`, `peerPrior`, `regionPrior` `.generated.json` — read **at request time on the production ranking path**; producers on no automatic path, no staleness guard | Ranking silently drifts from the corpus after any change. Unlike `themeIndex`/`semanticCache`, nothing notices. |
| 15 | `data/eligibility_pertinence.json` — consumed by two publish-path steps, refreshed only by a human-run classifier; `apply_gate_role_overrides.py:92` degrades **silently** | Gate roles publish from a stale cache with a log line nobody reads. |

---

## Shape 1 — produced, never consumed

| # | Orphan | Note |
|---|---|---|
| 16 | `country_coverage.json` ← `coverage_indicator.py:405` | 27 KB committed, zero readers in `app/`, `components/`, `lib/`, `scripts/`. `website/README.md:56` claims a consumer that does not import it. |
| 17 | `instrument_leaderboard.json` ← `home_visuals.py:137` | The builder's **only** output. So `make visuals` spends its time producing nothing anyone reads. |
| 18 | `companies.company_group` ← `build_company_groups.py` | Column exists in `schema.sql` and migration 006. No query, no builder, no frontend reads it. |
| 19 | `funding_instruments.override_name` ← `apply_override_names.py` | The string occurs in exactly one file in the repo: the writer. |
| 20 | `data/retracted_eligibility_text.json`, `data/processed/coverage_indicator.json`, `data/queries/q09_state_aid.sql` | Human-facing ledgers/analysis. Not defects — but they are indistinguishable from defects without this note, which is why they are listed. |
| 21 | `aides_tee.csv`, `step_match_summary.csv`, `programme_names_proposed.json`, the `build_parent_groups` CSV cluster | A closed orphan cluster: written by Tier-C modules, read only by other Tier-C modules. |

---

## Shape 4 — two definitions of one question

| # | Orphan | Why it matters |
|---|---|---|
| 22 | **The census policy contradicts itself across the two entry points.** `railway_cron.py` argues at length that the census must be written *whatever happened*, carrying the outcome, because "a census written only on success would leave the last good week's numbers standing as the newest record after a failure". `refresh.py` does the opposite: the census is the **last** step, hard-codes `--run-outcome ok`, and is skipped entirely on any earlier failure. | The census exists precisely so the two paths leave the same kind of trace and the guard cannot tell them apart. Today it can. |
| 23 | **`refresh.py` and `make eligibility` are two publish paths running disjoint subsets.** Seven divergences remain beyond the one already fixed (`apply_gate_role_overrides`). | The Makefile's own comment calls `eligibility` "THE SECOND PATH TO PRODUCTION". Whichever you run determines what ships. |
| 24 | `stop_gate.py:22` says "keep in sync with `build_site_data.py` GENERATED" — **and the two lists disagree** in three places | The standing rule: a "keep in sync" comment *is* the bug. |
| 25 | **A failing guard stops `refresh.py`; `railway_cron.py` explicitly argues it must not.** | Same guard, same repo, opposite policy. It is why the 954 is unfixed. |

---

## Shape 5 — runs, but nothing reads the result

| # | Orphan |
|---|---|
| 26 | `refresh.py` stops at step 13, so steps 14–23 produce nothing — including the census (23), which is what `check_corpus_census` compares against. Consistent with that guard's known-red state. |
| 27 | `extract_satr.py` is run by no path: `renew=[]`, excluded from `push_local.py`'s batch, invoked only by `run_satr_all.sh` which nothing names. `manifest.py:83` documents its loader as `ETL/load/load_satr.py` — **that path does not exist** (the file is at `ETL/events/load/`). |

Plus, from the reachability sweep: **five modules referenced by nothing at all**
(`splink_dedupe.py`, `_wsat_dump.py`, `_wsat_measure.py`, `_wsau_facets.py`,
`_wsau_probe.py`) and **89 modules reachable only by typing their own path**.
Most of the 89 are deliberate one-shot backfills; deciding which is not a
question the tree can answer, and it is not claimed here.

---

## The structural guard

The brief asked for one structural guard over ten point checks, with the
schema-replay check as the model. This is that.

**`ETL/schema/check_guard_reachability.py`** — in CI's `etl` job, credential-free,
reads committed source only.

`check_guard_registry.py` already asserts *registered → publisher* and
*publisher → registered*. It is blind to the direction that keeps happening: a
`check_*` module that was never registered, never added to a workflow, and never
added to the cron. That blindness is how all eight above survived.

The property, derived per file rather than listed:

> every `check_*` module is named by an **automatic** path, or is declared in
> `data/guard_registry.json` under `manual` with a reason **and a review date**.

An automatic path is one that runs without anybody choosing to: a workflow, the
weekly cron, or the guard registry. **`npm run check` deliberately does not
count** — it is a command a human types, and "somebody will run it" is the
assumption all eight orphans were resting on.

Three details that make it a guard rather than a gesture:

- **The manual block expires.** An escape hatch with no clock becomes the
  orphanage. Reviewing costs one of three edits — wire it up, move the date and
  say what changed, or delete the guard — and all three beat silence. This
  mirrors the reviewed-exceptions register in `check_dependencies.ts`.
- **Comment lines do not count as invocations.** `railway_cron.py` explains at
  length which guards moved and why. Counting prose would mean the better the
  explanation, the greener the check.
- **The registry counts only through its `guards` array.** The `manual` block
  lives in the same file and names every orphan in it; reading the file whole
  would mark each one reachable *by its own declaration* — a check that goes
  green because you told it something is broken.

Both failure modes were provoked and observed red before being left green:
nine orphans on first run, and the expiry firing when a review date was moved
into the past. `check_guard_registry.py` was extended to follow the check list to
its new home and now asserts `check_verdicts` is **last**, not merely present —
also provoked red.

---

## What was fixed here

1. `check_guard_reachability.py`, wired into CI.
2. `npm run check` no longer short-circuits — 13 of 27 links restored.
3. `check_capital_reach` into CI (credential-free, green, previously unreachable).
4. Emptiness floors on `check_capital_reach` and `check_leaf_cap`.
5. `corpus.ts`'s silent `catch` now names the path it tried.
6. `check_ticket_effect` → `measure_ticket_effect` (asserts nothing).
7. Six honest `manual` declarations with reasons and review dates of 2026-09-30.
8. `check_guard_registry` follows the check list and asserts ordering.

## Sequenced, not attempted

In priority order. None is a large refactor; all were left because they need a
decision or a credentialled runner, not because they are hard.

1. **`check_applicant_identity` → `on_change` registry guard**, and fix or
   withdraw the 5 texts. Product-facing and free to run.
2. **Unblock `refresh.py`**: resolve `check_hydration_parity`, then run steps
   14–15 to clear the 954. Then move `check_index_freshness` onto the weekly cron
   beside the embed steps.
3. **Decide the guard policy once** (#25) and apply it to both entry points.
   `railway_cron.py` has the better argument written down already.
4. **Give `nuts_regions.json` a committed regenerator** (#12) — this is the
   PM's original "cannot rebuild" shape, one file over from the schema.
5. **A staleness guard for the four production-path generated artifacts** (#14),
   modelled on `check_theme_index`.
6. **Regenerate `profileLeakIndex` on an automatic path** (#11), or CI is
   enforcing a fossil.
7. **Reconcile the two publish paths** (#23) — or make one call the other.
8. Delete the five dead modules and the two dead columns; fix `stop_gate.py`'s
   phantom file and `manifest.py`'s wrong load path.
9. **Decide what `Lint` is for** (#10a): fix the 177, or scope the rule set to
   what is actually enforced. Either restores the signal; leaving it red does
   not.

## What I could not audit

- **Whether Railway is deployed with `railway_cron.py` today.** Verifying needs
  Railway credentials. Only that the code declares it
  (`railway_service.py:30`) was checked.
- **Whether `next.config.ts` file-tracing breaks the runtime reads** of
  `instrument_terms.json` and `signals_digest.json` on Vercel. Both are read
  with `readFileSync` at request time and neither is force-traced; both swallow
  the failure. Confirming needs a real deployed build, which was not run.
- **Dead writes reached via `SELECT *`.** The producer/consumer sweep matched
  column and file names textually, so the "written, never read" list is a
  **lower bound**.
- **Which of the 89 human-only modules are correctly dead.** That needs product
  intent.
- **Migrations and schema replay** — owned by workstream BE, deliberately not
  re-audited.
- The four known-red guards on main were treated as given and are not
  attributed here.
