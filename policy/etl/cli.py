"""Command-line entrypoint.

The automation goal: a user (or a scheduler, or later an API endpoint) triggers
ONE command — `regina refresh` — and the whole corpus updates itself. Everything
else here is setup/inspection around that single trigger.

    regina init        create the schema + pgvector extension, seed vocabularies
    regina sources     list registered sources and their last-run state
    regina refresh     run every enabled adapter end-to-end (the trigger)
    regina run <key>   run a single adapter (debugging)
"""

from __future__ import annotations

import json
from pathlib import Path

import structlog
import typer

from data import get_settings, init_db, session_scope
from data.config import Settings
from data.seeds import seed_vocabularies

from .adapters import ADAPTERS, ADAPTERS_BY_KEY
from .http import HttpClient
from .pipeline import ensure_source, run_adapter

app = typer.Typer(
    help="Regina — regulatory intelligence analyst. Automated regulatory data collection."
)
log = structlog.get_logger(__name__)


@app.command()
def init() -> None:
    """Create the database schema, enable pgvector, and seed vocabularies."""
    init_db()
    with session_scope() as session:
        seed_vocabularies(session)
        # Register all known sources so `sources` shows them before first run.
        settings = get_settings()
        with HttpClient(settings) as http:
            for cls in ADAPTERS:
                ensure_source(session, cls(http, settings))
    typer.echo("Initialized schema, vocabularies, and source registry.")


@app.command()
def sources() -> None:
    """List registered sources and their last-run state."""
    from sqlalchemy import select

    from data.models import Source

    with session_scope() as session:
        rows = session.scalars(select(Source).order_by(Source.key)).all()
        if not rows:
            typer.echo("No sources registered yet — run `regina init`.")
            return
        for s in rows:
            last = s.last_run_at.isoformat() if s.last_run_at else "never"
            flag = "on " if s.enabled else "off"
            typer.echo(f"[{flag}] {s.key:16} {s.jurisdiction.value:3} last_run={last}  {s.name}")


@app.command()
def refresh(
    limit: int = typer.Option(None, help="Max documents per source (debugging)."),
    only: str = typer.Option(None, help="Comma-separated source keys to restrict to."),
    full: bool = typer.Option(
        False,
        "--full",
        help=(
            "Re-discover each source's whole backfill window instead of only "
            "what is new since its last run. See pipeline._since for why a "
            "starved source needs this to recover."
        ),
    ),
    embed: bool = typer.Option(
        True, "--embed/--no-embed", help="Embed new passages after collection."
    ),
) -> None:
    """THE TRIGGER: run every enabled adapter and update the whole corpus."""
    settings = get_settings()
    keys = set(only.split(",")) if only else None
    totals: dict[str, dict] = {}

    with HttpClient(settings) as http, session_scope() as session:
        for cls in ADAPTERS:
            if keys and cls.key not in keys:
                continue
            adapter = cls(http, settings)
            source = ensure_source(session, adapter)
            if not source.enabled:
                continue
            typer.echo(f"→ {adapter.key} …")
            try:
                totals[adapter.key] = run_adapter(session, adapter, limit=limit, full=full)
                # Commit per source: a later source's total failure (network
                # down, DNS blip) must not roll back every source already
                # ingested in this run — same "one bad thing doesn't abort
                # the run" principle the pipeline already applies per document.
                session.commit()
            except Exception:
                session.rollback()
                log.exception("source_run_crashed", source=adapter.key)
                totals[adapter.key] = {"errors": "source-level failure, see logs"}

    typer.echo("\nRefresh complete:")
    for key, stats in totals.items():
        typer.echo(f"  {key:16} {stats}")

    # Metadata enrichment runs on every refresh, not as a one-off backfill:
    # classification improves as descriptors are added, and Cellar amends
    # end-of-validity when an act is repealed — so both have to be re-derived
    # for the corpus to stay honest about what is currently in force. Both are
    # idempotent and cheap (pure function; one SPARQL batch per 150 acts).
    with session_scope() as session:
        from etl.enrichment.reclassify import reclassify_by_source, reclassify_celex_documents

        celex_result = reclassify_celex_documents(session)
        source_result = reclassify_by_source(session)

    # Actor extraction is API-free (it re-derives structure from stored verbatim
    # text), so it rides along with the other idempotent metadata passes rather
    # than needing its own trigger.
    with session_scope() as session:
        from etl.enrichment.actors import extract_actors

        actor_result = extract_actors(session)
    typer.echo(
        f"Reclassified {celex_result['types_changed'] + source_result['types_changed']} "
        f"document types."
    )
    typer.echo(
        f"Extracted {actor_result['actors_created']} new named actors "
        f"({actor_result['links_created']} document links)."
    )

    with HttpClient(settings) as http, session_scope() as session:
        from etl.enrichment.lifecycle import enrich_lifecycle

        life = enrich_lifecycle(session, http)
    typer.echo(
        f"Dated {life['updated']} legal acts (entry into force, applicability, "
        f"end of validity) — stages: {life['stages']}"
    )

    if embed:
        from etl.enrichment import embed_pending, get_embedder

        with session_scope() as session:
            n = embed_pending(session, get_embedder(settings))
        typer.echo(f"\nEmbedded {n} new passages — corpus is retrieval-ready.")

        from etl.intelligence.llm import has_api_key

        if has_api_key():
            from etl.enrichment import classify_pending
            from etl.intelligence.llm import get_client

            with session_scope() as session:
                n = classify_pending(session, get_client())
            typer.echo(f"Classified {n} new documents by policy area/sector.")
        else:
            typer.echo("No ANTHROPIC_API_KEY set — skipping sector/policy-area classification.")


@app.command()
def export(
    out: str = typer.Option("exports/corpus", help="Output directory root."),
    source: str = typer.Option(None, help="Restrict to one source key."),
) -> None:
    """Materialize the corpus into per-source folders (one Markdown file per
    document, current version's text + metadata front matter).

    The database stays canonical — it is what powers versioning, embeddings
    and citations. This export is a browsable/backup view; re-run it anytime.
    """
    import re
    from pathlib import Path

    from sqlalchemy import select

    from data.models import Document, DocumentVersion, Source

    root = Path(out)
    n = 0
    with session_scope() as session:
        stmt = (
            select(Source.key, Source.jurisdiction, Document, DocumentVersion)
            .join(Document, Document.source_id == Source.id)
            .join(
                DocumentVersion,
                (DocumentVersion.document_id == Document.id)
                & (DocumentVersion.is_current == True),  # noqa: E712
            )
        )
        if source:
            stmt = stmt.where(Source.key == source)
        for src_key, juris, doc, ver in session.execute(stmt):
            slug = re.sub(r"[^A-Za-z0-9._-]+", "_", doc.external_id)[:120]
            path = root / juris.value / src_key / f"{slug}.md"
            path.parent.mkdir(parents=True, exist_ok=True)
            front = "\n".join(
                f"{k}: {v}"
                for k, v in {
                    "title": doc.title,
                    "external_id": doc.external_id,
                    "celex": doc.celex,
                    "jurisdiction": doc.jurisdiction.value,
                    "document_type": doc.document_type.value,
                    "lifecycle_stage": doc.lifecycle_stage.value,
                    "date_document": doc.date_document,
                    "url": doc.url,
                    "fetched_at": ver.fetched_at,
                    "content_hash": ver.content_hash,
                }.items()
                if v is not None
            )
            path.write_text(f"---\n{front}\n---\n\n{ver.text}\n", encoding="utf-8")
            n += 1
    typer.echo(f"Exported {n} documents to {root}/<jurisdiction>/<source_key>/ folders.")


@app.command()
def lifecycle(
    limit: int = typer.Option(None, help="Max acts to process (debugging)."),
    timeout: float = typer.Option(
        300.0, help="HTTP timeout in seconds; a 150-CELEX SPARQL batch needs more than the default."
    ),
) -> None:
    """Fetch entry-into-force / applicability / end-of-validity dates from Cellar
    and re-derive lifecycle_stage.

    Runs automatically as part of `refresh`; use this to backfill or re-derive
    on demand without a full collection pass. See etl/enrichment/lifecycle.py
    for why in-force and applicable are separate dates.
    """
    from etl.enrichment.lifecycle import enrich_lifecycle

    base = get_settings()
    settings = Settings(**{**base.model_dump(), "http_timeout_seconds": timeout})
    with HttpClient(settings) as http, session_scope() as session:
        result = enrich_lifecycle(session, http, limit=limit)
    typer.echo(
        f"Dated {result['updated']} of {result['candidates']} candidate acts.\n"
        f"Stages: {result['stages']}"
    )


@app.command()
def enrich(
    limit: int = typer.Option(None, help="Max documents this run (cost control)."),
    dry_run: bool = typer.Option(
        False, "--dry-run", help="Report the candidate count without making any API call."
    ),
) -> None:
    """Generate per-document summary / plain-language / what-changes into the
    `enrichments` table.

    Scoped to instruments a brief reasons about — binding law, case law,
    authoritative soft law, proposals — not press or newsletters, which already
    have human-written headlines. Uses Haiku. Run with --dry-run first: this is
    the one enrichment whose cost scales with corpus size.
    """
    from etl.enrichment.summarize import enrich_pending
    from etl.intelligence.llm import get_client, has_api_key

    if dry_run:
        with session_scope() as session:
            result = enrich_pending(session, None, limit=limit, dry_run=True)
        typer.echo(f"{result['candidates']} documents would be enriched (no API call made).")
        return

    if not has_api_key():
        typer.echo("No ANTHROPIC_API_KEY set — cannot enrich.")
        raise typer.Exit(1)

    client = get_client()
    with session_scope() as session:
        result = enrich_pending(session, client, limit=limit)
    typer.echo(
        f"Enriched {result['written']} of {result['candidates']} documents "
        f"({result['errors']} errors)."
    )


@app.command()
def actors(
    dry_run: bool = typer.Option(False, "--dry-run", help="Report counts without writing."),
) -> None:
    """Extract named actors (speakers, rapporteurs) from verbatim debate passages.

    No API calls — it re-derives structure from text the verbatim adapters
    already wrote. Runs as part of `refresh`; use this to backfill on demand.
    """
    from etl.enrichment.actors import extract_actors

    with session_scope() as session:
        result = extract_actors(session, dry_run=dry_run)
    typer.echo(
        f"{result['attributed']} of {result['passages']} verbatim passages carried an "
        f"attribution; {result['actors_created']} actors and {result['links_created']} "
        f"document links created."
    )
    typer.echo(f"Roles: {result['roles']}")
    if result.get("procedure_links") is not None:
        typer.echo(
            f"Linked actors to {result['procedure_links']} legislative-procedure documents "
            "via the debates' own procedure references."
        )


@app.command()
def reclassify(
    dry_run: bool = typer.Option(False, "--dry-run", help="Report changes without writing."),
) -> None:
    """Re-derive document_type over the existing corpus from the current
    classifier, and fill any lifecycle_stage still UNKNOWN.

    Adapters classify at ingestion time, so a classifier improvement otherwise
    only reaches documents fetched afterwards. Runs automatically as part of
    `refresh`.
    """
    from etl.enrichment.reclassify import (
        reclassify_by_source,
        reclassify_celex_documents,
        type_histogram,
    )

    with session_scope() as session:
        celex_result = reclassify_celex_documents(session, dry_run=dry_run)
        source_result = reclassify_by_source(session, dry_run=dry_run)
        histogram = type_histogram(session)

    label = "would change" if dry_run else "changed"
    typer.echo(f"CELEX classifier: {label} {celex_result['types_changed']} types")
    for transition, count in celex_result["type_transitions"].items():
        typer.echo(f"    {transition:44} {count}")
    typer.echo(f"  stages filled: {celex_result['stage_fills']}")
    typer.echo(f"Source classifier: {label} {source_result['types_changed']} types")
    for transition, count in source_result["type_transitions"].items():
        typer.echo(f"    {transition:44} {count}")
    typer.echo("\nCurrent document_type distribution:")
    for dtype, count in histogram.items():
        typer.echo(f"  {dtype:22} {count}")


@app.command()
def embed(batch: int = typer.Option(128, help="Passages per embedding batch.")) -> None:
    """Generate vector embeddings for any passages that don't have one yet."""
    from etl.enrichment import embed_pending, get_embedder

    settings = get_settings()
    embedder = get_embedder(settings)
    with session_scope() as session:
        n = embed_pending(session, embedder, batch_size=batch)
    typer.echo(f"Embedded {n} passages with {settings.embedding_model}.")


@app.command()
def search(query: str, k: int = typer.Option(5, help="Number of results.")) -> None:
    """Meaning-search the corpus and show citation-ready passages."""
    from etl.enrichment import get_embedder, semantic_search

    settings = get_settings()
    embedder = get_embedder(settings)
    with session_scope() as session:
        hits = semantic_search(session, embedder, query, k=k)
    if not hits:
        typer.echo("No embedded passages yet — run `regina embed` first.")
        return
    for h in hits:
        cite = h["celex"] or h["title"][:40]
        snippet = " ".join(h["text"].split())[:200]
        typer.echo(
            f"\n[{h['score']:.3f}] {h['title'][:70]} ({h['stage']})"
            f"\n  {cite} chars {h['char_start']}–{h['char_end']} | {h['url']}"
            f"\n  “{snippet}…”"
        )


@app.command()
def brief(
    name: str = typer.Option(..., help="Company name."),
    description: str = typer.Option("", help="What the company does."),
    sector: list[str] = typer.Option(None, help="Sector slug(s); repeatable."),
    ai: bool = typer.Option(False, "--ai", help="Company develops/deploys AI."),
    personal_data: bool = typer.Option(False, "--personal-data", help="Handles personal data."),
    size: str = typer.Option(None, help="Company size: micro/small/medium/large."),
    ai_role: str = typer.Option(None, help="AI value-chain role: provider/deployer/both/none."),
    eu_users: str = typer.Option(None, help="Approx. monthly active EU users."),
    customer_type: str = typer.Option(None, help="Customer base: b2b/b2c/both."),
    k: int = typer.Option(12, help="Passages to retrieve."),
    dry_run: bool = typer.Option(False, "--dry-run", help="Retrieve only; don't call the LLM."),
    sharpen: bool = typer.Option(
        True,
        "--sharpen/--no-sharpen",
        help="Second pass: self-critique draft for sharpness (~2x cost).",
    ),
    pdf: str = typer.Option(None, "--pdf", help="Also write the report as a PDF to this path."),
) -> None:
    """Generate a grounded, citation-backed regulatory intelligence report for a company."""
    from etl.enrichment import get_embedder
    from etl.intelligence import CompanyProfile, generate_briefing
    from etl.intelligence.llm import has_api_key

    settings = get_settings()
    profile = CompanyProfile(
        name=name,
        description=description,
        sectors=sector or [],
        uses_ai=ai,
        handles_personal_data=personal_data,
        company_size=size,
        ai_role=ai_role,
        monthly_eu_users=eu_users,
        customer_type=customer_type,
    )
    embedder = get_embedder(settings)

    effective_dry = dry_run or not has_api_key()
    if effective_dry and not dry_run:
        typer.echo("(No ANTHROPIC_API_KEY — showing retrieved sources only.)\n")

    with session_scope() as session:
        result = generate_briefing(
            session, embedder, profile, k=k, dry_run=effective_dry, sharpen=sharpen
        )

    if not result["passages"]:
        typer.echo("No embedded passages found. Run `regina refresh` then `regina embed` first.")
        return

    if result.get("briefing"):
        typer.echo(result["briefing"])
        for note in result.get("canon_notes", []):
            typer.echo(f"\n⚠ Unresolved consistency finding: {note}")
        typer.echo("\n— Sources —")
        seen = set()
        for c in result["citations"]:
            key = c.get("celex") or c.get("url")
            if key and key not in seen:
                seen.add(key)
                n = f"[{c['n']}] " if c.get("n") else ""
                tag = " (verbatim debate)" if c.get("kind") == "verbatim_debate" else ""
                typer.echo(f"  {n}{c.get('celex') or c.get('title')}{tag}  {c.get('url')}")
        if pdf:
            from etl.intelligence.pdf import render_report_pdf

            data = render_report_pdf(name, result["briefing"], result["citations"])
            with open(pdf, "wb") as fh:
                fh.write(data)
            typer.echo(f"\nPDF written to {pdf}")
    else:
        typer.echo(f"Retrieval query:\n  {result['query']}\n\nTop sources:")
        for p in result["passages"]:
            typer.echo(f"  [{p['score']:.3f}] {p.get('celex') or p['title'][:60]}  {p['url']}")


_BRIEF_LOG_PATH = "project-management/brief-improve-log.md"
_BRIEF_LOG_HEADER = (
    "# Brief-Improve Log\n\n"
    "Chronological record of `regina brief-improve` runs — newest at the top. Each "
    "entry is the full rendered report for that run (round-by-round scores, the "
    "dimension breakdown, and a before/after diff of the actual generated text), "
    "plus a pointer to that run's raw JSON sidecar for full-fidelity drill-down.\n\n"
    "---\n\n"
)


def _brief_log_title(report: dict) -> str:
    if report.get("stop_reason") == "budget_exhausted_mid_baseline":
        return "(partial — budget exhausted)"
    winner = report.get("winner") or {}
    if winner.get("changed"):
        return f"candidate accepted, aggregate {winner['improvement']:+}"
    return "no candidate accepted"


def _prepend_brief_log_entry(entry_markdown: str) -> None:
    """Insert a new dated entry right after the log's header, ahead of every
    prior entry — mirrors project-management/decision-log.md's own
    "newest at the top" convention, but keyed by a full timestamp rather
    than just a date since this tool gets re-run repeatedly in one day."""
    try:
        with open(_BRIEF_LOG_PATH) as fh:
            existing = fh.read()
    except FileNotFoundError:
        existing = _BRIEF_LOG_HEADER
    if "---\n\n" not in existing:
        existing = _BRIEF_LOG_HEADER + existing
    header, sep, rest = existing.partition("---\n\n")
    with open(_BRIEF_LOG_PATH, "w") as fh:
        fh.write(header + sep + entry_markdown.rstrip() + "\n\n" + rest)


@app.command(name="brief-check")
def brief_check(
    count: int = typer.Option(1, help="How many panel profiles to run this time."),
    all_profiles: bool = typer.Option(
        False, "--all", help="Run the whole panel — use when testing a batch of fixes together."
    ),
    budget: float = typer.Option(
        0.0,
        help=(
            "Optional hard $ cap; 0 (the default) means uncapped. A brief-check "
            "run is already bounded by the panel slice, so a cap mostly just "
            "kills a run mid-flight and wastes what it already paid for."
        ),
    ),
    k: int = typer.Option(12, help="Passages to retrieve."),
    sharpen: bool = typer.Option(
        True,
        "--sharpen/--no-sharpen",
        help="Second self-critique pass, as production runs it (~2x cost).",
    ),
    dry_run: bool = typer.Option(
        False, "--dry-run", help="Retrieval + stats only, no billed calls."
    ),
) -> None:
    """Run the real brief pipeline over a rotating slice of the eval panel.

    Spend control is the rotation, not a cap: one profile per run by default,
    advancing through the panel so consecutive checks cover the whole verdict
    space instead of re-testing one company. Use --all when a batch of changes
    is ready to be judged against the full panel at once. Every run reports
    retrieval shape per profile and writes a raw JSON report, so a paid run is
    never a result you can't go back to.

    Deliberately uncapped by default — see BudgetGuard's docstring: on an
    already-bounded run a cap either doesn't bind or binds mid-flight and
    discards work already paid for, which is worse than no cap. Pass --budget
    only if you want a genuine stop-loss.
    """
    from etl.brief_eval.cost import BudgetGuard, MeteredClient
    from etl.brief_eval.panel import EVAL_PANEL
    from etl.brief_eval.rotation import (
        corpus_fingerprint,
        cumulative_spend,
        record_run,
        report_path,
        select_profiles,
    )
    from etl.enrichment import get_embedder
    from etl.intelligence import generate_briefing
    from etl.intelligence.llm import get_client, has_api_key

    effective_dry = dry_run or not has_api_key()
    profiles, next_cursor = select_profiles(count=count, all_profiles=all_profiles)
    guard = BudgetGuard(None if effective_dry or budget <= 0 else budget)
    client = None if effective_dry else MeteredClient(get_client(), guard)
    if effective_dry and not dry_run:
        typer.echo("(No ANTHROPIC_API_KEY — retrieval and stats only.)\n")

    scope = "whole panel" if all_profiles else f"{len(profiles)} of {len(EVAL_PANEL)} profiles"
    cap = "none" if guard.max_usd is None else f"${guard.max_usd:.2f}"
    typer.echo(f"brief-check: {scope}, budget {cap}\n")

    embedder = get_embedder(get_settings())
    results: list[dict] = []
    completed = 0
    for profile in profiles:
        typer.echo(f"— {profile.name}")
        guard.set_context(profile.name)
        try:
            with session_scope() as session:
                result = generate_briefing(
                    session,
                    embedder,
                    profile,
                    k=k,
                    client=client,
                    dry_run=effective_dry,
                    sharpen=sharpen,
                )
        except Exception as exc:  # includes the budget guard tripping
            typer.echo(f"  stopped: {exc}")
            results.append({"profile": profile.name, "error": str(exc)})
            break
        stats = result.get("retrieval_stats", {})
        typer.echo(
            f"  {stats.get('passages')} passages / {stats.get('documents')} docs"
            f" · depth ratio {stats.get('documents_per_passage')}"
            f" · {stats.get('canon_stubs')} canon stubs"
            f" · {stats.get('context_chars')} chars"
        )
        typer.echo(f"  facets: {', '.join(stats.get('facets', []))}")
        if result.get("canon_notes"):
            for note in result["canon_notes"]:
                typer.echo(f"  ⚠ {note}")
        results.append(
            {
                "profile": profile.name,
                "query": result.get("query"),
                "retrieval_stats": stats,
                "briefing": result.get("briefing"),
                "citations": result.get("citations", []),
                "canon_notes": result.get("canon_notes", []),
            }
        )
        completed += 1

    # Fingerprint the corpus this run actually saw, so a later comparison can
    # tell whether the two runs are comparable at all (see corpus_fingerprint).
    with session_scope() as session:
        fingerprint = corpus_fingerprint(session)
    if fingerprint["unembedded_passages"]:
        typer.echo(
            f"\n⚠ {fingerprint['unembedded_passages']} passages are unembedded — "
            "ingestion has not settled, so this run measures a moving target. "
            "Run `regina embed` before treating these numbers as a baseline."
        )

    path = report_path()
    path.write_text(
        json.dumps(
            {
                "corpus": fingerprint,
                "spent_usd": round(guard.spent_usd, 4),
                "calls": guard.calls,
                "breakdown": guard.breakdown,
                "dry_run": effective_dry,
                "sharpen": sharpen,
                "results": results,
            },
            indent=2,
            default=str,
        )
    )
    if not effective_dry:
        # Advance only past profiles that actually finished. A budget stop or a
        # crash mid-rotation must leave the unchecked profile next in line —
        # otherwise the one profile that fails quietly rotates out of coverage.
        # --all covers everything, so it leaves the single-profile turn alone.
        start = (next_cursor - len(profiles)) % len(EVAL_PANEL)
        cursor = next_cursor if all_profiles else (start + completed) % len(EVAL_PANEL)
        record_run(
            cursor=cursor,
            profiles=[p.name for p in profiles[:completed]],
            spent_usd=guard.spent_usd,
        )
        typer.echo(
            f"\nSpent ${guard.spent_usd:.4f} over {guard.calls} calls "
            f"(all brief-checks to date: ${cumulative_spend():.2f})"
        )
    typer.echo(f"Raw report: {path}")


@app.command(name="brief-compare")
def brief_compare(
    before: str = typer.Argument(..., help="Path to the earlier brief-check report JSON."),
    after: str = typer.Argument(..., help="Path to the later brief-check report JSON."),
    out: str = typer.Option(None, "--out", help="Also write the full result JSON here."),
) -> None:
    """Judge two `brief-check` runs against each other and print per-dimension deltas.

    Answers "did that change make briefs better?" with the existing 7-dimension
    judge instead of an impression. Matched profiles only — a profile in one run
    and not the other is excluded and reported. One judge call per side, so cost
    is two calls regardless of panel size.

    Checks corpus fingerprints first: a run against a half-ingested corpus
    produces plausible, worthless numbers, and that has already happened once.
    """
    from etl.brief_eval.compare import compare_runs, load_report, render
    from etl.brief_eval.rotation import report_path
    from etl.intelligence.llm import get_client, has_api_key

    if not has_api_key():
        typer.echo("No ANTHROPIC_API_KEY set — the judge needs one.")
        raise typer.Exit(1)

    result = compare_runs(get_client(), load_report(before), load_report(after))
    typer.echo(render(result))
    # Always persist: a judged comparison is two paid calls, and an unpersisted
    # paid result is money spent on a number you cannot revisit.
    default_path = report_path()
    target = (
        Path(out)
        if out
        else default_path.with_name(
            default_path.name.replace("brief-check-", "brief-compare-")
        )
    )
    target.write_text(json.dumps(result, indent=2, default=str))
    typer.echo(f"\nFull result: {target}")


@app.command(name="brief-improve")
def brief_improve(
    rounds: int = typer.Option(3, help="Max candidate-search rounds after the baseline."),
    budget: float = typer.Option(
        None,
        help=(
            "Optional hard $ cap; stops early if hit. Omit for uncapped — a "
            "single run's cost is already bounded by the fixed 5-profile panel "
            "and --rounds, so a cap's only real effect is stopping mid-"
            "confirmation and losing whichever side hadn't finished yet."
        ),
    ),
    out: str = typer.Option(
        None, "--out", help="Write the markdown report to this path instead of stdout."
    ),
) -> None:
    """Test prompt tweaks against a fixed company panel and report what
    helped. On-demand only — run this whenever you want to check whether the
    brief prompt could be improved; nothing here runs automatically, and
    nothing it finds gets applied without you doing it yourself. See
    etl/brief_eval/ for the full mechanics (panel, judge, candidate search,
    budget guard)."""
    import datetime as dt

    from etl.brief_eval.report import render_log_entry, render_report
    from etl.brief_eval.search import run_search

    budget_label = f"capped at ${budget:.2f}" if budget is not None else "uncapped"
    typer.echo(f"Running baseline + up to {rounds} rounds, {budget_label}...\n")

    def _progress(line: str) -> None:
        # flush explicitly — stdout is block-buffered when redirected to a
        # file/pipe (e.g. a background run), and this is the only visibility
        # into a process that otherwise runs dark for many minutes.
        typer.echo(line, err=False)
        import sys

        sys.stdout.flush()

    report = run_search(max_rounds=rounds, budget_usd=budget, on_progress=_progress)
    markdown = render_report(report)

    if "error" in report:
        # No API key: nothing ran, nothing was spent, nothing to log.
        typer.echo(markdown)
        return

    # Always save the full report as JSON — including every generated
    # brief's actual text, not just its score — so nothing from a real,
    # billed run is ever unverifiable after the fact. Not optional: a run
    # already cost real money whether or not this file gets looked at.
    # Timestamped by default (not a fixed name) so repeated runs in one
    # session stop overwriting each other's raw output.
    import json

    now = dt.datetime.now(dt.UTC)
    default_stem = f"brief-improve-report-{now.strftime('%Y-%m-%dT%H-%M-%SZ')}"
    raw_path = (out or default_stem) + ".json"
    with open(raw_path, "w") as fh:
        json.dump(report, fh, indent=2, default=str)
    typer.echo(f"Full raw output (every generated brief, verbatim) saved to {raw_path}")

    if out:
        with open(out, "w") as fh:
            fh.write(markdown)
        typer.echo(f"Summary report written to {out}")
    else:
        typer.echo(markdown)

    title = f"{now.strftime('%Y-%m-%d %H:%M UTC')} — {_brief_log_title(report)}"
    entry = render_log_entry(report, title) + f"\n\nFull raw output: `{raw_path}`\n"
    _prepend_brief_log_entry(entry)
    typer.echo(f"\nLogged this run to {_BRIEF_LOG_PATH}")


@app.command()
def serve(
    host: str = typer.Option("127.0.0.1"),
    port: int = typer.Option(8000),
    reload: bool = typer.Option(False, "--reload"),
) -> None:
    """Run the HTTP API that powers the website."""
    import uvicorn

    uvicorn.run("etl.api:app", host=host, port=port, reload=reload)


@app.command()
def run(
    key: str,
    limit: int = typer.Option(None),
    full: bool = typer.Option(
        False,
        "--full",
        help=(
            "Ignore the incremental cursor and re-discover the whole backfill "
            "window. Use when a source looks starved: after its first run a "
            "source only asks for what is newer than that run, so a first run "
            "that was truncated or partly failed leaves history permanently "
            "unreachable. Idempotent."
        ),
    ),
) -> None:
    """Run a single adapter by key (debugging)."""
    cls = ADAPTERS_BY_KEY.get(key)
    if cls is None:
        raise typer.BadParameter(f"Unknown source '{key}'. Known: {', '.join(ADAPTERS_BY_KEY)}")
    settings = get_settings()
    with HttpClient(settings) as http, session_scope() as session:
        stats = run_adapter(session, cls(http, settings), limit=limit, full=full)
    typer.echo(f"{key}: {stats}")


if __name__ == "__main__":
    app()
