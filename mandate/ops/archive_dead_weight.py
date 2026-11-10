"""Archive the dead weight data_audit.md names, then drop or blank it.

Called by archive_dead_weight.sh (which fetches the URLs and the bucket
credentials); run that, not this. Dry run unless --apply.

WHAT (mandate/plans/data_audit.md, slimming 2 and 4; owner-approved 10 Nov):
  capital.classify_audit                    archive, drop
  capital.company_sector_llm                archive, drop
  capital._reconcile_20261105_sqlite_gates  archive, drop
  capital.brief_records                     archive, drop   (the retired /brief)
  signals_articles.raw_text where is_relevant = 0 (and the text was fetched)
                                            archive id/url/title/text, blank the text;
                                            the headline rows stay
NOT HERE, deliberately: request_log and event_log are still written (the
mission route's quota; telemetry from the corpus hydration), satr_staging and
public_funding_events.project_summary (they need a column-reader audit first).

ORDER, and why. Archive every target and verify each by read-back BEFORE
anything is dropped; record the archive in mandate/ops/archives.json; write
the drop as the next forward migration plus the two schema-register edits
(store_of_record.json, schema_debt.json) and run the static schema checks on
them; only then apply the migration and blank the texts. A failure at any
point before the migration leaves production exactly as it was.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import psycopg  # noqa: E402

from mandate.archive import archive_query  # noqa: E402
from mandate.grounding.bucket import bucket_from_env  # noqa: E402

PREFIX = "archive/2026-11/"
MIGDIR = ROOT / "capital/ETL/schema/migrations"
ARCHIVES = ROOT / "mandate/ops/archives.json"
STORE_OF_RECORD = ROOT / "capital/ETL/schema/store_of_record.json"
SCHEMA_DEBT = ROOT / "capital/ETL/schema/schema_debt.json"

DROP = ["classify_audit", "company_sector_llm", "_reconcile_20261105_sqlite_gates", "brief_records"]
ORDER_BY = {"classify_audit": "id", "company_sector_llm": "company_id", "brief_records": "created_at"}
IRRELEVANT = "is_relevant = 0 AND full_text_fetched = 1 AND raw_text <> ''"
TEXTS_QUERY = f"SELECT id, url, title, raw_text FROM signals_articles WHERE {IRRELEVANT} ORDER BY id"

# Where a dropped table's name may still appear, and why that is not a reader.
# Anything else naming it refuses the run: trace the reader before the drop.
ALLOWED = [
    (r"/archive/", "archived code"),
    (r"\.sql$", "DDL (the baseline that declared it; the drop migration supersedes it)"),
    (r"capital/ETL/events/transform/classify(_llm)?\.py$", "the SQLite classifier: laptop-only, not on the cron"),
    (r"capital/ETL/events/load/qa/sanity_check\.py$", "a comment where the classify_audit summary was"),
    (r"capital/website/build/lib/corpus_stores\.py$", "a comment in the census families"),
    (r"web/lib/intelligence/(record|pipeline)\.ts$", "recordBrief, called only from runIntelligence, which no route calls (/brief retired)"),
    (r"web/lib/intelligence/(caps|memoCandidates|rules|briefRows\.test)\.ts$", "comments citing past brief_records counts"),
    (r"mandate/ops/archive_dead_weight\.py$", "this script"),
]
# a table the product still writes would show recent rows: refuse if any are newer than this
QUIET_DAYS = 30
WRITTEN_AT = {"brief_records": "created_at", "classify_audit": "changed_at"}


def live_references() -> list[str]:
    pat = "|".join(DROP)
    out = subprocess.run(["git", "grep", "-l", "-E", pat, "--", "*.py", "*.ts", "*.tsx", "*.sh", "*.sql", "*.yml"],
                         cwd=ROOT, capture_output=True, text=True).stdout.split()
    return [f for f in out if not any(re.search(rx, f) for rx, _ in ALLOWED)]


def table_exists(c, t: str) -> bool:
    return c.execute("SELECT to_regclass(%s) IS NOT NULL", (f"capital.{t}",)).fetchone()[0]


def plan(c) -> dict:
    p = {"tables": {}, "texts": {}}
    for t in DROP:
        if not table_exists(c, t):
            p["tables"][t] = None
            continue
        n = c.execute(f'SELECT count(*) FROM capital."{t}"').fetchone()[0]
        size = c.execute("SELECT pg_total_relation_size(%s::regclass)", (f"capital.{t}",)).fetchone()[0]
        last = None
        if t in WRITTEN_AT:
            last = c.execute(f'SELECT max({WRITTEN_AT[t]})::text FROM capital."{t}"').fetchone()[0]
        p["tables"][t] = {"rows": n, "bytes": size, "last_written": last}
    n, b = c.execute(f"SELECT count(*), coalesce(sum(octet_length(raw_text)), 0) FROM capital.signals_articles "
                     f"WHERE {IRRELEVANT}").fetchone()
    p["texts"] = {"rows": n, "bytes": b}
    return p


def recently_written(p: dict) -> list[str]:
    cutoff = (dt.date.today() - dt.timedelta(days=QUIET_DAYS)).isoformat()
    return [f"{t} (last written {v['last_written']})" for t, v in p["tables"].items()
            if v and v.get("last_written") and v["last_written"][:10] >= cutoff]


def next_migration_id() -> str:
    ids = sorted(int(m.group(1)) for f in MIGDIR.glob("*.sql") if (m := re.match(r"(\d{3})_", f.name)))
    existing = sorted(MIGDIR.glob("*_archive_dead_weight.sql"))
    return existing[0].name[:3] if existing else f"{ids[-1] + 1:03d}"


def write_schema_change(present: list[str]) -> Path:
    mig = MIGDIR / f"{next_migration_id()}_archive_dead_weight.sql"
    lines = ["-- The dead weight's exit (mandate/ops/archive_dead_weight.sh; data_audit.md slimming 2 and 4).",
             f"-- Each table was exported to the bucket as {PREFIX}<table>.csv.gz, verified by",
             "-- read-back (sha256 and row count), and recorded in mandate/ops/archives.json",
             "-- before this ran. Restore: download, gunzip, COPY FROM into the DDL in git history."]
    lines += [f'DROP TABLE IF EXISTS "{t}";' for t in present]
    mig.write_text("\n".join(lines) + "\n")
    # Line edits, not a re-dump: both registers are hand-aligned and reviewed as diffs.
    sor_text = STORE_OF_RECORD.read_text()
    owners = json.loads(sor_text)["tables"]
    sqlite_gone = sum(1 for t in present if owners.get(t, {}).get("store") == "sqlite")
    for t in present:
        sor_text = re.sub(rf'\n[ \t]*"{re.escape(t)}":[ \t]*\{{[^\n]*\}},?[ \t]*(?=\n)', "", sor_text)
    sor_text = re.sub(r",(\s*\n\s*\})", r"\1", sor_text)  # a removed last entry leaves a comma
    if sqlite_gone:
        sor_text = re.sub(r'("not_postgres_budget":\s*)(\d+)', lambda m: f"{m.group(1)}{int(m.group(2)) - sqlite_gone}", sor_text)
    json.loads(sor_text)
    STORE_OF_RECORD.write_text(sor_text)
    debt_text = SCHEMA_DEBT.read_text()
    gone = [t for t in json.loads(debt_text).get("tables_without_ddl", []) if t in present]
    for t in gone:
        debt_text = re.sub(rf'\n[ \t]*"{re.escape(t)}",?[ \t]*(?=\n)', "", debt_text)
    if gone:
        debt_text = re.sub(r'("budget":\s*)(\d+)', lambda m: f"{m.group(1)}{int(m.group(2)) - len(gone)}", debt_text, count=1)
        debt_text = re.sub(r",(\s*\n\s*\])", r"\1", debt_text)
        json.loads(debt_text)
        SCHEMA_DEBT.write_text(debt_text)
    return mig


def static_checks() -> None:
    for script in ("ETL/schema/check_store_of_record.py", "ETL/schema/check_store_schema.py"):
        r = subprocess.run([sys.executable, script], cwd=ROOT / "capital", capture_output=True, text=True)
        if r.returncode:
            raise SystemExit(f"REFUSED before any drop: {script} fails on the schema change:\n{r.stdout[-1500:]}{r.stderr[-500:]}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--capital-url", required=True, help="capital's OWNER role (capital_app)")
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    refs = live_references()
    if refs:
        print("REFUSED: code outside the allowlist still names a table to drop:\n  " + "\n  ".join(refs))
        return 1
    print("== readers: none outside the allowlist")
    for rx, why in ALLOWED:
        print(f"   {rx:60} {why}")

    with psycopg.connect(a.capital_url) as c:
        c.execute("SET search_path = capital, public")
        p = plan(c)
        c.rollback()
        print("== what would go")
        freed = 0
        for t, v in p["tables"].items():
            if v is None:
                print(f"   capital.{t:36} already gone")
                continue
            freed += v["bytes"]
            print(f"   capital.{t:36} {v['rows']:>9,} rows  {v['bytes'] / 1e6:7.1f} MB  archive + drop"
                  + (f"  (last written {v['last_written']})" if v["last_written"] else ""))
        print(f"   signals_articles.raw_text (irrelevant)  {p['texts']['rows']:>9,} rows  "
              f"{p['texts']['bytes'] / 1e6:7.1f} MB  archive + blank (headline rows stay)")
        print(f"   ~{(freed + p['texts']['bytes']) / 1e6:.0f} MB freed (the blanked text after VACUUM FULL)")
        hot = recently_written(p)
        if hot:
            print(f"REFUSED: written in the last {QUIET_DAYS} days, so something still writes it: {', '.join(hot)}")
            return 1
        present = [t for t, v in p["tables"].items() if v is not None]
        mig = MIGDIR / f"{next_migration_id()}_archive_dead_weight.sql"
        print(f"== migration to write: {mig.relative_to(ROOT)} (DROP TABLE {', '.join(present) or 'nothing'})")
        if not a.apply:
            print("\nDRY RUN. Nothing written. To archive and drop: bash mandate/ops/archive_dead_weight.sh --apply")
            return 0

        bucket = bucket_from_env()
        entries = []
        print(f"== 1. archive to the bucket, {PREFIX} (verified by read-back)")
        for t in present:
            order = f' ORDER BY "{ORDER_BY[t]}"' if t in ORDER_BY else ""
            e = archive_query(c, bucket, f"{PREFIX}{t}.csv.gz", f'SELECT * FROM capital."{t}"{order}')
            entries.append(e)
            print(f"   {e.key}: {e.rows:,} rows, {e.bytes / 1e6:.1f} MB gz, sha256 {e.sha256[:12]}... verified")
        texts = None
        if p["texts"]["rows"]:
            texts = archive_query(c, bucket, f"{PREFIX}signals_articles_irrelevant_text.csv.gz",
                                  TEXTS_QUERY.replace("signals_articles", "capital.signals_articles"))
            entries.append(texts)
            print(f"   {texts.key}: {texts.rows:,} rows, {texts.bytes / 1e6:.1f} MB gz, verified")
        rec = json.loads(ARCHIVES.read_text()) if ARCHIVES.exists() else {"archives": []}
        stamp = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        rec["archives"] += [{**e.as_dict(), "archived_at": stamp, "by": "archive_dead_weight.sh"} for e in entries]
        ARCHIVES.write_text(json.dumps(rec, indent=1) + "\n")
        print(f"   recorded in {ARCHIVES.relative_to(ROOT)}")

        print("== 2. the schema change, checked before it runs")
        mig = write_schema_change(present)
        static_checks()
        print(f"   {mig.relative_to(ROOT)} written; store_of_record and schema_debt updated; static checks pass")

        print("== 3. drop (the migration) and blank the irrelevant texts")
        r = subprocess.run([sys.executable, "ETL/events/load/migrations/apply.py", mig.name[:3]],
                           cwd=ROOT / "capital", env={**__import__("os").environ, "DATABASE_URL": a.capital_url})
        if r.returncode:
            print("FAILED applying the migration: the archives stand; nothing was dropped by a failed migration")
            return 1
        if texts:
            with c.transaction():
                n = c.execute(f"UPDATE capital.signals_articles SET raw_text = '' WHERE {IRRELEVANT}").rowcount
                if n != texts.rows:
                    raise SystemExit(f"REFUSED: {n} rows to blank, {texts.rows} archived; rolled back")
            print(f"   blanked {n:,} texts")
    with psycopg.connect(a.capital_url, autocommit=True) as c:
        c.execute("VACUUM (FULL, ANALYZE) capital.signals_articles")
        size = c.execute("SELECT pg_size_pretty(pg_total_relation_size('capital.signals_articles'))").fetchone()[0]
        print(f"   signals_articles rewritten: {size}")
    print(f"""
DONE. Commit and merge BEFORE the next Sunday 03:00 UTC (the weekly run checks
the store against the committed DDL):
  git switch -c archive-dead-weight
  git add {mig.relative_to(ROOT)} {ARCHIVES.relative_to(ROOT)} \\
          capital/ETL/schema/store_of_record.json capital/ETL/schema/schema_debt.json
  git commit -m "Archive the dead weight: tables dropped, irrelevant news text blanked (archive/2026-11/)"
  git push -u origin HEAD""")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
