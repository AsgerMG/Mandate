"""Is the weekly ETL actually going to run, and will it run this code?

── Why reading `railway status` is not verification ───────────────────────
trigger_etl_now.py restores the real schedule in a `finally` and then "verifies"
it. What it verified was this:

    def current_schedule() -> str:
        out = subprocess.run(RAILWAY + ["status"], ...)
        for line in out.stdout.splitlines():
            if SERVICE_NAME in line:
                return line.strip()

The first line of `railway status` containing "etl-pipeline" is the bare service
name under "Linked service". So the function returned the string
`"etl-pipeline"` and the script printed `restored: etl-pipeline`, which contains
no schedule at all and would have printed identically had the restore failed
completely. It is the same defect the whole repo keeps finding: work reporting
success having checked nothing.

── And there are two schedules, not one ───────────────────────────────────
A Railway cron service has a schedule in the SERVICE INSTANCE config, which
`serviceInstanceUpdate` writes over the API, and a schedule baked into the
DEPLOYED serviceManifest, which only a deploy updates. trigger_etl_now.py's own
docstring records that Railway keeps running the previously deployed
configuration — that is why it deploys after the API write.

Observed on 2026-08-07:

    serviceInstance.cronSchedule            "0 3 * * 0"      the real one
    latestDeployment ... cronSchedule       "19 23 * * *"    the temporary one
    latestDeployment.status                 CRASHED

The API write of the restore had succeeded and its deploy had not, so the two
halves of the answer disagreed and `railway status` showed only the reassuring
half. Verification therefore has to read BOTH, and say so when they differ.

── And whether the image is this code ─────────────────────────────────────
The service has no repo trigger (`repoTriggers: []`); it is deployed by CLI
upload and nothing redeploys it when main changes. So the deployment's build
timestamp is compared against the last commit that touched the ETL: an image
older than the code is an ETL running last week's bugs on this week's data.

Usage:
  python3 ETL/lib/verify_cron.py             # report; exit 1 if anything is off
  python3 ETL/lib/verify_cron.py --deploy    # put it right, then verify
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

_sys.path.insert(0, str(_Path(__file__).resolve().parent))

import argparse  # noqa: E402
import datetime as dt  # noqa: E402
import json  # noqa: E402
import subprocess  # noqa: E402
import time  # noqa: E402

from railway_service import (  # noqa: E402
    ENVIRONMENT_ID, REAL_CRON_SCHEDULE, REAL_START_COMMAND, SERVICE_ID,
    deploy, deployed_config, service_instance,
)

ROOT = _Path(__file__).resolve().parents[2]

# Deployment states in which the cron definition is live. CRASHED is included
# on purpose: a cron job whose last RUN exited non-zero is marked CRASHED while
# its schedule remains perfectly valid, and treating that as a broken schedule
# would cry wolf every time one scraped website returns a 403.
LIVE_STATES = {"SUCCESS", "CRASHED", "SLEEPING", "DEPLOYING", "BUILDING", "INITIALIZING"}


def last_etl_commit() -> dt.datetime | None:
    """When the code the container should be running last changed."""
    out = subprocess.run(
        ["git", "-C", str(ROOT), "log", "-1", "--format=%aI", "--",
         "ETL", "website/build", "Dockerfile", "requirements.txt"],
        capture_output=True, text=True)
    if out.returncode != 0 or not out.stdout.strip():
        return None
    return dt.datetime.fromisoformat(out.stdout.strip()).astimezone(dt.timezone.utc)


def check() -> list[str]:
    problems: list[str] = []
    inst = service_instance()
    dep = deployed_config()

    configured = inst.get("cronSchedule")
    start = inst.get("startCommand")
    print(f"  service instance   cron {configured!r}  start {start!r}")

    if configured != REAL_CRON_SCHEDULE:
        problems.append(
            f"the service instance is set to {configured!r}, not the real weekly "
            f"schedule {REAL_CRON_SCHEDULE!r}. A trigger run did not restore it.")
    if start != REAL_START_COMMAND:
        problems.append(
            f"the start command is {start!r}, not {REAL_START_COMMAND!r}. The "
            f"service was probably left in the woken 'sleep infinity' state, in "
            f"which Railway restarts it on exit and the ETL never runs on a clock.")

    if not dep:
        problems.append("there is no deployment at all; nothing is scheduled to run.")
        return problems

    print(f"  latest deployment  cron {dep['cronSchedule']!r}  "
          f"status {dep['status']}  built {dep['createdAt']:%Y-%m-%d %H:%M} UTC")

    if dep["cronSchedule"] != configured:
        problems.append(
            f"the DEPLOYED schedule is {dep['cronSchedule']!r} but the service "
            f"instance says {configured!r}. Railway runs the deployed "
            f"configuration, so the schedule that was written over the API is "
            f"not the one in force. The API write landed and its deploy did not.")
    if dep["cronSchedule"] != REAL_CRON_SCHEDULE:
        problems.append(
            f"the DEPLOYED schedule is {dep['cronSchedule']!r}, not "
            f"{REAL_CRON_SCHEDULE!r}.")
    if dep["status"] not in LIVE_STATES:
        problems.append(
            f"the latest deployment is {dep['status']}, which is not a state in "
            f"which the cron is live.")

    commit = last_etl_commit()
    if commit and dep["createdAt"] < commit:
        age = (commit - dep["createdAt"]).total_seconds() / 86400
        problems.append(
            f"the deployed image was built {age:.1f} days BEFORE the last commit "
            f"to the ETL ({commit:%Y-%m-%d %H:%M} UTC). The service has no repo "
            f"trigger, so a fix on main does not reach the weekly run until "
            f"somebody deploys. Re-run with --deploy.")
    return problems


def restore_and_verify(mode: str = "deploy", attempts: int = 3, settle_s: int = 12) -> list[str]:
    """Write the real configuration, make it take effect, and confirm from Railway.

    Retried, because the failure this exists for is a deploy that did not happen
    while the API write did — and one un-retried `railway up` is how the weekly
    refresh stops silently. Confirmation is a read from Railway after the write,
    never the write's own return value.

    Only mode "deploy" exists, and that is the finding rather than an omission:
    re-issuing the existing build replays its own baked manifest, so it cannot
    correct a schedule. See railway_service.redeploy().
    """
    from railway_service import set_service_instance

    # ── EVERY CALL HERE REACHES RAILWAY, SO EVERY ONE CAN FAIL ──────────────
    # This is THE repair command — the one every other failure path prints as
    # the fix — and on 2026-08-19 it died on the outage it exists to repair:
    # `set_service_instance` sat outside the try, Railway's control plane
    # returned `Unauthorized` for a minute, and the repair exited on a stack
    # trace with the weekly ETL still off. `check()` had the same hole.
    #
    # A repair tool must be the most patient thing in the system, not the most
    # brittle. Nothing below raises on a transport failure; a failed attempt is
    # an attempt, and the loop keeps its own counsel until it has either
    # confirmed the schedule or run out of attempts.
    last: list[str] = []
    for attempt in range(1, attempts + 1):
        print(f"\n-- restore attempt {attempt}/{attempts} ({mode})")
        try:
            set_service_instance(REAL_START_COMMAND, REAL_CRON_SCHEDULE)
        except Exception as exc:                       # noqa: BLE001
            last = [f"the config write failed: {exc!r}"]
            print(f"   config write failed: {exc}")
            time.sleep(10)
            continue
        try:
            deploy(f"restore weekly schedule {REAL_CRON_SCHEDULE} (verify_cron)")
        except Exception as exc:                       # noqa: BLE001
            last = [f"the {mode} failed: {exc!r}"]
            print(f"   {mode} failed: {exc}")
            time.sleep(10)
            continue
        # Railway needs a moment before the new deployment is the latest one.
        for _ in range(20):
            time.sleep(settle_s)
            try:
                problems = check()
            except Exception as exc:                   # noqa: BLE001
                last = [f"Railway could not be read back: {exc!r}"]
                continue
            last = problems
            if not problems:
                return []
        print("   still not verified; retrying")
    try:
        return check()
    except Exception as exc:                           # noqa: BLE001
        return last or [f"Railway could not be read at all: {exc!r}"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--deploy", action="store_true",
                    help="upload this working tree, deploy, and verify. This is "
                         "the ONLY thing that changes the schedule Railway runs: "
                         "re-issuing an existing deployment replays its own baked "
                         "manifest and leaves the disagreement in place — see "
                         "railway_service.redeploy()")
    ap.add_argument("--json", action="store_true", help="machine-readable result")
    args = ap.parse_args()

    print(f"etl-pipeline ({SERVICE_ID[:8]}) in environment {ENVIRONMENT_ID[:8]}")
    problems = restore_and_verify("deploy") if args.deploy else check()

    if args.json:
        print(json.dumps({"ok": not problems, "problems": problems}))
    if problems:
        print(f"\nFAILED: {len(problems)} problem(s) with the weekly ETL.")
        for p in problems:
            print(f"  - {p}")
        if not args.deploy:
            print("\n  python3 ETL/lib/verify_cron.py --deploy   "
                  "uploads this tree, redeploys, and confirms it from Railway")
        return 1
    print("\nok — the weekly ETL is scheduled, deployed, and running this code.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
