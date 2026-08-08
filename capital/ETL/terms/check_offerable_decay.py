"""Shout when a country's offerable inventory decays, or when the job that
refills it stops running.

── The failure this exists for ────────────────────────────────────────────
Spain's open convocatorias are the first source in this corpus that goes stale
on a CALENDAR rather than on a release. Every row carries a real application
deadline and correctly removes itself the day that deadline passes. So the
inventory shrinks on its own, and:

    a corpus shrinking correctly and a corpus shrinking through neglect
    look identical from the inside.

`refresh_open_calls.py` re-runs the harvest weekly. That alone is not the fix.
A weekly job that silently starts failing produces exactly the decay it was
added to prevent, and the only visible symptom is a number nobody is watching
going down slowly. A re-run job cannot detect its own absence; this can.

── Two limbs, because one of them is always too late ──────────────────────
LIMB 1 -- FRESHNESS, the leading indicator.
    A source is "clock-decaying" if any of its rows carries an end date whose
    basis is a call deadline. That is a PROPERTY of the data, derived at run
    time: no source is named here, no country is named here, and a second
    register that starts publishing deadlines is covered on the day it lands
    rather than on the day somebody remembers to add it.

    Every clock-decaying source must have been refreshed within its grace
    window. This fires the FIRST week the job breaks -- before a single row has
    expired, and therefore before the founder-visible harm exists.

LIMB 2 -- LEVEL, the confirming indicator.
    Offerable count per country, against a committed baseline, using the ONE
    liveness definition (`ETL/lib/liveness.py`, projected from
    `lib/intelligence/liveness.ts`). Never re-implemented here.

    A fall is only reported when it is UNEXPLAINED. A country whose total row
    count fell by the same amount lost rows to a deliberate corpus change -- a
    delete, a rescope, a source retired -- and that is somebody's decision, not
    decay. What this catches is the other shape: total holds, offerable falls.
    Rows are still there; the register has moved on and we have not.

Limb 1 without limb 2 misses decay from a job that runs and returns nothing.
Limb 2 without limb 1 only speaks after founders have already been underserved.

── Baseline ───────────────────────────────────────────────────────────────
`data/reference/offerable_baseline.json`, committed, written by `--baseline`.
It records the counts AND the date, so a stale baseline is visible rather than
quietly permissive. Re-baseline deliberately after a load that changes scope,
and say why in the commit message -- that is the whole audit trail.

Exit codes, matching `renew.py` so `railway_cron.py` reads them as it already
reads that script's:
  0  everything within tolerance
  3  a warning: something moved, not far enough to call it broken
  1  a country decayed unexplained, or a clock-decaying source is past grace

Usage:
  python3 ETL/terms/check_offerable_decay.py --baseline   # record today
  python3 ETL/terms/check_offerable_decay.py              # the guard
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

import argparse  # noqa: E402
import datetime as dt  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402

from liveness import CALL_DEADLINE, closed_sql  # noqa: E402

BASELINE = ROOT / "data" / "reference" / "offerable_baseline.json"

# A country may lose this share of its offerable inventory without explanation
# before the run fails. Not zero: a handful of deadlines pass in any given week
# and that is the source working correctly. Set against the weekly cadence --
# Spain's 93 rows lose single digits a week, and 15% of 93 is 14.
TOLERANCE = 0.15

# A clock-decaying source must have been touched within this many days. The
# cron runs weekly (0 3 * * 0), so 10 days tolerates one late or skipped run
# and fails on two. Any longer and the guard is slower than the decay it
# guards against.
GRACE_DAYS = 10

# Below this, a country's offerable count is too small for a percentage to mean
# anything -- one row leaving a 3-row country is a 33% fall. Such countries are
# reported but cannot fail the run on the level limb alone.
MIN_COUNTABLE = 20


def pg():
    import psycopg
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL not set (repo-root .env.local)")
    return psycopg.connect(url)


def measure() -> dict:
    """Offerable and total per country, and the freshness of every source whose
    rows decay on a clock. All of it out of Postgres, which is what the product
    reads."""
    closed = closed_sql("postgres")
    with pg() as c:
        counts = c.execute(
            f"SELECT country, COUNT(*) FILTER (WHERE NOT ({closed})) AS offerable, "
            f"       COUNT(*) AS total "
            f"FROM funding_instruments WHERE country IS NOT NULL "
            f"GROUP BY country ORDER BY country").fetchall()
        # A source is clock-decaying because of what its rows CLAIM, not
        # because of its name. `updated_at` is bumped by every upsert the
        # harvest performs, so it is the freshness of the JOB, not of the
        # register -- which is exactly the thing that can silently stop.
        #
        # The join is LEFT, and that is the whole promise. This limb was
        # written to cover "a second register that starts publishing deadlines
        # on the day it lands", and an inner join quietly narrowed that to
        # registers whose leaves happen to be listed in
        # funding_instrument_sources. ADEME is exactly the case: that table maps
        # only the parent regime (one row, `ademe_aid` -> `ademe_aid`), the
        # parent carries no end date, and so 46 French call deadlines -- the
        # largest clock-decaying population outside Spain -- were watched by
        # nothing at all. Falling back to `root_id` groups a regime's leaves
        # under the regime, which is the unit a refresh job runs on anyway.
        fresh = c.execute(
            "SELECT COALESCE(s.source, i.root_id, i.id) AS source, COUNT(*), "
            "       MAX(i.updated_at) "
            "FROM funding_instruments i "
            "LEFT JOIN funding_instrument_sources s ON s.instrument_id = i.id "
            "WHERE COALESCE(i.scheme_end_date_basis,'') = %s "
            "GROUP BY 1 ORDER BY 1", (CALL_DEADLINE,)).fetchall()
    return {
        "as_of": dt.date.today().isoformat(),
        "countries": {r[0]: {"offerable": r[1], "total": r[2]} for r in counts},
        "clock_sources": {r[0]: {"rows": r[1],
                                 "last_refreshed": r[2].date().isoformat() if r[2] else None}
                          for r in fresh},
    }


def write_baseline(m: dict) -> None:
    BASELINE.parent.mkdir(parents=True, exist_ok=True)
    BASELINE.write_text(json.dumps(m, indent=1, sort_keys=True) + "\n")
    print(f"baseline written: {BASELINE}")
    print(f"  {len(m['countries'])} countries, "
          f"{sum(v['offerable'] for v in m['countries'].values())} offerable rows")
    for s, v in m["clock_sources"].items():
        print(f"  clock source {s}: {v['rows']} rows, last refreshed {v['last_refreshed']}")


def check(m: dict, tolerance: float, grace: int) -> int:
    if not BASELINE.exists():
        # NOT a warning. A guard with no baseline compares against nothing and
        # passes forever, which is the failure it exists to prevent wearing the
        # guard's clothes. It nearly happened on the first commit: `data` is
        # blanket-gitignored for the worktree symlinks, so the baseline was
        # written, measured against, and silently never committed. It is
        # force-tracked now; if it goes missing again, this says so loudly.
        print(f"NO BASELINE at {BASELINE}.\n"
              "  This guard cannot judge decay without one and will not pass quietly.\n"
              "  Run:  python3 ETL/terms/check_offerable_decay.py --baseline\n"
              "  then: git add -f data/reference/offerable_baseline.json\n"
              "  (`data` is blanket-gitignored; -f is required and is why this "
              "check refuses rather than warns)")
        return 1
    base = json.loads(BASELINE.read_text())
    today = dt.date.fromisoformat(m["as_of"])
    fail: list[str] = []
    warn: list[str] = []

    # ── Limb 1: is the job that refills these rows still running? ──────────
    print("clock-decaying sources (rows whose end date is a call deadline)")
    if not m["clock_sources"]:
        # Not a pass. The corpus previously held such rows or it did not; if
        # the baseline says it did, they have all gone.
        if base.get("clock_sources"):
            fail.append("every clock-decaying source has vanished from the corpus")
        print("  none")
    for src, v in sorted(m["clock_sources"].items()):
        last = v["last_refreshed"]
        age = (today - dt.date.fromisoformat(last)).days if last else None
        state = "never refreshed" if age is None else f"{age}d ago"
        flag = ""
        if age is None or age > grace:
            flag = "  <- PAST GRACE"
            fail.append(f"{src}: last refreshed {state}, grace is {grace}d. "
                        f"The re-run job is not running, or is failing silently.")
        print(f"  {src:38} {v['rows']:5} rows   refreshed {state}{flag}")

    # ── Limb 2: has any country's offerable inventory fallen unexplained? ──
    print("\nofferable inventory vs baseline "
          f"({base.get('as_of', '?')} -> {m['as_of']})")
    for cc, now in sorted(m["countries"].items()):
        was = base["countries"].get(cc)
        if not was:
            continue  # new country; nothing to decay from
        drop = was["offerable"] - now["offerable"]
        explained = max(0, was["total"] - now["total"])
        unexplained = drop - explained
        if drop <= 0:
            continue
        share = unexplained / max(was["offerable"], 1)
        line = (f"  {cc}  offerable {was['offerable']:4} -> {now['offerable']:4}"
                f"   (-{drop}, {explained} explained by rows leaving the corpus,"
                f" {unexplained} unexplained = {100 * share:.0f}%)")
        if unexplained <= 0:
            print(line)
        elif share > tolerance and was["offerable"] >= MIN_COUNTABLE:
            print(line + "   <- DECAY")
            fail.append(f"{cc}: {unexplained} offerable rows lost with no corresponding "
                        f"corpus change ({100 * share:.0f}% > {100 * tolerance:.0f}%)")
        else:
            print(line + "   (within tolerance)")
            warn.append(f"{cc}: -{unexplained} unexplained")

    stale_baseline = (today - dt.date.fromisoformat(base["as_of"])).days
    if stale_baseline > 120:
        warn.append(f"baseline is {stale_baseline} days old; re-baseline deliberately")

    print()
    if fail:
        for f in fail:
            print(f"DECAY: {f}")
        print("\nIf this fall is intended, re-baseline and say why in the commit "
              "message. Do not raise the tolerance.")
        return 1
    for w in warn:
        print(f"warning: {w}")
    if warn:
        return 3
    print("no unexplained decay; every clock-decaying source refreshed within grace")
    return 0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", action="store_true",
                    help="record today's counts as the baseline and exit")
    ap.add_argument("--tolerance", type=float, default=TOLERANCE)
    ap.add_argument("--grace-days", type=int, default=GRACE_DAYS)
    a = ap.parse_args()
    m = measure()
    if a.baseline:
        write_baseline(m)
        return
    raise SystemExit(check(m, a.tolerance, a.grace_days))


if __name__ == "__main__":
    main()
