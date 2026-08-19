"""Emit the wsIG correction set: every stored comparator no answer shape can satisfy.

FREE. One read-only Postgres query. Writes a jsonl proposal; applies nothing.

Each row records WHICH of the four independent tests the gate fails. The tests
are applied in order and a gate is quarantined on the FIRST one it fails, but
`also_fails` records the rest -- because the whole finding is that the mechanical
fault never stands alone, and a row that fails only the arithmetic test would be
the one worth translating.
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
from etl_env import ROOT  # noqa: E402
import psycopg2  # noqa: E402


def dsn() -> str:
    d = os.environ.get("DATABASE_URL")
    if not d:
        for line in (ROOT / ".env.local").read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                d = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not d:
        raise SystemExit("DATABASE_URL not set (expected in the repo-root .env.local)")
    return d

OUT = Path(__file__).resolve().parents[2] / "project-mgmt" / "evidence" / \
    "wsig_inert_comparator_corrections_2026-08-19.jsonl"

# Lower edge of each ordered scale, in the field's own natural unit.
EDGES = {
    "turnoverBand": [0, 2e6, 1e7, 5e7],
    "balanceBand": [0, 2e6, 4.3e7],
    "ticketBand": [0, 25e3, 100e3, 500e3, 2.5e6, 15e6, 50e6],
    "cofinancingBand": [0, 25, 50],
    "fteBand": [1, 10, 50, 250],
}
ORDER = {
    "turnoverBand": ["<2M", "2-10M", "10-50M", ">50M"],
    "balanceBand": ["<2M", "2-43M", ">43M"],
    "ticketBand": ["lt25k", "b25k_100k", "b100k_500k", "b500k_2m5", "b2m5_15m", "b15m_50m", "gt50m"],
    "cofinancingBand": ["<25%", "25-50%", ">50%"],
    "fteBand": ["1-9", "10-49", "50-249", "250+"],
}

CLAUSES = {
    "field_has_no_ordered_scale":
        "the operator asks for arithmetic on a field whose answers are an unordered "
        "enum or a multi-select list. There is no scale to translate onto.",
    "threshold_below_the_scale_s_first_edge":
        "the band containing the threshold is the LOWEST band, so the only sound "
        "translation admits every founder. The intake's granularity cannot carry the rule.",
    "bound_quantity_is_not_the_field_s_quantity":
        "the quantity the funder's sentence bounds is not the quantity the intake "
        "field holds, so a translated comparator would judge founders on a number "
        "they were never asked for.",
    "rule_already_carried_by_a_working_sibling":
        "another gate on the same instrument already encodes this rule on this field "
        "with an operator that evaluates. Translating would put two comparators on one "
        "field, which is the defect check_gate_branches.py fails the build on.",
}

# Why each survivor of the two mechanical tests is still not translatable. The
# quote is the gate's own; `says` is what reading it establishes.
SUBJECT = {
    ("eis_ettev_tete_digip_rde_toe", "g2_vta_ceiling"): (
        "bound_quantity_is_not_the_field_s_quantity",
        "a EUR ceiling on cumulative de minimis aid, read onto a PERCENTAGE scale. "
        "300000 as a co-financing share is not a quantity that exists.", None),
    ("ihi", "G3-03"): (
        "bound_quantity_is_not_the_field_s_quantity",
        "45% of the action's eligible costs supplied by the CONSORTIUM's private "
        "members and contributing partners collectively. cofinancingBand holds what "
        "this one applicant can put in.", None),
    ("nfr_eurostars", "g3-min-cost-share-partners"): (
        "bound_quantity_is_not_the_field_s_quantity",
        "50% of project costs covered by the partners as a group, stated as a cap on "
        "SUBCONTRACTING. Not one applicant's own contribution.",
        "rule_already_carried_by_a_working_sibling"),
    ("nfr_eurostars", "g3_min_partner_cost_share"): (
        "bound_quantity_is_not_the_field_s_quantity",
        "the same sentence extracted twice; see g3-min-cost-share-partners.",
        "rule_already_carried_by_a_working_sibling"),
    ("satr_lv_equity", "g3-cofinancing-growth"): (
        "bound_quantity_is_not_the_field_s_quantity",
        "co-financing by the FUND's private participants AT FUND LEVEL, set in a "
        "public procurement. The applicant company is not a party to it.", None),
    ("satr_lv_equity", "g3-cofinancing-startup"): (
        "bound_quantity_is_not_the_field_s_quantity",
        "co-financing at fund level by the fund's private participants; see "
        "g3-cofinancing-growth.", None),
    ("eit_health_catapult", "scheme_text_5"): (
        "rule_already_carried_by_a_working_sibling",
        "g5 already holds `ticketBand band_min b500k_2m5` for the same sentence and "
        "it evaluates. This is the scheme-text pass re-extracting a rule the gate "
        "extractor had already encoded.", None),
    ("fr_relance_industrie", "g8"): (
        "bound_quantity_is_not_the_field_s_quantity",
        "a minimum EXPENDITURE BASE for the project. ticketBand holds the grant "
        "sought, and the two are separated by an aid intensity this product does not "
        "resolve -- the finding wsIC settled on innovate_uk.", None),
    ("innovation_fund_hbank", "G3-financial-capacity-threshold"): (
        "bound_quantity_is_not_the_field_s_quantity",
        "an EXEMPTION from a financial-capacity check for small requests, not a "
        "ceiling on what may be requested. Translated it reads `ticketBand band_max "
        "b25k_100k` and deletes a fund whose tickets run to tens of millions from "
        "every founder who asks it for more than 100k.",
        "rule_already_carried_by_a_working_sibling"),
    ("eis_tugiteenus_ja_arenduskes", "scheme_text_1"): (
        "bound_quantity_is_not_the_field_s_quantity",
        "the GROUP's consolidated turnover, for a measure open only to companies "
        "operating in at least two countries and belonging to such a group. The "
        "intake asks 'What is your annual turnover?' about the applicant itself, so a "
        "small subsidiary of a large multinational -- exactly who this measure is for "
        "-- would be excluded by the translation.", None),
}


def band_of(field, v):
    e = EDGES[field]
    i = 0
    for k, edge in enumerate(e):
        if v >= edge:
            i = k
    return i


def main():
    conn = psycopg2.connect(dsn())
    cur = conn.cursor()
    cur.execute(
        "SELECT id, instrument_id, gate_key, requirement, quote, value_spec, "
        "       source_file, source_locator, verification_level, encoding_method "
        "FROM eligibility_gates "
        "WHERE nullif(value_spec,'')::jsonb->>'op' IN ('numeric_gte','numeric_lte') "
        "ORDER BY instrument_id, gate_key")
    rows = cur.fetchall()
    # Rows wsIE's unapplied write already quarantines: not ours to write twice.
    wsie = set()
    p = OUT.parent / "wsie_currency_band_corrections_2026-08-19.jsonl"
    for line in p.read_text().splitlines():
        if line.strip():
            c = json.loads(line)
            wsie.add((c["instrument_id"], c["gate_key"]))

    # Working (non-numeric, evaluable) comparators per instrument+field.
    sib = {}
    c2 = conn.cursor()
    c2.execute(
            "SELECT instrument_id, nullif(value_spec,'')::jsonb->>'field', gate_key, "
            "       nullif(value_spec,'')::jsonb->>'op' FROM eligibility_gates "
            "WHERE value_spec IS NOT NULL AND value_spec <> '' "
            "  AND (gate_role IS NULL OR gate_role='filter') "
            "  AND nullif(value_spec,'')::jsonb->>'op' NOT IN ('numeric_gte','numeric_lte')")
    for i, f, k, op in c2.fetchall():
        sib.setdefault((i, f), []).append(f"{k}:{op}")

    out, skipped, counts = [], [], {}
    for (gid, inst, key, req, quote, vs, sf, sl, vl, em) in rows:
        spec = json.loads(vs)
        field = spec["field"]
        if (inst, key) in wsie:
            skipped.append(f"{inst} [{key}] — already quarantined by wsIE's write")
            continue
        also = None
        if field not in EDGES:
            clause = "field_has_no_ordered_scale"
            says = (f"`{field}` is answered with "
                    + ("a list of named flags" if field in ("exclusionFlags", "useOfFunds")
                       else "one of yes/no/unsure")
                    + ", which no threshold orders.")
        elif band_of(field, spec["threshold"]) == 0:
            clause = "threshold_below_the_scale_s_first_edge"
            says = (f"{spec['threshold']:g} falls in `{ORDER[field][0]}`, the lowest band "
                    f"on {field}. Any sound translation is `band_min {ORDER[field][0]}`, "
                    f"which is true for every founder.")
        else:
            clause, says, also = SUBJECT[(inst, key)]
        counts[clause] = counts.get(clause, 0) + 1
        out.append({
            "instrument_id": inst, "gate_key": key, "gate_id": gid,
            "action": "quarantine",
            "clause": clause, "clause_says": CLAUSES[clause],
            "also_fails": also,
            "current_value_spec": spec, "proposed_value_spec": None,
            "funder": {"quote": (quote or "")[:400], "says": says,
                       "source_file": sf, "source_locator": sl},
            "sibling_comparators_on_this_field": sib.get((inst, field), []),
            "requirement": (req or "")[:300],
            "verification_level": vl, "encoding_method": em,
        })
    OUT.write_text("".join(json.dumps(o, ensure_ascii=False, sort_keys=True) + "\n" for o in out))
    print(f"wrote {len(out)} corrections -> {OUT.relative_to(OUT.parents[2])}")
    for c, n in sorted(counts.items(), key=lambda x: -x[1]):
        print(f"   {n:3}  {c}")
    print(f"   ---\n   {len(skipped)} left to wsIE:")
    for s in skipped:
        print(f"        {s}")
    print(f"   {len(out)+len(skipped)} numeric comparators accounted for")
    conn.close()


if __name__ == "__main__":
    main()
