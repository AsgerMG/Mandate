# Weekly audit — pending review

This file is a mailbox, not a permanent record. The "Regina weekly data audit"
routine (Sunday 06:30 UTC, see decision log 2026-07-20) drops its report here
by hand after each run — pasted in during the next working session, not
committed automatically by the routine itself (it has no repo write access).

**Lifecycle:** routine runs → report gets pasted below → reviewed with the
user → whatever we decide to act on gets its own dated entry in
`decision-log.md` → this file is cleared back to empty (not deleted, so the
convention survives).

No run has been reviewed yet. Nothing below means nothing is pending.

**⚠ Status as of 2026-08-07 — the loop has never closed, and this file was the
evidence.** Correcting the record rather than pretending otherwise:

- The routine is **alive and firing** — cron `30 6 * * 0`, last fired
  **2026-08-02T06:36 UTC**, next **2026-08-09**. Two Sundays have passed since it
  was set up on 2026-07-20 (07-26 and 08-02), so at least two reports exist and
  nobody has seen either.
- **None of them has ever been pasted in or reviewed.** The lifecycle above
  describes step 1 happening weekly and steps 2-5 never happening at all. The
  "trigger for review is the next conversation" caveat in decision-log 2026-07-20
  turned out to be the whole failure: nothing ever prompts, so nothing ever gets
  read.
- **Worse, the check itself was pointed at a field that goes stale on failure.**
  The routine judges refresh health by reading `GET /api/refresh`. That endpoint
  returns `last_result`, which at `main` is assigned as the *final statement* of
  the `try` in `_run_refresh` — so any exception leaves it holding the previous
  run's value (or `null`) while `last_finished` advances and `running` goes
  false. A failed refresh is indistinguishable from a successful one there.
  Production currently reads
  `{"running":false,"last_result":null,"last_finished":"2026-08-02T06:45:12+00:00"}`,
  which means the weekly refresh has **never once completed**.
- So the one automated check that should have caught the ETL outage was both
  unread *and* blind. Either failure alone would have been enough. Nothing here
  was noticed until the 2026-08-07 manual audit (see
  [decision-log.md](decision-log.md) 2026-08-07) went looking.

**Before the next report is trusted, two things need fixing** — tracked in the
decision log, not here, because this file is a mailbox and not a task list:
`_refresh_state` needs an explicit success/failure field for the routine to read,
and the routine needs to read it.

This file stays a mailbox. Nothing below still means nothing is pending — it does
**not** mean the last run was fine.

---
