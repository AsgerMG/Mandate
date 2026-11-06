"""Workstream AY: what actually separates the leaves of a large regime?

The premise under test is wsAT's arithmetic. Inside ADEME, the fund a company
won passes its own encoded rules 50% of the time and its 74 siblings pass theirs
49%; the nearest intake field, `sector`, has 11 values for a 75-leaf regime. The
conclusion drawn was "the missing thing is a question about TECHNOLOGY".

Before proposing any question, establish whether that is a fact about ADEME or a
fact about large regimes generally. A question that only helps one family is
worth a fraction of one that helps six.

Read-only. Postgres is the corpus of record; nothing here writes.
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict

import psycopg2
import psycopg2.extras

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib"))
from etl_env import ROOT  # noqa: F401 — imported for its side effect: loads <repo>/.env.local

# The shipped bands, from lib/intelligence/types.ts TICKET_BANDS. Reproduced
# here rather than imported because this is a measurement of what the SHIPPED
# granularity can resolve; if the bands change, this number should change too.
TICKET_BANDS = [
    ("lt500k", 0, 500_000),
    ("b500k_2m5", 500_000, 2_500_000),
    ("b2m5_15m", 2_500_000, 15_000_000),
    ("b15m_50m", 15_000_000, 50_000_000),
    ("gt50m", 50_000_000, float("inf")),
]


def ticket_band(v) -> str:
    if v is None:
        return ""
    v = float(v)
    for name, lo, hi in TICKET_BANDS:
        if lo <= v < hi:
            return name
    return ""


def norm(s) -> str:
    if not s:
        return ""
    out = unicodedata.normalize("NFKD", str(s).lower())
    out = "".join(ch for ch in out if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", out).strip()


def class_stats(group, key):
    """Residual class size once `key` is known.

    `mean class` = how many siblings a founder is still choosing between. 1.0 is
    a perfect chooser. `<=5` is the ceiling on EXACT@5 for a perfect chooser,
    which is the number the product is judged on.
    """
    cls = Counter(key(r) for r in group)
    sizes = [cls[key(r)] for r in group]
    n = len(sizes)
    return {
        "mean": sum(sizes) / n,
        "alone": sum(1 for s in sizes if s == 1) / n,
        "le5": sum(1 for s in sizes if s <= 5) / n,
        "distinct": len(cls),
        "present": sum(1 for r in group if key(r).replace("|", "").strip()) / n,
    }


def main():
    db = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT id, parent_id, name, country, administering_body, delivery_region,
               catchment_regions, capital_type, award_p50, award_p25, award_p75,
               scheme_code, sector_mix, description, eligibility_text,
               is_framework, tier, scheme_end_date
          FROM funding_instruments
    """)
    rows = [dict(r) for r in cur.fetchall()]
    by_id = {r["id"]: r for r in rows}

    # Decidable filters only: role=filter with a value_spec is what can actually
    # decide anything. Anything else cannot separate a founder from a sibling.
    cur.execute("""
        SELECT instrument_id, gate_key, intake_field_resolved, value_spec, gate_role
          FROM eligibility_gates
    """)
    gates = defaultdict(list)
    for g in cur.fetchall():
        gates[g["instrument_id"]].append(g)
    db.close()

    def gate_sig(r):
        gs = gates.get(r["id"], [])
        keys = sorted({
            f"{g['intake_field_resolved'] or g['gate_key']}={json.dumps(g['value_spec'], sort_keys=True, default=str)}"
            for g in gs
            if g["gate_role"] == "filter" and g["value_spec"]
        })
        return "|".join(keys)

    def sector_argmax(r):
        m = r["sector_mix"]
        if not m:
            return ""
        if isinstance(m, str):
            m = json.loads(m)
        return max(m.items(), key=lambda kv: kv[1])[0] if m else ""

    facets = [
        ("capital_type", lambda r: norm(r["capital_type"])),
        ("ticketBand (shipped)", lambda r: ticket_band(r["award_p50"])),
        ("award decade (log10)", lambda r: "" if not r["award_p50"] else str(round(math.log10(max(float(r['award_p50']), 1))))),
        ("administering_body", lambda r: norm(r["administering_body"])),
        ("delivery_region", lambda r: norm(r["delivery_region"])),
        ("catchment_regions", lambda r: norm(r["catchment_regions"])),
        ("scheme_code", lambda r: norm(r["scheme_code"])),
        ("sector_mix argmax (11)", sector_argmax),
        ("decidable gate signature", gate_sig),
        ("eligibility_text", lambda r: norm(r["eligibility_text"])[:400]),
        ("name (upper bound)", lambda r: norm(r["name"])),
    ]

    by_regime = defaultdict(list)
    for r in rows:
        by_regime[r["parent_id"] or r["id"]].append(r)
    groups = {k: v for k, v in by_regime.items() if len(v) > 1}

    total_leaves = sum(len(v) for v in groups.values())
    print(f"corpus=postgres instruments={len(rows)}")
    print(f"multi-leaf regimes {len(groups)}  holding {total_leaves} leaves\n")

    # ── Per-regime: which axis separates, for the regimes that actually bind ──
    big = sorted(groups.items(), key=lambda kv: -len(kv[1]))
    print("=" * 100)
    print("PER-REGIME SEPARATION. mean = siblings still in play once the axis is known (1.0 = perfect)")
    print("=" * 100)
    hdr = f"{'regime':<24}{'n':>4}  " + "".join(f"{lab.split(' ')[0][:11]:>12}" for lab, _ in facets)
    print(hdr)
    for rid, g in big[:20]:
        line = f"{rid[:23]:<24}{len(g):>4}  "
        for lab, key in facets:
            st = class_stats(g, key)
            line += f"{st['mean']:>12.1f}"
        print(line)

    print("\nlegend:", ", ".join(f"{lab.split(' ')[0][:11]}={lab}" for lab, _ in facets))

    # ── Aggregate over every multi-leaf regime ────────────────────────────────
    print("\n" + "=" * 100)
    print("AGGREGATE over all multi-leaf leaves")
    print("=" * 100)
    print(f"{'axis':<28}{'mean class':>12}{'alone':>8}{'<=5':>8}{'distinct/regime':>18}{'present':>9}")
    for lab, key in facets:
        acc = []
        for g in groups.values():
            acc.append((class_stats(g, key), len(g)))
        n = sum(w for _, w in acc)
        mean = sum(s["mean"] * w for s, w in acc) / n
        alone = sum(s["alone"] * w for s, w in acc) / n
        le5 = sum(s["le5"] * w for s, w in acc) / n
        dist = sum(s["distinct"] for s, _ in acc) / len(acc)
        pres = sum(s["present"] * w for s, w in acc) / n
        print(f"{lab:<28}{mean:>12.1f}{alone:>8.0%}{le5:>8.0%}{dist:>18.1f}{pres:>9.0%}")

    # ── Which axis WINS for each regime, weighted by how many leaves it holds ─
    print("\n" + "=" * 100)
    print("BEST NON-NAME AXIS PER REGIME (>=6 leaves) — is it always technology?")
    print("=" * 100)
    usable = [(lab, key) for lab, key in facets if lab != "name (upper bound)"]
    winners = Counter()
    print(f"{'regime':<26}{'n':>4}  {'best axis':<26}{'mean':>7}{'<=5':>7}   {'runner-up':<26}{'mean':>7}")
    for rid, g in big:
        if len(g) < 6:
            continue
        scored = sorted(((class_stats(g, k), lab) for lab, k in usable), key=lambda x: x[0]["mean"])
        (b, blab), (r2, r2lab) = scored[0], scored[1]
        winners[blab] += len(g)
        print(f"{rid[:25]:<26}{len(g):>4}  {blab:<26}{b['mean']:>7.1f}{b['le5']:>7.0%}   {r2lab:<26}{r2['mean']:>7.1f}")
    print("\nleaves won by axis:", winners.most_common())


if __name__ == "__main__":
    main()
