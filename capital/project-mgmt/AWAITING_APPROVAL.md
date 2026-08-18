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

### 1. Redeploy the container — HELD until wsHU reports, on your call

`python3 ETL/lib/verify_cron.py --deploy`. Zero cost, one CLI upload.

**The correction that matters here: the Railway CLI was never missing.** I told
you twice it was blocked on it. `railway_service.py` calls
`npx --yes @railway/cli`, which fetches on demand — and it is authenticated as
you right now (`railway 5.41.2`, `Logged in as asger@grimberg.dk`). I tested for
a global binary, found none, and concluded the wrong thing. Same shape as the
defects we spent the day fixing: I checked what I expected rather than what runs.

**Why it is worth doing.** `guard_verdicts` holds 783 rows and **every one says
`produced_by=local`** — the container has never published a verdict in its life,
so the credential-free feed CI reads has been dark since it was built. The image
is also 316 commits behind and carries a coverage baseline known to be wrong
(913 where the corrected figure is 937), so it has been grading the corpus
against a bar that is too low and publishing the result as a measurement.

**Why it is held.** It would ship six days of unreviewed ETL changes on top of a
pipeline wsHU is currently diagnosing as broken, and the next scheduled run
would be the first ever to publish verdicts — several red at once, on a state we
do not yet understand. Expect those reds either way: that is the channel
working, not a new fault.

**It also gates §2.**

### 2. Promote 3,362 encoded gates to the corpus of record — free

The record has never been GIVEN the gates encoded since 2026-08-09, and no cron
step can reproduce them (`railway_cron.py::STEPS` has no gate encoder). Nothing
was lost. `reconcile_stores.py`, **by union, never by overwrite** — both
`pull_db.py` and `push_local.py` move the whole file with `--overwrite` and
destroy whatever the other store holds alone.

Every route to the volume begins by waking the container, so **this cannot
happen before §1.** One decision, in two steps.

### 3. Three doors of SA.40391 are now indistinguishable — free to investigate

Renaming them to their register title made them **byte-identical on the page**.
That is the project's central defect at a size somebody can finish: 63% of the
founders we miss are already shown a sibling of the fund they would have won.
The separating facts we already hold are granting body, capital channel (two of
the three differ), notified period, and nine per-case GBER objectives.

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
