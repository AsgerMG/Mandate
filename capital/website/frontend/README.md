# frontend — the Wincent website (Next.js)

The published site. Part of the `website/` block; see [../README.md](../README.md) for how
`build/` (the Python JSON builders) feeds this app. This app reads **only**
`public/data/*.json` (generated) plus `project-mgmt/methodology.md` (read at build time by
the methodology + limitations pages).

## Run

```bash
npm run dev        # dev server at http://localhost:3000
npm run build      # static build → out/  (prebuild runs ../build/build_site_data.py --check)

npm run check      # EVERYTHING free: types, unit tests + coverage, vocabulary
                   # contract, 12-archetype regression, payload budget,
                   # dependency audit. This is what CI runs — if it passes
                   # here it passes there. No API calls, no spend.
npm run test       # just the unit tests
npm run health     # operational digest from Postgres: errors, degradations,
                   # spend against the daily ceiling. Exits non-zero when
                   # something needs attention, so it can be a cron.
npm run vocab      # regenerate data/vocabularies.json after changing any
                   # option list in types.ts — the Python ETL reads that file,
                   # and check_vocabularies fails if it is stale.
npm run trace      # free: which instruments reach the writer, per archetype
npm run board      # free: score every brief ever generated against known defects
npm run bench      # COSTS MONEY: real companies through the full pipeline
```

`npm run build`'s `prebuild` hook fails if the JSON in `public/data/` is stale versus
`data/db.sqlite` — regenerate it with `make data` from the repo root first.

## Layout

```
app/
  page.tsx                  home (KPIs, Europe map, taxonomy)
  for-companies/            the founder-facing brief (+ the LLM intelligence panel)
  companies/                client-side company lookup (reads public/data/companies/ shards)
  methodology/              renders project-mgmt/methodology.md
  limitations/              renders the "Known limitations" section of methodology.md
  api/intelligence/route.ts the server-side LLM report (Node runtime; keeps the API key off the client)
components/                 shared UI (nav, charts, finding, company-search, ui/ primitives)
lib/
  intelligence/             the LLM report feature: pipeline · corpus · types · panel
  data.ts format.ts palette.ts utils.ts
fund-processes/             per-instrument briefs the intelligence route reads at runtime (process.cwd)
public/data/                the generated JSON the app reads (written by website/build/)
```

## Notes

- The `/api/intelligence` route is the only server-rendered route; everything else is static.
- `fund-processes/` and `public/data/companies_index.json` are force-traced into the
  serverless function in `next.config.ts` (`outputFileTracingIncludes`) because the route
  reads them from disk at runtime.
- Don't add a barrel that re-exports the `"use client"` intelligence panel together with the
  server-only `lib/intelligence/corpus.ts` (fs reads) — it breaks under Turbopack. Import directly.
- This is a pinned, non-standard Next.js build — see [AGENTS.md](AGENTS.md) before editing.
