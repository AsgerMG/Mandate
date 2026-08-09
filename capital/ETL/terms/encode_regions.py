"""Make sub-national eligibility rules evaluable.

── The bug this exists to fix ─────────────────────────────────────────────
A rule that restricts a scheme to one region was encoded against the only
field that existed for it:

    requirement: "The applicant must be located in Ile-de-France"
    value_spec : {"op":"in","field":"entityCountries","allowed":["FR"]}

That is not a weaker version of the rule, it is the opposite of it. It PASSES
every company the rule excludes, and does so with the confidence of an encoded
filter, so a Marseille company reads as eligible for a Paris-only scheme.

── Why a separate pass ────────────────────────────────────────────────────
encode_gates.py maps a requirement onto a fixed enum. Region is not that: it is
449 values across 39 countries, only the founder's own country is relevant, and
the hard part is resolving a name written in the fund's language ("Ile-de-
France", "Comunidad de Madrid", "Ida-Viru maakond") onto the official
classification. That is a different task and gets its own step, in the way
classify-titles does.

── What it will not do ────────────────────────────────────────────────────
Most gates mentioning a region are NOT regional restrictions. "established in
Austria under the relevant national or regional scheme" is a country rule that
merely uses the word. The model is asked to distinguish those, and a gate it
does not judge to be a genuine sub-national restriction is left exactly as it
was.

Matching is hierarchical (see regionsOverlap): a rule naming Normandie (FRD) is
satisfied by a company in Basse-Normandie (FRD1), and vice versa.

Usage:
  python3 ETL/terms/encode_regions.py status
  python3 ETL/terms/encode_regions.py run [--limit N] [--dry-run] [--publish]
  python3 ETL/terms/encode_regions.py refile-from-text [--dry-run] [--publish]
  python3 ETL/terms/encode_regions.py refile-national  [--dry-run] [--publish]
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402
from europe_scope import COUNTRY_NAMES, canonicalise_country  # noqa: E402

import argparse  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402

import anthropic  # noqa: E402

# READ, never restated: encode_gates.py already declares which fields are
# evaluable through exactly one operator, and refuses to write them. This pass
# is the owner it defers to, so it takes the same declaration from the same
# place rather than repeating "region -> region_within" in a second file.
from encode_gates import SINGLE_OPERATOR_FIELDS  # noqa: E402

REGION_OP = SINGLE_OPERATOR_FIELDS["region"]

MODEL = "claude-sonnet-5"
CHUNK = 12
NUTS_PATH = ROOT / "data" / "reference" / "nuts_regions.json"

# Requirement text worth spending a call on. Deliberately broad and merely a
# PREFILTER, never the decision: it selects candidates, and the model decides
# which are genuine sub-national restrictions. Being over-inclusive here costs
# a few tokens; being under-inclusive silently leaves a wrong spec in place.
CANDIDATE = re.compile(
    r"region|région|regione|regional|province|provincia|county|comunidad|"
    r"autonom|voivod|kraj|d[ée]partement|territor|municipal|prefectur|"
    r"land\b|länder|bundesland|generalitat|junta|xunta|located in|"
    r"registered office|established in|based in",
    re.I,
)

SCHEMA = {
    "type": "object",
    "properties": {
        "results": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "is_subnational": {"type": "boolean"},
                    "region_ids": {"type": "array", "items": {"type": "string"}},
                    "why": {"type": "string"},
                },
                "required": ["id", "is_subnational", "region_ids", "why"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["results"],
    "additionalProperties": False,
}

PROMPT = """You are encoding eligibility rules for European public funding.

For each rule, decide ONE thing: does it restrict eligibility to a named area
SMALLER than the whole country?

  is_subnational = true  only when the rule names a specific region, province,
                         county, Land, autonomous community or comparable area,
                         AND being outside it makes an applicant ineligible.
  is_subnational = false for everything else. In particular:
                         - "established in Austria under the relevant national
                           or regional scheme" merely uses the word "regional";
                           the restriction is the country.
                         - a rule about where the funded ACTIVITY happens, or
                           about regional development as a funding THEME, is
                           not a restriction on where the applicant sits.
                         - a hedged guess ("regional focus likely") is not a
                           rule. If the text does not clearly restrict, say
                           false.

When true, return region_ids: the ids from the country's list below that the
rule covers. Use the most specific ids that fully cover the named area, and
return several when the rule names several. Return [] if you cannot map it
confidently — a wrong id is worse than none, because it silently excludes real
applicants.

`why` must quote the words from the requirement that decided it, in under 15
words."""


# ── where a comparator on `region` belongs ──────────────────────────────────
# THE ORPHAN THIS CLOSES
#
# `region` is evaluable through exactly one operator. encode_gates.py cannot
# emit it and now refuses to try, so nothing else may write the field — and
# this pass, which owns it, used to walk past the cases it did not create:
#
#     if not out["is_subnational"] or not ids:
#         # If it was encoded to the whole country we leave that alone: for a
#         # rule that really is national, that spec is correct.
#         skipped += 1
#
# That comment is true of `entityCountries` and false of `region`. A national
# rule sitting on `region` is not "correct but wide": the founder answers
# `region` with a NUTS id, the spec names a country, `matchesAny` compares the
# two as strings, and the rule can only ever return false. `region` is
# structural, so a cited one of those is CONCLUSIVE — the fund is dropped
# before the founder ever sees it, and dropped for the very applicants it
# admits. Leaving it alone left a rule no pass owned.
#
# So the skip becomes a REROUTE, and the destination is read off what the rule
# actually names rather than guessed:
#
#   values that are NUTS ids of the instrument's country → the rule IS
#       sub-national and only the operator was wrong. Same values, right
#       operator.
#   values that are countries → the rule has no sub-national content at all,
#       and the field that expresses "established in a country" is
#       entityCountries, where 338 siblings already sit.
#   anything else → LEFT, and reported. A destination we cannot derive is not
#       a destination we may invent.
#
# Country names come from europe_scope.json via COUNTRY_NAMES, so no country is
# named in this file and a country added to the scope is handled the day it is
# added.
_NAME_TO_ISO: dict[str, str] = {n.lower(): iso for iso, n in COUNTRY_NAMES.items()}


def _iso_for(value: str) -> str | None:
    """The in-scope ISO2 this value names as a COUNTRY, or None."""
    v = (value or "").strip()
    return _NAME_TO_ISO.get(v.lower()) or canonicalise_country(v)


def spec_values(spec: dict) -> list[str]:
    """Every value a comparator names, whichever key it uses to name them."""
    vals = list(spec.get("allowed") or [])
    for key in ("value", "maxAllowed", "minAllowed"):
        if isinstance(spec.get(key), str):
            vals.append(spec[key])
    return [v for v in vals if isinstance(v, str) and v.strip()]


def reroute_region_spec(spec: dict, nuts_valid: set[str]) -> tuple[dict, str] | None:
    """Rewrite a comparator wrongly filed on `region`, or None if we cannot tell.

    `nuts_valid` is the id set of the instrument's OWN country, so a stray
    token cannot become a geography rule.
    """
    if not isinstance(spec, dict) or spec.get("field") != "region":
        return None
    if spec.get("op") == REGION_OP:
        return None
    values = spec_values(spec)
    if not values:
        return None
    if all(v in nuts_valid for v in values):
        return ({"op": REGION_OP, "field": "region", "allowed": sorted(set(values))},
                f"operator corrected: `region` is evaluable only through `{REGION_OP}`")
    isos = [_iso_for(v) for v in values]
    if all(isos):
        names = sorted({COUNTRY_NAMES[i] for i in isos if i})
        return ({"op": "in", "field": "entityCountries", "allowed": names},
                "refiled to entityCountries: the rule names a whole country, "
                "which `region` cannot express — a founder answers `region` "
                "with a NUTS id, so this comparator could only ever be false")
    return None


def publish(conn: sqlite3.Connection, touched: list[int]) -> int:
    """Mirror the rows this pass touched into Postgres.

    SQLite authors, Postgres serves. Keyed on (instrument_id, gate_key) — the
    two stores keep independent surrogate ids, so WHERE id = ? matches nothing.
    """
    if not touched:
        return 0
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("DATABASE_URL not set (expected in repo-root .env.local)")
    import psycopg2
    qs = ",".join("?" * len(touched))
    out = conn.execute(
        f"""SELECT instrument_id, gate_key, value_spec, intake_field_resolved,
                   gate_role, verify_note
              FROM eligibility_gates WHERE id IN ({qs})""", touched).fetchall()
    pg = psycopg2.connect(dsn)
    with pg, pg.cursor() as cur:
        cur.executemany(
            """UPDATE eligibility_gates
                  SET value_spec = %s, intake_field_resolved = %s,
                      gate_role = %s, verify_note = %s
                WHERE instrument_id = %s AND gate_key = %s""",
            [(s, f, r, n, iid, gk) for iid, gk, s, f, r, n in out])
    pg.close()
    return len(out)


def client() -> anthropic.Anthropic:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise SystemExit("ANTHROPIC_API_KEY not set")
    return anthropic.Anthropic(api_key=key)


def load_nuts() -> dict[str, list[dict]]:
    return json.loads(NUTS_PATH.read_text())["regions"]


def candidates(conn: sqlite3.Connection, country: str | None = None) -> list[tuple]:
    rows = conn.execute("""
        SELECT g.id, g.instrument_id, g.gate_key, g.requirement, g.value_spec,
               f.country
          FROM eligibility_gates g
          JOIN funding_instruments f ON f.id = g.instrument_id
         WHERE (g.gate_role IS NULL OR g.gate_role = 'filter')
           AND f.country IS NOT NULL AND length(f.country) = 2
           AND (? IS NULL OR f.country = ?)
         ORDER BY g.instrument_id, g.gate_key
    """, (country, country)).fetchall()
    return [r for r in rows if CANDIDATE.search(r[3] or "")]


def cmd_status(_args) -> None:
    conn = sqlite3.connect(DB)
    cands = candidates(conn)
    by_country: dict[str, int] = {}
    for r in cands:
        by_country[r[5]] = by_country.get(r[5], 0) + 1
    encoded = conn.execute(
        "SELECT COUNT(*) FROM eligibility_gates WHERE value_spec LIKE '%region_within%'"
    ).fetchone()[0]
    flattened = sum(1 for r in cands if r[4] and '"entityCountries"' in r[4])
    print(f"candidate gates:            {len(cands):,}")
    print(f"  of which country-encoded: {flattened:,}  (a wrong spec today)")
    print(f"already region_within:      {encoded:,}")
    print("  " + ", ".join(f"{k}:{v}" for k, v in
                           sorted(by_country.items(), key=lambda kv: -kv[1])[:12]))
    conn.close()


def cmd_run(args) -> None:
    conn = sqlite3.connect(DB)
    nuts = load_nuts()
    rows = candidates(conn, getattr(args, "country", None))
    if args.limit:
        rows = rows[: args.limit]
    print(f"resolving {len(rows):,} candidate gates ({MODEL})")
    cl = client()
    encoded = rerouted = skipped = 0
    touched: list[int] = []

    # Grouped by country so each call carries only that country's regions.
    by_country: dict[str, list[tuple]] = {}
    for r in rows:
        by_country.setdefault(r[5], []).append(r)

    for cc, group in sorted(by_country.items()):
        options = nuts.get(cc, [])
        if not options:
            skipped += len(group)
            continue
        listing_regions = "\n".join(f"  {o['id']}  {o['name']}" for o in options)
        for i in range(0, len(group), CHUNK):
            chunk = group[i : i + CHUNK]
            listing = "\n\n".join(
                f"id: {r[0]}\nrequirement: {(r[3] or '')[:400]}" for r in chunk)
            res = cl.messages.create(
                model=MODEL, max_tokens=4000, thinking={"type": "disabled"},
                output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
                messages=[{"role": "user", "content":
                           f"{PROMPT}\n\nRegions of {cc}:\n{listing_regions}\n\nRules:\n{listing}"}])
            text = "".join(b.text for b in res.content if b.type == "text")
            valid = {o["id"] for o in options}
            by_id = {r[0]: r for r in chunk}
            for out in json.loads(text)["results"]:
                gid = out["id"]
                ids = [x for x in out.get("region_ids", []) if x in valid]
                if not out.get("is_subnational") or not ids:
                    # Not a sub-national restriction, or unmappable. This used
                    # to be an unconditional skip on the grounds that a national
                    # rule already encoded to the whole country is correct as it
                    # stands. That holds for `entityCountries` and NOT for
                    # `region`: see reroute_region_spec. A national rule left on
                    # `region` is a comparator that can only ever be false.
                    row = by_id.get(gid)
                    try:
                        cur_spec = json.loads((row[4] if row else "") or "{}")
                    except json.JSONDecodeError:
                        cur_spec = {}
                    fix = reroute_region_spec(cur_spec, valid)
                    if not fix:
                        skipped += 1
                        continue
                    new, note = fix
                    print(f"  [{gid}] rerouted {cur_spec} -> {new}")
                    rerouted += 1
                    if args.dry_run:
                        continue
                    conn.execute("""
                        UPDATE eligibility_gates
                           SET value_spec = ?, intake_field_resolved = ?,
                               gate_role = 'filter', verify_note = ?,
                               updated_at = CURRENT_TIMESTAMP
                         WHERE id = ?""",
                        (json.dumps(new), new["field"], note[:400], gid))
                    touched.append(gid)
                    continue
                spec = json.dumps({"op": REGION_OP, "field": "region",
                                   "allowed": sorted(ids)})
                if args.dry_run:
                    print(f"  [{gid}] -> {sorted(ids)}  ({out['why']})")
                    encoded += 1
                    continue
                conn.execute("""
                    UPDATE eligibility_gates
                       SET value_spec = ?, intake_field_resolved = 'region',
                           gate_role = 'filter', verify_note = ?,
                           updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?""",
                    (spec, f"region resolved to NUTS {','.join(sorted(ids))}: {out['why']}"[:400], gid))
                encoded += 1
                touched.append(gid)
        if not args.dry_run:
            conn.commit()
    if not args.dry_run:
        conn.commit()
    print(f"done: {encoded} encoded as {REGION_OP}, {rerouted} rerouted off "
          f"`region`, {skipped} left unchanged")
    if getattr(args, "publish", False) and not args.dry_run:
        print(f"published {publish(conn, touched)} gates to Postgres")
    conn.close()


# ── refile-from-text ────────────────────────────────────────────────────────
# FREE — no model calls. The complement of cmd_run: where that asks a model to
# resolve a region NAME written in the fund's own language, this handles the
# case where the fund has already written the NUTS CODE down and we widened it
# anyway.
#
# ── What it found ─────────────────────────────────────────────────────────
# 40 comparators read `activityCountries in ["Spain"]` over requirement text
# that says "Project must be located in Catalonia (ES51)". Two failures on top
# of each other, and each hid the other:
#
#   * the field. Nothing in the intake answers `activityCountries`, so the rule
#     evaluated to null for every founder and could not be contradicted.
#   * the value. Widened from a region to the whole country, so had anyone ever
#     answered it, the rule would have admitted every Spanish founder — the
#     precise inversion encode_regions.py was written to prevent, arriving
#     through a field that pass does not police.
#
# Inertness is what let the second one sit there. A rule that never fires is a
# rule nothing can prove wrong.
#
# ── Why this is deterministic and Rule Zero-clean ─────────────────────────
# No judgement is exercised. The NUTS id is IN THE FUND'S OWN TEXT, and it is
# accepted only when it is a real id belonging to the instrument's own country
# — so a stray token cannot become a geography rule. Anything needing a
# name-to-id resolution is left for `run`, which is the pass that owns that
# judgement and pays a model for it.
NUTS_IN_TEXT = re.compile(r"\(([A-Z]{2}\d{0,2}[A-Z0-9]?)\)|\b([A-Z]{2}\d[A-Z0-9]?)\b")

#: Fields a geography rule gets mis-filed ONTO. Region rules land here because
#: these are the only geography fields the generic encoder knows about.
_WIDENED_FIELDS = ("activityCountries", "entityCountries")


def cmd_refile_from_text(args) -> None:
    conn = sqlite3.connect(DB)
    ref = json.load(open(NUTS_PATH))["regions"]
    valid_by_iso = {iso: {r["id"] for r in rs} for iso, rs in ref.items()}

    rows = conn.execute("""
        SELECT g.id, g.instrument_id, f.country, g.value_spec, g.requirement,
               COALESCE(g.quote, '')
          FROM eligibility_gates g
          JOIN funding_instruments f ON f.id = g.instrument_id
         WHERE g.value_spec IS NOT NULL AND g.value_spec <> ''
           AND f.country IS NOT NULL AND length(f.country) = 2
           AND (? IS NULL OR f.country = ?)
         ORDER BY g.id""", (args.country, args.country)).fetchall()

    moved = 0
    touched: list[int] = []
    for gid, inst, cc, raw, req, quote in rows:
        try:
            spec = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if spec.get("field") not in _WIDENED_FIELDS:
            continue
        valid = valid_by_iso.get(cc, set())
        if not valid:
            continue
        found = sorted({m for pair in NUTS_IN_TEXT.findall(f"{req or ''} {quote}")
                        for m in pair if m and m in valid})
        if not found:
            continue
        new = json.dumps({"op": "region_within", "field": "region", "allowed": found})
        print(f"  gate {gid} ({inst[:28]}) {spec.get('field')} "
              f"{spec.get('allowed') or spec.get('value')} -> region_within {found}\n"
              f"      {(req or '')[:78]}")
        moved += 1
        touched.append(gid)
        if not args.dry_run:
            conn.execute("""
                UPDATE eligibility_gates
                   SET value_spec = ?, intake_field_resolved = 'region',
                       gate_role = 'filter',
                       verify_note = COALESCE(verify_note || ' | ', '')
                                     || 'refiled to region: NUTS id present in the source text',
                       updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?""", (new, gid))
    if not args.dry_run:
        conn.commit()
    print(f"\n{len(rows)} encoded specs read; {moved} re-filed to region_within"
          + (" [dry run]" if args.dry_run else ""))

    if args.publish and not args.dry_run:
        print(f"published {publish(conn, touched)} re-filed gates to Postgres")
    conn.close()


# ── refile-national ─────────────────────────────────────────────────────────
# FREE — no model calls, and no judgement: every decision is read off values
# that are already written down. `run` fixes the gates it is asked to look at
# and costs a model call to do it; this fixes the ones that are already wrong,
# including any written before the reroute existed, and can be run on every
# push. The two share reroute_region_spec so they cannot decide differently.
def cmd_refile_national(args) -> None:
    conn = sqlite3.connect(DB)
    ref = load_nuts()
    rows = conn.execute("""
        SELECT g.id, g.instrument_id, f.country, g.value_spec, g.requirement
          FROM eligibility_gates g
          JOIN funding_instruments f ON f.id = g.instrument_id
         WHERE g.value_spec IS NOT NULL AND g.value_spec <> ''
           AND (? IS NULL OR f.country = ?)
         ORDER BY g.id""", (args.country, args.country)).fetchall()

    moved, stuck = 0, 0
    touched: list[int] = []
    for gid, inst, cc, raw, req in rows:
        try:
            spec = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if not isinstance(spec, dict) or spec.get("field") != "region":
            continue
        if spec.get("op") == REGION_OP:
            continue
        valid = {r["id"] for r in ref.get(canonicalise_country(cc) or "", [])}
        fix = reroute_region_spec(spec, valid)
        if not fix:
            stuck += 1
            print(f"  gate {gid} ({inst[:28]}) LEFT — {spec}\n      {(req or '')[:76]}")
            continue
        new, note = fix
        print(f"  gate {gid} ({inst[:28]}) {spec} -> {new}\n      {(req or '')[:76]}")
        moved += 1
        touched.append(gid)
        if not args.dry_run:
            conn.execute("""
                UPDATE eligibility_gates
                   SET value_spec = ?, intake_field_resolved = ?,
                       gate_role = 'filter',
                       verify_note = COALESCE(verify_note || ' | ', '') || ?,
                       updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?""", (json.dumps(new), new["field"], note[:400], gid))
    if not args.dry_run:
        conn.commit()
    print(f"\n{len(rows)} encoded specs read; {moved} rerouted off `region`, "
          f"{stuck} left for want of a derivable destination"
          + (" [dry run]" if args.dry_run else ""))
    if args.publish and not args.dry_run:
        print(f"published {publish(conn, touched)} gates to Postgres")
    conn.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    rf = sub.add_parser("refile-from-text")
    rf.add_argument("--dry-run", action="store_true")
    rf.add_argument("--country", default=None)
    rf.add_argument("--publish", action="store_true",
                    help="mirror the re-filed gates into Postgres")
    rf.set_defaults(fn=cmd_refile_from_text)
    rn = sub.add_parser("refile-national")
    rn.add_argument("--dry-run", action="store_true")
    rn.add_argument("--country", default=None)
    rn.add_argument("--publish", action="store_true",
                    help="mirror the rerouted gates into Postgres")
    rn.set_defaults(fn=cmd_refile_national)
    r = sub.add_parser("run")
    r.add_argument("--limit", type=int, default=0)
    r.add_argument("--dry-run", action="store_true")
    r.add_argument("--publish", action="store_true",
                   help="mirror the encoded/rerouted gates into Postgres")
    # Scoped for the same reason encode_gates.py encode is: a workstream must be
    # able to fix the region rules it just created without also paying for, and
    # silently moving, every other market inside its own before/after.
    r.add_argument("--country", default=None)
    r.set_defaults(fn=cmd_run)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
