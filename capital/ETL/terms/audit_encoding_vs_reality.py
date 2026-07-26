"""Audit the encoded eligibility rules against who ACTUALLY received the money.

The idea (user's, 2026-07-26): comparable companies are not only motivation for
a founder — they are a test of our own work. If our rules say a 20-person
German company qualifies for a fund and fifty such companies visibly drew on
it, the encoding is corroborated. If our rules would have EXCLUDED companies
that demonstrably won the award, we encoded something wrong.

This runs that test in the strongest available direction. For each encoded
country filter we can check the real recipients: a rule saying "must be
established in Spain" is contradicted by every non-Spanish company on record as
having received that instrument. Country is the right dimension to start on —
it is present for 98.5% of companies, it is the most-encoded field (92 specs),
and unlike size or stage it does not drift over time.

A contradiction is not automatically a bug in the rule; an instrument may be
one sub-track of a wider programme whose events we group together. But a rule
contradicted by most of its own recipients is not safe to gate a verdict on,
and that is exactly what this surfaces.

Usage: python3 ETL/terms/audit_encoding_vs_reality.py [--min-events 10]
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB  # noqa: E402
# --- end ETL path bootstrap ---

import argparse
import json
import sqlite3

# Full English name -> ISO2, for the countries our encoded rules actually use.
# Encoded specs speak full names (the intake picker's vocabulary); the events
# corpus speaks ISO2.
NAME_TO_ISO2 = {
    "austria": "AT", "belgium": "BE", "bulgaria": "BG", "croatia": "HR", "cyprus": "CY",
    "czechia": "CZ", "czech republic": "CZ", "denmark": "DK", "estonia": "EE",
    "finland": "FI", "france": "FR", "germany": "DE", "greece": "GR", "hungary": "HU",
    "iceland": "IS", "ireland": "IE", "italy": "IT", "latvia": "LV",
    "liechtenstein": "LI", "lithuania": "LT", "luxembourg": "LU", "malta": "MT",
    "netherlands": "NL", "norway": "NO", "poland": "PL", "portugal": "PT",
    "romania": "RO", "serbia": "RS", "slovakia": "SK", "slovenia": "SI",
    "spain": "ES", "sweden": "SE", "switzerland": "CH", "turkey": "TR",
    "ukraine": "UA", "united kingdom": "GB",
}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--min-events", type=int, default=10,
                    help="ignore instruments with fewer recipients than this")
    args = ap.parse_args()

    conn = sqlite3.connect(DB)
    rows = conn.execute(
        """SELECT g.id, g.instrument_id, fi.name, g.value_spec, g.requirement
           FROM eligibility_gates g JOIN funding_instruments fi ON fi.id = g.instrument_id
           WHERE g.value_spec IS NOT NULL AND g.gate_role = 'filter'"""
    ).fetchall()

    corroborated = contradicted = unchecked = 0
    problems: list[tuple[float, str]] = []

    for gid, iid, name, spec_json, requirement in rows:
        spec = json.loads(spec_json)
        if spec.get("field") != "entityCountries" or spec.get("op") not in ("in", "not_in"):
            unchecked += 1
            continue
        allowed = {NAME_TO_ISO2.get(v.strip().lower()) for v in spec.get("allowed", [])}
        allowed.discard(None)
        if not allowed:
            unchecked += 1
            continue

        recips = conn.execute(
            """SELECT c.country, COUNT(DISTINCT c.id)
               FROM public_funding_events e
               JOIN funding_instrument_sources fis ON fis.source = e.source
               JOIN companies c ON c.id = e.company_id
               WHERE fis.instrument_id = ? AND e.is_duplicate = 0
                 AND c.country IS NOT NULL AND c.country <> ''
               GROUP BY 1""", (iid,)).fetchall()
        total = sum(n for _, n in recips)
        if total < args.min_events:
            unchecked += 1
            continue

        if spec["op"] == "in":
            ok = sum(n for cc, n in recips if cc in allowed)
        else:
            ok = sum(n for cc, n in recips if cc not in allowed)
        share = ok / total
        if share >= 0.8:
            corroborated += 1
        else:
            contradicted += 1
            top = ", ".join(f"{cc}:{n}" for cc, n in sorted(recips, key=lambda r: -r[1])[:4])
            problems.append((share, f"  [{share:5.0%} agree] {name} ({iid})\n"
                                    f"      rule: {' '.join(requirement.split())[:88]}\n"
                                    f"      spec: {spec['op']} {sorted(allowed)}\n"
                                    f"      actual recipients: {top}  (n={total})"))

    checked = corroborated + contradicted
    print(f"encoded filters:            {len(rows):,}")
    print(f"  checkable against reality:{checked:,}   (country rules on instruments "
          f"with >={args.min_events} recipients)")
    print(f"  corroborated (>=80% fit): {corroborated:,}")
    print(f"  contradicted:             {contradicted:,}")
    if checked:
        print(f"\n  corroboration rate: {100*corroborated/checked:.0f}%")
    if problems:
        print("\n=== rules their own recipients contradict (worst first) ===")
        for _, text in sorted(problems)[:15]:
            print(text)
    conn.close()


if __name__ == "__main__":
    main()
