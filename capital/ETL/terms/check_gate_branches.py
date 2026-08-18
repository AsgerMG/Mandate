"""One field has one answer, so two different thresholds on it cannot both be
the bound that answer is tested against.

FREE. One SELECT, no model, no network. Fails the target on a violation, in the
same place and for the same reason `check_gate_subject.py` does.

── THE PROPERTY ─────────────────────────────────────────────────────────────
`assessInstrument` CONJOINS every `filter` gate. That is right for rules that
hold of an applicant simultaneously -- "must be an SME", "must be UK-registered"
-- and wrong for rules the applicant SELECTS INTO. A funder that writes

    Projects of 6 to 18 months must have total eligible project costs
      between GBP 100,000 and GBP 500,000.
    Projects of 19 to 24 months must have total eligible project costs
      between GBP 100,000 and GBP 1 million.

has stated two ALTERNATIVE routes, and an applicant is under exactly one of
them. Conjoining them tests both at once, which is the narrowest reading
available and the one guaranteed wrong for every applicant alive.

So, on a field whose vocabulary is ORDERED -- a band scale, where the number in
the sentence IS the bound:

    Two `filter` gates of one instrument, on one ordered field, whose
    requirement texts state DIFFERENT numeric thresholds, must not carry the
    same comparator.

Three states satisfy it and there is no fourth:
  * ONE RULE WRITTEN TWICE -- then the numbers agree and this never fires.
  * BRANCHES the applicant selects into -- then the comparator must be decided
    by the field that says WHICH branch, and if we do not ask that field
    neither branch can be evaluated: both carry no comparator, requirement text
    intact, exactly as `apply_gate_encoding_corrections.py` quarantines.
  * ONE OF THEM SCOPED to something we do not model -- same remedy.

── THE TEST FOR A CASE NOBODY HAS SEEN ──────────────────────────────────────
Read the two requirements and NAME THE INTAKE FIELD whose answer says which one
applies to this founder. If you can name it, the pair is decidable and the
comparator belongs on that field. If you cannot, the pair is not decidable by
anything we hold, and a comparator on it is a verdict about a question the
founder was never asked.

Note what this test does NOT ask: whether the branches are "really"
alternatives. That is a reading, and a reading cannot be a build step. What is
checked is the arithmetic contradiction the reading always leaves behind -- two
sentences with two different numbers, and one comparator claiming to be both.

── WHY IT IS DETECTED BY SHAPE AND NOT BY PHRASE ────────────────────────────
The seductive version of this check is a list of branch-marking phrases --
"Projects of", "If the lead", "Under lot" -- and it is the failure the whole
architecture exists to stop: it covers the cases someone has already read, and
the next funder, language or phrasing walks past it. Numerals are not a
register. A Latvian branch and an Estonian one carry digits in the same shape
as a British one.

── WHAT THIS COST ───────────────────────────────────────────────────────────
`innovate_uk`'s G3-01 and G3-02 sat in this state from encode to 2026-08-19,
both branches of one Smart Grants competition ANDed and applied to an agency
with 17,012 awards. The consequences were invisible to every guard we own:
wsGE's by-field counting means two gates on ONE field are ONE thing in the way,
so the row never BLOCKED and no blocked-count moved. What it did instead was
render the row with a named obstacle for all 109 of the population's British
founders -- 81% of every obstructed won row in the population came from this
one pair -- and `agentSelect.ts` spent seven days telling the model that such a
row publishes below the open ones whatever place it gives it. Nothing in the
repo reported a number that could move.

    python3 ETL/terms/check_gate_branches.py            # SQLite, the authoring store
    python3 ETL/terms/check_gate_branches.py --postgres # the store the brief reads
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
import json  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402

# WHICH FIELDS ARE ORDERED IS THE VOCABULARY'S ANSWER, NOT THIS FILE'S. A band
# scale added or retired tomorrow is covered here with no edit, which is the
# same discipline encode_gates.py follows and the reason `bandOrders` is
# generated rather than typed. A second copy of this list is how a check
# quietly stops covering the newest field.
_VOCAB = json.loads((ROOT / "data" / "vocabularies.json").read_text())
ORDERED_FIELDS = set(_VOCAB["bandOrders"])

# A threshold is a number the funder wrote. Percentages and counts are numbers
# too and are deliberately included: a branch can be selected by a headcount or
# an intensity as easily as by a sum of money, and excluding them would make
# this a check about currency rather than about branches.
NUMERAL = re.compile(r"\d[\d.,]*")


def numerals(text: str) -> tuple[str, ...]:
    """The multiset of numbers a requirement states, normalised so that
    '500,000.' and '500000' are the same threshold and a trailing full stop is
    not a second one."""
    seen = []
    for m in NUMERAL.findall(text or ""):
        v = m.rstrip(".,").replace(",", "").replace(".", "")
        if v and v not in seen:
            seen.append(v)
    return tuple(sorted(seen))


def canon(spec) -> str:
    """Key order is not part of a comparator's identity."""
    if isinstance(spec, str):
        spec = json.loads(spec)
    return json.dumps(spec, sort_keys=True)


def violations(rows) -> list[dict]:
    """`rows` are dicts with instrument_id, gate_key, requirement, value_spec.
    One traversal, so SQLite and Postgres are asked the identical question."""
    groups: dict[tuple[str, str], list[dict]] = {}
    for r in rows:
        spec = json.loads(r["value_spec"])
        field = spec.get("field")
        if field not in ORDERED_FIELDS:
            continue
        groups.setdefault((r["instrument_id"], field), []).append(r)

    out = []
    for (iid, field), g in sorted(groups.items()):
        if len(g) < 2:
            continue
        if len({canon(r["value_spec"]) for r in g}) != 1:
            continue                       # different comparators: not a collapse
        nums = {r["gate_key"]: numerals(r["requirement"]) for r in g}
        if any(not n for n in nums.values()):
            continue                       # a branch with no threshold states none
        if len(set(nums.values())) < 2:
            continue                       # the same rule written twice: consistent
        out.append({
            "instrument_id": iid, "field": field,
            "spec": canon(g[0]["value_spec"]),
            "gates": [{"gate_key": r["gate_key"], "requirement": r["requirement"],
                       "numerals": list(nums[r["gate_key"]])} for r in sorted(
                          g, key=lambda x: x["gate_key"])],
        })
    return out


def report(store: str, bad: list[dict]) -> int:
    if not bad:
        print(f"{store}: OK — no ordered-field comparator claims two thresholds at once")
        return 0
    print(f"\n{store}: {len(bad)} instrument/field pair(s) where one comparator "
          f"is asked to be two different bounds\n")
    for v in bad:
        print(f"  {v['instrument_id']}  [{v['field']}]")
        print(f"      one comparator on all of them: {v['spec']}")
        for g in v["gates"]:
            print(f"      {g['gate_key']:<14} {' '.join(g['numerals'])}")
            print(f"      {'':<14} {g['requirement'][:100]}")
        print()
    print("  Name the intake field whose answer says WHICH of these applies to a\n"
          "  founder. If there is one, the comparator belongs on that field. If\n"
          "  there is not, neither branch is decidable and both must carry no\n"
          "  comparator -- the requirement text stays, the machine verdict stops:\n"
          "    python3 ETL/terms/apply_gate_encoding_corrections.py --corrections <file>")
    return 1


SQL = ("SELECT instrument_id, gate_key, requirement, value_spec "
       "FROM eligibility_gates WHERE gate_role = 'filter' "
       "AND value_spec IS NOT NULL AND value_spec <> ''")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--postgres", action="store_true",
                    help="ask the store the brief actually reads. The two do "
                         "not hold the same gate table (wsHC), so each is "
                         "asked its own question with the same rule.")
    args = ap.parse_args()

    conn = sqlite3.connect(DB, timeout=60)
    conn.row_factory = sqlite3.Row
    rc = report("sqlite", violations([dict(r) for r in conn.execute(SQL)]))
    conn.close()

    if args.postgres:
        dsn = os.environ.get("DATABASE_URL")
        if not dsn:
            for line in (ROOT / ".env.local").read_text().splitlines():
                if line.startswith("DATABASE_URL="):
                    dsn = line.split("=", 1)[1].strip().strip('"')
        if not dsn:
            raise SystemExit("DATABASE_URL not set (expected in the repo-root .env.local)")
        import psycopg2
        pg = psycopg2.connect(dsn)
        with pg, pg.cursor() as cur:
            cur.execute(SQL)
            cols = [d[0] for d in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        pg.close()
        rc = report("postgres", violations(rows)) or rc

    raise SystemExit(rc)


if __name__ == "__main__":
    main()
