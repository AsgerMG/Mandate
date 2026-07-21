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

import structlog
import typer

from data import get_settings, init_db, session_scope
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
