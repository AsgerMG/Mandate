# Awaiting your approval

**Only decisions that are genuinely open.** An item that is decided or done is
DELETED, not struck through — same rule as the blockers panel and the live
agents view. The previous file had grown to twenty items, most of them finished,
and had become the thing it was meant to prevent. It is archived verbatim at
`project-mgmt/findings/awaiting_approval_2026-08-18_archive.md`; nothing was
lost, and git holds the rest.

Pruned 2026-08-18 on the owner's instruction.

---

## Needs you

**Four production writes. Three are prepared to the same standard — exact
command, preconditions verified read-only in BOTH stores, blast radius counted,
reversal written down and detectable. `make eligibility` is deliberately red
until two of them land; nothing was loosened to hide that.**

### 1. Quarantine two Innovate UK gates — 109 founders, every move toward open

```
python3 ETL/terms/apply_gate_encoding_corrections.py --apply --postgres \
  --corrections project-mgmt/evidence/wsic_gate_branch_corrections_2026-08-19.jsonl
```

**2 rows, 2 columns, 1 instrument, in each of 2 stores.** Preconditions verified
against live Postgres; SQLite dry run `2 to write, 0 drifted`.

We hold Innovate UK's two eligibility routes as things you must satisfy *both*
of. They are alternatives. The £1m route was open to all ten founders we
blocked — grounded on UKRI's own guidance and the competition page, not inferred
from our corpus.

**This one pair was 81% of every named obstacle sitting on a fund a company
actually won.** Obstructed winners across the population fall **134 → 25**. It
hid because we count obstacles by *field*, so two gates on one field read as one
thing in the way, and every guard we own reported a flat zero.

It quarantines rather than merging the two rules, and that was the agent
correcting my instruction: the gate bounds *total project cost*, our field means
*the grant they are asking for*, and the branch selector is project duration,
which we never ask. A merged rule would still be a machine verdict about a
number the founder never gave us.

**Reversal:** restore the stored spec with `encoding_method='llm_encode'`;
`check_gate_branches.py` goes red again, so undoing it is detectable.

### 2. Correct twelve gates banded in the wrong currency — 177 founders (19.7%)

```
python3 ETL/terms/apply_gate_encoding_corrections.py --apply --postgres \
  --corrections project-mgmt/evidence/wsie_currency_band_corrections_2026-08-19.jsonl
```

**10 rows, 2 columns, 8 instruments, in each of 2 stores.** Preconditions
verified **10/10 in Postgres and 10/10 in SQLite, 0 drifted**.

We had no currency handling at all: £500,000 and 500,000 kronor were both banded
as if the numerals were euros. Sterling survives — the bands are four times
wider than the error. Kronor, kroner, zloty and forint crossed a band edge every
single time. The worst encoded a Hungarian ceiling of about **€137,000 as €50
million**.

**Every transition is toward open. No row leaves a pool; no founder loses a
fund.** Only two founders won a corrected instrument, so reading won funds alone
would have called this nothing.

Two convert, eight quarantine — because the currency error never occurs alone.
Seven sat on top of a scope error, a disjunction we held as a conjunction, or
provenance naming the wrong document. And one is refused on principle: NOK 1m is
€81k at the decade's weakest krone and €114k at its strongest, and our band edge
sits at €100k between them. **No rate is good enough, so no rate is used.**

### 3. Quarantine 43 gates that can never run — 0 founders reached

```
python3 ETL/terms/apply_gate_encoding_corrections.py --apply --postgres \
  --corrections project-mgmt/evidence/wsig_inert_comparator_corrections_2026-08-19.jsonl
```

**43 rows, 2 columns, 34 instruments, in each of 2 stores.** Preconditions
**43/43, 0 drifted**.

These compare a number against an answer that is never a number. They have never
failed anybody, never passed anybody, never been evaluated once — measured at
**174,915 assessments, zero change**. Five of them are "must be an SME" rules
that have never applied to anyone.

**This buys no accuracy and I am not claiming it does.** It stops 34 instruments
carrying rules that look enforced and are not, and it brings two ratchets
**down** (45 → 21, 64 → 21) rather than widening them.

Worth knowing: **the guard for this was already red on main**, has been since it
was written, and printed the offending gates every run. That is the third time
this month a red nobody could see was the actual finding.

### 4. Restore the eleventh sector — a figure on our own home page

**Less prepared than the three above, and I am saying so rather than dressing it
up.** `restore` is a pure function of `company_sector_labels`; the volume's copy
is empty, so the repaired pipeline still reports **8 sectors of 11**. The route
is a union pull then a ~645 MB push through `overwrite_gate`, and I would want
to verify the precondition read-only first the way the other three were.

The alternative is asking a model to re-derive the labels, which prices at about
**USD 136**. The weekly job's `--max-cost 20` correctly refuses it.

**wsHX sizes it:** SA.40391 is the single largest item in the answer key's
unreachable set — **8 of the 78** founders, across its R&D and equity
registrations. It is tier C, not tier A: its notified duration expired and
nobody has read the funder's page. One page-read decides eight founders.

### 5. Land the 3,362 encoded gates — one command, needs you at a terminal

The corpus of record has never been given the gates encoded since 2026-08-09,
and no cron step can reproduce them. The union is **built and proven**:
`data/wshx_union_ready_to_push.sqlite`, 9,763 gates, with all eleven other family
tables byte-identical to the record. It passed the safety gate at the upload
(`proven loss: 0`); the transfer itself failed on an expired token.

```
python3 ETL/events/load/promote_to_record.py \
  --file data/wshx_union_ready_to_push.sqlite --apply
```

**It needs a `railway login`, which is interactive — that is the only reason
this is yours and not mine.** And after tonight, agents do not touch Railway
service configuration at all.

The near-miss worth knowing: the obvious command would have been wrong.
`--family instruments` passes the overwrite gate cleanly and had **374 column
values queued to be displaced**, including `name_source`, which decides whether
a row is withheld from every founder.

### 6. The record calls 44 rows offerable that we withhold — free, but it is a verdict

Found while doing the above. The record carries the withholding flag on **zero**
rows where the laptop carries it on **44** — every Polish `sudop_*`, every
`satr_*_equity`. **Anything rebuilt from the record today puts Poland's entire
offerable pool back in front of founders.** The weekly job cannot repair it; the
step that assigns those verdicts is not in its list.

Not done deliberately: it moves a publishability verdict on 44 rows, which is a
decision rather than a transfer. Say the word and it gets a one-column promotion
with its own before-and-after.

### 7. Should 58 founders stay in the set we grade ourselves against? — your call

**Not a corpus defect — a defect in our own measuring stick**, and removing a
founder from it is a decision about what we are trying to do. Nothing was
changed.

| | founders | what it is |
|---|---:|---|
| gone or withheld | 13 | 6 dead deadlines, 7 withheld by our own policy |
| **not a door** | **45** | 19 approval waves with nothing to apply to, 26 loader labels |
| our own defect | 20 | 11 equity rows below the data floor, 9 unexamined durations |

The middle row is the question: those 45 are not funds anybody could ever apply
to. Tier C stays in — closing it is work we can do.

Dropping the 58 moves our headline from 91.3% to **97.6%** on the reach measure.
**Both figures get published or neither does**, and the six-row number barely
moves — it is inside the instrument's own margin and is not an improvement in
anything. I am not proposing this to make a number look better; I am proposing
it because grading ourselves on unanswerable questions tells us nothing.

---

## Costs money

### 4. The blind relevance grader — EUR 1.6

Our answer key is *"the fund that paid this company"* — history, not relevance.
Hand-checking found it arguable on **4 of 9** losses. If the key is arguable on
a third of cases, chasing the last stretch of accuracy is chasing noise.

**Sharper now than when it was written:** wsHQ found that **nine founders in the
key won a scheme that has since closed**, so part of the target is unreachable
by construction. The grader is built and leak-tested but lives only on
`archive/wsDX-relevance-grade`, not on main.

### 5. The pertinence pass — EUR 3-8

From wsHT's triage: one of the seven held reds needs a paid pass to close.

### 6. The full confirming run — EUR 30.70, and NOT YET

Priced exactly by wsHO rather than estimated: EUR 0.0459 per founder, 669
in-pool founders, ×1.5 after 2026-08-31. **Standing policy is indicative runs
while the product moves and ONE full run when it looks finished** — and it is
still moving. I will ask once, when it is worth asking.

---

## Housekeeping, whenever

### 7. Your personal caches — about 7.6 GB

### 8. The scratch-script sweep — 136 files

`check_ws_scripts`'s rule was backwards: it kept a file alive if anything named
it, and naming happens automatically as you write about it, so its steady state
was that nothing ever retired (104 → 134 → 136). The check is retired. Archiving
136 files is a decision, not a cleanup, so it is queued rather than done.
