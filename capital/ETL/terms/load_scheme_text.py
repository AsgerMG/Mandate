"""Load fetched scheme text into the corpus as it lands, not at the end.

── Why "as it lands" ───────────────────────────────────────────────────────
The fetch runs as agents against live sites, and every one of them has been
killed mid-task by an account-level spend limit that can recur at any time.
The `found_<CC>.json` files survive that (they're already on disk), but
survival on disk doesn't help the product -- nothing reads them until they're
in the DB. Waiting to batch-load until every country finishes means a cutoff
before that point loses the VALUE of everything fetched so far, even though
the files themselves are safe.

So this script is deliberately idempotent and re-run after every agent
completion: it reads whatever `found_<CC>.json` files currently exist,
UPDATEs `funding_instruments` for rows that don't have text yet, and reports
what changed. Running it twice on the same data is a no-op.

── What it does NOT do ─────────────────────────────────────────────────────
It does not write `eligibility_gates`. Turning fetched prose into a formal
GATE means assigning `gate_role`, `verification_level`, `intake_field` --
and the standing rule is a seeded gate MUST declare gate_role, NULL is not
neutral. That is a real design decision, not a load step, and rushing it
under time pressure is exactly how the region-gate defects happened. This
script writes the descriptive text only (`description`, `eligibility_text`,
`eligibility_source_url`), which:
  - feeds `build_instrument_profiles.py` directly (same integration point as
    yesterday's SATR aid_measure_title/objectives_text), so re-embedding
    already benefits from it, and
  - is exactly what a hand-read pass needs to look at before gates are cut
    from it.

── Light verification, not none ────────────────────────────────────────────
The plan's gate was a full 20-per-country hand read before any load. Under
the current risk of being cut off mid-fetch, loading the descriptive text now
and hand-reading before it becomes a GATE is the accepted tradeoff -- but
this script still refuses obvious garbage: empty text, text under 40 chars,
records explicitly marked not found, and schemes that are closed (per the
"only active funds" rule).

── Liveness is the CORPUS's judgement, not the fetch record's ──────────────
It used to be the fetch record's: any record whose free-text `status` field
said "closed" was refused. That field is the fetching agent's summary of a
CALL, and a call is not a scheme. Measured on Italy, 40 of the 58 uncovered
instruments were held back this way, and 18 of those 40 are rows the product
PUBLISHES TODAY -- their registered `scheme_end_date` is in the future, and
the agent wrote "closed" because one sportello or bando window had passed.

Withholding text from a row the product shows anyway does not make the
product more honest, it makes it emptier: the founder still sees the fund and
now cannot tell it from its siblings. So the gate is now the same liveness
test `publishableInstruments()` applies -- `scheme_end_date` against today,
with the successor redirect -- read off the corpus row rather than the fetch
record. A scheme the register says has expired is still refused, exactly as
before; a scheme the register says is in force is now described.

`status` is not discarded: it is reported, so a run says how many rows were
loaded over an agent's "closed" and on what grounds.

Usage:
  python3 load_scheme_text.py                       # report what would load
  python3 load_scheme_text.py --write
  python3 load_scheme_text.py --country IT --write --postgres
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT as REPO_ROOT  # noqa: E402

import argparse  # noqa: E402
import collections  # noqa: E402
import datetime  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import sqlite3  # noqa: E402

SRC_DIR = REPO_ROOT / "data" / "raw" / "scheme_enrichment"
MIN_TEXT_LEN = 40


def has_text(rec: dict) -> bool:
    """Does the record carry usable prose at all? Liveness is asked separately."""
    if rec.get("found") is False:
        return False
    text = rec.get("eligibility_text") or rec.get("description") or ""
    return len(text.strip()) >= MIN_TEXT_LEN


def live_ids(conn: sqlite3.Connection) -> set[str]:
    """Instrument ids the product would publish, by its own liveness test.

    Mirrors `publishableInstruments()` in website/frontend/lib/intelligence/
    corpus.ts on the clauses that decide liveness: a scheme whose registered
    end date has passed is closed, UNLESS the register names a successor we do
    not already hold as a live scheme code -- in which case that row is
    republished under the successor's identity and is live.

    Frameworks and parents are excluded there too, for a different reason
    (they are containers, not offers). They are excluded here as well, so this
    set means exactly "rows a founder can be shown".
    """
    today = datetime.date.today().isoformat()
    rows = conn.execute("""
        SELECT id, parent_id, is_framework, scheme_code, scheme_end_date, successor_scheme
          FROM funding_instruments""").fetchall()
    parents = {r[1] for r in rows if r[1]}
    closed = {r[0]: bool(r[4] and r[4] < today) for r in rows}
    live_codes = {r[3] for r in rows
                  if not r[2] and r[0] not in parents and not closed[r[0]] and r[3]}
    out = set()
    for iid, _parent, is_framework, _code, _end, successor in rows:
        if is_framework or iid in parents:
            continue
        if closed[iid] and not (successor and successor not in live_codes):
            continue
        out.add(iid)
    return out


def mirror_to_postgres(updates: list[tuple]) -> None:
    """Push exactly the rows just written to Railway Postgres.

    `migrate_to_postgres.py` is the normal publish and is a full truncate +
    reinsert of the whole eligibility subsystem. That is right for a release
    and wrong for a country-scoped enrichment run: it would publish every
    other in-flight SQLite edit alongside this one, and several agents are
    enriching different countries against this repo concurrently. A scoped
    UPDATE touches only the ids this run produced, so it cannot carry a
    neighbour's half-finished work into the live read path.
    """
    import psycopg2  # lazy: SQLite-only runs need no driver

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("no DATABASE_URL in the environment; skipped the Postgres mirror")
        return
    conn = psycopg2.connect(dsn)
    with conn, conn.cursor() as cur:
        cur.executemany("""
            UPDATE funding_instruments
               SET description = COALESCE(description, %s),
                   eligibility_text = %s,
                   eligibility_source_url = %s,
                   eligibility_confidence = %s,
                   eligibility_fetched_at = CURRENT_TIMESTAMP
             WHERE id = %s
        """, updates)
    conn.close()
    print(f"mirrored {len(updates)} rows to Postgres")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    # Several fetching agents now run CONCURRENTLY against the same repo, each
    # owning a disjoint set of countries. Without a filter, whoever runs
    # `--write` first also loads every other agent's half-finished
    # found_<CC>.json -- writing rows they do not own, at a moment they did not
    # choose. The load stays idempotent either way, but "idempotent" is not the
    # same as "mine to write". Restrict to the countries you own.
    ap.add_argument("--country", action="append", metavar="CC",
                    help="only load found_<CC>.json for these countries "
                         "(repeatable). Default: every file present.")
    ap.add_argument("--postgres", action="store_true",
                    help="mirror the rows just written to DATABASE_URL. Scoped to "
                         "those ids; NOT the full migrate_to_postgres publish.")
    args = ap.parse_args()

    conn = sqlite3.connect(DB)
    have_desc = {r[0] for r in conn.execute(
        "SELECT id FROM funding_instruments WHERE COALESCE(eligibility_text,'') <> ''")}
    publishable = live_ids(conn)

    per_country = collections.Counter()
    over_status = collections.Counter()
    updates: list[tuple] = []
    skipped_no_id = skipped_bad = skipped_dup = skipped_closed = 0

    only = {c.strip().upper() for c in (args.country or [])} or None

    for f in sorted(SRC_DIR.glob("found_*.json")):
        cc = f.stem.split("_")[1]
        if only and cc.upper() not in only:
            continue
        try:
            recs = json.loads(f.read_text())
        except Exception:
            continue
        for rec in recs:
            iid = rec.get("instrument_id")
            if not iid:
                skipped_no_id += 1
                continue
            if not has_text(rec):
                skipped_bad += 1
                continue
            if iid in have_desc:
                skipped_dup += 1
                continue
            if iid not in publishable:
                skipped_closed += 1
                continue
            desc = (rec.get("description") or "").strip()
            elig = (rec.get("eligibility_text") or "").strip()
            url = (rec.get("scheme_url") or rec.get("source_url") or "").strip() or None
            conf = (rec.get("confidence") or "").strip() or None
            updates.append((desc or None, elig or None, url, conf, iid))
            per_country[cc] += 1
            if (rec.get("status") or "").lower() == "closed":
                over_status[cc] += 1

    print(f"loadable: {len(updates)} instruments across {len(per_country)} countries")
    for cc, n in per_country.most_common():
        note = (f"   ({over_status[cc]} of them the fetch record called closed, "
                f"while the register's end date is still in the future)"
                if over_status[cc] else "")
        print(f"   {cc}  {n}{note}")
    print(f"skipped: {skipped_bad} not-usable (abstained/too short), "
          f"{skipped_closed} closed or not publishable per the register, "
          f"{skipped_dup} already loaded, {skipped_no_id} missing instrument_id")

    if not args.write:
        print("\n[report only] --write to apply")
        return

    conn.executemany("""
        UPDATE funding_instruments
           SET description = COALESCE(description, ?),
               eligibility_text = ?,
               eligibility_source_url = ?,
               eligibility_confidence = ?,
               eligibility_fetched_at = CURRENT_TIMESTAMP
         WHERE id = ?
    """, updates)
    conn.commit()
    print(f"\nloaded {len(updates)} rows")
    if args.postgres and updates:
        mirror_to_postgres(updates)


if __name__ == "__main__":
    main()
