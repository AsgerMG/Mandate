"""An ephemeral Postgres in the PRODUCTION layout, for tests and rehearsals.

    from mandate.grounding.testing import EphemeralMandate
    with EphemeralMandate() as db:
        db.url("capital_app")    # connect as a brain role, search_path as in production
        db.admin_url             # the superuser, for setup and for SET ROLE grounding_owner

What it builds: a NEW database (never an existing one) with pgvector in
`public`, empty schemas capital/policy/mandate, then mandate/db/roles.sql,
mandate/db/grounding.sql, runs.sql and profiles.sql exactly as production runs them (the database name in
roles.sql's two DATABASE statements is the one substitution). So a test sees the
real grants: if a brain role could UPDATE grounding here, it could there.

HALFVEC. Production runs pgvector 0.8 (image pgvector/pgvector:pg18). pgserver
bundles pgvector 0.6, which predates halfvec; on such a server, and ONLY there,
grounding.sql's halfvec is read as vector so every other property (grants,
triggers, dedupe, spans) is still tested. `db.halfvec` says which one ran, and
CI runs against a pgvector:pg18 service container, where it is the real type.

Server: MANDATE_TEST_DATABASE_URL (an admin URL to a throwaway server, e.g. a CI
service container) if set, else pgserver (policy/.venv has it). Refuses any URL
that is the production DATABASE_URL.
"""
from __future__ import annotations

import os
import re
import shutil
import tempfile
import uuid
from pathlib import Path

import psycopg
from psycopg.conninfo import conninfo_to_dict, make_conninfo

TEST_PASSWORD = "mandate-test"
DB_DIR = Path(__file__).resolve().parents[1] / "db"


def sql_file(name: str, dbname: str = "railway") -> str:
    """A psql file as plain SQL: meta-commands stripped, the database name set."""
    text = (DB_DIR / name).read_text()
    text = "\n".join(l for l in text.splitlines() if not l.lstrip().startswith("\\"))
    return re.sub(r"\bDATABASE railway\b", f'DATABASE "{dbname}"', text)


class EphemeralMandate:
    def __init__(self) -> None:
        self._server = None
        self._data_dir: str | None = None
        self.admin_url = ""
        self.dbname = ""
        self.pgvector = ""
        self.halfvec = False

    def __enter__(self) -> "EphemeralMandate":
        try:
            return self._build()
        except BaseException:
            # a failed setup must not leave a running server and its data
            # directory behind (rehearsal databases filled the disk once)
            if self._server is not None:
                self.__exit__(None, None, None)
            raise

    def _build(self) -> "EphemeralMandate":
        server_url = os.environ.get("MANDATE_TEST_DATABASE_URL", "").strip()
        if not server_url:
            import pgserver  # noqa: PLC0415
            self._data_dir = tempfile.mkdtemp(prefix="mandate_pgtest_")
            self._server = pgserver.get_server(self._data_dir)
            server_url = self._server.get_uri()
        prod = {(os.environ.get(k) or "").strip() for k in
                ("DATABASE_URL", "CAPITAL_RO_DATABASE_URL")} - {""}
        if server_url in prod:
            raise SystemExit("MANDATE_TEST_DATABASE_URL is a production URL. Refusing.")
        self.dbname = f"mandate_test_{uuid.uuid4().hex[:10]}"
        with psycopg.connect(server_url, autocommit=True) as c:
            c.execute(f'CREATE DATABASE "{self.dbname}"')
        self.admin_url = make_conninfo(server_url, dbname=self.dbname)
        with psycopg.connect(self.admin_url, autocommit=True) as c:
            c.execute("CREATE EXTENSION IF NOT EXISTS vector SCHEMA public")
            for s in ("capital", "policy", "mandate"):
                c.execute(f"CREATE SCHEMA IF NOT EXISTS {s}")
            c.execute(sql_file("roles.sql", self.dbname))
            have = c.execute("SELECT extversion FROM pg_extension WHERE extname = 'vector'").fetchone()[0]
            self.pgvector = have
            self.halfvec = tuple(int(x) for x in have.split(".")[:2]) >= (0, 7)
            ddl = sql_file("grounding.sql", self.dbname)
            if not self.halfvec:
                ddl = ddl.replace("public.halfvec_cosine_ops", "public.vector_cosine_ops") \
                         .replace("public.halfvec(", "public.vector(")
            c.execute(ddl)
            # the run log and the artefact manifest (mandate/db/runs.sql)
            c.execute(sql_file("runs.sql", self.dbname))
            # accounts, workspaces and the shared company profile (mandate/db/profiles.sql)
            c.execute(sql_file("profiles.sql", self.dbname))
            # a throwaway server may not trust local connections (CI's does
            # not): give the brain roles a test password. Cluster-wide, which
            # is why only a throwaway server is accepted.
            for r in ("capital_app", "policy_app", "mandate_app", "capital_ro"):
                c.execute(f"ALTER ROLE {r} PASSWORD '{TEST_PASSWORD}'")
        return self

    def url(self, role: str) -> str:
        """A connection URL as `role` (no password: the test server trusts local)."""
        return make_conninfo(self.admin_url, user=role, password=TEST_PASSWORD)

    def __exit__(self, *exc) -> None:
        if self._server is not None:
            try:
                self._server.cleanup()
            finally:
                if self._data_dir:
                    shutil.rmtree(self._data_dir, ignore_errors=True)
        else:
            want = conninfo_to_dict(self.admin_url)
            server = make_conninfo(self.admin_url, dbname=want.get("user") or "postgres")
            with psycopg.connect(server, autocommit=True) as c:
                c.execute(f'DROP DATABASE IF EXISTS "{self.dbname}" WITH (FORCE)')
