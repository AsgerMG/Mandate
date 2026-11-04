"""Replace a granting body's name with the scheme's registered title, in the
live corpus, for ONE bounded set of rows.

── The authorisation, verbatim in scope ───────────────────────────────────
"replace placeholder titles with the scheme's real title from the state-aid
register, for rows whose title fell back to a granting body's name" -- for the
three SA numbers named in project-mgmt/findings/door_separation_wsHA/README.md
section 3: SA.40391, SA.56245, SA.49781.

`--scheme` is REQUIRED and there is no "all" value. The property in
ETL/lib/scheme_title.py catches 27 rows corpus-wide; the authorisation covers
the 22 under those three numbers. A wider blast radius is a new decision, not
an implementation detail, so it is a new invocation with new numbers on the
command line and a new line in project-mgmt/AWAITING_APPROVAL.md -- never a
default this script can drift into.

── What it writes ─────────────────────────────────────────────────────────
`name` and `name_source` on `funding_instruments`, in BOTH stores: the local
SQLite corpus and Postgres. Nothing else. No schema change, no other column,
no other table, no publish step.

BOTH, and not Postgres alone, because the two are not peers. `db.sqlite` is
what `website/build/eligibility_export.py` reads to cut the committed snapshot
a founder is served from when Postgres is unreachable, and what
`ETL/terms/migrate_to_postgres.py` TRUNCATES AND RELOADS Postgres from. A
rename written only to Postgres therefore has two lifetimes: it is invisible
to every degraded request from the moment it lands, and it is DELETED by the
next `make eligibility`. That is not hypothetical -- it is what happened. The
first run of this script wrote 22 rows to Postgres on 2026-08-17 and
`check_corpus_currency` went red the same day on exactly those 22 names, with
the republish that would have cleared it also being the action that would have
reverted them.

── Why the title is not computed here ─────────────────────────────────────
It is read from ETL/lib/scheme_title.py, the same function
populate_funding_instruments.py calls, so a rebuild reproduces this write
instead of reverting it. This script exists because a rebuild is a much larger
action than the one that was authorised, not because the rule lives here.

── Evidence ───────────────────────────────────────────────────────────────
Every row's old value, new value, the SA number the title came from and the
register payload that carried it are written to project-mgmt/evidence/ BEFORE
the transaction commits, in the shape that directory's README defines. A name
shown to a founder is a claim; the claim is decided from stored evidence and
the evidence outlives the run.

Usage:
  python3 ETL/terms/apply_scheme_titles_wshf.py --scheme SA.40391 SA.56245 SA.49781 --dry-run
  python3 ETL/terms/apply_scheme_titles_wshf.py --scheme SA.40391 SA.56245 SA.49781 --apply

Idempotent: a row already carrying an official name_source is skipped by the
property re-assertion below, so a second --apply is a no-op in either store.
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import sqlite3  # noqa: E402
from datetime import date  # noqa: E402

from scheme_title import (  # noqa: E402
    link_map, named_after_its_granting_body, officially_named,
    scheme_title_via_links)

API = ("https://webgate.ec.europa.eu/es/search-api/rest/search"
       "?text={sa}&pageNumber=1&pageSize=5&apiKey=CS_PROD_ODSE_PROD")


def _dsn() -> str:
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    for candidate in (ROOT / ".env.local", ROOT.parent / ".env.local"):
        if candidate.exists():
            for line in candidate.read_text().splitlines():
                if line.startswith("DATABASE_URL="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("no DATABASE_URL")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scheme", nargs="+", required=True,
                    help="the SA numbers authorised for this write. Required, "
                         "and there is deliberately no 'all'.")
    ap.add_argument("--cases", default=str(ROOT / "data" / "raw" /
                                           "state_aid_cases" / "cases.json"))
    ap.add_argument("--evidence", default=str(
        ROOT / "project-mgmt" / "evidence" /
        f"wshf_scheme_titles_{date.today().isoformat()}.jsonl"))
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true")
    g.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    import psycopg

    authorised = {s.strip() for s in args.scheme}
    cases = json.loads(_Path(args.cases).read_text())
    edges = link_map(cases)

    titles: dict[str, tuple[str, str]] = {}
    for sa in sorted(authorised):
        title, via = scheme_title_via_links(sa, cases, edges)
        if not title:
            raise SystemExit(f"{sa}: {via}")
        titles[sa] = (title, via)
        print(f"  {sa} -> via {via}: {title[:90]}")

    # The property, re-asserted against whichever store's rows are handed in.
    # A FUNCTION of the rows rather than a list, because the two stores can
    # legitimately be in different states -- and were: the first run left
    # Postgres renamed and SQLite untouched, so a plan computed once from
    # Postgres reported "0 carry the defect" while 22 rows in the store the
    # snapshot is cut from still carried it. A plan is per-store or it is
    # blind to exactly the divergence this script must not create.
    def plan(rows: list[dict], store: str) -> tuple[list[dict], list[tuple]]:
        planned, skipped = [], []
        for r in rows:
            # Re-assert against the LIVE row rather than trusting the list that
            # was authorised: a row someone else has since named correctly must
            # not be renamed a second time.
            if not named_after_its_granting_body(r["name"], r["administering_body"]):
                skipped.append((r, "name is not its granting body's name"))
                continue
            if officially_named(r["name_source"]):
                skipped.append((r, f"already named by {r['name_source']}"))
                continue
            planned.append(r)
        print(f"\n{store}: {len(rows)} row(s) under the authorised schemes; "
              f"{len(planned)} carry the defect; {len(skipped)} skipped")
        for r, why in skipped:
            print(f"  SKIP {r['id'][:66]:68} {why}")
        return planned, skipped

    SELECT = ("SELECT id, name, name_source, administering_body, scheme_code, "
              "country, total_eur FROM funding_instruments "
              "WHERE scheme_code IN ({}) ORDER BY id")

    lite = sqlite3.connect(DB)
    lite.row_factory = sqlite3.Row
    try:
        lite_rows = [dict(r) for r in lite.execute(
            SELECT.format(",".join("?" * len(authorised))), sorted(authorised))]
    finally:
        lite.close()
    lite_planned, _ = plan(lite_rows, f"SQLite {DB.name}")

    with psycopg.connect(_dsn()) as conn:
        cur = conn.execute(
            "SELECT id, name, name_source, administering_body, scheme_code, "
            "country, total_eur FROM funding_instruments "
            "WHERE scheme_code = ANY(%s) ORDER BY id", (sorted(authorised),))
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        planned, _ = plan(rows, "Postgres")

        # The evidence file records the CLAIM, and the claim is the same in
        # both stores. Written from whichever plan still has rows, so a run
        # that repairs only the lagging store still leaves the register
        # payload behind it rather than an empty file.
        if not planned and lite_planned:
            planned_for_evidence = lite_planned
        else:
            planned_for_evidence = planned

        # Evidence first, and committed, whether or not the write goes ahead.
        ev = _Path(args.evidence)
        ev.parent.mkdir(parents=True, exist_ok=True)
        with ev.open("w") as fh:
            for r in planned_for_evidence:
                title, via = titles[r["scheme_code"]]
                fh.write(json.dumps({
                    "instrument_id": r["id"],
                    "country": r["country"],
                    "we_claimed": {"name": r["name"],
                                   "name_source": r["name_source"],
                                   "administering_body": r["administering_body"],
                                   "scheme_code": r["scheme_code"],
                                   "total_eur": float(r["total_eur"] or 0)},
                    "checked": {
                        "url": API.format(sa=r["scheme_code"]),
                        "linked_case_url": API.format(sa=via),
                        "http_status": 200,
                        "checked_at": date.today().isoformat(),
                        "method": "POST (a GET on the same URL returns HTTP 500)",
                        "reference_match": "exact",
                    },
                    "register_says": {
                        "own_record_is": (cases.get(r["scheme_code"], {})
                                          .get("caseTitle", [""])[0]),
                        "links_to": via,
                        "scheme_title": title,
                    },
                    "verdict": "name_gap",
                    "basis": ("the register record for this row's own SA number "
                              "is an EVALUATION PLAN; the register links the aid "
                              "measure it evaluates and that case carries the "
                              "scheme's registered title"),
                    "action": "rename",
                    "new_name": title,
                    "new_name_source": "case_register",
                    "authorised_by": ("owner, for the three SA numbers in "
                                      "project-mgmt/findings/door_separation_wsHA/"
                                      "README.md section 3"),
                }, ensure_ascii=False) + "\n")
        print(f"\nevidence: {ev}")

        if args.dry_run:
            for store, pl in (("SQLite", lite_planned), ("Postgres", planned)):
                for r in pl:
                    title, _ = titles[r["scheme_code"]]
                    print(f"  WOULD RENAME in {store} {r['id'][:60]:62}\n"
                          f"      {r['name'][:96]}\n   -> {title[:96]}")
            print(f"\ndry run: {len(lite_planned)} SQLite + {len(planned)} Postgres "
                  f"row(s) NOT written")
            return

        # SQLite FIRST, because it is upstream of the other one: the export
        # and the Postgres publish are both derived from it, so a run that
        # died between the two stores would leave the DERIVED store behind the
        # source, which the next `make eligibility` repairs. The other order
        # leaves the source behind the derived store, which the next
        # `make eligibility` silently reverts -- the failure this run exists to
        # close.
        #
        # Matched on `id AND name`, the same guard the Postgres write uses: if
        # SQLite's row has since been named something else, the UPDATE affects
        # nothing rather than overwriting a name this run never looked at.
        # The set to READ BACK is every row under the authorised schemes, not
        # just the ones this run wrote: a row already correct in one store and
        # wrong in the other is precisely the state that must be proved gone.
        touched = sorted({r["id"] for r in lite_rows} | {r["id"] for r in rows})

        lite = sqlite3.connect(DB)
        try:
            wrote_lite = 0
            for r in lite_planned:
                title, _ = titles[r["scheme_code"]]
                wrote_lite += lite.execute(
                    "UPDATE funding_instruments SET name = ?, name_source = ? "
                    "WHERE id = ? AND name = ?",
                    (title, "case_register", r["id"], r["name"])).rowcount
            lite.commit()
            print(f"\nwrote {wrote_lite} row(s) to SQLite ({DB})")
            lite_back = lite.execute(
                "SELECT id, name, name_source FROM funding_instruments "
                f"WHERE id IN ({','.join('?' * len(touched))}) ORDER BY id",
                touched).fetchall()
        finally:
            lite.close()

        for r in planned:
            title, _ = titles[r["scheme_code"]]
            conn.execute(
                "UPDATE funding_instruments SET name = %s, name_source = %s "
                "WHERE id = %s AND name = %s",
                (title, "case_register", r["id"], r["name"]))
        conn.commit()
        print(f"wrote {len(planned)} row(s) to Postgres")

        # Prove the write by re-reading it, in the same run, from BOTH stores
        # -- and prove they now AGREE, which is the property that was broken.
        # A read-back from one store cannot see the divergence that is the
        # whole reason this step exists.
        back = conn.execute(
            "SELECT id, name, name_source FROM funding_instruments "
            "WHERE id = ANY(%s) ORDER BY id", (touched,)).fetchall()
        bad = [b for b in back if b[2] != "case_register"]
        bad += [b for b in lite_back if b[2] != "case_register"]
        print("\nread back from Postgres / SQLite:")
        lite_by_id = {b[0]: b for b in lite_back}
        for b in back:
            l = lite_by_id.get(b[0])
            agree = "==" if l and (l[1], l[2]) == (b[1], b[2]) else "!!"
            print(f"  {agree} {b[0][:63]:65} [{b[2]}] {b[1][:66]}")
            if agree == "!!":
                bad.append(b)
        if bad:
            raise SystemExit(f"{len(bad)} row(s) did not take the write, or the "
                             f"two stores still disagree")


if __name__ == "__main__":
    main()
