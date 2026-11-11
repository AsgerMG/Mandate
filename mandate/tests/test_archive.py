"""Archive before drop: the export, the read-back verification, and the
reader scan of mandate/ops/archive_dead_weight.py."""
from __future__ import annotations

import gzip
import importlib.util
from pathlib import Path

import psycopg
import pytest

from mandate.archive import ArchiveError, archive_query, csv_rows
from mandate.grounding.bucket import FilesystemBucket
from mandate.grounding.testing import EphemeralMandate

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def db():
    with EphemeralMandate() as d:
        with psycopg.connect(d.admin_url, autocommit=True) as c:
            c.execute("CREATE TABLE capital.dead (id int PRIMARY KEY, note text)")
            c.execute("INSERT INTO capital.dead SELECT g, CASE WHEN g % 3 = 0 THEN E'two\\nlines, \"quoted\"' "
                      "ELSE 'row ' || g END FROM generate_series(1, 250) g")
        yield d


def test_an_archive_round_trips_with_its_sha_and_every_row(db, tmp_path):
    b = FilesystemBucket(tmp_path)
    with psycopg.connect(db.admin_url) as c:
        e = archive_query(c, b, "archive/2026-11/dead.csv.gz", "SELECT * FROM capital.dead ORDER BY id")
    assert e.rows == 250 and csv_rows(b.get_archive(e.key)) == 250
    assert b.get_archive(e.key + ".sha256").decode().startswith(e.sha256)
    text = gzip.decompress(b.get_archive(e.key)).decode()
    assert text.startswith("id,note\n") and 'two\nlines, ""quoted""' in text
    # the same rows give the same bytes (gzip mtime fixed)
    with psycopg.connect(db.admin_url) as c:
        assert archive_query(c, b, "archive/2026-11/dead2.csv.gz", "SELECT * FROM capital.dead ORDER BY id").sha256 == e.sha256


class _Corrupting(FilesystemBucket):
    def get_archive(self, key):
        data = super().get_archive(key)
        return data if key.endswith(".sha256") else data[:-8] + b"\0" * 8


def test_a_read_back_that_does_not_match_refuses(db, tmp_path):
    with psycopg.connect(db.admin_url) as c, pytest.raises(ArchiveError, match="read back sha256"):
        archive_query(c, _Corrupting(tmp_path), "archive/2026-11/dead.csv.gz", "SELECT * FROM capital.dead")


def test_only_archive_keys_are_accepted(db, tmp_path):
    with psycopg.connect(db.admin_url) as c, pytest.raises(ArchiveError):
        archive_query(c, FilesystemBucket(tmp_path), "sha256/ab/x.csv.gz", "SELECT 1")
    with pytest.raises(ValueError):
        FilesystemBucket(tmp_path).put_archive("archive/../sha256/x", b"", "text/plain")


def test_no_live_reader_names_a_table_to_drop():
    spec = importlib.util.spec_from_file_location("adw", ROOT / "mandate/ops/archive_dead_weight.py")
    adw = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(adw)
    assert adw.live_references() == []
    # request_log and event_log are still written: never in this batch
    assert not {"request_log", "event_log", "satr_staging"} & set(adw.DROP)


def test_the_schema_change_drops_the_tables_and_lowers_the_registers(tmp_path, monkeypatch):
    """The archive ran on 2026-11-11 (mandate/ops/archives.json). The committed
    state it left must hold: migration 040 drops every archived table, and the
    registers no longer declare them. (Until it ran, this test rehearsed
    write_schema_change on copies; that rehearsal is in git history.)"""
    import json

    spec = importlib.util.spec_from_file_location("adw2", ROOT / "mandate/ops/archive_dead_weight.py")
    adw = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(adw)
    mig = ROOT / "capital/ETL/schema/migrations/040_archive_dead_weight.sql"
    assert mig.exists()
    assert all(f'DROP TABLE IF EXISTS "{t}";' in mig.read_text() for t in adw.DROP)
    sor = json.loads((ROOT / "capital/ETL/schema/store_of_record.json").read_text())
    assert not any(t in sor["tables"] for t in adw.DROP)
    debt = json.loads((ROOT / "capital/ETL/schema/schema_debt.json").read_text())
    assert debt["tables_without_ddl"] == [] and debt["budget"] == 0
    rec = json.loads((ROOT / "mandate/ops/archives.json").read_text())
    assert any("archive/2026-11/" in json.dumps(v) for v in (rec.values() if isinstance(rec, dict) else rec))
