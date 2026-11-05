"""The last union of the two SQLite corpora, before both stop being stores.

    python3 ETL/schema/consolidate/union_stores.py LAPTOP VOLUME OUT [--write]

Writes OUT, a copy of LAPTOP with every row VOLUME holds that LAPTOP lacks.
Neither input is opened for writing. OUT is what load_into_postgres.py loads.

WHY THIS EXISTS ONCE: until 2026-11-05 the corpus lived in two SQLite files,
the laptop's and the Railway volume's, forked on 2026-08-08 and reconciled by
hand. Postgres becomes the only store, so this runs one last time, and every
decision it takes is printed and committed rather than made in a terminal.

Measured 2026-11-05 (archive ~/Mandate-backups/2026-11-05, MANIFEST.json):

  * companies / public_funding_events / instruments / gates / clauses:
    merged by ETL/lib/merge_volume_into_local.py, the existing guarded tool,
    which refuses unless check_id_collisions passes. It refused, correctly:
    FIVE volume companies are case variants of laptop companies
    ('CUBASE BIO AB' vs 'Cubase Bio AB', all Swedish, all created by the cron
    on 2026-10-18), each carrying one new award. Resolved below by mapping the
    volume id to the laptop id BEFORE the merge, so the five awards land on the
    company that already exists and no duplicate entity is created.

  * company_sector_labels: 7 volume-only rows are added. On the 31,974 shared
    keys, 31,810 differ ONLY in labelled_at (the cron's `restore` step rewrote
    the timestamp). The other 164 are the cron REGRESSING curated labels: 65
    subsectors blanked, and method `recovered_2026_07_23` replaced by a NACE
    guess (an audio-engineering company relabelled health). The laptop's value
    is kept on every shared key, the same rule merge_volume_into_local applies.
    The volume's values are not lost; they are in the archive.

  * corpus_run_marks: operational state, one row per step. The newer run wins,
    because it is the more recent fact about that step.

  * schema_migrations: same ids, different applied_at. The laptop's row is
    kept: a migration's first application is the fact worth recording.

  * every other table was verified IDENTICAL by ordered-row hash, and is not
    touched.
"""
from __future__ import annotations

import shutil
import sqlite3
import sys
from pathlib import Path

LIB = Path(__file__).resolve().parents[2] / "lib"
sys.path.insert(0, str(LIB))


def case_aliases(con: sqlite3.Connection) -> list[tuple[int, int]]:
    """(volume_id, laptop_id) for volume-only companies that ARE a laptop company.

    Identity is the one check_id_collisions uses: trimmed, case-folded
    (canonical_name, country). Exactly one laptop match is required; an
    ambiguous match is refused, not guessed.
    """
    rows = con.execute(
        "SELECT v.id, lower(trim(v.canonical_name)), lower(trim(v.country)) "
        "FROM vol.companies v "
        "WHERE v.id NOT IN (SELECT id FROM main.companies) "
        "AND v.canonical_name IS NOT NULL AND v.country IS NOT NULL").fetchall()
    laptop: dict[tuple[str, str], list[int]] = {}
    for mid, name, cc in con.execute(
            "SELECT id, lower(trim(canonical_name)), lower(trim(country)) FROM main.companies "
            "WHERE canonical_name IS NOT NULL AND country IS NOT NULL"):
        laptop.setdefault((name, cc), []).append(mid)
    out = []
    for vid, name, cc in rows:
        hits = laptop.get((name, cc), [])
        if len(hits) > 1:
            sys.exit(f"REFUSING: volume company {vid} matches {len(hits)} laptop companies {hits}")
        if hits:
            out.append((vid, hits[0]))
    return out


def main() -> int:
    if len(sys.argv) < 4:
        return print(__doc__) or 2
    laptop, volume, out = (Path(a).expanduser().resolve() for a in sys.argv[1:4])
    write = "--write" in sys.argv

    # A scratch copy of the volume, so the alias remap never touches the input.
    work = out.with_suffix(".volume-remapped.sqlite")
    shutil.copyfile(volume, work)
    shutil.copyfile(laptop, out)

    con = sqlite3.connect(out)
    con.execute("ATTACH DATABASE ? AS vol", (str(work),))
    aliases = case_aliases(con)
    print(f"case-variant companies in the volume: {len(aliases)}")
    for vid, mid in aliases:
        name = con.execute("SELECT canonical_name FROM vol.companies WHERE id=?", (vid,)).fetchone()[0]
        n = con.execute("SELECT count(*) FROM vol.public_funding_events WHERE company_id=?",
                        (vid,)).fetchone()[0]
        print(f"  volume {vid} {name!r} -> laptop {mid}; {n} award(s) re-pointed")
    con.execute("DETACH DATABASE vol")
    con.close()

    v = sqlite3.connect(work)
    with v:
        for vid, mid in aliases:
            v.execute("UPDATE public_funding_events SET company_id=? WHERE company_id=?", (mid, vid))
            v.execute("DELETE FROM companies WHERE id=?", (vid,))  # scratch copy only
    v.close()

    # The guarded merge, unchanged: it re-runs its own collision audit and
    # refuses if anything is still unsafe.
    import etl_env
    etl_env.DB = out
    import merge_volume_into_local as merge
    merge.DB = out
    argv, sys.argv = sys.argv, ["merge", str(work)] + (["--write"] if write else [])
    try:
        rc = merge.main()
    finally:
        sys.argv = argv
    if rc:
        return rc
    if not write:
        print("\nDRY RUN: the remaining tables are reported but not written.")

    con = sqlite3.connect(out)
    con.execute("ATTACH DATABASE ? AS vol", (str(work),))
    with con:
        n = con.execute("SELECT count(*) FROM vol.company_sector_labels "
                        "WHERE name_key NOT IN (SELECT name_key FROM main.company_sector_labels)").fetchone()[0]
        print(f"company_sector_labels: +{n} volume-only; laptop kept on every shared key")
        newer = con.execute(
            "SELECT count(*) FROM vol.corpus_run_marks v LEFT JOIN main.corpus_run_marks m USING(step) "
            "WHERE m.step IS NULL OR v.opened_at > m.opened_at").fetchone()[0]
        print(f"corpus_run_marks: {newer} step(s) take the volume's newer run")
        if write:
            con.execute("INSERT INTO main.company_sector_labels SELECT * FROM vol.company_sector_labels "
                        "WHERE name_key NOT IN (SELECT name_key FROM main.company_sector_labels)")
            con.execute("INSERT OR REPLACE INTO main.corpus_run_marks "
                        "SELECT v.* FROM vol.corpus_run_marks v LEFT JOIN main.corpus_run_marks m USING(step) "
                        "WHERE m.step IS NULL OR v.opened_at > m.opened_at")
    con.close()
    work.unlink()
    if not write:
        out.unlink()
    return 0


if __name__ == "__main__":
    sys.exit(main())
