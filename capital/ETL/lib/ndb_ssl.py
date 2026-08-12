"""Shared SSL context helper for NDB extractors.

macOS Python doesn't ship with the system root certificate bundle.
Using certifi ensures HTTPS connections to European data portals work.
"""
from __future__ import annotations

import ssl
import urllib.error
import urllib.request

try:
    import certifi
    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL_CTX = ssl.create_default_context()


def open_url(url: str, timeout: int = 60, headers: dict | None = None,
             data: bytes | None = None):
    """Return an HTTP response object using certifi SSL context.

    Passing `data` makes it a POST. Several registers expose their search only
    over POST -- Forskningsrådet's proposal search 404s on GET and the
    Commission's state-aid case register 500s -- so the body belongs here with
    the SSL context rather than in each caller.
    """
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "User-Agent": "Wincent/1.0",
            "Accept": "*/*",
            **(headers or {}),
        },
    )
    return urllib.request.urlopen(req, timeout=timeout, context=_SSL_CTX)


def fetch_text(url: str, timeout: int = 60) -> str | None:
    """Download URL as text (UTF-8 with latin-1 fallback). Returns None on failure."""
    try:
        with open_url(url, timeout=timeout) as resp:
            raw = resp.read()
            try:
                return raw.decode("utf-8")
            except UnicodeDecodeError:
                return raw.decode("latin-1")
    except Exception as e:
        import sys
        print(f"    fetch_text error {url}: {e}", file=sys.stderr)
        return None


def fetch_bytes(url: str, timeout: int = 60) -> bytes | None:
    """Download URL as raw bytes (caller handles encoding). Returns None on failure."""
    try:
        with open_url(url, timeout=timeout) as resp:
            return resp.read()
    except Exception as e:
        import sys
        print(f"    fetch_bytes error {url}: {e}", file=sys.stderr)
        return None


def fetch_json(url: str, timeout: int = 30) -> dict | list | None:
    """Download URL and parse as JSON. Returns None on failure."""
    import json
    try:
        with open_url(url, timeout=timeout, headers={"Accept": "application/json"}) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


def post_json(url: str, body: dict, timeout: int = 60) -> dict | list | None:
    """POST `body` as JSON and parse the JSON response. Returns None on failure.

    Deliberately NOT silent about why: a register that rejects the body answers
    with a 400 naming the fields it wanted, and swallowing that turns a
    fixable schema drift into an empty harvest.
    """
    import json
    import sys
    payload = json.dumps(body).encode("utf-8")
    try:
        with open_url(url, timeout=timeout, data=payload,
                      headers={"Content-Type": "application/json",
                               "Accept": "application/json"}) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"    post_json {e.code} {url}: {e.read()[:400].decode('utf-8', 'replace')}",
              file=sys.stderr)
        return None
    except Exception as e:
        print(f"    post_json error {url}: {e}", file=sys.stderr)
        return None
