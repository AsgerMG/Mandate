"""Rehearse load_batch_italy.py end to end on a THROWAWAY Postgres 18 + pgvector.

    python3 capital/ETL/terms/rehearse_batch_italy.py [--embed]

Builds what production has (mandate/db roles + grounding via EphemeralMandate, the capital
baseline DDL and migrations 033-038 stamped, the instrument rows the rules name), then runs
the loader three times: dry run (writes nothing), --apply, --apply again (must change
nothing). The bucket is a local directory (GROUNDING_BUCKET_DIR). --embed calls Voyage for
the passages' vectors (about a cent); without it, vectors are skipped (--no-embed).

Server: MANDATE_TEST_DATABASE_URL if set, else a fresh Homebrew postgresql@18 data dir on its
own port (scripts/run_ci_job.py's helper). Never a production URL (EphemeralMandate refuses).
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

import psycopg  # noqa: E402

CAPITAL = REPO / "capital" / "ETL" / "schema"
BASELINE = [CAPITAL / "corpus_schema.sql", CAPITAL / "postgres_schema.sql", CAPITAL / "guard_verdicts.sql"]
LOADER = REPO / "capital" / "ETL" / "terms" / "load_batch_italy.py"

COUNTS = """
SELECT 'grounding.documents (batch)', count(*) FROM grounding.documents d
  JOIN grounding.sources s ON s.id = d.source_id WHERE s.key = 'capital.batch_italy'
UNION ALL SELECT 'grounding.document_versions', count(*) FROM grounding.document_versions
UNION ALL SELECT 'grounding.fetches', count(*) FROM grounding.fetches
UNION ALL SELECT 'grounding.passages (capital.batch_italy.v1)', count(*) FROM grounding.passages WHERE chunker = 'capital.batch_italy.v1'
UNION ALL SELECT 'grounding.passage_embeddings', count(*) FROM grounding.passage_embeddings
UNION ALL SELECT 'capital.status_keys', count(*) FROM capital.status_keys
UNION ALL SELECT 'capital.status_rules', count(*) FROM capital.status_rules
UNION ALL SELECT 'capital.region_priorities', count(*) FROM capital.region_priorities
UNION ALL SELECT 'capital.source_supersessions', count(*) FROM capital.source_supersessions
UNION ALL SELECT 'capital.schema_migrations has 039', count(*) FROM capital.schema_migrations WHERE id = '039'
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--embed", action="store_true")
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
                    if mig.name[:3] in ("039",):
                        continue
                    c.execute(mig.read_text())
                c.execute("INSERT INTO schema_migrations (id) SELECT lpad(n::text, 3, '0') "
                          "FROM generate_series(4, 38) n ON CONFLICT DO NOTHING")
                # the instrument rows the rules name, as production holds them (ids only matter)
                for iid, name, ctype in [
                    ("fondo_di_garanzia", "Fondo di Garanzia per le PMI", "guarantee"),
                    ("satr_it_equity__sa_57625__banca_del_mezzogiorno_mediocredito_centrale_s_p_", "Fondo di garanzia per le PMI", "guarantee"),
                    ("satr_it_equity__sa_109544__banca_del_mezzogiorno_mediocredito_centrale_s_p_", "Fondo di garanzia per le piccole e medie imprese", "guarantee"),
                    ("satr_it_rnd__sa_48570__agenzie_delle_entrate", "Fiscal incentives for investments in innovative start-ups and innovative SMEs", "tax_credit"),
                    ("invitalia_smart_start", "Invitalia Smart&Start Italia", "blended")]:
                    c.execute("INSERT INTO funding_instruments (id, name, country, capital_type) "
                              "VALUES (%s, %s, 'IT', %s) ON CONFLICT DO NOTHING", (iid, name, ctype))
            bucket = tempfile.mkdtemp(prefix="batch_italy_bucket_")
            env = {**os.environ, "GROUNDING_BUCKET_DIR": bucket, "PYTHONPATH": str(REPO)}
            for k in ("BUCKET_ENDPOINT", "BUCKET_ACCESS_KEY_ID", "BUCKET_SECRET_ACCESS_KEY", "BUCKET_NAME"):
                env.pop(k, None)
            runs = [("dry run", []), ("apply", ["--apply"] + ([] if a.embed else ["--no-embed"])),
                    ("apply again (idempotent)", ["--apply"] + ([] if a.embed else ["--no-embed"]))]
            for label, extra in runs:
                print(f"\n── {label} ──", flush=True)
                r = subprocess.run([sys.executable, str(LOADER), "--database-url", app, *extra], env=env)
                if r.returncode:
                    print(f"loader exited {r.returncode}")
                    return r.returncode
            print("\n── counts after ──")
            with psycopg.connect(app) as c:
                for name, n in c.execute(COUNTS).fetchall():
                    print(f"  {name:45} {n}")
                # insert-only holds against the loading role itself
                try:
                    c.execute("UPDATE capital.status_rules SET statement = 'x'")
                    print("  UPDATE status_rules: ALLOWED (defect)")
                    return 1
                except psycopg.errors.InsufficientPrivilege:
                    print("  UPDATE status_rules: refused (insert-only)")
            print(f"  bucket objects: {sum(1 for _ in Path(bucket).rglob('*') if _.is_file())}")
    finally:
        if stop:
            stop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
