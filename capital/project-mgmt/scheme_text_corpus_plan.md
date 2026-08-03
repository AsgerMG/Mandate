# Give 496 national schemes their own text

Written 2026-08-04. Planned before executing, because the last two corpus calls
this session were made on weak evidence and both had to be retracted.

## The gap, measured

`funding_instruments` holds 497 state-aid schemes. **Zero carry a URL, and there
is no description column at all.** Their entire own-text is what was added on
2026-08-03: `aid_measure_title` and `objectives_text` from the SATR register.

That is not enough to tell siblings apart:

```
258 SATR siblings  ->  114 distinct objective signatures
average siblings sharing one signature: 2.3
```

Diagnosed downstream of this, on holdout profile mode: the regime is right and
the scheme is wrong in **57 of 67 ranking misses**. A rank-preserving reassign
of siblings reproduced baseline to the cell, because siblings TIE on everything
we know about them. The ceiling is corpus, not ranking.

## What is already exhausted, so nobody re-tries it

- **The EC case register.** `data/raw/state_aid_cases/cases.json`, 467 records.
  Carries `caseTitle`, `caseObjectivesStr`, `caseRegions`, `caseAidInstruments`,
  `caseExpenditures`, dates. **No eligibility prose, no description.** Structured
  facts only, and the useful ones are already encoded (regions, closure dates,
  objectives). This was step 1 of the earlier plan and it is now done: the answer
  is that the register cannot close this gap.
- **SATR staging.** Mined 2026-08-03. `aid_measure_title` and `objectives_text`
  are in. Nothing else there is per-scheme text.

The remaining source is the scheme's own national page or legal act. That is
what this plan fetches.

## Scope: the 22 in-corpus countries only

Per [[project_country_scope_reduction]] the corpus is 22 countries; 18 are
excluded. One target was outside and has been dropped. 496 remain:

```
DE 118   IT 87   FR 52   CZ 38   NL 30   AT 29   BE 22   FI 15   GR 15
SK 13    IE 12   SE 12   LV 9    PT 9    EE 8    HU 8    PL 8    LU 6
GB 4     ES 1
```

Target lists: `data/raw/scheme_enrichment/targets_<CC>.json`, each row carrying
`instrument_id`, `sa_number`, `name`, `body`, `title`, `objective`.

## What we need per scheme, and why each

| Field | Why |
|---|---|
| `scheme_url` | the founder's actual next step; 0 of 497 have one today |
| `eligibility_text` | who may apply, in the scheme's own words. This is the field that separates siblings, and it is what the ADAPTIVE ROUND generates its questions from -- 453 children currently share one document, so the round asks identical questions of every sibling |
| `description` | what it funds, thematically. Feeds `instrument_profiles`, which is the semantic index a founder's description is matched against |
| `status` / `deadline` | whether it is open; 220 closed schemes were already removed once |

## Rules for the fetch, taken from what has already gone wrong

- **Abstain rather than guess.** A wrong fund name is worse than an ugly one and
  a wrong eligibility rule is worse still, because it will be quoted to a founder
  as a reason to act. No match recorded is the correct output for a scheme whose
  page cannot be found. Precedent: the naming work, and the `cells[6]` error that
  would have named 22 funds "state budget".
- **Match on the SA number, not the title.** A text search returns cases that
  merely cite a scheme. Precedent: [[project_state_aid_case_register]].
- **Verbatim, with its URL.** Every text captured carries the page it came from,
  so evidence tier can be assigned later. Paraphrase is not admissible.
- **No impersonation.** Three agencies already return 403/CAPTCHA and were
  deliberately left alone; getting past them means pretending to be a browser.
  Same rule here: a source that does not want to be read is skipped and reported.
- **Nothing is written to `intake_field`** -- the bulk extractor overwrites it
  ([[project_gate_encoding]]).

## Sequence

1. **Fetch** (agents, per country) -> `found_<CC>.json`, one record per scheme
   with the four fields above plus `source_url` and a `confidence`.
2. **Hand-read 20 per country** before any load. The region work shipped three
   defects that a guard caught; the naming work was reverted once.
3. **Load** into `funding_instruments` (new `description`, `scheme_url`) and
   `eligibility_gates` (own gates, marked not-inherited).
4. **Re-embed** `instrument_profiles`, run `check_index_freshness.py`.
5. **Re-measure** end to end, on the FULL funnel -- screen one, adaptive round,
   final five -- not `measure_recall.ts`, which stops after screen one and
   therefore cannot see the step whose job is separating siblings.

## The measurement this unblocks

`measure_recall.ts` grades screen one alone. The product is screen one -> pool ->
adaptive questions -> five rows, and the adaptive round asks from verbatim gate
text. While 453 children share one document that round cannot discriminate,
which is why the corpus work comes first and the funnel harness second.
