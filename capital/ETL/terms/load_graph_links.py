"""Graph core: THE NETWORK between institutions (migration 043). Dry run unless --apply.

    python3 capital/ETL/terms/load_graph_links.py --database-url URL --market DE            # dry run
    python3 capital/ETL/terms/load_graph_links.py --database-url URL --market DE --apply    # write

INPUT: capital/reference/graph_<market>/links.yaml and any other *.yaml there with `links` (sources, links: from, to, kind, detail, quote,
source; `proposed: true` for a link to a node not yet in the map). Each source page is fetched and
stored in grounding; every quote is located (typography- and whitespace-tolerant, words exact); a
link whose quote is not found, or whose nodes are not held, is LEFT OUT and named. Applies migration
043 if it is the only one pending. No model, no API credits.
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx  # noqa: E402
import psycopg  # noqa: E402
import yaml  # noqa: E402

from load_batch_italy import Drift, DryBucket, insert_checked  # noqa: E402
from load_graph_de import UA, extract  # noqa: E402
from load_graph_de_offers import locate_loose  # noqa: E402
from mandate.grounding.store import ensure_source, store_original  # noqa: E402

MIGRATIONS = REPO / "capital" / "ETL" / "schema" / "migrations"


def migrate(con) -> str:
    have = {r[0] for r in con.execute("SELECT id FROM schema_migrations").fetchall()}
    if "042" not in have:
        raise Drift("migration 042 is not applied")
    if "043" in have:
        return "043 already applied"  # later migrations (044 ...) are their own loaders' business
    pending = [p.name[:3] for p in sorted(MIGRATIONS.glob("*.sql")) if p.name[:3] not in have]
    if [m for m in pending if m not in ("044", "045", "046")] != ["043"]:
        raise Drift(f"forward migrations pending besides 043: {pending}")
    con.execute("SELECT pg_advisory_xact_lock(hashtext('capital.schema_migrations'))")
    con.execute(next(MIGRATIONS.glob("043_*.sql")).read_text())
    con.execute("INSERT INTO schema_migrations (id) VALUES ('043')")
    return "043 applied (or would be, in a dry run)"


def read_links(market: str) -> dict:
    """links.yaml plus every other file in the market's folder that carries `links` (e.g. DE's
    laender.yaml); a source id from another file is prefixed with its stem so ids never collide."""
    folder = REPO / "capital" / "reference" / f"graph_{market.lower()}"
    out: dict = {"sources": [], "links": []}
    for f in sorted(folder.glob("*.yaml"), key=lambda f: (f.name != "links.yaml", f.name)):
        d = yaml.safe_load(f.read_text()) or {}
        if not isinstance(d, dict) or not d.get("links"):
            continue
        pre = "" if f.name == "links.yaml" else f"{f.stem}:"
        out["sources"] += [{**x, "id": pre + str(x["id"])} for x in d.get("sources") or []]
        out["links"] += [{**x, "source": pre + str(x["source"])} for x in d["links"]]
    return out


def load(db_url: str, *, apply: bool, market: str) -> tuple[dict, list[str]]:
    from mandate.grounding.bucket import bucket_from_env  # noqa: PLC0415
    d = read_links(market)
    bucket = bucket_from_env() if apply else DryBucket()
    report: list[str] = []
    counts: dict = {}
    with psycopg.connect(db_url) as con:
        con.execute("SET search_path = capital, public")
        counts["migration"] = migrate(con)
        src = ensure_source(con, "capital.graph_core", "Mandate graph core: official org charts and structure pages",
                            publisher="the institutions themselves (urls in the knowledge map)")
        pages: dict = {}
        with httpx.Client(timeout=60.0, follow_redirects=True, headers={"user-agent": UA}) as client:
            for s in d.get("sources") or []:
                r = None
                for attempt in range(3):
                    try:
                        r = client.get(s["url"])
                        if r.status_code in (429, 503):
                            time.sleep(20 * (attempt + 1))
                            continue
                        r.raise_for_status()
                        break
                    except Exception as e:  # noqa: BLE001
                        report.append(f"  source {s['id']} fetch error ({str(e)[:70]})")
                        r = None
                        break
                time.sleep(1.5)
                if r is None or r.status_code >= 400:
                    report.append(f"  SKIPPED source {s['id']} (not fetchable now): {s['url']}")
                    continue
                mime = (r.headers.get("content-type") or "application/octet-stream").split(";")[0].strip()
                text, ext = extract(r.content, mime)
                v = store_original(con, r.content, s["url"], mime, dt.datetime.now(dt.timezone.utc), text=text,
                                   extractor=ext, title=f"Governance / programme page {s['id']}", kind="governance_page",
                                   source_id=src, http_status=r.status_code, bucket=bucket)
                pages[s["id"]] = {"sha256": v.sha256, "url": s["url"], "text": v.text or ""}
        held = {r[0] for r in con.execute("select key from institutions")}
        # a tie may end at a product (a ministry funds a programme), never start at one
        products = {r[0] for r in con.execute("select key from institution_offers")}
        batch = f"graph_{market.lower()}_links_" + dt.date.today().strftime("%Y_%m")
        tally = {}
        left = 0
        held_ties = 0
        seen: set[tuple[str, str, str]] = set()
        for l in d.get("links") or []:
            what = f"{l['from']} -{l['kind']}-> {l['to']}"
            if (l["from"], l["to"], l["kind"]) in seen:
                report.append(f"  duplicate tie in the file, first kept: {what} ({(l.get('detail') or '')[:50]})")
                continue
            if l["from"] not in held or (l["to"] not in held and not (l["to"] in products and l["kind"] in ("funds", "mandates", "delegates_to", "oversees"))):
                report.append(f"  left out (node not held{', proposed' if l.get('proposed') else ''}): {what}")
                left += 1
                continue
            if con.execute("SELECT 1 FROM institution_links WHERE from_key = %s AND to_key = %s AND kind = %s",
                           (l["from"], l["to"], l["kind"])).fetchone():
                seen.add((l["from"], l["to"], l["kind"]))
                held_ties += 1
                continue  # already held (an earlier batch): a re-fetched page is not a new tie
            p = pages.get(l["source"])
            span = locate_loose(p["text"], l["quote"]) if p else None
            if not span:
                report.append(f"  left out (quote not found): {what}: {l['quote'][:70]!r}")
                left += 1
                continue
            cit = {"sha256": p["sha256"], "url": p["url"], "located": True, "quote": p["text"][span[0]:span[1]],
                   "char_start": span[0], "char_end": span[1]}
            out = insert_checked(con, "institution_links", ("from_key", "to_key", "kind", "batch"), {
                "from_key": l["from"], "to_key": l["to"], "kind": l["kind"], "detail": l.get("detail"),
                "citations": [cit], "batch": batch})
            seen.add((l["from"], l["to"], l["kind"]))
            tally[l["kind"]] = tally.get(l["kind"], 0) + (out == "new")
        counts["links by kind"] = ", ".join(f"{k} {v}" for k, v in sorted(tally.items())) or "none"
        counts["already held"] = held_ties
        counts["left out"] = left
        if not apply:
            con.rollback()
    return counts, report


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--database-url", required=True)
    ap.add_argument("--market", required=True)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    try:
        counts, report = load(a.database_url, apply=a.apply, market=a.market.upper())
    except Drift as e:
        print(f"REFUSED (drift): {e}", file=sys.stderr)
        return 3
    print("\n".join(report))
    for k, v in counts.items():
        print(f"  {k:16} {v}")
    print("APPLIED." if a.apply else "DRY RUN: rolled back, nothing written. Add --apply to write (owner-approved).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
