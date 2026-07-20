"""Tier 0 (+ Tier 0.5): populate funding_instruments / funding_instrument_sources
/ eligibility_gates from data already in the corpus. Pure SQL aggregation,
zero API cost, fully deterministic — this alone gives 100% structural
coverage (every real fund, its country, capital type, scale, historical
usage) before any LLM research spend. See migration 011 and
project-mgmt/plans/ for the full rationale.

Usage: python3 ETL/events/load/populate_funding_instruments.py
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

import json
import sqlite3
from collections import Counter, defaultdict

from instrument_family import PARENT_MAP, SYNTHETIC_PARENTS, source_to_family  # noqa: E402
from ndb_taxonomy import NDB_LABELS, NDB_LABELS_SUPPLEMENTAL, classify_ndb_from_source  # noqa: E402

ALL_NDB_LABELS = {**NDB_LABELS, **NDB_LABELS_SUPPLEMENTAL}

# ── Capital-type inference cascade ──────────────────────────────────────────
# (1) known equity/loan/guarantee grant_amount_basis values, by keyword.
EQUITY_BASES = {
    "htgf_equity", "almi_invest_equity", "eic_fund_equity_unpublished",
    "tesi_equity", "cdp_vc_equity", "eit_kic_equity", "coparion_equity",
    "ndb_equity", "invest_nl_equity", "enterprise_ireland_equity",
    "eifo_round_marker", "bpifrance_fond",
}
LOAN_BASES = {"ndb_loan_commitment", "bdns_loan_aid_element", "cdti_loan"}
GUARANTEE_BASES = {"ndb_guarantee"}
DEBT_BASES = {"eib_debt_commitment"}

# (2) SATR's own aid_instrument codes (GBER-derived, government-assigned —
# more authoritative than the basis label when present).
SATR_INSTRUMENT_MAP = {
    "StateAidInstrumentG": "grant", "StateAidInstrumentDG": "grant",
    "Tilskudd": "grant", "StateAidInstrumentTaote": "grant",
    "Lan": "loan", "Lån": "loan",
    "StateAidInstrumentLradv": "loan", "StateAidInstrumentSL": "loan",
    "Garanti": "guarantee", "StateAidInstrumentPRC": "guarantee",
    "StateAidInstrumentPRVRISKFIN": "equity",
    "StateAidInstrumentOFEI": "equity",
}


def row_capital_type(basis: str | None, aid_instrument: str | None,
                      grant_eur: float | None, equity_eur: float | None,
                      debt_eur: float | None) -> str:
    if aid_instrument and aid_instrument in SATR_INSTRUMENT_MAP:
        return SATR_INSTRUMENT_MAP[aid_instrument]
    if basis in EQUITY_BASES:
        return "equity"
    if basis in LOAN_BASES or basis in DEBT_BASES:
        return "loan"
    if basis in GUARANTEE_BASES:
        return "guarantee"
    populated = [t for t, v in
                 (("grant", grant_eur), ("equity", equity_eur), ("loan", debt_eur))
                 if v and v > 0]
    if len(populated) == 1:
        return populated[0]
    if len(populated) > 1:
        return "blended"
    return "unknown"


def family_capital_type(counter: Counter) -> tuple[str, str]:
    """Majority vote across a family's per-row capital types. Returns
    (capital_type, basis note). 'blended' if no type clears 60% and more
    than one real type is present."""
    total = sum(counter.values())
    if total == 0:
        return "unknown", "no rows"
    real = {k: v for k, v in counter.items() if k != "unknown"}
    if not real:
        return "unknown", "all rows unknown"
    top_type, top_n = max(real.items(), key=lambda kv: kv[1])
    if top_n / total >= 0.6:
        return top_type, f"majority row vote ({top_n}/{total})"
    if len(real) > 1:
        return "blended", f"split vote {dict(real)}"
    return top_type, f"majority row vote ({top_n}/{total})"


def prettify(family: str) -> str:
    ndb_id = classify_ndb_from_source(family + "_")
    if ndb_id and ndb_id in ALL_NDB_LABELS:
        return ALL_NDB_LABELS[ndb_id]
    words = family.replace("_", " ").split()
    acronyms = {"eic", "eit", "eib", "ipcei", "satr", "ndb", "ndbs", "kdt",
                "chp", "ihi", "kic", "cl1", "cl2", "cl3", "cl4", "cl5", "cl6",
                "lsp", "ssp", "msp", "mfg", "plt", "ra", "da", "ju", "rfs",
                "cbe", "eie", "sme", "erc", "poc", "eu"}
    return " ".join(w.upper() if w in acronyms else w.capitalize() for w in words)


# A handful of top-level nodes that matter most for the UI get a curated,
# hand-written display name instead of the generic prettifier.
OVERRIDE_NAMES = {
    "eic": "EIC (all tracks)",
    "eic_pathfinder": "EIC Pathfinder",
    "eic_accelerator": "EIC Accelerator",
    "eic_transition": "EIC Transition",
    "eic_fund": "EIC Fund (equity)",
    "ipcei": "IPCEI (all waves)",
    "innovation_fund": "EU Innovation Fund (all lots)",
    "horizon_eu_pillar_ii": "Horizon Europe Pillar II (all clusters)",
    "horizon_eu_partnership": "Horizon Europe partnerships & Joint Undertakings",
    "chips_ju": "Chips Joint Undertaking",
    "edf": "European Defence Fund",
    "eit": "EIT (all KICs)",
    "eit_climate_kic": "EIT Climate-KIC",
    "eit_digital": "EIT Digital",
    "eit_food": "EIT Food",
    "eit_health": "EIT Health",
    "eit_innoenergy": "EIT InnoEnergy",
    "eit_manufacturing": "EIT Manufacturing",
    "eit_rawmaterials": "EIT RawMaterials",
    "eit_urban_mobility": "EIT Urban Mobility",
}

# ── Tier 0.5: heuristic gate seeding ────────────────────────────────────────
# GBER article -> (one-line requirement, gate_family, best-fit intake_field).
# This is settled, stable EU state-aid law structure (Reg. 651/2014), not an
# inference — safe to assert as inventory_inferred (free, no LLM call), but
# still not a cited primary-text quote, so it stays below llm_2pass.
GBER_ARTICLE_GATES = {
    "StateAidObjectiveGberArt21": (
        "Risk-finance aid (GBER Art. 21) — targets equity/quasi-equity gaps for SMEs.",
        "G4_borrower_model", "ticketBand"),
    "StateAidObjectiveGberArt22": (
        "Start-up aid (GBER Art. 22) — company-age and unlisted-SME conditions apply.",
        "G2_size_ownership", "foundedYear"),
    "StateAidObjectiveGberArt25": (
        "R&D project aid (GBER Art. 25) — aid intensity capped by research category, own-funding share required.",
        "G3_financial", "cofinancingBand"),
    "StateAidObjectiveGberArt25b": (
        "R&D project aid, feasibility-study variant (GBER Art. 25b).",
        "G3_financial", "cofinancingBand"),
    "StateAidObjectiveGberArt25c": (
        "R&D project aid, SME-support variant (GBER Art. 25c).",
        "G3_financial", "cofinancingBand"),
    "StateAidObjectiveGberArt26": (
        "Investment aid for research infrastructures (GBER Art. 26).",
        "G5_use_of_funds", "none"),
    "StateAidObjectiveGberArt27": (
        "Aid for innovation clusters (GBER Art. 27) — cluster membership/participation implied.",
        "G6_conditionality", "consortium"),
    "StateAidObjectiveGberArt28": (
        "Innovation aid for SMEs (GBER Art. 28) — SME status required.",
        "G2_size_ownership", "fteBand"),
    "StateAidObjectiveGberArt29": (
        "Aid for process and organisational innovation (GBER Art. 29) — SME status or large-enterprise SME-collaboration required.",
        "G2_size_ownership", "fteBand"),
}


def seed_inventory_gates(conn: sqlite3.Connection, fam_aid_objective_votes: dict[str, Counter]) -> int:
    """Tier 0.5: seed eligibility_gates rows purely from GBER article codes
    already loaded per-event (aid_objective) — zero API cost. Only fires for
    a family whose dominant aid_objective maps to a known GBER article."""
    n = 0
    for fam, votes in fam_aid_objective_votes.items():
        if not votes:
            continue
        top_code, top_n = votes.most_common(1)[0]
        if top_code not in GBER_ARTICLE_GATES or top_n / sum(votes.values()) < 0.5:
            continue
        requirement, gate_family, intake_field = GBER_ARTICLE_GATES[top_code]
        conn.execute("""
            INSERT INTO eligibility_gates
              (instrument_id, gate_key, gate_family, requirement, value,
               intake_field, verification_level, verify_note, updated_at)
            VALUES (?, 'gber_article_inferred', ?, ?, ?, ?, 'inventory_inferred', ?, CURRENT_TIMESTAMP)
            ON CONFLICT (instrument_id, gate_key) DO UPDATE SET
              gate_family=excluded.gate_family, requirement=excluded.requirement,
              value=excluded.value, intake_field=excluded.intake_field,
              verify_note=excluded.verify_note, updated_at=CURRENT_TIMESTAMP
        """, (fam, gate_family, requirement, top_code, intake_field,
              f"{top_n}/{sum(votes.values())} events carry this aid_objective code"))
        n += 1
    return n


# The 8 existing framework YAML records — seeded as is_framework=1 rows with
# no events of their own. sync_gates_from_yaml.py attaches their gates.
FRAMEWORK_INSTRUMENTS = [
    ("eu_sme_definition", "EU SME definition (GBER Annex I)"),
    ("eu_undertaking_in_difficulty", "Undertaking-in-difficulty exclusion (GBER)"),
    ("eu_de_minimis", "De minimis ceiling (Reg. 2023/2831)"),
    ("eu_de_minimis_ceiling", "De minimis ceiling (Reg. 2023/2831)"),
    ("eu_ipcei", "IPCEI eligibility criteria (2021 Communication)"),
    ("eu_investeu_intermediary", "InvestEU financial-intermediary architecture"),
    ("eu_gber_rd_intensities", "GBER R&D aid intensities (Art. 25)"),
    ("de_kfw_erp_foerderkredit_kmu", "KfW ERP-Förderkredit KMU"),
]


def main() -> None:
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row

    rows = conn.execute("""
        SELECT e.source, e.company_id, c.country, c.parent_group,
               e.grant_amount_eur, e.equity_amount_eur, e.debt_amount_eur,
               e.grant_amount_basis, e.aid_instrument, e.aid_objective, e.ndb_distributor,
               e.granting_authority, e.project_title,
               e.project_started, e.call_deadline,
               v.source_family
        FROM public_funding_events e
        INNER JOIN v_european_companies c ON c.id = e.company_id
        INNER JOIN v_events v ON v.id = e.id
        WHERE COALESCE(e.is_duplicate, 0) = 0
    """).fetchall()
    print(f"aggregating {len(rows)} events...")

    fam_sources: dict[str, set[str]] = defaultdict(set)
    fam_companies: dict[str, set] = defaultdict(set)
    fam_events: Counter = Counter()
    fam_eur: dict[str, float] = defaultdict(float)
    fam_years: dict[str, list[int]] = defaultdict(list)
    fam_capital_votes: dict[str, Counter] = defaultdict(Counter)
    fam_ndb_votes: dict[str, Counter] = defaultdict(Counter)
    fam_country_votes: dict[str, Counter] = defaultdict(Counter)
    fam_authority_votes: dict[str, Counter] = defaultdict(Counter)
    fam_source_family_votes: dict[str, Counter] = defaultdict(Counter)
    fam_project_titles: dict[str, Counter] = defaultdict(Counter)
    fam_aid_objective_votes: dict[str, Counter] = defaultdict(Counter)

    for r in rows:
        fam = source_to_family(r["source"])
        fam_sources[fam].add(r["source"])
        fam_companies[fam].add(r["parent_group"] or r["company_id"])
        fam_events[fam] += 1
        fam_eur[fam] += (r["grant_amount_eur"] or 0) + (r["equity_amount_eur"] or 0) + (r["debt_amount_eur"] or 0)

        year = None
        for d in (r["project_started"], r["call_deadline"]):
            if d:
                year = int(str(d)[:4])
                break
        if year:
            fam_years[fam].append(year)

        ct = row_capital_type(r["grant_amount_basis"], r["aid_instrument"],
                               r["grant_amount_eur"], r["equity_amount_eur"], r["debt_amount_eur"])
        fam_capital_votes[fam][ct] += 1

        ndb = r["ndb_distributor"] or classify_ndb_from_source(r["source"])
        if ndb:
            fam_ndb_votes[fam][ndb] += 1
        if r["country"]:
            fam_country_votes[fam][r["country"]] += 1
        if r["granting_authority"]:
            fam_authority_votes[fam][r["granting_authority"][:200]] += 1
        fam_source_family_votes[fam][r["source_family"]] += 1
        if r["source_family"] == "state_aid_satr" and r["project_title"]:
            fam_project_titles[fam][r["project_title"]] += 1
        if r["aid_objective"]:
            fam_aid_objective_votes[fam][r["aid_objective"]] += 1

    families = set(fam_events)
    all_ids = families | SYNTHETIC_PARENTS | {fid for fid, _ in FRAMEWORK_INSTRUMENTS}
    print(f"{len(families)} real families, {len(all_ids)} total rows incl. synthetic parents + frameworks")

    def top(counter: Counter):
        return counter.most_common(1)[0][0] if counter else None

    now = []
    for fam in sorted(all_ids):
        is_framework = 0
        parent_id = PARENT_MAP.get(fam)
        events = fam_events.get(fam, 0)
        companies = len(fam_companies.get(fam, ()))
        total_eur = round(fam_eur.get(fam, 0.0), 2)
        years = fam_years.get(fam, [])
        first_year, last_year = (min(years), max(years)) if years else (None, None)

        if fam in dict(FRAMEWORK_INSTRUMENTS):
            is_framework = 1
            name = dict(FRAMEWORK_INSTRUMENTS)[fam]
            capital_type, capital_basis = "framework", "framework record (no events)"
            country = "EU"
            ndb_id = None
            source_family_bucket = None
            sample_titles = None
        else:
            name = OVERRIDE_NAMES.get(fam) or prettify(fam)
            name_source = "curated" if fam in OVERRIDE_NAMES else "deterministic"
            if events == 0:
                capital_type, capital_basis = "unknown", "synthetic rollup, no direct events"
            else:
                capital_type, capital_basis = family_capital_type(fam_capital_votes[fam])
            countries = fam_country_votes.get(fam, Counter())
            country_total = sum(countries.values())
            if country_total == 0:
                country = None
            else:
                top_country, top_n = countries.most_common(1)[0]
                # >=90% single-country share: treat stray foreign-registered
                # subsidiaries as noise, not evidence of a pan-EU instrument
                # (e.g. satr_de_rnd is 99.93% DE beneficiaries; a handful of
                # foreign parents' DE subsidiaries shouldn't relabel it 'EU').
                country = top_country if top_n / country_total >= 0.9 else "EU"
            ndb_id = top(fam_ndb_votes.get(fam, Counter()))
            source_family_bucket = top(fam_source_family_votes.get(fam, Counter()))
            titles = fam_project_titles.get(fam)
            sample_titles = json.dumps([t for t, _ in titles.most_common(5)]) if titles else None

        administering_body = top(fam_authority_votes.get(fam, Counter())) if fam not in dict(FRAMEWORK_INSTRUMENTS) else None

        now.append(dict(
            id=fam, parent_id=parent_id, name=name,
            name_source="curated" if (fam in OVERRIDE_NAMES or is_framework) else "deterministic",
            country=country, administering_body=administering_body, ndb_id=ndb_id,
            source_family_bucket=source_family_bucket, capital_type=capital_type,
            capital_type_basis=capital_basis, event_count=events, company_count=companies,
            total_eur=total_eur, first_year=first_year, last_year=last_year,
            is_framework=is_framework, sample_project_titles=sample_titles,
        ))

    conn.execute("DELETE FROM funding_instrument_sources")
    conn.execute("DELETE FROM eligibility_gates WHERE instrument_id NOT IN (SELECT id FROM funding_instruments WHERE is_framework = 1)")
    conn.execute("DELETE FROM funding_instruments")

    for r in now:
        conn.execute("""
            INSERT INTO funding_instruments
              (id, parent_id, name, name_source, country, administering_body, ndb_id,
               source_family_bucket, capital_type, capital_type_basis, event_count,
               company_count, total_eur, first_year, last_year, is_framework,
               sample_project_titles, updated_at)
            VALUES (:id,:parent_id,:name,:name_source,:country,:administering_body,:ndb_id,
                    :source_family_bucket,:capital_type,:capital_type_basis,:event_count,
                    :company_count,:total_eur,:first_year,:last_year,:is_framework,
                    :sample_project_titles, CURRENT_TIMESTAMP)
        """, r)

    for fam, srcs in fam_sources.items():
        for src in srcs:
            conn.execute(
                "INSERT OR IGNORE INTO funding_instrument_sources (instrument_id, source) VALUES (?, ?)",
                (fam, src),
            )

    n_gates = seed_inventory_gates(conn, fam_aid_objective_votes)
    conn.commit()
    print(f"funding_instruments: {len(now)} rows")
    print(f"funding_instrument_sources: {sum(len(s) for s in fam_sources.values())} rows")
    print(f"eligibility_gates (Tier 0.5, inventory_inferred): {n_gates} rows")
    conn.close()


if __name__ == "__main__":
    main()
