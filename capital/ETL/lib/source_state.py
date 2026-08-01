"""Which sources actually changed, so a refresh only does work that matters.

── The trigger is the data, not the clock ─────────────────────────────────
Everything in this corpus decays: ADEME publishes awards continuously, Vinnova
opens and closes programmes, schemes lapse. A corpus refreshed by remembering
to refresh it goes stale silently, which is the failure mode this product is
least able to detect in itself.

The obvious fix is a nightly job, and it is the wrong one. Re-running the chain
over unchanged sources burns real money -- embeddings, encoders, extraction --
to reproduce numbers that were already correct. Worse, it trains people to
ignore the run, because it says the same thing every night.

So the question a refresh asks first is not "is it time" but "did anything
change". A content hash per source answers that for nothing, and everything
downstream is already incremental.

── What counts as the source ──────────────────────────────────────────────
The raw files on disk, not the API responses. A fetch that returns identical
data must not trigger anything, and a fetch that fails must not look like a
source that emptied: hashing what landed on disk gets both right, and is
verifiable by hand.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from etl_env import ROOT

STATE = ROOT / "data" / ".source_hashes.json"
RAW = ROOT / "data" / "raw"

# Files that are inputs, not payload. A README changing must not re-embed a
# corpus, and __pycache__ has no business being hashed at all.
IGNORED_SUFFIXES = {".md", ".txt", ".log", ".pyc"}


def _hash_dir(path: Path) -> tuple[str, int]:
    """Content hash of one source directory, plus the number of files behind it.

    Sorted by relative path so the digest depends on content and layout only,
    never on filesystem ordering, which differs between machines and would make
    every source look changed on a different laptop.
    """
    h = hashlib.sha256()
    n = 0
    for f in sorted(path.rglob("*")):
        if not f.is_file() or f.suffix in IGNORED_SUFFIXES or "__pycache__" in f.parts:
            continue
        h.update(str(f.relative_to(path)).encode())
        h.update(f"{f.stat().st_size}".encode())
        # Size alone would miss an edit that happens to preserve length, which
        # is exactly what a corrected value looks like.
        h.update(hashlib.sha256(f.read_bytes()).digest())
        n += 1
    return h.hexdigest()[:16], n


def current() -> dict[str, dict]:
    out = {}
    if not RAW.exists():
        return out
    for d in sorted(RAW.iterdir()):
        if not d.is_dir() or d.name.startswith("."):
            continue
        digest, n = _hash_dir(d)
        out[d.name] = {"hash": digest, "files": n}
    return out


def previous() -> dict[str, dict]:
    if not STATE.exists():
        return {}
    try:
        return json.loads(STATE.read_text())
    except ValueError:
        return {}


def changed() -> tuple[list[str], list[str], list[str]]:
    """(changed, added, removed) source names."""
    now, before = current(), previous()
    added = [k for k in now if k not in before]
    removed = [k for k in before if k not in now]
    moved = [k for k in now
             if k in before and now[k]["hash"] != before[k]["hash"]]
    return moved, added, removed


def record() -> None:
    STATE.write_text(json.dumps(current(), indent=1, sort_keys=True) + "\n")
