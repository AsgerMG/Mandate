"""Local automation entry point for the news/signals intelligence track.

Runs LOCALLY, not on Railway -- embed_articles.py needs fastembed (a real,
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

for step in STEPS:
    print(f"=== RUNNING: {' '.join(step)} ===", flush=True)
    result = subprocess.run(step)
    if result.returncode != 0:
        print(f"=== FAILED: {' '.join(step)} (rc={result.returncode}) ===", flush=True)
        sys.exit(result.returncode)

print("=== ALL STEPS COMPLETE ===", flush=True)
print("Note: this run's relevance/entity/signal batches were SUBMITTED, not "
      "collected -- their results land on the NEXT run of this script.")
