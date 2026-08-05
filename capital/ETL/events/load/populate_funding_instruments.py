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
from etl_env import DB, ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import argparse
import hashlib
import json
import re
import unicodedata
import sqlite3
from datetime import date
from collections import Counter, defaultdict

from instrument_family import PARENT_MAP, SYNTHETIC_PARENTS, source_to_family  # noqa: E402
from ndb_taxonomy import NDB_LABELS, NDB_LABELS_SUPPLEMENTAL, classify_ndb_from_source  # noqa: E402
from nuts_regions import ISO2_TO_NUTS, delivery_region, load_reference, resolve  # noqa: E402

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
# A family's events must overwhelmingly agree on one programme name before it
# becomes the family's name. Below this the family is a rollup of several
# programmes and naming it after the biggest is a false label.
FEED_NAME_DOMINANCE = 0.8

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


# Every column this pass DERIVES from the events corpus, in insert order. Named
# once because two things read the list: the INSERT, and the snapshot that
# protects everything NOT on it (see main()). Two copies of it would mean a new
# column is either not written or not protected, and neither failure is visible.
BUILT_COLUMNS = (
    "parent_id", "name", "name_source", "country", "administering_body",
    "administering_body_share", "ndb_id",
    "source_family_bucket", "capital_type", "capital_type_basis", "event_count",
    "company_count", "total_eur", "first_year", "last_year", "is_framework",
    "sample_project_titles", "scheme_code", "application_url", "sector_mix",
    "scheme_operators",
    "award_p25", "award_p50", "award_p75", "award_n",
    "intensity_p50", "intensity_n",
    "scheme_end_date", "successor_scheme", "successor_title",
    "delivery_region", "delivery_region_share", "recipient_region_mix",
    "tier", "root_id", "depth", "path",
)

MIN_CHILD_EVENTS = 40

# Below this many priced awards a "typical" award is one or two events wearing
# a statistic's clothing, and a founder would plan around it. Publish nothing
# rather than a number we cannot stand behind.
MIN_AWARDS_FOR_TYPICAL = 5


MIN_INTENSITY_PROJECTS = 5

# Grant divided by project cost is an aid intensity only when both describe the
# SAME beneficiary. In a consortium they do not: one partner's grant sits
# against the whole project's cost, so the ratio measures their share of the
# work rather than the funder's rate. EIC Pathfinder computes to 15% that way
# while actually funding 100% of eligible costs, and Horizon clusters near 5%.
#
# `role` is the corpus's own marker for this and needs no threshold: 'direct'
# is a single-beneficiary award, 'coordinator' and 'participant' are consortium
# rows. Two weaker tests were tried first and both let real errors through -- a
# plausibility floor passed Pathfinder's 15%, and awards-per-call passed Horizon
# because its call_id is unique per AWARD rather than per project.
SINGLE_BENEFICIARY_ROLE = "direct"


def realised_intensity(shares: list[float]) -> tuple[float | None, int]:
    """Median share of project cost covered, over single-beneficiary awards."""
    if len(shares) < MIN_INTENSITY_PROJECTS:
        return None, len(shares)
    xs = sorted(shares)
    return round(xs[len(xs) // 2], 4), len(xs)


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


# A programme child's `name` is the programme -- "Tremplin pour la transition
# ecologique des PME" -- and that is right: it is what a founder applies to.
# `administering_body` is a different question, and for the 234 programme
# children it was being answered with the same string, so the column held a CALL
# NAME where every reader expects an INSTITUTION. Three separate pieces of logic
# reason about it as one (distinguishRowNames, the 0.6 administeringBodyShare
# threshold, and NOT_AN_APPLYABLE_BODY), so a third of the sibling corpus was
# being reasoned about as an agency when it was a budget line.
#
# The institution is taken from the award records, which is the only place it is
# evidence rather than assumption, and NULL is a permitted answer: where nothing
# on record names a granting institution we say so, because a call name is not
# an answer to "who do I approach".
MIN_BODY_DOMINANCE = 0.5


def dominant_body(authorities: Counter, distributors: Counter, total: int
                  ) -> tuple[str, float] | None:
    """Who granted this money, from what the awards themselves record.

    `granting_authority` first -- it is the register's own free-text name for
    the body -- then the canonical distributor label, which the NDB extractors
    assign per award. Deliberately NOT the distributor derived from the source
    slug: that is a restatement of the instrument's own id, so it would always
    "agree" and could never fail to name a body.
    """
    if not total:
        return None
    for votes, label in ((authorities, lambda k: k),
                         (distributors, lambda k: ALL_NDB_LABELS.get(k, k))):
        if not votes:
            continue
        top, n = votes.most_common(1)[0]
        if n / total >= MIN_BODY_DOMINANCE:
            return label(top), n / total
    return None


def _name_digest(text: str) -> str:
    """Six stable hex characters of a name, to keep long slugs unique."""
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:6]


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
    an instrument whose dominant aid_objective maps to a known GBER article.

    Applied at BOTH levels. It used to run over families only, so every scheme
    under a regime carried the regime's article even where its own events said
    otherwise -- and 86% of publishable programmes held no rule of their own at
    all. The dominance floor is what keeps this honest: a scheme whose events
    split evenly across three articles is not an Article 25 scheme and must not
    be labelled one.

    Level is `register_derived`, which is its own tier and deliberately not
    `inventory_inferred`: the aid_objective code is filed per award by the
    granting authority in the SATR transparency register, so it is not a model
    inference. It still is not the scheme's own words -- a 67% majority across
    a scheme's awards describes what it has funded, not what it requires -- so
    the tier is readable as a STRUCTURING NOTE and nowhere else. It never
    carries a value_spec, so it can never disqualify anyone."""
    n = 0
    for fam, votes in fam_aid_objective_votes.items():
        if not votes:
            continue
        top_code, top_n = votes.most_common(1)[0]
        if top_code not in GBER_ARTICLE_GATES or top_n / sum(votes.values()) < 0.5:
            continue
        requirement, gate_family, intake_field = GBER_ARTICLE_GATES[top_code]
        # gate_role and intake_field_resolved are set HERE rather than left for
        # the triage pass. Triage is a paid step that has only ever run over
        # instruments that existed when it ran, so a freshly seeded gate arrives
        # with gate_role NULL -- and NULL is not neutral: structuringNotes skips
        # `!gateRole` as untriaged, so 233 correctly-seeded article rules reached
        # no row at all. The role is not a judgement call anyway: an article
        # inferred from award history states what the instrument DOES, never who
        # qualifies, which is exactly `programme_fact`. Declaring it also keeps
        # the gate out of the adaptive round and the eligibility engine, both of
        # which exclude programme facts by design.
        conn.execute("""
            INSERT INTO eligibility_gates
              (instrument_id, gate_key, gate_family, requirement, value,
               intake_field, gate_role, intake_field_resolved,
               verification_level, verify_note, updated_at)
            VALUES (?, 'gber_article_inferred', ?, ?, ?, ?, 'programme_fact', 'none',
                    'register_derived', ?, CURRENT_TIMESTAMP)
            ON CONFLICT (instrument_id, gate_key) DO UPDATE SET
              gate_family=excluded.gate_family, requirement=excluded.requirement,
              value=excluded.value, intake_field=excluded.intake_field,
              gate_role=excluded.gate_role,
              intake_field_resolved=excluded.intake_field_resolved,
              -- verification_level was NOT in this list, so every gate seeded
              -- before a tier change kept the old tier forever: the row was
              -- updated on each run, silently except for the one column that
              -- decides whether the read path may show it at all.
              verification_level=excluded.verification_level,
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

    # ── The second split dimension: the PROGRAMME ──────────────────────────
    # A state-aid rollup splits by (granting body, notified scheme), because
    # that is what identifies the money there. Everywhere else the unit a
    # founder actually applies to is the programme, and the registers name it:
    # ADEME publishes 458 of them, and all of them were collapsing into one row
    # with a single EUR 20,000 median.
    #
    # Read from the data rather than listed, for the same reason split_families
    # is: a source that starts publishing programme names should get the
    # granularity automatically, not when somebody remembers to add it.
    #
    # Requires MORE THAN ONE distinct programme_name, not just enough rows.
    # Its absence was a real bug, found 2026-08-05 checking Denmark: several
    # extractors (Denmark's Innovationsfonden, Latvia's ALTUM, Estonia's EIS,
    # Norway's NFR) already write one `source` slug per programme, so
    # `programme_name` is CONSTANT within that source. Splitting on a constant
    # still ran -- it produced exactly one child, given the same name as its
    # own parent, and silently divided that programme's real event count and
    # award history in two (Innobooster: 1533 parent-side events, 1467 more
    # under a same-named "child"). 61 sources had this shape. A split that
    # cannot discriminate anything is not a split; it is a duplicate.
    programme_split = {r[0] for r in conn.execute("""
        SELECT source FROM public_funding_events
         WHERE programme_name IS NOT NULL AND programme_name != ''
         GROUP BY source
        HAVING COUNT(*) >= ? AND COUNT(DISTINCT programme_name) > 1
    """, (MIN_CHILD_EVENTS,))}
    if programme_split:
        print(f"  programme-level split available for {len(programme_split)} sources")

    rows = conn.execute("""
        SELECT e.source, e.company_id, c.country, c.parent_group, c.sector_top,
               e.programme_name,
               e.grant_amount_eur, e.equity_amount_eur, e.debt_amount_eur,
               e.total_project_cost_eur, e.role,
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
    child_aid_objective_votes: dict[str, Counter] = {}
    # Realised aid intensity: grant divided by the project it paid for. The
    # structuring question -- what share of this can be public money -- answered
    # from what recipients were actually paid rather than from prose.
    fam_intensity: dict[str, list[float]] = defaultdict(list)
    fam_years: dict[str, list[int]] = defaultdict(list)
    fam_capital_votes: dict[str, Counter] = defaultdict(Counter)
    fam_ndb_votes: dict[str, Counter] = defaultdict(Counter)
    # Distributors the AWARDS record, as opposed to fam_ndb_votes, which falls
    # back to the source slug. Only the recorded ones are evidence about who
    # granted the money -- see dominant_body().
    fam_distributor_votes: dict[str, Counter] = defaultdict(Counter)
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
        cost = r["total_project_cost_eur"] or 0
        if award > 0 and cost > 0:
            share = award / cost
            # Above 1 is a data error, not a 150% grant.
            if 0 < share <= 1 and r["role"] == SINGLE_BENEFICIARY_ROLE:
                fam_intensity[fam].append(share)

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

        if r["ndb_distributor"]:
            fam_distributor_votes[fam][r["ndb_distributor"]] += 1
        ndb = r["ndb_distributor"] or classify_ndb_from_source(r["source"])
        if ndb:
            fam_ndb_votes[fam][ndb] += 1
        if r["country"]:
            fam_country_votes[fam][r["country"]] += 1
        if r["granting_authority"]:
            fam_authority_votes[fam][r["granting_authority"][:200]] += 1
        fam_source_family_votes[fam][r["source_family"]] += 1
        # Every channel contributes its funded-project titles, not just state
        # aid. The gate here used to be `source_family == "state_aid_satr"`,
        # which silently discarded 62,517 titled development-bank events and
        # left all 201 NDB instruments with no record of what they fund — the
        # single largest hole in the coverage table, on the channel founders
        # actually recognise.
        #
        # The irony is that SATR titles are the WEAK ones: they are regime
        # names ("Regime cadre exempte relatif aux aides...") while a
        # development bank's are real projects ("Edge Computing for Web Browser
        # Applications"). build_instrument_profiles classifies scheme-like
        # title sets and drops them, so the distinction is handled where it
        # belongs rather than by refusing to collect.
        if r["project_title"]:
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
        # A programme child is keyed on the programme's own NAME, which is
        # also what it will be called. Nothing is synthesised: where a source
        # publishes no name, it simply does not split.
        prog = (r["programme_name"] or "").strip() if r["programme_name"] else ""
        if prog and r["source"] in programme_split:
            key = (fam, prog[:200], "")
        elif fam in split_targets and r["granting_authority"] and r["call_id"]:
            key = (fam, r["granting_authority"][:200], r["call_id"])
        else:
            key = None
        if key:
            c = child_rows.setdefault(key, dict(
                events=0, eur=0.0, companies=set(), years=[],
                capital=Counter(), objectives=Counter(), titles=Counter(),
                sectors=Counter(), awards=[], intensity=[],
                authorities=Counter(), distributors=Counter()))
            c["events"] += 1
            if r["granting_authority"]:
                c["authorities"][r["granting_authority"][:200]] += 1
            if r["ndb_distributor"]:
                c["distributors"][r["ndb_distributor"]] += 1
            c["eur"] += award
            if award > 0:
                c["awards"].append(award)
            if (award > 0 and cost > 0 and 0 < award / cost <= 1
                    and r["role"] == SINGLE_BENEFICIARY_ROLE):
                c["intensity"].append(award / cost)
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
        i50, i_n = realised_intensity(fam_intensity.get(fam, []))
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
            award_p25=a25, award_p50=a50, award_p75=a75, award_n=an,
            intensity_p50=i50, intensity_n=i_n, first_year=first_year, last_year=last_year,
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
        ci50, ci_n = realised_intensity(c["intensity"])
        # `scheme` is empty for a programme child: there is no notified scheme
        # code, the programme name IS the identity, and it becomes the row's
        # name. That is the whole point — "Tremplin pour la transition
        # ecologique des PME" is what a founder applies to, not "ADEME".
        is_programme = not scheme
        # child_slug truncates to 48 characters, and programme names are long
        # and share prefixes ("Aides aux actions en faveur de la transition
        # ecologique ..."), so the slug alone collides. A short digest of the
        # FULL name keeps ids unique and, more importantly, stable: ids must not
        # move between runs, because the reconcile step cannot tell a renamed
        # instrument from a vanished one.
        child_id = (f"{fam}__{child_slug(authority)}_{_name_digest(authority)}"
                    if is_programme
                    else f"{fam}__{child_slug(scheme)}__{child_slug(authority)}")
        # A scheme's OWN aid objective, not its regime's. Schemes under one
        # regime run under different GBER articles -- 9 distinct objectives
        # across satr_fr_rnd's 61 schemes -- and those articles carry different
        # eligibility: Art 25 is R&D project aid, Art 22 is start-up aid with
        # company-age and unlisted-SME conditions, Art 21 is risk finance.
        # Telling a founder what the REGIME funds, when the scheme they would
        # actually apply to runs under a different article, is false about the
        # thing in front of them.
        if c["objectives"]:
            child_aid_objective_votes[child_id] = c["objectives"]
        # For a SCHEME child the key IS the granting body, so it is the body,
        # with a share of 1.0 by construction. For a PROGRAMME child the key is
        # the call, and the body has to be found: from the child's own awards
        # first, then from its parent's, and NULL where nothing on record names
        # an institution.
        if is_programme:
            found = (dominant_body(c["authorities"], c["distributors"], c["events"])
                     or dominant_body(fam_authority_votes.get(fam, Counter()),
                                      fam_distributor_votes.get(fam, Counter()),
                                      fam_events.get(fam, 0)))
            child_body, child_body_share = found if found else (None, None)
        else:
            child_body, child_body_share = authority, 1.0
        now.append(dict(
            id=child_id,
            parent_id=fam,
            name=authority,
            name_source="deterministic",
            country=parent["country"],
            administering_body=child_body,
            administering_body_share=child_body_share,
            ndb_id=parent["ndb_id"],
            source_family_bucket=parent["source_family_bucket"],
            capital_type=capital_type, capital_type_basis=capital_basis,
            event_count=c["events"], company_count=len(c["companies"]),
            total_eur=round(c["eur"], 2),
            award_p25=c25, award_p50=c50, award_p75=c75, award_n=cn,
            intensity_p50=ci50, intensity_n=ci_n,
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

    # ── Where the money actually lands ───────────────────────────────────────
    # 123 publishable leaves share a scheme NAME with a sibling, at mean cosine
    # 0.947 between their profiles. They are one notified scheme delivered by
    # many bodies -- SA.111723 alone is fourteen of them -- and what separates
    # them is the applicant's REGION, which no amount of scheme text can supply.
    #
    # The register supplies it. satr_staging carries the beneficiary's NUTS
    # region on all 122,814 rows, and a scheme child is exactly one
    # (sa_number, granting_authority) pair in that table, so the region
    # distribution is MEASURED per leaf rather than guessed from the body's
    # name. Name-guessing was tried and is worse in both directions:
    # "Bayerisches Staatsministerium" never contains "Bayern", and "Finanzamt
    # Darmstadt" is a tax office administering a NATIONAL scheme.
    #
    # See nuts_regions.delivery_region for what the resulting id means, and why
    # a national body resolves to NULL rather than to its country.
    ref = load_reference()
    nuts_index = ref["index"]
    staged: dict[tuple[str, str], Counter] = defaultdict(Counter)
    for sa, ga, cc, region, n in conn.execute("""
            SELECT sa_number, granting_authority, granting_country_iso2, region, COUNT(*)
              FROM satr_staging
             WHERE sa_number IS NOT NULL AND TRIM(sa_number) <> ''
             GROUP BY 1, 2, 3, 4"""):
        hit = resolve(region or "", ISO2_TO_NUTS.get(cc or "", cc or ""), nuts_index)
        # Unresolvable names and whole-country labels both count toward the
        # denominator without supporting any region. That is the honest
        # treatment: a body half of whose awards are filed as "Germany" has not
        # demonstrated a regional focus, and dropping those rows would claim it
        # had.
        staged[(sa.strip(), (ga or "")[:200])][hit[0] if hit else ""] += n
    regional = 0
    for row in now:
        sa = (row.get("scheme_code") or "").strip()
        body = row.get("administering_body")
        if not sa or not body:
            continue
        mix = staged.get((sa, body[:200]))
        if not mix:
            continue
        row["recipient_region_mix"] = json.dumps(
            {k: v for k, v in mix.most_common() if k})
        hit = delivery_region(mix)
        if hit:
            row["delivery_region"], row["delivery_region_share"] = hit
            regional += 1
    if regional:
        print(f"  delivery region resolved for {regional} instruments "
              f"(the rest deliver nationally or have no registered recipients)")
    # ── Real programme names, where an agency publishes one ───────────────
    # `name` is otherwise the granting BODY, so 39 of these rows read "TACR
    # (Czech Republic)" or "EIS (KredEx + Enterprise Estonia)" and a founder
    # cannot tell which product is theirs. The names come from each agency's own
    # register or catalogue and are recorded with their source in
    # data/reference/programme_names.json; anything the agency itself never
    # named, or that could not be resolved confidently, is deliberately absent
    # and keeps the measured descriptor instead.
    #
    # Applied here rather than in the extractors so one curated file covers
    # agencies whose feeds have no name field at all.
    # ── First, the names the feed already carries ────────────────────────
    # Before curating a name by hand, and long before fetching an agency's
    # catalogue to read one off a web page, ask whether the events already say
    # it. They do, for a lot of the corpus: `programme_name` is populated on
    # 47,979 events, including 2,142 of NFR's 2,143. Norges Forskningsrad had 65
    # families all displaying "Norges Forskningsradet"; its own events name every
    # one of them (INNO-NAERING, ENERGIFORSKNING, GRONNFORM, EUROSTARS).
    #
    # This is the same lesson as the recovered sector labels: check what the
    # corpus already derives from a source before going back out to the source.
    # Measured before applying -- 71 families gain a real name and NOT ONE
    # unambiguous family changes, so this cannot churn names that already work.
    #
    # The floor is dominance, not presence. A family whose events name three
    # different programmes is a rollup, and calling it after the largest would
    # be wrong in a way nobody could see from the row.
    feed_named = 0
    for row in now:
        if row.get("parent_id"):
            continue                      # children are named by their own split
        votes = conn.execute("""
            SELECT TRIM(e.programme_name) p, COUNT(*) n
            FROM public_funding_events e
            JOIN funding_instrument_sources s ON s.source = e.source
            WHERE s.instrument_id = ? AND e.programme_name IS NOT NULL
              AND TRIM(e.programme_name) <> ''
            GROUP BY 1 ORDER BY n DESC""", (row["id"],)).fetchall()
        total = sum(v[1] for v in votes)
        if not votes or not total or votes[0][1] / total < FEED_NAME_DOMINANCE:
            continue
        # Feeds label a programme per EDITION ("... toetus 2025", "... toetus
        # 2024"), which splits the dominance vote between names that are the
        # same programme. The trailing year is stripped before voting: it dates
        # the round, not the fund, and a founder does not need last year's
        # edition number in the fund's name.
        real = re.sub(r"\s*[-/(]?\s*20\d{2}\s*(?:[-/]\s*20\d{2}\s*)?\)?$", "",
                      (votes[0][0] or "").strip()).strip(" -/(,")
        if real and real.lower() != (row.get("name") or "").strip().lower():
            row["name"] = real
            # Its own word for itself, carried by the feed -- neither our
            # deterministic descriptor nor a hand-curated choice.
            row["name_source"] = "programme_feed"
            feed_named += 1
    if feed_named:
        print(f"  named {feed_named} instruments from the programme name their own events carry")

    # ── The Commission's own title for a notified scheme ─────────────────
    # A SATR child is named after the granting BODY, so 351 of 453 shared a name
    # with a sibling: nine rows reading "Bundesamt fuer Wirtschaft und
    # Ausfuhrkontrolle". Every one carries an SA number and the Commission
    # publishes a title per number, fetched by fetch_state_aid_cases.py.
    #
    # Applied before the curated file, so a hand-curated name still wins: the
    # register is authoritative about a scheme's registered identity, a human is
    # authoritative about what to call it.
    _cases_path = ROOT / "data" / "raw" / "state_aid_cases" / "cases.json"
    # Four cases whose registered title describes an EVALUATION PLAN rather than
    # an aid scheme ("Germany - Evaluation plan for the block exempted R&D...").
    # The SATR filing points at the evaluation-plan case, so the scheme's own
    # number is a different one we do not hold; naming the fund after the plan
    # would be precise about the wrong thing. Listed by SA number rather than
    # matched on words, because four known cases are curation, not a rule --
    # a word-matching rule would silently catch schemes legitimately named for
    # evaluating something.
    CASE_TITLE_NOT_A_SCHEME = {"SA.59366", "SA.40391", "SA.56245", "SA.49781"}
    case_named = 0
    closed = 0
    if _cases_path.exists():
        cases = json.loads(_cases_path.read_text())

        def _one(rec, key):
            v = rec.get(key)
            return (v[0] if isinstance(v, list) and v else v) or ""

        def _links(rec):
            v = rec.get("caseLinks") or []
            return v if isinstance(v, list) else [v]

        # The register's word on a scheme's LIFETIME. Award recency cannot see
        # this: payments run for years after a scheme shuts to new applicants,
        # so 130 closed schemes looked current on a 2024 award alone.
        _today = date.today().isoformat()
        for row in now:
            sa = (row.get("scheme_code") or "").strip()
            rec = cases.get(sa) or {}
            end = _one(rec, "caseMeasureEndDate")[:10]
            if not end:
                continue
            row["scheme_end_date"] = end
            if end >= _today:
                continue
            closed += 1
            # A prolonged scheme gets a new SA number, so "ended" often means
            # "superseded". Naming the successor turns a dead end into a
            # redirection; only a successor still running counts.
            for link in _links(rec):
                other = cases.get(str(link).strip()) or {}
                oend = _one(other, "caseMeasureEndDate")[:10]
                if oend and oend >= _today:
                    row["successor_scheme"] = str(link).strip()
                    row["successor_title"] = _one(other, "caseTitle")
                    break
        if closed:
            print(f"  {closed} instruments sit under a scheme the register says has "
                  f"closed to new applications")
        for row in now:
            sa = (row.get("scheme_code") or "").strip()
            if not sa or sa in CASE_TITLE_NOT_A_SCHEME:
                continue
            rec = cases.get(sa) or {}
            t = rec.get("caseTitle") or rec.get("caseOriginalTitle") or ""
            title = (t[0] if isinstance(t, list) and t else t or "").strip()
            if title and title != row.get("name"):
                row["name"] = title
                row["name_source"] = "case_register"
                case_named += 1
        if case_named:
            print(f"  named {case_named} instruments from the Commission's state-aid "
                  f"case register")

    _names_path = ROOT / "data" / "reference" / "programme_names.json"
    programme_names = {
        k: v["name"] for k, v in json.loads(_names_path.read_text()).items()
        if not k.startswith("_")
    }
    renamed = 0
    for row in now:
        real = programme_names.get(row["id"])
        if real and row.get("name") != real:
            row["name"] = real
            # "curated" is the schema's word for a name we chose rather than
            # derived; these are curated FROM an agency register, with the
            # source recorded per name in programme_names.json.
            row["name_source"] = "curated"
            renamed += 1
    if renamed:
        print(f"  named {renamed} instruments from their agency's own register")

    # ── The hierarchy, derived from parent_id and never hand-set ──────────
    # parent_id is the source of truth; tier, root_id, depth and path are its
    # projections, recomputed here so they cannot describe a structure that no
    # longer exists. Depth is unbounded on purpose: EIT already nests three
    # (EIT -> Climate-KIC -> Clean Cities Spain) and a source that starts
    # publishing a fourth level should not need a schema change.
    by_id = {r["id"]: r for r in now}
    has_children = {r["parent_id"] for r in now if r.get("parent_id")}

    def lineage(row: dict) -> list[str]:
        """Root-first chain of ids. Defends against a cycle rather than hanging:
        a self-referential parent would otherwise spin here forever, and bad
        parent data is exactly the kind of thing a source can hand us."""
        chain, seen, cur = [], set(), row
        while cur is not None:
            if cur["id"] in seen:
                print(f"  WARNING: parent cycle at {cur['id']}, truncating lineage")
                break
            chain.append(cur["id"])
            seen.add(cur["id"])
            cur = by_id.get(cur.get("parent_id")) if cur.get("parent_id") else None
        chain.reverse()
        return chain

    for row in now:
        chain = lineage(row)
        row["path"] = "/".join(chain)
        row["root_id"] = chain[0]
        row["depth"] = len(chain) - 1
        # A node with children groups other things; a leaf is what a founder
        # applies to. That is the same test publishableInstruments() applies,
        # named once here instead of re-derived by every consumer.
        row["tier"] = "family" if row["id"] in has_children else "programme"

    # Every row must carry the new columns, children and parents alike.
    for row in now:
        row.setdefault("scheme_code", None)
        row.setdefault("application_url", None)
        row.setdefault("sector_mix", None)
        row.setdefault("scheme_operators", None)
        for k in ("award_p25", "award_p50", "award_p75"):
            row.setdefault(k, None)
        row.setdefault("award_n", 0)
        row.setdefault("intensity_p50", None)
        row.setdefault("intensity_n", 0)
        for k in ("tier", "root_id", "path"):
            row.setdefault(k, None)
        row.setdefault("depth", 0)

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

    # ── Columns this pass does not compute belong to somebody else ───────────
    # The rebuild below deletes every row, and the INSERT names only the columns
    # derived from events. Anything else on the table is written by another step
    # -- `description`, `eligibility_text` and `eligibility_source_url` are the
    # fetched per-scheme pages that load_scheme_text.py puts there, 285 and 241
    # rows of the single most discriminating text the SATR channel has -- and a
    # routine instrument rebuild was silently erasing all of it.
    #
    # Snapshotted by DIFFERENCE rather than by name: whatever this pass does not
    # write, it does not own. A column added later by a new enrichment step is
    # then protected the day it appears, instead of on the day somebody notices
    # it went missing.
    table_columns = [r[1] for r in conn.execute("PRAGMA table_info(funding_instruments)")]
    foreign = [c for c in table_columns
               if c not in BUILT_COLUMNS and c not in ("id", "created_at", "updated_at")]
    preserved: dict[str, tuple] = {}
    if foreign:
        preserved = {
            r[0]: r[1:] for r in conn.execute(
                f"SELECT id, {', '.join(foreign)} FROM funding_instruments")
            if any(v is not None for v in r[1:])
        }

    conn.execute("DELETE FROM funding_instrument_sources")
    conn.execute("DELETE FROM funding_instruments")

    # Defaulted here rather than at each construction site: `now` is built in
    # three places (families, children, frameworks), so a key added to one is
    # silently missing from the others -- which is exactly the binding error
    # this replaces.
    for _row in now:
        _row.setdefault("scheme_end_date", None)
        _row.setdefault("successor_scheme", None)
        _row.setdefault("successor_title", None)
        _row.setdefault("delivery_region", None)
        _row.setdefault("delivery_region_share", None)
        _row.setdefault("recipient_region_mix", None)

    insert_sql = (
        f"INSERT INTO funding_instruments "
        f"({', '.join(('id',) + BUILT_COLUMNS)}, updated_at) VALUES "
        f"({', '.join(':' + c for c in ('id',) + BUILT_COLUMNS)}, CURRENT_TIMESTAMP)"
    )
    for r in now:
        conn.execute(insert_sql, r)

    if preserved:
        assignment = ", ".join(f"{c} = ?" for c in foreign)
        restored = conn.executemany(
            f"UPDATE funding_instruments SET {assignment} WHERE id = ?",
            [(*vals, iid) for iid, vals in preserved.items() if iid in surviving],
        ).rowcount
        print(f"  preserved {restored:,} rows of text this pass does not own "
              f"({', '.join(foreign)})")

    for fam, srcs in fam_sources.items():
        for src in srcs:
            conn.execute(
                "INSERT OR IGNORE INTO funding_instrument_sources (instrument_id, source) VALUES (?, ?)",
                (fam, src),
            )

    # Families AND their scheme children. The child's own votes win where an id
    # appears in both, because a scheme's article is the more specific claim.
    n_gates = seed_inventory_gates(
        conn, {**fam_aid_objective_votes, **child_aid_objective_votes})
    n_excl = seed_framework_gates(conn, now)
    conn.commit()
    print(f"funding_instruments: {len(now)} rows")
    print(f"funding_instrument_sources: {sum(len(s) for s in fam_sources.values())} rows")
    print(f"eligibility_gates (Tier 0.5, inventory_inferred): {n_gates} rows")
    print(f"eligibility_gates (framework rules): {n_excl} rows")
    conn.close()


if __name__ == "__main__":
    main()
