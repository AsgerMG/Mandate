"""Command-line entrypoint.

The automation goal: a user (or a scheduler, or later an API endpoint) triggers
ONE command — `ept refresh` — and the whole corpus updates itself. Everything
else here is setup/inspection around that single trigger.

    ept init        create the schema + pgvector extension, seed vocabularies
    ept sources     list registered sources and their last-run state
    ept refresh     run every enabled adapter end-to-end (the trigger)
    ept run <key>   run a single adapter (debugging)
"""

from __future__ import annotations

import structlog
import typer

from data import get_settings, init_db, session_scope
from data.seeds import seed_vocabularies

from .adapters import ADAPTERS, ADAPTERS_BY_KEY
from .http import HttpClient
from .pipeline import ensure_source, run_adapter

app = typer.Typer(help="EuroPolTracker ETL — automated tech-policy data collection.")
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
            typer.echo("No sources registered yet — run `ept init`.")
            return
        for s in rows:
            last = s.last_run_at.isoformat() if s.last_run_at else "never"
            flag = "on " if s.enabled else "off"
            typer.echo(f"[{flag}] {s.key:16} {s.jurisdiction.value:3} last_run={last}  {s.name}")


@app.command()
def refresh(
    limit: int = typer.Option(None, help="Max documents per source (debugging)."),
    only: str = typer.Option(None, help="Comma-separated source keys to restrict to."),
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
                totals[adapter.key] = run_adapter(session, adapter, limit=limit)
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

    if embed:
        from etl.enrichment import embed_pending, get_embedder

        with session_scope() as session:
            n = embed_pending(session, get_embedder(settings))
        typer.echo(f"\nEmbedded {n} new passages — corpus is retrieval-ready.")


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
        typer.echo("No embedded passages yet — run `ept embed` first.")
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
    """Generate a grounded, citation-backed regulatory exposure report for a company."""
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
        typer.echo("No embedded passages found. Run `ept refresh` then `ept embed` first.")
        return

    if result.get("briefing"):
        typer.echo(result["briefing"])
        typer.echo("\n— Sources —")
        seen = set()
        for c in result["citations"]:
            key = c.get("celex") or c.get("url")
            if key and key not in seen:
                seen.add(key)
                n = f"[{c['n']}] " if c.get("n") else ""
                typer.echo(f"  {n}{c.get('celex') or c.get('title')}  {c.get('url')}")
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
def run(key: str, limit: int = typer.Option(None)) -> None:
    """Run a single adapter by key (debugging)."""
    cls = ADAPTERS_BY_KEY.get(key)
    if cls is None:
        raise typer.BadParameter(f"Unknown source '{key}'. Known: {', '.join(ADAPTERS_BY_KEY)}")
    settings = get_settings()
    with HttpClient(settings) as http, session_scope() as session:
        stats = run_adapter(session, cls(http, settings), limit=limit)
    typer.echo(f"{key}: {stats}")


if __name__ == "__main__":
    app()
