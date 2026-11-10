"""The one ordered enrichment pass over the whole corpus.

Everything that derives *more* from documents already ingested — types, dates,
lifecycle, actors, vectors, tags, summaries — runs from here, in one place, in one
order.

It exists because the order is not arbitrary and was previously implicit in the
body of ``regina refresh``, with four separate CLI commands mirroring individual
steps. Getting the order wrong produces silently incomplete results rather than an
error: ``enrich_lifecycle`` only looks at legal document_types and ``extract_actors``
only at VERBATIM_DEBATE, so both must run *after* reclassification, or they skip
documents whose type hasn't been derived yet. That is exactly the trap that left
1,585 backfilled documents unclassified and 1,195 without summaries — the steps ran,
just in the wrong order relative to ingestion.

Every step is idempotent and safe to re-run: each selects only the rows still
missing what it produces. That is what makes a single "run the whole pass" call the
right shape rather than a set of individually-invoked commands.

``STEPS`` is ordered, and the ordering *is* the contract.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import structlog

log = structlog.get_logger(__name__)


@dataclass(frozen=True, slots=True)
class Step:
    """One enrichment pass.

    ``needs_http`` / ``needs_llm`` declare what a step requires, so a caller can
    run everything possible with what it has rather than failing or, worse,
    silently skipping. ``paid`` marks steps that cost money per document, which is
    why they are opt-in: cost that scales with corpus size should never be a side
    effect of a routine refresh.
    """

    name: str
    run: Callable[..., dict]
    summary: Callable[[dict], str]
    needs_http: bool = False
    needs_llm: bool = False
    paid: bool = False


def _types(session, **_) -> dict:
    from .reclassify import (
        backfill_celex_from_title,
        reclassify_by_source,
        reclassify_celex_documents,
    )

    # CELEX recovery FIRST: the two passes below are keyed off `celex`, so a
    # document whose id is still only in its title is invisible to both.
    backfilled = backfill_celex_from_title(session)
    celex = reclassify_celex_documents(session)
    source = reclassify_by_source(session)
    return {
        "types_changed": celex["types_changed"] + source["types_changed"],
        "stages_filled": celex["stages_filled"],
        "celex_filled": backfilled["celex_filled"],
    }


def _actors(session, **_) -> dict:
    from .actors import extract_actors

    return extract_actors(session)


def _lifecycle(session, *, http=None, **_) -> dict:
    from .lifecycle import enrich_lifecycle

    return enrich_lifecycle(session, http)


def _embeddings(session, *, embedder=None, **_) -> dict:
    from .embeddings import embed_pending

    return {"embedded": embed_pending(session, embedder)}


def _tags(session, *, client=None, **_) -> dict:
    from .classification import classify_pending

    return {"classified": classify_pending(session, client)}


def _summaries(session, *, client=None, **_) -> dict:
    from .summarize import enrich_pending

    return enrich_pending(session, client)


#: Ordered. Types first because later steps filter on document_type; embeddings
#: after the metadata passes so newly-typed passages are vectorised in the same
#: run; summaries last because they are the only paid step whose cost scales with
#: corpus size.
STEPS: tuple[Step, ...] = (
    Step(
        "types",
        _types,
        lambda r: (
            f"{r['types_changed']} document types re-derived "
            f"({r['celex_filled']} CELEX ids recovered from titles)"
        ),
    ),
    Step("actors", _actors, lambda r: f"{r['actors_created']} named actors extracted"),
    Step(
        "lifecycle",
        _lifecycle,
        lambda r: f"{r['updated']} legal acts dated ({r['stages']})",
        needs_http=True,
    ),
    Step("embeddings", _embeddings, lambda r: f"{r['embedded']} passages embedded"),
    Step(
        "tags",
        _tags,
        lambda r: f"{r['classified']} documents tagged by policy area/sector",
        needs_llm=True,
    ),
    Step(
        "summaries",
        _summaries,
        lambda r: f"{r['written']} document summaries written",
        needs_llm=True,
        paid=True,
    ),
)

#: What a routine `refresh` runs: everything except the paid, corpus-scaling step.
DEFAULT_STEPS: tuple[str, ...] = tuple(s.name for s in STEPS if not s.paid)


def enrich_corpus(
    session_scope: Callable[[], Any],
    *,
    http=None,
    embedder=None,
    client=None,
    only: tuple[str, ...] | list[str] | None = None,
    on_progress: Callable[[str], None] | None = None,
) -> dict[str, dict]:
    """Run the enrichment passes in order, skipping any whose inputs are absent.

    Takes ``session_scope`` (the context manager itself, not a session) because
    each step commits independently: a step that fails must not roll back the
    passes that already succeeded, the same principle ``refresh`` applies per
    source.

    A step whose requirement is missing is *reported as skipped*, never silently
    dropped — "no ANTHROPIC_API_KEY so tagging didn't run" is information the
    caller needs, and a quietly incomplete corpus is how the ordering bugs above
    went unnoticed.
    """
    selected = tuple(only) if only else DEFAULT_STEPS
    unknown = set(selected) - {s.name for s in STEPS}
    if unknown:
        raise ValueError(f"unknown enrichment step(s): {sorted(unknown)}")

    # The model budget (mandate/llm/budget.py) is the same case as no key: the
    # paid steps are skipped with a recorded reason and everything free runs.
    # A credit-exhausted 400 mid-pass is the same outcome found later: it ends
    # the paid steps for this pass, never the free ones.
    from mandate.llm import budget  # noqa: PLC0415

    no_budget = None if budget.llm_enabled() else budget.OFF
    results: dict[str, dict] = {}
    for step in STEPS:
        if step.name not in selected:
            continue
        if step.needs_http and http is None:
            results[step.name] = {"skipped": "no HTTP client provided"}
            continue
        if step.needs_llm and no_budget:
            results[step.name] = {"skipped": budget.skip_reason(f"enrichment {step.name}",
                                                                no_budget)}
            continue
        if step.needs_llm and client is None:
            results[step.name] = {"skipped": "no ANTHROPIC_API_KEY"}
            continue
        if step.name == "embeddings" and embedder is None:
            results[step.name] = {"skipped": "no embedder provided"}
            continue
        try:
            with session_scope() as session:
                results[step.name] = step.run(
                    session, http=http, embedder=embedder, client=client
                )
            if on_progress:
                on_progress(f"  {step.name:11} {step.summary(results[step.name])}")
        except Exception as exc:
            if step.needs_llm and budget.is_budget_exhausted(exc):
                no_budget = budget.EXHAUSTED
                results[step.name] = {"skipped": budget.skip_reason(
                    f"enrichment {step.name}", no_budget)}
                log.warning("enrichment_budget_exhausted", step=step.name)
                if on_progress:
                    on_progress(f"  {step.name:11} {results[step.name]['skipped']}")
                continue
            # One failing pass must not abandon the rest: they are independent
            # and each one that completes leaves the corpus better than before.
            log.exception("enrichment_step_failed", step=step.name)
            results[step.name] = {"error": str(exc)}
            if on_progress:
                on_progress(f"  {step.name:11} FAILED — {exc}")
    return results


def budget_paused(results: dict[str, dict]) -> dict[str, str]:
    """The enrichment steps a missing model budget skipped: name -> reason.
    What the refresh records in mandate.runs.detail, for the health check."""
    from mandate.llm import budget  # noqa: PLC0415

    return {name: r["skipped"] for name, r in (results or {}).items()
            if isinstance(r, dict) and budget.is_skip_reason(r.get("skipped"))}
