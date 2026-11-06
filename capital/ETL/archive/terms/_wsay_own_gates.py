"""Workstream AY: which intake field do a leaf's OWN rules turn on?

wsAO established that 83% of gates are inherited from the regime and that only a
leaf's OWN decidable filters can separate it from a sibling -- an inherited rule
is constant across the group by construction and can never discriminate. That
makes the leaf's own filters the corpus's own answer to "what separates these
calls", written from official eligibility text rather than inferred.

So: take every decidable filter that belongs to a leaf rather than to its regime,
and count which intake field it resolves to. A field that appears often is one
the calls themselves distinguish on. A field that never appears is one no amount
of asking would help with. And `intake_field_resolved = NULL` on a decidable
filter is the interesting case: a real, official condition that the intake has no
question capable of answering.

This is the six-family version of the ADEME reading, and it costs nothing.

Read-only.
"""
from __future__ import annotations

import json
import os
import sys
from collections import Counter, defaultdict

import psycopg2
import psycopg2.extras

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib"))
from etl_env import ROOT  # noqa: F401 — imported for its side effect: loads <repo>/.env.local


def main():
    db = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT id, parent_id, name FROM funding_instruments")
    insts = [dict(r) for r in cur.fetchall()]
    regime_of = {r["id"]: (r["parent_id"] or r["id"]) for r in insts}
    by_regime = defaultdict(list)
    for r in insts:
        by_regime[regime_of[r["id"]]].append(r["id"])

    cur.execute("""
        SELECT instrument_id, gate_key, gate_role, value_spec,
               intake_field_resolved, requirement
          FROM eligibility_gates
    """)
    gates = [dict(r) for r in cur.fetchall()]
    db.close()

    # A gate is DECIDABLE when it can actually remove a founder: role=filter with
    # a value_spec. Anything else is prose, however true.
    dec = [g for g in gates if g["gate_role"] == "filter" and g["value_spec"]]
    print(f"corpus=postgres gates={len(gates)} decidable filters={len(dec)}")

    # A gate is the leaf's OWN when its (key, spec) does not appear on the
    # regime parent. That is the same test wsAO used to get 22%.
    parent_specs = defaultdict(set)
    for g in dec:
        iid = g["instrument_id"]
        if regime_of.get(iid) == iid:                     # this row IS the regime
            parent_specs[iid].add((g["gate_key"],
                                   json.dumps(g["value_spec"], sort_keys=True, default=str)))

    own = []
    for g in dec:
        iid = g["instrument_id"]
        reg = regime_of.get(iid)
        if reg is None or reg == iid:
            continue                                       # regime-level, not a leaf
        if len(by_regime[reg]) < 2:
            continue
        sig = (g["gate_key"], json.dumps(g["value_spec"], sort_keys=True, default=str))
        if sig not in parent_specs.get(reg, ()):
            own.append(g)

    print(f"decidable filters on a leaf of a multi-leaf regime, NOT inherited: {len(own)}")

    def fld(g):
        return g["intake_field_resolved"] or "(no intake field)"

    print("\nWhich intake field the leaf's OWN decidable filters resolve to")
    print(f"{'field':<26}{'gates':>7}{'share':>8}{'leaves':>8}{'regimes':>9}")
    print("-" * 58)
    tot = len(own) or 1
    by_field = defaultdict(list)
    for g in own:
        by_field[fld(g)].append(g)
    for f, gs in sorted(by_field.items(), key=lambda kv: -len(kv[1])):
        leaves = len({g["instrument_id"] for g in gs})
        regs = len({regime_of[g["instrument_id"]] for g in gs})
        print(f"{f:<26}{len(gs):>7}{len(gs) / tot:>8.0%}{leaves:>8}{regs:>9}")

    # ── Per regime: what do THESE calls distinguish on? ───────────────────────
    print("\nTop fields per regime (leaf-own decidable filters)")
    per = defaultdict(Counter)
    for g in own:
        per[regime_of[g["instrument_id"]]][fld(g)] += 1
    for reg, c in sorted(per.items(), key=lambda kv: -sum(kv[1].values()))[:14]:
        top = ", ".join(f"{k} {v}" for k, v in c.most_common(4))
        print(f"  {reg[:24]:<26}{sum(c.values()):>5}  {top}")

    # ── The gates no question can answer ─────────────────────────────────────
    unresolved = [g for g in own if not g["intake_field_resolved"]]
    print(f"\n{len(unresolved)} leaf-own decidable filters resolve to NO intake field.")
    print("These are official conditions the intake cannot currently ask about.")
    print("\nMost common gate_key among them:")
    for k, n in Counter(g["gate_key"] for g in unresolved).most_common(15):
        print(f"  {n:>4}  {k}")
    print("\nA sample of their requirement text:")
    seen = set()
    for g in unresolved:
        t = (g["requirement"] or "").strip().replace("\n", " ")
        if len(t) < 30 or t[:60] in seen:
            continue
        seen.add(t[:60])
        print(f"  [{g['gate_key']}] {t[:150]}")
        if len(seen) >= 12:
            break


if __name__ == "__main__":
    main()
