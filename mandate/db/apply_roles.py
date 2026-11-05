"""Apply roles.sql to the shared Postgres, set each role's password, prove the
isolation holds, and store the per-role URLs where every service reads them.

    python3 mandate/db/apply_roles.py --admin-url "$ADMIN_URL"            # dry: verify only
    python3 mandate/db/apply_roles.py --admin-url "$ADMIN_URL" --apply    # create/rotate + store

THE STORE OF RECORD FOR CREDENTIALS IS RAILWAY, not a file. Each role's URL is
written as two variables on the database service (`pgvector`) of the Mandate project:

    CAPITAL_DATABASE_URL          private network, for Railway services
    CAPITAL_DATABASE_PUBLIC_URL   TCP proxy, for Vercel, CI and a laptop

The scheme is `postgres://`, the one spelling every client in the stack reads:
libpq, psycopg, node-pg, and SQLAlchemy after data.session's rewrite. A bare
`postgresql://` sends SQLAlchemy to psycopg2, which no brain installs; found
when the live policy API 500'd on its first connection as policy_app.

So a service declares `DATABASE_URL=${{pgvector.CAPITAL_DATABASE_URL}}` and a
rotation is one re-run of this script. Passwords never touch git or stdout.

--apply ROTATES every password. Anything still holding an old one will fail
loudly on its next connection, which is the intent.
"""
from __future__ import annotations

import argparse
import json
import secrets
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote, urlsplit

import psycopg
from psycopg import sql

HERE = Path(__file__).resolve().parent
PROJECT_ID = "6a8743db-3dc3-4a1c-94a5-78ac0a1e1bd9"
ENVIRONMENT_ID = "7ca8ec0d-dc1c-4979-a602-04dd31efacbd"
POSTGRES_SERVICE_ID = "921d5f94-90ac-4010-b3aa-31ebf125d30d"

#: role -> (schema it owns, schema it must NOT be able to write)
ROLES = {
    "capital_app": ("capital", "policy"),
    "policy_app": ("policy", "capital"),
    "mandate_app": ("mandate", "capital"),
    "capital_ro": ("capital", "capital"),  # read-only even on its own schema
}
RAILWAY = ["npx", "--yes", "@railway/cli"]


def run_sql_file(admin_url: str) -> None:
    psql = "/opt/homebrew/opt/postgresql@18/bin/psql"
    subprocess.run([psql, admin_url, "-X", "-q", "-f", str(HERE / "roles.sql")], check=True)


def railway_set(variables: dict[str, str]) -> None:
    query = (
        "mutation($input: VariableCollectionUpsertInput!) "
        "{ variableCollectionUpsert(input: $input) }"
    )
    payload = {"input": {"projectId": PROJECT_ID, "environmentId": ENVIRONMENT_ID,
                         "serviceId": POSTGRES_SERVICE_ID, "variables": variables,
                         "skipDeploys": True}}
    out = subprocess.run(RAILWAY + ["api", query, "--variables", json.dumps(payload)],
                         capture_output=True, text=True, check=True).stdout
    if '"errors"' in out:
        sys.exit(f"Railway refused the variable write: {out[:400]}")


def verify(url: str, role: str) -> list[str]:
    """What must be true for this role. Returns the failures, empty when sound."""
    own, foreign = ROLES[role]
    problems: list[str] = []
    with psycopg.connect(url, autocommit=True, connect_timeout=15) as c:
        path = c.execute("show search_path").fetchone()[0]
        if path.replace(" ", "") != f"{own},public":
            problems.append(f"{role}: search_path is {path!r}")
        if c.execute("select current_user").fetchone()[0] != role:
            problems.append(f"{role}: connected as the wrong user")
        try:
            c.execute(f"create table {foreign}._isolation_probe(x int)")
            c.execute(f"drop table {foreign}._isolation_probe")
            problems.append(f"{role}: CAN create tables in {foreign}")
        except (psycopg.errors.InsufficientPrivilege, psycopg.errors.ReadOnlySqlTransaction):
            pass  # refused: the isolation holds
        if role != "capital_ro":
            c.execute("create temp table _probe(v public.vector(3))")  # pgvector reachable
    return problems


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--admin-url", required=True)
    ap.add_argument("--public-host", default="centerbeam.proxy.rlwy.net:55822")
    ap.add_argument("--private-host", default="pgvector.railway.internal:5432")
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    db = urlsplit(a.admin_url).path.lstrip("/") or "railway"

    if a.apply:
        run_sql_file(a.admin_url)
        urls: dict[str, str] = {}
        with psycopg.connect(a.admin_url, autocommit=True) as c:
            for role in ROLES:
                pw = secrets.token_urlsafe(32)
                # Utility statements take no bind parameters; quote as a literal.
                c.execute(sql.SQL("ALTER ROLE {} PASSWORD {}").format(
                    sql.Identifier(role), sql.Literal(pw)))
                prefix = role.upper().replace("_APP", "")
                cred = f"{role}:{quote(pw, safe='')}"
                urls[f"{prefix}_DATABASE_URL"] = f"postgres://{cred}@{a.private_host}/{db}"
                urls[f"{prefix}_DATABASE_PUBLIC_URL"] = f"postgres://{cred}@{a.public_host}/{db}"
        railway_set(urls)
        print(f"stored {len(urls)} variables on the postgres service: {', '.join(sorted(urls))}")
    else:
        urls = {}
        print("dry run: verifying the roles with the URLs already stored on Railway")

    if not urls:
        query = (f'query{{ variables(projectId:"{PROJECT_ID}", environmentId:"{ENVIRONMENT_ID}", '
                 f'serviceId:"{POSTGRES_SERVICE_ID}") }}')
        out = subprocess.run(RAILWAY + ["api", query], capture_output=True, text=True,
                             check=True).stdout
        stored = json.loads(out[: out.rfind("}") + 1])["data"]["variables"]
        urls = {k: v for k, v in stored.items() if k.endswith("_DATABASE_PUBLIC_URL")}

    problems: list[str] = []
    for role in ROLES:
        key = role.upper().replace("_APP", "") + "_DATABASE_PUBLIC_URL"
        if key not in urls:
            problems.append(f"{role}: no {key} stored")
            continue
        problems += verify(urls[key], role)
    for p in problems:
        print("FAIL", p)
    print("all roles sound" if not problems else f"{len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
