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

BOTH STORES, and this was a bug. The first version read and wrote Postgres
alone. SQLite is the AUTHORING store — website/build/eligibility_export.py
builds instrument_terms.json from it, and every scoped publisher in ETL/terms
writes SQLite and mirrors — so a migration applied to Postgres only would be
carried right back over by the next export, and the site's fallback corpus
would keep serving the retired band names in the meantime. wsBT found three of
these still rejecting every founder who answered the question. So SQLite is
migrated first and Postgres is mirrored from it on (instrument_id, gate_key),
the two stores keeping independent surrogate ids.

Idempotent: re-running finds nothing to do. The pre-state of every row it
touches is written to project-mgmt/findings/, keyed by gate id, as wsAX did.

    python3 ETL/terms/reband_ticket_gates.py --dry-run
    python3 ETL/terms/reband_ticket_gates.py [--publish]
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from pathlib import Path

import psycopg2

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
from etl_env import DB, ROOT  # noqa: E402
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
    ap.add_argument("--publish", action="store_true",
                    help="mirror the migrated comparators into Postgres")
    args = ap.parse_args()

    if not REPLACEMENTS:
        print(f"nothing to do: the vocabulary no longer splits {RETIRED}")
        return 0

    conn = sqlite3.connect(DB)
    rows = conn.execute("""
        SELECT id, instrument_id, gate_key, value_spec
          FROM eligibility_gates
         WHERE value_spec IS NOT NULL AND value_spec <> ''
           AND json_extract(value_spec, '$.field') = 'ticketBand'
         ORDER BY id
    """).fetchall()

    before: dict[str, dict] = {}
    changes: list[tuple] = []
    for gid, iid, gkey, raw in rows:
        spec = json.loads(raw)
        new, notes = remap(spec)
        if not notes:
            continue
        before[str(gid)] = {"instrument_id": iid, "value_spec": spec}
        changes.append((gid, iid, gkey, spec, new, notes))

    print(f"ticketBand comparators: {len(rows)}   to migrate: {len(changes)}")
    for gid, iid, _gkey, old, new, notes in changes:
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
    for gid, _iid, _gkey, _old, new, _notes in changes:
        conn.execute(
            "UPDATE eligibility_gates SET value_spec = ?, updated_at = CURRENT_TIMESTAMP"
            " WHERE id = ?", (json.dumps(new, sort_keys=True), gid))
    conn.commit()
    print(f"\nmigrated {len(changes)} comparator(s) in SQLite; pre-state in {BEFORE}")

    if args.publish:
        db = psycopg2.connect(os.environ["DATABASE_URL"])
        with db, db.cursor() as cur:
            cur.executemany(
                "UPDATE eligibility_gates SET value_spec = %s"
                " WHERE instrument_id = %s AND gate_key = %s",
                [(json.dumps(new, sort_keys=True), iid, gkey)
                 for _gid, iid, gkey, _old, new, _notes in changes])
        db.close()
        print(f"published {len(changes)} comparator(s) to Postgres")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
