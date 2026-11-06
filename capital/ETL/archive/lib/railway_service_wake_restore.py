"""ARCHIVED 2026-11-06 (E2): wake() and restore(), cut from ETL/lib/railway_service.py.

They woke the cron-idle etl-pipeline service so the two-store sync could SFTP
the volume's db.sqlite (`make pull-db`, `push_local.py`, `pull_db.py`,
`promote_to_record.py`), then restored its schedule. That sync is archived
beside this file (the corpus lives only in Postgres since 2026-11-05), and no
kept module calls either function. Kept verbatim as the record. To run, it
needs the names it used from railway_service, imported below.
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "lib"))
from railway_service import (  # noqa: E402
    RAILWAY, REAL_CRON_SCHEDULE, REAL_START_COMMAND, SERVICE_NAME,
    _set_service_instance, deploy,
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

    ── AND THAT CONTRACT WAS ONLY TRUE OF ONE OF ITS THREE CALLS ────────────
    The sentence above was written when this function's only failure mode was
    `deploy()`, which was caught. `_set_service_instance()` and `check()` reach
    Railway too, and neither was. On 2026-08-19 the API returned `Unauthorized`
    for about a minute; the config write raised `CalledProcessError` straight
    out of a `finally`, replaced a clean "upload failed" with a stack trace,
    and left the service on `sleep infinity` with NO cron schedule — the exact
    outcome this docstring promises cannot happen. The live deployment then sat
    woken, and the weekly ETL was off until a person noticed.

    So every call that can reach the network is now inside the retry, and every
    failure becomes a PROBLEM STRING rather than an exception. `Exception` and
    not `BaseException`: a ctrl-c should still stop this, and it is the one
    exit where a human is present to read what happened.
    """
    from verify_cron import check  # local: verify_cron imports this module

    problems: list[str] = []
    for attempt in range(1, attempts + 1):
        print(f"[railway_service] restoring cron schedule (attempt {attempt})...")
        try:
            _set_service_instance(REAL_START_COMMAND, REAL_CRON_SCHEDULE)
        except Exception as exc:                       # noqa: BLE001
            problems = [f"the config write failed: {exc!r}"]
            print(f"[railway_service] config write failed: {exc}")
            time.sleep(10)
            continue
        try:
            deploy("restore cron schedule (auto)")
        except Exception as exc:                       # noqa: BLE001
            problems = [f"the deploy failed: {exc!r}"]
            print(f"[railway_service] deploy failed: {exc}")
            time.sleep(10)
            continue
        for _ in range(10):
            time.sleep(10)
            try:
                problems = check()
            except Exception as exc:                   # noqa: BLE001
                problems = [f"Railway could not be read back: {exc!r}"]
                continue
            if not problems:
                print("[railway_service] restored, and confirmed from Railway.")
                return []
    print("\n[railway_service] RESTORE NOT CONFIRMED — the weekly ETL may not run:")
    for p in problems or ["no deployment state could be read"]:
        print(f"  - {p}")
    print("  python3 ETL/lib/verify_cron.py --deploy   to repair by hand\n")
    return problems or ["restore could not be confirmed"]
