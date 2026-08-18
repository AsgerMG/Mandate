"""Wake/restore the etl-pipeline Railway service around file transfers.

The service is a batch cron job (idle between Sunday runs) -- Railway's
volume-file SFTP transfer (used by `make pull-db` and push_local.py's push
step) needs a RUNNING container, which a cron-idle service doesn't have.
This wakes it (temporary startCommand=sleep infinity), waits for RUNNING,
and restores the real startCommand+cronSchedule afterwards -- automating
what was, until now, a manual multi-step dance repeated by hand all night.

Usage (as a library, not a CLI):
    from railway_service import wake, restore
    wake()
    try:
        ... do the file transfer ...
    finally:
        restore()
"""
from __future__ import annotations

import json
import subprocess
import time
from datetime import datetime, timezone

PROJECT_ID = "2a61c923-3a29-476e-b725-0f47b3c4ec0e"
ENVIRONMENT_ID = "64585403-a342-48a0-8253-9936ae262b6c"
SERVICE_ID = "f0b76865-5813-4027-9c6b-54b31f379c11"
SERVICE_INSTANCE_ID = "4fb00234-ff4e-4f5f-bb0a-22cee0c29e8a"
SERVICE_NAME = "etl-pipeline"
REAL_START_COMMAND = "python3 ETL/events/extract/railway_cron.py"
REAL_CRON_SCHEDULE = "0 3 * * 0"

RAILWAY = ["npx", "--yes", "@railway/cli"]


def _api(query: str, variables: dict) -> dict:
    result = subprocess.run(
        RAILWAY + ["api", query, "--variables", json.dumps(variables)],
        capture_output=True, text=True, check=True,
    )
    return json.loads(result.stdout)


def set_service_instance(start_command: str | None, cron_schedule: str | None) -> None:
    """Write the service instance config. This is HALF of a schedule change.

    Railway runs the schedule baked into the latest DEPLOYMENT, not the one in
    this config, so every caller must follow it with deploy(). Writing one
    without the other leaves the two disagreeing, which is exactly the state
    found on 2026-08-07: the instance said the weekly schedule, the deployment
    said a temporary daily one, and `railway status` showed only the first.
    """
    _api(
        "mutation($serviceId: String!, $environmentId: String, "
        "$input: ServiceInstanceUpdateInput!) { serviceInstanceUpdate("
        "serviceId: $serviceId, environmentId: $environmentId, input: $input) }",
        {
            "serviceId": SERVICE_ID,
            "environmentId": ENVIRONMENT_ID,
            "input": {"startCommand": start_command, "cronSchedule": cron_schedule},
        },
    )


# Kept so existing callers inside this module keep working; new code should use
# the public name, because "private" hid a function every caller needs.
_set_service_instance = set_service_instance


def deploy(message: str) -> None:
    """Upload this working tree and deploy it. Raises on failure.

    `check=True` is deliberate and load-bearing: the restore path used to
    swallow a failed deploy, so the API write landed, the deploy did not, and
    the weekly refresh was left running a temporary schedule with nothing
    saying so.
    """
    subprocess.run(
        RAILWAY + ["up", "--service", SERVICE_NAME, "--environment", "production",
                   "--ci", "--message", message],
        check=True,
    )


def redeploy(deployment_id: str) -> None:
    """Re-issue an existing build. It does NOT pick up a changed schedule.

    Tried on 2026-08-07 as the minimal repair for a service instance and a
    deployment that disagreed about the cron schedule, on the assumption that
    re-issuing the deployment would apply the current config. It does not:
    `deploymentRedeploy` replays the deployment's OWN baked serviceManifest.
    The new deployment came up SUCCESS still carrying `19 23 * * *` while the
    instance said `0 3 * * 0`, so the disagreement survived the repair intact
    and, had nobody read the manifest back, would have looked repaired.

    Kept, documented, and not used for schedule changes. Only `deploy()` —
    a fresh upload — rebakes the manifest. Left here so the next person does
    not spend the same half hour discovering it.
    """
    _api(
        "mutation($id: String!) { deploymentRedeploy(id: $id) { id status } }",
        {"id": deployment_id},
    )


def service_instance() -> dict:
    """The service instance config as Railway holds it — cron schedule, start
    command, and the latest deployment. Read back from the API rather than
    parsed out of `railway status`, whose human output contains the service
    name on a line of its own and will happily match a grep for it."""
    data = _api(
        "query($sid: String!, $eid: String!) { serviceInstance("
        "serviceId: $sid, environmentId: $eid) { cronSchedule startCommand "
        "latestDeployment { id status createdAt } } }",
        {"sid": SERVICE_ID, "eid": ENVIRONMENT_ID},
    )
    return data["data"]["serviceInstance"]


def deployed_config() -> dict | None:
    """The schedule and start command actually BAKED INTO the latest deployment.

    This is the one Railway runs. It is only reachable through the deployment's
    `meta.serviceManifest`, which is why nothing was comparing it.
    """
    data = _api(
        "query($id: String!) { deployments(first: 1, input: {serviceId: $id}) "
        "{ edges { node { id status createdAt meta } } } }",
        {"id": SERVICE_ID},
    )
    edges = data["data"]["deployments"]["edges"]
    if not edges:
        return None
    node = edges[0]["node"]
    manifest = (node.get("meta") or {}).get("serviceManifest") or {}
    deploy_cfg = manifest.get("deploy") or {}
    return {
        "id": node["id"],
        "status": node["status"],
        "createdAt": datetime.fromisoformat(
            node["createdAt"].replace("Z", "+00:00")).astimezone(timezone.utc),
        "cronSchedule": deploy_cfg.get("cronSchedule"),
        "startCommand": deploy_cfg.get("startCommand"),
    }


def _instance_status() -> str | None:
    result = subprocess.run(
        RAILWAY + ["status", "--json"], capture_output=True, text=True, check=True,
    )
    data = json.loads(result.stdout)
    for env_edge in data["environments"]["edges"]:
        for svc_edge in env_edge["node"]["serviceInstances"]["edges"]:
            node = svc_edge["node"]
            if node["serviceName"] == SERVICE_NAME:
                instances = node["latestDeployment"]["instances"]
                return instances[0]["status"] if instances else None
    return None


def wake(timeout_s: int = 180) -> None:
    """Set startCommand to sleep infinity, deploy, and wait for RUNNING.

    ── A FAILED WAKE MUST NOT LEAVE THE CRON OFF ─────────────────────────────
    Every caller invokes this OUTSIDE its `try`, because there is nothing to
    restore until the wake has happened — `pull_db.py` and `push_local.py` both
    do, and that is the natural shape. It means an exception raised anywhere
    below skips the caller's `finally` entirely.

    And the very first line has already written the config. On 2026-08-19 a
    `railway up` returned 1 ("Deploy failed", cause unrecorded by the CLI) and
    this function raised straight through: the service instance was left saying
    `sleep infinity` with NO cron schedule, the weekly ETL was off, and nothing
    in the process that failed said so. `verify_cron.py` found it, because
    somebody thought to run it.

    So the rollback belongs HERE, where the write happened, and not in every
    caller's `finally` where it provably cannot reach. The original exception
    is re-raised either way — a wake that failed must still be an error — and a
    rollback that ALSO fails is printed rather than swallowed, because at that
    point the schedule really is off and a person has to know.
    """
    print("[railway_service] waking etl-pipeline (temporary sleep-infinity deploy)...")
    _set_service_instance("sleep infinity", None)
    try:
        subprocess.run(
            RAILWAY + ["up", "--service", SERVICE_NAME, "--environment", "production",
                       "--ci", "--message", "wake for file transfer (auto)"],
            check=True,
        )
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            if _instance_status() == "RUNNING":
                print("[railway_service] awake.")
                return
            time.sleep(5)
        raise TimeoutError("etl-pipeline didn't reach RUNNING within timeout")
    except BaseException:
        print("[railway_service] the wake FAILED — rolling the schedule back before "
              "raising...")
        try:
            problems = restore()
        except BaseException as exc:      # noqa: BLE001 - reported, never hidden
            problems = [f"the rollback itself raised: {exc!r}"]
        if problems:
            print("[railway_service] AND THE ROLLBACK DID NOT TAKE. The weekly ETL "
                  "is OFF:")
            for pr in problems:
                print(f"  - {pr}")
            print("  python3 ETL/lib/verify_cron.py --deploy")
        raise


def restore(attempts: int = 3) -> list[str]:
    """Restore the real cron startCommand + schedule, and CONFIRM it took.

    The restore is the whole risk of every wake/trigger dance in this repo: if
    it does not happen the weekly refresh stops, and nothing else in the system
    would notice for a week. It used to be one un-retried `railway up` whose
    result was never read back — and on 2026-08-07 that is exactly what
    happened, leaving the service instance saying `0 3 * * 0` while the
    deployment Railway actually runs still carried a temporary daily schedule.

    So it retries, and then verifies by reading Railway rather than by trusting
    the write. It returns the remaining problems rather than raising, because
    every caller invokes it from a `finally` and an exception there would
    replace the real error with this one. Callers must check the return value.
    """
    from verify_cron import check  # local: verify_cron imports this module

    problems: list[str] = []
    for attempt in range(1, attempts + 1):
        print(f"[railway_service] restoring cron schedule (attempt {attempt})...")
        _set_service_instance(REAL_START_COMMAND, REAL_CRON_SCHEDULE)
        try:
            deploy("restore cron schedule (auto)")
        except subprocess.CalledProcessError as exc:
            print(f"[railway_service] deploy failed: {exc}")
            time.sleep(10)
            continue
        for _ in range(10):
            time.sleep(10)
            problems = check()
            if not problems:
                print("[railway_service] restored, and confirmed from Railway.")
                return []
    print("\n[railway_service] RESTORE NOT CONFIRMED — the weekly ETL may not run:")
    for p in problems or ["no deployment state could be read"]:
        print(f"  - {p}")
    print("  python3 ETL/lib/verify_cron.py --deploy   to repair by hand\n")
    return problems or ["restore could not be confirmed"]
