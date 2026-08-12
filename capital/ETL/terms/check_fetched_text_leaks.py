"""Does a batch of freshly fetched scheme text contain the answer key?

── Why this exists next to check_recall_leaks.ts and not instead of it ─────
`check_recall_leaks.ts` asks the question the other way round: it reads the
COMMITTED `profileLeakIndex.generated.json` and checks whether any recall
description sits inside a fund's profile text. That artifact is built from
`instrument_profiles.profile_text`, which is rebuilt by
`build_instrument_profiles.py` from `description` among other columns.

So immediately after a fetch, and BEFORE that rebuild, the committed index does
not contain the new prose, and the TypeScript check reads green over text
nobody has examined. It is not wrong; it is answering about the corpus of the
last rebuild. This asks about the text in hand:

  a fetched description must be a statement the FUNDER could have written
  without knowing which company won, and must not contain a test query.

Three tests, the same three the shipped check runs, on the new strings:

  containment   a recall description sits verbatim inside the fetched text.
  8-gram        the two share an eight-word run. Long enough that independent
                texts do not share one by chance, short enough to catch a
                quotation with a word changed. GRAM is imported, never restated.

                BOTH ARE SCOPED TO THE FUND THE FOUNDER WON, OR ITS SIBLINGS,
                which is the scope `recallLeaks.ts` uses and it is not a
                weakening. A leak is a query that carries its own answer, so the
                two strings have to be about the SAME fund for the overlap to
                mean anything. Unscoped, the test fires on shared administrative
                boilerplate and nothing else: over the text already in the
                corpus it returned twelve hits, of which the largest class was
                "de la recherche du developpement et de l" -- eight French
                function words, shared by a fetched ministry description and a
                founder who won a different regional authority's row. A guard
                whose output is mostly noise is a guard that gets waived.
                Siblings are in scope because a sibling shares the scheme name
                and a description sitting in one hands REGIME@5 for free.
  own titles    the fetched text contains one of the instrument's own award
                titles -- `sample_project_titles`, the field deliberately kept
                out of both the Postgres select and the JSON export. A funder
                page's "projects we funded" section IS the answer key, and it
                is one copy-paste away from the description field.

                WITH ONE EXCLUSION, AND IT IS A PROPERTY RATHER THAN A LIST.
                An award title that MOST of an instrument's awards carry is the
                instrument's own label, not a project: under a tax-credit
                scheme every award is titled with the statute. Requiring a
                fund's description not to contain the fund's own name is a rule
                no fetched description could satisfy, and it hides nothing --
                the name is on the row already. `recall_guards` measures the
                same separation as `instrument_share` (genuine consortium
                projects at 0.07, scheme names at 1.000); the corpus's standing
                answer to it per instrument family is
                `data/instrument_title_kind.json`, and a family absent from
                that artifact is assumed to title by PROJECT, which is the
                strict direction. Measured on found_IT.json: 7 hits, all 7 on
                `satr_it_rnd`, which that artifact already calls `scheme`.

Normalisation is `squash` from recall_guards, imported for the reason that
module's own docstring gives: two copies of a leak guard drift, and the copy
that drifts is the one that silently stops catching things.

DELIBERATELY NOT A CI STEP. It reads `data/raw/scheme_enrichment/found_*.json`,
which is gitignored, and no CI step may depend on gitignored data. It is run by
whoever fetched, after every batch, before the load.

  python3 ETL/terms/check_fetched_text_leaks.py --file found_EU_wsEO.json
  python3 ETL/terms/check_fetched_text_leaks.py --since 2026-08-11
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
import json  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402

from recall_guards import GRAM, _grams, squash  # noqa: E402

SRC = ROOT / "data" / "raw" / "scheme_enrichment"
RECALL_DIR = ROOT / "website" / "frontend" / "lib" / "intelligence"
#: Below this a shared run is a coincidence of administrative boilerplate, not a
#: quotation. Same floor the recall guards use for "is this prose at all".
MIN_QUERY = 80


#: The set every number quoted today is measured on. Read from `recallSet.ts`
#: rather than named here, so retiring a set moves this with it.
def active_set() -> str:
    src = (RECALL_DIR.parent.parent / "scripts" / "recallSet.ts").read_text()
    m = re.search(r'ACTIVE_RECALL_SET\s*=\s*"([^"]+)"', src)
    if not m:
        raise SystemExit("could not read ACTIVE_RECALL_SET from scripts/recallSet.ts")
    return m.group(1)


def recall_descriptions() -> list[tuple[str, str, str, bool]]:
    """(company, won instrument, squashed description, is_active) over EVERY set.

    Every set on disk and not just the active one, for the reason
    `emit_profile_leak_index.py` gives: a retired set is still quoted in
    findings, and a number that was inflated by a leak stays inflated.

    But a hit is only a BUILD FAILURE on the active set, and that split is the
    difference between a guard people read and a guard people waive. A retired
    row can no longer inflate anything that runs; its hit is a fact about a
    finding already written, and it is reported as a warning with its count.
    """
    active = active_set()
    out: list[tuple[str, str, str, bool]] = []
    for f in sorted(RECALL_DIR.glob("__recallSet*.json")):
        try:
            rows = json.loads(f.read_text())
        except Exception:
            continue
        for r in rows if isinstance(rows, list) else []:
            d = (r.get("description") or "").strip()
            if len(d) >= MIN_QUERY:
                out.append((r.get("name", "?"), r.get("instrument", "?"),
                            squash(d), f.name == active))
    return out


TITLE_KIND = ROOT / "data" / "instrument_title_kind.json"


def families(conn: sqlite3.Connection) -> dict[str, str]:
    """instrument id -> the id its siblings share. Root, else parent, else self.

    Same key `recall_guards.siblings_of` groups on, read from the same columns,
    so "sibling" means one thing in both.
    """
    return {i: (root or parent or i) for i, parent, root in conn.execute(
        "SELECT id, parent_id, root_id FROM funding_instruments")}


def titles_by_project(conn: sqlite3.Connection, ids: set[str]) -> dict[str, list[str]]:
    """Squashed award titles per instrument, for FAMILIES that title by project.

    A family whose titles are statute names is skipped entirely: see the module
    docstring. Absent from the artifact means titles-by-project, the strict
    direction, so a family nobody has classified is still guarded.
    """
    if not ids:
        return {}
    try:
        kinds: dict[str, str] = json.loads(TITLE_KIND.read_text())
    except (OSError, ValueError):
        kinds = {}
    qs = ",".join("?" * len(ids))
    out: dict[str, list[str]] = {}
    try:
        rows = conn.execute(
            f"SELECT id, parent_id, root_id, name, sample_project_titles "
            f"FROM funding_instruments WHERE id IN ({qs})", sorted(ids)).fetchall()
    except sqlite3.OperationalError:
        return {}
    for iid, parent, root, name, raw in rows:
        family = root or parent or iid
        if kinds.get(family, kinds.get(iid, "project")) == "scheme":
            continue
        try:
            titles = json.loads(raw) if raw else []
        except Exception:
            titles = []
        own = squash(name or "")
        # The same property as the family exclusion above, applied per ROW.
        # `instrument_title_kind.json` answers per FAMILY, and one leaf of a
        # project-titling family can still title by its own label: every award
        # under ADEME's `Tremplin pour la transition ecologique des PME` is
        # titled with that name, so the leaf's description could not mention
        # the guichet it describes. A title that IS the instrument's name is
        # the instrument's label whatever its siblings do -- and it is no
        # answer key either way, since `recall_guards.names_the_fund` already
        # refuses any query containing the fund's whole name.
        out[iid] = [squash(t) for t in titles
                    if isinstance(t, str) and len(t) >= 25
                    and not (own and len(own) >= 3 and own in squash(t))]
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", action="append", metavar="found_XX.json",
                    help="check these files (repeatable). Default: every found_*.json")
    args = ap.parse_args()

    files = ([SRC / f for f in args.file] if args.file
             else sorted(SRC.glob("found_*.json")))
    records: list[tuple[str, str, str, str]] = []  # (file, id, field, text)
    for f in files:
        if not f.exists():
            raise SystemExit(f"no such file: {f}")
        for rec in json.loads(f.read_text()):
            if rec.get("found") is False:
                continue
            iid = rec.get("instrument_id") or "?"
            for field in ("description", "eligibility_text"):
                t = (rec.get(field) or "").strip()
                if t:
                    records.append((f.name, iid, field, t))
    print(f"{len(records)} fetched strings across {len(files)} file(s)")

    recall = recall_descriptions()
    print(f"{len(recall)} recall descriptions over {MIN_QUERY} chars, "
          f"{len({r[1] for r in recall})} instruments")

    conn = sqlite3.connect(DB, timeout=60)
    family = families(conn)
    titles = titles_by_project(conn, {r[1] for r in records})
    conn.close()
    n_titles = sum(len(v) for v in titles.values())
    print(f"{n_titles} own award titles held for {len(titles)} of these instruments "
          f"(families whose titles are statute names are excluded, see docstring)")

    # Recall rows grouped by the FAMILY of the fund they won, so a fetched
    # string is only ever compared with founders whose answer is this fund or
    # one of its siblings. See the docstring.
    by_family: dict[str, list[tuple[str, str, str, bool]]] = {}
    for name, inst, sq, active in recall:
        by_family.setdefault(family.get(inst, inst), []).append((name, inst, sq, active))
    print(f"scoped to the won fund and its siblings: "
          f"{len(by_family)} instrument families carry a recall founder")
    print(f"the active set is {active_set()}; a hit on a retired set warns, "
          f"a hit on the active set fails")

    fails: list[str] = []
    warns: list[str] = []
    for fname, iid, field, text in records:
        sq = squash(text)
        mine = by_family.get(family.get(iid, iid), [])
        grams = _grams(sq)
        for name, inst, rsq, active in mine:
            where = fails if active else warns
            if rsq and rsq in sq:
                where.append(f"CONTAINMENT  {fname} {iid}.{field} contains the whole "
                             f"description of {name} (won {inst})")
            shared = grams & _grams(rsq)
            if shared:
                where.append(f"{GRAM}-GRAM      {fname} {iid}.{field} shares "
                             f"\"{sorted(shared)[0]}\" with {name} (won {inst})")
        for t in titles.get(iid, []):
            if t and t in sq:
                fails.append(f"OWN TITLE    {fname} {iid}.{field} contains one of "
                             f"this instrument's own award titles")

    if warns:
        print(f"\n{len(warns)} hit(s) on a RETIRED recall set — no number that runs "
              f"today reads these rows, but a finding quoting them was measured "
              f"over text that overlaps its own query:")
        for line in sorted(set(warns))[:20]:
            print("  " + line)
    if fails:
        print(f"\nFAIL — {len(fails)} leak(s) on the active set:")
        for line in fails[:40]:
            print("  " + line)
        raise SystemExit(1)
    print(f"\nPASS — no fetched string contains an active-set recall description, "
          f"shares an {GRAM}-word run with one, or quotes its own instrument's "
          f"award titles.")


if __name__ == "__main__":
    main()
