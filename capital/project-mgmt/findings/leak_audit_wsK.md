# Award-fitted artifact leak audit (workstream K)

Status: IN PROGRESS. Every artifact carries a verdict, including "not reached".

## The property being audited

An artifact fitted over award history, graded by replaying award history, must
not have seen the company being replayed. Stated once in
`ETL/lib/recall_holdout.py`; that file is the definition, this file is the
register of what has been held against it.

## Population, always stated

Three different denominators appear in this repo and have been silently
swapped for one another in at least three defects:

| population | n | what it is |
|---|---|---|
| instruments, all | 1,014 | every row in `funding_instruments` / `instrument_profiles` |
| instruments, publishable | 721 | what the product actually offers a founder |
| recall companies | 4,266 | distinct names across all five `__recallSet*.json` |
| composed recall pairs | 4,796 | rows in `__recallSetComposed.json` |

The coverage scoreboard counts 1,014. The product publishes 721. Mean sibling
class is **18.0 over all 1,014** and **25.5 over the 721 publishable only**.
Neither number is wrong; a number quoted without its population is.

## Verdicts

### Closed by `bc7ca0e` (predecessor), verified here

| artifact | verdict |
|---|---|
| `peerPrior.generated.json` | CLEAN. Had the only pre-existing exclusion. Rebuilds byte-identical under the shared helper, which is the check that the helper reproduces the discipline it replaced. |
| `regionPrior.generated.json` | WAS LEAKING, FIXED. Named two recall sets in a tuple literal; three sets added later were uncovered, so 2,390 of 4,266 companies (56%) were inside the artifact ranking their own siblings. 42 of 395 entries moved. |
| `channelPrior.generated.json` | WAS LEAKING, FIXED. No exclusion of any kind. 83 of 202 cells moved. |
| `sector_mix` (SQLite `funding_instruments`, shipped as `instrument_terms.json`) | WAS LEAKING, FIXED. 95.7% of composed pairs had their own vote in the won fund's mix; for 5.8% that vote was the only reason the fund showed the founder's sector at all. |
| `delivery_region` / `recipient_region_mix` | WAS LEAKING, FIXED. One attribution computed over two populations. |

### Found by this workstream

| artifact | verdict |
|---|---|
| **`instrument_profiles` (Postgres)** | **LEAKING, AND STALE.** Two independent defects, below. |
| **`semanticCache.generated.json`** | **DERIVED-CONTAMINATED.** 18 cached description->score maps scored against `instrument_profiles`. Inherits both defects above; must be regenerated after the profile rebuild, not before. |
| **`profileLeakIndex.generated.json`** | DERIVED. Emitted from `instrument_profiles.profile_text`; correct today, but must be re-emitted with the profiles or `check_recall_leaks.ts` grades a string that is no longer what retrieval scores against — which is the exact gap that artifact exists to close. |

### Examined, leak present, DELIBERATELY not closed

| artifact | verdict |
|---|---|
| `award_p50` / `award_n` / `event_count` | LEAKING, BOUNDED, ACCEPTED. `populate_funding_instruments.py` holds out only the four *graded* columns and says event counts and award percentiles are "descriptions and are not graded". **That justification is wrong on the facts** — `awardP50` feeds `ticketFit` in the row sort and `eventCount` is a sort tiebreak, both in `shortlist.ts`. The conclusion still stands, for a different reason: a replayed company contributes one award to a median over `awardN`, `ticketFit` returns a neutral 1 whenever `awardN < AWARD_N_FLOOR`, and one event cannot move a tiebreak over thousands. The leak is real, its magnitude is a rounding error, and closing it would mean re-deriving 400 columns. Recorded rather than fixed — but the *reason* in that comment should be corrected when someone next edits it. |

### Clean by construction (checked, no change needed)

| artifact | why it cannot carry this leak |
|---|---|
| `eligibility_embeddings` (4,720 rows) | Embeds eligibility gate/clause text — what a fund DEMANDS. Legal requirement text, never counted from events. No award history reaches it. |
| `themeIndex.generated.ts` | Derived from instrument name + thematic gates via `themeTokensFor()`. Pure function of committed `instrument_terms.json`; no events table. |
| `__objectives.json` / `emit_instrument_objectives.py` | Keyed on the GBER article number from the transparency register. What Art. 25(2)(c) permits is EU law, not a fit to our awards. |
| `regions.generated.ts` | NUTS region names and codes. Geography, not award history. |
| `evidenceTiers.json` | Tier definitions. No fitting. |
| `synthesis.py`, `country_map.py`, `coverage_indicator.py` (`website/build/`) | Award-fitted, and correctly so. These are published CORPUS STATISTICS — how much money, which countries — that no harness grades. A real founder is not in the test set, so excluding test companies here would make the site's headline figures wrong to protect a measurement that does not read them. This is the case `--include-recall-set` exists for. |
| `encode_intensity.py` (`intensity_p50`) | Award-fitted. Read by the brief as a displayed field (`aidIntensity`), not by any scorer, so it cannot vote on rank. Out of the graded shape. |

### NOT REACHED — stones still unturned

Named so the next person does not have to rediscover that they were skipped.

1. **`instrument_title_kind.json`** (`data/`, gitignored cache, 208 entries:
   165 `project`, 43 `scheme`). A per-instrument classification of whether
   `project_title` holds projects or aid scheme names, fitted over the same
   titles, and it *gates which instruments get a demonstrated-scope section at
   all* — so the exclusion now applied to titles sits downstream of a decision
   that already saw the recall companies.

   Partly turned. The classifier is shown eight titles per instrument, four
   from each end of the "shared by most distinct companies" ordering. Measured
   2026-08-06 23:0x CEST: **61 of 208 instruments (29.3%) would be shown a
   DIFFERENT sample under the holdout.** That is not negligible and it is more
   than "second-order" deserved.

   What remains untested is whether any changed sample changes the VERDICT —
   the model judges which kind dominates, and a reshuffled sample of the same
   kind classifies the same. Closing it costs ~208 Haiku calls (cents) plus a
   rebuild of the cache, and it was not run here because it would rewrite an
   artifact this branch is not otherwise touching, on the same night three
   other agents are writing to the corpus. **This is the single highest-value
   unturned stone.**
2. **`company_sector_labels` / `company_sector_llm`.** The founder's sector on
   the query side is taken from the recall row, not from these, so they do not
   appear to enter the graded path. Not traced end to end.
3. **The gate corpus itself** (`eligibility_gates`). Encoded from scheme text,
   not from awards, so it is out of shape — but `gate_role` and the intake
   encodings have been hand-corrected against observed failures, some of which
   were recall failures. That is a slower, human-in-the-loop fit to the test
   set and no mechanism here would detect it.
4. **`satr_staging` derived titles/objectives.** Register text, believed clean,
   not verified.

## The two `instrument_profiles` defects

### 1. No holdout of any kind

`build_instrument_profiles.py` builds a "demonstrated scope" section —
`"Projects it has actually funded: ..."` — from real awarded project titles,
selected top-`MAX_TITLES`(40) by frequency straight out of
`public_funding_events`. There is no company filter. This is the primary
semantic signal: `shortlist.ts` ranks on it and falls back to the lexical
index only when it is unavailable.

Measured on `__recallSetComposed`, 2026-08-06 22:25 CEST:

```
pairs whose won fund carries a title section        319   (all mode=project)
  ... own award contributed >=1 title to it         225   70.5%
  ... every selected title is the company's own       0    0.0%
instruments carrying a title section                165 of 1,014
```

So seven of ten graded project-mode pairs have their own award inside the
document they are scored against, and none is a pure answer key — the profile
survives the exclusion with most of its titles.

**Why the existing guard did not catch this.** `check_recall_leaks.ts` /
`profileLeakIndex.generated.json` test whether the row's *description* sits
verbatim (or as a shared 8-gram) inside the won fund's profile, and exclude
leaking rows from grading. That is a different, narrower property. A row whose
description is a *paraphrase* passes the leak filter and is still scored
against a profile partly built from its own award. The leak guard is not
loosened by anything here; this is a shape it was never asked about.

### 2. The published index predates the signal fix

```
instrument_profiles.built_at   min 2026-08-05 23:53:28 UTC
                               max 2026-08-05 23:54:04 UTC
bc7ca0e (the sector_mix/region fix)  2026-08-06 18:22 UTC
```

The profile text embeds the sector mix in words and the region share as a
sentence. Both columns were rebuilt clean 19 hours after the live index was
embedded from them. **The cleaned signals never reached production**: the
shipped semantic index still carries the leaky values. Fixing the SQLite
columns and the committed JSON without re-embedding left the largest consumer
on the old numbers.

## A third way a harness can grade something production never has

Found while re-baselining, and it is the same family as `dac300a`.

`hydrateDbInstruments()` sets `statement_timeout = 2000` and, on any failure,
falls back to the committed `instrument_terms.json`:

```
Postgres hydration failed, falling back to instrument_terms.json:
error: canceling statement due to statement timeout
```

It prints that line and **the run continues and reports a headline number**.
Two seconds is generous for an idle database and is not generous for one that
three agents and an embedding rebuild are already using — which is exactly the
condition a busy night produces. A measurement taken while Postgres is loaded
can therefore be graded against a different corpus from the one that ships,
and nothing in the printed result says so.

Checked rather than assumed, 2026-08-06 23:08 CEST: Postgres and SQLite agree
on **0 of 1,014** rows differing for `sector_mix` and `delivery_region`, so the
two corpora are in sync today and no number in this file is wrong because of
it. That is luck, not design — the harness would not have told us if they had
diverged, and the gate corpus reaches the fallback path differently from
Postgres.

Not fixed here: `corpus.ts` is on the ranking path and this branch is not the
place to change hydration semantics while other workstreams are running. The
measurements below were re-taken with Postgres idle and with the fallback line
grepped for explicitly; runs that hit it were discarded rather than reported.

## Corpus movement

Coverage agents are writing eligibility text to FR, ES and SE while this runs.
Every measurement in this file carries the wall-clock time it was taken.
Baseline reads are taken close together for this reason.
