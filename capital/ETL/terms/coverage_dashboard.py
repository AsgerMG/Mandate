"""Render the fund-intelligence coverage table as a self-contained page.

Kept as a generator rather than a hand-written file so the document cannot go
stale: the numbers come from the corpus every time it runs, which is the whole
point of having one central place to look.

Usage:
  python3 ETL/terms/coverage_dashboard.py --out coverage.html
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

_sys.path.insert(0, str(_Path(__file__).resolve().parents[1] / "lib"))

import argparse  # noqa: E402
import datetime as _dt  # noqa: E402
import json  # noqa: E402
import sqlite3  # noqa: E402

from etl_env import DB  # noqa: E402
from coverage_report import AXES, build  # noqa: E402

AXIS_LABEL = {
    "eligibility": "Who it is for",
    "funds": "What it funds",
    "where": "Where it applies",
    "amount": "What it awards",
    "route": "How to approach it",
    "live": "When it last awarded",
}
AXIS_NOTE = {
    "eligibility": "Two or more rules we can actually evaluate against an answer",
    "funds": "Real funded-project titles, or a sector history of its own",
    "where": "A country on record, and a region where a rule needs one",
    "amount": "A median award from five or more real awards",
    "route": "A cited application procedure, its own or its regime's",
    "live": "A last-award year on record; dormancy is a fact we state, not a gap",
}

TEMPLATE = r"""<title>Fund intelligence coverage</title>
<style>
  :root {
    --ground: #F1F4F3; --surface: #FFFFFF; --sunken: #E7ECEA;
    --ink: #141D1A; --muted: #5C6B65; --faint: #93A29C;
    --line: #D8E0DD; --accent: #1C5E4A; --accent-soft: #DCEAE4;
    --warn: #9A6417; --miss: #A24A34;
    --radius: 3px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ground: #0E1412; --surface: #151D1A; --sunken: #1B2523;
      --ink: #E2E9E6; --muted: #94A49E; --faint: #6A7A74;
      --line: #24312D; --accent: #56BC98; --accent-soft: #17302A;
      --warn: #D6A94F; --miss: #D67C63;
    }
  }
  :root[data-theme="dark"] {
    --ground: #0E1412; --surface: #151D1A; --sunken: #1B2523;
    --ink: #E2E9E6; --muted: #94A49E; --faint: #6A7A74;
    --line: #24312D; --accent: #56BC98; --accent-soft: #17302A;
    --warn: #D6A94F; --miss: #D67C63;
  }
  :root[data-theme="light"] {
    --ground: #F1F4F3; --surface: #FFFFFF; --sunken: #E7ECEA;
    --ink: #141D1A; --muted: #5C6B65; --faint: #93A29C;
    --line: #D8E0DD; --accent: #1C5E4A; --accent-soft: #DCEAE4;
    --warn: #9A6417; --miss: #A24A34;
  }

  body {
    background: var(--ground); color: var(--ink);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 15px; line-height: 1.5;
    margin: 0; padding: 0 20px 80px;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1180px; margin: 0 auto; }
  .serif {
    font-family: "Iowan Old Style", "Palatino Linotype", Palatino,
                 "Book Antiqua", Georgia, serif;
  }
  .mono {
    font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
    font-variant-numeric: tabular-nums;
  }
  .eyebrow {
    text-transform: uppercase; letter-spacing: .10em; font-size: 11px;
    font-weight: 600; color: var(--muted);
  }

  header { padding: 56px 0 34px; border-bottom: 1px solid var(--line); }
  h1 {
    font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
    font-size: clamp(30px, 4.4vw, 44px); font-weight: 600;
    letter-spacing: -.015em; line-height: 1.1; margin: 10px 0 0;
    text-wrap: balance;
  }
  .lede { color: var(--muted); max-width: 62ch; margin: 14px 0 0; }
  .stamp { margin-top: 18px; font-size: 12.5px; color: var(--faint); }

  .headline { display: flex; flex-wrap: wrap; gap: 40px; margin-top: 30px; align-items: flex-end; }
  .big { font-size: 54px; line-height: 1; font-weight: 600; letter-spacing: -.03em; }
  .big span { font-size: 22px; color: var(--muted); font-weight: 400; letter-spacing: 0; }

  section { margin-top: 46px; }
  h2 {
    font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
    font-size: 21px; font-weight: 600; margin: 0 0 4px; letter-spacing: -.01em;
  }
  .sub { color: var(--muted); font-size: 13.5px; margin: 0 0 20px; max-width: 66ch; }

  .axes { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }
  .axis {
    background: var(--surface); border: 1px solid var(--line);
    border-radius: var(--radius); padding: 15px 16px 14px;
  }
  .axis .top { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  .axis .name { font-weight: 600; font-size: 14.5px; }
  .axis .pct { font-size: 17px; font-weight: 600; }
  .axis .note { color: var(--muted); font-size: 12.5px; margin: 7px 0 11px; }
  .track { height: 5px; background: var(--sunken); border-radius: 99px; overflow: hidden; }
  .fill { height: 100%; background: var(--accent); border-radius: 99px; }
  .fill.warn { background: var(--warn); }
  .fill.miss { background: var(--miss); }

  .scroll { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
  table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
  th, td { padding: 8px 11px; text-align: left; white-space: nowrap; }
  thead th {
    position: sticky; top: 0; background: var(--sunken); z-index: 1;
    font-size: 11px; text-transform: uppercase; letter-spacing: .07em;
    color: var(--muted); font-weight: 600; border-bottom: 1px solid var(--line);
  }
  tbody tr { border-top: 1px solid var(--line); }
  tbody tr:first-child { border-top: 0; }
  .num { text-align: right; font-variant-numeric: tabular-nums;
         font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
  .name-cell { max-width: 300px; overflow: hidden; text-overflow: ellipsis; }
  .dim { color: var(--faint); }

  /* Coverage as six segments: what is known reads as shape, not just number. */
  .strip { display: inline-flex; gap: 2px; vertical-align: middle; }
  .seg { width: 12px; height: 11px; border-radius: 1px; background: var(--sunken); }
  .seg.on { background: var(--accent); }
  .seg.on.partial { background: var(--warn); }

  .controls { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; align-items: center; }
  input[type="search"], select {
    font: inherit; font-size: 13.5px; padding: 7px 10px; color: var(--ink);
    background: var(--surface); border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  input[type="search"] { min-width: 230px; }
  label.chk { display: inline-flex; align-items: center; gap: 7px; font-size: 13.5px; color: var(--muted); }
  .count { font-size: 13px; color: var(--muted); margin-left: auto; }
  th.sortable { cursor: pointer; user-select: none; }
  th.sortable:hover { color: var(--ink); }
  th[aria-sort] { color: var(--ink); }
  th[aria-sort]::after { content: " \25B4"; }
  th[aria-sort="descending"]::after { content: " \25BE"; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  footer { margin-top: 54px; padding-top: 18px; border-top: 1px solid var(--line);
           color: var(--faint); font-size: 12.5px; }
  code { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
         font-size: .92em; background: var(--sunken); padding: 1px 5px; border-radius: 2px; }
</style>

<div class="wrap">
  <header>
    <div class="eyebrow">Wincent &middot; corpus intelligence</div>
    <h1>What we actually know about each fund</h1>
    <p class="lede">
      Six things an analyst needs before advising on an instrument. Each is
      present or it is not &mdash; &ldquo;partly&rdquo; is what hides gaps. Every
      number here is measured against the live corpus, never estimated.
    </p>
    <div class="headline">
      <div>
        <div class="eyebrow">Complete on all six</div>
        <div class="big mono">__COMPLETE__ <span>/ __N__</span></div>
      </div>
      <div>
        <div class="eyebrow">Instruments</div>
        <div class="big mono">__N__</div>
      </div>
      <div>
        <div class="eyebrow">Latest active award year</div>
        <div class="big mono">__LATEST__</div>
      </div>
    </div>
    <div class="stamp mono">Generated __STAMP__ &middot; <code>python3 ETL/terms/coverage_dashboard.py</code></div>
  </header>

  <section>
    <h2>The six axes</h2>
    <p class="sub">
      They fail differently, which is why they are counted separately: no
      eligibility means a fund can never be ruled out, no award size means a
      founder cannot tell a voucher from a grant, no route means a row nobody
      can act on.
    </p>
    <div class="axes" id="axes"></div>
  </section>

  <section>
    <h2>Depth, which coverage does not measure</h2>
    <p class="sub">
      An instrument can be complete on all six axes and still hold no rule of
      its own. Most publishable rows are sub-instruments hanging off a regime,
      and inherit that regime&rsquo;s eligibility wholesale &mdash; correct as
      far as it goes, since a notified scheme really is governed by its regime,
      but it is not research into the fund itself.
    </p>
    <div class="axes" id="depth"></div>
  </section>

  <section>
    <h2>By channel</h2>
    <p class="sub">
      Coverage is not evenly distributed, and the shape of the fix differs by
      channel. Mean score is out of six.
    </p>
    <div class="scroll">
      <table id="chTable">
        <thead><tr>
          <th>Channel</th><th class="num">n</th><th class="num">All six</th>
          <th class="num">Mean</th><th class="num">Who for</th><th class="num">Funds</th>
          <th class="num">Awards</th><th class="num">Route</th><th class="num">Recency</th>
        </tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </section>

  <section>
    <h2>Every instrument</h2>
    <p class="sub">
      Sort any column; search by name, country or scheme code. The strip shows
      which of the six are known, in the order above.
    </p>
    <div class="controls">
      <input type="search" id="q" placeholder="Search name, sector, country, scheme&hellip;" aria-label="Search instruments">
      <select id="ch" aria-label="Filter by channel"><option value="">All channels</option></select>
      <select id="fam" aria-label="Filter by family"><option value="">All families</option></select>
      <label class="chk"><input type="checkbox" id="gaps"> Only instruments with gaps</label>
      <span class="count" id="count"></span>
    </div>
    <div class="scroll">
      <table id="tbl">
        <thead><tr>
          <th class="sortable" data-k="label">Instrument</th>
          <th class="sortable" data-k="country">Ctry</th>
          <th class="sortable" data-k="channel">Channel</th>
          <th class="sortable" data-k="rootId">Family</th>
          <th class="sortable" data-k="focus">What it funds</th>
          <th class="sortable" data-k="score">Coverage</th>
          <th class="sortable num" data-k="gates">Rules</th>
          <th class="sortable num" data-k="cited">Cited</th>
          <th class="sortable num" data-k="ownRules">Own</th>
          <th class="sortable num" data-k="fields">Fields</th>
          <th class="sortable num" data-k="awardP50">Median award</th>
          <th class="sortable num" data-k="awardN">n</th>
          <th class="sortable num" data-k="events">Events</th>
          <th class="sortable num" data-k="totalEur">Total</th>
          <th class="sortable num" data-k="lastYear">Last</th>
        </tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </section>

  <footer>
    Rules counts resolve a parent regime&rsquo;s gates onto its children exactly
    as the product does at read time. &ldquo;Cited&rdquo; are rules traceable to
    a fund&rsquo;s own text &mdash; only those may disqualify a founder; the rest
    narrow with their provenance stated.
  </footer>
</div>

<script>
const DATA = __DATA__;
const AXES = __AXES__;
const AXIS_LABEL = __AXIS_LABEL__;
const AXIS_NOTE = __AXIS_NOTE__;
const N = DATA.summary.instruments;

const eur = (v) => {
  if (v == null) return "";
  if (Math.abs(v) >= 1e9) return "\u20AC" + (v / 1e9).toFixed(1) + "B";
  if (Math.abs(v) >= 1e6) return "\u20AC" + (v / 1e6).toFixed(1) + "M";
  if (Math.abs(v) >= 1e3) return "\u20AC" + Math.round(v / 1e3) + "K";
  return "\u20AC" + Math.round(v);
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Axis cards
document.getElementById("axes").innerHTML = AXES.map((a) => {
  const v = DATA.summary.axes[a], p = Math.round(100 * v / N);
  const cls = p >= 85 ? "" : p >= 65 ? " warn" : " miss";
  return `<div class="axis">
    <div class="top"><span class="name">${esc(AXIS_LABEL[a])}</span><span class="pct mono">${p}%</span></div>
    <div class="note">${esc(AXIS_NOTE[a])}</div>
    <div class="track"><div class="fill${cls}" style="width:${p}%"></div></div>
  </div>`;
}).join("");

// Depth cards. Counts, not shares: the denominators differ and a percentage
// here would invite comparison between things that are not comparable.
const D = DATA.summary;
document.getElementById("depth").innerHTML = [
  ["Sub-instruments", D.subInstruments,
   `of ${D.instruments} publishable rows sit under a parent regime`],
  ["Hold no rule of their own", D.noOwnRules,
   "their eligibility is entirely their regime's, replicated"],
  ["Families", D.families,
   `groupings that hold rules; the rest are programmes, nested up to ${D.maxDepth} deep`],
  ["Distinct regimes behind them", D.regimes,
   "the number of rulebooks actually researched"],
  ["Cannot disqualify anyone", D.noCited,
   "no cited rule the engine can evaluate; these narrow, never condemn"],
].map(([name, value, note]) =>
  `<div class="axis">
     <div class="top"><span class="name">${esc(name)}</span>
       <span class="pct mono">${Number(value).toLocaleString()}</span></div>
     <div class="note">${esc(note)}</div>
   </div>`).join("");

// Channel table
document.querySelector("#chTable tbody").innerHTML = DATA.summary.byChannel.map((c) =>
  `<tr><td>${esc(c.channel)}</td><td class="num">${c.n}</td>
   <td class="num">${c.complete}</td><td class="num">${c.meanScore.toFixed(2)}</td>
   <td class="num">${c.eligibility}</td><td class="num">${c.funds}</td>
   <td class="num">${c.amount}</td><td class="num">${c.route}</td><td class="num">${c.live}</td></tr>`
).join("");

// Channel filter options
const sel = document.getElementById("ch");
DATA.summary.byChannel.forEach((c) => {
  const o = document.createElement("option");
  o.value = c.channel; o.textContent = `${c.channel} (${c.n})`;
  sel.appendChild(o);
});

// Families, from the hierarchy the corpus now records. Filtering on `path`
// rather than parentId means selecting EIT catches its KICs and their
// programmes too, at any depth -- which is the point of the materialised path.
const famSel = document.getElementById("fam");
const famNames = new Map();
for (const r of DATA.rows) if (r.tier === "family") famNames.set(r.id, r.name);
const famCounts = new Map();
for (const r of DATA.rows) {
  if (!r.publishable || !r.rootId || r.rootId === r.id) continue;
  famCounts.set(r.rootId, (famCounts.get(r.rootId) || 0) + 1);
}
[...famCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .forEach(([id, n]) => {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = `${famNames.get(id) || id} (${n})`;
    famSel.appendChild(o);
  });

let sortKey = "score", sortDir = 1;
const strip = (r) => `<span class="strip" title="${AXES.filter((a) => r.axes[a]).length} of 6">` +
  AXES.map((a) => `<span class="seg${r.axes[a] ? " on" : ""}"></span>`).join("") + "</span>";

function render() {
  const q = document.getElementById("q").value.trim().toLowerCase();
  const ch = sel.value;
  const fam = famSel.value;
  const gapsOnly = document.getElementById("gaps").checked;
  let rows = DATA.rows.filter((r) =>
    // Framework placeholders and rollup parents never reach a founder, and
    // score zero on everything by construction. Counting them made coverage
    // read about seven points worse than it is.
    r.publishable &&
    (!ch || r.channel === ch) &&
    (!fam || r.rootId === fam) &&
    (!gapsOnly || r.score < AXES.length) &&
    (!q || r.name.toLowerCase().includes(q) || r.country.toLowerCase().includes(q) ||
      (r.scheme || "").toLowerCase().includes(q) || r.id.toLowerCase().includes(q)));

  rows = rows.slice().sort((a, b) => {
    const x = a[sortKey], y = b[sortKey];
    if (x == null && y == null) return 0;
    if (x == null) return 1;      // unknowns last, whichever way we sort
    if (y == null) return -1;
    if (typeof x === "string") return sortDir * x.localeCompare(y);
    return sortDir * (x - y);
  });

  document.getElementById("count").textContent =
    `${rows.length.toLocaleString()} of ${N.toLocaleString()} instruments`;
  document.querySelector("#tbl tbody").innerHTML = rows.map((r) => `<tr>
    <td class="name-cell" title="${esc(r.id)}">${esc(r.label || r.name)}</td>
    <td class="mono">${esc(r.country || "\u2014")}</td>
    <td class="dim">${esc(r.channel || "\u2014")}</td>
    <td class="${r.rootId && r.rootId !== r.id ? "dim" : "dim"}">${esc(r.rootId && r.rootId !== r.id ? (famNames.get(r.rootId) || r.rootId) : "\u2014")}</td>
    <td class="${r.focus ? "" : "dim"}">${esc(r.focus || "\u2014")}</td>
    <td>${strip(r)}</td>
    <td class="num">${r.gates}</td>
    <td class="num">${r.cited || '<span class="dim">0</span>'}</td>
    <td class="num">${r.ownRules || '<span class="dim">0</span>'}</td>
    <td class="num">${r.fields}</td>
    <td class="num">${r.awardP50 != null ? eur(r.awardP50) : '<span class="dim">\u2014</span>'}</td>
    <td class="num dim">${r.awardN || ""}</td>
    <td class="num">${r.events.toLocaleString()}</td>
    <td class="num">${eur(r.totalEur)}</td>
    <td class="num${r.stale ? " dim" : ""}">${r.lastYear || "\u2014"}</td>
  </tr>`).join("");
}

document.querySelectorAll("th.sortable").forEach((th) => {
  th.tabIndex = 0;
  const go = () => {
    const k = th.dataset.k;
    // Text sorts A-Z first; numbers sort biggest-first, which is what you want
    // from a column of money or counts.
    if (sortKey === k) sortDir = -sortDir;
    else { sortKey = k; sortDir = (k === "label" || k === "country" || k === "channel") ? 1 : -1; }
    document.querySelectorAll("th").forEach((o) => o.removeAttribute("aria-sort"));
    th.setAttribute("aria-sort", sortDir === 1 ? "ascending" : "descending");
    render();
  };
  th.addEventListener("click", go);
  th.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
});
["q", "ch", "fam", "gaps"].forEach((id) =>
  document.getElementById(id).addEventListener("input", render));

// Open on the thinnest instruments. This document exists to find gaps, so the
// default view should already be looking at them -- and the header has to SAY
// it is sorted, or the order reads as arbitrary.
document.querySelector('th[data-k="score"]').setAttribute("aria-sort", "ascending");
render();
</script>
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    conn = sqlite3.connect(DB)
    data = build(conn)
    conn.close()
    s = data["summary"]
    html = (TEMPLATE
            .replace("__DATA__", json.dumps(data))
            .replace("__AXES__", json.dumps(list(AXES)))
            .replace("__AXIS_LABEL__", json.dumps(AXIS_LABEL))
            .replace("__AXIS_NOTE__", json.dumps(AXIS_NOTE))
            .replace("__COMPLETE__", str(s["complete"]))
            .replace("__LATEST__", str(s["latestYear"]))
            .replace("__STAMP__", _dt.date.today().isoformat())
            .replace("__N__", str(s["instruments"])))
    _Path(args.out).write_text(html, encoding="utf-8")
    print(f"coverage dashboard -> {args.out}  ({len(html)//1024} KB, "
          f"{s['complete']}/{s['instruments']} complete)")


if __name__ == "__main__":
    main()
