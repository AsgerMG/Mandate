"""The SQLite schema must be rebuildable from committed DDL alone.

── The failure this exists to stop ────────────────────────────────────────
On 2026-08-07 the weekly census recorded `coverage: OperationalError: no such
column: tier`. That was migration 019 never reaching the Railway volume, and it
is fixed: the cron applies migrations now, and ETL/lib/schema_state.py answers
"does this store have migration N" from the store's own schema.

Underneath it was a second, quieter drift. Replaying schema.sql plus every
migration in ETL/events/load/migrations into an empty database did not produce
this project's schema. It produced an error, three times over:

    012  no such column: c.parent_group     (data/views.sql selects it)
    021  no such column: scheme_code        (the rebuild SELECTs it)
    then, silently, ten columns short

Fifteen columns of the live corpus were created by no committed statement at
all. Eleven by ETL scripts that ALTER themselves a column on first run;
FOUR -- scheme_code, application_url, sector_mix, scheme_operators -- by
somebody typing ALTER at a prompt, years ago, on one database. 759 of 1,088
leaves carry a scheme_code, the SA number that joins the corpus to the state aid
case register, and nothing in the repository created the column.

A schema nobody can rebuild is not a schema, it is an artefact of the order in
which scripts happened to run against one file. This check replays the DDL and
fails if the replay does not complete, so the next column added by hand is
caught by CI on the day it is added rather than by a census a year later.

── What it deliberately does not do ───────────────────────────────────────
It does not compare the replay against a live store. CI holds no corpus and no
credentials, and data/db.sqlite is gitignored: a check that reads it would skip
in the only place it has to run. Comparing the replay against the real stores is
the store-schema check's job, on the weekly cron where the data is.

    python3 ETL/schema/check_schema_replay.py
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        _sys.path.insert(0, str(_anc / "events" / "load" / "migrations"))
        break

import sqlite3  # noqa: E402
import tempfile  # noqa: E402

import schema_state  # noqa: E402

ROOT = _Path(__file__).resolve().parents[2]
SCHEMA = ROOT / "ETL/events/load/schema.sql"


def main() -> int:
    import apply as runner  # noqa: PLC0415 — needs the path bootstrap above

    with tempfile.TemporaryDirectory() as tmp:
        path = _Path(tmp) / "replay.sqlite"
        con = sqlite3.connect(path)
        try:
            con.executescript(SCHEMA.read_text())
            con.commit()
            print(f"schema.sql replayed into an empty store: "
                  f"{len(schema_state.pending(con))} migrations pending")
            for mig in schema_state.pending(con):
                try:
                    runner.MIGRATIONS[mig](con)
                    con.commit()
                except sqlite3.Error as exc:
                    print(f"\nFAILED at migration {mig} — "
                          f"{schema_state.DESCRIPTIONS[mig]}\n  {exc}\n\n"
                          f"The committed DDL cannot rebuild this project's "
                          f"schema. Either the migration is out of order in "
                          f"schema_state.MIGRATIONS, or it reads a column that "
                          f"no committed statement creates — which means that "
                          f"column exists only in the databases somebody has "
                          f"already ALTERed by hand.")
                    return 1
            still = schema_state.pending(con)
            if still:
                # Every migration ran and its own effect is not there. 021 and
                # 022 rebuild funding_instruments from a fixed column list and
                # DELETE anything not on it, so a column added too early is
                # dropped again without an error anywhere.
                print(f"\nFAILED: every migration ran and {len(still)} of them "
                      f"are still not present: {', '.join(still)}\n"
                      f"  A later migration is deleting an earlier one's "
                      f"columns. Check the order in schema_state.MIGRATIONS.")
                return 1
            tables = con.execute(
                "SELECT count(*) FROM sqlite_master WHERE type='table'").fetchone()[0]
            print(f"all {len(schema_state.IDS)} migrations replay clean — "
                  f"{tables} tables built from committed DDL alone.")
            return 0
        finally:
            con.close()


if __name__ == "__main__":
    raise SystemExit(main())
