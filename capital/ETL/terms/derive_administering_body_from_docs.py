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
# The one EU legal form that LEADS with its type rather than trailing it. It has
# to allow the same lowercase connectors NAME_WORD already allows, because the
# registered names actually take them -- "European Union Agency for *the* Space
# Programme". Requiring capitals throughout stopped this pattern at "for ", so
# the agency shape was effectively unmatchable whenever a name contained an
# article, which is most of them.
OPENER_RE = re.compile(rf"European Union Agency for (?:{NAME_WORD}\s+){{0,4}}"
                       rf"[A-Z][\w'’-]*")

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
        # The leading-form shape needs the mirror image of the suffix trick.
        # Prose can only run off a trailing-form name's LEFT edge, so suffixes
        # are scored above; it can only run off a leading-form name's RIGHT edge
        # ("European Union Agency for the Space Programme *Regulation*"), so
        # here the PREFIXES are scored, which makes reach monotone in the same
        # direction and lets the same knee rule find where the name ends.
        # A prefix must stop on a capitalised word: "... Agency for the" is a
        # sentence fragment, never a registered name.
        # A leading-form name identifies nobody until it reaches its DOMAIN --
        # "European Union Agency" is a legal form, not an agency -- so prefixes
        # shorter than one word past "for" are not names and are not scored.
        for m in OPENER_RE.finditer(page):
            words = m.group(0).split()
            head = words.index("for") + 1
            for k in range(len(words), head, -1):
                if not words[k - 1][:1].isupper():
                    continue
                # A leading-form name ends where prose begins, so its last word
                # is the one that gets INFLECTED -- "the Space Programme's
                # mission". Left as-is that page scores a different name, and
                # the true name silently loses reach to its own possessive.
                # A trailing-form name never has this problem: its right edge is
                # the fixed legal form. Strip the possessive, nothing else.
                tail = re.sub(r"[’']s$", "", words[k - 1])
                name = normalise(" ".join(words[:k - 1] + [tail]))
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
    # The knee: longest name still within TOLERANCE of the maximum reach -- but
    # never below MIN_PAGES while a name at or above it exists.
    #
    # Without that floor the knee can hand the answer to a name that could not
    # have been the answer. In `ihi_guide_for_applicants.pdf` the best reach is
    # 2, held by "Innovative Health Initiative Joint Undertaking"; TOLERANCE
    # then admitted "Introduction The Innovative Health Initiative Joint
    # Undertaking" at reach 1 purely for being longer, and that winner promptly
    # failed the MIN_PAGES test and abstained. The correct name lost to a
    # sentence that happened to wrap it. This fires whenever a body's reach sits
    # at or just above the floor, which is the normal case in a short document.
    floor = max(best - TOLERANCE, MIN_PAGES) if best >= MIN_PAGES else best - TOLERANCE
    top = max((n for n in pages if reach[n] >= floor),
              key=lambda n: (len(n.split()), reach[n]))
    # The strongest name that is NOT a rendering of the winner. A trailing-form
    # name grows leftwards and a leading-form name grows rightwards, so BOTH
    # containments mean "the same body under a longer or shorter rendering";
    # only a name sharing neither edge is a genuinely different body.
    lo = top.lower()

    def same_body(n: str) -> bool:
        x = n.lower()
        return (n == top
                or lo.endswith(" " + x) or x.endswith(" " + lo)     # suffix form
                or lo.startswith(x + " ") or x.startswith(lo + " "))  # opener form

    rival = max((reach[n] for n in pages if not same_body(n)), default=0)
    board = sorted(reach.items(), key=lambda kv: -kv[1])[:4]
    if reach[top] < MIN_PAGES or reach[top] < MARGIN * rival:
        return None, reach[top], rival, board
    return top, reach[top], rival, board


def docs_named_for(ids: list[str]) -> dict[str, list[str]]:
    """Documents the corpus filed under an instrument's own name.

    Citation tables were the only notion of "this instrument's document", and
    they are a PROXY: a file is visible here only if some gate or clause happened
    to be cut from it. That misses the case this exists for. `sesar_ju`'s
    Governing-Board-adopted work programme has been in the corpus since July;
    the grounding pass cut its gates from the call Q&A instead (correctly -- the
    work programme carries almost no eligibility text), so nothing cited the work
    programme and nothing could read the JU's own name off it. The Q&A writes
    "SESAR 3 JU" throughout and never spells the legal form out, so the instrument
    abstained while the answer sat on disk.

    The corpus already names its documents `<instrument_id>_<descriptor>.<ext>`.
    That convention is evidence on the filesystem, not a curated map: it cannot
    rot out of sync with a register nobody maintains, and it works for a regime
    no one has touched.

    The LONGEST matching id wins, so `eit_urban_mobility_portfolio_page.html`
    belongs to `eit_urban_mobility_portfolio` and not to its parent
    `eit_urban_mobility`. Most specific wins, as everywhere else here.
    """
    out: dict[str, list[str]] = {i: [] for i in ids}
    if not DOCS.exists():
        return out
    for p in sorted(DOCS.iterdir()):
        if p.is_dir() or p.suffix.lower() not in (".pdf", ".html", ".htm", ".txt"):
            continue
        owner = max((i for i in ids if p.name.startswith(i + "_")),
                    key=len, default=None)
        if owner:
            out[owner].append(p.name)
    return out


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

    cited = sources_for(pg, list(leaves))
    named = docs_named_for(list(leaves))
    srcs = {i: cited[i] + [d for d in named[i] if d not in cited[i]] for i in leaves}
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
