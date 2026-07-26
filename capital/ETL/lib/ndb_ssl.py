"""Shared SSL context helper for NDB extractors.

macOS Python doesn't ship with the system root certificate bundle.
Using certifi ensures HTTPS connections to European data portals work.
"""
from __future__ import annotations

import ssl
import urllib.request

try:
    import certifi
    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL_CTX = ssl.create_default_context()


def open_url(url: str, timeout: int = 60, headers: dict | None = None):
    """Return an HTTP response object using certifi SSL context."""
    req = urllib.request.Request(
        url,
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
