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
from etl_env import ROOT, require_reference, WEB  # noqa: E402
from store import connect  # noqa: E402
# --- end ETL path bootstrap ---

import argparse
import json
import re

CASES = ROOT / "data" / "raw" / "state_aid_cases" / "cases.json"


def _cases_on_disk(path) -> None:
    """The register comes from grounding (pinned sha256) when it is not on disk:
    the cron's filesystem starts empty. See ETL/lib/grounded_inputs.py."""
    if not path.exists():
        from grounded_inputs import materialise  # noqa: PLC0415
        materialise("state_aid_cases")
GATE_KEY = "registered_region"

# The register writes a region in TWO syntaxes, and reading only one was a real
# defect: `RegionNuts2021.PT111` and `NutsRegionPT117` both name a sub-national
# region, while `NutsRegionDE` and `CountryDEU` name a whole country. The first
# version matched only the dotted form, so `NutsRegionPT117` read as "all of
# Portugal" and was discarded.
#
# SA.41942 lists 31 region tags, 28 of them bare. Keeping 3 of 31 turned four
# Portuguese R&D programmes into filters excluding 85-100% of their OWN
# recipients -- Centro 2030 admitted none of its 153 awards. An over-narrow
# region filter is the worst failure this file can produce: a blocked fund
# vanishes from the brief with nothing shown to the founder.
#
# So the discriminator is not which prefix was used, it is what follows the
# country code: two characters is a country, more is a region.
REGION_TAG = re.compile(r"^(?:RegionNuts\d*\.|NutsRegion)([A-Z]{2}[A-Z0-9]+)$")

# The EMITTED artifact, not the source JSON it is built from. emit_regions.py
# filters on its way out -- the United Kingdom is in nuts_regions.json but has no
# NUTS 2024 successor, so it never reaches the intake -- and reading the source
# instead left a UK scheme demanding UKC..UKK that no founder can ever select.
# The authority for "can a founder answer this" is what the founder is shown.
REGIONS_TS = (WEB / "lib" / "intelligence"
              / "regions.generated.ts")


def offered_codes() -> set[str]:
    """Every NUTS code the intake can actually express -- the authority here.

    Not "is this a valid NUTS code somewhere". The register tags a vintage and
    the intake offers NUTS 2024, so a code from an older vintage is not a
    stricter rule, it is an unsatisfiable one. Measured: four gates demanded
    codes no founder can select, including the Province of Zuid-Holland's own
    scheme demanding NL33 when Zuid-Holland is NL36 in 2024 -- its own
    applicants were structurally rejected.
    """
    return set(re.findall(r'id:\s*"([A-Z]{2}[A-Z0-9]*)"', REGIONS_TS.read_text()))


def usable(codes: list[str], offered: set[str]) -> list[str]:
    """Each registered code, expressed in something a founder can actually pick.

    A code the intake still offers is kept as it is. A retired one is
    GENERALISED to its nearest current ancestor -- PT117 to PT11, NL33 to NL3 --
    and a code with no current ancestor at all is dropped.

    Generalising is safe in a way translating is not. Saying "somewhere in
    Norte" about a scheme registered for a district of Norte is true, and it can
    only make the gate more permissive; mapping PT17 onto a specific successor
    would be a guess, because it became both PT1A and PT1B. Widening never hides
    a fund from someone entitled to it, which is the failure that matters here.

    Both defects this replaces were live: NL33 was kept because its parent NL3
    exists, yet a Zuid-Holland founder answers NL36 and was rejected by the
    Province of Zuid-Holland's own scheme; and the United Kingdom has no NUTS
    2024 successor at all, so a UK scheme demanded UKC..UKK that nobody is ever
    shown.
    """
    out: list[str] = []
    for c in codes:
        if c in offered:
            out.append(c)
            continue
        # Longest offered prefix: the smallest current region containing it.
        anc = max((o for o in offered if c.startswith(o)), key=len, default=None)
        if anc:
            out.append(anc)
    return sorted(set(out))


def regions_for(rec: dict) -> list[str]:
    raw = rec.get("caseRegions") or []
    if not isinstance(raw, list):
        raw = [raw]
    out = set()
    for x in raw:
        m = REGION_TAG.match(str(x).strip())
        if m and len(m.group(1)) > 2:
            out.add(m.group(1))
    return sorted(out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["status", "run"])
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    # NOT `if CASES.exists() else {}`. This pass DELETES a region filter
    # whenever the register does not name a sub-national restriction, so an
    # absent register reads as "no scheme restricts anything" and wipes the
    # layer. It did, on 2026-08-09: 141 correct filters, exit code 0.
    _cases_on_disk(CASES)
    require_reference(
        CASES, "This pass removes a scheme's region filter when the register "
               "does not restrict it, so an empty register deletes every filter.")
    cases = json.loads(CASES.read_text())
    offered = offered_codes()
    with connect(rows=True) as conn:
        _run(conn, args, cases, offered)


def _run(conn, args, cases, offered) -> None:
    rows = conn.execute("""
        SELECT i.id, i.name, i.country, i.scheme_code, i.total_eur
        FROM funding_instruments i
        JOIN funding_instruments p ON p.id = i.parent_id
        WHERE p.source_family_bucket = 'state_aid_satr'
          AND i.scheme_code IS NOT NULL AND TRIM(i.scheme_code) <> ''
        ORDER BY i.id
    """).fetchall()

    encoded = skipped = 0
    for r in rows:
        regions = usable(
            regions_for(cases.get((r["scheme_code"] or "").strip()) or {}), offered)
        if not regions:
            skipped += 1
            # DELETE, not skip. eligibility_gates survives the instrument
            # reload, so a gate this script wrote on an earlier run stays in the
            # corpus after the rule that produced it stops holding. That left a
            # UK scheme demanding UKC..UKK -- codes with no NUTS 2024 successor,
            # so no founder can ever be shown as eligible -- long after the
            # vintage check started rejecting them. A rule that no longer holds
            # has to be removed, not merely not rewritten.
            if args.cmd == "run" and not args.dry_run:
                conn.execute(
                    "DELETE FROM eligibility_gates WHERE instrument_id=%s AND gate_key=%s",
                    (r["id"], GATE_KEY))
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
            VALUES (%s, %s, 'G1_nexus', %s, %s, %s, 'entityCountries', 'filter', 'region',
                    'register_derived', %s, CURRENT_TIMESTAMP)
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

    if args.cmd != "run" or args.dry_run:
        conn.rollback()
    print(f"SATR children with a notified scheme:        {len(rows)}")
    print(f"  registered NUTS regions encoded as a filter: {encoded}")
    print(f"  no sub-national restriction registered:      {skipped}")
    if args.dry_run:
        print("[dry-run] nothing written.")


if __name__ == "__main__":
    main()
