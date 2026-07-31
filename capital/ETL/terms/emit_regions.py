"""Generate the frontend's region module from the NUTS reference data.

data/reference/nuts_regions.json is the source of truth (Eurostat GISCO, NUTS
2024). The frontend cannot import from outside its own tree, so the list is
generated into lib/intelligence/regions.generated.ts rather than hand-copied —
a hand-copied vocabulary drifts, and when it drifts nothing fails: the encoder
simply emits region ids the product cannot match, and the rule silently stops
gating. Same reasoning as data/vocabularies.json.

check_regions.ts fails the build when the two disagree.

Usage: python3 ETL/terms/emit_regions.py
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import ROOT  # noqa: E402

import json  # noqa: E402

SRC = ROOT / "data" / "reference" / "nuts_regions.json"
OUT = ROOT / "website" / "frontend" / "lib" / "intelligence" / "regions.generated.ts"

HEADER = '''// GENERATED from data/reference/nuts_regions.json — do not edit by hand.
// Source: Eurostat GISCO, NUTS 2024. Regenerate with
// `python3 ETL/terms/emit_regions.py`; check_regions.ts fails the build if
// this file and the reference data disagree.
//
// NUTS-1 and NUTS-2 are both present because national regions sit at different
// levels: France's Normandie is NUTS-1 (FRD) while Ile-de-France is NUTS-2
// (FR10). Where the same name exists at both levels the broader id is kept,
// since region matching is by id PREFIX and the broader one still satisfies a
// rule written against the narrower.
export interface Region { id: string; name: string }

export const REGIONS_BY_COUNTRY: Record<string, Region[]> = {
'''

FOOTER = '''};

/**
 * Do two regions overlap?
 *
 * NUTS ids are hierarchical, so containment is a string prefix: FRD1
 * (Basse-Normandie) sits inside FRD (Normandie). The test runs BOTH ways on
 * purpose. A founder who answered at one level and a rule written at another
 * describe overlapping ground, and the honest reading of a partial overlap is
 * "not ruled out" — the product never claims a founder qualifies, only that
 * nothing disqualifies them, so leniency here cannot overclaim.
 */
export function regionsOverlap(a: string, b: string): boolean {
  if (!a || !b) return false;
  const x = a.toUpperCase(), y = b.toUpperCase();
  return x.startsWith(y) || y.startsWith(x);
}

/** Options for the founder's countries, deduplicated across them. */
export function regionOptions(countryCodes: string[]): { value: string; label: string }[] {
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [];
  for (const cc of countryCodes) {
    for (const r of REGIONS_BY_COUNTRY[cc.toUpperCase()] ?? []) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push({ value: r.id, label: r.name });
    }
  }
  return out;
}
'''


# Eurostat does not use ISO country codes for two members: NUTS writes EL for
# Greece and UK for the United Kingdom, where ISO writes GR and GB. Everything
# else in this product is keyed by ISO2, so the mismatch is resolved once,
# here, rather than left for each caller to trip over. It is exactly the kind
# of difference that fails silently: the lookup simply returns nothing and the
# region question stops being asked for that country alone.
NUTS_TO_ISO2 = {"EL": "GR", "UK": "GB"}


def build() -> str:
    regions = json.loads(SRC.read_text())["regions"]
    regions = {NUTS_TO_ISO2.get(cc, cc): rs for cc, rs in regions.items()}
    lines = []
    for cc, rs in sorted(regions.items()):
        # Names repeat across levels (Ile-de-France is both FR1 and FR10). Keep
        # the SHORTEST id for a given name: it is the more general area, and
        # prefix matching means it still satisfies a rule written against the
        # narrower one.
        best: dict[str, dict] = {}
        for r in rs:
            n = r["name"]
            if n not in best or len(r["id"]) < len(best[n]["id"]):
                best[n] = r
        items = sorted(best.values(), key=lambda r: r["name"])
        inner = ", ".join(
            '{ id: "%s", name: %s }' % (r["id"], json.dumps(r["name"], ensure_ascii=False))
            for r in items)
        lines.append(f"  {cc}: [{inner}],")
    return HEADER + "\n".join(lines) + "\n" + FOOTER


def main() -> None:
    text = build()
    OUT.write_text(text)
    n = sum(len(v) for v in json.loads(SRC.read_text())["regions"].values())
    print(f"emit_regions -> {OUT.relative_to(ROOT)}  ({n} source regions)")


if __name__ == "__main__":
    main()
