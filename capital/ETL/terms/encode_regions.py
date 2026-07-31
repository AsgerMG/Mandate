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
  python3 ETL/terms/encode_regions.py run [--limit N] [--dry-run]
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402

import argparse  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402

import anthropic  # noqa: E402

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


def client() -> anthropic.Anthropic:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise SystemExit("ANTHROPIC_API_KEY not set")
    return anthropic.Anthropic(api_key=key)


def load_nuts() -> dict[str, list[dict]]:
    return json.loads(NUTS_PATH.read_text())["regions"]


def candidates(conn: sqlite3.Connection) -> list[tuple]:
    rows = conn.execute("""
        SELECT g.id, g.instrument_id, g.gate_key, g.requirement, g.value_spec,
               f.country
          FROM eligibility_gates g
          JOIN funding_instruments f ON f.id = g.instrument_id
         WHERE (g.gate_role IS NULL OR g.gate_role = 'filter')
           AND f.country IS NOT NULL AND length(f.country) = 2
         ORDER BY g.instrument_id, g.gate_key
    """).fetchall()
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
    rows = candidates(conn)
    if args.limit:
        rows = rows[: args.limit]
    print(f"resolving {len(rows):,} candidate gates ({MODEL})")
    cl = client()
    encoded = cleared = skipped = 0

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
            for out in json.loads(text)["results"]:
                gid = out["id"]
                ids = [x for x in out.get("region_ids", []) if x in valid]
                if not out.get("is_subnational") or not ids:
                    # Not a regional restriction, or unmappable. If it was
                    # encoded to the whole country we leave that alone: for a
                    # rule that really is national, that spec is correct.
                    skipped += 1
                    continue
                spec = json.dumps({"op": "region_within", "field": "region",
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
            cleared += 0
        if not args.dry_run:
            conn.commit()
    if not args.dry_run:
        conn.commit()
    print(f"done: {encoded} encoded as region_within, {skipped} left unchanged")
    conn.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    r = sub.add_parser("run")
    r.add_argument("--limit", type=int, default=0)
    r.add_argument("--dry-run", action="store_true")
    r.set_defaults(fn=cmd_run)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
