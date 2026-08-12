# wsFZ — is there a second step between the scheme-text gate pass and the ranker?

Read-only investigation. Nothing here was run against production.

## 1. An unencoded gate does not filter and does not rank

`website/frontend/lib/intelligence/verdict.ts:157`

```ts
function isFilter(g: DbGate): boolean {
  // Untriaged gates (gateRole undefined) are still honoured, so the system
  // degrades safely while encoding coverage grows.
  return (!g.gateRole || g.gateRole === "filter") && Boolean(g.valueSpec);
}
```

`Boolean(g.valueSpec)` is the whole answer. `gate_role='filter'` with `value_spec IS NULL`
never enters the loop, so:

- `assessInstrument` never increments `checked` -> status stays `unknown`, no blocker,
  no exclusion. A cited unencoded rule CANNOT condemn, because it is never evaluated.
- `gateFitScorer` (shortlist.ts:449) calls `assessInstrument` and only records a leaf
  when `a.checked > 0`; with fewer than two known leaves it `continue`s. So no ranking
  effect either.
- `rankerAsks.ts:273` `isFilterGate` repeats the same `Boolean(g.valueSpec)` test, so the
  adaptive round will not ask about them.

So an unencoded gate is INERT for filtering and for ranking. It is not a soft signal.

## 2. It is not fully inert as CONTENT

Two surfaces read gates that have no spec:

- `judgementCriteria` (shortlist.ts:846-874) requires `!g.valueSpec` AND `isCited(g)` and
  prints up to 3 as the fund's assessment criteria. The new gates are `llm_cited`,
  role `filter`, spec NULL -> they land here and change memo TEXT.
- `openQuestions.ts` / `openFitScorer`: unencoded requirement text can become an adaptive
  question and then a ranking multiplier — but only if
  `openQuestionClass.generated.json` classifies that exact requirement text as
  `judgeable`. `requirementClassOf` returns undefined for text never classified, and
  undefined is explicitly NOT treated as judgeable. New text needs
  `scripts/emit_open_question_class.ts` (a paid model pass) before it is asked.

## 3. `encode_gates.py encode` is a paid model pass

`ETL/terms/encode_gates.py:663`. Sonnet 5, `ENCODE_CHUNK = 15` gates per call,
`thinking` disabled, structured output. Its scope:

```
WHERE verification_level IN ('llm_cited','llm_2pass','human_verified')
  AND gate_role='filter'
  AND intake_field_resolved NOT IN ('none','')
  AND value_spec IS NULL
```

Measured in SQLite (mid-run, read-only) over `gate_key LIKE 'scheme_text_%'`:

| role | tier | rows | with a resolved field | already encoded |
|---|---|---|---|---|
| filter | llm_cited | 756 | 549 | 177 |
| filter | llm_2pass | 31 | 31 | 19 |
| programme_fact | llm_cited | 617 | 0 | 0 |
| obligation | llm_cited | 122 | 0 | 0 |
| vague | llm_cited | 49 | 0 | 0 |

Pending encode, scheme_text rows only: **384**. Corpus-wide pending: **687**.
308 instruments currently carry scheme_text gates.
(Re-measured minutes later: 712 / 377 — the paid run is actively writing.)

Cost, priced by probe (`count_tokens`, a free endpoint — no paid call made):

- one 15-gate chunk = **3,291 input tokens**; output ~15 small JSON objects, ~900 tokens
- Sonnet 5 intro pricing (through 2026-08-31): $2/$10 per MTok -> **~$0.016 per call**
- projected pending at run end ~1,100 gates -> **74 calls -> ~$1.2** (~$1.7 at standard $3/$15)

Use `--fresh`: without it the pass re-bills gates the encoder already looked at and
correctly refused. Corpus-wide `--fresh` pending today is 621, of which 377 are
scheme_text; the other 244 belong to other passes.

## 4. `encode_gates.py encode` has NO publish path

`main()` attaches `--publish` only to `repair-countries` and `retract-unreachable`.
`encode` writes `value_spec` to SQLite and stops there. The specs reach Postgres via
`encode_scheme_text_gates.py publish` (its `PUB_COLS` includes `value_spec`) — but that
publish is scoped to `gate_key LIKE 'scheme_text_%'`, so the ~244 non-scheme_text gates
the same encode pass would fill in are written locally and never shipped.

## 5. The full chain, and where it already lives

`make eligibility` (Makefile) is the chain, and it already puts `encode` immediately
after the scheme-text run. In order, from written gate to used gate:

| # | Step | Paid? | Note |
|---|---|---|---|
| 1 | `encode_scheme_text_gates.py run` | **$7.94** | the run happening now |
| 2 | `encode_gates.py encode --fresh` | **~$1.2–1.4** | fills `value_spec`. **This is the second step.** |
| 3 | `encode_regions.py run` | **~$0.4** | 52 calls, 49k input tokens (probed). Re-bills its whole candidate set every run — its scope is a regex on requirement text, not "unencoded" |
| 4 | `check_gate_subject.py` | free (layer 1) | `--judge` is the paid layer; not run by default |
| 5 | `apply_gate_role_overrides.py` | free | re-applies curated demotions that `triage` reverts |
| 6 | `retract_unpertinent_text.py --write` | free | must land before the profile rebuild |
| 7 | `audit_encoding_vs_reality.py --quarantine` | free | clears specs their own recipients contradict |
| 8 | `coverage_gate.py` | free | refuses to publish a corpus that got worse |
| 9 | `website/build/eligibility_export.py` | free | rewrites `public/data/instrument_terms.json` — the committed fallback corpus, which **does carry gates and valueSpec** (today: 7,471 gates, 3,232 with a spec, 1,070 scheme_text) |
| 10 | `emit_theme_index.ts` | free | derived from the export |
| 11 | `migrate_to_postgres.py` | free | truncate + reload; this is what the live site reads |
| 12 | `embed_eligibility.py run` | Voyage, cents | reads **Postgres**, so it must follow step 11. Incremental on the natural key |
| 13 | `build_instrument_profiles.py classify-titles` + `run --rebuild` | Voyage + model | the primary ranking index |
| 14 | `_wsdr_curve.ts` | free | re-measures the base rate the selector is told |

**Not in `make eligibility`: `emit_semantic_cache.ts`.** `semanticCache.generated.json`
is the committed offline mirror every NO_PG check ranks on, and nothing in the target
regenerates it. `check_corpus_currency.ts` is what catches the resulting staleness.

Scoped alternative to steps 9–11 if a full `make eligibility` is not wanted:
`encode_scheme_text_gates.py publish` ships `scheme_text_%` rows including `value_spec` —
but only those rows, and it does not touch `instrument_terms.json`.

## 6. Parent-less rows: the premise is right, with one correction

`plan`'s 118-of-476 is the right shape. Replicated `scoreable()` against the live DB
mid-run: 319 of 359 remaining rows are scoreable, and over the whole 687-row universe
481 are. 476 − 358 = 118 checks out.

`gateFitScorer` opens `if (group.length < 2) continue`, so a parent-less leaf gets no
ranking discrimination. Correct.

Exclusion: `assessInstrument` has no parent requirement, and `memoCandidates.ts:141`
drops every row whose status is `blocked` (logged as `VER-BLOCKED`). So a parent-less
row DOES gain exclusion — **but only once `value_spec` is filled in.** Unencoded, it
gains neither. The claim is true of the encoded end state, not of the run alone.

## 7. Three repo premises, checked against the code

- **"`gate_role` must never be NULL"** — TRUE, but not for the stated reason.
  `verdict.ts:160` explicitly HONOURS a NULL role (`!g.gateRole || g.gateRole === "filter"`).
  The inertness comes from `encode_gates.py:700`, whose scope is `gate_role='filter'` —
  a NULL-role gate is never encoded, so it never gets a spec, so it is never evaluated.
- **"corrections must never go in `intake_field`"** — TRUE. `classify_gates_bulk.py`'s
  ON CONFLICT overwrites it; both encoders read `intake_field_resolved`, and
  `rankerAsks.ts:279` reads the field off `valueSpec.field` rather than `intakeField`.
- **"only a cited rule may condemn"** — TRUE ONLY FOR THE STRUCTURAL PATH.
  `verdict.ts:190` filters `isStructural(b.field) && b.cited`, but the tail is
  `else if (blockers.length === 1) one_blocker; else blocked`. **Two uncited,
  non-structural failed filters still produce `blocked`**, and `blocked` is dropped from
  the memo. The docstring's "uncited rules NARROW but never CONDEMN" is not literally
  true of the code. It does not affect this run (its gates are `llm_cited`).
