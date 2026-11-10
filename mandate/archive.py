"""Archive a query's rows to the bucket as CSV.gz, verified by read-back.

    entry = archive_query(con, bucket, "archive/2026-11/classify_audit.csv.gz",
                          "SELECT * FROM capital.classify_audit ORDER BY id")

Archive, never delete: nothing is dropped or blanked by this module. The caller
(mandate/ops/archive_dead_weight.py) drops only after every entry it needs came
back verified. The verification is the point:

  1. the export and its row count are read in ONE repeatable-read snapshot, so
     the count is the count of exactly the rows exported;
  2. the object is read BACK from the bucket and must hash to the sha256 the
     export produced (a sidecar "<key>.sha256" holds it beside the object);
  3. the read-back is decompressed and parsed as CSV, and its row count must
     equal the snapshot's.
"""
from __future__ import annotations

import csv
import gzip
import hashlib
import io
from dataclasses import asdict, dataclass

from mandate.grounding.bucket import ARCHIVE_PREFIX


class ArchiveError(RuntimeError):
    pass


@dataclass(frozen=True)
class Entry:
    key: str
    sha256: str
    rows: int
    bytes: int
    query: str

    def as_dict(self) -> dict:
        return asdict(self)


def export_csv_gz(con, query: str) -> tuple[bytes, int]:
    """(gzip bytes of `query` as CSV with a header, the row count), in one snapshot.
    gzip's mtime is fixed so the same rows give the same bytes."""
    if con.autocommit:
        raise ArchiveError("export_csv_gz needs a transactional connection (autocommit off)")
    buf = io.BytesIO()
    con.rollback()  # the snapshot starts here, with nothing before it
    try:
        con.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        rows = con.execute(f"SELECT count(*) FROM ({query}) q").fetchone()[0]
        with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0) as gz:
            with con.cursor().copy(f"COPY ({query}) TO STDOUT WITH (FORMAT csv, HEADER)") as cp:
                for chunk in cp:
                    gz.write(bytes(chunk))
    finally:
        con.rollback()
    return buf.getvalue(), rows


def csv_rows(data: bytes) -> int:
    """Data rows in a CSV.gz with a header (embedded newlines are one row)."""
    text = io.TextIOWrapper(gzip.GzipFile(fileobj=io.BytesIO(data)), encoding="utf-8", newline="")
    return max(sum(1 for _ in csv.reader(text)) - 1, 0)


def archive_query(con, bucket, key: str, query: str) -> Entry:
    if not key.startswith(ARCHIVE_PREFIX) or not key.endswith(".csv.gz"):
        raise ArchiveError(f"an archive key is {ARCHIVE_PREFIX}<yyyy-mm>/<name>.csv.gz, not {key!r}")
    data, rows = export_csv_gz(con, query)
    sha = hashlib.sha256(data).hexdigest()
    bucket.put_archive(key, data, "application/gzip")
    bucket.put_archive(f"{key}.sha256", f"{sha}  {key.rsplit('/', 1)[-1]}\n".encode(), "text/plain")
    back = bucket.get_archive(key)
    got = hashlib.sha256(back).hexdigest()
    if got != sha:
        raise ArchiveError(f"{key}: read back sha256 {got}, wrote {sha}")
    n = csv_rows(back)
    if n != rows:
        raise ArchiveError(f"{key}: read back {n} rows, the snapshot had {rows}")
    side = bucket.get_archive(f"{key}.sha256").decode().split()[0]
    if side != sha:
        raise ArchiveError(f"{key}.sha256 holds {side}, not {sha}")
    return Entry(key=key, sha256=sha, rows=rows, bytes=len(data), query=query)
