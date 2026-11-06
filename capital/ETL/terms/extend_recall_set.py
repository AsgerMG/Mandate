"""Make the ground truth able to name the funds the ranker is allowed to show.

── The defect this exists to fix ──────────────────────────────────────────
`__recallSet.json` was traced with two joins: `scheme_code = call_id` for
national schemes, and `funding_instrument_sources` for EU programmes. Neither
can reach a PROGRAMME-SPLIT CHILD. `populate_funding_instruments.py` splits a
rollup two ways:

    programme child   (fam, programme_name)              scheme_code = ''
    scheme child      (fam, call_id, granting_authority) scheme_code = call_id

A programme child's identity IS the programme name, so it carries an empty
`scheme_code` by construction and the SA-number join can never see it. The
source-map join returns the PARENT regime, not the child. So 299 instruments --
including four of the five largest sibling groups in the corpus -- are named by
**0 of 1,988** recall pairs, while the shortlist spends real display slots on
them. The audit found the same shape at channel level: `national_dev_banks` is
12% of all shown rows and 0% of the ground truth.

That is not a ranking defect and no ranking change can fix it. It means any
improvement that promotes those funds is scored as a LOSS, because every slot
they win is taken from a fund the harness happens to be able to credit. The
corrected peer-prior join measured 29% against 32% for exactly this reason.

── What this does ─────────────────────────────────────────────────────────
Reproduces the ETL's own split, so an award is credited to the instrument a
founder would actually have applied to:

    source -> fam (funding_instrument_sources)
    then (fam, programme_name)                  if the source is programme-split
    then (fam, granting_authority, call_id)     if the family is scheme-split
    then the family itself                      IF IT HAS NO CHILDREN
    else nothing -- no honest pair exists

then emits pairs for every leaf the base set cannot name. The rule is stated
over the CORPUS, not over a list of funds: any instrument that award history
can credit and the ground truth can never name is a blind spot, whichever
register it came from. Nothing here names a fund, a family or a country.

── The fourth line was written here before it was true ────────────────────
"else the family itself" described this file's intent from the day it was
written, and the code called `Split.leaf_for`, which cannot return a family at
all. So 199 of the 782 leaves the product offers -- every national innovation
agency we hold as a single row -- were skipped by a `continue`, silently, and
the key that resulted was quoted as the product's accuracy for weeks.
`Split.door_for` is that fourth line, implemented, with its own refusals: a
family that HAS children is a regime and gets nothing, and a source that maps to
several childless families is ambiguous and gets nothing. See its docstring.

── The description, and the leak that matters ─────────────────────────────
Unlike `enrich_recall_set.py`, which recovers text from a DIFFERENT regime,
these pairs use the company's own award text -- which is the `project` mode the
base set already uses for EU programmes, and carries the same circularity risk
that once read as 90% recall and was really 10%. Every guard in
`recall_guards.py` applies, and the one that matters most is the profile-text
guard: retrieval scores against `instrument_profiles.profile_text` in POSTGRES,
and a string sitting inside it is a query copied out of the answer. Text that
fails any guard is dropped and the row falls back to its sector template, which
is what a national-scheme applicant honestly has.

Run with DATABASE_URL set. Without it the profile-text guard cannot run, the
script says so, and `--write` refuses.

── Splitting ──────────────────────────────────────────────────────────────
A company already in the base set keeps the side it is already on -- otherwise
a company could be tuned on under one award and held out under another, which
is the exact leak the split exists to prevent. New companies are assigned by a
deterministic hash at the base set's own holdout ratio.

── Composing with a set whose LABELS were repaired ─────────────────────────
`--base` may be a set that changed WHICH leaf a pair names
(`repair_recall_attribution.py`). A leak guard that ran against the old answer
has not run against the new one: the description was cleared for the leaf the
pair used to point at. So every base row is re-tested against the label it now
carries, and one that fails falls back to its sector template -- the same
policy an added row gets when its own text fails, not a special case.

Usage:
  python3 ETL/terms/extend_recall_set.py                 # report only
  python3 ETL/terms/extend_recall_set.py --write
  python3 ETL/terms/extend_recall_set.py --base __recallSetRepaired.json \\
      --out __recallSetComposed.json --write
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT, WEB  # noqa: E402
from liveness import closed_sql  # noqa: E402

import argparse  # noqa: E402
import collections  # noqa: E402
import hashlib  # noqa: E402
import json  # noqa: E402
import sqlite3  # noqa: E402

from attribution import Split  # noqa: E402
from recall_guards import LeakIndex, squash  # noqa: E402

FRONTEND = WEB / "lib" / "intelligence"
# The enriched set, not the shipped one: it carries the same 1,988 pairs plus
# the leak-free descriptions and the `own_project_title_leaks` marks.
DEFAULT_BASE = "__recallSetEnriched.json"
DEFAULT_OUT = "__recallSetPlus.json"

# The base set's own cap: no single fund may dominate the measure. Matched
# exactly so an added row weighs the same as an existing one.
PAIRS_PER_INSTRUMENT = 12

# ── `traced`: which mechanism placed this award, and why it is TWO values ───
# Every harness in the repo reports and floors by `traced`, on the stated
# principle that two repairs netted into one number is how the second one goes
# unnoticed. These two are as different as any pair already separated there:
#
#   exact_attribution  the ETL's split placed the award on a CHILD -- a
#                      programme or scheme row under a regime. The child exists
#                      because the register named it and it cleared
#                      MIN_CHILD_EVENTS.
#   childless_family   the split placed nothing, and the family the source maps
#                      to has no children, so the family IS the door the founder
#                      applies to. CDTI, Innovate UK, Bpifrance's innovation
#                      line. 199 of the 782 leaves the product offers.
#
# They also behave differently under the metrics, which is the practical reason
# the label must not be shared: a childless family is its own regime, so
# REGIME@5 and EXACT@5 are the SAME question for it and there is no sibling
# credit to be had. Filing these under `exact_attribution` moved that
# population's peer-prior canary from 98.3% to 70.5% against a floor of 95 --
# not a regression, a different population wearing an existing population's
# name and inheriting a floor calibrated on it.
TRACED_EXACT = "exact_attribution"
TRACED_DOOR = "childless_family"


def grams(s: str, k: int = 8) -> set[str]:
    w = s.split()
    return {" ".join(w[i:i + k]) for i in range(max(len(w) - k + 1, 1))} if w else set()


def leak_reason(guards: LeakIndex, text: str, won: str) -> str | None:
    """The strictest leak test in the file, defined ONCE.

    Three strictnesses against `instrument_profiles.profile_text` in POSTGRES --
    the string retrieval is actually scored on, not the SQLite sample titles
    whose 46% gap is what let the last leak run for weeks.

    Sibling containment is included because a sibling shares the scheme name: a
    description inside a sibling's profile describes the FAMILY, not the
    company, and it would hand REGIME@5 for free.

    Two callers -- the base-row re-verification and the whole-file check -- and
    they must never drift apart, because the copy that drifts is the one that
    stops catching leaks and a leak announces itself as a good score.
    """
    n = squash(text)
    if not n:
        return None
    p = guards.profile_text.get(won, "")
    if p and n in p:
        return "verbatim in the won fund's profile"
    if p and grams(n) & grams(p):
        return "8-gram shared with the won fund's profile"
    for s in guards.siblings_of(won):
        ps = guards.profile_text.get(s, "")
        if not ps:
            continue
        if n in ps:
            return "verbatim in a SIBLING's profile"
        if grams(n) & grams(ps):
            return "8-gram shared with a SIBLING's profile"
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--out", default=DEFAULT_OUT,
                    help="the file to write. NEVER an existing recall set: a "
                         "ground truth that is overwritten cannot be compared "
                         "with the numbers already quoted from it.")
    ap.add_argument("--base", default=DEFAULT_BASE,
                    help="the pair file to extend. This ADDS pairs and never "
                         "alters one, so it composes with any other fix to the "
                         "same 1,988 -- notably __recallSetRepaired.json, which "
                         "corrects WHICH leaf a pair names. Rebuild on that and "
                         "the output carries both.")
    args = ap.parse_args()

    base = json.loads((FRONTEND / args.base).read_text())
    nameable = {p["instrument"] for p in base}
    split_of = {p["name"]: p["split"] for p in base}
    already = {(p["name"], p["instrument"]) for p in base}
    template = {p["sector"]: p["selfDescription"] for p in base if p.get("selfDescription")}
    holdout_share = sum(1 for p in base if p["split"] == "holdout") / max(len(base), 1)

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    guards = LeakIndex(conn)
    if not guards.profile_text:
        print("REFUSING to write: the profile-text guard is the one that caught "
              "46% of the existing project rows. Set DATABASE_URL.")
        args.write = False

    # ── Re-test the BASE rows against the label they now carry ───────────────
    # The base set may have had its ANSWERS repaired: 260 of the 1,988 pairs
    # point at a different leaf than the one their description was cleared
    # against. A guard that ran against the old answer has not run against the
    # new one. Change the answer and the question has to be asked again --
    # which is how a French RDI pair, relabelled from one delivering body to
    # another, ended up carrying a description containing the scheme's own name.
    #
    # A row that fails loses its description and falls back to its sector
    # template, exactly as an added row does when its text fails a guard.
    relabel_cleared: collections.Counter = collections.Counter()
    for r in base:
        text = (r.get("description") or "").strip()
        if not text or r.get("descriptionSource") == "own_project_title_leaks":
            continue
        why = leak_reason(guards, text, r["instrument"])
        if not why:
            continue
        relabel_cleared[why] += 1
        print(f"  base row cleared ({why}): {r['name']} -> {r['instrument']}")
        r["description"] = ""
        r["mode"] = "profile"
        r["descriptionSource"] = "cleared_leaks_under_current_label"
    print(f"base rows re-tested against their current label: "
          f"{sum(relabel_cleared.values()):,} description(s) cleared")

    split = Split(conn)

    # Never make an instrument the right answer if the product may not show it:
    # closed, a legal framework, a regime whose children are the real funds, or
    # below the corpus data floor. Same three classes `publishableInstruments()`
    # removes, for the same reasons.
    # `closed_sql()` rather than a fourth hand-written copy of the date
    # comparison: the copy here read a SATR notification expiry as a closure and
    # would have made 220 live schemes unproposable answers.
    unproposable = {r[0] for r in conn.execute(
        "SELECT id FROM funding_instruments "
        f" WHERE {closed_sql()}"
        "    OR is_framework = 1"
        "    OR (total_eur IS NULL AND last_year IS NULL)"
        "    OR id IN (SELECT parent_id FROM funding_instruments "
        "               WHERE parent_id IS NOT NULL)")}

    inst_meta = {r["id"]: dict(r) for r in conn.execute(
        "SELECT id, name, country FROM funding_instruments")}

    # ── one scan: the funding-line index AND the candidate pairs ─────────────
    code2inst: dict[str, list[str]] = collections.defaultdict(list)
    for iid, i in guards.inst.items():
        code = (i["scheme_code"] or "").strip()
        if code:
            code2inst[code].append(iid)

    company = {r["id"]: dict(r) for r in conn.execute(
        "SELECT id, canonical_name, country, sector_top FROM companies")}

    cand: dict[str, dict[tuple[str, str], dict]] = collections.defaultdict(dict)
    for e in conn.execute(
            "SELECT company_id, source, call_id, granting_authority, programme_name, "
            "       project_title, project_summary "
            "  FROM public_funding_events WHERE is_duplicate = 0"):
        title = (e["project_title"] or "").strip()
        summary = (e["project_summary"] or "").strip()
        # The funding-line index is counted over EVERY award and every join, so
        # a scheme name is recognised as one regardless of who is in the test.
        guards.note_event(
            e["company_id"],
            list(code2inst.get((e["call_id"] or "").strip(), []))
            + split.families(e["source"]),
            [title, summary])

        # `door_for`, not `leaf_for`. The difference is 199 of the 782 leaves the
        # product offers: `leaf_for` can only return a CHILD, so every family
        # that was never split -- which is to say every national innovation
        # agency we hold as one row, CDTI, Innovate UK, Bpifrance's innovation
        # line -- returned None here and could never become an answer. That is
        # the hole workstream BB2 found by measuring what a Spanish founder is
        # shown: six CDTI programmes filling every standalone row-slot on the
        # table, and the key naming none of them.
        #
        # `door_for` still refuses an award it cannot place on ONE fund, which is
        # the property a test pair needs. See its docstring for both refusals.
        #
        # `leaf_for` is asked FIRST and separately, and the redundant second call
        # inside `door_for` is deliberate: what is wanted here is not just the
        # answer but WHICH mechanism produced it, and the alternative -- having
        # `door_for` return a (leaf, how) tuple -- would put a second definition
        # of "was this exact" in the caller's hands. Two dict lookups per award
        # is the cheaper of the two costs.
        exact = split.leaf_for(e["source"], e["programme_name"],
                               e["granting_authority"], e["call_id"])
        leaf = exact or split.door_for(e["source"], e["programme_name"],
                                       e["granting_authority"], e["call_id"])
        if not leaf or leaf in nameable or leaf in unproposable:
            continue
        co = company.get(e["company_id"])
        if not co or not co["country"] or not co["canonical_name"]:
            continue
        key = (co["canonical_name"], co["country"])
        if (co["canonical_name"], leaf) in already:
            continue
        prev = cand[leaf].get(key)
        # One pair per company per fund, and the longest text wins: a summary
        # says more than a title, and the longer title is the more descriptive.
        best_text = max([summary, title], key=len)
        if prev is None or len(best_text) > len(prev["text"]):
            cand[leaf][key] = {"co": co, "text": best_text,
                               "kind": "summary" if best_text == summary else "title",
                               # HOW the award was placed, carried onto the pair
                               # as `traced`. Two mechanisms, two populations --
                               # see TRACED_* at the top of this file.
                               "traced": TRACED_EXACT if exact else TRACED_DOOR}
    conn.close()

    print(f"leaves the base set cannot name, with awards: {len(cand):,}")

    rejected: collections.Counter = collections.Counter()
    stats: collections.Counter = collections.Counter()
    added: list[dict] = []
    used_text: set[str] = set()
    for leaf in sorted(cand):
        # Deterministic order so a rerun cannot reshuffle which companies are
        # kept, and so the file diffs cleanly.
        rows = sorted(cand[leaf].items(), key=lambda kv: (kv[0][0], kv[0][1]))
        kept = 0
        for (cname, country), c in rows:
            if kept >= PAIRS_PER_INSTRUMENT:
                break
            co = c["co"]
            sector = co["sector_top"] or "other"
            if sector not in template:
                stats["dropped: sector has no profile template"] += 1
                continue
            # `reject_reason` is the shared guard set; `leak_reason` is this
            # file's strictest profile test, and it is applied to candidates as
            # well as to the finished file so the script converges instead of
            # building rows the final check will refuse.
            reason = (guards.reject_reason(c["text"], c["kind"], leaf)
                      or leak_reason(guards, c["text"], leaf))
            desc = ""
            if reason:
                rejected[reason] += 1
            elif squash(c["text"]) in used_text:
                # The harness's own disease: 179 rows once queried with one
                # identical string against 87 different right answers. A
                # recovered description may serve exactly one pair.
                rejected["already the description of another pair"] += 1
            else:
                desc = c["text"]
                used_text.add(squash(desc))
            split = split_of.get(cname)
            if split is None:
                h = int(hashlib.sha1(f"{cname}|{country}".encode()).hexdigest(), 16)
                split = "holdout" if (h % 10000) / 10000 < holdout_share else "tune"
                split_of[cname] = split
            added.append({
                "name": cname, "country": country, "sector": sector,
                "instrument": leaf,
                "instrumentName": inst_meta.get(leaf, {}).get("name") or leaf,
                "description": desc,
                "mode": "project" if desc else "profile",
                "split": split,
                "selfDescription": template[sector],
                "descriptionSource": "own_award_text" if desc else "none",
                "traced": c["traced"],
            })
            kept += 1
        stats["leaves contributing"] += 1 if kept else 0

    out = base + added
    per_regime: collections.Counter = collections.Counter()
    for r in added:
        per_regime[guards.inst.get(r["instrument"], {}).get("parent_id") or "-"] += 1

    print(f"\npairs added              {len(added):,}  "
          f"({sum(1 for r in added if r['mode'] == 'project'):,} with a guarded "
          f"description, {sum(1 for r in added if r['mode'] == 'profile'):,} profile)")
    print(f"instruments now nameable {len({r['instrument'] for r in out}):,} "
          f"(was {len(nameable):,})")
    print(f"total pairs              {len(out):,}")
    print(f"holdout                  {sum(1 for r in out if r['split'] == 'holdout'):,}")
    print("\nadded pairs by parent regime:")
    for k, n in per_regime.most_common(20):
        print(f"  {k:34s} {n:,}")
    print("\ncandidate texts rejected, by guard:")
    for reason, n in rejected.most_common():
        print(f"  {reason:44s} {n:,}")
    for k in sorted(stats):
        print(f"  {k:44s} {stats[k]:,}")

    # ── The leak check, against the string retrieval is ACTUALLY scored on ───
    # Not a re-run of the guards: the guards ran per candidate, this runs over
    # the finished file, at three strictnesses, and covers the BASE rows too.
    # The previous leak was found exactly here -- a guard checking
    # `sample_project_titles` in SQLite while retrieval scored against
    # `instrument_profiles.profile_text` in Postgres, 46% of holdout project
    # rows leaking through the gap.
    #
    # Sibling containment is included because a sibling shares the scheme name:
    # a description inside a sibling's profile is a description of the family,
    # not of the company, and it would hand REGIME@5 for free.
    leaks: collections.Counter = collections.Counter()
    checked = 0
    for r in out:
        text = (r.get("description") or "").strip()
        if not text or r.get("descriptionSource") == "own_project_title_leaks":
            continue
        checked += 1
        why = leak_reason(guards, text, r["instrument"])
        if why:
            leaks[why] += 1
            print(f"  LEAK ({why}): {r['name']} -> {r['instrument']}")
    print(f"\nleak check over {checked:,} described rows, against "
          f"instrument_profiles.profile_text:")
    if leaks:
        for k, n_ in leaks.most_common():
            print(f"  {k:44s} {n_:,}")
        print("  REFUSING to write: a leaking test set overstates every number.")
        args.write = False
    else:
        print("  0 leaks at exact, 8-gram or sibling containment, "
              "won fund AND siblings")

    # A company on both sides is the one failure that invalidates every number
    # the file will ever produce, so it is asserted rather than hoped for.
    sides = collections.defaultdict(set)
    for r in out:
        sides[r["name"]].add(r["split"])
    both = [n for n, s in sides.items() if len(s) > 1]
    assert not both, f"{len(both)} companies on both sides of the split: {both[:5]}"
    print("\nsplit check: 0 companies on both sides")

    print("\nsample of added pairs:")
    for r in [x for x in added if x["mode"] == "project"][:6]:
        print(f"  {r['country']} {r['name'][:34]:34s} -> {r['instrumentName'][:44]}")
        print(f"      {r['description'][:130]}")

    out_path = FRONTEND / args.out
    if args.write:
        if out_path.exists() and args.out != DEFAULT_OUT:
            print(f"\nREFUSING to write: {args.out} already exists. A ground "
                  "truth that is overwritten cannot be compared with the "
                  "numbers already quoted from it. Choose a new name.")
            return
        out_path.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
        print(f"\nwrote {out_path}")
    else:
        print("\n(dry run -- pass --write)")


if __name__ == "__main__":
    main()
