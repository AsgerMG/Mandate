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
- **Prioritise recent sources.** Prefer the current version of an eligibility
  page over an archived or superseded one -- a scheme's terms change (ticket
  size, GBER article, region) and last year's page can misstate what a
  founder can actually apply for today. Where a page is dated, take the newest;
  where two vintages of the same scheme exist (the Austrian FFG 2022 vs
  2024-2026 pattern), fetch the current vintage, not the historical one.
- **Only fetch for ACTIVE funds.** A closed scheme's eligibility text is not
  worth the fetch -- 220 closed schemes were already removed from the
  publishable set once, and re-fetching their old rules risks them creeping
  back into ranking or the memo. Check `status`/`deadline` first; if a scheme
  reads closed, record that and move on rather than spending a fetch on its
  eligibility text. Don't discard prior work here -- schemes already fetched
  before this note, closed or not, stay as recorded (useful for the
  document-per-scheme vs framework-country diagnosis either way), but this
  governs everything fetched from now on.

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

---

## First run: stopped by the spend limit, but it answered the question

2026-08-04. All six agents terminated on the account's monthly spend limit. 274
of 496 schemes touched, **56 carrying real text**. Raw output lives in
`data/raw/scheme_enrichment/found_<CC>.json` (gitignored, like every raw cache).

Quality where it landed is good -- verbatim text, a real source URL, a
confidence grade:

```
SA.101250  incentivi.gov.it    "Imprese di qualsiasi dimensione che intendono
                                realizzare investimenti di grandi dimensioni..."
SA.112229  businessfinland.fi  "Rahoitus on tarkoitettu Suomessa toimiville
                                yrityksille..."
```

### The finding that matters, and it splits by country

```
IT   25 records -> 15 distinct texts over 20 SA numbers
FI    6 records ->  3 distinct texts
FR   25 records ->  4 distinct texts over  4 SA numbers
```

**France reproduces the exact problem the fetch was meant to solve.** Its
schemes are *régimes cadres exemptés de notification* -- umbrella frameworks
that many instruments genuinely share -- so there is no per-scheme document to
find. That is a fact about how French state aid is published, not a fetch
failure, and no amount of scraping changes it. Italy has real per-scheme pages
and the text discriminates.

So: **the corpus fix works where a scheme has its own document, and cannot work
where the state publishes one document for many.** That distinction should drive
the rest of this plan rather than country size.

- **Document-per-scheme countries** (IT confirmed; DE and NL expected, both
  wrote structure before dying): finish the fetch. This is the work that pays.
- **Framework countries** (FR confirmed): stop looking for a scheme document.
  The discriminator has to come from elsewhere -- the award history we already
  hold (`sector_mix`, `award_p50`, region) or from the intake asking something
  sharper. Scraping harder is money spent on a document that does not exist.

### State of the fetch

```
DE  118 structure, 0 text     CZ 38  not started
IT   87 structure, 25 text    AT 29  not started
FR   52 structure, 25 text    SK 13  not started
NL    2 structure, 0 text     SE/LV/EE  not started
FI   15 structure, 6 text
```

Targets are unchanged and re-runnable. Resume with DE and IT first: DE is the
largest market and its Förderdatenbank is a genuine per-scheme register, so it
is the highest expected yield per euro.
