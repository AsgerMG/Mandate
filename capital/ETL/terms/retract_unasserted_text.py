"""Clear eligibility text the fetch records no longer assert.

── The gap this closes ────────────────────────────────────────────────────
`load_scheme_text.py` is monotonic. It skips every id that already has text
(`have_desc`), which is what makes it safe to re-run after every agent — and
also means it can only ever ADD. If a fetcher is re-run and withdraws a claim
it previously made, the loader will never revisit that row, and the withdrawn
text stays in the corpus forever with no record on disk backing it.

That is not hypothetical. Spain: `fetch_bdns_convocatorias.py` gained a rule
that a call the register says is SHUT, with no closing date given, must have
its text withheld — because the loader's liveness gate judges on
`scheme_end_date`, so with no date to write there is no way to tell the corpus
the call is over, and its expired terms would read as current guidance. The
fetcher was re-run and correctly emitted 18 such records with no text. The 18
rows in the DB, loaded from the previous vintage, kept theirs.

So the corpus asserted application rules for 18 closed Spanish convocatorias
on the authority of a file that no longer says it. Nothing in the pipeline
could detect that, because every check runs forward from the records.

── The test ───────────────────────────────────────────────────────────────
For an instrument that APPEARS in some `found_<CC>.json`, the fetch records
are the authority on its eligibility text: if not one of them carries that
text verbatim, the corpus is asserting something no source does, and the text
is cleared.

An instrument that appears in NO fetch record is untouched. Its text came from
another loader, that loader owns it, and this script has no standing to judge
it — the failure mode here is precisely a script overreaching into rows it did
not write.

Verbatim, not fuzzy: the question is whether a source states this text, and a
near-match is a different statement. Matching loosely would let an edited or
truncated value pass as asserted, which is the failure being repaired.

`administering_body` and `scheme_end_date` are NOT touched. They come from
`lifetime_facts()`, which is deliberately not gated on liveness — knowing that
a scheme closed is what REMOVES it from what a brief may propose, and
retracting that would put the dead scheme back in front of a founder.

Usage:
  python3 ETL/terms/retract_unasserted_text.py --country ES
  python3 ETL/terms/retract_unasserted_text.py --country ES --write --postgres
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT as REPO_ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import collections  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import sqlite3  # noqa: E402

SRC_DIR = REPO_ROOT / "data" / "raw" / "scheme_enrichment"

# Cleared together, because they describe the retracted text and nothing else.
# A source URL and a confidence grade for prose that is gone are provenance for
# an assertion the corpus no longer makes.
TEXT_COLUMNS = ("description", "eligibility_text",
                "eligibility_source_url", "eligibility_confidence")


def asserted_texts() -> dict[str, set[str]]:
    """Every eligibility text any fetch record currently states, by instrument.

    Read across ALL `found_*.json`, not per file: several files legitimately
    cover the same instrument (Spain has a general pass and a BDNS pass), and
    one of them abstaining is not the corpus being wrong — it is one source
    having nothing to say while another does.
    """
    out: dict[str, set[str]] = collections.defaultdict(set)
    for f in sorted(SRC_DIR.glob("found_*.json")):
        try:
            recs = json.loads(f.read_text())
        except Exception:
            continue
        for rec in recs:
            iid = rec.get("instrument_id")
            if not iid or rec.get("found") is False:
                continue
            out[iid]  # seen, even if it asserts nothing
            for key in ("eligibility_text", "description"):
                val = (rec.get(key) or "").strip()
                if val:
                    out[iid].add(val)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--country", action="append", required=True, metavar="CC",
                    help="only judge rows of these countries (repeatable). "
                         "Required: this script deletes, and deleting outside "
                         "the countries you own is the mistake it exists to fix.")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--postgres", action="store_true",
                    help="apply the same retraction to DATABASE_URL. The read "
                         "path is Postgres, so a SQLite-only run repairs nothing.")
    args = ap.parse_args()

    countries = [c.strip().upper() for c in args.country]
    stated = asserted_texts()

    conn = sqlite3.connect(DB)
    q = ",".join("?" for _ in countries)
    rows = conn.execute(
        f"SELECT id, country, eligibility_text FROM funding_instruments "
        f"WHERE country IN ({q}) AND COALESCE(eligibility_text,'') <> ''",
        countries).fetchall()

    stale, unseen, ok = [], 0, 0
    for iid, cc, text in rows:
        if iid not in stated:
            unseen += 1          # another loader's row; not ours to judge
        elif text.strip() in stated[iid]:
            ok += 1
        else:
            stale.append((iid, cc))

    print(f"{len(rows)} rows carry eligibility_text in {'/'.join(countries)}")
    print(f"  {ok:4d} asserted verbatim by a fetch record")
    print(f"  {unseen:4d} in no fetch record at all (another loader's; untouched)")
    print(f"  {len(stale):4d} asserted by NOTHING on disk -> retract")
    for iid, cc in stale[:25]:
        print(f"        {cc}  {iid[:72]}")
    if len(stale) > 25:
        print(f"        ... and {len(stale) - 25} more")

    if not stale:
        return
    if not args.write:
        print("\n[report only] --write to apply")
        return

    sets = ", ".join(f"{c} = NULL" for c in TEXT_COLUMNS)
    conn.executemany(f"UPDATE funding_instruments SET {sets} WHERE id = ?",
                     [(i,) for i, _ in stale])
    conn.commit()
    conn.close()
    print(f"\nretracted {len(stale)} rows in SQLite")

    if args.postgres:
        dsn = os.environ.get("DATABASE_URL")
        if not dsn:
            raise SystemExit("DATABASE_URL not set (expected in the repo-root .env.local)")
        import psycopg2  # lazy: SQLite-only runs need no driver
        pg = psycopg2.connect(dsn)
        with pg, pg.cursor() as cur:
            cur.executemany(f"UPDATE funding_instruments SET {sets} WHERE id = %s",
                            [(i,) for i, _ in stale])
        pg.close()
        print(f"retracted {len(stale)} rows in Postgres")


if __name__ == "__main__":
    main()
