"""Migration (b), part two: the gates and clauses that cite a URL nobody saved.

    # dry run: which rows cite which URLs, per host, and how long a polite fetch
    # takes. Reads capital (read-only) and nothing else; no request is made.
    python3 mandate/grounding/migrations/capital_url_citations.py \
        --source-url "$CAPITAL_RO_DATABASE_URL" --urls urls_to_fetch.json --out DIR

    # production (the owner): fetch each URL into the grounding store, then link
    # every row whose quote is found in what the page serves today.
    python3 mandate/grounding/migrations/capital_url_citations.py --apply \
        --database-url "$CAPITAL_DATABASE_URL" --urls urls_to_fetch.json --out DIR

WHY A SIBLING. capital_sources_to_grounding.py links what was SAVED (archive
files, eligibility_text). 790 gate/clause rows name a URL instead, 171 distinct,
never saved. Today's page is not necessarily the page that was quoted, so a
link is made ONLY where the row's quote is found in what the URL serves now
(method 'url_fetched', with the span, so mandate.grounding.cite() reproduces
the words). A quote not found is REPORTED, not linked: the page moved, the
quote was paraphrased, or the text is in a PDF the extractor cannot read. That
list (quotes_not_found.jsonl) is the honest residue, and the case for a
human or a re-extraction.

POLITE. One request at a time; at least --per-host-seconds between two
requests to the same host (default 5); robots.txt honoured; Retry-After obeyed
on 429/503; two retries, then the URL is recorded as failed and the run goes
on. The User-Agent names the product and its site, not a person.

IDEMPOTENT. A URL already fetched into grounding within --reuse-days (default
30) is not fetched again; its stored version is used. Links are
INSERT .. ON CONFLICT DO NOTHING on (row, version). Each URL commits on its own
(its version and its links together), so a run cut off loses nothing and a
re-run resumes.

REFUSES until the grounding store is live (grounding.documents has rows) and
capital.eligibility_grounding exists (migration 034): this step adds to that
store, it does not stand it up.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path
from urllib import robotparser
from urllib.parse import urlsplit

import httpx
import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from mandate.grounding.migrations.capital_sources_to_grounding import extract_bytes  # noqa: E402
from mandate.grounding.store import canonical_url, fetch, latest, locate  # noqa: E402

USER_AGENT = "Mandate-grounding/0.2 (+https://wincent-ai.eu; public funding research)"
METHOD = "url_fetched"

ROWS_SQL = """
  SELECT 'gate', g.instrument_id, g.gate_key, g.source_file, g.quote
    FROM eligibility_gates g WHERE g.source_file = ANY(%s)
  UNION ALL
  SELECT 'clause', c.instrument_id, c.clause_type || '::' || c.clause_key, c.source_file, c.quote
    FROM eligibility_clauses c WHERE c.source_file = ANY(%s)
  ORDER BY 4, 1, 2, 3
"""


def rows_by_url(con, urls: list[str]) -> dict[str, list[tuple]]:
    out: dict[str, list[tuple]] = defaultdict(list)
    for stype, iid, skey, sfile, quote in con.execute(ROWS_SQL, (urls, urls)).fetchall():
        out[sfile].append((stype, iid, skey, quote))
    return out


def store_live(con) -> tuple[int, bool]:
    docs = con.execute("SELECT count(*) FROM grounding.documents").fetchone()[0]
    has_links = con.execute("SELECT to_regclass('eligibility_grounding') IS NOT NULL").fetchone()[0]
    return docs, bool(has_links)


def _extractor(data: bytes, mime: str):
    return extract_bytes(data, mime)


class Polite:
    """One client, per-host spacing, robots.txt, Retry-After."""

    def __init__(self, per_host_s: float, client: httpx.Client | None = None, sleep=time.sleep,
                 clock=time.monotonic):
        self.per_host_s = per_host_s
        self.client = client or httpx.Client(timeout=60.0, follow_redirects=True,
                                             headers={"user-agent": USER_AGENT})
        self.sleep, self.clock = sleep, clock
        self.last: dict[str, float] = {}
        self.robots: dict[str, robotparser.RobotFileParser | None] = {}

    def wait(self, host: str) -> None:
        t = self.last.get(host)
        if t is not None:
            gap = self.per_host_s - (self.clock() - t)
            if gap > 0:
                self.sleep(gap)
        self.last[host] = self.clock()

    def allowed(self, url: str) -> bool:
        p = urlsplit(url)
        base = f"{p.scheme}://{p.netloc}"
        if base not in self.robots:
            rp = robotparser.RobotFileParser()
            try:
                self.wait(p.hostname or "")
                r = self.client.get(base + "/robots.txt")
                if r.status_code >= 400:
                    rp = None                    # no robots.txt: nothing disallowed
                else:
                    rp.parse(r.text.splitlines())
            except httpx.HTTPError:
                rp = None
            self.robots[base] = rp
        rp = self.robots[base]
        return True if rp is None else rp.can_fetch(USER_AGENT, url)


def run(con, urls: dict[str, int], out: Path, *, apply: bool, per_host_s: float,
        reuse_days: int, polite: Polite | None = None, log=print) -> dict:
    by_url = rows_by_url(con, list(urls))
    hosts = Counter(urlsplit(u).hostname for u in urls)
    n_rows = sum(len(v) for v in by_url.values())
    log(f"{len(urls):,} URLs on {len(hosts):,} hosts; {n_rows:,} gate/clause rows cite them "
        f"(the list says {sum(urls.values()):,})")
    busiest = hosts.most_common(1)[0][1] if hosts else 0
    log(f"polite fetch: one at a time, >= {per_host_s:g}s between requests to one host; "
        f"~{len(urls) * 2 / 60:.0f}-{(len(urls) * 4 + busiest * per_host_s) / 60:.0f} min "
        f"(busiest host: {busiest} URLs)")
    if not apply:
        return {"urls": len(urls), "rows": n_rows, "hosts": len(hosts)}

    polite = polite or Polite(per_host_s)
    stats = Counter()
    not_found: list[dict] = []
    failures: list[dict] = []
    fresh = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=reuse_days)
    for i, url in enumerate(sorted(urls, key=lambda u: (urlsplit(u).hostname or "", u)), 1):
        rows = by_url.get(url, [])
        try:
            canonical_url(url)
        except ValueError as e:
            failures.append({"url": url, "error": str(e)})
            stats["bad_url"] += 1
            continue
        v = latest(con, url)
        if v is not None and v.fetched_at >= fresh:
            stats["reused"] += 1
        else:
            if not polite.allowed(url):
                failures.append({"url": url, "error": "robots.txt disallows"})
                stats["robots_disallowed"] += 1
                continue
            v = None
            for attempt in range(3):
                polite.wait(urlsplit(url).hostname or "")
                try:
                    v = fetch(con, url, client=polite.client, extractor=_extractor,
                              kind="scheme_document")
                    stats["fetched"] += 1
                    break
                except httpx.HTTPStatusError as e:
                    code = e.response.status_code
                    if code in (429, 503) and attempt < 2:
                        ra = e.response.headers.get("retry-after", "")
                        polite.sleep(min(120.0, float(ra)) if ra.isdigit() else 30.0 * (attempt + 1))
                        continue
                    failures.append({"url": url, "error": f"HTTP {code}"})
                    stats[f"http_{code}"] += 1
                    break
                except httpx.HTTPError as e:
                    if attempt < 2:
                        polite.sleep(10.0 * (attempt + 1))
                        continue
                    failures.append({"url": url, "error": type(e).__name__})
                    stats["network_error"] += 1
            if v is None:
                con.rollback()
                continue
        text = v.text or ""
        if not text:
            stats["no_text"] += 1
        for stype, iid, skey, quote in rows:
            span = locate(text, quote) if (text and quote) else None
            if span is None:
                not_found.append({"source_type": stype, "instrument_id": iid, "source_key": skey,
                                  "url": url, "grounding_version_id": v.id,
                                  "why": "no text extracted" if not text else "quote not in today's page",
                                  "quote": (quote or "")[:300]})
                stats["quote_not_found"] += 1
                continue
            con.execute(
                "INSERT INTO eligibility_grounding (source_type, instrument_id, source_key, "
                "  grounding_version_id, char_start, char_end, method, source_file) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                (stype, iid, skey, v.id, span[0], span[1], METHOD, url))
            stats["linked"] += 1
        con.commit()                              # this URL's version + its links, together
        if i % 10 == 0:
            log(f"  {i}/{len(urls)}  {dict(stats)}")
    out.mkdir(parents=True, exist_ok=True)
    with (out / "quotes_not_found.jsonl").open("w") as f:
        for r in not_found:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    (out / "fetch_failures.json").write_text(json.dumps(failures, indent=1))
    return {"stats": dict(stats), "not_found": len(not_found), "failures": len(failures)}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source-url", help="capital read-only URL (dry run)")
    ap.add_argument("--database-url", help="capital_app URL (--apply)")
    ap.add_argument("--urls", type=Path, required=True, help="urls_to_fetch.json (url -> row count)")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--per-host-seconds", type=float, default=5.0)
    ap.add_argument("--reuse-days", type=int, default=30)
    a = ap.parse_args()
    urls = json.loads(a.urls.read_text())
    url = a.database_url if a.apply else a.source_url
    if not url:
        ap.error("--apply needs --database-url; a dry run needs --source-url")
    opts = "" if a.apply else "-c default_transaction_read_only=on"
    with psycopg.connect(url, options=f"-c search_path=capital,public {opts}".strip()) as con:
        docs, has_links = store_live(con)
        print(f"grounding.documents: {docs:,} rows; capital.eligibility_grounding: "
              f"{'present' if has_links else 'MISSING (migration 034)'}")
        if a.apply and (docs == 0 or not has_links):
            print("REFUSED: the grounding store is not live yet (grounding.documents is empty or "
                  "migration 034 has not run). Finish the grounding go-live "
                  "(mandate/ops/go_live_sunday.sh), then re-run.", file=sys.stderr)
            return 2
        res = run(con, urls, a.out, apply=a.apply, per_host_s=a.per_host_seconds,
                  reuse_days=a.reuse_days)
    if not a.apply:
        print("\nDRY RUN: no request made, nothing written."
              + ("" if docs and has_links else
                 "  --apply will REFUSE until the grounding store is live."))
        return 0
    s = res["stats"]
    print(f"\nDONE: fetched {s.get('fetched', 0)}, reused {s.get('reused', 0)}, failed {res['failures']} "
          f"(see {a.out}/fetch_failures.json)")
    print(f"  linked {s.get('linked', 0)} rows (method '{METHOD}', span stored)")
    print(f"  QUOTES NOT FOUND: {res['not_found']} rows -> {a.out}/quotes_not_found.jsonl")
    return 0


if __name__ == "__main__":
    sys.exit(main())
