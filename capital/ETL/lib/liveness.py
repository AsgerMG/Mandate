"""Is this fund still open? The Python view of the ONE definition.

The rule itself lives in website/frontend/lib/intelligence/liveness.ts and is
projected to data/liveness.json by `npx tsx scripts/emit_liveness.ts`. This
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

_SPEC_PATH = REPO_ROOT / "data" / "liveness.json"


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

#: The participants were fixed by the decision that created the row -- aid
#: approved for a named beneficiary list, with no route in for anyone not
#: already on it. Closes the row with NO date, because the row never had a
#: window. See the constant in liveness.ts for the evidence.
CLOSED_BENEFICIARY_LIST: str = _S["basis"]["closedBeneficiaryList"]


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
    # prolonged measure, so a strictly later award year is evidence of renewal.
    last_year = get("last_year")
    if last_year is not None and int(last_year) > int(end[:4]):
        return False
    return True
