"""Get each agency's own programme catalogue onto disk, so the names can be read
out later without a network round trip.

── The problem ────────────────────────────────────────────────────────────
154 development-bank instruments share a display name with a sibling, across 11
agencies and EUR 7.4B. A founder sees nine rows all called "Altum (Latvia)",
told apart only by the id slug: "Altum (Latvia) - garantijas 3 1 1 1 pas k".
That is not a fund anyone can act on.

The real names exist, in each agency's own catalogue. Altum's page lists
"Kredīta garantijas", "Aizdevums digitalizācijai ar kapitāla atlaidi",
"Lielo investīciju aizdevums ar kapitāla atlaidi".

── Why fetching and naming are separate steps ─────────────────────────────
Matching a catalogue entry to an instrument is NOT mechanical, and it was worth
proving before building on the assumption. The ids are agency-internal codes,
not name slugs: `altum_anm_digi`, `altum_la_ar_ka`, `altum_mvu_ia_3_1_1_7_un_13_1_1`.
Nothing in "anm digi" deterministically resolves to "Aizdevums digitalizācijai";
"ANM" is Latvia's RRF programme code, and the link slug is "digitalizacija". A
slug-similarity match here would be a guess wearing an algorithm's clothing, and
a wrong fund name is worse than an ugly one.

So this script only FETCHES. It costs nothing, it is the long-lead item, and it
turns a later naming pass into a local operation over stored evidence with the
source URL and fetch date attached to every candidate.

── Not impersonating anyone ───────────────────────────────────────────────
curl with its default identity, same as seed_agency_routes.py's verify(), for
the reason recorded there: we are reading a public catalogue page, not
pretending to be a browser to get past a block. Requests are serialised with a
delay. A page that refuses us is recorded as refused, not retried differently.

Usage:
  python3 ETL/terms/fetch_agency_catalogues.py --list
  python3 ETL/terms/fetch_agency_catalogues.py run [--agency altum_%] [--max-pages N]
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import argparse
import hashlib
import html as _html
import json
import re
import sqlite3
import subprocess
import time
from datetime import date
from urllib.parse import urljoin, urlparse

# The agency list is IMPORTED, not restated. seed_agency_routes.py already holds
# each catalogue URL and has already verified it reachable; a second copy here
# would be the same "keep in sync" bug this repo keeps paying for.
_sys.path.insert(0, str(_Path(__file__).resolve().parent))
from seed_agency_routes import AGENCIES  # noqa: E402

OUT = ROOT / "data" / "raw" / "agency_catalogues"

# Bounded on purpose. The catalogue index plus its programme pages is what a
# naming pass needs; crawling an agency's whole site is neither necessary nor
# polite. Agencies exceeding this are reported so the limit is a visible
# decision rather than silent truncation.
MAX_PAGES = 60
DELAY_S = 1.5


def fetch(url: str) -> tuple[int, str]:
    """(http status, body). Never raises: an agency that blocks us is a fact to
    record, not a crash that loses the pages already fetched."""
    try:
        out = subprocess.run(
            ["curl", "-sS", "-L", "--max-time", "40", "-w", "\n%{http_code}", url],
            capture_output=True, text=True, timeout=60)
    except Exception:
        return 0, ""
    if out.returncode != 0:
        return 0, ""
    body, _, code = out.stdout.rpartition("\n")
    try:
        return int(code.strip()), body
    except ValueError:
        return 0, body


def title_of(body: str) -> str:
    m = re.search(r"<title[^>]*>(.*?)</title>", body, re.S | re.I)
    if not m:
        return ""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", _html.unescape(m.group(1)))).strip()[:160]


def programme_links(body: str, base: str) -> list[tuple[str, str]]:
    """(absolute url, anchor text) for links that plausibly lead to a programme
    page: same host, at or below the catalogue path. Anchor text is kept because
    it is usually the programme's own name and is the strongest single clue a
    later naming pass has."""
    base_p = urlparse(base)
    root = base_p.path.rstrip("/").rsplit("/", 1)[0] or "/"
    seen: set[str] = set()
    out: list[tuple[str, str]] = []
    for href, inner in re.findall(r'<a[^>]+href="([^"#?]+)"[^>]*>(.*?)</a>', body, re.S | re.I):
        url = urljoin(base, href)
        p = urlparse(url)
        if p.netloc != base_p.netloc or not p.path.startswith(root):
            continue
        if p.path.rstrip("/") == base_p.path.rstrip("/") or url in seen:
            continue
        text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", _html.unescape(inner))).strip()
        if not (4 <= len(text) <= 120):
            continue
        seen.add(url)
        out.append((url, text))
    return out


def ambiguous_counts() -> dict[str, int]:
    """How many same-named families each agency prefix accounts for -- the whole
    reason for fetching, printed so the run is prioritised by what it fixes."""
    conn = sqlite3.connect(DB)
    rows = conn.execute(
        "SELECT id, name FROM funding_instruments WHERE parent_id IS NULL AND is_framework=0"
    ).fetchall()
    conn.close()
    by_name: dict[str, list[str]] = {}
    for iid, name in rows:
        by_name.setdefault(name, []).append(iid)
    ambiguous = {iid for ids in by_name.values() if len(ids) > 1 for iid in ids}
    counts: dict[str, int] = {}
    for a in AGENCIES:
        pref = a["match"].rstrip("%")
        counts[a["match"]] = sum(1 for iid in ambiguous if iid.startswith(pref))
    return counts


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", nargs="?", choices=["run"], default=None)
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--agency", help="only this match pattern, e.g. altum_%%")
    ap.add_argument("--max-pages", type=int, default=MAX_PAGES)
    args = ap.parse_args()

    counts = ambiguous_counts()
    if args.list or not args.cmd:
        print(f"{'match':12} {'ambiguous':>9}  agency / catalogue")
        for a in sorted(AGENCIES, key=lambda a: -counts[a["match"]]):
            print(f"{a['match']:12} {counts[a['match']]:>9}  {a['agency']}\n"
                  f"{'':22}  {a['calls']}")
        print(f"\ntotal same-named families reachable from a verified catalogue: "
              f"{sum(counts.values())}")
        return

    OUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}

    for a in AGENCIES:
        if args.agency and a["match"] != args.agency:
            continue
        key = a["match"].rstrip("_%")
        adir = OUT / key
        adir.mkdir(exist_ok=True)
        print(f"\n== {a['agency']}  ({counts[a['match']]} same-named families)")

        code, body = fetch(a["calls"])
        if code != 200 or not body:
            print(f"   index UNREACHABLE (HTTP {code}) -- recorded, not retried differently")
            manifest[key] = {"agency": a["agency"], "index": a["calls"],
                             "fetched": str(date.today()), "status": code, "pages": []}
            continue

        links = programme_links(body, a["calls"])
        print(f"   index ok: \"{title_of(body)[:60]}\"  {len(links)} programme links")
        if len(links) > args.max_pages:
            print(f"   capped at {args.max_pages} (see MAX_PAGES)")
        pages = [{"url": a["calls"], "file": "index.html", "title": title_of(body),
                  "anchor": None, "status": 200,
                  "sha256": hashlib.sha256(body.encode()).hexdigest()[:16]}]
        (adir / "index.html").write_text(body, encoding="utf-8")

        for i, (url, anchor) in enumerate(links[:args.max_pages], 1):
            time.sleep(DELAY_S)
            c, b = fetch(url)
            slug = re.sub(r"[^a-z0-9]+", "_", urlparse(url).path.strip("/").lower())[:70] or f"p{i}"
            rec = {"url": url, "anchor": anchor, "status": c}
            if c == 200 and b:
                (adir / f"{slug}.html").write_text(b, encoding="utf-8")
                rec |= {"file": f"{slug}.html", "title": title_of(b),
                        "sha256": hashlib.sha256(b.encode()).hexdigest()[:16]}
            pages.append(rec)
            print(f"   [{i:>3}/{min(len(links), args.max_pages)}] {c} {anchor[:52]}")

        manifest[key] = {"agency": a["agency"], "index": a["calls"],
                         "fetched": str(date.today()), "status": 200,
                         "ambiguous_families": counts[a["match"]], "pages": pages}
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")

    ok = sum(1 for v in manifest.values() for p in v["pages"] if p.get("status") == 200)
    print(f"\n{ok} pages on disk under {OUT.relative_to(ROOT)}; manifest written.")
    print("Naming from these is a separate, judgement-bearing pass -- not done here.")


if __name__ == "__main__":
    main()
