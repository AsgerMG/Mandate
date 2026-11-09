"""Railway cron entry point for the broad ETL pipeline (service capital-etl).

Runs against schema `capital` of the Mandate Postgres (DATABASE_URL, role
capital_app) and nothing else: no volume, no SQLite. The container filesystem
is scratch, so extractor download caches start empty on every run.

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

import collections
import os
import subprocess
import sys
import threading
from pathlib import Path

_sys.path.insert(0, str(ROOT / "ETL" / "lib"))
import corpus_marks  # noqa: E402
_sys.path.insert(0, str(ROOT.parent))
from mandate.runs import from_env as _run_log  # noqa: E402

# Every step is also a row in mandate.run_steps: on the orchestrator's run when
# mandate/refresh/run.py started us (MANDATE_RUN_ID), else on a run of our own.
RUN, OWN_RUN = _run_log(brain="capital", kind="capital_etl")
RENEW_RESULTS = "/tmp/mandate_renew_results.json"
os.environ["RENEW_RESULTS"] = RENEW_RESULTS

STEPS = [
    # FIRST, and fatal if it fails. Applies the forward Postgres migrations
    # (ETL/schema/migrations/) and then fails if any table or column the
    # committed DDL declares is missing from the store -- see apply.py.
    #
    # History. Nothing here ever applied migrations, so they reached whichever store a
    # human happened to be pointed at -- the laptop, every time, and this volume
    # never. The corpus the weekly cron actually writes ran 9 of the 23
    # committed migrations. Its funding_instruments had no `tier` column, the
    # census reads `tier`, so the census recorded a coverage LOSS and half a day
    # went into hunting for funds that had never gone anywhere. A missing column
    # is not a smaller corpus, but it reads exactly like one. The four columns
    # that DID exist here were the ones an ordinary ETL script self-heals with
    # ALTER TABLE on its way past, which is the same defect wearing a hat: the
    # schema follows whichever SCRIPT ran, not whichever STORE matters.
    #
    # Fatal rather than tolerated, because every step below writes into this
    # schema and a pipeline that writes a week of data into the wrong shape has
    # made the problem bigger. Every migration is idempotent, so on an
    # up-to-date corpus this prints a column of skips and costs a second.
    # See ETL/events/load/migrations/apply.py::apply_all.
    [sys.executable, str(ROOT / "ETL/events/load/migrations/apply.py"), "all"],
    [sys.executable, str(ROOT / "ETL/events/extract/renew.py"), "--auto"],
    # ── restore -> apply-nace -> run -> persist ─────────────────────────────
    #
    # ALL FOUR write sector labels, and all four go through ONE rule,
    # classify_taxonomy.merge_label: a label only ever gains information --
    # an empty one is filled, a derived one (nace / nace_top / programme) may
    # be replaced by a curated one, a missing subsector may be completed, and
    # nothing is ever blanked or moved. On 2026-10-18 this sequence regressed
    # 164 curated labels in the vault, because apply-nace overwrote every
    # company from its NACE tags and persist upserted the result over the
    # vault. See the block above merge_label, and
    # ETL/events/transform/test_sector_label_precedence.py.
    #
    # What follows is the original case for the pair; its premise -- that
    # `renew.py --auto` reloads `companies` destructively -- was no longer true
    # when the port was made (no AUTO extractor deletes a company; they reuse
    # or insert). restore is kept because it also repairs: it puts a curated
    # vault label back over a derived guess.
    #
    # `renew.py --auto` reloads `companies` destructively and re-issues the
    # surrogate id, so every sector label written into that table is gone by the
    # time the classifier below starts. `classify_taxonomy.py` has said so in
    # cmd_persist's own docstring since the day it was written -- "run after any
    # labelling; restore runs after any load" -- and `make classify` and
    # `ETL/refresh.py` both do it. This loop, the only runner that actually
    # performs the load, did neither.
    #
    # What that costs is measurable and was measured. Of the eleven sector
    # families the home page names, the three smallest exist ONLY under labels
    # this pair carries; what the container can re-derive unaided is
    # apply-nace's families plus the programme heuristic's, and that union is
    # exactly eight. Census #4 and census #10 -- the only two ever taken inside
    # this container -- both recorded eight. Every census taken against a store
    # this loop had not rebuilt recorded eleven.
    #
    # Two workstreams read that as a symptom of `refresh_open_calls.py` because
    # the two facts co-occur perfectly in the record. They co-occur because both
    # are things that only happen HERE, not because either causes the other:
    # `refresh_open_calls.py` writes Spanish convocatorias into
    # funding_instruments and cannot touch a company's sector.
    [sys.executable, str(ROOT / "ETL/events/transform/classify_taxonomy.py"), "restore"],
    [sys.executable, str(ROOT / "ETL/events/transform/classify_taxonomy.py"), "apply-nace"],
    [sys.executable, str(ROOT / "ETL/events/transform/classify_taxonomy.py"), "run",
     "--max-cost", "20"],
    # ...and the other half. Without it this container pays for LLM labels every
    # week and throws them away on the next load, which is the loss recorded in
    # cmd_persist: eight batches submitted, eight collected, no row carrying
    # sector_taxonomy_method='llm' today.
    [sys.executable, str(ROOT / "ETL/events/transform/classify_taxonomy.py"), "persist"],
    # ── What founders are offered, rebuilt from this week's events ─────────
    # Nothing rebuilt funding_instruments until 2026-11-06: refresh.py named the
    # step, but refresh.py never ran anywhere and the step was SQLite-only. It
    # runs here, after persist (sector_mix counts this week's labels), and it
    # deletes nothing and blanks nothing a later step wrote (see its header).
    # Fatal like every build step: what follows reads the table it writes.
    [sys.executable, str(ROOT / "ETL/events/load/populate_funding_instruments.py")],
    [sys.executable, str(ROOT / "ETL/events/load/qa/sanity_check.py")],
    [sys.executable, str(ROOT / "ETL/terms/detect_eligibility_gaps.py")],
    # Sources that decay on a CALENDAR rather than on a release. renew.py above
    # refreshes on a content hash, which is the right trigger for a register
    # that republishes a file and the wrong one for a register whose rows carry
    # application deadlines: nothing upstream changes, and the inventory still
    # empties. See refresh_open_calls.py.
    [sys.executable, str(ROOT / "ETL/terms/refresh_open_calls.py")],
    # France's half of the same problem, and it decays the same way. The ADEME
    # file we ingest is an AWARD file with no application window in it, so every
    # ADEME deadline the corpus holds came from a second read of a catalogue
    # page -- and `scheme_end_date` is rebuilt from the extractors on every
    # load, so those reads have to be re-taken after one. Left to itself the
    # corpus offers a French founder appels a projets that shut in 2024.
    # See ETL/terms/fetch_ademe_windows.py.
    [sys.executable, str(ROOT / "ETL/terms/fetch_ademe_windows.py"), "--write"],
    # ── The derived layer, in refresh.py's order (that file is now a laptop
    # tool; THIS is the chain that runs). Each was SQLite-only until 2026-11-06.
    [sys.executable, str(ROOT / "ETL/terms/encode_article_intensity.py"), "run"],
    [sys.executable, str(ROOT / "ETL/terms/encode_registered_regions.py"), "run"],
    [sys.executable, str(ROOT / "ETL/terms/apply_gate_role_overrides.py")],
    [sys.executable, str(ROOT / "ETL/terms/retract_unpertinent_text.py"), "--write"],
    [sys.executable, str(ROOT / "ETL/terms/repair_applicant_identity.py"), "--write"],
    # THE decision to publish. Everything in GATED below is skipped when it is
    # red; nothing else is.
    [sys.executable, str(ROOT / "ETL/terms/coverage_gate.py")],
    # Embeddings (paid, cents): incremental, so 100% embedded is the target the
    # health check holds them to (mandate/health/targets.json).
    [sys.executable, str(ROOT / "ETL/terms/build_instrument_profiles.py"), "run"],
    [sys.executable, str(ROOT / "ETL/terms/embed_eligibility.py"), "run"],
    # The runtime priors the site reads at request time (web/lib/intelligence/
    # *.generated.json). Written into this container's /app/web; the
    # orchestrator (mandate/refresh/run.py) publishes them as artefacts.
    [sys.executable, str(ROOT / "ETL/terms/emit_peer_prior.py"), "--write"],
    [sys.executable, str(ROOT / "ETL/terms/emit_region_prior.py"), "--write"],
    [sys.executable, str(ROOT / "ETL/terms/emit_channel_prior.py")],
    [sys.executable, str(ROOT / "ETL/terms/emit_instrument_objectives.py"), "--write"],
    [sys.executable, str(ROOT / "ETL/terms/emit_profile_leak_index.py")],
    # News, weekly (owner decision 2026-11-06). news_cron.py --wait collects this
    # run's batches before the digest is cut; ids outlive the container
    # (batch_state, migration 035). Then link news to funds, then the digest.
    [sys.executable, str(ROOT / "ETL/intelligence/news_cron.py"), "--wait-minutes", "90",
     "--no-digest"],
    [sys.executable, str(ROOT / "ETL/intelligence/transform/link_programme_mentions.py"), "--write"],
    [sys.executable, str(ROOT / "website/build/signals_digest.py")],
]

# A failure in one of these is RECORDED and the run goes on (exit 3 at the end):
# each writes an artefact or a report nothing later in this chain reads, so
# stopping would only take the census and the guards down with it.
SOFT = {"build_instrument_profiles.py", "embed_eligibility.py", "emit_peer_prior.py",
        "emit_region_prior.py", "emit_channel_prior.py", "emit_instrument_objectives.py",
        "emit_profile_leak_index.py", "news_cron.py", "link_programme_mentions.py",
        "signals_digest.py", "coverage_gate.py"}
# Skipped when coverage_gate.py is red: they publish what the gate refused.
GATED = {"build_instrument_profiles.py", "embed_eligibility.py", "emit_peer_prior.py",
         "emit_region_prior.py", "emit_channel_prior.py", "emit_instrument_objectives.py",
         "emit_profile_leak_index.py"}

# ── The guards that can only run here ──────────────────────────────────────
# These read the store, which no CI job holds credentials for, and giving GitHub
# Actions credentials to reach it would widen a compromised workflow from "can
# read our code" to "can read and write every award, company and fund we hold". So they run where
# the data already is, and publish a verdict anything can read
# (ETL/lib/guard_verdicts.py; web/scripts/check_verdicts.ts).
#
# `check_offerable_decay.py` was already a step above. It has moved here rather
# than being duplicated: same command, same tolerated exit code (declared once,
# in data/guard_registry.json), now with its result written down instead of
# living only in a Railway log nobody opens.
#
# ── Why a failing guard does NOT stop the run ──────────────────────────────
# Deliberate, and the opposite of what the steps above do. A guard is a REPORT.
# Aborting here would skip the census — which is the only record of what this
# week's corpus contains — in order to signal a problem that the guard has
# already recorded and that check_verdicts.ts will fail on within hours. The run
# would go dark precisely when there was something to see. So every guard runs,
# every verdict is published, the run's exit code reflects that a guard failed,
# and nothing downstream is denied the evidence.
#
# The one exception is deliberate too: check_offerable_decay.py's exit 3 means a
# fall inside tolerance, and its exit 1 means the defect it exists to surface.
# That distinction lives in the registry's `tolerate`, so the runner records
# `ok` for the first and `failed` for the second without this file knowing why.
#
# `corpus_marks` is the newest and asks the one question none of the others do:
# did this run finish what it started. It is deliberately run AFTER the steps
# and without excluding this run's own id, because by then every step above has
# closed its mark and an unclosed or non-ok one is the finding.
GUARDS = ["store_schema", "aggregate_independence", "offerable_decay",
          "corpus_marks"]
RUNNER = str(ROOT / "ETL/lib/guard_verdicts.py")

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
# the corpus forward and must not cancel the guards that follow it.
#
# fetch_ademe_windows.py is the third: it reads ADEME's own catalogue pages
# through a public archive, and a handful of 503s from that archive is ordinary
# weather. The windows it did read are written; the next run takes the rest.
PARTIAL_OK = {"renew.py": 3, "refresh_open_calls.py": 3,
              "fetch_ademe_windows.py": 3}

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


def guards() -> list[str]:
    """Run every corpus-side guard and publish each verdict. Returns the ones
    that failed; never raises, and never short-circuits — a guard that fell over
    must not stop the guard after it from being recorded."""
    failed = []
    for gid in GUARDS:
        rc = subprocess.run([sys.executable, RUNNER, "run", gid]).returncode
        if rc != 0:
            print(f"=== GUARD FAILED: {gid} (rc={rc}) — recorded, not fatal; the "
                  f"census below still runs ===", flush=True)
            failed.append(gid)
    return failed


#: How much of a failed step's output its run_steps row keeps. Enough for the
#: FAIL block a check prints or the bottom of a traceback; run_steps.summary is
#: capped at 2000 characters by mandate.runs anyway.
TAIL_LINES = 15
TAIL_CHARS = 1800


def run_step(step: list[str]) -> tuple[int, str, str]:
    """Run one step, streaming both its streams, and keep what it said last.

    Returns (returncode, why, tail). `why` is the last line it said on stderr,
    or failing that on stdout: one line, for the census and the corpus mark.
    `tail` is the last TAIL_LINES lines of BOTH streams in the order they
    arrived: the summary a failed step's row in mandate.run_steps carries.

    ── Why stdout too (2026-11-09) ────────────────────────────────────────
    Run 114's coverage_gate.py failed with an EMPTY summary: the gate prints its
    verdict -- which axes it lost, by how much -- on stdout, and only stderr was
    kept, so the one record of the run said `failed` and nothing else. Every
    check in this chain reports on stdout; an exception reports on stderr. Both
    are kept now, and the live log is unchanged: each stream is echoed to its
    own stream as it arrives.

    ── Why the tail travels ───────────────────────────────────────────────
    On 2026-08-16 `classify_taxonomy.py` exited 1 and the census recorded
    `failed at classify_taxonomy.py (rc=1)`. That is the whole record: Railway
    deletes the container's logs with the container, so the traceback was gone,
    the step is one of four invocations of the same script, and WHICH of the
    four -- and why -- could not be recovered from anything that survived. It
    took a reproduction of the image to learn that the answer was one line:
    `FileNotFoundError: reference/activity_codebook.json`.

    So the last line goes into the census's `run_outcome`, which lands in the
    Postgres the website already reads. stdout is untouched and stderr is
    echoed as it arrives, so the live log is exactly what it was; the only
    change is that a run that dies at 03:00 on a Sunday now says what killed
    it somewhere that outlives the container.
    """
    proc = subprocess.Popen(step, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True, bufsize=1, errors="replace")
    both: collections.deque[str] = collections.deque(maxlen=TAIL_LINES)
    last = {"out": "", "err": ""}
    lock = threading.Lock()

    def pump(src, dest, which: str) -> None:
        for line in src:
            dest.write(line)
            dest.flush()
            if line.strip():
                with lock:
                    both.append(line.rstrip())
                    last[which] = line.rstrip()

    assert proc.stdout is not None and proc.stderr is not None
    pumps = [threading.Thread(target=pump, args=(proc.stdout, sys.stdout, "out"), daemon=True),
             threading.Thread(target=pump, args=(proc.stderr, sys.stderr, "err"), daemon=True)]
    for t in pumps:
        t.start()
    proc.wait()
    for t in pumps:
        t.join()
    # The last non-empty stderr line, which for an uncaught exception is the
    # exception itself; stdout's when stderr said nothing. Bounded, because
    # run_outcome is read by a human in a guard's output and a 200-line
    # traceback there helps nobody.
    why = (last["err"] or last["out"])[:300]
    return proc.returncode, why, "\n".join(both)[-TAIL_CHARS:]


partial = []
soft_failed: list[str] = []
gate_red = False
for step in STEPS:
    script = Path(step[1]).name
    if gate_red and script in GATED:
        print(f"=== SKIPPED: {script} -- the coverage gate is red ===", flush=True)
        RUN.skip_step(script, "coverage gate red")
        continue
    print(f"=== RUNNING: {' '.join(step)} ===", flush=True)
    step_id = RUN.open_step(" ".join([script] + [a for a in step[2:] if not a.startswith("-")][:1]))
    # The step's own name plus its subcommand, because three of these steps are
    # the same script with different arguments and one mark for all three would
    # say nothing. `Path(step[1]).name` alone reported "python3" once already,
    # for the same reason, three lines further down.
    label = " ".join([Path(step[1]).name] + [a for a in step[2:]
                                             if not a.startswith("-")][:1])
    # Opened and committed BEFORE the step runs, into the corpus itself, so a
    # container that dies here leaves the store saying a step began writing to
    # it and never finished. That is the fact that used to exist only as an exit
    # code in a log Railway deletes with the container.
    with corpus_marks.mark(label, "railway_cron.py") as report:
        returncode, why, tail = run_step(step)
        matched = next(((name, rc) for name, rc in PARTIAL_OK.items()
                        if any(name in part for part in step)), None)
        tolerated = bool(matched) and returncode == matched[1]
        report(corpus_marks.OK if returncode == 0 else
               corpus_marks.PARTIAL if tolerated else corpus_marks.FAILED,
               f"rc={returncode}" + (f": {why}" if why and returncode else ""))
    detail = {}
    if script == "renew.py" and Path(RENEW_RESULTS).exists():
        import json  # noqa: PLC0415
        detail = {"sources": json.loads(Path(RENEW_RESULTS).read_text())}
    RUN.close_step(step_id, "ok" if returncode == 0 else "partial" if tolerated else "failed",
                   summary=(tail or why) if returncode else "", exit_code=returncode,
                   detail=detail)
    if returncode == 0:
        continue
    if script in SOFT:
        print(f"=== FAILED (recorded, continuing): {script} (rc={returncode}) ===", flush=True)
        soft_failed.append(script)
        gate_red = gate_red or script == "coverage_gate.py"
        continue
    if tolerated:
        print(f"=== PARTIAL: {' '.join(step)} (rc={returncode}) — "
              f"continuing with what published ===", flush=True)
        # Name the SCRIPT, not whatever happened to be second-from-last in the
        # argv. A two-element step reported "python3" as the partial, which is
        # a summary line that tells nobody which step half-worked.
        partial.append(matched[0])
        continue
    print(f"=== FAILED: {' '.join(step)} (rc={returncode}) ===", flush=True)
    # No guards on this path, deliberately. The pipeline stopped part-way, so
    # the corpus is half-built and a guard's verdict on it would be a true
    # statement about a state that never ships. The census still goes out
    # carrying the failure, and check_verdicts.ts then reports every guard as
    # STALE against it -- which is the accurate description of what happened.
    # `label`, not the script name: three steps here are the same script with
    # different subcommands, and "failed at classify_taxonomy.py" named all
    # three at once. Plus what it said, for the reason run_step explains.
    census(f"failed at {label} (rc={returncode})"
           + (f": {why}" if why else ""))
    if OWN_RUN:
        RUN.finish("failed", f"failed at {label} (rc={returncode})")
    sys.exit(returncode)

# Guards BEFORE the census, so the census stays the last thing written and keeps
# dating the run. A guard failure does not stop this: see GUARDS above.
failed_guards = guards()

# The census describes THE PIPELINE's outcome, and a failing guard is not a
# pipeline outcome. Folding one into the other would make check_corpus_census.ts
# report "some part of the corpus is not refreshed" about a run in which every
# source refreshed perfectly and a guard found something wrong with the result —
# a true alarm with a false description, which is how alarms get muted. The
# guard's own verdict already carries that claim, on its own channel.
census(f"partial: {', '.join(Path(p).name for p in partial)}" if partial else "ok")

partial += soft_failed
if OWN_RUN:
    RUN.finish("partial" if (partial or failed_guards) else "ok",
               f"{len(partial)} partial/failed-soft, guards failed: {', '.join(failed_guards) or 'none'}")
if partial or failed_guards:
    # Loud, and non-zero, so a scheduled run that half-worked or that ended with
    # a red guard is never read as a clean one -- but only AFTER every
    # downstream step, every guard and the census have had their turn.
    print(f"=== ALL STEPS RAN — {len(partial)} partial, "
          f"{len(failed_guards)} guard(s) failed: "
          f"{', '.join(failed_guards) or 'none'} ===", flush=True)
    sys.exit(3)
print("=== ALL STEPS COMPLETE ===", flush=True)
