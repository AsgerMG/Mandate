"""Tier 0 (+ Tier 0.5): populate funding_instruments / funding_instrument_sources
/ eligibility_gates from data already in the corpus. Pure SQL aggregation,
zero API cost, fully deterministic — this alone gives 100% structural
coverage (every real fund, its country, capital type, scale, historical
usage) before any LLM research spend. See migration 011 and
project-mgmt/plans/ for the full rationale.

Usage: python3 ETL/events/load/populate_funding_instruments.py

Writes schema `capital` of the Mandate Postgres (store.py), in one transaction,
and is safe to re-run: it is a step of the weekly refresh (mandate/refresh).
It UPSERTS the columns it derives (BUILT_COLUMNS) and DELETES NOTHING -- no
instrument, no gate, no clause. Columns it does not derive are never in its
statements, so curated text and routes cannot be displaced. An instrument it no
longer derives from any event is kept with its gates and reported. (Until
2026-11 this file truncated and reloaded the table and reconciled the gate layer
by deletion; see the write section of build() for why that is gone.)
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import argparse
import hashlib
import json
import re
import unicodedata
from datetime import date
from collections import Counter, defaultdict

from liveness import NOTIFIED_DURATION  # noqa: E402
from instrument_family import PARENT_MAP, SYNTHETIC_PARENTS, source_to_family  # noqa: E402
from name_evidence import (  # noqa: E402
    NAME_SOURCE_PARTITION_KEY, NAMES_PARTITION_KEY, declaration_for,
    undeclared_error)
from ndb_taxonomy import NDB_LABELS, NDB_LABELS_SUPPLEMENTAL, classify_ndb_from_source  # noqa: E402
from nuts_regions import delivery_region, staged_region_mix  # noqa: E402
from recall_holdout import add_holdout_flags, resolve_holdout  # noqa: E402
from scheme_title import link_map, live_successor, repair_body_named_rows  # noqa: E402
from store import columns, connect  # noqa: E402

ALL_NDB_LABELS = {**NDB_LABELS, **NDB_LABELS_SUPPLEMENTAL}

# ── Capital-type inference cascade ──────────────────────────────────────────
#
# ── The fault this shape exists to prevent ─────────────────────────────────
# This cascade used to enumerate EQUITY / LOAN / GUARANTEE / DEBT bases and
# nothing else, and concluded "grant" only from a POPULATED EURO AMOUNT. There
# was no GRANT_BASES. So a source that publishes WHO it funded but not HOW MUCH
# — which is most registers of non-monetary or redacted awards — produced rows
# with no capital type at all, and the label `unknown`.
#
# That is Rule Zero's error written into code: a missing amount is a gap in our
# collection, and it was being read as an absent fact about the instrument.
# 15,137 event rows carried `unknown` for that reason alone, from bases whose
# own label says `grant` — `fr_innov_grant` (2,887 rows), `horizon_eu_grant`
# (8,078), `ihi_grant` (727). Most families outvoted their amount-less rows, so
# the damage surfaced only where 100% of a family's rows lacked amounts: nine
# publishable instruments no founder could ever be shown, because no intake
# option maps to `unknown` and the capital filter removed them for everyone.
#
# ── The property, and why the mapping is TOTAL ────────────────────────────
# A `grant_amount_basis` says where a number came from, and by construction it
# also says what kind of instrument produced it — that is what makes the two
# safe to record in one column. So the mapping from basis to capital kind is
# DECLARED, once, here, and it is TOTAL: `assert_bases_declared()` fails the
# load when the events table contains a basis this dict does not mention.
#
# A new source can therefore no longer land funds that nobody can reach. It
# lands a build failure naming the basis and asking what the source hands out
# — which is a question with an official answer, unlike "why is this fund
# missing", which is the question the old shape produced six months later.
#
# `None` is a real and necessary declaration, not a hole: it means THIS BASIS
# NAMES NO KIND, decide the row from `aid_instrument` or the amounts. State-aid
# registers are the case — `satr_aid_element` is the aid element of a grant, a
# loan or a guarantee alike, and the register's own `aid_instrument` code is
# both present and more authoritative.
#
# ── Why the declaration outranks the amounts, and not the other way round ──
# The amount columns are a PAYLOAD, not a kind. `cdti_loan` records its loans
# in `grant_amount_eur` and `ndb_guarantee` records guarantees in
# `debt_amount_eur`; reading the kind off whichever column is populated calls
# both of them wrong. The declaration is checked first for the same reason
# `aid_instrument` is checked before it: a statement about the instrument beats
# an inference from a number.
CAPITAL_BY_BASIS: dict[str, str | None] = {
    # ── Equity, incl. convertibles ─────────────────────────────────────────
    # A stake, or an instrument that becomes one. This is the direction where a
    # wrong call costs a founder the most — it puts a cap-table investor in
    # front of someone who never asked for one — so nothing is here on the
    # strength of its label alone.
    "htgf_equity": "equity",
    "almi_invest_equity": "equity",
    "eic_fund_equity_unpublished": "equity",
    "tesi_equity": "equity",
    "cdp_vc_equity": "equity",
    "coparion_equity": "equity",
    "ndb_equity": "equity",
    "invest_nl_equity": "equity",
    "enterprise_ireland_equity": "equity",
    "eifo_round_marker": "equity",
    "bpifrance_fond": "equity",
    # EIT KIC venture arms. See extract_eit.py: the KICs run BOTH equity
    # portfolios and equity-free accelerators, and which one a cohort belongs
    # to is a per-cohort fact read off the KIC's own page, not a property of
    # "EIT".
    "eit_kic_equity": "equity",
    # SPRIND holds stakes and lends convertibly under SPRINDFG s.1(4)(1)-(2):
    # "Beteiligungen ... erwerben" and "Darlehen einschliesslich Wandeldarlehen
    # vergeben". Dilutive, and the only SPRIND facet that is.
    "sprind_equity_convertible": "equity",

    # ── Debt ───────────────────────────────────────────────────────────────
    "ndb_loan_commitment": "loan",
    "bdns_loan_aid_element": "loan",
    "cdti_loan": "loan",
    "eib_debt_commitment": "loan",
    "ndb_guarantee": "guarantee",

    # ── Grant: non-dilutive cash, nothing repaid, no stake ─────────────────
    # The set that did not exist. Every one of these is a basis whose source
    # hands out grants; where the source also publishes amounts the old cascade
    # already reached the same answer from the numbers, so declaring it changes
    # nothing for those rows and rescues the amount-less ones.
    "horizon_eu_grant": "grant",
    "eic_eu_grant": "grant",
    "if_eu_grant": "grant",
    "edf_eu_ceiling": "grant",
    "chips_ju_total_public": "grant",
    "kdt_grant": "grant",
    "chp_grant": "grant",
    "ihi_grant": "grant",
    "eurohpc_grant": "grant",
    "euspa_grant": "grant",
    "edctp3_grant": "grant",
    "clean_aviation_grant": "grant",
    "eu_rail_grant": "grant",
    "sesar_grant": "grant",
    "sns_grant": "grant",
    "ipcei_state_aid": "grant",
    "ipcei_satr_granted": "grant",
    "ademe_grant": "grant",
    "bdns_grant": "grant",
    "cdti_grant": "grant",
    "innofond_grant": "grant",
    "innosuisse_project_grant_total": "grant",
    "tacr_public_support_total": "grant",
    "iuk_grant_offer_gbp_converted": "grant",
    "ndb_grant": "grant",
    "ndb_grant_total_award": "grant",
    # Enterprise Ireland's Commercialisation Fund, Innovation Partnership and
    # DTIF are grants. The RD&I Fund is the exception and its Terms of Reference
    # say so: "Funding will normally be in the form of an RD&I grant but may be
    # offered in the form of equity or a Convertible loan note (CLN), at the
    # discretion of Enterprise Ireland". The trigger is qualitative, so it
    # cannot be encoded as a threshold, and the four rows sharing this basis are
    # one event each and fail the data floor -- none is publishable today. If
    # `enterprise_ireland_rd` ever becomes offerable it must NOT be presented as
    # flatly non-dilutive; split the basis then, with the ToR as the source.
    "enterprise_ireland_grant": "grant",
    "eit_kic_grant": "grant",
    # SPRIND. Challenges and Validierung are pre-commercial procurement --
    # "vorkommerzielle Auftragsvergabe", with "das gesamte geistige Eigentum ...
    # bei den Teams" -- and F&E Foerderung is a Zuwendung. The legal forms
    # differ; the founder-facing property this vocabulary is organised by does
    # not. All three are cash that is never repaid and takes no stake, which is
    # what the intake's "Grants -- non-dilutive, no payback" option asks for.
    # The legal distinction stays visible in the basis label itself.
    "sprind_challenge_funke": "grant",
    "sprind_validation_study": "grant",
    "sprind_grant": "grant",
    "sprind_rd_grant": "grant",
    # France Relance industrial measures, harvested from the Ministry's own
    # open dataset (data.economie.gouv.fr/explore/dataset/plan-de-relance), and
    # the single largest instrument this defect was hiding: 2,835 awards, every
    # one amount-less because the dataset publishes no amount column at all.
    # The DGE measure sheet for the two dominant measures states the form
    # outright -- "Subvention : jusqu'a 60% selon taille, maturite..." and "Le
    # financement apporte par l'Etat est sous forme de subvention" -- and the
    # Cour des comptes records that repayable advances and equity were
    # considered for exactly these measures and NOT retained. See
    # project-mgmt/findings/workstream_av_capital_type.md.
    "fr_innov_grant": "grant",

    # ── Support, and no capital ───────────────────────────────────────────
    # The programme's own page says participants receive services, coaching or
    # membership and no money. Real objects, correctly described, and not
    # something this product may offer under a capital heading -- withheld at
    # the corpus boundary, by declaration, in
    # web/lib/intelligence/offerableAxes.ts.
    "eit_kic_nonfinancial": "non_financial",

    # ── Consulted the official source; it does not say ────────────────────
    # Distinct from `unknown`, which means nobody looked. This is a finished
    # piece of work with a negative result, and conflating the two would make
    # the debt uncountable: the ratchet can only go to zero if the honest
    # unknowables are not sitting inside it.
    "eit_kic_undetermined": "undetermined",
    # RETIRED. Replaced per cohort by extract_eit.py, which reconciles its own
    # rows on every run. Kept declared so a corpus loaded before that ran
    # produces a withheld row rather than halting an unrelated load -- and
    # `undetermined` is the truthful reading of the old label, which asserted
    # support of an unstated kind.
    "eit_kic_support": "undetermined",

    # ── The basis names no kind; decide from aid_instrument or amounts ─────
    # NOT an omission. A state-aid register's aid element is the aid element of
    # whatever instrument was notified, and the register says which in its own
    # `aid_instrument` column, which `row_capital_type` consults first.
    "satr_aid_element": None,
    "satr_nominal_amount": None,
    "sudop_aid_element": None,
    # Spain's BDNS residual bucket: the register itself declined to classify
    # these, so neither can we.
    "bdns_other": None,
    # SPRIND's own residual facet, one row. Same reasoning.
    "sprind_other": None,
}

# (2) SATR's own aid_instrument codes (GBER-derived, government-assigned —
# more authoritative than the basis label when present).
# Every key here must have an entry in reference/register_instruments.json
# carrying the register's OWN words for the code, and the value must be the kind
# those words name. `ETL/schema/check_register_instrument_kinds.py` fails the
# build otherwise -- see that file for what the silence cost.
SATR_INSTRUMENT_MAP = {
    # G is Guarantee and DG is Direct Grant. They were transposed here from the
    # day the map was written: both read "grant", and `Garanti` three lines down
    # proves the target value existed and was simply never given. The register's
    # own words settle it -- SATR labels these codes "Guarantee" (17,023 awards)
    # and "Direct grant/ Interest rate subsidy" -- and so does
    # ETL/lib/satr_filters.py, which has carried `# Guarantee (generic)` next to
    # this bid since the extractor was written.
    #
    # The cost of the typo was not eleven rows. It was every guarantee the
    # register publishes: the state_aid_satr channel held 546 grants, 85 loans,
    # 27 tax credits and ZERO guarantees against a feed publishing 17,023
    # guarantee awards. SA.57625 Fondo di garanzia per le PMI -- the corpus's
    # fifth-largest instrument by euro, whose own text reads "La garanzia e'
    # attivabile solo a fronte di finanziamenti concessi da banche" -- was
    # rendered to founders as "Grant (national government, state aid)" and was
    # excluded from every founder who asked for guarantees.
    "StateAidInstrumentG": "guarantee", "StateAidInstrumentDG": "grant",
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
    "Garanti": "guarantee",
    # PRC is "Provision of risk capital" in the register's own vocabulary
    # (ETL/lib/satr_filters.py lists it under the EQUITY instrument pass, and
    # SATR's label text on all 16 awards reads exactly that). Risk capital is
    # equity, not a guarantee: it sat in the guarantee slot only because that
    # slot was, until the line above, the one no register code could reach.
    "StateAidInstrumentPRC": "equity",
    "StateAidInstrumentPRVRISKFIN": "equity",
    "StateAidInstrumentOFEI": "equity",
}


def row_capital_type(basis: str | None, aid_instrument: str | None,
                      grant_eur: float | None, equity_eur: float | None,
                      debt_eur: float | None) -> str:
    """What kind of capital this one award was, in order of authority.

    The order is the point. A statement about the instrument -- the register's
    own aid_instrument code, then our declared basis -- outranks an inference
    from which euro column happens to be populated, because the euro columns
    are a payload and several sources put a loan in `grant_amount_eur`.
    """
    if aid_instrument and aid_instrument in SATR_INSTRUMENT_MAP:
        return SATR_INSTRUMENT_MAP[aid_instrument]
    declared = CAPITAL_BY_BASIS.get(basis) if basis is not None else None
    if declared is not None:
        return declared
    populated = [t for t, v in
                 (("grant", grant_eur), ("equity", equity_eur), ("loan", debt_eur))
                 if v and v > 0]
    if len(populated) == 1:
        return populated[0]
    if len(populated) > 1:
        return "blended"
    # Reached only by a row with no aid_instrument, a basis DECLARED to name no
    # kind (or none at all), and no amounts. That is a genuine collection gap
    # and `unknown` is the honest word for it. It is not reachable by any
    # intake option and the product withholds such a row deliberately -- see
    # web/lib/intelligence/offerableAxes.ts.
    return "unknown"


def assert_bases_declared(conn) -> None:
    """Every grant_amount_basis in the events table must be declared above.

    The load FAILS rather than producing instruments no founder can reach. A
    new source arriving with an undeclared basis is the exact event that
    stranded nine instruments, and it is silent by nature: the rows load, the
    instrument builds, the build stays green, and the fund is simply never in
    anybody's pool. Failing here turns that into one question with an official
    answer -- what does this source hand out?
    """
    found = {r[0] for r in conn.execute(
        "SELECT DISTINCT grant_amount_basis FROM public_funding_events") if r[0]}
    undeclared = sorted(found - set(CAPITAL_BY_BASIS))
    if undeclared:
        raise SystemExit(
            "populate_funding_instruments: undeclared grant_amount_basis "
            f"value(s): {', '.join(undeclared)}\n"
            "  Every basis must state what kind of capital its source hands "
            "out, in CAPITAL_BY_BASIS.\n"
            "  Go to the source's own page and answer: grant, loan, guarantee, "
            "equity, tax_credit,\n  non_financial (support but no capital), or "
            "None if the basis names no kind and the\n  row's aid_instrument / "
            "amounts must decide. Do NOT guess -- an instrument typed wrong "
            "in\n  the equity direction puts a cap-table investor in front of a "
            "founder who never asked."
        )


def family_capital_type(counter: Counter) -> tuple[str, str]:
    """Majority vote across a family's per-row capital types. Returns
    (capital_type, basis note). 'blended' if no type clears 60% and more
    than one real KIND OF CAPITAL is present.

    `non_financial` and `undetermined` vote like any other value -- they are
    recorded facts about the programme, not absences -- but they may not
    produce `blended`. `blended` is read downstream as "a mixture of kinds of
    capital, so no stated preference can rule it out", and it is admitted to
    every founder's pool on that reading. A split between "pays a grant" and
    "pays nothing" is not that: it is a family we cannot describe in one word,
    and the honest word for that is `undetermined`, which is withheld.
    """
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
        kinds = {k: v for k, v in real.items()
                 if k not in ("non_financial", "undetermined")}
        if len(kinds) == len(real):
            return "blended", f"split vote {dict(real)}"
        return "undetermined", f"split vote across capital and non-capital {dict(real)}"
    return top_type, f"majority row vote ({top_n}/{total})"


def named_by_institution_registry(family: str) -> bool:
    """Does the NDB label registry name the institution behind this family?

    `prettify` answers two different questions and returns a string either way,
    so its callers could not tell "Bpifrance", which the NDB registry names,
    from "SATR Pt Equity", which is the family key with the underscores taken
    out. Anything that has to know which branch ran asks here.
    """
    ndb_id = classify_ndb_from_source(family + "_")
    return bool(ndb_id and ndb_id in ALL_NDB_LABELS)


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
    # ── Rows that became offerable when their capital type was recorded ─────
    # These four were unreachable by every founder, so nobody ever read their
    # names and the deterministic prettifier's output went unexamined: it was
    # producing "EIT Climate KIC Asa", "EIT Climate KIC Cdr" and "Fr Relance
    # Industrie" from the source slug. Fixing what a fund IS put those strings
    # in front of founders for the first time, which makes them this
    # workstream's problem and not a pre-existing one.
    #
    # Named from the programme's own page, same standard as
    # reference/programme_names.json: the name a founder would recognise
    # and could search for, not an expansion invented here.
    "eit_climate_kic_asa": "EIT Climate-KIC Amazon Sustainability Accelerator",
    "eit_climate_kic_cdr": "EIT Climate-KIC Carbon Removal ClimAccelerator",
    "eit_rawmaterials_portfolio": "EIT RawMaterials equity portfolio",
    # data.economie.gouv.fr/explore/dataset/plan-de-relance -- "Plan de relance
    # - Projets industriels". The measures behind these 2,835 awards are the
    # industrial volet: soutien a l'investissement industriel dans les
    # territoires, (re)localisation, modernisation des filieres.
    "fr_relance_industrie": "France Relance — soutien à l'investissement industriel",
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

    RETURNS ROLLUP IDS, because that is what the caller compares: `main()` tests
    `source_to_family(event.source) in split_targets`, and `source_to_family`
    yields ids like `satr_be_rnd`.

    THIS FUNCTION HAD DRIFTED FROM ITS ONLY CALLER, in the way this repo has a
    rule about. Commit 64f82e79 introduced it AND an inline copy of the same
    query in `main()`, in the same commit -- and the two were never the same
    query. `main()` selected `id`; this selected `source_family_bucket`, which
    is the channel label `'state_aid_satr'`, the SAME string for all 35 rollups.
    So this one returned a set that could never intersect the ids the caller
    tests, while `main()` used its own copy and worked.

    Nothing failed, because nothing called this. A second definition of a rule
    is a defect the moment it exists, and this one was born wrong: it sat for
    ten days as a correct-looking helper that would have silently switched the
    scheme split off for all 22 countries the first time anyone wired it in.

    There is now one definition and `main()` calls it. `test_split_value_space.py`
    asserts the PROPERTY that made the drift dangerous -- that the set used as a
    membership test is drawn from the same value space as the values tested
    against it, since disjoint means dead -- rather than this query's column
    name, which the next refactor would rename its way around.
    """
    return {r[0] for r in conn.execute(
        "SELECT DISTINCT id FROM funding_instruments "
        "WHERE id LIKE 'satr\\_%' ESCAPE '\\' "
        "  AND (parent_id IS NULL OR parent_id = '')")}


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
    "scheme_end_date", "scheme_end_date_basis",
    "successor_scheme", "successor_title",
    "delivery_region", "delivery_region_share", "recipient_region_mix",
    "tier", "root_id", "depth", "path",
)

# ── Columns this pass writes but may not BLANK ───────────────────────────────
# column -> the column whose NULL means "this pass has nothing to say". Measured
# on 2026-11-06 against the production table: a rebuild from the same events set
# 127 scheme_end_date (basis `call_deadline`, written by fetch_ademe_windows.py and
# load_bdns_open_calls.py AFTER this step) and 118 administering_body (the
# convocatoria's own body) to NULL, because those facts come from a later step
# and not from events. The SQLite pipeline put them back minutes later; between
# the two, founders were served the blanks, and a run that died in between kept
# them. A value this pass cannot derive never displaces one somebody else wrote.
# A value it CAN derive still replaces the old one (a new deadline is news).
FILL_ONLY: dict[str, str] = {
    "administering_body": "administering_body",
    "scheme_end_date": "scheme_end_date",
    "scheme_end_date_basis": "scheme_end_date",   # the pair moves together
}

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


def child_key(row, fam: str, split_targets: set[str],
              programme_split: set[str]) -> tuple[str, str, str] | None:
    """Which child row this event belongs to, or None if its family does not split.

    A state-aid rollup is a whole country's aid regime in one row: the right
    unit for the curated eligibility layer, which is written against the
    regime's framework document, and the wrong unit for a founder, who cannot
    apply to "French R&D state aid". Underneath it sit real granting bodies
    running real notified schemes, and this is the key that separates them.

    A PROGRAMME child is keyed on the programme's own name, which is also what
    the child will be called; nothing is synthesised, so a source publishing no
    name simply does not split. A SCHEME child is keyed on (granting body,
    notified scheme) -- who a founder approaches, and the legal identity of the
    money.

    ONE DEFINITION, because two callers derive rows from it: the full rebuild in
    `main()`, and `recompute_capital_types.py`, which corrects one derived
    column in place without destroying the eligibility layer. A comment in
    `main()` has pointed at "child_key()" since the split was written and no
    such function existed -- so the recompute path never had the key, silently
    skipped every child, and left the founder-facing rows carrying whatever
    capital type the last full rebuild gave them. That is how 13,892 awards of
    `Fondo di garanzia per le PMI` stayed labelled `grant` through a corrected
    map.
    """
    prog = (row["programme_name"] or "").strip() if row["programme_name"] else ""
    if prog and row["source"] in programme_split:
        return (fam, prog[:200], "")
    if fam in split_targets and row["granting_authority"] and row["call_id"]:
        return (fam, row["granting_authority"][:200], row["call_id"])
    return None


def child_instrument_id(fam: str, authority: str, scheme: str) -> str:
    """The row id a `child_key` becomes. Same reason as `child_key`: ids must be
    derived in one place, because the reconcile step cannot tell an id that
    changed shape from an instrument that vanished.

    `scheme` empty means a programme child: there is no notified scheme code,
    the programme name IS the identity, and `child_slug` truncates to 48
    characters -- programme names are long and share prefixes, so a digest of
    the FULL name keeps ids unique and stable across runs.
    """
    if not scheme:
        return f"{fam}__{child_slug(authority)}_{_name_digest(authority)}"
    return f"{fam}__{child_slug(scheme)}__{child_slug(authority)}"


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


def seed_framework_gates(conn, instruments: list[dict]) -> int:
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
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'filter', 'human_verified', %s,
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


def seed_inventory_gates(conn, fam_aid_objective_votes: dict[str, Counter]) -> int:
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
            VALUES (%s, 'gber_article_inferred', %s, %s, %s, %s, 'programme_fact', 'none',
                    'register_derived', %s, CURRENT_TIMESTAMP)
            ON CONFLICT (instrument_id, gate_key) DO UPDATE SET
              gate_family=excluded.gate_family,
              -- encode_article_intensity.py rewrites `requirement` with the
              -- article's statutory ceiling and sets value_spec. Re-seeding the
              -- bare article text over it blanked 270 encoded ceilings until
              -- that step ran again. Same article + an encoding = keep its text.
              requirement=CASE WHEN eligibility_gates.value_spec IS NOT NULL
                                AND eligibility_gates.value IS NOT DISTINCT FROM excluded.value
                               THEN eligibility_gates.requirement
                               ELSE excluded.requirement END,
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


def externally_owned(conn, produced: set[str]) -> set[str]:
    """Instrument rows this pass did not derive and therefore may not delete.

    THE FAILURE THIS ENCODES. `funding_instruments` has two provenances. This
    pass AGGREGATES it from `public_funding_events` — every row it makes is a
    fund some award was paid out of. Other scripts INSERT into the same table
    additively from registers of funds that have paid out nothing we hold:
    `harvest_bdns_open_calls.py` writes 88 live Spanish convocatorias, each with
    a fetched `eligibility_text` and gates extracted from it, and two Italian
    frameworks were hand-curated straight in. All of them carry zero events, by
    construction and permanently — an OPEN call has no award history yet.

    The reconcile below deletes gates whose instrument "disappeared". It read
    disappearance as "not in this pass's output", which is true of every one of
    those rows on every run. So a routine rebuild deleted 90 real instruments
    and 629 gates encoded from their own published text — not stale rows, not
    duplicates the split collapses, just rows this pass was never the author of.

    THE PROPERTY, not the id prefix. Matching `bdns_conv_%` would be a register
    of today's one importer, and the next one would be deleted the day it
    landed. What holds without knowing any importer is: this pass derives
    instruments FROM events, and it is the only writer of `event_count`, so a
    row it does not produce AND that carries no events cannot ever have been its
    output. It belongs to whoever inserted it, and this pass has nothing to say
    about whether it is still current.

    A row that DID come from events and no longer does keeps its stale positive
    count, is not returned here, and is still reconciled away — which is the
    behaviour the reconcile exists for.
    """
    return {
        iid for iid, in conn.execute(
            "SELECT id FROM funding_instruments "
            " WHERE COALESCE(event_count, 0) = 0")
        if iid not in produced
    }


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
                    help="no-op, kept for old command lines: the rebuild no longer "
                         "deletes anything, so there is nothing to force")
    ap.add_argument("--signals-only", action="store_true",
                    help="update only the columns the ranker scores on "
                         "(sector_mix, recipient_region_mix, delivery_region*) "
                         "and write nothing else; safe to re-run")
    add_holdout_flags(ap)
    args = ap.parse_args()

    # ONE transaction: the whole rebuild lands, or none of it does. The SQLite
    # version committed once at the end too, but a crash between its DELETE
    # and its INSERT left a half-empty table on disk; here it cannot.
    with connect(rows=True) as conn:
        build(conn, args)


def build(conn, args: argparse.Namespace) -> None:
    """Everything main() used to do with its connection. See main()."""
    # Before anything is written: does every source in the events table say
    # what kind of capital it hands out? A basis nobody has declared builds an
    # instrument carrying `unknown`, which no intake option can reach, which
    # means a fund no founder can ever be shown -- silently, and with a green
    # build. See CAPITAL_BY_BASIS.
    assert_bases_declared(conn)
    # ── The two columns here that are FITTED SIGNALS, not descriptions ───────
    #
    # Most of what this script writes describes the corpus: how many events a
    # fund has, what it typically pays, who administers it. A founder reads
    # those and nothing grades them.
    #
    # `sector_mix` and `recipient_region_mix` are different in kind. The ranker
    # SCORES on them -- `sectorFit` in fit.ts and shortlist.ts, and the region
    # footprint that orders same-name siblings -- and the recall harness grades
    # that ranking by replaying companies out of the very events table these
    # are counted from. So each test company was voting once for its own
    # answer. Measured on the active set before this was closed:
    #
    #   95.7% of pairs   the won fund's mix counted the replayed company itself
    #    5.8% of pairs   that vote was the ONLY reason the won fund showed the
    #                    founder's sector at all -- a pure answer key
    #     22%            median share of the won fund's own-sector count that
    #                    came from recall-set companies
    #
    # The holdout removes only the VOTE, never the row: event counts, award
    # percentiles, totals and every published corpus statistic are untouched,
    # because those are descriptions and are not graded. See
    # ETL/lib/recall_holdout.py for why this is a default rather than a flag.
    holdout = resolve_holdout(args, conn)
    holdout.report()
    # ONE definition, in split_families(). This was an inline copy of that
    # query, introduced in the same commit as the function it duplicates, and
    # already selecting a different column from it. See split_families().
    split_targets = split_families(conn)

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
    # ── The contract that buys, and the one extractor that broke it ───────
    # Reading from the data means this split is only ever as good as the
    # column's contract, and the contract is narrow: `programme_name` must
    # name an OFFER -- a thing a founder can apply to. It is not "whatever
    # label the feed attaches to an award".
    #
    # extract_innovate_uk.py mapped GtR's `grantCategory` here, and
    # grantCategory classifies awards: its 35 values mix competition formats,
    # phases of one retired programme, government departments and one value
    # called "Unknown". The split did exactly what it is written to do and
    # manufactured sixteen rows no founder can apply to, which then sat at
    # mean sibling class 16.0 with nothing recorded on any facet -- the worst
    # country in the corpus, and not fixable by fetching text, because the
    # rows were never funds. See that extractor and
    # project-mgmt/findings/workstream_t_gb.md.
    #
    # The detector already exists and is the one to re-run after adding a
    # programme split to any source: scripts/measure_sibling_by_country.ts. A
    # legitimate split makes siblings DISTINGUISHABLE; a classification
    # dressed as a split leaves every child identical to every other, which is
    # what a mean class equal to the child count means.
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
        HAVING COUNT(*) >= %s AND COUNT(DISTINCT programme_name) > 1
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
        # The one vote a replayed company must not cast. See the holdout note
        # in main(): the row still counts everywhere else, so nothing the
        # corpus publishes about itself moves -- only the graded signal does.
        leaked_company = r["company_id"] in holdout.ids
        if r["sector_top"] and not leaked_company:
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
        key = child_key(r, fam, split_targets, programme_split)
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
            # Same rule one level down. A child inherits its parent's mix when
            # it has none of its own, so a child whose only sector evidence was
            # a test company now reads its regime's mix -- which is the honest
            # answer, not a silent zero.
            if r["sector_top"] and not leaked_company:
                c["sectors"][r["sector_top"]] += 1

    families = set(fam_events)
    all_ids = families | SYNTHETIC_PARENTS | {fid for fid, _ in FRAMEWORK_INSTRUMENTS}
    print(f"{len(families)} real families, {len(all_ids)} total rows incl. synthetic parents + frameworks")

    def top(counter: Counter):
        return counter.most_common(1)[0][0] if counter else None

    now = []
    # Families whose name is nothing but a mechanical re-casing of their own id
    # and whose feed has not said whether that key came from a source record or
    # from our own query partitioning. Collected across the whole pass and
    # raised once at the end, so a new feed gets ONE list to answer rather than
    # a rebuild that dies on its first family and hides the other nine.
    undeclared_families: set[str] = set()
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
            name_source = "curated"
            capital_type, capital_basis = "framework", "framework record (no events)"
            country = "EU"
            ndb_id = None
            source_family_bucket = None
            sample_titles = None
        else:
            name = OVERRIDE_NAMES.get(fam) or prettify(fam)
            # ── Who named this row ───────────────────────────────────────────
            # A mechanical re-casing of the family key is not a name, it is the
            # id with its underscores taken out, and the corpus has to say so:
            # eleven such labels were reaching founders' menus as funds. Which
            # of the two `prettify` produced cannot be read off the row, so the
            # answer is DECLARED per feed in
            # reference/family_name_evidence.json and asserted below.
            # See ETL/lib/name_evidence.py for the property and the over-fire
            # that makes inference unusable here.
            if fam in OVERRIDE_NAMES:
                name_source = "curated"
            elif named_by_institution_registry(fam):
                name_source = "deterministic"
            else:
                decl = declaration_for(fam)
                if decl is None:
                    undeclared_families.add(fam)
                    name_source = "deterministic"
                elif decl["names"] == NAMES_PARTITION_KEY:
                    name_source = NAME_SOURCE_PARTITION_KEY
                else:
                    name_source = "deterministic"
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
            name_source=name_source,
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

    # Before anything is written. A family nobody has answered for is a row the
    # corpus cannot say is a fund, and shipping it either way is a guess: keep
    # it and a register artefact reaches a founder's menu as an offer; drop it
    # and a real fund vanishes from every founder in its country.
    if undeclared_families:
        raise SystemExit(undeclared_error(sorted(undeclared_families)))

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
        child_id = child_instrument_id(fam, authority, scheme)
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
    # The attribution itself lives in nuts_regions.staged_region_mix, because
    # emit_region_prior.py needs the identical one to build the artifact the
    # ranker sorts siblings by. Two copies of it would let the column shown to
    # a founder and the score that chose the row describe different corpora.
    #
    # And the same holdout, for the same reason: emit_region_prior.py excludes
    # the recall companies and this passed nothing, so the two DID describe
    # different corpora -- one function, called twice, over two populations.
    # The docstring promising they could not was true of the attribution and
    # not of its input.
    staged = staged_region_mix(conn, holdout.ids)
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
    # reference/programme_names.json; anything the agency itself never
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
            WHERE s.instrument_id = %s AND e.programme_name IS NOT NULL
              AND TRIM(e.programme_name) <> ''
            GROUP BY 1 ORDER BY n DESC, 1""", (row["id"],)).fetchall()
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
    # REQUIRED, not optional. Without it this pass names 452 SATR schemes after
    # the body that granted them, drops 448 notified durations and 55 successors
    # -- and does so silently, because the file is gitignored and the cron's
    # filesystem starts empty. Measured 2026-11-06. It now comes from grounding
    # by pinned sha256 when it is not on disk, and its absence stops the build.
    _cases_path = ROOT / "data" / "raw" / "state_aid_cases" / "cases.json"
    if not _cases_path.exists():
        from grounded_inputs import materialise  # noqa: PLC0415
        materialise("state_aid_cases")
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

        # `caseLinks` is directional, so the traversal is built once, both ways,
        # and every reader of the field in this file goes through it.
        _edges = link_map(cases)

        # The register's word on a scheme's NOTIFIED DURATION -- which is not
        # the same thing as its closure, and reading it as one hid 306 leaves on
        # 2026-08-06 including `Fondo di garanzia per le PMI`. A GBER measure is
        # routinely prolonged and our snapshot of the register lags it, so
        # `caseMeasureEndDate` in the past means "the notification we last saw
        # has run out", not "the scheme stopped". 94% of these dates fall on
        # 12-30 or 06-29, the statutory boundary days: a real closure date would
        # be spread across the calendar.
        #
        # So the date is written WITH its basis, and the single liveness test in
        # ETL/lib/liveness.py decides what to do with it -- for a notified
        # duration, an award granted after expiry is evidence of prolongation,
        # because aid may not lawfully be granted under an expired measure.
        _today = date.today().isoformat()
        for row in now:
            sa = (row.get("scheme_code") or "").strip()
            rec = cases.get(sa) or {}
            end = _one(rec, "caseMeasureEndDate")[:10]
            if not end:
                continue
            row["scheme_end_date"] = end
            row["scheme_end_date_basis"] = NOTIFIED_DURATION
            if end >= _today:
                continue
            closed += 1
            # A prolonged scheme gets a new SA number, so "ended" often means
            # "superseded". Naming the successor turns a dead end into a
            # redirection; only a successor still running counts.
            #
            # The traversal is SYMMETRIC (`live_successor` -> `link_map`).
            # This loop used to iterate the case's OWN `caseLinks`, and the
            # Commission files each edge once on whichever side it pleases, so
            # a successor that recorded the link on ITS record was invisible:
            # 15 instruments across 14 schemes, against 40 found forward-only,
            # measured by wsHF and written by wsHN. Those 15 founders were
            # shown a dead end while the register named the replacement.
            succ, title = live_successor(sa, cases, _edges, _today)
            if succ:
                row["successor_scheme"] = succ
                row["successor_title"] = title
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

        # ── The consequence of the skip above, repaired ──────────────────
        # CASE_TITLE_NOT_A_SCHEME is right that an evaluation plan is not a
        # scheme. What it never asserted is what those rows are called
        # INSTEAD, and the answer was the loader's fallback: the granting
        # BODY. Twenty-two rows reached founders as "Finanzamt Aachen-Stadt",
        # "MFW SL" and "Ministère de l'économie et des finances" -- names that
        # no ranker and no reader can choose over a sibling, because they say
        # only who signs the cheque.
        #
        # The register itself holds the answer and this file already parses
        # the field: an evaluation-plan case LINKS the scheme it evaluates.
        # See ETL/lib/scheme_title.py for the property, the both-ways link map
        # (SA.40391's link exists only on the other side) and the refusal to
        # guess when a case links to two schemes.
        #
        # Fires ONLY on a row whose name folds equal to its granting body, so
        # it can never touch a row the pass above named, and its worst case is
        # to leave a defect that check_body_named_rows.ts then reports.
        repaired = repair_body_named_rows(now, cases)
        applied = [r for r in repaired if r["applied"]]
        if applied:
            print(f"  renamed {len(applied)} rows named after their granting body "
                  f"from the scheme their register record links")
        for r in repaired:
            if not r["applied"]:
                print(f"  UNRESOLVED body-named row {r['instrument_id']}: {r['reason']}")

    _names_path = ROOT / "reference" / "programme_names.json"
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

    # ── --signals-only: refresh the graded columns and nothing else ──────────
    #
    # The recall holdout depends on the recall SETS, which change far more
    # often than the corpus does. Every time one is added, `sector_mix` and the
    # region footprint are stale in exactly the way that inflates a number, and
    # the only way to refresh them was this function's full DELETE-and-INSERT
    # of funding_instruments -- a rebuild that re-derives 400 columns from
    # whatever the events table happens to hold today, reconciles the gate
    # layer, and is documented at the top of this file as something not to run
    # casually.
    #
    # Nobody will do that to close a leak, so the leak stays. This mode makes
    # the safe action the cheap one: recompute by the SAME code path above --
    # not a second aggregation that could disagree with it -- and write back
    # only the four columns the holdout touches. Idempotent, additive, and it
    # cannot orphan a gate or erase a fetched description.
    #
    # Run it after ANY change to a recall set, then re-export and re-publish.
    if args.signals_only:
        cols = ("sector_mix", "recipient_region_mix",
                "delivery_region", "delivery_region_share")
        for row in now:
            row.setdefault("recipient_region_mix", None)
            row.setdefault("delivery_region", None)
            row.setdefault("delivery_region_share", None)
        live = {r[0] for r in conn.execute("SELECT id FROM funding_instruments")}
        before = {r[0]: r[1:] for r in conn.execute(
            f"SELECT id, {', '.join(cols)} FROM funding_instruments")}
        touched = [r for r in now if r["id"] in live]
        changed = sum(1 for r in touched
                      if before.get(r["id"]) != tuple(r[c] for c in cols))
        conn.executemany(
            f"UPDATE funding_instruments SET {', '.join(f'{c} = %({c})s' for c in cols)}, "
            f"updated_at = CURRENT_TIMESTAMP WHERE id = %(id)s", touched)
        # A row this pass produces that the table does not hold means the two
        # have diverged for reasons that have nothing to do with the holdout,
        # and a targeted refresh is the wrong tool for that. Say so; do not
        # quietly write a partial corpus.
        absent = [r["id"] for r in now if r["id"] not in live]
        print(f"signals-only: {changed:,} of {len(touched):,} instruments changed "
              f"on ({', '.join(cols)})")
        if absent:
            print(f"  NOTE: {len(absent):,} rows this pass produces are not in the "
                  f"table at all; a full rebuild is owed. e.g. {absent[:3]}")
        return

    # ── Write: UPSERT what this pass derives, and delete NOTHING ─────────────
    #
    # The SQLite version deleted every row it authored and re-inserted it, then
    # restored the columns it does not own from a snapshot. In Postgres that
    # cannot run at all -- eligibility_gates, eligibility_clauses,
    # funding_instrument_sources and parent_id all hold foreign keys into this
    # table (no cascade), so the DELETE is refused the moment one curated gate
    # exists -- and it should not run: a delete-and-reinsert is a moment when
    # every served row is gone, and the snapshot-and-restore is a second copy of
    # "which columns are ours" that a new column could fall through.
    #
    # So each produced row is UPSERTED, writing BUILT_COLUMNS and nothing else.
    # Every other column (description, eligibility_text, catchments,
    # route_status, ... and anything added tomorrow) is never in the statement,
    # so it cannot be displaced: that is the same protection the snapshot gave,
    # now by construction instead of by restore. The end state is the one the
    # SQLite pass reached, proven against it in
    # ETL/schema/consolidate/prove_refresh_port.py.
    #
    # ── What is NOT deleted, deliberately ─────────────────────────────────────
    # The SQLite pass deleted an instrument it no longer derived ("vanished"),
    # together with every gate, clause and application row on it, and it would
    # do that to up to 20% of the curated gate layer without --force. The
    # owner's rule (2026-08-19) is union and insert-only for encodings: a gate
    # is the expensive layer, an instrument row is a cheap fact. A vanished
    # instrument therefore STAYS, with its gates, and is reported by id so a
    # human decides; it carries its last event_count, so externally_owned()
    # still never mistakes it for somebody else's row. On the 2026-11-05 corpus
    # there are none. `--force` is kept as an accepted no-op for old command lines.
    produced = {r["id"] for r in now}
    existing = {r[0] for r in conn.execute("SELECT id FROM funding_instruments")}
    external = externally_owned(conn, produced)
    vanished = sorted(existing - produced - external)
    if external:
        print(f"  external: {len(external):,} instrument rows this pass does not "
              f"derive (zero events) are kept, not reconciled")
    if vanished:
        print(f"  VANISHED: {len(vanished):,} instruments are no longer derived from "
              f"any event. KEPT with their gates (never deleted); review: "
              f"{', '.join(vanished[:10])}{' ...' if len(vanished) > 10 else ''}")
    curated = conn.execute(
        """SELECT COUNT(*) FROM eligibility_gates
            WHERE value_spec IS NOT NULL OR gate_role IS NOT NULL""").fetchone()[0]
    print(f"  reconciled: nothing deleted; {curated:,} curated gates kept")

    # Defaulted here rather than at each construction site: `now` is built in
    # three places (families, children, frameworks), so a key added to one is
    # silently missing from the others -- which is exactly the binding error
    # this replaces.
    for _row in now:
        _row.setdefault("scheme_end_date", None)
        _row.setdefault("scheme_end_date_basis", None)
        _row.setdefault("successor_scheme", None)
        _row.setdefault("successor_title", None)
        _row.setdefault("delivery_region", None)
        _row.setdefault("delivery_region_share", None)
        _row.setdefault("recipient_region_mix", None)

    # Postgres types the columns SQLite did not: is_framework is BOOLEAN.
    types = dict(conn.execute(
        "SELECT column_name, data_type FROM information_schema.columns "
        "WHERE table_schema = current_schema() AND table_name = 'funding_instruments'"
    ).fetchall())
    missing = [c for c in ("id",) + BUILT_COLUMNS if c not in types]
    if missing:
        raise SystemExit(f"funding_instruments lacks {missing}: apply the migrations "
                         f"(ETL/events/load/migrations/apply.py all) first")
    booleans = {c for c in BUILT_COLUMNS if types[c] == "boolean"}

    def bind(r: dict) -> dict:
        return {c: (None if r[c] is None else bool(r[c])) if c in booleans else r[c]
                for c in ("id",) + BUILT_COLUMNS}

    cols = ("id",) + BUILT_COLUMNS

    def assign(c: str) -> str:
        guard = FILL_ONLY.get(c)
        if guard is None:
            return f"{c} = excluded.{c}"
        return (f"{c} = CASE WHEN excluded.{guard} IS NULL "
                f"THEN funding_instruments.{c} ELSE excluded.{c} END")
    upsert = (
        f"INSERT INTO funding_instruments ({', '.join(cols)}, updated_at) VALUES "
        f"({', '.join(f'%({c})s' for c in cols)}, CURRENT_TIMESTAMP) "
        f"ON CONFLICT (id) DO UPDATE SET "
        + ", ".join(assign(c) for c in BUILT_COLUMNS)
        + ", updated_at = CURRENT_TIMESTAMP")
    kept = conn.execute(
        "SELECT " + ", ".join(
            f"COUNT(*) FILTER (WHERE {c} IS NOT NULL)" for c in FILL_ONLY)
        + " FROM funding_instruments WHERE id = ANY(%s)",
        ([r["id"] for r in now if any(r.get(g) is None for g in FILL_ONLY.values())],)
    ).fetchone()
    # Parents before children: parent_id is a foreign key into this table.
    by_id = {r["id"]: r for r in now}

    def depth_of(r: dict, seen: int = 0) -> int:
        p = r.get("parent_id")
        return 0 if not p or p not in by_id or seen > 20 else 1 + depth_of(by_id[p], seen + 1)
    ordered = sorted(now, key=lambda r: (depth_of(r), r["id"]))
    with conn.cursor() as cur:
        cur.executemany(upsert, [bind(r) for r in ordered])
    if any(kept):
        print("  fill-only: kept values this pass could not derive -- "
              + ", ".join(f"{c} on <= {n}" for c, n in zip(FILL_ONLY, kept) if n))

    # funding_instrument_sources: a derived link table, rewritten for the rows
    # this pass authors only. External and vanished rows keep their links.
    want = {(fam, src) for fam, srcs in fam_sources.items() for src in srcs}
    have = {(i, s) for i, s in conn.execute(
        "SELECT instrument_id, source FROM funding_instrument_sources")}
    stale = sorted(p for p in have if p[0] in produced and p not in want)
    with conn.cursor() as cur:
        cur.executemany("DELETE FROM funding_instrument_sources "
                        "WHERE instrument_id = %s AND source = %s", stale)
        cur.executemany(
            "INSERT INTO funding_instrument_sources (instrument_id, source) "
            "VALUES (%s, %s) ON CONFLICT DO NOTHING", sorted(want - have))

    # Families AND their scheme children. The child's own votes win where an id
    # appears in both, because a scheme's article is the more specific claim.
    n_gates = seed_inventory_gates(
        conn, {**fam_aid_objective_votes, **child_aid_objective_votes})
    n_excl = seed_framework_gates(conn, now)
    print(f"funding_instruments: {len(now)} rows")
    print(f"funding_instrument_sources: {sum(len(s) for s in fam_sources.values())} rows")
    print(f"eligibility_gates (Tier 0.5, inventory_inferred): {n_gates} rows")
    print(f"eligibility_gates (framework rules): {n_excl} rows")


if __name__ == "__main__":
    main()
