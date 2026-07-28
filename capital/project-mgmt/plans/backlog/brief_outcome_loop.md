# Brief outcome loop — closing the measurement gap

> **Status: BACKLOG** — deferred by the user 2026-07-28, immediately after the
> capture side was built. The infrastructure is live and collecting; only the
> *learning* half is parked. Nothing decays while it waits, and every day it
> waits the eventual dataset gets larger, so deferral is cheap here in a way it
> was not for the capture itself.

## The gap this closes

We can measure whether a brief is **well formed**. We cannot measure whether it
was **right**.

`scripts/bench_report.ts` scores every generated brief against defect classes
drawn from real observed failures — padding, boilerplate rows, self-contradicting
justifications, unexplained blockers, dormant funds. It is a good harness and it
runs free. But it grades *shape*. A brief can be five well-written rows, every
blocker explained in plain English, and still point a founder at the wrong four
institutions.

The twelve archetypes are a regression suite, not evidence about real founders.

## What already exists (do not rebuild)

`brief_records` in Postgres, written fire-and-forget after every brief
(`lib/intelligence/record.ts`). Per submission it holds the founder's inputs, the
published shortlist with each row's code-computed verdict, why rows were dropped
(blocked / watch-only counts), duration, and the git SHA that produced it.

Two columns sit deliberately empty: **`outcome`** and **`outcome_note`**.

Retention is 400 days, chosen to outlast a public-funding application cycle
(6–12 months) so the outcome is knowable before the row expires. Rows that DO
carry an outcome are kept past that window and pseudonymised instead — the free
text is dropped, the structured decision survives, because those rows are the
entire point.

## Why it was built before it was needed

Every brief served before the table existed is evidence permanently lost. It
cannot be backfilled. That is why capture shipped immediately and learning did
not have to.

## What reviving it means

The engineering is small. The **product design is the real question**, and it is
the user's call:

1. **How the outcome is learned.** Options, roughly ascending in cost and in
   data quality: a follow-up email some weeks after a brief; an in-product
   check-in on return; manual research against the corpus itself (a company that
   appears in a later funding event effectively self-reports); or an explicit
   "did you apply?" step in the flow.
2. **What "outcome" means.** Applied / did not apply / applied and won / applied
   and lost are four different signals with very different value. Winning
   validates the shortlist; *not applying* often says more about whether the
   brief was persuasive or the route was realistic.
3. **Whether it is asked at all**, given the product currently requires no
   account and no email — see `/privacy`. Adding contact capture changes the
   funnel and the privacy posture, which is exactly why this is not an
   engineering decision.

## Revival trigger

Any of: (a) enough real traffic that the sample would be meaningful — a few
hundred briefs rather than a handful; (b) a decision to add identity or contact
capture to `/brief` for other reasons, which makes follow-up nearly free; or
(c) a specific accuracy question that shape-scoring cannot answer and that a few
dozen real outcomes would settle.

## Why it matters when revived

It is the only mechanism that converts the product's own confidence into
evidence. The eligibility layer is audited against who actually received the
money (`ETL/terms/audit_encoding_vs_reality.py`), which is strong — but that
tests the *rules*. Nothing tests the *recommendation*. This is the equivalent
audit for the output, and it is the highest-leverage item left in the
2026-07-28 technical roadmap.
