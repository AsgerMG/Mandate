"""A technology sector must be LICENSED by evidence about the company itself.

THE FAILURE THIS ENCODES. Aleph Alpha, an AI company, was published

    "Bayerische Richtlinien fuer die Foerderung von Film-, Fernseh- und anderen
     audiovisuellen Projekten"

at row 4 of its memo. wsCY established it was not the ranker: the embedding
scored that scheme 843rd of 1,088, correctly. It was the corpus. The scheme's
`sector_mix` read 69% `software_data_ai`, because its recipients -- Constantin
Film, Pantaleon Films, Megaherz, Suedkino Filmproduktion -- carried
`software_data_ai / gaming_media` as their sector. A fund that reads as 69%
concentrated on software over 20 awards is, to the sector prior, an AI fund.

The same shape is everywhere the corpus records who took a grant rather than
what they do. Hotels that took an ADEME tourism-transition grant read as
`energy_cleantech`. A wholesaler that installed a charge point under the German
Foerderrichtlinie Elektromobilitaet reads as `energy_cleantech /
ev_charging_infrastructure`. Motor dealers read as `mobility_transport`.

THE PROPERTY, not a register of wrong schemes.

    `sector_top` is a claim about what a company's core business BUILDS. Only
    evidence about the company's own activity licenses it. A grant is evidence
    about the PROGRAMME, never about its recipient. The company's official
    registered activity descriptor is the highest-ranking evidence there is
    (Rule Zero), so where EVERY official descriptor on record NAMES an activity
    with no technology, science or engineering dimension, no technology sector
    may be claimed.

Nothing in that names a fund, a country or a sector, and the test below runs on
descriptors this corpus has never seen. Three boundaries carry the weight, and
each has its own case here:

  * The veto is ASYMMETRIC. A coarse official code may not move a company from
    one technology sector to another -- project text about what is being built
    is better evidence than "MANUFACTURING". It may only refuse a technology
    claim it contradicts outright. A wrongly-reclassified company is a fund a
    founder never sees.
  * A code must NAME an activity to veto one. Residual and holding
    registrations name none. miDiagnostics is registered under management
    consultancy and is a diagnostics company.
  * SILENCE IS NOT A VETO. A descriptor the codebook does not recognise is not
    evidence that the company sits outside technology.

Credential-free and instant -- no corpus, no network, no model. Runs in CI on
every pull request, where the corpus never can.

Run: python3 ETL/events/transform/test_sector_evidence.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "lib"))

from classify_taxonomy import (  # noqa: E402
    NACE_NONTECH, NACE_UNSPECIFIC, SECTOR_TOPS, TAXONOMY,
    names_no_activity, names_nontech_activity, resolve_nace, technology_veto,
)

FAILURES: list[str] = []


def check(cond: bool, msg: str) -> None:
    if not cond:
        FAILURES.append(msg)


# ── 1. The case that started it, and its siblings ────────────────────────────
# Every one of these is an official NACE descriptor observed on a company the
# corpus labelled with a technology sector.
VETOED = [
    "Motion picture, video and television programme production activities",
    "Motion picture, video and television programme production, sound recording"
    " and music publishing activities",
    "SECTION J - PUBLISHING, BROADCASTING, AND CONTENT PRODUCTION AND"
    " DISTRIBUTION ACTIVITIES",
    "Television programming and broadcasting activities",
    "Hotels and similar accommodation",
    "Restaurants and mobile food service activities",
    "Wholesale trade, except of motor vehicles and motorcycles",
    "Retail sale of automotive fuel in specialised stores",
    "Sale of motor vehicles",
    "Rental and operating of own or leased real estate",
    "Advertising agencies",
    "Sports activities and amusement and recreation activities",
    "Libraries, archives, museums and other cultural activities",
    "General public administration activities",
    "Activities of other membership organisations n.e.c.",
    "Other personal service activities",
    "Travel agency and tour operator activities",
    "Landscape service activities",
]
for d in VETOED:
    check(technology_veto([d]), f"should veto a technology claim: {d!r}")


# ── 2. What must NEVER be vetoed ─────────────────────────────────────────────
# (a) Descriptors that license a technology sector through the NACE backbone.
LICENSED = [
    "Computer programming activities",
    "Other software publishing",
    "Manufacture of basic pharmaceutical products",
    "Manufacture of electronic components",
    "Production of electricity",
    "Human health and social work activities",
    "Growing of cereals (except rice), leguminous crops and oil seeds",
]
for d in LICENSED:
    check(not technology_veto([d]), f"licenses a technology sector, must not veto: {d!r}")

# (b) Residual and holding registrations -- they name no activity.
UNSPECIFIC = [
    "Business and other management consultancy activities",
    "Management consultancy activities",
    "Activities of head offices",
    "Office administrative, office support and other business support activities",
    "Activities of holding companies and financing conduits",
    "Other professional, scientific and technical activities n.e.c.",
    "Public relations and communication activities",
]
for d in UNSPECIFIC:
    check(not technology_veto([d]),
          f"names no activity, must not veto (miDiagnostics is registered under "
          f"one of these and builds diagnostics): {d!r}")
    check(names_no_activity(d), f"should be recognised as unspecific: {d!r}")
    check(not names_nontech_activity(d),
          f"an unspecific code must not also read as a named non-technology "
          f"activity: {d!r}")

# (c) SILENCE IS NOT A VETO. A descriptor the codebook has never seen -- which
#     is what most future descriptors are -- licenses nothing and vetoes
#     nothing. Without this the rule would silently reclassify every company
#     whose register uses wording we have not met.
UNKNOWN = [
    "Manufacture of exotic widget assemblies n.e.c.",
    "Collaborative R&D",
    "ART. 25 AYUDAS A PROYECTOS DE INVESTIGACION Y DESARROLLO.",
    "ADEME | Tremplin pour la transition ecologique des PME",
    "",
    "   ",
]
for d in UNKNOWN:
    check(not technology_veto([d]),
          f"unrecognised descriptor is not evidence of anything, must not veto: {d!r}")
check(not technology_veto([]), "a company with no official descriptor must not be vetoed")


# ── 3. The asymmetry: a veto is a refusal, never a re-assignment ─────────────
# A company carrying BOTH a named non-technology activity and a code that
# licenses a technology sector keeps its technology claim. A manufacturer that
# also runs a shop is a manufacturer.
MIXED = [
    ["Retail sale of other goods in specialised stores", "Manufacture of electronic components"],
    ["Hotels and similar accommodation", "Computer programming activities"],
    ["Advertising agencies", "Research and experimental development on biotechnology"],
]
for tags in MIXED:
    check(not technology_veto(tags),
          f"one licensing code is enough to keep the technology claim: {tags!r}")

# And the ordering must not matter -- the veto is a property of the record, not
# of which descriptor the extractor happened to write first.
for tags in MIXED:
    check(technology_veto(list(reversed(tags))) == technology_veto(tags),
          f"veto must not depend on descriptor order: {tags!r}")


# ── 4. The codebook is a codebook, not a register ────────────────────────────
# Every entry must be a fragment of an ACTIVITY descriptor. If any entry were a
# fund name, a company name, a country or one of our own sector labels, this
# would have stopped being a classification of economic activity and become a
# list of things we decided were wrong today.
OUR_OWN_VOCABULARY = set(SECTOR_TOPS) | {s for subs in TAXONOMY.values() for s in subs}
for frag in NACE_NONTECH + NACE_UNSPECIFIC:
    check(frag == frag.lower(),
          f"codebook fragments are matched case-insensitively and must be "
          f"stored lowercase: {frag!r}")
    check(frag.strip() == frag and frag.strip() != "", f"blank or padded fragment: {frag!r}")
    check(frag.replace(" ", "_") not in OUR_OWN_VOCABULARY,
          f"a codebook of OFFICIAL activity must not name one of our own sector "
          f"labels: {frag!r}")

# No fragment may sit in both lists: a descriptor cannot both name an activity
# and name none.
check(not (set(NACE_NONTECH) & set(NACE_UNSPECIFIC)),
      f"a fragment is in both codebooks: {set(NACE_NONTECH) & set(NACE_UNSPECIFIC)}")

# A non-technology fragment must never be a substring of a descriptor the NACE
# backbone reads as a TECHNOLOGY sector. That would be a codebook that
# contradicts itself, and it is exactly how "social work" would have swallowed
# NACE section R -- the section that contains hospitals.
for frag in NACE_NONTECH:
    top, _ = resolve_nace([frag])
    check(top in (None, "other"),
          f"non-technology fragment {frag!r} is read by the NACE backbone as "
          f"the technology sector {top!r}; the codebook contradicts itself")


if FAILURES:
    print(f"FAIL: {len(FAILURES)} property violation(s)\n")
    for f in FAILURES:
        print(f"  - {f}")
    sys.exit(1)
print("ok - a technology sector is claimed only where evidence licenses it "
      f"({len(VETOED)} vetoed, {len(LICENSED) + len(UNSPECIFIC) + len(UNKNOWN)} "
      f"protected, {len(NACE_NONTECH)} codebook entries)")
