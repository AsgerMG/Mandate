#!/usr/bin/env python3
"""Refresh the precision dashboard's series from `guard_verdicts`.

WHY THIS EXISTS AS A SCRIPT AND NOT A HABIT. The dashboard is the only
place the owner sees whether precision is moving, and it was built once by
hand from a database query. A figure that is refreshed by hand is refreshed
until someone forgets, and then it is a stale number on a page that looks
current -- which is exactly the defect this project spent 2026-08-09
finding fifteen times, including a live site claiming 146,911 companies
when the corpus held 151,426.

So the series is REGENERATED from the source of record, never edited:

    python3 project-mgmt/dashboard/refresh.py

`guard_verdicts` is that source. Every `check_recall_floor` run publishes a
row with its metrics, so the dashboard's history is a by-product of the
guard rather than a parallel record that can drift from it. There is
nothing to keep in sync, which is the point -- a "keep in sync" comment IS
the bug.

EVERY FIGURE THE PAGE STATES IS WRITTEN HERE. The owner's rule is that the
page reflects what is in production at all times, so nothing numeric is
typed into the prose: the headline, the funnel percentages, the cut depth
and the ceiling are all filled from `guard_verdicts`, the measured recall
curve and `VERDICT_POOL` itself. The page ships with empty placeholders
that render as em-dashes, so a page this script has never touched looks
obviously unfilled rather than confidently wrong.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAGE = Path(__file__).resolve().parent / "precision.html"
AGENTS = Path(__file__).resolve().parent / "agents.json"


def agent_rows() -> str:
    """The live view of what is being worked on, and why.

    Hand-maintained, and it has to be: a machine cannot say WHY a workstream
    exists. What is machine-enforced is the shape -- a finished agent is
    DELETED from agents.json rather than marked done, so the page can only
    ever show what is happening now. A status list of finished things is the
    noise this section replaced.
    """
    data = json.loads(AGENTS.read_text())
    if not data.get("agents"):
        return ('<p class="lede">Nothing in flight right now.</p>')
    out = ['<div class="rows">']
    for a in data["agents"]:
        step = (f'<span class="st s-now">step {a["step"]}</span>' if a["step"]
                else '<span class="st s-wait">repo</span>')
        out.append(
            f'      <div class="row">{step}'
            f'<span class="txt"><b>{a["what"]}</b><span>{a["why"]}</span></span></div>')
    out.append("    </div>")
    return "\n".join(out)


def load_database_url() -> str:
    """The repo-root `.env.local` is the one that carries credentials."""
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    for candidate in (ROOT / ".env.local", ROOT / "website/frontend/.env.local"):
        if not candidate.exists():
            continue
        for line in candidate.read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"')
    sys.exit("DATABASE_URL not found in the environment or either .env.local")


def series() -> list[list]:
    """Every recall_floor verdict that carries a headline figure.

    The answer-key column matters and is carried: `C` is the composed key,
    `D` is Doors. A run under one is NOT comparable with a run under the
    other -- a childless family is its own regime, so REGIME@5 stops paying
    sibling-group-size credit at the switch. The page plots the two eras
    separately and never joins them with a line, and that is why this
    column is not dropped for compactness.
    """
    import psycopg  # imported late so --help works without the driver

    with psycopg.connect(load_database_url()) as conn:
        rows = conn.execute(
            "select taken_at, status, metrics from guard_verdicts "
            "where guard = 'recall_floor' and metrics is not null "
            "order by taken_at"
        ).fetchall()

    out: list[list] = []
    for taken_at, status, metrics in rows:
        if isinstance(metrics, str):
            metrics = json.loads(metrics)
        if metrics.get("exact5") is None:
            continue
        out.append([
            taken_at.isoformat()[:16],
            "D" if "Doors" in (metrics.get("set") or "") else "C",
            metrics.get("exact5"),
            metrics.get("pool"),
            metrics.get("regime5"),
            metrics.get("floorExact5"),
            status,
        ])
    return out


CURVE = ROOT / "website/frontend/lib/intelligence/poolRecallCurve.generated.json"
CAPS = ROOT / "website/frontend/lib/intelligence/caps.ts"
SELECT = ROOT / "website/frontend/lib/intelligence/agentSelect.ts"


def live_ranker() -> str:
    """Which ranker a founder's memo is actually ordered by, right now.

    This is not decoration. It was written when `AGENT_SELECT` defaulted to
    `off` and was set nowhere in build, CI or deploy, so the LLM ranker was
    BUILT AND NOT SWITCHED ON and the order a founder read was the score's.
    wsGB flipped that default to `adviser`, so this read now returns "the AI
    ranker" -- which is the whole point of reading it rather than typing it. A
    brief that says "the AI picks five" while the AI is off, or that says "our
    own scoring" while the model is in the seat, is the same class of
    confident-and-wrong either way, and only a read of the code can be right in
    both directions.
    """
    # The constant moved from agentSelect.ts to caps.ts when the arm became a
    # hermetic lever. Search both rather than pinning one path: the page's claim
    # is about what production does, and it must survive a refactor rather than
    # fail on one -- but it must still FAIL if it cannot find the default at all,
    # because a generator that falls back to a literal is the stale-number defect
    # wearing a different hat.
    m = None
    for cand in (CAPS, SELECT):
        m = re.search(r'process\.env\.AGENT_SELECT \?\? "(\w+)"', cand.read_text())
        if m:
            break
    if not m:
        sys.exit(
            "could not read the AGENT_SELECT default from caps.ts or agentSelect.ts. "
            "The page states which ranker is live, so it must come from the code -- "
            "fix this read rather than typing the answer."
        )
    default_off = m.group(1) == "off"
    for cfg in ROOT.rglob("*.y*ml"):
        if "node_modules" in str(cfg) or ".next" in str(cfg):
            continue
        if "AGENT_SELECT=" in cfg.read_text(errors="ignore"):
            default_off = False
            break
    return "our own scoring" if default_off else "the AI ranker"


def cut_depth() -> int:
    """How many rows the selector is actually handed, read from the constant itself.

    Not restated here. The page's claim is about what production does, so the
    figure has to come from the thing production reads -- a copy would be one
    edit away from lying, which is the whole defect this file exists to stop.
    """
    # It was a bare constant; wsEI made it a lever, so it now reads
    # `depthLever("BRIEF_VERDICT_POOL", 18)`. Match the shipped default in
    # either spelling rather than pinning the syntax -- the page must keep
    # telling the truth across a refactor, not fail on one.
    # wsGD gave the lever an options object -- `depthLever("BRIEF_VERDICT_POOL",
    # 18, { all: true })` -- so the arm that shows the model the WHOLE pool is
    # expressible for the first time. The old pattern required the closing
    # paren immediately after the default and stopped matching, and this
    # function exited loudly rather than printing a stale 18. That is the
    # behaviour we want and it is why the number is read rather than typed;
    # what it costs is this: the read has to keep up with the declaration.
    #
    # Matched up to the default and no further, so the next option added does
    # not break it again. Still fails hard if the default cannot be found at
    # all -- a generator that falls back to a literal is the stale-number
    # defect wearing a different hat.
    src = CAPS.read_text()
    m = (re.search(r'export const VERDICT_POOL\s*=\s*depthLever\([^,]+,\s*(\d+)', src)
         or re.search(r"export const VERDICT_POOL\s*=\s*(\d+)", src))
    if not m:
        sys.exit(
            f"VERDICT_POOL's shipped default could not be read from {CAPS}. "
            f"The page states how many rows production passes on, so it must come "
            f"from the code -- fix this rather than typing the number."
        )
    return int(m.group(1))


FUNNEL = ROOT / "project-mgmt/findings/one_funnel/latest.json"


def headline() -> dict[str, object]:
    """THE FIRST NUMBER ON THE PAGE, and it must be the one we are building.

    It used to be `check_recall_floor`'s EXACT@5, captioned "measured in
    production today". Two things were wrong with that and the owner caught
    both:

      · It is a GUARD's figure -- a floor that exists to catch regressions,
        published on whatever population the floor happens to grade. A number
        chosen to be hard to break is not the number a product is steering by.
      · It grades `computeVerdict().instrumentTable`, the INSTANT SCREEN. The
        founder acts on the memo, and the two disagree about membership. So the
        headline described a screen rather than the thing being built.

    It now reads the end-to-end funnel -- one population, one definition, the
    answer followed the whole way to the founder's rows. The owner set the
    target at SIX rows, because the memo publishes seven and six is the honest
    bar for "shown to the founder".

    Six may not exist in the run yet; the ladder reported five and seven first.
    So the stage is chosen by preference and the page SAYS WHICH IT USED rather
    than quietly substituting a neighbour -- a headline that silently changes
    denominator is exactly the defect this file exists to prevent.
    """
    run = json.loads(FUNNEL.read_text())
    by_id = {s["id"]: s for s in run["stages"]}
    # The ladder names these `top_6` / `top_5`; earlier drafts used
    # `top_six` / `top_five`. Both spellings are accepted rather than pinned,
    # because a rename in the harness must not be able to blank the headline --
    # but an UNKNOWN stage still exits below rather than falling back.
    for stage_id, rows in (("top_6", 6), ("top_six", 6),
                           ("top_5", 5), ("top_five", 5)):
        st = by_id.get(stage_id)
        if st and st.get("sharePct") is not None:
            return {
                "published": round(st["sharePct"], 1),
                "published2": round(st["sharePct"], 1),
                "rows": rows,
                "n": run["n"],
                "stamp": run["startedAt"][:10],
                "stamp2": run["startedAt"][:10],
            }
    sys.exit(
        f"no usable end-to-end stage in {FUNNEL}. The page's first number is what "
        f"we are building, so it must come from the funnel run -- fix the run "
        f"rather than falling back to a guard's figure."
    )


"""Which stages the page shows, and what to call them in plain words.

The ladder's own questions are precise and unreadable ("... and its encoded
eligibility gates do not conclusively fail (accessiblePool)"). This is the
translation, and it lives here rather than in the HTML so the table cannot
drift from the run that produced it -- the numbers beside these labels are
read from the run, never typed.

A stage the ladder adds and this dict does not name is simply not shown, which
is the safe direction: a new stage appearing unlabelled is better than a
wrong label. A stage NAMED here and missing from the run exits loudly.
"""
FUNNEL_ROWS = [
    ("answer_key",      "The corpus holds the fund they won",              "good"),
    ("publishable",     "&hellip; and we are allowed to offer it",         "warn"),
    ("founder_screen",  "&hellip; and the founder's own answers keep it",  "good"),
    ("gates_pass",      "&hellip; and its written rules do not exclude them", "bad"),
    ("pool_cut",        "&hellip; and it survives the cut to the AI's list", "warn"),
    ("writer_cap",      "&hellip; and it survives the cut to eight",       "bad"),
    ("published",       "&hellip; and it is one of the seven published",   "warn"),
    ("top_6",           "&hellip; and it is in the six they read",         "warn"),
]

TONE = {"good": "var(--good)", "warn": "var(--warn)", "bad": "var(--bad)"}


def funnel_table() -> str:
    """The table body, generated from the run rather than written by hand."""
    run = json.loads(FUNNEL.read_text())
    by_id = {s["id"]: s for s in run["stages"]}
    out, prev = [], None
    for stage_id, label, tone in FUNNEL_ROWS:
        st = by_id.get(stage_id)
        if st is None:
            sys.exit(f"the funnel run has no stage '{stage_id}', which this page names. "
                     f"Rename it here or drop the row -- do not leave the page guessing.")
        pct = st.get("sharePct")
        if pct is None:
            continue
        lost = "" if prev is None else f"&minus;{prev - pct:.0f}"
        prev = pct
        last = stage_id == FUNNEL_ROWS[-1][0]
        out.append(
            f'        <tr style="border-bottom:1px solid var(--line)">\n'
            f'          <td style="padding:8px 0'
            f'{";font-weight:600" if last else ""}">{label}</td>\n'
            f'          <td style="text-align:right;padding:8px 12px;font-family:var(--mono);'
            f'font-variant-numeric:tabular-nums;font-weight:600">{pct:.0f}%</td>\n'
            f'          <td style="text-align:right;padding:8px 0;font-family:var(--mono);'
            f'font-variant-numeric:tabular-nums;color:{TONE[tone]}">{lost}</td></tr>')
    return "\n".join(out)


def figures(data: list[list]) -> dict[str, object]:
    """Every number the prose states, derived -- never typed.

    The owner's rule: the page must reflect what is in production at all
    times. So the headline, the funnel and the ceiling are all computed here
    from the guard's own verdicts and the measured recall curve, and the page
    ships with empty placeholders that read as em-dashes if this never runs.
    A page that renders a stale number confidently is worse than one that
    renders nothing.
    """
    latest = data[-1]                      # [when, key, exact5, pool, regime5, floor, status]
    curve = json.loads(CURVE.read_text())
    at = {int(k): v for k, v in curve["recallAtK"]}
    depth = cut_depth()
    if depth not in at:
        sys.exit(
            f"the recall curve has no point at K={depth}, the depth production uses. "
            f"Re-run scripts/_wsdr_curve.ts so the page can state the real figure."
        )
    return {
        **headline(),                      # published / published2 / rows / n / stamp
        "runs": len(data),
        "floorExact5": round(latest[2]),   # the GUARD's figure, kept but demoted
        "pool": round(latest[3]),
        "depth": depth,
        "shown": round(at[depth] * 100, 1),
        "shown2": round(at[depth] * 100, 1),
        "shown3": round(at[depth] * 100, 1),
        # Two different pools, and conflating them is how the page lost a stage.
        # `pool` is the candidate pool the floor grades. `accessible` is what
        # survives the channel caps and actually reaches the memo path -- the
        # curve's own ceiling, since no depth can exceed it. The difference
        # between them is a real loss with a real cause, not a discrepancy.
        "accessible": round(curve["inPoolAtAll"] * 100, 1),
        "ceiling": round(curve["inPoolAtAll"] * 100, 1),
        "ranker": live_ranker(),
    }


def main() -> None:
    data = series()
    if not data:
        sys.exit("no recall_floor verdicts carry metrics -- refusing to blank the page")

    page = PAGE.read_text()
    if "const D = " not in page:
        sys.exit(f"{PAGE} has no `const D = ` array to replace")

    page, n = re.subn(
        r"<!--AGENTS-->.*?<!--/AGENTS-->",
        "<!--AGENTS-->" + agent_rows() + "<!--/AGENTS-->",
        page, count=1, flags=re.S)
    if n != 1:
        sys.exit("the AGENTS block could not be replaced -- has the page been restructured?")

    page, n = re.subn(
        r"<!--FUNNEL-->.*?<!--/FUNNEL-->",
        "<!--FUNNEL-->\n" + funnel_table() + "\n      <!--/FUNNEL-->",
        page, count=1, flags=re.S)
    if n != 1:
        sys.exit("the FUNNEL block could not be replaced -- has the page been restructured?")

    figs = figures(data)
    page, n = re.subn(
        r"const FIG = \{.*?\};",
        "const FIG = " + json.dumps(figs, separators=(",", ":")) + ";",
        page,
        count=1,
        flags=re.S,
    )
    if n != 1:
        sys.exit("the FIG object could not be replaced -- has the page been restructured?")
    PAGE.write_text(page)

    updated, count = re.subn(
        r"const D = \[.*?\];",
        "const D = " + json.dumps(data, separators=(",", ":")) + ";",
        page,
        count=1,
        flags=re.S,
    )
    if count != 1:
        sys.exit("the series array could not be replaced -- has the page been restructured?")

    PAGE.write_text(updated)

    by_day: dict[str, list[float]] = {}
    for row in data:
        by_day.setdefault(row[0][:10], []).append(row[2])
    print(f"{len(data)} runs written to {PAGE.relative_to(ROOT)}")
    for day in sorted(by_day):
        vals = by_day[day]
        print(f"  {day}  {len(vals):>3} runs   EXACT@5 {min(vals)} - {max(vals)}")
    print(f"\nfigures: published {figs['published']}%  pool {figs['pool']}%  "
          f"shown-to-model {figs['shown']}% at K={figs['depth']}  ceiling {figs['ceiling']}%")
    print("Republish the page to update the artifact.")


if __name__ == "__main__":
    main()
