"""Railway cron entry point for the broad ETL pipeline.

Runs renew --auto -> apply-nace -> classify_taxonomy (cost-gated) ->
sanity_check as explicit subprocess steps with checked return codes, rather
than relying on shell `&&` chaining in a Railway startCommand string
(observed unreliable: renew.py exited 0 but the chain silently stopped
before the classify step ran).

classify.py (deterministic sector_inferred + entity_type regex heuristic) is
retired from this routine loop -- classify_taxonomy.py's LLM-driven
sector_top/subsector/entity_type is now the sole classifier for new data.
The --max-cost gate means a backlog spike gets skipped (not silently
charged) for manual review rather than blocking the rest of the run.
"""

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

STEPS = [
    [sys.executable, str(ROOT / "ETL/events/extract/renew.py"), "--auto"],
    [sys.executable, str(ROOT / "ETL/events/transform/classify_taxonomy.py"), "apply-nace"],
    [sys.executable, str(ROOT / "ETL/events/transform/classify_taxonomy.py"), "run",
     "--max-cost", "20"],
    [sys.executable, str(ROOT / "ETL/events/load/qa/sanity_check.py")],
    [sys.executable, str(ROOT / "ETL/terms/detect_eligibility_gaps.py")],
]

for step in STEPS:
    print(f"=== RUNNING: {' '.join(step)} ===", flush=True)
    result = subprocess.run(step)
    if result.returncode != 0:
        print(f"=== FAILED: {' '.join(step)} (rc={result.returncode}) ===", flush=True)
        sys.exit(result.returncode)

print("=== ALL STEPS COMPLETE ===", flush=True)
