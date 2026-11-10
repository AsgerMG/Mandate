"""Shared Europe-scope helper for all extractors.

The corpus is restricted to the 40-country EU/Europe scope defined in
`reference/europe_scope.json` (Sprint 14, 2026-05-29). At the DB layer this is
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

_SCOPE_PATH = _ETL_ROOT / "reference" / "europe_scope.json"

with open(_SCOPE_PATH) as _f:
    _SCOPE = json.load(_f)

EUROPE_ISO2: frozenset[str] = frozenset(c["iso2"] for c in _SCOPE["countries"])
COUNTRY_ALIASES: dict[str, str] = dict(_SCOPE["aliases"])
COUNTRY_NAMES: dict[str, str] = {c["iso2"]: c["name"] for c in _SCOPE["countries"]}

# ── Market tiers (owner, 2026-11-10; mandate/plans/data_audit.md) ──────────
# core: built out and refreshed. hub: refreshed, thinner. out: frozen context
# (stored, never refreshed, not offered unless the client is established
# there). The 40-country trigger is NOT a tier: an OUT country stays in scope.
# "EU" is not a country row; the EU level is core.
TIERS = ("core", "hub", "out")
COUNTRY_TIER: dict[str, str] = {c["iso2"]: c["tier"] for c in _SCOPE["countries"]}
COUNTRY_TIER["EU"] = _SCOPE["_meta"]["tiers"]["eu"]
assert set(COUNTRY_TIER.values()) <= set(TIERS), "europe_scope.json: unknown tier"


def tier_of(code: str | None) -> str:
    """The market tier of a country code (aliases resolved), or of the EU level.
    Anything outside the 40-country scope is 'out'.

    >>> tier_of('de'), tier_of('UK'), tier_of('ES'), tier_of('EU'), tier_of('PL'), tier_of('IL')
    ('core', 'core', 'hub', 'core', 'out', 'out')
    """
    if not code:
        return "out"
    c = code.strip().upper()
    if c == "EU":
        return COUNTRY_TIER["EU"]
    iso = canonicalise_country(c)
    return COUNTRY_TIER.get(iso, "out") if iso else "out"


def countries_in_tier(*tiers: str) -> frozenset[str]:
    """ISO-2 codes (and "EU" when its tier is asked) in the given tiers."""
    return frozenset(c for c, t in COUNTRY_TIER.items() if t in tiers)


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

# ── Country NAME resolution ──────────────────────────────────────────────────
# canonicalise_country() takes ISO-2 codes and aliases. Sources that publish
# full English names needed something else, and four extractors each grew their
# own copy of the same dict.
#
# The copies never disagreed on a value, but they had drifted in COVERAGE:
# eight names were missing from at least one of them — "Iceland" absent from
# one, "The Netherlands" and "UK" from two. An extractor that cannot resolve a
# name writes a NULL country, so the drift shows up as silently missing
# recipients rather than as an error. That is the same class of fault that let
# a stale sector list discard every founder's answer for a day.
#
# This is the union of all four, and the only copy. Anything reading country
# names imports from here.
# Keys are CASEFOLDED. Eight modules each carried a version of this in a
# different casing -- Title Case, lowercase, and UPPERCASE -- so a case-
# sensitive lookup silently failed depending on which copy a feed hit. Two of
# them (tag_step, extract_edf) also carried native-language names the others
# lacked, which is why the union is bigger than any single copy was.
COUNTRY_NAME_TO_ISO2: dict[str, str] = {
    "albania": "AL",
    "armenia": "AM",
    "austria": "AT",
    "belgie": "BE",
    "belgique": "BE",
    "belgium": "BE",
    "bosnia and herzegovina": "BA",
    "bulgaria": "BG",
    "canada": "CA",
    "croatia": "HR",
    "cyprus": "CY",
    "czech republic": "CZ",
    "czechia": "CZ",
    "danmark": "DK",
    "denmark": "DK",
    "deutschland": "DE",
    "espana": "ES",
    "estonia": "EE",
    "faroe islands": "FO",
    "finland": "FI",
    "france": "FR",
    "frankreich": "FR",
    "georgia": "GE",
    "germany": "DE",
    "greece": "GR",
    "hellas": "GR",
    "hungary": "HU",
    "iceland": "IS",
    "ireland": "IE",
    "israel": "IL",
    "italia": "IT",
    "italy": "IT",
    "kosovo": "XK",
    "latvia": "LV",
    "liechtenstein": "LI",
    "lithuania": "LT",
    "luxembourg": "LU",
    "macedonia": "MK",
    "malta": "MT",
    "moldova": "MD",
    "montenegro": "ME",
    "morocco": "MA",
    "nederland": "NL",
    "netherlands": "NL",
    "norge": "NO",
    "north macedonia": "MK",
    "norway": "NO",
    "oesterreich": "AT",
    "poland": "PL",
    "polska": "PL",
    "portugal": "PT",
    "republic of montenegro": "ME",
    "republic of serbia": "RS",
    "romania": "RO",
    "schweiz": "CH",
    "serbia": "RS",
    "slovak republic": "SK",
    "slovakia": "SK",
    "slovenia": "SI",
    "spain": "ES",
    "suomi": "FI",
    "sverige": "SE",
    "sweden": "SE",
    "switzerland": "CH",
    "the netherlands": "NL",
    "tunisia": "TN",
    "turkey": "TR",
    "turkiye": "TR",
    "uk": "GB",
    "ukraine": "UA",
    "united kingdom": "GB",
    "united states": "US",
    "usa": "US",
}



def name_to_iso2(name: str | None) -> str | None:
    """Resolve a full country NAME to its Europe-scope ISO-2 code.

    Returns None for anything out of scope, so callers get the same contract as
    canonicalise_country() and out-of-scope rows are dropped consistently
    rather than each extractor deciding for itself.

    >>> name_to_iso2('Germany')
    'DE'
    >>> name_to_iso2('  the netherlands ')   # case and whitespace tolerant
    'NL'
    >>> name_to_iso2('Israel')               # out of Europe scope
    >>> name_to_iso2(None)
    """
    if not name:
        return None
    key = " ".join(name.split()).casefold()
    iso = COUNTRY_NAME_TO_ISO2.get(key)
    if not iso:
        # Fall back to code resolution: some feeds mix names and codes.
        return canonicalise_country(key)
    return canonicalise_country(iso)

