"""capital's extractor inputs come out of grounding by pinned sha256."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import sys
from pathlib import Path

import psycopg
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "capital" / "ETL" / "lib"))
import grounded_inputs as gi  # noqa: E402

from mandate.grounding import store_original  # noqa: E402


def test_materialise_reads_pinned_bytes_and_refuses_a_different_edition(mdb, bucket, tmp_path, monkeypatch):
    data = b"project,coordinator\n1,ACME\n"
    pins = {"groups": {"cordis": {"extractors": [], "files": [
        {"path": "cordis/project.csv", "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data),
         "url": "urn:mandate:capital:raw/cordis/project.csv"}]}}}
    pin_file = tmp_path / "pins.json"
    pin_file.write_text(json.dumps(pins))
    monkeypatch.setattr(gi, "PINS", pin_file)
    with psycopg.connect(mdb.url("capital_app")) as c:
        store_original(c, data, "urn:mandate:capital:raw/cordis/project.csv", "text/csv",
                       dt.datetime.now(dt.timezone.utc))
        raw = tmp_path / "raw"
        [p] = gi.materialise("cordis", raw=raw, con=c, bucket=bucket)
        assert p.read_bytes() == data
        assert gi.materialise("cordis", raw=raw, con=c, bucket=bucket) == [p]   # already there: no read
        p.write_bytes(b"a new edition")
        with pytest.raises(gi.InputError, match="adopt"):
            gi.materialise("cordis", raw=raw, con=c, bucket=bucket)
        c.rollback()


def test_every_declared_group_is_pinned():
    """A group declared in GROUPS but absent from the pins raises KeyError in the
    cron, at the step that needed it: the same invisible failure as the missing
    file it replaced. Both directions, so a pin with no declaration is caught too."""
    pinned = gi.pins()["groups"]
    assert set(pinned) == set(gi.GROUPS)
    for group, g in pinned.items():
        assert g["files"], group
        for f in g["files"]:
            assert len(f["sha256"]) == 64 and f["bytes"] > 0, (group, f["path"])
