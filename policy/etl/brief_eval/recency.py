"""Read-only check: of the documents ingested recently, how many actually
show up in the panel's retrieved passages this round?

This is a corpus/retrieval signal independent of any single system-prompt
wording change — a prompt tweak alone can't fix a genuinely missing
retrieval hit, but it's useful context for the candidate-proposal step and
for the report either way.

It is also the one metric here that has caught a total failure and then gone
unwatched. `project-management/brief-eval-post-voyage.md` records Round 0 at
**0/8 (0.0%)** on 2026-07-21 — not one document published in the preceding 30
days reached any panel brief's retrieved passages. That was measured once and
never again, because this module was wired only into `brief-improve` (the
on-demand, budget-guarded self-improvement run) and not into `brief-check` (the
routine evaluation path). The routine path was structurally blind to an entire
class of regression: a brief that is well-written, well-cited, scores 4.2/5 and
is built entirely on last year's law reads exactly like a good brief.

`recency_from_results` is the brief-check-shaped entry point — it works off a
run's persisted results rather than needing to be inside the generation loop, so
the number lands in the report JSON next to the other metrics and can be
recomputed from any stored report. It deliberately does not change retrieval:
making the number visible and making it better are separate jobs, and doing the
second before the first is how you end up tuning against an unmeasured baseline.
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy import select
from sqlalchemy.orm import Session

from data.models import Document


def recency_coverage(session: Session, retrieved_celex: set[str], within_days: int = 30) -> dict:
    # Uses date_document (the act's real-world publication/effective date),
    # not created_at (when we last touched the row in our DB). A one-time
    # bulk reingest event (2026-07-13) inserted ~1,300 documents in a single
    # day, including decades-old foundational acts like GDPR — created_at
    # would have counted all of them as "recent," which is exactly backwards
    # for a metric meant to catch missed genuinely-new developments.
    cutoff = dt.date.today() - dt.timedelta(days=within_days)
    recent = session.scalars(
        select(Document.celex).where(Document.date_document >= cutoff, Document.celex.is_not(None))
    ).all()
    recent_set = {c for c in recent if c}
    if not recent_set:
        return {"recent_total": 0, "recent_covered": 0, "coverage_pct": None}
    covered = recent_set & retrieved_celex
    return {
        "recent_total": len(recent_set),
        "recent_covered": len(covered),
        "coverage_pct": round(100 * len(covered) / len(recent_set), 1),
    }


def retrieved_celex(results: list[dict]) -> set[str]:
    """The union of every CELEX a run's briefs actually retrieved.

    Reads ``retrieval_stats["retrieved_celex"]`` (see briefing._retrieval_stats),
    which is the only channel that survives into a persisted report — a report
    stores each brief's stats, never its passages. Results predating that field,
    and errored results, contribute nothing rather than raising: an older report
    is a report with no recency data, not a broken one.
    """
    found: set[str] = set()
    for r in results:
        if r.get("error"):
            continue
        for celex in (r.get("retrieval_stats") or {}).get("retrieved_celex") or []:
            if celex:
                found.add(celex)
    return found


def recency_from_results(session: Session, results: list[dict], within_days: int = 30) -> dict:
    """Run-level recency coverage for a `brief-check` run.

    Unioned across the whole run rather than computed per brief, matching how
    `brief-improve` reports it (search.py) and, more importantly, matching the
    question worth asking: a single profile ignoring a new telecoms act is
    correct behaviour; the whole panel ignoring every act published this month is
    a retrieval failure.

    ``measurable`` distinguishes "no brief in this run recorded which instruments
    it retrieved" from a genuine 0% — the distinction the 0/8 figure needs, since
    a metric that reads 0 both when it is broken and when the thing it measures
    is broken cannot raise an alarm.
    """
    celex = retrieved_celex(results)
    coverage = recency_coverage(session, celex, within_days=within_days)
    return {**coverage, "within_days": within_days, "measurable": bool(celex)}
