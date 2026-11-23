"""The store-schema guard's DDL reader: a Postgres column named `key` is a column, not
MySQL's `KEY name (...)` index (22 Nov 2026: six graph-core tables' `key` columns were reported
as hand-run ALTERs and the guard went red on a false finding). Run: python3 ETL/schema/test_store_schema_parse.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_store_schema as c  # noqa: E402

COLUMNS = ["key TEXT NOT NULL UNIQUE", "key           TEXT PRIMARY KEY", "keywords TEXT", "unique_count INT"]
CONSTRAINTS = ["PRIMARY KEY (a)", "KEY idx_a (a)", "UNIQUE (a, b)", "CHECK (a > 0)", "FOREIGN KEY (a) REFERENCES t(a)",
               "CONSTRAINT x CHECK (a > 0)"]

for line in COLUMNS:
    assert not c._CONSTRAINT.match(line), f"read as a constraint, is a column: {line!r}"
for line in CONSTRAINTS:
    assert c._CONSTRAINT.match(line), f"read as a column, is a constraint: {line!r}"
print("store schema DDL reader: ok")
