"""Which territory each delivery body is REGISTERED to serve.

── The question, and why the corpus could not answer it ───────────────────
A founder is shown one row for a regime and has to be told which of its delivery
bodies is theirs. Across the 53 multi-leaf regimes (797 leaves) the corpus carried
two geography facts and neither answers it:

  administering_body   present on 80% of leaves, uniquely identifies 15%
  delivery_region      present on 29%, uniquely identifies 6%

`delivery_region` is MEASURED. `nuts_regions.staged_region_mix` counts where a leaf's
own awards landed and takes the most specific NUTS prefix covering a supermajority.
That is evidence about the past. What a founder is asking is a RULE -- may I apply
from here -- and the two come apart in both directions: a national body that has
happened to fund one region measures as regional and is not, and a regional body in
its first year cannot be measured at all and still is. So this writes a separate,
DECLARED column, and never into `delivery_region`.

── The source ─────────────────────────────────────────────────────────────
The Commission's own case register, already in the repo at
data/raw/state_aid_cases/cases.json (fetch_state_aid_cases.py), field `caseRegions`
-- the regions a notified scheme is registered for. Filed, official, per scheme.

It reaches individual leaves rather than their shared parent because the SA number is
very nearly a leaf key: 453 of the 797 leaves carry a `scheme_code`, across 377
distinct SA numbers. So this discriminates SIBLINGS, which is the whole point.

── Two things this deliberately does that look wrong and are not ──────────
(1) Country-level catchments are KEPT. In `delivery_region` a country means "no
    regional claim" and is stored as NULL, correctly. Here it is the answer: 290
    leaves are registered country-wide, and today a founder cannot tell that from
    "nobody has looked yet". A declared national scope is information.

(2) Everything is translated to NUTS 2024 on the way in. The register writes the
    vintage current when the scheme was notified, so Regione Lombardia declares IT2
    while its awards measure ITC4 -- one place, two vintages -- and comparing the
    strings invents 25 contradictions that are not real. Translation is id -> name
    -> current id through nuts_names.json, which carries vintages 2024/2021/2016/
    2013. Codes older than that (NUTS 2006/2010: IT2, IT8) are NOT in the reference
    and are skipped rather than guessed at, and the count of skips is reported.

── What is NOT here, and why ──────────────────────────────────────────────
Reading the body's own NAME for a place ("Bayerisches Staatsministerium" -> Bayern)
was built, scored against the measured footprint, and abandoned at a 12% contradiction
rate. See project-mgmt/workstream_l_region.md and probe_bodyname_catchment.py. A place
name inside an organisation's name is as often its country, its head office or its
branch as it is its catchment, so no threshold rescues it.

This is a PROGRAMME FACT and never a filter. `encode_registered_regions.py` already
turns the same register field into an eligibility gate where the scheme is legally
confined; this writes the display fact, from the identical source, so the two cannot
tell a founder different things.

Usage:
  python3 ETL/terms/encode_declared_catchment.py status
  python3 ETL/terms/encode_declared_catchment.py run [--dry-run]
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
import collections  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402

from europe_scope import canonicalise_country  # noqa: E402
from nuts_regions import ISO2_TO_NUTS, NUTS_TO_ISO2, load_reference  # noqa: E402

CASES = ROOT / "data" / "raw" / "state_aid_cases" / "cases.json"
SOURCE_TAG = "ec_case_register"

# The register writes a region in two syntaxes and both must be read; parsing only
# the dotted one was a real defect in encode_registered_regions.py, where
# `NutsRegionPT117` silently became "all of Portugal". Kept identical here on
# purpose -- one register field must not be parsed two ways in one repo.
DOTTED = re.compile(r"^RegionNuts(\d{4})\.([A-Z]{2}[A-Z0-9]*)$")
BARE = re.compile(r"^NutsRegion([A-Z]{2}[A-Z0-9]*)$")


def parse_regions(rec: dict) -> list[str]:
    """Every NUTS id a case registers, in whatever vintage it was filed."""
    out: list[str] = []
    for raw in rec.get("caseRegions") or []:
        m = DOTTED.match(raw)
        if m:
            out.append(m.group(2))
            continue
        m = BARE.match(raw)
        if m:
            out.append(m.group(1))
    return sorted(set(out))


class VintageMap:
    """Any NUTS id, in any vintage the reference knows, to its NUTS 2024 id.

    Via the region's NAME, because that is the only thing stable across vintages:
    Eurostat renumbers ids between editions but keeps calling the place Lombardia.
    A code the reference has never seen returns None and its caller drops it --
    inventing a modern code for a 2006 one is exactly the kind of quiet error this
    column exists to avoid.
    """

    def __init__(self) -> None:
        ref = load_reference()
        self.ids: dict[str, list] = ref["ids"]
        self.index: dict[str, list] = ref["index"]
        self.unknown: collections.Counter = collections.Counter()

    def to_current(self, nuts_id: str) -> str | None:
        entry = self.ids.get(nuts_id)
        if not entry:
            self.unknown[nuts_id] += 1
            return None
        name, vintage = entry[0], entry[1]
        if vintage == load_reference()["current_vintage"]:
            return nuts_id
        # id -> name -> whatever the current vintage calls that name
        iso_prefix = nuts_id[:2]
        from nuts_regions import norm
        hit = self.index.get(f"{iso_prefix}|{norm(name)}")
        if hit:
            return hit[0]
        self.unknown[nuts_id] += 1
        return None


def common_prefix(ids: list[str]) -> str | None:
    """The most specific NUTS id that covers every id given.

    NUTS is hierarchical and ids are prefixes, so "the region containing all of
    these" is the longest shared prefix -- truncated to a whole level, never to a
    half-code. Returns the country when the set spans one, which here is a real
    answer rather than an absence.
    """
    if not ids:
        return None
    if len(ids) == 1:
        return ids[0]
    pre = os.path.commonprefix(ids)
    # A NUTS id is 2 chars (country) + one char per level; anything shorter than the
    # country code covers more than one country and is not a catchment we can name.
    return pre if len(pre) >= 2 else None


def in_scope(iso2: str | None) -> bool:
    """Only the in-corpus countries, resolved the one canonical way."""
    if not iso2:
        return False
    return canonicalise_country(iso2) is not None


def build(conn: sqlite3.Connection) -> tuple[list[tuple], dict]:
    if not CASES.exists():
        raise SystemExit(f"missing {CASES} -- fetch it with\n"
                         f"  python3 ETL/terms/fetch_state_aid_cases.py")
    cases = json.loads(CASES.read_text())
    vm = VintageMap()

    rows = conn.execute("""
        SELECT id, country, scheme_code FROM funding_instruments
         WHERE scheme_code IS NOT NULL AND TRIM(scheme_code) <> ''""").fetchall()

    updates: list[tuple] = []
    stats = collections.Counter()
    for iid, country, sc in rows:
        sc = (sc or "").strip()
        rec = cases.get(sc)
        if not rec:
            stats["no_case"] += 1
            continue
        iso2 = NUTS_TO_ISO2.get((country or "")[:2], (country or "")[:2])
        if not in_scope(iso2):
            stats["out_of_scope"] += 1
            continue
        declared = parse_regions(rec)
        if not declared:
            stats["case_names_no_region"] += 1
            continue
        current = [c for c in (vm.to_current(d) for d in declared) if c]
        if not current:
            stats["untranslatable_vintage"] += 1
            continue
        current = sorted(set(current))
        roll = common_prefix(current)
        if not roll:
            stats["spans_countries"] += 1
            continue
        stats["subnational" if len(roll) > 2 else "country_wide"] += 1
        updates.append((roll, json.dumps(current), SOURCE_TAG, iid))
    return updates, {"stats": stats, "unknown": vm.unknown}


def write_sqlite(conn: sqlite3.Connection, updates: list[tuple]) -> int:
    """Written in batches as they are produced, not in one transaction at the end.
    Long runs on this project have been killed mid-flight, and a write that only
    lands if the last row succeeds is a write that did not happen."""
    n = 0
    for i in range(0, len(updates), 200):
        chunk = updates[i:i + 200]
        conn.executemany("""
            UPDATE funding_instruments
               SET catchment_region = ?, catchment_regions = ?, catchment_source = ?
             WHERE id = ?""", chunk)
        conn.commit()
        n += len(chunk)
    return n


def write_postgres(updates: list[tuple]) -> int:
    """The product reads Postgres; SQLite alone would leave this invisible to it.
    Same failure that hid load_scheme_text.py's eligibility text for weeks."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        for line in (ROOT / ".env.local").read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                url = line.split("=", 1)[1].strip().strip('"\'')
    if not url:
        print("  no DATABASE_URL -- Postgres not updated")
        return 0
    import psycopg
    n = 0
    with psycopg.connect(url) as pg:
        for ddl in ("catchment_region TEXT", "catchment_regions TEXT",
                    "catchment_source TEXT"):
            pg.execute(f"ALTER TABLE funding_instruments "
                       f"ADD COLUMN IF NOT EXISTS {ddl}")
        pg.commit()
        for i in range(0, len(updates), 200):
            chunk = updates[i:i + 200]
            pg.cursor().executemany("""
                UPDATE funding_instruments
                   SET catchment_region = %s, catchment_regions = %s,
                       catchment_source = %s
                 WHERE id = %s""", chunk)
            pg.commit()
            n += len(chunk)
    return n


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("command", choices=["status", "run"])
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    conn = sqlite3.connect(DB)
    updates, diag = build(conn)
    st, unknown = diag["stats"], diag["unknown"]

    print(f"leaves with a scheme_code:            {sum(st.values()) + 0:,}")
    for k in ("subnational", "country_wide", "case_names_no_region",
              "untranslatable_vintage", "spans_countries", "no_case",
              "out_of_scope"):
        if st[k]:
            print(f"  {k:24s} {st[k]:>6,}")
    if unknown:
        print(f"  NUTS ids older than the reference, skipped not guessed: "
              f"{len(unknown)} distinct, {sum(unknown.values())} occurrences")
        print("   ", ", ".join(f"{k}x{v}" for k, v in unknown.most_common(12)))

    if args.command == "status" or args.dry_run:
        print(f"\nwould write {len(updates):,} rows")
        return

    n = write_sqlite(conn, updates)
    print(f"\nsqlite:   {n:,} rows")
    print(f"postgres: {write_postgres(updates):,} rows")


if __name__ == "__main__":
    main()
