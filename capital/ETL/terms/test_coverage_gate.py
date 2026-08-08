"""The coverage gate must stop losses and must not stop growth.

Both halves are real transitions, not hypotheticals. The first is replayed from
the committed baselines: on 2026-08-06 the gate failed a run in which every one
of six axes GAINED about seventy instruments, because the corpus grew by 150 and
the arrivals were thinner than the incumbents. The second is the mirror the old
gate could not see at all — throwing away a hundred and thirty funds' worth of
research while the share goes UP, because the denominator fell with it.

A gate that only reads percentages cannot separate those, so this asserts on the
separation itself rather than on today's numbers.

Run: python3 ETL/terms/test_coverage_gate.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from coverage_gate import (  # noqa: E402
    AXES, KPI_AXES, TOLERANCE_PP, accept, advance, count_tolerance, evaluate,
    kpi_tolerance,
)

FAILURES: list[str] = []


def state(n: int, complete: int, counts: dict[str, int],
          kpis: dict[str, float] | None = None) -> dict:
    """A snapshot in the gate's own shape; shares derived, never hand-written."""
    out = {
        "takenAt": "2026-01-01",
        "instruments": n,
        "complete": complete,
        "counts": dict(counts),
        "shares": {a: round(100 * counts[a] / n, 2) for a in AXES},
    }
    if kpis is not None:
        out["kpis"] = dict(kpis)
    return out


def expect(label: str, current: dict, baseline: dict, want_ok: bool,
           want_in: str | None = None) -> None:
    ok, failures, notes = evaluate(current, baseline)
    if ok != want_ok:
        FAILURES.append(
            f"{label}: expected {'PASS' if want_ok else 'FAIL'}, got "
            f"{'PASS' if ok else 'FAIL'} — {failures or notes}")
        return
    if want_in and not any(want_in in x for x in failures + notes):
        FAILURES.append(f"{label}: expected {want_in!r} in the reasons, got "
                        f"{failures + notes}")


# ── 1. The false alarm, replayed from the committed baselines ───────────────
# project-mgmt/coverage_baseline.json at da0a32c5 (2026-08-01) and d16fcccd
# (2026-08-07). Every axis gained ~70 instruments; five shares fell >6pp.
AUG01 = accept(state(861, 743, {
    "eligibility": 826, "funds": 858, "where": 861,
    "amount": 779, "route": 838, "live": 841}))
AUG07 = state(1011, 815, {
    "eligibility": 897, "funds": 930, "where": 1011,
    "amount": 851, "route": 908, "live": 913})

expect("2026-08-06 growth that diluted", AUG07, AUG01, want_ok=True,
       want_in="nothing was lost")

# And it must say so about every axis that fell, not just the first.
_, _, notes = evaluate(AUG07, AUG01)
for axis in ("eligibility", "funds", "amount", "route", "live"):
    if not any(n.startswith(f"{axis}:") for n in notes):
        FAILURES.append(f"2026-08-06 replay: no growth note for {axis}")

# ── 2. The blind spot: a real loss hidden by a shrinking denominator ────────
# 150 instruments deleted, 130 of them the only ones that had a route. The
# share RISES 89.8% -> 90.4%, so a percentage-only gate passes.
SHRUNK = state(861, 700, {
    "eligibility": 780, "funds": 800, "where": 861,
    "amount": 740, "route": 778, "live": 800})
if SHRUNK["shares"]["route"] <= AUG07["shares"]["route"]:
    FAILURES.append("blind-spot fixture is wrong: the route share must RISE, "
                    f"{AUG07['shares']['route']} -> {SHRUNK['shares']['route']}")
expect("loss hidden by a shrinking corpus", SHRUNK, advance(AUG01, AUG07),
       want_ok=False, want_in="LOSS  route")

# ── 3. A loss while the corpus grows must fail too ─────────────────────────
GREW_BUT_LOST = state(1200, 815, {
    "eligibility": 897, "funds": 930, "where": 1200,
    "amount": 851, "route": 700, "live": 913})
expect("loss while growing", GREW_BUT_LOST, advance(AUG01, AUG07),
       want_ok=False, want_in="LOSS  route")

# ── 4. Empty rows: growth that adds nothing must fail as dilution ──────────
PADDED = state(1400, 815, dict(AUG07["counts"], where=1400))
expect("400 rows added, nothing known about them", PADDED, advance(AUG01, AUG07),
       want_ok=False, want_in="DILUTION")

# ── 5. The ratchet: tolerated losses must not accumulate ───────────────────
# Against a rolling baseline, losing one tolerance-step per run never fails and
# the corpus bleeds out. Against a high-water mark the second step fails.
base = advance(AUG01, AUG07)
step = count_tolerance(AUG07["counts"]["route"])          # 5 at 908
walk1 = state(1011, 815, dict(AUG07["counts"], route=AUG07["counts"]["route"] - step))
expect("one tolerated step", walk1, base, want_ok=True)
base_after_1 = advance(base, walk1)
walk2 = state(1011, 815, dict(walk1["counts"],
                              route=walk1["counts"]["route"] - step))
expect("second tolerated step, same direction", walk2, base_after_1,
       want_ok=False, want_in="LOSS  route")
# ...and the mark itself must never have moved down.
if base_after_1["highWater"]["counts"]["route"] != AUG07["counts"]["route"]:
    FAILURES.append("the high-water mark fell on a passing run; it must only rise")

# ── 6. Small movement is noise, not a regression ───────────────────────────
NOISE = state(1011, 815, dict(AUG07["counts"], route=AUG07["counts"]["route"] - 2))
expect("two instruments, within tolerance", NOISE, base, want_ok=True)

# ── 7. An identical corpus is never a regression ───────────────────────────
expect("nothing changed", AUG07, base, want_ok=True)

# ── 8. --accept lowers the mark, so a deliberate shrink can be recorded ────
accepted = accept(SHRUNK)
expect("after --accept, the same shrunken corpus passes", SHRUNK, accepted,
       want_ok=True)
if accepted["highWater"]["counts"]["route"] != SHRUNK["counts"]["route"]:
    FAILURES.append("--accept did not lower the high-water mark")

# ── 9. A baseline written before the mark existed must still gate ──────────
# Older baselines carry no `highWater`; the last accepted counts are the only
# evidence of what the corpus reached, and must be used as the mark rather than
# silently disabling the loss test.
legacy = {k: v for k, v in AUG01.items() if k != "highWater"}
expect("legacy baseline still catches a loss", SHRUNK, legacy,
       want_ok=False, want_in="LOSS")

# ── 10. The dilution threshold is the one the docstring claims ─────────────
# Same counts on both sides, so nothing was gained and the dilution test is the
# one that decides. Only the baseline share is moved, which is what a corpus
# that grew without gaining anything on this axis looks like.
def diluted_baseline(drop_pp: float) -> dict:
    b = accept(state(1011, 815, dict(AUG07["counts"])))
    b["shares"] = dict(b["shares"], route=AUG07["shares"]["route"] + drop_pp)
    return b


expect("share fell just under the tolerance", AUG07, diluted_baseline(TOLERANCE_PP - 0.1),
       want_ok=True)
expect("share fell just over the tolerance, nothing gained", AUG07,
       diluted_baseline(TOLERANCE_PP + 0.1), want_ok=False, want_in="DILUTION  route")


# ── 11. The figures on the home page are now inside the gate ───────────────
# Replayed from corpus_census #3 -> #4 (Railway Postgres, 2026-08-07): the
# first census ever taken inside the ETL container, against a corpus the site
# would have published live had nothing been standing in the way.
CENSUS_3_KPIS = {
    "companies": 151426, "events": 297933, "champions": 9365,
    "step_companies": 589, "total_capital_eur_raw": 352852279442.4658,
    "countries": 23, "source_families": 11, "sectors": 11,
}
CENSUS_4_KPIS = {
    "companies": 150868, "events": 299384, "champions": 9371,
    "step_companies": 589, "total_capital_eur_raw": 408433535420.67,
    "countries": 23, "source_families": 11, "sectors": 8,
}
KPI_BASE = accept(state(1011, 815, dict(AUG07["counts"]), CENSUS_3_KPIS))
KPI_NOW = state(1011, 815, dict(AUG07["counts"]), CENSUS_4_KPIS)

# Three of eleven sector families disappeared. That is the one the old gate had
# no opinion about, because `sectors` was not an axis.
expect("census #4: three sector families vanished", KPI_NOW, KPI_BASE,
       want_ok=False, want_in="LOSS  sectors")

# ...and it must not fire on the same run's ordinary movement. Companies fell
# 558 in 151,426 (0.37%), which is dedup noise, and events and capital ROSE.
_, kpi_failures, _ = evaluate(KPI_NOW, KPI_BASE)
for quiet in ("companies", "events", "total_capital_eur_raw", "champions"):
    if any(f"LOSS  {quiet}" in f for f in kpi_failures):
        FAILURES.append(f"census #4 replay: should not have fired on {quiet} — "
                        f"{kpi_failures}")

# The tolerance is proportional with a floor of ONE, not of three. A floor of
# three -- which is right for the instrument axes, where a regime re-split moves
# a handful of rows -- would have licensed exactly this sector loss in silence.
if kpi_tolerance(11) >= 3:
    FAILURES.append(f"kpi_tolerance(11) = {kpi_tolerance(11)}: a floor that large "
                    f"licenses losing a quarter of the sector taxonomy")

# Growth is never a loss, on any KPI.
expect("every figure grew", state(1011, 815, dict(AUG07["counts"]),
                                  {k: v * 1.1 for k, v in CENSUS_3_KPIS.items()}),
       KPI_BASE, want_ok=True)

# ── 12. The KPI mark ratchets up only, and cannot be walked down ───────────
# Same rule as the instrument axes, asserted separately because it is a
# separate dict: lose just under the tolerance every run and the second run
# must fail, because the mark did not follow the decline.
walked = KPI_BASE
for step in range(1, 4):
    nxt = state(1011, 815, dict(AUG07["counts"]),
                {**CENSUS_3_KPIS, "countries": 23 - step})
    ok, _, _ = evaluate(nxt, walked)
    if step == 1 and not ok:
        FAILURES.append("KPI ratchet: a single sub-tolerance step should pass")
    if step == 2 and ok:
        FAILURES.append("KPI ratchet: the second step down must fail — the "
                        "high-water mark is what makes losses non-cumulative")
    if ok:
        walked = advance(walked, nxt)

# A baseline written before the KPI axes existed has no KPI mark, and must not
# be read as a mark of zero (which would pass everything) nor crash.
LEGACY = {k: v for k, v in KPI_BASE.items() if k != "kpis"}
LEGACY["highWater"] = {k: v for k, v in KPI_BASE["highWater"].items() if k != "kpis"}
expect("a legacy baseline with no KPI mark", KPI_NOW, LEGACY, want_ok=True)
# ...and the mark establishes itself on that first passing run.
if set(advance(LEGACY, KPI_NOW)["highWater"]["kpis"]) != set(KPI_AXES):
    FAILURES.append("advance() from a legacy baseline did not establish a KPI mark")


if FAILURES:
    print(f"{len(FAILURES)} failure(s):")
    for f in FAILURES:
        print(f"  {f}")
    sys.exit(1)
print("coverage gate ok — loss is caught under growth and under shrinkage, "
      "growth that dilutes is not, tolerated losses cannot accumulate, and the "
      "figures on the home page are inside the gate")
