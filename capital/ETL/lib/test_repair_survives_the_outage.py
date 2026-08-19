"""The repair path must not die on the failure it exists to repair.

THE FAILURE THIS ENCODES. On 2026-08-19 Railway's control plane returned
`Unauthorized` and `502 Bad Gateway` for a stretch. Both repair paths --
`railway_service.restore()` and `verify_cron.restore_and_verify()` -- wrapped
their `deploy()` call and nothing else, so the `set_service_instance()` write
that PRECEDES it raised straight through. `restore()` raised out of a
`finally`, replacing a clean "upload failed" with a stack trace and leaving the
service on `sleep infinity` with no cron schedule; the weekly ETL was off.
`restore()`'s own docstring promised that could not happen -- the promise was
only ever true of the one call that was wrapped.

THE PROPERTY, not the list:

    A repair path may report that it failed. It may not RAISE a transport
    error, and it may not stop trying because one of its calls to the remote
    control plane did not answer.

The test for the unseen case is section 3: the failure is injected into a call
that is not `deploy()` and not the one the original bug was found in, with an
exception type neither function names. Nothing below asserts on
`CalledProcessError`, on `Unauthorized`, or on which of the three calls broke.

Hermetic: every Railway call is replaced. No credentials, no network.

Run: python3 ETL/lib/test_repair_survives_the_outage.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import railway_service as RS  # noqa: E402
import verify_cron as VC  # noqa: E402

FAILURES: list[str] = []


def must(cond: bool, why: str) -> None:
    if not cond:
        FAILURES.append(why)


class Outage(RuntimeError):
    """An exception type neither module names anywhere."""


def run_isolated(fn, *, break_write, break_deploy, break_check):
    """Drive a repair path with chosen calls broken. Returns (result, raised)."""
    saved = (RS._set_service_instance, RS.set_service_instance, RS.deploy,
             VC.check, VC.deploy, RS.time.sleep, VC.time.sleep)
    calls = {"write": 0, "deploy": 0, "check": 0}

    def write(*_a, **_k):
        calls["write"] += 1
        if break_write:
            raise Outage("control plane said Unauthorized")

    def dep(*_a, **_k):
        calls["deploy"] += 1
        if break_deploy:
            raise Outage("502 Bad Gateway")

    def chk(*_a, **_k):
        calls["check"] += 1
        if break_check:
            raise Outage("no healthy upstream")
        return []

    RS._set_service_instance = write
    RS.set_service_instance = write
    RS.deploy = dep
    VC.deploy = dep
    VC.check = chk
    RS.time.sleep = lambda *_a: None
    VC.time.sleep = lambda *_a: None
    try:
        return fn(), None, calls
    except BaseException as exc:                        # noqa: BLE001
        return None, exc, calls
    finally:
        (RS._set_service_instance, RS.set_service_instance, RS.deploy,
         VC.check, VC.deploy, RS.time.sleep, VC.time.sleep) = saved


def main() -> None:
    paths = [
        ("railway_service.restore", lambda: RS.restore(attempts=2)),
        ("verify_cron.restore_and_verify",
         lambda: VC.restore_and_verify("deploy", attempts=2, settle_s=0)),
    ]

    # ── 1. the config WRITE fails — the hole that was actually live ──────
    #
    # Note what is NOT asserted: that a failed write means a failed repair.
    # `check()` reads the schedule back FROM RAILWAY, and that is a stronger
    # authority than whether our own write returned — a write can fail because
    # the value was already correct. So the requirement here is that the path
    # does not raise and does not stop trying; whether it reports success is
    # settled by the read-back, and section 1b is the case where nothing can
    # confirm anything.
    for name, fn in paths:
        _res, raised, calls = run_isolated(fn, break_write=True, break_deploy=False,
                                           break_check=False)
        must(raised is None,
             f"{name} RAISED when the config write failed: {raised!r}. Callers "
             f"invoke this from a finally; an exception here replaces the real "
             f"error and leaves the schedule unrestored.")
        must(calls["write"] >= 2,
             f"{name} gave up after one failed write (tried {calls['write']}). A "
             f"control plane that is down for a minute is the normal case.")

    # ── 1b. NOTHING answers — the state this workstream was actually in ──
    # No write, no deploy, no read-back. There is no authority saying the
    # schedule is right, so reporting no problem would be a repair path telling
    # you it fixed something it never reached.
    for name, fn in paths:
        res, raised, _calls = run_isolated(fn, break_write=True, break_deploy=True,
                                           break_check=True)
        must(raised is None,
             f"{name} raised when the whole control plane was down: {raised!r}")
        must(res,
             f"{name} reported NO PROBLEM while nothing answered. A repair path "
             f"that cannot reach Railway has not repaired anything, and silence "
             f"reads as success.")

    # ── 2. the DEPLOY fails — the one case that was already handled ──────
    for name, fn in paths:
        _res, raised, calls = run_isolated(fn, break_write=False, break_deploy=True,
                                           break_check=False)
        must(raised is None, f"{name} raised on a failed deploy: {raised!r}")
        must(calls["deploy"] >= 2,
             f"{name} stopped retrying the deploy after {calls['deploy']} attempt(s)")

    # ── 3. the READ-BACK fails — a call neither module wrapped ───────────
    # The unseen case. Not deploy, not the write, and an exception type that
    # appears nowhere in either module.
    for name, fn in paths:
        _res, raised, _calls = run_isolated(fn, break_write=False, break_deploy=False,
                                            break_check=True)
        must(raised is None,
             f"{name} raised when reading Railway back failed: {raised!r}. A "
             f"repair path must survive EVERY call to the control plane, not the "
             f"two somebody remembered.")

    # ── 4. and it still SUCCEEDS when the control plane answers ──────────
    # A path that swallows everything and never returns [] would pass 1-3.
    for name, fn in paths:
        res, raised, _calls = run_isolated(fn, break_write=False, break_deploy=False,
                                           break_check=False)
        must(raised is None, f"{name} raised on the happy path: {raised!r}")
        must(res == [], f"{name} reported problems on a healthy control plane: {res!r}")

    if FAILURES:
        print("FAIL: a repair path dies on the outage it exists to repair\n")
        for f in FAILURES:
            print(f"  - {f}\n")
        sys.exit(1)
    print("ok: both repair paths survive a failure in the config write, the deploy "
          "and the\n    read-back, keep retrying, report rather than raise, and "
          "still succeed when\n    Railway answers")


if __name__ == "__main__":
    main()
