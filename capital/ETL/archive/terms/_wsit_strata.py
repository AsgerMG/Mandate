"""wsIT — are the two description strata comparable? (They are not.)

FREE. EUR 0.00, zero model calls, zero writes. Reads three things:

  * `project-mgmt/findings/pool_blend_wsIR/traces/trace_off.jsonl` — the
    COMMITTED redacted per-founder trace of the shipped configuration.
  * `__recallSetDescribed.json` — the answer key, for the query TEXT.
  * `data/db.sqlite` READ-ONLY (`mode=ro`), for award size, count and year.

`DRAW=` is the output of `website/frontend/scripts/_wsit_draw.ts`, which rebuilds
the funnel draw with the SAME `isDescribed` + `localeCompare` order the harness
used and proves the rebuild against the country AND the provenance the trace
recorded at every index. A codepoint sort in Python is not ICU collation, and an
off-by-one join against a positional trace is silent, so the order is never
re-derived here.

── WHAT THIS EXISTS TO SETTLE ──────────────────────────────────────────────
wsIR reported the funnel population splitting 52.05% against 31.66% EXACT@6 on
`descriptionSource`, and said plainly that it was an observational split rather
than an arm. This is the check it asked for: the two strata are compared on
country, sector, regime, award size, award count and year, and the gap is
re-estimated inside each.

  python3 ETL/terms/_wsit_strata.py --draw <draw.jsonl>
"""
from __future__ import annotations

import argparse
import collections
import json
import math
import random
import sqlite3
import statistics
import sys
from pathlib import Path

for _anc in Path(__file__).resolve().parents:
    if (_anc / "ETL" / "lib" / "etl_env.py").exists():
        sys.path.insert(0, str(_anc / "ETL" / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402

FRONTEND = ROOT / "website" / "frontend" / "lib" / "intelligence"
TRACE = ROOT / "project-mgmt" / "findings" / "pool_blend_wsIR" / "traces" / "trace_off.jsonl"
# The two provenances that are the company's own words about THE PROJECT THAT
# WON THE FUND BEING PREDICTED. The other two are the same company's own words
# about a DIFFERENT project of theirs, recovered from another regime. Both are
# the founder's own words -- see §2 of the README; "borrowed" was never another
# company's text.
OWN = ("own_award_text", "own_project_title")


def load(draw_path: Path) -> list[dict]:
    draw = [json.loads(l) for l in draw_path.read_text().splitlines() if l.strip()]
    lines = TRACE.read_text().strip().split("\n")
    rows = [json.loads(l) for l in lines[1:]]
    if len(rows) != len(draw):
        raise SystemExit(f"draw is {len(draw)} founders, trace is {len(rows)}")
    for d, r in zip(draw, rows):
        if d["country"] != r["country"] or d["descriptionSource"] != r["descriptionSource"]:
            raise SystemExit("draw and trace disagree — the join is off by an unknown offset")
        d.update(r)
        d["own"] = 1 if d["descriptionSource"] in OWN else 0
        d["hit6"] = 1 if (d["rankWriter"] and d["rankWriter"] <= 6) else 0
        d["hit5"] = 1 if (d["rankWriter"] and d["rankWriter"] <= 5) else 0
        d["pool"] = 1 if (d["rankAccessible"] and d["rankAccessible"] <= 40) else 0
        d["len"] = len(d["description"])
    return draw


def rate(rs: list[dict], k: str) -> float:
    return 100 * sum(d[k] for d in rs) / len(rs) if rs else float("nan")


def recip(rs: list[dict], k: str) -> float:
    return sum(1 / d[k] if d[k] else 0 for d in rs) / len(rs) if rs else float("nan")


def ladder(draw: list[dict]) -> None:
    """Every stage, not only `top_6` — the brief's first question."""
    seq = [
        ("drawn", lambda d: True),
        ("publishable", lambda d: d["offerable"]),
        ("founder_screen", lambda d: d["rankTable"] is not None),
        ("gates_pass", lambda d: d["rankAccessible"] is not None),
        ("pool_cut@40", lambda d: bool(d["rankAccessible"]) and d["rankAccessible"] <= 40),
        ("writer_cap@7", lambda d: bool(d["rankWriter"]) and d["rankWriter"] <= 7),
        ("top_6", lambda d: bool(d["rankWriter"]) and d["rankWriter"] <= 6),
        ("top_5", lambda d: bool(d["rankWriter"]) and d["rankWriter"] <= 5),
        ("top_1", lambda d: d["rankWriter"] == 1),
    ]
    own = [d for d in draw if d["own"]]
    cross = [d for d in draw if not d["own"]]
    print("\n=== THE LADDER, BY STRATUM — where the 20 points enter ===")
    print(f"{'stage':16s} {'own n':>6s} {'own %':>8s} {'crs n':>6s} {'crs %':>8s} "
          f"{'gap':>7s} {'own|prev':>9s} {'crs|prev':>9s} {'NEW gap':>8s}")
    po = pc = None
    for name, f in seq:
        o = [d for d in own if f(d)]
        c = [d for d in cross if f(d)]
        go = 100 * len(o) / len(own)
        gc = 100 * len(c) / len(cross)
        co = 100 * len(o) / po if po else 100.0
        cc = 100 * len(c) / pc if pc else 100.0
        print(f"{name:16s} {len(o):6d} {go:7.2f}% {len(c):6d} {gc:7.2f}% {go - gc:+7.2f} "
              f"{co:8.2f}% {cc:8.2f}% {co - cc:+8.2f}")
        po, pc = len(o), len(c)
    pub_o = [d for d in own if d["offerable"]]
    pub_c = [d for d in cross if d["offerable"]]
    print(f"\n  reciprocal rank (writer order, miss=0), publishable denominator: "
          f"own {recip(pub_o, 'rankWriter'):.4f}  cross {recip(pub_c, 'rankWriter'):.4f}  "
          f"diff {recip(pub_o, 'rankWriter') - recip(pub_c, 'rankWriter'):+.4f}")
    print(f"  reciprocal rank (pool order):                                    "
          f"own {recip(pub_o, 'rankAccessible'):.4f}  cross {recip(pub_c, 'rankAccessible'):.4f}  "
          f"diff {recip(pub_o, 'rankAccessible') - recip(pub_c, 'rankAccessible'):+.4f}")
    print(f"  mean instrument-table rows: own {statistics.mean(d['tableLen'] for d in pub_o):.1f}  "
          f"cross {statistics.mean(d['tableLen'] for d in pub_c):.1f}  "
          "— the cross stratum searches a materially larger haystack")


def composition(draw: list[dict]) -> None:
    own = [d for d in draw if d["own"]]
    cross = [d for d in draw if not d["own"]]
    print("\n=== ARE THE STRATA EXCHANGEABLE? ===")
    for field in ("country", "sector", "group"):
        a = collections.Counter(d[field] for d in own)
        b = collections.Counter(d[field] for d in cross)
        tv = 0.5 * sum(abs(a[k] / len(own) - b[k] / len(cross)) for k in set(a) | set(b))
        top = sorted(set(a) | set(b), key=lambda k: -(a[k] + b[k]))[:6]
        label = "regime (opaque group id)" if field == "group" else field
        print(f"\n  {label}: total-variation distance {tv:.3f} over {len(set(a) | set(b))} values"
              f"   [own spans {len(a)}, cross spans {len(b)}]")
        for k in top:
            print(f"    {str(k)[:26]:26s} own {100 * a[k] / len(own):5.1f}%   "
                  f"cross {100 * b[k] / len(cross):5.1f}%   {100 * a[k] / len(own) - 100 * b[k] / len(cross):+6.1f}")


def award_records(draw: list[dict]) -> None:
    """Size, count and recency, straight off the register. READ-ONLY."""
    conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    cid = collections.defaultdict(list)
    for r in conn.execute("SELECT id, canonical_name, country FROM companies"):
        cid[(r["canonical_name"], r["country"] or "")].append(r["id"])
    ev = collections.defaultdict(list)
    for r in conn.execute("SELECT company_id, grant_amount_eur, project_started, project_ended "
                          "FROM public_funding_events WHERE is_duplicate = 0"):
        ev[r["company_id"]].append(dict(r))
    conn.close()

    def year(e: dict) -> int | None:
        for k in ("project_started", "project_ended"):
            v = e.get(k)
            if v and str(v)[:4].isdigit():
                return int(str(v)[:4])
        return None

    for d in draw:
        es = [e for i in cid.get((d["name"], d["country"]), []) for e in ev.get(i, [])]
        amts = [e["grant_amount_eur"] for e in es if e["grant_amount_eur"]]
        ys = [y for y in (year(e) for e in es) if y]
        d["n_awards"] = len(es)
        d["max_award"] = max(amts) if amts else None
        d["sum_award"] = sum(amts) if amts else None
        d["last_year"] = max(ys) if ys else None

    own = [d for d in draw if d["own"]]
    cross = [d for d in draw if not d["own"]]
    print("\n=== ... AND ON THE AWARD RECORD ITSELF ===")
    print(f"  {'field':12s} {'own median':>14s} {'cross median':>14s} {'ratio':>7s}   rank-sum p")
    for k in ("n_awards", "max_award", "sum_award", "last_year"):
        a = sorted(d[k] for d in own if d.get(k) is not None)
        b = sorted(d[k] for d in cross if d.get(k) is not None)
        ma, mb = statistics.median(a), statistics.median(b)
        print(f"  {k:12s} {ma:14,.0f} {mb:14,.0f} {mb / ma if ma else float('nan'):7.2f}x"
              f"   {mannwhitney_p(a, b):.1e}")
    print("\n  A company only HAS cross-regime text if it won under two regimes. The stratum")
    print("  is therefore a selection on being bigger and better documented — and it scores")
    print("  WORSE, because the funds those companies win are pan-European and crowded.")


def mannwhitney_p(a: list[float], b: list[float]) -> float:
    """Normal-approximation two-sided p, ties corrected. No scipy dependency."""
    allv = sorted(a + b)
    ranks: dict[float, float] = {}
    i = 0
    ties = 0.0
    while i < len(allv):
        j = i
        while j + 1 < len(allv) and allv[j + 1] == allv[i]:
            j += 1
        r = (i + j) / 2 + 1
        for v in allv[i:j + 1]:
            ranks[v] = r
        t = j - i + 1
        ties += t ** 3 - t
        i = j + 1
    n1, n2, n = len(a), len(b), len(a) + len(b)
    u = sum(ranks[v] for v in a) - n1 * (n1 + 1) / 2
    mu = n1 * n2 / 2
    sd = math.sqrt(n1 * n2 / 12 * ((n + 1) - ties / (n * (n - 1))))
    z = (u - mu) / sd if sd else 0.0
    return math.erfc(abs(z) / math.sqrt(2))


def mh(rs: list[dict], by: str, k: str, minn: int, informative_only: bool) -> tuple[float, int]:
    """Mantel-Haenszel style weighted average of WITHIN-stratum gaps.

    `informative_only` drops a stratum in which every founder hits or every
    founder misses. Such a stratum carries weight and no information, and one
    saturated regime of 109 founders otherwise pulls the whole estimate to zero
    while looking like evidence.
    """
    num = den = 0.0
    folds = 0
    for g in {d[by] for d in rs}:
        a = [d for d in rs if d[by] == g and d["own"]]
        b = [d for d in rs if d[by] == g and not d["own"]]
        if len(a) < minn or len(b) < minn:
            continue
        if informative_only and len({d[k] for d in a + b}) == 1:
            continue
        w = len(a) * len(b) / (len(a) + len(b))
        num += w * (rate(a, k) - rate(b, k))
        den += w
        folds += 1
    return (num / den if den else float("nan")), folds


def boot(rs: list[dict], fn, draws: int = 3000, seed: int = 20260819) -> tuple[float, float]:
    r = random.Random(seed)
    out = []
    for _ in range(draws):
        s = [rs[r.randrange(len(rs))] for _ in range(len(rs))]
        v = fn(s)
        if v == v:
            out.append(v)
    out.sort()
    return out[int(0.025 * len(out))], out[int(0.975 * len(out))]


def adjusted(draw: list[dict]) -> None:
    pub = [d for d in draw if d["offerable"]]
    print("\n=== THE 20 POINTS, ADJUSTED (publishable denominator, EXACT@6) ===")
    raw = (lambda s: rate([d for d in s if d["own"]], "hit6")
           - rate([d for d in s if not d["own"]], "hit6"))
    lo, hi = boot(pub, raw)
    print(f"  raw — wsIR's 52.05 vs 31.66             {raw(pub):+7.2f}   95% [{lo:+.2f}, {hi:+.2f}]")
    for by, label, minn in (("country", "within COUNTRY", 5), ("sector", "within SECTOR", 5),
                            ("group", "within REGIME", 3)):
        v, f = mh(pub, by, "hit6", minn, informative_only=True)
        lo, hi = boot(pub, lambda s, by=by, minn=minn: mh(s, by, "hit6", minn, True)[0])
        print(f"  {label:38s}{v:+7.2f}   95% [{lo:+.2f}, {hi:+.2f}]   {f} informative strata")
    v, f = mh(pub, "group", "pool", 3, informative_only=True)
    print(f"  {'within REGIME, at pool_cut':38s}{v:+7.2f}   {f} informative strata")
    both = {g for g in {d["group"] for d in pub}
            if sum(1 for d in pub if d["group"] == g and d["own"]) >= 3
            and sum(1 for d in pub if d["group"] == g and not d["own"]) >= 3}
    n = sum(1 for d in pub if d["group"] in both)
    print(f"\n  Regimes holding BOTH strata (>=3 each): {len(both)} of "
          f"{len({d['group'] for d in pub})}, covering {n}/{len(pub)} founders "
          f"({100 * n / len(pub):.0f}%). Provenance is nearly COLLINEAR with regime,")
    print("  which is the reason the within-regime interval is wide rather than a reason")
    print("  to prefer the raw number.")


def lengths(draw: list[dict]) -> None:
    print("\n=== LENGTH IS PROVENANCE, WHICH IS WHY THE OBSERVATIONAL CURVE SAYS NOTHING ===")
    for s in ("own_award_text", "own_project_title", "cross_regime_title", "cross_regime_summary"):
        b = [d for d in draw if d["descriptionSource"] == s]
        pubb = [d for d in b if d["offerable"]]
        L = sorted(d["len"] for d in b)
        print(f"  {s:22s} n={len(b):4d}  median {statistics.median(L):5.0f} chars  "
              f"p25 {L[len(L) // 4]:5d}  p75 {L[3 * len(L) // 4]:5d}   "
              f"EXACT@6 {rate(pubb, 'hit6'):5.1f}%")
    pub = [d for d in draw if d["offerable"]]
    print("\n  the observational curve, and the regime hiding inside it:")
    for lo, hi in ((12, 80), (80, 150), (150, 600), (600, 1100), (1100, 4000)):
        b = [d for d in pub if lo <= d["len"] < hi]
        if len(b) < 8:
            continue
        top = collections.Counter(d["group"] for d in b).most_common(1)[0]
        print(f"    {lo:5d}-{hi:<5d} n={len(b):4d}  EXACT@6 {rate(b, 'hit6'):5.1f}%   "
              f"largest regime {top[0]} carries {100 * top[1] / len(b):.0f}% of the band")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--draw", required=True)
    args = ap.parse_args()
    draw = load(Path(args.draw))
    print(f"trace {TRACE.name}, {len(draw)} founders, "
          f"{sum(d['own'] for d in draw)} own-words / {sum(1 - d['own'] for d in draw)} cross-regime")
    ladder(draw)
    composition(draw)
    award_records(draw)
    adjusted(draw)
    lengths(draw)


if __name__ == "__main__":
    main()
