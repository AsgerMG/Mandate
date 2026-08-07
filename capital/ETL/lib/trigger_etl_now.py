"""Run the weekly Railway ETL cron NOW, then put the schedule back.

The etl-pipeline service is a Railway CRON job (`0 3 * * 0`). Railway fires a
cron service on its schedule and nowhere else: a redeploy does not run it, and
clearing the schedule turns it into a normal service, which Railway restarts on
exit -- i.e. the ETL would loop forever. So the only safe way to force a run is
to move the schedule to a minute a few minutes away, let it fire once, and
restore.

The restore is the whole risk. If it does not happen the weekly refresh stops
silently, which is exactly the class of failure this project keeps finding, so
it runs in a `finally` and the script verifies the schedule afterwards rather
than assuming it.

    python3 ETL/lib/trigger_etl_now.py            # trigger, wait, restore
    python3 ETL/lib/trigger_etl_now.py --restore  # repair a bad state by hand

What the run does (ETL/events/extract/railway_cron.py):
    renew.py --auto            fetch whatever each source has published since
    classify_taxonomy apply-nace
    classify_taxonomy run --max-cost 20    LLM classification, cost-capped
    sanity_check.py
    detect_eligibility_gaps.py
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone

from railway_service import (  # noqa: E402
    ENVIRONMENT_ID, RAILWAY, REAL_CRON_SCHEDULE, REAL_START_COMMAND,
    SERVICE_ID, SERVICE_NAME, _api,
)

# Minutes ahead to aim the temporary schedule. Needs to cover the API round
# trip and Railway noticing the new schedule; too tight and the minute passes
# before it is registered, and the run silently never happens.
# The deploy itself takes a few minutes, and the temporary minute must still be
# in the future when it lands.
LEAD_MINUTES = 9


def set_schedule(cron: str, deploy: bool = False) -> None:
    """Write the schedule, and optionally DEPLOY so Railway picks it up.

    The deploy is not optional in practice and skipping it is why the first
    attempt at this silently did nothing: `serviceInstanceUpdate` records the
    new cronSchedule, Railway keeps running the previously deployed
    configuration, and the temporary minute passes with no run. The logs still
    ended in `ALL STEPS COMPLETE` -- from the previous Sunday -- so the failure
    looked exactly like success until the timestamps were checked. Same shape
    as every other defect found this week: work that reported success having
    done nothing. `railway_service.wake()` always deployed; this did not.
    """
    _api(
        "mutation($serviceId: String!, $environmentId: String, "
        "$input: ServiceInstanceUpdateInput!) { serviceInstanceUpdate("
        "serviceId: $serviceId, environmentId: $environmentId, input: $input) }",
        {
            "serviceId": SERVICE_ID,
            "environmentId": ENVIRONMENT_ID,
            "input": {"startCommand": REAL_START_COMMAND, "cronSchedule": cron},
        },
    )
    if deploy:
        subprocess.run(
            RAILWAY + ["up", "--service", SERVICE_NAME, "--environment", "production",
                       "--ci", "--message", f"cron schedule -> {cron} (trigger_etl_now)"],
            check=True,
        )


def current_schedule() -> str:
    """Read the schedule back from Railway rather than trusting the write."""
    out = subprocess.run(RAILWAY + ["status"], capture_output=True, text=True)
    for line in out.stdout.splitlines():
        if SERVICE_NAME in line:
            return line.strip()
    return "(not found)"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--restore", action="store_true",
                    help="only put the real schedule back, for repairing a bad state")
    args = ap.parse_args()

    if args.restore:
        set_schedule(REAL_CRON_SCHEDULE, deploy=True)
        print(f"restored: {current_schedule()}")
        return 0

    fire_at = datetime.now(timezone.utc) + timedelta(minutes=LEAD_MINUTES)
    temp = f"{fire_at.minute} {fire_at.hour} * * *"
    print(f"now      {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC")
    print(f"firing   {fire_at:%H:%M} UTC  (temporary schedule '{temp}')")

    try:
        set_schedule(temp, deploy=True)
        print(f"set:     {current_schedule()}")
        # Wait past the firing minute, then a little longer so the run is
        # visibly under way before the schedule is put back. Restoring while
        # the container is starting does not kill it -- the run is already
        # dispatched -- but observing it first is the point.
        wait_s = (fire_at - datetime.now(timezone.utc)).total_seconds() + 90
        print(f"waiting  {int(wait_s)}s for the run to start...")
        time.sleep(max(0, wait_s))
        print(f"after:   {current_schedule()}")
    finally:
        set_schedule(REAL_CRON_SCHEDULE, deploy=True)
        print(f"restored: {current_schedule()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
