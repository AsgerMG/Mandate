"""The two tables that cannot be rebuilt, backed up on a schedule, with history.

── What this covers, and what it deliberately does not ────────────────────
Exactly two tables, because exactly two cannot be reconstructed from anything
we still have:

  company_sector_labels   144,493 rows.  A PAID LLM classification. A
                          `companies` truncate-and-reload wiped it on
                          2026-07-24; it was recovered on 2026-08-01 to this
                          laptop only, and the API results are past retention.
                          Nothing can re-derive it for free.

  public_funding_events   311,399 rows.  Drawn from public registers that keep
                          NO history. Re-fetching does not give these rows
                          back; it gives a different, smaller corpus of what
                          those registers say today.

The AUTHORED corpus — instruments, sources, gates, clauses, application routes
— is NOT here. It is in `corpus-ledger/`, committed to git, with an
insert-only restore proven by deleting 1,070 gates and putting them back. The
boundary between the two is asserted in code below, not described in prose,
because a described boundary drifts and an asserted one fails the run.

Everything else is regenerable: embeddings cost cents, synthesis.json and
every published figure are derived, and the register extractors can rebuild
their own staging.

── The four properties this exists to have ────────────────────────────────
1. IT RUNS ON A SCHEDULE.  A launchd LaunchAgent (`install-schedule`), which
   is what macOS honours; a session `crontab` dies with the session and
   /usr/sbin/cron additionally needs Full Disk Access to read this corpus.
   launchd runs a missed StartCalendarInterval job when the machine wakes.

2. IT VERIFIES BY RESTORING.  Every snapshot is loaded back into a scratch
   SQLite store through the same insert-only restore a human would use at 2am,
   read out again, and compared to the source by row count AND by a content
   hash. Re-running the restore must then add +0 rows. If any of that
   disagrees, nothing is published and the run exits non-zero. This is the
   `instrument_ledger.py` standard: proven by restoring, not by assuming.

3. IT REFUSES TO REPLACE A GOOD BACKUP WITH A SMALLER ONE.  A table whose row
   count, or whose set of columns, is below the last good snapshot is REFUSED:
   the previous snapshot stays head, and the refusal says exactly what it
   would have overwritten. This is the property that would have caught
   `db.sqlite.20260722.gz` — a backup with NO company_sector_labels table at
   all — being taken for a copy of it. A legitimate shrink needs
   `--acknowledge-shrink TABLE="why"`, which is recorded in the log, not
   waved through silently. Run `selftest` to watch it refuse.

4. YOU CAN GO ONE STEP BACK.  The vault keeps the current snapshot in full and
   a chain of REVERSE row-level deltas behind it, per table. So you can ask
   what changed between two points (`changed`), and you can restore ONE table
   at ONE revision without touching anything else. Plain sorted JSONL, never
   only a .sqlite: a SQLite file is opaque, bound to a schema version, and
   readable by exactly this repo.

── Layout in the vault ────────────────────────────────────────────────────
  <vault>/MANIFEST.json                          head: per table, rows, sha256,
                                                 columns, revision, checked_at
  <vault>/current/<table>.jsonl.gz               the snapshot, sorted, one row
                                                 per line
  <vault>/history/LOG.jsonl                      one line per table per run,
                                                 including runs that changed
                                                 nothing and runs that REFUSED
  <vault>/history/<table>/from-rNNNN.jsonl.gz    the reverse step: apply it to
                                                 revision NNNN to obtain
                                                 NNNN-1

── The verbs ──────────────────────────────────────────────────────────────
  snapshot    read the store -> guard -> prove by restoring -> publish
  status      what the vault holds, how old it is, and whether iCloud has it
  history     the revisions of a table and what each run did
  changed     the rows that differ between two revisions
  restore     vault -> a store, ONE table, INSERT-ONLY, at any revision
  selftest    the disaster drill: feed it a truncated source, watch it refuse
  install-schedule / uninstall-schedule

Read-only against the corpus. It opens db.sqlite `mode=ro` and writes nothing
to Postgres, Railway, or the site.
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT, BACKUP_ICLOUD_CORPUS  # noqa: E402
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import gzip  # noqa: E402
import hashlib  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import plistlib  # noqa: E402
import shutil  # noqa: E402
import sqlite3  # noqa: E402
import subprocess  # noqa: E402
import tempfile  # noqa: E402
from datetime import datetime, timezone  # noqa: E402

_sys.path.insert(0, str(ROOT / "website" / "build" / "lib"))
from corpus_stores import FAMILIES  # noqa: E402
from reconcile_stores import cols, has, key_of  # noqa: E402

VAULT = BACKUP_ICLOUD_CORPUS

# The identity of a row, per table.
#
# `company_sector_labels.name_key` is a stable text primary key: the same
# company yields the same key in any store, so this table is genuinely keyed.
#
# `public_funding_events` is NOT. reconcile_stores.UNKEYABLE records the
# measurement: every candidate natural key was tried against the live corpus
# and the widest of them still collapses 1,553 of 311,399 rows, because a
# register can publish the same award twice under one identifier. So the
# identity here is the AUTOINCREMENT `id` — which is a fact about ONE store's
# row numbering, not about the award.
#
# That is the right identity for a VAULT and the wrong one for a LEDGER, and
# the difference is the point. instrument_ledger.py drops surrogate ids because
# it moves authored rows BETWEEN stores. This file snapshots ONE store so that
# store can be put back the way it was; the ids are part of what it held. The
# consequence is stated rather than hidden: restoring these events into a
# store whose `companies` table has been reloaded under new ids re-attaches
# them to the wrong companies. Restore events into the store they came from,
# or into an empty one, and never into a third store that has re-issued ids.
IDENTITY = {
    "company_sector_labels": ["name_key"],
    "public_funding_events": ["id"],
}
TABLES = list(IDENTITY)

# THE BOUNDARY AGAINST corpus-ledger/, asserted rather than described. The
# ledger holds the authored instrument family; this holds the two irrecoverable
# event-family tables. Nothing may be in both: two backups of one table means
# two restores that can disagree, and the newer one silently wins.
_LEDGER_TABLES = set(FAMILIES["instruments"])
assert not (set(TABLES) & _LEDGER_TABLES), (
    "corpus_vault and corpus-ledger both claim "
    f"{sorted(set(TABLES) & _LEDGER_TABLES)} — one table, one backup of record")
assert set(TABLES) <= set(FAMILIES["events"]), (
    "corpus_vault claims a table that is not in the events family: "
    f"{sorted(set(TABLES) - set(FAMILIES['events']))}")

# A reverse step bigger than this fraction of the table is stored as a full
# copy of the older revision instead of as a delta. A companies reload
# re-issues every event id, which reads as "delete 311k, add 311k" — a delta
# twice the size of the snapshot it replaces. Whichever is smaller is stored;
# `back_kind` in the log says which, and the reader branches on it.
FULL_INSTEAD_OF_DELTA_AT = 0.5


# ── small helpers ──────────────────────────────────────────────────────────

def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} GB"


def ro(path) -> sqlite3.Connection:
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    return con


def canonical(row: dict) -> str:
    """One row, one line. Sorted keys so the artefact is byte-stable: a
    re-export with no change produces an identical file and an empty diff."""
    return json.dumps(row, ensure_ascii=False, sort_keys=True)


def sort_key(row: dict, keys: list[str]):
    """Sort by identity, numerically where the identity is an integer.

    `id` sorted as text puts 1000 before 2, which is legible to nobody and
    makes a delta between two revisions look like a reshuffle."""
    out = []
    for k in keys:
        v = row.get(k)
        out.append((0, 0.0, "") if v is None
                   else (1, float(v), "") if isinstance(v, (int, float))
                   else (2, 0.0, str(v)))
    return tuple(out)


def head() -> dict:
    p = VAULT / "MANIFEST.json"
    if not p.exists():
        return {"tables": {}}
    return json.loads(p.read_text(encoding="utf-8"))


def write_head(manifest: dict) -> None:
    VAULT.mkdir(parents=True, exist_ok=True)
    (VAULT / "MANIFEST.json").write_text(
        json.dumps(manifest, indent=1, sort_keys=True) + "\n", encoding="utf-8")


def log_lines() -> list[dict]:
    p = VAULT / "history" / "LOG.jsonl"
    if not p.exists():
        return []
    return [json.loads(ln) for ln in p.read_text(encoding="utf-8").splitlines() if ln.strip()]


def append_log(entry: dict) -> None:
    p = VAULT / "history" / "LOG.jsonl"
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, sort_keys=True) + "\n")


def current_path(table: str) -> _Path:
    return VAULT / "current" / f"{table}.jsonl.gz"


def back_path(table: str, rev: int) -> _Path:
    return VAULT / "history" / table / f"from-r{rev:04d}.jsonl.gz"


def write_jsonl_gz(path: _Path, rows: list[dict]) -> tuple[str, int, int]:
    """Write rows as gzipped JSONL. Returns (sha256, plain bytes, gz bytes).

    The sha is taken over the UNCOMPRESSED bytes on purpose: gzip output
    carries a timestamp and varies with the zlib version, so hashing the
    container would report drift on a run where nothing changed."""
    path.parent.mkdir(parents=True, exist_ok=True)
    h = hashlib.sha256()
    plain = 0
    tmp = path.with_suffix(path.suffix + ".part")
    # mtime=0 so the container is reproducible too, for anyone who diffs bytes.
    with gzip.GzipFile(filename="", mode="wb", fileobj=tmp.open("wb"), mtime=0) as gz:
        for r in rows:
            b = (canonical(r) + "\n").encode("utf-8")
            h.update(b)
            plain += len(b)
            gz.write(b)
    tmp.replace(path)
    return h.hexdigest(), plain, path.stat().st_size


def read_jsonl_gz(path: _Path) -> list[dict]:
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        return [json.loads(ln) for ln in fh if ln.strip()]


def sha_of_rows(rows: list[dict]) -> tuple[str, int]:
    h = hashlib.sha256()
    plain = 0
    for r in rows:
        b = (canonical(r) + "\n").encode("utf-8")
        h.update(b)
        plain += len(b)
    return h.hexdigest(), plain


def rows_of(con: sqlite3.Connection, table: str) -> list[dict]:
    keys = IDENTITY[table]
    keep = cols(con, table)
    out = [{c: r[c] for c in keep} for r in con.execute(f'SELECT * FROM "{table}"')]
    out.sort(key=lambda r: sort_key(r, keys))
    return out


# ── iCloud ─────────────────────────────────────────────────────────────────

def icloud_state(path: _Path) -> str:
    """Has iCloud actually taken this file?

    A file that has been uploaded and evicted is `dataless`: it still lists
    with its real size, and reading it silently pulls it back down over the
    network. So freshness is checked from the flag and from brctl, never by
    opening the file — an `ls`-based check reads an evicted file as present but
    empty-ish, and a read-based one turns every status call into a download."""
    if not path.exists():
        return "MISSING"
    try:
        flags = subprocess.run(["stat", "-f", "%Sf", str(path)], capture_output=True,
                               text=True, timeout=10).stdout.strip()
    except Exception:
        flags = ""
    if "dataless" in flags:
        return "uploaded, evicted (iCloud holds it, this disk does not)"
    if (path.parent / f".{path.name}.icloud").exists():
        return "evicted (placeholder)"
    ok, _ = brctl_caught_up()
    return ("uploaded, still cached locally" if ok
            else "LOCAL ONLY — iCloud has not caught up yet")


def brctl_caught_up(timeout: int = 60) -> tuple[bool, str]:
    """Has iCloud finished syncing? True if the container reports `caught-up`.

    `brctl status <path>` does NOT work on a subfolder — it answers "Client
    zone not found" — so the container form is the one to read, which is also
    what verified the first manual copy. And nothing here downloads: `brctl
    download -r` on this folder would pull 25 MB back onto a disk that is 97%
    full every time somebody asked whether the backup was safe."""
    try:
        r = subprocess.run(["brctl", "status"], capture_output=True, text=True,
                           timeout=timeout)
        out = (r.stdout + r.stderr).strip()
        return ("caught-up" in out and "pending" not in out.lower()), out[:2000]
    except Exception as e:  # brctl absent or refused
        return False, f"brctl unavailable: {e}"


# ── the restore a human types at 2am ───────────────────────────────────────

def ddl_of(con: sqlite3.Connection, table: str) -> str:
    return con.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
                       (table,)).fetchone()[0]


def _create_like(src: sqlite3.Connection, tgt: sqlite3.Connection, table: str) -> None:
    """Recreate the table (no indexes, no FK enforcement) in a scratch store."""
    tgt.execute(ddl_of(src, table))
    tgt.commit()


def restore_rows(target: sqlite3.Connection, table: str, rows: list[dict],
                 dry: bool) -> tuple[int, int, list[str]]:
    """INSERT-ONLY. Puts back rows the target does not have; never updates a
    row the target already holds and never deletes one.

    A vault is a record of what existed, not an instruction about what should
    exist now. If a row has been edited in the store since the snapshot, the
    store's version is the newer fact. The whole class of incident this guards
    against is a bulk operation overwriting a decision that cost money to make,
    so the restore itself must not be able to do that.

    Returns (inserted, already_present, columns the target had no room for)."""
    keys = IDENTITY[table]
    tcols = set(cols(target, table))
    present = {key_of(r, keys) for r in target.execute(f'SELECT * FROM "{table}"')}
    new = [r for r in rows if tuple("" if r.get(k) is None else str(r[k])
                                    for k in keys) not in present]
    missing = sorted({c for r in rows for c in r} - tcols)
    writable = [c for c in (new[0] if new else {}) if c in tcols]
    if new and not dry:
        ph = ", ".join("?" * len(writable))
        target.executemany(
            f'INSERT INTO "{table}" ({", ".join(writable)}) VALUES ({ph})',
            [tuple(r.get(c) for c in writable) for r in new])
        target.commit()
    return len(new), len(present), missing


# ── history: reverse row-level deltas ──────────────────────────────────────

def diff_rows(old: list[dict], new: list[dict], keys: list[str]) -> dict:
    """What it takes to turn `new` back into `old`. Row-level, not textual:
    these files are sorted JSONL keyed by identity, so `added / removed /
    changed` is both exactly computable and the thing a person wants to read."""
    def k(r):
        return tuple("" if r.get(c) is None else str(r[c]) for c in keys)
    o = {k(r): r for r in old}
    n = {k(r): r for r in new}
    added = [key for key in n if key not in o]          # exist now, did not then
    removed = [key for key in o if key not in n]        # existed then, gone now
    changed = [key for key in n if key in o and canonical(n[key]) != canonical(o[key])]
    return {"added": added, "removed": removed, "changed": changed, "old": o}


def write_back_step(table: str, rev: int, old: list[dict], new: list[dict]) -> dict:
    """Write the step that takes revision `rev` back to `rev-1`."""
    keys = IDENTITY[table]
    d = diff_rows(old, new, keys)
    ops = len(d["added"]) + len(d["removed"]) + len(d["changed"])
    p = back_path(table, rev)
    if ops > FULL_INSTEAD_OF_DELTA_AT * max(len(new), 1):
        sha, plain, gz = write_jsonl_gz(p, old)
        kind = "full"
    else:
        lines = ([{"op": "del", "key": list(key)} for key in sorted(d["added"])]
                 + [{"op": "put", "row": d["old"][key]}
                    for key in sorted(d["removed"] + d["changed"])])
        sha, plain, gz = write_jsonl_gz(p, lines)
        kind = "delta"
    return {"back_step": p.name, "back_kind": kind, "back_bytes": gz,
            "added": len(d["added"]), "removed": len(d["removed"]),
            "changed": len(d["changed"])}


def apply_back_step(rows: list[dict], table: str, rev: int) -> list[dict]:
    """Apply the stored step to go from `rev` to `rev-1`."""
    p = back_path(table, rev)
    if not p.exists():
        raise SystemExit(f"no history step {p} — cannot go back past revision {rev}")
    entry = next((e for e in log_lines()
                  if e.get("table") == table and e.get("back_step") == p.name), None)
    kind = (entry or {}).get("back_kind", "delta")
    payload = read_jsonl_gz(p)
    if kind == "full":
        return payload
    keys = IDENTITY[table]
    idx = {tuple("" if r.get(c) is None else str(r[c]) for c in keys): r for r in rows}
    for op in payload:
        if op["op"] == "del":
            idx.pop(tuple(op["key"]), None)
        else:
            r = op["row"]
            idx[tuple("" if r.get(c) is None else str(r[c]) for c in keys)] = r
    out = list(idx.values())
    out.sort(key=lambda r: sort_key(r, keys))
    return out


def rows_at(table: str, rev: int | None) -> list[dict]:
    """The table as it stood at `rev` (None = head), rebuilt from current +
    reverse steps. Head is one gunzip; going back costs one step per revision."""
    manifest = head()
    if table not in manifest["tables"]:
        raise SystemExit(f"{table} is not in the vault manifest at {VAULT}")
    cur = manifest["tables"][table]["revision"]
    rows = read_jsonl_gz(current_path(table))
    if rev is None or rev == cur:
        return rows
    if rev > cur:
        raise SystemExit(f"{table} is at revision {cur}; there is no r{rev}")
    for r in range(cur, rev, -1):
        rows = apply_back_step(rows, table, r)
    return rows


# ── property 3: refuse to replace a good backup with a smaller one ─────────

def guard(table: str, new_rows: int, new_cols: list[str], prev: dict | None,
          ack: str | None) -> tuple[bool, str]:
    """May this snapshot take the previous one's place?

    THE FAILURE THIS ENCODES. `db.sqlite.20260722.gz` was the archive taken
    before the July incident and was believed to cover these tables. It has NO
    `company_sector_labels` table at all — it predates the table — and 303,086
    events against today's 311,399. Nothing looked at the row counts, so a
    backup that was missing 144,493 irreplaceable rows read as a backup.

    "Absent" and "smaller" are claims about the world and neither of them
    licenses an overwrite. A shrink can be legitimate — a deduplication pass,
    a country dropped from scope — and then it is acknowledged in writing and
    the acknowledgement is recorded in the log. It is never silent."""
    if prev is None:
        return (True, "first snapshot of this table")
    if new_rows == 0:
        return (False, "the source table is EMPTY")
    lost_cols = sorted(set(prev.get("columns", [])) - set(new_cols))
    if lost_cols:
        if not ack:
            return (False, f"columns present in r{prev['revision']} and absent now: "
                           f"{lost_cols}")
        return (True, f"column loss {lost_cols} acknowledged: {ack}")
    if new_rows < prev["rows"]:
        if not ack:
            return (False, f"{prev['rows'] - new_rows:,} fewer rows than "
                           f"r{prev['revision']}")
        return (True, f"shrink acknowledged: {ack}")
    return (True, "")


# ── verb: snapshot ─────────────────────────────────────────────────────────

def snapshot(store, acks: dict[str, str], dry: bool, keep_scratch: bool) -> int:
    con = ro(store)
    con.execute("BEGIN")          # one consistent read across both tables
    manifest = head()
    manifest.setdefault("tables", {})
    scratch_dir = _Path(tempfile.mkdtemp(prefix="corpus-vault-"))
    print(f"store  {store}\nvault  {VAULT}\n")
    published, refused, unchanged = 0, 0, 0

    for t in TABLES:
        prev = manifest["tables"].get(t)
        ack = acks.get(t)
        if not has(con, t):
            print(f"  {t:<24} REFUSED — the table is ABSENT from the store")
            print(f"      the vault holds r{prev['revision']} with {prev['rows']:,} "
                  f"rows from {prev['checked_at']}; it stays head"
                  if prev else "      and the vault has never held it")
            append_log({"at": now(), "table": t, "outcome": "refused",
                        "reason": "table absent from the store",
                        "kept_revision": (prev or {}).get("revision")})
            refused += 1
            continue

        rows = rows_of(con, t)
        colnames = cols(con, t)
        sha, plain = sha_of_rows(rows)

        ok, why = guard(t, len(rows), colnames, prev, ack)
        if not ok:
            print(f"  {t:<24} REFUSED — {why}")
            print(f"      it would have overwritten r{prev['revision']} "
                  f"({prev['rows']:,} rows, sha {prev['sha256'][:12]}, taken "
                  f"{prev['checked_at']}) with {len(rows):,} rows.")
            print(f"      That snapshot STAYS head. Nothing was written.")
            print(f"      If the shrink is real and intended, say so and it is "
                  f"recorded:\n"
                  f"        python3 ETL/events/load/corpus_vault.py snapshot "
                  f"--acknowledge-shrink '{t}=<why>'")
            append_log({"at": now(), "table": t, "outcome": "refused",
                        "reason": why, "would_have_written_rows": len(rows),
                        "kept_revision": prev["revision"], "kept_rows": prev["rows"]})
            refused += 1
            continue

        if prev and sha == prev["sha256"]:
            print(f"  {t:<24} unchanged at r{prev['revision']} ({len(rows):,} rows) "
                  f"— nothing written")
            prev["checked_at"] = now()
            # A schema that gained a column without gaining a row is still a
            # change to what a restore has to rebuild, so the head DDL is kept
            # current even on a run that publishes nothing.
            prev["ddl"], prev["columns"] = ddl_of(con, t), colnames
            append_log({"at": now(), "table": t, "outcome": "unchanged",
                        "revision": prev["revision"], "rows": len(rows)})
            unchanged += 1
            continue

        # ── property 2: prove it by restoring, BEFORE it is published ──
        proof = scratch_dir / f"{t}.proof.sqlite"
        scr = sqlite3.connect(proof)
        scr.row_factory = sqlite3.Row
        _create_like(con, scr, t)
        n1, _, missing = restore_rows(scr, t, rows, dry=False)
        back = rows_of(scr, t)
        sha_back, _ = sha_of_rows(back)
        n2, present2, _ = restore_rows(scr, t, rows, dry=False)
        scr.close()
        if not keep_scratch:
            proof.unlink(missing_ok=True)

        problems = []
        if n1 != len(rows):
            problems.append(f"restored {n1:,} of {len(rows):,} rows")
        if len(back) != len(rows):
            problems.append(f"read {len(back):,} rows back out of {len(rows):,}")
        if sha_back != sha:
            problems.append(f"content hash after a round trip is {sha_back[:12]}, "
                            f"the source is {sha[:12]}")
        if n2 != 0:
            problems.append(f"a second restore added {n2:,} more rows — it is not "
                            f"insert-only")
        if missing:
            problems.append(f"columns the scratch store had no room for: {missing}")
        if problems:
            print(f"  {t:<24} FAILED THE RESTORE PROOF — not published")
            for p_ in problems:
                print(f"      - {p_}")
            print(f"      scratch store kept at {proof}" if keep_scratch else "")
            append_log({"at": now(), "table": t, "outcome": "proof_failed",
                        "problems": problems})
            con.close()
            shutil.rmtree(scratch_dir, ignore_errors=True)
            return 1
        proof_note = (f"restored {n1:,}, {present2:,} already present on re-run, "
                      f"+{n2} second time, hash matches")

        if dry:
            print(f"  {t:<24} would publish {len(rows):,} rows "
                  f"(r{(prev or {}).get('revision', 0) + 1}) — {proof_note}")
            continue

        # ── publish, and leave a way back ──
        rev = (prev["revision"] + 1) if prev else 1
        if prev:
            old = read_jsonl_gz(current_path(t))
            step = write_back_step(t, rev, old, rows)
        else:
            step = {"back_step": None, "back_kind": None, "back_bytes": 0,
                    "added": len(rows), "removed": 0, "changed": 0}
        _, plain2, gz = write_jsonl_gz(current_path(t), rows)
        # The CREATE TABLE goes in with the rows. A backup that can only be
        # restored by a repository checkout is a backup of half the problem.
        ddl = ddl_of(con, t)
        manifest["tables"][t] = {
            "revision": rev, "rows": len(rows), "sha256": sha,
            "bytes": plain2, "gz_bytes": gz, "columns": colnames,
            "identity": IDENTITY[t], "checked_at": now(), "ddl": ddl,
        }
        entry = {"at": now(), "table": t, "outcome": "published", "revision": rev,
                 "rows": len(rows), "sha256": sha, "gz_bytes": gz, "ddl": ddl,
                 "shrink_ack": ack, "proof": proof_note, **step}
        append_log(entry)
        published += 1
        print(f"  {t:<24} r{rev}  {len(rows):,} rows  {human(gz)} gz  "
              f"(+{step['added']:,} -{step['removed']:,} ~{step['changed']:,})")
        print(f"      proof: {proof_note}")
        if step["back_step"]:
            print(f"      one step back: history/{t}/{step['back_step']} "
                  f"({step['back_kind']}, {human(step['back_bytes'])})")

    con.rollback()
    con.close()
    shutil.rmtree(scratch_dir, ignore_errors=True)
    if not dry:
        manifest["written_at"] = now()
        manifest["from_store"] = str(_Path(store).resolve())
        write_head(manifest)
    print()
    if dry:
        print("DRY RUN — nothing written.")
        return 0
    print(f"{published} published, {unchanged} unchanged, {refused} REFUSED.")
    for t in TABLES:
        m = manifest["tables"].get(t)
        if m:
            print(f"  {t:<24} head r{m['revision']}  {m['rows']:,} rows  "
                  f"{icloud_state(current_path(t))}")
    return 1 if refused else 0


# ── verb: status / history / changed ───────────────────────────────────────

def status(check_brctl: bool) -> int:
    manifest = head()
    if not manifest.get("tables"):
        print(f"the vault at {VAULT} is EMPTY — nothing has ever been published")
        return 1
    print(f"vault {VAULT}\nhead written {manifest.get('written_at')}\n")
    total = 0
    for t in TABLES:
        m = manifest["tables"].get(t)
        if not m:
            print(f"  {t:<24} NOT IN THE VAULT")
            continue
        steps = sorted((VAULT / "history" / t).glob("from-r*.jsonl.gz"))
        hist = sum(p.stat().st_size for p in steps)
        total += m["gz_bytes"] + hist
        print(f"  {t:<24} r{m['revision']}  {m['rows']:,} rows  "
              f"{human(m['gz_bytes'])} current + {human(hist)} history "
              f"({len(steps)} steps back)")
        print(f"      last verified {m['checked_at']}   sha {m['sha256'][:16]}")
        print(f"      iCloud: {icloud_state(current_path(t))}")
    print(f"\n  vault total on disk: {human(total)}")
    if check_brctl:
        ok, out = brctl_caught_up()
        print(f"\nbrctl: {'caught up' if ok else 'NOT caught up / unavailable'}")
        print("  " + "\n  ".join(out.splitlines()[:12]))
    return 0


def verify(table: str | None) -> int:
    """Re-prove the PUBLISHED vault, not the run that wrote it.

    `snapshot` proves the artefact before it is published. This proves what is
    in iCloud now: it reads the current file back, checks it against the
    manifest's row count and content hash, restores it into a scratch store
    and reads it out again. A backup nobody has restored from is a hypothesis.

    This DOWNLOADS the files if iCloud has evicted them (~26 MB). That is why
    it is a verb a person runs, and not something `status` does behind their
    back on a disk that is 97% full."""
    manifest = head()
    problems: list[str] = []
    for t in ([table] if table else TABLES):
        m = manifest["tables"].get(t)
        if not m:
            problems.append(f"{t}: not in the manifest")
            continue
        p = current_path(t)
        if not p.exists():
            problems.append(f"{t}: the manifest lists r{m['revision']} and the file "
                            f"is missing")
            continue
        rows = read_jsonl_gz(p)
        sha, _ = sha_of_rows(rows)
        if len(rows) != m["rows"]:
            problems.append(f"{t}: {len(rows):,} rows on disk, manifest says "
                            f"{m['rows']:,}")
        if sha != m["sha256"]:
            problems.append(f"{t}: sha256 {sha[:16]} on disk, manifest says "
                            f"{m['sha256'][:16]}")
        scratch = _Path(tempfile.mkdtemp(prefix="corpus-vault-verify-"))
        try:
            con = sqlite3.connect(scratch / "v.sqlite")
            con.row_factory = sqlite3.Row
            con.execute(m["ddl"])
            n1, _, _ = restore_rows(con, t, rows, dry=False)
            back = rows_of(con, t)
            sha2, _ = sha_of_rows(back)
            n2, _, _ = restore_rows(con, t, rows, dry=False)
            con.close()
            if n1 != len(rows) or sha2 != sha or n2 != 0:
                problems.append(f"{t}: restoring the published file gave {n1:,} rows, "
                                f"hash {sha2[:16]}, +{n2} on re-run")
            print(f"  {t:<24} r{m['revision']}  {len(rows):,} rows  sha {sha[:16]}  "
                  f"restored {n1:,}, +{n2} on re-run  OK")
        finally:
            shutil.rmtree(scratch, ignore_errors=True)
    if problems:
        print("\nFAIL: the published vault does not verify\n")
        for p_ in problems:
            print(f"  - {p_}")
        return 1
    print("\nthe published vault restores, and matches its manifest.")
    return 0


def history(table: str | None) -> int:
    entries = log_lines()
    if not entries:
        print("no history yet")
        return 1
    for e in entries:
        if table and e.get("table") != table:
            continue
        rev = f"r{e['revision']}" if e.get("revision") else "-"
        extra = ""
        if e["outcome"] == "published":
            extra = (f"{e['rows']:,} rows  +{e['added']:,} -{e['removed']:,} "
                     f"~{e['changed']:,}"
                     + (f"  SHRINK ACK: {e['shrink_ack']}" if e.get("shrink_ack") else ""))
        elif e["outcome"] == "refused":
            extra = (f"{e['reason']} — kept r{e.get('kept_revision')} "
                     f"({e.get('kept_rows', '?')} rows)")
        elif e["outcome"] == "unchanged":
            extra = f"{e['rows']:,} rows"
        elif e["outcome"] == "proof_failed":
            extra = "; ".join(e.get("problems", []))
        print(f"  {e['at']}  {e['table']:<24} {e['outcome']:<12} {rev:<6} {extra}")
    return 0


def changed(table: str, a: int, b: int | None, limit: int) -> int:
    """The rows that differ between two revisions — the 'what changed between
    the 8th and the 9th' a dated-folder scheme cannot answer."""
    old = rows_at(table, a)
    new = rows_at(table, b)
    keys = IDENTITY[table]
    d = diff_rows(old, new, keys)
    nb = b if b is not None else head()["tables"][table]["revision"]
    print(f"{table}: r{a} ({len(old):,} rows) -> r{nb} ({len(new):,} rows)")
    print(f"  added {len(d['added']):,}   removed {len(d['removed']):,}   "
          f"changed {len(d['changed']):,}\n")
    idx_new = {tuple("" if r.get(c) is None else str(r[c]) for c in keys): r
               for r in new}
    for label, ks, src in (("+ added", d["added"], idx_new),
                           ("- removed", d["removed"], d["old"]),
                           ("~ changed", d["changed"], idx_new)):
        for k in sorted(ks)[:limit]:
            print(f"  {label} {k}  {canonical(src[k])[:200]}")
        if len(ks) > limit:
            print(f"  {label} ... and {len(ks) - limit:,} more")
    return 0


# ── verb: restore ──────────────────────────────────────────────────────────

def _ddl_at(table: str, rev: int | None) -> str | None:
    """The CREATE TABLE this table was snapshotted under, at that revision."""
    if rev is not None:
        for e in reversed(log_lines()):
            if e.get("table") == table and e.get("revision") == rev and e.get("ddl"):
                return e["ddl"]
    return head()["tables"].get(table, {}).get("ddl")


def restore(table: str, into: str, rev: int | None, dry: bool) -> int:
    rows = rows_at(table, rev)
    m = head()["tables"][table]
    shown = rev if rev is not None else m["revision"]
    print(f"{table} at r{shown}: {len(rows):,} rows -> {into}"
          + ("   (DRY RUN)" if dry else "") + "\n")
    tgt = sqlite3.connect(into)
    tgt.row_factory = sqlite3.Row
    if not has(tgt, table):
        # The vault carries the CREATE TABLE it snapshotted, so a restore into
        # an EMPTY store needs nothing from this repository. It is not
        # inventing a schema; it is replaying the one the rows were taken
        # under. This is not a nicety: migrations/apply.py has no --store
        # option and can only ever migrate data/db.sqlite, so a vault that
        # depended on it could not be restored into a fresh file at all.
        ddl = _ddl_at(table, rev)
        if not ddl:
            print(f"REFUSING: {into} has no table `{table}` and this vault "
                  f"revision recorded no CREATE TABLE for it. Re-run "
                  f"`snapshot` against a store that has the table, then "
                  f"restore — a restore must not guess a schema.")
            return 1
        print(f"  {into} had no `{table}`; creating it from the DDL recorded "
              f"with r{shown}:\n    {' '.join(ddl.split())[:160]}...")
        tgt.execute(ddl)
        tgt.commit()
    n, present, missing = restore_rows(tgt, table, rows, dry)
    print(f"  +{n:,} restored, {present:,} already present")
    if missing:
        print(f"  columns the target has no room for (NOT restored, run "
              f"migrations first): {missing}")
    if dry:
        tgt.rollback()
        print("\nDRY RUN — nothing written.")
    else:
        print(f"\n{n:,} row(s) restored. Nothing was updated and nothing deleted.")
        print(f"  run it again to confirm: it must say +0.")
    tgt.close()
    return 0


# ── verb: selftest — the disaster drill ────────────────────────────────────

def _fixture_store(path: _Path) -> sqlite3.Connection:
    """500 synthetic rows per table, for running the drill without the corpus.

    Deliberately NOT a copy of the real schema — it carries the table names and
    the identity columns, which is what the guard, the history and the restore
    actually operate on. Anything wider would be a second declaration of a
    schema that already has one, and would go stale.
    """
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    con.execute("CREATE TABLE company_sector_labels (name_key TEXT PRIMARY KEY, "
                "sector_top TEXT, method TEXT)")
    con.execute("CREATE TABLE public_funding_events (id INTEGER PRIMARY KEY "
                "AUTOINCREMENT, source TEXT NOT NULL, grant_amount_eur REAL)")
    con.executemany("INSERT INTO company_sector_labels VALUES (?,?,?)",
                    [(f"co_{i:05d}", "deeptech", "llm") for i in range(500)])
    con.executemany("INSERT INTO public_funding_events VALUES (?,?,?)",
                    [(i + 1, "eic_accelerator", 1_000_000.0 + i) for i in range(500)])
    con.commit()
    return con


def selftest() -> int:
    """Prove property 3 RED: build a store that is missing rows and a table,
    point the vault at it, and require a refusal.

    This is the July incident in miniature. It runs against a throwaway store
    and a throwaway vault, so it costs nothing and can be run any day."""
    global VAULT
    real_vault = VAULT
    tmp = _Path(tempfile.mkdtemp(prefix="corpus-vault-selftest-"))
    # Real rows where the corpus is present, a fixture where it is not, so this
    # runs in CI. A guard that only runs on the one laptop that holds the data
    # is the same single copy the backup is guarding against.
    live = _Path(DB).exists()
    src = ro(DB) if live else _fixture_store(tmp / "fixture.sqlite")
    print(f"source: {'the live corpus' if live else 'a synthetic fixture (no corpus here)'}")
    fails = []
    try:
        # A good store: a small but honest sample of both tables.
        good = tmp / "good.sqlite"
        g = sqlite3.connect(good)
        g.row_factory = sqlite3.Row
        for t in TABLES:
            _create_like(src, g, t)
            rows = [dict(r) for r in src.execute(f'SELECT * FROM "{t}" LIMIT 500')]
            restore_rows(g, t, rows, dry=False)
        g.close()

        VAULT = tmp / "vault"
        print("── 1. a good store is published ──────────────────────────────")
        rc = snapshot(str(good), {}, dry=False, keep_scratch=False)
        if rc != 0:
            fails.append("the good store was not published cleanly")
        base = head()
        if any(base["tables"][t]["rows"] != 500 for t in TABLES):
            fails.append("the good snapshot did not record 500 rows per table")

        # The disaster: rows deleted from one table, the other dropped
        # entirely — exactly the shape of db.sqlite.20260722.gz.
        print("\n── 2. THE DISASTER: 400 events deleted, labels table DROPPED ─")
        bad = tmp / "truncated.sqlite"
        shutil.copy(good, bad)
        b = sqlite3.connect(bad)
        b.execute("DELETE FROM public_funding_events WHERE id IN "
                  "(SELECT id FROM public_funding_events LIMIT 400)")
        b.execute("DROP TABLE company_sector_labels")
        b.commit()
        b.close()
        rc = snapshot(str(bad), {}, dry=False, keep_scratch=False)
        after = head()
        if rc == 0:
            fails.append("the truncated store did NOT make the run fail")
        for t in TABLES:
            if after["tables"][t]["rows"] != 500:
                fails.append(f"{t} was overwritten by the truncated store "
                             f"({after['tables'][t]['rows']} rows) — THE GUARD FAILED")
            if after["tables"][t]["revision"] != base["tables"][t]["revision"]:
                fails.append(f"{t} advanced a revision on a refused run")

        print("\n── 3. an acknowledged shrink IS allowed, and recorded ────────")
        rc = snapshot(str(bad),
                      {"public_funding_events": "selftest: deliberate truncation"},
                      dry=False, keep_scratch=False)
        ack = head()
        if ack["tables"]["public_funding_events"]["rows"] != 100:
            fails.append("an acknowledged shrink was still blocked")
        if ack["tables"]["company_sector_labels"]["rows"] != 500:
            fails.append("the DROPPED table was overwritten — absent is not empty")
        rec = [e for e in log_lines() if e.get("shrink_ack")]
        if not rec:
            fails.append("the acknowledgement was not recorded in the log")

        print("\n── 4. one step back returns the 400 deleted events ───────────")
        back = rows_at("public_funding_events", 1)
        if len(back) != 500:
            fails.append(f"stepping back gave {len(back)} rows, not 500")
        sha_back, _ = sha_of_rows(back)
        cur = ro(good)
        sha_orig, _ = sha_of_rows(rows_of(cur, "public_funding_events"))
        cur.close()
        if sha_back != sha_orig:
            fails.append("the reconstructed r1 does not hash equal to the original")

        print("\n── 5. restoring r1 into the truncated store puts them back ───")
        rc = restore("public_funding_events", str(bad), 1, dry=False)
        chk = sqlite3.connect(bad)
        n = chk.execute("SELECT COUNT(*) FROM public_funding_events").fetchone()[0]
        chk.close()
        if n != 500:
            fails.append(f"after restore the store holds {n} events, not 500")
        rc = restore("public_funding_events", str(bad), 1, dry=False)

        print("\n── 6. an EMPTY file, no schema, no repo: the vault rebuilds it ─")
        empty = tmp / "nothing.sqlite"
        sqlite3.connect(empty).close()
        restore("company_sector_labels", str(empty), None, dry=False)
        chk = sqlite3.connect(empty)
        n = chk.execute("SELECT COUNT(*) FROM company_sector_labels").fetchone()[0]
        chk.close()
        if n != 500:
            fails.append(f"restore into an empty file gave {n} labels, not 500")
    finally:
        VAULT = real_vault
        src.close()
        shutil.rmtree(tmp, ignore_errors=True)

    print("\n" + "─" * 62)
    if fails:
        print("SELFTEST FAILED — the guard does not hold:")
        for f in fails:
            print(f"  - {f}")
        return 1
    print("SELFTEST PASSED: a truncated source is refused, a dropped table does "
          "not overwrite a good one,\nan acknowledged shrink is allowed and "
          "logged, one step back is exact, and the restore is insert-only.")
    return 0


# ── verb: install-schedule ─────────────────────────────────────────────────

LABEL = "com.wincent.corpus-vault"


def plist_path() -> _Path:
    return _Path.home() / "Library" / "LaunchAgents" / f"{LABEL}.plist"


def install_schedule(hour: int, minute: int, repo: _Path, label: str = LABEL,
                     script: _Path | None = None) -> int:
    """A launchd LaunchAgent, because that is what macOS honours.

    Not `crontab -e`: a crontab installed inside an agent session dies with it,
    and /usr/sbin/cron on modern macOS additionally needs Full Disk Access
    granted to the cron binary before it can read a file under the user's
    home. launchd is the supported scheduler, runs in the logged-in user's
    session where iCloud Drive is mounted, and — the property that matters for
    a laptop that is asleep at 03:00 — runs a missed StartCalendarInterval job
    when the machine next wakes rather than skipping the day."""
    script = script or (repo / "ETL" / "events" / "load" / "corpus_vault.py")
    log = _Path.home() / "Library" / "Logs" / "wincent-corpus-vault.log"
    plist = {
        "Label": label,
        "ProgramArguments": [_sys.executable, str(script), "snapshot"],
        "WorkingDirectory": str(repo),
        "StartCalendarInterval": [{"Hour": hour, "Minute": minute}],
        "RunAtLoad": False,
        "StandardOutPath": str(log),
        "StandardErrorPath": str(log),
        "ProcessType": "Background",
        "LowPriorityIO": True,
        "EnvironmentVariables": {"PATH": os.environ.get("PATH", "/usr/bin:/bin")},
    }
    p = _Path.home() / "Library" / "LaunchAgents" / f"{label}.plist"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(plistlib.dumps(plist))
    uid = os.getuid()
    subprocess.run(["launchctl", "bootout", f"gui/{uid}/{label}"],
                   capture_output=True)
    r = subprocess.run(["launchctl", "bootstrap", f"gui/{uid}", str(p)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        print(f"launchctl bootstrap failed: {r.stderr.strip()}")
        return 1
    print(f"installed {p}")
    print(f"  runs   {_sys.executable} {script} snapshot")
    print(f"  daily at {hour:02d}:{minute:02d} local, and on the next wake if the "
          f"machine was asleep")
    print(f"  log    {log}")
    print(f"  check  launchctl print gui/{uid}/{label} | grep -E 'state|last exit'")
    print(f"  run it now: launchctl kickstart -k gui/{uid}/{label}")
    return 0


def uninstall_schedule(label: str = LABEL) -> int:
    uid = os.getuid()
    subprocess.run(["launchctl", "bootout", f"gui/{uid}/{label}"], capture_output=True)
    p = _Path.home() / "Library" / "LaunchAgents" / f"{label}.plist"
    p.unlink(missing_ok=True)
    print(f"removed {p}")
    return 0


# ── main ───────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="verb", required=True)

    s = sub.add_parser("snapshot", help="read the store, guard, prove, publish")
    s.add_argument("--store", default=str(DB))
    s.add_argument("--acknowledge-shrink", action="append", default=[],
                   metavar="TABLE=WHY",
                   help="allow this table to shrink, and record why")
    s.add_argument("--dry-run", action="store_true")
    s.add_argument("--keep-scratch", action="store_true",
                   help="keep the scratch store the proof restored into")

    st = sub.add_parser("status", help="what the vault holds and whether iCloud has it")
    st.add_argument("--brctl", action="store_true", help="also wait on iCloud sync")

    v = sub.add_parser("verify", help="re-prove the PUBLISHED vault by restoring it")
    v.add_argument("--table", choices=TABLES)

    h = sub.add_parser("history", help="every run, including refusals")
    h.add_argument("--table", choices=TABLES)

    c = sub.add_parser("changed", help="rows that differ between two revisions")
    c.add_argument("--table", choices=TABLES, required=True)
    c.add_argument("--from", dest="a", type=int, required=True)
    c.add_argument("--to", dest="b", type=int, default=None)
    c.add_argument("--limit", type=int, default=10)

    r = sub.add_parser("restore", help="ONE table, INSERT-ONLY, at any revision")
    r.add_argument("--table", choices=TABLES, required=True)
    r.add_argument("--into", required=True)
    r.add_argument("--at", type=int, default=None, help="revision (default: head)")
    r.add_argument("--dry-run", action="store_true")

    sub.add_parser("selftest", help="prove the shrink guard refuses")

    i = sub.add_parser("install-schedule")
    i.add_argument("--hour", type=int, default=13)
    i.add_argument("--minute", type=int, default=30)
    i.add_argument("--repo", default=str(ROOT))
    i.add_argument("--label", default=LABEL)
    i.add_argument("--script", default=None)
    sub.add_parser("uninstall-schedule").add_argument("--label", default=LABEL)

    a = ap.parse_args()
    if a.verb == "snapshot":
        acks = {}
        for spec in a.acknowledge_shrink:
            if "=" not in spec:
                ap.error("--acknowledge-shrink takes TABLE=WHY")
            t, why = spec.split("=", 1)
            if t not in TABLES:
                ap.error(f"unknown table {t}")
            acks[t] = why
        return snapshot(a.store, acks, a.dry_run, a.keep_scratch)
    if a.verb == "status":
        return status(a.brctl)
    if a.verb == "verify":
        return verify(a.table)
    if a.verb == "history":
        return history(a.table)
    if a.verb == "changed":
        return changed(a.table, a.a, a.b, a.limit)
    if a.verb == "restore":
        return restore(a.table, a.into, a.at, a.dry_run)
    if a.verb == "selftest":
        return selftest()
    if a.verb == "install-schedule":
        return install_schedule(a.hour, a.minute, _Path(a.repo), a.label,
                                _Path(a.script) if a.script else None)
    return uninstall_schedule(a.label)


if __name__ == "__main__":
    raise SystemExit(main())
