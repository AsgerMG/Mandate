"""No corpus with an unresolved step may be published.

── The property ───────────────────────────────────────────────────────────
    A STORE CARRIES THE OUTCOME OF THE LAST RUN OF EVERY PIPELINE STEP THAT
    WRITES TO IT. A step is UNRESOLVED when it was opened and never closed, or
    closed with an outcome other than 'ok'.

This asserts it. It enumerates nothing — no list of steps, no list of scripts,
no names of sources, funds, countries or sectors. It asks the store what it
remembers, so a step written next year is covered the moment the runner wraps
it, and a step somebody forgets to wrap is caught by the census's own
`run_outcome` instead. There is no register here to fall out of date.

── Where it runs, and why not in CI ───────────────────────────────────────
It reads the corpus (schema `capital` of the Mandate Postgres), and CI holds no
credentials for it. A check that reads nothing from CI returns 0, which is the
failure this repo found in `check_aggregate_independence.py` — green on every
run it ever had. So it runs where the credentials are: as a step of
`ETL/refresh.py` before the coverage gate, and as a published guard from
`railway_cron.py` (data/guard_registry.json), whose verdict `check_verdicts.ts`
asserts without needing credentials.

── Why it is in front of the gate rather than behind it ───────────────────
`coverage_gate.py` answers "does this corpus know less than it did". That is a
question about CONTENT, and a half-refreshed corpus can answer it perfectly
well — the gate passed census #7, #8 and #9, every one of which describes a run
that failed. "Was this corpus finished" is a different question and needs its
own answer. `coverage_gate` names this step in `needs`, so a red mark stops
the snapshot, the Postgres publish and the embeddings — and only those.

    python3 ETL/schema/check_corpus_marks.py
    python3 ETL/schema/check_corpus_marks.py --self-test   # prove it can fail
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break

import argparse  # noqa: E402
import os  # noqa: E402

import corpus_marks  # noqa: E402
from store import connect  # noqa: E402


def check(ignore_run: str | None) -> int:
    with connect(readonly=True) as con:
        bad, unknown = corpus_marks.unresolved(con, ignore_run=ignore_run)
        marks, _ = corpus_marks.read(con)

    if unknown:
        # NOT a pass. It is reported, and it ends by itself: the next marked run
        # fills the table and every run after this one is judged. Failing here
        # would make the check red for a reason nobody can act on this week,
        # which is how a check stops being read.
        print(f"check_corpus_marks: UNKNOWN — {unknown}.")
        print("  The next run of ETL/refresh.py or railway_cron.py records the "
              "first marks; from then on this is a real answer.")
        return 0

    print(f"check_corpus_marks: {len(marks)} step(s) marked in the store")
    for m in marks:
        state = ("OPEN " if not m["closed_at"] else
                 "ok   " if m["outcome"] == corpus_marks.OK else
                 m["outcome"][:5].ljust(5))
        print(f"  {state} {m['step']:<34} {m['runner'] or '?'} "
              f"{m['opened_at']}{'  ' + m['detail'] if m['detail'] else ''}")

    if not bad:
        print("\nevery marked step finished.")
        return 0

    print(f"\nFAIL: {len(bad)} step(s) unresolved — {corpus_marks.summarise(bad)}")
    for m in bad:
        why = ("opened and never closed: the process that was writing here did "
               "not survive to say how it went"
               if not m["closed_at"] else
               f"closed as '{m['outcome']}'{': ' + m['detail'] if m['detail'] else ''}")
        print(f"  {m['step']} ({m['runner'] or 'unknown runner'}, run "
              f"{m['run_id']}) — {why}")
    print("\nThis corpus was not finished, whatever its coverage says. Publishing "
          "it would put a half-refreshed inventory in front of a founder with "
          "nothing on the page to say so.\n"
          "Re-run the step that did not finish, or — if the shortfall is "
          "understood and accepted — close its mark deliberately:\n"
          "  python3 -c \"import sys; sys.path.insert(0,'ETL/lib'); "
          "import corpus_marks as m; m.close_mark(...)\"\n"
          "There is no flag that clears them in bulk. A shortfall that is worth "
          "accepting is worth naming one at a time.")
    return 1


def self_test() -> int:
    """Prove the guard can fail. A guard nobody has seen go red is a guard
    nobody knows is wired up — this repo has shipped several.

    Three states on a throwaway store: clean, open-and-never-closed, and closed
    as partial. The first must pass and the other two must fail; a guard that
    only ever passes here would be caught by the assertion, not by a person
    noticing months later.
    """
    failures = []
    # On a real connection, with the search path narrowed to pg_temp: the real
    # corpus_run_marks is unreachable from this session, the probe table is a
    # TEMP table that dies with it, and the session is rolled back regardless.
    # The same SQL the guard runs, on the same engine, touching nothing.
    with connect() as con:
        con.execute("SET search_path = pg_temp")
        os.environ[corpus_marks.RUN_ID_ENV] = "selftest-run"

        # A store with no marks table must be UNKNOWN and never a silent pass —
        # the shape that deleted 141 filters.
        _, unknown = corpus_marks.unresolved(con)
        if not unknown:
            failures.append("a store with no marks table answered as if it were clean")
        con.execute("CREATE TEMP TABLE corpus_run_marks (step TEXT PRIMARY KEY, "
                    "run_id TEXT NOT NULL, runner TEXT, opened_at TEXT NOT NULL, "
                    "closed_at TEXT, outcome TEXT, detail TEXT)")
        _, unknown = corpus_marks.unresolved(con)
        if not unknown:
            failures.append("an empty marks table answered as if it were clean")

        corpus_marks.open_mark("a finished step", "self_test", con)
        corpus_marks.close_mark("a finished step", corpus_marks.OK, "", con)
        bad, unknown = corpus_marks.unresolved(con)
        if bad or unknown:
            failures.append(f"a clean store was not clean: {bad} {unknown}")

        corpus_marks.open_mark("a step that never returned", "self_test", con)
        bad, _ = corpus_marks.unresolved(con)
        if len(bad) != 1:
            failures.append(f"an open mark did not fail the guard: {bad}")
        if not corpus_marks.summarise(bad).startswith("partial"):
            failures.append(f"an open mark did not summarise as partial: "
                            f"{corpus_marks.summarise(bad)}")
        # ...and it must be ignorable by the run that owns it, or a runner
        # cannot ask this question about itself without always failing.
        bad_other, _ = corpus_marks.unresolved(con, ignore_run="selftest-run")
        if bad_other:
            failures.append(f"ignore_run did not drop the in-flight mark: {bad_other}")

        corpus_marks.close_mark("a step that never returned",
                                corpus_marks.PARTIAL, "cap reached", con)
        bad, _ = corpus_marks.unresolved(con)
        if len(bad) != 1:
            failures.append(f"a partial mark did not fail the guard: {bad}")

        corpus_marks.close_mark("a step that never returned",
                                corpus_marks.FAILED, "boom", con)
        if not corpus_marks.summarise(corpus_marks.unresolved(con)[0]).startswith("failed"):
            failures.append("a failed mark did not summarise as failed")
        con.rollback()

        # worse_of must never let a runner's optimism beat the store's memory.
        for claimed, stored, want in (
                ("ok", "partial: x", "partial: x"),
                ("ok", "ok", "ok"),
                ("partial: y", "ok", "partial: y"),
                ("ok", "failed at z", "failed at z"),
                ("unknown", "ok", "unknown"),
                ("partial: y", "failed at z", "failed at z")):
            got = corpus_marks.worse_of(claimed, stored)
            if got != want:
                failures.append(f"worse_of({claimed!r},{stored!r}) = {got!r}, want {want!r}")

    for f in failures:
        print(f"  SELF-TEST FAIL: {f}")
    print(f"check_corpus_marks --self-test: "
          f"{'FAILED' if failures else 'the guard fails on every unresolved state and on none of the clean ones'}")
    return 1 if failures else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ignore-run", default=None,
                    help="drop marks belonging to this run id — for a runner "
                         "asking about the state the store ARRIVED in")
    ap.add_argument("--self-test", action="store_true",
                    help="prove the guard can fail, on a throwaway store")
    a = ap.parse_args()
    if a.self_test:
        return self_test()
    return check(a.ignore_run)


if __name__ == "__main__":
    raise SystemExit(main())
