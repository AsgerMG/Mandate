"""Workstream AY: the ceiling each candidate question buys.

`measure_sibling_coverage.ts` reasoning, applied to QUESTIONS rather than to
columns. For each candidate, build the fund side from OFFICIAL sources only, then
ask: if every founder answered this perfectly, how many siblings would they still
be choosing between, and how often would the won leaf fit in the five rows the
product shows?

Mean class size is the wrong headline for a product that renders five rows. A
founder whose residual class holds three siblings can be shown all of them; one
whose class holds sixty cannot be helped by any chooser however good. So the
number reported is the share of leaves whose residual class is <= 5 -- the @5
ceiling for a PERFECT chooser -- and the current ceiling is the same figure with
no question asked at all (1 if the regime has <= 5 leaves, else 0).

── What each candidate is allowed to read ──────────────────────────────────────
    region      encoded `region` filter gates, delivery_region, catchment_regions
    money       award percentiles from the transparency register
    stage       encoded `useOfFunds` / `developmentStage` filter gates
    who         encoded applicant-shape filter gates (fte/turnover/consortium/...)
    tech        the official-text labels from `_wsay_label_axes.py`, where present

None of them reads sector_mix, recipient mix, or any other award-derived
posterior. `_wsay_stability.py` is why: an award-derived posterior does not agree
with itself across a cut year, so its ceiling is imaginary.

Read-only.
"""
from __future__ import annotations

import json
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict

import psycopg2
import psycopg2.extras

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib"))
from etl_env import ROOT  # noqa: E402

LABELS = ROOT / "data" / "wsay_leaf_axes.json"

FINE_BANDS = [("lt25k", 0, 25_000), ("b25k_100k", 25_000, 100_000),
              ("b100k_500k", 100_000, 500_000), ("b500k_2m5", 500_000, 2_500_000),
              ("b2m5_15m", 2_500_000, 15_000_000), ("gt15m", 15_000_000, float("inf"))]
SHIPPED_BANDS = [("lt500k", 0, 500_000), ("b500k_2m5", 500_000, 2_500_000),
                 ("b2m5_15m", 2_500_000, 15_000_000), ("b15m_50m", 15_000_000, 50_000_000),
                 ("gt50m", 50_000_000, float("inf"))]

STAGE_FIELDS = {"useOfFunds", "developmentStage"}
WHO_FIELDS = {"fteBand", "turnoverBand", "balanceBand", "consortium", "borrowerModel",
              "ownerOver25", "institutionalOwner", "institutionalBacking", "nonEuControl"}


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
        SELECT id, parent_id, name, country, delivery_region, catchment_regions,
               award_p25, award_p50, award_p75
          FROM funding_instruments
    """)
    insts = [dict(r) for r in cur.fetchall()]
    cur.execute("""
        SELECT instrument_id, gate_key, value_spec, intake_field_resolved
          FROM eligibility_gates WHERE gate_role = 'filter' AND value_spec IS NOT NULL
    """)
    gates = defaultdict(list)
    for g in cur.fetchall():
        gates[g["instrument_id"]].append(dict(g))
    db.close()

    labels = json.loads(LABELS.read_text()) if LABELS.exists() else {}

    def gate_sig(iid, fields):
        gs = [g for g in gates.get(iid, ()) if g["intake_field_resolved"] in fields]
        return "|".join(sorted(
            f"{g['intake_field_resolved']}={json.dumps(g['value_spec'], sort_keys=True, default=str)}"
            for g in gs))

    def region_key(r):
        # Encoded region filters first -- they are the fund's own published rule.
        # Then the measured footprint and the declared catchment, which are
        # weaker but cover leaves nobody has encoded yet.
        return "|".join([gate_sig(r["id"], {"region"}),
                         norm(r["delivery_region"]), norm(r["catchment_regions"])])

    def tech_key(r):
        lab = labels.get(r["id"])
        if not lab:
            return ""
        return norm(lab.get("technology_label")) or norm(lab.get("sector_label"))

    CANDIDATES = [
        ("nothing asked (today)", lambda r: ""),
        ("money, shipped bands", lambda r: band(r["award_p50"], SHIPPED_BANDS)),
        ("money, finer low end", lambda r: band(r["award_p50"], FINE_BANDS)),
        ("where you are (region)", region_key),
        ("what it pays for (stage)", lambda r: gate_sig(r["id"], STAGE_FIELDS)),
        ("what you are (who)", lambda r: gate_sig(r["id"], WHO_FIELDS)),
        ("technology / measure", tech_key),
        ("money(fine) + region", lambda r: band(r["award_p50"], FINE_BANDS) + "#" + region_key(r)),
        ("money(fine) + tech", lambda r: band(r["award_p50"], FINE_BANDS) + "#" + tech_key(r)),
        ("region + tech", lambda r: region_key(r) + "#" + tech_key(r)),
        ("all three", lambda r: band(r["award_p50"], FINE_BANDS) + "#" + region_key(r) + "#" + tech_key(r)),
    ]

    by_regime = defaultdict(list)
    for r in insts:
        by_regime[r["parent_id"] or r["id"]].append(r)
    groups = {k: v for k, v in by_regime.items() if len(v) > 1}
    leaves = sum(len(v) for v in groups.values())
    print(f"corpus=postgres instruments={len(insts)}  multi-leaf regimes={len(groups)} "
          f"leaves={leaves}  labelled={len(labels)}")

    def stats(gs, key):
        sizes = []
        for g in gs:
            cls = Counter(key(r) for r in g)
            sizes += [cls[key(r)] for r in g]
        n = len(sizes) or 1
        return (sum(sizes) / n,
                sum(1 for s in sizes if s == 1) / n,
                sum(1 for s in sizes if s <= 5) / n,
                sum(1 for s in sizes if s > 20) / n)

    print("\n" + "=" * 84)
    print("CEILING FOR A PERFECT ANSWER, all multi-leaf leaves")
    print("=" * 84)
    print(f"{'question':<28}{'mean class':>11}{'alone':>8}{'<=5 (CEILING@5)':>18}{'>20':>8}")
    allg = list(groups.values())
    for lab, key in CANDIDATES:
        m, a, f, o = stats(allg, key)
        print(f"{lab:<28}{m:>11.1f}{a:>8.0%}{f:>18.0%}{o:>8.0%}")

    # ── Only where labels exist can `tech` be read honestly ───────────────────
    labelled_regimes = {k for k, g in groups.items()
                        if sum(1 for r in g if r["id"] in labels) >= 0.9 * len(g)}
    if labelled_regimes:
        print(f"\nSame table restricted to FULLY LABELLED regimes "
              f"({', '.join(sorted(labelled_regimes))})")
        sub = [groups[k] for k in labelled_regimes]
        print(f"{'question':<28}{'mean class':>11}{'alone':>8}{'<=5 (CEILING@5)':>18}{'>20':>8}")
        for lab, key in CANDIDATES:
            m, a, f, o = stats(sub, key)
            print(f"{lab:<28}{m:>11.1f}{a:>8.0%}{f:>18.0%}{o:>8.0%}")

    # ── Per regime, the four askable single questions ────────────────────────
    print("\n" + "=" * 84)
    print("CEILING@5 PER REGIME (share of leaves whose residual class fits in five rows)")
    print("=" * 84)
    cols = ["nothing asked (today)", "money, shipped bands", "money, finer low end",
            "where you are (region)", "what it pays for (stage)", "technology / measure",
            "all three"]
    keyed = dict(CANDIDATES)
    print(f"{'regime':<24}{'n':>4}  " + "".join(f"{c.split(' ')[0][:9]:>11}" for c in cols))
    for reg, g in sorted(groups.items(), key=lambda kv: -len(kv[1]))[:16]:
        line = f"{reg[:23]:<24}{len(g):>4}  "
        for c in cols:
            line += f"{stats([g], keyed[c])[2]:>11.0%}"
        print(line)
    print("\nlegend:", ", ".join(f"{c.split(' ')[0][:9]}={c}" for c in cols))

    # ── The null model that could kill the region answer ─────────────────────
    # wsAO's warning applies here exactly: a leaf that carries a rule differs
    # from its siblings partly in HOW MUCH HAS BEEN ENCODED ABOUT IT, and the
    # best-documented leaf of a regime is also the one most companies win. If
    # merely HAVING a region gate separates as well as the gate's VALUE does,
    # the region ceiling is a documentation-volume prior and must be discarded.
    print("\n" + "=" * 84)
    print("REGION NULL MODEL — is it the region, or is it having been written down?")
    print("=" * 84)
    NULLS = [
        ("region: full (gates+footprint+catchment)", region_key),
        ("region: encoded gate VALUE only", lambda r: gate_sig(r["id"], {"region"})),
        ("NULL: merely HAS a region gate", lambda r: "1" if gate_sig(r["id"], {"region"}) else "0"),
        ("region: footprint+catchment only",
         lambda r: norm(r["delivery_region"]) + "|" + norm(r["catchment_regions"])),
    ]
    print(f"{'key':<44}{'mean class':>11}{'alone':>8}{'<=5':>8}")
    for lab, key in NULLS:
        m, a, f, _ = stats(allg, key)
        print(f"{lab:<44}{m:>11.1f}{a:>8.0%}{f:>8.0%}")

    # ── How many markets does each question reach at all? ────────────────────
    print("\n" + "=" * 84)
    print("REACH: regimes where the question CHANGES anything, and the leaves in them")
    print("=" * 84)
    print(f"{'question':<28}{'regimes moved':>15}{'leaves in them':>16}{'countries':>11}")
    for lab, key in CANDIDATES[1:]:
        moved = [(k, g) for k, g in groups.items()
                 if stats([g], key)[0] < stats([g], keyed["nothing asked (today)"])[0] - 1e-9]
        n_leaves = sum(len(g) for _, g in moved)
        ctys = {r["country"] for _, g in moved for r in g if r["country"]}
        print(f"{lab:<28}{len(moved):>15}{n_leaves:>16}{len(ctys):>11}")


if __name__ == "__main__":
    main()
