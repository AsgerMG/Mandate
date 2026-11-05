"""Reproduce every corpus figure in `project-mgmt/findings/gate_divergence_wsHC.md`.

FREE. READ-ONLY — the SQLite store is opened `mode=ro` and Postgres is only ever
SELECTed. No model call, no write, no publish.

Four questions, one per mode:

  cohorts      When was each gate written, and where does it exist? The census
               says the volume holds 6,401 gates and the laptop 9,763; this
               dates the difference by `eligibility_gates.created_at` and names
               the encoding methods behind it.
  cost         What would the record's own contents do to the product? The
               leaf/sibling separation table in §2 and the axis-headroom figure
               in §3(a).
  history      Every census ever taken, by store, with the code fingerprint —
               the table in §1 that shows censuses #9 and #10 five hours apart
               on the SAME fingerprint, 1,070 gates apart.
  fingerprint  Which commit is the Railway container running? Reproduces
               `publish_corpus_census.code_fingerprint()` over git history
               without checking anything out. The reimplementation is validated
               by reproducing HEAD's own fingerprint, which it prints first.

── The one caveat that matters, stated where it is used ───────────────────
`created_at` records when a ROW was written, not what it CONTAINED then.
`apply_gate_encoding_corrections.py` has since edited older rows in place, so a
cutoff rebuilds the row SET of an earlier moment and not its contents. The
`cost` mode prints its own control for this: the no-cutoff eligibility axis
against what census #9 actually recorded. Read the reconstructions as +/- 20.

Usage:
  python3 ETL/terms/_wshc_gate_cohorts.py cohorts
  python3 ETL/terms/_wshc_gate_cohorts.py cost
  python3 ETL/terms/_wshc_gate_cohorts.py history      # needs DATABASE_URL
  python3 ETL/terms/_wshc_gate_cohorts.py fingerprint [--limit 400]
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402

import argparse  # noqa: E402
import collections  # noqa: E402
import hashlib  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402
import subprocess  # noqa: E402

# coverage_report.EVALUABLE, which is the definition the six axes and the read
# path both use. Restated here rather than imported only because this script
# must be runnable against a store without importing the report's whole build.
EVALUABLE = ("value_spec IS NOT NULL AND value_spec != '' "
             "AND (gate_role IS NULL OR gate_role = 'filter')")

# The two encoding sessions the corpus of record never received. Boundaries are
# UTC, which is what CURRENT_TIMESTAMP writes: the session a human ran on the
# evening of 2026-08-08 CEST spans midnight and lands in both dates.
SHARED_BEFORE = "2026-08-08"   # rows every store has
SESSION_TWO = "2026-08-10"     # rows before this but after SHARED_BEFORE = session 1


def _ro() -> sqlite3.Connection:
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    return con


def cmd_cohorts() -> None:
    con = _ro()
    print(f"store: local sqlite {DB} (mode=ro)\n")
    print("gates by the day they were written (UTC):")
    for r in con.execute("SELECT date(created_at) d, COUNT(*) n FROM eligibility_gates "
                         "GROUP BY 1 ORDER BY 1"):
        print(f"  {r['d']}  {r['n']:>5}")

    print("\ncohorts, and where each exists:")
    print(f"  {'cohort':34} {'rows':>6} {'insts':>6} {'evaluable':>10} {'cited':>7}")
    buckets = [
        (f"A: before {SHARED_BEFORE} (all stores)", f"created_at < '{SHARED_BEFORE}'"),
        ("B: 08-08/09 session (not on volume)",
         f"created_at >= '{SHARED_BEFORE}' AND created_at < '{SESSION_TWO}'"),
        ("C: 08-12 session (not on volume)", f"created_at >= '{SESSION_TWO}'"),
        ("total in this store", "1=1"),
    ]
    for label, where in buckets:
        r = con.execute(
            f"SELECT COUNT(*) n, COUNT(DISTINCT instrument_id) i,"
            f" SUM(CASE WHEN {EVALUABLE} THEN 1 ELSE 0 END) ev,"
            f" SUM(CASE WHEN verification_level IN "
            f"     ('llm_cited','llm_2pass','human_verified') THEN 1 ELSE 0 END) c"
            f" FROM eligibility_gates WHERE {where}").fetchone()
        print(f"  {label:34} {r['n']:>6} {r['i']:>6} {r['ev'] or 0:>10} {r['c'] or 0:>7}")

    print("\nhow the unpromoted rows were produced:")
    for r in con.execute(
            f"SELECT COALESCE(encoding_method,'(none)') m, COUNT(*) n"
            f"  FROM eligibility_gates WHERE created_at >= '{SHARED_BEFORE}'"
            f" GROUP BY 1 ORDER BY n DESC"):
        print(f"  {r['m']:24} {r['n']:>5}")
    con.close()


def _publishable(con: sqlite3.Connection) -> tuple[list[str], dict[str, str | None]]:
    """The rows the product can offer: leaves that are not framework placeholders.
    Same test coverage_report.build() applies before scoring the six axes."""
    rows = list(con.execute("SELECT id, parent_id, is_framework FROM funding_instruments"))
    parent = {r["id"]: r["parent_id"] for r in rows}
    has_children = {p for p in parent.values() if p}
    frameworks = {r["id"] for r in rows if r["is_framework"]}
    return ([r["id"] for r in rows
             if r["id"] not in has_children and r["id"] not in frameworks], parent)


def _evaluable_by_instrument(con, cutoff: str | None) -> dict[str, set[str]]:
    sql = f"SELECT instrument_id, gate_key FROM eligibility_gates WHERE {EVALUABLE}"
    if cutoff:
        sql += f" AND created_at < '{cutoff}'"
    out: dict[str, set[str]] = collections.defaultdict(set)
    for r in con.execute(sql):
        out[r["instrument_id"]].add(r["gate_key"])
    return out


def _eligibility_axis(con, publishable, parent, cutoff: str | None) -> int:
    """coverage_report.build()'s `eligibility` axis: n_eval >= 2, with one level
    of parent inheritance where the parent holds a key the child does not."""
    own: dict[str, set[str]] = collections.defaultdict(set)
    n_eval: collections.Counter = collections.Counter()
    sql = (f"SELECT instrument_id, gate_key, CASE WHEN {EVALUABLE} THEN 1 ELSE 0 END ev"
           f"  FROM eligibility_gates")
    if cutoff:
        sql += f" WHERE created_at < '{cutoff}'"
    for r in con.execute(sql):
        own[r["instrument_id"]].add(r["gate_key"])
        if r["ev"]:
            n_eval[r["instrument_id"]] += 1
    for iid, pid in parent.items():
        if pid and (own.get(pid, set()) - own.get(iid, set())):
            n_eval[iid] += n_eval.get(pid, 0)
    return sum(1 for i in publishable if n_eval[i] >= 2)


def cmd_cost() -> None:
    con = _ro()
    publishable, parent = _publishable(con)
    kids: dict[str, set[str]] = collections.defaultdict(set)
    for iid, pid in parent.items():
        if pid:
            kids[pid].add(iid)
    leaves = set(publishable)

    print(f"store: local sqlite {DB} (mode=ro)")
    print(f"population: {len(publishable)} publishable instruments\n")

    print(f"  {'gates present':34} {'leaves with >=1 evaluable':>26} "
          f"{'sibling groups separated':>26}")
    for label, cutoff in (("today, every row in this store", None),
                          (f"only rows before {SHARED_BEFORE}", SHARED_BEFORE)):
        ev = _evaluable_by_instrument(con, cutoff)
        with_ev = sum(1 for i in publishable if ev.get(i))
        groups = sep = members = sep_members = 0
        for pid, children in kids.items():
            ch = [x for x in children if x in leaves]
            if len(ch) < 2:
                continue
            groups += 1
            members += len(ch)
            if len({frozenset(ev.get(x, set())) for x in ch}) > 1:
                sep += 1
                sep_members += len(ch)
        print(f"  {label:34} {with_ev:>26} {f'{sep} / {groups}':>26}"
              f"   ({sep_members}/{members} leaves)")

    print("\nthe eligibility axis under the same cutoffs (n_eval >= 2):")
    for label, cutoff in (("every row (CONTROL: census #9 recorded 937)", None),
                          ("without the 08-12 session", SESSION_TWO),
                          (f"without both sessions (~the record)", SHARED_BEFORE)):
        print(f"  {label:44} {_eligibility_axis(con, publishable, parent, cutoff):>5}")
    print("  the control differs from census #9 because a created_at cutoff rebuilds")
    print("  which rows existed, not what they held; read these as +/- 20.")

    depth: collections.Counter = collections.Counter()
    for r in con.execute(f"SELECT instrument_id FROM eligibility_gates WHERE {EVALUABLE}"):
        depth[r["instrument_id"]] += 1
    total = sum(depth.values())
    headroom = sum(max(0, v - 2) for v in depth.values())
    print(f"\nwhat the axis cannot see, because a boolean saturates:")
    print(f"  evaluable rows, directly attached          {total:>6}")
    print(f"  sitting above the axis threshold of 2      {headroom:>6}  "
          f"({100 * headroom / total:.0f}%)")
    print(f"  instruments carrying more than two         "
          f"{sum(1 for v in depth.values() if v > 2):>6} of {len(depth)}")
    print("  -> deletable with the `eligibility` axis unmoved. A lower bound:")
    print("     parent inheritance gives children more slack still.")
    con.close()


def _load_env() -> None:
    env = ROOT / ".env.local"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        m = re.match(r"^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*)$", line)
        if m:
            os.environ.setdefault(m.group(1), m.group(2).strip().strip('"').strip("'"))


def cmd_history() -> None:
    _load_env()
    url = os.environ.get("DATABASE_URL")
    if not url:
        _sys.exit("DATABASE_URL not set — the census table is the per-store history "
                  "and there is no other copy of it.")
    import psycopg  # noqa: PLC0415

    print(f"{'id':>3} {'taken_at':16} {'produced_by':16} {'store':14} "
          f"{'fingerprint':17} {'inst':>5} {'gates':>6} {'fw':>3} {'roots':>5} gate  run")
    with psycopg.connect(url) as con:
        for r in con.execute(
                "SELECT id, taken_at, produced_by, store, code_fingerprint, instruments,"
                "       gate->>'ok' AS ok, run_outcome"
                "  FROM corpus_census ORDER BY id"):
            i = r[5] or {}
            print(f"{r[0]:>3} {r[1]:%Y-%m-%d %H:%M} {(r[2] or ''):16.16} "
                  f"{(r[3] or ''):14.14} {(r[4] or ''):17.17} "
                  f"{str(i.get('total', '-')):>5} {str(i.get('gates', '-')):>6} "
                  f"{str(i.get('frameworks', '-')):>3} {str(i.get('roots', '-')):>5} "
                  f"{str(r[6]):5} {r[7]}")


def cmd_fingerprint(limit: int) -> None:
    """`publish_corpus_census.code_fingerprint()` over history, from git objects.

    Reads blobs rather than checking anything out, and caches content hashes by
    blob id — the naive version takes minutes per hundred commits. It prints
    HEAD's fingerprint first, which is the validation: if that does not match
    what `publish_corpus_census.py --fingerprint` reports, nothing below means
    anything.
    """
    def git(*a: str) -> bytes:
        return subprocess.run(["git", "-C", str(ROOT), *a],
                              capture_output=True, check=True).stdout

    cache: dict[str, bytes] = {}

    def content_sha(blob: str) -> bytes:
        if blob not in cache:
            cache[blob] = hashlib.sha256(git("cat-file", "blob", blob)).digest()
        return cache[blob]

    def fingerprint(rev: str) -> str:
        tree: dict[str, str] = {}
        for line in git("ls-tree", "-r", rev).decode().splitlines():
            meta, name = line.split("\t", 1)
            _, typ, blob = meta.split()
            if typ == "blob":
                tree[name] = blob
        h = hashlib.sha256()
        # The same two trees FINGERPRINTED names, walked in the same order:
        # relative path bytes then the sha256 of the content.
        for base in ("ETL", "website/build"):
            for name in sorted(k for k in tree
                               if k.startswith(base + "/") and k.endswith(".py")):
                h.update(name.encode())
                h.update(content_sha(tree[name]))
        return h.hexdigest()[:16]

    mine = subprocess.run(
        [_sys.executable, str(ROOT / "ETL/events/load/publish_corpus_census.py"),
         "--fingerprint"], capture_output=True, text=True).stdout.strip()
    print(f"HEAD, by the real implementation:  {mine}")
    print(f"HEAD, by this reimplementation:    {fingerprint('HEAD')}"
          f"   {'(match)' if mine == fingerprint('HEAD') else '(DIFFERENT — stop)'}\n")

    seen: dict[str, str] = {}
    for line in git("log", "--format=%H|%ad|%s", "--date=format:%m-%d %H:%M",
                    f"-{limit}", "HEAD").decode().strip().splitlines():
        sha, when, subject = line.split("|", 2)
        fp = fingerprint(sha)
        if fp not in seen:
            seen[fp] = f"{sha[:9]} {when} {subject[:64]}"
            print(f"{fp}  newest at  {seen[fp]}")
    print(f"\n{len(seen)} distinct fingerprint(s) over the last {limit} commits. A census's"
          f"\nfingerprint identifies the newest commit carrying it.")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("mode", choices=("cohorts", "cost", "history", "fingerprint"))
    ap.add_argument("--limit", type=int, default=400,
                    help="how many commits back to fingerprint")
    args = ap.parse_args()
    {"cohorts": cmd_cohorts, "cost": cmd_cost, "history": cmd_history,
     "fingerprint": lambda: cmd_fingerprint(args.limit)}[args.mode]()


if __name__ == "__main__":
    main()
