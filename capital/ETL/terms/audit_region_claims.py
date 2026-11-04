"""Audit the registered-region filters against where the recipients actually are.

`encode_registered_regions.py` reads the Commission's case register and writes,
for 104 notified schemes, a `registered_region` gate saying "a company
established outside these NUTS regions is not eligible". That gate is a FILTER:
a region failure is structural, so the fund is removed from the brief and the
founder never sees it. Every other filter class in this repo is checked against
who the scheme ACTUALLY paid -- `audit_encoding_vs_reality.py` does that, and it
has already overruled a wrong rule -- and until now the region filters were the
one class with no such check.

-- What made this checkable -------------------------------------------------
The obvious route is the recipient's address. It does not exist: across the
region-gated schemes' 13,481 award events, 1.5% of recipients carry a postcode
and 5.9% carry a city. Eurostat's postcode-NUTS correspondence table is
authoritative and fetchable, and against a 1.5% base it would have let us check
almost nothing.

The evidence was already in the corpus. The State Aid Transparency Register
publishes, on EVERY award, the NUTS region of the beneficiary -- `satr_staging.
region`, populated on 122,814 of 122,814 rows. It is published by the granting
member state as part of the same transparency obligation that produces the award
record itself, which puts it at the same evidential level as the amount.

It is published as a NAME, not a code ("Arr. Liege", "Vlaams Gewest",
"Jihovychod"), so the whole mapping problem reduces to name -> NUTS id against
Eurostat's own name register. That is a lookup in an authority, not a rule with
an error rate: 100% of the 13,481 events resolve, and no country needs a
hand-written special case or a postcode-prefix heuristic.

-- What this can and cannot conclude ---------------------------------------
The register's region is where the AIDED ACTIVITY sits, which is not always
where the company is registered. Both readings are visible in the corpus: of the
186 events where we independently hold the recipient's postcode, 169 (91%) put
the company inside the region the register named and 17 do not -- a Milan
company on an Emilia-Romagna award, a Munich company on a Koln one. `--calibrate`
re-measures that number rather than quoting this one.

So a scheme whose recipients are OVERWHELMINGLY outside its registered regions
is a real finding, and a handful of outsiders is not. That asymmetry is why this
script reports and never writes. `audit_encoding_vs_reality.py` may quarantine
because a sector or a country is a property of the recipient; a region here is a
property of the project, and deleting a correct region filter would put a Paris
company back in front of a Normandy-only scheme.

Comparison is deliberately three-way, not two:
  inside        the recipient's region sits within an allowed one -- corroborates
  outside       no allowed region contains it, and it contains none -- contradicts
  indeterminate the recipient's region is COARSER than the rule (the register
                said "Region wallonne", the rule names BE332) -- it neither
                confirms nor refutes, and is excluded from the rate rather than
                counted as agreement. The product's own `regionsOverlap` accepts
                this case, so counting it as agreement would score the audit on
                the comparator's leniency instead of on the evidence.

Usage:
  python3 ETL/terms/audit_region_claims.py [--min-events 10] [--threshold 0.5]
  python3 ETL/terms/audit_region_claims.py --calibrate
  python3 ETL/terms/audit_region_claims.py --refresh-reference
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

import argparse  # noqa: E402
import csv  # noqa: E402
import json  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402
import unicodedata  # noqa: E402
from collections import Counter, defaultdict  # noqa: E402
from datetime import date  # noqa: E402

from instrument_family import source_to_family  # noqa: E402
# One definition of the NUTS name lookup, shared with
# populate_funding_instruments.py. A second copy here is exactly how an audit
# ends up checking a corpus the product does not have.
from nuts_regions import (  # noqa: E402
    ISO2_TO_NUTS, NAMES_FILE, NUTS_TO_ISO2, load_reference, norm, resolve,
)
CASES_FILE = ROOT / "data" / "raw" / "state_aid_cases" / "cases.json"
GISCO_NUTS_DIR = ROOT / "data" / "raw" / "gisco_nuts"
POSTCODE_FILE = (ROOT / "data" / "raw" / "gisco_postcode_nuts"
                 / "PCODE_2025_NUTS-2024_v2.0.csv")

# NUTS 2024 is current and is what reference/nuts_regions.json already
# uses. The older vintages are consulted ONLY for names 2024 no longer carries,
# because the register keeps publishing some of them, and every resolution
# records which vintage answered so a stale hit is visible rather than silent.
VINTAGES = (2024, 2021, 2016, 2013)
CURRENT_VINTAGE = VINTAGES[0]
GISCO_URL = "https://gisco-services.ec.europa.eu/distribution/v2/nuts/csv/NUTS_AT_%d.csv"

# ── the reference file ───────────────────────────────────────────────────────
def build_reference() -> dict:
    """Fold Eurostat's NUTS name registers into one name -> id index.

    Ambiguity is ABSTAINED on, not guessed. A folded name that maps to two ids
    is fine when they nest (Berlin is DE3, DE30 and DE300 -- one place named at
    three levels), and is dropped outright when they do not, because there is
    no evidence in the name for choosing. Dropping costs coverage; guessing
    manufactures contradictions, and a contradiction here would overrule a
    correct filter."""
    per_vintage: dict[int, dict[tuple[str, str], set]] = {
        y: defaultdict(set) for y in VINTAGES}
    # id -> [display name, newest vintage that still carried it]. Needed to say
    # what a RETIRED code used to mean; the name index cannot answer that,
    # because a retired code's name now belongs to its successor.
    ids: dict[str, list] = {}
    for y in VINTAGES:
        path = GISCO_NUTS_DIR / f"NUTS_AT_{y}.csv"
        if not path.exists():
            raise SystemExit(
                f"missing {path.relative_to(ROOT)} -- fetch it with\n"
                f"  curl -sSL -o {path} '{GISCO_URL % y}'")
        for r in csv.DictReader(path.open(encoding="utf-8-sig")):
            cc = NUTS_TO_ISO2.get(r["CNTR_CODE"], r["CNTR_CODE"])
            nid = r["NUTS_ID"]
            ids.setdefault(nid, [r["NAME_LATN"], y])
            for nm in {r["NAME_LATN"], r["NUTS_NAME"]}:
                key = norm(nm)
                # Names that fold to nothing usable are the non-Latin scripts
                # (Serbian, Macedonian, Greek) whose NUTS_NAME survives folding
                # as an empty or one-letter string. They would collide with each
                # other, so they are simply not indexed; NAME_LATN carries the
                # same regions.
                if len(key) >= 3:
                    per_vintage[y][(cc, key)].add(nid)

    index: dict[str, list] = {}
    dropped = 0
    for y in VINTAGES:                       # newest first: 2024 wins ties
        for (cc, key), same_name in per_vintage[y].items():
            ordered = sorted(same_name, key=len)
            if not all(i.startswith(ordered[0]) for i in ordered):
                dropped += 1
                continue
            index.setdefault(f"{cc}|{key}", [ordered[-1], y])
    return {
        "source": f"Eurostat GISCO, NUTS_AT_{{{','.join(str(v) for v in VINTAGES)}}}.csv",
        "source_url": GISCO_URL % CURRENT_VINTAGE,
        "retrieved": date.today().isoformat(),
        "licence": "Eurostat reuse policy, Commission Decision 2011/833/EU -- "
                   "reuse authorised provided the source is acknowledged. "
                   "Attribute table only; the boundary geometries carry a "
                   "separate EuroGeographics notice and are not used.",
        "current_vintage": CURRENT_VINTAGE,
        "vintages": list(VINTAGES),
        "levels": "NUTS 0-3. nuts_regions.json holds levels 1-2 because those "
                  "are what a founder is asked; this file must go to level 3 "
                  "because that is the level the transparency register "
                  "publishes recipients at.",
        "ambiguous_names_dropped": dropped,
        "index": index,
        "ids": ids,
    }


# ── the evidence ─────────────────────────────────────────────────────────────
# A region-gated instrument is a SATR child: one row per (granting body,
# notified scheme). funding_instrument_sources maps only the parent regime, so
# the child's own awards have to be recovered the way they were built -- the
# same three-part key populate_funding_instruments.py splits on. Checked before
# use: this reproduces all 104 children and their event counts exactly.
RECIPIENTS_SQL = """
    SELECT s.region, c.country
      FROM public_funding_events e
      JOIN satr_staging s ON s.tm_id = e.satr_tm_id
      JOIN companies c ON c.id = e.company_id
     WHERE e.call_id = ?
       AND substr(e.granting_authority, 1, 200) = ?
       AND fam(e.source) = ?
       AND e.is_duplicate = 0
"""


def classify(recipient: str, allowed: list[str]) -> str:
    """Is a recipient inside the regions the scheme is registered for?

    NUTS ids are hierarchical, so containment is a string prefix. The three
    outcomes are not symmetric and must not be collapsed:
      inside         recipient sits within an allowed region -- FR101 in FR10
      indeterminate  recipient CONTAINS an allowed region -- the register said
                     BE3 and the rule names BE332, so the company may or may not
                     be in it and the award is silent on the question
      outside        neither, on every allowed region"""
    for a in allowed:
        if recipient.startswith(a):
            return "inside"
    for a in allowed:
        if a.startswith(recipient):
            return "indeterminate"
    return "outside"


def retired_code(code: str, ref: dict) -> tuple[str | None, int | None, str | None]:
    """What a retired NUTS id used to mean, and what that place is called now.

    This is the failure the recipients cannot show you. The case register tags
    its regions with the vintage it used -- `RegionNuts2021.NL33` -- and
    `encode_registered_regions.py` keeps the code and drops the vintage. NUTS is
    renumbered every three years: Zuid-Holland was NL33 in NUTS 2021 and is NL36
    in NUTS 2024. The intake offers the founder NUTS 2024, because that is what
    `regions.generated.ts` is generated from, so a Zuid-Holland founder answers
    NL36, the rule demands NL33, `regionsOverlap` is false on both directions,
    and a provincial scheme structurally rejects the province it exists for.

    Nothing catches this downstream: the code is well-formed, the comparator
    runs, and the answer is a clean, wrong "not eligible". It is reported by
    code AND by place name, because the place name is what makes the mistake
    legible."""
    entry = ref["ids"].get(code)
    if not entry:
        return None, None, None
    name, vintage = entry
    # Same place, current numbering: go back out through the name. None means
    # the current vintage has no region of that name at all -- the UK's case,
    # since it left NUTS entirely.
    hit = ref["index"].get(f"{ISO2_TO_NUTS.get(code[:2], code[:2])}|{norm(name)}")
    if hit is None:
        hit = ref["index"].get(f"{NUTS_TO_ISO2.get(code[:2], code[:2])}|{norm(name)}")
    current = hit[0] if hit and hit[1] == CURRENT_VINTAGE else None
    return name, vintage, current


# A sub-national region in the register's OTHER syntax. `caseRegions` mixes two
# forms: `RegionNuts2021.PT111`, which carries its vintage, and bare
# `NutsRegionPT111`, which does not. encode_registered_regions.py reads only the
# first, on the reading that the bare form means the whole country -- true of
# `NutsRegionDE` and `NutsRegionIT`, and false the moment anything follows the
# country code. This pattern is what "false" looks like.
BARE_REGION = re.compile(r"^NutsRegion([A-Z]{2}[A-Z0-9]+)$")


def regions_dropped_by_the_encoder(scheme: str, encoded: list[str]) -> list[str]:
    """Regions the case register names that the encoded filter does not cover.

    Asked of every contradicted gate, because "your rule disagrees with your own
    recipients" and "your rule kept 3 of the 28 regions the case lists" are the
    same finding at two useful depths, and only the second one says what to fix.
    Silent when the case file is absent -- it is gitignored raw input, and the
    audit's own conclusions do not depend on it."""
    if not CASES_FILE.exists():
        return []
    global _CASES
    if _CASES is None:
        _CASES = json.loads(CASES_FILE.read_text())
    tags = (_CASES.get(scheme) or {}).get("caseRegions") or []
    bare = {m.group(1) for t in tags if (m := BARE_REGION.match(str(t)))}
    return sorted(b for b in bare
                  if not any(b.startswith(a) or a.startswith(b) for a in encoded))


_CASES: dict | None = None


# ── calibration against an independent authority ─────────────────────────────
def calibrate(conn: sqlite3.Connection, index: dict) -> None:
    """How far can the register's region be trusted about the RECIPIENT?

    The register names the region of the aided activity. This product gates on
    where the company is established. Those usually coincide and sometimes do
    not, and the gap is measurable wherever we independently hold the
    recipient's postcode: Eurostat's own postcode-NUTS table says which NUTS-3
    that postcode is in, and the two can be compared directly.

    Small base -- postcodes exist on 1.5% of these recipients, which is exactly
    why the audit does not run on postcodes -- but it is a real number from an
    authority, and it is the honest bound on everything above."""
    if not POSTCODE_FILE.exists():
        print(f"\n[calibrate] {POSTCODE_FILE.relative_to(ROOT)} is absent. "
              f"See its PROVENANCE.json for the URL; it is gitignored by size.")
        return
    pc_index: dict[tuple[str, str], set] = defaultdict(set)
    with POSTCODE_FILE.open(encoding="utf-8-sig") as fh:
        reader = csv.reader(fh, delimiter=";")
        next(reader, None)
        for row in reader:
            if len(row) < 2:
                continue
            n3 = row[0].strip().strip("'")
            pc = re.sub(r"[^0-9A-Za-z]", "", row[1].strip().strip("'")).upper()
            pc_index[(n3[:2], pc)].add(n3)

    rows = conn.execute("""
        SELECT s.region, c.country, c.postal_code, c.city, COUNT(*) n
          FROM eligibility_gates g
          JOIN funding_instruments i ON i.id = g.instrument_id
          JOIN public_funding_events e ON e.call_id = i.scheme_code
               AND substr(e.granting_authority, 1, 200) = i.administering_body
               AND fam(e.source) = i.parent_id
          JOIN satr_staging s ON s.tm_id = e.satr_tm_id
          JOIN companies c ON c.id = e.company_id
         WHERE g.gate_key = 'registered_region' AND e.is_duplicate = 0
           AND TRIM(COALESCE(c.postal_code, '')) <> ''
         GROUP BY 1, 2, 3, 4""").fetchall()

    agree = disagree = unresolved = no_postcode = 0
    misses: list[tuple] = []
    for region, cc, postal, city, n in rows:
        got = resolve(region, cc, index)
        if not got:
            unresolved += n
            continue
        code, _ = got
        key = (ISO2_TO_NUTS.get(cc, cc),
               re.sub(r"[^0-9A-Za-z]", "", postal or "").upper())
        truth = pc_index.get(key)
        if not truth:
            no_postcode += n
            continue
        if any(t.startswith(code) or code.startswith(t) for t in truth):
            agree += n
        else:
            disagree += n
            misses.append((n, cc, region, code, sorted(truth)[0], postal, city))

    total = agree + disagree
    print("\n=== calibration: register region vs the recipient's own postcode ===")
    print(f"  comparable award events:  {total}")
    if total:
        print(f"  register region contains the postcode: {agree} ({100*agree/total:.0f}%)")
        print(f"  it does not:                           {disagree} ({100*disagree/total:.0f}%)")
    print(f"  region name unresolved: {unresolved}   postcode not in the table: {no_postcode}")
    if misses:
        print("\n  where they part company (register region, then postcode's region):")
        for n, cc, region, code, truth, postal, city in sorted(misses, reverse=True)[:12]:
            print(f"    {cc}  {region} ({code})  vs  {postal} {city} ({truth})   x{n}")
    print("\n  Read this as the ceiling on the audit above: the register's region is\n"
          "  the aided activity's, and a minority of recipients are registered\n"
          "  elsewhere. It is why a few outsiders never condemn a rule.")


# ── report ───────────────────────────────────────────────────────────────────
def main() -> None:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--min-events", type=int, default=10,
                    help="ignore schemes with fewer decidable awards than this")
    ap.add_argument("--threshold", type=float, default=0.5,
                    help="flag schemes whose own recipients agree less than this")
    ap.add_argument("--calibrate", action="store_true",
                    help="measure the register's region against recipients' postcodes")
    ap.add_argument("--refresh-reference", action="store_true",
                    help="rebuild reference/nuts_names.json from data/raw/gisco_nuts")
    args = ap.parse_args()

    if args.refresh_reference:
        ref = build_reference()
        NAMES_FILE.write_text(json.dumps(ref, ensure_ascii=False, indent=1) + "\n")
        print(f"{NAMES_FILE.relative_to(ROOT)}: {len(ref['index'])} region names "
              f"across {len(VINTAGES)} NUTS vintages "
              f"({ref['ambiguous_names_dropped']} ambiguous names abstained on)")
        return

    ref = load_reference()
    index = ref["index"]
    conn = sqlite3.connect(DB)
    conn.create_function("fam", 1, source_to_family)

    gates = conn.execute("""
        SELECT g.instrument_id, i.name, i.country, i.scheme_code,
               i.administering_body, i.parent_id, g.value_spec
          FROM eligibility_gates g
          JOIN funding_instruments i ON i.id = g.instrument_id
         WHERE g.gate_key = 'registered_region' AND g.value_spec IS NOT NULL
      ORDER BY i.country, i.name""").fetchall()

    live_2024 = {i for i, (_, v) in ref["ids"].items() if v == CURRENT_VINTAGE}
    totals = Counter()
    vintage_used = Counter()
    checked: list[tuple] = []
    stale_gates: list[tuple] = []
    too_small = unresolvable = 0

    for iid, name, country, scheme, body, parent, spec_json in gates:
        allowed = json.loads(spec_json).get("allowed") or []
        if not allowed:
            continue
        # A rule naming a code the CURRENT NUTS does not have can never be
        # satisfied by a founder, whose options come from the current NUTS.
        # This has nothing to do with the recipients, so it is collected here
        # and reported on its own.
        dead = [a for a in allowed
                if not any(live.startswith(a) for live in live_2024)]

        counts = Counter()
        outside_regions: Counter = Counter()
        for region, cc in conn.execute(RECIPIENTS_SQL, (scheme, body, parent)):
            got = resolve(region, cc or country, index)
            if not got:
                counts["unresolved"] += 1
                continue
            code, vintage = got
            vintage_used[vintage] += 1
            if vintage == 0:
                # The register named the whole country. True of every award
                # under a national register and therefore evidence about
                # nothing sub-national.
                counts["country_only"] += 1
            elif vintage != CURRENT_VINTAGE:
                # The register still calls this region by a retired name, so
                # the id we can put on it belongs to a retired numbering. NUTS
                # renumbering is not a rename -- Portugal's PT17 became PT1A
                # AND PT1B -- so a prefix test across vintages is arithmetic on
                # two different scales. Refused rather than guessed.
                counts["stale_region"] += 1
            else:
                verdict = classify(code, allowed)
                counts[verdict] += 1
                if verdict == "outside":
                    outside_regions[f"{region} ({code})"] += 1
        totals.update(counts)

        # Same refusal from the rule's side: a gate naming even one retired
        # code cannot be scored, because "outside every allowed region" is only
        # meaningful when the allowed regions are all on the founder's scale.
        if dead:
            stale_gates.append((country, name, iid, allowed, dead))
            continue

        decidable = counts["inside"] + counts["outside"]
        if counts["unresolved"] and not decidable:
            unresolvable += 1
            continue
        if decidable < args.min_events:
            too_small += 1
            continue
        checked.append((counts["inside"] / decidable, decidable, counts,
                        outside_regions, iid, name, country, allowed, scheme))

    print(f"registered_region filters:        {len(gates)}")
    print(f"  checked against recipients:     {len(checked)}")
    print(f"  under {args.min_events} decidable awards:        {too_small}")
    print(f"  no region resolved at all:      {unresolvable}")
    print(f"  written in a retired NUTS vintage (see below): {len(stale_gates)}")
    ev = sum(totals.values())
    print(f"\naward events behind those checks: {ev:,}")
    for k in ("inside", "outside", "indeterminate", "country_only",
              "stale_region", "unresolved"):
        if totals[k]:
            print(f"  {k:16}{totals[k]:8,}  {100*totals[k]/ev:5.1f}%")
    stale = sum(n for v, n in vintage_used.items() if v not in (0, CURRENT_VINTAGE))
    print(f"\nregion names resolved from NUTS {CURRENT_VINTAGE}: "
          f"{vintage_used[CURRENT_VINTAGE]:,}"
          + (f"; from a superseded vintage: {stale:,}" if stale else "")
          + (f"; whole-country labels: {vintage_used[0]:,}" if vintage_used[0] else ""))

    if checked:
        rate = sum(1 for c in checked if c[0] >= 0.8) / len(checked)
        agg_in = sum(c[2]["inside"] for c in checked)
        agg_dec = sum(c[1] for c in checked)
        print(f"\nschemes whose recipients corroborate the filter (>=80% inside): "
              f"{sum(1 for c in checked if c[0] >= 0.8)}/{len(checked)}  ({100*rate:.0f}%)")
        print(f"award events inside their scheme's registered regions: "
              f"{agg_in:,}/{agg_dec:,}  ({100*agg_in/agg_dec:.1f}%)")

    bad = sorted(c for c in checked if c[0] < args.threshold)
    if bad:
        print(f"\n=== filters their own recipients contradict "
              f"(below {args.threshold:.0%} inside) ===")
        for (share, decidable, counts, outside, iid, name, country,
             allowed, scheme) in bad:
            top = ", ".join(f"{r} x{n}" for r, n in outside.most_common(4))
            print(f"  [{share:5.0%} inside] {country} - {' '.join(name.split())[:70]}")
            print(f"      {iid}")
            print(f"      registered for: {', '.join(allowed[:8])}"
                  + ("..." if len(allowed) > 8 else ""))
            print(f"      recipients sat in: {top}  (n={decidable})")
            dropped = regions_dropped_by_the_encoder(scheme, allowed)
            if dropped:
                print(f"      the case ALSO names {len(dropped)} region(s) the "
                      f"filter does not cover: {', '.join(dropped[:10])}"
                      + ("..." if len(dropped) > 10 else ""))
        print("\n  Reported, not quarantined. A region filter is a filed fact about the\n"
              "  scheme and the counter-evidence is about the project's location, so a\n"
              "  human decides. Read the scheme's own decision text before touching it.")

    if stale_gates:
        print(f"\n=== filters written in a NUTS vintage the founder is never offered ===")
        print(f"  The case register tags each region with its vintage "
              f"(RegionNuts2021.NL33); the encoder keeps the code and drops the\n"
              f"  vintage. The intake offers NUTS {CURRENT_VINTAGE}. Where the two "
              f"disagree the filter cannot be satisfied by anyone.")
        for country, name, iid, allowed, dead in stale_gates:
            print(f"\n  {country} - {' '.join(name.split())[:70]}")
            print(f"      {iid}")
            for code in dead:
                place, vintage, current = retired_code(code, ref)
                if place is None:
                    print(f"      {code}: not a NUTS region in any vintage held here")
                elif current:
                    print(f"      {code} = {place} in NUTS {vintage}; "
                          f"a founder there answers {current}")
                else:
                    print(f"      {code} = {place} in NUTS {vintage}; "
                          f"NUTS {CURRENT_VINTAGE} has no such region, so the "
                          f"intake cannot offer it")

    if args.calibrate:
        calibrate(conn, index)
    conn.close()


if __name__ == "__main__":
    main()
