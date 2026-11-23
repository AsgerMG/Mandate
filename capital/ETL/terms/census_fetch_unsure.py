"""THE CENSUS, pass 2 input: fetch the official page of every body judged `unsure` in pass 1, the
way the loaders will (same fetcher and extractor), and write its opening text for the judge.
No model. Writes capital/reference/census/pages/<m>/<register_id>.txt (first 4,000 chars) and
<m>_unsure_pages.csv (register_id, name, url, chars, status).

    python3 capital/ETL/terms/census_fetch_unsure.py --database-url URL --market FR
"""
from __future__ import annotations

import argparse
import csv
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import httpx  # noqa: E402
import psycopg  # noqa: E402

from load_graph_de import UA, extract  # noqa: E402

REF = Path(__file__).resolve().parents[3] / "capital" / "reference" / "census"


def url_for(links: dict, market: str) -> str | None:
    web = [u.strip() for u in (links.get("website") or []) if u and u.strip()]
    if web:
        u = web[0].lstrip("/")
        return u if u.startswith(("http://", "https://")) else "https://" + u   # IndicePA stores bare hosts
    return links.get("whoiswho") or links.get("register_page")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--database-url", required=True)
    ap.add_argument("--market", required=True)
    a = ap.parse_args()
    m = a.market.upper()
    unsure = [r for r in csv.DictReader((REF / f"{m.lower()}_scope.csv").open()) if r["verdict"] == "unsure"]
    out_dir = REF / "pages" / m.lower()
    out_dir.mkdir(parents=True, exist_ok=True)
    with psycopg.connect(a.database_url) as con:
        links = {r[0]: r[1] for r in con.execute(
            "SELECT DISTINCT ON (register_id) register_id, links FROM capital.register_entries WHERE market = %s "
            "ORDER BY register_id, recorded_at DESC", (m,))}
    rows = []
    with httpx.Client(timeout=40.0, follow_redirects=True, headers={"user-agent": UA}) as client:
        for r in unsure:
            url = url_for(links.get(r["register_id"]) or {}, m)
            status, n = "no url", 0
            if url:
                try:
                    resp = client.get(url)
                    resp.raise_for_status()
                    text, _ = extract(resp.content, (resp.headers.get("content-type") or "").split(";")[0])
                    text = " ".join((text or "").split())[:4000]
                    n = len(text)
                    status = "ok" if n > 200 else "thin"
                    (out_dir / f"{r['register_id'].replace('/', '_')}.txt").write_text(text)
                except Exception as e:  # noqa: BLE001
                    status = f"failed: {str(e)[:60]}"
            rows.append([r["register_id"], r["name"], url or "", n, status])
            time.sleep(0.3)
    with (REF / f"{m.lower()}_unsure_pages.csv").open("w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["register_id", "name", "url", "chars", "status"])
        w.writerows(rows)
    ok = sum(1 for x in rows if x[4] == "ok")
    print(f"{m}: {len(rows)} unsure, {ok} pages read, {len(rows) - ok} without a readable page")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
