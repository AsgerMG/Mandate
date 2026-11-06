"""Two-tier sector taxonomy classifier (Sprint 20).

Replaces the 8-bucket `sector_inferred` (≈49% other/unclassified) with a broad
top sector (100% coverage) + a granular, CONTROLLED sub-sector. Built to power
database-native peer discovery in the /for-companies memo.

Design (see project-mgmt/plans/sprint_20_taxonomy_reclassification.md):
  * Tier 1 `sector_top`  — exactly one of 11 broad buckets (10 + `other`).
  * Tier 2 `subsector`   — one value from a fixed ~100-entry controlled vocab,
    nested under the chosen Tier 1; each sector has a `*_general` escape.
  * Programme-authoritative sources pin Tier 1 deterministically (Innovation
    Fund→energy_cleantech, EDF→defense_security, chips_ju→semiconductors).
  * Model: claude-haiku-4-5, structured JSON output. Full run uses the Anthropic
    Message Batches API (50% off); this module ships the classifier + a bake-off
    that scores Tier 1 against NACE-grounded labels before the full run.

Usage:
  python3 ETL/events/transform/classify_taxonomy.py vocab            # print + validate the taxonomy
  python3 ETL/events/transform/classify_taxonomy.py bakeoff --n 200  # accuracy + cost projection
"""
from __future__ import annotations


# --- ETL path bootstrap (auto-added; see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DATA as _ETL_DATA, ROOT as _ETL_ROOT  # noqa: E402,F401
# --- end ETL path bootstrap ---

import argparse
import json
import os
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = _ETL_ROOT

from store import connect  # noqa: E402

from classify import _classify_by_nace  # noqa: E402

DEFAULT_MODEL = "claude-haiku-4-5"
PRICES = {  # $/MTok (standard); batch halves both.
    "claude-haiku-4-5": (1.00, 5.00),
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-sonnet-5": (2.00, 10.00),  # intro until 2026-08-31, then (3.00, 15.00)
    "claude-opus-4-8": (5.00, 25.00),
    "claude-fable-5": (10.00, 50.00),
}
GOLD_MODEL = "claude-opus-4-8"   # the reference labeller (full context incl. tags)
TECH_OLD = {"life_sciences", "cleantech", "deeptech_hardware", "digital",
            "space", "defense"}

# ── The controlled taxonomy ───────────────────────────────────────────────────
# Tier 1 -> ordered Tier 2 controlled vocab (last entry is the *_general escape).
# The controlled taxonomy now lives in the ONE Mandate vocabulary
# (mandate/vocabulary/vocabulary.json, `sectors`), which both brains read.
# CAPITAL_TAXONOMY is exactly the dict that stood here: the subsectors capital
# originated, in capital's order (values added for another brain carry
# origin "mandate" and are excluded, so no corpus label moves).
# mandate/vocabulary/check.py fails if the two ever differ.
from mandate.vocabulary import CAPITAL_TAXONOMY  # noqa: E402

TAXONOMY: dict[str, list[str]] = {k: list(v) for k, v in CAPITAL_TAXONOMY.items()}

SECTOR_TOPS = list(TAXONOMY)
ALL_SUBSECTORS = [s for subs in TAXONOMY.values() for s in subs]
GENERAL = {top: subs[-1] for top, subs in TAXONOMY.items()}  # *_general per top

# Programme-authoritative Tier-1 overrides, keyed by source_family prefix.
SOURCE_OVERRIDE = {
    "innovation_fund": "energy_cleantech",
    "edf": "defense_security",
    "chips_ju": "semiconductors_electronics",
}

# Bake-off mapping: old confident sector_inferred -> acceptable new Tier 1 set.
OLD_TO_NEW = {
    "life_sciences": {"health_life_sciences"},
    "cleantech": {"energy_cleantech", "materials_chemicals"},
    # NACE 30.3 conflates air + spacecraft, so the old "space" bucket is polluted
    # with aviation; accept mobility_transport (civil aerospace) as correct too.
    "space": {"space", "mobility_transport"},
    "defense": {"defense_security"},
    "digital": {"software_data_ai"},
    # The old "deeptech_hardware" was a catch-all; it legitimately splits across
    # hardware-adjacent buckets including embedded-software and cleantech-hardware.
    "deeptech_hardware": {"semiconductors_electronics", "industrial_manufacturing",
                          "materials_chemicals", "software_data_ai",
                          "energy_cleantech", "mobility_transport", "space"},
}


ENTITY_TYPES = ["research_org", "company", "other"]


def system_prompt() -> str:
    lines = [
        "You classify a company into a TWO-TIER sector taxonomy based on WHAT THE",
        "COMPANY DOES (its core business), not on any single project or grant.",
        "",
        "Also classify entity_type: 'research_org' for universities, research",
        "institutes, hospitals, foundations, academies, and similar non-commercial",
        "research bodies; 'company' for ordinary commercial entities (startups,",
        "SMEs, corporates); 'other' for public bodies, ministries, agencies,",
        "municipalities, NGOs, and industry associations that are neither a",
        "research organisation nor a commercial company.",
        "",
        "Pick exactly ONE top sector, then ONE sub-sector from THAT sector's list.",
        "Use the sector's '*_general' sub-sector only when the evidence is too thin",
        "to choose a specific one.",
        "",
        "Prefer a specific sector with its '*_general' sub-sector over 'other'. Use",
        "top sector 'other' ONLY for businesses with no technology, science, or",
        "engineering dimension at all (retail, hospitality, wineries, generic",
        "consulting, universities, public bodies). A company with any deep-tech,",
        "software, biotech, hardware, materials, or engineering core is NEVER 'other'",
        "— place it in the closest sector, using '*_general' if unsure which sub.",
        "",
        "Taxonomy (top_sector -> allowed sub-sectors):",
    ]
    for top, subs in TAXONOMY.items():
        lines.append(f"- {top}: {', '.join(subs)}")
    lines += [
        "",
        "Examples (note: a thin-signal tech company still gets a real sector):",
        "- 'AI-driven credit-scoring platform' -> software_data_ai / fintech",
        "- a company named 'Xenovia Therapeutics', no other detail -> "
        "health_life_sciences / health_general (NOT other)",
        "- 'Recovery of lithium from spent EV batteries' -> "
        "energy_cleantech / circular_economy_recycling",
        "- 'Photonic integrated circuits for datacom' -> "
        "semiconductors_electronics / photonics_optoelectronics",
        "- a vineyard, hotel, or law firm -> other / other",
        "",
        "First note the core business in a SHORT phrase (<=8 words), then give a",
        "confidence (low/medium/high), then the labels. Reply with ONLY JSON:",
        '{"reasoning": "...", "confidence": "low|medium|high", '
        '"sector_top": "...", "subsector": "...", "entity_type": "..."}',
        "subsector MUST belong to the chosen sector_top's list above.",
    ]
    return "\n".join(lines)


SYSTEM = system_prompt()

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "reasoning": {"type": "string"},
        "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
        "sector_top": {"type": "string", "enum": SECTOR_TOPS},
        "subsector": {"type": "string", "enum": ALL_SUBSECTORS},
        "entity_type": {"type": "string", "enum": ENTITY_TYPES},
    },
    "required": ["reasoning", "confidence", "sector_top", "subsector", "entity_type"],
}


def user_prompt(name: str, country: str, titles: list[str], summaries: list[str],
                tags: list[str], sources: list[str]) -> str:
    parts = [f"Company name: {name}", f"Country: {country or 'unknown'}"]
    if titles:
        parts.append("Funded project titles:\n- " + "\n- ".join(titles[:5]))
    if summaries:
        joined = " ".join(summaries)[:300]
        parts.append("Project description: " + joined)
    if tags:
        parts.append("Reported activity tags: " + "; ".join(tags[:6]))
    if sources:
        fams = sorted({s.split("_")[0] for s in sources if s})[:6]
        parts.append("Funding programmes: " + ", ".join(fams))
    parts.append("\nClassify this company. Reply with JSON only.")
    return "\n".join(parts)


def source_override(sources: list[str]) -> str | None:
    """Programme-authoritative Tier 1, or None when no source pins it."""
    for s in sources:
        for prefix, top in SOURCE_OVERRIDE.items():
            if s and s.startswith(prefix):
                return top
    return None


def validate(sector_top: str, subsector: str) -> tuple[str, str]:
    """Force a valid (top, sub) pair; repair an out-of-vocab sub to *_general."""
    if sector_top not in TAXONOMY:
        return "other", "other"
    if subsector not in TAXONOMY[sector_top]:
        return sector_top, GENERAL[sector_top]
    return sector_top, subsector


def classify_one(client, model, name, country, titles, summaries, tags, sources,
                 apply_override=True):
    up = user_prompt(name, country, titles, summaries, tags, sources)
    r = client.messages.create(
        model=model, max_tokens=256, system=SYSTEM,
        output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
        messages=[{"role": "user", "content": up}],
    )
    text = next((b.text for b in r.content if b.type == "text"), "{}")
    data = json.loads(text)
    top, sub = validate(data.get("sector_top", "other"), data.get("subsector", ""))
    # Deterministic override wins on Tier 1 (keep the LLM's sub if it still fits).
    if apply_override:
        ov = source_override(sources)
        if ov and ov != top:
            top, sub = ov, GENERAL[ov]
    conf = data.get("confidence", "low")
    return top, sub, conf, r.usage.input_tokens, r.usage.output_tokens


# ── The NACE backbone: official activity code -> (Tier 1, Tier 2) ─────────────
# A company's NACE code is its OFFICIAL, externally-reported activity class, so it
# is the authoritative Tier-1 signal wherever present. Many NACE descriptors are
# specific enough to also pin a Tier-2 sub-sector (3rd element); where NACE only
# fixes the sector, the 3rd element is "" and Haiku picks the sub within it.
# Ordered most-specific first. Built on classify.py's NACE_TO_SECTOR; genuinely
# ambiguous codes (NACE 30.3 "air AND spacecraft", generic "Scientific R&D") are
# deliberately omitted so they fall through to the LLM rather than mis-map.
NACE_TIER: list[tuple[str, str, str]] = [
    ("Manufacture of basic pharmaceutical", "health_life_sciences", "pharma_drug_discovery"),
    ("Manufacture of pharmaceutical", "health_life_sciences", "pharma_drug_discovery"),
    ("Manufacture of medical and dental instruments", "health_life_sciences", "medical_devices"),
    ("Manufacture of irradiation, electromedical", "health_life_sciences", "medical_devices"),
    ("Research and experimental development on biotechnology", "health_life_sciences", "biotech_therapeutics"),
    ("Human health activities", "health_life_sciences", "health_general"),
    ("Hospital activities", "health_life_sciences", "health_general"),
    ("General medical practice", "health_life_sciences", "health_general"),
    ("Medical and dental practice", "health_life_sciences", "health_general"),
    ("Computer programming", "software_data_ai", ""),       # saas/fintech/cyber — needs text
    ("Computer consultancy", "software_data_ai", ""),
    ("Computer facilities management", "software_data_ai", "cloud_infrastructure"),
    ("software publishing", "software_data_ai", ""),
    ("Other information technology", "software_data_ai", ""),
    ("Data processing, hosting", "software_data_ai", "cloud_infrastructure"),
    ("Computing infrastructure, data processing", "software_data_ai", "cloud_infrastructure"),
    ("Web portals", "software_data_ai", ""),
    ("Information service activities", "software_data_ai", ""),
    ("Wired telecommunications", "software_data_ai", "telecom_networking"),
    ("Wireless telecommunications", "software_data_ai", "telecom_networking"),
    ("Manufacture of electronic components", "semiconductors_electronics", "electronics_general"),
    ("Manufacture of loaded electronic boards", "semiconductors_electronics", "pcb_components"),
    ("Manufacture of computers and peripheral", "semiconductors_electronics", "electronics_general"),
    ("Manufacture of communication equipment", "semiconductors_electronics", "electronics_general"),
    ("Manufacture of consumer electronics", "semiconductors_electronics", "electronics_general"),
    ("Manufacture of optical instruments", "semiconductors_electronics", "photonics_optoelectronics"),
    ("Manufacture of other special-purpose machinery", "industrial_manufacturing", "industrial_machinery"),
    ("Manufacture of other general-purpose machinery", "industrial_manufacturing", "industrial_machinery"),
    ("Manufacture of machine tools", "industrial_manufacturing", "industrial_machinery"),
    ("Manufacture of bearings, gears", "industrial_manufacturing", "industrial_machinery"),
    ("Production of electricity", "energy_cleantech", ""),   # solar/wind/etc — needs text
    ("Electric power generation", "energy_cleantech", ""),
    ("Transmission of electricity", "energy_cleantech", "grid_smart_grid"),
    ("Distribution of electricity", "energy_cleantech", "grid_smart_grid"),
    ("Steam and air conditioning supply", "energy_cleantech", "heat_pumps_hvac"),
    ("Distribution of gaseous fuels", "energy_cleantech", "energy_general"),
    ("Water collection, treatment and supply", "energy_cleantech", "water_wastewater"),
    ("Sewerage", "energy_cleantech", "water_wastewater"),
    ("Waste collection", "energy_cleantech", "circular_economy_recycling"),
    ("Waste treatment and disposal", "energy_cleantech", "circular_economy_recycling"),
    ("Materials recovery", "energy_cleantech", "circular_economy_recycling"),
    ("Remediation activities", "energy_cleantech", "circular_economy_recycling"),
    ("Manufacture of batteries and accumulators", "energy_cleantech", "batteries_storage"),
    ("Manufacture of food products", "agrifood", "food_processing"),
    ("Manufacture of beverages", "agrifood", "food_processing"),
    ("Manufacture of dairy", "agrifood", "food_processing"),
    ("Growing of", "agrifood", ""),
    ("Mixed farming", "agrifood", "agtech_precision_farming"),
    ("Hotels and similar accommodation", "other", "other"),
    ("Restaurants", "other", "other"),
    ("Construction of buildings", "other", "other"),
    ("Civil engineering", "other", "other"),
    ("Retail sale of", "other", "other"),
    ("Wholesale of", "other", "other"),
    ("Manufacture of furniture", "other", "other"),
    ("Real estate", "other", "other"),
    ("Activities of head offices", "other", "other"),
    # NACE section R names human health FIRST and social work second. Read as a
    # social-work descriptor it would look like an activity with no science in
    # it; it is the section that contains hospitals. It licenses health.
    ("Human health and social work", "health_life_sciences", "health_general"),
]


# ── What evidence licenses a TECHNOLOGY sector ───────────────────────────────
#
# `sector_top` is a claim about what a company's core business BUILDS, and only
# evidence about the company's OWN activity can license it.
#
# A grant is not such evidence. A grant's purpose describes the PROGRAMME, not
# the recipient: a film fund's recipients are film producers, an energy-retrofit
# fund's are hotels and hauliers, an EV-charging fund's are wholesalers who
# installed a charge point. Reading the programme back onto the recipient is how
# `sector_mix` -- the column whose whole job is to say what a fund has ACTUALLY
# funded -- came to report a Bavarian film and television scheme as 69%
# software/data/AI, and how an AI company was published that scheme at row 4 of
# its memo.
#
# Rule Zero applies to a company as it does to a fund: the OFFICIAL registered
# activity descriptor outranks anything we derived. Hence the property:
#
#     A technology sector may not be claimed for a company when EVERY official
#     activity descriptor on its record NAMES an activity that has no
#     technology, science or engineering dimension.
#
# Three things this deliberately is NOT.
#
# 1. It is not a re-mapping of one technology sector onto another. A coarse
#    official code ("MANUFACTURING") is WEAKER evidence than project text about
#    what is being built, and never overrides it. The official code may only
#    VETO a technology claim it contradicts outright. That asymmetry is the
#    point: a wrongly-reclassified company is a fund a founder never sees, so
#    the rule is allowed to say "no evidence for any technology sector" and is
#    not allowed to say "a different technology sector".
#
# 2. It is not a list of wrong companies, funds or sectors. The subject is the
#    OFFICIAL NACE codebook, which is a published classification of economic
#    activity; the test below runs on any descriptor, including ones this corpus
#    has never seen.
#
# 3. A code must NAME an activity in order to veto one. Residual, holding and
#    unspecified-activity registrations name no activity at all -- they are what
#    a company registers under when it has not picked a class. miDiagnostics is
#    registered under management consultancy and is a diagnostics company; ARGON
#    Measuring Solutions is registered under management consultancy and builds
#    sensors. Those codes license nothing and veto nothing.
#
# The classifier's own instruction already says where a vetoed company belongs:
# top sector 'other' is for "businesses with no technology, science, or
# engineering dimension at all". A film production company has none. It was
# reaching `software_data_ai` because `gaming_media` sits under that sector and
# reads like a home for anyone who makes moving pictures -- a lure that turns a
# content producer into a software company.

# ── The codebook itself lives in ONE file both languages read ────────────────
# reference/activity_codebook.json. `check_sector_evidence.ts` states the
# same property over the published corpus, and a second copy of these fragments
# is exactly the defect a "keep in sync" comment announces rather than prevents.
_CODEBOOK = json.loads(
    (ROOT / "reference" / "activity_codebook.json").read_text(encoding="utf-8"))

# Official activity descriptors that NAME a specific activity with no
# technology, science or engineering dimension: content and media production,
# hospitality, trade, property, personal and administrative services, culture,
# sport, education and public administration. Software publishing is NACE
# section K, not section J, and is deliberately absent.
NACE_NONTECH: list[str] = list(_CODEBOOK["nontech"])

# Registrations that name NO activity: residual classes, holding structures and
# generic business support. They neither license nor veto. Checked BEFORE
# NACE_NONTECH so a descriptor appearing in both is treated as unspecific.
NACE_UNSPECIFIC: list[str] = list(_CODEBOOK["unspecific"])


def names_no_activity(tag: str) -> bool:
    """True when a registered descriptor is a residual/holding/unspecified class
    -- it names no activity, so it is evidence for and against nothing."""
    tl = tag.lower()
    return any(f in tl for f in NACE_UNSPECIFIC)


def names_nontech_activity(tag: str) -> bool:
    """True when a registered descriptor NAMES a specific activity that has no
    technology, science or engineering dimension."""
    if names_no_activity(tag):
        return False
    tl = tag.lower()
    return any(f in tl for f in NACE_NONTECH)


def technology_veto(tags: list[str]) -> bool:
    """The property, as a test that runs on any company.

    True when no technology sector may be claimed: at least one official
    descriptor NAMES a non-technology activity, and NONE of them licenses a
    technology sector -- neither through the NACE backbone nor by naming an
    activity this codebook does not place outside technology.

    A company carrying both kinds of code (a manufacturer that also runs a
    shop) is NOT vetoed: the technology claim still has evidence."""
    saw_nontech = False
    for t in tags:
        if not t or not t.strip():
            continue
        if names_no_activity(t):
            continue            # names nothing; skip it entirely
        top, _ = resolve_nace([t])
        if top and top != "other":
            return False        # this code licenses a technology sector
        if names_nontech_activity(t):
            saw_nontech = True
        elif top is None:
            # A descriptor this codebook does not recognise at all. It is not
            # evidence that the company is outside technology, and it must not
            # be read as such -- silence is not a veto.
            continue
    return saw_nontech


def nace_badge(tags: list[str]) -> set[str]:
    """The set of new Tier-1 sectors a company's NACE tags resolve to (most
    specific match per tag). A clean badge is a set of size exactly 1."""
    hits: set[str] = set()
    for t in tags:
        tl = t.lower()
        for sub, top, _ in NACE_TIER:   # ordered most-specific first
            if sub.lower() in tl:
                hits.add(top)
                break
    return hits


def resolve_nace(tags: list[str]) -> tuple[str | None, str | None]:
    """NACE backbone -> (Tier-1, Tier-2). Returns (top, sub) when the NACE points
    to exactly one sector (sub may be '' when NACE only fixes the sector); returns
    (None, None) when NACE is absent or ambiguous (multiple sectors)."""
    top_hits: dict[str, str] = {}   # top -> sub (first/most-specific seen)
    for t in tags:
        tl = t.lower()
        for sub, top, sub2 in NACE_TIER:
            if sub.lower() in tl:
                top_hits.setdefault(top, sub2)
                break
    if len(top_hits) != 1:
        return None, None
    top, sub2 = next(iter(top_hits.items()))
    return top, (sub2 or None)


def nace_cheatsheet() -> str:
    """Compact NACE->sector reference so the residual LLM mirrors the same scheme
    used for companies that DO carry an official NACE code."""
    by: dict[str, list[str]] = defaultdict(list)
    for sub, top, _ in NACE_TIER:
        if sub not in by[top]:
            by[top].append(sub)
    lines = ["NACE -> sector reference (how official NACE codes are mapped; mirror this):"]
    for top in SECTOR_TOPS:
        if by.get(top):
            lines.append(f"- {top}: " + "; ".join(by[top][:6]))
    return "\n".join(lines)


# Residual prompt: this company has NO official NACE code, so the model must reason
# in NACE terms and apply the documented NACE->sector scheme itself.
SYSTEM_RESIDUAL = SYSTEM + "\n\n" + (
    "IMPORTANT: this company has NO official NACE economic-activity code on file. "
    "Work the way the NACE backbone does: first infer, from the name and project "
    "text, the NACE activity class that best describes the company's CORE business; "
    "then map that activity to sector_top using the SAME scheme applied to companies "
    "that do have a NACE code (reference below); then pick the sub-sector. State the "
    "inferred NACE activity in one phrase at the start of 'reasoning'.\n\n"
    + nace_cheatsheet())


def gold_set(conn: "psycopg.Connection", n: int) -> list[dict]:
    """Companies whose NACE confirms exactly one new Tier 1. Balanced across
    sectors. NACE/tags are carried for selection only — withheld at test time."""
    rows = conn.execute("""
        SELECT c.id, c.canonical_name, c.country,
               string_agg(e.sector_tags_raw, '||' ORDER BY e.id) tags,
               string_agg(COALESCE(e.project_title,''), '||' ORDER BY e.id) titles,
               string_agg(COALESCE(e.project_summary,''), '||' ORDER BY e.id) summaries,
               string_agg(e.source, '||' ORDER BY e.id) sources
        FROM companies c JOIN public_funding_events e ON e.company_id = c.id
        WHERE e.sector_tags_raw IS NOT NULL AND TRIM(e.sector_tags_raw) != ''
        GROUP BY c.id
    """).fetchall()
    import random
    by: dict[str, list[dict]] = defaultdict(list)
    for cid, name, country, tags_s, titles_s, sums_s, sources_s in rows:
        tags = [t.strip() for t in (tags_s or "").split("||") if t.strip()]
        badges = nace_badge(tags)
        if len(badges) != 1:           # unambiguous NACE only
            continue
        top = next(iter(badges))
        by[top].append({
            "id": cid, "name": name, "country": country, "confirmed": top,
            "titles": [t.strip() for t in (titles_s or "").split("||") if t.strip()],
            "summaries": [s.strip() for s in (sums_s or "").split("||") if s.strip()],
            "sources": [s for s in (sources_s or "").split("||") if s]})
    random.seed(42)
    per = max(1, n // len(by)) if by else n
    sample: list[dict] = []
    for items in by.values():
        random.shuffle(items)
        sample.extend(items[:per])
    random.shuffle(sample)
    return sample[:n]


def gold_sample(conn: "psycopg.Connection", n: int) -> list[dict]:
    """NACE-grounded companies (NACE/tags WITHHELD from the model), but we DO hand
    the model the project titles AND summaries it would have in the real run."""
    rows = conn.execute("""
        SELECT c.id, c.canonical_name, c.country, c.sector_inferred,
               string_agg(e.sector_tags_raw, '||' ORDER BY e.id) tags,
               string_agg(COALESCE(e.project_title,''), '||' ORDER BY e.id) titles,
               string_agg(COALESCE(e.project_summary,''), '||' ORDER BY e.id) summaries,
               string_agg(e.source, '||' ORDER BY e.id) sources
        FROM companies c JOIN public_funding_events e ON e.company_id = c.id
        WHERE c.sector_inferred IN ('life_sciences','cleantech','deeptech_hardware',
                                    'digital','space','defense')
        GROUP BY c.id
    """).fetchall()
    import random
    by_sector: dict[str, list[dict]] = defaultdict(list)
    for cid, name, country, sec, tags, titles, summaries, sources in rows:
        nace_hit = None
        for t in (tags or "").split("||"):
            h = _classify_by_nace(t)
            if h in TECH_OLD:
                nace_hit = h
                break
        if nace_hit != sec:
            continue
        by_sector[sec].append({
            "id": cid, "name": name, "country": country, "truth": sec,
            "titles": [t.strip() for t in (titles or "").split("||") if t.strip()],
            "summaries": [s.strip() for s in (summaries or "").split("||") if s.strip()],
            "tags": [t.strip() for t in (tags or "").split("||") if t.strip()],
            "sources": [s for s in (sources or "").split("||") if s]})
    random.seed(42)
    per = max(1, n // len(by_sector)) if by_sector else n
    sample: list[dict] = []
    for items in by_sector.values():
        random.shuffle(items)
        sample.extend(items[:per])
    random.shuffle(sample)
    return sample[:n]


# ── commands ──────────────────────────────────────────────────────────────────

def _parse_json(text: str) -> dict:
    """Tolerant JSON parse: salvage the first {...} object if a trailing token or
    rare truncation breaks a strict json.loads (else {} -> safe 'other' fallback)."""
    try:
        return json.loads(text)
    except Exception:
        pass
    start = text.find("{")
    if start >= 0:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start:i + 1])
                    except Exception:
                        break
    return {}


def _ask(client, model, system, user, schema, max_tokens):
    # Cache the (large, identical-across-calls) system prompt — read at ~0.1x on
    # every call after the first within the cache TTL. This is the main cost lever
    # for a 140k-row batch. r.usage.input_tokens is the UNCACHED remainder.
    r = client.messages.create(
        model=model, max_tokens=max_tokens,
        system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
        output_config={"format": {"type": "json_schema", "schema": schema}},
        messages=[{"role": "user", "content": user}])
    text = next((b.text for b in r.content if b.type == "text"), "{}")
    u = r.usage
    return (_parse_json(text), u.input_tokens, u.output_tokens,
            getattr(u, "cache_read_input_tokens", 0) or 0)


def _sub_system(top: str) -> str:
    subs = TAXONOMY[top]
    return (f"A company's official NACE activity places it in sector '{top}'. That "
            f"sector is fixed. Choose the single best sub-sector from this list, "
            f"using the project text:\n- " + "\n- ".join(subs) +
            f"\nUse '{GENERAL[top]}' only if the text is too thin to choose.\n\n"
            "Also classify entity_type: 'research_org' for universities, research "
            "institutes, hospitals, foundations, academies, and similar "
            "non-commercial research bodies; 'company' for ordinary commercial "
            "entities; 'other' for public bodies, ministries, agencies, "
            "municipalities, NGOs, and industry associations.\n\n"
            'Reply JSON only: {"subsector": "...", "entity_type": "..."}')


def _sub_schema(top: str) -> dict:
    return {"type": "object", "additionalProperties": False,
            "properties": {
                "subsector": {"type": "string", "enum": TAXONOMY[top]},
                "entity_type": {"type": "string", "enum": ENTITY_TYPES},
            },
            "required": ["subsector", "entity_type"]}


# Companies whose sector is already fully fixed (deterministically or by an
# earlier LLM pass) but that have never had entity_type classified at all --
# e.g. every NEW company the deterministic NACE backbone alone resolves,
# which never touches the Sonnet/Haiku sector paths above. Minimal single-
# field Haiku call, no sector context needed.
_ENTITY_SYSTEM = (
    "Classify this company's entity_type from its name and funded project "
    "context: 'research_org' for universities, research institutes, "
    "hospitals, foundations, academies, and similar non-commercial research "
    "bodies; 'company' for ordinary commercial entities (startups, SMEs, "
    "corporates); 'other' for public bodies, ministries, agencies, "
    'municipalities, NGOs, and industry associations. Reply JSON only: '
    '{"entity_type": "..."}'
)
_ENTITY_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {"entity_type": {"type": "string", "enum": ENTITY_TYPES}},
    "required": ["entity_type"],
}


def _entity_params(item) -> dict:
    return {"model": HAIKU, "max_tokens": 24,
            "system": [{"type": "text", "text": _ENTITY_SYSTEM,
                        "cache_control": {"type": "ephemeral"}}],
            "output_config": {"format": {"type": "json_schema", "schema": _ENTITY_SCHEMA}},
            "messages": [{"role": "user", "content": _user(item)}]}


def llm_subsector(client, model, item, top):
    """NACE fixed the sector; Haiku only picks the sub-sector within it (easy)."""
    subs = TAXONOMY[top]
    schema = _sub_schema(top)
    sysp = _sub_system(top)
    up = user_prompt(item["name"], item["country"], item["titles"],
                     item["summaries"], [], item["sources"])
    data, it, ot, cr = _ask(client, model, sysp, up, schema, 48)
    sub = data.get("subsector", "")
    return (sub if sub in subs else GENERAL[top]), it, ot, cr


def llm_full(client, model, item):
    """No NACE backbone: the model infers the NACE activity and applies the
    documented NACE->sector scheme itself, then picks both tiers."""
    up = user_prompt(item["name"], item["country"], item["titles"],
                     item["summaries"], [], item["sources"])
    # max_tokens is only a truncation guard (you pay for actual output, which the
    # "<=8 words" reasoning instruction keeps low) — keep it safely above the JSON.
    data, it, ot, cr = _ask(client, model, SYSTEM_RESIDUAL, up, SCHEMA, 256)
    top, sub = validate(data.get("sector_top", "other"), data.get("subsector", ""))
    return top, sub, data.get("reasoning", ""), it, ot, cr


def classify_company(client, model, item):
    """NACE-first, Haiku-guided. Returns (top, sub, method, in_tok, out_tok)."""
    top, sub = resolve_nace(item.get("tags", []))
    if top and sub:
        return top, sub, "nace", 0, 0                      # deterministic, no LLM
    if top:                                                  # NACE fixes sector only
        sub, it, ot, _cr = llm_subsector(client, model, item, top)
        return top, sub, "nace+llm", it, ot
    ov = source_override(item.get("sources", []))
    if ov:
        return ov, GENERAL[ov], "programme", 0, 0           # IF/EDF/chips
    top, sub, _reason, it, ot, _cr = llm_full(client, model, item)  # no backbone
    return top, sub, "llm", it, ot


def random_sample(conn: "psycopg.Connection", n: int) -> list[dict]:
    rows = conn.execute("""
        SELECT c.id, c.canonical_name, c.country,
               string_agg(e.sector_tags_raw, '||' ORDER BY e.id),
               string_agg(COALESCE(e.project_title,''), '||' ORDER BY e.id),
               string_agg(COALESCE(e.project_summary,''), '||' ORDER BY e.id),
               string_agg(e.source, '||' ORDER BY e.id)
        FROM companies c JOIN public_funding_events e ON e.company_id = c.id
        GROUP BY c.id ORDER BY random() LIMIT %s""", (n,)).fetchall()
    out = []
    for cid, name, country, tags_s, titles_s, sums_s, sources_s in rows:
        out.append({"id": cid, "name": name, "country": country,
                    "tags": [t.strip() for t in (tags_s or "").split("||") if t.strip()],
                    "titles": [t.strip() for t in (titles_s or "").split("||") if t.strip()],
                    "summaries": [s.strip() for s in (sums_s or "").split("||") if s.strip()],
                    "sources": [s for s in (sources_s or "").split("||") if s]})
    return out


def cmd_sample(args) -> None:
    """Run the production NACE-first + Haiku-guided pipeline on a random draw."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY not set (checked env + .env.local)")
    import anthropic
    client = anthropic.Anthropic()

    with connect(readonly=True) as con:
        sample = random_sample(con, args.n)
    print(f"production pipeline on {len(sample)} random companies, residual model="
          f"{args.model}\n")

    method = Counter()
    in_tok = out_tok = errors = 0
    examples: list[tuple] = []

    def work(it):
        return it, classify_company(client, args.model, it)

    with ThreadPoolExecutor(max_workers=8) as ex:
        for f in as_completed([ex.submit(work, it) for it in sample]):
            try:
                it, (top, sub, m, i, o) = f.result()
            except Exception as e:
                errors += 1
                if errors <= 3:
                    print(f"  error: {e}")
                continue
            method[m] += 1
            in_tok += i
            out_tok += o
            if len(examples) < 16:
                examples.append((it["name"][:30], m, top, sub))

    n = len(sample) - errors
    print("Routing (how each company got its label):")
    labels = {"nace": "NACE deterministic (no LLM)",
              "nace+llm": "NACE sector + Haiku sub-sector",
              "programme": "programme override (no LLM)",
              "llm": "full Haiku (no NACE)"}
    no_llm = method["nace"] + method["programme"]
    for m in ("nace", "programme", "nace+llm", "llm"):
        if method[m]:
            print(f"  {labels[m]:<38} {method[m]:>4} ({100*method[m]/n:.0f}%)")
    print(f"\nDeterministic (no model call): {no_llm}/{n} = {100*no_llm/n:.0f}%")
    print(f"LLM calls needed:              {n-no_llm}/{n} = {100*(n-no_llm)/n:.0f}%")
    print("\nExamples:")
    for name, m, top, sub in examples:
        print(f"  [{m:<9}] {name:<30} -> {top} / {sub}")

    if n:
        pin, pout = PRICES.get(args.model, (1.0, 5.0))
        cost = in_tok / 1e6 * pin + out_tok / 1e6 * pout
        per_all = cost / n          # blended per-company (deterministic share = $0)
        total = 159_368
        print(f"\nCost on sample: ${cost:.4f} for {n}. Blended ${per_all:.5f}/company.")
        print(f"Projected full run ({total:,}): ~${per_all*total*0.5:.0f} batch "
              f"(no cache) — only the {100*(n-no_llm)/n:.0f}% residual hits the model.")


# ── Who may change a sector label ────────────────────────────────────────────
#
# THE PROPERTY. A label only ever gains information. No step in this file may
# blank a sector_top or subsector, or replace a curated label with a derived
# one -- whether it is writing `companies` or the `company_sector_labels` vault.
#
# WHY IT IS STATED HERE. On 2026-10-18 the weekly cron ran restore -> apply-nace
# -> run -> persist on the Railway volume and regressed 164 curated labels in
# the vault: 65 subsectors blanked, and 98 labels whose method was
# `recovered_2026_07_23` replaced by a NACE guess (an audio-engineering company
# became health). `restore` was not the culprit -- it already filled only empty
# rows. The two writers that did it:
#
#   apply-nace  recomputed EVERY company from its tags and overwrote all three
#               columns unconditionally, so a curated label became whatever the
#               NACE backbone said, a `nace_top` row lost the subsector an LLM
#               had filled, and a row NACE could not resolve was set to NULL.
#   persist     then upserted `companies` into the vault with
#               ON CONFLICT DO UPDATE, so the guess overwrote the only copy of
#               the curated label. That is what made the loss permanent: the
#               vault exists to survive exactly this, and it was the vault that
#               was written over. (It also bumped labelled_at on every row it
#               touched, which is the 31,810 timestamp-only differences.)
#
# THE RULE, one function both directions use (`merge_label`):
#   * an empty label is filled by anything;
#   * a DERIVED label -- one of the methods `cmd_apply_nace` itself writes -- is
#     replaced only by a CURATED one (any other method: an LLM pass, a
#     recovery, a human). Curated outranks derived, never the reverse;
#   * otherwise the only change allowed is filling a NULL subsector under the
#     SAME sector_top. Nothing is ever blanked and no sector_top ever moves.
# Two curated labels never displace each other: the first one stays.
#
# A deliberate re-label from new evidence (a better codebook, corrected tags)
# is therefore not something a routine run can do. That is the point: it must
# be its own reviewed change, not a side effect of a weekly refresh.
APPLY_NACE_METHODS = ("nace", "nace_top", "programme")
DERIVED_METHODS = frozenset(APPLY_NACE_METHODS)


def is_curated(method: str | None) -> bool:
    return bool(method) and method not in DERIVED_METHODS


def merge_label(have: tuple, new: tuple) -> tuple | None:
    """The label to store when `new` meets `have`, or None to leave `have` alone.

    Both are (sector_top, subsector, method). See the block above for the rule.
    """
    h_top, h_sub, h_method = have
    n_top, n_sub, n_method = new
    if not n_top:
        return None                                   # nothing to give
    if not h_top:
        return (n_top, n_sub or None, n_method)       # fill an empty label
    if is_curated(n_method) and not is_curated(h_method):
        # Curated outranks derived. Never lose a subsector doing it: a curated
        # label without one keeps the derived one's only if the sector agrees.
        sub = n_sub or (h_sub if h_top == n_top else None)
        merged = (n_top, sub, n_method)
        return merged if merged != (h_top, h_sub, h_method) else None
    if h_top == n_top and not h_sub and n_sub:
        return (h_top, n_sub, h_method)               # fill the missing tier
    return None


def nace_label(tags: list[str], sources: list[str]) -> tuple:
    """What the deterministic backbone says about one company: (top, sub, method),
    all None when it says nothing. Pure, so the rule above can be tested on it."""
    top, sub = resolve_nace(tags)
    if top and sub:
        return top, sub, "nace"
    if top:
        return top, None, "nace_top"          # Tier-1 fixed; Tier-2 pending LLM
    ov = source_override(sources)
    if ov:
        return ov, None, "programme"
    return None, None, None                   # fully pending LLM


def cmd_apply_nace(args) -> None:
    """Write the deterministic NACE-backbone labels to companies (no LLM).

    Fills what is empty and never displaces a label (see merge_label): on a
    corpus that is already labelled this writes nothing, which is what makes it
    safe to run every week. Leaves the LLM residual pending."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with connect() as con:
        rows = con.execute("""
            SELECT c.id, c.sector_top, c.subsector, c.sector_taxonomy_method,
                   string_agg(e.sector_tags_raw, '||' ORDER BY e.id) tags,
                   string_agg(e.source, '||' ORDER BY e.id) sources
            FROM companies c LEFT JOIN public_funding_events e ON e.company_id = c.id
            GROUP BY c.id
        """).fetchall()

        updates = []          # (sector_top, subsector, method, updated_at, id)
        method_ct = Counter()
        top_ct = Counter()
        kept = 0
        for cid, h_top, h_sub, h_method, tags_s, sources_s in rows:
            tags = [t.strip() for t in (tags_s or "").split("||") if t.strip()]
            sources = [s for s in (sources_s or "").split("||") if s]
            top, sub, method = nace_label(tags, sources)
            method_ct[method or "pending"] += 1
            if top:
                top_ct[top] += 1
            merged = merge_label((h_top, h_sub, h_method), (top, sub, method))
            if merged:
                updates.append((*merged, now, cid))
            elif top and (h_top, h_sub, h_method) != (top, sub, method):
                kept += 1     # the backbone disagrees with a label it may not move

        with con.cursor() as cur:
            cur.executemany(
                "UPDATE companies SET sector_top=%s, subsector=%s, "
                "sector_taxonomy_method=%s, sector_taxonomy_updated_at=%s WHERE id=%s",
                updates)

    total = len(rows)
    print(f"NACE backbone over {total:,} companies:")
    for m in ("nace", "nace_top", "programme", "pending"):
        if method_ct[m]:
            print(f"  {m:<10} {method_ct[m]:>7} ({100*method_ct[m]/total:.1f}%)")
    det = method_ct["nace"]
    t1 = method_ct["nace"] + method_ct["nace_top"] + method_ct["programme"]
    print(f"\nTier-1 set deterministically: {t1:,} ({100*t1/total:.1f}%)")
    print(f"Both tiers deterministic (nace): {det:,} ({100*det/total:.1f}%)")
    print(f"Awaiting LLM (Tier-2 and/or Tier-1): "
          f"{total - det:,} ({100*(total-det)/total:.1f}%)")
    print(f"\nwritten {len(updates):,} (empty labels filled or a tier completed); "
          f"{kept:,} existing labels the backbone disagrees with were left as they are")
    print("\nDeterministic Tier-1 distribution:")
    for k, v in top_ct.most_common():
        print(f"  {k:<28} {v:>7}")

SONNET = "claude-sonnet-5"       # full Tier-1+Tier-2 on the no-NACE residual
HAIKU = "claude-haiku-4-5"       # Tier-2-only on the NACE-fixed-sector rows


def _user(item) -> str:
    return user_prompt(item["name"], item["country"], item["titles"],
                       item["summaries"], [], item["sources"])


def _full_params(item) -> dict:
    # Sonnet 5 enables adaptive thinking by default; disable it so the schema
    # output keeps the whole budget. 340 ≈ old 256 + ~30% new-tokenizer headroom.
    return {"model": SONNET, "max_tokens": 340,
            "thinking": {"type": "disabled"},
            "system": [{"type": "text", "text": SYSTEM_RESIDUAL,
                        "cache_control": {"type": "ephemeral"}}],
            "output_config": {"format": {"type": "json_schema", "schema": SCHEMA}},
            "messages": [{"role": "user", "content": _user(item)}]}


def _sub_params(item, top) -> dict:
    return {"model": HAIKU, "max_tokens": 48,
            "system": [{"type": "text", "text": _sub_system(top),
                        "cache_control": {"type": "ephemeral"}}],
            "output_config": {"format": {"type": "json_schema", "schema": _sub_schema(top)}},
            "messages": [{"role": "user", "content": _user(item)}]}


def _load_work(con):
    """Returns (full_items, sub_items, entity_items).
    full = no Tier-1 yet (Sonnet, sets sector+subsector+entity_type).
    sub = Tier-1 fixed by NACE/programme but Tier-2 missing (Haiku, sets
      subsector+entity_type).
    entity_only = sector fully fixed (any method) but entity_type never
      classified -- e.g. every company the NACE backbone alone resolves,
      which never touches the sector paths above (Haiku, entity_type only).
    Resumable: only unfinished work is returned each time."""
    def rows(where):
        return con.execute(f"""
            SELECT c.id, c.canonical_name, c.country, c.sector_top,
                   string_agg(COALESCE(e.project_title,''), '||' ORDER BY e.id),
                   string_agg(COALESCE(e.project_summary,''), '||' ORDER BY e.id),
                   string_agg(e.source, '||' ORDER BY e.id)
            FROM companies c JOIN public_funding_events e ON e.company_id = c.id
            WHERE {where} GROUP BY c.id""").fetchall()

    def pack(r):
        return {"id": r[0], "name": r[1], "country": r[2], "top": r[3],
                "titles": [t.strip() for t in (r[4] or "").split("||") if t.strip()],
                "summaries": [s.strip() for s in (r[5] or "").split("||") if s.strip()],
                "sources": [s for s in (r[6] or "").split("||") if s]}

    full = [pack(r) for r in rows("c.sector_taxonomy_method IS NULL")]
    sub = [pack(r) for r in rows(
        "c.sector_taxonomy_method IN ('nace_top','programme') AND c.subsector IS NULL")]
    entity_only = [pack(r) for r in rows(
        "c.sector_top IS NOT NULL AND c.entity_type_updated_at IS NULL")]
    return full, sub, entity_only


def cmd_run(args) -> None:
    """Split-model batch run: Sonnet (full) on no-NACE residual, Haiku (sub-only) on
    NACE-fixed-sector rows. Submits Message Batches, polls, writes labels back.

    The work list is read in one short transaction and each batch's results are
    written in their own: a batch can take hours, and a Postgres transaction held
    open across that would sit idle on a proxy that drops quiet sockets."""
    with connect(readonly=True) as con:
        full, sub, entity_only = _load_work(con)
    if args.limit:
        full = full[:args.limit]
        sub = sub[:max(0, args.limit // 4)]
        entity_only = entity_only[:max(0, args.limit // 4)]

    # custom_id encodes kind+id; keep an id->top map for sub write-back.
    requests = [{"custom_id": f"f{it['id']}", "params": _full_params(it)} for it in full]
    requests += [{"custom_id": f"s{it['id']}", "params": _sub_params(it, it["top"])} for it in sub]
    requests += [{"custom_id": f"e{it['id']}", "params": _entity_params(it)} for it in entity_only]
    top_of = {f"s{it['id']}": it["top"] for it in sub}

    est = (len(full) * 0.0021 + len(sub) * 0.0004 + len(entity_only) * 0.0002) * 0.5
    print(f"work: {len(full):,} full (Sonnet) + {len(sub):,} sub-only (Haiku) "
          f"+ {len(entity_only):,} entity-only (Haiku) = {len(requests):,} requests")
    print(f"estimated batch cost (cached): ~${est:.0f}")
    if args.dry_run:
        print("dry-run: not submitting.")
        return
    if args.max_cost is not None and est > args.max_cost:
        print(f"SKIPPED: estimated ~${est:.0f} exceeds --max-cost ${args.max_cost:.0f} "
              f"-- needs manual approval (run without --max-cost, or raise it, "
              f"once you've reviewed the backlog). Not submitting.")
        return
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY not set (checked env + .env.local)")
    import time
    import anthropic
    client = anthropic.Anthropic()

    from datetime import datetime, timezone
    chunk = args.chunk
    written = errored = 0
    for start in range(0, len(requests), chunk):
        part = requests[start:start + chunk]
        batch = client.messages.batches.create(requests=part)
        print(f"  batch {start//chunk+1}: {batch.id} ({len(part)} requests) submitted")
        while True:
            b = client.messages.batches.retrieve(batch.id)
            if b.processing_status == "ended":
                break
            time.sleep(20)
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        labels: dict[int, tuple] = {}   # id -> (top, subsec, method); None = keep
        entities: list[tuple] = []      # (entity_type, entity_updated_at, id)
        for res in client.messages.batches.results(batch.id):
            cid = res.custom_id
            cid_num = int(cid[1:])
            if res.result.type != "succeeded":
                errored += 1
                continue
            text = next((bl.text for bl in res.result.message.content
                         if bl.type == "text"), "{}")
            data = _parse_json(text)
            entity = data.get("entity_type") if data.get("entity_type") in ENTITY_TYPES else None
            if cid.startswith("f"):
                top, subsec = validate(data.get("sector_top", "other"),
                                       data.get("subsector", ""))
                labels[cid_num] = (top, subsec, "llm")
            elif cid.startswith("s"):                # sub-only; Tier-1 already set
                top = top_of.get(cid, "other")
                s = data.get("subsector", "")
                subsec = s if s in TAXONOMY.get(top, []) else GENERAL.get(top, "other")
                labels[cid_num] = (top, subsec, None)    # method: keep what is there
            entities.append((entity, now, cid_num))
            written += 1
        with connect() as con:
            n = _write_labels(con, labels, now)
            with con.cursor() as cur:
                cur.executemany(
                    "UPDATE companies SET entity_type = COALESCE(%s, entity_type), "
                    "entity_type_updated_at = %s WHERE id = %s", entities)
        print(f"    written {n} sector labels, {len(entities)} entity types "
              f"(cumulative {written}, errored {errored})")

    print(f"\ndone: {written} labels written, {errored} errored.")


def _write_labels(con, labels: dict[int, tuple], now: str) -> int:
    """Write model-produced sector labels through merge_label, so a batch that
    lands after somebody else labelled the row cannot displace that label.
    A None method means "keep the row's own" (the sub-only path)."""
    if not labels:
        return 0
    have = {r[0]: r[1:] for r in con.execute(
        "SELECT id, sector_top, subsector, sector_taxonomy_method FROM companies "
        "WHERE id = ANY(%s)", (list(labels),))}
    updates = []
    for cid, (top, sub, method) in labels.items():
        if cid not in have:
            continue
        h = have[cid]
        merged = merge_label(h, (top, sub, method if method is not None else h[2]))
        if merged:
            updates.append((*merged, now, cid))
    with con.cursor() as cur:
        cur.executemany(
            "UPDATE companies SET sector_top=%s, subsector=%s, "
            "sector_taxonomy_method=%s, sector_taxonomy_updated_at=%s WHERE id=%s",
            updates)
    return len(updates)


STATE_FILE = _ETL_DATA / ".taxonomy_batches.json"


def _state_load() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"batches": [], "collected": []}


def _state_save(st: dict) -> None:
    STATE_FILE.write_text(json.dumps(st, indent=1))


def cmd_submit(args) -> None:
    """Fire-and-forget: submit all pending companies as batches, record IDs, and
    return immediately (no polling). Decoupled from the laptop — collect later."""
    with connect(readonly=True) as con:
        full, sub, _entity_only = _load_work(con)
    requests = [{"custom_id": f"f{it['id']}", "params": _full_params(it)} for it in full]
    requests += [{"custom_id": f"s{it['id']}", "params": _sub_params(it, it["top"])} for it in sub]
    print(f"submitting {len(full):,} full (Sonnet) + {len(sub):,} sub (Haiku) "
          f"= {len(requests):,} requests, ~${len(full)*0.0021*0.5 + len(sub)*0.0004*0.5:.0f}")
    if args.dry_run or not requests:
        print("dry-run / nothing to submit.")
        return
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY not set")
    import anthropic
    client = anthropic.Anthropic()
    st = _state_load()
    chunk = args.chunk
    for start in range(0, len(requests), chunk):
        part = requests[start:start + chunk]
        batch = client.messages.batches.create(requests=part)
        st["batches"].append(batch.id)
        _state_save(st)
        print(f"  submitted {batch.id} ({len(part)} requests)")
    print(f"\nall submitted. {len(st['batches'])} batch(es) recorded in {STATE_FILE.name}.")
    print("Cloud processes them (usually <1h, max 24h). Run 'collect' when ready.")


from sector_label_key import name_key as _name_key  # noqa: E402  (the ONE definition)


def _utc_stamp() -> str:
    """The text form the corpus's own timestamp defaults write (corpus_schema.sql)."""
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def plan_persist(vault: dict[str, tuple], companies: list[tuple]) -> dict[str, tuple]:
    """The vault rows to write: key -> (top, sub, method). Pure.

    `vault` is name_key -> (top, sub, method); `companies` is
    (canonical_name, country, top, sub, method) in id order. Every change goes
    through merge_label, so the vault only ever gains information: a key it has
    never seen is added, a derived row may be upgraded by a curated one, a
    missing subsector may be filled -- and nothing else. Companies sharing a key
    are merged in id order, so the outcome does not depend on which came last.
    """
    state = dict(vault)
    changed: dict[str, tuple] = {}
    for name, country, top, sub, method in companies:
        key = _name_key(name, country)
        merged = merge_label(state.get(key, (None, None, None)), (top, sub, method))
        if merged:
            state[key] = merged
            changed[key] = merged
    return changed


def plan_restore(vault: dict[str, tuple], companies: list[tuple]) -> list[tuple]:
    """The companies rows to write: (top, sub, method, id). Pure.

    `companies` is (id, canonical_name, country, top, sub, method). The vault
    label is offered to every row through merge_label: an unlabelled row is
    filled (all `restore` ever did), a derived row is upgraded by a curated
    vault label, a missing subsector is completed -- and a curated label is
    never touched."""
    out = []
    for cid, name, country, top, sub, method in companies:
        lab = vault.get(_name_key(name, country))
        if not lab:
            continue
        merged = merge_label((top, sub, method), lab)
        if merged:
            out.append((*merged, cid))
    return out


def cmd_persist(_args) -> None:
    """Copy today's sector labels into company_sector_labels, the vault.

    The vault is the copy of every label that must survive anything done to
    `companies`. An entire paid LLM pass was once lost because a label lived
    only there: 8 batches submitted, 8 recorded collected, and no row carried
    sector_taxonomy_method='llm' afterwards. So this runs after any labelling.

    It may only ADD to the vault (plan_persist / merge_label). It used to upsert
    with ON CONFLICT DO UPDATE, which is how a week's NACE guesses overwrote 164
    curated labels on 2026-10-18; see the block above merge_label.
    """
    with connect() as con:
        vault = {r[0]: r[1:] for r in con.execute(
            "SELECT name_key, sector_top, subsector, method FROM company_sector_labels")}
        rows = con.execute(
            "SELECT canonical_name, country, sector_top, subsector, sector_taxonomy_method "
            "FROM companies WHERE sector_top IS NOT NULL AND sector_top != '' "
            "ORDER BY id").fetchall()
        changed = plan_persist(vault, rows)
        stamp = _utc_stamp()
        with con.cursor() as cur:
            cur.executemany(
                "INSERT INTO company_sector_labels (name_key, sector_top, subsector, "
                "method, labelled_at) VALUES (%s, %s, %s, %s, %s) "
                "ON CONFLICT (name_key) DO UPDATE SET sector_top = EXCLUDED.sector_top, "
                "subsector = EXCLUDED.subsector, method = EXCLUDED.method, "
                "labelled_at = EXCLUDED.labelled_at",
                [(k, *v, stamp) for k, v in changed.items()])
        n = con.execute("SELECT COUNT(*) FROM company_sector_labels").fetchone()[0]
    added = sum(1 for k in changed if k not in vault)
    print(f"persisted from {len(rows):,} labelled companies: {added:,} new, "
          f"{len(changed) - added:,} completed or upgraded; store now holds {n:,}")


def cmd_restore(_args) -> None:
    """Re-apply vault labels to companies.

    Fills rows that have no label and completes or upgrades derived ones; never
    touches a curated label, so a fresh classification is never overwritten by
    an older one (plan_restore / merge_label)."""
    with connect() as con:
        vault = {r[0]: r[1:] for r in con.execute(
            "SELECT name_key, sector_top, subsector, method FROM company_sector_labels")}
        rows = con.execute(
            "SELECT id, canonical_name, country, sector_top, subsector, "
            "sector_taxonomy_method FROM companies ORDER BY id").fetchall()
        updates = plan_restore(vault, rows)
        stamp = _utc_stamp()
        with con.cursor() as cur:
            cur.executemany(
                "UPDATE companies SET sector_top=%s, subsector=%s, "
                "sector_taxonomy_method=%s, sector_taxonomy_updated_at=%s WHERE id=%s",
                [(t, s, m, stamp, cid) for t, s, m, cid in updates])
    unlabelled = sum(1 for r in rows if not r[3])
    print(f"restored {len(updates):,} labels onto companies "
          f"({unlabelled:,} were unlabelled, {len(vault):,} in the store)")


def cmd_collect(args) -> None:
    """Retrieve any ended batches recorded by 'submit' and write labels to the DB.
    Safe to re-run: collected batches are skipped, unfinished ones are left."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY not set")
    import anthropic
    from datetime import datetime, timezone
    client = anthropic.Anthropic()
    st = _state_load()
    pending_ids = [b for b in st["batches"] if b not in st["collected"]]
    if not pending_ids:
        print("no uncollected batches recorded.")
    written = errored = still = 0
    for bid in pending_ids:
        b = client.messages.batches.retrieve(bid)
        if b.processing_status != "ended":
            still += 1
            print(f"  {bid}: {b.processing_status} — leaving for later")
            continue
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        with connect() as con:
            # For sub rows we need each company's already-set Tier-1 from the DB.
            sub_tops = dict(con.execute(
                "SELECT id, sector_top FROM companies WHERE sector_top IS NOT NULL"
            ).fetchall())
            labels: dict[int, tuple] = {}
            for res in client.messages.batches.results(bid):
                cid = res.custom_id
                cid_num = int(cid[1:])
                if res.result.type != "succeeded":
                    errored += 1
                    continue
                text = next((bl.text for bl in res.result.message.content
                             if bl.type == "text"), "{}")
                data = _parse_json(text)
                if cid.startswith("f"):
                    top, subsec = validate(data.get("sector_top", "other"),
                                           data.get("subsector", ""))
                    labels[cid_num] = (top, subsec, "llm")
                else:
                    top = sub_tops.get(cid_num, "other")
                    s = data.get("subsector", "")
                    subsec = s if s in TAXONOMY.get(top, []) else GENERAL.get(top, "other")
                    labels[cid_num] = (top, subsec, None)
                written += 1
            n = _write_labels(con, labels, now)
        st["collected"].append(bid)
        _state_save(st)
        print(f"  {bid}: collected {len(labels)} labels, {n} written")
    print(f"\ncollected {written} labels ({errored} errored, {still} batch(es) still "
          f"processing). Re-run 'collect' later for any still processing.")


def cmd_residual(args) -> None:
    """Demo the NACE-guided LLM on companies with NO official NACE (method pending)."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY not set (checked env + .env.local)")
    import anthropic
    client = anthropic.Anthropic()

    with connect(readonly=True) as con:
        rows = con.execute("""
            SELECT c.id, c.canonical_name, c.country,
                   string_agg(COALESCE(e.project_title,''), '||' ORDER BY e.id),
                   string_agg(COALESCE(e.project_summary,''), '||' ORDER BY e.id),
                   string_agg(e.source, '||' ORDER BY e.id)
            FROM companies c JOIN public_funding_events e ON e.company_id = c.id
            WHERE c.sector_taxonomy_method IS NULL
            GROUP BY c.id ORDER BY random() LIMIT %s""", (args.n,)).fetchall()
    items = [{"name": r[1], "country": r[2],
              "titles": [t.strip() for t in (r[3] or "").split("||") if t.strip()],
              "summaries": [s.strip() for s in (r[4] or "").split("||") if s.strip()],
              "sources": [s for s in (r[5] or "").split("||") if s]} for r in rows]
    print(f"NACE-guided residual demo: {len(items)} no-NACE companies, model={args.model}\n")
    for it in items:
        top, sub, reason, _i, _o, _cr = llm_full(client, args.model, it)
        print(f"• {it['name'][:38]:<38} -> {top} / {sub}")
        print(f"    reasoning: {reason[:150]}")


def cmd_vocab(_args) -> None:
    print(f"Tier 1: {len(SECTOR_TOPS)} sectors")
    print(f"Tier 2: {len(ALL_SUBSECTORS)} sub-sectors "
          f"({len(set(ALL_SUBSECTORS))} unique)")
    dupes = [s for s, c in Counter(ALL_SUBSECTORS).items() if c > 1]
    assert not dupes, f"duplicate sub-sectors: {dupes}"
    for top, subs in TAXONOMY.items():
        print(f"  {top:<28} {len(subs):>2}  {', '.join(subs)}")
    print("\nvocab OK — no duplicate sub-sectors")


def cmd_bakeoff(args) -> None:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY not set (checked env + .env.local)")
    import anthropic
    client = anthropic.Anthropic()

    with connect(readonly=True) as con:
        sample = gold_sample(con, args.n)
    print(f"bake-off: {len(sample)} NACE-grounded companies, model={args.model}\n")

    agree = 0
    errors = 0
    leaked_other = 0   # tech-sector truth misrouted to 'other' (a real defect)
    conf_ct: Counter = Counter()
    agree_by_conf: Counter = Counter()
    in_tok = out_tok = 0
    confusion: Counter = Counter()
    examples: list[tuple] = []

    def work(item):
        top, sub, conf, it, ot = classify_one(
            client, args.model, item["name"], item["country"], item["titles"],
            item["summaries"], [], item["sources"])
        return item, top, sub, conf, it, ot

    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = [ex.submit(work, it) for it in sample]
        for f in as_completed(futs):
            try:
                item, top, sub, conf, it, ot = f.result()
            except Exception as e:
                errors += 1
                if errors <= 3:
                    print(f"  error: {e}")
                continue
            in_tok += it
            out_tok += ot
            acceptable = OLD_TO_NEW.get(item["truth"], set())
            ok = top in acceptable
            agree += ok
            conf_ct[conf] += 1
            agree_by_conf[(conf, ok)] += 1
            if top == "other":
                leaked_other += 1   # truth is always a tech sector here
            if not ok:
                confusion[(item["truth"], top)] += 1
            if len(examples) < 18:
                examples.append((item["name"][:30], item["truth"], top, sub, conf, ok))

    n = len(sample) - errors
    print("Sample classifications (old_sector -> new top / sub [conf]):")
    for name, truth, top, sub, conf, ok in examples:
        flag = "ok " if ok else "DIFF"
        print(f"  [{flag}] {name:<30} {truth:<18} -> {top} / {sub} [{conf}]")

    print(f"\nTier-1 agreement vs NACE-grounded label: {agree}/{n} "
          f"= {100*agree/n:.1f}%  (errors={errors})")
    print(f"'other' leakage (tech truth -> other): {leaked_other}/{n} "
          f"= {100*leaked_other/n:.1f}%  (target: near 0)")
    hi = conf_ct.get("high", 0)
    if hi:
        hi_ok = agree_by_conf.get(("high", True), 0)
        print(f"high-confidence subset: {hi}/{n} items, agreement {100*hi_ok/hi:.1f}% "
              f"(low/med are escalation candidates for Sonnet)")
    if confusion:
        print("Top Tier-1 disagreements (old_truth -> predicted):")
        for (truth, pred), c in confusion.most_common(8):
            print(f"  {truth:<18} -> {pred:<26} x{c}")

    if n:
        pin, pout = PRICES.get(args.model, (1.0, 5.0))
        cost = in_tok / 1e6 * pin + out_tok / 1e6 * pout
        per = cost / n
        total = 159_368
        print(f"\nCost: ${cost:.4f} for {n} (no cache). Per item ${per:.5f}.")
        print(f"Projected full run ({total:,}): ~${per*total*0.5:.2f} batch "
              f"(no cache) — system-prompt caching brings this materially lower.")


def subgold_set(conn: "psycopg.Connection", n: int) -> list[dict]:
    """Companies whose NACE confirms a SPECIFIC (Tier-1, Tier-2). Balanced across
    sub-sectors. NACE withheld at test time; the Tier-1 is given to the model."""
    rows = conn.execute("""
        SELECT c.id, c.canonical_name, c.country,
               string_agg(e.sector_tags_raw, '||' ORDER BY e.id) tags,
               string_agg(COALESCE(e.project_title,''), '||' ORDER BY e.id) titles,
               string_agg(COALESCE(e.project_summary,''), '||' ORDER BY e.id) summaries,
               string_agg(e.source, '||' ORDER BY e.id) sources
        FROM companies c JOIN public_funding_events e ON e.company_id = c.id
        WHERE e.sector_tags_raw IS NOT NULL AND TRIM(e.sector_tags_raw) != ''
        GROUP BY c.id
    """).fetchall()
    import random
    by: dict[str, list[dict]] = defaultdict(list)
    for cid, name, country, tags_s, titles_s, sums_s, sources_s in rows:
        tags = [t.strip() for t in (tags_s or "").split("||") if t.strip()]
        top, sub = resolve_nace(tags)
        if not top or not sub or sub == "other":   # need a specific confirmed sub
            continue
        by[sub].append({
            "id": cid, "name": name, "country": country,
            "ctop": top, "csub": sub,
            "titles": [t.strip() for t in (titles_s or "").split("||") if t.strip()],
            "summaries": [s.strip() for s in (sums_s or "").split("||") if s.strip()],
            "sources": [s for s in (sources_s or "").split("||") if s]})
    random.seed(42)
    per = max(1, n // len(by)) if by else n
    sample: list[dict] = []
    for items in by.values():
        random.shuffle(items)
        sample.extend(items[:per])
    random.shuffle(sample)
    return sample[:n]


def cmd_subtest(args) -> None:
    """Haiku 'following the NACE scheme': given the confirmed Tier-1, how good is
    its Tier-2? Scored vs the NACE-confirmed sub-sector (NACE withheld)."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY not set (checked env + .env.local)")
    import anthropic
    client = anthropic.Anthropic()

    with connect(readonly=True) as con:
        gold = subgold_set(con, args.n)
    dist = Counter(g["csub"] for g in gold)
    print(f"Sub-sector test: {len(gold)} companies, NACE-confirmed (Tier-1 given to "
          f"model, NACE withheld). model={args.model}")
    print("  sub distribution: " + ", ".join(f"{k}={v}" for k, v in dist.most_common()))
    print()

    correct = errors = in_tok = out_tok = 0
    per_sub = defaultdict(lambda: [0, 0])
    misses: list[tuple] = []

    def work(g):
        sub, it, ot, _cr = llm_subsector(client, args.model, g, g["ctop"])
        return g, sub, it, ot

    with ThreadPoolExecutor(max_workers=8) as ex:
        for f in as_completed([ex.submit(work, g) for g in gold]):
            try:
                g, sub, it, ot = f.result()
            except Exception as e:
                errors += 1
                if errors <= 3:
                    print(f"  error: {e}")
                continue
            in_tok += it
            out_tok += ot
            ok = sub == g["csub"]
            correct += ok
            per_sub[g["csub"]][1] += 1
            per_sub[g["csub"]][0] += ok
            if not ok and len(misses) < 14:
                misses.append((g["name"][:30], g["ctop"], g["csub"], sub))

    n = len(gold) - errors
    print("Per sub-sector accuracy (confirmed -> Haiku, given the sector):")
    for s in sorted(per_sub, key=lambda x: -per_sub[x][1]):
        c, t = per_sub[s]
        print(f"  {s:<32} {c:>3}/{t:<3} = {100*c/t:5.1f}%")
    print(f"\nOVERALL Tier-2 accuracy when following the NACE sector: "
          f"{correct}/{n} = {100*correct/n:.1f}%  (errors={errors})")
    if misses:
        print("Sample misses (confirmed_sub -> Haiku):")
        for name, top, cs, ps in misses:
            print(f"  {name:<30} [{top}]  {cs} -> {ps}")


def cmd_test(args) -> None:
    """Score a model's exact Tier-1 against NACE-confirmed badges (NACE withheld)."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY not set (checked env + .env.local)")
    import anthropic
    client = anthropic.Anthropic()

    with connect(readonly=True) as con:
        gold = gold_set(con, args.n)
    dist = Counter(g["confirmed"] for g in gold)
    print(f"Confirmed gold: {len(gold)} companies, NACE-derived Tier-1 (withheld "
          f"from model). model={args.model}")
    print("  distribution: " + ", ".join(f"{k}={v}" for k, v in dist.most_common()))
    print()

    correct = errors = in_tok = out_tok = 0
    per_sector = defaultdict(lambda: [0, 0])   # confirmed -> [correct, total]
    confusion: Counter = Counter()
    misses: list[tuple] = []

    def work(g):
        # The production residual classifier (NACE-guided), NACE/tags WITHHELD.
        top, sub, _reason, it, ot, _cr = llm_full(client, args.model, g)
        return g, top, sub, it, ot

    with ThreadPoolExecutor(max_workers=8) as ex:
        for f in as_completed([ex.submit(work, g) for g in gold]):
            try:
                g, top, sub, it, ot = f.result()
            except Exception as e:
                errors += 1
                if errors <= 3:
                    print(f"  error: {e}")
                continue
            in_tok += it
            out_tok += ot
            truth = g["confirmed"]
            ok = top == truth
            correct += ok
            per_sector[truth][1] += 1
            per_sector[truth][0] += ok
            if not ok:
                confusion[(truth, top)] += 1
                if len(misses) < 20:
                    misses.append((g["name"][:32], truth, top, sub))

    n = len(gold) - errors
    print("Per-sector Tier-1 accuracy (confirmed -> model):")
    for sec in sorted(per_sector, key=lambda s: -per_sector[s][1]):
        c, t = per_sector[sec]
        print(f"  {sec:<28} {c:>3}/{t:<3} = {100*c/t:5.1f}%")
    print(f"\nOVERALL Tier-1 accuracy vs confirmed NACE badge: "
          f"{correct}/{n} = {100*correct/n:.1f}%  (errors={errors})")
    if confusion:
        print("Top errors (confirmed -> predicted):")
        for (truth, pred), c in confusion.most_common(10):
            print(f"  {truth:<26} -> {pred:<26} x{c}")
    if misses:
        print("Sample misses:")
        for name, truth, top, sub in misses[:12]:
            print(f"  {name:<32} confirmed {truth:<22} -> {top}/{sub}")

    if n:
        pin, pout = PRICES.get(args.model, (1.0, 5.0))
        cost = in_tok / 1e6 * pin + out_tok / 1e6 * pout
        per = cost / n
        print(f"\n{args.model}: ${cost:.4f}/{n}; per ${per:.5f} -> full 159,368 "
              f"~${per*159368*0.5:.0f} batch (no cache).")


def main() -> None:
    ap = argparse.ArgumentParser(description="Two-tier taxonomy classifier")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("vocab").set_defaults(fn=cmd_vocab)
    sub.add_parser("persist", help="save sector labels so a reload cannot wipe them")\
        .set_defaults(fn=cmd_persist)
    sub.add_parser("restore", help="re-apply saved labels after a company reload")\
        .set_defaults(fn=cmd_restore)
    sub.add_parser("apply-nace", help="write deterministic NACE labels to the DB")\
        .set_defaults(fn=cmd_apply_nace)
    rd = sub.add_parser("residual", help="demo NACE-guided LLM on no-NACE companies")
    rd.add_argument("--n", type=int, default=12)
    rd.add_argument("--model", default=DEFAULT_MODEL)
    rd.set_defaults(fn=cmd_residual)
    rn = sub.add_parser("run", help="split-model batch run + DB write-back (polls)")
    rn.add_argument("--dry-run", action="store_true")
    rn.add_argument("--limit", type=int, default=0, help="cap requests (validation)")
    rn.add_argument("--chunk", type=int, default=18000,
                    help="requests per batch (kept under the 256MB batch cap)")
    rn.add_argument("--max-cost", type=float, default=None,
                    help="skip submitting (exit 0) if the estimated cost exceeds "
                         "this many dollars -- for unattended/cron use, so a "
                         "backlog spike never spends without a human looking "
                         "first. Omit for interactive use (no cap).")
    rn.set_defaults(fn=cmd_run)
    sb = sub.add_parser("submit", help="fire-and-forget: submit all batches, no poll")
    sb.add_argument("--dry-run", action="store_true")
    sb.add_argument("--chunk", type=int, default=18000)
    sb.set_defaults(fn=cmd_submit)
    sub.add_parser("collect", help="write back any ended batches from 'submit'")\
        .set_defaults(fn=cmd_collect)
    t = sub.add_parser("test", help="score a model vs NACE-confirmed Tier-1 badges")
    t.add_argument("--n", type=int, default=200)
    t.add_argument("--model", default=DEFAULT_MODEL)
    t.set_defaults(fn=cmd_test)
    s = sub.add_parser("sample", help="run the production NACE-first + Haiku pipeline")
    s.add_argument("--n", type=int, default=120)
    s.add_argument("--model", default=DEFAULT_MODEL)
    s.set_defaults(fn=cmd_sample)
    st = sub.add_parser("subtest", help="Haiku Tier-2 accuracy given the NACE sector")
    st.add_argument("--n", type=int, default=160)
    st.add_argument("--model", default=DEFAULT_MODEL)
    st.set_defaults(fn=cmd_subtest)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
