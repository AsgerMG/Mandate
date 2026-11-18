"""Graph core, Germany, phase 1: the org charts and the institution tree. Dry run unless --apply.

    python3 capital/ETL/terms/load_graph_de.py --database-url URL            # dry run, rolls back
    python3 capital/ETL/terms/load_graph_de.py --database-url URL --apply    # write (owner-approved)

WHAT IT DOES (mandate/plans/condensed_core.md; the knowledge map, mandate/brains/wincent/knowledge_map.yaml):
  1. fetches each German institution's OFFICIAL org chart (the map's `org_charts` urls) and stores the
     bytes and extracted text in grounding (append-only; a re-fetch of the same bytes adds nothing);
  2. records each fetch in capital.org_charts (the grounding sha256, and whether it CHANGED since the
     previous fetch: the monthly refresh's signal to re-extract);
  3. writes the institution TREE (capital.institutions) from the map, each node cited to its own chart
     (or the nearest chart up or down its line), with the node's name located in the chart text when
     it is there verbatim (`located`: true / false, honest either way).
Phase 2 (a bench session, on the subscription): read each chart into units and role-holders
(capital.stakeholders) and the products and processes; not this script.

NO MODEL, no API credits. Migration 042 is applied in the same transaction if it is the only one
pending. Insert-only: a node that exists with different content refuses the run (a correction is a
new key or a new batch). A chart that cannot be fetched is reported and skipped, never invented.
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx  # noqa: E402
import psycopg  # noqa: E402
import yaml  # noqa: E402

from load_batch_italy import Drift, DryBucket, insert_checked  # noqa: E402
from mandate.api.extract import extractor  # noqa: E402
from mandate.grounding.store import ensure_source, locate, store_original  # noqa: E402

MAP = REPO / "mandate" / "brains" / "wincent" / "knowledge_map.yaml"
MIGRATIONS = REPO / "capital" / "ETL" / "schema" / "migrations"
MIGRATION_ID = "042"
MARKET = "DE"
BATCH = "graph_de_" + dt.date.today().strftime("%Y_%m")
SOURCE_KEY = "capital.graph_core"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/126.0 Safari/537.36")


def load_map() -> dict:
    return yaml.safe_load(MAP.read_text())["markets"][MARKET]


def chart_for(key: str, nodes: dict, charts: dict) -> str | None:
    """The chart a node is cited to: its own, else the nearest ancestor's, else the first child's."""
    k: str | None = key
    while k:
        if charts.get(k):
            return k
        k = nodes[k].get("parent")
    for n in nodes.values():
        if n.get("parent") == key and charts.get(n["key"]):
            return n["key"]
    return None


def migrate(con, apply: bool) -> str:
    have = {r[0] for r in con.execute("SELECT id FROM schema_migrations").fetchall()}
    if "041" not in have:
        raise Drift("migration 041 is not applied: bring the store up to date first")
    pending = [p.name[:3] for p in sorted(MIGRATIONS.glob("*.sql")) if p.name[:3] not in have]
    if not pending:
        return "042 already applied"
    if pending != [MIGRATION_ID]:
        raise Drift(f"forward migrations pending besides 042: {pending}")
    con.execute("SELECT pg_advisory_xact_lock(hashtext('capital.schema_migrations'))")
    con.execute(next(MIGRATIONS.glob("042_*.sql")).read_text())
    con.execute("INSERT INTO schema_migrations (id) VALUES (%s)", (MIGRATION_ID,))
    return "042 applied" if apply else "042 would be applied"


def fetch_charts(con, charts: dict, src: int, bucket, report: list) -> dict:
    """key -> {sha256, version_id, text, url}; a failed fetch is reported and skipped."""
    out: dict = {}
    with httpx.Client(timeout=60.0, follow_redirects=True, headers={"user-agent": UA}) as client:
        for key, url in charts.items():
            if not url:
                report.append(f"  {key:22} no url in the map")
                continue
            try:
                r = client.get(url)
                r.raise_for_status()
            except Exception as e:  # noqa: BLE001
                report.append(f"  {key:22} FETCH FAILED ({str(e)[:80]})")
                continue
            mime = (r.headers.get("content-type") or "application/octet-stream").split(";")[0].strip()
            text, ext = extractor(r.content, mime)
            v = store_original(con, r.content, url, mime, dt.datetime.now(dt.timezone.utc), text=text,
                               extractor=ext, title=f"Org chart: {key}", kind="org_chart", source_id=src,
                               http_status=r.status_code, bucket=bucket)
            out[key] = {"sha256": v.sha256, "version_id": v.id, "text": v.text or "", "url": url,
                        "fetched_at": dt.datetime.now(dt.timezone.utc)}
            report.append(f"  {key:22} {mime[:22]:22} {len(v.text or ''):>7} chars  {'new' if v.created else 'same bytes'}")
    return out


def load(db_url: str, *, apply: bool) -> tuple[dict, list[str]]:
    from mandate.grounding.bucket import bucket_from_env  # noqa: PLC0415
    m = load_map()
    nodes = {n["key"]: n for n in m["institutions"]}
    charts = {c["key"]: c.get("url") or "" for c in m.get("org_charts") or []}
    bucket = bucket_from_env() if apply else DryBucket()
    counts: dict = {}
    report: list[str] = []
    with psycopg.connect(db_url) as con:
        con.execute("SET search_path = capital, public")
        counts["migration"] = migrate(con, apply)
        src = ensure_source(con, SOURCE_KEY, "Mandate graph core: official org charts and structure pages",
                            publisher="the institutions themselves (urls in the knowledge map)")
        got = fetch_charts(con, charts, src, bucket, report)
        counts["charts fetched"] = f"{len(got)} of {sum(1 for u in charts.values() if u)}"

        # 2. org_charts: one row per fetch, changed vs the previous fetch of the same institution
        new_rows = changed = 0
        for key, c in got.items():
            prev = con.execute("SELECT sha256 FROM org_charts WHERE institution_key = %s ORDER BY recorded_at DESC LIMIT 1",
                               (key,)).fetchone()
            is_changed = prev is None or prev[0] != c["sha256"]
            if prev is not None and not is_changed:
                continue  # same chart as last time: nothing to record
            con.execute("INSERT INTO org_charts (institution_key, url, sha256, fetched_at, changed, batch) "
                        "VALUES (%s, %s, %s, %s, %s, %s)", (key, c["url"], c["sha256"], c["fetched_at"], is_changed, BATCH))
            new_rows += 1
            changed += is_changed
        counts["org_charts"] = f"{new_rows} new fetch rows ({changed} new or changed charts)"

        # 3. the institution tree, each node cited to a chart
        located = 0
        tally = [0, 0]
        for key, n in nodes.items():
            ck = chart_for(key, nodes, {k: v for k, v in charts.items() if k in got})
            if ck is None:
                report.append(f"  node {key}: no fetched chart in its line; skipped")
                continue
            c = got[ck]
            span = None
            for q in filter(None, [n["name"].split(" (")[0], n.get("name_local")]):
                span = locate(c["text"], q) if c["text"] else None
                if span:
                    break
            cit = {"sha256": c["sha256"], "url": c["url"], "located": bool(span),
                   "quote": c["text"][span[0]:span[1]] if span else "",
                   "char_start": span[0] if span else None, "char_end": span[1] if span else None}
            located += bool(span)
            outcome = insert_checked(con, "institutions", ("key",), {
                "key": key, "parent_key": n.get("parent"), "market": MARKET, "level": n["level"],
                "region": n.get("region"), "kind": n["kind"], "name": n["name"], "name_local": n.get("name_local"),
                "role": n.get("role"), "website": charts.get(key) or None, "citations": [cit], "batch": BATCH})
            tally[0 if outcome == "new" else 1] += 1
        counts["institutions"] = f"{tally[0]} new, {tally[1]} already loaded ({located} names located verbatim in a chart)"
        if not apply:
            con.rollback()
            counts["bucket puts skipped (dry run)"] = bucket.puts
    return counts, report


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--database-url", required=True)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    try:
        counts, report = load(a.database_url, apply=a.apply)
    except Drift as e:
        print(f"REFUSED (drift): {e}", file=sys.stderr)
        return 3
    print("\n".join(report))
    for k, v in counts.items():
        print(f"  {k:32} {v}")
    print("APPLIED." if a.apply else "DRY RUN: rolled back, nothing written. Add --apply to write (owner-approved).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
