"""Flag ADEME events that duplicate a SATR-FR row, so corpus totals net them.

Companion to scripts/ademe_satr_overlap.py (which measures the overlap). This one
writes the decision: it sets public_funding_events.is_duplicate = 1 and
dup_reason = 'ademe_satr_overlap' on each ADEME grant row >= EUR 100k whose
beneficiary also has a SATR-FR row within +/-1 grant year and +/-15% on amount.

SATR is the canonical record (it is the legal transparency register), so the
ADEME copy is the one dropped. Sub-EUR 100k ADEME rows are never flagged: they
are below the SATR publication threshold and cannot be duplicates.

Re-runnable: it clears any existing 'ademe_satr_overlap' flags first, so a re-run
re-derives the set from scratch. Run after migration 009.
"""
from __future__ import annotations

import sqlite3
from collections import defaultdict
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent))
from satr_overlap_audit import normalise_name  # noqa: E402

DB_PATH = Path(__file__).parent.parent / "db.sqlite"
THRESHOLD = 100_000
AMOUNT_TOL = 0.15
YEAR_WINDOW = 1
REASON = "ademe_satr_overlap"


def grant_year(started: str | None, deadline: str | None) -> int | None:
    for d in (started, deadline):
        if d and len(d) >= 4 and d[:4].isdigit():
            return int(d[:4])
    return None


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    try:
        # SATR-FR index: normalised beneficiary name -> [(amount, year)]
        satr_by_name: dict[str, list[tuple[float | None, int | None]]] = defaultdict(list)
        for canon, raw, amt, started, deadline in conn.execute(
            """SELECT c.canonical_name, c.raw_name, e.grant_amount_eur,
                      e.project_started, e.call_deadline
               FROM public_funding_events e JOIN companies c ON c.id = e.company_id
               WHERE e.source LIKE 'satr_fr%'"""
        ):
            n = normalise_name(canon) or normalise_name(raw)
            if n:
                satr_by_name[n].append((amt, grant_year(started, deadline)))

        # Candidate ADEME rows (>= threshold).
        ademe = conn.execute(
            """SELECT e.id, c.canonical_name, c.raw_name, e.grant_amount_eur,
                      e.project_started, e.call_deadline
               FROM public_funding_events e JOIN companies c ON c.id = e.company_id
               WHERE e.source = 'ademe_aid' AND e.grant_amount_eur >= ?""",
            (THRESHOLD,),
        ).fetchall()

        dup_ids: list[int] = []
        dup_eur = 0.0
        for pid, canon, raw, amt, started, deadline in ademe:
            n = normalise_name(canon) or normalise_name(raw)
            cands = satr_by_name.get(n)
            if not cands or not amt:
                continue
            yr = grant_year(started, deadline)
            for s_amt, s_yr in cands:
                year_ok = yr is None or s_yr is None or abs(s_yr - yr) <= YEAR_WINDOW
                amt_ok = s_amt and abs(s_amt - amt) / amt <= AMOUNT_TOL
                if year_ok and amt_ok:
                    dup_ids.append(pid)
                    dup_eur += amt
                    break

        # Reset prior flags for this reason, then apply.
        conn.execute(
            "UPDATE public_funding_events SET is_duplicate = 0, dup_reason = NULL "
            "WHERE dup_reason = ?",
            (REASON,),
        )
        conn.executemany(
            "UPDATE public_funding_events SET is_duplicate = 1, dup_reason = ? WHERE id = ?",
            [(REASON, pid) for pid in dup_ids],
        )
        conn.commit()
        print(f"Flagged {len(dup_ids):,} ADEME rows as duplicates of SATR-FR "
              f"(EUR {dup_eur/1e9:.2f}bn netted from totals).")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
