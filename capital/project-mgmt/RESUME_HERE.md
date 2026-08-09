# Resume point — 2026-08-09 14:05

Written because a wake-up timer is a child of one CLI session and dies with it.
This file does not. Main is pushed at `54e7bd6e`; everything below is either on
main or on a named branch with commits.

## The one number

**The memo names the right specific fund in the five 25% of the time.**
EXACT@5, Doors key, tune split, seed 20260806, live Postgres, 1,088 instruments.

**The target is 95% ASSUMING FULL FOUNDER INFORMATION** — the owner stated this
2026-08-09 and it invalidates every ceiling measured before it. A ceiling
measured on today's six questions bounds today's product, not the target.

| measurement | figure | what it really conditioned on |
|---|--:|---|
| wsBY | 85.5% | verbatim `eligibility_text` — **circular**, RETRACTED |
| wsCA | 43.1% | today's intake fields, matchable column only |
| wsCA | 62.0% | requirement *present* — text with no comparator |
| ships | 25% | EXACT@5 |

## Closed by measurement — do NOT reopen

- **Ranking.** Nothing beats the shipped ranker outside its half-width
  (N=600, holdout, leak-free, baseline 5.6). `signal_remeasure_wsBU.md`.
- **Per-fund evidence.** Every case-register and SATR field is **+0.0**,
  structurally — constant inside a leaf's own cell. `scheme_evidence_wsBY.md`.
- **New intake questions given today's encoding.** No next region question;
  the remembered 51% was `administering_body`, already spent.

## The live lever, and it is the whole game

**Stage 2 can only ask MULTIPLE-CHOICE questions.** `openFieldsForShortlist`
(`lib/intelligence/gateReach.ts:66`) drops any requirement without a fixed
answer set:

    if (!FIELD_ENUM_HINTS[field]) continue;

So every fuzzy-by-nature requirement — "must advance the technology beyond the
state of the art" — is discarded **though its verbatim text is on the gate**.
Of 4,685 filter gates: 2,830 have field+comparator, 878 have a field but no
comparator, **977 have neither** — pure text, invisible to stage 2.

That is the mechanical explanation for matchable 31.4% vs present 62.0%.
**It is not a data gap.** The precedent for the fix is in the same file at
line 128: region was also invisible to the gate layer, and the answer was to
ground the question in different evidence, not to wait for an impossible
encoding.

## Agents in flight — each commits as it goes; branches survive a cutoff

- `wsCC-rich-intake` — the ceiling under a full founder profile, and a straight
  answer on whether 95% is reachable.
- `wsCD-open-questions` — BUILDS the open-question path in stage 2, behind a
  flag default OFF, with a **question-budget curve**: EXACT@5 as a function of
  how many questions are asked. "95% if we ask forty things" is not a product.
- `wsCE-crisp-encoding` — splits the 1,855 into crisp (deserves a comparator)
  vs fuzzy (hand to wsCD). Building on `wsCB-encoding-lift` (1 commit, not
  merged) which holds the reconciliation harness.

If a branch exists with commits ahead of main, it is finished work waiting to be
verified and merged. Verify, do not trust.

## Owner-approved actions taken today

- Wrote `source_window_policy` for all 1,088 instruments to Railway Postgres
  (backup first, dry run clean, read-back 831 no-window / 257 window).
- **Deployed the weekly cron fix** — confirmed `Deploy complete`,
  `etl-pipeline (f0b76865)`, cron `0 3 * * 0`, status SUCCESS. The weekly job
  had been discarding paid-for sector labels every run (census #10 at 03:13Z
  today recorded sectors=8, down from 11). It now runs `classify_taxonomy
  restore`/`persist`.

## Not done, and needing a decision

**The two-way store divergence.** Laptop vs the SQLite volume: gates 7,471 vs
6,401 (**1,070**, real work), companies 151,426 vs 151,915 (**489**). Postgres
is byte-current with the laptop — the divergence is with the VOLUME.

Two hazards recorded by wsCF:
- both stores allocate `companies.id` from the SAME AUTOINCREMENT counter since
  the 08-08 fork, and `merge_volume_into_local.py` keys on `id` alone — a
  collided row is **silently skipped** and the count-only after-check cannot
  see it. Safe only while the laptop inserts no company: **run no extractor
  before merging**.
- the volume's 489 companies come from a partial run with a red gate, so expect
  unclassified `sector_top`.

Sequence is in the `wsCF` merge commit (`54e7bd6e`). **Avoid `make pull-db`**
(chains to `--write`) and **`make eligibility`** (TRUNCATEs Postgres).

Also open: nothing ENFORCES a coverage-gate run before `eligibility_export.py`.

## Standing rules that cost real work when broken

- **Never lower a floor or loosen a guard to make something pass.**
- **Prove a guard can fail before leaving it green.** Sabotage it yourself —
  an agent's word is not evidence.
- **Never remove a worktree you did not create.** Use `scripts/agent-worktree.sh`.
- **Verify, do not trust, a merge**: `python3 -m compileall -q ETL/`,
  `npx tsc --noEmit`, `npx tsx scripts/check_peer_prior_canary.ts`, then the floor.
- **What a fund IS comes from the official source**, never from our columns.
- **Report regime concentration beside every gain** — `fteBand` scored +1.7 of
  ceiling that was 7 leaves in ONE regime.
- **A wrongly-encoded gate hides a fund from someone who qualifies.** That is
  how Innovate UK was blocked from every founder who answered ticket size.

## The pattern, in one line

Nearly every defect this week was **something produced that nothing consumes,
something consumed that nothing produces, or something checked that never
runs.** When something looks inexplicable, look for that shape first.
