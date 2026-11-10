"""Local automation entry point for the news/signals intelligence track.

Runs in the weekly cron (railway_cron.py: --wait-minutes 90 --no-digest) and
locally. HISTORY: it used to run LOCALLY only -- embed_articles.py needed fastembed (a real,
un-pinned dependency not in requirements.txt or the Railway image; adding
ONNX-model weights to that image was judged not worth the risk/verification
cost tonight), and the LLM stages here are async batch (submit now, collect
later, usually <1h) rather than the synchronous-poll design used for the
events pipeline's classify_taxonomy.py -- a weekly cadence means each run's
`collect` step naturally picks up the PREVIOUS run's submitted batches,
which have had a full week to finish.

Order: sync -> collect (relevance/entity/signals from last run) -> ingest
-> hydrate -> submit relevance -> submit entity -> submit signals -> embed
-> digest. Each LLM submit step is cost-gated (--max-cost 20) so an
unattended run never spends past your threshold without review.

Usage: python3 ETL/intelligence/news_cron.py   (or `make news`)
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import subprocess
import sys

MAX_COST = "20"

STEPS = [
    [sys.executable, str(ROOT / "ETL/intelligence/extract/news_ingest.py"), "sync"],
    [sys.executable, str(ROOT / "ETL/intelligence/transform/classify_relevance.py"), "collect"],
    [sys.executable, str(ROOT / "ETL/intelligence/transform/entity_link_articles.py"), "collect"],
    [sys.executable, str(ROOT / "ETL/intelligence/transform/classify_signals.py"), "collect"],
    [sys.executable, str(ROOT / "ETL/intelligence/extract/news_ingest.py"), "ingest"],
    # Explicitly scoped to recent articles, NOT the full backlog: there's a
    # large historical backlog (14k+ articles never hydrated by the original
    # one-shot backfill) sitting behind this week's genuinely-new articles.
    # Sort-order-only prioritisation was tried and found unreliable (NULL/
    # malformed published_at values don't sort predictably), so this uses an
    # explicit --since-days filter instead -- the point of this automation is
    # staying current, not slowly excavating two years of old news. Widen or
    # drop --since-days (or run news_ingest.py hydrate by hand) if the old
    # backlog turns out to matter later -- still free, just wall-clock time.
    [sys.executable, str(ROOT / "ETL/intelligence/extract/news_ingest.py"), "hydrate",
     "--since-days", "14"],
    [sys.executable, str(ROOT / "ETL/intelligence/transform/classify_relevance.py"), "submit",
     "--max-cost", MAX_COST],
    [sys.executable, str(ROOT / "ETL/intelligence/transform/entity_link_articles.py"), "submit",
     "--max-cost", MAX_COST],
    [sys.executable, str(ROOT / "ETL/intelligence/transform/classify_signals.py"), "submit",
     "--max-cost", MAX_COST],
    [sys.executable, str(ROOT / "ETL/intelligence/transform/embed_articles.py"), "run"],
    [sys.executable, str(ROOT / "website/build/signals_digest.py")],
]

COLLECT = STEPS[1:4]
EMBED, DIGEST = STEPS[-2], STEPS[-1]
#: The steps that call the API (collect and submit, relevance/entity/signals).
#: Everything else here is free (fetching, hydrating, embedding via Voyage).
PAID = {"classify_relevance.py", "entity_link_articles.py", "classify_signals.py"}

sys.path.insert(0, str(ROOT.parent))
from mandate.llm import budget  # noqa: E402

#: Set when a paid step was skipped: budget.OFF / budget.EXHAUSTED, or "".
paused = ""


def _label(step) -> str:
    return " ".join([_Path(step[1]).name] + [a for a in step[2:] if not a.startswith("-")][:1])


def _run(step, fatal: bool = True) -> int:
    global paused
    if _Path(step[1]).name in PAID:
        # One switch (mandate/llm/budget.py). Off: never started. Exhausted
        # (a paid step exited EXIT_SKIPPED): the rest of the paid steps are
        # skipped too, since none of them can be paid for either.
        if paused or not budget.llm_enabled():
            paused = paused or budget.OFF
            print(f"=== SKIPPED: {budget.skip_reason(_label(step), paused)} ===", flush=True)
            return 0
    print(f"=== RUNNING: {' '.join(step)} ===", flush=True)
    result = subprocess.run(step)
    if result.returncode == budget.EXIT_SKIPPED and _Path(step[1]).name in PAID:
        paused = budget.EXHAUSTED
        print(f"=== SKIPPED: {budget.skip_reason(_label(step), paused)} ===", flush=True)
        return 0
    if result.returncode != 0:
        print(f"=== FAILED: {' '.join(step)} (rc={result.returncode}) ===", flush=True)
        if fatal:
            sys.exit(result.returncode)
    return result.returncode


def _pending() -> int:
    import batch_state  # noqa: PLC0415
    return sum(len(batch_state.pending(k)) for k in batch_state.LEGACY)


def main() -> None:
    import argparse  # noqa: PLC0415
    import time  # noqa: PLC0415
    ap = argparse.ArgumentParser()
    ap.add_argument("--wait-minutes", type=int, default=0,
                    help="after submitting, poll and collect THIS run's batches for up to N "
                         "minutes, so the digest below includes them (the weekly cron: 90)")
    ap.add_argument("--no-digest", action="store_true",
                    help="stop before the digest (the cron cuts it after linking)")
    args = ap.parse_args()
    for step in STEPS[:-2]:
        _run(step)
    deadline = time.monotonic() + 60 * args.wait_minutes
    while args.wait_minutes and not paused and _pending() and time.monotonic() < deadline:
        print(f"=== WAITING: {_pending()} batch(es) still pending ===", flush=True)
        time.sleep(300)
        for step in COLLECT:
            _run(step)
    # Not fatal: signals_chunk_embeddings is still in the legacy local space
    # (fastembed, not in the cron image) until the Phase C re-embed moves it to
    # the one model. Until then the digest is cut from the passages already
    # embedded, and this run still says it failed (exit 3).
    embed_rc = _run(EMBED, fatal=False)
    if not args.no_digest:
        _run(DIGEST)
    print("=== ALL STEPS COMPLETE ===", flush=True)
    if _pending():
        print("Note: some batches are still processing -- their ids are in the store "
              "(batch_state) and the NEXT run collects them.")
    if embed_rc:
        sys.exit(3)
    if paused:
        # The free stages ran; the paid ones did not. The last line is the
        # reason railway_cron records against this step (status `skipped`).
        budget.exit_skipped(budget.skip_reason(
            "news_cron.py paid stages (relevance, entity links, signals)", paused)
            .replace("data unchanged", "free stages ran, labels unchanged"))


if __name__ == "__main__":
    main()
