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

**ANSWERED, later the same day, by wsCC (`6cab7a7d`): the honest maximum under
full founder information is 65.9% EXACT@5 — "66%". 95% is not reachable, and
was never reachable.** The table below is the retraction chain that got there;
the live number is the last row of it.

| measurement | figure | what it really conditioned on | status |
|---|--:|---|---|
| wsBY | 85.5% | verbatim `eligibility_text` | **RETRACTED — circular.** Gates are extracted from that text, so all 23 intake fields measure +0.0 against it |
| wsCA | 43.1% | today's intake fields, matchable column only | **RETRACTED as *the* ceiling — conditioned on a fixed intake.** Still correct as the bound on today's product |
| wsCA | 62.0% | requirement *present* — text with no comparator | **RETRACTED — circular**, the same trap one level down (`rich_intake_wsCC.md` §4) |
| wsCH | 51.7% | wsCA's key + organisation type | a **raise**, not a retraction: +11.7 on wsCA's own population. Recorded in commit `a9c9753` only |
| **wsCC** | **65.9%** | **FULL founder information, keyed on DEMAND CLASS not wording** | **CURRENT CEILING OF RECORD** |
| wsCC | 58.3% | greedy chooser — bounds any question-selection policy | **the plannable number. Plan against this** |
| wsCC | 77.6% | the fund's whole eligibility page to a perfect chooser | circular; printed only as a reference. **Never quote as headroom** |
| ships | 25% | EXACT@5 | — |

**Why 66% can be trusted where 85.5% could not:** the key is DEMAND CLASS, so
two funds demanding the same thing in different words collapse and are not
credited. Setting the collapse threshold to 1 recovers the circular 70.1% — a
check that the repair does what it claims.

**What binds it:** pool reach (−7) and sibling indistinguishability under full
information (−29). Twenty-nine points is funds that stay genuinely identical
after everything a founder can say. wsCG2/wsCJ then measured the two obvious
attacks on that residue at **zero**: a door-level row recovers none of it
(`46d2dc63` — the leaf already IS the door), and address→door lookup has an
oracle bound of +0.4 tune / +0.0 holdout (`address_door_wsCJ.md`). wsCD2
measured the open-question arm at **exactly zero** (`a903b923`).

⚠ **A measurement caveat that touches every recall number above.** wsCI
(`e7f06813`) found `check_recall_floor` silently averaging two ranking systems
when `semanticFundMatch` times out under load. Any recall figure measured on a
loaded machine before 2026-08-09 may be an average of two rankers.

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

**⚠ All three below have since MERGED. Their answers, so this list is not read
as an open question:**

- `wsCC-rich-intake` — **MERGED `6cab7a7d`.** The ceiling under a full founder
  profile is **65.9% ("66%")**; the plannable number is 58.3%. **95% is not
  reachable.** `rich_intake_wsCC.md`.
- `wsCD-open-questions` — **MERGED `3394cc14`, then wsCD2 `807df94c`.** The
  question-budget curve is **flat**: the open-question arm buys **exactly
  zero**, because 235 of 235 settled verdicts landed where the scorer cannot
  read them — a design contradiction, not a tuning failure. The arm is inert
  below K=3 and ships default OFF.
- `wsCE-crisp-encoding` — **MERGED `be84adc0`.** The separation is in the
  **fuzzy** half, not the crisp one: reader-fuzzy buys +6.4 over 196 gates and
  11 regimes against +3.0 for reader-crisp over 65 gates and 5. The
  recommendation is **not to spend on the crisp half**. wsCE has no findings
  document — its numbers live in commits `e782533a` and `be84adc0` only.

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

**The two-way store divergence — CLOSED 2026-08-09 (wsCN).** Merged, laptop ←
volume, scoped to two tables. Backups first (Postgres 12 tables / 18,841 rows to
iCloud, and a `.backup` of the SQLite store), both verified by re-read.

    companies              163,538 -> 164,029  (+491)
    public_funding_events  311,355 -> 311,399  (+44: ADEME 42, Spanish BDNS 2)
    eligibility_gates        7,471 ->   7,471  unchanged, as required
    funding_instruments      1,088 ->   1,088
    eligibility_clauses        893 ->     893

`integrity_check` ok, zero events pointing at a company that does not exist, and
all 491 arriving companies carry unclassified `sector_top` — exactly as wsCF
predicted from the partial run behind them. **Nothing was pushed to Postgres**,
which still reads 7,471 / 1,088 / 893.

Two corrections to what was recorded here, both worth keeping:

- **The counter hazard never bit.** Zero id collisions on every table. The
  laptop had inserted no company since **2026-08-02**, six days before the fork,
  so the volume's ids 215,305..215,795 were never issued twice. The store itself
  says so, which is better evidence than the instruction "run no extractor
  first" — and it is the reason that instruction held.
- **The real hazard was the mirror image, and nobody had named it.** Of the 174
  gates and 14 clauses on offer, **all 188 already existed here under a
  DIFFERENT id**. `id NOT IN` calls those new, so they would have been inserted,
  the count would have risen by exactly the expected amount, and the natural key
  `(instrument_id, gate_key)` — which holds exactly, 7,471 distinct pairs across
  7,471 rows — would have broken. Gates and clauses were therefore excluded:
  every row they had to offer was a duplicate.
- The pair recorded here as 151,426 / 151,915 is **correct, and is not the
  table**. It is the census's IN-SCOPE company count; the raw `companies` table
  read 163,538 / 164,029. Two counts, both right, twelve thousand apart, and
  nothing beside either said which one it was — so this section now says. 489
  of the 491 arriving companies are in scope, which is why both deltas agree.
  I mis-read this myself on the first pass and wrote that the recorded figure
  was wrong; a number quoted without its definition is how that happens.

`ETL/lib/check_id_collisions.py` now runs **in front of** the merge, not beside
it, and there is no override flag: asked for all five tables it exits 1 and
names the 188. Scope with `--only`, do not argue with it.

**Still avoid `make pull-db`** (chains straight to `--write`, unscoped) and
**`make eligibility`** (TRUNCATEs Postgres).

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
