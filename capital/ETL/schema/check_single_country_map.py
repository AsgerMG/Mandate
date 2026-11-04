"""Fail if a country name-to-ISO2 map reappears outside europe_scope.py.

Four extractors each grew their own copy of the same dict. They never disagreed
on a value, but they had drifted in COVERAGE: eight names were missing from at
least one of them. An extractor that cannot resolve a name writes a NULL
country rather than raising, so the drift showed up as silently missing
recipients — the same shape as the stale sector list that discarded every
founder's answer for a day.

Consolidating was the fix; this is what stops it recurring. Cheap enough to run
in CI on every push.

Usage: python3 ETL/schema/check_single_country_map.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CANONICAL = ROOT / "ETL" / "lib" / "europe_scope.py"

PAIR = re.compile(r'"([A-Za-z][A-Za-z .\'-]{2,})"\s*:\s*"([A-Z]{2})"')

# A COMPANY-to-country lookup is legitimately per-source data: which country a
# specific defence prime or chip manufacturer sits in is not something
# europe_scope can know. Only a COUNTRY-name map is the duplication being
# hunted, and the two are told apart by whether the keys are country names —
# checked against the canonical map itself, so this stays correct as that map
# grows rather than needing its own list of exceptions.
#
# Without this the check flagged extract_edf (33 defence primes) and
# extract_chips_ju (7 semiconductor firms), which would have been a check that
# cries wolf on correct code — the fastest way to teach people to ignore it.
_sys_path = str(ROOT / "ETL" / "lib")
if _sys_path not in sys.path:
    sys.path.insert(0, _sys_path)
from europe_scope import COUNTRY_NAME_TO_ISO2  # noqa: E402

KNOWN = {k.casefold() for k in COUNTRY_NAME_TO_ISO2}
MIN_COUNTRY_KEYS = 2


def main() -> None:
    offenders: list[tuple[Path, int]] = []
    for path in sorted(ROOT.glob("ETL/**/*.py")) + sorted(ROOT.glob("website/build/**/*.py")):
        if path == CANONICAL or "__pycache__" in path.parts:
            continue
        text = path.read_text(encoding="utf8", errors="ignore")
        keys = [k for k, _ in PAIR.findall(text)]
        country_keys = [k for k in keys if k.casefold() in KNOWN]
        if len(country_keys) >= MIN_COUNTRY_KEYS:
            offenders.append((path.relative_to(ROOT), len(country_keys)))

    if offenders:
        print("A country name->ISO2 map exists outside europe_scope.py:\n")
        for p, n in offenders:
            print(f"  {p}  ({n} recognised country names)")
        print("\nImport COUNTRY_NAME_TO_ISO2 or name_to_iso2() from europe_scope instead.")
        print("Copies drift in coverage, and an unresolvable name becomes a NULL")
        print("country rather than an error — silently missing recipients.")
        sys.exit(1)

    print("one country map, in europe_scope.py")


if __name__ == "__main__":
    main()
