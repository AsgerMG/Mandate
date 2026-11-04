# Funder-page evidence

One JSONL file per investigation. **One line per instrument row**, so the record
is greppable, diffable, and survives being partially rewritten.

This directory exists because a previous audit of the same question produced
~90 non-offerable rows, reported them in prose, and was never committed. The
finding is gone and cannot be acted on. A laborious finding that is not
committed did not happen — so the evidence is the deliverable, and the
suppression that may follow from it is not.

## The standing rule this file serves

> What a fund IS, and whether it is open, comes from the official page.
> Corpus-internal inference is evidence, never a verdict.

That rule was set after a real programme was wrongly unpublished on inference.
So every line carries the URL that was read and the date it was read, and a row
whose page could not be reached says `unsettled` **explicitly** rather than
defaulting either way. `unsettled` is a finding. It is not a failure to have
one.

## Fields

| field | meaning |
| --- | --- |
| `instrument_id` | the row in `funding_instruments` |
| `country` | ISO-2, for costing a suppression per country |
| `we_claim` | what the corpus asserts today: name, SA case code, the end date and its basis, the last award year, and **why the row is currently offered** |
| `checked` | `url`, `http_status`, `checked_at`, `page_title`. `url: null` means we hold no funder page for this row at all — a different and worse state than a page that failed to load |
| `funder_says` | one sentence of what the page states, in English |
| `quote` | verbatim from the page, in its original language. `null` when the verdict rests on an absence |
| `window` | any window date the page states, verbatim |
| `verdict` | see below |
| `basis` | which source settled it, and how |
| `corroboration` | the EC state-aid case register's own record for the SA number, where one exists. A second official source, never the deciding one |
| `mismatch` | set when the page is plainly about a different scheme than the row claims. Its own defect, and worse than a liveness error |
| `action` | `keep`, `suppress`, `rename`, `rekey`, or `none` |

## Verdicts

A closed **call** is not a dead **scheme**. Most of these are recurring
programmes between rounds, and collapsing the two would hide funds that reopen.

| verdict | meaning | offerable? |
| --- | --- | --- |
| `open` | the funder's page presents the scheme as applicable now | yes |
| `between_calls` | the scheme exists and continues; this round's window has shut | yes, **with the caveat shown** — the product should say "this reopens" |
| `retired` | the funder's own page says it ended, was abolished or replaced | no |
| `not_a_fund` | not a thing a company applies to — a budget code, a legal text with no application route, a register artefact | no |
| `unsettled` | the page could not be reached, or does not say, or we hold no page | **no verdict.** Do not suppress on this |

`not_a_fund` and `retired` are kept apart deliberately: they need different
fixes. A retired scheme was once real and its awards are still true history. A
`not_a_fund` row was never applicable and its awards belong to something else
that we are not naming correctly.

## Files

- `funder_evidence_2026-08-12.jsonl` — the rows held open only by our own award
  history, plus Norway. See `wsfx_findings.md` for what it established.
- `wsfx_fetch.sh` — how the pages were fetched. Public pages, no credentials.
- Selected by `website/frontend/scripts/_wsfx_pull.ts` — read-only, writes
  nothing, and the only record of *which* rows were put to the funders and why.
  The population is a query, not a list: rows whose openness rests on a past
  `notified_duration` reopened by `last_year > endYear` in `isClosed()`, plus
  Norway. Re-run it and the population is re-derived rather than trusted.

## wsGL, 2026-08-13 — the reachability audit

Three files, all answering "what removes the right fund BEFORE any ranking
happens", against the funnel population of 897 held-out described founders,
every one of whom won a fund the corpus offers today.

- `wsgl_manufactured_rows_2026-08-13.jsonl` — the 7 rows nothing outside their
  own id names. 22 of the 26 founder losses are Polish, and **Poland has zero
  publishable funds in the corpus**: all 8 Polish rows are query slugs our
  extractor invented. Three of the five register names behind them turn out to
  be legal citations or GBER aid CATEGORIES, so naming the rows from the
  register is a strict improvement and is not sufficient.
- `wsgl_data_floor_2026-08-13.jsonl` — the 7 rows below `meetsDataFloor`.
  Five publish their own ticket range on their own front page, so "no amounts"
  is our collection gap; one (`cdp_vc_fof`) is not a fund at all and also
  carries the wrong country.
- `wsgl_gate_contradictions_2026-08-13.jsonl` — one line per blocking gate for
  the 70 founders whose won fund is deleted by a cited structural filter. Adds
  `defect_class` and, where the funder's page was read, `quote`.

Two extra verdict values appear in the gate file, because "is this fund open"
is not the question there:

| verdict | meaning |
| --- | --- |
| `gate_wrong` | the funder's own page states a rule that our encoding of it does not match |
| `harness_only` | the block cannot happen on a real request, because production never populates the field |

Re-derive any of it for nothing. Each file names the script that wrote it, so a
line here can be re-checked rather than taken on trust:

    npx tsx scripts/wsgl_corpus_stage.ts      # the publishability loss, attributed
    IN=<wsge rows.json> npx tsx scripts/_wsgl_arms.ts   # what each repair recovers
    npx tsx scripts/_wsgl_rows.ts             # -> wsgl_manufactured_rows_*.jsonl
    npx tsx scripts/_wsgl_floor.ts            # -> wsgl_data_floor_*.jsonl
    IN=<wsge rows.json> npx tsx scripts/_wsgl_contradictions.ts
                                              # -> wsgl_gate_contradictions_*.jsonl
    npx tsx scripts/_wsgl_snapshot.ts         # what the degradation policy withholds
                                              #    off the COMMITTED snapshot, today

`_wsgl_snapshot.ts` deletes `DATABASE_URL` on purpose, to force the snapshot
path. It is the only thing here that reads what a reader without credentials
would see, which is why it is not interchangeable with the others.

## wsGU, 2026-08-13 — the gate-encoding corrections

- `wsgu_gate_encoding_corrections_2026-08-13.jsonl` — the 63 corrections that
  take `check_winner_not_gated` from 251 wrongful deletions to 14. Every row
  carries the funder's URL, the verbatim quote and the reasoning. **Queued for
  the owner in `AWAITING_APPROVAL.md` §0; not applied.**
  Apply with `python3 ETL/terms/apply_gate_encoding_corrections.py --apply`
  (a dry run without the flag, and it refuses outright if any row has drifted).

The two scratch scripts behind it, both free and both reading the committed
snapshot rather than the database:

    npx tsx scripts/_wsgu_blockers.ts          # the exact gate ROWS behind each block
    npx tsx scripts/_wsgu_constant_fields.ts   # what a gate keyed on a CONSTANT field
                                               #   can do: reject, pass, or nothing

`_wsgu_constant_fields.ts` is the one that generalises. `borrowerModel` is
pinned to `operating` for every founder, so a rule written against it is not a
filter on the applicant at all — it either rejects everyone or admits everyone.
That is the shape of the Norges forskningsråd defect in §0, and the script finds
the rest of the family rather than the instance.
