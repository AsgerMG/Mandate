"""Is this fund still open? The Python view of the ONE definition.

The rule itself lives in website/frontend/lib/intelligence/liveness.ts and is
projected to reference/liveness.json by `npx tsx scripts/emit_liveness.ts`. This
module reads that projection. It deliberately does not restate the rule: five
independent restatements of it are what hid 306 leaves on 2026-08-06, including
`Fondo di garanzia per le PMI`, Italy's flagship SME guarantee fund with 13,892
awards.

`check_liveness.ts` fails the build if the projection is stale, so a change to
the product's rule cannot silently leave the ETL judging by the old one.

Usage:
    from liveness import closed_sql, is_closed, NOTIFIED_DURATION, CALL_DEADLINE

    cur.execute(f"SELECT id FROM funding_instruments WHERE NOT {closed_sql()}")
"""
from __future__ import annotations

import datetime
import json
import sys
from pathlib import Path

for _anc in Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import ROOT as REPO_ROOT  # noqa: E402

_SPEC_PATH = REPO_ROOT / "reference" / "liveness.json"


def _spec() -> dict:
    if not _SPEC_PATH.exists():
        raise SystemExit(
            f"{_SPEC_PATH} is missing -- the liveness rule has not been "
            "projected. Run: cd website/frontend && npx tsx scripts/emit_liveness.ts"
        )
    return json.loads(_SPEC_PATH.read_text())


_S = _spec()

#: SATR ``caseMeasureEndDate``: the expiry of a State-aid NOTIFICATION for a
#: standing scheme. Prolongation is routine, so expiry alone is not closure.
NOTIFIED_DURATION: str = _S["basis"]["notifiedDuration"]

#: This instrument's own application deadline (a convocatoria's plazo, an ADEME
#: ``date_cloture``). Past means closed, permanently.
CALL_DEADLINE: str = _S["basis"]["callDeadline"]

# ── Does the register that publishes this row state a window for it? ────────
# Written by ETL/terms/assign_source_window_policy.py from reference/
# source_window_policy.json, read by the product's degradation policy. The
# names come from the projection rather than being spelled here, for the reason
# the module docstring gives: a hand-copied vocabulary is a vocabulary that
# will drift, and this one decides whether a founder sees a fund at all.

#: The register states a closing date for objects of this kind, so a row of
#: ours carrying none is a gap in OUR copy.
PUBLISHES_WINDOW: str = _S["sourceWindowPolicy"]["publishesWindow"]

#: The register's record for objects of this kind has no closing date in it at
#: all. No copy of any age is missing anything.
PUBLISHES_NO_WINDOW: str = _S["sourceWindowPolicy"]["publishesNoWindow"]

#: The register carries the field and states, for THIS object, that there is no
#: closing date.
DECLARES_OPEN_ENDED: str = _S["sourceWindowPolicy"]["declaresOpenEnded"]

#: Every value the column may hold. A writer that invents a fourth is writing a
#: value the product will read as "nobody asked", which withholds the row.
SOURCE_WINDOW_POLICIES: frozenset[str] = frozenset(
    _S["sourceWindowPolicy"].values())

#: How long an award year goes on evidencing that a notified duration was
#: prolonged. Read from the projection rather than spelled here: an award in
#: year Y establishes a prolongation THROUGH Y and nothing after it, and a
#: hand-copied horizon is how this module and ``isClosed()`` would come to
#: disagree about which schemes are dead. See RENEWAL_EVIDENCE_HORIZON_YEARS in
#: website/frontend/lib/intelligence/liveness.ts for the measurement behind the
#: value.
RENEWAL_EVIDENCE_HORIZON_YEARS: int = int(_S["renewalEvidenceHorizonYears"])

# A third basis, `closed_beneficiary_list`, existed on 2026-08-07 and was
# removed the same day. "There is no way into this row" is not a kind of date
# and does not belong on this axis; it lives in ETL/lib/offer_route.py. Its
# removal also closed a live divergence: the constant was added here and the
# row-wise `is_closed()` below was never taught it, so this module and
# `isClosed()` in TypeScript disagreed about eleven rows.


def closed_sql(dialect: str = "sqlite", col: str | None = None) -> str:
    """SQL for 'this row is closed', generated from the same function the
    product uses. `col` prefixes the columns for use inside a JOIN."""
    sql = _S["closedSql"][dialect]
    if col:
        sql = sql.replace("scheme_end_date", f"{col}.scheme_end_date")
        sql = sql.replace("last_year", f"{col}.last_year")
    return sql


def is_closed(row, as_of: str | None = None) -> bool:
    """Row-wise form of the same rule, for callers that already hold the row.

    `row` may be a sqlite3.Row, a dict, or anything supporting ``[]`` on the
    column names ``scheme_end_date``, ``scheme_end_date_basis`` and
    ``last_year``.
    """
    as_of = as_of or datetime.date.today().isoformat()

    def get(key):
        try:
            return row[key]
        except (KeyError, IndexError, TypeError):
            return None

    end = (get("scheme_end_date") or "")[:10]
    if not end or end >= as_of:
        return False
    # An unlabelled date is read as a call deadline -- the safe direction, and
    # the historical one: it keeps dead calls closed rather than re-proposing
    # them. Backfilled by ETL/terms/backfill_end_date_basis.py.
    if (get("scheme_end_date_basis") or "") != NOTIFIED_DURATION:
        return True
    # Aid granted after a notified duration expires is only lawful under a
    # prolonged measure, so a strictly later award year is evidence of renewal
    # -- of a renewal THROUGH THAT YEAR, and no further. Once the award year is
    # outside the register's own reporting lag the prolongation has stopped
    # being current and the declared expiry is again the last thing anybody has
    # stated about this window. SA.40453 was published to a founder as an open
    # door in 2026 on the strength of a 2022 award.
    last_year = get("last_year")
    this_year = int(as_of[:4])
    if (last_year is not None and int(last_year) > int(end[:4])
            and int(last_year) + RENEWAL_EVIDENCE_HORIZON_YEARS >= this_year):
        return False
    return True
