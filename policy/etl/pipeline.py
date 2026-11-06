"""Pipeline orchestration: run an adapter, persist documents/versions/passages.

Responsibilities the adapters deliberately don't carry:
  * content hashing + version detection (skip unchanged, supersede on change)
  * upsert of the Document row keyed by (source, external_id)
  * (re)chunking a new version into passages
  * cursor + last_run bookkeeping on the Source row

WHERE IT WRITES. The source record -- the text, its version (sha256), every
fetch date, the passages -- goes to schema `grounding` through
mandate.grounding, in the same transaction as policy's own rows. Policy writes
only what is its own: the Document row and a VersionRef (which grounding version
the document is at, and whether it is current). policy.document_versions and
policy.passages are deprecated and refuse writes (data/grounding_bridge.py).
"""

from __future__ import annotations

import datetime as dt
import hashlib
from collections.abc import Callable, Iterable

import structlog
from sqlalchemy import select
from sqlalchemy.orm import Session

from data import grounding_bridge as gb
from data.models import (
    Document,
    GroundingDocumentLink,
    LifecycleStage,
    Source,
    VersionRef,
)
from mandate import grounding

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
            # A savepoint per document: one document's SQL error (a grounding
            # refusal, a constraint) rolls back that document only. Without it
            # the error aborted the whole transaction and every later document
            # in the run failed with "current transaction is aborted".
            with session.begin_nested():
                created_doc, created_ver = _persist(session, source, parsed, raw.fetched_at)
                session.flush()
            stats["new_docs"] += int(created_doc)
            stats["new_versions"] += int(created_ver)
            stats["unchanged"] += int(not created_ver)
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
    gversion_id = _store_in_grounding(
        session, source, doc, parsed, content, content_hash, fetched_at
    )
    ref = session.scalar(
        select(VersionRef).where(
            VersionRef.document_id == doc.id, VersionRef.grounding_version_id == gversion_id
        )
    )
    if ref is not None:
        if not ref.is_current:
            # The document went back to content it served before: that version
            # is current again (previously it stayed superseded, so readers were
            # served text the source no longer published).
            _make_current(session, doc.id, ref.id)
        return created_doc, False  # unchanged (the fetch is still recorded in grounding)

    ref = VersionRef(
        document_id=doc.id,
        grounding_version_id=gversion_id,
        raw_format=parsed.raw_format,
        fetched_at=fetched_at,
        is_current=True,
    )
    session.add(ref)
    session.flush()
    _make_current(session, doc.id, ref.id)
    return created_doc, True


def _make_current(session: Session, document_id: int, ref_id: int) -> None:
    for r in session.scalars(select(VersionRef).where(VersionRef.document_id == document_id)):
        r.is_current = r.id == ref_id
    session.flush()


def _store_in_grounding(
    session: Session,
    source: Source,
    doc: Document,
    parsed: ParsedDocument,
    content: str,
    content_hash: str,
    fetched_at: dt.datetime,
) -> int:
    """Record this fetch in grounding: the version (once per distinct text, any
    document, any brain), a fetch row (every time), and the passages (once per
    version). The stored bytes are the normalised text policy versions on, so
    the sha256 IS policy's content hash and an unchanged re-fetch is one fetch
    row -- storing the raw HTML instead would make every re-fetch of a page with
    a timestamp or token in it a new, permanent, append-only version."""
    con = gb.driver(session)
    if fetched_at.tzinfo is None:
        fetched_at = fetched_at.replace(tzinfo=dt.UTC)
    url = gb.grounding_url(source.key, parsed.url, parsed.external_id)
    meta = {
        "title": parsed.title,
        "publisher": source.name,
        "kind": str(parsed.document_type.name),
        "source_id": grounding.ensure_source(
            con, gb.SOURCE_PREFIX + source.key, source.name, base_url=source.base_url
        ),
    }
    v = grounding.record_fetch(con, url, content_hash, fetched_at, **meta)
    if v is None:
        v = grounding.store_original(
            con,
            content.encode("utf-8"),
            url,
            gb.TEXT_MIME,
            fetched_at,
            text=content,
            extractor=f"policy:{parsed.raw_format}->normalised text",
            **meta,
        )
    if v.sha256 != content_hash:  # cannot happen; a wrong citation would be worse than a crash
        raise RuntimeError(f"grounding stored {v.sha256} for content {content_hash}")
    if session.get(GroundingDocumentLink, doc.id) is None:
        # first sight of this policy document; the link is insert-only (a later
        # URL change is recorded by grounding's fetches, not by moving the link)
        session.add(GroundingDocumentLink(policy_document_id=doc.id, grounding_document_id=v.document_id))
    has = con.execute(
        "SELECT 1 FROM grounding.passages WHERE version_id = %s AND chunker = %s LIMIT 1",
        (v.id, gb.CHUNKER),
    ).fetchone()
    if has is None and content.strip():
        new_ids = grounding.add_passages(con, v.id, gb.CHUNKER, _exact_spans(content))
        _refuse_id_collision(con, new_ids)
    return v.id


def _refuse_id_collision(con, new_ids: list[int]) -> None:
    """A new grounding passage must not reuse the id of a folded duplicate policy
    passage: stored citations (enrichments.citations, document_actor.passage_id)
    resolve such an id through grounding_passage_link, so a reused id would make
    an old citation point at new, unrelated text. The cutover sets grounding's
    passage sequence above every policy passage id (mandate/ops/
    policy_on_grounding.sh, step 1); this refuses the write if that step was skipped."""
    clash = con.execute(
        "SELECT policy_passage_id FROM grounding_passage_link "
        "WHERE policy_passage_id = ANY(%s) AND grounding_passage_id <> policy_passage_id LIMIT 1",
        (new_ids,),
    ).fetchone()
    if clash:
        raise RuntimeError(
            f"grounding passage id {clash[0]} is also a folded policy passage id: run "
            "mandate/ops/policy_on_grounding.sh step 1 (sets the passage sequence) before ingesting")


def _exact_spans(content: str) -> list[tuple[int, int, str | None]]:
    """The chunker's spans, made exact: in grounding a passage's text IS
    version.text[start:end]. chunk_text strips a chunk's edges after recording
    its span (the migration found 28,816 spans one past their text), so the span
    is re-anchored on where the chunk's text actually sits."""
    spans = []
    for c in chunk_text(content):
        start = c.char_start
        if content[start : start + len(c.text)] != c.text:
            found = content.find(c.text, max(0, start - 256))
            start = found if found >= 0 else content.find(c.text)
            if start < 0:
                raise ValueError(f"chunk {c.ordinal} is not in its own text")
        spans.append((start, start + len(c.text), None))
    return spans


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
