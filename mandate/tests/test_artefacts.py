"""A release is published whole, read back verified, and found by the prebuild."""
from __future__ import annotations

import json

from mandate.artefacts import fetch, latest, publish
from mandate.runs import RunLog


def test_publish_then_fetch_round_trips_every_file(mdb, bucket, tmp_path):
    web = tmp_path / "web"
    (web / "public/data").mkdir(parents=True)
    (web / "lib/intelligence").mkdir(parents=True)
    (web / "public/data/synthesis.json").write_text(json.dumps({"kpis": 1}))
    (web / "lib/intelligence/peerPrior.generated.json").write_text("{}")
    (web / "lib/intelligence/notAnArtefact.ts").write_text("x")
    run = RunLog.start(mdb.url("capital_app"), brain="mandate", kind="weekly_refresh", strict=True)
    out = publish(web, mdb.url("capital_app"), run.id, bucket=bucket)
    assert out["files"] == 2 and out["uploaded"] == 2
    assert publish(web, mdb.url("capital_app"), run.id, bucket=bucket)["uploaded"] == 0  # immutable, deduped
    site = tmp_path / "deploy"
    assert fetch(site, mdb.url("capital_ro"), bucket=bucket) == 2
    assert json.loads((site / "public/data/synthesis.json").read_text()) == {"kpis": 1}
    assert not (site / "lib/intelligence/notAnArtefact.ts").exists()
    assert latest(mdb.url("capital_ro"))[2]["public/data/synthesis.json"]["bytes"] > 0
