"""Carry the encoded ticketBand rules across the rebanding, without widening one.

The intake's ticket scale gained three bands at the low end: the old `lt500k`
became `lt25k` | `b25k_100k` | `b100k_500k`. 44 encoded comparators are written
against the old names, and two separate things would break if they were left
alone.

  THE BOUND. A rule reading `band_max lt500k` means "this fund does not write
  cheques above EUR 500k". Under the new scale the band that ends at EUR 500k is
  `b100k_500k`, so that is what the bound must become. Left as `lt500k` — a band
  that now ends at EUR 25k — the rule would silently tighten twentyfold and hide
  the fund from every founder asking for EUR 30k that it actually serves.

  THE FROZEN ORDER. Every band_max/band_min spec carries its own copy of the
  band list, written at encode time. All 33 of them predate the new bands, so
  `indexOf` returns -1 for any founder answering one of the three new values and
  the rule evaluates to null — "not assessable" — for everyone, forever. That is
  the state wsAX found `region` in, and the reason it is worth a migration
  rather than a comment: an inert rule is a rule nothing can prove wrong, and
  wrongness accumulates behind it. comparator.ts now reads the LIVE vocabulary,
  so the frozen copies are dropped here rather than rewritten.

DIRECTION IS THE WHOLE POINT. Every remapping below preserves or narrows what a
rule admits; none widens one. `band_min lt500k` was already "at least the
bottom band", i.e. no constraint, and becomes `lt25k`, which is the same no
constraint — not a new floor at EUR 500k. `equals lt500k` cannot stay `equals`
because one old band is now three, so it becomes the `in` that says the same
thing. This is the inversion wsAX exists to stop, arriving through a vocabulary
change instead of an encoding one.

Idempotent: re-running finds nothing to do. The pre-state of every row it
touches is written to project-mgmt/findings/, keyed by gate id, as wsAX did.

    python3 ETL/terms/reband_ticket_gates.py --dry-run
    python3 ETL/terms/reband_ticket_gates.py
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import psycopg2
import psycopg2.extras

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
from etl_env import ROOT  # noqa: E402
from ticket_bands import BAND_ORDER  # noqa: E402

BEFORE = ROOT / "project-mgmt" / "findings" / "reband_ticket_gates_wsAZ_before.json"

# The one old band that split, and what it split into. Read from the live
# vocabulary rather than typed twice: these are exactly the bands whose ceiling
# is at or below the old EUR 500k edge.
RETIRED = "lt500k"
REPLACEMENTS = [b for b in ("lt25k", "b25k_100k", "b100k_500k") if b in BAND_ORDER]
# "At most `lt500k`" meant "at most EUR 500k", and the band that now ends there
# is the last of the replacements. "At least `lt500k`" meant "at least nothing",
# and the band that now starts at nothing is the first.
AS_MAX = REPLACEMENTS[-1] if REPLACEMENTS else None
AS_MIN = REPLACEMENTS[0] if REPLACEMENTS else None


def remap(spec: dict) -> tuple[dict, list[str]]:
    """Return the migrated spec and a human account of what changed."""
    out = dict(spec)
    notes: list[str] = []

    if out.get("op") == "band_max" and out.get("maxAllowed") == RETIRED:
        out["maxAllowed"] = AS_MAX
        notes.append(f"maxAllowed {RETIRED} -> {AS_MAX} (the band that still ends at EUR 500k)")
    if out.get("op") == "band_min" and out.get("minAllowed") == RETIRED:
        out["minAllowed"] = AS_MIN
        notes.append(f"minAllowed {RETIRED} -> {AS_MIN} (both mean 'no lower bound')")

    if out.get("op") in ("in", "not_in") and RETIRED in (out.get("allowed") or []):
        widened = []
        for v in out["allowed"]:
            widened.extend(REPLACEMENTS if v == RETIRED else [v])
        # Dedupe, preserving order.
        out["allowed"] = list(dict.fromkeys(widened))
        notes.append(f"allowed: {RETIRED} -> {REPLACEMENTS}")

    if out.get("op") == "equals" and out.get("value") == RETIRED:
        # One band became three, and `equals` cannot say "any of three".
        out = {"op": "in", "field": out.get("field"), "allowed": list(REPLACEMENTS)}
        notes.append(f"equals {RETIRED} -> in {REPLACEMENTS} (one band is now three)")

    # The frozen band list. comparator.ts reads the live vocabulary now, so a
    # copy here can only go stale again.
    if "order" in out:
        if out["order"] != BAND_ORDER:
            notes.append(f"dropped a frozen order that had gone stale ({len(out['order'])} bands)")
        else:
            notes.append("dropped a frozen order")
        out.pop("order")

    return out, notes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not REPLACEMENTS:
        print(f"nothing to do: the vocabulary no longer splits {RETIRED}")
        return 0

    db = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT id, instrument_id, value_spec
          FROM eligibility_gates
         WHERE value_spec IS NOT NULL
           AND value_spec::jsonb->>'field' = 'ticketBand'
         ORDER BY id
    """)
    rows = [dict(r) for r in cur.fetchall()]

    before: dict[str, dict] = {}
    changes: list[tuple] = []
    for r in rows:
        spec = json.loads(r["value_spec"])
        new, notes = remap(spec)
        if not notes:
            continue
        before[str(r["id"])] = {"instrument_id": r["instrument_id"], "value_spec": spec}
        changes.append((r["id"], r["instrument_id"], spec, new, notes))

    print(f"ticketBand comparators: {len(rows)}   to migrate: {len(changes)}")
    for gid, iid, old, new, notes in changes:
        print(f"\n  {iid}  (gate {gid})")
        print(f"    was: {json.dumps(old, sort_keys=True)}")
        print(f"    now: {json.dumps(new, sort_keys=True)}")
        for n in notes:
            print(f"       - {n}")

    if not changes:
        print("\nnothing to migrate -- already carried across.")
        return 0
    if args.dry_run:
        print("\n--dry-run: nothing written.")
        return 0

    BEFORE.parent.mkdir(parents=True, exist_ok=True)
    BEFORE.write_text(json.dumps(before, indent=2, sort_keys=True) + "\n")
    for gid, _iid, _old, new, _notes in changes:
        cur.execute("UPDATE eligibility_gates SET value_spec = %s WHERE id = %s",
                    (json.dumps(new, sort_keys=True), gid))
    db.commit()
    print(f"\nmigrated {len(changes)} comparator(s); pre-state in {BEFORE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
