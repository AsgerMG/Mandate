# Workstream W — the IPCEI retraction, and the leaf cap measured while binding

Branch `workstream-w`, off `main` at `b223d071`, merged forward to `d16fcccd`.
Every number below was read out of Postgres with `requireLiveCorpus` asserting it.

---

## 1. IPCEI — RETRACTED, and the rows are no longer offerable

**Done.** Commit `a606e701`.

All eleven `ipcei_*` wave leaves carried `eligibility_text` harvested from closed
Commission state-aid decisions. The published string the brief quoted was real and is
gone:

> *"The Member States only grant support to the beneficiaries listed section 2.2.6 and
> the funding is not available to all undertakings in a comparable situation."*

I went further than deleting the prose, on the evidence:

- All eleven have `application_url = NULL`. There is no route in, because participants
  were fixed by the Commission decision that created the row.
- Their own harvested text says so in as many words — it is a *compatibility finding*
  about a named, closed beneficiary list.
- Median awards run EUR 14M–127M. Nothing a founder applies to directly.
- The route to IPCEI money survives and is already in the corpus as its own row: the
  **national implementing scheme** (`satr_de_rnd__sa_112879…`, the German IPCEI-CIS
  Förderrichtlinie, which carries genuine *"Zuwendungsempfänger können … sein"* text).
- The `ipcei` **channel row** also survives, and it is the honest answer: `fund-processes/ipcei.md`
  already tells a founder the door is their member state's expression-of-interest process.

**Mechanism — a third `scheme_end_date_basis`, `closed_beneficiary_list`.** The other two
bases answer *when the window shut*. This one answers a prior question — there was never a
window — so `isClosed()` reads it as closed **without a date**. That generalises past IPCEI
to every individual aid approval a state-aid-derived corpus will keep producing (ad hoc
aid, rescue-and-restructuring decisions), and it keeps the award history (1,256 events,
EUR 131B) in the corpus as evidence rather than deleting it. Applied to `liveness.ts`,
`liveness.test.ts` (4 new cases incl. the ordering trap), `ETL/lib/liveness.py`,
`data/liveness.json`; `check_liveness` green.

Both stores, via `ETL/terms/close_fixed_beneficiary_lists.py --parent ipcei --write`
(idempotent, scoped by parent so the *reasoning* travels with the edit rather than a list
of eleven ids). Postgres confirmed 11/11.

| | before | after |
|---|---|---|
| publishable instruments | 817 | **806** |
| global mean sibling class | 3.4 | **3.6** |
| uniquely identified | 56% | 55% |
| recall pairs naming an ipcei leaf | 0 | 0 |

Workstream U priced the retraction at **+0.17** of global mean class. That is what it cost.

**Two things worth knowing about the blast radius.** The retrieval index had *not* been
rebuilt since the text landed, so the sentence never reached `instrument_profiles` — but
two of the same quotations **are** encoded as `gate_role='filter'` gates
(`ipcei_batteries` G1-02, `ipcei_hy2infra` G1-01, and `ipcei_micro` G1-03 as
`programme_fact`), and gates *do* reach founders through the eligibility screen and the
adaptive round. Those rows are now unpublishable, so the gates are inert. I left them
alone deliberately: they are audited encoding that says true things, and deleting them to
fix a text defect is scope creep.

---

## 2. The leaf cap — MEASURED WHILE BINDING, and NOT raised

### ██ The unrecoverable number ██

`POOL_LEAVES_PER_CHANNEL = 90`, with `state_aid_satr / DE` at **103 publishable leaves —
13 cut before ranking, for every German founder.** Measured in that state, holdout split,
three seeds, Postgres, repaired answer key (`__recallSetComposed.json`, 4,796 pairs):

| SEED | in pool | EXACT@5 | REGIME@5 | CHANNEL@5 |
|---|---|---|---|---|
| 20260806 | 239/250 = **96%** ±2.5 | 73/250 = 29% | 211/250 = 84% | 89% |
| 7 | 241/250 = **96%** ±2.3 | 84/250 = 34% | 215/250 = 86% | 89% |
| 99 | 242/250 = **97%** ±2.2 | 75/250 = 30% | 213/250 = 85% | 88% |
| **mean** | **96.3%** | **30.9%** | **85.2%** | **88.6%** |

Raw output: `project-mgmt/findings/workstream_w_binding_cap_recall.txt`.

**The cap was NOT raised.** `POOL_LEAVES_PER_CHANNEL` is untouched at 90 and
`npm run check` is still red on `check_leaf_cap`. That is deliberate: the baseline above
exists now, so whoever raises it can price the change.

### The guard half of Harm 2 is already resolved, and it was not resolved by me

`check_leaf_cap.ts` deleted `DATABASE_URL` and measured the committed snapshot "for
determinism", and the snapshot was 62 rows behind Postgres — so the guard built to prevent
a third occurrence reported **green (widest group 87, ES)** while the third occurrence
(103, DE) was live. I reproduced both readings on the same commit before the manager's
republish, and confirmed after it that `check_leaf_cap` now fires for real and
`check_corpus_currency` passes.

**So the guard did not need its own currency assertion — it needed the snapshot to be
current, which `check_corpus_currency.ts` already asserts** (including the membership
clause: *"N live instrument(s) absent from the snapshot"*, which is exactly the 62-row gap
that hid this). Depending on it rather than growing a second copy is the right call, and I
did not have to write any code for it. What is still owed is the *dependency being
stated*: `check_leaf_cap.ts` should say in its header that its determinism is a property
of the two corpora agreeing, not of which file it reads, and should fail rather than
silently measure the snapshot when `DATABASE_URL` is set. **I did not make that edit.**

### What I measured about raising it, before running out of night

`scripts/check_leaf_cap.ts` claims *"a wider pool costs payload and nothing else, and
payload has its own guard in `check_payload_budget.ts`. The two checks bound the constant
from both sides."* **That is wrong, and it matters.** `check_payload_budget.ts` measures
the size of `public/data/instrument_terms.json` and explicitly *excludes* non-framework
gates ("every other gate arrives in phase two"). It is entirely insensitive to
`POOL_LEAVES_PER_CHANNEL`. There is currently **no guard at all** on the cost of raising
the cap.

The real cost is phase-two gate hydration: `buildInstrumentTableHydrated` calls
`hydrateGatesFor` on every selected leaf. Measured against Postgres:

| cap | DE founder: leaves in pool | own+inherited gates |
|---|---|---|
| 40 | 96 | 2,703 |
| 90 (today) | 146 | 4,619 |
| 103 / 110 / 130 / uncapped | 159 | 5,097 |

Uncapping **entirely**, today, costs the single worst-affected founder **13 more leaves**.
DE SATR carries ~5.8 *own* gates per leaf at ~427 bytes, so the marginal phase-two payload
is on the order of **32 KB** — against an 8 MB budget. No other country changes at all
above 90 (FR is the widest total at 170 leaves and is unaffected). The recall-cost side of
the trade is the table above; the payload side is negligible at today's corpus size. What
a *number* has to bound is future growth, and that is the judgement I did not get to make.

---

## 3. Every quotation a published text makes is now checked in `npm run check`

Commit `1dd62d0c`. `scripts/check_extracted_quotes.ts` wraps workstream U's
`probe_verify_extracted.py` (U recommended this; it guards the same surface as Harm 1).

- **Which files, by property:** any committed JSON under `project-mgmt/findings/` that is
  an array of rows carrying `eligibility_text`. Not a list of names — the record that
  needs checking is the next workstream's.
- **When it may skip:** only when `data/raw/instrument_docs` is absent, the same contract
  `check_corpus_currency` has with `DATABASE_URL`. A missing `pdftotext` is a **failure**,
  not a skip.
- Rows drafted from a live page name a URL rather than a document and cannot be verified
  mechanically. They are **counted and named on their own line** rather than dropped —
  "nothing failed" and "nothing was checked" must not print the same. 12 such rows today.
- Also fixed the probe dying with `IsADirectoryError` on a record naming no source file.

Green: 3 records, 11 rows pass, 0 fail.

---

## 4. WIP, uncommitted work, and what I did NOT get to

**WIP (committed, `ad0d225a`): the pertinence test — the brief's real deliverable.**
`ETL/terms/classify_eligibility_pertinence.py` is written and **has not been run**. The
property it encodes:

> a published eligibility string must state a condition an applicant could satisfy, not a
> finding about someone else's completed grant

It is a model call on purpose. Every lexical rule anyone would write for this is a list of
tonight's phrases — "not available to all undertakings", "beneficiaries listed in recital"
— which enumerates the instances rather than stating the property, and would pass the next
occurrence in Spanish while firing on any decision text that quotes a real condition. What
makes it a TEST rather than an opinion is the cache: a verdict is keyed to a hash of the
text, so a **new or edited string has no verdict and the build can fail on that**.

Not done: (a) run `--classify` over the 564 published texts (~29 calls, a few dollars),
(b) write `scripts/check_eligibility_pertinence.ts` and add it to `npm run check`,
(c) commit `data/eligibility_pertinence.json`.

**Also not done:**
- `POOL_LEAVES_PER_CHANNEL` not raised; `npm run check` still red on `check_leaf_cap`.
- `check_leaf_cap.ts` header not corrected — it still claims `check_payload_budget` bounds
  it from the other side, and it still deletes `DATABASE_URL`.
- No full `npm run check` run end to end. Green individually:
  `check_liveness`, `check_leaf_cap` (correctly RED), `check_corpus_currency`,
  `check_extracted_quotes`, `liveness.test.ts`.

---

## The single most useful thing to do first

**Raise `POOL_LEAVES_PER_CHANNEL` — the baseline that made it safe to do now exists, and
it expires the moment the corpus moves again.** Pool 96.3% / EXACT@5 30.9% / REGIME@5
85.2% is what the product reads with 13 German candidates cut before ranking. Re-run the
same three holdout seeds at the new value and the delta is the answer to a question that
has been guessed at twice.

Two things to carry into that change:

1. **Do not believe the file's own note that payload guards it.** It does not
   (§2). Measure the phase-two gate cost — the numbers and the method are in §2 — and
   write a real bound, or say plainly that the constant is bounded by nothing but judgement.
2. **Pick a number with years of headroom, not months.** DE went 72 → 103 and IT 32 → 67
   in the interval between the snapshot and tonight. Headroom of 3 was consumed
   instantly. Uncapping entirely costs 13 leaves and ~32 KB today, so the constraint is
   not today's payload — it is a deliberate ceiling on what one channel may put in front
   of one founder, and it should be chosen as one.
