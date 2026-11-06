"""One definition of "which NUTS region is this", for every consumer.

The State Aid Transparency Register publishes the beneficiary's region as a
NAME ("Arr. Liege", "Vlaams Gewest", "Oberösterreich"), on all 122,814 rows.
Turning that into a NUTS id is a lookup in Eurostat's own name register
(reference/nuts_names.json, levels 0-3, four vintages) rather than a rule
with an error rate.

This module exists because two consumers needed the same lookup and a copy in
each is a defect waiting to happen: audit_region_claims.py checks the
registered-region FILTERS against where recipients actually are, and
populate_funding_instruments.py derives each instrument's delivery region from
the same evidence. If those two ever resolved a name differently, the audit
would be checking a different corpus than the one the product ships.

Refresh the reference with
  python3 ETL/terms/audit_region_claims.py --refresh-reference
"""
from __future__ import annotations

import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

from etl_env import ROOT
from europe_scope import name_to_iso2

NAMES_FILE = ROOT / "reference" / "nuts_names.json"

# Eurostat writes EL for Greece and UK for the United Kingdom; everything else
# in this product is keyed by ISO2. Resolved here exactly as emit_regions.py
# resolves it, and in the same direction, so the two cannot drift apart.
NUTS_TO_ISO2 = {"EL": "GR", "UK": "GB"}
ISO2_TO_NUTS = {v: k for k, v in NUTS_TO_ISO2.items()}


def norm(s: str) -> str:
    """Fold a region name to a comparison key.

    The register publishes the same region in several typographies -- 'Region
    wallonne' and 'REGION WALLONNE' are both in the corpus, as are curly and
    straight apostrophes in "Valle d'Aosta/Vallee d'Aoste". Case, accents and
    punctuation are therefore all folded away. What is NOT folded is word
    content: two regions with different words stay different keys, so this
    cannot merge neighbours."""
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.replace("’", "'").replace("‘", "'")
    return re.sub(r"[^0-9a-z]+", " ", s.lower()).strip()


def load_reference(path: Path | None = None) -> dict:
    p = path or NAMES_FILE
    if not p.exists():
        raise SystemExit(f"missing {p} -- build it with\n"
                         f"  python3 ETL/terms/audit_region_claims.py --refresh-reference")
    return json.loads(p.read_text())


REGIONS_FILE = ROOT / "reference" / "nuts_regions.json"


def subnational_names(path: Path | None = None) -> set[str]:
    """Folded names of areas INSIDE a country.

    One definition, because two consumers need it and a copy in each is the
    defect this module already exists to prevent: `encode_gates.py` refuses to
    put one of these on a country field, and `check_gate_subject.py` asserts
    none ever got there. If the two disagreed, the check would pass a corpus
    the encoder would have rejected.

    A country's own name is NOT in this set even when it is also a NUTS-1 label.
    Small member states have a single NUTS-1 region named after the country --
    Ireland, Luxembourg, Malta, Liechtenstein -- so a naive read of the
    reference calls `entityCountries in ["Ireland"]` sub-national and would
    delete correct rules on eight instruments. Anything `name_to_iso2` resolves
    is a country, whatever the region file also calls it.
    """
    p = path or REGIONS_FILE
    if not p.exists():
        return set()
    regions = json.loads(p.read_text())["regions"]
    return {norm(r["name"]) for rs in regions.values() for r in rs
            if not name_to_iso2(r["name"])}


def is_subnational(value: str, names: set[str] | None = None) -> bool:
    return norm(value) in (names if names is not None else subnational_names())


def resolve(region: str, iso2: str, index: dict) -> tuple[str, int] | None:
    """A published region name -> (NUTS id, the vintage that recognised it).

    Country-scoped, because region names repeat across Europe and the award
    already tells us the country. Whole-country labels ("Estonia", "Czechia")
    are resolved through the canonical country map rather than a second list of
    country names, and come back with vintage 0 -- NUTS-0, a country, which is
    not a regional claim about anything."""
    key = norm(region)
    if not key:
        return None
    hit = index.get(f"{iso2}|{key}")
    if hit:
        return hit[0], hit[1]
    iso = name_to_iso2(region)
    if iso:
        return ISO2_TO_NUTS.get(iso, iso), 0     # vintage 0 == NUTS-0, a country
    return None


# A founder is asked for their region at NUTS level 1 or 2 -- that is what
# regions.generated.ts carries and what regionsOverlap compares. The register
# publishes recipients at level 3, so a distribution is rolled UP to the level
# the product can actually route on, and never below it.
MAX_ROUTING_LEVEL_CHARS = 4          # "FRK" is level 1, "FRK2" level 2
MIN_ROUTING_LEVEL_CHARS = 3

# A body that pays across a whole country makes no regional claim. The floor is
# what separates the two: at 0.6, Conseil regional Nouvelle-Aquitaine resolves
# (FRI, 97% of its awards) and the Ministere de l'economie does not (its largest
# single region is Ile-de-France at 36%, so only "FR" clears the bar and "FR" is
# the country). Raising it costs regional bodies whose recipients spill over a
# border; lowering it starts labelling national schemes as regional, which is
# the error that actually harms a founder.
DELIVERY_REGION_FLOOR = 0.6


def delivery_region(mix: Counter | dict[str, int],
                    floor: float = DELIVERY_REGION_FLOOR) -> tuple[str, float] | None:
    """The most SPECIFIC NUTS region that still covers a supermajority of a
    fund's own awards, or None when only the country does.

    NUTS ids are hierarchical, so "does this region contain that award" is a
    string prefix and the whole question is: how long a prefix can we keep and
    still cover `floor` of the awards? Longest wins, so a body confined to one
    department is described as that department rather than as its country.

    Returns None -- deliberately, not the country code -- when no sub-national
    prefix clears the floor. A national body's delivery region is not "France";
    it is "no regional claim", and storing the country would let a downstream
    reader mistake the two.
    """
    total = sum(mix.values())
    if not total:
        return None
    best: tuple[str, float] | None = None
    for length in range(MIN_ROUTING_LEVEL_CHARS, MAX_ROUTING_LEVEL_CHARS + 1):
        cover: Counter = Counter()
        for code, n in mix.items():
            if len(code) >= length:
                cover[code[:length]] += n
        if not cover:
            continue
        top, n = cover.most_common(1)[0]
        # Coverage is measured against EVERY award, including those recorded
        # only at country level. A body with half its awards filed as "Germany"
        # has not demonstrated a regional focus, and dividing by the resolvable
        # subset would claim it had.
        if n / total >= floor:
            best = (top, n / total)
    return best


def staged_region_mix(conn, exclude_company_ids: set[int] | None = None,
                      ) -> dict[tuple[str, str], Counter]:
    """(sa_number, granting_authority) -> Counter of recipient NUTS ids.

    A SATR scheme child is exactly one (sa_number, granting_authority) pair in
    the register, so this is the per-leaf recipient footprint, MEASURED rather
    than guessed from the body's name. Name-guessing was tried and is wrong in
    both directions: "Bayerisches Staatsministerium" never contains "Bayern",
    and "Finanzamt Darmstadt" is a tax office administering a NATIONAL scheme.

    The empty-string key counts awards whose region is unresolvable or recorded
    only at country level. It is kept, not dropped, because it belongs in the
    denominator: a body half of whose awards are filed as "Germany" has not
    demonstrated a regional focus, and dividing by the resolvable subset alone
    would claim it had.

    `exclude_company_ids` drops recipients before counting, which is what makes
    a prior built from this out-of-sample. BOTH callers now pass the recall
    holdout (`ETL/lib/recall_holdout.py`).

    They did not always. `populate_funding_instruments.py` passed nothing on
    the reasoning that the shipped corpus should describe every award it holds
    -- true of a description, false of this, because `delivery_region` is a
    ROUTING signal the product sorts siblings by and the harness grades. One
    attribution called over two populations is the same divergence the
    paragraph below says this module exists to prevent; it was simply moved
    from the function into its argument.

    Two callers need this identical attribution, and a copy in each is the
    defect this module exists to prevent: if they ever resolved a region
    differently, the artifact the product ranks on and the column it displays
    would describe different corpora.
    """
    index = load_reference()["index"]
    skip = exclude_company_ids or set()
    out: dict[tuple[str, str], Counter] = {}
    resolved: dict[tuple[str, str], str] = {}
    for cid, sa, ga, cc, region, n in conn.execute("""
            SELECT company_id, sa_number, granting_authority,
                   granting_country_iso2, region, COUNT(*)
              FROM satr_staging
             WHERE sa_number IS NOT NULL AND TRIM(sa_number) <> ''
             GROUP BY 1, 2, 3, 4, 5
             -- ordered, so tie order in the Counter (and the JSON written from
             -- it) does not depend on the planner
             ORDER BY 1, 2, 3, 4, 5"""):
        if cid in skip:
            continue
        key = (region or "", cc or "")
        if key not in resolved:
            hit = resolve(region or "", ISO2_TO_NUTS.get(cc or "", cc or ""), index)
            # Vintage 0 is NUTS-0 -- a country, which is not a regional claim
            # about anything -- so it lands in the unresolved bucket with the
            # names the register writes at level 3 and Eurostat has since
            # retired.
            resolved[key] = hit[0] if hit and hit[1] > 0 else ""
        out.setdefault((sa.strip(), (ga or "")[:200]), Counter())[resolved[key]] += n
    return out
