# Start here tomorrow

Written 2026-08-06, end of session. **Four workstream agents were still running
when this was written** — expect uncommitted changes in the tree from them.
Check `git status` and `git log` first; some of what is described below may
already have landed.

## FIRST: two workstreams died mid-edit

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
