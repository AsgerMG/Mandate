"""Every declaration in family_name_evidence.json is usable, and silence fails.

Runs on the committed reference file alone -- no database, no network -- because
the property it protects is about the DECLARATION, not about today's corpus.

The failure it exists for: a family whose row name is nothing but a mechanical
re-casing of its own id, and which nobody has answered for. Both ways of getting
that wrong are expensive and neither is visible at runtime. Keep it and a
register artefact reaches a founder's menu as a fund -- Poland's entire
offerable pool was eight of them. Drop it and a real fund disappears from every
founder in its country.

Run: python3 ETL/events/load/test_name_evidence_declarations.py
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break

from name_evidence import (  # noqa: E402
    NAMES_PARTITION_KEY, declaration_for, names_the_object)

FAILURES: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    if not condition:
        FAILURES.append(f"{label}{': ' + detail if detail else ''}")


def main() -> int:
    # The three buckets wsFQ found in founders' menus, and the one this
    # workstream added. Named explicitly because each is a row that was measured
    # in front of a founder, not an example chosen to make the test pass.
    for fam in ("satr_pt_equity", "satr_ee_equity", "satr_lt_equity",
                "sudop_parp_rd", "sudop_rnd_purpose", "chips_ju_kdt_unknown"):
        d = declaration_for(fam)
        check(f"{fam} is declared", d is not None)
        if d:
            check(f"{fam} is a partition key",
                  d["names"] == NAMES_PARTITION_KEY, str(d["names"]))
            check(f"{fam} is withheld", names_the_object(fam) is False)

    # The over-fire class: real funds whose slug happens to be recoverable from
    # a published identifier. If any of these is ever read as a bucket, the
    # property has become a heuristic and is deleting funds.
    for fam in ("horizon_eu_cl4", "innovation_fund_lsp", "ipcei_hy2tech",
                "edf_ra", "clean_aviation", "eurohpc", "eib_venture",
                "chips_ju_kdt", "eit_food_rfs"):
        d = declaration_for(fam)
        check(f"{fam} is declared", d is not None)
        if d:
            check(f"{fam} is NOT a bucket", names_the_object(fam) is True,
                  str(d["names"]))

    # An exact id beats a prefix. `chips_ju_kdt_unknown` is carved out of the
    # `chips_ju` feed's own answer, and the carve-out is the whole reason the
    # matcher ranks that way -- a prefix-only file could not express it.
    check("an exact id beats a prefix",
          names_the_object("chips_ju_kdt") is True
          and names_the_object("chips_ju_kdt_unknown") is False)

    # Silence raises. A quiet False deletes a real fund; a quiet True keeps a
    # bucket. Neither is an answer, so the only correct behaviour is to stop.
    try:
        names_the_object("a_feed_nobody_has_declared_yet")
    except KeyError:
        pass
    else:
        FAILURES.append("an undeclared family returned an answer instead of raising")

    if FAILURES:
        print("test_name_evidence_declarations: FAIL")
        for f in FAILURES:
            print(f"  {f}")
        return 1
    print("test_name_evidence_declarations: ok")
    return 0


if __name__ == "__main__":
    _sys.exit(main())
