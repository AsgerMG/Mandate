"""One entry point for keeping the corpus current.

Runs the downstream chain only when a source actually changed, and refuses to
publish a corpus that got worse. Everything it calls is already idempotent and
incremental; what was missing was something to pull the lever and something to
stop it when the result is wrong.

  python3 ETL/refresh.py --check     what changed, and what would run
  python3 ETL/refresh.py             run it
  python3 ETL/refresh.py --force     run even with no source change

Design notes worth keeping:

* The gate runs BEFORE the publish, not after. A regression that reaches
  Railway has already reached founders.
* Steps are ordered so nothing expensive happens before the cheap checks. The
  rebuild and the coverage gate cost nothing; embedding and extraction cost
  money, so they sit behind both.
* A BUILD step that fails stops the chain. Half a refresh is worse than none,
  because the corpus is then internally inconsistent and nothing says so.
* A GUARD that fails does not. See below — this file used to disagree with
  ETL/events/extract/railway_cron.py about that, and about the census.

── One policy, not two (workstream BK, 2026-08-08) ────────────────────────
This file and `railway_cron.py` are the repo's two pipeline entry points, and
they held OPPOSITE answers to the same two questions. That is not a style
difference: the census exists precisely so a local run and the weekly Railway
run leave the same kind of trace, and `check_corpus_census.ts` cannot tell them
apart. While the two disagreed, it could.

  Does a failing guard stop the run?
      railway_cron: NO, with the argument written out at length — a guard is a
      REPORT, and aborting on one skips the census, which is the only record of
      what the corpus contains. The run goes dark exactly when there is
      something to see.
      here, before today: YES, everything stopped.

  Is the census written when the run went badly?
      railway_cron: ALWAYS, carrying the outcome, and LAST. A census written
      only on success leaves the last good week's numbers standing as the
      newest record, and the guard downstream reads them and reports that all
      is well.
      here, before today: only on a clean run, and with `--run-outcome ok`
      HARD-CODED, so it could never say anything else.

`railway_cron.py` had the better argument and it wins on both. The cost of the
old policy is measurable, not theoretical: step 13 (`check_hydration_parity`)
is red on main, so steps 14-23 of this chain had not run — including the two
embed steps that clear the 954 unembedded gates, the guard that REPORTS the
954, and the census itself. A guard failing had been silently cancelling the
fix for the thing it was complaining about.

What did NOT change, deliberately:
* `coverage_gate.py` is still fatal. It is not a guard, it is a PUBLISH GATE:
  it runs before the export and the publish, and its whole job is to stop a
  worse corpus from shipping. Continuing past it would ship the regression,
  which is the one thing neither entry point may do.
* Every build step is still fatal, for the reason in the third bullet above.
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

_sys.path.insert(0, str(_Path(__file__).resolve().parent / "lib"))

import argparse  # noqa: E402
import subprocess  # noqa: E402
from typing import NamedTuple  # noqa: E402

from etl_env import ROOT  # noqa: E402
import source_state  # noqa: E402


class Step(NamedTuple):
    label: str
    argv: list[str]
    paid: bool = False
    #: A REPORT on what the steps above produced, not a producer itself. It is
    #: recorded and it makes the run's exit code non-zero, but it does not stop
    #: the chain — see the module docstring. A publish gate is NOT one of these.
    guard: bool = False


STEPS: list[Step] = [
    Step("rebuild instruments", ["python3", "ETL/events/load/populate_funding_instruments.py"]),
    Step("restore sector labels", ["python3", "ETL/events/transform/classify_taxonomy.py", "restore"]),
    # Must follow "rebuild instruments", not precede it: seed_inventory_gates
    # rewrites `requirement` on every run via ON CONFLICT DO UPDATE, so an
    # encoder that ran first would have its statutory sentence replaced by the
    # bare article label and nobody would see a failure.
    Step("encode article ceilings",     ["python3", "ETL/terms/encode_article_intensity.py", "run"]),
    # Where a notified scheme actually applies, from its registration. Must
    # follow "rebuild instruments" (which truncates and reloads the table) and
    # precede the coverage gate, so a regression in regional coverage stops the
    # run like any other.
    Step("encode registered regions",     ["python3", "ETL/terms/encode_registered_regions.py", "run"]),
    # Reports only, never quarantines. Region evidence is about the PROJECT's
    # location while the gate asks where the COMPANY is, so a handful of
    # outsiders is expected and deleting a correct filter would put a Paris
    # company back in front of a Normandy-only scheme.
    Step("audit region claims", ["python3", "ETL/terms/audit_region_claims.py"]),
    # After any triage, before the gate: a filter that should never have been
    # one can disqualify a founder silently.
    Step("apply gate_role overrides",     ["python3", "ETL/terms/apply_gate_role_overrides.py"]),
    # The same correction one column over: the line above stops a gate
    # DECIDING, this clears prose shown to a founder under "who may apply" that
    # states a closed list they cannot join, a cohort already chosen, or the
    # granting body's own name. Before the export and the publish below, so the
    # withdrawn sentence never reaches the snapshot -- and it drops the affected
    # `instrument_profiles` rows itself, because "embed instrument profiles"
    # below runs INCREMENTALLY and would otherwise skip the very ids whose text
    # just changed, leaving the retracted sentence ranking founders.
    Step("retract unpertinent eligibility text",     ["python3", "ETL/terms/retract_unpertinent_text.py", "--write"]),
    Step("coverage gate", ["python3", "ETL/terms/coverage_gate.py"]),
    Step("export snapshot", ["python3", "website/build/eligibility_export.py"]),
    Step("companies index", ["python3", "website/build/companies_index.py"]),
    # The theme index is a committed artifact derived from the exported
    # snapshot, and gate text is part of what it tokenises -- so any run that
    # changes a requirement leaves it stale, and a stale index makes an
    # instrument thematically invisible to the lexical ranker. `make refresh`
    # was regenerating it only via the Makefile's `eligibility` target, so a
    # refresh that touched gates published a corpus the ranker could not see.
    # check_theme_index.ts catches it, but only if someone runs `npm run check`.
    Step("rebuild theme index", ["npx", "tsx", "scripts/emit_theme_index.ts"]),
    Step("publish to Postgres", ["python3", "ETL/terms/migrate_to_postgres.py"]),
    # Immediately after the publish and BEFORE anything expensive: it is the
    # only check that can see the Postgres path (every other one runs NO_PG=1
    # against the JSON fallback), and it needs both stores in step, which is
    # exactly true here. It found four real defects the day it was written,
    # one of which -- award medians never reaching Postgres, so production
    # ranked on the mean -- had been wrong in production for days while every
    # test passed. Skips cleanly without DATABASE_URL.
    # guard=True: a REPORT on the publish above, which has already happened.
    # Stopping here does not unship anything -- it only cancels the embeds
    # below, the guard that reports on them, and the census. That is what it
    # did until 2026-08-08, and it is why 954 gates went unembedded for a week.
    Step("check both stores agree",
         ["npx", "tsx", "scripts/check_hydration_parity.ts"], guard=True),
    Step("embed instrument profiles", ["python3", "ETL/terms/build_instrument_profiles.py", "run"], paid=True),
    Step("embed eligibility", ["python3", "ETL/terms/embed_eligibility.py", "run"], paid=True),
    # Immediately after the two embed steps: they only process what is missing,
    # so they drift silently, and the failure is invisible -- the advisor can
    # state a fact it cannot retrieve. Guards the publish, not the build.
    Step("check indexes are fresh",
         ["python3", "ETL/terms/check_index_freshness.py"], guard=True),
    # ── The committed ranking artifacts ────────────────────────────────────
    # Four files that `shortlist.ts` and `regionPrior.ts` read AT REQUEST TIME
    # on the production path, cut from the corpus this chain has just rebuilt,
    # and — until 2026-08-08 — produced by nothing but a human remembering to
    # type five commands. Nothing regenerated them and nothing noticed when
    # they aged: on the day they were audited, `peerPrior` still named 16 funds
    # the corpus no longer contained.
    #
    # This is the same shape as "rebuild theme index" above and it belongs in
    # the same place for the same reason: an artifact derived from the corpus
    # is only safe while it is derived from THIS corpus, and the only cure for
    # a stale derived artifact is a path that re-derives it. `--write` on three
    # of them is the emitters' own report/persist switch, not a new flag.
    #
    # After the embeds, because the leak index is cut from `instrument_profiles`
    # in Postgres and would otherwise be built from a half-loaded table.
    Step("rebuild peer prior", ["python3", "ETL/terms/emit_peer_prior.py", "--write"]),
    Step("rebuild region prior", ["python3", "ETL/terms/emit_region_prior.py", "--write"]),
    Step("rebuild channel prior", ["python3", "ETL/terms/emit_channel_prior.py"]),
    Step("rebuild instrument objectives",
         ["python3", "ETL/terms/emit_instrument_objectives.py", "--write"]),
    # The offline mirrors of the Postgres profile index. Both are committed,
    # both were found ~70 instruments behind the live index on 2026-08-07, and
    # neither had a regeneration path: `check_corpus_currency.ts` printed the
    # command to fix them and nothing ever ran it. The leak index is the more
    # dangerous of the two because CI's `check_recall_leaks` ASSERTS against
    # it, so a stale copy reports green over the profiles it does not hold.
    Step("rebuild profile leak index", ["python3", "ETL/terms/emit_profile_leak_index.py"]),
    Step("rebuild semantic cache", ["npx", "tsx", "scripts/emit_semantic_cache.ts"], paid=True),
    Step("persist sector labels", ["python3", "ETL/events/transform/classify_taxonomy.py", "persist"]),
    # The site's own JSON (leaderboard, country map, synthesis, taxonomy) is
    # derived from db.sqlite and was NOT regenerated by this pipeline, so any
    # refresh that changed the corpus left it stale in the repo. It surfaced the
    # hard way: renaming 121 instruments changed instrument_leaderboard.json and
    # nothing here noticed. `npm run build` catches it via its prebuild check --
    # but only locally, because db.sqlite is gitignored and the check skips
    # itself on Vercel, so a stale file deploys silently.
    # Policy signals -> the funds they bear on, then the digest that exports
    # them. Both read signals.sqlite (news cadence) but depend on instrument ids
    # from db.sqlite, so they run after the corpus is rebuilt and before the
    # site data that ships them.
    Step("link policy signals to funds",     ["python3", "ETL/intelligence/transform/link_programme_mentions.py", "--write"]),
    Step("rebuild signals digest", ["python3", "website/build/signals_digest.py"]),
    Step("rebuild site data", ["python3", "website/build/build_site_data.py"]),
    Step("coverage report", ["python3", "ETL/terms/coverage_report.py", "--md", "project-mgmt/coverage.md"]),
    Step("coverage dashboard", ["python3", "ETL/terms/coverage_dashboard.py", "--out", "project-mgmt/coverage.html"]),
]

# NOT a step. The census is the record of what this corpus contains, and it is
# what `check_corpus_census.ts` compares the committed artifacts against.
#
# It used to sit at the end of STEPS with `--run-outcome ok` hard-coded, which
# meant it could say only one thing and could say it only about a run in which
# nothing had gone wrong -- so after a failure the previous week's census stayed
# the newest record and the guard downstream read it as current. That is the
# defect railway_cron.py's `census()` was written to avoid, and this is now the
# same arrangement: written LAST, written WHATEVER happened, and carrying the
# outcome so a bad run is legible as a bad run rather than as an old good one.
CENSUS = ["python3", "ETL/events/load/publish_corpus_census.py", "--run-outcome"]


def census(outcome: str) -> None:
    """Record what this run left behind, and how the run itself went.

    Never the reason the refresh fails: the census is the reporting channel,
    and a reporting failure must not mask or worsen the thing it is reporting
    on. Loud here; `check_corpus_census.ts` fails on a census that is missing
    or stale.
    """
    print(f"\n-- record the census ({outcome})")
    rc = subprocess.run(CENSUS + [outcome], cwd=ROOT).returncode
    if rc != 0:
        print(f"CENSUS FAILED (rc={rc}) — the website cannot see this corpus; "
              f"run it by hand.")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report and exit")
    ap.add_argument("--force", action="store_true", help="run with no source change")
    ap.add_argument("--skip-paid", action="store_true",
                    help="skip the steps that spend API credits")
    args = ap.parse_args()

    moved, added, removed = source_state.changed()
    if moved or added or removed:
        for label, names in (("changed", moved), ("new", added), ("gone", removed)):
            if names:
                print(f"{label}: {', '.join(sorted(names)[:8])}"
                      f"{' ...' if len(names) > 8 else ''}")
    else:
        print("no source changed")

    if args.check:
        if not (moved or added or removed):
            print("nothing would run.")
            return
        for s in STEPS:
            print(f"  would run: {s.label}"
                  f"{'  ($)' if s.paid else ''}{'  [guard: reports, does not stop]' if s.guard else ''}")
        print("  would run: record the census  [always, carrying the outcome]")
        return

    if not (moved or added or removed or args.force):
        print("nothing to do. --force to run anyway.")
        return

    failed_guards: list[str] = []
    for step in STEPS:
        if step.paid and args.skip_paid:
            print(f"\n-- skipping {step.label} (--skip-paid)")
            continue
        print(f"\n-- {step.label}")
        # The Node checks resolve their corpus path from cwd (corpus.ts reads
        # process.cwd()/public/data), so they run from the frontend.
        cwd = ROOT / "website" / "frontend" if step.argv[0] == "npx" else ROOT
        r = subprocess.run(step.argv, cwd=cwd)
        if r.returncode == 0:
            continue
        if step.guard:
            # Recorded, loud, and it will make this run exit non-zero -- but it
            # does not cancel the steps below, which include the two embeds that
            # FIX what the guard above is complaining about and the census that
            # is the only record this run happened at all. See the docstring.
            print(f"\nGUARD FAILED: '{step.label}' (exit {r.returncode}) — "
                  f"recorded, not fatal; the rest of the refresh still runs.")
            failed_guards.append(step.label)
            continue
        # A build step or the coverage gate. Both are fatal: the corpus is now
        # half-built, or a corpus that got worse was stopped before publishing.
        print(f"\nSTOPPED at '{step.label}' (exit {r.returncode}). "
              f"Nothing after this step ran.")
        # The census still goes out, carrying the failure, so the newest record
        # describes THIS run rather than the last good one.
        census(f"failed at {step.label} (rc={r.returncode})")
        raise SystemExit(r.returncode)

    census(f"partial: {', '.join(failed_guards)}" if failed_guards else "ok")

    if failed_guards:
        # Source hashes are deliberately NOT recorded: a guard went red on this
        # corpus, and recording the hashes would make the next `refresh.py`
        # report "no source changed" and do nothing, so the red would never be
        # re-examined by the path that found it.
        print(f"\nrefresh ran to the end; {len(failed_guards)} guard(s) FAILED: "
              f"{', '.join(failed_guards)}. Source hashes NOT recorded, so the "
              f"next run re-examines this corpus.")
        raise SystemExit(3)

    source_state.record()
    print("\nrefresh complete; source hashes recorded.")


if __name__ == "__main__":
    main()
