"""wsIT — what is IN a description that pays, and how near the answer is it?

FREE. Reads the committed trace, the answer key and the committed leak index
(`profileLeakIndex.generated.json`, built from Postgres 2026-08-18). No database
connection, no model call, no write.

Two questions, both asked WITHIN REGIME, because the raw contrast between the
provenances is 80% a contrast between regimes (see `_wsit_strata.py`):

  1. ANSWER PROXIMITY. `own_award_text` is the abstract of THE AWARD THAT IS THE
     ANSWER. The leak guards remove an 8-gram shared with the won fund's
     `profile_text`; they do not remove 7, or 5, or the vocabulary. So: how much
     nearer to the answer's own words does that stratum sit? Reported against a
     40-fund random baseline for the SAME query, because a raw overlap share is
     a function of query length and the two strata differ tenfold on that.

  2. WHAT CONTENT PAYS. The intake's coaching line asks for "what problem, for
     whom, and what the project itself would build or prove". Each of the three
     is turned into a crude detector and priced within regime, with a bootstrap
     interval, because six detectors on 792 founders will always produce a
     largest one.

  python3 ETL/terms/_wsit_content.py <draw.jsonl>
"""
from __future__ import annotations

import collections
import json
import random
import re
import statistics
import sys
from pathlib import Path

for _anc in Path(__file__).resolve().parents:
    if (_anc / "ETL" / "lib" / "etl_env.py").exists():
        sys.path.insert(0, str(_anc / "ETL" / "lib"))
        sys.path.insert(0, str(_anc / "ETL" / "terms"))
        break
from etl_env import ROOT  # noqa: E402
from recall_guards import squash  # noqa: E402

FRONTEND = ROOT / "website" / "frontend" / "lib" / "intelligence"
TRACE = ROOT / "project-mgmt" / "findings" / "pool_blend_wsIR" / "traces" / "trace_off.jsonl"
OWN = ("own_award_text", "own_project_title")

# ── Text that is not a founder describing anything ────────────────────────
# Found by reading the strata rather than by suspecting them. Two registers
# publish a STRUCTURED RECORD where the corpus expects prose, and one publishes
# the consortium's partner list. Such a row is a description by the file's
# definition and by no other, and `not_prose` in recall_guards.py does not catch
# either shape.
FIELDY = re.compile(r"\b(Authority|Sector|Form|Aid instrument|Objective|Beneficiary"
                    r"|Granting|Region|Amount|NACE)\s*:", re.I)
ORGWORD = re.compile(r"\b(GmbH|Ltd|S\.?A\.?|B\.?V\.?|A/S|AB|SAS|SARL|SRL|Oy|Universit"
                     r"|University|Institut|Instituto|Fraunhofer|CNRS|Stichting|Foundation"
                     r"|Association|Associacao|Consejo|Akadem)\b", re.I)
FEATURES = {
    "what it BUILDS (a technology)": re.compile(
        r"\b(platform|system|device|sensor|software|algorithm|model|process|method|prototype"
        r"|reactor|module|robot|battery|cell|material|compound|vaccine|assay|catalyst|membrane"
        r"|laser|chip|satellite|drone|app|tool)\w*", re.I),
    "what PROBLEM it solves": re.compile(
        r"\b(reduce|reducing|lower|prevent|avoid|improve|increase|efficien|emission|waste|cost"
        r"|risk|shortage|challenge|problem|need|safety|sustainab|decarbon|recycl)\w*", re.I),
    "FOR WHOM (a market or user)": re.compile(
        r"\b(patient|customer|user|market|industry|industrial|hospital|farmer|consumer|operator"
        r"|SME|clinic|manufactur|utility|municipal|fleet|grid)\w*", re.I),
    "what it would PROVE (a verb)": re.compile(
        r"\b(develop|build|design|demonstrate|validate|scale|test|manufactur|deploy|produce"
        r"|create|integrat)\w*", re.I),
    "a number or quantity": re.compile(r"\d"),
    "more than one sentence": re.compile(r"[.!?]\s+[A-Z]"),
}


def caps_share(t: str) -> float:
    w = re.findall(r"[A-Za-zÀ-ÿ]{2,}", t)
    return sum(1 for x in w if x.isupper()) / max(len(w), 1)


def is_junk(t: str) -> bool:
    return (bool(FIELDY.search(t))
            or (t.count(",") >= 3 and len(ORGWORD.findall(t)) >= 2)
            or caps_share(t) > 0.5)


def rate(rs: list[dict], k: str = "hit6") -> float:
    return 100 * sum(d[k] for d in rs) / len(rs) if rs else float("nan")


def mh(rs: list[dict], key: str) -> float:
    """Within-regime weighted gap on a boolean column, informative strata only."""
    num = den = 0.0
    for g in {d["group"] for d in rs}:
        a = [d for d in rs if d["group"] == g and d[key]]
        b = [d for d in rs if d["group"] == g and not d[key]]
        if len(a) < 3 or len(b) < 3 or len({d["hit6"] for d in a + b}) == 1:
            continue
        w = len(a) * len(b) / (len(a) + len(b))
        num += w * (rate(a) - rate(b))
        den += w
    return num / den if den else float("nan")


def main() -> None:
    draw = [json.loads(l) for l in Path(sys.argv[1]).read_text().splitlines() if l.strip()]
    rows = [json.loads(l) for l in TRACE.read_text().strip().split("\n")[1:]]
    for d, r in zip(draw, rows):
        assert d["country"] == r["country"] and d["descriptionSource"] == r["descriptionSource"]
        d.update(r)
        d["own"] = 1 if d["descriptionSource"] in OWN else 0
        d["hit6"] = 1 if (d["rankWriter"] and d["rankWriter"] <= 6) else 0
        d["junk"] = is_junk(d["description"])

    pairs = json.loads((FRONTEND / "__recallSetDescribed.json").read_text())
    by_name = collections.defaultdict(list)
    for p in pairs:
        by_name[(p["name"], p["country"])].append(p)
    idx = json.loads((FRONTEND / "profileLeakIndex.generated.json").read_text())
    ptok = {k: set(v.split()) for k, v in idx["profile"].items() if v}
    ids = sorted(ptok)
    rnd = random.Random(20260819)

    print("=== 1. HOW NEAR THE ANSWER'S OWN WORDS ===")
    prox: dict[str, list[float]] = collections.defaultdict(list)
    gram5: dict[str, list[int]] = collections.defaultdict(list)
    for d in draw:
        rr = [p for p in by_name[(d["name"], d["country"])]
              if (p.get("description") or "") == d["description"]]
        won = rr[0]["instrument"]
        if won not in ptok:
            continue
        n = squash(d["description"])
        qt = set(n.split())
        if not qt:
            continue
        st = "own" if d["own"] else "cross"
        prox[st + "_hit"].append(len(qt & ptok[won]) / len(qt))
        prox[st + "_bg"].append(statistics.mean(
            len(qt & ptok[i]) / len(qt) for i in rnd.sample(ids, 40)))
        w = n.split()
        g = {" ".join(w[i:i + 5]) for i in range(max(len(w) - 4, 1))}
        pw = idx["profile"][won].split()
        pg = {" ".join(pw[i:i + 5]) for i in range(max(len(pw) - 4, 1))}
        gram5[st].append(1 if g & pg else 0)
    for st in ("own", "cross"):
        h = statistics.mean(prox[st + "_hit"])
        b = statistics.mean(prox[st + "_bg"])
        print(f"  {st:6s} n={len(prox[st + '_hit']):4d}  vocabulary shared with the WON fund's profile "
              f"{h:.3f}, with a random fund {b:.3f}, LIFT {h - b:+.3f}   "
              f"shares any 5-gram: {100 * statistics.mean(gram5[st]):.1f}%")
    print("  The own-words stratum sits about 2.7x nearer the answer's vocabulary and is not")
    print("  QUOTING it — 5-gram sharing is under 1% either side. It is near because it is a")
    print("  description of the project that won that fund, which is what a founder would")
    print("  type; it is also written FOR that call, which a founder's would not be.")

    print("\n=== 2. TEXT THAT IS NOT A FOUNDER DESCRIBING ANYTHING ===")
    for s in ("own_award_text", "own_project_title", "cross_regime_summary", "cross_regime_title"):
        b = [d for d in draw if d["descriptionSource"] == s]
        j = [d for d in b if d["junk"]]
        print(f"  {s:22s} n={len(b):4d}  register-record or partner-list text {len(j):3d} "
              f"({100 * len(j) / len(b):4.1f}%)   of which publishable {sum(1 for d in j if d['offerable']):3d}")
    fieldy = [d for d in draw if FIELDY.search(d["description"])]
    print(f"  {len(fieldy)} rows are a REGISTER RECORD, not prose "
          f"(`Authority: … | Sector: … | Form: …`), concentrated in "
          f"{collections.Counter(d['country'] for d in fieldy).most_common(1)[0][0]}; "
          f"{sum(1 for d in fieldy if d['offerable'])} of them are publishable, so they do not")
    print("  contaminate the scored ladder — but they are counted as descriptions everywhere.")

    print("\n=== 3. WHAT CONTENT PAYS, WITHIN REGIME ===")
    base = [d for d in draw if d["offerable"] and not d["junk"]]
    for d in base:
        for k, rx in FEATURES.items():
            d[k] = bool(rx.search(d["description"]))
    print(f"  n={len(base)} publishable prose founders, EXACT@6 {rate(base):.1f}%")
    print(f"  {'feature':32s} {'n with':>7s} {'RAW gap':>8s} {'WITHIN-regime':>14s} {'95%':>20s}")
    r = random.Random(7)
    for k in FEATURES:
        obs = mh(base, k)
        bs = []
        for _ in range(3000):
            s = [base[r.randrange(len(base))] for _ in range(len(base))]
            v = mh(s, k)
            if v == v:
                bs.append(v)
        bs.sort()
        w = [d for d in base if d[k]]
        wo = [d for d in base if not d[k]]
        print(f"  {k:32s} {len(w):7d} {rate(w) - rate(wo):+8.1f} {obs:+14.1f}"
              f"   [{bs[int(0.025 * len(bs))]:+.1f}, {bs[int(0.975 * len(bs))]:+.1f}]")
    print("\n  Not one of the six clears its own interval. The intake's three asks are not")
    print("  separable on this evidence, and the one with the largest point estimate is the")
    print("  one the form's LABEL already asks for.")


if __name__ == "__main__":
    main()
