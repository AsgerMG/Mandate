"""Is every brain on current intel? Reality against mandate/health/targets.json.

    python3 mandate/health/check.py                 # print the findings; exit 1 on a breach
    python3 mandate/health/check.py --json out.json # also write them
    python3 mandate/health/check.py --github        # keep the ONE issue "Mandate health"

READ-ONLY. Connects as capital_ro (CAPITAL_RO_DATABASE_URL), which can read
schema capital, mandate.runs / run_steps / artefact_releases and grounding, and
can write nothing. Everything about policy is read from the runs policy records
in mandate.runs, so no policy credential is needed (a policy_ro role is
proposed in mandate/db/policy_ro.sql for checks that ever need policy tables).

Each finding says WHAT is out of target, WHERE (brain, table, source) and SINCE
WHEN. A check that cannot be evaluated (no record yet, a table missing) is a
breach, not a pass: silence is the state this exists to end.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGETS = Path(__file__).with_name("targets.json")
ISSUE_TITLE = "Mandate health"
NOW = dt.datetime.now(dt.timezone.utc)


@dataclass
class Finding:
    id: str          # stable key, e.g. "brain:policy"
    what: str
    where: str
    since: str | None


def _q(c, sql, params=()):
    try:
        return c.execute(sql, params).fetchall()
    except Exception as exc:  # noqa: BLE001
        c.rollback()
        raise LookupError(f"{type(exc).__name__}: {str(exc).splitlines()[0]}") from exc


def _iso(t) -> str | None:
    return t.astimezone(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC") if t else None


def _capital_auto_sources() -> list[str]:
    sys.path.insert(0, str(ROOT / "capital" / "ETL" / "events" / "extract"))
    import manifest  # noqa: PLC0415
    # OUT-market sources are frozen by decision (manifest.refreshed): holding
    # them to a weekly cadence would page on the decision itself.
    return [s.key for s in manifest.SOURCES if manifest.refreshed(s)]


def check(c, t: dict) -> list[Finding]:
    out: list[Finding] = []

    def guard(fid: str, where: str, fn):
        try:
            fn()
        except LookupError as exc:
            out.append(Finding(fid, f"could not be checked: {exc}", where, None))

    # ── each brain refreshed ────────────────────────────────────────────────
    def brain_check(brain: str, days: int):
        if True:
            if brain == "capital":
                rows = _q(c, """
                    SELECT max(finished_at) FROM (
                      SELECT finished_at FROM mandate.runs
                       WHERE brain = 'capital' AND status IN ('ok','partial')
                      UNION ALL
                      SELECT s.finished_at FROM mandate.run_steps s
                       WHERE s.name = 'capital' AND s.status IN ('ok','partial')) x""")
                last = rows[0][0]
                if last is None:   # before the first recorded run: the census
                    last = _q(c, "SELECT max(taken_at) FROM capital.corpus_census "
                                 "WHERE run_outcome = 'ok' OR run_outcome LIKE 'partial%%'")[0][0]
            else:
                last = _q(c, "SELECT max(finished_at) FROM mandate.runs WHERE brain = %s "
                             "AND status IN ('ok','partial')", (brain,))[0][0]
            if last is None or NOW - last > dt.timedelta(days=days):
                out.append(Finding(f"brain:{brain}",
                                   f"{brain} has not completed a refresh within {days} days "
                                   f"(last completed: {_iso(last) or 'never recorded'})",
                                   f"brain {brain}, mandate.runs",
                                   _iso(last + dt.timedelta(days=days)) if last else None))
    for brain, days in t["brain_refreshed_within_days"].items():
        guard(f"brain:{brain}", "mandate.runs", lambda b=brain, d=days: brain_check(b, d))

    # ── stuck runs ──────────────────────────────────────────────────────────
    def stuck():
        h = t["run_stuck_after_hours"]
        for rid, brain, kind, hb in _q(c, """
                SELECT id, brain, kind, heartbeat_at FROM mandate.runs
                 WHERE status = 'running' AND heartbeat_at < now() - make_interval(hours => %s)
                 ORDER BY id""", (h,)):
            out.append(Finding(f"stuck:{rid}", f"run {rid} ({brain} {kind}) stopped without finishing; "
                               f"no heartbeat for over {h} h", f"mandate.runs id {rid}", _iso(hb)))
    guard("stuck", "mandate.runs", stuck)

    # ── embedded ────────────────────────────────────────────────────────────
    def embedded():
        need = t["embedded_share_min"]
        pub = """FROM capital.funding_instruments i
                 WHERE NOT i.is_framework
                   AND NOT EXISTS (SELECT 1 FROM capital.funding_instruments k WHERE k.parent_id = i.id)"""
        for key, table in (("instrument_eligibility_embeddings", "capital.eligibility_embeddings"),
                           ("instrument_profiles", "capital.instrument_profiles")):
            n, have = _q(c, f"SELECT count(*), count(*) FILTER (WHERE EXISTS "
                            f"(SELECT 1 FROM {table} e WHERE e.instrument_id = i.id)) {pub}")[0]
            if n and have / n < need[key]:
                out.append(Finding(f"embedded:{key}", f"{n - have} of {n} publishable instruments have "
                                   f"no row in {table} ({have / n:.1%}, target {need[key]:.0%})",
                                   f"capital, {table}", None))
        sys.path.insert(0, str(ROOT))
        from mandate.embedding import MODEL  # noqa: PLC0415
        n, have = _q(c, "SELECT count(*), count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "
                        "grounding.passage_embeddings e WHERE e.passage_id = p.id AND e.model = %s)) "
                        "FROM grounding.passages p", (MODEL,))[0]
        if n and have / n < need["grounding_passages"]:
            out.append(Finding("embedded:grounding_passages",
                               f"{n - have} of {n} grounding passages have no {MODEL} vector "
                               f"({have / n:.1%}, target {need['grounding_passages']:.0%})",
                               "grounding.passage_embeddings", None))
    guard("embedded", "capital / grounding", embedded)

    # ── sources within cadence ──────────────────────────────────────────────
    cad = t["source_cadence_days"]

    def capital_sources():
        last_ok: dict[str, dt.datetime] = {}
        for fin, detail in _q(c, "SELECT finished_at, detail FROM mandate.run_steps "
                                 "WHERE name LIKE 'renew.py%%' AND finished_at IS NOT NULL"):
            for key, rc in (detail or {}).get("sources", {}).items():
                if rc == 0 and (key not in last_ok or fin > last_ok[key]):
                    last_ok[key] = fin
        for key in _capital_auto_sources():
            days = cad["overrides"].get(f"capital:{key}", cad["capital_default"])
            last = last_ok.get(key)
            if last is None or NOW - last > dt.timedelta(days=days):
                out.append(Finding(f"source:capital:{key}",
                                   f"capital source {key} has not loaded successfully within {days} days "
                                   f"(last success: {_iso(last) or 'never recorded'})",
                                   f"capital, renew.py --auto, source {key}",
                                   _iso(last + dt.timedelta(days=days)) if last else None))
    guard("source:capital", "mandate.run_steps", capital_sources)

    def policy_sources():
        """A source is held to the sources the LAST run attempted (a disabled
        or archived source stops alarming). It is flagged when:
          - its latest attempt crashed with a permanent error (403, 404, a
            parse failure): at once, with the streak and the error, so a block
            or a moved feed cannot sit silent for weeks again;
          - it has not succeeded within its cadence, where a streak made only
            of transient failures (network, 429, 5xx, which the next run
            retries) gets one extra cadence of grace, so one 503 does not page.
        """
        rows = _q(c, "SELECT finished_at, detail FROM mandate.runs WHERE brain = 'policy' "
                     "AND finished_at IS NOT NULL ORDER BY finished_at")
        last_ok: dict[str, dt.datetime] = {}
        streak: dict[str, list[dict]] = {}      # failures since the last success
        latest: set[str] = set()
        for fin, detail in rows:
            sources = (detail or {}).get("sources", {})
            if sources:
                latest = set(sources)
            for key, v in sources.items():
                if v.get("ok"):
                    last_ok[key] = fin
                    streak[key] = []
                else:
                    streak.setdefault(key, []).append(v)
        for key in sorted(latest):
            days = cad["overrides"].get(f"policy:{key}", cad["policy_default"])
            last = last_ok.get(key)
            fails = streak.get(key, [])
            transient_only = bool(fails) and all(v.get("transient") for v in fails)
            grace = days * 2 if transient_only else days
            stale = last is None or NOW - last > dt.timedelta(days=grace)
            permanent = bool(fails) and not fails[-1].get("transient")
            if transient_only and last is None and len(fails) < 2:
                stale = False   # first sighting, one transient failure: retry first
            if not (stale or permanent):
                continue
            why = (f"crashed {len(fails)} run(s) in a row"
                   + (" (transient only)" if transient_only else "")
                   + (f", last error: {fails[-1].get('error')}" if fails and fails[-1].get("error") else "")
                   if fails else "no successful refresh")
            out.append(Finding(f"source:policy:{key}",
                               f"policy source {key}: {why} (last success: {_iso(last) or 'never'}; "
                               f"cadence {days} days)",
                               f"policy, source {key}", _iso(last + dt.timedelta(days=days)) if last else None))
    guard("source:policy", "mandate.runs", policy_sources)

    # ── signals digest and the artefact release ────────────────────────────
    def digest_and_release():
        days = t["signals_digest_max_age_days"]
        last = _q(c, "SELECT max(finished_at) FROM mandate.run_steps "
                     "WHERE name LIKE 'signals_digest.py%%' AND status = 'ok'")[0][0]
        if last is None or NOW - last > dt.timedelta(days=days):
            out.append(Finding("signals_digest", f"the news digest has not been rebuilt within {days} days "
                               f"(last: {_iso(last) or 'never recorded'}); the brief hides its news at 21",
                               "capital, website/build/signals_digest.py",
                               _iso(last + dt.timedelta(days=days)) if last else None))
        days = t["artefact_release_max_age_days"]
        last = _q(c, "SELECT max(created_at) FROM mandate.artefact_releases")[0][0]
        if last is None or NOW - last > dt.timedelta(days=days):
            out.append(Finding("artefacts", f"no site artefact release within {days} days "
                               f"(last: {_iso(last) or 'never'}); deploys build from the database",
                               "mandate.artefact_releases", _iso(last + dt.timedelta(days=days)) if last else None))
    guard("digest", "mandate.run_steps / artefact_releases", digest_and_release)

    # ── the corpus guards' published verdicts ──────────────────────────────
    # The guard list is capital/data/guard_registry.json (read, never copied):
    # census, store_schema, corpus_marks, offerable_decay (the weekly run
    # publishes them) and applicant_identity (published when its inputs
    # change, so it has no clock). Red, errored, never published or, for a
    # weekly one, late: each is a breach in this one issue.
    def guard_verdicts():
        reg = json.loads((ROOT / "capital" / "data" / "guard_registry.json").read_text())
        days = t["guard_verdict_max_age_days"]
        newest = {g: (s, at, summ) for g, s, at, summ in _q(c, """
            SELECT DISTINCT ON (guard) guard, status, taken_at, summary
              FROM capital.guard_verdicts ORDER BY guard, taken_at DESC""")}
        for g in reg["guards"]:
            gid, weekly = g["id"], g["cadence"] == "weekly"
            where = f"capital guard {gid}, capital.guard_verdicts"
            if gid not in newest:
                out.append(Finding(f"guard:{gid}", f"guard {gid} has never published a verdict",
                                   where, None))
                continue
            status, at, summary = newest[gid]
            if status != "ok":
                out.append(Finding(f"guard:{gid}", f"guard {gid} is {status}: {summary[:200]}",
                                   where, _iso(at)))
            elif weekly and NOW - at > dt.timedelta(days=days):
                out.append(Finding(f"guard:{gid}", f"guard {gid} has not published within {days} days "
                                   f"(last: {_iso(at)})", where, _iso(at + dt.timedelta(days=days))))
    guard("guards", "capital.guard_verdicts", guard_verdicts)
    return out


# ── paid steps paused for budget: expected, reported, never a breach ────────
#: The weekly steps that call the model. A run counts for the pause streak only
#: if it reached one of them, so a run that stopped earlier says nothing either way.
PAID_STEP_PATTERNS = ("classify_taxonomy.py run%", "news_cron.py%")


def _streak(rows) -> tuple[dt.datetime, str] | None:
    """rows: (paused, first_skip_at, reason) per run, oldest first. The start of
    the trailing run of paused runs, and the newest reason, or None if the latest
    run was not paused."""
    start, reason = None, ""
    for paused, at, why in rows:
        if paused:
            start = start or at
            reason = why or reason
        else:
            start, reason = None, ""
    return (start, reason) if start else None


def budget_pause(c) -> list[str]:
    """One line per brain whose newest run skipped its paid steps for want of a
    model budget (LLM_BUDGET=off, or the credit ran out: mandate/llm/budget.py).

    NOT a finding. Paused paid steps change no data, and the owner paused them
    on purpose, so an alarm would be noise. But a pause nobody can see is how a
    weekly labelling pass goes missing for a quarter, so the report says it, with
    the date it began, every day it lasts."""
    out: list[str] = []
    pat = "LLM budget %"

    def note(brain: str, s) -> None:
        if s:
            kind = "exhausted" if "exhausted" in s[1] else "off"
            out.append(f"{brain}: paid steps paused: budget {kind} since {_iso(s[0])}")

    def capital():
        rows = _q(c, """
            SELECT bool_or(s.status = 'skipped' AND s.summary LIKE %s),
                   min(s.finished_at) FILTER (WHERE s.status = 'skipped' AND s.summary LIKE %s),
                   max(s.summary) FILTER (WHERE s.status = 'skipped' AND s.summary LIKE %s)
              FROM mandate.runs r JOIN mandate.run_steps s ON s.run_id = r.id
             WHERE r.finished_at IS NOT NULL AND s.name LIKE ANY (%s)
             GROUP BY r.id, r.started_at ORDER BY r.started_at, r.id""",
                  (pat, pat, pat, list(PAID_STEP_PATTERNS)))
        note("capital", _streak(rows))

    def policy():
        rows = _q(c, """
            SELECT detail ? 'llm_budget_paused', finished_at, detail->>'llm_budget_paused'
              FROM mandate.runs WHERE brain = 'policy' AND finished_at IS NOT NULL
             ORDER BY finished_at, id""")
        note("policy", _streak(rows))

    for fn in (capital, policy):
        try:
            fn()
        except LookupError:
            pass        # the brain checks above already report an unreadable run log
    return out


# ── the ONE issue ───────────────────────────────────────────────────────────
MARK = "<!-- mandate-health:"


def _gh(*args: str, input: str | None = None) -> str:
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True, input=input).stdout


def sync_issue(findings: list[Finding], notes: list[str] | None = None) -> str:
    issues = json.loads(_gh("issue", "list", "--state", "open", "--search", f'in:title "{ISSUE_TITLE}"',
                            "--json", "number,title,body", "--limit", "20"))
    issue = next((i for i in issues if i["title"] == ISSUE_TITLE), None)
    if not findings:
        if issue:
            _gh("issue", "close", str(issue["number"]), "--comment",
                f"All targets met at {_iso(NOW)}. Closing."
                + "".join(f"\n\nNote: {n}" for n in notes or []))
            return f"closed #{issue['number']}"
        return "green; no issue open"
    # carry first-seen times for findings that have no derivable start
    seen: dict[str, str] = {}
    if issue and MARK in (issue["body"] or ""):
        m = re.search(re.escape(MARK) + r"(.*?)-->", issue["body"], re.S)
        if m:
            seen = json.loads(m.group(1))
    lines = [f"Checked {_iso(NOW)} against `mandate/health/targets.json`. "
             f"{len(findings)} target(s) out of range. This issue closes itself when all are met.", "",
             *[f"Note (expected, not a breach): {n}" for n in notes or []],
             *([""] if notes else []),
             "| what | where | since |", "|---|---|---|"]
    state = {}
    for f in findings:
        since = f.since or seen.get(f.id) or _iso(NOW)
        state[f.id] = since
        lines.append(f"| {f.what} | {f.where} | {since} |")
    body = "\n".join(lines) + f"\n\n{MARK}{json.dumps(state)}-->\n"
    if issue:
        _gh("issue", "edit", str(issue["number"]), "--body-file", "-", input=body)
        return f"updated #{issue['number']}"
    url = _gh("issue", "create", "--title", ISSUE_TITLE, "--body-file", "-", input=body).strip()
    return f"opened {url}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json")
    ap.add_argument("--github", action="store_true")
    a = ap.parse_args()
    import psycopg  # noqa: PLC0415
    url = (os.environ.get("CAPITAL_RO_DATABASE_URL") or "").strip()
    if not url:
        raise SystemExit("CAPITAL_RO_DATABASE_URL is not set")
    t = json.loads(TARGETS.read_text())
    notes: list[str] = []
    try:
        with psycopg.connect(url, connect_timeout=20) as c:
            c.execute("SET default_transaction_read_only = on")
            findings = check(c, t)
            notes = budget_pause(c)
    except psycopg.OperationalError as exc:
        findings = [Finding("database", f"the database could not be reached: {str(exc).splitlines()[0]}",
                            "Mandate Postgres", None)]
    for f in findings:
        print(f"BREACH  {f.what}  [{f.where}]  since {f.since or '?'}")
    for n in notes:
        print(f"NOTE    {n}  (expected: LLM_BUDGET, not a breach)")
    print(f"{len(findings)} breach(es)" if findings else "all targets met")
    if a.json:
        Path(a.json).write_text(json.dumps([asdict(f) for f in findings], indent=1))
    if a.github:
        print(sync_issue(findings, notes))
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
