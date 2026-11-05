"""Back up every table in Railway Postgres to newline-delimited JSON.

`pg_dump` is not installed on this machine and the Postgres major version has to
match the server's, so this uses psycopg2's COPY ... TO with a JSON row encoder
instead: same content, no client-version coupling, restorable by replaying the
rows. It is not a substitute for a real pg_dump where one is available -- it
does not carry schema, indexes or constraints -- so it writes the schema
separately alongside.

Written because the corpus is about to be merged across two stores that have
diverged in both directions, and the PM's instruction is that nothing may be
lost. A backup nobody has verified is a plan, not a backup, so this re-reads
what it wrote and reports the row counts back.

    python3 ETL/lib/backup_postgres.py ~/Wincent-backups-YYYYMMDD
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import psycopg2


def main() -> int:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "postgres-backup").expanduser()
    out.mkdir(parents=True, exist_ok=True)

    url = os.environ.get("DATABASE_URL")
    if not url:
        root = Path(__file__).resolve().parents[2]
        for line in (root / ".env.local").read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                url = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not url:
        print("no DATABASE_URL", file=sys.stderr)
        return 1

    conn = psycopg2.connect(url)
    cur = conn.cursor()
    cur.execute("SELECT table_name FROM information_schema.tables "
                "WHERE table_schema=current_schema() ORDER BY table_name")
    tables = [r[0] for r in cur.fetchall()]

    # Schema first, so a restore has something to restore INTO.
    schema = {}
    for t in tables:
        cur.execute("SELECT column_name, data_type, is_nullable FROM "
                    "information_schema.columns WHERE table_schema=current_schema() AND table_name=%s "
                    "ORDER BY ordinal_position", (t,))
        schema[t] = [{"name": c, "type": d, "nullable": n} for c, d, n in cur.fetchall()]
    (out / "schema.json").write_text(json.dumps(schema, indent=1))

    written: dict[str, int] = {}
    for t in tables:
        cur.execute(f'SELECT count(*) FROM "{t}"')
        expected = cur.fetchone()[0]
        cols = [c["name"] for c in schema[t]]
        path = out / f"{t}.jsonl"
        n = 0
        with path.open("w") as fh:
            # Server-side cursor: some of these tables are large and this must
            # not depend on the whole result fitting in memory.
            with conn.cursor(name=f"dump_{t}") as scur:
                scur.itersize = 5000
                scur.execute(f'SELECT * FROM "{t}"')
                for row in scur:
                    fh.write(json.dumps(dict(zip(cols, row)), default=str) + "\n")
                    n += 1
        written[t] = n
        flag = "" if n == expected else f"   MISMATCH expected {expected}"
        print(f"  {t:28s} {n:>8,} rows{flag}")
        if n != expected:
            print(f"FAILED: {t} wrote {n} of {expected}", file=sys.stderr)
            return 1

    # Verify by re-reading, not by trusting the write.
    for t, n in written.items():
        actual = sum(1 for _ in (out / f"{t}.jsonl").open())
        if actual != n:
            print(f"FAILED verification: {t} re-reads {actual}, wrote {n}", file=sys.stderr)
            return 1

    total = sum(written.values())
    (out / "MANIFEST.json").write_text(json.dumps(
        {"tables": written, "total_rows": total}, indent=1))
    print(f"\nbackup ok — {len(tables)} tables, {total:,} rows, verified by re-read")
    print(f"  {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
