"""Prove the corpus credential this process was given cannot write anything.

    CAPITAL_RO_DATABASE_URL=... python3 ETL/schema/check_readonly_credential.py

WHY THIS EXISTS. CI used to hold no database credential at all, and
check_guard_registry.py failed the build if a workflow named any secret. On
2026-11-05 the owner approved giving CI ONE: the read-only capital_ro URL, so
the site's data can be generated from the corpus instead of being committed.
That is safe for exactly one reason -- the role cannot write -- and a secret's
NAME proves nothing about its contents. Somebody pasting the capital_app URL
into a secret called CAPITAL_RO_DATABASE_URL would give every workflow run
write access to production, and every name-based check would stay green.

So the property is tested against the database itself, by asking it what the
connecting role may do, before any other step receives the credential
(check_guard_registry.py asserts this step runs first wherever the secret is
used). The role must be:

  * not a superuser, and unable to create roles or databases
  * without INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER on any
    table or view in any schema, directly or through a role it belongs to
  * without CREATE on any schema, so it cannot add an object either

A session flag (default_transaction_read_only) is not accepted as proof: a
client can turn it off. Privileges are what the server enforces.

Unset or empty: there is nothing to prove and nothing downstream can connect,
so it exits 0 and says so (a pull request from a fork gets no secrets).
"""
from __future__ import annotations

import os
import sys

import psycopg

ENV = "CAPITAL_RO_DATABASE_URL"
WRITE_PRIVILEGES = ("INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER")


def main() -> int:
    url = os.environ.get(ENV, "").strip()
    if not url:
        print(f"{ENV} is not set: no credential, nothing to prove.")
        return 0
    problems: list[str] = []
    with psycopg.connect(url) as con:
        user, superuser, createrole, createdb = con.execute(
            "SELECT current_user, rolsuper, rolcreaterole, rolcreatedb "
            "FROM pg_roles WHERE rolname = current_user").fetchone()
        if superuser:
            problems.append("the role is a SUPERUSER")
        if createrole:
            problems.append("the role can CREATE ROLE")
        if createdb:
            problems.append("the role can CREATE DATABASE")
        for priv in WRITE_PRIVILEGES:
            rows = con.execute(
                "SELECT n.nspname || '.' || c.relname FROM pg_class c "
                "JOIN pg_namespace n ON n.oid = c.relnamespace "
                "WHERE c.relkind IN ('r','p','v','m','f') "
                "  AND n.nspname NOT IN ('pg_catalog','information_schema') "
                "  AND n.nspname NOT LIKE 'pg_toast%%' "
                "  AND has_table_privilege(c.oid, %s) "
                "ORDER BY 1 LIMIT 5", (priv,)).fetchall()
            if rows:
                problems.append(f"{priv} on {', '.join(r[0] for r in rows)}"
                                f"{' ...' if len(rows) == 5 else ''}")
        rows = con.execute(
            "SELECT nspname FROM pg_namespace "
            "WHERE nspname NOT IN ('pg_catalog','information_schema') "
            "  AND nspname NOT LIKE 'pg_toast%%' AND nspname NOT LIKE 'pg_temp%%' "
            "  AND has_schema_privilege(oid, 'CREATE') ORDER BY 1").fetchall()
        if rows:
            problems.append(f"CREATE on schema {', '.join(r[0] for r in rows)}")
        n_read = con.execute(
            "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
            "WHERE n.nspname = 'capital' AND c.relkind IN ('r','v') "
            "  AND has_table_privilege(c.oid, 'SELECT')").fetchone()[0]
    if problems:
        print(f"REFUSED: {ENV} connects as {user!r}, which can write:")
        for p in problems:
            print(f"  - {p}")
        print("Only the capital_ro URL may be stored under this name "
              "(mandate/db/apply_roles.py prints it). Replace the secret.")
        return 1
    print(f"ok: {ENV} connects as {user!r}, which reads {n_read} capital tables/views "
          f"and can write none, create nothing, and grant nothing.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
