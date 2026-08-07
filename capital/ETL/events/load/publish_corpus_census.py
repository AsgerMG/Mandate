"""Record what the ETL's corpus contains, where the website can read it.

── The gap this closes ────────────────────────────────────────────────────
There are two corpora and, until this existed, no channel between them.

The ETL runs weekly on Railway against a volume-resident db.sqlite. The website
serves committed build artifacts — synthesis.json's headline figures, and
instrument_terms.json as the fallback fund inventory — regenerated only when
somebody remembers. db.sqlite is gitignored and lives on a volume no CI job may
read, so nothing on the website side could even ASK what the ETL now holds. The
drift was therefore not merely unfixed, it was unobservable: measured over this
repo's own history, the median gap between an ETL run and the site data catching
up is 4.6 days and the worst was 32 (`python3 ETL/lib/drift_window.py`).

So the ETL writes a census — a small, append-only record in the Postgres the
product already reads — saying what its corpus contained and when. That is the
missing channel. `check_corpus_census.ts` compares the committed artifacts
against it, and a clock-triggered workflow runs that check whether or not
anybody pushed.

── What it deliberately does NOT do ───────────────────────────────────────
It does not publish a corpus. It records one. Those must stay separate, because
the state you most need written down is a corpus that FAILED the coverage gate,
and a census that refused to record a bad corpus would blind you exactly when it
matters. So the gate's verdict travels WITH the census rather than deciding
whether to write it, and anything that actually publishes goes through the real
gate (see ETL/refresh.py).

── Why a code fingerprint ─────────────────────────────────────────────────
The Railway service has no repo trigger (`repoTriggers: []`): it is deployed by
CLI upload and nothing redeploys it when main changes. On 2026-08-07 that was
not hypothetical — the fix that stops one blocked website cancelling the week's
ETL was committed at 17:47 while Railway was still running an image built the
previous evening, which is precisely the code path that had failed. So the
census carries a hash of the Python the container is actually running, and the
guard compares it against the checkout. "Railway is running last week's code"
becomes a fact somebody is told rather than one somebody eventually deduces.

Usage:
  python3 ETL/events/load/publish_corpus_census.py
  python3 ETL/events/load/publish_corpus_census.py --dry-run   # print, write nothing
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import hashlib  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import sqlite3  # noqa: E402

_sys.path.insert(0, str(ROOT / "ETL" / "terms"))
_sys.path.insert(0, str(ROOT / "website" / "build"))
_sys.path.insert(0, str(ROOT / "website" / "build" / "lib"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS corpus_census (
  id                BIGSERIAL PRIMARY KEY,
  taken_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  produced_by       TEXT NOT NULL,
  code_fingerprint  TEXT NOT NULL,
  kpis              JSONB,
  instruments       JSONB,
  coverage          JSONB,
  gate              JSONB,
  run_outcome       TEXT NOT NULL DEFAULT 'unknown',
  errors            JSONB NOT NULL DEFAULT '[]'::jsonb,
  store             TEXT NOT NULL DEFAULT 'unknown',
  schema_state      JSONB
);
ALTER TABLE corpus_census ADD COLUMN IF NOT EXISTS run_outcome TEXT NOT NULL DEFAULT 'unknown';
-- WHICH STORE this census describes. produced_by says who RAN it, which is a
-- different question and was being asked in its place: three of the first five
-- censuses were taken against the same laptop file under three different
-- produced_by labels, and the guard's test for "the scheduled ETL" was
-- `produced_by != 'local'`. See website/build/lib/corpus_stores.py.
ALTER TABLE corpus_census ADD COLUMN IF NOT EXISTS store TEXT NOT NULL DEFAULT 'unknown';
-- The migrations this store has, so schema drift travels on the SAME channel as
-- everything else rather than surfacing as `no such column: tier` inside an
-- unrelated block, three weeks late.
ALTER TABLE corpus_census ADD COLUMN IF NOT EXISTS schema_state JSONB;
CREATE INDEX IF NOT EXISTS corpus_census_taken_idx
  ON public.corpus_census USING btree (taken_at DESC);
"""

# The trees that are copied into the ETL image (data/, .git/ and the frontend's
# build output are excluded by .dockerignore, so they cannot be part of a
# fingerprint the container could reproduce).
FINGERPRINTED = ("ETL", "website/build")


def code_fingerprint(root: _Path = ROOT) -> str:
    """A content hash of the Python this process is running.

    Sorted by relative path, content only: it must be identical on a Railway
    container and on a CI checkout of the same commit, and must not depend on
    filesystem ordering or on where the tree happens to live.
    """
    h = hashlib.sha256()
    for rel in FINGERPRINTED:
        base = root / rel
        if not base.exists():
            continue
        for f in sorted(base.rglob("*.py")):
            if "__pycache__" in f.parts:
                continue
            h.update(str(f.relative_to(root)).encode())
            h.update(hashlib.sha256(f.read_bytes()).digest())
    return h.hexdigest()[:16]


def _connect_ro() -> sqlite3.Connection:
    return sqlite3.connect(f"file:{DB}?mode=ro", uri=True)


def collect() -> tuple[dict, list[str]]:
    """Every block is independent, and a block that cannot be computed records
    why rather than aborting the census. A census is the report; refusing to
    file it because one section failed is how the outage stays invisible."""
    errors: list[str] = []
    out: dict = {"kpis": None, "instruments": None, "coverage": None, "gate": None,
                 "schema_state": None}

    try:
        # Which migrations this store actually has. Read through the runner so
        # there is one definition of "the schema this checkout expects", and
        # recorded per store so the guard can see WHICH store is behind rather
        # than only that something is.
        _sys.path.insert(0, str(ROOT / "ETL" / "events" / "load" / "migrations"))
        from apply import status as _mig_status  # noqa: PLC0415
        con = sqlite3.connect(DB)  # needs write access: status() creates the table
        try:
            pending, unknown = _mig_status(con)
            con.commit()
            out["schema_state"] = {
                "applied": sorted(r[0] for r in con.execute(
                    "SELECT id FROM schema_migrations")),
                "pending": pending,
                "unknown": unknown,
            }
        finally:
            con.close()
        if pending:
            errors.append(f"schema: {len(pending)} migration(s) pending on this "
                          f"store: {', '.join(pending)}")
        if unknown:
            errors.append(f"schema: {len(unknown)} migration id(s) recorded here "
                          f"with no file behind them: {', '.join(unknown)}")
    except Exception as exc:  # noqa: BLE001
        errors.append(f"schema: {type(exc).__name__}: {exc}")

    try:
        # The one canonical definition, imported from the stdlib-only module
        # rather than from synthesis.py — which cannot be imported here at all,
        # because it pulls helpers.py and therefore pandas, and the ETL image
        # has neither. That is not hypothetical: this block's first real run
        # inside the container recorded exactly that ModuleNotFoundError.
        from corpus_kpis import compute_kpis
        con = _connect_ro()
        try:
            out["kpis"] = compute_kpis(con)
        finally:
            con.close()
    except Exception as exc:  # noqa: BLE001 - recorded, not swallowed
        errors.append(f"kpis: {type(exc).__name__}: {exc}")

    try:
        con = _connect_ro()
        try:
            row = con.execute(
                "SELECT COUNT(*),"
                "       SUM(CASE WHEN is_framework = 1 THEN 1 ELSE 0 END),"
                "       SUM(CASE WHEN parent_id IS NULL THEN 1 ELSE 0 END)"
                "  FROM funding_instruments").fetchone()
            gates = con.execute("SELECT COUNT(*) FROM eligibility_gates").fetchone()[0]
            out["instruments"] = {
                "total": row[0], "frameworks": row[1] or 0, "roots": row[2] or 0,
                "gates": gates,
            }
        finally:
            con.close()
    except Exception as exc:  # noqa: BLE001
        errors.append(f"instruments: {type(exc).__name__}: {exc}")

    try:
        from coverage_gate import BASELINE, evaluate, snapshot
        con = _connect_ro()
        try:
            cur = snapshot(con)
        finally:
            con.close()
        out["coverage"] = cur
        if BASELINE.exists():
            ok, failures, notes = evaluate(cur, json.loads(BASELINE.read_text()))
            out["gate"] = {"ok": ok, "failures": failures, "notes": notes}
        else:
            out["gate"] = {"ok": None, "failures": [], "notes": ["no baseline in the image"]}
    except Exception as exc:  # noqa: BLE001
        errors.append(f"coverage: {type(exc).__name__}: {exc}")

    return out, errors


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="print, write nothing")
    ap.add_argument("--fingerprint", action="store_true",
                    help="print the code fingerprint and nothing else, so the "
                         "TypeScript guard can compare a checkout against a "
                         "container without a second implementation of the hash")
    ap.add_argument("--produced-by", default=os.environ.get("RAILWAY_SERVICE_NAME", "local"),
                    help="what ran it; defaults to the Railway service name")
    ap.add_argument("--store", default=None,
                    help="WHICH STORE was read. Derived from the environment by "
                         "default and that is the form to use — see "
                         "website/build/lib/corpus_stores.py. The override exists "
                         "only for a deliberate probe of a store from somewhere "
                         "else, e.g. a pulled copy read from a worktree.")
    ap.add_argument("--run-outcome", default="unknown",
                    help="how the pipeline that produced this corpus went: 'ok', "
                         "'partial: ...', or 'failed at ...'. Travels WITH the "
                         "census so a failed run cannot leave last week's good "
                         "numbers standing as the newest record")
    args = ap.parse_args()

    if args.fingerprint:
        print(code_fingerprint())
        return 0

    from corpus_stores import OF_RECORD, store_id
    store = args.store or store_id()

    payload, errors = collect()
    fingerprint = code_fingerprint()
    print(f"corpus census — code {fingerprint}, produced by {args.produced_by}, "
          f"store {store}{' (OF RECORD)' if store == OF_RECORD else ' (derived)'}, "
          f"run {args.run_outcome}")
    if payload["kpis"]:
        k = payload["kpis"]
        print(f"  {k['companies']:,} companies · {k['events']:,} events · "
              f"{k['countries']} countries")
    if payload["instruments"]:
        print(f"  {payload['instruments']['total']} instruments, "
              f"{payload['instruments']['gates']} gates")
    if payload["gate"]:
        print(f"  coverage gate: {payload['gate']['ok']}")
    for e in errors:
        print(f"  ERROR {e}")

    if args.dry_run:
        print(json.dumps({**payload, "errors": errors}, indent=1, default=str)[:400])
        return 0

    url = os.environ.get("DATABASE_URL")
    if not url:
        # Loud, and non-zero. A census that silently does not happen is the
        # exact failure this whole mechanism exists to make impossible: the
        # guard downstream would read a stale row and report a stale answer
        # with no indication that nothing new was written.
        print("\nFAILED: no DATABASE_URL. The census is the only channel between "
              "the ETL's corpus and anything that can check the website against "
              "it; without it the drift is unobservable again.")
        return 1

    import psycopg

    with psycopg.connect(url) as conn:
        with conn.cursor() as cur:
            cur.execute(SCHEMA)
            cur.execute(
                "INSERT INTO corpus_census (produced_by, code_fingerprint, kpis, "
                "instruments, coverage, gate, run_outcome, errors, store, "
                "schema_state) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
                "RETURNING id, taken_at",
                (args.produced_by, fingerprint,
                 json.dumps(payload["kpis"]), json.dumps(payload["instruments"]),
                 json.dumps(payload["coverage"]), json.dumps(payload["gate"]),
                 args.run_outcome, json.dumps(errors), store,
                 json.dumps(payload["schema_state"])))
            cid, taken = cur.fetchone()
        conn.commit()
    print(f"\nrecorded census #{cid} at {taken:%Y-%m-%d %H:%M} UTC"
          + (f" WITH {len(errors)} error(s)" if errors else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
