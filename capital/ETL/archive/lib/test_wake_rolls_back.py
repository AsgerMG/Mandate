"""A wake that fails must not leave the weekly ETL switched off.

THE FAILURE THIS ENCODES. On 2026-08-19, `railway up` inside `wake()` returned
1 — "Deploy failed", cause unrecorded by the CLI. `wake()` raised, and the
`_set_service_instance("sleep infinity", None)` on its first line had already
landed. The service instance was left with no cron schedule and a start command
of `sleep infinity`; the weekly ETL was off; and nothing in the failing process
said so. Every caller invokes `wake()` OUTSIDE its `try` — there is nothing to
restore until the wake has happened — so the `finally` that would have restored
it is unreachable by construction, in both directions, on every failure.

THE PROPERTY, not the list:

    A function that changes remote state before it can fail must restore that
    state on EVERY exit that is not success — including the ones it does not
    raise itself.

The test for the unseen case is section 3: the failure is injected as a
`BaseException` that is not an `Exception` at all, which `except Exception`
would miss and a bare `finally` would not. Nothing below names `railway up`,
`CalledProcessError`, or a timeout as the thing that goes wrong.

Hermetic: every Railway call is replaced. No credentials, no network, no
deploy.

Run: python3 ETL/lib/test_wake_rolls_back.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import railway_service as RS  # noqa: E402

FAILURES: list[str] = []


def must(cond: bool, why: str) -> None:
    if not cond:
        FAILURES.append(why)


class Recorder:
    """Stands in for Railway. Records every config write in order."""

    def __init__(self, restore_works: bool = True) -> None:
        self.writes: list[tuple] = []
        self.restore_works = restore_works

    def set_service_instance(self, start_command, cron_schedule):
        self.writes.append((start_command, cron_schedule))

    def restore(self, attempts: int = 3):
        # The real restore writes the real config and then CONFIRMS it. The
        # stand-in does the write, so the assertion below is about what the
        # service is left holding rather than about which function ran.
        self.set_service_instance(RS.REAL_START_COMMAND, RS.REAL_CRON_SCHEDULE)
        return [] if self.restore_works else ["the stand-in was told to fail"]


def drive(boom: BaseException, restore_works: bool = True) -> Recorder:
    rec = Recorder(restore_works)
    orig = (RS._set_service_instance, RS.restore, RS.subprocess.run,
            RS._instance_status)
    RS._set_service_instance = rec.set_service_instance
    RS.restore = rec.restore

    def blow_up(*_a, **_k):
        raise boom

    RS.subprocess.run = blow_up
    RS._instance_status = lambda: "RUNNING"
    try:
        RS.wake()
    except BaseException as exc:            # noqa: BLE001 - that is the point
        rec.raised = exc
    else:
        rec.raised = None
    finally:
        (RS._set_service_instance, RS.restore, RS.subprocess.run,
         RS._instance_status) = orig
    return rec


def main() -> None:
    # ── 1. the ordinary failure: the deploy returns non-zero ─────────────
    import subprocess

    rec = drive(subprocess.CalledProcessError(1, ["railway", "up"]))
    must(rec.raised is not None,
         "a wake whose deploy failed returned normally. A failed wake is an "
         "error, and a caller that reads it as success will transfer against a "
         "container that is not running.")
    must(rec.writes[0] == ("sleep infinity", None),
         f"the wake did not write the woken config first: {rec.writes!r}")
    must(rec.writes[-1] == (RS.REAL_START_COMMAND, RS.REAL_CRON_SCHEDULE),
         f"THE WEEKLY ETL WAS LEFT OFF. After a failed wake the service instance "
         f"holds {rec.writes[-1]!r}, not the real schedule. Every caller invokes "
         f"wake() outside its try, so no `finally` anywhere can repair this.")

    # ── 2. the failure nobody wrote a branch for: the wait times out ─────
    rec = drive(TimeoutError("didn't reach RUNNING"))
    must(rec.writes[-1] == (RS.REAL_START_COMMAND, RS.REAL_CRON_SCHEDULE),
         "a wake that TIMED OUT left the schedule off. The rollback must not be "
         "attached to one way of failing.")

    # ── 3. the unseen case: a BaseException that is not an Exception ─────
    # KeyboardInterrupt is the real one — a person pressing ctrl-c between the
    # config write and the deploy leaves the ETL off for a week — and it is
    # invisible to `except Exception`.
    rec = drive(KeyboardInterrupt())
    must(rec.writes[-1] == (RS.REAL_START_COMMAND, RS.REAL_CRON_SCHEDULE),
         "a wake interrupted by ctrl-c left the schedule off. The rollback must "
         "cover every exit that is not success, not every exit somebody listed.")
    must(isinstance(rec.raised, KeyboardInterrupt),
         "the rollback swallowed the interrupt. Restoring the schedule is not a "
         "reason to report success.")

    # ── 4. a rollback that ITSELF fails is reported, never hidden ────────
    rec = drive(subprocess.CalledProcessError(1, ["railway", "up"]),
                restore_works=False)
    must(rec.raised is not None,
         "a wake whose rollback also failed still has to raise")

    if FAILURES:
        print("FAIL: a failed wake can leave the weekly ETL switched off\n")
        for f in FAILURES:
            print(f"  - {f}\n")
        sys.exit(1)
    print("ok: every exit from wake() that is not success restores the real cron "
          "schedule\n    and still raises — including a ctrl-c and a rollback that "
          "fails")


if __name__ == "__main__":
    main()
