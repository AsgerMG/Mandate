# Resume here

State of the Mandate consolidation, for whoever picks it up next. The full plan,
including the owner's decisions, is at `~/.claude/plans/mutable-waddling-teacup.md`.

## OPEN LOOPS (read first; close before starting anything new)
Principle (owner, 9 Nov): finish before moving on. A change is done when it is
merged, deployed (Railway: explicit commitSha deploy) and verified. Anything
that cannot close now is listed here with its trigger and owner; remove the
line in the commit that closes it. Sections below this one are history.

OWNER: `bash ~/Mandate/mandate/ops/next.sh` prints what is done and the one command to run next (read-only).

| # | Loop | Trigger | Who |
|---|---|---|---|
| 0 | Owner left 9 Nov ~17:45 UTC. On resume: `bash mandate/ops/next.sh`, check run 114 (`mandate.runs`), check the sector-display agent's branch `sector-display` (may be incomplete: laptop closed mid-work; resume or redo, then merge) | resume | Claude |
| 1 | Capina: `retire_capina.sh --apply` (gzip fix d6fba558; dump already uploaded). Commit `mandate/ops/archives.json` it writes, then remove CAPINA_* from `_railway.sh` and `suspend_capina_cron.sh` | now | owner runs, Claude commits |
| 2 | Vercel: `delete_vercel_projects.sh --apply` (env vars already saved to ~/Mandate-backups/vercel/); then drop the stale regina rows from policy/DEPLOYMENT.md | now | owner |
| 3 | Merge `llm-batches` (apply `mandate/db/llm_batches.sql` first) | run 114 finished | Claude |
| 4 | Merge `sector-display` (29 funds keep sector focus for display; recall set stays out of ranking; owner decision 9 Nov); clear the hold in `mandate/ops/holds.txt` | agent done | Claude |
| 5 | `rerun_capital.sh` (deploys main: FX, cron-fixes, batches, sector fix; publishes the census -> GitHub green) | 3 + 4 | owner |
| 6 | `restore_weekly_cron.sh` | 5's run finished | owner |
| 7 | Verify the loop-5 run: every step ok, census ok, check_verdicts green | after 5 | Claude |
| 8 | `one_model_drop_old.sh` then `--apply`; merge the migration it writes BEFORE Sun 03:00 UTC | after 7 | owner runs, Claude merges |
| 9 | `drop_policy_duplicates.sh` then `--apply`; remove LegacyPassage/LegacyDocumentVersion from policy/data/models.py in the same change | after 7 | owner runs, Claude commits |
| 10 | Laptop backups (~5 GB in ~/Mandate-backups): copy what is not yet in the bucket, verify, then free the laptop copies (check-then-delete script) | after 1-9 | Claude writes, owner runs |
| 11 | Agent platform phase 1 (`agent-runtime` 661a060c): reconcile with the owner's untracked workspace files, merge; 4 SQL files; mandate-api Railway service; 3 Vercel env vars (PLATFORM.md) | after 1-10 | Claude, owner for env |
| 12 | Prune this file's dated history below | after 1-11 | Claude |

## The goal (owner, 5-6 Nov 2026)
One repo, one database, one website, one refresh run, and one embedding model,
with every brain on current intel. Nothing is lost: unused things are archived,
never deleted. Decisions go to the owner as a 30-second what/why/cost brief.

## 7 Nov: `final-foundation` (PR #30, NOT merged): the last foundation steps
Owner-runnable, each dry-run first, idempotent. Order:
1. `bash mandate/ops/one_model.sh` -> `--apply` (capital migration 036 adds
   `embedding_v4 halfvec(1024)` beside each legacy vector; backfill ~$0.23,
   21,375 rows; verify) -> `--flip` on a branch (spaces.json `stored` + TS
   mirror + semantic cache; merging it IS the deploy) -> later, briefed,
   `bash mandate/ops/one_model_drop_old.sh` (archive + drop the old columns).
   Acceptance: `npm run stages` before/after (`one_model.sh --measure`).
   99 instruments (84 publishable) have no eligibility embedding BY DESIGN:
   only llm_classified (unquoted) requirements, which are not indexed.
2. `bash mandate/ops/citation_gaps.sh` (171 URLs, 790 rows; refuses until the
   grounding store has rows and migration 034 has run; $0).
3. `bash mandate/ops/pertinence.sh` -> `--apply` (1,345 gates, ~$7.3 est,
   capped at $20; commit capital/data/eligibility_pertinence.json after).
Data reds left in capital CI (need a production write or the owner): one
gate-encoding correction reverted (eit_digital_vap g1_vip_location; restore
with apply_gate_encoding_corrections.py), check_answer_reach (ownerOver25 is
asked and read by nothing: wire it or stop asking), the corpus-feed checks,
and app/page.tsx's "EUR 7.5m" (main's in-flight home page, which also imports
the untracked components/mandate/companions).

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

## FIRST THING NEXT SESSION (6 Nov, late)
- go_live_sunday.sh FAILED with DiskFull on the Railway DB VOLUME (5 GB, Hobby
  plan: it can't grow without Pro at ~$20/mo; the owner said NO upgrade). The
  rollback was clean: grounding is empty, the DB is 2.8 GB, services are up.
- Fix = option B (owner-approved): make policy_to_grounding.py migrate in
  committed, resumable batches (per document chunk), insert embeddings in
  batches, and build the HNSW index LAST (serial, maintenance_work_mem 256MB).
  If still tight, temporarily drop policy's old HNSW index (~1 GB, an index,
  not data; Regina's search is slower during the window). Measure free volume
  space first (Railway API volumeInstances currentSizeMB).
- After the cutover (policy_on_grounding.sh + merge policy-on-grounding):
  archive (pg_dump) and drop policy's old duplicate text/vectors (~1.5 GB
  freed). Brief the owner first: it is a deletion.
- Storage optimisation (owner, 6 Nov), in the batched migration and right
  after: (1) drop policy's old float32 vectors once the halfvec copy is
  verified (~0.5 GB); (2) replace the old HNSW (~970 MB) with the halfvec one
  (~540 MB), trying leaner m/ef_construction measured on fixed queries;
  (3) measure exact-duplicate boilerplate passages across documents and
  embed each once; (4) superseded versions: keep their text, move or drop
  their vectors (search uses only current versions). Target: the DB well
  under the 5 GB Hobby volume with headroom. Deletions are briefed first.
- Steps 4-6 of go_live_sunday (cron inputs, cases.json, refresh-cron
  retirement, Vercel BUCKET_*, capital-etl redeploy) did NOT run. Sunday's
  cron WILL still run the new orchestrator (start command is set), but without
  bucket inputs the instrument rebuild refuses (cases.json pinned) and the run
  ends partial. refresh-cron is still active, so policy is refreshed twice on
  Sunday: harmless.

## 6 Nov night: pick up here
- go_live_sunday.sh was RE-RUN with the HNSW fix (serial build: Railway's
  /dev/shm is too small for a parallel build). Log: ~/Mandate-backups/
  go_live_sunday.log. Verify: grounding counts (~10,771 docs / 11,599 versions
  / 125,745 passages), eligibility_grounding, BUCKET_* on capital-etl and
  Vercel, refresh-cron unscheduled.
- `policy-on-grounding` (13b960c5) is DONE and NOT merged. Order: go-live
  finished -> owner runs `bash mandate/ops/policy_on_grounding.sh` (not during
  Sun 03:00 UTC) -> merge IMMEDIATELY (Regina redeploys onto the grounding
  views).
- `mandate-profile` MERGED. mandate/vocabulary (one sector list, size derived
  from the EU SME bands, D1-D20) and mandate/profile. Tables accounts /
  workspaces / company_profiles(+versions, append-only) are LIVE. Regina's
  B2C consumer-law bug (D19) is fixed on main. Open: policy's eval panel uses
  free-text sectors (6 of 10 refused).
- After those: one command for the re-embed (~$0.25), the 171 missing pages and
  the pertinence classification (<$20), then re-measure stages.

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
