"""Export funding_instruments + eligibility_gates from the DB into the JSON
the frontend eligibility evaluator reads. Replaces the old YAML-sourced
instrument_terms_export.py now that eligibility criteria live DB-natively
(migration 011) — data/instrument_terms/*.yaml is still the AUTHORING format
for Tier 2/human-reviewed gates (git-diffable review surface), synced into
the DB by ETL/terms/sync_gates_from_yaml.py; this script only ever reads
from the DB, never the YAML directly, so every tier (inventory_inferred,
llm_classified, llm_2pass, human_verified) exports uniformly.

Run after populate_funding_instruments.py + sync_gates_from_yaml.py (+, once
it exists, classify_gates_bulk.py).
"""
from __future__ import annotations

import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from web_env import DB, SITE_DATA  # noqa: E402

OUT = SITE_DATA / "instrument_terms.json"

# Only these tiers may ever render as an asserted met/not_met fact in the
# frontend (see eligibility.ts) — mirrors the pre-existing YAML convention
# where `verified in ("llm_2pass", True)` was the assertable set.
ASSERTABLE_LEVELS = {"llm_2pass", "human_verified"}


def main() -> None:
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row

    instruments = conn.execute("""
        SELECT id, parent_id, name, country, capital_type, is_framework,
               event_count, company_count, total_eur, source_family_bucket,
               sample_project_titles, administering_body, administering_body_share,
               last_year, scheme_code, scheme_end_date,
               scheme_end_date_basis, source_window_policy,
               route_status, route_status_source,
               successor_scheme,
               successor_title, application_url, description,
               sector_mix, scheme_operators,
               award_p25, award_p50, award_p75, award_n,
               intensity_p50, intensity_n, delivery_region, delivery_region_share
        FROM funding_instruments
        -- Deterministic, and byte-ordered to match the Postgres path: row
        -- selection breaks ties on array order.
        ORDER BY id
    """).fetchall()
    gates = conn.execute("""
        SELECT instrument_id, gate_key, gate_family, requirement, value,
               value_spec, intake_field, gate_role, intake_field_resolved,
               quote, source_file, source_locator, verification_level
        FROM eligibility_gates
        -- Deterministic, because the consumers take the FIRST N: a row's
        -- published criteria must not depend on storage order.
        ORDER BY instrument_id, gate_key
    """).fetchall()

    # Curated "how you apply", from each scheme's own document (see
    # sync_gates_from_yaml.py). Kept in its own table because
    # funding_instruments is rebuilt from scratch on every ETL run and this is
    # expensive, reviewed data.
    apply_by_instrument = {
        r["instrument_id"]: {
            "channel": r["channel"], "timeline": r["timeline"], "url": r["url"],
        }
        for r in conn.execute(
            "SELECT instrument_id, channel, timeline, url FROM instrument_application")
    }

    gates_by_instrument: dict[str, list[dict]] = {}
    for g in gates:
        gates_by_instrument.setdefault(g["instrument_id"], []).append({
            "id": g["gate_key"],
            "gateFamily": g["gate_family"],
            "requirement": g["requirement"],
            "value": g["value"] or "",
            "valueSpec": json.loads(g["value_spec"]) if g["value_spec"] else None,
            "intakeField": g["intake_field"] or "none",
            # Curated layer (ETL/terms/encode_gates.py). MUST ship in the JSON
            # fallback too: without it a Postgres outage would silently
            # evaluate gates against the extractor's field, which was measured
            # wrong on roughly half a sample, and with no role filtering — so
            # obligations and programme facts would be scored as if they were
            # eligibility tests.
            "gateRole": g["gate_role"],
            "intakeFieldResolved": g["intake_field_resolved"],
            "quote": g["quote"] or "",
            "source": {"file": g["source_file"] or "", "locator": g["source_locator"] or ""},
            "verificationLevel": g["verification_level"],
            "verified": g["verification_level"] in ASSERTABLE_LEVELS,
        })

    records = [{
        "id": inst["id"],
        "parentId": inst["parent_id"],
        "name": inst["name"],
        "country": inst["country"] or "EU",
        "capitalType": inst["capital_type"],
        "isFramework": bool(inst["is_framework"]),
        "eventCount": inst["event_count"],
        "companyCount": inst["company_count"],
        "totalEur": inst["total_eur"],
        "sourceFamilyBucket": inst["source_family_bucket"],
        "sampleProjectTitles": json.loads(inst["sample_project_titles"]) if inst["sample_project_titles"] else None,
        # Real per-fund granting authority (majority vote of the raw
        # granting_authority field across events), e.g. "Bundesamt für
        # Wirtschaft und Ausfuhrkontrolle" — see populate_funding_instruments.py.
        # None for buckets with no dominant authority on record.
        "administeringBody": inst["administering_body"],
        # Share of this instrument's awards actually made by that body. The
        # frontend only shows the name when the share is high enough to be
        # honest -- see displayInstitutionName and migration 014.
        "administeringBodyShare": inst["administering_body_share"],
        # The last year this instrument is recorded as having awarded anything.
        # 102 of 322 instruments have no award since 2022 or none at all, and
        # nothing used to stop them reaching a brief -- so a founder could be
        # told to "approach the ministry for the next wave" of a scheme that
        # closed years ago. Wrong with authority is worse than thin.
        "lastYear": inst["last_year"],
        # The notified aid scheme this instrument sits under, and where to
        # apply. A child of a state-aid rollup is a real granting body running
        # a real scheme; the code is what makes the row traceable to a primary
        # document, and the URL is the only thing on the row a founder can act
        # on directly.
        "schemeCode": inst["scheme_code"],
        # A declared end date, and WHICH register declared it. Without the
        # basis the two paths disagree about liveness: Postgres would see a
        # renewed SATR notification and the JSON snapshot would see an
        # unlabelled date, which the liveness test closes.
        "schemeEndDate": inst["scheme_end_date"],
        "schemeEndBasis": inst["scheme_end_date_basis"],
        # Does the register that publishes this row state an application window
        # for it? Carried for the same reason the basis is, and for a stronger
        # one: this is the ONLY field on the row that survives the copy going
        # stale intact, so it is the only thing that can tell "this fund has no
        # deadline" from "this copy has not loaded one yet". Dropping it here
        # would hand the fallback back the ambiguity the column exists to end.
        "sourceWindowPolicy": inst["source_window_policy"],
        # Whether an application route is known to exist -- a SEPARATE axis from
        # liveness. Carried here for the same reason the basis is: without it
        # the snapshot path would propose rows the Postgres path withholds, and
        # the eleven IPCEI approval decisions are exactly such rows.
        "routeStatus": inst["route_status"],
        # Only `none` withholds a row, and only `none` requires a source.
        # Carried so check_offer_route.ts can refuse an UNSOURCED
        # withholding: a row is not demoted to a non-fund by assertion,
        # which is the mistake this whole axis exists to correct.
        "routeStatusSource": inst["route_status_source"],
        "successorScheme": inst["successor_scheme"],
        "successorTitle": inst["successor_title"],
        # What kind of company this instrument has actually funded. Thematic
        # embeddings match on vocabulary and vocabulary travels between
        # domains; funding history does not.
        "sectorMix": json.loads(inst["sector_mix"]) if inst["sector_mix"] else None,
        # What this instrument typically AWARDS, as opposed to how big it is.
        # Carried with its n so nothing can quote a median without knowing how
        # many real awards stand behind it.
        "awardP25": inst["award_p25"],
        "awardP50": inst["award_p50"],
        "awardP75": inst["award_p75"],
        "awardN": inst["award_n"] or 0,
        # What share of a project this instrument actually covered, measured
        # over single-beneficiary awards only. The structuring question.
        "intensityP50": inst["intensity_p50"],
        "intensityN": inst["intensity_n"] or 0,
        # WHERE THE MONEY ACTUALLY LANDS -- the routing attribute for the 119
        # leaves that share a scheme name with a sibling. They are one notified
        # regime delivered by many bodies, and no amount of scheme text can tell
        # them apart because the text is genuinely the same; what separates them
        # is which region the delivering body pays into. Measured from the
        # register's own per-award beneficiary region, NULL for a body that
        # delivers nationally. A programme fact, never a filter: it says where
        # money has gone, not who is barred.
        "deliveryRegion": inst["delivery_region"],
        "deliveryRegionShare": inst["delivery_region_share"],
        # Who actually disburses under this scheme. A department notifies a
        # regime; regional agencies and promotional banks run it. Empty when
        # only departments ever awarded, which is itself worth knowing: the row
        # then has no front door we can name.
        "schemeOperators": json.loads(inst["scheme_operators"]) if inst["scheme_operators"] else None,
        "applicationUrl": inst["application_url"],
        # What the scheme says it FUNDS, in the granting body's own words, from
        # its own page (490 instruments). Carried here in the same commit that
        # adds it to corpus.ts's SELECT, and that is not tidiness: this file is
        # the Postgres-failure fallback for the whole memo path, so a field in
        # one store and not the other means a degraded request silently renders
        # a different row from a healthy one.
        #
        # No beneficiary, award or project title is in the enrichment at all --
        # see the DbInstrument comment in corpus.ts for the tested form of that
        # argument. Truncation is the READER's job (schemeText.ts), never the
        # exporter's: the full text is what a citation needs.
        "description": inst["description"],
        # ── Inherited gates ──────────────────────────────────────────────────
        # A child carries no gates of its own by design: the curated
        # eligibility layer is written against the parent regime's framework
        # document, and copying it down would fork an expensive, audited layer
        # into hundreds of duplicates that then drift apart.
        #
        # Inheriting at export time is what makes the split safe. Without it
        # every child evaluates as "no encoded rule", which reads as
        # unverified, ranks below everything assessed, and would have made a
        # more granular corpus produce visibly worse briefs.
        # Inherited the same way as gates, and for the same reason: a child is
        # a granting body operating under the parent's regime, so the regime's
        # application route is the child's route until a more specific one is
        # curated.
        "application": apply_by_instrument.get(inst["id"])
                       or apply_by_instrument.get(inst["parent_id"]),
        # ── Gates are NOT copied into children ───────────────────────────────
        # A child carries no gates of its own by design; it inherits the parent
        # regime's, and that inheritance is resolved at READ time (corpus.ts)
        # rather than by duplicating the array into every child.
        #
        # Copying looked harmless and was the largest single cost in the
        # payload: one country's 78 children duplicated roughly 2,300 gate
        # objects, and the same shape across 22 countries puts the per-request
        # payload several times over budget. The arrays are identical by
        # construction, so shipping them once costs nothing in fidelity.
        "gates": gates_by_instrument.get(inst["id"], []),
    } for inst in instruments]

    OUT.write_text(json.dumps(
        {"generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
         "records": records}, indent=1, ensure_ascii=False))

    n_gates = sum(len(r["gates"]) for r in records)
    n_verified = sum(1 for r in records for g in r["gates"] if g["verified"])
    n_with_gates = sum(1 for r in records if r["gates"])
    print(f"eligibility export -> {OUT}  ({len(records)} instruments, "
          f"{n_with_gates} with >=1 gate, {n_gates} gates, {n_verified} assertable)")


if __name__ == "__main__":
    main()
