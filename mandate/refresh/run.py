"""Mandate's ONE weekly refresh: every brain, then the site artefacts.

    python3 mandate/refresh/run.py                 # what the Railway cron runs (Sun 03:00 UTC)
    python3 mandate/refresh/run.py --only capital  # one phase (a re-run by hand)

THE STEPS, recorded as one row in mandate.runs and one row per step in
mandate.run_steps (capital's own sub-steps land on the same run):

  1. capital   capital/ETL/events/extract/railway_cron.py: migrations, renew the
               AUTO sources, classify, REBUILD funding_instruments, the derived
               gate layer, the coverage gate, embeddings, the runtime priors, the
               weekly news ingest and digest, the guards and the census.
  2. policy    the policy API's refresh (POST /api/refresh), then wait for it on
               mandate.runs -- where policy records itself -- until it finishes.
  3. site      capital/website/build/build_site_data.py: public/data from the
               corpus as this run left it.
  4. publish   mandate/artefacts.py: public/data + the priors to the bucket, one
               release row. Every deploy's prebuild downloads it.

WHY ONE RUN, AND WHY HERE. Two crons (capital-etl at 03:00, refresh-cron at
05:00) never knew about each other, the instrument table was rebuilt by
nothing, the priors and the news digest were rebuilt by a laptop, and the site
rebuilt its data from Postgres on every deploy. One runner orders them and
writes down what happened. It is a mandate-level file because the run spans
brains; capital's chain stays capital's (railway_cron.py), and policy's refresh
stays inside the policy service, which holds its code, its dependencies and its
API key -- this runner calls it and waits on its durable record.

FAILURE POLICY. Capital failing skips site + publish (the corpus is half-built:
the last good release keeps serving). Policy failing is recorded and does not
stop the artefacts (capital's are independent of it). Exit 0 ok, 3 partial, 1
failed; the daily health check reads the record either way.

Env: DATABASE_URL (capital_app), POLICY_API_URL, REFRESH_SECRET, BUCKET_*.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from mandate.runs import RUN_ID_ENV, RunLog  # noqa: E402

CAPITAL = ROOT / "capital"
POLICY_WAIT_S = 8 * 3600       # policy's runs are multi-hour; its own stale limit is 12 h
POLL_S = 120


def _sub(log: RunLog, name: str, argv: list[str], cwd: Path, env: dict | None = None) -> str:
    with log.step(name) as s:
        rc = subprocess.run(argv, cwd=cwd, env={**os.environ, **(env or {})}).returncode
        s.exit_code = rc
        s.status = "ok" if rc == 0 else "partial" if rc == 3 else "failed"
        s.summary = f"exit {rc}"
    return s.status


def policy_phase(log: RunLog, db_url: str) -> str:
    import httpx  # noqa: PLC0415
    import psycopg  # noqa: PLC0415
    api = os.environ.get("POLICY_API_URL", "").rstrip("/")
    with log.step("policy refresh") as s:
        if not api:
            s.status, s.summary = "failed", "POLICY_API_URL not set"
            return s.status
        t0 = time.time()
        r = httpx.post(f"{api}/api/refresh", timeout=60,
                       headers={"X-Refresh-Secret": os.environ.get("REFRESH_SECRET", "")})
        s.detail["trigger"] = {"http": r.status_code, "body": r.text[:300]}
        if r.status_code != 200:
            s.status, s.summary = "failed", f"POST /api/refresh: HTTP {r.status_code}"
            return s.status
        # Wait on the DURABLE record, not the API's memory: a policy redeploy
        # mid-run must read as an abandoned run, not as "idle, all fine".
        deadline = time.time() + POLICY_WAIT_S
        row = None
        while time.time() < deadline:
            with psycopg.connect(db_url, autocommit=True) as c:
                row = c.execute(
                    "SELECT id, status, summary, heartbeat_at FROM mandate.runs "
                    "WHERE brain = 'policy' AND started_at >= to_timestamp(%s) - interval '5 minutes' "
                    "ORDER BY started_at DESC LIMIT 1", (t0,)).fetchone()
            if row and row[1] != "running":
                break
            log.heartbeat()
            time.sleep(POLL_S)
        if not row:
            s.status, s.summary = "failed", "policy recorded no run (is the API on a build with mandate.runs?)"
        elif row[1] == "running":
            s.status, s.summary = "failed", f"policy run {row[0]} still running after {POLICY_WAIT_S // 3600} h"
        else:
            s.status = {"ok": "ok", "partial": "partial"}.get(row[1], "failed")
            s.summary = f"policy run {row[0]}: {row[1]} {row[2]}"[:500]
            s.detail["policy_run_id"] = row[0]
    return s.status


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["capital", "policy", "site", "publish"])
    ap.add_argument("--trigger", default="cron")
    a = ap.parse_args()
    db_url = os.environ["DATABASE_URL"]
    log = RunLog.start(db_url, brain="mandate", kind="weekly_refresh", trigger=a.trigger)
    env = {RUN_ID_ENV: str(log.id)} if log.id is not None else {}
    want = (lambda p: a.only in (None, p))
    results: dict[str, str] = {}
    if want("capital"):
        results["capital"] = _sub(log, "capital", [sys.executable, "ETL/events/extract/railway_cron.py"],
                                  CAPITAL, env)
    if want("policy"):
        results["policy"] = policy_phase(log, db_url)
    capital_ok = results.get("capital", "ok") != "failed"
    if want("site"):
        if capital_ok:
            results["site"] = _sub(log, "site data", [sys.executable, "website/build/build_site_data.py"], CAPITAL)
        else:
            log.skip_step("site data", "capital failed: the last good release keeps serving")
            results["site"] = "skipped"
    if want("publish"):
        if capital_ok and results.get("site", "ok") != "failed":
            results["publish"] = _sub(log, "publish artefacts",
                                      [sys.executable, str(ROOT / "mandate/artefacts.py"), "publish",
                                       "--web", str(ROOT / "web"), *(["--run-id", str(log.id)] if log.id else [])],
                                      ROOT)
        else:
            log.skip_step("publish artefacts", "capital or site data failed")
            results["publish"] = "skipped"
    vals = set(results.values())
    status = "failed" if "failed" in vals else "partial" if vals & {"partial", "skipped"} else "ok"
    log.finish(status, ", ".join(f"{k} {v}" for k, v in results.items()), {"phases": results})
    print(f"=== MANDATE REFRESH: {status} ({results}) ===", flush=True)
    return {"ok": 0, "partial": 3}.get(status, 1)


if __name__ == "__main__":
    sys.exit(main())
