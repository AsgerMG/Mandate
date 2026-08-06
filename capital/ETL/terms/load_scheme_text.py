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

── Both stores, or a loud failure ──────────────────────────────────────────
This script writes SQLite. Every consumer -- the product, the scoreboard,
`measure_sibling_coverage.ts` -- reads Postgres. For one night that gap was
bridged by an opt-in `--postgres` flag, which is to say it was not bridged:
France's 49 ADEME leaves were loaded, reported as loaded, and were still
invisible to the product a day later, while the same run for Italy and the EU
happened to pass the flag and landed.

Two changes, because the flag alone was never the whole hole:
  - Publishing is the DEFAULT. Staging without it needs `--sqlite-only`, which
    says at the end, in as many words, that nothing a founder can see changed.
    A missing DATABASE_URL is now a hard exit, not a printed shrug.
  - Every `--write` run ends by RECONCILING the countries in scope: any row
    with `eligibility_text` in SQLite and not in Postgres fails the run with
    the exact command that fixes it. This catches what a defaulted flag cannot
    -- rows an EARLIER sqlite-only run left behind, which are "already loaded"
    and so are never in any later run's mirror set. See reconcile().

Usage:
  python3 load_scheme_text.py                       # report what would load
  python3 load_scheme_text.py --country IT --write  # loads AND publishes
  python3 load_scheme_text.py --country IT --write --sqlite-only
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
    """Does the record carry usable ELIGIBILITY prose? Liveness is asked separately.

    This used to accept `description` as a stand-in when `eligibility_text` was
    empty -- but only `eligibility_text` is ever written to the coverage column,
    so such a record passed the gate, was counted in "loaded N rows", and left
    the column NULL. 86 records corpus-wide do this (FR 24, ES 17, IT 13, DE 12,
    BE 13); every one of them was a load that reported work it had not done.

    They are not discarded: `description` is still written, and they are now
    counted and reported as description-only so a run's own output says how much
    of it bought coverage and how much did not. Promoting a description into
    `eligibility_text` would be worse than leaving it empty -- these are
    one-line statements of what a scheme IS ("Complément de rémunération pour
    l'éolien terrestre"), not statements of who may apply, and filling the
    coverage column with them would report coverage that a founder cannot use.
    """
    if rec.get("found") is False:
        return False
    return len((rec.get("eligibility_text") or "").strip()) >= MIN_TEXT_LEN


def has_description_only(rec: dict) -> bool:
    """Prose, but in `description` -- contributes no eligibility coverage."""
    if rec.get("found") is False or has_text(rec):
        return False
    return len((rec.get("description") or "").strip()) >= MIN_TEXT_LEN


def lifetime_facts(rec: dict) -> tuple[str | None, str | None]:
    """(administering_body, scheme_end_date) this record states about its scheme.

    Deliberately NOT gated on liveness, and that inversion is the whole point.
    The active-only rule says a closed scheme's RULES must not be shown to
    someone applying now. It does not say we must stay ignorant that the scheme
    closed -- `scheme_end_date` is the very column `live_ids()` below, plus
    `emit_peer_prior.py` and `extend_recall_set.py`, filter on to REMOVE a dead
    scheme from what a brief may propose. Refusing to record it because the
    record is closed is what KEEPS the dead scheme in front of the founder.

    Spain is where this bit. `scheme_end_date` is otherwise derived from SATR's
    caseMeasureEndDate keyed on `scheme_code`, and every `bdns_es_ayudas` leaf
    has `scheme_code = ''`. So all 88 were NULL, all 88 read as live, and 82 of
    them are convocatorias whose application window shut -- some in 2021. The
    liveness gate below cannot catch them until this pass has run, which is why
    this runs FIRST and in the same invocation rather than as its own script.

    Both values are written through COALESCE, so anything already measured in
    the column outranks a register's statement about itself.
    """
    if rec.get("found") is False:
        return None, None
    body = (rec.get("administering_body") or "").strip() or None
    end = (rec.get("scheme_end_date") or "").strip()[:10] or None
    return body, end


def live_ids(conn: sqlite3.Connection,
             pending_end: dict[str, str] | None = None) -> set[str]:
    """Instrument ids the product would publish, by its own liveness test.

    `pending_end` overlays end dates gathered but not yet committed, so a
    report-only run judges liveness against the same facts a `--write` run
    would, instead of against the NULLs those facts are about to replace.

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
    pending_end = pending_end or {}
    closed = {r[0]: bool((r[4] or pending_end.get(r[0])) and
                         (r[4] or pending_end.get(r[0])) < today) for r in rows}
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


def mirror_to_postgres(updates: list[tuple], life: list[tuple]) -> None:
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
        # NOT a warning. A load that reaches only SQLite has not reached the
        # product, and saying so in passing is what let France sit unread for a
        # night (see reconcile() below).
        raise SystemExit(
            "DATABASE_URL is not set, so this load would reach SQLite only -- "
            "which no consumer reads.\n"
            "Put it in the repo-root .env.local, or pass --sqlite-only if you "
            "genuinely mean to stage without publishing.")
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
        # The lifetime facts travel with the prose, or the live read path keeps
        # proposing the closed rows this run just identified as closed.
        if life:
            cur.executemany("""
                UPDATE funding_instruments
                   SET administering_body = COALESCE(administering_body, %s),
                       scheme_end_date = COALESCE(scheme_end_date, %s)
                 WHERE id = %s
            """, life)
    conn.close()
    print(f"mirrored {len(updates)} text rows and {len(life)} lifetime rows to Postgres")


def reconcile(conn: sqlite3.Connection, countries: set[str] | None) -> int:
    """Assert the two stores agree about the countries this run touched.

    ── Why a flag was never going to be enough ─────────────────────────────
    `--postgres` mirrors the rows THIS RUN wrote. That leaves three ways for
    text to exist in SQLite and not in the store the product reads, none of
    which a defaulted flag closes:

      1. An earlier run wrote SQLite only. The rows are now "already loaded",
         so the next run -- flag or no flag -- skips them and mirrors nothing.
         This is exactly what happened to France: 49 ADEME leaves sat in
         SQLite while Postgres read 0, and every subsequent run reported
         success while changing nothing.
      2. A column was filled in by a different script (administering_body,
         delivery_region) and never travelled.
      3. The mirror half-failed and the run carried on.

    So the end-of-run check is not "did I remember to publish", it is "do the
    two stores now agree". That question has the same answer however the
    divergence arose, and it is asked against the live database rather than
    against this process's memory of what it did.

    Returns the number of diverged rows; 0 means in sync.

    This is deliberately NOT a CI check. It reads `data/db.sqlite` and a
    DATABASE_URL secret, and no CI step may depend on gitignored data.
    """
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        return 0
    import psycopg2

    where, params = "", []
    if countries:
        where = " WHERE country IN (%s)" % ",".join("?" * len(countries))
        params = sorted(countries)
    local = {r[0] for r in conn.execute(
        "SELECT id FROM funding_instruments"
        f"{where}{' AND' if where else ' WHERE'} "
        "COALESCE(TRIM(eligibility_text),'') <> ''", params)}
    if not local:
        return 0

    pg = psycopg2.connect(dsn)
    with pg, pg.cursor() as cur:
        cur.execute(
            "SELECT id FROM funding_instruments "
            "WHERE COALESCE(TRIM(eligibility_text),'') <> '' AND id = ANY(%s)",
            (list(local),))
        remote = {r[0] for r in cur.fetchall()}
    pg.close()

    missing = local - remote
    scope = "/".join(sorted(countries)) if countries else "all countries"
    if missing:
        print(f"\n!! OUT OF SYNC: {len(missing)} of {len(local)} rows in {scope} "
              f"carry eligibility_text in SQLite but NOT in Postgres.")
        print("   The product reads Postgres. Those rows are invisible to it.")
        print("   Fix (scoped, idempotent, never deletes):")
        print(f"     python3 ETL/terms/publish_scheme_text_scoped.py "
              f"{' '.join('--country ' + c for c in sorted(countries)) if countries else '--country XX'}")
        for i in sorted(missing)[:5]:
            print(f"     e.g. {i}")
        return len(missing)
    print(f"in sync: {len(local)} rows with eligibility_text in {scope} "
          f"are present in both stores")
    return 0


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
    # Publishing is the DEFAULT, and staging is the flag you have to ask for.
    # It used to be the other way round. `--postgres` was opt-in, so the
    # cheapest command to type wrote the one store nothing reads, and a run
    # that had done nothing useful still exited 0 saying "loaded 49 rows".
    ap.add_argument("--postgres", action="store_true",
                    help="accepted for compatibility; publishing is now the default")
    ap.add_argument("--sqlite-only", action="store_true",
                    help="stage in SQLite WITHOUT publishing to Postgres. The "
                         "product will not see these rows until someone runs "
                         "publish_scheme_text_scoped.py. Prints a loud warning.")
    args = ap.parse_args()

    conn = sqlite3.connect(DB)
    have_desc = {r[0] for r in conn.execute(
        "SELECT id FROM funding_instruments WHERE COALESCE(eligibility_text,'') <> ''")}

    only = {c.strip().upper() for c in (args.country or [])} or None

    def source_files():
        for f in sorted(SRC_DIR.glob("found_*.json")):
            cc = f.stem.split("_")[1]
            if only and cc.upper() not in only:
                continue
            try:
                yield cc, json.loads(f.read_text())
            except Exception:
                continue

    # ── Pass 1: lifetime facts, before the liveness gate reads them ──────────
    # See lifetime_facts(). This must precede pass 2: the gate below asks the
    # corpus whether a row is still live, and for a register whose end dates we
    # have never written that question answers "yes" for every dead call.
    have_body = {r[0] for r in conn.execute(
        "SELECT id FROM funding_instruments WHERE administering_body IS NOT NULL")}
    have_end = {r[0] for r in conn.execute(
        "SELECT id FROM funding_instruments WHERE scheme_end_date IS NOT NULL")}
    life: list[tuple] = []
    pending_end: dict[str, str] = {}
    new_body = new_end = 0
    for cc, recs in source_files():
        for rec in recs:
            iid = rec.get("instrument_id")
            if not iid:
                continue
            body, end = lifetime_facts(rec)
            if not body and not end:
                continue
            if end and iid not in have_end:
                pending_end[iid] = end
                new_end += 1
            if body and iid not in have_body:
                new_body += 1
            life.append((body, end, iid))
    print(f"lifetime facts: {new_end} scheme_end_date and {new_body} "
          f"administering_body values for rows that had none")
    if args.write and life:
        conn.executemany("""
            UPDATE funding_instruments
               SET administering_body = COALESCE(administering_body, ?),
                   scheme_end_date = COALESCE(scheme_end_date, ?)
             WHERE id = ?
        """, life)
        conn.commit()

    # ── Pass 2: the prose, gated on the liveness pass 1 just made answerable ─
    publishable = live_ids(conn, pending_end)

    per_country = collections.Counter()
    over_status = collections.Counter()
    desc_only = collections.Counter()
    updates: list[tuple] = []
    skipped_no_id = skipped_bad = skipped_dup = skipped_closed = 0

    for cc, recs in source_files():
        for rec in recs:
            iid = rec.get("instrument_id")
            if not iid:
                skipped_no_id += 1
                continue
            if not has_text(rec):
                if has_description_only(rec):
                    desc_only[cc] += 1
                else:
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
    if desc_only:
        print(f"description-only: {sum(desc_only.values())} records carry prose in "
              f"`description` but no eligibility_text "
              f"({', '.join(f'{c} {n}' for c, n in desc_only.most_common())}).")
        print("   These add NO eligibility coverage. They used to be counted as "
              "loaded. See has_text().")

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

    if args.sqlite_only:
        print("\n!! --sqlite-only: these rows are STAGED, NOT PUBLISHED.")
        print("   Nothing the product serves reads SQLite. Until you run")
        print("     python3 ETL/terms/publish_scheme_text_scoped.py "
              f"{' '.join('--country ' + c for c in sorted(only)) if only else '--country XX'}")
        print("   this load has changed nothing a founder can see.")
        return

    if updates or life:
        mirror_to_postgres(updates, life)

    # Whether or not this run wrote anything. A no-op load over a country an
    # earlier SQLite-only run half-finished is precisely the case that has to
    # fail loudly, and it is the case where `updates` is empty.
    if reconcile(conn, only):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
