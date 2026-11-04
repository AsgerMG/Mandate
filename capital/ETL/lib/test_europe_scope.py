"""Country resolution must be case-insensitive and scope-enforcing.

Written after consolidating eight copies of this map. The consolidation nearly
introduced the exact bug it was removing: the canonical map is casefolded, but
three modules were still passing their own casing -- extract_sprind sent
UPPERCASE, load_satr and extract_eifo_note12 sent Title Case -- so every lookup
would have silently returned None and written a NULL country.

Run: python3 -m doctest ETL/lib/europe_scope.py -v
     python3 ETL/lib/test_europe_scope.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from europe_scope import COUNTRY_NAME_TO_ISO2, name_to_iso2  # noqa: E402

FAILURES: list[str] = []


def check(got, want, label: str) -> None:
    if got != want:
        FAILURES.append(f"{label}: got {got!r}, want {want!r}")


# Casing — the regression that nearly shipped.
for variant in ("Germany", "GERMANY", "germany", "  gErMaNy  "):
    check(name_to_iso2(variant), "DE", f"casing {variant!r}")

# Native-language forms, which only two of the eight copies carried.
for native, iso in (("deutschland", "DE"), ("danmark", "DK"), ("espana", "ES"),
                    ("italia", "IT"), ("belgique", "BE")):
    check(name_to_iso2(native), iso, f"native {native!r}")

# Multi-word and article forms that were missing from several copies.
for name, iso in (("The Netherlands", "NL"), ("United Kingdom", "GB"), ("UK", "GB"),
                  ("Iceland", "IS"), ("Czech Republic", "CZ")):
    check(name_to_iso2(name), iso, f"variant {name!r}")

# Scope enforcement: out-of-Europe names resolve to None, so every caller drops
# them the same way instead of each deciding for itself.
for out in ("Israel", "Canada", "United States", "Japan"):
    check(name_to_iso2(out), None, f"out of scope {out!r}")

# Degenerate input must not raise.
for empty in (None, "", "   ", "not a country"):
    check(name_to_iso2(empty), None, f"empty {empty!r}")

# The map itself is casefolded, so a direct .get() with mixed case would fail —
# which is why callers use the function, not the dict.
if any(k != k.casefold() for k in COUNTRY_NAME_TO_ISO2):
    FAILURES.append("COUNTRY_NAME_TO_ISO2 contains a non-casefolded key")

if FAILURES:
    print(f"{len(FAILURES)} failure(s):")
    for f in FAILURES:
        print(f"  {f}")
    sys.exit(1)
print(f"country resolution ok ({len(COUNTRY_NAME_TO_ISO2)} names, case-insensitive, scope-enforced)")
