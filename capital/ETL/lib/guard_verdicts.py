"""Run a guard where its data already is, and publish the verdict.

── The problem ────────────────────────────────────────────────────────────
Several of this repo's checks cannot run in CI, because what they check is a
corpus CI is not allowed to see: `data/db.sqlite` is gitignored and lives on a
Railway volume, and the eligibility Postgres holds the funds themselves. The
obvious fix — a DATABASE_URL secret in GitHub Actions — widens the blast radius
of one compromised workflow from "can read our code" to "can read and write
every award, company and fund we hold". That is not a trade worth making for a
green tick.

`publish_corpus_census.py` had already found the answer for one case: run
inside the Railway container, which has the credentials, and write what you
found into a table anything can read. This generalises it. A guard runs where
its data is, and records a verdict; whatever runs in CI or on a laptop asserts
against the published verdicts and needs no credentials at all.

── What a verdict is, and what it is not ──────────────────────────────────
A verdict is a claim about a MOMENT. It goes stale, and the whole mechanism is
worthless if a stale verdict reads the same as a fresh one. So every verdict
carries the time it was taken and a hash of the code it judges, and the reader
(website/frontend/scripts/check_verdicts.ts) fails on:

  SILENT    no verdict at all, or none within the cadence the verdicts
            themselves establish. The publisher has stopped.
  STALE     the verdict predates the corpus it is supposed to describe.
  DEGRADED  the verdict says the guard failed.
  DRIFTED   the verdict was produced against different code from this checkout.

That is the same four-way vocabulary `check_corpus_census.ts` already uses, and
deliberately not a second one.

── Why this also RUNS the guard ───────────────────────────────────────────
A publisher separate from the thing it publishes about is a publisher that can
report on a run that never happened. `run` executes the guard's own command,
captures its output, and derives the status from its exit code — so a verdict
exists if and only if the guard actually ran, and there is no path on which
somebody records "ok" by hand.

Usage:
  python3 ETL/lib/guard_verdicts.py run <guard_id>          # run it, publish
  python3 ETL/lib/guard_verdicts.py run <guard_id> --dry-run
  python3 ETL/lib/guard_verdicts.py fingerprint <guard_id>  # print the hash
  python3 ETL/lib/guard_verdicts.py list
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

_sys.path.insert(0, str(_Path(__file__).resolve().parent))

from etl_env import ROOT  # noqa: E402

import argparse  # noqa: E402
import hashlib  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import subprocess  # noqa: E402

REGISTRY = ROOT / "data" / "guard_registry.json"
SCHEMA_SQL = ROOT / "ETL" / "schema" / "guard_verdicts.sql"

# What counts as source when a registry entry names a directory. Fixed, because
# a fingerprint whose INPUT SET varies is not a fingerprint: the same tree would
# hash differently on two machines that disagreed about what to include.
SOURCE_SUFFIXES = (".py", ".ts", ".tsx", ".json", ".sql")
# Never walked into. Build output and dependency trees are not our code, and
# they differ between a container and a laptop for reasons that say nothing
# about whether the guard is judging what we ship.
SKIP_DIRS = {"__pycache__", "node_modules", ".next", ".git", "out", "coverage"}

# How long the FULL output is allowed to be. A guard that prints a row per
# instrument would otherwise put a megabyte into every insert; the tail is the
# part that says what happened.
DETAIL_TAIL = 8000
SUMMARY_MAX = 400


def registry() -> dict:
    return json.loads(REGISTRY.read_text())


def guard(guard_id: str) -> dict:
    for g in registry()["guards"]:
        if g["id"] == guard_id:
            return g
    raise SystemExit(f"no guard '{guard_id}' in {REGISTRY.relative_to(ROOT)}. "
                     f"Known: {', '.join(g['id'] for g in registry()['guards'])}")


def _files(base: _Path, suffixes: tuple[str, ...]) -> list[_Path]:
    if base.is_file():
        return [base]
    if not base.exists():
        return []
    out = []
    for f in base.rglob("*"):
        if not f.is_file():
            continue
        if SKIP_DIRS & set(f.parts):
            continue
        if f.suffix in suffixes:
            out.append(f)
    return out


def fingerprint(paths: list[str], suffixes: tuple[str, ...] = SOURCE_SUFFIXES,
                root: _Path = ROOT) -> str:
    """Content hash of the code a verdict is bound to.

    Sorted by relative path, content only: it must come out identical on a
    Railway container and on a CI checkout of the same commit, and must not
    depend on filesystem ordering or on where the tree happens to live. Same
    algorithm as publish_corpus_census.code_fingerprint, which this generalises;
    with suffixes=('.py',) over ('ETL', 'website/build') it reproduces that
    function's output exactly, and ETL/schema/check_census_imports.py asserts
    so rather than leaving it to be believed.
    """
    h = hashlib.sha256()
    for rel in paths:
        for f in sorted(_files(root / rel, suffixes)):
            h.update(str(f.relative_to(root)).encode())
            h.update(hashlib.sha256(f.read_bytes()).digest())
    return h.hexdigest()[:16]


def guard_fingerprint(g: dict, root: _Path = ROOT) -> str:
    suffixes = tuple(g["code_suffixes"]) if g.get("code_suffixes") else SOURCE_SUFFIXES
    return fingerprint(g["code"], suffixes, root)


def publish(guard_id: str, status: str, summary: str, metrics: dict,
            detail: str, code_fp: str, produced_by: str | None = None) -> int:
    """Write one verdict. Returns 0 on success, 1 if it could not be written.

    A publish failure is LOUD and non-zero. A verdict that silently does not get
    written is worse than no channel at all: the reader downstream finds the
    previous week's row, and reports a stale answer as a current one.
    """
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("guard_verdicts: FAILED to publish — no DATABASE_URL. The verdict is "
              "the only channel between a guard that needs credentials and anything "
              "that does not have them.")
        return 1
    import psycopg

    produced_by = produced_by or os.environ.get("RAILWAY_SERVICE_NAME", "local")
    with psycopg.connect(url) as conn:
        with conn.cursor() as cur:
            cur.execute(SCHEMA_SQL.read_text())
            cur.execute(
                "INSERT INTO guard_verdicts (guard, status, produced_by, "
                "code_fingerprint, summary, metrics, detail) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id, taken_at",
                (guard_id, status, produced_by, code_fp, summary[:SUMMARY_MAX],
                 json.dumps(metrics), detail[-DETAIL_TAIL:]))
            vid, taken = cur.fetchone()
        conn.commit()
    print(f"guard_verdicts: {guard_id} = {status} (verdict #{vid}, "
          f"{taken:%Y-%m-%d %H:%M} UTC, code {code_fp})")
    return 0


def _summarise(output: str, status: str, guard_id: str) -> str:
    """The one line a person reads in the failure. Public, so it is the guard's
    own last words rather than anything this module invents about them."""
    lines = [ln.strip() for ln in output.strip().splitlines() if ln.strip()]
    if not lines:
        return f"{guard_id} {status}, no output"
    # A check that failed says so on the line that names itself; a check that
    # passed says so on its last. Prefer the former, fall back to the latter.
    for ln in reversed(lines):
        if guard_id.split("_")[0] in ln.lower() and ("fail" in ln.lower()
                                                     or "ok" in ln.lower()):
            return ln[:SUMMARY_MAX]
    return lines[-1][:SUMMARY_MAX]


def run(guard_id: str, dry_run: bool = False) -> int:
    """Run the guard's own command and publish what it decided.

    Returns the GUARD's exit code, not the publisher's, so a caller can still
    treat a failing guard as it wishes. `railway_cron.py` deliberately does not
    let a guard cancel the week's data; see the comment there.
    """
    g = guard(guard_id)
    cmd = list(g["command"])
    cwd = ROOT / g.get("cwd", ".")
    if cmd and cmd[0] == "python3":
        cmd[0] = _sys.executable
    print(f"=== GUARD {guard_id}: {' '.join(cmd)} (in {cwd.relative_to(ROOT) or '.'}) ===",
          flush=True)
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    output = (proc.stdout or "") + (proc.stderr or "")
    print(output, flush=True)

    tolerated = set(g.get("tolerate", []))
    if proc.returncode == 0:
        status = "ok"
    elif proc.returncode in tolerated:
        # Named in the registry, not inferred. A guard that says "this is worth
        # saying out loud but not worth failing the week over" gets to say it.
        status = "ok"
    else:
        status = "failed"

    metrics = {"exit_code": proc.returncode}
    # A guard may hand structured figures forward by printing one line of
    # `GUARD_METRICS {json}`. Optional: nothing needs it, and a guard that does
    # not print it publishes its exit code and its summary, which is enough to
    # go red on.
    for ln in output.splitlines():
        if ln.startswith("GUARD_METRICS "):
            try:
                metrics.update(json.loads(ln[len("GUARD_METRICS "):]))
            except json.JSONDecodeError:
                pass

    fp = guard_fingerprint(g)
    summary = _summarise(output, status, guard_id)
    if dry_run:
        print(f"[dry run] {guard_id} = {status}, code {fp}\n  {summary}")
        return proc.returncode
    publish(guard_id, status, summary, metrics, output, fp)
    return proc.returncode


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("run", help="run a guard and publish its verdict")
    r.add_argument("guard_id")
    r.add_argument("--dry-run", action="store_true")

    f = sub.add_parser("fingerprint", help="print a guard's code fingerprint")
    f.add_argument("guard_id")

    sub.add_parser("list", help="print the registry")

    p = sub.add_parser("publish", help="publish a verdict for a guard that ran elsewhere")
    p.add_argument("guard_id")
    p.add_argument("--status", required=True, choices=["ok", "failed", "error"])
    p.add_argument("--summary", default="")
    p.add_argument("--metrics", default="{}")
    p.add_argument("--detail", default="")

    args = ap.parse_args()
    if args.cmd == "list":
        for g in registry()["guards"]:
            print(f"{g['id']:26} {g['cadence']:10} {guard_fingerprint(g)}  "
                  f"needs {', '.join(g['needs'])}")
        return 0
    if args.cmd == "fingerprint":
        print(guard_fingerprint(guard(args.guard_id)))
        return 0
    if args.cmd == "publish":
        g = guard(args.guard_id)
        return publish(args.guard_id, args.status, args.summary,
                       json.loads(args.metrics), args.detail, guard_fingerprint(g))
    return run(args.guard_id, args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
