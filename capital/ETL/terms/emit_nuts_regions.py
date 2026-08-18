"""Rebuild reference/nuts_regions.json from Eurostat's NUTS register.

── Why this file exists ───────────────────────────────────────────────────
`reference/nuts_regions.json` arrived in one commit on 2026-07-31 with its
source named in prose -- "Eurostat GISCO, NUTS 2024 (NUTS_AT_2024.csv)" -- and
no way to produce it again. It has four readers:

    ETL/lib/nuts_regions.py           sub-national names, via encode_gates.py
                                      and check_gate_subject.py
    ETL/terms/encode_regions.py       the allowed-id vocabulary the model may
                                      resolve fund text onto, AND the validator
                                      that accepts or rejects what it emitted
    ETL/terms/emit_regions.py         generates the site's regions.generated.ts
    website/frontend/scripts/check_regions.ts  holds that module to it

Two of those decide what a founder is shown. Region is now the most
load-bearing signal in the product, so 449 rows nobody can regenerate is the
same shape as the schema nobody could rebuild -- one file over. Either it has a
generator or it is hand-maintained with a stated reason; it had neither, only a
sentence saying where it came from.

It is a generator rather than a note, because the file IS derivable: every one
of the 449 entries is exactly `NUTS_AT_2024.csv` filtered to levels 1 and 2,
verified below by `--check`.

── What is and is not committed ───────────────────────────────────────────
The same contract `audit_region_claims.py --refresh-reference` already
established for the sibling `nuts_names.json`: the raw GISCO CSV is NOT
committed (`data/raw/` is gitignored), the derived JSON is, and this script is
the bridge. A missing CSV prints the exact `curl` that fetches it rather than
fetching silently, so a rebuild is something a person decided to do.

That is also why `--check` is not in CI. It reads a gitignored file, and a CI
step that reads gitignored data is a step that prints "skipping" and returns 0
forever -- the defect `check_aggregate_independence` sat in for its whole life.
The CI-side assertion is in `check_regions.ts`, which compares this file
against the committed `nuts_names.json`, needs no network and no raw data.

── The details that will bite a re-implementation ─────────────────────────
  * Country keys are NUTS codes, not ISO2: `EL` for Greece, and no `UK` at all
    (dropped from NUTS 2024). The ISO2 mapping is applied downstream by
    emit_regions.py and check_regions.ts, deliberately, so this file stays a
    faithful copy of the register.
  * `name` is NAME_LATN, stripped. Nine 2024 rows carry a trailing space
    (ES52, FRD1, FRD2, FRY2, FRY4, LT02, MK0, MK00, RS2); not stripping them
    produces a diff against the committed file on every run.
  * There is no LEVL_CODE column in NUTS_AT_2024.csv -- the header is
    CNTR_CODE, NUTS_ID, NAME_LATN, NUTS_NAME, MOUNT_TYPE, URBN_TYPE,
    COAST_TYPE. Level is len(NUTS_ID) - 2, which is what prefix matching
    downstream already assumes and is asserted here rather than trusted.
  * Levels 1 and 2 BOTH, because national regions sit at different levels:
    France's Normandie is NUTS-1 FRD while Ile-de-France is NUTS-2 FR10.
    Matching is by id prefix. Do not "tidy" this to one level.

Usage:
  python3 ETL/terms/emit_nuts_regions.py --check    # regenerate and diff, no write
  python3 ETL/terms/emit_nuts_regions.py --write
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

import argparse  # noqa: E402
import csv  # noqa: E402
import json  # noqa: E402
from collections import defaultdict  # noqa: E402

OUT = ROOT / "reference" / "nuts_regions.json"
# Same directory and same vintage constant as audit_region_claims.py, which
# builds the sibling nuts_names.json from the same download.
GISCO_NUTS_DIR = ROOT / "data" / "raw" / "gisco_nuts"
GISCO_URL = "https://gisco-services.ec.europa.eu/distribution/v2/nuts/csv/NUTS_AT_%d.csv"
VINTAGE = 2024

#: Both, and the module header says why. Changing this changes what every
#: region gate in the corpus can be encoded against.
LEVELS = (1, 2)

#: Carried through unchanged from the committed file: prose a reader needs and
#: no CSV column supplies.
LEVELS_NOTE = (
    "NUTS-1 and NUTS-2 are both included because national regions sit at "
    "different levels: France's Normandie is NUTS-1 (FRD) while Ile-de-France "
    "is NUTS-2 (FR10). Matching is by id prefix.")
LICENCE = ("Eurostat reuse policy, Commission Decision 2011/833/EU -- reuse "
           "authorised provided the source is acknowledged. Attribute table "
           "only; the boundary geometries carry a separate EuroGeographics "
           "notice and are not used.")


def build() -> dict:
    path = GISCO_NUTS_DIR / f"NUTS_AT_{VINTAGE}.csv"
    if not path.exists():
        raise SystemExit(
            f"missing {path.relative_to(ROOT)} -- fetch it with\n"
            f"  curl -sSL --create-dirs -o {path} '{GISCO_URL % VINTAGE}'")
    regions: dict[str, list] = defaultdict(list)
    for r in csv.DictReader(path.open(encoding="utf-8-sig")):
        cc, nid = r["CNTR_CODE"], r["NUTS_ID"]
        # The CSV carries no LEVL_CODE column -- level IS the id length past the
        # two-letter country prefix, which is the same fact every downstream
        # prefix match already rests on. Asserted rather than assumed: if
        # Eurostat ever ships an id that does not sit under its own country,
        # prefix matching starts resolving the wrong region, and that is not a
        # thing to discover from a founder.
        if not nid.startswith(cc):
            raise SystemExit(f"{nid}: does not sit under its country {cc}. "
                             f"Prefix matching downstream assumes it does.")
        level = len(nid) - 2
        if level not in LEVELS:
            continue
        regions[cc].append({
            "id": nid, "level": level, "name": r["NAME_LATN"].strip()})
    for entries in regions.values():
        entries.sort(key=lambda e: e["id"])
    return {
        "source": f"Eurostat GISCO, NUTS {VINTAGE} (NUTS_AT_{VINTAGE}.csv)",
        "source_url": GISCO_URL % VINTAGE,
        "licence": LICENCE,
        "generator": "ETL/terms/emit_nuts_regions.py",
        "levels": LEVELS_NOTE,
        "regions": dict(sorted(regions.items())),
    }


def diff(built: dict, have: dict) -> list[str]:
    """Every disagreement between a rebuild and the committed file, on the two
    keys anything reads: the country set and the (id, level, name) triples."""
    problems: list[str] = []
    b, h = built["regions"], have.get("regions", {})
    for cc in sorted(set(b) | set(h)):
        if cc not in h:
            problems.append(f"{cc}: in NUTS {VINTAGE}, absent from the committed file "
                            f"({len(b[cc])} regions)")
            continue
        if cc not in b:
            problems.append(f"{cc}: in the committed file, absent from NUTS {VINTAGE} "
                            f"({len(h[cc])} regions)")
            continue
        bi = {e["id"]: e for e in b[cc]}
        hi = {e["id"]: e for e in h[cc]}
        for rid in sorted(set(bi) | set(hi)):
            if rid not in hi:
                problems.append(f"{cc} {rid}: missing from the committed file "
                                f"({bi[rid]['name']!r})")
            elif rid not in bi:
                problems.append(f"{cc} {rid}: not in NUTS {VINTAGE} ({hi[rid]['name']!r})")
            elif (bi[rid]["name"], bi[rid]["level"]) != (hi[rid]["name"], hi[rid]["level"]):
                problems.append(
                    f"{cc} {rid}: register says {bi[rid]['name']!r} L{bi[rid]['level']}, "
                    f"file says {hi[rid]['name']!r} L{hi[rid]['level']}")
    return problems


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="rebuild and report drift; write nothing")
    ap.add_argument("--write", action="store_true",
                    help="rebuild and overwrite the reference file")
    args = ap.parse_args()
    if not (args.check or args.write):
        ap.error("pass --check or --write")

    built = build()
    n = sum(len(v) for v in built["regions"].values())

    if args.check:
        have = json.loads(OUT.read_text())
        problems = diff(built, have)
        if problems:
            print(f"emit_nuts_regions: DRIFTED from NUTS {VINTAGE}\n")
            for p in problems[:20]:
                print(f"  - {p}")
            if len(problems) > 20:
                print(f"  ... and {len(problems) - 20} more")
            print(f"\n  Eurostat has republished, or the file was hand-edited. "
                  f"Rebuild with --write\n  and re-run `python3 "
                  f"ETL/terms/emit_regions.py`, which regenerates the site "
                  f"module from it.")
            return 1
        print(f"emit_nuts_regions: ok — the committed file is exactly NUTS "
              f"{VINTAGE} levels {'+'.join(map(str, LEVELS))} "
              f"({n} regions across {len(built['regions'])} countries)")
        return 0

    OUT.write_text(json.dumps(built, indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)} — {n} regions across "
          f"{len(built['regions'])} countries")
    print("re-run `python3 ETL/terms/emit_regions.py` so the site module follows, "
          "then `npx tsx scripts/check_regions.ts`.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
