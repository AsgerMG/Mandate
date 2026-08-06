# Start here tomorrow

## LATEST (2026-08-06, late): region routing landed, and it found something worse

Full write-up: `project-mgmt/research/region_routing.md`. Three things, in the
order they should change what you do next.

**1. The answer key is wrong for the population everyone has been trying to
fix.** `__recallSet.json` traces awards with `scheme_code = call_id`, which is
not unique: one notified scheme delivered by fourteen bodies is one SA number
and fourteen instruments. Against the register's own attribution, the shipped
label names the right leaf **91.7% of the time outside a same-name group and
32.2% inside one** — and names *some* sibling 96.1% of the time. For the 24% of
holdout pairs whose answer sits in such a group the key is close to a uniform
draw. **That is why region, sector and everything else "measured flat" there.**
Same rows, same scorer: 24.9% @1 against the shipped key, 66.2% against the
repaired one. `ETL/terms/repair_recall_attribution.py` →
`__recallSetRepaired.json` (260 of 1,988 pairs relabelled).
`__recallSet.json` is untouched.

**2. Two workstreams were writing this tree at once, and single-run numbers
cannot survive that.** `measure_recall.ts` returned 35%/87% and 31%/74% twice
each while `peerPrior.generated.json` was being rebuilt, `THEME_SPREAD_FLOOR`
moved 0.35 → 0.20 and `semanticSeparation` was rewritten underneath it. **Treat
every single-run end-to-end number from this session as void.** Only two kinds
survive: within-group results that touch neither artifact, and PAIRED runs where
both arms sit in one process. Also: commits `5e24f70` and `ed20cd3` used
`git add -A` and carry files belonging to the other workstream
(`ETL/terms/attribution.py`, the `emit_peer_prior.py` / `extend_recall_set.py`
edits, the rebuilt peer prior, `scripts/.tmp/`). Nothing was reverted; it is
recorded so the history is not misread. `check_recall_floor.ts` is red on
`__recallSetPlus.json` (exact5 22% vs floor 28%) — that set and those floors
arrived from the other workstream mid-run, and the region scorer is provably
inert when no region is answered (it returns `() => 1` into a multiplication),
so it cannot be the cause.

**3. Region routing works at the job it was given, and the table cannot show
it.** Within a same-name group, holdout, shipped artifact and shipped scorer
(`npx tsx scripts/measure_region_routing.ts`): **44.2% @1 and 91.1% @3 against a
28.3% popularity baseline**, and the leak-free arm — founder region taken only
from a DIFFERENT notified scheme — reads **49.4%**, i.e. the signal survives
having its own evidence removed. Paired end to end on those cases it is
7.5% → 9.2% EXACT@5, 3 rescued and 1 broken. The constraint is not sibling
availability (7.0 of 7.4 group members reach the pool): the reassignment is
rank-preserving, so region gives the right door the best slot the GROUP holds,
and 61.7% of the time the group holds none in the top five. **The remaining
loss is pool-to-table, not within-group.**

Do not re-flag: `satr_staging.region` as a scheme property (it self-agrees
94.4% at NUTS-1 across schemes — it is a company property); capping the region
footprint per company (24.9% → 24.0%); the share form P(region|fund) (54.3% vs
65.7%); widening the comparison group from a scheme registration to a display
name (44.2% → 40.1%).

Written 2026-08-06, end of session. **Four workstream agents were still running
when this was written** — expect uncommitted changes in the tree from them.
Check `git status` and `git log` first; some of what is described below may
already have landed.

## FIRST: end-to-end numbers from this session are VOID

Two workstreams wrote the tree concurrently. `peerPrior.generated.json` was
rebuilt, `THEME_SPREAD_FLOOR` moved 0.35 -> 0.20 and `semanticSeparation` was
rewritten mid-session, so single-run `measure_recall` numbers swung between
35%/87% and 31%/74% **for reasons unrelated to the change being measured**.
Only within-group results (which touch neither artifact) and explicitly PAIRED
runs survive. Re-establish the baseline before trusting anything.

Commits `5e24f70` and `ed20cd3` used `git add -A` and therefore carry another
workstream's files. Not unpicked — that would risk their work — but do not read
the history as one workstream's authorship.

## EARLIER: two workstreams died mid-edit (since re-run)

**A (gate 1 signals) stalled** and **C (corpus data model) lost its connection**,
both partway through. Neither reported. The tree is SAFE — `NO_PG=1 npm run
check` is green (tsc, 115 tests, 12 archetypes, payload) — but their work is
PARTIAL and unverified:

- `lib/intelligence/corpus.ts` carries an uncommitted edit from one of them.
- Anything either touched is half-done by definition. Do not assume a change
  found there is complete or correct.

C's last words before dying: *"sibling separation improved only marginally — the
activity lists are themselves near-identical across siblings"*, i.e. it had
tried using recipient activity lists to separate the 119 same-name leaves and
that alone was not enough. A's last words: *"now I have clean attribution"* —
it had got somewhere on the peer-prior join before stalling.

Re-run both from `project-mgmt/rebuild_to_95.md` rather than trying to salvage
the fragments.

## THE PATTERN OF THIS WHOLE SESSION: the ground truth was the bottleneck

Three independent measurement defects found today, each of which had been read
as a ranking failure:

1. **46% of holdout `project` rows leak** — their description sits verbatim
   inside the profile of the fund they are meant to find. The guard checked
   `sample_project_titles` (SQLite) while retrieval scores against
   `instrument_profiles.profile_text` (Postgres). Fixed:
   `__recallSetEnriched.json`, 524 leak-free descriptions vs 168.
2. **0 of 1,988 pairs name a programme-split child** — ADEME, BDNS, Vinnova and
   Innovate UK can never be credited, so fixing the peer-prior join to reach
   them measured as a LOSS.
3. **The answer key is near-random for same-name sibling groups.** `__recallSet`
   traces awards by `scheme_code = call_id`, which is NOT unique — one notified
   scheme delivered by fourteen bodies is one SA number and fourteen
   instruments. Against the transparency register's own attribution:

   | | register confirms the exact labelled leaf |
   |---|--:|
   | won fund NOT in a same-name group | **91.7%** |
   | won fund IN a same-name group | **32.2%** |
   | …same rows, confirming SOME sibling | 96.1% |

   For the 24% of holdout pairs whose answer sits in such a group the label is
   close to a uniform draw. **No method can beat chance on a population whose
   key is chance.** Same rows, same scorer: **24.9% @1 against the shipped key,
   66.2% against the repaired one.** This is why region measured flat every
   previous time. Repaired: `__recallSetRepaired.json`, 260/1,988 relabelled.

**Read every historical number in this repo with that in mind.**

## Region routing: shipped, and it works within-group

`emit_region_prior.py` -> `regionPrior.generated.json` (395 leaves), a
`regionScorer` inside the existing rank-preserving sibling reassignment, and —
the part without which it would be inert — `gateReach.ts` now offers the region
question from **measured recipient footprints instead of gates**, because the
sibling groups carry no `region_within` gates at all.

| population | n | @1 | @3 | popularity |
|---|--:|--:|--:|--:|
| all same-name | 269 | **44.2%** | 91.1% | 28.3% |
| leak-free region | 87 | **49.4%** | 94.3% | 32.2% |
| groups of 3-5 | 58 | **65.5%** | 98.3% | 29.3% |
| groups of 6+ | 139 | 24.5% | 83.5% | 12.9% |

112 of 141 previously-indistinguishable leaves now carry a routing attribute.
Region is a fact about the COMPANY after all — the brief's 56% self-agreement
was computed on raw strings ("München, Kreisfreie Stadt" vs "Bayern"); resolved
to NUTS it is 79.0% exact, 94.4% at NUTS-1.

**It does not move the headline and that is not being claimed.** Paired, 120
same-name holdout cases: EXACT@5 7.5% -> 9.2%, 3 rescued, 1 broken. The
reassignment is rank-preserving, so region gives the right door the best slot
THE GROUP holds — and 61.7% of the time the group holds no slot in the top five.
**The remaining loss is pool-to-table, not within-group. That is the next thing
to attack.**

## North star

Name the **five specific funds** a founder should apply to, in the memo, with
the next step. Not the agency, not the regime — the fund. Everything below
serves that.

## Where the numbers actually stand

Measure with these two, never anything else:

```
cd website/frontend
SPLIT=holdout N=200 npx tsx scripts/measure_recall.ts      # gate 1
N=40 G2=<variant> npx tsx scripts/measure_pipeline.ts      # both gates, one table
```

**Gate 1 (holdout, n=200):** EXACT@5 **32%**, REGIME@5 **87%**, pool **93%**.

**Gate 2 (holdout, n=40, gate1@32f28f2, haiku-4-5)** — gate 1's own top-5 on the
same cases is **20/40**:

| variant | exact | regime | short lists | malformed |
|---|--:|--:|--:|--:|
| *gate 1's own five* | *20/40* | *38/40* | — | — |
| `legacy` | 14/40 | 37/40 | ~40% | — |
| `parser` | 13/40 | 31/40 | 0 | 0 |
| `axes` | 12/40 | 35/40 | 0 | 0 |
| `swap` | 15/40 | 38/40 | 2 | 7 |
| **`veto`** (default) | **20/40** | **38/40 (95%)** | **0** | **0** |

`veto` — gate 1's order stands, the model may only strike a fund out on a
requirement the founder plainly fails, enforced in code — **ties gate 1 exactly**
and is the first gate-2 shape in this project that does not destroy value. It
does not yet BEAT gate 1.

Caveat, stated by the workstream itself: veto issued 16 real vetoes, rescued 0
and broke 0. On a fixture where 33 of 40 companies have no description the
interview returns "not sure" and there is nothing for a veto to bite on. That
measures **the floor holding, not the mechanism working**.

**Both parser bugs are fixed** — 0 short shortlists and 0 malformed replies
across every rebuilt run, against ~40% of runs previously shipping three or four
funds. A real correctness fix the accuracy number barely shows.

Gate 2 has **±7pp run-to-run variance at n=40**. Do not chase a 2pp move.

## The four things that are actually wrong

All measured, all in `project-mgmt/research/`:

1. **The query is thin — but it only matters for EU programmes.** Paired
   measurement, same company / same won fund / same answers, ranked twice,
   leak-free rows only (n=301 holdout): **+10.0pp overall**. The split is the
   finding:

   | population | n | EXACT@5 | REGIME@5 |
   |---|--:|--:|--:|
   | EU programme, own project text | 102 | 47.1% vs 20.6% = **+26.5pp** | **+27.5pp** |
   | national scheme, recovered text | 196 | 26.5% vs 25.0% = **+1.5pp** | **+1.0pp** |

   **For a national-scheme applicant a description is worth nothing** — not even
   at regime level. The regime is already found without it (80.1% from country +
   sector + peer prior) and the leaf cannot be found with it (119 same-name SATR
   leaves at 0.947 cosine). Since national schemes are 84% of the corpus, the
   blocking item for the headline is **region routing (F)**, not intake quality.

   Production DOES ask for a description; it was a one-line optional input with a
   silent 12-character cutoff below which both matchers returned nothing. Now a
   three-row textarea with a live nudge and the thresholds as shared constants.
2. ~~**Gate 2 chooses blind.**~~ **DISPROVEN 2026-08-06.** The information
   hypothesis was mine and it is wrong. Giving the model `award_p50` with its n,
   capital type, delivery body, within-family sector share, and a menu with
   siblings adjacent scored **12/40 — BELOW the 14/40 it managed knowing none of
   it.** Sixteen deterministic threshold rules on the sector posterior all landed
   at 19-20/40, i.e. no better than gate 1. Gate 1 already reads `sector_mix`;
   the +26pp within-group result is already spent. Do not re-try "give gate 2
   more fields about the funds".
3. **`sectorFit` inverts its own question.** Computes P(sector|fund) clipped at
   0.25; ties on top in 58.7% of sibling comparisons and scores *below* the
   popularity baseline. The posterior form scores 43.6% vs 17.6% within sibling
   groups — but see the reverted-experiments list below.
4. **`eligibility_embeddings` is unfit for matching.** Two boilerplate strings
   are 21% of the index, each on 497 instruments; 284 of 497 SATR leaves have
   zero unique chunks. Keep it for citation, not selection.

## Do not re-try these — measured and reverted

- **`sectorFit` → posterior in gate 1's global sort.** 30% vs 32%. The +26pp is
  real *within a known sibling group*, not across a 58-fund pool where it
  competes with peer precedence. It belongs in gate 2.
- **The corrected peer-prior join.** Reaching all 227 programme-split children
  measures as a LOSS (29% vs 32%) for a reason that is not about ranking:
  **0 of 1,988 recall pairs name a programme-split child.** ADEME, BDNS,
  Vinnova and Innovate UK children are never the answer in the ground truth, so
  every slot they gain is taken from a fund the harness can credit. This is a
  MEASUREMENT gap — fix it by tracing those awards into the recall set, then
  ship the corrected join. The working implementation is in
  `emit_peer_prior.py`'s history; do not re-derive it.
- **Region as the sibling discriminator.** Only 148/958 instruments carry a
  `region_within` gate and the big groups have none (ademe 0/75, vinnova 0/49).
- Corpus scheme-text enrichment (23%→23%), the old adaptive round (0 promoted),
  gate-fit ranking on uniform intake answers (62% vs 63%).

## The ceiling problem, stated honestly

Two independent bounds agree that the CURRENT HARNESS caps at ~64%: 982 profile
cases collapse to 51 distinct queries with a median of 7 different correct
answers each, and sibling ambiguity bounds exact-in-5 at 33.6% (median 26
siblings in pool). Observed 32.1% is **96% of that bound**.

This does not mean the product cannot reach 95%. It means **the test set must
gain real per-company descriptions** (workstream D) or it will keep reporting
the intake's emptiness as a ranking failure. Fixing the harness is a
prerequisite for measuring any further ranking work honestly.

## Tomorrow, in order

1. **Check the four agents' output** — `git status`, `git log`, and
   `fixtures/pipeline_history.jsonl` for any variant that beat 20/40.
2. **Land whatever beat the baseline**; revert what did not, and record it above.
3. **~~Workstream D is the priority~~ — CORRECTED.** D landed and measured the
   description's worth as +26.5pp on EU programmes and **+1.5pp on national
   schemes, which are 84% of the corpus**. The intake is now fixed and that work
   is done. **The blocking item is region routing (F)** — making the 119
   same-name SATR leaves distinguishable so gate 2 can ask "which region are you
   in?" instead of choosing between fourteen identical texts. That is workstream
   C, still running when this was written.
4. **Gate 2 is at its floor, not its ceiling — leave it on `veto` until the
   intake improves.** The workstream proved the constraint is upstream: gate 1
   has the right FAMILY in 38 of 38 reachable cases and the right LEAF in 20, so
   the whole remaining problem is choosing between siblings — and the fields that
   separate them (sub-national region, sub-sector, GBER objective) are exactly
   what the intake does not collect. More prompt work cannot reach them.

## The test set was leaking — every project-row number before today is overstated

`__recallSet.json` guarded leakage against `sample_project_titles` (SQLite), but
retrieval scores against `instrument_profiles.profile_text` (Postgres, built
separately and rebuilt since). Checked against the real target: **86 of 188
holdout `project` rows (46%) have their description verbatim inside the profile
of the fund they are supposed to find.** Of 319 described pairs only 168 are
honest. Shipped-set described-only EXACT@5 reads 44% against **38% de-leaked**.

`lib/intelligence/__recallSetEnriched.json` (new, via
`ETL/terms/enrich_recall_set.py`) recovers descriptions from a company's award
under a DIFFERENT regime, with six guards plus the profile-text check, and
re-verified at exact / sibling / 8-gram containment: **0 leaks**.

```
                        shipped   enriched
leak-free descriptions      168        524
distinct queries            313        531
```

`__recallSet.json` is untouched. `measure_recall.ts` gained `SET=` and
`DESCRIBED=1`. Use the enriched set for anything description-sensitive.

## Fixture warning

The gate-2 numbers above are pinned at `gate1@32f28f2`. Another workstream
changed gate 1 mid-session (`peerPrior.generated.json`, `semantic.ts`,
`relevance.ts`). **Re-running `build_gate1_fixture.ts` invalidates the
comparison rather than refreshing it** — rebuild the fixture AND re-run every
gate-2 variant together, or not at all.

## Rules that must not be broken

- Every peer-prior rebuild uses `--exclude-recall-set`. The shipped artifact was
  once built without it and the evaluation read its own answer key.
- Never compare a gate-2 number to a gate-1 number from a different script or a
  different N. That produced a phantom "80% baseline" that was really 49%.
- No hardcoded fund names, country lists or scheme codes. State a property and
  a test.
- Revert anything that measures worse, and say so.
