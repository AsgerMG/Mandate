# Sprint 9 — Supply-side exploratory study + findings website

**Owner of this sprint**: Claude Sonnet 4.6, executing against `/Users/asgermollergrimberg/EuroInvTracker/`.

**Status**: Not started. **Replaces** the original Dealroom plan (now backlogged at [`plans/backlog/private_side_paid_api_reference.md`](backlog/private_side_paid_api_reference.md)) and the free-source private-enrichment plan ([`plans/backlog/private_side_enrichment.md`](backlog/private_side_enrichment.md)). Private-side enrichment is deferred — see those backlog files for revival triggers.

**Pivot rationale (2026-05-22)**: 8 sprints went into building the 3,101-company / 4,969-event supply-side corpus; zero went into exploring it. Free-source private-event scraping (~10–25% coverage, biased toward EIC-funded startups) risks producing biased "EU funding → private follow-on" claims against a self-selected sample. Better to surface what the supply side actually says, then decide what specific private data (if any) is worth procuring.

---

## TL;DR for a fresh Claude session

Build a proper exploratory data analysis pass over the existing 3,101-company corpus and surface findings smoothly on a static website. **No new data extraction. No DB writes (beyond optional materialised aggregate views). No private-side enrichment.** The deliverable is *insight*, not more rows.

**Tech stack** — two-layer split:
- **Analysis layer (Python)**: SQL views + Python helpers + a thin orchestrator that executes each analysis query and exports its result as a small JSON file under `site/public/data/`. No chart rendering on the Python side. Single source of truth for numbers.
- **Site layer (Next.js + TypeScript)**: App Router, Tailwind for styling, **Tremor** (`@tremor/react`) for dashboard-feel charts, **Recharts** directly for anything Tremor doesn't cover well (network graph, heatmap, Sankey), **shadcn/ui** for layout primitives (Card, Separator, Badge, Alert). Reads the JSON files at build time, renders to static HTML. Deploys cleanly to Vercel (user-handled — not part of this sprint).

Why this stack over alternatives (Quarto, Observable Framework, Evidence.dev): highest aesthetic ceiling for "data essay with hover-charts" feel, Vercel-native, full control over typography and layout, Tremor's dashboard primitives are genuinely beautiful out of the box. Trade-off: more boilerplate than Quarto/Evidence; mitigated by the template-driven approach and the strict Python↔JSON↔TSX boundary so Sonnet can work each layer independently.

**End state after this sprint**:
- `analysis/` directory with reusable SQL views, Python helpers, and one `.sql` per question
- `analysis/run.py` orchestrator that produces 8 JSON data files under `site/public/data/qNN.json` plus 8 findings markdown files under `analysis/findings/qNN.md`
- `site/` directory: Next.js 14 App Router project, Tailwind + Tremor + shadcn/ui configured, one route per analysis, themed, navigable
- Local dev server runs cleanly (`npm run dev`); production build succeeds (`npm run build`); static export to `site/out/` (`npm run build && npm run export` if using `output: 'export'`) viewable in browser
- Memory entry capturing non-obvious findings
- Decision log entry in `methodology.md`; Day 11 note in `notes.md`
- **Deployment**: out of scope for this sprint — user handles via Vercel separately

---

## Pre-flight (DO THIS FIRST)

1. **Confirm Node.js + npm**: `node --version` (≥ 20.x recommended for Next.js 14) and `npm --version`. If absent, install via `brew install node` (user is on Darwin).
2. **Confirm Python deps**: `pandas`. Install missing with `pip install pandas`. The existing `openpyxl` from Sprint 8 stays available but isn't used here.
3. **Verify the DB state** with the gates from Sprint 8 (sanity_check.py clean, 3,101 companies / 4,969 events). If the corpus has drifted, STOP and re-baseline.
4. **No DB writes throughout this sprint** except step A1 below (read-only SQL views). Back up DB anyway: `cp db.sqlite db_backups/db.sqlite.backup_pre_sprint9_eda`.
5. **No deployment work**. User will handle Vercel deployment separately after this sprint. Do not write any GitHub Actions workflows, Vercel config, or Pages settings.

---

## Scope decisions (locked before scripting)

1. **Read-only analysis pass.** No `UPDATE` / `INSERT` / `DELETE` on `companies` or `public_funding_events`. Materialised aggregate views (SQL `CREATE VIEW`) are acceptable since they're derived from base tables; document them in `analysis/views.sql`.
2. **Strict layer boundary**: Python computes, Next.js renders. The interchange format is JSON files under `site/public/data/qNN.json`. Python never imports a JS lib; Next.js never imports a Python module. This boundary lets Sonnet work each side independently and keeps the analytical pipeline reproducible outside the website.
3. **Chart library matrix**: **Tremor** (`@tremor/react`) for the dashboard-style primitives — `BarChart`, `LineChart`, `AreaChart`, `DonutChart`, `BarList`, `Metric`, `Card`. **Recharts** (which Tremor wraps) directly for anything Tremor doesn't expose well: heatmaps (use Recharts `<Treemap>` or a custom grid), Sankey, network graphs. **shadcn/ui** for `Card`, `Separator`, `Badge`, `Alert`, `Tabs`. **Tailwind** for everything else. No D3 directly; if Recharts can't do it, render server-side as SVG via a Python lib and embed as a static image.
4. **Color palette**: defined once in TWO mirrored places — `analysis/helpers.py` for any Python-side use, and `site/lib/palette.ts` for the JSX side. Sector palette (7 labels): `life_sciences=#7B3F61, cleantech=#2D6A4F, deeptech_hardware=#1F3A93, defense=#5C2A2A, digital=#D97706, space=#1B263B, other=#6B7280`. Country palette: ColorBrewer Set2 (8 hues) cycled. Tailwind config extended with these as named tokens (`text-sector-cleantech`, etc.).
5. **Site theme**: Tailwind defaults with one custom config — generous max-width on prose (`max-w-prose` or 65ch), system-font stack (`font-sans`) for body and `font-mono` for numbers in tables, dark mode supported via `next-themes` (opt-in toggle in nav). One typography pass: ensure consistent heading scale and number tabular-alignment in tables. The aesthetic target is "Stripe Atlas report" / "Tremor demo dashboard" — clean, modern, charts feel native.
6. **One analysis = one Python query file + one JSON data file + one Next.js route**. Predictable file-by-file workflow for Sonnet.
7. **Findings prose discipline**: every analysis route ends with a 3–6-sentence "What this shows" paragraph in JSX prose. Be specific (numbers, named entities). No hedging boilerplate. No "further work" filler. If a chart shows nothing interesting, say so explicitly and move on — don't manufacture findings.
8. **Cite the methodology**: every analysis page renders a `<Callout>` at the bottom linking to the relevant section of `methodology` and `limitations` (which live as their own routes inside the site, sourced from `docs/methodology.md`).
9. **No private-side data in this sprint**. Anywhere it would naturally fit ("follow-on funding", "exit outcomes"), insert a one-line note in JSX: *"Right-hand-side data deferred to backlog — see project notes."*

---

## Repository layout after this sprint

```
analysis/
  views.sql                      # CREATE VIEW statements (idempotent; safe to re-run)
  queries/
    q01_corpus_overview.sql
    q02_cross_instrument.sql
    q03_country_sector.sql
    q04_concentration.sql
    q05_step_cohort.sql
    q06_time_dynamics.sql
    q07_cofunding_network.sql
    q08_gaps.sql
  helpers.py                     # palette, formatters, DB connection, JSON serialiser
  run.py                         # orchestrator: executes each qNN, writes site/public/data/qNN.json
  findings/
    q01.md … q08.md              # short markdown "What this shows" blurbs (consumed by site)
    synthesis.md                 # cross-analysis memo

site/                            # Next.js 14 App Router + TypeScript
  package.json
  next.config.mjs
  tailwind.config.ts
  tsconfig.json
  postcss.config.mjs
  app/
    layout.tsx                   # root layout: <NavBar />, theme provider, footer
    page.tsx                     # landing / index
    globals.css                  # Tailwind directives + minimal base
    01-corpus/page.tsx           # → /data/q01.json
    02-champions/page.tsx
    03-country-sector/page.tsx
    04-concentration/page.tsx
    05-step-cohort/page.tsx
    06-time-dynamics/page.tsx
    07-cofunding/page.tsx
    08-gaps/page.tsx
    synthesis/page.tsx
    methodology/page.tsx
    limitations/page.tsx
  components/
    nav-bar.tsx
    kpi-grid.tsx                 # Tremor Metric+Card grid
    chart-card.tsx               # consistent card wrapper around any Tremor / Recharts chart
    callout.tsx                  # methodology-cite callout (shadcn Alert)
    section.tsx                  # consistent section header + spacing
    findings-prose.tsx           # renders /analysis/findings/qNN.md as styled prose
  lib/
    data.ts                      # JSON loaders + typed result interfaces per qNN
    palette.ts                   # sector + country colour tokens (mirror of helpers.py)
    format.ts                    # fmt_eur, fmt_pct, fmt_int — mirror of helpers.py
  public/
    data/                        # JSON output from analysis/run.py — committed
      q01.json
      q02.json
      …
      q08.json
      synthesis.json             # any cross-analysis aggregates
  out/                           # `npm run build` static export — gitignored
```

**Note**: no `.github/workflows/` and no Vercel config in this sprint. User handles deploy.

---

# Workstream A — Analytical foundation

## Step A1 — Build `analysis/views.sql`

Create reusable SQL views that wrap the recurring joins. All read-only, all idempotent (`CREATE VIEW IF NOT EXISTS` or `DROP VIEW; CREATE VIEW` pattern).

Minimum view set:

```sql
-- One row per (event, source family, normalised year)
CREATE VIEW IF NOT EXISTS v_events AS
SELECT
  e.*,
  CASE
    WHEN e.source LIKE 'eic_%'             THEN 'eic'
    WHEN e.source LIKE 'ipcei_%'           THEN 'ipcei'
    WHEN e.source LIKE 'edf_%'             THEN 'edf'
    WHEN e.source LIKE 'innovation_fund%'  THEN 'innovation_fund'
    WHEN e.source LIKE 'eib_%'             THEN 'eib'
    WHEN e.source LIKE 'eit_%'             THEN 'eit'
    WHEN e.source LIKE 'chips%' OR e.source LIKE 'kdt%' THEN 'chips_ju'
    ELSE e.source
  END AS source_family,
  COALESCE(strftime('%Y', e.project_started),
           strftime('%Y', e.call_deadline)) AS event_year
FROM public_funding_events e;

-- One row per company with the count of distinct source families it appears in
CREATE VIEW IF NOT EXISTS v_company_breadth AS
SELECT c.id, c.canonical_name, c.country, c.sector_inferred, c.entity_type,
       c.step_flagged,
       COUNT(DISTINCT v.source_family) AS n_source_families,
       COUNT(*) AS n_events,
       SUM(COALESCE(v.grant_amount_eur, 0)) AS total_grant_eur,
       SUM(COALESCE(v.debt_amount_eur, 0)) AS total_debt_eur,
       MIN(v.event_year) AS first_year,
       MAX(v.event_year) AS last_year
FROM companies c
JOIN v_events v ON v.company_id = c.id
GROUP BY c.id;

-- Country × sector × source family aggregate
CREATE VIEW IF NOT EXISTS v_country_sector_family AS
SELECT
  c.country, c.sector_inferred, v.source_family,
  COUNT(DISTINCT c.id) AS companies,
  COUNT(*) AS events,
  SUM(COALESCE(v.grant_amount_eur, 0) + COALESCE(v.debt_amount_eur, 0)) AS total_capital_eur
FROM companies c JOIN v_events v ON v.company_id = c.id
GROUP BY c.country, c.sector_inferred, v.source_family;
```

**Gate A1**: views compile (`sqlite3 db.sqlite < analysis/views.sql` exit 0) and re-running is a no-op.

## Step A2 — Build `analysis/helpers.py`

Single module exporting:
- `db()` — `sqlite3.connect()` wrapper that opens read-only (`?mode=ro` URI form) and returns rows as dicts.
- `df(query, params=None)` — execute SQL, return pandas DataFrame.
- `SECTOR_PALETTE` — dict mapping each of the 7 sector labels → hex colour.
- `COUNTRY_REGION_MAP` — dict mapping ISO2 → broad region (`Nordics`, `DACH`, `Iberia`, `France`, `Italy`, `Benelux`, `CEE`, `Greece+Cyprus`, `UK+Ireland`, `Other-EU`, `Non-EU`).
- `fmt_eur(value)` — humanise (1_400_000 → "€1.4M"; 8_200_000_000 → "€8.2B").
- `to_json(df_or_dict, path)` — write JSON to `site/public/data/<path>` with consistent formatting: ISO dates, no NaN (replace with `null`), numbers preserved as numbers (not strings), keys in `camelCase` (so TypeScript interfaces are idiomatic). Indent 2.
- `save_table(df, path)` — also dump an inspectable CSV next to the JSON for debug (kept in `analysis/findings/_data/`).

**Gate A2**: `python3 -c "from analysis.helpers import db, df, to_json; print(df('SELECT COUNT(*) AS n FROM companies').iloc[0].n)"` prints 3101.

## Step A3 — Build `analysis/run.py` (orchestrator)

Single entry point that runs each query, transforms the result into the shape the corresponding Next.js page expects, and writes the JSON. Idempotent.

```python
"""Sprint 9 orchestrator. Re-runs all 8 analysis queries and writes JSON."""
from pathlib import Path
from helpers import db, df, to_json, fmt_eur

ROOT = Path(__file__).resolve().parent.parent
QUERIES = ROOT / "analysis" / "queries"
SITE_DATA = ROOT / "site" / "public" / "data"
SITE_DATA.mkdir(parents=True, exist_ok=True)

def run(slug, transform=None):
    sql = (QUERIES / f"{slug}.sql").read_text()
    data = df(sql)
    if transform:
        data = transform(data)
    to_json(data, SITE_DATA / f"{slug.split('_')[0]}.json")

# One call per analysis; transform is per-analysis Python munging if needed.
run("q01_corpus_overview")
run("q02_cross_instrument", transform=lambda d: {...})  # shape per page
# … through q08
```

**Gate A3**: `python3 analysis/run.py` exits 0; 8 JSON files appear under `site/public/data/`; each is valid JSON (`python3 -c "import json; [json.load(open(f'site/public/data/q0{i}.json')) for i in range(1,9)]"` exits 0).

---

# Workstream B — Eight focused analyses

Execute in order. Each analysis has THREE artifacts that always travel together:

1. **SQL query** at `analysis/queries/qNN_<slug>.sql` — the canonical numbers
2. **JSON output** at `site/public/data/qNN.json` — produced by `analysis/run.py` (Workstream A3)
3. **Findings markdown** at `analysis/findings/qNN.md` — the "What this shows" prose, rendered by the corresponding Next.js page

The Next.js route (Workstream D) reads the JSON, renders the charts, and embeds the findings markdown. Sonnet writes all three per analysis, then moves to the next.

**Per-analysis output specs** (Sonnet should follow these to make the JSON ↔ TSX boundary predictable):

| Question | JSON shape | Recommended chart |
|---|---|---|
| q01 corpus | `{ kpis: { companies, events, totalCapitalEur, sourceFamilies, countries, sectors }, byFamily: [{family, companies}], bySector: [{sector, companies}], topCountries: [{country, companies}] }` | Tremor `<Metric>` grid + `<DonutChart>` for families + `<BarList>` for sectors + `<BarChart>` for countries |
| q02 champions | `{ topChampions: [{name, country, sector, families: string[], totalEur, nEvents}], coOccurrence: {familyA, familyB, count}[], baselineVsChampions: [{sector, baselinePct, championPct}] }` | Sortable `<table>` for top 30, `<BarChart>` for sector compare, custom Recharts heatmap for co-occurrence |
| q03 country-sector | `{ countrySectorMatrix: [{country, sector, companies, totalEur}], familySectorMatrix: [{family, sector, companies}], countryMix: [{country, sectors: [{sector, share}]}] }` | Custom Recharts heatmap (or Tremor `<Tracker>` grid) for the two matrices; Tremor `<BarList>` for per-country mix |
| q04 concentration | `{ giniByFamily: [{family, gini, n}], topDecileShare: [{family, share}], lorenz: [{family, points: [{x, y}]}] }` | Tremor `<BarChart>` for Gini + `<LineChart>` for Lorenz (one chart per family, small-multiples grid) |
| q05 step cohort | `{ stepRateByFamily: [{family, rate, n}], stepRateByCountry: [{country, rate, n}], stepRateBySector: [{sector, rate, n}], stepScatter: [{name, totalEur, nFamilies, stepFlagged}] }` | Tremor `<BarChart>` (rate × family), `<BarChart>` (rate × country), Recharts `<ScatterChart>` with colour by `stepFlagged` |
| q06 time dynamics | `{ eventsPerYear: [{year, family, events}], avgGrantPerYear: [{year, family, avgEur}], sectorMix2020vs2025: [{sector, share2020, share2025}] }` | Tremor `<AreaChart>` stacked by family, `<LineChart>` for avg grant, side-by-side `<BarChart>` for sector mix |
| q07 co-funding | `{ familyPairs: [{a, b, count, sampleCompanies: string[]}], pipelineFlow: [{from, to, count}], champions: [{name, sequence: string[]}] }` | Custom Recharts network (force layout) or Recharts `<Sankey>`; Tremor `<BarList>` of top pairs |
| q08 gaps | `{ perCapita: [{country, companies, population, perMillion}], sectorAbsences: [{sector, expected, actual, gap}], ukDrop: [{year, ukEvents, otherEvents}] }` | Tremor `<BarChart>` for per-capita; `<LineChart>` for UK drop time-series |

**Findings markdown template** (`analysis/findings/qNN.md`):

```markdown
<!-- What this shows -->
3–6 sentences. Specific. Numbers, named entities. End with a one-line implication
for the broader research question (or "no signal here, moving on").

<!-- Scope qualifiers -->
- Coordinator-only loading convention — see methodology §Known limitations.
- <any analysis-specific caveat>
```

Each Next.js route imports both the JSON and the markdown via `import data from '@/public/data/qNN.json'` and a small client-side or build-time markdown loader.

## Step B1 — `q01` Corpus overview (route `/01-corpus`)

**Question**: What does the EU public-funding corpus look like at a glance? How many companies, where, what sectors, what instruments, what total capital deployed?

**Charts**:
- Treemap or stacked bar: 3,101 companies by source family (with cross-instrument-only companies in their own slice)
- Bar: companies by sector (7 labels)
- Choropleth or bar: top 15 countries by company count
- Headline KPIs at top: company count, event count, total committed €, country count, average events per company

**SQL**: aggregates from `v_company_breadth` + `v_events`.

**Gate B1**: every KPI matches the latest sanity_check.py output (no silent drift).

## Step B2 — `q02` Cross-instrument champions (route `/02-champions`)

**Question**: Who are the 81 companies appearing across ≥2 EU funding mechanisms? What's their combined intake? Is there a pattern (sector concentration, country concentration, instrument-pair preferences)?

**Charts**:
- Sortable table: top 30 by `n_source_families` then `total_grant_eur`, showing name, country, sector, instrument list, total €
- Heatmap: source-family × source-family co-occurrence count (how often does EIC + EIB happen together vs EIC + IPCEI?)
- Sector breakdown of the 81 vs corpus baseline (bar chart with two series)

**SQL**: `v_company_breadth WHERE n_source_families >= 2`; for the co-occurrence heatmap, self-join `v_events` on `company_id` and count distinct family pairs.

**Gate B2**: top-3 list matches the methodology document's claim (THALES FR top, CEA FR, Airbus FR). If it doesn't, the dedup / merge work in Sprint 8 may have shifted things — investigate and update the doc.

## Step B3 — `q03` Country × sector × programme heatmaps (route `/03-country-sector`)

**Question**: Where does each EU mechanism actually concentrate? Does France dominate defense, Germany IPCEI, Sweden cleantech? What are each country's "revealed bets"?

**Charts**:
- Heatmap 1: country (rows, top 15) × sector (columns, 7) — value = company count, colour intensity = count, annotation = total €
- Heatmap 2: source family (rows, 7) × sector (columns, 7) — does each instrument cluster on specific sectors? (Expected: chips_ju → deeptech_hardware 100%, IF → cleantech 100%, etc. — confirm.)
- Small-multiple: per-country sector mix (stacked horizontal bar) for top 10 countries

**SQL**: `v_country_sector_family`.

**Gate B3**: chips_ju × deeptech_hardware = 100% (sanity); IF × cleantech = 100% (sanity); EDF × defense = 100% (sanity). If any of these break, classifier has drifted.

## Step B4 — `q04` Concentration & power laws (route `/04-concentration`)

**Question**: Is EU funding spread broadly or captured by a few champions? Compute Gini coefficient per instrument; show top-decile capital share; visualise the long tail.

**Charts**:
- Lorenz curve per source family (small multiples, 7 panels)
- Bar: Gini coefficient per source family, sorted
- Cumulative-distribution: top-N companies → % of total capital (per family)
- Honest caveat: IPCEI / IF have heavy redacted / NULL grant fields; flag in chart titles

**SQL**: order companies by total grant per family, compute cumulative share via window functions.

**Gate B4**: EIC Gini should be ~0.4–0.6 (broadly spread); IPCEI Gini should be lower variance (large fixed awards). If results contradict known patterns, re-check the SQL.

## Step B5 — `q05` STEP Seal cohort profile (route `/05-step-cohort`)

**Question**: What distinguishes the 623 STEP Seal–holding companies (20.1%) from the rest of the corpus? Sector, country, instrument count, funding magnitude?

**Charts**:
- Stacked bar: STEP-flagged vs non-flagged share, broken down by sector and by source family
- Scatter: each company as a point, x = total_grant_eur (log), y = n_source_families (jittered); colour by step_flagged. Visualises whether STEP-tagged cluster is the "champion" tail.
- Country bar: STEP-flagging rate by country (% of country's companies that hold the seal)

**SQL**: `v_company_breadth` joined to seal flag.

**Gate B5**: chips_ju + EDF + IF show the highest STEP rates per the Sprint 8 health report (40%, 41%, 37%). Validate.

## Step B6 — `q06` Time dynamics 2020 → 2025 (route `/06-time-dynamics`)

**Question**: Has EU funding accelerated, stagnated, or shifted across instruments? Which sectors have grown, which have decayed? How does the post-STEP-launch period (2024+) differ?

**Charts**:
- Stacked area chart: events per year, coloured by source family (2020–2025)
- Line chart: average grant size per year per source family
- Sector composition shift: 2020 sector mix vs 2024–2025 sector mix (side-by-side stacked bars)
- Highlight: vertical reference line at STEP launch (2024)

**SQL**: `v_events` aggregated by `event_year`.

**Gate B6**: data is too sparse before 2020 (mostly EIC programme launch); cap at 2020 and document the floor. Total event count by year should reconcile against `SELECT event_year, COUNT(*) FROM v_events GROUP BY event_year`.

## Step B7 — `q07` Co-funding network / pipeline patterns (route `/07-cofunding`)

**Question**: Is there a discoverable EU funding "pipeline" — e.g., do EIC Accelerator alumni go on to receive EIB venture-debt? Do Chips JU consortium leads also pop up in IPCEI MECT? Where does the EU's capital actually flow across instruments?

**Charts**:
- Network graph (plotly Scatter with positioned nodes): 7 source families as nodes, edge weights = number of companies co-funded by both. Layout: force-directed or fixed-circle.
- Sankey: companies flowing from "first funded by X" → "second funded by Y" (for the cross-instrument cohort only)
- Table: ordered pairs with raw counts and example companies for top 10 pairs

**SQL**: self-join on `v_company_breadth WHERE n_source_families >= 2`; extract per-pair counts.

**Gate B7**: pair counts sum consistently with B2 totals. The strongest pair is plausibly IPCEI+Chips JU or EIC+EIB (per existing methodology notes).

## Step B8 — `q08` Conspicuous gaps (route `/08-gaps`)

**Question**: What's *missing* from the corpus that you'd expect to see? Is consumer software conspicuously absent? Is Eastern Europe under-represented relative to GDP / population? Where does the EU's funding map fail to overlap with where startups actually are?

**Charts**:
- Bar: companies-per-capita by country (joined against population data — small hard-coded dict for top 25 EU/EFTA countries in `helpers.py`; cite Eurostat 2024 population estimates)
- Sector vs national-startup-ecosystem mismatch: hard-coded reference (e.g. Sifted-published country startup counts) for top 10 countries; compare to our corpus share
- UK-post-Brexit drop, if visible in time-series (callback to B6)

**SQL + Python**: corpus aggregates joined to a small reference dict.

**Gate B8**: discuss limitations honestly. This is the analysis most likely to surface "we don't know" rather than a finding — that's still useful.

---

# Workstream C — Synthesis memo

## Step C1 — `synthesis` — What this all says (route `/synthesis`)

Single narrative document (1,500–2,500 words) that pulls findings across B1–B8 into a coherent picture. Structure:

1. **Headline** — one paragraph: "Across 3,101 companies and €N billion of EU public capital, three patterns stand out: [X], [Y], [Z]."
2. **The cohort** — what does EU-backed Europe look like? Cite B1 + B3.
3. **The champions** — who are the 81, and what does their existence say about EU funding policy? Cite B2 + B7.
4. **Concentration vs distribution** — does EU funding back many companies broadly or few companies deeply? Cite B4 + per-instrument differences.
5. **Time and policy shifts** — STEP launch, defense ramp, hydrogen wave. Cite B6.
6. **Gaps and biases** — coordinator-only scope, country distribution, sector absences. Cite B8 + methodology limitations.
7. **What we don't know** — explicit list of questions that need private-side data; pointer to backlog plans. Don't speculate beyond what the data supports.
8. **Hypotheses worth testing next** — 3–5 specific follow-up questions, each tagged with what additional data they'd need (free / paid / consortium-load / etc.).

Tone: analytical, specific, no marketing language. Aim for the writing voice of a Financial Times Alphaville post or an FT Letters submission — short paragraphs, plain language, numbers in line.

**Gate C1**: the headline paragraph is genuinely informative when read in isolation. Test: send the headline to the user; if they ask "and?", revise.

---

# Workstream D — Website assembly (Next.js + Tailwind + Tremor)

Five steps. Each is small. Work top-to-bottom — later steps assume earlier ones succeeded.

## Step D1 — Scaffold the Next.js project

```bash
cd /Users/asgermollergrimberg/EuroInvTracker
npx create-next-app@latest site --typescript --tailwind --app --eslint --src-dir=false --import-alias="@/*" --no-turbopack
```

Answer "Yes" to all defaults except `src-dir` (use root `app/` for cleaner imports).

Add dependencies:
```bash
cd site
npm install @tremor/react recharts next-themes
npm install --save-dev @types/node
# shadcn/ui setup — picks up Tailwind config
npx shadcn@latest init -d
# pull the primitives we use
npx shadcn@latest add card separator badge alert tabs
```

Edit `next.config.mjs` to set static export (so the user's Vercel deploy is purely static):
```js
export default { output: 'export', images: { unoptimized: true } };
```

Edit `tailwind.config.ts` to extend with sector colour tokens (mirror `palette.ts`):
```ts
import type { Config } from 'tailwindcss';
import { sectorColors } from './lib/palette';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}',
            './node_modules/@tremor/react/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: { colors: { sector: sectorColors } } },
  plugins: [require('@headlessui/tailwindcss'), require('@tailwindcss/forms')],
} satisfies Config;
```

**Gate D1**: `npm run dev` opens at `http://localhost:3000` with the default landing page. `npm run build` exits 0 with no type errors.

## Step D2 — Build the shared primitives

Three small components that every analysis page reuses. Each is one file under `components/`.

**`components/nav-bar.tsx`** — top nav, sticky, dark-mode toggle. Routes:
- Logo + "EuroInvTracker — Findings" → `/`
- Dropdown "Analyses" → 8 items (01–08)
- "Synthesis", "Methodology", "Limitations" as top-level links
- Right-aligned: GitHub link icon + dark-mode toggle (from `next-themes`)

Style: Tailwind, `border-b`, white in light mode, slate-950 in dark, subtle hover.

**`components/section.tsx`** — wraps a chart/content block:
```tsx
<Section title="Source family mix" caption="3,101 companies across 7 instruments">
  <DonutChart ... />
</Section>
```
Style: heading + caption above; `mt-12 mb-4` spacing convention; consistent type scale.

**`components/kpi-grid.tsx`** — Tremor `<Card>` + `<Metric>` grid, configurable columns:
```tsx
<KpiGrid items={[
  { label: 'Companies', value: '3,101' },
  { label: 'Funding events', value: '4,969' },
  { label: 'Total committed', value: '€56.8B' },
  { label: 'Source instruments', value: '7' },
]} />
```

**`components/chart-card.tsx`** — Tremor `<Card>` wrapper with consistent padding, title, footer note slot.

**`components/callout.tsx`** — shadcn `<Alert>` styled for "methodology cite" — used at the bottom of every analysis page. Default icon: info; variant `secondary`.

**`components/findings-prose.tsx`** — reads a markdown file from `analysis/findings/<slug>.md` at build time and renders as Tailwind `prose` block (`prose prose-slate dark:prose-invert max-w-prose`). Use `remark` + `rehype-stringify` or `next-mdx-remote/rsc`.

**Gate D2**: each component is independently importable. Storybook not needed; just confirm `import` works without TypeScript errors.

## Step D3 — Build the landing page (`app/page.tsx`)

200–400 words rendered. Components:
- Hero: project title in a large heading, one-line scope summary ("Where Europe's public capital actually goes — a data study of 3,101 companies across seven EU funding mechanisms.")
- `<KpiGrid>` with the 6 headline numbers (Companies, Events, Total committed, Source instruments, Countries, Sectors)
- Three "Highlights" cards (`<Card>`) linking to the three most surprising analyses. Each card: small icon, title, 1-sentence teaser, "Read →" link.
- Pointer to `/synthesis` for the full read
- Footer: methodology / limitations / GitHub repo links + last-updated date

Reads from `public/data/q01.json` for KPI values (don't hardcode).

**Gate D3**: page renders at `/` with real KPI values from JSON, no missing assets, lighthouse perf ≥ 90 on local build.

## Step D4 — Build the 8 analysis routes + synthesis

Each analysis route follows the same JSX skeleton (Sonnet writes this template once and instantiates per question):

```tsx
// app/01-corpus/page.tsx
import data from '@/public/data/q01.json';
import { Section, KpiGrid, ChartCard, Callout, FindingsProse } from '@/components';
import { DonutChart, BarChart, BarList } from '@tremor/react';
import { sectorPalette } from '@/lib/palette';

export const metadata = { title: '01 — Corpus overview · EuroInvTracker' };

export default function Page() {
  return (
    <article className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-12">
        <p className="text-sm uppercase tracking-wide text-slate-500">Analysis 1 of 8</p>
        <h1 className="mt-2 text-4xl font-semibold">Corpus overview</h1>
        <p className="mt-2 text-slate-600">What the EU public-funding corpus looks like at a glance.</p>
      </header>

      <KpiGrid items={[
        { label: 'Companies', value: data.kpis.companies.toLocaleString() },
        { label: 'Events', value: data.kpis.events.toLocaleString() },
        { label: 'Total committed', value: data.kpis.totalCapitalEur },
        // …
      ]} />

      <Section title="Source family mix" caption="…">
        <DonutChart data={data.byFamily} category="companies" index="family"
                    colors={['indigo','emerald','amber','rose','slate','violet','cyan']} />
      </Section>

      <Section title="Sector distribution" caption="…">
        <BarList data={data.bySector.map(s => ({ name: s.sector, value: s.companies }))} />
      </Section>

      <Section title="Top countries" caption="…">
        <BarChart data={data.topCountries} index="country" categories={['companies']}
                  colors={['indigo']} yAxisWidth={48} />
      </Section>

      <FindingsProse slug="q01" />

      <Callout title="Scope qualifiers">
        Coordinator-only loading convention. See <a href="/methodology">methodology</a>
        and <a href="/limitations">limitations</a>.
      </Callout>
    </article>
  );
}
```

Sonnet replicates this skeleton 8 times, swapping in the JSON shape and chart components per the Workstream B table.

The synthesis page (`app/synthesis/page.tsx`) is mostly prose — render `analysis/findings/synthesis.md` via `<FindingsProse>` inside the same `<article>` shell. No charts unless a small recap KPI grid at the top adds value.

**Gate D4**: all 9 analysis routes (01–08 + synthesis) render with real data and findings markdown; clicking through the nav works; no console errors; no missing JSON files.

## Step D5 — Methodology + Limitations + polish

`app/methodology/page.tsx` and `app/limitations/page.tsx`: render excerpts from `docs/methodology.md` (the "Known limitations for downstream analysis" subsection in particular) as styled prose. Use `<FindingsProse>` pattern, but source from `docs/` directly. Add a "Canonical source: docs/methodology.md in the repo" footer.

Final polish pass:
1. Confirm the type scale is consistent (one `<h1>` per page, `<h2>` for sections).
2. Confirm dark mode works on every page (toggle in nav, no flash-of-wrong-theme).
3. Confirm every chart has a title + caption + source citation.
4. Confirm number formatting is consistent (use `fmt_eur` / `fmt_pct` from `lib/format.ts` everywhere).
5. Confirm mobile responsive (single column < 768px, multi-column ≥ 768px).
6. Run `npm run build`. Confirm output is fully static under `site/out/`. Open `site/out/index.html` directly in browser — should work without a server (this is what Vercel will serve).

**Gate D5**: `npm run build` exits 0; `site/out/` exists with 12 HTML files (index + 8 analyses + synthesis + methodology + limitations); clicking through the static output in a browser works.

---

# Validation gates (consolidated)

| # | Gate | Threshold |
|---|---|---|
| A1 | Views compile, idempotent re-run | exit 0 twice |
| A2 | Helpers importable, `df()` returns expected baseline | 3101 companies |
| A3 | `analysis/run.py` writes 8 valid JSON files | json.load passes for all |
| B1 | KPIs in q01.json match `sanity_check.py` | no drift |
| B2 | Top-3 cross-instrument cos match methodology | THALES, CEA, Airbus |
| B3 | Source-family ↔ sector locks hold | chips_ju→deeptech 100%, IF→cleantech 100%, EDF→defense 100% |
| B4 | EIC Gini in plausible range | ~0.4–0.6 |
| B5 | STEP cohort top-3 families | chips_ju ≥ 40%, EDF ≥ 40%, IF ≥ 35% |
| B6 | Year-by-year event counts reconcile | sum of years = 4969 |
| B7 | Pair counts sum-consistent with B2 | no double-counting |
| B8 | Per-capita country bar plausible | Nordics + Estonia high; Eastern EU low |
| C1 | Headline paragraph reads informative in isolation | user sanity check |
| D1 | Next.js scaffold builds | `npm run build` exit 0 |
| D2 | Shared primitives importable, no TS errors | `tsc --noEmit` exit 0 |
| D3 | Landing page renders with real KPI data | manual check |
| D4 | All 9 analysis routes render charts + findings | manual click-through |
| D5 | Static export complete + loads from filesystem | `site/out/` has 12 HTML files, opens in browser |

---

# Documentation updates required after sprint

- `docs/methodology.md`: new decision-log entry "2026-XX-XX (sprint-9 exploratory study)" noting the pivot away from private-side enrichment, the Next.js+Tremor website, and the headline findings (3 from synthesis).
- `docs/notes.md`: Day 11 entry with per-analysis findings summary + gate scorecard + final corpus stats (unchanged from Sprint 8 since this sprint is read-only).
- `README.md`: new "Findings site" section with:
  - One-paragraph summary of what's on the site
  - Local dev: `cd site && npm install && npm run dev` → http://localhost:3000
  - Local production build: `cd site && npm run build` → static files in `site/out/`
  - Regenerate data: `python3 analysis/run.py` → JSON files in `site/public/data/`
  - Deployment: "Hosted separately via Vercel" (user handles)
- `docs/methodology.md` and `docs/notes.md` remain the canonical source. The site's `/methodology` and `/limitations` routes render excerpts pointing back to the repo.
- New memory file `project_sprint_9_findings.md`: capture only *non-obvious* findings (the headline 3 from synthesis, plus any pattern that would surprise a fresh reader, plus any architectural decision about the site that matters for future sprints). Add MEMORY.md index entry.

---

# Out of scope (defer)

- **Deployment / hosting** — user handles via Vercel separately. Do not write Vercel config, GitHub Actions workflows, or Pages settings. The sprint deliverable is a working `site/out/` static export.
- **Any private-side enrichment** — see `plans/backlog/private_side_enrichment.md` and `plans/backlog/private_side_paid_api_reference.md`. Revival triggers documented in each.
- **Interactive filtering / live data dashboards** — site is static, generated at build time. If filtering / drill-down is needed later, that's a future "dashboard sprint" with a different scope.
- **Comparative analysis vs. non-EU benchmarks** (US deep-tech, UK post-Brexit, China) — no comparable dataset loaded; defer.
- **Per-company drill-down pages** (3,101 individual pages) — out of scope; the site is finding-driven, not directory-driven.
- **Statistical inference / regression** (e.g., "STEP-tagged companies receive 2.3× more capital, p<0.01") — this sprint is descriptive only. Inferential work needs cleaner sampling assumptions than coordinator-only loading allows.
- **Custom design system / illustrations / hero imagery** — Tailwind + Tremor defaults are the aesthetic target. No bespoke SVG illustrations, no custom font hosting, no hand-drawn diagrams.

---

# End-state checklist (paste into final sign-off)

- [ ] Pre-flight: Node 20+ installed, Python `pandas` available, DB baseline confirmed
- [ ] A1 `analysis/views.sql` compiles, idempotent
- [ ] A2 `analysis/helpers.py` importable, baseline query works
- [ ] A3 `analysis/run.py` writes 8 valid JSON files under `site/public/data/`
- [ ] B1–B8 SQL queries + JSON outputs + findings markdown written
- [ ] All B-file gates pass
- [ ] C1 `analysis/findings/synthesis.md` written; headline paragraph user-validated
- [ ] D1 Next.js scaffold + Tremor + shadcn installed; `npm run dev` and `npm run build` both clean
- [ ] D2 Shared components (`nav-bar`, `section`, `kpi-grid`, `chart-card`, `callout`, `findings-prose`) implemented and importable
- [ ] D3 Landing page (`app/page.tsx`) renders with real KPI data from `q01.json`
- [ ] D4 All 9 analysis routes (01–08 + synthesis) render with charts + findings prose
- [ ] D5 Methodology + Limitations routes render; polish pass done (typography, dark mode, mobile, formatting); `npm run build` produces `site/out/`
- [ ] `docs/methodology.md`, `docs/notes.md`, `README.md` updated
- [ ] `project_sprint_9_findings.md` memory written; MEMORY.md indexed
- [ ] `sanity_check.py` still clean (no DB regressions — read-only sprint, should be trivial)
- [ ] **NOT done by Sonnet**: any Vercel deploy, hosting config, or live URL publish — user handles separately

---

# Notes for Claude Sonnet 4.6 specifically

**Process**:
1. **Two layers, strict boundary**: Python writes JSON, Next.js reads JSON. Never touch a DB connection from inside the `site/` directory. Never `import` JSX from inside `analysis/`. This separation lets you fully finish the Python side before touching React, and re-run either side without breaking the other.
2. **Work in numerical order on each side**. Finish all 8 Python queries + JSON outputs before starting any React page. Then build the shared React primitives. Then instantiate the 8 routes from the template.
3. **Use `npm run dev` with hot-reload** while iterating on a single page. Don't `npm run build` after every small change — only at the end of D5.
4. **All SQL lives in `analysis/queries/` as .sql files**. Reuse via `df(open('analysis/queries/qNN_X.sql').read())`. Keeps queries inspectable and version-able. Never embed SQL inside Python orchestrator strings.

**Tech-stack specifics**:
5. **Tremor component reference**: `BarChart`, `LineChart`, `AreaChart`, `DonutChart`, `BarList`, `ScatterChart`, `Metric`, `Card`, `Tracker`, `BadgeDelta`. Docs at `https://tremor.so/docs/components/...`. Most props: `data` (array of objects), `index` (x-axis key), `categories` (y-axis keys), `colors` (Tailwind-style colour names). Tremor uses its own colour palette names (`indigo`, `emerald`, `rose`, `amber`, `slate`, `violet`, `cyan`, `fuchsia`) — map sector palette via the named-colours list, not raw hex.
6. **Recharts for what Tremor can't do**: heatmaps (custom grid of `<rect>` SVG via Recharts `<ScatterChart>` with custom shape, or just CSS grid + Tailwind colour intensity classes), Sankey (`<Sankey>` from Recharts), network (Recharts `<ScatterChart>` with positioned nodes + line overlays — for a 7-node graph this is trivial).
7. **Static export is the deliverable**: confirm `output: 'export'` in `next.config.mjs`. No server-side rendering, no API routes, no dynamic data fetching at runtime. Everything must be baked at build time.
8. **TypeScript interfaces per JSON shape**: declare them in `lib/data.ts` so each page imports a typed JSON object. Catches schema drift between Python output and JSX consumption.

**Discipline**:
9. **Charts must be deterministic**. No `Math.random()` jitter in chart code. If you need jitter for a scatter overlap, compute it in Python (with `np.random.seed(0)`) and bake it into the JSON.
10. **Don't manufacture findings**. If a chart shows nothing interesting, the findings markdown says so. The user explicitly values honest "no signal here" over invented narrative.
11. **Cross-reference between analyses**. If B2 references the same 81 companies as B7, link directly: `<Link href="/02-champions">the cross-instrument cohort</Link>`.
12. **One number per claim**. Don't say "many companies" — say "47 of 81 (58%)". Specificity buys credibility.
13. **Methodology citations are not optional**. Every analysis page must end with a `<Callout>` pointing to `/methodology` and `/limitations`. If a finding could be misread without scope context (coordinator-only, EL↔GR alias, IPCEI sister entities), that caveat goes in the findings prose, not buried.
14. **Stop conditions**: if any B-side gate fails, STOP. Don't proceed to the React layer until the data side is right. Don't manufacture findings to make a chart look interesting.

**Three rails (non-negotiable)**:
15. **No paid-API calls. No private-side data. No DB writes** (except A1 views). If you find yourself wanting to violate one, escalate.
16. **No deployment work**. No `vercel.json`, no GitHub Actions, no `.env.production`, no Vercel CLI calls. User handles deploy separately. The sprint is done when `npm run build` produces a working `site/out/`.

**Closing**:
17. **Closing tasks are part of the sprint**: documentation updates + memory entry + sanity check. The Sprint 8 retrospective showed these slip — don't declare the sprint done without them.
18. **Honest report**: when you summarise the sprint to the user, lead with what the *data* says, not what the *site* looks like. The site is the surface; the findings are the product.
