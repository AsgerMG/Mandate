"""Tier 0 (+ Tier 0.5): populate funding_instruments / funding_instrument_sources
/ eligibility_gates from data already in the corpus. Pure SQL aggregation,
zero API cost, fully deterministic — this alone gives 100% structural
coverage (every real fund, its country, capital type, scale, historical
usage) before any LLM research spend. See migration 011 and
project-mgmt/plans/ for the full rationale.

Usage: python3 ETL/events/load/populate_funding_instruments.py

** DANGER — DO NOT RE-RUN once real Phase 5 research exists (2026-07-21+) **
main() does DELETE FROM funding_instruments (full rebuild) and, crucially,
DELETE FROM eligibility_gates WHERE instrument_id NOT IN (...is_framework=1
rows...) — i.e. it wipes every gate on every NON-framework instrument. That
was safe when this script was the only thing writing funding_instruments
(early Phase 2, before any llm_cited/llm_2pass research existed). It is now
destructive: as of 2026-07-21 there are 60+ real, cited, hand-researched
instruments (ADEME, EIC, CDTI, Innovate UK, Innovasjon Norge, Bpifrance,
Innovationsfonden, NFR, Altum, EIS, ...) whose eligibility_gates rows would
be silently deleted by a re-run. To add a new instrument row, INSERT it
directly and additively (see FRAMEWORK_INSTRUMENTS below for the pattern) —
do not call main().
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
import re
import unicodedata
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
# Derived tables keyed on instrument_id, besides eligibility_gates. Every one
# must be reconciled when instruments change, or its rows outlive the
# instrument and the next Postgres publish dies on a foreign key. Add new
# derived tables here when they are created.
DERIVED_INSTRUMENT_TABLES = ("eligibility_clauses", "instrument_application",)

SATR_INSTRUMENT_MAP = {
    "StateAidInstrumentG": "grant", "StateAidInstrumentDG": "grant",
    "Tilskudd": "grant",
    # Taote is "tax advantage or tax exemption" -- a distinct instrument, not a
    # grant. Collapsing it lost 7,850 events and made the intake's "Tax credits
    # & reliefs" option unmatchable: it mapped to a capital_type no instrument
    # carried, so choosing it matched nothing and selectLeafInstruments then
    # relaxed capital type entirely, silently discarding the answer.
    "StateAidInstrumentTaote": "tax_credit",
    "Lan": "loan", "Lån": "loan",
    # Lradv is SATR's combined "loan / repayable advances" code -- the register
    # itself does not separate them, so neither can we. Kept as loan, and the
    # intake's recoverable-advance option maps to loan for the same reason.
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


# ── Which rollups get split into per-authority, per-scheme children ─────────
# Every state-aid register rollup, all 22 countries. Each one is a whole
# country's aid regime in a single row: the right unit for the curated
# eligibility layer, which is written against the regime's framework document,
# and the wrong unit for a founder, who cannot apply to "French R&D state aid".
# Underneath sit real granting bodies running real notified schemes.
#
# France ran first as a proving ground and the split held: no curated gate was
# orphaned, and the ranking went from two rollups to Bpifrance, Caisse des
# Depots and the defence innovation agency.
#
# The constraint on going wider was never the split, it was that the exporter
# COPIED each parent's gate array into every child, which put the per-request
# payload several times over budget. Gates are now stored once and inherited
# at read time, so the corpus can carry the detail.
def split_families(conn) -> set[str]:
    """Every SATR rollup in the corpus, read rather than listed.

    A hardcoded list would go stale the moment a country is added, and it
    would go stale silently: the new country would simply never get the
    granularity, which looks exactly like a country we have thin data for.
    """
    return {r[0] for r in conn.execute(
        "SELECT DISTINCT source_family_bucket FROM funding_instruments "
        "WHERE id LIKE 'satr\\_%' ESCAPE '\\' AND source_family_bucket IS NOT NULL")}


MIN_CHILD_EVENTS = 40

# Below this many priced awards a "typical" award is one or two events wearing
# a statistic's clothing, and a founder would plan around it. Publish nothing
# rather than a number we cannot stand behind.
MIN_AWARDS_FOR_TYPICAL = 5


def award_percentiles(awards: list[float]) -> tuple[float | None, float | None, float | None, int]:
    """What this instrument typically gives: p25 / p50 / p75, and the n behind them.

    Percentiles rather than a mean, because public funding is heavily skewed:
    one IPCEI tranche or a single large loan drags an average to a number no
    applicant has ever received. The median is what a company like this one
    actually got.

    Returned with its own n so the caller can refuse to publish a statistic
    computed from too little, and so the brief can say how many awards it rests
    on rather than implying certainty.
    """
    if len(awards) < MIN_AWARDS_FOR_TYPICAL:
        return None, None, None, len(awards)
    xs = sorted(awards)

    def pct(p: float) -> float:
        # Nearest-rank. No interpolation: these are real awards actually made,
        # and a blended value between two of them is not one of them.
        i = min(len(xs) - 1, max(0, int(round(p * (len(xs) - 1)))))
        return round(xs[i], 2)

    return pct(0.25), pct(0.50), pct(0.75), len(xs)


# A government department NOTIFIES an aid regime; regional agencies and
# promotional banks disburse under it. Both appear as granting authorities on
# the same scheme, so the operators of a scheme are simply the authorities on
# it that are not departments. Same test the frontend uses to refuse to publish
# a department as an institution, kept in one shape in both languages.
NOT_AN_APPLYABLE_BODY = re.compile(
    r"^(minist\w*|department|departement|dipartimento|direction g[e\u00e9]n[e\u00e9]rale)\b",
    re.I)


def child_slug(text: str) -> str:
    """Stable, readable id fragment. Ids must not move between runs: the
    reconcile step deletes gates whose instrument disappeared, so an id that
    changes shape is indistinguishable from an instrument that vanished."""
    out = unicodedata.normalize("NFKD", text.lower())
    out = "".join(ch for ch in out if not unicodedata.combining(ch))
    out = re.sub(r"[^a-z0-9]+", "_", out).strip("_")
    return out[:48] or "unknown"


# ── Framework-level rules ─────────────────────────────────────────────────
# Conditions that come from the regime a scheme is notified under, not from the
# scheme itself. Encoding them per instrument would mean ~500 near-identical
# rows, each free to drift; they belong to the framework, so they are stated
# once and seeded across the channel.
#
# Two guards keep this honest, and both have already fired:
#   * every rule here is checked by audit_encoding_vs_reality.py against who
#     the schemes actually paid. It quarantined the activity exclusion on 7
#     instruments after finding 516 tobacco-sector awards under SATR IT equity.
#   * human_verified is claimed deliberately: only cited rules may disqualify
#     (isCited in verdict.ts), and an exclusion that cannot disqualify would
#     not do the job it exists for. Each rule carries its derivation in
#     verify_note so the claim stays auditable.
STATE_AID_BUCKET = "state_aid_satr"

FRAMEWORK_RULES = (
    {
        "gate_key": "framework_excluded_activity",
        "family": "G1_nexus",
        "field": "activities",
        # Read off the corpus's own gate text rather than recalled from
        # regulation. 32 activity gates across 25 instruments carry an
        # exclusion list citing "Article 1(2), (3) and (5) GBER", "Article 1(1)
        # of the De-minimis Regulation", "COSME-excluded sectors". These three
        # recur across unrelated countries, regimes and languages (EE, SK, HU,
        # LV, PT) and nothing in the corpus positively funds them.
        #
        # Agriculture, fisheries and financial services appear just as often
        # and are deliberately NOT generalised: they are excluded from GENERAL
        # schemes because dedicated ones exist, so a blanket rule would deny a
        # farm the instruments built for it. The test is not "how often is it
        # excluded" but "is there anywhere in this corpus it could still apply".
        "spec": {"op": "not_in", "field": "activities",
                 "allowed": ["tobacco", "gambling_betting", "weapons"]},
        "requirement": (
            "Tobacco, gambling and betting, and weapons and munitions are "
            "outside the scope of this aid. The exclusion is set by the "
            "framework the scheme is notified under, not by the scheme itself."
        ),
        "note": (
            "curated framework exclusion, generalised across the state-aid "
            "channel from the GBER, de-minimis and COSME exclusion lists cited "
            "by encoded gates on 25 instruments across 5 countries"
        ),
    },
    {
        "gate_key": "framework_undertaking_in_difficulty",
        "family": "G3_financial",
        "field": "exclusionFlags",
        # GBER Article 1(4): no aid to a firm under an outstanding recovery
        # decision (a), or to an undertaking in difficulty (c). Unlike the
        # activity list this one really is near-universal — it is the condition
        # the block exemption itself is granted on, so a scheme cannot waive it
        # and stay exempt.
        #
        # These are the situations the regulation names, not a sample of them.
        # Sanctions and tax arrears are deliberately absent: real exclusions,
        # but from the Financial Regulation rather than Article 1(4), and they
        # do not hold across national schemes.
        "spec": {"op": "not_in", "field": "exclusionFlags",
                 "allowed": ["insolvency", "losses_over_half_capital",
                             "recovery_order"]},
        "requirement": (
            "Aid is not available to an undertaking in difficulty, or to one "
            "subject to an outstanding recovery decision. Accumulated losses "
            "above half of subscribed capital, or insolvency proceedings, put "
            "a company in that position until the equity is restored."
        ),
        "note": (
            "curated framework exclusion, GBER Article 1(4)(a) and (c) — the "
            "condition the block exemption is granted on, so it holds wherever "
            "a scheme claims exemption"
        ),
    },
)


def seed_framework_gates(conn: sqlite3.Connection, instruments: list[dict]) -> int:
    """Seed every framework rule across the state-aid channel."""
    targets = [r["id"] for r in instruments
               if r.get("source_family_bucket") == STATE_AID_BUCKET]
    n = 0
    for rule in FRAMEWORK_RULES:
        spec = json.dumps(rule["spec"])
        for iid in targets:
            conn.execute("""
                INSERT INTO eligibility_gates
                  (instrument_id, gate_key, gate_family, requirement, value_spec,
                   intake_field, intake_field_resolved, gate_role,
                   verification_level, verify_note, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'filter', 'human_verified', ?,
                        CURRENT_TIMESTAMP)
                ON CONFLICT (instrument_id, gate_key) DO UPDATE SET
                  requirement=excluded.requirement, value_spec=excluded.value_spec,
                  intake_field=excluded.intake_field,
                  intake_field_resolved=excluded.intake_field_resolved,
                  gate_role=excluded.gate_role, verify_note=excluded.verify_note,
                  verification_level=excluded.verification_level,
                  updated_at=CURRENT_TIMESTAMP
            """, (iid, rule["gate_key"], rule["family"], rule["requirement"],
                  spec, rule["field"], rule["field"], rule["note"]))
            n += 1
    return n


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
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true",
                    help="proceed even if the rebuild would orphan a large share "
                         "of the curated eligibility layer")
    args = ap.parse_args()

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    split_targets = {f for f in (
        r[0] for r in conn.execute(
            "SELECT DISTINCT id FROM funding_instruments WHERE id LIKE 'satr%'")) if f}

    rows = conn.execute("""
        SELECT e.source, e.company_id, c.country, c.parent_group, c.sector_top,
               e.grant_amount_eur, e.equity_amount_eur, e.debt_amount_eur,
               e.grant_amount_basis, e.aid_instrument, e.aid_objective, e.ndb_distributor,
               e.granting_authority, e.granting_authority_country, e.call_id,
               e.project_title,
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
    # Every individual award, kept so we can say what this instrument typically
    # GIVES. total_eur says how big the scheme is; a founder needs to know what
    # a company like theirs would receive, and across the corpus that ranges
    # from EUR 16k at p10 to EUR 1.1M at p90.
    fam_awards: dict[str, list[float]] = defaultdict(list)
    fam_years: dict[str, list[int]] = defaultdict(list)
    fam_capital_votes: dict[str, Counter] = defaultdict(Counter)
    fam_ndb_votes: dict[str, Counter] = defaultdict(Counter)
    fam_country_votes: dict[str, Counter] = defaultdict(Counter)
    fam_authority_votes: dict[str, Counter] = defaultdict(Counter)
    fam_source_family_votes: dict[str, Counter] = defaultdict(Counter)
    fam_project_titles: dict[str, Counter] = defaultdict(Counter)
    fam_aid_objective_votes: dict[str, Counter] = defaultdict(Counter)
    # What KIND of company each instrument actually funds. Thematic embeddings
    # match on vocabulary, and vocabulary travels across domains: a health
    # partnership whose funded projects are full of "AI", "platform" and "data"
    # ranks highly for any software company. What it has actually funded does
    # not travel. See sectorFit in the frontend's fit score.
    fam_sector_votes: dict[str, Counter] = defaultdict(Counter)
    # scheme code -> who actually disburses under it, by award volume.
    scheme_operators: dict[str, Counter] = defaultdict(Counter)
    # Per-authority, per-scheme detail under the state-aid rollups. See
    # child_key() for why this exists and what it is allowed to do.
    child_rows: dict[tuple[str, str, str], dict] = {}

    for r in rows:
        fam = source_to_family(r["source"])
        fam_sources[fam].add(r["source"])
        fam_companies[fam].add(r["parent_group"] or r["company_id"])
        fam_events[fam] += 1
        award = (r["grant_amount_eur"] or 0) + (r["equity_amount_eur"] or 0) + (r["debt_amount_eur"] or 0)
        fam_eur[fam] += award
        if award > 0:
            fam_awards[fam].append(award)

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
        if r["sector_top"]:
            fam_sector_votes[fam][r["sector_top"]] += 1
        if r["call_id"] and r["granting_authority"] \
                and not NOT_AN_APPLYABLE_BODY.match(r["granting_authority"]):
            scheme_operators[r["call_id"]][r["granting_authority"][:200]] += 1

        # ── the split ────────────────────────────────────────────────────────
        # A state-aid rollup is a whole country's aid regime in one row. It is
        # the right unit for the CURATED eligibility layer, which is written
        # against the regime's own framework document, and the wrong unit for a
        # founder, who cannot apply to "French R&D state aid". Underneath it sit
        # real granting bodies running real notified schemes.
        #
        # So the rollup stays exactly where it is, keeps its id and therefore
        # keeps every curated gate attached to it, and the detail arrives as
        # CHILDREN. Nothing is moved, so nothing is orphaned: the reconcile
        # above only deletes gates whose instrument disappeared, and no
        # instrument disappears here.
        if fam in split_targets and r["granting_authority"] and r["call_id"]:
            key = (fam, r["granting_authority"][:200], r["call_id"])
            c = child_rows.setdefault(key, dict(
                events=0, eur=0.0, companies=set(), years=[],
                capital=Counter(), objectives=Counter(), titles=Counter(),
                sectors=Counter(), awards=[]))
            c["events"] += 1
            c["eur"] += award
            if award > 0:
                c["awards"].append(award)
            c["companies"].add(r["parent_group"] or r["company_id"])
            if year:
                c["years"].append(year)
            c["capital"][ct] += 1
            if r["aid_objective"]:
                c["objectives"][r["aid_objective"]] += 1
            if r["project_title"]:
                c["titles"][r["project_title"]] += 1
            if r["sector_top"]:
                c["sectors"][r["sector_top"]] += 1

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
        a25, a50, a75, an = award_percentiles(fam_awards.get(fam, []))
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
            # A State Aid Transparency Register family belongs to the member
            # state that granted the aid, and that state is already in the
            # family id (satr_ee_*, satr_lt_*). Beneficiary nationality is
            # evidence about recipients, not about whose register this is, so
            # for SATR the id wins outright. Without this, low-volume families
            # fell under the 90% threshold and were labelled 'EU' -- which
            # instrumentServesCountry reads as "serves every founder", and the
            # Estonian and Lithuanian equity schemes were being offered to
            # founders in every other country in Europe.
            satr_cc = re.match(r"^satr_([a-z]{2})_", fam)
            if satr_cc:
                country = satr_cc.group(1).upper()
            elif country_total == 0:
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

        authority_votes = fam_authority_votes.get(fam, Counter())
        administering_body = top(authority_votes) if fam not in dict(FRAMEWORK_INSTRUMENTS) else None
        # How much of this instrument's history the body we NAME actually
        # awarded. administering_body is a PLURALITY, and for the SATR
        # country rollups it can be very thin -- satr_de_rnd's top authority
        # covers 15.3% of 419 distinct granting bodies. The frontend renders
        # administering_body instead of the meaningless register name, so
        # without this share it presented a whole country's R&D aid as one
        # specific agency to approach. See migration 014.
        authority_total = sum(authority_votes.values())
        administering_body_share = (
            authority_votes.most_common(1)[0][1] / authority_total
            if administering_body and authority_total else None
        )

        now.append(dict(
            id=fam, parent_id=parent_id, name=name,
            name_source="curated" if (fam in OVERRIDE_NAMES or is_framework) else "deterministic",
            country=country, administering_body=administering_body,
            administering_body_share=administering_body_share, ndb_id=ndb_id,
            source_family_bucket=source_family_bucket, capital_type=capital_type,
            capital_type_basis=capital_basis, event_count=events, company_count=companies,
            total_eur=total_eur,
            award_p25=a25, award_p50=a50, award_p75=a75, award_n=an, first_year=first_year, last_year=last_year,
            is_framework=is_framework, sample_project_titles=sample_titles,
            sector_mix=json.dumps(dict(fam_sector_votes.get(fam, Counter()).most_common(8)))
                       if fam_sector_votes.get(fam) else None,
        ))

    # ── Children of the state-aid rollups ────────────────────────────────────
    # One row per (granting body, notified scheme). The body is who a founder
    # approaches; the scheme is the legal identity of the money and what makes
    # the row traceable to a primary document.
    #
    # These carry NO gates of their own. The curated eligibility layer is
    # written against the parent regime's framework document and stays there;
    # a child inherits it at read time (see eligibility_export.py). Copying
    # gates down would fork the expensive layer into hundreds of duplicates
    # that then drift.
    kept_children = 0
    for (fam, authority, scheme), c in sorted(child_rows.items()):
        if c["events"] < MIN_CHILD_EVENTS:
            continue
        parent = next((row for row in now if row["id"] == fam), None)
        if parent is None:
            continue
        years = c["years"]
        capital_type, capital_basis = family_capital_type(c["capital"])
        titles = c["titles"]
        # A child's OWN awards, for the same reason its sector mix is its own:
        # the regime's median says nothing about what THIS body hands out.
        c25, c50, c75, cn = award_percentiles(c["awards"])
        now.append(dict(
            id=f"{fam}__{child_slug(scheme)}__{child_slug(authority)}",
            parent_id=fam,
            name=authority,
            name_source="deterministic",
            country=parent["country"],
            administering_body=authority,
            # The body IS the instrument here, not a plurality vote across a
            # whole country's register, so the share that made the parent's
            # name unsafe to display is 1.0 by construction.
            administering_body_share=1.0,
            ndb_id=parent["ndb_id"],
            source_family_bucket=parent["source_family_bucket"],
            capital_type=capital_type, capital_type_basis=capital_basis,
            event_count=c["events"], company_count=len(c["companies"]),
            total_eur=round(c["eur"], 2),
            award_p25=c25, award_p50=c50, award_p75=c75, award_n=cn,
            first_year=min(years) if years else None,
            last_year=max(years) if years else None,
            is_framework=0,
            sample_project_titles=json.dumps([t for t, _ in titles.most_common(5)]) if titles else None,
            scheme_code=scheme,
            application_url=None,
            # A child's OWN funding history, not its parent's.
            #
            # Inheriting the parent's mix made every child of one regime
            # identical on the sector signal: a film agency, a water agency and
            # the whole national R&D framework all read as
            # 28% energy / 23% other / 21% software, so nothing could tell them
            # apart and a Paris software company was offered a cinema fund.
            # Each child awards to its own recipients; that is the signal.
            sector_mix=json.dumps(dict(c["sectors"].most_common(8)))
                       if c["sectors"] else parent.get("sector_mix"),
            # Who a founder can actually approach under this scheme. Empty when
            # only departments ever awarded on it, which is itself worth
            # knowing: it means the row has no front door we can name.
            scheme_operators=json.dumps(
                [a for a, _ in scheme_operators.get(scheme, Counter()).most_common(6)])
                if scheme_operators.get(scheme) else None,
        ))
        kept_children += 1
    if kept_children:
        print(f"  split: {kept_children} per-authority/scheme children under "
              f"{len(split_targets)} rollups")
    # Every row must carry the new columns, children and parents alike.
    for row in now:
        row.setdefault("scheme_code", None)
        row.setdefault("application_url", None)
        row.setdefault("sector_mix", None)
        row.setdefault("scheme_operators", None)
        for k in ("award_p25", "award_p50", "award_p75"):
            row.setdefault(k, None)
        row.setdefault("award_n", 0)

    # ── Reconcile, do not wipe ───────────────────────────────────────────────
    # This used to DELETE every non-framework eligibility gate on every run.
    # Gates are the EXPENSIVE derived layer -- extracted, triaged, encoded and
    # audited, at real cost -- and instrument rows are cheap facts recomputed
    # from events. Coupling them meant a routine rebuild destroyed the
    # eligibility engine, and fixing one derived column (capital_type) needed a
    # separate script written specifically to avoid running this. The same
    # coupling once cost 3,327 Voyage embeddings through an FK cascade.
    #
    # Instrument ids are source_to_family() outputs, which are stable across
    # runs, so a wipe was never necessary: gates whose instrument survives are
    # still correctly attached. Only genuinely orphaned gates -- instrument no
    # longer produced by this pass -- are removed.
    surviving = {r["id"] for r in now}
    # Read gates WITHOUT joining funding_instruments. An inner join only sees
    # gates whose instrument still exists, so anything orphaned by an earlier
    # run stays invisible and survives every subsequent reconcile -- which is
    # exactly what happened: 33 gates for fondo_di_garanzia and
    # invitalia_smart_start persisted until a Postgres FK violation exposed
    # them. `surviving` is the full set this pass produces, frameworks
    # included, so membership in it is the whole test.
    orphaned = [
        (gid, iid) for gid, iid in conn.execute(
            "SELECT id, instrument_id FROM eligibility_gates")
        if iid not in surviving
    ]
    # Every derived table keyed on instrument_id, not just gates. Reconciling
    # only one left eligibility_clauses orphaned, which surfaced as a second
    # Postgres FK violation immediately after the first was fixed -- the same
    # bug twice because the fix was written for one table instead of the class.
    for table in DERIVED_INSTRUMENT_TABLES:
        dead = [row[0] for row in
                conn.execute(f"SELECT id, instrument_id FROM {table}").fetchall()
                if row[1] not in surviving]
        if dead:
            conn.executemany(f"DELETE FROM {table} WHERE id = ?", [(d,) for d in dead])
            print(f"  reconciled: removed {len(dead):,} orphaned rows from {table}")
    curated = conn.execute(
        """SELECT COUNT(*) FROM eligibility_gates
            WHERE value_spec IS NOT NULL OR gate_role IS NOT NULL""").fetchone()[0]
    if orphaned:
        at_risk = conn.execute(
            f"""SELECT COUNT(*) FROM eligibility_gates
                 WHERE id IN ({",".join("?" * len(orphaned))})
                   AND (value_spec IS NOT NULL OR gate_role IS NOT NULL)""",
            [g for g, _ in orphaned]).fetchone()[0]
        # A rebuild that would discard a large share of the curated layer is a
        # bug in this pass, not an instruction. Fail loudly rather than delete.
        if curated and at_risk / curated > 0.2 and not args.force:
            raise SystemExit(
                f"refusing to run: this rebuild would orphan {at_risk:,} of {curated:,} "
                f"curated gates ({at_risk / curated:.0%}). That means instrument ids "
                f"moved. Investigate source_to_family() before re-running with --force."
            )
        conn.executemany("DELETE FROM eligibility_gates WHERE id = ?",
                         [(g,) for g, _ in orphaned])
        print(f"  reconciled: removed {len(orphaned):,} orphaned gates "
              f"({at_risk:,} of them curated); {curated - at_risk:,} curated gates kept")
    else:
        print(f"  reconciled: no orphaned gates; {curated:,} curated gates kept")

    conn.execute("DELETE FROM funding_instrument_sources")
    conn.execute("DELETE FROM funding_instruments")

    for r in now:
        conn.execute("""
            INSERT INTO funding_instruments
              (id, parent_id, name, name_source, country, administering_body,
               administering_body_share, ndb_id,
               source_family_bucket, capital_type, capital_type_basis, event_count,
               company_count, total_eur, first_year, last_year, is_framework,
               sample_project_titles, scheme_code, application_url, sector_mix, scheme_operators,
               award_p25, award_p50, award_p75, award_n, updated_at)
            VALUES (:id,:parent_id,:name,:name_source,:country,:administering_body,
                    :administering_body_share,:ndb_id,
                    :source_family_bucket,:capital_type,:capital_type_basis,:event_count,
                    :company_count,:total_eur,:first_year,:last_year,:is_framework,
                    :sample_project_titles,:scheme_code,:application_url,:sector_mix,:scheme_operators,
                    :award_p25,:award_p50,:award_p75,:award_n, CURRENT_TIMESTAMP)
        """, r)

    for fam, srcs in fam_sources.items():
        for src in srcs:
            conn.execute(
                "INSERT OR IGNORE INTO funding_instrument_sources (instrument_id, source) VALUES (?, ?)",
                (fam, src),
            )

    n_gates = seed_inventory_gates(conn, fam_aid_objective_votes)
    n_excl = seed_framework_gates(conn, now)
    conn.commit()
    print(f"funding_instruments: {len(now)} rows")
    print(f"funding_instrument_sources: {sum(len(s) for s in fam_sources.values())} rows")
    print(f"eligibility_gates (Tier 0.5, inventory_inferred): {n_gates} rows")
    print(f"eligibility_gates (framework rules): {n_excl} rows")
    conn.close()


if __name__ == "__main__":
    main()
