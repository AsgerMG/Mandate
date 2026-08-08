"""Record, per row, whether the register that publishes it states an application
window for it — from the SOURCE, never from whether a value reached us.

── The rule this replaces ────────────────────────────────────────────────
The degradation policy withholds a row from a founder when the request has
fallen back to the committed snapshot and the row's openness rests on our
holding no application deadline for it. To do that it has to know which
registers publish deadlines at all, or it would delete half the product every
time a copy was used.

It worked that out by COUNTING how many of a population's rows carried one. That
is self-cancelling, and no refinement of the count fixes it:

    a copy stale enough to be dangerous carries no deadlines, so every register
    reads as one that publishes none, and the safeguard does nothing on exactly
    the corpus it exists for.

Measured 2026-08-07 on the snapshot pushed back to its pre-call-register shape:
812 rows offered, 0 withheld, 84 of them closed according to the live register.

So the fact is RECORDED instead of inferred. `source_window_policy` is written
here from data/reference/source_window_policy.json, which holds one answer per
feed plus the field and the page it was read off. A copy carries the column
however far behind it has fallen, which is the property a tally over the rows
in hand can never have.

── What a row with no declaration gets ───────────────────────────────────
NULL, and nothing else. Not a default, not "probably no window". The product
reads NULL as "nobody has asked" and withholds the row from any copy it cannot
check against the register, and check_liveness.ts fails the build when a
publishable row carries none. A new feed is therefore loud and conservative
rather than silently cleared. This script prints what it could not match and
exits non-zero on --write if anything publishable is unmatched.

    python3 ETL/terms/assign_source_window_policy.py --dry-run
    python3 ETL/terms/assign_source_window_policy.py --write
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break

import argparse  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402

from etl_env import DB, ROOT  # noqa: E402
from liveness import CALL_DEADLINE, SOURCE_WINDOW_POLICIES  # noqa: E402

REFERENCE = ROOT / "data/reference/source_window_policy.json"

# The keys a declaration may match on, in the order a row is tested. `id` is the
# narrowest and wins; `source_family_bucket` is the widest and loses. Order here
# is the only precedence there is, so a per-row declaration cannot be shadowed
# by the family it sits in.
MATCH_KEYS = ("id", "id_prefix", "root_id", "source_family_bucket")


def load_declarations() -> list[dict]:
    doc = json.loads(REFERENCE.read_text())
    decls = doc["declarations"]
    for d in decls:
        if d["policy"] not in SOURCE_WINDOW_POLICIES:
            raise SystemExit(
                f"{REFERENCE.name}: '{d['policy']}' is not one of "
                f"{sorted(SOURCE_WINDOW_POLICIES)}. The vocabulary is projected "
                f"from lib/intelligence/liveness.ts into data/liveness.json — a "
                f"fourth value here is a value the product reads as 'nobody "
                f"asked', which withholds the row.")
        if set(d["match"]) - set(MATCH_KEYS):
            raise SystemExit(
                f"{REFERENCE.name}: match on {sorted(set(d['match']) - set(MATCH_KEYS))} "
                f"is not supported; use one of {MATCH_KEYS}.")
    # Narrowest first, so an entry for one row beats the entry for its family
    # regardless of where a human put it in the file.
    return sorted(decls, key=lambda d: min(MATCH_KEYS.index(k) for k in d["match"]))


def _matches(row: dict, key: str, value: str) -> bool:
    if key == "id_prefix":
        # Some registers file each object as its own root: BDNS gives every
        # convocatoria the id `bdns_conv_<number>` and no parent, so 87 of
        # Spain's 175 leaves match no root_id and no bucket that is only theirs.
        # The id is what the loader stamped, so it is a fact about the feed and
        # not about the copy.
        return str(row.get("id") or "").startswith(value)
    return row.get(key) == value


def decide(row: dict, decls: list[dict]) -> dict | None:
    for d in decls:
        if all(_matches(row, k, v) for k, v in d["match"].items()):
            return d
    return None


def _load_env() -> None:
    path = ROOT / ".env.local"
    if path.exists():
        for line in path.read_text().splitlines():
            m = re.match(r"^([A-Z_]+)=(.*)$", line)
            if m:
                os.environ.setdefault(m.group(1), m.group(2).strip("\"'"))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if args.write == args.dry_run:
        raise SystemExit("choose exactly one of --write / --dry-run")

    decls = load_declarations()
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    rows = [dict(r) for r in conn.execute(
        """SELECT id, root_id, source_family_bucket, country, scheme_end_date,
                  scheme_end_date_basis, is_framework,
                  id IN (SELECT parent_id FROM funding_instruments
                          WHERE parent_id IS NOT NULL) AS has_children
             FROM funding_instruments""")]

    assigned: dict[str, str] = {}
    per_decl: dict[str, int] = {}
    unmatched: list[dict] = []
    closes: list[tuple[str, str, dict]] = []
    for r in rows:
        d = decide(r, decls)
        if not d:
            # A leaf is what a founder can be offered. A framework or a parent
            # is never proposed, so an unanswered one is not an exposure.
            if not r["is_framework"] and not r["has_children"]:
                unmatched.append(r)
            continue
        assigned[r["id"]] = d["policy"]
        key = json.dumps(d["match"], sort_keys=True)
        per_decl[key] = per_decl.get(key, 0) + 1
        # A declaration may also carry the register's own closing date for the
        # object. That is not a second liveness rule -- it is the date, written
        # where every reader of `scheme_end_date` already looks -- and it is
        # here because this file is the only durable home for it: the column is
        # rebuilt from the extractors on every load and a hand UPDATE does not
        # survive that, while a committed declaration is re-applied every run.
        if d.get("closed_on") and r["scheme_end_date"] != d["closed_on"]:
            closes.append((r["id"], d["closed_on"], d))

    print(f"{len(rows)} instruments, {len(assigned)} declared, "
          f"{len(unmatched)} publishable rows with no declaration\n")
    for d in decls:
        key = json.dumps(d["match"], sort_keys=True)
        print(f"  {d['policy']:<20} {per_decl.get(key, 0):>5}  {key}")
    if closes:
        print("\n  closing dates carried by a declaration:")
        for iid, when, d in closes:
            print(f"    {iid:<28} {when}  ({d.get('closed_note', '')[:60]})")
    if unmatched:
        print(f"\n  {len(unmatched)} publishable rows are unmatched. They stay "
              f"NULL, which withholds them from every fallback copy:")
        seen: dict[str, int] = {}
        for r in unmatched:
            k = f"{r['source_family_bucket']}|{r['country']}"
            seen[k] = seen.get(k, 0) + 1
        for k, n in sorted(seen.items(), key=lambda kv: -kv[1])[:20]:
            print(f"    {k:<40} {n}")

    if args.dry_run:
        print("\ndry run: nothing written")
        return

    conn.executemany(
        "UPDATE funding_instruments SET source_window_policy = ? WHERE id = ?",
        [(p, i) for i, p in assigned.items()])
    for iid, when, _d in closes:
        conn.execute(
            "UPDATE funding_instruments SET scheme_end_date = ?, "
            "scheme_end_date_basis = ? WHERE id = ?", (when, CALL_DEADLINE, iid))
    conn.commit()
    print(f"\nsqlite: {conn.total_changes} row(s) updated")

    _load_env()
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit(
            "DATABASE_URL is not set. SQLite alone is not the corpus -- the "
            "product reads Postgres, and a column written to one store only is "
            "the drift this whole workstream is about.")
    import psycopg2  # noqa: PLC0415 — optional dep, only the write path needs it
    pg = psycopg2.connect(url)
    with pg, pg.cursor() as cur:
        cur.execute("ALTER TABLE funding_instruments "
                    "ADD COLUMN IF NOT EXISTS source_window_policy TEXT")
        for policy in sorted(set(assigned.values())):
            ids = [i for i, p in assigned.items() if p == policy]
            cur.execute("UPDATE funding_instruments SET source_window_policy = %s "
                        "WHERE id = ANY(%s)", (policy, ids))
        for iid, when, _d in closes:
            cur.execute("UPDATE funding_instruments SET scheme_end_date = %s, "
                        "scheme_end_date_basis = %s WHERE id = %s",
                        (when, CALL_DEADLINE, iid))
        # Reconciled OUT of Postgres, so the run reports what the PRODUCT will
        # see rather than what this script believes it did.
        cur.execute("SELECT COALESCE(source_window_policy,'(null)'), count(*) "
                    "FROM funding_instruments GROUP BY 1 ORDER BY 2 DESC")
        print("\npostgres, read back:")
        for policy, n in cur.fetchall():
            print(f"  {policy:<22} {n}")
    pg.close()

    if unmatched:
        raise SystemExit(
            f"\n{len(unmatched)} publishable rows carry no declaration. That is "
            f"not a failure of this run -- they are correctly NULL and correctly "
            f"withheld -- but it is a gap in data/reference/source_window_policy."
            f"json, and check_liveness.ts fails the build until it is closed.")


if __name__ == "__main__":
    main()
