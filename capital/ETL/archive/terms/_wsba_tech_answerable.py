"""Workstream BA: is the technology ceiling a QUESTION, or is it the fund catalogue?

`_wsay_ceilings.py` reports the @5 ceiling a perfect technology answer buys. This
script asks the question that number cannot answer on its own: at what VOCABULARY
SIZE is that ceiling earned?

A free-text label that names exactly one leaf separates that leaf perfectly and
teaches us nothing, because the intake cannot ask a founder to pick their fund out
of a 54-item list of the fund catalogue restated. wsAO's null-model discipline
applied to technology: if merely HAVING a label separates as well as the label's
VALUE, or if the ceiling collapses the moment the vocabulary is coarsened to
something a founder could actually be shown, then the ceiling is an artefact of
label granularity rather than a fact about the question.

So the headline here is not one number but a CURVE: ceiling@5 as a function of how
many options the question offers. A question that only works at 54 options is a
different product from one that works at 12.

Read-only. Reads the labels `_wsay_label_axes.py` cached and Postgres. Imports the
band/normalise helpers from `_wsay_ceilings.py` rather than restating them, so the
two scripts cannot drift apart.
"""
from __future__ import annotations

import json
import os
import sys
from collections import Counter, defaultdict

import psycopg2
import psycopg2.extras

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib"))
from _wsay_ceilings import FINE_BANDS, band, norm  # noqa: E402 — single source for the bands
from etl_env import ROOT  # noqa: E402

LABELS = ROOT / "data" / "wsay_leaf_axes.json"

# Words that carry no technology content. Deliberately tiny and generic: this is
# a stopword list for CLUSTERING, not a semantic register, and it must not encode
# any judgement about which technologies matter.
STOP = {
    "and", "or", "of", "for", "the", "a", "an", "in", "to", "with", "on", "by",
    "projects", "project", "development", "support", "programme", "program",
    "aid", "scheme", "fund", "funding", "sector", "industry", "systems", "system",
    "technology", "technologies", "solutions", "services", "management",
    "production", "research", "innovation", "new", "general", "other",
}


def tokens(label: str) -> list[str]:
    return [t for t in norm(label).replace("-", " ").replace("/", " ").split()
            if t not in STOP and len(t) > 2]


def coarsen(label: str, vocab: list[str]) -> str:
    """Map a free-text label onto the highest-ranked vocabulary term it contains.

    `vocab` is ordered most-frequent-first, so a label matches the broadest family
    it belongs to. A label matching nothing falls into one shared bucket, which is
    the honest representation of an "other / none of these" intake option.
    """
    if not norm(label):
        return ""          # unlabelled stays unlabelled; it is not a bucket
    ts = set(tokens(label))
    for term in vocab:
        if term in ts:
            return term
    return "#other"


def ceiling(groups, key):
    """Share of leaves whose residual class fits the five rows the product shows."""
    sizes = []
    for g in groups:
        cls = Counter(key(r) for r in g)
        sizes += [cls[key(r)] for r in g]
    n = len(sizes) or 1
    return (sum(sizes) / n,
            sum(1 for s in sizes if s == 1) / n,
            sum(1 for s in sizes if s <= 5) / n)


def main():
    db = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT id, parent_id, name, country, delivery_region, catchment_regions,
               award_p50
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

    labels = json.loads(LABELS.read_text()) if LABELS.exists() else {}

    def region_key(r):
        gs = [g for g in gates.get(r["id"], ()) if g["intake_field_resolved"] == "region"]
        sig = "|".join(sorted(
            f"region={json.dumps(g['value_spec'], sort_keys=True, default=str)}" for g in gs))
        return "|".join([sig, norm(r["delivery_region"]), norm(r["catchment_regions"])])

    def raw_tech(r):
        lab = labels.get(r["id"])
        if not lab:
            return ""
        return norm(lab.get("technology_label")) or norm(lab.get("sector_label"))

    # The two halves of the label, kept apart. The intake already asks `sector`
    # (11 values, first page) -- "what is your company". `technology_label` is
    # "what does your project do". Both come from the same pass over the same
    # official text, so comparing them at the SAME vocabulary size is the only
    # honest way to ask whether option C buys anything the intake cannot already
    # get from a question it is already paying for.
    def tech_only(r):
        lab = labels.get(r["id"])
        return norm(lab.get("technology_label")) if lab else ""

    def sector_only(r):
        lab = labels.get(r["id"])
        return norm(lab.get("sector_label")) if lab else ""

    by_regime = defaultdict(list)
    for r in insts:
        by_regime[r["parent_id"] or r["id"]].append(r)
    groups = {k: v for k, v in by_regime.items() if len(v) > 1}
    allg = list(groups.values())
    leaves = sum(len(v) for v in allg)
    labelled = sum(1 for g in allg for r in g if r["id"] in labels)
    print(f"corpus=postgres  multi-leaf regimes={len(groups)}  leaves={leaves}  "
          f"labelled={labelled} ({labelled / leaves:.0%})")

    # ── 1. How big is the vocabulary the ceiling is earned on? ────────────────
    print("\n" + "=" * 92)
    print("LABEL CARDINALITY — a label naming ONE leaf is the fund catalogue, not a question")
    print("=" * 92)
    print(f"{'regime':<24}{'leaves':>7}{'labels':>8}{'singletons':>12}{'leaves/label':>14}{'names':>7}")
    for reg, g in sorted(groups.items(), key=lambda kv: -len(kv[1]))[:14]:
        ts = [raw_tech(r) for r in g if r["id"] in labels]
        if not ts:
            continue
        c = Counter(t for t in ts if t)
        singles = sum(1 for v in c.values() if v == 1)
        names = len({norm(r["name"]) for r in g})
        print(f"{reg[:23]:<24}{len(g):>7}{len(c):>8}{singles:>12}"
              f"{len(ts) / max(len(c), 1):>14.2f}{names:>7}")

    # ── 2. The null models ────────────────────────────────────────────────────
    print("\n" + "=" * 92)
    print("TECHNOLOGY NULL MODEL — is it the technology, or is it having been named?")
    print("=" * 92)
    NULLS = [
        ("tech: free-text label VALUE", raw_tech),
        ("NULL: merely HAS a label", lambda r: "1" if raw_tech(r) else "0"),
        ("name (upper bound, cheating)", lambda r: norm(r["name"])),
    ]
    print(f"{'key':<44}{'mean class':>12}{'alone':>8}{'<=5':>8}")
    for lab, key in NULLS:
        m, a, f = ceiling(allg, key)
        print(f"{lab:<44}{m:>12.1f}{a:>8.0%}{f:>8.0%}")

    # ── 3. The curve: ceiling@5 as a function of how many options we offer ────
    freq = Counter()
    for g in allg:
        for r in g:
            for t in set(tokens(raw_tech(r))):
                freq[t] += 1
    ranked = [t for t, _ in freq.most_common()]

    print("\n" + "=" * 92)
    print("THE CURVE — ceiling@5 against the size of the list a founder is shown")
    print("=" * 92)
    print(f"{'vocabulary':<16}{'mean class':>12}{'alone':>8}{'<=5':>8}   {'ademe <=5':>10}{'vinnova <=5':>13}")
    ademe = [groups[k] for k in groups if k == "ademe_aid"]
    vinnova = [groups[k] for k in groups if k == "vinnova_grant"]
    # The final row is the raw label itself, not a coarsening of it: that is the
    # ceiling `_wsay_ceilings.py` reports, and it is the top of this curve.
    steps = [(f"top {k}", (lambda r, v=ranked[:k]: coarsen(raw_tech(r), v)))
             for k in (5, 10, 15, 20, 30, 50, 100)]
    n_labels = len({t for g in allg for r in g if (t := raw_tech(r))})
    steps.append((f"free text ({n_labels})", raw_tech))
    for tag, key in steps:
        m, a, f = ceiling(allg, key)
        ad = ceiling(ademe, key)[2] if ademe else float("nan")
        vi = ceiling(vinnova, key)[2] if vinnova else float("nan")
        print(f"{tag:<16}{m:>12.1f}{a:>8.0%}{f:>8.0%}   {ad:>10.0%}{vi:>13.0%}")

    # ── 4. Per regime, the honest comparison at a founder-answerable size ─────
    VOCAB = ranked[:20]
    print("\n" + "=" * 92)
    print("PER REGIME — region vs technology, at free text and at a 20-option list")
    print("=" * 92)
    print(f"{'regime':<24}{'n':>4}{'region':>9}{'tech(free)':>12}{'tech(20)':>10}"
          f"{'rgn+tech20':>12}{'labelled':>10}")
    for reg, g in sorted(groups.items(), key=lambda kv: -len(kv[1]))[:16]:
        cov = sum(1 for r in g if r["id"] in labels) / len(g)
        rg = ceiling([g], region_key)[2]
        tf = ceiling([g], raw_tech)[2]
        t20 = ceiling([g], lambda r: coarsen(raw_tech(r), VOCAB))[2]
        both = ceiling([g], lambda r: region_key(r) + "#" + coarsen(raw_tech(r), VOCAB))[2]
        print(f"{reg[:23]:<24}{len(g):>4}{rg:>9.0%}{tf:>12.0%}{t20:>10.0%}"
              f"{both:>12.0%}{cov:>10.0%}")

    # ── 4b. Does "what your project does" beat "what your company is"? ───────
    print("\n" + "=" * 92)
    print("PROJECT vs COMPANY — the same text, the same vocabulary size, two questions")
    print("=" * 92)
    print(f"{'vocabulary':<16}{'technology <=5':>16}{'sector <=5':>13}{'ademe tech':>12}"
          f"{'ademe sector':>14}")
    for k in (10, 15, 20, 30):
        v = ranked[:k]
        tk = lambda r, v=v: coarsen(tech_only(r), v)      # noqa: E731
        # The sector vocabulary must be built from sector labels, or it is being
        # scored against a word list chosen for a different question.
        sfreq = Counter(t for g in allg for r in g for t in set(tokens(sector_only(r))))
        sv = [t for t, _ in sfreq.most_common(k)]
        sk = lambda r, v=sv: coarsen(sector_only(r), v)   # noqa: E731
        print(f"{'top ' + str(k):<16}{ceiling(allg, tk)[2]:>16.0%}{ceiling(allg, sk)[2]:>13.0%}"
              f"{ceiling(ademe, tk)[2]:>12.0%}{ceiling(ademe, sk)[2]:>14.0%}")

    # ── 5. Can a rule fire on the answer at all? ──────────────────────────────
    # A ceiling is what the corpus COULD separate. The product can only act on it
    # through an encoded comparator. Counting them is what turns a ceiling into a
    # forecast, and wsAX's ADEME finding says the two are far apart.
    print("\n" + "=" * 92)
    print("REACHABILITY — leaves carrying ANY decidable comparator the answer could meet")
    print("=" * 92)
    print(f"{'regime':<24}{'n':>4}{'any filter gate':>17}{'region gate':>13}{'tech-shaped gate':>18}")
    TECHISH = {"sector", "activities", "useOfFunds", "developmentStage"}
    for reg, g in sorted(groups.items(), key=lambda kv: -len(kv[1]))[:14]:
        anyg = sum(1 for r in g if gates.get(r["id"]))
        rgn = sum(1 for r in g if any(x["intake_field_resolved"] == "region"
                                      for x in gates.get(r["id"], ())))
        tch = sum(1 for r in g if any(x["intake_field_resolved"] in TECHISH
                                      for x in gates.get(r["id"], ())))
        print(f"{reg[:23]:<24}{len(g):>4}{anyg:>17}{rgn:>13}{tch:>18}")


if __name__ == "__main__":
    main()
