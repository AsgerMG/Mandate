"""Give the recall set the one thing it is missing: what the company actually does.

── The defect this exists to fix ──────────────────────────────────────────
`__recallSet.json` holds 1,988 (company -> won fund) pairs. 1,669 of them carry
no description at all; the harness substitutes one of ELEVEN canned sentences
derived from the company's sector. One of those strings is the query for 179
rows with 87 different correct answers, so a PERFECT index scores about 1/87
there. Measured over the whole holdout set, that caps any ranking method at
~64% and reports the intake's emptiness as a ranking failure.

Paired measurement (`scripts/measure_description_lift.ts`, holdout, n=188, same
companies both ways): EXACT@5 48.9% with the company's real project text against
21.3% with the canned sector sentence. The description is worth +27.6pp, and the
test set cannot see it on 84% of its rows.

── Where a real description can come from, and why it is not circular ─────
A previous version of this set used the WON fund's own project titles as the
description. It read as 90% recall and was really 10%: for the state-aid
registers the "project title" IS the scheme's name repeated on every award, so
the query contained the answer.

So this recovers text only from a DIFFERENT REGIME. If a company won a German
regional R&D scheme and also ran a Horizon project, the Horizon project summary
is a genuine, independent statement of what that company builds — written for
somebody else, about the same work. It cannot name the German scheme, because it
predates or ignores it.

Most of the guards live in `recall_guards.py`, because `extend_recall_set.py`
needs the identical predicates and two copies of a leak guard is the worst
duplication there is: the copy that drifts is the one that silently stops
catching leaks. Read that module for the property each enforces. TWO guards are
specific to recovering text from ANOTHER award, and they live there too, in
`LeakIndex.borrow_reject_reason`, since `rebuild_recall_descriptions.py` became
the third caller that needs them:

  1. cross-regime      the text's own instrument, and every instrument its
                       source maps to, must have a different root_id from the
                       won fund (not merely a different id — siblings share a
                       scheme name, which is exactly the string that leaked).
  2. title kind        a `project_title` is used only from instruments whose
                       titles the corpus classifier calls 'project'. That
                       classifier already knows `satr_de_rnd`'s titles are
                       statute names. `project_summary` is exempt: no scheme
                       publishes a per-award summary.

The shared guard that made this script possible is the profile-text one:
`sample_project_titles` lives in SQLite while `profile_text` is built
separately in Postgres, and checked against the real target **86 of the 188
existing holdout `project` rows (46%) have their description sitting verbatim
in the profile of the fund they are supposed to find.** Those rows are not
deleted — they are marked `own_project_title_leaks`, so a measurement can
exclude them and say so.

And one guard that is not about leakage but about the harness's own disease: no
recovered description may serve more than one pair. The failure being fixed is
179 rows querying with one identical string against 87 different right answers;
recovering a consortium title shared by 40 test companies would rebuild it in
miniature.

Everything that passes is written to a NEW file. `__recallSet.json` is never
touched: the two are measured side by side, and a number that moved because the
test set changed must stay distinguishable from a number that moved because the
product did.

Usage:
  python3 ETL/terms/enrich_recall_set.py            # report only
  python3 ETL/terms/enrich_recall_set.py --write
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DATA, DB, ROOT  # noqa: E402

import argparse  # noqa: E402
import collections  # noqa: E402
import json  # noqa: E402
import sqlite3  # noqa: E402

from recall_guards import LeakIndex, squash  # noqa: E402

FRONTEND = ROOT / "website" / "frontend" / "lib" / "intelligence"
RECALL_SET = FRONTEND / "__recallSet.json"
OUT = FRONTEND / "__recallSetEnriched.json"
TITLE_KINDS = DATA / "instrument_title_kind.json"

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    pairs = json.loads(RECALL_SET.read_text())
    kinds: dict[str, str] = json.loads(TITLE_KINDS.read_text()) if TITLE_KINDS.exists() else {}

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    # Every shared guard and every index it consults, built once.
    guards = LeakIndex(conn, title_kinds=kinds)
    inst = guards.inst
    in_profile = guards.in_profile

    # ── Event -> instrument, both joins ──────────────────────────────────────
    # Exactly the pair emit_peer_prior.py uses. Joining only through
    # funding_instrument_sources returns PARENT regimes and no national scheme
    # would ever be recognised, which would silently disable guard 1 for the
    # 84% of rows this script exists to serve.
    src2inst: dict[str, list[str]] = collections.defaultdict(list)
    for s, iid in conn.execute("SELECT source, instrument_id FROM funding_instrument_sources"):
        src2inst[s].append(iid)
    code2inst: dict[str, list[str]] = collections.defaultdict(list)
    for iid, i in inst.items():
        code = (i["scheme_code"] or "").strip()
        if code:
            code2inst[code].append(iid)

    cid_by_name: dict[tuple[str, str], list[int]] = collections.defaultdict(list)
    for cid, cname, country in conn.execute(
            "SELECT id, canonical_name, country FROM companies"):
        cid_by_name[(cname, country or "")].append(cid)

    wanted_cids: set[int] = set()
    for p in pairs:
        wanted_cids.update(cid_by_name.get((p["name"], p["country"]), []))

    # ── The funding-line index ───────────────────────────────────────────────
    # Counted over the WHOLE events table, not just the recall companies — a
    # scheme name is a scheme name regardless of who happens to be in the test
    # set.
    candidates: dict[int, list[dict]] = collections.defaultdict(list)
    for e in conn.execute(
            "SELECT company_id, source, call_id, project_title, project_summary "
            "FROM public_funding_events WHERE is_duplicate = 0"):
        summary = (e["project_summary"] or "").strip()
        title = (e["project_title"] or "").strip()
        iids = list(code2inst.get((e["call_id"] or "").strip(), [])) + \
            list(src2inst.get(e["source"], []))
        guards.note_event(e["company_id"], iids, [summary, title])
        if e["company_id"] not in wanted_cids or not iids:
            continue
        candidates[e["company_id"]].append(
            {"iids": iids, "summary": summary, "title": title, "source": e["source"]})
    conn.close()

    rejected: collections.Counter = collections.Counter()

    def usable(text: str, kind: str, iids: list[str], won: str) -> bool:
        """Every guard a BORROWED text must pass, all of them in recall_guards.

        The cross-regime and title-kind predicates used to be written out here;
        they moved to `LeakIndex.borrow_reject_reason` when a third script
        needed them. One implementation, three callers.
        """
        if not text:
            return False
        reason = guards.borrow_reject_reason(text, kind, iids, won)
        if reason:
            rejected[reason] += 1
            return False
        return True

    out = []
    stats: collections.Counter = collections.Counter()
    # The reuse cap: a recovered description already spent on another pair may
    # not be spent again. Rows are visited in the file's own order, so the
    # result is deterministic and a rerun cannot reshuffle which pair keeps it.
    claimed: set[str] = set()
    for p in pairs:
        row = dict(p)
        had = bool((p.get("description") or "").strip())
        best = None
        for cid in cid_by_name.get((p["name"], p["country"]), []):
            for ev in candidates.get(cid, []):
                for kind in ("summary", "title"):
                    text = ev[kind]
                    if not usable(text, kind, ev["iids"], p["instrument"]):
                        continue
                    if squash(text) in claimed:
                        rejected["already the description of another pair"] += 1
                        continue
                    # Prefer the longest usable text: a summary says more about
                    # the company than a title, and among titles the longer one
                    # is the more descriptive.
                    if best is None or len(text) > len(best[0]):
                        best = (text, kind, ev["iids"][0], ev["source"])
        key = f"{p['split']}/{p['mode']}"
        stats[f"{key} total"] += 1
        # A pre-existing description that guard 3b rejects is replaced if we can
        # replace it and MARKED if we cannot. Never silently kept, never silently
        # dropped: a leaky row that vanished would look like the set shrinking,
        # and a leaky row left unlabelled is what produced the 90%-that-was-10%.
        leaks = had and in_profile(p["description"], p["instrument"])
        if had and not leaks:
            row["descriptionSource"] = "own_project_title"
            stats[f"{key} already described"] += 1
        elif leaks and best:
            row["description"] = best[0]
            row["descriptionSource"] = f"cross_regime_{best[1]}"
            row["descriptionFrom"] = best[2]
            row["replacedLeakyDescription"] = True
            claimed.add(squash(best[0]))
            stats[f"{key} leaky description replaced"] += 1
        elif leaks:
            # Moved OUT of `description`, not merely flagged. A harness that
            # reads `description` without knowing about the flag would otherwise
            # keep grading on the leaky string — and every harness in this repo
            # predates the flag. Under its own key the text stays inspectable,
            # and the row falls back to its sector template like any other
            # undescribed row, which is what it honestly is.
            row["leakyDescription"] = row.pop("description")
            row["description"] = ""
            row["descriptionSource"] = "own_project_title_leaks"
            stats[f"{key} leaky, no replacement found"] += 1
        elif best:
            row["description"] = best[0]
            row["descriptionSource"] = f"cross_regime_{best[1]}"
            row["descriptionFrom"] = best[2]
            claimed.add(squash(best[0]))
            stats[f"{key} enriched"] += 1
        else:
            row["descriptionSource"] = "none"
        out.append(row)

    # State the harness's central defect as a number, on both files, so the
    # enriched set can be shown to have actually fixed it rather than asserted to.
    for label, rows in (("__recallSet.json", pairs), ("enriched", out)):
        queries: dict[str, set[str]] = collections.defaultdict(set)
        for r in rows:
            q = (r.get("description") or "").strip() or (r.get("selfDescription") or "")
            if q:
                queries[squash(q)].add(r["instrument"])
        worst = max(queries.values(), key=len, default=set())
        rows_per_query = collections.Counter()
        for r in rows:
            q = (r.get("description") or "").strip() or (r.get("selfDescription") or "")
            if q:
                rows_per_query[squash(q)] += 1
        print(f"\n{label}: {len(queries):,} distinct queries; "
              f"worst carries {len(worst)} different right answers "
              f"across {max(rows_per_query.values(), default=0)} rows")

    described = sum(1 for r in out
                    if (r.get("description") or "").strip()
                    and r["descriptionSource"] != "own_project_title_leaks")
    print(f"pairs                    {len(out):,}")
    print(f"with a LEAK-FREE real description  {described:,} "
          f"({100 * described / len(out):.0f}%, was "
          f"{sum(1 for p in pairs if (p.get('description') or '').strip()):,})")
    for k in sorted(stats):
        print(f"  {k:34s} {stats[k]:,}")
    print("\nrejected candidate texts, by guard:")
    for reason, n in rejected.most_common():
        print(f"  {reason:44s} {n:,}")

    print("\nsample of recovered descriptions:")
    for r in [x for x in out if x.get("descriptionSource", "").startswith("cross_regime")][:8]:
        print(f"  [{r['descriptionSource']:22s}] {r['name']} -> {r['instrumentName']}")
        print(f"      {r['description'][:150]}")

    if args.write:
        OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
        print(f"\nwrote {OUT}")
    else:
        print("\n(dry run — pass --write)")


if __name__ == "__main__":
    main()
