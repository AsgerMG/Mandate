# What still tells one sibling fund from another, cheapest source first

**Workstream BY · 2026-08-09 · isolated worktree off `main` at `728df518`.**

Reproduce (both sources are FREE — HTTP and disk, no model calls):

```
cd website/frontend
npx tsx scripts/dump_publishable_ids.ts /tmp/pub.json
cd ../..
PUBLISHABLE=/tmp/pub.json python3 ETL/terms/measure_scheme_evidence.py
python3 ETL/terms/measure_scheme_evidence.py            # whole corpus
python3 ETL/terms/fetch_case_extra_fields.py            # the 5 fields the cache dropped
```

Instruments come from Railway Postgres (`instruments 1088`, printed by every
run). `satr_staging` is read from local SQLite because it is a raw extract, not
a product store. The publishable set comes from `dump_publishable_ids.ts`, which
applies the shipped liveness rule rather than a second copy of it.

---

## 1. The brief, and the answer

wsBU measured encoded gates at **1.3 ±0.4** alone — below a shuffle, 0.0 on
exact attribution — and diagnosed it as inheritance: 453 children take their
rules from one regime document, so siblings carry identical rule sets and rules
that agree cannot separate. **477 of 1,088 instruments carry no gate quoting a
document of their own** (382 of the 895 publishable ones); 268 carry 1–4.

The question was what the two free per-scheme sources could still buy, measured
as **residual sibling class** and **@5 ceiling**, not as coverage.

**They buy nothing. Measured, not assumed: every field of both sources adds
EXACTLY 0.0 to the @5 ceiling once `scheme_code` is in the key — all seventeen
of them, to the tenth.**

---

## 2. Why the null is structural rather than a fact about which fields we kept

Both sources are keyed on the **SA number**, and the SA number is already a
corpus column: `populate_funding_instruments.py` splits a SATR regime into
children on `(family, granting_authority, sa_number)`. So every register fact
is **constant inside a leaf's own cell by construction**. A field cannot
distinguish two rows that were defined by having the same value of it.

Publishable population, 36 multi-leaf regimes holding 605 leaves. Baseline is
the key `measure_sibling_coverage.ts` already uses, so the numbers compose:

| key | mean class | alone | **@5 ceiling** |
|---|--:|--:|--:|
| baseline (admin_body \| delivery_region \| eligibility_text) | 7.80 | 61.3% | **85.5%** |
| baseline + `scheme_code` — already in the corpus | 7.33 | 81.0% | **88.1%** |
| baseline + every case-register field | 7.33 | 80.7% | **88.1%** |
| baseline + every SATR field | 7.33 | 81.0% | **88.1%** |
| baseline + case + SATR together | 7.33 | 81.0% | **88.1%** |

On top of `baseline + scheme_code`, **+0.0 for every one of**: `caseTitle`,
`caseObjectivesStr`, `caseAidInstruments`, `caseRegions`, `caseMeasureEndDate`,
`caseAidCategory`, `caseSimplifiedProcedure`, `caseInitiationDate`, `caseLinks`,
`aid_measure_title`, `objectives_text`, `aid_instrument_text`, `national_id`,
`region`, `sector_nace`, `entrusted_entity`, `financial_intermediaries`.

The whole corpus (1,088 / 52 regimes / 780 leaves) reproduces it: baseline
83.5%, + `scheme_code` 88.1%, + everything free 88.1%.

### Reach is identical too, and it is the same 160 rows

The case register reaches 361 publishable instruments; SATR reaches **the same
361**, because both join on the same key. Of the 382 publishable evidence-less
instruments, **both reach 160 and neither reaches the other 222.** There is no
union to be had — the second source adds no row the first did not already have.

### The register has already been spent, and this says which field went where

| field | consumed by | status |
|---|---|---|
| `caseTitle` / `caseOriginalTitle` | `populate_funding_instruments.py` → `name` | **430 rows carry `name_source='case_register'`** |
| `caseObjectives(Str)` | `encode_article_intensity.py` → GBER article + intensity ceiling | consumed |
| `caseRegions` | `encode_declared_catchment.py`, `encode_registered_regions.py` | consumed |
| `caseMeasureEndDate` | `liveness.py` / `scheme_end_date` | consumed |
| `caseLinks` | `populate_funding_instruments.py` → successor | consumed |
| `caseAidInstruments`, `caseExpenditures`, `caseAidCategory`, `caseSimplifiedProcedure`, `caseInitiationDate` | nothing | unused, and each measures **+0.0** |

The register's single separating field — the scheme's real title, "Federal
support for efficient heat networks" instead of "Bundesamt für Wirtschaft und
Ausfuhrkontrolle" — was harvested already. That is why `caseTitle` and SATR's
`aid_measure_title` score identically to the bare SA number: they are it,
spelled out.

### Five fields the cache had dropped — fetched, and they die too

`fetch_state_aid_cases.py` keeps 14 of the record's 48 metadata fields on the
judgement that the rest is search-engine plumbing. Read against a live record,
five of the dropped ones are not plumbing: `caseSectors` (NACE scope),
`casePrimaryLaws`, `caseSecondaryLaws`, `caseMeasureStartDate`,
`caseNotificationDate`. `caseSectors` in particular is the only unused register
field that is **founder-testable** — a founder has a sector; an SA number is an
identifier they can never match on — so it was worth a free fetch rather than
an argument. `fetch_case_extra_fields.py` collected all five for all 531 cached
SA numbers:

```
caseSectors            31 / 531   5.8%      casePrimaryLaws     22 / 531   4.1%
caseMeasureStartDate  497 / 531  93.6%      caseSecondaryLaws   20 / 531   3.8%
caseNotificationDate  401 / 531  75.5%
```

`caseSectors` reaches **2.0% of publishable multi-leaf leaves** — the two
largest sibling groups in the corpus, SA.56245 (18 leaves) and SA.111723 (14),
both carry an empty array. And all five measure **+0.0** over
`baseline + scheme_code`, exactly like the rest. The one founder-testable field
the register still held is both too sparse to matter and structurally unable to
separate.

**The record carries no prose and no documents.** Checked on four cases
(SA.63177, SA.56245, SA.111723, SA.107952): `summary`, `content` and `children`
are empty on every one, and `url` is the europa.eu index page. There is no
eligibility text in this source to find.

---

## 3. Where the residual actually sits, and why money cannot move it

At `baseline + scheme_code`, **72 publishable leaves remain in a class larger
than five. All 72 are Spanish, and all 72 are in one regime, `bdns_es_ayudas`.**
Every other publishable leaf already fits in five rows. Not one of the 72
carries any `eligibility_text`.

Whole-corpus view: 93 such leaves — ES 73 (`bdns_es_ayudas`), EU 12 (`ipcei`),
8 (`eit`) — and **not one of them carries an SA number**, which is exactly why
no free source reaches them. `ipcei` and `eit` are 0/12 and 0/9 publishable, so
they cost the founder nothing today.

All three have a recorded structural reason a per-scheme document does not
exist:

- **`bdns_es_ayudas`** — `scheme_text_corpus_plan.md`, 2026-08-05: BDNS logs
  each year's call as its own scheme identity ("convocatoria del año 2024"),
  so these are single-year vintages with no standing page. 93 of 93 Spanish
  targets were already resolved; only 6 carried eligibility text, and the note
  ends **"Do not re-attempt fetching the remaining 87."** These 72 are those
  rows.
- **`ipcei`** — redacted by design (`project_amount_recovery`).
- **`eit`** — not publishable.

So the one population a paid national-document fetch could be the first
evidence for is the one population already measured as having no document.

---

## 4. The ceiling is not what is binding, and that is the finding

The @5 ceiling on the shipped population is **85.5%** before any fetch, against
a shipped **EXACT@5 of 25%**. Sixty points of headroom sit under a ceiling the
corpus already permits, and wsBU has just measured that no ranking signal —
including a fourteen-feature blend given a free fit — beats what ships.

Neither the corpus nor the ranker is the binding constraint on the sibling
choice. Two measurements now agree, from opposite directions.

**A caveat this finding must carry.** The class metric keys on verbatim
`eligibility_text`, so any leaf with unique text counts as "alone". That is
separation of IDENTITY, not of MATCHABILITY: a founder can only be matched to
text that states a condition they can be tested against. The ceiling is
therefore generous. It does not change the verdict here — the free sources add
0.0 to it either way, and the residual is 72 rows in one structurally
document-less regime — but a future workstream should not read 85.5% as
"85.5% is achievable by matching."

---

## 5. Recommendation on step 3: do not spend

The costed proposal the brief asked for, with the measurement that kills it.

| | |
|---|---|
| what would be fetched | national scheme documents for the leaves no free source reaches |
| how many schemes | 222 publishable evidence-less rows without an SA number, of which only **90 sit in a multi-leaf regime** where separating pays: ES 87, EE 2, SE 1 |
| best case @5 ceiling gain | **11.9 points** (88.1 → 100), and only if every one of the 72 residual leaves yields a distinct, founder-testable document |
| measured probability of that | the same 72 rows were fetched in full on 2026-08-05 — 93/93 targets resolved, 6 carrying text — and the ceiling was recorded as structural, not effort |
| expected gain | **~0**, and it would be the fourth spend against a document the state does not publish |

**Recommendation: spend nothing on step 3.** Not a deferral — the fetch has
already been run to completion against this exact population and returned the
answer.

What to do with the free sources instead, in order:

1. **Nothing further on the case register or SATR for separation.** Both are
   exhausted, now with the separation measurement the 2026-08-04 note asserted
   but did not have. `measure_scheme_evidence.py` is the reproduction, so the
   next workstream does not pay to re-derive it.
2. **Do not load `caseSectors` either.** It was the one candidate worth a free
   fetch and the fetch answered it: 31 of 531 cases, 2.0% of publishable
   multi-leaf leaves, +0.0 separation. The five recovered fields are now in the
   cache and cost nothing to keep, but nothing should be built on them. This
   is recorded so the next workstream does not re-derive it.
3. **Stop looking for the answer in per-scheme facts.** The ceiling is 85.5%
   and the product is at 25%. The gap is not in what the corpus records about
   the fund; it is in what the product knows about the founder, and wsAO already
   measured that describing founders honestly rather than identically moved
   three signals from inert to live.

## What was changed

- `ETL/terms/measure_scheme_evidence.py` — the separation measurement, whole
  corpus or `PUBLISHABLE=<ids.json>`, refusing to run on an empty allow-list.
- `ETL/terms/fetch_case_extra_fields.py` — tops the case cache up with the five
  per-scheme fields the first pass dropped; POST-not-GET, exact `reference`
  match, merges rather than replaces, records the attempt either way so a
  re-run resumes instead of re-paying. Run to completion: 531/531.

No product code changed. `python3 -m compileall -q ETL/` clean, `npx tsc
--noEmit` clean, `check_recall_floor.ts` **ok** — pool 94% (floor 89), EXACT@5
25% (floor 15), REGIME@5 76% (floor 69), and the three per-population floors.
Guards proved to fail, not assumed: an empty `PUBLISHABLE` allow-list exits 1
rather than silently measuring nothing, a missing file exits 1, and an empty
`DATABASE_URL` exits 1 rather than falling back to SQLite.
