"""Where a notified scheme actually applies, from the Commission's registration.

── Why ────────────────────────────────────────────────────────────────────
"Where must I be" is one of the questions a founder cannot answer without us,
and it fails loudly when wrong: a Paris company offered a Normandy scheme has
been sent to waste a fortnight. Regional eligibility was evaluable on 10
instruments in the whole corpus.

The Commission's case register records the NUTS regions each notified scheme
covers, on 372 of 376 schemes. 104 SATR children have explicit region codes and
60 of those name exactly ONE region -- "Décret wallon sur l'innovation" is
registered for BE3, so a company in Flanders or Brussels is not eligible and the
brief should say so rather than publishing on hope.

── Why this is a filter and the article gates are not ─────────────────────
An inferred GBER article is a majority vote across award history, so it narrows
but must never disqualify. A registered region is different in kind: it is a
filed fact about the scheme's own scope, at the same evidential level as the
scheme's title, which this corpus already displays. It gets a `region_within`
value_spec and gate_role='filter', so it can decide a verdict.

`region_within` and the intake field are exactly what encode_regions.py and the
Bpifrance Île-de-France gates already use, so no new comparator and no new
intake vocabulary.

── The floor ──────────────────────────────────────────────────────────────
A region set that covers a whole country restricts nobody, and encoding it would
add a gate that always passes while looking like real eligibility. Those are
skipped: the register writes them as CountryXXX or NutsRegionXX, and they are
not parsed as NUTS codes here at all.

Usage:
  python3 ETL/terms/encode_registered_regions.py status
  python3 ETL/terms/encode_registered_regions.py run [--dry-run]
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import argparse
import json
import re
import sqlite3

CASES = ROOT / "data" / "raw" / "state_aid_cases" / "cases.json"
GATE_KEY = "registered_region"

# RegionNuts2021.CZ03 -> CZ03. Only this form is a real regional restriction;
# CountryDEU and NutsRegionDE mean "the whole country", which is not a filter.
NUTS = re.compile(r"^RegionNuts\d*\.([A-Z]{2}[A-Z0-9]+)$")


def regions_for(rec: dict) -> list[str]:
    raw = rec.get("caseRegions") or []
    if not isinstance(raw, list):
        raw = [raw]
    out = {m.group(1) for x in raw if (m := NUTS.match(str(x)))}
    return sorted(out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["status", "run"])
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    cases = json.loads(CASES.read_text()) if CASES.exists() else {}
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("""
        SELECT i.id, i.name, i.country, i.scheme_code, i.total_eur
        FROM funding_instruments i
        JOIN funding_instruments p ON p.id = i.parent_id
        WHERE p.source_family_bucket = 'state_aid_satr'
          AND i.scheme_code IS NOT NULL AND TRIM(i.scheme_code) <> ''
    """).fetchall()

    encoded = skipped = 0
    for r in rows:
        regions = regions_for(cases.get((r["scheme_code"] or "").strip()) or {})
        if not regions:
            skipped += 1
            continue
        encoded += 1
        if args.cmd != "run" or args.dry_run:
            continue
        shown = ", ".join(regions[:6]) + ("..." if len(regions) > 6 else "")
        conn.execute("""
            INSERT INTO eligibility_gates
              (instrument_id, gate_key, gate_family, requirement, value, value_spec,
               intake_field, gate_role, intake_field_resolved,
               verification_level, verify_note, updated_at)
            VALUES (?, ?, 'G1_nexus', ?, ?, ?, 'entityCountries', 'filter', 'region',
                    'register_derived', ?, CURRENT_TIMESTAMP)
            ON CONFLICT (instrument_id, gate_key) DO UPDATE SET
              requirement=excluded.requirement, value=excluded.value,
              value_spec=excluded.value_spec, gate_role=excluded.gate_role,
              intake_field=excluded.intake_field,
              intake_field_resolved=excluded.intake_field_resolved,
              verification_level=excluded.verification_level,
              verify_note=excluded.verify_note, updated_at=CURRENT_TIMESTAMP
        """, (
            r["id"], GATE_KEY,
            f"Registered with the European Commission as applying in {shown}. "
            f"A company established outside those regions is not eligible under "
            f"this scheme.",
            ",".join(regions),
            json.dumps({"op": "region_within", "field": "region", "allowed": regions}),
            f"caseRegions on {r['scheme_code']}: {len(regions)} NUTS region(s)",
        ))

    if args.cmd == "run" and not args.dry_run:
        conn.commit()
    print(f"SATR children with a notified scheme:        {len(rows)}")
    print(f"  registered NUTS regions encoded as a filter: {encoded}")
    print(f"  no sub-national restriction registered:      {skipped}")
    if args.dry_run:
        print("[dry-run] nothing written.")
    conn.close()


if __name__ == "__main__":
    main()
