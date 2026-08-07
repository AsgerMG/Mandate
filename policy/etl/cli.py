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
    from etl.intelligence.llm import get_client, has_api_key

    if not embed:
        typer.echo("\n(--no-embed: skipping the enrichment pass entirely.)")
        return

    typer.echo("\nEnriching:")
    with HttpClient(settings) as http:
        enrich_corpus(
            session_scope,
            http=http,
            embedder=get_embedder(settings),
            client=get_client() if has_api_key() else None,
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
    from etl.intelligence.llm import get_client, has_api_key

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
            client=get_client() if has_api_key() else None,
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
    model: str = typer.Option(
        None,
        "--model",
        help=(
            "Override the brief model for this run only (e.g. claude-haiku-4-5). "
            "Recorded in the report so a later brief-compare can label the sides."
        ),
    ),
    repeat: int = typer.Option(
        1,
        "--repeat",
        help=(
            "Re-run retrieval N times per profile to measure its run-to-run "
            "variance. --dry-run only, so it costs nothing."
        ),
    ),
    judge: bool = typer.Option(
        True,
        "--judge/--no-judge",
        help=(
            "Score this run with the 7-dimension judge and store it in the report "
            "(one extra batched call), so quality joins cost and latency in "
            "`--history`. Ignored on a dry run."
        ),
    ),
    history: bool = typer.Option(
        False,
        "--history",
        help="Print the dated ledger of every past brief-check and exit. Runs nothing.",
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

    `--model` runs the panel on a different brief model; `--repeat` (dry-run
    only) measures how much retrieval moves between identical runs, which is the
    noise floor any brief-compare delta has to clear to mean anything.
    """
    import os
    import time

    if history:
        # Before anything else: reads report files, touches no database, spends
        # nothing. A flag rather than a command so seeing the trend doesn't
        # require running a check.
        from etl.brief_eval.history import render, run_rows

        typer.echo(render(run_rows()))
        return

    from etl.brief_eval.compare import retrieval_spread
    from etl.brief_eval.cost import BudgetGuard, MeteredClient
    from etl.brief_eval.panel import EVAL_PANEL
    from etl.brief_eval.recency import recency_from_results
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
    if repeat > 1 and not effective_dry:
        # A paid --repeat would produce several briefs per profile, which the
        # report shape (one entry per profile) can't hold and brief-compare
        # can't read. Variance in *retrieval* is what a repeat measures anyway,
        # and that needs no API call.
        typer.echo("--repeat measures retrieval variance and needs --dry-run (it's free).")
        raise typer.Exit(1)
    if model:
        # get_settings() is lru_cached and read lazily by every request builder,
        # so the override has to land in the environment *before* the first read
        # — setting it afterwards would silently run the old model.
        os.environ["LLM_MODEL"] = model
        get_settings.cache_clear()
        if get_settings().llm_model != model:
            typer.echo(
                f"Could not apply --model {model} (settings still say {get_settings().llm_model})."
            )
            raise typer.Exit(1)

    profiles, next_cursor = select_profiles(count=count, all_profiles=all_profiles)
    guard = BudgetGuard(None if effective_dry or budget <= 0 else budget)
    client = None if effective_dry else MeteredClient(get_client(), guard)
    if effective_dry and not dry_run:
        typer.echo("(No ANTHROPIC_API_KEY — retrieval and stats only.)\n")

    scope = "whole panel" if all_profiles else f"{len(profiles)} of {len(EVAL_PANEL)} profiles"
    cap = "none" if guard.max_usd is None else f"${guard.max_usd:.2f}"
    # Shown even on a dry run: it makes `--model` verifiable without a key, and
    # a dry run that silently ignored the flag would be a confusing way to find
    # out the override didn't take.
    run_model = get_settings().llm_model + (" (not called: dry run)" if effective_dry else "")
    typer.echo(f"brief-check: {scope}, model {run_model}, budget {cap}\n")

    embedder = get_embedder(get_settings())
    results: list[dict] = []
    completed = 0
    for profile in profiles:
        typer.echo(f"— {profile.name}")
        guard.set_context(profile.name)
        started = time.perf_counter()
        try:
            runs = []
            for _ in range(repeat):
                # A fresh transaction per run, because that is what production
                # does (one session per /api/brief request) and because sharing
                # one across repeats measured the wrong thing: press_passages
                # left the planner in exact-scan mode for the rest of the
                # transaction, so run 1 used the HNSW index and runs 2+ did not.
                # The "variance" that produced was a leak, not retrieval noise.
                started = time.perf_counter()
                with session_scope() as session:
                    runs.append(
                        generate_briefing(
                            session,
                            embedder,
                            profile,
                            k=k,
                            client=client,
                            dry_run=effective_dry,
                            sharpen=sharpen,
                        )
                    )
                # Per run, not per profile: with --repeat, one timer around the
                # whole loop would report three briefs' latency as one brief's.
                runs[-1]["seconds"] = round(time.perf_counter() - started, 2)
            result = runs[0]
        except Exception as exc:  # includes the budget guard tripping
            typer.echo(f"  stopped: {exc}")
            results.append({"profile": profile.name, "error": str(exc)})
            break
        # End-to-end, not just model time: retrieval, reranking and both model
        # calls are all latency the user sits through.
        elapsed = result["seconds"]
        stats = result.get("retrieval_stats", {})
        typer.echo(
            f"  {stats.get('passages')} passages / {stats.get('documents')} docs"
            f" · depth ratio {stats.get('substantive_documents_per_passage')}"
            f" · {stats.get('canon_stubs')} canon stubs"
            f" · {stats.get('context_chars')} chars"
            f" · {elapsed}s"
        )
        typer.echo(f"  facets: {', '.join(stats.get('facets', []))}")
        if result.get("canon_notes"):
            for note in result["canon_notes"]:
                typer.echo(f"  ⚠ {note}")
        entry = {
            "profile": profile.name,
            "query": result.get("query"),
            "retrieval_stats": stats,
            "seconds": elapsed,
            "briefing": result.get("briefing"),
            "citations": result.get("citations", []),
            "canon_notes": result.get("canon_notes", []),
            # Persisted so hinge recurrence can be counted across runs without
            # re-parsing briefing prose. generate_briefing has always returned
            # this; dropping it here is why the 2026-07-29 panel had to be
            # reconstructed by hand (see brief-quality-plan.md Phase 5.2).
            "unresolved_hinges": result.get("unresolved_hinges", []),
        }
        if repeat > 1:
            spread = retrieval_spread(
                [{**r.get("retrieval_stats", {}), "seconds": r["seconds"]} for r in runs]
            )
            entry["retrieval_variance"] = spread
            for key, v in spread.items():
                typer.echo(
                    f"  variance {key:34} {v['min']} – {v['max']}"
                    f"  (spread {v['spread']}, mean {v['mean']})"
                )
        results.append(entry)
        completed += 1

    # Fingerprint the corpus this run actually saw, so a later comparison can
    # tell whether the two runs are comparable at all (see corpus_fingerprint).
    with session_scope() as session:
        fingerprint = corpus_fingerprint(session)
        # Did anything published recently actually reach a brief? Measured at
        # 0/8 on 2026-07-21 and never re-measured, because recency lived only on
        # the brief-improve path. `measurable` distinguishes "no recent corpus
        # to hit" from a real zero.
        recency = recency_from_results(session, results)
    if recency.get("measurable"):
        typer.echo(
            f"\nRecency: {recency['recent_covered']}/{recency['recent_total']} "
            "acts ingested in the last 30 days reached a brief"
        )
    if fingerprint["unembedded_passages"]:
        typer.echo(
            f"\n⚠ {fingerprint['unembedded_passages']} passages are unembedded — "
            "ingestion has not settled, so this run measures a moving target. "
            "Run `regina enrich --only embeddings` before treating these numbers "
            "as a baseline."
        )

    payload = {
        "corpus": fingerprint,
        "recency": recency,
        # The model that actually served the calls, from the responses rather than
        # from config — a fallback or a stale settings cache would otherwise be
        # invisible in a comparison of two models.
        "model": ", ".join(sorted(guard.models)) or None,
        "spent_usd": round(guard.spent_usd, 4),
        "seconds": round(guard.seconds, 2),
        "calls": guard.calls,
        "breakdown": guard.breakdown,
        "dry_run": effective_dry,
        "sharpen": sharpen,
        "results": results,
    }

    # Score the run on its own terms, so quality is part of the record rather than
    # only ever a pairwise comparison. One batched call for the whole panel — a
    # rounding error against a 10-profile generation run — and without it there is
    # no way to see quality over time, only between two chosen runs.
    if judge and not effective_dry and completed:
        from etl.brief_eval.compare import judge_report

        guard.set_context("judge")
        try:
            payload["judged"] = judge_report(client, payload)
            means = payload["judged"].get("means", {})
            if means:
                typer.echo(
                    f"\nJudged {means.get('score')}/5 "
                    + " · ".join(
                        f"{k.replace('_', ' ')} {v}" for k, v in means.items() if k != "score"
                    )
                )
        except Exception as exc:  # a failed judge must not cost us the briefs
            typer.echo(f"\n(judging failed: {exc} — the briefs above are still saved)")
            payload["judged"] = {"error": str(exc)}
        payload["spent_usd"] = round(guard.spent_usd, 4)
        payload["calls"] = guard.calls

    path = report_path()
    path.write_text(json.dumps(payload, indent=2, default=str))
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
        else default_path.with_name(default_path.name.replace("brief-check-", "brief-compare-"))
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
