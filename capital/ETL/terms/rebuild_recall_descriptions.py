"""Give the other four founders in five something to say.

── The defect this exists to fix ──────────────────────────────────────────
`__recallSetDoors.json` holds 7,095 (company -> won fund) pairs. 5,729 of them
carry no usable description at all: 5,670 marked `descriptionSource: "none"`
and 58 whose only text was withdrawn for leaking. The selector prompt renders a
row with no description as the literal string `(no description on file)`, so
FOUR FOUNDERS IN FIVE reach every model in this repo carrying a name, a
country, a sector and four dropdown answers.

Every model arm measured so far ran under that condition. "Model 15% against
shipped 27%" is therefore not a comparison of two rankers; it is a judge with
no case file against a ranker that never needed one. Nothing measured on this
key can be believed about a real founder until the case file exists.

── Why they are blank, and why the blankness is not the safe option ───────
They were stripped to remove a leak, and the strip was right: 87% of the
original descriptions sat inside the won fund's own project titles and 1,573 of
1,920 began with the instrument's own name. But stripping the answer stripped
the SUBSTANCE with it, and an empty description is not a neutral test
condition. It is a different, easier-to-pass and harder-to-interpret question:
"rank 782 funds for a company you know four facts about".

── Where the text comes from ──────────────────────────────────────────────
The same place the 262 good pairs came from, and by the same rule:
THIS COMPANY'S OWN AWARD PROSE UNDER A DIFFERENT PROGRAMME THAN THE ANSWER.
If a company won a national R&D scheme and also ran a Horizon project, the
Horizon summary is a genuine, independent statement of what that company
builds — written for somebody else, about the same work — and it cannot name
the national scheme because it belongs to another regime entirely.

`project_summary` is preferred over `project_title` wherever a company has one.
A title is not a description, and titles are what leaked before; the corpus
holds 135,181 summaries against 285,142 titles, so the preference costs
coverage and buys substance. Both pass through every guard in
`recall_guards.py` via `LeakIndex.borrow_reject_reason`, which is the same code
path `enrich_recall_set.py` uses — one implementation, three callers.

── What is NOT done, and why it is the most important line here ───────────
A pair with no usable prose gets `descriptionSource: "none"` and stays blank.
NOTHING IS SYNTHESISED. A description written by a model, from a sector and a
country, is a fabricated founder — which is exactly how this repo acquired a
fictional one the first time, and it took two workstreams to notice. A blank
that says it is blank costs coverage; a fabrication costs the meaning of every
number measured on it.

── The reuse cap, kept ────────────────────────────────────────────────────
No recovered text may serve more than one pair. The original harness disease
was 179 rows querying with ONE identical string against 87 different right
answers, so a perfect index scored 1/87 there. A company with three pairs and
one usable award text therefore describes one of them, not three.

── The two bounds the product applies, applied here ───────────────────────
`MAX_DESCRIPTION_CHARS = 1200` truncates before anything sees it and
`MIN_MATCHABLE_DESCRIPTION_CHARS = 12` treats anything shorter as absent. Text
is truncated to the first bound HERE, at a word boundary, and then guarded — in
that order, because a substring of a leak-free string is not guaranteed
leak-free (it can sit inside a profile the full string does not). The run
reports what each bound affected.

Run with DATABASE_URL set. Without it the profile-text guard cannot run, the
script says so, and `--write` refuses — the same contract extend_recall_set.py
has, for the same reason: the guard that catches the most is the one that
reads Postgres.

Usage:
  python3 ETL/terms/rebuild_recall_descriptions.py            # report only
  python3 ETL/terms/rebuild_recall_descriptions.py --write
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DATA, DB, ROOT, WEB  # noqa: E402

import argparse  # noqa: E402
import collections  # noqa: E402
import json  # noqa: E402
import sqlite3  # noqa: E402
import statistics  # noqa: E402

from recall_guards import LeakIndex, squash  # noqa: E402

FRONTEND = WEB / "lib" / "intelligence"
DEFAULT_BASE = "__recallSetDoors.json"
DEFAULT_OUT = "__recallSetDescribed.json"
TITLE_KINDS = DATA / "instrument_title_kind.json"

# Mirrors web/lib/intelligence/types.ts. Duplicated across a
# language boundary and therefore ASSERTED rather than trusted: see
# `check_description_bounds` in scripts/check_recall_leaks.ts, which fails the
# build if the TypeScript constants and these two ever disagree.
MAX_DESCRIPTION_CHARS = 1200
MIN_MATCHABLE_DESCRIPTION_CHARS = 12

# Text sourced from another award is only ever these two columns, and the order
# IS the preference: a summary is prose about the work, a title is a label.
KINDS = ("summary", "title")


def truncate(text: str, limit: int = MAX_DESCRIPTION_CHARS) -> str:
    """To the product's bound, at a word boundary rather than mid-word.

    The founder-facing path slices at `limit` exactly. Cutting a word in half
    is not what a founder would have typed, and the embedding is the thing that
    reads it, so the boundary is moved back to the last space when there is one
    within a reasonable distance of the cut.
    """
    t = text.strip()
    if len(t) <= limit:
        return t
    cut = t[:limit]
    space = cut.rfind(" ")
    return (cut[:space] if space > limit - 120 else cut).rstrip(" ,;:-")


def needs_description(row: dict) -> bool:
    """A pair the selector currently renders as `(no description on file)`.

    Two states, one condition: never described, or described with a string the
    leak guard withdrew. Both reach a model with nothing, and `isDescribed()`
    in recallSet.ts counts neither.
    """
    if row.get("descriptionSource") == "own_project_title_leaks":
        return True
    return not (row.get("description") or "").strip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=DEFAULT_BASE)
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    base_path = FRONTEND / args.base
    pairs = json.loads(base_path.read_text())
    kinds: dict[str, str] = json.loads(TITLE_KINDS.read_text()) if TITLE_KINDS.exists() else {}

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    guards = LeakIndex(conn, title_kinds=kinds)
    if not guards.profile_text:
        print("\nThe profile-text guard is the one that catches the most: it reads\n"
              "instrument_profiles in POSTGRES, the column retrieval actually scores\n"
              "against, and the SQLite sample-title guard misses 46% of what it finds.")
        if args.write:
            raise SystemExit("REFUSING TO WRITE without it. Set DATABASE_URL.")

    # ── event -> instrument, BOTH joins ─────────────────────────────────────
    # Identical to enrich_recall_set.py, and it has to be: joining only through
    # `funding_instrument_sources` returns PARENT regimes, no national scheme is
    # ever recognised, and the cross-regime guard silently stops firing for
    # exactly the rows this script exists to serve.
    src2inst: dict[str, list[str]] = collections.defaultdict(list)
    for s, iid in conn.execute("SELECT source, instrument_id FROM funding_instrument_sources"):
        src2inst[s].append(iid)
    code2inst: dict[str, list[str]] = collections.defaultdict(list)
    for iid, i in guards.inst.items():
        code = (i["scheme_code"] or "").strip()
        if code:
            code2inst[code].append(iid)

    cid_by_name: dict[tuple[str, str], list[int]] = collections.defaultdict(list)
    for cid, cname, country in conn.execute(
            "SELECT id, canonical_name, country FROM companies"):
        cid_by_name[(cname, country or "")].append(cid)

    todo = [p for p in pairs if needs_description(p)]
    wanted_cids: set[int] = set()
    for p in todo:
        wanted_cids.update(cid_by_name.get((p["name"], p["country"]), []))

    # ── the award text index, and the funding-line index alongside it ───────
    # `note_event` is fed from the WHOLE events table, not just the companies in
    # the set: a scheme name is a scheme name regardless of who happens to be
    # under test, and the share it computes is meaningless over a subset.
    candidates: dict[int, list[dict]] = collections.defaultdict(list)
    # Every title the corpus can credit to an instrument, squashed. The
    # cross-regime rule says a borrowed text belongs to another regime; this is
    # what makes that checkable rather than asserted, since the same string can
    # appear on awards in two regimes at once.
    own_titles: dict[str, set[str]] = collections.defaultdict(set)
    for e in conn.execute(
            "SELECT company_id, source, call_id, project_title, project_summary "
            "FROM public_funding_events WHERE is_duplicate = 0"):
        summary = (e["project_summary"] or "").strip()
        title = (e["project_title"] or "").strip()
        iids = list(code2inst.get((e["call_id"] or "").strip(), [])) + \
            list(src2inst.get(e["source"], []))
        guards.note_event(e["company_id"], iids, [summary, title])
        if title:
            for iid in iids:
                own_titles[iid].add(squash(title))
        if e["company_id"] not in wanted_cids or not iids:
            continue
        candidates[e["company_id"]].append(
            {"iids": iids, "summary": summary, "title": title, "source": e["source"]})
    conn.close()

    rejected: collections.Counter = collections.Counter()
    bounds: collections.Counter = collections.Counter()

    def usable(raw: str, kind: str, iids: list[str], won: str) -> str | None:
        """The final text if this candidate may be used, else None.

        Bounds first, guards second, and the ORDER matters: the guards must see
        the string that will actually be graded. A 3,000-character summary
        truncated to 1,200 is a different string, and a substring of a
        leak-free text can sit inside a profile the full text does not.
        """
        if not raw:
            return None
        if len(raw) > MAX_DESCRIPTION_CHARS:
            bounds["over MAX_DESCRIPTION_CHARS, truncated"] += 1
        text = truncate(raw)
        if len(text) < MIN_MATCHABLE_DESCRIPTION_CHARS:
            bounds["under MIN_MATCHABLE_DESCRIPTION_CHARS, unusable"] += 1
            return None
        reason = guards.borrow_reject_reason(text, kind, iids, won)
        if reason:
            rejected[reason] += 1
            return None
        # The check `check_recall_leaks.ts` re-derives without a database. Run
        # it here too so a violation is a build-time refusal and not only a
        # CI-time failure.
        if squash(text) in own_titles.get(won, ()):
            rejected["is a project title of the won fund's own award"] += 1
            return None
        return text

    # Every text already spent, so a recovered string serves ONE pair. Seeded
    # with what the base set already uses: a description that is already the
    # query for one pair must not become the query for a second.
    claimed: set[str] = set()
    for p in pairs:
        if not needs_description(p):
            d = (p.get("description") or "").strip()
            if d:
                claimed.add(squash(d))

    out: list[dict] = []
    stats: collections.Counter = collections.Counter()
    lengths: list[int] = []
    for p in pairs:
        row = dict(p)
        if not needs_description(p):
            stats["kept, already described"] += 1
            out.append(row)
            continue
        best: tuple[str, str, str, str] | None = None
        for cid in cid_by_name.get((p["name"], p["country"]), []):
            for ev in candidates.get(cid, []):
                for kind in KINDS:
                    text = usable(ev[kind], kind, ev["iids"], p["instrument"])
                    if text is None:
                        continue
                    if squash(text) in claimed:
                        rejected["already the description of another pair"] += 1
                        continue
                    # Summary beats title outright; within a kind, longer says
                    # more. Encoded as a sort key so the preference is one
                    # comparison rather than two nested loops that can disagree.
                    rank = (0 if kind == "summary" else 1, -len(text))
                    if best is None or rank < (0 if best[1] == "summary" else 1, -len(best[0])):
                        best = (text, kind, ev["iids"][0], ev["source"])
        if best is None:
            # Blank, and SAYING SO. `leakyDescription` is left where it is: the
            # row is still a record of what was withdrawn and why.
            row["description"] = ""
            row["descriptionSource"] = "none"
            row.pop("descriptionFrom", None)
            stats["no usable prose — left blank"] += 1
            out.append(row)
            continue
        row["description"] = best[0]
        row["descriptionSource"] = f"cross_regime_{best[1]}"
        row["descriptionFrom"] = best[2]
        row["descriptionRebuilt"] = True
        claimed.add(squash(best[0]))
        lengths.append(len(best[0]))
        stats[f"rebuilt from a cross-regime {best[1]}"] += 1
        out.append(row)

    # ── the report ──────────────────────────────────────────────────────────
    described = [r for r in out if (r.get("description") or "").strip()
                 and r.get("descriptionSource") != "own_project_title_leaks"]
    all_lengths = sorted(len(r["description"]) for r in described)
    rebuilt = [r for r in described if r.get("descriptionRebuilt")]
    print(f"\nbase                     {args.base}  {len(pairs):,} pairs")
    print(f"needed a description     {len(todo):,} ({100 * len(todo) / len(pairs):.1f}%)")
    for k in sorted(stats):
        print(f"  {k:38s} {stats[k]:,}")
    print(f"\nwith a description       {len(described):,} "
          f"({100 * len(described) / len(out):.1f}%), was "
          f"{len(pairs) - len(todo):,} ({100 * (len(pairs) - len(todo)) / len(pairs):.1f}%)")
    print(f"  of which rebuilt here  {len(rebuilt):,}")
    print(f"still blank              {len(out) - len(described):,} "
          f"({100 * (len(out) - len(described)) / len(out):.1f}%)")
    if all_lengths:
        print(f"length  median {statistics.median(all_lengths):.0f}  "
              f"p25 {all_lengths[len(all_lengths) // 4]}  "
              f"p75 {all_lengths[3 * len(all_lengths) // 4]}  "
              f"max {all_lengths[-1]}")
    print("\nthe product's own bounds, applied here:")
    print(f"  MAX_DESCRIPTION_CHARS {MAX_DESCRIPTION_CHARS:>5}  "
          f"{bounds['over MAX_DESCRIPTION_CHARS, truncated']:,} candidate texts truncated")
    print(f"  MIN_MATCHABLE         {MIN_MATCHABLE_DESCRIPTION_CHARS:>5}  "
          f"{bounds['under MIN_MATCHABLE_DESCRIPTION_CHARS, unusable']:,} candidate texts too short to embed")

    # The harness's central disease, stated as a number on both files so the
    # rebuild can be SHOWN to have not rebuilt it in miniature.
    for label, rows in ((args.base, pairs), (args.out, out)):
        queries: dict[str, set[str]] = collections.defaultdict(set)
        per_query: collections.Counter = collections.Counter()
        for r in rows:
            q = (r.get("description") or "").strip()
            if q:
                queries[squash(q)].add(r["instrument"])
                per_query[squash(q)] += 1
        worst = max(queries.values(), key=len, default=set())
        print(f"\n{label}: {len(queries):,} distinct queries; worst carries "
              f"{len(worst)} different right answers across "
              f"{max(per_query.values(), default=0)} rows")

    print("\nrejected candidate texts, by guard:")
    for reason, n in rejected.most_common():
        print(f"  {reason:48s} {n:,}")

    print("\nsample of rebuilt descriptions:")
    for r in rebuilt[:8]:
        print(f"  [{r['descriptionSource']:22s}] {r['name']} -> {r.get('instrumentName') or r['instrument']}")
        print(f"      {r['description'][:150]}")

    if args.write:
        (FRONTEND / args.out).write_text(
            json.dumps(out, ensure_ascii=False, indent=1) + "\n")
        print(f"\nwrote {FRONTEND / args.out}")
    else:
        print("\n(dry run — pass --write)")


if __name__ == "__main__":
    main()
