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
from .pipeline import ensure_source, run_adapter, run_all_sources

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

    def _echo_source(key: str, stats: dict | None) -> None:
        if stats is None:
            typer.echo(f"→ {key} …")

    with HttpClient(settings) as http, session_scope() as session:
        # One shared collection loop — see pipeline.run_all_sources for why
        # this must not be a per-entrypoint copy.
        totals = run_all_sources(
            session,
            ADAPTERS,
            http,
            settings,
            keys=keys,
            limit=limit,
            full=full,
            on_source=_echo_source,
        )

    typer.echo("\nRefresh complete:")
    for key, stats in totals.items():
        typer.echo(f"  {key:16} {stats}")

    # One ordered enrichment pass. The order is a correctness constraint, not a
    # preference — lifecycle and actors both filter on document_type, so they must
    # run after reclassification or they silently skip documents whose type has
    # not been derived yet. It lives in etl/enrichment/corpus.py so `refresh` and
    # `regina enrich` cannot drift apart on it.
    from etl.enrichment import get_embedder
    from etl.enrichment.corpus import enrich_corpus
    from etl.intelligence.llm import get_client, llm_available

    if not embed:
        typer.echo("\n(--no-embed: skipping the enrichment pass entirely.)")
        return

    typer.echo("\nEnriching:")
    with HttpClient(settings) as http:
        enrich_corpus(
            session_scope,
            http=http,
            embedder=get_embedder(settings),
            client=get_client() if llm_available() else None,
            on_progress=typer.echo,
        )


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
                (DocumentVersion.document_id == Document.id) & (DocumentVersion.is_current == True),  # noqa: E712
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
def enrich(
    only: str = typer.Option(
        None,
        help=(
            "Comma-separated steps to run instead of the default pass: "
            "types, actors, lifecycle, embeddings, tags, summaries. "
            "`summaries` is paid per document and never runs by default."
        ),
    ),
    timeout: float = typer.Option(
        300.0, help="HTTP timeout; a 150-CELEX Cellar batch needs more than the default."
    ),
) -> None:
    """Re-derive everything downstream of ingestion: types, actors, dates and
    lifecycle, embeddings, tags, and (opt-in) per-document summaries.

    Runs automatically as part of `refresh`. Every step is idempotent, so this is
    safe to re-run and only touches rows still missing what it produces — which is
    also why it is one command rather than the four it replaced (`lifecycle`,
    `actors`, `reclassify`, `enrich`): the steps share an order that matters, and
    four entry points meant four chances to run them in the wrong one.
    """
    from etl.enrichment import get_embedder
    from etl.enrichment.corpus import STEPS, enrich_corpus
    from etl.intelligence.llm import get_client, llm_available

    steps = tuple(x.strip() for x in only.split(",")) if only else None
    base = get_settings()
    settings = Settings(**{**base.model_dump(), "http_timeout_seconds": timeout})
    paid = [s.name for s in STEPS if s.paid and (not steps or s.name in steps)]
    if paid:
        typer.echo(f"Note: {', '.join(paid)} makes billed API calls per document.")

    with HttpClient(settings) as http:
        results = enrich_corpus(
            session_scope,
            http=http,
            embedder=get_embedder(settings),
            client=get_client() if llm_available() else None,
            only=steps,
            on_progress=typer.echo,
        )
    skipped = {k: v["skipped"] for k, v in results.items() if "skipped" in v}
    for name, reason in skipped.items():
        typer.echo(f"  {name:11} skipped — {reason}")


@app.command()
def search(query: str, k: int = typer.Option(5, help="Number of results.")) -> None:
    """Meaning-search the corpus and show citation-ready passages."""
    from etl.enrichment import get_embedder, semantic_search

    settings = get_settings()
    embedder = get_embedder(settings)
    with session_scope() as session:
        hits = semantic_search(session, embedder, query, k=k)
    if not hits:
        typer.echo("No embedded passages yet — run `regina enrich` first.")
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
    from etl.intelligence.llm import llm_available

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

    effective_dry = dry_run or not llm_available()
    if effective_dry and not dry_run:
        typer.echo("(No ANTHROPIC_API_KEY — showing retrieved sources only.)\n")

    with session_scope() as session:
        result = generate_briefing(
            session, embedder, profile, k=k, dry_run=effective_dry, sharpen=sharpen
        )

    if not result["passages"]:
        typer.echo("No embedded passages found. Run `regina refresh` (or `regina enrich`) first.")
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


# brief-check, brief-compare and brief-improve (the one-pager brief's eval
# harness, etl/brief_eval/) are archived with the brief at the git tag
# archive/2026-11-pre-pivot.


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
