"""Pipeline orchestration: run an adapter, persist documents/versions/passages.

Responsibilities the adapters deliberately don't carry:
  * content hashing + version detection (skip unchanged, supersede on change)
  * upsert of the Document row keyed by (source, external_id)
  * (re)chunking a new version into passages
  * cursor + last_run bookkeeping on the Source row
"""

from __future__ import annotations

import datetime as dt
import hashlib
from collections.abc import Callable, Iterable

import structlog
from sqlalchemy import select
from sqlalchemy.orm import Session

from data.models import (
    Document,
    DocumentVersion,
    LifecycleStage,
    Passage,
    Source,
)

from .adapters.base import ParsedDocument, SourceAdapter
from .chunking import chunk_text

log = structlog.get_logger(__name__)


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _norm(text: str) -> str:
    """Normalize whitespace before hashing so trivial formatting churn doesn't
    create spurious new versions."""
    return "\n".join(line.strip() for line in (text or "").splitlines()).strip()


def ensure_source(session: Session, adapter: SourceAdapter) -> Source:
    source = session.scalar(select(Source).where(Source.key == adapter.key))
    if source is None:
        source = Source(
            key=adapter.key,
            name=adapter.name,
            jurisdiction=adapter.jurisdiction,
            base_url=adapter.base_url,
        )
        session.add(source)
        session.flush()
    return source


def run_adapter(
    session: Session,
    adapter: SourceAdapter,
    *,
    limit: int | None = None,
    full: bool = False,
) -> dict:
    """Run one adapter end-to-end. Returns a small run summary.

    ``full`` ignores the incremental cursor and re-discovers over the whole
    ``backfill_days`` window — see _since() for why that has to be an explicit,
    supported operation rather than a manual database edit.
    """
    source = ensure_source(session, adapter)
    if full:
        # `--full` means "ignore incrementality entirely". Overriding only the
        # date window was not enough: oeil, an_verbatim, de_verbatim,
        # ep_verbatim and both newsletter adapter families carry their
        # high-water mark in `source.cursor` rather than in `since`, so for all
        # of them `regina run <key> --full` was a silent no-op — contradicting
        # oeil.py's own module docstring, `regina run --full`'s help text and
        # README.md's recovery instructions.
        source.cursor = None
    since = _since(adapter, source, full=full)

    stats = {
        "discovered": 0,
        "new_docs": 0,
        "new_versions": 0,
        "unchanged": 0,
        "skipped": 0,
        "errors": 0,
    }
    seen = []
    truncated = False

    for ref in adapter.discover(since, source.cursor):
        stats["discovered"] += 1
        seen.append(ref)
        try:
            raw = adapter.fetch(ref)
            parsed = adapter.parse(raw)
            if parsed is None:  # adapter judged it out of scope after full fetch
                stats["skipped"] += 1
                continue
            created_doc, created_ver = _persist(session, source, parsed, raw.fetched_at)
            stats["new_docs"] += int(created_doc)
            stats["new_versions"] += int(created_ver)
            stats["unchanged"] += int(not created_ver)
            session.flush()
        except Exception:  # one bad document must not abort the whole run
            stats["errors"] += 1
            log.exception("ingest_failed", source=adapter.key, external_id=ref.external_id)
        if limit and stats["discovered"] >= limit:
            truncated = True
            break

    # The code-level guard _since()'s docstring describes but never implemented.
    # Advancing the cursor is a claim that everything up to now has been
    # ingested, and it is irreversible in effect: every later run asks only for
    # what is newer, so history the run never saw becomes permanently
    # unreachable. Two runs cannot honestly make that claim:
    #
    #   * a truncated run (`--limit`, which README.md tells every new user to
    #     do on their first run) deliberately stopped early;
    #   * a run where every discovered document errored ingested nothing, so
    #     the window it covered is still outstanding.
    #
    # Both leave the cursor and last_run_at untouched, so the next unlimited or
    # recovered run re-discovers the same window. Idempotent, because _persist
    # dedupes on (source, external_id) and only writes a version on change.
    wholesale_failure = stats["discovered"] > 0 and stats["errors"] >= stats["discovered"]
    if truncated or wholesale_failure:
        stats["cursor_advanced"] = False
        log.warning(
            "cursor_not_advanced",
            source=adapter.key,
            reason="truncated" if truncated else "all documents errored",
            **stats,
        )
    else:
        source.last_run_at = dt.datetime.now(dt.UTC)
        source.cursor = adapter.next_cursor(source.cursor, seen)
        stats["cursor_advanced"] = True
    log.info("source_run_complete", source=adapter.key, **stats)
    return stats


def run_all_sources(
    session: Session,
    adapters: Iterable[type[SourceAdapter]],
    http,
    settings,
    *,
    keys: set[str] | None = None,
    limit: int | None = None,
    full: bool = False,
    on_source: Callable[[str, dict | None], None] | None = None,
) -> dict[str, dict]:
    """Run every enabled adapter against one session. Returns {key: stats}.

    THE collection loop — there is deliberately only one. ``regina refresh``
    and ``POST /api/refresh`` previously each carried their own ~15-line copy,
    right down to near-identical comments, and the two drifted: the HTTP path
    (the only automated one, hit by the Railway ``refresh-cron`` every Sunday)
    never ran the ordered enrichment pass at all, so types, actors, lifecycle
    and summaries had *never* executed on the cron. 60.6% of documents sitting
    at ``lifecycle_stage = UNKNOWN`` is what that cost. Forked control flow
    between the manual and the automated path is the bug class; one function
    both entrypoints call is the fix.

    ``on_source`` is invoked as ``(key, stats)`` before a source runs
    (``stats=None``) and again after it finishes — enough for the CLI's
    progress echo and for the API's liveness heartbeat.
    """
    totals: dict[str, dict] = {}
    for cls in adapters:
        if keys and cls.key not in keys:
            continue
        adapter = cls(http, settings)
        source = ensure_source(session, adapter)
        if not source.enabled:
            continue
        if on_source:
            on_source(adapter.key, None)
        try:
            totals[adapter.key] = run_adapter(session, adapter, limit=limit, full=full)
            # Commit per source: a later source's total failure (network down,
            # DNS blip, a discover()-time ReadTimeout that run_adapter's
            # per-document guard cannot catch) must not roll back every source
            # already ingested in this run — the same "one bad thing doesn't
            # abort the run" principle the pipeline applies per document.
            session.commit()
        except Exception as exc:
            session.rollback()
            log.exception("source_run_crashed", source=adapter.key)
            totals[adapter.key] = {"crashed": True, "error": str(exc)}
        if on_source:
            on_source(adapter.key, totals[adapter.key])
    return totals


def _since(adapter: SourceAdapter, source: Source, *, full: bool = False) -> dt.date:
    """The discovery window's start date.

    Normally incremental: after a source's first run, ``last_run_at`` becomes the
    floor, so each run only asks its upstream for what appeared since.

    That has a sharp edge worth naming, because it has bitten this project
    repeatedly. The first run is the *only* one that sees the full
    ``backfill_days`` window, so if it was truncated (``--limit``), crashed
    partway, or ran while discovery was misconfigured, the history it missed
    becomes permanently unreachable: every later run asks only for documents
    newer than that first partial run. The source then looks healthy — it runs
    daily, reports no errors, and returns almost nothing.

    Confirmed live 2026-07-27 by reproducing it: `regina run eurlex_case_law
    --limit 200` ingested 200 judgments and set the cursor; the very next
    unlimited run discovered 0. The same mechanism explains `oeil` (3 documents)
    and `eurlex_oj_l` (11), and the `eurlex` incident the backlog records, which
    was fixed at the time by manually nulling `last_run_at`.

    ``full=True`` is the supported recovery: ignore the cursor and re-discover
    the whole window. Idempotent, because the pipeline dedupes on
    (source, external_id) and only writes a new version when content changed.
    """
    days = adapter.settings.backfill_days
    if source.last_run_at and not full:
        return source.last_run_at.date()
    return dt.date.today() - dt.timedelta(days=days)


def _persist(
    session: Session, source: Source, parsed: ParsedDocument, fetched_at: dt.datetime
) -> tuple[bool, bool]:
    """Upsert document + add a new version if content changed. Returns
    (document_created, version_created)."""
    doc = session.scalar(
        select(Document).where(
            Document.source_id == source.id, Document.external_id == parsed.external_id
        )
    )
    created_doc = doc is None
    if doc is None:
        doc = Document(source_id=source.id, external_id=parsed.external_id)
        session.add(doc)

    # Refresh mutable metadata on every sighting (status, dates can change),
    # subject to the ownership rule below.
    doc.title = parsed.title
    doc.jurisdiction = parsed.jurisdiction
    doc.document_type = parsed.document_type
    doc.language = parsed.language
    doc.url = parsed.url
    doc.celex = parsed.celex or doc.celex
    doc.eli = parsed.eli or doc.eli
    doc.date_document = parsed.date_document or doc.date_document
    _refresh_enrichment_owned(doc, parsed)
    session.flush()

    content = _norm(parsed.text)
    content_hash = _hash(content)
    existing = session.scalar(
        select(DocumentVersion).where(
            DocumentVersion.document_id == doc.id,
            DocumentVersion.content_hash == content_hash,
        )
    )
    if existing is not None:
        return created_doc, False  # unchanged

    # New content: supersede prior current version, add this one + its passages.
    for v in doc.versions:
        v.is_current = False
    version = DocumentVersion(
        document_id=doc.id,
        content_hash=content_hash,
        raw_format=parsed.raw_format,
        text=content,
        char_count=len(content),
        fetched_at=fetched_at,
        is_current=True,
    )
    session.add(version)
    session.flush()

    for chunk in chunk_text(content):
        session.add(
            Passage(
                version_id=version.id,
                ordinal=chunk.ordinal,
                text=chunk.text,
                char_start=chunk.char_start,
                char_end=chunk.char_end,
            )
        )
    return created_doc, True


#: Keys inside ``Document.extra`` that the enrichment layer writes and owns.
#: ``application_stages`` is enrich_lifecycle's per-provision compliance
#: timeline (the AI Act's staged dates); no adapter produces it, and a
#: whole-object ``doc.extra = parsed.extra`` destroyed it on every re-sighting.
ENRICHMENT_OWNED_EXTRA_KEYS = frozenset({"application_stages"})


def _refresh_enrichment_owned(doc: Document, parsed: ParsedDocument) -> None:
    """Apply the ingestion/enrichment ownership rule to the lifecycle fields.

    **The rule: ingestion owns what an adapter observes at the source;
    enrichment owns what is derived afterwards. Ingestion may fill an
    enrichment-owned field that is still empty, but must never overwrite or
    null one that already holds a value.**

    ``ParsedDocument`` cannot distinguish "the adapter supplied NULL" from "the
    adapter does not carry this field" — every one of these defaults to None —
    so the rule is expressed as *absence never overwrites presence*, which
    collapses the two cases safely. Concretely:

    * ``date_in_force`` / ``date_end_validity`` — written only when the adapter
      actually supplies one. No adapter sets ``date_in_force`` at all, so every
      re-sighting previously wrote NULL over what enrich_lifecycle computed. 38
      production documents carry that exact signature (``date_application``
      set, ``date_in_force`` NULL), and the same mechanism would erase a
      cross-source merge on the very next run of an adapter that simply doesn't
      supply the field.
    * ``date_application`` — enrichment-only; ingestion never writes it.
    * ``lifecycle_stage`` — once enrichment has dated a document (the
      ``_enriched`` check below), its stage came from Cellar's own
      in-force/application metadata and outranks anything ingestion can offer.
      eurlex.py's ``_classify_stage`` is explicitly "the CELEX-only fallback…
      which enrich_lifecycle() overrides", and re-sighting reset the refined
      stage back to that guess. Until enrichment has spoken the adapter is the
      best source available, so an adapter that genuinely tracks procedure
      phase (oeil) keeps updating the stage — it just can't downgrade a stage
      to UNKNOWN, which is absence, not an observation.
    * ``extra`` — merged, not replaced, with ENRICHMENT_OWNED_EXTRA_KEYS
      restored last so an adapter can never shadow them.
    """
    if parsed.date_in_force is not None:
        doc.date_in_force = parsed.date_in_force
    if parsed.date_end_validity is not None:
        doc.date_end_validity = parsed.date_end_validity

    stored_extra = doc.extra or {}
    _enriched = (
        doc.date_in_force is not None
        or doc.date_application is not None
        or any(k in stored_extra for k in ENRICHMENT_OWNED_EXTRA_KEYS)
    )
    if not _enriched and parsed.lifecycle_stage is not LifecycleStage.UNKNOWN:
        doc.lifecycle_stage = parsed.lifecycle_stage

    merged = {**stored_extra, **(parsed.extra or {})}
    for key in ENRICHMENT_OWNED_EXTRA_KEYS:
        if key in stored_extra:
            merged[key] = stored_extra[key]
    doc.extra = merged or None
