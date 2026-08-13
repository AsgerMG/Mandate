# Resume point — 2026-08-09 14:05

> ## ⚠ THIS IS A SNAPSHOT OF 2026-08-09, NOT THE CURRENT STATE
>
> **62 merges have landed since it was written.** It is still the best account
> of how the ceiling ladder was retracted down to 65.9%, and its `[ok …]`
> attestations against `number_audit_wsCP_*.txt` are the only place those runs
> are written up. Read it for that. Do not read it for where the product is.
>
> - **The instrument of record is `findings/one_funnel/latest.md`** — one
>   population, one denominator, re-run against a live corpus and dated. It
>   carries its own section on where it disagrees with a published figure, and
>   "the one number" below is one of them: 25.0% is `check_recall_floor`'s, on
>   the instant screen's six rows, not the memo's.
> - **`findings/README.md`** indexes every finding, what it settled, and which
>   ones state a superseded number with no banner.
> - Landed since and not reflected below: the model picks the five (wsGB), the
>   head-to-head (wsGA), K=40 ships (wsGD/wsGM), the accessible-pool ceiling was
>   a counting bug and is 87.6% not 77.5% (wsGE), and the gate-encoding
>   corrections now queued in `AWAITING_APPROVAL.md`.

Written because a wake-up timer is a child of one CLI session and dies with it.
This file does not. Main is pushed at `54e7bd6e`; everything below is either on
main or on a named branch with commits.

## The one number

**The memo names the right specific fund in the five 25% of the time [ok number_audit_wsCP_floor.txt].**
EXACT@5, Doors key, **tune** split, seed 20260806, live Postgres, 1,088
instruments, 300 pairs. On **holdout** the same metric is 24.0%
[ok number_audit_wsCP_autopsy_holdout.txt] — quote the holdout figure to anyone
outside the team, because tune is the split everything was tuned on.

**It is 25% [ok number_audit_wsCP_floor.txt] for ONE founder, replayed 300
times.** Only country, sector and description vary per case.
`check_recall_floor.ts:495-501` pins the other eight: the company is
`"TestCo"`, always in a consortium, always wanting €500k–2.5M of grant-or-loan
for industrial research, `activities: ["none"]`, `borrowerModel: "operating"`,
region withheld. Eighteen of the twenty-three intake fields —
`organisationType` and `fteBand` among them — are never supplied at all. Every
figure on this page inherits that founder.

**The target is 95% [target] ASSUMING FULL FOUNDER INFORMATION** — the owner
stated this 2026-08-09 and it invalidates every ceiling measured before it. A
ceiling measured on today's six questions bounds today's product, not the target.

**ANSWERED, later the same day, by wsCC (`6cab7a7d`): the honest maximum under
full founder information is 65.9% EXACT@5
[ok number_audit_wsCP_wscc_exact_bound.txt] — round it to "66" in prose if you
must, but never write the rounding with a per-cent sign as if it were the
measurement.**

95% is not reachable [target], and was never reachable. The table below is the
retraction chain that got there; the live number is the last row of it.

| measurement | figure | what it really conditioned on | status |
|---|--:|---|---|
| wsBY | 85.5% [retracted] | verbatim `eligibility_text` | **RETRACTED — circular.** Gates are extracted from that text, so all 23 intake fields measure +0.0 against it. It still reproduces exactly, which is the point: reproducibility is not validity |
| wsCA | 43.1% [retracted] | today's intake fields, matchable column only | **RETRACTED TWICE.** As *the* ceiling (conditioned on a fixed intake), and now as a NUMBER: the same arm reads **51.7%** on today's corpus [ok number_audit_wsCP_wsca_founder.txt], because `organisationType` became a real intake field after wsCA ran. Do not quote 43.1 as "the bound on today's product" |
| wsCA | 31.4% [retracted] | every intake field at once, matchable | reads **40.3%** today, same reason [ok number_audit_wsCP_wsca_founder.txt] |
| wsCA | 62.0% [retracted] | requirement *present* — text with no comparator | **RETRACTED — circular**, the same trap one level down (`rich_intake_wsCC.md` §4) |
| wsCH | 51.7% [ok number_audit_wsCP_wsch_ceiling.txt] | wsCA's key + organisation type | a **raise**, not a retraction: +11.7 CEIL@5 on wsCA's own population. ⚠ The "every mapped field" arm ALSO reads 51.7 / +11.7 now — two different arms, one number. Never quote 51.7 without naming the arm |
| **wsCC** | **65.9%** [ok number_audit_wsCP_wscc_exact_bound.txt] | **FULL founder information, keyed on DEMAND CLASS not wording** | **CURRENT CEILING OF RECORD.** Reproduces exactly. Read the three caveats below before planning on it |
| wsCC | 58.3% [ok number_audit_wsCP_wscc_ceiling.txt] | greedy chooser — bounds any question-selection policy | reproduces exactly, **but it is CEILING@5 and the ceiling it is quoted against is EXACT@5.** See the warning below |
| wsCC | 77.6% [ok number_audit_wsCP_wscc_exact_bound.txt] | the fund's whole eligibility page to a perfect chooser | circular; printed only as a reference. **Never quote as headroom.** ⚠ `gap_autopsy_wsCI.md` prints the same number for something else entirely — "the notified scheme reaches the published five". Two facts, one figure, and neither says which |
| wsCI | 26.8% [retracted] | EXACT@5, tune, 250 pairs — quoted as "the right leaf" beside that scheme-level number | one draw's value from an unattested run. The shipped tune figure is 25% [ok number_audit_wsCP_floor.txt] at N=300 |
| ships | 25% [ok number_audit_wsCP_floor.txt] | EXACT@5, tune | holdout is 24.0% [ok number_audit_wsCP_autopsy_holdout.txt] |

### ⚠ THE PLANNABLE NUMBER AND THE CEILING ARE NOT THE SAME METRIC

**Do not subtract them.** 58.3% [ok number_audit_wsCP_wscc_ceiling.txt] is
CEILING@5 — one count per contested leaf, over the 605 leaves that sit in a
multi-leaf regime, with singleton regimes dropped. Its correct partner is the
**65.0%** [ok number_audit_wsCP_wscc_ceiling.txt] on the same table.

The ceiling of record is instead a **pair-weighted EXACT@5 bound**
[ok number_audit_wsCP_wscc_exact_bound.txt] over 6,587 answer-key pairs, of
which 1,694 — **25.7%** [ok number_audit_wsCP_wscc_exact_bound.txt] — are funds
with no siblings, credited under every arm without any key earning them.

So "the ceiling minus the plannable number is what question selection costs" is
arithmetic across two different populations. `rich_intake_wsCC.md` §7 states
this rule and its own headline breaks it. **There is no EXACT@5-weighted greedy
run anywhere** (`_wscc_exact_bound.ts` has no budget block), so the plannable
number *at the metric the ceiling is quoted in* is **[unverifiable: no greedy
run exists at EXACT@5, only at CEILING@5]**. Plan against 58.3%
[ok number_audit_wsCP_wscc_ceiling.txt] as a CEIL@5 figure, or commission the
EXACT@5 version — do not mix them.

**Three caveats that live AT the ceiling, not in a footnote:**

1. **~7 of its points are a literal, not a measurement.** It is 70.9 ×
   `POOL_RATE`, and `_wscc_exact_bound.ts:30` hard-codes `POOL_RATE = 0.93` with
   the comment "quoted rather than re-derived". Today's measured pool is 94%
   [ok number_audit_wsCP_floor.txt].
2. **It reads holdout.** `SPLIT` defaults to `""` and line 98 keeps every row, so
   the headline is computed over tune AND holdout together.
3. **The circularity repair covers 29 of 731 demand classes.** Gates with no
   embedding fall back to normalised-text identity in a separate id space
   (`_wscc_demand.ts:72-78`); **702 of the 731 classes are that fallback** — which
   is the verbatim-requirement key the document itself retracts as circular. The
   claim "two funds demanding the same thing in different words collapse" holds
   for the 29, not for the 702 that do the separating.

**Why it can be trusted further than 85.5% [retracted] could:** the key is DEMAND
CLASS for the embedded quarter, so those funds collapse and are not credited.
Setting the collapse threshold to 1 recovers the circular 70.1%
[ok number_audit_wsCP_wscc_ceiling.txt] — a check that the repair does what it
claims, for the part of the corpus it reaches.

**What binds it:** pool reach (−7) and sibling indistinguishability under full
information (−29). Twenty-nine points is funds that stay genuinely identical
after everything a founder can say. wsCG2/wsCJ then measured the two obvious
attacks on that residue at **zero**: a door-level row recovers none of it
(`46d2dc63` — the leaf already IS the door), and address→door lookup has an
oracle bound of +0.4 tune / +0.0 holdout (`address_door_wsCJ.md`). wsCD2
measured the open-question arm at **exactly zero** (`a903b923`).

### ⚠ Which numbers were measured before the ranker could be attested

`rankerTallyLine` landed at **fd27cec0, 2026-08-09 17:15**. Before it,
`check_recall_floor` returned 87% [retracted] and then 96% [retracted] on
identical inputs, because `semanticFundMatch` times out under load and the run
averaged the embedding and lexical rankers with nothing on screen to say so.

**Every artifact that replayed the pipeline without a `ranker:` line predates
that fix and may be an average of two systems. That is 39 of the 53 replay
artifacts committed under `project-mgmt/findings/`**, and the list is not
obscure ones:

- `gap_autopsy_wsCI_holdout.txt` — the four autopsy buckets. **Recomputed with
  the attestation on screen, three of the four are wrong**: published 3.7 / 7.4
  / 41.5 / 47.3 and EXACT@5 24.8% [retracted].
  Today: 1.6 / 7.4 / 44.2 / 46.8 and EXACT@5 24.0%
  [ok number_audit_wsCP_autopsy_holdout.txt]. Part of the move is real
  (`CHANNEL_BACKFILL` now ships on), and none of it was visible.
- `signal_remeasure_wsBU_*` — all four. This is what **"ranking is closed, do
  not reopen"** rested on. **RE-RUN WITH ATTESTATION (wsCS).** Every one of the
  eighteen single-signal arms lands within its own half-width of where wsBU put
  it, so that half of the conclusion is now a confirmed null
  [ok ranking_reopen_wsCS_holdout.txt]. The BLEND half does not survive, and not
  because the number was wrong: wsBU compared two MARGINAL intervals for a
  question that is paired. Paired, on the same 600 founders, the blend beats the
  shipped ranker by **+5.0 ±3.4 points** over 21 regimes
  [ok ranking_reopen_wsCS_blend.txt]. See `ranking_reopen_wsCS.md` for what that
  is an upper bound on.
- `intake_headroom_wsCA_floor.txt`, `workstream_ar_capital_filter_recall.txt`,
  `standalone_gates_wsAW_*` (15 files), `leaf_separation_wsAO_*`, `pool_filters_wsAE_*`.

`check_published_figures.ts` now fails the build if a figure on THIS page cites
an artifact that replayed the pipeline without attesting its ranker. It is a
property, not a list: a number added here tomorrow fails until somebody says
where it came from.

## Closed by measurement — do NOT reopen

- **Ranking, ONE SIGNAL AT A TIME.** No single signal beats the shipped ranker
  outside its half-width — eighteen arms, N=600, holdout, leak-free, baseline
  5.6%, every run attesting the embedding ranker
  [ok ranking_reopen_wsCS_holdout.txt]. Re-measured by wsCS because wsBU's
  evidence could not name the ranker it graded; the conclusion held.
  **A BLEND of the same signals is NOT closed** — see above and
  `ranking_reopen_wsCS.md`.
- **Rebalancing the seats between the score and the peer prior**, including
  making the split depend on how confident the score is. Fixed splits closed by
  wsCM; the confidence-dependent version measures −0.2 points on holdout with
  the seat count provably changing for 55% of founders
  [ok ranking_reopen_wsCS_seats_holdout_confident.txt]. The mechanism: the more
  sharply the score separates its top rows, the LESS often the won fund is on
  the page (0 seats 25.0%, 3 seats 18.6%
  [ok ranking_reopen_wsCS_seats_holdout_confident.txt]), so scaling the score's authority with
  its own certainty pushes on the wrong end. `ranking_reopen_wsCS.md` §4.
- **Per-fund evidence.** Every case-register and SATR field is **+0.0**,
  structurally — constant inside a leaf's own cell. `scheme_evidence_wsBY.md`.
- **New intake questions given today's encoding.** No next region question;
  the remembered figure was `administering_body` at 51.1%
  [ok number_audit_wsCP_wsca_founder.txt], already spent.

## The live lever, and it is the whole game

**Stage 2 can only ask MULTIPLE-CHOICE questions.** `openFieldsForShortlist`
(`lib/intelligence/gateReach.ts:66`) drops any requirement without a fixed
answer set:

    if (!FIELD_ENUM_HINTS[field]) continue;

So every fuzzy-by-nature requirement — "must advance the technology beyond the
state of the art" — is discarded **though its verbatim text is on the gate**.
Of 4,685 filter gates: 2,830 have field+comparator, 878 have a field but no
comparator, **977 have neither** — pure text, invisible to stage 2.

That was the mechanical explanation for matchable 31.4% vs present 62.0%
[retracted] — matchable reads 40.3% today and both were superseded as
ceilings. The MECHANISM below still holds; the two figures do not.
**It is not a data gap.** The precedent for the fix is in the same file at
line 128: region was also invisible to the gate layer, and the answer was to
ground the question in different evidence, not to wait for an impossible
encoding.

## Agents in flight — each commits as it goes; branches survive a cutoff

**⚠ All three below have since MERGED. Their answers, so this list is not read
as an open question:**

- `wsCC-rich-intake` — **MERGED `6cab7a7d`.** The ceiling under a full founder
  profile is **65.9%** [ok number_audit_wsCP_wscc_exact_bound.txt].
  The plannable number is 58.3% [ok number_audit_wsCP_wscc_ceiling.txt], which
  is a CEIL@5 figure and not comparable with the line before it.
  **95% is not reachable** [target]. `rich_intake_wsCC.md`.
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
