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
    REAL_CRON_SCHEDULE, REAL_START_COMMAND, deploy, deployed_config,
    set_service_instance,
)
from verify_cron import check, restore_and_verify  # noqa: E402

# Minutes ahead to aim the temporary schedule. Needs to cover the API round
# trip and Railway noticing the new schedule; too tight and the minute passes
# before it is registered, and the run silently never happens.
# The deploy itself takes a few minutes, and the temporary minute must still be
# in the future when it lands.
LEAD_MINUTES = 9


def set_schedule(cron: str) -> None:
    """Write the schedule AND deploy, because either alone is a no-op or a trap.

    Skipping the deploy is why the first attempt at this silently did nothing:
    `serviceInstanceUpdate` records the new cronSchedule, Railway keeps running
    the previously deployed configuration, and the temporary minute passes with
    no run. The logs still ended in `ALL STEPS COMPLETE` -- from the previous
    Sunday -- so the failure looked exactly like success until the timestamps
    were checked.

    It is one function rather than a flag for the same reason: the pair is not
    optional, and a `deploy=False` default is an invitation to leave the two
    halves of the configuration disagreeing.
    """
    set_service_instance(REAL_START_COMMAND, cron)
    deploy(f"cron schedule -> {cron} (trigger_etl_now)")


def describe() -> str:
    """What Railway will actually run, read back from the API.

    The previous version grepped `railway status` for the service name and
    returned the first matching line -- which is the bare service name printed
    under "Linked service", containing no schedule at all. It printed
    `restored: etl-pipeline` and would have printed exactly that had the
    restore failed completely.
    """
    inst = deployed_config()
    from railway_service import service_instance
    cfg = service_instance()
    if not inst:
        return f"instance {cfg.get('cronSchedule')!r}, no deployment"
    agree = "" if inst["cronSchedule"] == cfg.get("cronSchedule") else "  DISAGREE"
    return (f"instance {cfg.get('cronSchedule')!r}, deployed "
            f"{inst['cronSchedule']!r} ({inst['status']}){agree}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--restore", action="store_true",
                    help="only put the real schedule back, for repairing a bad state")
    args = ap.parse_args()

    if args.restore:
        problems = restore_and_verify("deploy")
        print(f"restored: {describe()}")
        return 1 if problems else 0

    fire_at = datetime.now(timezone.utc) + timedelta(minutes=LEAD_MINUTES)
    temp = f"{fire_at.minute} {fire_at.hour} * * *"
    print(f"now      {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC")
    print(f"firing   {fire_at:%H:%M} UTC  (temporary schedule '{temp}')")

    try:
        set_schedule(temp)
        print(f"set:     {describe()}")
        # Wait past the firing minute, then a little longer so the run is
        # visibly under way before the schedule is put back. Restoring while
        # the container is starting does not kill it -- the run is already
        # dispatched -- but observing it first is the point.
        wait_s = (fire_at - datetime.now(timezone.utc)).total_seconds() + 90
        print(f"waiting  {int(wait_s)}s for the run to start...")
        time.sleep(max(0, wait_s))
        print(f"after:   {describe()}")
    finally:
        # The restore is the whole risk, so it is retried and then CONFIRMED
        # from Railway rather than assumed from a return code. A failed restore
        # leaves the ETL on a temporary daily schedule -- or on none -- and
        # nothing else in the system would notice for a week.
        problems = restore_and_verify("deploy")
        print(f"restored: {describe()}")
        if problems:
            print("\nRESTORE NOT VERIFIED — the weekly refresh may not run:")
            for p in problems:
                print(f"  - {p}")
            print("\n  python3 ETL/lib/verify_cron.py --deploy   to repair by hand")
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
