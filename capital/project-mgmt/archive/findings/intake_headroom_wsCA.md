# The sixty-point gap is an artefact of the metric, and the real one is fifteen

**Workstream CA · 2026-08-09 · isolated worktree off `main` at `a6b19294`.**

> ## ⚠ 43.1% IS RETRACTED AS THE FOUNDER-REACHABLE CEILING
>
> ## ⚠ AND IT IS NOW ALSO RETRACTED AS A NUMBER (wsCP, 2026-08-09)
>
> Re-run on `59df3f83`, `PUBLISHABLE=/tmp/pub.json npx tsx scripts/_wsca_founder.ts`
> (`number_audit_wsCP_wsca_founder.txt`):
>
> | this document | today |
> |---|---|
> | every intake field at once, matchable **31.4%** | **40.3%** |
> | + region and capital type off the corpus **43.1%** | **51.7%** |
> | the identity ceiling **85.5%** | 85.5% — reproduces exactly, and is still circular |
>
> `organisationType` became a real intake field after this ran (wsCH,
> `af5c0bf4`), so the key is wider than it was. **Do not quote 43.1% as "still
> correct as the bound on today's product"** — that sentence was in
> `RESUME_HERE.md` until wsCP removed it. Reproducibility is not validity, and
> 85.5% reproducing exactly while remaining circular is the proof.
>
> **Retracted 2026-08-09, same day, by wsCC (`6cab7a7d`). Reason: CONDITIONED
> ON A FIXED INTAKE.** 43.1% is the ceiling reachable through *today's* intake
> fields and their comparators as encoded today. It bounds today's product; it
> does not bound the target, because the target was restated the same day as
> **95% assuming FULL founder information**. A ceiling measured on the questions
> we happen to ask cannot answer a question about the questions we could ask.
>
> **What replaced it:** **65.9% EXACT@5 ("66%")** — the honest maximum under
> full founder information, keyed on DEMAND CLASS rather than on wording, so
> two funds demanding the same thing in different words collapse and are not
> credited. The plannable figure is **58.3%**: a greedy chooser bounds any
> question-selection policy and saturates there by fifteen questions. See
> `rich_intake_wsCC.md`. 95% is not reachable and was never reachable.
>
> **This document's own retraction of 85.5% stands** (§2) and is confirmed by
> wsCC. 43.1% was a genuine repair of a circular number; it was then superseded
> by a wider one, which is a different failure and a milder one.
>
> ### One substantive finding below is WRONG, not merely superseded
>
> §1 and §4 conclude that every remaining intake question is worth **+2.0** of
> ceiling between them, and that there is no next question to ask. **That is
> contradicted by measurement.** wsCH (`a9c9753`) measured ORGANISATION TYPE —
> company vs sole trader vs commune vs university vs association, 619 gates on
> 384 instruments — at **CEIL@5 40.0 → 51.7 (+11.7)** on *this document's own
> population and key*, spread over 12 regimes with a largest share of 15%. It
> is crisp, instantly answerable, and no intake field carried it. This
> workstream missed it by reading that bucket as SME status.
>
> So read §1/§4's "+2.0" and "there is no next question" as applying only to
> the fields this workstream enumerated, **not** as a general result about
> intake questions. The wsCH figure is recorded in commit `a9c9753` only; no
> findings document carries it.

Reproduce (every harness is FREE — Postgres and disk, no model calls):

```
cd website/frontend
npx tsx scripts/dump_publishable_ids.ts /tmp/pub.json
PUBLISHABLE=/tmp/pub.json npx tsx scripts/_wsca_ceilings.ts   # the 85.5% key
PUBLISHABLE=/tmp/pub.json npx tsx scripts/_wsca_founder.ts    # the founder-side key
PUBLISHABLE=/tmp/pub.json npx tsx scripts/_wsca_marginal.ts   # the 17, over the 6
PUBLISHABLE=/tmp/pub.json npx tsx scripts/_wsca_newq.ts       # any new question, bounded
```

Population and key are wsBY's, so the numbers compose with its 85.5%:
publishable leaves in multi-leaf regimes, 36 regimes holding 605 leaves,
ceiling@5 = the share of leaves whose residual class fits the five rows shown.

---

## 1. The brief, and the answer

The brief: 85.5% ceiling, 25% shipped, sixty points of headroom, and neither
the ranker (wsBU) nor the corpus (wsBY) binding. Find the next region question.

**There is no next region question, and the sixty points were never there.**
The founder-reachable ceiling is **43.1%**, not 85.5%. The six intake fields
that already rank reach **40.0%** of it. Every remaining question in the intake,
answered perfectly and wired in, is worth **+2.0**.

⚠ **Both claims in that paragraph have since been qualified — see the banner
at the top.** 43.1% is retracted as *the* founder-reachable ceiling because it
is conditioned on today's fixed intake; under full founder information the
figure is 65.9% (`rich_intake_wsCC.md`). And "+2.0 for everything remaining"
holds only for the fields enumerated here: organisation type, which this
workstream did not test as its own field, measured **+11.7** on this same
population and key (wsCH, `a9c9753`). The one claim that survives intact is
that the sixty points were never there.

---

## 2. Why every field measures +0.0 on the 85.5% key, and why that is a tautology

`_wsca_ceilings.ts` reproduces wsBY's baseline to the decimal — mean class 7.80,
alone 61.3%, **CEILING@5 85.5%** on 605 leaves in 36 regimes. On top of it,
**all 23 intake fields measure +0.0 to +0.5**, and all 23 at once measure +0.5.

That is the same structural null wsBY found with the SA number, one level in.
The baseline key contains **verbatim `eligibility_text`**, and every encoded gate
is *extracted from that text* by `encode_gates.py` and its siblings. A gate
cannot separate two leaves whose text already differs, and two leaves whose text
is identical have identical gates by construction. **Conditioning on the text
absorbs in advance everything a question could add.** Measuring intake headroom
on that key can only ever return zero, whatever the question is.

wsBY flagged this as a caveat — "separation of IDENTITY, not of MATCHABILITY".
It is stronger than a caveat. **85.5% is not a ceiling a question can be scored
against at all**, because the founder cannot state the key that produces it.

---

## 3. The founder-side ceiling, which is the one that bounds a question

`_wsca_founder.ts` drops `eligibility_text` and keys only on what a founder can
state: what the funds DEMAND on one intake field, i.e. their encoded
comparators. Baseline is *nothing asked* — the whole regime.

| property known, nothing else | mean class | **CEIL@5 matchable** | present-only |
|---|--:|--:|--:|
| nothing asked (today) | 50.50 | **7.6%** | — |
| *[corpus] administering_body* | 22.93 | *51.1%* | 51.1% |
| *[corpus] delivery_region* | 33.93 | *29.9%* | 29.9% |
| `region` (encoded demands) | 37.73 | **21.7%** | 22.8% |
| *[corpus] award decade* | 26.43 | *20.8%* | 20.8% |
| `developmentStage` | 49.93 | 10.7% | 13.1% |
| `exclusionFlags` | 50.33 | 10.4% | 10.4% |
| `entityCountries` | 48.77 | 9.9% | 22.3% |
| `sector` | 48.10 | 9.4% | 14.7% |
| `ticketBand` | 50.15 | 9.3% | 9.8% |
| `useOfFunds` | 50.17 | 9.3% | 11.2% |
| `consortium` | 47.74 | 8.6% | 20.7% |
| *the other 12 fields* | ≈50.4 | **7.6–8.9%** | 7.8–16.4% |
| **every intake field at once** | 31.54 | **31.4%** | — |
| **+ region and capital type off the corpus** | 22.85 | **43.1%** | — |

The 7.6% baseline independently reproduces wsBA's "nothing asked → 8%", and the
51.1% on `administering_body` is the region precedent's own headline number.
**That precedent has already been spent.** Region is asked, pre-filled from the
registered address, encoded on 233 gates over 204 instruments, and wired to
`regionScorer`. It is the reason the founder-side ceiling is 43% and not 8%.

---

## 4. The seventeen memo-only fields: +2.0 between them, and the one non-zero is one regime

`_wsca_marginal.ts` asks the only question that matters for wsBL's seventeen —
not what a field is worth alone, but what **wiring it in** adds on top of the six
already proved to rank (`ticketBand`, `sector`, `useOfFunds`, `region`,
`consortium`, `entityCountries`).

**The six already reach CEILING@5 40.0%** (mean class 26.19).

| memo-only field wired in | CEIL@5 | marginal gain |
|---|--:|--:|
| `fteBand` | 41.7% | **+1.7** |
| `developmentStage` | 40.3% | +0.3 |
| `turnoverBand` | 40.3% | +0.3 |
| `balanceBand` | 40.2% | +0.2 |
| **the other fifteen, each** | 40.0% | **+0.0** |
| **all seventeen at once** | **42.0%** | **+2.0** |

**`fteBand`'s +1.7 must not be shipped as a finding.** It is 9 leaves in 2
regimes, 7 of them in a single one (`vinnova_grant`, SE) and 2 in `eic`. A rule
justified by that is a rule about one regime, which is the overfit the standing
constraint forbids: state the property and a test, and the property here —
"siblings of one notified scheme demand different headcounts" — is true of 2 of
36 regimes and false of 34. The honest reading is that **the seventeen are
memo-only because they have nothing to separate**, exactly as `ANSWER_USE`'s
written reasons already claim. wsBL's classification is confirmed by
measurement, not merely by declaration.

There is one incidental worth carrying: `fteBand` is *also* the field whose
`ranks` claim wsBX had to drop when the guard was re-run against the embedding
ranker. The top of this table and the one contested row are the same field, and
both facts point the same way — its behaviour is a property of which funds are
in one founder's pool, not of the code.

---

## 5. Is there a property funds demand that no field asks? Bounded, and no

The largest bucket in the gate corpus is `intake_field = none`: **2,246 gates on
665 publishable instruments**, 676 distinct gate keys. If a recurring
founder-answerable property lived anywhere unasked, it would live here.

Read directly, the recurring demands are SME status (`fteBand`, `turnoverBand`,
`balanceBand`), TRL floors (`developmentStage`), recovery orders and
undertaking-in-difficulty (`exclusionFlags`), and eligible-sector lists
(`sector`) — **all five already asked**. What is left that is genuinely unasked
is project-specific technical performance: *"minimum installed electrolyser
capacity of at least 5 MWe"*, *"cost efficiency ratio ≤ 200 EUR per tonne
CO2-eq"*, *"GHG emission avoidance at least 50%"*, *"the project team must have
a higher education degree"*, *"sufficient collateral for the loan"*. These are
not one question. They are one threshold per scheme, in the scheme's own units —
which is the technology question **wsBA already disqualified**: strongest in the
corpus at free-text granularity, level with region at any granularity a founder
could be shown.

`_wsca_newq.ts` bounds it anyway, at the most generous possible reading — key on
the **verbatim requirement text** of a leaf's filter gates, crediting a question
with a separation whenever two strings differ at all:

| | mean class | CEILING@5 |
|---|--:|--:|
| nothing asked | 50.50 | 7.6% |
| every UNMAPPED filter requirement, verbatim | 28.90 | 35.7% |
| every MAPPED filter requirement, verbatim | 18.55 | 58.0% |
| both, verbatim | 17.27 | **62.0%** |
| both + region as the corpus records it | 15.69 | **69.3%** |

So a perfect new question capturing **every** demand no intake field asks, at a
granularity no founder could answer, is worth **+4.0** over what is already
asked (58.0 → 62.0). And **0 of the 406 unmapped filter-role gates carry a
decidable `value_spec`** — there is nothing for an answer to be tested against.

---

## 6. Matchable versus present, stated as the brief required

The two columns of §3 and the two rows of §5 are the same gap seen twice.

```
every demand, DECIDABLE comparator (matchable)   31.4%
every demand, VERBATIM text       (present)      62.0%
```

**Thirty points of the ceiling is text that separates two funds by identity and
carries no comparator a founder's answer can be tested against.** Every
separation this workstream reports as *matchable* is the left column. Nothing in
§3 or §4 is credited from the right one.

---

## 7. The recommendation

**No question closes a meaningful part of the gap, and the gap is not sixty
points. Do not add an intake question. Encode.**

Laid out end to end, on one population:

```
nothing asked                                          7.6%
the six fields that already rank                      40.0%   <- where the product's questions have got to
+ all seventeen memo-only fields wired in             42.0%
+ region and capital type read off the corpus         43.1%   <- TODAY'S-INTAKE ceiling (RETRACTED as "the" ceiling)
                                                     ------
the product ships                        EXACT@5      25%
the IDENTITY ceiling wsBY reported                    85.5%   <- RETRACTED, circular: verbatim text no founder can state

superseding this ladder, wsCC (rich_intake_wsCC.md), keyed on DEMAND CLASS:
+ organisation type, on this same key (wsCH)          51.7%   <- +11.7, the question this workstream missed
full founder information, honest maximum              65.9%   <- "66%", the current ceiling of record
what any question-selection policy can plan for       58.3%   <- greedy, saturates by ~15 questions
the fully circular reading, for reference only        77.6%   <- never quote this as headroom
```

**Expected end-to-end effect on EXACT@5 of the best available question: zero,
and it should not be measured, because there is no question to measure.** The
seventeen are worth +2.0 of *ceiling* — an upper bound under a perfect chooser,
which wsBU has just measured no ranker attains — and the +1.7 that dominates it
is one regime. Spending a founder's screen on any of them is negative value.

**What does close it.** The real gap is **25% shipped against 40% already
permitted by the questions already asked** — fifteen points, not sixty. wsBU
closed ranking and wsBY closed per-fund evidence, so by elimination the binding
constraint is the third thing: **encoding**. The measurement points at it twice
and both are actionable without asking a founder anything:

1. **406 filter-role gates, on 665 publishable instruments, carry zero decidable
   comparators.** They state a real condition in prose and resolve to nothing.
   That is the 62.0% / 31.4% gap in one sentence. The property, stated for
   unseen cases: *a gate whose `gate_role` is `filter` and whose `value_spec` is
   NULL is a requirement the product can quote and cannot test.* The count is a
   measurement, not a register — re-run `_wsca_newq.ts` on any corpus.
2. **The `present-only` column beats `matchable` on 9 of 23 fields**, worst on
   `borrowerModel` (25.3 vs 8.9), `entityCountries` (22.3 vs 9.9), `consortium`
   (20.7 vs 8.6), `activityCountries` (16.2 vs 0.0). Those are fields where the
   corpus *records a demand* and *fails to encode it into a spec*. Closing that
   is a re-encoding pass over text already held, at no founder cost and no fetch
   cost — the same shape as the region work, which is the one thing in this
   project's history that moved a ceiling.

Neither is this workstream's to ship: both change what a founder is told they
fail, and the standing rule is that nothing changes what a founder sees before
it is measured end to end.

**What NOT to re-propose**, each now measured rather than argued: a technology
question (wsBA, and §5 here), any of the seventeen (§4), a new question drawn
from the unmapped gates (§5), and any headroom claim resting on 85.5% (§2).

---

## What was changed

Four read-only harnesses under `website/frontend/scripts/`, no product code:

- `_wsca_ceilings.ts` — reproduces wsBY's key and shows why it returns 0.0 for
  any question.
- `_wsca_founder.ts` — the founder-side ceiling, per field, matchable and present.
- `_wsca_marginal.ts` — the seventeen, over the six that already rank.
- `_wsca_newq.ts` — the generous upper bound on any new question.
- `_wsca_fields.ts`, `_wsca_unmapped.ts`, `_wsca_fte.ts` — the landscape reads
  behind §5 and the `fteBand` concentration check behind §4.

`python3 -m compileall -q ETL/` clean, `npx tsc --noEmit` clean,
`check_recall_floor.ts` green (recorded beside this file as
`intake_headroom_wsCA_floor.txt`). No floor touched.

**Guards proved to fail rather than assumed green:** an empty `PUBLISHABLE`
allow-list exits 1 rather than measuring nothing (the failure mode that once
deleted 141 correct filters and exited 0), a missing allow-list file exits 1,
and an empty `DATABASE_URL` exits 1 rather than falling back to SQLite. All
three verified by running them.
