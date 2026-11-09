"""Run eval scenarios end to end against a mission endpoint.

    PYTHONPATH=. python3 -m mandate.eval.runner fintech_guarantees edtech_ai_kids \\
        --mission-url http://localhost:3000/api/mandate/mission \\
        --mandate-api http://127.0.0.1:8090        # token from MANDATE_SERVICE_TOKEN

Per scenario: bootstrap a workspace and the scenario's profile in mandate-api,
POST the founder's words to the mission endpoint and collect the MissionEvent
NDJSON; if Mandate asks the founder first and the scenario carries a
`founder_followup`, answer once and continue the same mission. Then read the
mission back as stored, validate every citation (citations.py), optionally
judge it (--judge, costs money), and write the run to mandate/eval/runs/.

--record also inserts the run into mandate.eval_runs (mandate/db/eval_runs.sql)
through EVAL_DATABASE_URL; it refuses when the table does not exist.

THIS SPENDS MONEY: every scenario is a live mission. A dry run (--dry-run)
prints what would be sent and stops.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path

import httpx

from . import citations as cit
from . import judge as jdg
from .scenarios import Scenario, load, profile_from_hint

RUNS = Path(__file__).resolve().parent / "runs"


class Api:
    def __init__(self, base: str, token: str, client: httpx.Client | None = None) -> None:
        self.base, self.token = base.rstrip("/"), token
        self.http = client or httpx.Client(timeout=120)

    def call(self, method: str, path: str, body=None):
        r = self.http.request(method, f"{self.base}{path}", json=body,
                              headers={"Authorization": f"Bearer {self.token}"})
        if r.status_code >= 400:
            raise RuntimeError(f"mandate-api {method} {path}: {r.status_code} {r.text[:300]}")
        return r.json()


def stream_mission(http: httpx.Client, url: str, body: dict, headers: dict) -> list[dict]:
    events: list[dict] = []
    with http.stream("POST", url, json=body, headers=headers, timeout=httpx.Timeout(340, connect=10)) as r:
        if r.status_code >= 400:
            raise RuntimeError(f"mission endpoint: {r.status_code} {r.read().decode()[:300]}")
        for line in r.iter_lines():
            if line.strip():
                ev = json.loads(line)
                events.append(ev)
                print(f"  {ev.get('type'):22} {_brief(ev)}", flush=True)
    return events


def _brief(ev: dict) -> str:
    if ev.get("type") == "decision":
        return ev["decision"]["title"][:90]
    if ev.get("type") in ("flag",):
        return ev["flag"]["title"][:90]
    if ev.get("type") == "action":
        return ev["action"]["title"][:90]
    if ev.get("type") == "tool_used":
        return f"{ev.get('specialist')}.{ev.get('tool')} {ev.get('summary', '')[:60]}"
    if ev.get("type") == "cost":
        return f"EUR {ev.get('eur')}"
    if ev.get("type") == "error":
        return ev.get("message", "")[:120]
    return str(ev.get("specialist") or ev.get("objective") or "")[:90]


def run_scenario(s: Scenario, *, api: Api, mission_url: str, http: httpx.Client,
                 mission_key: str | None, judge: bool) -> dict:
    profile, dropped = profile_from_hint(s)
    boot = api.call("POST", "/bootstrap", {"email": f"eval+{uuid.uuid4().hex[:10]}@mandate.invalid",
                                            "workspace_name": f"eval {s.id}", "profile": profile})
    headers = {"x-mandate-key": mission_key} if mission_key else {}
    body = {"workspaceId": boot["workspace_id"], "profileId": boot["profile_id"],
            "profileVersion": boot["profile_version"], "objective": s.founder_says, "mode": "live",
            **({"job": s.job} if s.job else {})}
    t0 = time.time()
    events = stream_mission(http, mission_url, body, headers)
    mission_id = next((e.get("missionId") for e in events if e.get("missionId")), None)
    asked = any(e.get("type") == "questions" for e in events)
    if asked and s.founder_followup and mission_id:
        print("  -- Mandate asked first; answering with the scenario's founder_followup", flush=True)
        prof = api.call("GET", f"/profiles/{boot['profile_id']}")
        events += stream_mission(http, mission_url, {**body, "objective": s.founder_followup,
                                                     "missionId": mission_id,
                                                     "profileVersion": prof["version"]}, headers)
    duration = time.time() - t0
    mission = api.call("GET", f"/missions/{mission_id}") if mission_id else {}
    validation = cit.validate(mission, lambda cs: api.call("POST", "/grounding/verify", {"citations": cs})["results"])
    record = jdg.render_record(mission, events)
    verdict = jdg.judge(s, record) if judge else None
    cost = sum(e.get("eur", 0) for e in events if e.get("type") == "cost")
    return {
        "scenario": s.id, "scenario_sha256": s.sha256, "endpoint": mission_url, "mission_id": mission_id,
        "git_commit": _git(), "profile": profile, "profile_dropped": dropped,
        "asked_first": asked, "transcript": events, "record": record,
        "rubric": verdict["checkpoints"] if verdict else [{**c, "met": None} for c in s.checkpoints()],
        "rubric_score": verdict["score"] if verdict else None, "judge": "claude" if verdict else "none",
        "judge_overall": verdict["overall"] if verdict else None,
        "citations": validation, "citation_score": validation["score"], "claims": validation["claims"],
        "cost_eur": round(cost, 4), "duration_s": round(duration, 1),
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }


def _git() -> str | None:
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    except Exception:  # noqa: BLE001
        return None


def record_run(run: dict, url: str) -> None:
    import psycopg  # noqa: PLC0415

    with psycopg.connect(url) as con:
        if con.execute("SELECT to_regclass('mandate.eval_runs')").fetchone()[0] is None:
            raise SystemExit("mandate.eval_runs does not exist: apply mandate/db/eval_runs.sql first")
        con.execute(
            "INSERT INTO mandate.eval_runs (scenario, scenario_sha256, git_commit, endpoint, mission_id, "
            "transcript, rubric, rubric_score, citations, citation_score, claims, judge, cost_eur, duration_s) "
            "VALUES (%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s,%s::jsonb,%s,%s::jsonb,%s,%s,%s)",
            (run["scenario"], run["scenario_sha256"], run["git_commit"], run["endpoint"], run["mission_id"],
             json.dumps(run["transcript"]), json.dumps(run["rubric"]), run["rubric_score"],
             json.dumps(run["citations"]), run["citation_score"], json.dumps(run["claims"]),
             run["judge"], run["cost_eur"], run["duration_s"]))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("scenarios", nargs="+", help="scenario ids or paths")
    ap.add_argument("--mission-url", default="http://localhost:3000/api/mandate/mission")
    ap.add_argument("--mandate-api", default=os.environ.get("MANDATE_API_URL", "http://127.0.0.1:8090"))
    ap.add_argument("--judge", action="store_true", help="grade with the Claude judge (costs money)")
    ap.add_argument("--record", action="store_true", help="insert into mandate.eval_runs (EVAL_DATABASE_URL)")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    scenarios = [load(x) for x in a.scenarios]
    if a.dry_run:
        for s in scenarios:
            prof, dropped = profile_from_hint(s)
            print(json.dumps({"scenario": s.id, "profile": prof, "dropped": dropped,
                              "checkpoints": len(s.checkpoints())}, indent=1, ensure_ascii=False))
        return 0
    token = os.environ.get("MANDATE_SERVICE_TOKEN", "")
    if not token:
        raise SystemExit("MANDATE_SERVICE_TOKEN is not set")
    api = Api(a.mandate_api, token)
    RUNS.mkdir(exist_ok=True)
    http = httpx.Client()
    for s in scenarios:
        print(f"== {s.id}", flush=True)
        run = run_scenario(s, api=api, mission_url=a.mission_url, http=http,
                           mission_key=os.environ.get("MANDATE_MISSION_KEY"), judge=a.judge)
        out = RUNS / f"{run['created_at'][:19].replace(':', '-')}_{s.id}.json"
        out.write_text(json.dumps(run, indent=1, ensure_ascii=False, default=str))
        c = run["citations"]
        print(f"   -> {out.name}: citations {c['quote_matched']}/{c['total']} verified, claims {run['claims']}, "
              f"rubric {run['rubric_score']}, EUR {run['cost_eur']}, {run['duration_s']}s", flush=True)
        if a.record:
            url = os.environ.get("EVAL_DATABASE_URL")
            if not url:
                raise SystemExit("--record needs EVAL_DATABASE_URL")
            record_run(run, url)
    return 0


if __name__ == "__main__":
    sys.exit(main())
