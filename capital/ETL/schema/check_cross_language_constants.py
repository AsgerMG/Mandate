"""Constants that exist on both sides of the TypeScript/Python boundary.

Some values genuinely have to appear twice: the ETL writes them and the app
reads them, and there is no shared runtime. Those are the ones that drift,
because nothing compiles both halves together.

This project has now fixed that fault three times — the intake vocabulary kept
in three places, the country map in eight, the eligibility comparator in two —
and every one carried a "keep in sync" comment that did not work. Where a
duplicate cannot be removed, the next best thing is a check that fails when it
diverges.

Anything that CAN be generated should be, instead of listed here. The intake
vocabulary is the model: emit_vocabulary.ts writes data/vocabularies.json and
Python reads it, so there is no second copy to check.

Usage: python3 ETL/schema/check_cross_language_constants.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def gber_articles() -> list[str]:
    """GBER article codes: the ETL seeds the gate, the app labels it.

    populate_funding_instruments.py decides which codes become a
    `gber_article_inferred` gate; shortlist.ts turns each into the short legal
    basis a founder reads on the row. A code seeded but not labelled renders as
    a raw requirement string; a code labelled but never seeded is dead weight
    that reads as coverage we do not have.
    """
    py = (ROOT / "ETL/events/load/populate_funding_instruments.py").read_text()
    ts = (ROOT / "website/frontend/lib/intelligence/shortlist.ts").read_text()
    seeded = set(re.findall(r"StateAidObjectiveGberArt(\w+)", py))
    labelled = set(re.findall(r"StateAidObjectiveGberArt(\w+)", ts))
    problems = []
    if seeded - labelled:
        problems.append(f"  seeded by the ETL but unlabelled in the app: {sorted(seeded - labelled)}\n"
                        "    → those rows render a raw requirement string instead of a legal basis")
    if labelled - seeded:
        problems.append(f"  labelled in the app but never seeded: {sorted(labelled - seeded)}\n"
                        "    → dead labels that read as coverage we do not have")
    return problems


def census_kpi_keys() -> list[str]:
    """The corpus figures, named in three places that cannot import each other.

    `corpus_kpis.CANONICAL_KPI_SQL` is THE definition and computes them. Two
    other lists name them, in two languages, and neither can be generated from
    the first at the point it is needed:

      corpusCensus.CENSUS_KPI_KEYS   the render path's "is this reading whole?"
                                     test -- a census missing any of these is
                                     refused outright
      coverage_gate.KPI_AXES         the gate's loss test -- a figure not named
                                     here is a figure the gate has no opinion
                                     about

    Both failure directions are silent, which is why this is a check and not a
    comment:

      IN THE DEFINITION, MISSING FROM THE APP -- a KPI added to compute_kpis
      never reaches CENSUS_KPI_KEYS. The census carries it, the page ignores it,
      and nothing says so.

      IN THE DEFINITION, MISSING FROM THE GATE -- the figure is published every
      week with nothing judging whether it got worse. That is precisely the hole
      census #4 fell through: `sectors` went 11 -> 8 and the gate was silent,
      because `sectors` was not an axis.

      IN THE APP, MISSING FROM THE DEFINITION -- worse, and the reason this is
      worth a build failure. `admissibility()` demands every key in
      CENSUS_KPI_KEYS be present and finite. A key the ETL does not compute can
      never be present, so EVERY census is inadmissible, forever, and the site
      falls back to the committed artifact and quietly stops following the
      database. The live read would look exactly like it does when it works.
    """
    py = (ROOT / "website/build/lib/corpus_kpis.py").read_text()
    ts = (ROOT / "website/frontend/lib/corpusCensus.ts").read_text()
    gate = (ROOT / "ETL/terms/coverage_gate.py").read_text()

    def block(text: str, opener: str, closer: str) -> set[str]:
        body = text.split(opener, 1)[1].split(closer, 1)[0]
        return set(re.findall(r"""["'](\w+)["']""", body))

    computed = block(py, "CANONICAL_KPI_SQL = {", "\n}")
    served = block(ts, "CENSUS_KPI_KEYS = [", "]")
    judged = block(gate, "KPI_AXES = (", ")")

    problems = []
    for name, other, note in (
        ("served by the site (corpusCensus.CENSUS_KPI_KEYS)", served,
         "→ a key the ETL never computes makes EVERY census inadmissible, and the\n"
         "      site falls back to the committed artifact forever without saying why"),
        ("judged by the coverage gate (coverage_gate.KPI_AXES)", judged,
         "→ a figure outside the gate can be lost with nothing to stop it reaching\n"
         "      the home page; this is the hole census #4 fell through"),
    ):
        if computed - other:
            problems.append(f"  computed by corpus_kpis but not {name}: "
                            f"{sorted(computed - other)}\n    {note}")
        if other - computed:
            problems.append(f"  {name} but not computed by corpus_kpis: "
                            f"{sorted(other - computed)}\n    {note}")
    return problems


def eur_formatting() -> list[str]:
    """`fmt_eur` (Python, the artifact) and `fmtEur` (TypeScript, the census).

    The same corpus is formatted by whichever half of the codebase happens to
    read it: synthesis.py bakes `totalCapitalEur` into the committed artifact,
    and corpusFigures.ts derives it from the census's raw euro sum at render
    time. If the two ever disagree, the identical corpus reads €408.4B on a
    live render and something else on a fallback -- and the difference looks
    like the money moved.

    Compared by BEHAVIOUR on real values, not by reading the source: the
    magnitude thresholds and decimal places are the contract, and two
    implementations can satisfy it while looking nothing alike.
    """
    import json
    import random
    import subprocess

    # Not a list of remembered cases. Three families, so a divergence in a
    # rounding mode nobody has thought of is still caught:
    #
    #  1. Real corpus totals and every magnitude threshold, both sides.
    #  2. EVERY exact tie at each magnitude's last decimal place -- x.x5 for the
    #     B/M branches, x.5 for K and units -- which is where two languages'
    #     rounding conventions can differ at all, and where they DID.
    #  3. A deterministic pseudo-random sweep across ten orders of magnitude,
    #     signed, because the interesting failures in float formatting are the
    #     ones no author would sit down and write out.
    probes = [
        408433535420.67, 352852279442.4658, 291_500_000_000.0, 55_710_000_000.0,
        1e9, 999_999_999.0, 1.4e6, 1e6, 999_999.0, 1e3, 999.0, 0.0, -1.4e9,
    ]
    for scale in (1e9, 1e6):          # one decimal shown → ties at x.x5
        for step in range(10, 100):
            probes += [scale * (step / 10 + 0.05), -scale * (step / 10 + 0.05)]
    for scale in (1e3, 1.0):          # no decimals shown → ties at x.5
        for step in range(1, 100):
            probes += [scale * (step + 0.5), -scale * (step + 0.5)]
    rng = random.Random(20260807)
    probes += [rng.uniform(-1, 1) * 10 ** rng.randint(0, 12) for _ in range(2000)]

    sys.path.insert(0, str(ROOT / "website" / "build" / "lib"))
    from helpers import fmt_eur  # noqa: PLC0415

    node = subprocess.run(
        ["npx", "tsx", "-e",
         "import {fmtEur} from './lib/format';"
         f"console.log(JSON.stringify({json.dumps(probes)}.map(fmtEur)))"],
        cwd=ROOT / "website" / "frontend",
        capture_output=True, text=True)
    if node.returncode != 0:
        return [f"  could not run the TypeScript half: {node.stderr.strip()[-400:]}"]
    ts_out = json.loads(node.stdout.strip().splitlines()[-1])

    problems = []
    for value, got_ts in zip(probes, ts_out):
        got_py = fmt_eur(value)
        if got_py != got_ts:
            problems.append(
                f"  {value:,.2f} → Python fmt_eur {got_py!r}, TypeScript fmtEur "
                f"{got_ts!r}\n    → the same corpus would read differently from the "
                f"artifact and from the census")
    return problems


def scheduled_run_identity() -> list[str]:
    """Who the scheduled ETL run is, and how often it runs.

    `check_corpus_census.ts` asks one question the rest of the repo cannot ask
    for it: has the weekly refresh stopped? To answer it the check has to
    recognise a census the CRON wrote -- `publish_corpus_census.py` stamps
    `produced_by` from `$RAILWAY_SERVICE_NAME`, so that name is the evidence --
    and it has to know how long a gap is too long.

    Both facts already exist, once, in `ETL/lib/railway_service.py`, where
    `verify_cron.py` reads them to enforce the schedule on Railway itself.
    TypeScript cannot import them, so they are spelled a second time, and this
    is what stops the second spelling from rotting.

    Both drift directions are silent, and neither is theoretical -- the service
    has been renamed once already and the schedule is written over by every
    trigger run:

      THE NAME.  Rename the Railway service and no census matches
      SCHEDULED_PRODUCER any more. The check reports that the refresh has never
      recorded, forever, while it runs perfectly every Sunday. A guard that is
      permanently red is a guard nobody reads, which is how the drift reached 32
      days in the first place.

      THE SCHEDULE.  Move the cron to daily and the limit stays at 17.5 days:
      six consecutive missed runs would pass. The check would still print a
      confident basis line naming a cadence that is no longer real -- the worst
      shape of wrong, because it reads as measured.
    """
    py = (ROOT / "ETL/lib/railway_service.py").read_text()
    ts = (ROOT / "website/frontend/scripts/check_corpus_census.ts").read_text()

    def const(text: str, pattern: str) -> str | None:
        # MULTILINE, because both constants are top-level assignments and the
        # anchors are there to refuse a match inside a comment or a docstring.
        m = re.search(pattern, text, re.MULTILINE)
        return m.group(1) if m else None

    pairs = [
        ("the scheduled producer",
         const(py, r'^SERVICE_NAME\s*=\s*"([^"]+)"'),
         const(ts, r'^const SCHEDULED_PRODUCER\s*=\s*"([^"]+)"'),
         "railway_service.SERVICE_NAME", "check_corpus_census.SCHEDULED_PRODUCER",
         "→ no census would match, and SILENT would report a refresh that never\n"
         "      records while it runs every week"),
        ("the schedule",
         const(py, r'^REAL_CRON_SCHEDULE\s*=\s*"([^"]+)"'),
         const(ts, r'^const SCHEDULED_CRON\s*=\s*"([^"]+)"'),
         "railway_service.REAL_CRON_SCHEDULE", "check_corpus_census.SCHEDULED_CRON",
         "→ SILENT would measure staleness against a cadence the cron no longer\n"
         "      runs at, and say so as though it had been measured"),
    ]

    problems = []
    for label, py_val, ts_val, py_where, ts_where, note in pairs:
        if py_val is None or ts_val is None:
            missing = py_where if py_val is None else ts_where
            problems.append(
                f"  {label}: could not be read from {missing} — the constant was "
                f"renamed or reformatted,\n    and this check silently stopped "
                f"comparing anything. {note}")
        elif py_val != ts_val:
            problems.append(
                f"  {label}: {py_where} is {py_val!r}, {ts_where} is {ts_val!r}\n"
                f"    {note}")
    return problems


CHECKS = {
    "GBER article codes": gber_articles,
    "corpus KPI names": census_kpi_keys,
    "EUR formatting": eur_formatting,
    "scheduled run identity": scheduled_run_identity,
}


def main() -> None:
    failed = False
    for name, check in CHECKS.items():
        problems = check()
        if problems:
            failed = True
            print(f"{name}: DRIFTED")
            print("\n".join(problems))
        else:
            print(f"{name}: in sync")
    if failed:
        print("\nEither generate one side from the other, or update both.")
        sys.exit(1)


if __name__ == "__main__":
    main()
