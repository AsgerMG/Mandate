"""How much of what the product OFFERS can the answer key name — and why not.

── The question this exists to answer ─────────────────────────────────────
`EXACT@5 30%` is a statement about the instruments the ground truth can name.
Workstream BB2 established that that is a much smaller set than the one a
founder is shown: 278 of 782 offerable leaves, and the 504 it misses are not a
random 504 — they are the national innovation agencies of Spain, the UK, France,
Estonia and Denmark, carrying 21,632 awards between the eighteen a founder
actually sees.

A share alone cannot be acted on, because the missing 504 fail for three
DIFFERENT reasons that need three different responses. This prints the census
that separates them, over the live corpus, naming nothing:

  NO AWARD NAMES IT       the leaf has zero awards on record. The key is built
                          from awards, so no honest pair can exist. Permanently
                          unmeasurable by recall, and correctly so.
  AWARDS, NO EXACT DOOR   awards exist and the ETL's own split cannot place any
                          of them on this leaf. Overwhelmingly SATR: a scheme
                          child exists only above MIN_CHILD_EVENTS, so the award
                          is credited to the notified scheme it was granted
                          under, not to the body that signed it. A test pair
                          needs ONE right answer; a notified scheme delivered by
                          eighteen bodies cannot supply one.
  AWARDS AND A DOOR       awards resolve to this leaf and the key still does not
                          name it. THIS is the recoverable population, and it is
                          the one `extend_recall_set.py` can close.

── The structural blind spot the third bucket turned out to be ────────────
`Split.leaf_for` builds its lookups from rows WITH a parent, so it can only ever
return a CHILD. A family with no children is not a regime — it is the door
itself, the thing `publishableInstruments()` offers and the founder applies to —
and `leaf_for` returns None for every one of its awards. Every childless family
in the corpus was therefore invisible to the extender by construction, which is
precisely the set BB2 named: `cdti_idi`, `cdti_neotec`, `innovate_uk`.

So this reports the family fallback separately from the exact-child hit, because
they are different claims about the same corpus and only one of them was ever
being made.

Usage:
    python3 ETL/terms/audit_answer_key_reach.py
    python3 ETL/terms/audit_answer_key_reach.py --set __recallSetComposed.json
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT, WEB  # noqa: E402


import argparse  # noqa: E402
import collections  # noqa: E402
import json  # noqa: E402
import sqlite3  # noqa: E402

from attribution import Split  # noqa: E402
# Which key SHIPS is read from `scripts/recallSet.ts`, in the same spirit as
# `offerable_ids` below reading the offerable set from the product rather than
# restating it. A default filename here is a second definition of the active
# set, and it went stale on 2026-08-09 when the constant moved to Doors.
from recall_holdout import active_recall_set  # noqa: E402

FRONTEND = WEB / "lib" / "intelligence"


def offerable_ids(path: _Path) -> set[str]:
    """The leaves the product may show — READ FROM THE PRODUCT, not restated.

    An earlier draft of this file rebuilt the test in SQL from `closed_sql()`,
    `is_framework` and the data floor, the way `extend_recall_set.py` does. It
    came out at 805 against the product's 782, because `publishableInstruments()`
    also applies `hasOfferRoute` and the degradation policy. Twenty-three leaves
    is three points of every coverage share this file prints, and the direction
    was flattering: a census of a wider population than the founder sees.

    Five independent restatements of the LIVENESS rule are what hid 306 leaves on
    2026-08-06. This is the same mistake one level up, so it is not made:
    `scripts/dump_publishable_ids.ts` runs the product's own function against
    live Postgres (it asserts `requireLiveCorpus`, so it cannot answer off the
    snapshot) and this reads the result."""
    if not path.exists():
        raise SystemExit(
            f"{path} is missing. This census must measure the population the "
            "PRODUCT offers, not a restatement of it. Run:\n"
            "  cd ../web && npx tsx scripts/dump_publishable_ids.ts "
            f"{path}")
    return set(json.loads(path.read_text()))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", default=active_recall_set())
    ap.add_argument("--publishable", default="/tmp/publishable_ids.json",
                    help="output of scripts/dump_publishable_ids.ts")
    args = ap.parse_args()

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row

    rows = json.loads((FRONTEND / args.set).read_text())
    named = {p["instrument"] for p in rows}

    offerable = offerable_ids(_Path(args.publishable))
    has_children = {r[0] for r in conn.execute(
        "SELECT DISTINCT parent_id FROM funding_instruments WHERE parent_id IS NOT NULL")}
    meta = {r["id"]: dict(r) for r in conn.execute(
        "SELECT id, parent_id, name, country, event_count FROM funding_instruments")}

    split = Split(conn)

    # ── Award-side: where does every award actually land? ────────────────────
    # Counted over the same population `extend_recall_set.py` scans, so the two
    # numbers are about one corpus rather than two.
    land: collections.Counter = collections.Counter()
    exact_hits: collections.Counter = collections.Counter()   # leaf -> awards
    family_hits: collections.Counter = collections.Counter()  # childless fam -> awards
    for e in conn.execute(
            "SELECT source, call_id, granting_authority, programme_name "
            "  FROM public_funding_events WHERE is_duplicate = 0"):
        leaf = split.leaf_for(e["source"], e["programme_name"],
                              e["granting_authority"], e["call_id"])
        if leaf:
            land["exact leaf (a programme or scheme child)"] += 1
            exact_hits[leaf] += 1
            continue
        # No child. The family may still BE the door: a family with no children
        # is the row a founder is offered, not a rollup above it. Asked through
        # `door_for` rather than restated, so this census and the extender it
        # justifies can never disagree about which awards are recoverable.
        door = split.door_for(e["source"], e["programme_name"],
                              e["granting_authority"], e["call_id"])
        fams = split.families(e["source"])
        if door:
            land["the family itself, which has no children (a real door)"] += 1
            family_hits[door] += 1
        elif len([f for f in fams if f not in has_children]) > 1:
            land["ambiguous: source maps to >1 childless family"] += 1
        elif split.code2inst.get((e["call_id"] or "").strip()):
            land["notified scheme only — several bodies, cannot say which"] += 1
        elif split.families(e["source"]):
            land["a family that HAS children — a regime, not a door"] += 1
        else:
            land["nothing: no source map at all"] += 1

    total_awards = sum(land.values())
    print(f"\nAWARDS, and the finest object each can honestly be credited to")
    print(f"  {total_awards:,} non-duplicate awards\n")
    for k, n in land.most_common():
        print(f"  {n:>9,}  {100 * n / total_awards:5.1f}%  {k}")

    # ── Leaf-side: the census that decides what can be fixed ─────────────────
    buckets: dict[str, list[str]] = collections.defaultdict(list)
    for iid in offerable:
        if iid in named:
            buckets["NAMED — the key already names it"].append(iid)
        elif exact_hits.get(iid):
            buckets["RECOVERABLE — awards resolve to it, key is silent"].append(iid)
        elif family_hits.get(iid):
            buckets["RECOVERABLE — childless family, awards land on it"].append(iid)
        elif (meta.get(iid) or {}).get("event_count"):
            buckets["UNMEASURABLE — has awards, none placeable on it"].append(iid)
        else:
            buckets["UNMEASURABLE — no award in the corpus names it"].append(iid)

    print(f"\nOFFERABLE LEAVES, by whether an honest pair can exist")
    print(f"  {len(offerable):,} offerable leaves\n")
    for k in sorted(buckets, key=lambda k: -len(buckets[k])):
        v = buckets[k]
        print(f"  {len(v):>5}  {100 * len(v) / len(offerable):5.1f}%  {k}")

    # Where the recoverable ones are, and how much award history they carry.
    # By country and not by name: the point is that the gap is concentrated in
    # whole markets, which is what makes it a product fact and not a long tail.
    rec = (buckets["RECOVERABLE — awards resolve to it, key is silent"]
           + buckets["RECOVERABLE — childless family, awards land on it"])
    by_country: collections.Counter = collections.Counter()
    awards_by_country: collections.Counter = collections.Counter()
    for iid in rec:
        c = (meta.get(iid, {}).get("country") or "??").upper()
        by_country[c] += 1
        awards_by_country[c] += exact_hits.get(iid, 0) + family_hits.get(iid, 0)
    print(f"\nRECOVERABLE, by country      leaves   awards behind them")
    for c, n in by_country.most_common(15):
        print(f"  {c:<6} {n:>26}   {awards_by_country[c]:>10,}")

    unm = buckets["UNMEASURABLE — has awards, none placeable on it"]
    print(f"\nUNMEASURABLE WITH AWARDS — the attribution gap, by country")
    ub: collections.Counter = collections.Counter()
    ua: collections.Counter = collections.Counter()
    for iid in unm:
        c = (meta.get(iid, {}).get("country") or "??").upper()
        ub[c] += 1
        ua[c] += meta.get(iid, {}).get("event_count") or 0
    for c, n in ub.most_common(15):
        print(f"  {c:<6} {n:>26}   {ua[c]:>10,}")

    conn.close()


if __name__ == "__main__":
    main()
