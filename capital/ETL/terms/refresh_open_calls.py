"""Re-run the open-call harvest, weekly, idempotently.

── Why this is the first source that needs a clock ────────────────────────
Every other source in this corpus goes stale on a RELEASE: a register publishes
a new file, we notice the content hash moved, we reload. Spain's open
convocatorias go stale on a CALENDAR. Each row carries a real application
deadline and correctly removes itself the day that deadline passes, so the
inventory shrinks on its own whether or not anybody runs anything.

Nothing re-ran `harvest_bdns_open_calls.py`. Left alone, Spain's 93 offerable
rows drift back toward the 13 it had before the harvest -- and no test notices,
because a corpus shrinking correctly and a corpus shrinking through neglect
look identical from the inside. `check_offerable_decay.py` is the other half of
this fix and exists precisely because a re-run job cannot detect its own
absence.

── Idempotent, and overlap-safe, by construction ──────────────────────────
Nothing here is new machinery; it is the existing four stages in order, and
each was already re-runnable:

  enumerate  dedupes against the candidate file it appends to.
  detail     never re-fetches a cached codigoBDNS.
  load       upserts on the instrument id, and applies the SATR-overlap gate
             (the HARD RULE before any national load): a call under a scheme
             the corpus ALREADY holds is not loaded as a second row. It revives
             the existing, fully-evidenced leaf through `successor_scheme`, so
             a founder is never shown one fund twice. That pass also RETRACTS a
             successor whose call has since shut, which is what makes repeated
             running safe rather than merely harmless.
  publish    scoped to this source's tag, insert-or-update, never deletes.

── The enumeration window overlaps on purpose ─────────────────────────────
`--since` looks back further than the cadence (default 60 days for a weekly
job). A window that exactly matched the cadence would lose every convocatoria
registered while a run was in flight, and a missed record is invisible: it is
not a failure, it is simply a fund the founder never sees. The overlap costs a
few hundred already-seen ids and buys a boundary that cannot drop anything.

── Partial is not failure ─────────────────────────────────────────────────
Exit codes match `renew.py`, which `railway_cron.py` already knows how to read:

  0  every stage completed
  3  a stage degraded but the corpus still moved forward (e.g. the detail
     fetch hit the cap, or the naming pass had no API key). The run published
     what it had; the next run picks up the rest.
  1  a stage failed in a way that leaves the corpus unchanged or inconsistent.

Naming is included because a row loaded this week and named next week is a row
a founder reads as a legal citation for a week -- which is the defect this
workstream exists to remove, reintroduced on a timer.

Usage:
  python3 ETL/terms/refresh_open_calls.py            # the weekly run
  python3 ETL/terms/refresh_open_calls.py --dry-run  # print the plan only
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import datetime as dt  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import subprocess  # noqa: E402

TERMS = ROOT / "ETL" / "terms"
STATE = ROOT / "data" / "raw" / "bdns_open" / ".refresh_state.json"
CANDIDATES = ROOT / "data" / "raw" / "bdns_open" / "candidates.jsonl"


def _have_candidates() -> bool:
    """Is there anything on disk for the load stages to consume?

    `Path.exists()` follows symlinks and returns False for a dangling one,
    which is the case that produced the first failure: the harvest's files were
    symlinks into a temporary worktree that had since been deleted, so the path
    listed but could not be read.
    """
    try:
        return CANDIDATES.exists() and CANDIDATES.stat().st_size > 0
    except OSError:
        return False
SOURCE_TAG = "bdns_es_convocatorias_abiertas"
COUNTRY = "ES"

# Cap on detail fetches per run. The register registers roughly 130 qualifying
# convocatorias a week, so this is ~15x headroom; it exists so a first run after
# a long outage cannot sit in a Railway container for four hours. Hitting it is
# a PARTIAL, not a failure -- the next run resumes from the same cache.
DETAIL_CAP = 2000

# How far back to enumerate. Deliberately longer than the weekly cadence; see
# the module docstring.
LOOKBACK_DAYS = 60


def _state() -> dict:
    if STATE.exists():
        try:
            return json.loads(STATE.read_text())
        except json.JSONDecodeError:
            pass
    return {}


def _save(**kw) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps({**_state(), **kw}, indent=1))


def run(step: list[str], label: str) -> int:
    print(f"=== {label}: {' '.join(step)}", flush=True)
    # Unbuffered, because in a cron container every stage's stdout is a pipe and
    # Python block-buffers a pipe. The detail fetch prints progress every 100
    # records and emitted NOTHING for ten minutes on the first end-to-end run --
    # a stalled job and a working one look identical in the log, which is the
    # same class of invisibility this whole workstream is about. Set on the
    # environment rather than by editing each stage, so a stage added later is
    # observable without anybody remembering.
    env = {**os.environ, "PYTHONUNBUFFERED": "1"}
    return subprocess.run(step, env=env).returncode


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--since", help="override the enumeration window start")
    ap.add_argument("--detail-cap", type=int, default=DETAIL_CAP)
    ap.add_argument("--skip-naming", action="store_true")
    a = ap.parse_args()

    since = a.since or (dt.date.today() - dt.timedelta(days=LOOKBACK_DAYS)).isoformat()
    py = _sys.executable
    stages: list[tuple[str, list[str], bool]] = [
        # (label, argv, degraded_is_partial)
        ("enumerate", [py, str(TERMS / "harvest_bdns_open_calls.py"),
                       "--enumerate", "--since", since], True),
        ("detail", [py, str(TERMS / "harvest_bdns_open_calls.py"),
                    "--detail", "--limit", str(a.detail_cap)], True),
        ("load", [py, str(TERMS / "load_bdns_open_calls.py"), "--write"], False),
        ("publish", [py, str(TERMS / "publish_new_instruments_scoped.py"),
                     "--source", SOURCE_TAG], False),
    ]
    if not a.skip_naming:
        stages.append(("name", [py, str(TERMS / "name_applicable_object.py"),
                                "--country", COUNTRY, "--write"], True))

    if a.dry_run:
        print(f"enumeration window: {since} -> today")
        for label, step, partial_ok in stages:
            print(f"  {label:10} {'(partial-ok)' if partial_ok else '(must succeed)'}  "
                  f"{' '.join(step)}")
        return

    # The naming pass needs a key. Absent, it is skipped LOUDLY rather than
    # failing the refresh: rows named after a citation are still rows a founder
    # can apply to, and losing the whole week's inventory over a missing key
    # would be the larger harm.
    if not a.skip_naming and not os.environ.get("ANTHROPIC_API_KEY"):
        print("=== SKIPPING name: ANTHROPIC_API_KEY not set. New rows will carry "
              "the register's legal citation until the next run with a key.", flush=True)
        stages = [s for s in stages if s[0] != "name"]

    partial: list[str] = []

    def detail_backlog() -> int:
        """Candidates enumerated but never fetched.

        The cap is enforced INSIDE the harvest, which exits 0 whether it
        finished the queue or stopped at the limit -- so on the first real run
        it fetched exactly 800 of 922 and reported complete. 122 convocatorias
        were left for next week and nothing said so, which is the silent
        shortfall this whole workstream exists to make impossible. The backlog
        is therefore measured HERE, from the two files, rather than inferred
        from an exit code that cannot carry it.
        """
        try:
            _sys.path.insert(0, str(TERMS))
            import harvest_bdns_open_calls as h  # noqa: PLC0415
            cands = {json.loads(l)["numeroConvocatoria"]
                     for l in h.CANDIDATES.read_text().splitlines() if l.strip()}
            return len(cands - set(h.load_details()))
        except Exception as e:  # noqa: BLE001 - reported, never fatal
            print(f"    (backlog unmeasurable: {e})", flush=True)
            return 0

    for label, step, partial_ok in stages:
        rc = run(step, label)
        if rc == 0:
            if label == "detail":
                left = detail_backlog()
                if left:
                    print(f"=== PARTIAL: detail left {left} candidates unfetched "
                          f"(cap {a.detail_cap}). Next run resumes from the same "
                          f"cache; raise --detail-cap if this does not clear.",
                          flush=True)
                    partial.append(f"detail(+{left} queued)")
            continue
        if partial_ok:
            print(f"=== PARTIAL: {label} (rc={rc}) -- continuing with what landed", flush=True)
            partial.append(label)
            # A stage marked partial-ok whose failure makes a LATER must-succeed
            # stage fail is not partial-ok at all -- it just moves the hard
            # failure one line down and reports it against the wrong step.
            #
            # That is exactly what the first real weekly run did: `enumerate`
            # went partial, wrote no candidates, and `load` then died on a
            # missing candidates.jsonl. The census recorded "failed at
            # refresh_open_calls.py", naming the refresh rather than the fetch
            # that actually failed, and Railway's logs were gone with the
            # container by the time anyone looked.
            #
            # So when the fetch stages produce nothing, the stages that consume
            # their output are SKIPPED as part of the same partial. There is
            # nothing to load; that is not an error, it is a week where the
            # register gave us nothing new.
            if label in ("enumerate", "detail") and not _have_candidates():
                print("=== SKIPPING load/publish/name: no candidates on disk, so "
                      "there is nothing for them to consume. This is the same "
                      "partial, not a second failure.", flush=True)
                break
            continue
        print(f"=== FAILED: {label} (rc={rc})", flush=True)
        _save(last_attempt=dt.datetime.now().isoformat(timespec="seconds"),
              last_failure=label)
        raise SystemExit(1)

    _save(last_success=dt.datetime.now().isoformat(timespec="seconds"),
          last_attempt=dt.datetime.now().isoformat(timespec="seconds"),
          window_since=since, partial=partial, last_failure=None)
    if partial:
        print(f"=== REFRESH COMPLETE, {len(partial)} PARTIAL: {', '.join(partial)}", flush=True)
        raise SystemExit(3)
    print("=== REFRESH COMPLETE", flush=True)


if __name__ == "__main__":
    main()
