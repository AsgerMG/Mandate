"""Shared Europe-scope helper for all extractors.

The corpus is restricted to the 40-country EU/Europe scope defined in
`data/europe_scope.json` (Sprint 14, 2026-05-29). At the DB layer this is
enforced by the `trg_companies_country_scope` BEFORE INSERT trigger — any
extractor that tries to insert a company with an out-of-scope country code
will fail with a clear error message.

To avoid those failures, **every extractor should call
`canonicalise_country()` on the country code before inserting a company
row, and skip the row if the result is None** (or implement equivalent
filtering logic at scrape time).

Usage:

    from europe_scope import canonicalise_country

    for row in rows:
        country = canonicalise_country(row["country"])
        if country is None:
            continue  # out of scope — skip
        cur.execute(
            "INSERT INTO companies (canonical_name, country, ...) VALUES (?, ?, ...)",
            (row["name"], country, ...),
        )

The function does two things:
  1. Maps EU/source-data aliases to canonical ISO-2: EL -> GR, UK -> GB,
     PO -> PL, SW -> SE, GL -> DK.
  2. Returns the canonical code if it is one of the 40 in-scope countries,
     None otherwise (so the caller can skip the row).

Full rationale: see docs/europe_scope.md.
"""

from __future__ import annotations


# --- ETL path bootstrap (auto-added; see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB as _ETL_DB, ROOT as _ETL_ROOT  # noqa: E402,F401
# --- end ETL path bootstrap ---

import json
from pathlib import Path

_SCOPE_PATH = _ETL_ROOT / "data" / "europe_scope.json"

with open(_SCOPE_PATH) as _f:
    _SCOPE = json.load(_f)

EUROPE_ISO2: frozenset[str] = frozenset(c["iso2"] for c in _SCOPE["countries"])
COUNTRY_ALIASES: dict[str, str] = dict(_SCOPE["aliases"])
COUNTRY_NAMES: dict[str, str] = {c["iso2"]: c["name"] for c in _SCOPE["countries"]}


def canonicalise_country(code: str | None) -> str | None:
    """Return the canonical Europe-scope ISO-2 code, or None if out of scope.

    >>> canonicalise_country('EL')   # Greek-language code
    'GR'
    >>> canonicalise_country('UK')   # text form
    'GB'
    >>> canonicalise_country('de')   # case + whitespace tolerant
    'DE'
    >>> canonicalise_country('IL')   # Israel — out of scope
    >>> canonicalise_country('')     # blank input
    >>> canonicalise_country(None)
    """
    if not code:
        return None
    code = code.strip().upper()
    if not code:
        return None
    code = COUNTRY_ALIASES.get(code, code)
    return code if code in EUROPE_ISO2 else None


def is_in_scope(code: str | None) -> bool:
    """Convenience predicate. True iff `canonicalise_country(code) is not None`."""
    return canonicalise_country(code) is not None


if __name__ == "__main__":
    # Self-test.
    cases = [
        ("EL", "GR"), ("UK", "GB"), ("PO", "PL"), ("SW", "SE"), ("GL", "DK"),
        ("de", "DE"), ("FR", "FR"), ("GR", "GR"), ("GB", "GB"),
        ("IL", None), ("TR", None), ("AM", None), ("TN", None),
        ("", None), (None, None), ("  ", None),
    ]
    for src, want in cases:
        got = canonicalise_country(src)
        ok = "✓" if got == want else "✗"
        print(f"  {ok}  canonicalise_country({src!r}) = {got!r}  (want {want!r})")
    print(f"\nScope size: {len(EUROPE_ISO2)} countries")
