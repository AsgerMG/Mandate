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
from pathlib import Path

STEPS = [
    [sys.executable, str(ROOT / "ETL/events/extract/renew.py"), "--auto"],
    [sys.executable, str(ROOT / "ETL/events/transform/classify_taxonomy.py"), "apply-nace"],
    [sys.executable, str(ROOT / "ETL/events/transform/classify_taxonomy.py"), "run",
     "--max-cost", "20"],
    [sys.executable, str(ROOT / "ETL/events/load/qa/sanity_check.py")],
    [sys.executable, str(ROOT / "ETL/terms/detect_eligibility_gaps.py")],
    # Sources that decay on a CALENDAR rather than on a release. renew.py above
    # refreshes on a content hash, which is the right trigger for a register
    # that republishes a file and the wrong one for a register whose rows carry
    # application deadlines: nothing upstream changes, and the inventory still
    # empties. See refresh_open_calls.py.
    [sys.executable, str(ROOT / "ETL/terms/refresh_open_calls.py")],
    # ...and the guard for the failure mode the refresh itself has. A weekly job
    # that silently stops running reproduces exactly the decay it was added to
    # prevent. This runs LAST so it judges the state the run actually left, and
    # it is not partial-tolerant: unexplained decay is a finding, not weather.
    [sys.executable, str(ROOT / "ETL/terms/check_offerable_decay.py")],
]

# Recorded after everything above, WHATEVER happened above — see below.
CENSUS = str(ROOT / "ETL/events/load/publish_corpus_census.py")

# renew.py exits 3 when SOME sources failed but most published -- a partial
# refresh. That is the normal weather of scraping other people's websites, and
# it must not cancel the rest of the run.
#
# It used to. On 2026-08-06 one source hit a Cloudflare 403, renew.py exited 1,
# and this loop stopped there: classification, the sanity check and gap
# detection never ran, so a week of data sat unprocessed because one site
# blocked us. Exit 1 from renew.py now means MOST sources failed, which is a
# pipeline fault and should still stop everything.
#
# refresh_open_calls.py exits 3 on the same grounds and for the same reason: a
# detail fetch that hits its cap, or a naming pass with no API key, still moved
# the corpus forward and must not cancel the decay guard that follows it.
#
# check_offerable_decay.py exits 3 for a fall inside tolerance -- worth saying
# out loud, not worth failing the week over. Its exit 1 means a country's
# offerable inventory fell with no corresponding corpus change, which is the
# defect the whole step exists to surface, so that one is NOT tolerated.
PARTIAL_OK = {"renew.py": 3, "refresh_open_calls.py": 3, "check_offerable_decay.py": 3}

def census(outcome: str) -> None:
    """Record what this run left behind, and how the run itself went.

    ── Why it runs even when the pipeline failed ──────────────────────────
    The website serves committed build artifacts — synthesis.json's headline
    figures, instrument_terms.json as the fallback fund inventory — and this
    container cannot publish them. It has no Node, no git credentials and an
    ephemeral filesystem, and making a weekly cron commit to main would put the
    whole site's deploy path behind an unattended job. So it does the one thing
    it can do that nothing else can: it writes down what its corpus contains,
    in the Postgres the product already reads, so the drift becomes a fact
    somebody is told rather than one somebody eventually notices.

    That record is only worth having if it is honest about a bad run. A census
    written only on success would leave the last good week's numbers standing
    as the newest record after a failure, and the guard downstream would read
    them and report that all is well — the precise shape of the defect this
    pipeline keeps producing. So the outcome travels with the census, the
    census is written whatever happened, and it is written LAST so it describes
    the corpus as this run actually left it.
    """
    print(f"=== RUNNING: census ({outcome}) ===", flush=True)
    rc = subprocess.run([sys.executable, CENSUS, "--run-outcome", outcome]).returncode
    if rc != 0:
        # Never the reason the run fails: the census is the reporting channel,
        # and a reporting failure must not be able to mask or worsen the thing
        # it is reporting on. It is loud here, and the guard downstream fails on
        # a census that is missing or stale.
        print(f"=== CENSUS FAILED (rc={rc}) — the website cannot see this "
              f"corpus; run it by hand ===", flush=True)


partial = []
for step in STEPS:
    print(f"=== RUNNING: {' '.join(step)} ===", flush=True)
    result = subprocess.run(step)
    if result.returncode == 0:
        continue
    matched = next(((name, rc) for name, rc in PARTIAL_OK.items()
                    if any(name in part for part in step)), None)
    if matched and result.returncode == matched[1]:
        print(f"=== PARTIAL: {' '.join(step)} (rc={result.returncode}) — "
              f"continuing with what published ===", flush=True)
        # Name the SCRIPT, not whatever happened to be second-from-last in the
        # argv. A two-element step reported "python3" as the partial, which is
        # a summary line that tells nobody which step half-worked.
        partial.append(matched[0])
        continue
    print(f"=== FAILED: {' '.join(step)} (rc={result.returncode}) ===", flush=True)
    census(f"failed at {Path(step[1]).name} (rc={result.returncode})")
    sys.exit(result.returncode)

if partial:
    # Loud, and non-zero, so a scheduled run that half-worked is never read as
    # a clean one -- but only AFTER every downstream step has had its turn.
    census(f"partial: {', '.join(Path(p).name for p in partial)}")
    print(f"=== ALL STEPS RAN, {len(partial)} PARTIAL ===", flush=True)
    sys.exit(3)
census("ok")
print("=== ALL STEPS COMPLETE ===", flush=True)
