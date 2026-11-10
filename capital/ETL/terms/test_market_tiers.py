"""Market tiers (owner, 2026-11-10): core / hub / out per country, per source.

Run: python3 ETL/terms/test_market_tiers.py

What is held:
  - every country in europe_scope.json has a tier; EU is core; Spain is a hub
  - every manifest source has a market, read from its country's tier
  - the routine refresh (renew.py --auto) skips OUT markets and nothing else:
    Spain's sources keep their refresh
  - check_offerable_decay holds core and hub as before, and reports a frozen
    OUT country or OUT-only clock source without failing or warning on it
"""
from __future__ import annotations

import contextlib
import io
import json
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "lib"))
sys.path.insert(0, str(HERE.parent / "events" / "extract"))
sys.path.insert(0, str(HERE))

import check_offerable_decay as decay  # noqa: E402
import manifest  # noqa: E402
from europe_scope import COUNTRY_TIER, EUROPE_ISO2, countries_in_tier, tier_of  # noqa: E402

FAILURES: list[str] = []


def check(cond: bool, label: str) -> None:
    if not cond:
        FAILURES.append(label)


# ── countries ─────────────────────────────────────────────────────────────
check(set(EUROPE_ISO2) <= set(COUNTRY_TIER), "a country in europe_scope.json has no tier")
check(countries_in_tier("core") == {"DE", "IT", "FR", "GB", "EU"}, f"core is {sorted(countries_in_tier('core'))}")
check(countries_in_tier("hub") == {"SE", "DK", "NO", "NL", "BE", "ES"}, f"hub is {sorted(countries_in_tier('hub'))}")
check(tier_of("UK") == "core" and tier_of("el") == "out", "aliases resolve before the tier is read")
check(tier_of("IL") == "out" and tier_of(None) == "out", "outside the 40 is out")

# ── sources ───────────────────────────────────────────────────────────────
missing = [s.key for s in manifest.SOURCES if s.key not in manifest.SOURCE_COUNTRY]
check(not missing, f"manifest sources without a country: {missing}")
stale = sorted(set(manifest.SOURCE_COUNTRY) - set(manifest.BY_KEY))
check(not stale, f"SOURCE_COUNTRY names sources the manifest does not have: {stale}")
for k, c in manifest.SOURCE_COUNTRY.items():
    check(c == "EU" or c in EUROPE_ISO2, f"{k}: {c} is not a scope country")
auto = [s for s in manifest.SOURCES if s.tier == "AUTO"]
frozen = sorted(s.key for s in auto if not manifest.refreshed(s))
check(all(manifest.market_of(manifest.BY_KEY[k]) == "out" for k in frozen), "a non-OUT AUTO source is frozen")
check(manifest.refreshed(manifest.BY_KEY["bdns"]) and manifest.refreshed(manifest.BY_KEY["cdti"]),
      "Spain is a hub: bdns and cdti keep their refresh")
check("business_finland" in frozen and "enterprise_ireland" in frozen, f"frozen = {frozen}")
check(not manifest.refreshed(manifest.BY_KEY["satr"]), "SATR is NETWORK, never in --auto")

# ── check_offerable_decay with frozen countries ──────────────────────────
base = {"as_of": "2026-11-01",
        "countries": {"FI": {"offerable": 40, "total": 40}, "ES": {"offerable": 100, "total": 200}},
        "clock_sources": {"fi_calls": {"rows": 10, "last_refreshed": "2026-11-01"},
                          "bdns_es": {"rows": 80, "last_refreshed": "2026-11-01"}}}


def run(m: dict) -> tuple[int, str]:
    with tempfile.TemporaryDirectory() as d:
        b = Path(d) / "baseline.json"
        b.write_text(json.dumps(base))
        decay.BASELINE = b
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            rc = decay.check(m, decay.TOLERANCE, decay.GRACE_DAYS)
    return rc, out.getvalue()


# FI (OUT) halves and its clock source goes stale: frozen, so green.
rc, out = run({"as_of": "2026-11-30",
               "countries": {"FI": {"offerable": 20, "total": 40}, "ES": {"offerable": 99, "total": 200}},
               "clock_sources": {"fi_calls": {"rows": 10, "last_refreshed": "2026-11-01", "countries": ["FI"]},
                                 "bdns_es": {"rows": 80, "last_refreshed": "2026-11-28", "countries": ["ES"]}}})
check(rc in (0, 3) and "frozen" in out and "DECAY" not in out, f"a frozen OUT country failed the guard (rc={rc}):\n{out}")
check("FI: " not in out.split("warning:", 1)[-1] if "warning:" in out else True, "a frozen country raised a warning")
# Spain (HUB) is still held: its clock source past grace fails.
rc, out = run({"as_of": "2026-11-30",
               "countries": {"FI": {"offerable": 40, "total": 40}, "ES": {"offerable": 100, "total": 200}},
               "clock_sources": {"bdns_es": {"rows": 80, "last_refreshed": "2026-11-01", "countries": ["ES"]}}})
check(rc == 1 and "bdns_es" in out and "PAST GRACE" in out, f"Spain's stale refresh did not fail the guard:\n{out}")
# A HUB country's unexplained fall still fails.
rc, out = run({"as_of": "2026-11-05",
               "countries": {"FI": {"offerable": 40, "total": 40}, "ES": {"offerable": 50, "total": 200}},
               "clock_sources": {"bdns_es": {"rows": 80, "last_refreshed": "2026-11-04", "countries": ["ES"]}}})
check(rc == 1 and "ES: 50 offerable rows lost" in out, f"Spain's decay did not fail the guard:\n{out}")
check(not decay.frozen([]) and not decay.frozen(["FI", "ES"]) and decay.frozen(["FI", "PL"]),
      "frozen() is true only when every country is OUT")

if FAILURES:
    print("market tiers FAILED:")
    for f in FAILURES:
        print(f"  - {f}")
    sys.exit(1)
print(f"market tiers ok ({len(frozen)} AUTO sources frozen: {', '.join(frozen)})")
