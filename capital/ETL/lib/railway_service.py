"""Read and set the etl-pipeline Railway service's deploy config.

What `verify_cron.py` and `trigger_etl_now.py` use: the service instance's
start command and cron schedule, read back from Railway (`service_instance`,
`deployed_config`) and written (`set_service_instance`, `deploy`, `redeploy`).

Until 2026-11-06 this module also held `wake()` and `restore()`, which woke the
cron-idle service so the two-store sync (`make pull-db`, `push_local.py`) could
SFTP the volume's db.sqlite. The corpus is in Postgres now and that sync is
archived, so they are too: ETL/archive/lib/railway_service_wake_restore.py.
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
