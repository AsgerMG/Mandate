"""Can a founder APPLY to this row? The Python view of the ONE definition.

The rule lives in web/lib/intelligence/offerRoute.ts and is
projected to data/offer_route.json by `npx tsx scripts/emit_offer_route.ts`.
This module reads that projection and deliberately does not restate it.

That is not ceremony. The judgement this replaces --
`closed_beneficiary_list` -- shipped its constant into ETL/lib/liveness.py and
never taught the row-wise Python `is_closed()` about it, so the TypeScript and
the Python disagreed about eleven rows from the first commit and no check fired.
A projection plus a staleness check is the only arrangement in this repo that
has ever survived that.

`check_offer_route.ts` fails the build if this projection is stale.

Usage:
    from offer_route import has_route_sql, has_route, ROUTE_NONE

    cur.execute(f"SELECT id FROM funding_instruments WHERE {has_route_sql()}")
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

for _anc in Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import ROOT as REPO_ROOT  # noqa: E402

_SPEC_PATH = REPO_ROOT / "data" / "offer_route.json"


def _spec() -> dict:
    if not _SPEC_PATH.exists():
        raise SystemExit(
            f"{_SPEC_PATH} is missing -- the offer-route rule has not been "
            "projected. Run: cd ../web && "
            "npx tsx scripts/emit_offer_route.ts"
        )
    return json.loads(_SPEC_PATH.read_text())


_S = _spec()

#: An application route is recorded from an official source.
ROUTE_ATTESTED: str = _S["status"]["attested"]

#: Believed to be an offer; the route has not been sourced yet. The default and
#: the largest state. NOT grounds to withhold a row -- a missing route is a gap
#: in our collection, not a fact about the world.
ROUTE_UNRECORDED: str = _S["status"]["unrecorded"]

#: The official source establishes there is NO route in: aid fixed to a named
#: beneficiary list, or a row whose identity is a register artefact rather than
#: an offer. The only value that withholds a row, and the only one that requires
#: a source.
ROUTE_NONE: str = _S["status"]["none"]

ROUTE_STATUSES = frozenset(_S["status"].values())


def has_route_sql(dialect: str = "sqlite", col: str | None = None) -> str:
    """SQL for 'this row is something a founder can apply to', generated from
    the same function the product uses."""
    sql = _S["hasRouteSql"][dialect]
    if col:
        sql = sql.replace("route_status", f"{col}.route_status")
    return sql


def has_route(row) -> bool:
    """Row-wise form of the same rule, for callers that already hold the row.

    Absent or unrecognised is True, matching `hasOfferRoute()`: the corpus
    defaults to what it can defend, and withholding requires the explicit,
    sourced `none`.
    """
    try:
        value = row["route_status"]
    except (KeyError, IndexError, TypeError):
        value = None
    return value != ROUTE_NONE
