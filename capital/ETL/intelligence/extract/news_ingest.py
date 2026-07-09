"""News ingestion engine for the public-capital-intelligence track (stage 0).

Registry-driven (news_sources.py — never hardcode an outlet here) and fully
re-triggerable: every insert is `INSERT OR IGNORE` on the article URL, so
`ingest` can run on any cadence (cron, make, by hand) and only NEW articles
enter the pipeline. The transform stages pick work up by state columns, so the
whole chain is incremental end-to-end:

  ingest/backfill → articles (stubs)          re-run any time, dedup on url
  harvest        → funder newsrooms, FULL TEXT at ingest (html adapters)
  hydrate        → full text for every stub (tier-prioritised, retriable)
  embed          → EVERYTHING hydrated (vector similarity IS the relevance
                   filter at query time — no classifier in front of the index)
  classify_relevance (Haiku, cheap)           cost filter in front of...
  entity_link / classify_signals (Sonnet)     ...the model-written stages

Two fetch paths, one parser:
  * kind=rss    native feeds — the LIVE path (feeds only expose recent items).
  * kind=gnews  Google News RSS queries — live topic monitoring AND the
    BACKFILL engine: Google News honours `after:`/`before:` operators, so
    per-outlet `site:<domain>` queries walked month-by-month reconstruct the
    last N months of an outlet's coverage (native RSS cannot).
  * kind=html   needs a per-site adapter — logged and skipped for now.

Usage:
  python3 ETL/intelligence/extract/news_ingest.py sync              # registry → sources table
  python3 ETL/intelligence/extract/news_ingest.py ingest [--priority 2]
  python3 ETL/intelligence/extract/news_ingest.py backfill --months 24 [--priority 2]
  python3 ETL/intelligence/extract/news_ingest.py hydrate [--limit N]
  python3 ETL/intelligence/extract/news_ingest.py status
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import SIGNALS_DB  # noqa: E402
# --- end ETL path bootstrap ---

import argparse
import html as html_mod
import re
import sqlite3
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta

from news_sources import SOURCES, HTML_ADAPTERS  # noqa: E402

# macOS Python ships without the system root CA bundle — same fix as the NDB
# extractors (ETL/lib/ndb_ssl.py): use certifi's bundle when available.
try:
    import certifi
    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL_CTX = ssl.create_default_context()

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
FETCH_TIMEOUT = 25
SLEEP = 1.2                 # politeness between remote requests
MAX_PER_WINDOW = 100        # gnews returns ≤100 anyway
STUB_SUMMARY_CAP = 2000

# Google News locale params per registry language.
GNEWS_LOCALE = {
    "en": ("en", "US", "US:en"),
    "fr": ("fr", "FR", "FR:fr"),
    "de": ("de", "DE", "DE:de"),
}

# Outlets whose 2-year archive we reconstruct via windowed `site:` queries.
# Press only: funder newsrooms are live-signal (the events DB already holds
# the historical awards), and site:ec.europa.eu would be hopelessly broad.
BACKFILL_TIERS = {"trade_press", "general_news"}


# ── HTTP ──────────────────────────────────────────────────────────────────────
def _ascii_url(url: str) -> str:
    """urllib rejects non-ASCII paths (KfW: /Über-die-KfW/...) — percent-encode
    path/query while leaving already-encoded characters alone."""
    parts = urllib.parse.urlsplit(url)
    return urllib.parse.urlunsplit((
        parts.scheme, parts.netloc.encode("idna").decode("ascii"),
        urllib.parse.quote(parts.path, safe="/%:@"),
        urllib.parse.quote(parts.query, safe="=&?/%:@+,"), parts.fragment))


def fetch(url: str, retries: int = 1) -> bytes | None:
    req = urllib.request.Request(_ascii_url(url), headers={"User-Agent": UA})
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT, context=_SSL_CTX) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001 — any network failure = skip source
            if attempt == retries:
                print(f"    fetch failed: {url[:90]} ({e})")
                return None
            time.sleep(2.0)
    return None


def fetch_final(url: str) -> tuple[bytes | None, str]:
    """Fetch following redirects; returns (body, final_url) — resolves gnews links."""
    req = urllib.request.Request(_ascii_url(url), headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT, context=_SSL_CTX) as r:
            return r.read(), r.geturl()
    except Exception as e:  # noqa: BLE001
        print(f"    fetch failed: {url[:90]} ({e})")
        return None, url


# ── Feed parsing (RSS 2.0 + Atom, stdlib only) ───────────────────────────────
_TAG_RE = re.compile(r"<[^>]+>")


def _strip_tags(s: str) -> str:
    return html_mod.unescape(_TAG_RE.sub(" ", s or "")).strip()


def _text(el, *names) -> str:
    for n in names:
        # Search with and without common namespaces.
        for probe in (n, f"{{http://www.w3.org/2005/Atom}}{n}",
                      f"{{http://purl.org/dc/elements/1.1/}}{n}",
                      f"{{http://purl.org/rss/1.0/modules/content/}}{n}"):
            found = el.find(probe)
            if found is not None and (found.text or found.attrib.get("href")):
                return (found.text or found.attrib.get("href", "")).strip()
    return ""


def _parse_date(s: str) -> str | None:
    """RFC 822 / ISO 8601 → YYYY-MM-DD, else None."""
    if not s:
        return None
    for fmt in ("%a, %d %b %Y %H:%M:%S %Z", "%a, %d %b %Y %H:%M:%S %z",
                "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d"):
        try:
            return datetime.strptime(s.strip(), fmt).date().isoformat()
        except ValueError:
            continue
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", s)
    return m.group(0) if m else None


def parse_feed(raw: bytes) -> list[dict]:
    """→ [{title, url, published, summary}] from RSS 2.0 or Atom bytes."""
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as e:
        print(f"    feed parse error: {e}")
        return []
    items = root.findall(".//item")  # RSS
    if not items:                    # Atom
        items = root.findall(".//{http://www.w3.org/2005/Atom}entry")
    out = []
    for it in items[:MAX_PER_WINDOW]:
        title = _strip_tags(_text(it, "title"))
        link = _text(it, "link")
        if not title or not link:
            continue
        out.append({
            "title": title[:500],
            "url": link,
            "published": _parse_date(_text(it, "pubDate", "published", "updated", "date")),
            "summary": _strip_tags(_text(it, "description", "summary", "encoded"))[:STUB_SUMMARY_CAP],
        })
    return out


def gnews_url(query: str, language: str) -> str:
    hl, gl, ceid = GNEWS_LOCALE.get(language, GNEWS_LOCALE["en"])
    q = urllib.parse.quote(query)
    return f"https://news.google.com/rss/search?q={q}&hl={hl}&gl={gl}&ceid={ceid}"


# ── DB helpers ────────────────────────────────────────────────────────────────
def connect() -> sqlite3.Connection:
    con = sqlite3.connect(SIGNALS_DB, timeout=30)
    con.row_factory = sqlite3.Row
    # WAL: harvest + hydrate legitimately run concurrently (different hosts,
    # both writing articles) — readers never block the writer and vice versa.
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA busy_timeout=15000")
    return con


def sync_registry(con: sqlite3.Connection) -> dict[str, int]:
    """Upsert news_sources.SOURCES into `sources`; returns key → id."""
    for key, s in SOURCES.items():
        con.execute("""
            INSERT INTO sources (key, name, tier, country, language, kind, feed_url, topics, active)
            VALUES (?,?,?,?,?,?,?,?,1)
            ON CONFLICT(key) DO UPDATE SET
              name=excluded.name, tier=excluded.tier, country=excluded.country,
              language=excluded.language, kind=excluded.kind,
              feed_url=excluded.feed_url, topics=excluded.topics, active=1
        """, (key, s["name"], s["tier"], s["country"], s["language"],
              s["kind"], s["url"], ",".join(s["topics"])))
    # Registry removals deactivate (articles keep their source row).
    keys = tuple(SOURCES)
    con.execute(
        f"UPDATE sources SET active = 0 WHERE key NOT IN ({','.join('?' * len(keys))})",
        keys)
    con.commit()
    return {r["key"]: r["id"] for r in con.execute("SELECT key, id FROM sources")}


def store(con: sqlite3.Connection, source_id: int, language: str,
          items: list[dict]) -> int:
    """INSERT OR IGNORE on url — THE idempotence point of the whole pipeline."""
    new = 0
    for it in items:
        stub = f"{it['title']}\n\n{it['summary']}".strip()
        cur = con.execute("""
            INSERT OR IGNORE INTO articles
              (source_id, url, title, published_at, language, raw_text)
            VALUES (?,?,?,?,?,?)
        """, (source_id, it["url"], it["title"], it["published"], language, stub))
        new += cur.rowcount
    con.commit()
    return new


# ── Commands ─────────────────────────────────────────────────────────────────
def cmd_sync(_args) -> None:
    con = connect()
    ids = sync_registry(con)
    con.close()
    print(f"registry synced: {len(ids)} sources in signals.sqlite")


def cmd_ingest(args) -> None:
    """Live pull: native RSS feeds + live gnews queries. Re-run any time."""
    con = connect()
    ids = sync_registry(con)
    total = skipped_html = 0
    for key, s in SOURCES.items():
        if s["priority"] > args.priority:
            continue
        if s["kind"] == "html":
            skipped_html += 1
            continue
        if s["kind"] == "rss" and not s["url"]:
            print(f"  {key}: no feed URL yet — skipped")
            continue
        url = gnews_url(s["url"], s["language"]) if s["kind"] == "gnews" else s["url"]
        raw = fetch(url)
        time.sleep(SLEEP)
        via = ""
        if raw is None and s["kind"] == "rss":
            # Native feed blocked/moved (403 bot walls, 404 relocations) —
            # fall back to a gnews site: query so live coverage never drops.
            dom = _domain(s["url"])
            if dom:
                raw = fetch(gnews_url(f"site:{dom} when:7d", s["language"]))
                time.sleep(SLEEP)
                via = " (via gnews fallback)"
        if raw is None:
            continue
        items = parse_feed(raw)
        new = store(con, ids[key], s["language"], items)
        total += new
        print(f"  {key}: {len(items)} items, {new} new{via}")
    con.close()
    print(f"\ningest done: {total} new articles"
          + (f" ({skipped_html} html sources pending per-site adapters)" if skipped_html else ""))


def _domain(u: str | None) -> str | None:
    if not u or not u.startswith("http"):
        return None
    host = urllib.parse.urlparse(u).netloc.lower().removeprefix("www.")
    return host or None


def _windows(months: int) -> list[tuple[str, str]]:
    """Month windows [(after, before)] from `months` ago to tomorrow."""
    out = []
    end = date.today() + timedelta(days=1)
    cur = end - timedelta(days=months * 30)
    while cur < end:
        nxt = min(cur + timedelta(days=30), end)
        out.append((cur.isoformat(), nxt.isoformat()))
        cur = nxt
    return out


def cmd_backfill(args) -> None:
    """Reconstruct the last N months via windowed gnews queries. Idempotent —
    re-running fills gaps and picks up anything new since the last run."""
    con = connect()
    ids = sync_registry(con)
    windows = _windows(args.months)

    # Backfill set: press outlets by site: query + every explicit gnews query.
    jobs: list[tuple[str, str, str]] = []   # (key, base_query, language)
    for key, s in SOURCES.items():
        if s["priority"] > args.priority:
            continue
        if s["kind"] == "gnews":
            jobs.append((key, s["url"], s["language"]))
        elif s["kind"] == "rss" and s["tier"] in BACKFILL_TIERS:
            dom = _domain(s["url"])
            if dom:
                jobs.append((key, f"site:{dom}", s["language"]))

    est = len(jobs) * len(windows)
    print(f"backfill: {len(jobs)} sources × {len(windows)} month-windows "
          f"= {est} queries (~{est * (SLEEP + 0.8) / 60:.0f} min)")
    total = 0
    for key, base_q, lang in jobs:
        src_new = 0
        for after, before in windows:
            q = f"{base_q} after:{after} before:{before}"
            raw = fetch(gnews_url(q, lang))
            time.sleep(SLEEP)
            if raw is None:
                continue
            src_new += store(con, ids[key], lang, parse_feed(raw))
        total += src_new
        print(f"  {key}: +{src_new}")
    con.close()
    print(f"\nbackfill done: {total} new articles")


_STRIP_BLOCKS_RE = re.compile(
    r"<(script|style|nav|header|footer|aside|form|noscript)\b.*?</\1>",
    re.DOTALL | re.IGNORECASE)
_PARA_RE = re.compile(r"<(?:p|h1|h2|h3|li)\b[^>]*>(.*?)</(?:p|h1|h2|h3|li)>",
                      re.DOTALL | re.IGNORECASE)


def extract_main_text(html_raw: str) -> str:
    """Crude-but-serviceable main-text extraction: prefer <article>, else all
    paragraph-level tags. Boilerplate that survives is absorbed by the chunker
    and retrieval scoring; a readability library can slot in here later."""
    body = _STRIP_BLOCKS_RE.sub(" ", html_raw)
    m = re.search(r"<article\b.*?</article>", body, re.DOTALL | re.IGNORECASE)
    if m:
        body = m.group(0)
    paras = [_strip_tags(p) for p in _PARA_RE.findall(body)]
    paras = [p for p in paras if len(p) > 60]       # drop nav crumbs/captions
    return "\n".join(paras)


_GOOGLE_ANCHOR_RE = re.compile(r'href="(https?://(?!(?:[a-z]+\.)?google\.com)[^"]+)"')


def _resolve_gnews(raw: bytes, final_url: str) -> tuple[bytes | None, str]:
    """news.google.com article links often serve a JS interstitial rather than
    an HTTP redirect. Pull the first non-Google anchor out and fetch that."""
    if "news.google.com" not in urllib.parse.urlparse(final_url).netloc:
        return raw, final_url
    m = _GOOGLE_ANCHOR_RE.search(raw.decode("utf-8", errors="replace"))
    if not m:
        return None, final_url
    target = html_mod.unescape(m.group(1))
    time.sleep(SLEEP)
    return fetch_final(target)


def cmd_hydrate(args) -> None:
    """Fetch full text for RELEVANT articles only (the gate ran on stubs)."""
    con = connect()
    # 2026-07-09 reorder: hydration no longer waits for the relevance gate —
    # the vector index is built from full text of EVERYTHING, and relevance is
    # a query-time property of retrieval (plus a cheap cost-filter before the
    # Sonnet signal stage). Funder/trade tiers and newest articles first.
    sql = """SELECT a.id, a.url FROM articles a JOIN sources s ON s.id = a.source_id
             WHERE a.full_text_fetched = 0
             ORDER BY CASE s.tier WHEN 'funder_press' THEN 0
                                  WHEN 'trade_press' THEN 1 ELSE 2 END,
                      a.published_at DESC"""
    rows = con.execute(sql + (f" LIMIT {int(args.limit)}" if args.limit else "")).fetchall()
    if not rows:
        print("nothing to hydrate — every article has full text.")
        con.close()
        return
    ok = failed = 0
    for r in rows:
        raw, final_url = fetch_final(r["url"])
        if raw is not None:
            raw, final_url = _resolve_gnews(raw, final_url)
        time.sleep(SLEEP)
        if raw is None:
            failed += 1
            continue
        try:
            text = extract_main_text(raw.decode("utf-8", errors="replace"))
        except Exception as e:  # noqa: BLE001
            print(f"    extract failed for article {r['id']}: {e}")
            failed += 1
            continue
        if len(text) < 300:
            # Paywalled / JS-rendered / consent-walled: keep the stub, mark
            # hydrated so downstream runs on what we legitimately have.
            con.execute(
                "UPDATE articles SET full_text_fetched = 1, resolved_url = ? WHERE id = ?",
                (final_url if final_url != r["url"] else None, r["id"]))
        else:
            con.execute("""
                UPDATE articles SET raw_text = ?, full_text_fetched = 1, resolved_url = ?
                WHERE id = ?""",
                (text[:60000], final_url if final_url != r["url"] else None, r["id"]))
            con.execute("DELETE FROM article_chunks WHERE article_id = ?", (r["id"],))
        ok += 1
        con.commit()
    con.close()
    print(f"hydrated {ok} articles ({failed} fetch failures — retriable, they stay queued).")


# ── HTML harvesting (funder newsrooms — full text AT ingest) ─────────────────
_HREF_RE = re.compile(r'href="([^"#]+)"')
_OG_TITLE_RE = re.compile(
    r'<meta[^>]+property="og:title"[^>]+content="([^"]+)"', re.IGNORECASE)
_H1_RE = re.compile(r"<h1\b[^>]*>(.*?)</h1>", re.DOTALL | re.IGNORECASE)
_META_DATE_RE = re.compile(
    r'<(?:meta[^>]+(?:property|name)="(?:article:published_time|date|dc\.date[^"]*)"'
    r'[^>]+content="([^"]+)"|time[^>]+datetime="([^"]+)")', re.IGNORECASE)


def _page_links(raw: bytes, base_url: str, pattern: str) -> list[str]:
    """Absolute-ized hrefs on a listing page that match the adapter pattern."""
    body = raw.decode("utf-8", errors="replace")
    rx = re.compile(pattern)
    seen: list[str] = []
    for href in _HREF_RE.findall(body):
        absu = urllib.parse.urljoin(base_url, html_mod.unescape(href))
        if rx.search(absu) and absu not in seen:
            seen.append(absu)
    return seen


def _article_page(raw: bytes, url: str) -> dict | None:
    """Full-text parse of one article page → store() item, or None if thin."""
    body = raw.decode("utf-8", errors="replace")
    m = _OG_TITLE_RE.search(body) or _H1_RE.search(body)
    title = _strip_tags(m.group(1)) if m else ""
    dm = _META_DATE_RE.search(body)
    published = _parse_date((dm.group(1) or dm.group(2)) if dm else "")
    text = extract_main_text(body)
    if not title or len(text) < 200:
        return None
    return {"title": title[:500], "url": url, "published": published,
            "summary": "", "text": text[:60000]}


def cmd_harvest(args) -> None:
    """Crawl kind=html funder newsrooms per HTML_ADAPTERS. Stores FULL TEXT at
    ingest (full_text_fetched=1) — these are the substance backbone. Idempotent:
    known URLs are skipped before fetching, so re-runs only pull new posts."""
    con = connect()
    ids = sync_registry(con)
    known = {r[0] for r in con.execute("SELECT url FROM articles")}
    total = 0
    for key, s in SOURCES.items():
        if s["kind"] != "html" or s["priority"] > args.priority:
            continue
        cfg = HTML_ADAPTERS.get(key)
        if not cfg or cfg.get("js_rendered") or (not s["url"] and not cfg.get("listing")):
            print(f"  {key}: no workable adapter yet — skipped")
            continue

        if cfg.get("mode") == "page":
            # The URL itself is the document (strategy hubs). Content changes
            # re-open the article for downstream stages.
            raw = fetch(s["url"])
            time.sleep(SLEEP)
            if raw is None:
                continue
            text = extract_main_text(raw.decode("utf-8", errors="replace"))
            if len(text) < 200:
                print(f"  {key}: page too thin (likely JS-rendered) — skipped")
                continue
            row = con.execute(
                "SELECT id, raw_text FROM articles WHERE url = ?", (s["url"],)).fetchone()
            if row is None:
                con.execute("""
                    INSERT INTO articles (source_id, url, title, published_at, language,
                                          raw_text, full_text_fetched)
                    VALUES (?,?,?,?,?,?,1)""",
                    (ids[key], s["url"], s["name"], date.today().isoformat(),
                     s["language"], text[:60000]))
                total += 1
                print(f"  {key}: page captured")
            elif row["raw_text"] != text[:60000]:
                con.execute("""
                    UPDATE articles SET raw_text = ?, published_at = ?,
                           entities_extracted_at = NULL, signals_extracted_at = NULL,
                           is_relevant = NULL
                    WHERE id = ?""", (text[:60000], date.today().isoformat(), row["id"]))
                con.execute("DELETE FROM article_chunks WHERE article_id = ?", (row["id"],))
                total += 1
                print(f"  {key}: page changed — recaptured")
            else:
                print(f"  {key}: page unchanged")
            con.commit()
            continue

        listing = cfg.get("listing") or s["url"]
        pattern = cfg["link_pattern"]
        page_param, max_pages = cfg.get("page_param"), cfg.get("max_pages", 1)
        new_links: list[str] = []
        for page in range(max_pages):
            url = listing if page == 0 else (
                f"{listing}{'&' if '?' in listing else '?'}{page_param}={page}")
            raw = fetch(url)
            time.sleep(SLEEP)
            if raw is None:
                break
            links = [u for u in _page_links(raw, url, pattern)
                     if u not in known and u not in new_links]
            if not links:
                break                       # exhausted the archive (or 1-page site)
            new_links += links
            if not page_param:
                break
        src_new = 0
        for u in new_links[:args.cap]:
            raw = fetch(u)
            time.sleep(SLEEP)
            if raw is None:
                continue
            item = _article_page(raw, u)
            if item is None:
                continue
            cur = con.execute("""
                INSERT OR IGNORE INTO articles (source_id, url, title, published_at,
                                                language, raw_text, full_text_fetched)
                VALUES (?,?,?,?,?,?,1)""",
                (ids[key], item["url"], item["title"], item["published"],
                 s["language"], item["text"]))
            src_new += cur.rowcount
            known.add(u)
            con.commit()          # commit per article — never hold a write txn across fetches
        total += src_new
        print(f"  {key}: {len(new_links)} new links found, {src_new} articles stored")
    con.close()
    print(f"\nharvest done: {total} new full-text documents")


def cmd_status(_args) -> None:
    con = connect()
    n = con.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
    by_tier = con.execute("""
        SELECT s.tier, COUNT(*) FROM articles a JOIN sources s ON s.id = a.source_id
        GROUP BY s.tier""").fetchall()
    span = con.execute(
        "SELECT MIN(published_at), MAX(published_at) FROM articles "
        "WHERE published_at IS NOT NULL").fetchone()
    gate = con.execute("""
        SELECT COALESCE(is_relevant, -1), COUNT(*) FROM articles GROUP BY 1""").fetchall()
    hyd = con.execute(
        "SELECT COUNT(*) FROM articles WHERE is_relevant = 1 AND full_text_fetched = 0"
    ).fetchone()[0]
    con.close()
    print(f"articles: {n:,}   span: {span[0]} → {span[1]}")
    for tier, c in by_tier:
        print(f"  {tier:<14} {c:>7,}")
    labels = {-1: "awaiting gate", 0: "rejected", 1: "relevant"}
    for flag, c in gate:
        print(f"  {labels[flag]:<14} {c:>7,}")
    print(f"  awaiting hydration: {hyd:,}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("sync").set_defaults(fn=cmd_sync)
    p = sub.add_parser("ingest")
    p.add_argument("--priority", type=int, default=2, help="max priority to pull (default 2)")
    p.set_defaults(fn=cmd_ingest)
    p = sub.add_parser("backfill")
    p.add_argument("--months", type=int, default=24)
    p.add_argument("--priority", type=int, default=2)
    p.set_defaults(fn=cmd_backfill)
    p = sub.add_parser("hydrate")
    p.add_argument("--limit", type=int)
    p.set_defaults(fn=cmd_hydrate)
    p = sub.add_parser("harvest")
    p.add_argument("--priority", type=int, default=2)
    p.add_argument("--cap", type=int, default=400, help="max new articles per source per run")
    p.set_defaults(fn=cmd_harvest)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
