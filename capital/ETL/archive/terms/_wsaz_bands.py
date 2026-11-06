"""Which money banding to ship: AY's 6, or AY's low end with the shipped top kept.

wsAY measured a six-band scheme (`FINE_BANDS`) and reported ceiling@5 17% -> 24%.
Its top edge collapses the shipped `b15m_50m` and `gt50m` into one `gt15m`. That
collapse is not free: three encoded comparators are written against the shipped
top edge, and two of them are `band_max b15m_50m`, which under a collapsed top
becomes "at most the highest band" -- no constraint at all, admitting every
founder. That is the inversion wsAX was created to stop.

So this asks the only question that decides it: does keeping the shipped top
split cost any ceiling? A finer partition can only shrink residual classes, so
the answer should be "no, it gains" -- but the point of this workstream is to
measure rather than to assert, and a claim this cheap to check should be checked.

    python3 ETL/terms/_wsaz_bands.py
"""
import json
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict

import psycopg2
import psycopg2.extras

SHIPPED = [("lt500k", 0, 500_000), ("b500k_2m5", 500_000, 2_500_000),
           ("b2m5_15m", 2_500_000, 15_000_000), ("b15m_50m", 15_000_000, 50_000_000),
           ("gt50m", 50_000_000, float("inf"))]

# wsAY's scheme, verbatim from ETL/terms/_wsay_ceilings.py.
AY_SIX = [("lt25k", 0, 25_000), ("b25k_100k", 25_000, 100_000),
          ("b100k_500k", 100_000, 500_000), ("b500k_2m5", 500_000, 2_500_000),
          ("b2m5_15m", 2_500_000, 15_000_000), ("gt15m", 15_000_000, float("inf"))]

# The candidate: wsAY's low end, the shipped top edge left alone.
AZ_SEVEN = [("lt25k", 0, 25_000), ("b25k_100k", 25_000, 100_000),
            ("b100k_500k", 100_000, 500_000), ("b500k_2m5", 500_000, 2_500_000),
            ("b2m5_15m", 2_500_000, 15_000_000), ("b15m_50m", 15_000_000, 50_000_000),
            ("gt50m", 50_000_000, float("inf"))]


def norm(s):
    if not s:
        return ""
    o = unicodedata.normalize("NFKD", str(s).lower())
    o = "".join(c for c in o if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", o).strip()


def band(v, bands):
    if v is None:
        return ""
    for name, lo, hi in bands:
        if lo <= float(v) < hi:
            return name
    return ""


def main():
    db = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT id, parent_id, country, delivery_region, catchment_regions, award_p50
          FROM funding_instruments
    """)
    insts = [dict(r) for r in cur.fetchall()]
    cur.execute("""
        SELECT instrument_id, value_spec, intake_field_resolved
          FROM eligibility_gates WHERE gate_role = 'filter' AND value_spec IS NOT NULL
    """)
    gates = defaultdict(list)
    for g in cur.fetchall():
        gates[g["instrument_id"]].append(dict(g))
    db.close()

    def gate_sig(iid, fields):
        gs = [g for g in gates.get(iid, ()) if g["intake_field_resolved"] in fields]
        return "|".join(sorted(
            f"{g['intake_field_resolved']}={json.dumps(g['value_spec'], sort_keys=True, default=str)}"
            for g in gs))

    def region_key(r):
        return "|".join([gate_sig(r["id"], {"region"}),
                         norm(r["delivery_region"]), norm(r["catchment_regions"])])

    by_regime = defaultdict(list)
    for r in insts:
        by_regime[r["parent_id"] or r["id"]].append(r)
    groups = {k: v for k, v in by_regime.items() if len(v) > 1}
    leaves = sum(len(v) for v in groups.values())
    print(f"corpus=postgres instruments={len(insts)}  multi-leaf regimes={len(groups)} "
          f"leaves={leaves}")

    def stats(gs, key):
        sizes = []
        for g in gs:
            cls = Counter(key(r) for r in g)
            sizes += [cls[key(r)] for r in g]
        n = len(sizes) or 1
        return (sum(sizes) / n,
                sum(1 for s in sizes if s == 1) / n,
                sum(1 for s in sizes if s <= 5) / n)

    CANDIDATES = [
        ("nothing asked (today)", lambda r: ""),
        ("money, shipped 5", lambda r: band(r["award_p50"], SHIPPED)),
        ("money, wsAY 6", lambda r: band(r["award_p50"], AY_SIX)),
        ("money, wsAZ 7", lambda r: band(r["award_p50"], AZ_SEVEN)),
        ("region", region_key),
        ("shipped 5 + region", lambda r: band(r["award_p50"], SHIPPED) + "#" + region_key(r)),
        ("wsAY 6 + region", lambda r: band(r["award_p50"], AY_SIX) + "#" + region_key(r)),
        ("wsAZ 7 + region", lambda r: band(r["award_p50"], AZ_SEVEN) + "#" + region_key(r)),
    ]

    allg = list(groups.values())
    print("\n" + "=" * 72)
    print("CEILING FOR A PERFECT ANSWER, all multi-leaf leaves")
    print("=" * 72)
    print(f"{'question':<26}{'mean class':>11}{'alone':>8}{'CEILING@5':>12}")
    for lab, key in CANDIDATES:
        m, a, f = stats(allg, key)
        print(f"{lab:<26}{m:>11.1f}{a:>8.0%}{f:>12.0%}")

    # Where the two schemes can possibly differ: leaves above the 15M edge.
    top = [r for g in allg for r in g if (r["award_p50"] or 0) >= 15_000_000]
    print(f"\nleaves with award_p50 >= 15M, the only place the two schemes differ: {len(top)}")
    print("  by shipped top band:", dict(Counter(band(r["award_p50"], SHIPPED) for r in top)))

    print("\n" + "=" * 72)
    print("CEILING@5 PER COUNTRY (the strata this workstream must not average over)")
    print("=" * 72)
    by_country = defaultdict(list)
    for g in allg:
        by_country[g[0]["country"] or "??"].append(g)
    print(f"{'country':<10}{'leaves':>7}{'today':>8}{'ship5':>8}{'AY6':>8}{'AZ7':>8}"
          f"{'region':>9}{'AZ7+reg':>9}")
    keyed = dict(CANDIDATES)
    for c, gs in sorted(by_country.items(), key=lambda kv: -sum(len(g) for g in kv[1]))[:14]:
        n = sum(len(g) for g in gs)
        row = f"{c:<10}{n:>7}"
        for lab, w in [("nothing asked (today)", 8), ("money, shipped 5", 8), ("money, wsAY 6", 8),
                       ("money, wsAZ 7", 8), ("region", 9), ("wsAZ 7 + region", 9)]:
            row += f"{stats(gs, keyed[lab])[2]:>{w}.0%}"
        print(row)


if __name__ == "__main__":
    sys.exit(main())
