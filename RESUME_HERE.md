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
  row (`capital/ETL/archive/schema/consolidate/`). The old Capina DB is frozen
  read-only, and its cron is suspended.
- **Repo and deploys.** Vercel `wincent` and `regina` both deploy from
  AsgerMG/Mandate. The policy API and `capital-etl` (Sundays 03:00 UTC, first
  run 8 Nov) run on Railway from the repo.
- **Code ports.** The cron path, site build and signals are on Postgres
  (branches merged). Capital's site data is built from `capital_ro` at deploy
  (`capital/website/frontend/vercel.json`). The sqlite3 ratchet stands at 107.
- **CI.** Workflows run from the root `.github/`. Policy is green; capital is
  red (see the audit).

## Merged 6 Nov
- `mandate-web`: ONE Mandate site at `web/`, live on wincent-ai.eu (Vercel root
  `web`) and branded Mandate. Wincent is at /wincent and /brief, Regina at
  /regina. regina-ai.eu redirects are in web/vercel.json; the DOMAIN MOVE is the
  owner's command: `bash mandate/ops/move_regina_domain.sh`. Retire the Vercel
  project `regina` after that.
- `mandate-grounding`: the `grounding` schema (append-only), the
  `mandate/grounding` package, and ONE embedding model (`mandate/embedding/
  spaces.json`, voyage-4-large). Both Railway services now build from the repo
  ROOT (RAILWAY_DOCKERFILE_PATH; done, builds green).

## Grounding: production steps NOT yet run (brief the owner first)
Order (from the agent's report):
1. Apply mandate/db/grounding.sql plus the roles.sql grants with psql as admin.
   Do NOT use `apply_roles.py --apply`: it rotates every password, which breaks
   Vercel's sensitive env values.
2. `alembic upgrade head` in policy (link tables, e41c0a7b9d10).
3. Bucket credentials: `railway bucket credentials --bucket mandate-grounding`
   -> BUCKET_* variables on capital-etl (and policy).
4. policy_to_grounding.py --apply, then upload_manifest.py (11,599 objects,
   159 MB).
5. Upload the cron inputs (grounding_manifest_cron_inputs.jsonl, 386 MB), from
   the archive extracted under the session scratchpad.
6. Capital migration 034, then capital_sources_to_grounding.py --apply (6,694
   gate-to-document links).
7. Re-embed capital's 3 tables on voyage-4-large (~$0.23 total), cast policy to
   halfvec (about -500 MB), flip spaces.json, then re-measure `npm run stages`.
Open: the policy API still reads policy.passages until it is ported to
grounding.

## In flight (6 Nov, pushed; review, then merge)
- `e1-refresh-health` (4+ commits): one weekly refresh run, instrument rebuild,
  priors, weekly signals, mandate.runs log, the "Mandate health" issue.
- `e2-archive-ci` (9+ commits): archive the unreached code, CI down to the 49
  founder checks, data-defect fixes prepared as dry-run SQL (not run).
- Grounding go-live: schema + grants are LIVE. The owner was running
  `bash mandate/ops/go_live_grounding.sh` (idempotent; re-run if it failed: the
  disk filled during it, now freed). Verify the counts: ~10,771 documents,
  11,599 versions, 125,745 passages.
- Disk: agents' rehearsal DBs filled the disk (21 GB in the scratchpad). Agents
  must delete their own rehearsal DBs on finishing.

## 6 Nov evening: state for Sunday's first combined run (8 Nov 03:00 UTC)
- E1 + E2 MERGED. The sqlite3 ratchet is at 83. innovate_uk's name is declared
  (official_publication). Today's fixes are durable in programme_names +
  gate_encoding_overrides. applicant_identity_repairs is deliberately unchanged
  (curated August repairs win; the run's repair step applies them).
- DONE in production: mandate.runs/run_steps/artefact_releases;
  capital-etl start = `python3 mandate/refresh/run.py`, with POLICY_API_URL,
  REFRESH_SECRET and VOYAGE_KEY as references.
- OWNER RUNS: `bash mandate/ops/go_live_sunday.sh`. It re-runs the grounding
  go-live (it had NOT completed: the store was empty), uploads cases.json,
  retires refresh-cron, sets BUCKET_* on Vercel, and redeploys capital-etl.
- Monday: check `python3 mandate/health/check.py`, the "Mandate health" issue
  and `mandate.runs`. Then: re-embed on one model (~$0.25, re-measure stages);
  the pertinence classification (owner-APPROVED if it improves eligibility
  grounding; it does: it decides which requirements bear on a founder, which a
  conversational agent needs; run it after Sunday so it classifies current
  gates); wire the 6 VOYAGE checks into CI; 25 lint errors; Railway IaC
  (.railway/railway.ts); port the policy API to read grounding.

## 6 Nov afternoon
- E2 MERGED (archive + CI split). E2's 10 founder-data fixes were APPLIED to
  production (capital/project-mgmt/e2_data_fixes/fixes.sql, 10 rows). TODO
  before E1's weekly rebuild runs: add the same entries to the reference files
  (see that README), or a rebuild can undo them. Still to decide:
  bpifrance_innovup_leader_idf's name.
- VOYAGE_KEY GitHub secret added (owner-approved); wire the 6 checks into CI.
- E1 DONE, NOT MERGED (branch e1-refresh-health @57700085). Blockers before
  merging: the `innovate_uk` entry in reference/family_name_evidence.json (the
  rebuild refuses to guess), mandate/db/runs.sql (psql as admin), the
  cases.json upload, BUCKET_*/POLICY_API_URL/REFRESH_SECRET/VOYAGE_KEY on
  capital-etl, BUCKET_* on Vercel, capital-etl's start command ->
  `python3 mandate/refresh/run.py`, and retiring refresh-cron in the same
  change. First run is Sun 8 Nov 03:00 UTC.
- Pertinence classification (~<$20) DEFERRED: the owner is moving from the
  brief to a conversational product; run it when the conversation design needs
  it.
- mandate-ci is red: reembed_plan.py names a model outside mandate/embedding.

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
