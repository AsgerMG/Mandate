# The three railway.json files, archived 24 Nov 2026

Railway read none of them: every service's `railwayConfigFile` is empty, so their watch patterns,
start command and cron were never the source of truth (Railway also deprecates Config as Code on
1 Dec 2026). The settings that run live ON THE SERVICES, read from the Railway API on 24 Nov:

| service | root | Dockerfile (from) | start command | cron | restart | sleep when idle |
|---|---|---|---|---|---|---|
| capital-etl | `/` | `capital/Dockerfile` (service setting) | `python3 /app/mandate/refresh/run.py` | `0 3 * * 0` (Sun 03:00 UTC) | never | no (a cron) |
| Regina | `/` | `policy/Dockerfile` (service setting) | the Dockerfile's CMD | none | on failure, 3 | yes |
| mandate-api | `/` | `mandate/Dockerfile` (variable `RAILWAY_DOCKERFILE_PATH`) | the Dockerfile's CMD | none | on failure, 3, healthcheck `/health` | yes |

Every deployment since 10 Nov built with the DOCKERFILE builder from those paths (deployment
manifests, 24 Nov).

**How the services deploy (decided 24 Nov, cost first: not live, developing):** NOT on push.
`bash mandate/ops/deploy_services.sh` deploys all three at `origin/main`. Run it after a change to
`capital/`, `policy/` or `mandate/` that the weekly run or the APIs need; a push alone ships only
the website (Vercel). To change a setting, change it on the service (dashboard or API), then
update the table above.

Archived with them (24 Nov): `policy_DEPLOYMENT_pre_monorepo.md` (the Regina repo's runbook: a
separate repo, auto-deploy on push, the deleted `refresh-cron`; none of it true since the monorepo)
and two one-off scripts that already ran (`finish_railway_config.sh` moved Regina's settings onto
the service; `fix_cron_and_run_now.sh` set capital-etl's start command). The current runbook is
PLATFORM.md.
