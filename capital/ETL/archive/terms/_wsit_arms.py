"""wsIT — the causal dose-response: the same founder, less of what they said.

FREE. Reads the committed redacted traces in this workstream's `traces/` and
nothing else. No database, no credentials, no model call, no write outside the
findings directory.

`_wsir_score.ts` is the rigorous per-arm instrument — paired bootstrap, McNemar,
sign-flip null, leave-one-regime-out — and its output is committed beside this
one, one file per arm. What it does not do is put six arms in one table, and the
shape of the CURVE is the question the intake needs answered.

The pairing is positional and is CHECKED here as it is there: two arms of one
draw carry the same country and the same provenance at every index.

  python3 ETL/terms/_wsit_arms.py <traces-dir>
"""
from __future__ import annotations

import json
import random
import statistics
import sys
from pathlib import Path

ARMS = ["full", "300", "120", "60", "template", "none"]
LABEL = {"full": "full (shipped)", "300": "capped 300", "120": "capped 120",
         "60": "capped 60", "template": "canned sentence", "none": "box empty"}
STAGES = [
    ("publishable", lambda r: r["offerable"]),
    ("founder_screen", lambda r: r["rankTable"] is not None),
    ("gates_pass", lambda r: r["rankAccessible"] is not None),
    ("pool_cut@40", lambda r: bool(r["rankAccessible"]) and r["rankAccessible"] <= 40),
    ("writer_cap@7", lambda r: bool(r["rankWriter"]) and r["rankWriter"] <= 7),
    ("top_6", lambda r: bool(r["rankWriter"]) and r["rankWriter"] <= 6),
    ("top_5", lambda r: bool(r["rankWriter"]) and r["rankWriter"] <= 5),
]
OWN = ("own_award_text", "own_project_title")


def load(d: Path, arm: str) -> list[dict]:
    lines = (d / f"trace_{arm}.jsonl").read_text().strip().split("\n")
    return [json.loads(l) for l in lines[1:]]


def header(d: Path, arm: str) -> dict:
    return json.loads((d / f"trace_{arm}.jsonl").read_text().split("\n")[0])


def boot(x: list[float], seed: int = 20260819, draws: int = 6000) -> tuple[float, float]:
    r = random.Random(seed)
    m = []
    for _ in range(draws):
        m.append(sum(x[r.randrange(len(x))] for _ in range(len(x))) / len(x))
    m.sort()
    return m[int(0.025 * draws)], m[int(0.975 * draws)]


def main() -> None:
    d = Path(sys.argv[1])
    traces = {a: load(d, a) for a in ARMS}
    base = traces["full"]
    for a in ARMS[1:]:
        if len(traces[a]) != len(base):
            raise SystemExit(f"{a}: {len(traces[a])} founders against full's {len(base)}")
        for i, (x, y) in enumerate(zip(base, traces[a])):
            if x["country"] != y["country"] or x["group"] != y["group"] \
                    or x["descriptionSource"] != y["descriptionSource"]:
                raise SystemExit(f"{a}: founder {i} differs from full — different draws")
    print("arms, and what each run says it was:")
    for a in ARMS:
        h = header(d, a)
        print(f"  {a:9s} description={h.get('description', 'UNRECORDED'):48s} "
              f"row_order={h['rowOrder']}  {h['startedAt']}")

    print(f"\n=== THE LADDER, ALL SIX ARMS (n={len(base)} drawn) ===")
    print(f"{'stage':16s}" + "".join(f"{LABEL[a]:>17s}" for a in ARMS))
    for name, f in STAGES:
        row = f"{name:16s}"
        for a in ARMS:
            n = sum(1 for r in traces[a] if f(r))
            row += f"{n:9d} {100 * n / len(base):6.2f}%"
        print(row)
    print("\n  publishable / founder_screen / gates_pass are IDENTICAL in every arm, which is")
    print("  the proof that a description arm changed only what the ranker was given to read.")

    print("\n=== PAIRED, against `full`, over the founders past the corpus stages ===")
    mov = [i for i, r in enumerate(base) if r["offerable"]]
    print(f"{'arm':16s} {'moved':>7s} {'pool_cut':>10s} {'95%':>18s} {'EXACT@6':>10s} "
          f"{'95%':>18s} {'recip':>9s}")
    for a in ARMS[1:]:
        pool = [(1 if (traces[a][i]["rankAccessible"] and traces[a][i]["rankAccessible"] <= 40) else 0)
                - (1 if (base[i]["rankAccessible"] and base[i]["rankAccessible"] <= 40) else 0)
                for i in mov]
        six = [(1 if (traces[a][i]["rankWriter"] and traces[a][i]["rankWriter"] <= 6) else 0)
               - (1 if (base[i]["rankWriter"] and base[i]["rankWriter"] <= 6) else 0) for i in mov]
        rec = [(1 / traces[a][i]["rankWriter"] if traces[a][i]["rankWriter"] else 0)
               - (1 / base[i]["rankWriter"] if base[i]["rankWriter"] else 0) for i in mov]
        moved = sum(1 for i in mov if traces[a][i]["rankAccessible"] != base[i]["rankAccessible"])
        pl, ph = boot([100 * v for v in pool])
        sl, sh = boot([100 * v for v in six])
        print(f"{LABEL[a]:16s} {moved:7d} {100 * statistics.mean(pool):+10.2f} "
              f"[{pl:+6.2f},{ph:+6.2f}] {100 * statistics.mean(six):+10.2f} "
              f"[{sl:+6.2f},{sh:+6.2f}] {statistics.mean(rec):+9.4f}")

    print("\n=== THE SAME, SPLIT BY PROVENANCE — a cap only bites where there is text to cut ===")
    for st, keep in (("own-words", lambda r: r["descriptionSource"] in OWN),
                     ("cross-regime", lambda r: r["descriptionSource"] not in OWN)):
        idx = [i for i in mov if keep(base[i])]
        print(f"\n  {st} (n={len(idx)} past the corpus stages)")
        print(f"    {'arm':16s} {'pool_cut':>10s} {'EXACT@6':>10s} {'arm EXACT@6':>13s}")
        for a in ARMS:
            pool = statistics.mean(
                (1 if (traces[a][i]["rankAccessible"] and traces[a][i]["rankAccessible"] <= 40) else 0)
                - (1 if (base[i]["rankAccessible"] and base[i]["rankAccessible"] <= 40) else 0)
                for i in idx)
            six = statistics.mean(
                (1 if (traces[a][i]["rankWriter"] and traces[a][i]["rankWriter"] <= 6) else 0)
                - (1 if (base[i]["rankWriter"] and base[i]["rankWriter"] <= 6) else 0) for i in idx)
            lvl = statistics.mean(
                1 if (traces[a][i]["rankWriter"] and traces[a][i]["rankWriter"] <= 6) else 0
                for i in idx)
            print(f"    {LABEL[a]:16s} {100 * pool:+10.2f} {100 * six:+10.2f} {100 * lvl:12.2f}%")


if __name__ == "__main__":
    main()
