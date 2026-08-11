"""The sibling class over the rows the product actually publishes.

`measure_sibling_coverage.ts` counts all 1,014 instruments. The product shows
721: `publishableInstruments()` drops frameworks, parents, rows under the data
floor, and every scheme the register says has closed. The rows it drops are
disproportionately the well-covered German ones, so the all-rows figure is
optimistic and the priority list it implies is the wrong one.

Run `website/frontend/scripts/dump_publishable_ids.ts` first; it writes the id
list this reads.
"""
from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from probe_quote_harvest import connect, load, norm, publishable_ids  # noqa: E402

import psycopg2.extras  # noqa: E402


def facet(r: dict, keys: tuple[str, ...]) -> str:
    return "|".join(norm(r.get(k)) for k in keys)


def report(rows: list[dict], label: str) -> None:
    regime = defaultdict(list)
    for r in rows:
        regime[r["parent_id"] or r["id"]].append(r)
    groups = [g for g in regime.values() if len(g) > 1]
    leaves = sum(len(g) for g in groups)
    print(f"\n{label}: {len(groups)} multi-leaf regimes holding {leaves} leaves")
    if not leaves:
        return
    for name, keys in (("none (group size)", ()),
                       ("administering_body", ("administering_body",)),
                       ("eligibility_text", ("eligibility_text",)),
                       ("ALL THREE", ("administering_body", "delivery_region",
                                      "eligibility_text"))):
        total, uniq = 0, 0
        for g in groups:
            buckets = defaultdict(int)
            for r in g:
                buckets[facet(r, keys)] += 1
            for r in g:
                n = buckets[facet(r, keys)]
                total += n
                uniq += n == 1
        print(f"  {name:<22} mean class {total/leaves:>6.1f}   "
              f"uniquely identified {uniq/leaves:>4.0%}")


def main() -> None:
    conn = connect()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    inst = load(cur)
    pub = publishable_ids()

    report(list(inst.values()), "ALL 1,014 rows (what the shared script counts)")
    rows = [r for r in inst.values() if r["id"] in pub]
    report(rows, f"PUBLISHABLE ONLY ({len(rows)} rows -- what a founder can be shown)")

    # Per country, publishable leaves only.
    regime = defaultdict(list)
    for r in rows:
        regime[r["parent_id"] or r["id"]].append(r)
    groups = [g for g in regime.values() if len(g) > 1]
    per = defaultdict(lambda: [0, 0, 0.0])
    for g in groups:
        buckets = defaultdict(int)
        for r in g:
            buckets[facet(r, ("administering_body", "delivery_region",
                              "eligibility_text"))] += 1
        for r in g:
            b = per[r["country"]]
            b[0] += 1
            b[1] += 1 if norm(r["eligibility_text"]) else 0
            b[2] += buckets[facet(r, ("administering_body", "delivery_region",
                                      "eligibility_text"))]
    print("\npublishable leaves by country")
    print(f"  {'cc':<4}{'leaves':>7}{'cov':>6}{'mean class':>12}")
    for cc, b in sorted(per.items(), key=lambda kv: -kv[1][2]):
        print(f"  {cc or '??':<4}{b[0]:>7}{b[1]/b[0]:>6.0%}{b[2]/b[0]:>12.1f}")


if __name__ == "__main__":
    sys.exit(main())
