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

── Why a failure no longer stops the chain, and what it stops instead ───────

This file used to run 23 steps serially and `raise SystemExit` on the first
non-zero. That is the failure class this repo keeps re-discovering: on
2026-08-08 step 13 (`check_hydration_parity`) had been red for weeks, so steps
14 to 23 had NEVER run in the automated pipeline. Among them were the two embed
steps -- the FIX for the drift the failing check was complaining about -- the
freshness check that would have reported the drift, and the corpus census,
which is the only record of what the week's corpus contains. A check was
blocking its own remedy and the alarm underneath it, and the pipeline went dark
at exactly the moment there was something to see. 954 gates sat unembedded and
nothing said so.

`npm run check` fixed the same shape by running everything and reporting all
failures (web/scripts/run_checks.mjs). A data pipeline cannot copy
that wholesale: publishing a corpus that failed its coverage gate is worse than
not publishing, so "run everything regardless" would be a different bug. The
distinction is not per-step temperament, it is DEPENDENCY, and it is declared:

  role="build"   the step writes a store or an artifact that a LATER step
                 reads. Its failure leaves that input half-written, so
                 everything downstream of it is skipped -- not run and failed,
                 SKIPPED, because a step fed by a half-written input produces a
                 confidently wrong answer rather than an error.
  role="gate"    the step decides whether this corpus may be published at all.
                 Same mechanics; every publishing step declares it in `needs`.
  role="report"  the step reads and records. It changes nothing, so nothing can
                 depend on it, so its failure skips NOTHING. It still makes the
                 run exit non-zero.

`needs` names the steps whose OUTPUT this step consumes. Failure and skip
propagate through it transitively. That is what "this step invalidates what
follows" means here, written down once per step instead of being implied by
position in a list -- and it is why `check_hydration_parity` can now be red
without taking the embeds, the freshness check and the census with it, while
`coverage_gate` still stops every publish exactly as before.

Exit codes follow renew.py, which already models this:
  0  every step ran
  3  only tolerated partials -- the run moved the corpus forward
  1  a step failed, or was skipped because one it depends on did

── The census, and the guard policy, are now the same in both pipelines ─────

`ETL/events/extract/railway_cron.py` and this file are the two pipelines that
refresh the corpus, and they held OPPOSITE policies on the same two questions:
the cron writes the census whatever happened and never lets a guard stop the
run; this file wrote the census only on a fully clean run, with `--run-outcome
ok` HARD-CODED so it could never say anything else, and let any guard stop
everything. Two pipelines disagreeing about when the record of the corpus gets
written is how a stale census ends up standing as the newest one after a bad
week -- and `check_corpus_census.ts` cannot tell the two runs apart, so while
they disagreed it could. Both now do what the cron did, for the cron's reasons:
the census is written LAST, ALWAYS, carrying this run's true outcome, and a
report-role step is never the reason a later step does not run.

── Where this file came from (workstreams BH, BK, BM) ──────────────────────
Three workstreams restructured this chain within a day of each other and this
is the reconciliation, not a fourth rewrite:

* BH added `repair applicant identity` -- the step that stopped five funds being
  recommended to founders who cannot apply to them, two of them Latvian schemes
  where the BANK submits and not the company. It is fatal, and its reasoning is
  kept verbatim on the step below.
* BK moved the census and the guard policy to railway_cron.py's, and added the
  six emitters for the committed ranking artifacts that production reads at
  REQUEST time and that nothing regenerated -- `peerPrior` was found naming 16
  funds the corpus no longer held.
* BM (here) replaced "fatal / not fatal" with `role` + `needs`, because the two
  categories were not the same question: `repair applicant identity` and
  `coverage_gate` stop what follows because what follows READS them, while
  `check_hydration_parity` stopped what followed for no reason at all.
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

_sys.path.insert(0, str(_Path(__file__).resolve().parent / "lib"))

import argparse  # noqa: E402
import subprocess  # noqa: E402
from dataclasses import dataclass, field  # noqa: E402

from etl_env import ROOT, WEB  # noqa: E402
import corpus_marks  # noqa: E402
import source_state  # noqa: E402


# Minted once, exported into the environment, and inherited by every subprocess
# below — including the mark check, which uses it to tell this run's own
# in-flight steps from the ones the store arrived carrying. See
# ETL/lib/corpus_marks.py.
RUN_ID = corpus_marks.run_id()
RUNNER = "refresh.py"


@dataclass(frozen=True)
class Step:
    key: str
    label: str
    argv: list[str]
    role: str                       # "build" | "gate" | "report"
    needs: tuple[str, ...] = ()
    paid: bool = False
    tolerate: tuple[int, ...] = ()  # exit codes that mean "partial, continue"
    why: str = ""


# Every step, with the two things that used to live only in prose: what its
# failure invalidates (`role` + `needs`) and what it costs (`paid`).
STEPS: list[Step] = [
    Step("instruments", "rebuild instruments",
         ["python3", "ETL/events/load/populate_funding_instruments.py"],
         role="build",
         why="Truncates and reloads funding_instruments. Everything below reads it."),
    Step("sectors_restore", "restore sector labels",
         ["python3", "ETL/events/transform/classify_taxonomy.py", "restore"],
         role="build", needs=("instruments",),
         why="Puts the labels back on the rows the rebuild above just replaced."),
    # ── The rows the truncate above deletes and does not put back ──────────
    # `funding_instruments` is not owned by one script. The step above rebuilds
    # it from awards; `load_bdns_open_calls.py` adds Spain's open convocatorias,
    # which have no awards at all and therefore cannot be re-derived from them.
    # That loader runs in railway_cron.py (inside refresh_open_calls.py) and had
    # never run here -- so THIS chain deleted 88 funds on every run and then its
    # own coverage gate, five steps later, correctly refused to publish the
    # result. Measured 2026-08-08: 1,088 instruments in, 998 out, gate FAIL
    # "933 instruments, down from a high of 1021".
    #
    # That is the second reason this chain has never completed, under the one
    # everybody was looking at, and it is the same defect as the census and the
    # guard policy: two pipelines, one table, different beliefs about who owns
    # it. The loader, not the harvest, because a refresh must be able to put the
    # rows back from what is already on disk; refresh_open_calls.py stays where
    # it is and keeps the harvest weekly.
    #
    # ── 2026-08-09: the deletion is fixed at source, and this step stays ────
    # `populate_funding_instruments.externally_owned` now spares every row this
    # pass did not derive, so the truncate no longer removes these 88 and this
    # step no longer restores anything. It stays because it is the loader, and
    # a refresh should reload the register from disk.
    #
    # Worth recording WHY the restore was never sufficient on its own: it puts
    # back the instrument ROW and its `eligibility_text`, and nothing puts back
    # the 596 gates cut from that text by `encode_scheme_text_gates.py`, which
    # this chain does not run at all. So every run between 2026-08-08 and the
    # fix looked whole to the coverage gate while having silently discarded a
    # layer of paid LLM encoding. A workaround downstream of a delete can
    # restore what it knows about; it cannot know about the rest.
    Step("open_calls", "reload open calls",
         ["python3", "ETL/terms/load_bdns_open_calls.py", "--write"],
         role="build", needs=("instruments",),
         why="Reloads the open-call register from disk. No longer load-bearing for "
             "the rebuild's truncate, which now spares rows it does not own."),
    # Must follow "rebuild instruments", not precede it: seed_inventory_gates
    # rewrites `requirement` on every run via ON CONFLICT DO UPDATE, so an
    # encoder that ran first would have its statutory sentence replaced by the
    # bare article label and nobody would see a failure.
    Step("article_ceilings", "encode article ceilings",
         ["python3", "ETL/terms/encode_article_intensity.py", "run"],
         role="build", needs=("instruments",),
         why="Writes gate requirements the snapshot and the publish below export."),
    # Where a notified scheme actually applies, from its registration. Must
    # follow "rebuild instruments" (which truncates and reloads the table) and
    # precede the coverage gate, so a regression in regional coverage stops the
    # run like any other.
    Step("regions_encode", "encode registered regions",
         ["python3", "ETL/terms/encode_registered_regions.py", "run"],
         role="build", needs=("instruments",),
         why="Writes region gates. A regression here must reach the coverage gate."),
    # Reports only, never quarantines. Region evidence is about the PROJECT's
    # location while the gate asks where the COMPANY is, so a handful of
    # outsiders is expected and deleting a correct filter would put a Paris
    # company back in front of a Normandy-only scheme.
    Step("region_audit", "audit region claims",
         ["python3", "ETL/terms/audit_region_claims.py"],
         role="report", needs=("regions_encode",),
         why="Says what the region encoding looks like. Writes nothing; nothing reads it."),
    # After any triage, before the gate: a filter that should never have been
    # one can disqualify a founder silently.
    Step("gate_roles", "apply gate_role overrides",
         ["python3", "ETL/terms/apply_gate_role_overrides.py"],
         role="build", needs=("instruments",),
         why="Decides which gates DECIDE. The export below ships gate_role."),
    # The same correction one column over: the line above stops a gate
    # DECIDING, this clears prose shown to a founder under "who may apply" that
    # states a closed list they cannot join, a cohort already chosen, or the
    # granting body's own name. Before the export and the publish below, so the
    # withdrawn sentence never reaches the snapshot -- and it drops the affected
    # `instrument_profiles` rows itself, because "embed instrument profiles"
    # below runs INCREMENTALLY and would otherwise skip the very ids whose text
    # just changed, leaving the retracted sentence ranking founders.
    Step("retract_text", "retract unpertinent eligibility text",
         ["python3", "ETL/terms/retract_unpertinent_text.py", "--write"],
         role="build", needs=("gate_roles",),
         why="Withdraws founder-facing prose, and drops the profile rows the "
             "incremental embed below would otherwise skip."),
    # A third axis on the same column, and the only one whose failure is
    # invisible to the founder until the end. The line above asks whether the
    # text is the right KIND of statement; this asks WHOSE test it states. A
    # two-tier scheme passes the first honestly -- "the programme supports
    # SMEs" names a checkable population and discriminates between readers --
    # and routes a founder to a fund only their bank, their cluster
    # organisation or a registered coordinator may apply to.
    #
    # It STOPS the run if a condemned row has no repair on file: the answer is
    # not in the repo, it is on the funder's page, and continuing would publish
    # the text to founders for another week. Under the model above that is not
    # a special case any more -- it is a build step, and the publish steps
    # depend on it.
    Step("applicant_identity", "repair applicant identity",
         ["python3", "ETL/terms/repair_applicant_identity.py", "--write"],
         role="build", needs=("retract_text",),
         why="Same column, same reasons; a condemned row with no repair on file "
             "must not reach the snapshot."),
    # ── Was this corpus FINISHED? ─────────────────────────────────────────
    # A different question from the one below, and the reason this step exists
    # at all: `coverage_gate` passed censuses #7, #8 and #9, every one of which
    # describes a run that failed. A half-refreshed corpus answers "does it know
    # less than it did" perfectly well.
    #
    # It reads the marks the RUNNERS leave in the store, which is what makes it
    # work across the copy: `make republish` pulls the volume and merges it here,
    # and until now nothing came with those rows to say the run that produced
    # them stopped part way. Its own run is excluded by id, so it judges the
    # state the store ARRIVED in and not refresh.py's own progress through it.
    Step("corpus_marks", "unfinished steps",
         ["python3", "ETL/schema/check_corpus_marks.py", "--ignore-run", RUN_ID],
         role="gate",
         why="Refuses a corpus whose last run opened a step and never closed it. "
             "Named in coverage_gate's `needs`, so a red mark stops exactly what "
             "a red gate stops and nothing else."),
    Step("coverage_gate", "coverage gate",
         ["python3", "ETL/terms/coverage_gate.py"],
         role="gate",
         needs=("instruments", "open_calls", "article_ceilings", "regions_encode",
                "gate_roles", "retract_text", "applicant_identity",
                "corpus_marks"),
         why="THE decision to publish. Everything that publishes names it in `needs`, "
             "so a red gate still stops the snapshot, the derived artifacts and the "
             "embeddings -- and only those."),
    # ── WHAT THE GATE CAN NO LONGER STOP (2026-11-05) ─────────────────────
    # While the corpus was SQLite the steps above wrote a working copy, and
    # this gate stood between it and Postgres, the store founders read. With
    # one store the steps above write the served tables directly, so a corpus
    # that fails this gate has ALREADY been served by the time it fails. What
    # the gate still stops is everything derived from the corpus (the snapshot,
    # the embeddings, the priors, the census-facing artefacts). Restoring
    # "a worse corpus is never served" needs the build steps to write in one
    # transaction the gate commits, or into a staging schema it promotes --
    # an owner's decision, recorded rather than silently assumed.
    Step("snapshot", "export snapshot",
         ["python3", "website/build/eligibility_export.py"],
         role="build", needs=("coverage_gate",),
         why="instrument_terms.json: the fallback corpus and the theme index's input."),
    Step("companies_index", "companies index",
         ["python3", "website/build/companies_index.py"],
         role="build", needs=("coverage_gate",),
         why="A shipped artifact nothing else in this chain reads."),
    # The theme index is a committed artifact derived from the exported
    # snapshot, and gate text is part of what it tokenises -- so any run that
    # changes a requirement leaves it stale, and a stale index makes an
    # instrument thematically invisible to the lexical ranker. `make refresh`
    # was regenerating it only via the Makefile's `eligibility` target, so a
    # refresh that touched gates published a corpus the ranker could not see.
    # check_theme_index.ts catches it, but only if someone runs `npm run check`.
    Step("theme_index", "rebuild theme index",
         ["npx", "tsx", "scripts/emit_theme_index.ts"],
         role="build", needs=("snapshot",),
         why="Derived from the snapshot; stale means an instrument the lexical "
             "ranker cannot see."),
    # "publish to Postgres" (migrate_to_postgres.py) WAS HERE. It truncated the
    # five served tables and reloaded them from SQLite. Since 2026-11-05 there
    # is one store and every step above writes it directly, so there is nothing
    # to copy; the steps that depended on the publish now depend on the gate
    # that used to guard it. See the note at `coverage_gate`.
    # Immediately after the publish and BEFORE anything expensive: it is the
    # only check that can see the Postgres path (every other one runs NO_PG=1
    # against the JSON fallback), and it needs both stores in step, which is
    # exactly true here. It found four real defects the day it was written,
    # one of which -- award medians never reaching Postgres, so production
    # ranked on the mean -- had been wrong in production for days while every
    # test passed. Skips cleanly without DATABASE_URL.
    #
    # role="report" is the whole point of this rewrite. It reads both stores and
    # writes neither, so nothing downstream can be invalidated by its verdict --
    # and when it was allowed to stop the chain it stopped the embeds that fix
    # the drift it reports, the freshness check that measures the drift, and the
    # census that would have told anyone. It still publishes a verdict and still
    # makes this run exit non-zero.
    Step("parity", "check both stores agree",
         ["npx", "tsx", "scripts/check_hydration_parity.ts"],
         role="report", needs=("snapshot", "coverage_gate"),
         why="Diffs the two stores it has just seen written. Reads only."),
    # The offline cut of the regions each scheme's OWN notification declares.
    # `catchment_regions` reaches no export -- instrument_terms.json has never
    # carried it -- so without this step the one guard that can prove a
    # territorial screen does not remove a fund from a company that WON it
    # would need DATABASE_URL, and a guard that needs a credential is a guard
    # that skips on CI and in every pull request. `needs=("coverage_gate",)` because
    # it reads the column from the store that publish has just filled.
    Step("official_catchments", "cut declared catchments offline",
         ["npx", "tsx", "scripts/emit_official_catchments.ts"],
         role="build", needs=("coverage_gate",),
         why="What check_winner_not_blocked.ts reads, with no credentials. "
             "Stale means the blocked-winner ratchet is judging a corpus that "
             "has moved."),
    Step("embed_profiles", "embed instrument profiles",
         ["python3", "ETL/terms/build_instrument_profiles.py", "run"],
         role="build", needs=("coverage_gate",), paid=True,
         why="What each fund FUNDS. Incremental, so a skipped run drifts silently -- "
             "which is why the freshness check below does not depend on it."),
    Step("embed_gates", "embed eligibility",
         ["python3", "ETL/terms/embed_eligibility.py", "run"],
         role="build", needs=("coverage_gate",), paid=True,
         why="What each fund DEMANDS. Same shape as the line above."),
    # Immediately after the two embed steps: they only process what is missing,
    # so they drift silently, and the failure is invisible -- the advisor can
    # state a fact it cannot retrieve. Guards the publish, not the build.
    #
    # It deliberately declares NO `needs`. It is the alarm ON the two steps
    # above, so an embed that fell over is precisely when it must run: it reads
    # the indexes as they actually are and says how far behind they sit.
    # Run THROUGH guard_verdicts.py rather than directly, so the alarm leaves a
    # record: `index_freshness` is a registered guard, and check_verdicts.ts
    # asserts on the published verdict with no credentials. Called directly, the
    # number lived only in whatever terminal happened to be open.
    Step("index_freshness", "check indexes are fresh",
         ["python3", "ETL/lib/guard_verdicts.py", "run", "index_freshness"],
         role="report",
         why="The alarm on the two embeds. Depends on nothing on purpose -- a "
             "failed embed is exactly when its number matters."),
    # ── The committed ranking artifacts (workstream BK) ────────────────────
    # Four files that `shortlist.ts` and `regionPrior.ts` read AT REQUEST TIME
    # on the production path, cut from the corpus this chain has just rebuilt,
    # and -- until 2026-08-08 -- produced by nothing but a human remembering to
    # type five commands. Nothing regenerated them and nothing noticed when
    # they aged: on the day they were audited, `peerPrior` still named 16 funds
    # the corpus no longer contained.
    #
    # This is the same shape as "rebuild theme index" above and it belongs in
    # the same place for the same reason: an artifact derived from the corpus
    # is only safe while it is derived from THIS corpus, and the only cure for
    # a stale derived artifact is a path that re-derives it. `--write` on three
    # of them is the emitters' own report/persist switch, not a new flag.
    Step("peer_prior", "rebuild peer prior",
         ["python3", "ETL/terms/emit_peer_prior.py", "--write"],
         role="build", needs=("coverage_gate",),
         why="Read on the founder's path. Stale means peer precedence off, not degraded."),
    Step("region_prior", "rebuild region prior",
         ["python3", "ETL/terms/emit_region_prior.py", "--write"],
         role="build", needs=("coverage_gate",),
         why="As above."),
    Step("channel_prior", "rebuild channel prior",
         ["python3", "ETL/terms/emit_channel_prior.py"],
         role="build", needs=("coverage_gate",),
         why="As above."),
    Step("instrument_objectives", "rebuild instrument objectives",
         ["python3", "ETL/terms/emit_instrument_objectives.py", "--write"],
         role="build", needs=("coverage_gate",),
         why="As above."),
    # The offline mirrors of the Postgres profile index. Both are committed,
    # both were found ~70 instruments behind the live index on 2026-08-07, and
    # neither had a regeneration path: `check_corpus_currency.ts` printed the
    # command to fix them and nothing ever ran it. The leak index is the more
    # dangerous of the two because CI's `check_recall_leaks` ASSERTS against
    # it, so a stale copy reports green over the profiles it does not hold.
    #
    # Both are cut from `instrument_profiles` in Postgres, so both name the
    # embed that fills it in `needs`: built from a half-loaded table they would
    # be worse than stale, and under the model above that is not a comment, it
    # is what stops them running.
    Step("profile_leak_index", "rebuild profile leak index",
         ["python3", "ETL/terms/emit_profile_leak_index.py"],
         role="build", needs=("embed_profiles",),
         why="What check_recall_leaks.ts asserts against, with no credentials."),
    Step("semantic_cache", "rebuild semantic cache",
         ["npx", "tsx", "scripts/emit_semantic_cache.ts"],
         role="build", needs=("embed_profiles",), paid=True,
         why="The offline mirror of the live vector index; without it the whole "
             "check suite validates the lexical fallback."),
    Step("sectors_persist", "persist sector labels",
         ["python3", "ETL/events/transform/classify_taxonomy.py", "persist"],
         role="build", needs=("instruments",),
         why="Writes the labels build_site_data.py below reads."),
    # Policy signals -> the funds they bear on, then the digest that exports
    # them. Both read signals.sqlite (news cadence) but depend on instrument ids
    # from db.sqlite, so they run after the corpus is rebuilt and before the
    # site data that ships them.
    Step("signal_links", "link policy signals to funds",
         ["python3", "ETL/intelligence/transform/link_programme_mentions.py", "--write"],
         role="build", needs=("instruments",),
         why="Writes the links the digest below exports."),
    Step("signals_digest", "rebuild signals digest",
         ["python3", "website/build/signals_digest.py"],
         role="build", needs=("signal_links",),
         why="Exports those links. A half-written link table must not be exported."),
    # The site's own JSON (leaderboard, country map, synthesis, taxonomy) is
    # derived from db.sqlite and was NOT regenerated by this pipeline, so any
    # refresh that changed the corpus left it stale in the repo. It surfaced the
    # hard way: renaming 121 instruments changed instrument_leaderboard.json and
    # nothing here noticed. `npm run build` catches it via its prebuild check --
    # but only locally, because db.sqlite is gitignored and the check skips
    # itself on Vercel, so a stale file deploys silently.
    Step("site_data", "rebuild site data",
         ["python3", "website/build/build_site_data.py"],
         role="build", needs=("instruments", "sectors_persist"),
         why="The site's committed JSON. Reads the labels persisted above."),
    Step("coverage_report", "coverage report",
         ["python3", "ETL/terms/coverage_report.py", "--md", "project-mgmt/coverage.md"],
         role="report",
         why="Writes a document for humans. Nothing in any pipeline reads it."),
    Step("coverage_dashboard", "coverage dashboard",
         ["python3", "ETL/terms/coverage_dashboard.py", "--out", "project-mgmt/coverage.html"],
         role="report",
         why="As above."),
]

# LAST, and outside STEPS, because it is not a step: it is the record of what
# the run left behind and it must be written WHATEVER happened -- see the module
# docstring, and railway_cron.py::census, which this now matches. A census
# written only on success leaves the last good week's numbers standing as the
# newest record after a failure, and check_corpus_census.ts reads them and
# reports that all is well.
CENSUS = ["python3", "ETL/events/load/publish_corpus_census.py"]


def _cwd_for(argv: list[str]) -> _Path:
    # The Node checks resolve their corpus path from cwd (corpus.ts reads
    # process.cwd()/public/data), so they run from the frontend.
    return WEB if argv[0] == "npx" else ROOT


@dataclass
class Outcome:
    failed: list[str] = field(default_factory=list)
    skipped: list[tuple[str, str]] = field(default_factory=list)
    partial: list[str] = field(default_factory=list)
    ran: list[str] = field(default_factory=list)

    def summary(self) -> str:
        """The census's `run_outcome`, in the vocabulary publish_corpus_census.py
        already understands: it treats a value starting `failed` or `partial` as
        a degraded run."""
        if self.failed or self.skipped:
            first = self.failed[0] if self.failed else self.skipped[0][0]
            tail = (f"; {len(self.skipped)} skipped" if self.skipped else "")
            return (f"failed at {first}"
                    + (f" (+{len(self.failed) - 1} more)" if len(self.failed) > 1 else "")
                    + tail)
        if self.partial:
            return "partial: " + ", ".join(self.partial)
        return "ok"


def census(outcome: str) -> None:
    print(f"\n-- record the census ({outcome})")
    rc = subprocess.run(CENSUS + ["--run-outcome", outcome], cwd=ROOT).returncode
    if rc != 0:
        # Never the reason the run fails: the census is the reporting channel,
        # and a reporting failure must not mask or worsen the thing it reports
        # on. Loud here; check_corpus_census.ts fails on a census that is
        # missing or stale.
        print(f"CENSUS FAILED (rc={rc}) -- the website cannot see this corpus; "
              f"run it by hand: {' '.join(CENSUS)}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report and exit")
    ap.add_argument("--force", action="store_true", help="run with no source change")
    ap.add_argument("--skip-paid", action="store_true",
                    help="skip the steps that spend API credits")
    ap.add_argument("--bail", action="store_true",
                    help="stop at the first failure (tight edit loop; NOT the default, "
                         "for the reasons in this file's docstring)")
    args = ap.parse_args()

    moved, added, removed = source_state.changed()
    # ── Is this the real data directory? ──────────────────────────────────
    # source_state hashes `data/raw`, and a directory that is not there reads
    # exactly like every source emptying at once. The first step below then
    # TRUNCATES funding_instruments, so getting this wrong is not a bad report,
    # it is a destroyed corpus -- and the shared `data/db.sqlite` is symlinked
    # into every agent worktree, where `data/raw` is not.
    #
    # A threshold rather than a list, for renew.py's reason: some sources really
    # do go away, but most of them going away in one run is not the internet
    # having a bad day, it is the wrong working directory.
    known = len(source_state.previous())
    if known and len(removed) * 2 > known:
        raise SystemExit(
            f"REFUSING TO RUN: {len(removed)} of {known} known sources are absent from "
            f"{source_state.RAW}. That is most of them, so this is the wrong data "
            f"directory rather than a corpus that emptied -- and the first step below "
            f"truncates funding_instruments in {source_state.STATE.parent / 'db.sqlite'}, "
            f"which every worktree shares. Run this from the repository root.")
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
            needs = f"  needs {', '.join(s.needs)}" if s.needs else ""
            print(f"  would run: [{s.role:6s}] {s.label}{'  ($)' if s.paid else ''}{needs}")
        print(f"  would run: [final ] record the census (always)")
        return

    if not (moved or added or removed or args.force):
        print("nothing to do. --force to run anyway.")
        return

    out = Outcome()
    broken: set[str] = set()   # steps that failed, or were skipped because one did

    for s in STEPS:
        if s.paid and args.skip_paid:
            print(f"\n-- skipping {s.label} (--skip-paid)")
            # A step that did not run cannot have produced its output, so the
            # steps that read it are skipped too. --skip-paid used to silently
            # leave the freshness check reporting on indexes nobody rebuilt.
            broken.add(s.key)
            continue

        blockers = [n for n in s.needs if n in broken]
        if blockers:
            reason = ", ".join(blockers)
            print(f"\n-- SKIPPED {s.label} -- depends on {reason}, which did not "
                  f"produce its output. Running it would read a half-written input.")
            out.skipped.append((s.label, reason))
            broken.add(s.key)
            continue

        print(f"\n-- {s.label}")
        # The mark is opened and COMMITTED before the step runs, so a run that
        # is killed here leaves the store saying a step began writing to it and
        # never finished. A `report` never reached — an exception, an OOM, a
        # Railway redeploy — is the open mark, and that is the design.
        with corpus_marks.mark(s.label, RUNNER) as report:
            rc = subprocess.run(s.argv, cwd=_cwd_for(s.argv)).returncode
            report(corpus_marks.OK if rc == 0 else
                   corpus_marks.PARTIAL if rc in s.tolerate else
                   corpus_marks.FAILED, f"exit {rc}")
        if rc == 0:
            out.ran.append(s.label)
            continue
        if rc in s.tolerate:
            print(f"PARTIAL: '{s.label}' (exit {rc}) -- continuing with what it did.")
            out.partial.append(s.label)
            out.ran.append(s.label)
            continue

        out.failed.append(s.label)
        if s.role == "report":
            # It changed nothing, so nothing downstream is invalid. It is red,
            # this run will exit non-zero, and every step after it still runs.
            print(f"FAILED (report only): '{s.label}' (exit {rc}). It writes nothing, "
                  f"so nothing below depends on it and the chain continues.")
        else:
            broken.add(s.key)
            print(f"FAILED: '{s.label}' (exit {rc}). Steps that read its output "
                  f"will be skipped; the rest of the chain still runs.")
        if args.bail:
            print("--bail: stopping here.")
            break

    # ALWAYS, and last.
    census(out.summary())

    print("\n-- summary")
    for s in STEPS:
        mark = ("ok  " if s.label in out.ran and s.label not in out.partial else
                "PART" if s.label in out.partial else
                "FAIL" if s.label in out.failed else
                "skip" if any(lbl == s.label for lbl, _ in out.skipped) else
                "----")
        print(f"  {mark}  [{s.role:6s}] {s.label}")

    if out.failed or out.skipped:
        print(f"\n{len(out.failed)} step(s) failed, {len(out.skipped)} skipped as a "
              f"consequence. Every step that could still run, ran -- this is the "
              f"whole list, not the first item on it.")
        for lbl in out.failed:
            print(f"  FAILED : {lbl}")
        for lbl, why in out.skipped:
            print(f"  skipped: {lbl}  (needs {why})")
        # Source hashes deliberately NOT recorded. Something went red on this
        # corpus, and recording the hashes would make the next `refresh.py`
        # report "no source changed" and do nothing -- so the red would never be
        # re-examined by the path that found it. (workstream BK)
        print("Source hashes NOT recorded, so the next run re-examines this corpus.")
        raise SystemExit(1)

    source_state.record()
    if out.partial:
        print(f"\nrefresh complete with {len(out.partial)} partial step(s): "
              f"{', '.join(out.partial)}. Source hashes recorded.")
        raise SystemExit(3)
    print("\nrefresh complete; source hashes recorded.")


if __name__ == "__main__":
    main()
