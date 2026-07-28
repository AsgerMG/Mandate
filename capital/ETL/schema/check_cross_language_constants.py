"""Constants that exist on both sides of the TypeScript/Python boundary.

Some values genuinely have to appear twice: the ETL writes them and the app
reads them, and there is no shared runtime. Those are the ones that drift,
because nothing compiles both halves together.

This project has now fixed that fault three times — the intake vocabulary kept
in three places, the country map in eight, the eligibility comparator in two —
and every one carried a "keep in sync" comment that did not work. Where a
duplicate cannot be removed, the next best thing is a check that fails when it
diverges.

Anything that CAN be generated should be, instead of listed here. The intake
vocabulary is the model: emit_vocabulary.ts writes data/vocabularies.json and
Python reads it, so there is no second copy to check.

Usage: python3 ETL/schema/check_cross_language_constants.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def gber_articles() -> list[str]:
    """GBER article codes: the ETL seeds the gate, the app labels it.

    populate_funding_instruments.py decides which codes become a
    `gber_article_inferred` gate; shortlist.ts turns each into the short legal
    basis a founder reads on the row. A code seeded but not labelled renders as
    a raw requirement string; a code labelled but never seeded is dead weight
    that reads as coverage we do not have.
    """
    py = (ROOT / "ETL/events/load/populate_funding_instruments.py").read_text()
    ts = (ROOT / "website/frontend/lib/intelligence/shortlist.ts").read_text()
    seeded = set(re.findall(r"StateAidObjectiveGberArt(\w+)", py))
    labelled = set(re.findall(r"StateAidObjectiveGberArt(\w+)", ts))
    problems = []
    if seeded - labelled:
        problems.append(f"  seeded by the ETL but unlabelled in the app: {sorted(seeded - labelled)}\n"
                        "    → those rows render a raw requirement string instead of a legal basis")
    if labelled - seeded:
        problems.append(f"  labelled in the app but never seeded: {sorted(labelled - seeded)}\n"
                        "    → dead labels that read as coverage we do not have")
    return problems


CHECKS = {"GBER article codes": gber_articles}


def main() -> None:
    failed = False
    for name, check in CHECKS.items():
        problems = check()
        if problems:
            failed = True
            print(f"{name}: DRIFTED")
            print("\n".join(problems))
        else:
            print(f"{name}: in sync")
    if failed:
        print("\nEither generate one side from the other, or update both.")
        sys.exit(1)


if __name__ == "__main__":
    main()
