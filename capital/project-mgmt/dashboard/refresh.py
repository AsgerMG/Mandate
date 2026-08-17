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
typed into the prose. The page ships with empty placeholders that render as
em-dashes, so a page this script has never touched looks obviously unfilled
rather than confidently wrong.

AND EVERY ONE OF THEM COMES FROM THE SAME LADDER RUN. `series()` still reads
`guard_verdicts` for the CHART, which is a history of one guard over time and
is labelled as such. Everything the prose asserts -- the headline, the funnel,
the two factors, the worst step -- is `one_funnel/latest.json`, plus the two
constants read out of the code itself (`VERDICT_POOL`, `AGENT_SELECT`).

This used to mix in the pool-recall curve, which is measured on 830 holdout
founders where the funnel uses 897 with every stage above applied. Its figure
and the funnel's cut to the AI's list are different questions with adjacent
answers, and they sat one line apart in this script's own stdout. Nothing on
the page rendered it, which is the tell: main() now REFUSES to run if this
module computes a figure the page does not render, because a number that only
ever reaches a terminal is a number quoted without its population.
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

The fourth column is the same stage as a NOUN, for prose. The table's labels
are continuations -- "... and it survives the cut to eight" -- and dropping one
into a sentence reads like a transcript error. The prose below the table names
whichever step is currently the worst, and that step moves, so the noun has to
travel with the row rather than be written into the page.
"""
FUNNEL_ROWS = [
    ("answer_key",      "The corpus holds the fund they won",              "good",
     "holding it in the corpus at all"),
    ("publishable",     "&hellip; and we are allowed to offer it",         "warn",
     "our own rules on what may be offered"),
    ("founder_screen",  "&hellip; and the founder's own answers keep it",  "good",
     "the founder's own answers"),
    ("gates_pass",      "&hellip; and its written rules do not exclude them", "bad",
     "the fund's written eligibility rules"),
    ("pool_cut",        "&hellip; and it survives the cut to the AI's list", "warn",
     "the cut to the list the AI sees"),
    # NOT "the cut to eight". The cap is inert -- caps.ts:463 proves the
    # founder reads ranks 1..7 whether it is 8, 12 or 18, and raising it to the
    # whole pool measured +0.12 against a +/-3.2 half-width. What loses 31
    # points here is the ORDER: a fund at rank 9 is lost at any cap. Labelling
    # it by the cap sent me looking at a constant for a week.
    ("writer_cap",      "&hellip; and our ranking puts it in the top eight", "bad",
     "our own ranking of that list"),
    ("published",       "&hellip; and it is one of the seven published",   "warn",
     "publishing seven of the eight"),
    ("top_6",           "&hellip; and it is in the six they read",         "warn",
     "the six a founder actually reads"),
]

TONE = {"good": "var(--good)", "warn": "var(--warn)", "bad": "var(--bad)"}


def funnel_table() -> str:
    """The table body, generated from the run rather than written by hand.

    THE OWNER'S ASK, 2026-08-17: "so I can see where we lose the most". The
    table used to print a column of minus-signs in one type size, which made a
    30-point step and a 2-point step look alike and left him to add up a column
    to find out that two rows are two thirds of the problem. So each row now
    carries a BAR whose width is that step's share of everything lost, and the
    share as a figure beside it.

    THE ORDER IS NOT SORTED BY SIZE, deliberately. This is a ladder: each
    percentage is conditional on the row above it, and re-ordering by loss would
    make every number on the page mean something it does not. The bar carries
    the emphasis instead, which is what a bar is for.
    """
    run = json.loads(FUNNEL.read_text())
    by_id = {s["id"]: s for s in run["stages"]}

    # Two passes: the widths are shares of the TOTAL lost, so the total has to
    # exist before the first row is written.
    steps, prev = [], None
    for stage_id, label, tone, _noun in FUNNEL_ROWS:
        st = by_id.get(stage_id)
        if st is None:
            sys.exit(f"the funnel run has no stage '{stage_id}', which this page names. "
                     f"Rename it here or drop the row -- do not leave the page guessing.")
        pct = st.get("sharePct")
        if pct is None:
            continue
        steps.append((stage_id, label, tone, pct, 0.0 if prev is None else prev - pct))
        prev = pct
    total_lost = sum(s[4] for s in steps)
    if total_lost <= 0:
        sys.exit("the funnel reports no loss at all, which means the run is broken "
                 "rather than that the product is perfect. Refusing to publish it.")

    out = []
    for stage_id, label, tone, pct, lost in steps:
        last = stage_id == FUNNEL_ROWS[-1][0]
        share = lost / total_lost * 100
        # A step that loses nothing gets no bar and no share, rather than a
        # zero-width bar that reads as a rendering fault.
        bar = share_txt = ""
        if lost > 0.005:
            bar = (f'<span style="display:block;height:9px;border-radius:2px;'
                   f'background:{TONE[tone]};width:{share:.1f}%"></span>')
            share_txt = f"{share:.0f}%"
        out.append(
            f'        <tr style="border-bottom:1px solid var(--line)">\n'
            f'          <td style="padding:8px 0'
            f'{";font-weight:600" if last else ""}">{label}</td>\n'
            f'          <td style="text-align:right;padding:8px 12px;font-family:var(--mono);'
            f'font-variant-numeric:tabular-nums;font-weight:600">{pct:.0f}%</td>\n'
            f'          <td style="width:34%;padding:8px 12px 8px 0">'
            f'<span style="display:block;height:9px;border-radius:2px;'
            f'background:var(--line)">{bar}</span></td>\n'
            f'          <td style="text-align:right;padding:8px 0;font-family:var(--mono);'
            f'font-variant-numeric:tabular-nums;color:{TONE[tone]};white-space:nowrap">'
            f'{f"&minus;{lost:.0f}" if lost > 0.005 else ""}'
            f'<span style="color:var(--muted);font-size:12px">'
            f'{f"&nbsp;&nbsp;{share_txt}" if share_txt else ""}</span></td></tr>')
    return "\n".join(out)


TARGET = 60.0
"""The owner's near-term goal.

It is the one figure here that is a DECISION rather than a measurement, which
is exactly why it needs guarding differently. A stale measurement announces
itself -- the run stamp moves, the orphan check fires, the ladder disagrees. A
re-typed decision does not. It just quietly disagrees with itself in two
places, and both look deliberate.

I claimed in this file that it was "the only typed number on the page". That
was false when I wrote it: 60 also set the chart's y-axis scale and its
gridline stops, so moving the goal to 70 would have left the red line running
off the top of its own chart with nothing failing. That is the fault
`ETL/schema/check_cross_language_constants.py` exists to prevent, in its own
words -- "every one carried a 'keep in sync' comment that did not work" -- and
its rule is the one that applies here: anything that CAN be generated should
be, and where a duplicate cannot be removed, a check must fail when it
diverges. Here the duplicate CAN be removed, so it is: the chart reads
`FIG.target`.

DECISIONS names the figures this applies to. It is deliberately not "every
figure": a measurement re-typed is caught by other means, and a rule broad
enough to cover layout constants would collide with `max-width:60ch` and read
as noise. A second decision added later is one entry, and `main()` covers it
the day it appears.
"""

MILESTONE = 50.0
"""The near-term milestone, set 2026-08-17. The GOAL stays 60.

Both are decisions and both are guarded, for the reason in TARGET's docstring.
The split is not decoration: the arithmetic separates them cleanly. Conversion
is ~52% today; 50 needs it at ~58% against a reach ceiling of 86, and 60 needs
it near 70. One of those has a route on the board and the other does not yet,
and a page that shows only the further number cannot say which.
"""

DECISIONS = ("target", "milestone")


def figures(data: list[list]) -> dict[str, object]:
    """Every number the prose states, derived -- never typed.

    The owner's rule: the page must reflect what is in production at all times.

    EVERY FIGURE HERE COMES FROM ONE RUN OF ONE LADDER, on one population, and
    that is not a style preference. This function used to mix three sources --
    the funnel for the headline, `check_recall_floor`'s verdicts for the pool,
    and the pool-recall curve for what the model is shown. The curve is
    measured on 830 holdout founders and the funnel on 897 with every stage
    above it applied, so its "77.5% at K=40" and the funnel's cut to the AI's
    list are different questions with adjacent-looking answers. They sat one
    line apart in this generator's own output. Nothing rendered them, so no
    reader was misled -- but I read that line and quoted from it, which is the
    same defect one step earlier.

    So the rule is now structural: a figure is computed here only if the page
    renders it, and main() exits if that stops being true.
    """
    run = json.loads(FUNNEL.read_text())
    by_id = {s["id"]: s for s in run["stages"]}

    def share(stage_id: str) -> float:
        st = by_id.get(stage_id)
        if st is None or st.get("sharePct") is None:
            sys.exit(
                f"the funnel run has no stage '{stage_id}', which the page's prose "
                f"is derived from. Fix the run or the name -- do not let the page "
                f"state an arithmetic it cannot check."
            )
        return float(st["sharePct"])

    # The product is two factors and nothing else, and WHERE THE LINE IS DRAWN
    # between them is the whole content of the split. It is drawn at the pool
    # cut: everything above it is our own code deciding what the model may see,
    # everything below it is what happens to a list once the model has it. So
    # REACH is "the won fund is on the list the AI is shown" and CONVERT is
    # "that list became the founder's rows".
    #
    # An earlier draft drew it at the gates instead, which put OUR OWN cut to
    # forty inside the model's half and flattered the model by 8 points. The
    # cut is deterministic, it is ours, and it is what wsGX is measuring --
    # counting it as the model's would hide exactly the work in flight.
    #
    # Their product is the headline by construction, which is how the page can
    # state the arithmetic for the target without anyone typing a percentage.
    reach = share("pool_cut")
    end = share(FUNNEL_ROWS[-1][0])
    convert = end / reach * 100

    # The largest single stage-to-stage loss, found rather than asserted. The
    # prose used to name the cut to eight because that was true when it was
    # written; the sentence must move when the loss does.
    drops = []
    prev = None
    for stage_id, label, _tone, noun in FUNNEL_ROWS:
        st = by_id.get(stage_id)
        if st is None or st.get("sharePct") is None:
            continue
        pct = float(st["sharePct"])
        if prev is not None:
            drops.append((prev[1] - pct, noun, prev[0]))
        prev = (noun, pct)
    worst = max(drops)

    return {
        **headline(),                      # published / rows / n / stamp / stamp2
        "runs": len(data),
        "depth": cut_depth(),
        "ranker": live_ranker(),
        "reach": round(reach),
        "convert": round(convert),
        # What conversion would have to reach for the target, at today's reach.
        # Above 100 it is unreachable at this reach and the page must say so
        # rather than print an impossible percentage as if it were a plan.
        "needConvert": round(TARGET / reach * 100),
        "target": round(TARGET),
        "milestone": round(MILESTONE),
        # What conversion must reach for each, at TODAY's reach and at the
        # ceiling the gates allow. Four figures rather than two, because "the
        # second number has to reach 84%" reads as impossible until you see that
        # at full reach it is 58%.
        "needConvertMile": round(MILESTONE / reach * 100),
        "reachCeiling": round(share("gates_pass")),
        "needConvertMileAtCeiling": round(MILESTONE / share("gates_pass") * 100),
        "needConvertAtCeiling": round(TARGET / share("gates_pass") * 100),
        "worstLoss": round(worst[0]),
        "worstLossAfter": worst[2],
        "worstLossAt": worst[1],
        # The step-by-step section below the table. Same run, same ladder --
        # these used to be typed, and by this morning the page was telling the
        # owner the list is cut to eighteen (it is forty) and that the gates
        # cost twenty points (they cost four).
        "instruments": "{:,}".format(
            int(re.search(r"instruments=(\d+)", run["corpus"]).group(1))),
        "shortlist": round(run["meanAccessibleRows"]),
        "inShortlist": round(share("gates_pass")),
        "gatesLoss": round(share("founder_screen") - share("gates_pass")),
        "poolCutLoss": round(share("gates_pass") - share("pool_cut")),
        "writerLoss": round(share("pool_cut") - share("writer_cap")),
        "beforeAI": round(100 - share("pool_cut")),
        "publishCap": run["levers"]["PUBLISH_CAP"],
        "writerCap": run["levers"]["WRITER_CANDIDATE_CAP"],
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

    # A figure this generator computes and the page never renders is not
    # harmless. It is a number that reaches stdout, gets read, and gets quoted
    # against the wrong population -- which is how the recall curve's
    # "77.5% at K=40" (n=830, holdout) came to sit one line away from the
    # funnel's pool cut (n=897, the whole ladder) as if they answered the same
    # question. Worse, `figures()` exits hard when the curve has no point at
    # production depth, so the page could refuse to update over a measurement
    # it does not use. The curve's own currency is guarded where it belongs, by
    # check_pool_recall_curve.ts.
    #
    # The property, and it holds for a figure added next year by someone who
    # never reads this: every key in FIG is consumed by a data-fig attribute on
    # the page. Nothing here names a figure.
    # A DECISION may not be re-typed anywhere in the page. See TARGET's own
    # docstring for why decisions are guarded and measurements are not.
    #
    # Bare means bare: not part of a longer number, and not carrying a unit, so
    # `max-width:60ch` is not a copy of a 60% target and is not reported as one.
    # The test for a case nobody has seen is the guard's own input -- it reads
    # the VALUE out of `figs`, so a target moved to 70 looks for 70, and a
    # second decision added to DECISIONS is covered the day it is added.
    # Scan only what a HUMAN writes. The four regions below are written by this
    # script from the run and the guard feed, so a number inside them is a
    # MEASUREMENT, and measurements are out of scope by construction (see
    # TARGET's docstring). Caught by its own first run: `const D` is 264 rows of
    # recall verdicts and four of them contain a bare 50, none of which is
    # anybody typing the milestone.
    body = page
    for region in (r"const FIG = \{.*?\};", r"const D = \[.*?\];",
                   r"<!--FUNNEL-->.*?<!--/FUNNEL-->", r"<!--AGENTS-->.*?<!--/AGENTS-->",
                   # And STYLING, both places it lives. Stripping it is what
                   # lets the check catch a bare "60%" in prose -- which is how
                   # a decision actually gets re-typed -- without colliding with
                   # `width:60%` or `max-width:60ch`. Exempting the percent sign
                   # instead would have missed the very shape it needs to catch.
                   r"<style>.*?</style>", r'style="[^"]*"'):
        body = re.sub(region, "", body, flags=re.S)
    for key in DECISIONS:
        value = figs.get(key)
        if value is None:
            sys.exit(f"DECISIONS names '{key}' and figures() does not produce it.")
        # A trailing period must NOT exempt the literal. The first version
        # excluded `[\d.]` after the match, so "the milestone is 50." -- a
        # sentence -- slipped through while "50%" was caught. Found by the
        # PROVE step below rather than by reading it, which is the argument for
        # having one. A period only makes it part of a number when a digit
        # follows it.
        hits = re.findall(
            rf"(?<![\d.]){re.escape(str(value))}(?!\d|\.\d|[a-zA-Z])", body)
        if hits:
            sys.exit(
                f"the page types '{value}' as a bare literal {len(hits)} time(s), and it is "
                f"the value of the decision '{key}'.\nA decision has one home. Read it from "
                f"FIG.{key} instead -- a re-typed decision does not go stale, it quietly "
                f"disagrees with itself and both copies look deliberate."
            )

    rendered = set(re.findall(r'data-fig="([a-zA-Z0-9_]+)"', page))
    orphans = sorted(set(figs) - rendered)
    if orphans:
        sys.exit(
            "these figures are computed and never rendered: " + ", ".join(orphans)
            + "\nEither put them on the page or stop computing them. A number that "
            "only ever reaches the terminal gets quoted without its population."
        )

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
    # One line, one population, and every number on it is on the page. The old
    # version printed the recall curve's figures beside the funnel's, which are
    # measured on different populations.
    print(f"\nfigures ({figs['n']} companies, {figs['stamp']}): "
          f"published {figs['published']}% at {figs['rows']} rows  "
          f"= reach {figs['reach']}% x convert {figs['convert']}%  "
          f"| for {figs['target']}%, convert must reach {figs['needConvert']}%")
    print("Republish the page to update the artifact.")


if __name__ == "__main__":
    main()
