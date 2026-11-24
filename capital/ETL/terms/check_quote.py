"""Check a page and a quote EXACTLY as the graph-core loaders will: same fetcher, same text
extraction (PDF text, OCR fallback), same tolerant locate. No database, no model.

    python3 capital/ETL/terms/check_quote.py URL                     # can the loader fetch it? chars, extractor
    python3 capital/ETL/terms/check_quote.py URL "verbatim quote"    # ... and is the quote found?

Agents proposing org-chart URLs or ties run this before writing them: a page an agent read through
a browser tool may be blocked (403, captcha) or render differently for the loader.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import httpx  # noqa: E402

from load_graph_de import UA, fetch_one  # noqa: E402
from load_graph_de_offers import locate_loose  # noqa: E402


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    url = sys.argv[1]
    try:
        with httpx.Client(timeout=60.0, follow_redirects=True, headers={"user-agent": UA}) as client:
            _, mime, status, text, ext, via = fetch_one(client, url)  # the loader's fetch, Chrome fallback included
    except Exception as e:  # noqa: BLE001
        print(f"FETCH FAILED: {str(e)[:160]}")
        return 1
    print(f"fetched {status} {mime} {len(text)} chars via {ext or '-'}" + (" (rendered with Chrome: the plain fetch was refused or empty)" if via == "chrome" else ""))
    for q in sys.argv[2:]:
        span = locate_loose(text, q)
        print(f"{'FOUND' if span else 'NOT FOUND'}: {q[:90]!r}" + (f" at {span[0]}" if span else ""))
        if not span:
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
