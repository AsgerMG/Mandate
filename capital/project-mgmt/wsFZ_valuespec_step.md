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
