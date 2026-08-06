"""Read each instrument's administering body out of the instrument's OWN document.

── Why this exists ────────────────────────────────────────────────────────
`administering_body` is the single strongest separator in the corpus: measured
across the multi-leaf regimes it cuts the sibling class further than the
verbatim eligibility text does, and it is one short string per row. Whole
regimes sit at NULL for it while their source documents, already on disk, name
the awarding body on their front matter.

The obvious way to fill it is a hand-written map of instrument id -> body name.
That is a register: it is unverifiable, it rots silently, and it cannot be run
against a regime nobody has curated. So instead this derives the name from the
document the instrument's own gates were cut from, and refuses any name it
cannot attest there.

── The property ───────────────────────────────────────────────────────────
The awarding body of an EU-level instrument is a legal person, and EU legal
persons carry their legal form in their name -- "... Joint Undertaking",
"... Executive Agency", "European Union Agency for ...". So: scan the
instrument's own document for names in that shape, and take the one it uses
most. A predecessor body (Shift2Rail, IMI2) is mentioned once or twice in a
recital; the body actually running the programme is mentioned throughout, so
frequency separates them without anyone naming them.

Nothing here knows a fund, a country or a scheme code. A regime it has never
seen resolves or abstains on its own evidence.

Usage:
  python3 ETL/terms/derive_administering_body_from_docs.py --regime horizon_eu_partnership
  python3 ETL/terms/derive_administering_body_from_docs.py --regime X --write --postgres
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DATA_RAW, DB  # noqa: E402
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import shutil  # noqa: E402
import sqlite3  # noqa: E402
import subprocess  # noqa: E402
from collections import Counter, defaultdict  # noqa: E402

import psycopg2  # noqa: E402

DOCS = _Path(DATA_RAW) / "instrument_docs"

# The legal forms an EU-level awarding body's registered name ends in or opens
# with. This is a statement about how EU bodies are named, not a list of bodies.
FORMS = r"(?:Joint Undertaking|Executive Agency)"
# A registered name runs up to MAX_NAME_WORDS words into its legal form, and may
# carry lowercase connectors inside it ("Smart Networks *and* Services JU").
NAME_WORD = r"(?:[A-Z0-9][\w'’.&-]*|and|of|for|the|in)"
MAX_NAME_WORDS = 7
BODY_RE = re.compile(rf"((?:{NAME_WORD}\s+){{1,{MAX_NAME_WORDS}}})({FORMS})")
# The one EU legal form that leads with its type rather than trailing it.
OPENER_RE = re.compile(r"European Union Agency for (?:[A-Z][\w'’-]*\s*){1,5}")

# Shapes a registered name never takes. A match can only run PROSE into its left
# edge, never its right, so these reject the prefix, never the name: a name does
# not begin lowercase or with a figure, does not contain the phrase "of the",
# and does not contain its own legal form twice ("... JU Joint Undertaking").
REJECT = (
    re.compile(r"^[a-z0-9]"),
    re.compile(r"\bof the\b"),
    re.compile(rf"{FORMS}.*{FORMS}"),
)
# One word of name in front of the two-word legal form is the minimum that
# identifies anybody.
MIN_WORDS = 3

# ── Scoring ────────────────────────────────────────────────────────────────
# NOT raw frequency. A partner or a predecessor can be named many times in one
# passage -- the Horizon work programme mentions the European Space Agency seven
# times on two pages, and frequency alone made that the "administering body" of
# an EU space instrument. The body that RUNS a programme recurs in its running
# heads and across its sections, so the honest signal is how many distinct pages
# a name reaches.
#
# Every suffix of every match is scored, which makes reach monotone: a shorter
# name reaches at least every page its extensions do. "Hydrogen Joint
# Undertaking" therefore always beats "Clean Hydrogen Joint Undertaking" on
# reach, and picking the maximum alone would truncate every name it found. So
# the answer is the LONGEST name still at (or one page off) the maximum -- the
# knee of that monotone curve, which is exactly where prose stops and the
# registered name begins.
TOLERANCE = 1
# A body that runs a programme is named on more than one page. Without this a
# 315-page work programme that mentions some unrelated JU once "resolves" to it,
# because one hit out of one is a clean sweep of a population of one.
MIN_PAGES = 2
# And the winner must out-reach the best name that is NOT one of its own
# suffixes -- a genuinely different body -- by this factor.
MARGIN = 1.5


def env() -> None:
    root = _Path(__file__).resolve()
    while root.parent != root and not (root / ".env.local").exists():
        root = root.parent
    for line in (root / ".env.local").read_text().splitlines():
        m = re.match(r"^([A-Z_]+)=(.*)$", line)
        if m:
            os.environ.setdefault(m.group(1), m.group(2).strip().strip("\"'"))


def doc_text(name: str) -> str:
    p = DOCS / name
    if not p.exists():
        return ""
    if p.suffix.lower() == ".pdf":
        if not shutil.which("pdftotext"):
            return ""
        r = subprocess.run(["pdftotext", "-layout", str(p), "-"],
                           capture_output=True, text=True)
        return r.stdout
    return p.read_text(errors="replace")


def normalise(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip().replace("’", "'")


def _ok(name: str) -> bool:
    return (len(name.split()) >= MIN_WORDS
            and not any(r.search(name) for r in REJECT))


def candidates(text: str) -> dict[str, set[int]]:
    """name -> the pages it appears on, for EVERY suffix of every match.

    Scoring suffixes rather than whole matches is what makes prose harmless:
    "Governance of the Clean Aviation Joint Undertaking" contributes a page to
    "Clean Aviation Joint Undertaking" as well as to itself, so the registered
    name accumulates the reach of every sentence that ever wrapped it.
    """
    pages: dict[str, set[int]] = defaultdict(set)
    for pi, page in enumerate(text.split("\f")):
        for m in BODY_RE.finditer(page):
            words = m.group(1).split()
            for k in range(len(words)):
                name = normalise(" ".join(words[k:]) + " " + m.group(2))
                if _ok(name):
                    pages[name].add(pi)
        for m in OPENER_RE.finditer(page):
            name = normalise(m.group(0))
            if _ok(name):
                pages[name].add(pi)
    return pages


def derive(text: str):
    """(body, its page reach, rival reach, the leaderboard) or (None, ...)."""
    pages = candidates(text)
    if not pages:
        return None, 0, 0, []
    reach = {n: len(p) for n, p in pages.items()}
    best = max(reach.values())
    # The knee: longest name still within TOLERANCE of the maximum reach.
    top = max((n for n in pages if reach[n] >= best - TOLERANCE),
              key=lambda n: (len(n.split()), reach[n]))
    # The strongest name that is NOT a rendering of the winner. Suffix or
    # extension of the winner means the same body; anything else is a rival.
    lo = top.lower()
    rival = max((reach[n] for n in pages
                 if not (lo.endswith(" " + n.lower()) or n.lower().endswith(" " + lo)
                         or n == top)), default=0)
    board = sorted(reach.items(), key=lambda kv: -kv[1])[:4]
    if reach[top] < MIN_PAGES or reach[top] < MARGIN * rival:
        return None, reach[top], rival, board
    return top, reach[top], rival, board


def sources_for(pg, ids: list[str]) -> dict[str, list[str]]:
    cur = pg.cursor()
    out: dict[str, list[str]] = {i: [] for i in ids}
    for table, col in (("eligibility_gates", "source_file"),
                       ("eligibility_clauses", "source_file"),
                       ("instrument_application", "source_file")):
        cur.execute(f"SELECT DISTINCT instrument_id, {col} FROM {table} "
                    f"WHERE instrument_id = ANY(%s) AND {col} IS NOT NULL", (ids,))
        for iid, sf in cur.fetchall():
            if sf not in out[iid]:
                out[iid].append(sf)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--regime", action="append", required=True,
                    help="parent_id whose leaves to resolve")
    ap.add_argument("--write", action="store_true", help="write SQLite")
    ap.add_argument("--postgres", action="store_true",
                    help="mirror the same rows to Postgres (what the product reads)")
    ap.add_argument("--overwrite", action="store_true",
                    help="replace an administering_body that is already set")
    args = ap.parse_args()

    env()
    pg = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = pg.cursor()
    cur.execute("SELECT id, name, administering_body FROM funding_instruments "
                "WHERE COALESCE(parent_id, id) = ANY(%s) AND parent_id IS NOT NULL",
                (args.regime,))
    leaves = {r[0]: {"name": r[1], "body": r[2]} for r in cur.fetchall()}
    if not leaves:
        print("no leaves for that regime")
        return

    srcs = sources_for(pg, list(leaves))
    resolved: list[tuple[str, str]] = []
    for iid in sorted(leaves):
        if leaves[iid]["body"] and not args.overwrite:
            print(f"  skip  {iid:<20} already set: {leaves[iid]['body']}")
            continue
        text = "\n".join(doc_text(s) for s in srcs.get(iid) or [])
        if not text.strip():
            print(f"  ABSTAIN {iid:<18} no readable source document "
                  f"({srcs.get(iid) or 'none recorded'})")
            continue
        body, n, total, runners = derive(text)
        if not body:
            print(f"  ABSTAIN {iid:<18} no dominant body name; top: {runners}")
            continue
        print(f"  {iid:<20} -> {body}   ({n}/{total} mentions, "
              f"src {', '.join(srcs[iid])})")
        resolved.append((iid, body))

    print(f"\nresolved {len(resolved)} of {len(leaves)} leaves")
    if not args.write:
        print("[dry run] nothing written -- pass --write (and --postgres)")
        return

    sq = sqlite3.connect(DB)
    sq.executemany("UPDATE funding_instruments SET administering_body = ? WHERE id = ?",
                   [(b, i) for i, b in resolved])
    sq.commit()
    sq.close()
    print(f"sqlite: {len(resolved)} rows")

    if args.postgres:
        cur.executemany("UPDATE funding_instruments SET administering_body = %s "
                        "WHERE id = %s", [(b, i) for i, b in resolved])
        pg.commit()
        print(f"postgres: {cur.rowcount if cur.rowcount >= 0 else len(resolved)} rows "
              f"(this is the one the product reads)")
    else:
        print("postgres: NOT written. SQLite alone changes nothing a founder sees.")
    pg.close()


if __name__ == "__main__":
    main()
