"""Graph core, Germany: the PRODUCTS under each institution and their PROCESSES (steps with the
gates to pass each step), from official pages. Dry run unless --apply.

    python3 capital/ETL/terms/load_graph_de_offers.py --database-url URL            # dry run
    python3 capital/ETL/terms/load_graph_de_offers.py --database-url URL --apply    # write

INPUT: capital/reference/graph_de/offers.yaml (sources, offers, processes with steps and gates;
every item with a VERBATIM quote and its source). Each source page is fetched and stored in
grounding (with the OCR fallback of load_graph_de.py); every quote is located in the stored text,
and a quote that is not there REFUSES the run (exit 3). No model, no API credits.

WRITES (insert-only, migration 042): capital.institution_offers (the product, its channel, who
applies, its terms each cited), capital.processes, capital.process_steps (gates each cited).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx  # noqa: E402
import psycopg  # noqa: E402
import yaml  # noqa: E402

from load_batch_italy import Drift, DryBucket, insert_checked  # noqa: E402
from load_graph_de import UA, extract  # noqa: E402
from mandate.grounding.store import ensure_source, locate, store_original  # noqa: E402

DATA = REPO / "capital" / "reference" / "graph_de" / "offers.yaml"

_FOLD = {"\u2013": "-", "\u2014": "-", "\u2011": "-", "\u2010": "-", "\u00a0": " ", "\u202f": " ", "\u2009": " ",
         "\u201e": '"', "\u201c": '"', "\u201d": '"', "\u2018": "'", "\u2019": "'", "\u00ad": ""}


def locate_loose(text: str, quote: str) -> tuple[int, int] | None:
    """`locate`, tolerant of typography only (dashes, non-breaking and thin spaces, curly quotes,
    soft hyphens, whitespace, case): every other character must match, in order. The span points into the original
    text, so the citation quotes the page exactly as stored."""
    span = locate(text, quote)
    if span:
        return span
    # whitespace is ignored entirely: the HTML extractor drops the space between adjacent
    # elements ("Nr.067ERP-Gründerkredit"); every other character must match, in order
    norm, idx = [], []
    for i, ch in enumerate(text):
        ch = _FOLD.get(ch, ch)
        if ch == "" or ch.isspace():
            continue
        norm.append(ch.lower())
        idx.append(i)
    q = "".join(c for c in "".join(_FOLD.get(c, c) for c in quote) if not c.isspace()).lower()
    j = "".join(norm).find(q)
    if j < 0 or not q:
        return None
    return idx[j], idx[j + len(q) - 1] + 1
SOURCE_KEY = "capital.graph_core"


def load(db_url: str, *, apply: bool) -> tuple[dict, list[str]]:
    from mandate.grounding.bucket import bucket_from_env  # noqa: PLC0415
    d = yaml.safe_load(DATA.read_text())
    bucket = bucket_from_env() if apply else DryBucket()
    report: list[str] = []
    counts: dict = {}
    with psycopg.connect(db_url) as con:
        con.execute("SET search_path = capital, public")
        if not con.execute("select 1 from schema_migrations where id = '042'").fetchone():
            raise Drift("migration 042 is not applied: run load_graph_de.py first")
        src = ensure_source(con, SOURCE_KEY, "Mandate graph core: official org charts and structure pages",
                            publisher="the institutions themselves (urls in the knowledge map)")
        pages: dict = {}
        failed: set[str] = set()
        import time
        with httpx.Client(timeout=60.0, follow_redirects=True, headers={"user-agent": UA}) as client:
            for s in d.get("sources") or []:
                r = None
                for attempt in range(3):  # polite: a 429 / 503 is retried after a pause
                    try:
                        r = client.get(s["url"])
                        if r.status_code in (429, 503):
                            time.sleep(20 * (attempt + 1))
                            continue
                        r.raise_for_status()
                        break
                    except Exception as e:  # noqa: BLE001
                        r = None
                        report.append(f"  source {s['id']} fetch error ({str(e)[:70]})")
                        break
                time.sleep(1.5)
                if r is None or r.status_code >= 400:
                    failed.add(s["id"])
                    report.append(f"  SKIPPED source {s['id']} (not fetchable now): {s['url']}; the items quoting it are left out")
                    continue
                mime = (r.headers.get("content-type") or "application/octet-stream").split(";")[0].strip()
                text, ext = extract(r.content, mime)
                v = store_original(con, r.content, s["url"], mime, dt.datetime.now(dt.timezone.utc), text=text,
                                   extractor=ext, title=f"Product / process page {s['id']}", kind="product_page",
                                   source_id=src, http_status=r.status_code, bucket=bucket)
                pages[s["id"]] = {"sha256": v.sha256, "url": s["url"], "text": v.text or ""}
        counts["sources stored"] = len(pages)

        dropped: list[str] = []

        def unfetched(item: dict) -> bool:
            return item.get("source") in failed

        def cite(item: dict, what: str) -> dict:
            p = pages.get(item["source"])
            if not p:
                raise Drift(f"{what}: unknown source {item['source']}")
            span = locate_loose(p["text"], item["quote"])
            if not span:
                # an unverifiable item is LEFT OUT (never written), and named
                dropped.append(f"  NOT FOUND, left out: {what}: {item['quote'][:90]!r} ({p['url'][:70]})")
                return None
            return {"sha256": p["sha256"], "url": p["url"], "located": True, "quote": p["text"][span[0]:span[1]],
                    "char_start": span[0], "char_end": span[1]}

        batch = "graph_de_offers_" + dt.date.today().strftime("%Y_%m")
        held = {r[0] for r in con.execute("select key from institutions where market = 'DE'")}
        n_off = n_proc = n_step = n_gate = 0
        offer_id = {}
        for o in d.get("offers") or []:
            if unfetched(o):
                report.append(f"  skipped offer {o['key']} (its source was not fetchable)")
                continue
            for k in (o["institution_key"], o.get("channel_key")):
                if k and k not in held:
                    raise Drift(f"offer {o['key']}: institution {k} is not held")
            terms = [{"field": t["field"], "value": t["value"], "citation": c}
                     for t in o.get("terms") or [] if not unfetched(t)
                     for c in [cite(t, f"offer {o['key']} term {t['field']}")] if c]
            oc = cite(o, f"offer {o['key']}")
            if not oc:
                continue
            out = insert_checked(con, "institution_offers", ("key",), {
                "key": o["key"], "institution_key": o["institution_key"], "instrument_id": o.get("instrument_id"),
                "product_name": o["product_name"], "product_type": o["product_type"], "channel_key": o.get("channel_key"),
                "applicant": o["applicant"], "terms": {"items": terms}, "citations": [oc], "batch": batch},
                jsonb=("citations", "terms"))
            n_off += out == "new"
            offer_id[o["key"]] = con.execute("select id from institution_offers where key = %s", (o["key"],)).fetchone()[0]
        for p in d.get("processes") or []:
            if unfetched(p):
                report.append(f"  skipped process {p['key']} (its source was not fetchable)")
                continue
            if p["institution_key"] not in held:
                raise Drift(f"process {p['key']}: institution {p['institution_key']} is not held")
            pc = cite(p, f"process {p['key']}")
            if not pc:
                continue
            out = insert_checked(con, "processes", ("key",), {
                "key": p["key"], "institution_key": p["institution_key"], "offer_id": offer_id.get(p.get("offer_key")),
                "kind": "funding_decision", "title": p["title"], "explains": p.get("explains"),
                "citations": [pc], "batch": batch})
            n_proc += out == "new"
            for st in p.get("steps") or []:
                if unfetched(st):
                    report.append(f"  skipped {p['key']} step {st['step_no']} (its source was not fetchable)")
                    continue
                gates = [{"label": g["label"], "citations": [c]}
                         for g in st.get("gates") or [] if not unfetched(g)
                         for c in [cite(g, f"gate of {p['key']} step {st['step_no']}")] if c]
                sc = cite(st, f"{p['key']} step {st['step_no']}")
                if not sc:
                    continue
                n_gate += len(gates)
                exists = con.execute("select 1 from process_steps where process_key=%s and step_no=%s and batch=%s",
                                     (p["key"], st["step_no"], batch)).fetchone()
                if exists:
                    continue
                con.execute("""insert into process_steps (process_key, step_no, label, kind, actor, timing, gates, citations, batch)
                               values (%s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s)""",
                            (p["key"], st["step_no"], st["label"], st["kind"], st["actor"], st.get("timing"),
                             json.dumps(gates, ensure_ascii=False), json.dumps([sc], ensure_ascii=False), batch))
                n_step += 1
        report.extend(dropped)
        counts["quotes not found (left out)"] = len(dropped)
        counts["offers"] = f"{n_off} new of {len(d.get('offers') or [])}"
        counts["processes"] = f"{n_proc} new of {len(d.get('processes') or [])}"
        counts["steps"] = f"{n_step} new, {n_gate} gates"
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
