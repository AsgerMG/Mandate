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


def _set_service_instance(start_command: str | None, cron_schedule: str | None) -> None:
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
    """Set startCommand to sleep infinity, deploy, and wait for RUNNING."""
    print("[railway_service] waking etl-pipeline (temporary sleep-infinity deploy)...")
    _set_service_instance("sleep infinity", None)
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


def restore() -> None:
    """Restore the real cron startCommand + schedule and redeploy (idle)."""
    print("[railway_service] restoring cron schedule...")
    _set_service_instance(REAL_START_COMMAND, REAL_CRON_SCHEDULE)
    subprocess.run(
        RAILWAY + ["up", "--service", SERVICE_NAME, "--environment", "production",
                   "--ci", "--message", "restore cron schedule (auto)"],
        check=True,
    )
    print("[railway_service] restored.")
