"""Clear published eligibility prose that states nothing an applicant can act on.

── The column the incident actually happened in ───────────────────────────
On 2026-08-06 eleven IPCEI leaves shipped with `eligibility_text` lifted from
closed Commission state-aid decisions. The 2026-08-07 retraction fixed those
eleven rows; `apply_gate_role_overrides.py` later fixed the gates carrying the
same quotations. Between them they left the COLUMN unguarded -- only the
instances were repaired -- and running the pertinence classifier over the whole
corpus rather than over IPCEI found ten more live texts of the same class:

    "the 16 start-ups -- eight of which are UK-based -- joining the second
     edition of the Amazon Sustainability Accelerator"        eit_climate_kic_asa
    "14. Investīcijas ietvaros projekta iesniegumus var iesniegt šādi
     kompetences centri: ... 'LEO pētījumu centrs' ..."       satr_lv_rnd__sa_103894
    "AS “Attīstības finanšu institūcija Altum”"               altum_* (x2)

None of these is a condition. Two are a closed list nobody can join, two are a
cohort already chosen, two are the administering body's bare name in the column
that is supposed to say who may apply.

── Why this is not `retract_unasserted_text.py` ───────────────────────────
That script asks whether a fetch record on disk still ASSERTS the text -- a
question about provenance. This one asks whether the text is the right KIND of
statement -- a question about pertinence. A text can be faithfully asserted by
its source and still be a report about someone else's completed grant; that is
the entire lesson of the incident. None of these ten rows appears in any
`found_*.json`, so the provenance script would never have looked at them.

── Why there is no list of ids in this file ───────────────────────────────
The set to retract is DERIVED, every run, from the verdicts in
`data/eligibility_pertinence.json`: every published `eligibility_text` whose
current text is judged `report` at the current property version. A hand-written
list of ten ids would be an enumeration of today's instances -- the exact shape
this repo keeps being bitten by -- and it would go stale the moment a loader
writes an eleventh. Derived from the property, this script retracts the next one
too, and it CANNOT retract a text that has not been judged a report.

Two consequences worth stating:
  * A text judged at a superseded property version is NOT retracted. Deleting
    a founder-facing claim on the strength of an answer to a question we have
    since changed is not a retraction, it is a guess. Re-run the classifier.
  * Retraction is idempotent and re-runnable. If a loader re-adds a retracted
    text, `check_gate_pertinence.ts` fails the build on it (the verdict is
    cached against the TEXT, so the re-added string is already judged), and
    re-running this clears it again.

── What is cleared, and what is not ───────────────────────────────────────
`eligibility_text` and the two columns that are provenance for it alone --
`eligibility_source_url` and `eligibility_confidence`. A source URL and a
confidence grade for prose that is gone are provenance for a claim the corpus no
longer makes.

`description` is NOT cleared. It is a different claim ("what it funds", not "who
may apply"), the classifier did not judge it, and clearing a column nobody
judged is precisely the overreach this file's sibling warns about.
`administering_body` and `scheme_end_date` are not touched for the same reason.

── The text is archived, not destroyed ────────────────────────────────────
Retraction removes a founder-facing claim from the product; it should not
destroy the evidence of what was published and why it was withdrawn. Every
retracted value is appended to `data/retracted_eligibility_text.json` with its
verdict, the model's reason and the property version that judged it, so the
decision is auditable after the column is empty. That file is the record; the
DB is the product.

── Both stores, because the product reads one and the ranker reads the other ──
Postgres is the read path. SQLite is what `build_instrument_profiles.py` builds
`instrument_profiles` from -- and that index IS the primary ranking signal, so a
Postgres-only retraction would leave the retracted sentence deciding what a
founder is shown while no longer being shown to them. `migrate_to_postgres.py`
truncate-and-reloads `funding_instruments` FROM SQLite, so a Postgres-only
retraction would also simply be undone by the next migration.

Usage:
  python3 ETL/terms/retract_unpertinent_text.py
  python3 ETL/terms/retract_unpertinent_text.py --write
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
import datetime  # noqa: E402
import hashlib  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402

CACHE = ROOT / "data" / "eligibility_pertinence.json"
LEDGER = ROOT / "data" / "retracted_eligibility_text.json"

#: Cleared together, because the latter two describe the retracted text and
#: nothing else. See the module header for what is deliberately NOT cleared.
TEXT_COLUMNS = ("eligibility_text", "eligibility_source_url",
                "eligibility_confidence")

#: Same threshold the classifier judges on, so the two populations cannot
#: disagree about which strings are long enough to make a claim.
MIN_LEN = 40


def _load_env() -> None:
    path = ROOT / ".env.local"
    if path.exists():
        for line in path.read_text().splitlines():
            m = re.match(r"^([A-Z_]+)=(.*)$", line)
            if m:
                os.environ.setdefault(m.group(1), m.group(2).strip("\"'"))


def digest(text: str) -> str:
    """Byte-identical to `digest()` in classify_eligibility_pertinence.py and to
    the one in check_gate_pertinence.ts. All three must agree or this script
    retracts nothing while the check fails on everything."""
    return hashlib.sha256(
        re.sub(r"\s+", " ", text or "").strip().encode()).hexdigest()[:16]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true",
                    help="apply to SQLite AND Postgres; without it, report only")
    args = ap.parse_args()
    _load_env()

    if not CACHE.exists():
        raise SystemExit(f"{CACHE} is missing; nothing has been judged. Run: "
                         f"python3 ETL/terms/classify_eligibility_pertinence.py --classify")
    cache_file = json.loads(CACHE.read_text())
    cache = cache_file["verdicts"]
    version = cache_file["_property_version"]

    conn = sqlite3.connect(DB)
    rows = conn.execute(
        f"SELECT id, country, eligibility_text FROM funding_instruments "
        f"WHERE length(COALESCE(eligibility_text,'')) > {MIN_LEN}").fetchall()

    doomed, stale, unjudged = [], 0, 0
    for iid, cc, text in rows:
        entry = cache.get(digest(text))
        if entry is None:
            unjudged += 1
        elif entry.get("v", 1) != version:
            stale += 1
        elif entry["verdict"] == "report":
            doomed.append((iid, cc, text, entry))

    print(f"{len(rows)} rows carry eligibility_text over {MIN_LEN} chars")
    print(f"  {unjudged:4d} unjudged            (not retracted -- judge them first)")
    print(f"  {stale:4d} judged at v<{version}       (not retracted -- re-run the classifier)")
    print(f"  {len(doomed):4d} judged REPORT at v{version}  -> retract")
    for iid, cc, text, entry in doomed:
        # Flattened outside the f-string: an f-string expression may not contain
        # a backslash, and this exact trap already made one applier on this
        # branch unrunnable (see ab37cfe9).
        head = re.sub(r"\s+", " ", text).strip()[:100]
        print(f"        {cc:<3} {iid[:58]:<60} {entry['reason'][:60]}")
        print(f"            {head!r}")

    if not doomed:
        return
    if not args.write:
        print("\n[report only] --write to apply")
        return

    # Archive BEFORE deleting: a run that cleared the column and then failed to
    # write the record would leave no trace of what was published.
    ledger = json.loads(LEDGER.read_text()) if LEDGER.exists() else {"retractions": []}
    known = {(r["id"], r["digest"]) for r in ledger["retractions"]}
    stamp = datetime.date.today().isoformat()
    for iid, cc, text, entry in doomed:
        if (iid, digest(text)) in known:
            continue
        ledger["retractions"].append({
            "id": iid, "country": cc, "retracted_on": stamp,
            "digest": digest(text), "verdict": entry["verdict"],
            "property_version": version, "reason": entry["reason"],
            "text": text,
        })
    ledger["_comment"] = (
        "Eligibility prose withdrawn from the product because it stated nothing an "
        "applicant could act on. Written by ETL/terms/retract_unpertinent_text.py. "
        "This is the audit record, not a source: nothing reads it back into the "
        "corpus. It exists so a retraction can be reviewed after the column is "
        "empty, and so re-publishing a withdrawn claim is a visible act.")
    ledger["retractions"].sort(key=lambda r: (r["id"], r["digest"]))
    LEDGER.write_text(json.dumps(ledger, indent=1, ensure_ascii=False) + "\n")
    print(f"\narchived {len(ledger['retractions'])} retraction(s) to "
          f"{LEDGER.relative_to(ROOT)}")

    sets = ", ".join(f"{c} = NULL" for c in TEXT_COLUMNS)
    ids = [(i,) for i, _, _, _ in doomed]
    conn.executemany(f"UPDATE funding_instruments SET {sets} WHERE id = ?", ids)
    conn.commit()
    conn.close()
    print(f"retracted {len(doomed)} rows in SQLite")

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("DATABASE_URL not set (expected in the repo-root "
                         ".env.local). SQLite is retracted; Postgres is NOT -- "
                         "re-run with it set, or the read path still serves the text.")
    import psycopg2  # lazy: a report-only run needs no driver
    pg = psycopg2.connect(dsn)
    with pg, pg.cursor() as cur:
        cur.executemany(f"UPDATE funding_instruments SET {sets} WHERE id = %s", ids)
        # Invalidate the DERIVED index entry, or the retraction is cosmetic.
        # `instrument_profiles` embeds this column under "Who may apply, from
        # the scheme's own page", and it is the primary ranking signal. Both
        # pipelines that rebuild it -- `make eligibility` with --rebuild and
        # ETL/refresh.py WITHOUT it -- are anti-joins on instrument_id, so the
        # incremental one would skip every id it already holds and go on
        # ranking founders against the sentence just withdrawn from them.
        # Deleting the row is what makes the next embed, of either kind,
        # recompute it.
        cur.execute("DELETE FROM instrument_profiles WHERE instrument_id = ANY(%s)",
                    ([i for i, _, _, _ in doomed],))
        dropped = cur.rowcount or 0
    pg.close()
    print(f"retracted {len(doomed)} rows in Postgres")
    print(f"invalidated {dropped} instrument_profiles row(s) -- re-embed with "
          f"`python3 ETL/terms/build_instrument_profiles.py run`")


if __name__ == "__main__":
    main()
