"""How much of the corpus can be placed on a fund, and what fails when it cannot.

WS-BQ. 272,307 of 492,319 award pairs (55%) do not resolve to an exact leaf.
`attribution.py` widens those to the notified scheme; `emit_peer_prior.py` now
ranks the two kinds separately. This measures the population itself -- read out
of Postgres, which is the corpus of record -- so the register of consumers can
be sized rather than argued.

Read-only. Every number printed here is a SELECT.

  python3 ETL/terms/_wsbq_attribution_audit.py [--section rate|reason|source|recoverable]
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import ROOT  # noqa: E402,F401

import argparse  # noqa: E402
import collections  # noqa: E402
import os  # noqa: E402

import psycopg2  # noqa: E402


# WHERE EACH NUMBER IS READ FROM, and why it is not all one store.
#
# Postgres holds the INSTRUMENT layer -- `funding_instruments`,
# `funding_instrument_sources`, the gates -- and is the corpus of record for
# what a fund IS. It does NOT hold `public_funding_events` or `companies`;
# those exist only in the local store. So a placement rate cannot be computed
# in one place: the leaf definitions come from Postgres, the awards from
# sqlite. `assert_instrument_layer_matches` below refuses to report a number
# unless the two stores agree on the layer they share, so a stale local cache
# cannot quietly produce a different rate than the corpus of record would.


def assert_instrument_layer_matches(sq, dsn: str) -> None:
    """Refuse to measure if the PLACEMENT-BEARING instrument layer has drifted.

    Compared on identity, not cardinality: two stores can hold 1,088 rows each
    and disagree about which. But only part of that layer decides placement --
    `Split` keys children on (parent_id, name, scheme_code) and never reads a
    ROOT's name -- and the two stores are EXPECTED to differ on the rest:
    `apply_override_names.py` rewrites root display names in Postgres only, so
    21 bdns_conv_* roots carry a short editorial name there and the publisher's
    original locally. Failing on that would make this audit unrunnable for a
    difference that cannot move a single award.

    So the hard assertion covers exactly the columns that decide where an award
    lands. The cosmetic delta is counted and printed, never passed over in
    silence.
    """
    import hashlib

    def digest(rows) -> str:
        h = hashlib.sha256()
        for r in sorted(tuple("" if v is None else str(v) for v in row) for row in rows):
            h.update("\x1f".join(r).encode()); h.update(b"\x1e")
        return h.hexdigest()[:16]

    CHILDREN = ("SELECT parent_id, name, scheme_code, id FROM funding_instruments "
                "WHERE parent_id IS NOT NULL AND parent_id != ''")
    CODES = "SELECT id, scheme_code FROM funding_instruments"
    SOURCES = "SELECT source, instrument_id FROM funding_instrument_sources"
    SQLS = (("children", CHILDREN), ("codes", CODES), ("sources", SOURCES))

    db = psycopg2.connect(dsn)
    cur = db.cursor()
    pg = {}
    for label, sql in SQLS:
        cur.execute(sql)
        pg[label] = digest(cur.fetchall())
    cur.execute("SELECT id, name FROM funding_instruments")
    pg_names = {r[0]: (r[1] or "") for r in cur.fetchall()}
    db.close()

    local = {label: digest(sq.execute(sql).fetchall()) for label, sql in SQLS}
    lo_names = {r[0]: (r[1] or "")
                for r in sq.execute("SELECT id, name FROM funding_instruments")}

    if pg != local:
        raise SystemExit(
            "the placement-bearing instrument layer differs between Postgres "
            "and the local store:\n" + "".join(
                f"  {k:<9} pg={pg[k]}  local={local[k]}"
                f"{'  <-- DIFFERS' if pg[k] != local[k] else ''}\n" for k in pg) +
            "Placement measured locally would not be the corpus of record's "
            "placement. Resync before trusting any rate.")

    cosmetic = sorted(k for k in pg_names if pg_names[k] != lo_names.get(k, ""))
    kids = {r[0] for r in sq.execute(
        "SELECT id FROM funding_instruments "
        "WHERE parent_id IS NOT NULL AND parent_id != ''")}
    print("instrument layer: placement-bearing columns AGREE with Postgres "
          f"(children {pg['children']}, codes {pg['codes']}, sources {pg['sources']})")
    print(f"  display names differ on {len(cosmetic)} instruments, "
          f"{len(set(cosmetic) & kids)} of them children -- "
          "apply_override_names.py writes those to Postgres only")


QUERY = """
    SELECT co.canonical_name, co.country, COALESCE(co.sector_top,'other'),
           e.source, e.programme_name, e.granting_authority, e.call_id
      FROM public_funding_events e
      JOIN companies co ON co.id = e.company_id
     WHERE e.is_duplicate = 0 AND co.country IS NOT NULL
"""


def why_unplaceable(split, source, prog, body, call) -> str:
    """The FIRST reason `leaf_for` could not place this award.

    Ordered from structural to recoverable, because the answer to "is this
    repairable" is which bucket the mass sits in:

      no_source_map   the source maps to no instrument family at all -- nothing
                      downstream can name a fund for it under any join.
      no_key          the source published neither a programme name (where its
                      family splits by programme) nor a (call_id, authority)
                      pair. The source never said; this is not recoverable
                      without going back to the publisher.
      partial_key     one half of the scheme key is present and the other is
                      not. A join that is nearly there.
      no_child        the key is complete and the family exists, but no child
                      matches -- overwhelmingly because the child would sit
                      below MIN_CHILD_EVENTS and so was never created.
    """
    fams = split.src2fam.get(source, [])
    if not fams:
        return "no_source_map"
    prog = (prog or "").strip()
    body = (body or "")[:200]
    call = (call or "").strip()
    prog_source = source in split.programme_split
    has_prog_key = bool(prog) and prog_source
    has_sch_key = bool(body) and bool(call)
    if has_prog_key or has_sch_key:
        return "no_child"
    if body or call or prog:
        return "partial_key"
    return "no_key"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--section", default="all")
    args = ap.parse_args()

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("DATABASE_URL is required; this reads the corpus of record")

    import sqlite3
    from etl_env import DB
    conn = sqlite3.connect(DB)
    assert_instrument_layer_matches(conn, dsn)

    _sys.path.insert(0, str(_Path(__file__).resolve().parent))
    _sys.path.insert(0, str(ROOT / "ETL" / "events" / "load"))
    from attribution import Split  # noqa: E402

    split = Split(conn)
    rows = conn.execute(QUERY).fetchall()

    total = len(rows)
    placed = 0
    by_code_only = 0
    family_only = 0
    nothing = 0
    reason = collections.Counter()
    by_source = collections.Counter()
    by_source_placed = collections.Counter()
    reason_by_source: dict = collections.defaultdict(collections.Counter)
    unplaceable_has_code = 0

    for name, country, sector, source, prog, body, call in rows:
        by_source[source] += 1
        leaf = split.leaf_for(source, prog, body, call)
        if leaf:
            placed += 1
            by_source_placed[source] += 1
            continue
        r = why_unplaceable(split, source, prog, body, call)
        reason[r] += 1
        reason_by_source[source][r] += 1
        code = (call or "").strip()
        if code and split.code2inst.get(code):
            by_code_only += 1
            unplaceable_has_code += 1
        elif split.families(source):
            family_only += 1
        else:
            nothing += 1

    unplaced = total - placed
    print(f"award pairs (is_duplicate=0, country known)  {total:,}")
    print(f"  placed on an exact leaf                    {placed:,}  "
          f"({placed / total:.1%})")
    print(f"  NOT placed                                 {unplaced:,}  "
          f"({unplaced / total:.1%})")
    print()
    print("what the unplaceable fall back to")
    print(f"  notified scheme (>=1 instrument shares it) {by_code_only:,}")
    print(f"  family only (a regime, usually unproposable){family_only:,}")
    print(f"  nothing at all                             {nothing:,}")
    print()
    print("FIRST reason leaf_for failed")
    for r, n in reason.most_common():
        print(f"  {r:<16} {n:>10,}  ({n / unplaced:.1%} of unplaced)")
    print()
    print("by source (top 20 by unplaced)")
    worst = sorted(by_source, key=lambda s: by_source[s] - by_source_placed[s],
                   reverse=True)[:20]
    print(f"  {'source':<34}{'pairs':>10}{'placed':>10}{'rate':>8}   top reason")
    for s in worst:
        n = by_source[s]
        p = by_source_placed[s]
        top = reason_by_source[s].most_common(1)
        top_s = f"{top[0][0]} ({top[0][1]:,})" if top else "-"
        print(f"  {s[:33]:<34}{n:>10,}{p:>10,}{p / n:>7.0%}   {top_s}")
    conn.close()


if __name__ == "__main__":
    main()
