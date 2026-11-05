# Resume here

State of the Mandate consolidation, for whoever picks it up next. The full plan,
including the owner's decisions, is at `~/.claude/plans/mutable-waddling-teacup.md`.

## The goal (owner, 5-6 Nov 2026)
One repo, one database, one website, one refresh run, and one embedding model,
with every brain on current intel. Nothing is lost: unused things are archived,
never deleted. Decisions go to the owner as a 30-second what/why/cost brief.

## Done (on main)
- **Database.** One Railway Postgres, a schema and role per brain, isolation
  proven (`mandate/db/`). Capital's SQLite corpus is loaded and verified row for
  row (`capital/ETL/schema/consolidate/`). The old Capina DB is frozen
  read-only, and its cron is suspended.
- **Repo and deploys.** Vercel `wincent` and `regina` both deploy from
  AsgerMG/Mandate. The policy API and `capital-etl` (Sundays 03:00 UTC, first
  run 8 Nov) run on Railway from the repo.
- **Code ports.** The cron path, site build and signals are on Postgres
  (branches merged). Capital's site data is built from `capital_ro` at deploy
  (`capital/website/frontend/vercel.json`). The sqlite3 ratchet stands at 107.
- **CI.** Workflows run from the root `.github/`. Policy is green; capital is
  red (see the audit).

## In flight (agent branches, pushed; review, then merge)
- `mandate-web`: the ONE Mandate site at `web/` (git mv of
  capital/website/frontend). Regina's pages are ported under `/regina`, with a
  shell offering two agent personas. After merge: Vercel root -> `web`,
  regina-ai.eu 301 -> wincent-ai.eu/regina, retire the Vercel project `regina`.
- `mandate-grounding`: shared append-only `grounding` schema, the
  `mandate/grounding` package (bucket `mandate-grounding`, EU, still empty) and
  `mandate/embedding` (one Voyage 4 model, halfvec). The migrations are
  rehearsed only. Production runs and the ~$1-2 re-embed need an owner brief
  first.

## Next (owner-approved 6 Nov)
- **E1: refresh and health.** Port `populate_funding_instruments` and the
  refresh.py emitters. The instrument table is NOT rebuilt by anything today,
  and the priors are frozen. Put them and the weekly signals digest (shown with
  its date, hidden when too old) into ONE run. Add a `mandate.runs` log, one
  "Mandate health" GitHub issue, and publish artefacts to the bucket.
- **E2: archive and CI.** Archive the ~180 `_ws*` one-offs, ~45 MB of findings
  and retired recall sets, the old sync tooling and the two-store checks. Cut CI
  to the 49 founder-tier checks. Fix the founder-facing data defects the audit
  listed.
- Phase C/D: re-embed on one model (re-measure `npm run stages`; baseline 36.1%,
  last 35.9% with timeouts), write the data-flow map into PLATFORM.md, and
  replace per-service railway.json with Railway IaC `.railway/railway.ts`.

## Open facts
- Policy data was 12 days stale (as_of 25 Oct). A manual refresh was started on
  6 Nov; confirm with `curl https://regina-production.up.railway.app/api/refresh`.
- 99 of 1,088 capital instruments have no eligibility embedding.
- The old Capina Railway project can be deleted after 12 Nov. Ask the owner.
- Backups: `~/Mandate-backups/2026-11-05` and iCloud, with MANIFEST.json.
