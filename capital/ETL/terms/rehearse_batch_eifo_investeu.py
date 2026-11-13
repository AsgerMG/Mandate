"""Rehearse load_batch_eifo_investeu.py end to end on a THROWAWAY Postgres 18 + pgvector.

    python3 capital/ETL/terms/rehearse_batch_eifo_investeu.py [--embed] [--then CMD]

As rehearse_batch_italy.py: production's shape (mandate/db roles + grounding via
EphemeralMandate, the capital baseline DDL and migrations 033-040 executed and stamped, the
instrument production already holds: eifo_coinvest), then the loader three times: dry run
(writes nothing), --apply, --apply again (must change nothing). The bucket is a local
directory. --embed calls Voyage for the passages' vectors (about a cent); never Anthropic.

Server: MANDATE_TEST_DATABASE_URL if set, else a fresh Homebrew postgresql@18 data dir on its
own port. Never a production URL (EphemeralMandate refuses).
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(REPO / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import psycopg  # noqa: E402

from rehearse_batch_italy import BASELINE, CAPITAL, uri  # noqa: E402

LOADER = REPO / "capital" / "ETL" / "terms" / "load_batch_eifo_investeu.py"

COUNTS = """
SELECT 'grounding.documents (batch)', count(*) FROM grounding.documents d
  JOIN grounding.sources s ON s.id = d.source_id WHERE s.key = 'capital.batch_eifo_investeu'
UNION ALL SELECT 'grounding.passages (batch chunker)', count(*) FROM grounding.passages WHERE chunker = 'capital.batch_eifo_investeu.v1'
UNION ALL SELECT 'grounding.passage_embeddings', count(*) FROM grounding.passage_embeddings
UNION ALL SELECT 'capital.status_keys', count(*) FROM capital.status_keys
UNION ALL SELECT 'capital.status_rules', count(*) FROM capital.status_rules
UNION ALL SELECT 'capital.funding_instruments (eifo_)', count(*) FROM capital.funding_instruments WHERE id LIKE 'eifo_%'
UNION ALL SELECT 'capital.eligibility_gates (hand_cited)', count(*) FROM capital.eligibility_gates WHERE encoding_method = 'hand_cited'
UNION ALL SELECT 'capital.eligibility_grounding', count(*) FROM capital.eligibility_grounding
UNION ALL SELECT 'capital.intermediaries', count(*) FROM capital.intermediaries
UNION ALL SELECT 'capital.schema_migrations has 041', count(*) FROM capital.schema_migrations WHERE id = '041'
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--embed", action="store_true")
    ap.add_argument("--then", help="a shell command run against the loaded rehearsal before teardown; "
                                   "gets REHEARSAL_RO_URL, REHEARSAL_APP_URL, GROUNDING_BUCKET_DIR")
    a = ap.parse_args()
    stop = None
    if not os.environ.get("MANDATE_TEST_DATABASE_URL"):
        from run_ci_job import _throwaway_postgres  # noqa: PLC0415
        url, stop = _throwaway_postgres()
        os.environ["MANDATE_TEST_DATABASE_URL"] = url
    from mandate.grounding.testing import EphemeralMandate  # noqa: PLC0415
    try:
        with EphemeralMandate() as db:
            print(f"rehearsal database {db.dbname} (pgvector {db.pgvector}, halfvec={db.halfvec})")
            with psycopg.connect(db.admin_url, autocommit=True) as c:
                c.execute("GRANT USAGE, CREATE ON SCHEMA capital TO capital_app")
            app = db.url("capital_app")
            with psycopg.connect(app, autocommit=True) as c:
                c.execute("SET search_path = capital, public")
                for f in BASELINE:
                    c.execute(f.read_text())
                for mig in sorted((CAPITAL / "migrations").glob("0*.sql")):
                    if mig.name[:3] != "041":
                        c.execute(mig.read_text())
                c.execute("INSERT INTO schema_migrations (id) SELECT lpad(n::text, 3, '0') "
                          "FROM generate_series(4, 40) n ON CONFLICT DO NOTHING")
                c.execute("INSERT INTO funding_instruments (id, name, country, capital_type) "
                          "VALUES ('eifo_coinvest', 'EIFO', 'DK', 'equity') ON CONFLICT DO NOTHING")
            bucket = tempfile.mkdtemp(prefix="batch_eifo_bucket_")
            env = {**os.environ, "GROUNDING_BUCKET_DIR": bucket, "PYTHONPATH": str(REPO)}
            for k in ("BUCKET_ENDPOINT", "BUCKET_ACCESS_KEY_ID", "BUCKET_SECRET_ACCESS_KEY", "BUCKET_NAME"):
                env.pop(k, None)
            emb = [] if a.embed else ["--no-embed"]
            for label, extra in [("dry run", []), ("apply", ["--apply", *emb]),
                                 ("apply again (idempotent)", ["--apply", *emb])]:
                print(f"\n── {label} ──", flush=True)
                r = subprocess.run([sys.executable, str(LOADER), "--database-url", app, *extra], env=env)
                if r.returncode:
                    print(f"loader exited {r.returncode}")
                    return r.returncode
            print("\n── counts after ──")
            with psycopg.connect(app) as c:
                for name, n in c.execute(COUNTS).fetchall():
                    print(f"  {name:45} {n}")
                try:
                    c.execute("UPDATE capital.intermediaries SET name = 'x'")
                    print("  UPDATE intermediaries: ALLOWED (defect)")
                    return 1
                except psycopg.errors.InsufficientPrivilege:
                    print("  UPDATE intermediaries: refused (insert-only)")
            if a.then:
                print(f"\n── then: {a.then} ──", flush=True)
                r = subprocess.run(a.then, shell=True, env={
                    **env, "REHEARSAL_RO_URL": uri(db.url("capital_ro")), "REHEARSAL_APP_URL": uri(app)})
                if r.returncode:
                    return r.returncode
    finally:
        if stop:
            stop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
