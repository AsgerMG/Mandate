"""Frozen SATR filter bid lists.

The EC State Aid Transparency Register exposes aid instrument and objective
taxonomies as Spring 'bid' identifiers (e.g. StateAidInstrumentPRC). These
lists target the Wincent scope: innovation + strategic industrial
policy + net-zero/decarbonisation public capital deployment.

Sprint 15 scope revision (2026-05-29): the original "equity instruments OR
R&D objectives" filter caught only ~0.4% of NL state aid (20 of 4,800 rows
in NL 2023). The user wanted innovation + IPCEI-style strategic industrial
policy + net-zero industrial scale-up — the EU's full strategic-industrial-
policy frame, not just R&D-tax-credit-style aid.

The revised filter is **objective-driven** (we catch any instrument under
the relevant objectives) with a complementary equity-instrument safety net.

EXCLUDES:
  - Agricultural, fisheries, forestry, rural development (Agri/Aber/Fber/Mare blocks)
  - Audio-visual (Art. 54), Sport (Art. 55), Culture (Art. 53)
  - Natural-disaster / damage compensation
  - Training aid (Art. 31-33), Employment aid for disabled / disadvantaged (Art. 32-35)
  - COVID emergency umbrella (specific notified objectives)

INCLUDES:
  - All GBER R&D + Innovation block (Art. 21-30, with 2022/2023 revisions)
  - SME investment aid (Art. 17, 23, 24)
  - Net-Zero / decarbonisation (Art. 36 family, 38 family, 41, 46, 47, 40, 48)
  - IPCEI (AR79411)
  - Notified RDI / risk finance / SME (AR79419, AR79421, 6938, 6952, 6955)

Sources: GET /public/objectives/{CountryBID} and /public/aidInstruments/{CountryBID}
"""
from __future__ import annotations

# ----------------------------------------------------------------------------
# Equity / risk-capital aid instruments (safety-net pass)
# ----------------------------------------------------------------------------
# These are the SATR instrument bids that correspond to capital-deployment
# (vs. straight subsidy / tax exemption / direct grant). With the broader
# objective filter, most rows here are also caught by objectives, but we
# keep this pass to catch equity events under unusual objectives.

EQUITY_INSTRUMENTS: tuple[str, ...] = (
    "StateAidInstrumentPRC",         # Provision of risk capital
    "StateAidInstrumentPRVRISKFIN",  # Provision of risk finance
    "StateAidInstrumentOFEI",        # Other forms of equity intervention
    "StateAidInstrumentSubordDebt",  # Subordinated debt
    "StateAidInstrumentLradv",       # Loan / repayable advances
    "StateAidInstrumentSL",          # Soft loan
    "StateAidInstrumentG",           # Guarantee (generic)
    "StateAidInstrumentGuar",        # Guarantee (Commission-decision variant)
)


# ----------------------------------------------------------------------------
# Strategic objectives — innovation + IPCEI + net-zero industrial
# ----------------------------------------------------------------------------

RND_OBJECTIVES: tuple[str, ...] = (
    # -- R&D and innovation (GBER Art. 25 family) --
    "StateAidObjectiveGberArt25",
    "StateAidObjective2022GberArt25",
    "StateAidObjective2023GberArt25",
    "StateAidObjectiveGberArt25a",
    "StateAidObjective2022GberArt25a",
    "StateAidObjective2023GberArt25a",
    "StateAidObjectiveGberArt25b",
    "StateAidObjective2022GberArt25b",
    "StateAidObjective2023GberArt25b",
    "StateAidObjectiveGberArt25c",
    "StateAidObjective2022GberArt25c",
    "StateAidObjective2023GberArt25c",
    "StateAidObjectiveGberArt25d",
    "StateAidObjective2022GberArt25d",
    "StateAidObjective2023GberArt25d",
    "StateAidObjectiveGberArt25e",
    "StateAidObjective2023GberArt25e",
    # Sub-section bids surfaced in the SATR API
    "StateAidObjectiveGberArt252a",  # Fundamental research
    "StateAidObjectiveGberArt252b",  # Industrial research
    "StateAidObjectiveGberArt252c",  # Experimental development
    "StateAidObjectiveGberArt252d",  # Feasibility studies

    # Research infrastructures
    "StateAidObjectiveGberArt26",
    "StateAidObjective2022GberArt26",
    "StateAidObjective2023GberArt26",
    "StateAidObjectiveGberArt26a",   # Testing & experimentation infra
    "StateAidObjective2023GberArt26a",

    # Innovation clusters / innovation aid / process innovation
    "StateAidObjectiveGberArt27",
    "StateAidObjective2022GberArt27",
    "StateAidObjective2023GberArt27",
    "StateAidObjectiveGberArt28",
    "StateAidObjective2022GberArt28",
    "StateAidObjective2023GberArt28",
    "StateAidObjectiveGberArt29",
    "StateAidObjective2022GberArt29",
    "StateAidObjective2023GberArt29",

    # Generic R&D and notified R&D&I
    "StateAidObjective6948",         # Research and development
    "StateAidObjective7034",         # Experimental development (Art. 31.2.c)
    "StateAidObjective7036",         # Innovation advisory & support services (Art. 36)
    "StateAidObjectiveAR79419",      # Notified Research, development and innovation

    # -- Risk finance / risk capital --
    "StateAidObjectiveGberArt21",
    "StateAidObjective2022GberArt21",
    "StateAidObjective2023GberArt21",
    "StateAidObjectiveGberArt21a",
    "StateAidObjective2023GberArt21a",
    "StateAidObjective6955",         # Notified Risk capital
    "StateAidObjectiveAR79421",      # Notified Risk finance

    # -- Start-ups --
    "StateAidObjectiveGberArt22",
    "StateAidObjective2022GberArt22",
    "StateAidObjective2023GberArt22",

    # -- SME investment aid (Art. 17 family + 23, 24) --
    "StateAidObjectiveGberArt17181920",  # Investment aid to SMEs (Art. 17)
    "StateAidObjective6922",         # SME investment and employment aid (Art. 15)
    "StateAidObjective6938",         # Notified Aid to SMEs
    "StateAidObjective6952",         # SMEs generic
    "StateAidObjectiveGberArt23",    # Alternative trading platforms for SMEs
    "StateAidObjectiveGberArt24",    # Scouting costs for SMEs

    # -- InvestEU SME financing --
    "StateAidObjectiveGberArt56e10",

    # -- IPCEI / Important Projects of Common European Interest --
    "StateAidObjectiveAR79411",      # Execution of an IPCEI

    # -- Net-zero / decarbonisation / clean industrial (Art. 36 family) --
    "StateAidObjectiveGberArt36",
    "StateAidObjective2023GberArt36",
    "StateAidObjective2023GberArt36a",  # Recharging / refuelling infra
    "StateAidObjectiveGberArt36a",
    "StateAidObjective2023GberArt36b",  # Clean vehicles / zero-emission
    # Art. 38 family (energy efficiency)
    "StateAidObjectiveGberArt38",
    "StateAidObjective2023GberArt38",
    "StateAidObjective2023GberArt38a",
    "StateAidObjectiveGberArt39",
    "StateAidObjectiveGberArt391",
    # Cogeneration
    "StateAidObjectiveGberArt40",
    # Renewables + hydrogen
    "StateAidObjectiveGberArt41",
    "StateAidObjective2023GberArt41",
    # Renewable operating aid (Art. 42, 43)
    "StateAidObjectiveGberArt42",
    "StateAidObjectiveGberArt43",
    # District heating
    "StateAidObjectiveGberArt46",
    "StateAidObjective2023GberArt46",
    # Resource efficiency / circular
    "StateAidObjectiveGberArt47",
    "StateAidObjective2023GberArt47",
    # Energy infrastructure
    "StateAidObjectiveGberArt48",
    # Notified versions
    "StateAidObjectiveAR79417",      # Notified Renewable energy
    "StateAidObjectiveAR7948",       # Notified Energy infrastructures
    "StateAidObjectiveAR7949",       # Notified Energy efficiency
)


def filter_passes(instrument_bid: str | None, objective_bid: str | None) -> bool:
    """Defence-in-depth: True if the row matches our scope at all."""
    if instrument_bid and instrument_bid in EQUITY_INSTRUMENTS:
        return True
    if objective_bid and objective_bid in RND_OBJECTIVES:
        return True
    return False


# Short codes for filename / source-id construction.
EQUITY_SHORTCODE = "equity"
RND_SHORTCODE = "rnd"
