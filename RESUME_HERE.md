# Resume here

State of the Mandate consolidation, for whoever picks it up next. The full plan,
including the owner's decisions, is at `~/.claude/plans/mutable-waddling-teacup.md`.

## STATE (13 Nov, ~11:00): stopped on the monthly spend limit; resume after 13:00 Paris
- LIVE in production today: EIFO + InvestEU deciding core (13 docs/304 passages, 6 EIFO
  products, 42 cited gates, 20 status rules, intermediaries table with 60 rows,
  migration 041). Two prod-only schema differences were caught by the dry run and fixed
  (name_source 'curated'; identity gate ids).
- Merged today: visual case board (+ round-6-consistent example), trustworthy eval
  (leave-one-out, calibration, honest scores: fintech 3, forklift 4, held-out NL 2-3),
  EIFO core.
- Two agents stopped mid-work, WIP pushed, NOT merged; resume each with SendMessage or a
  fresh agent reading its last commit:
  - `generalise-method`: MERGED 13 Nov (7f79acd1). Left: the held-out measurement
    (heldout_hardware_nl_rd_relief + 2 others + fintech, leave-one-out, max 4 runs).
  - `process-maps`: MERGED 13 Nov (b1a0206b): process + leverage maps; the brains emit
    them on the fly per mandate/brains/CASE_BOARD.md. NOT yet seen in a live brain turn.
- NEXT when budget allows (owner, 13 Nov: "rerun cases to ensure all live up to the
  highest standard"): one FULL re-run of every eval case (leave-one-out, judged), with
  the generalised method + checklist + required board + process maps; check each brain
  emits a valid board with process maps live; then fix what falls short.
- Owner's calls: spend limit vs pacing to 5-hour windows; grade fintech (3?), forklift
  (4?), NL held-out (2-3?); home copy "advise and draft".

## MORNING BRIEF (13 Nov, 08:10)
**Overnight:** all three agents stopped at ~01:00 on the MONTHLY SPEND LIMIT; their work
was saved as WIP commits and pushed (`case-board` 22247f44, `trustworthy-eval` c9ca510e);
resumed 08:05 with `core-eifo-investeu` restarted fresh.
**Wincent, forklift case (Danish ApS + Bavarian GmbH):** after rounds 5-6 the answer
matches the owner's model answer in substance: mispriced market + public mission,
de-risk the company's OWN financing (EIFO-Guarantee + Contract Guarantee via the Danish
parent; Danske Bank's InvestEU guarantee; German Hausbank route second), never push the
cost to the customer, capital velocity, regulatory question handed to Regina. Precedent:
Norlase (EIB venture debt with InvestEU backing). Weakness left: velocity not quantified
(habit added: quantify from stated assumptions); run-to-run variance (the case board's
fixed structure is the fix).
**Playbook changes:** §4f rewritten (rounds 5-6), §4g quality bar (no excluded
instruments, explain the money logic, carry conditions, quantify with assumptions,
short). Regina got the consultant conversation mode.
**Critical review of the judgement loop:** answer-key leakage in the case library, an
uncalibrated self-judging judge, a leaky held-out case: being fixed on `trustworthy-eval`.
**Owner's 20% (one line each):** (1) the spend limit: raise it, or pace work to the
plan's 5-hour windows; (2) grade the runs in fable_report.md (even 3-4 help); (3) the
home page copy says the experts "do not draft" (9 Nov decision: advise AND draft).

## NEXT SESSION (13 Nov): start here
- **Judgement loop is on main** (b0ab6cce): judge, method.md's eight senior checks, case
  library (mandate/eval/cases -> mandate/playbooks/cases), `python3 -m mandate.eval.loop`,
  six held-out cases, data-gap miner (`mandate/eval/data_gaps.py`, list in
  mandate/eval/data_asks.md). State + next steps: mandate/plans/fable_report.md.
- **Owner to grade the 8 runs** listed in fable_report.md ("Owner gradings that would
  calibrate the judge"), in the bench (Train -> Grade runs) or here; then add them to
  mandate/eval/calibration.yaml and run the judge with --calibration.
- Then (budget-careful, plan usage is tight): after_scaffold on edtech_ai_kids +
  ai_kids_regulatory; the six held-out cases; wire the judge into the bench Re-test.
- **Regina SME interview**: bench Train -> Interviews, or "let's do the interview for Regina".
- Local app: `cd ~/Mandate/web && MANDATE_BENCH_LOCAL=1 npm run dev` -> localhost:3000/bench.
- Open question for the owner: home copy says the experts "do not draft"; the 9 Nov decision is advise AND draft.
- Paused: agent-on-railway (until API budget). API budget OFF (LLM_BUDGET=off).

## NEXT SESSION (saved 10 Nov evening at 91% usage): pick up here
**If the owner says "let's do the interview for Regina": run mandate/playbooks/interviews/regina_sme_interview.md (the 'How Claude runs it' section), live, one question at a time.**
Read first: mandate/plans/master_plan.md ("Decided 10 Nov" block), data_audit.md,
mandate/brains/wincent/grounding_map.md, mandate/playbooks/funding-routes.md (rounds 3, 3b, 4d, 4e).
Owner decisions: narrow first (W6 funding route plan, Italy + EU, until >= 4/5 on 5
cases); agent loop -> mandate-api on Railway; OWN management app with workflow/process
graphs (screens follow proven workflows); scope CORE DE/IT/FR/EU/UK, HUBS SE/DK/NO/NL/BE/ES.
Owner wants me to SPAR (positions, push-back), not just execute.

Three agents were stopped mid-work with WIP commits on their branches (not merged):
1. `batch-italy`: Italy deciding core (status_rules + match_status tool, TUB 106-107,
   current Fondo rules, DL 179/2012, Nuova Sabatini, S3 regional fit), live research +
   caching as the long tail, eval case robotics_deployment_it.yaml, load_batch_italy.sh.
2. `agent-on-railway`: Wincent's loop into mandate-api (background missions, NDJSON
   events), tools likely ported to Python SQL (plain search replacing the old ranker),
   website as thin proxy, bench kept on the same tools.
3. `data-tiers`: tiers in europe_scope.json + manifest (OUT refresh stops; Spain stays),
   equity stakes into find_precedents, read_agenda tool, usage log (mandate.tool_calls),
   archive_dead_weight.sh (~170 MB to bucket archive/2026-11/), old news down-ranked.
Findings saved by the stopped agents (10 Nov):
- agent-on-railway: PAUSED (11 Nov, my call, owner informed) until API budget exists: with the budget off the production advisor cannot run, so the move buys nothing yet; the bench is the test path. Resume it the day budget lands.
  (cff29ffe, design only, no code): chose to keep Wincent's capital tools
  in TypeScript behind an internal site endpoint, called by the new Python loop (porting
  would duplicate ~5k lines of eligibility logic). SPAR on this first: with "narrow
  first" (Italy + EU), a plain Python SQL search may now be small enough, and it retires
  the old ranker. Next: Python loop + mission-events table (POST /missions is taken).
- data-tiers (cdfe829e, findings only, no code): capital.request_log (mission quota) and
  capital.event_log (agent tool logging) are STILL WRITTEN: do not archive them; only
  brief_records is safe. Next: item 3 first (usage log: a hook in
  web/lib/mandate/agent/loop.ts + mandate.tool_calls).
- batch-italy (f15c0c15, real progress, NOT yet through preflight): 16 deciding texts
  pinned by sha256 (TUB 106-107, Banca d'Italia albi, current Fondo di Garanzia
  rules in force since 13 Oct 2023 + portfolio rules, DL 179/2012 arts 25/29, DL 3/2015
  art 4, DL 69/2013 art 2 Nuova Sabatini, six regions' S3 pages); migration 039 (8
  status keys, 16 status rules, 44 region priorities; the 2018 FdG text superseded, not
  deleted); match_status tool + find_instruments level/region filters (tests pass);
  bench --ground caches researched pages; local rehearsal loaded 16 docs / 365 passages,
  idempotent. Dropped (owner re-scope): bulk regional instruments, full 106 register;
  R&S&I credit + Transizione 5.0 texts (mimit.gov.it timed out). NEXT: write
  mandate/ops/load_batch_italy.sh (wraps capital/ETL/terms/load_batch_italy.py, dry run
  default, DB URL + bucket creds as in ground_pinned_input.sh, --apply passthrough), run
  rehearse_batch_italy.py --embed (~1 cent), add eval case robotics_deployment_it.yaml +
  a note in wincent.md, preflight, push. Merge it FIRST (it is the furthest along).
Resume each: read its last WIP commit message (git log -1 origin/<branch>), finish, review,
merge in this order: batch-italy, data-tiers, agent-on-railway (largest last).
Then: owner runs the load/archive commands; Wincent bench re-runs the fintech + Italian
robot cases (no API cost); interview round 4 (procurement, rule change mid-process,
"don't do this yet"); case library + judge calibration from graded cases.
Production state: budget OFF (LLM_BUDGET=off on all services; API account empty);
weekly cron Sundays 03:00 UTC on 604591e3+; Regina on 604591e3 (host give-up live);
all four CI workflows green; preflight covers all four. Capina deletes 11 Nov (grace).
Blocked on owner: API budget ($100 + $150/month cap), see mandate/plans/budget_brief.md.

## OPEN LOOPS (read first; close before starting anything new)
Principle (owner, 9 Nov): finish before moving on. A change is done when it is
merged, deployed (Railway: explicit commitSha deploy) and verified. Anything
that cannot close now is listed here with its trigger and owner; remove the
line in the commit that closes it. Sections below this one are history.

OWNER: `bash ~/Mandate/mandate/ops/next.sh` prints what is done and the one command to run next (read-only).

| # | Loop | Trigger | Who |
|---|---|---|---|
| 0 | Owner left 9 Nov ~17:45 UTC. On resume: `bash mandate/ops/next.sh`, check run 114 (`mandate.runs`), check the sector-display agent's branch `sector-display` (may be incomplete: laptop closed mid-work; resume or redo, then merge) | resume | Claude |
| 1 | Capina: owner deletes the project in the Railway dashboard (9 Nov). Its Postgres dump IS in the bucket (key sha256/a2/a29f6c9db47204cced7fb88a5bac0ce47e16513eb8b47e92b957e2f656870a11, sha matches MANIFEST): write that into a new `mandate/ops/archives.json`. The 653 MB railway_volume_db.sqlite is NOT uploaded yet (PUT timed out): do it in loop 10. Then remove CAPINA_* from `_railway.sh`, `suspend_capina_cron.sh`, `retire_capina.sh`'s delete step, and the Capina line in next.sh | owner deleted? check | Claude |
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
| 11b | DEADLINE 2026-12-01: Railway stops reading railway.json (Config as Code deprecated; warning printed 9 Nov). Migrate capital/, policy/, mandate/ railway.json to `.railway/railway.ts` (`railway config migrate`), check the start commands survive (the service-level overrides bit us twice) | before 1 Dec | Claude |
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

## Branch `llm-batches` (9 Nov, pushed, NOT merged)
Bulk LLM jobs on Message Batches via `mandate/llm/batch.py`; state in
`mandate.llm_batches`. BEFORE MERGING: `psql "$ADMIN_URL" -f
mandate/db/llm_batches.sql` (idempotent). Without it the weekly taxonomy step
submits nothing and is recorded PARTIAL (exit 3); pertinence refuses to submit.

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
