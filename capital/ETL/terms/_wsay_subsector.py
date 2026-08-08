"""Workstream AY: would the subsector we ALREADY hold separate the siblings?

Before proposing to ask a founder anything, price the field we have. The corpus
carries a two-tier company taxonomy -- 11 `sector_top`, 94 `subsector` -- and 81%
of companies carry a subsector. `sector` (the 11-value top tier) is already an
intake field, and `sectorFit` already ranks on it. So the question is not "does
subsector carry signal" but "does the 94-value tier carry signal the 11-value
tier does not ALREADY have", and does that margin survive the tests that killed
the last thing built this way.

── How this is measured, and why the fund side is an UPPER BOUND ───────────────
The founder side is honest: a company's subsector is a property of the company,
derived from NACE, and a company with no funding history has one.

The FUND side is deliberately generous. To score a leaf against a subsector we
need to know which subsectors that leaf funds, and the only per-leaf evidence is
who it has already paid -- award history. Rule Zero says what a fund IS comes
from official sources, not our own columns, so this is NOT a proposal to encode
subsector footprints. It is a ceiling: if the most generous possible fund-side
map cannot separate the siblings, no honest map can.

── Three guards, of increasing severity ────────────────────────────────────────
  * LOO       the company being graded never votes for any leaf's footprint.
  * PEER      the whole holdout split is withheld from every footprint, which is
              the same rule populate_funding_instruments applies to `sector_mix`.
  * TEMPORAL  footprints are built from awards up to a cut year and graded only
              on awards after it.

TEMPORAL is the one that decides this. It is not a stricter PEER, it is a
DIFFERENT question, and it is the exact test that killed the last posterior
fitted on award history: `CONTINUE_HERE.md` records sector mix fitted to a cut
year at **34.5% @1 in-sample against 10.9% out-of-sample**, floor 6.7%, with the
note "this is what overfitting looks like here, and it governs the design". PEER
asks whether the map generalises to a new COMPANY; TEMPORAL asks whether it
generalises to a new CALL -- and a regime's leaves are largely new calls. A
number that survives PEER and dies under TEMPORAL is that artifact under a new
name, and must be reported as one.

── The null model that could kill it either way ────────────────────────────────
`FIT=size` scores each leaf on how many awards it has made and ignores the
founder's subsector entirely. Any smoothed posterior over 94 classes flatters big
leaves, and the biggest leaf of a regime is also the one most companies win. If
`size` scores near `sub`, the lift is a popularity prior wearing a taxonomy's
clothes -- the mistake that cost the objective prior 21 points and the sector
posterior 2.

Read-only.

    GUARD=peer|loo|temporal|none      CUT=2023      FIT=posterior|size
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import sys
import unicodedata
from collections import Counter, defaultdict

import psycopg2
import psycopg2.extras

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib"))
from etl_env import DB, ROOT  # noqa: E402

RECALL = ROOT / "website/frontend/lib/intelligence/__recallSetComposed.json"
GUARD = os.environ.get("GUARD", "peer")
CUT = int(os.environ.get("CUT", "2023"))
FIT = os.environ.get("FIT", "posterior")
# POP is deliberately ORTHOGONAL to GUARD. Restricting the footprint to the past
# and restricting the graded pairs to the future are two different changes, and
# a run that makes both at once cannot say which one moved the number: the
# post-cut pairs sit in wider regimes, so their uniform baseline is lower before
# any signal is measured. `POP=post_cut GUARD=peer` holds the population fixed
# at the post-cut pairs and gives the map the FULL history, which is the control
# that separates "the map does not generalise" from "the map got thinner".
POP = os.environ.get("POP", "all")
MIN_CHILD_EVENTS = 5


def _digest(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:6]


def child_slug(text: str) -> str:
    out = unicodedata.normalize("NFKD", text.lower())
    out = "".join(ch for ch in out if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "_", out).strip("_")[:48] or "unknown"


def source_to_family(source: str, families: set[str]) -> str:
    best = ""
    for f in families:
        if (source == f or source.startswith(f + "_")) and len(f) > len(best):
            best = f
    return best or source


def main():
    pg = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = pg.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT id, parent_id, name, country FROM funding_instruments")
    insts = [dict(r) for r in cur.fetchall()]
    pg.close()
    by_id = {r["id"]: r for r in insts}
    families = {r["id"] for r in insts if not r["parent_id"]}
    by_regime = defaultdict(list)
    for r in insts:
        by_regime[r["parent_id"] or r["id"]].append(r["id"])

    sq = sqlite3.connect(DB)
    sq.row_factory = sqlite3.Row
    comp_tax = {cid: (st, ss) for cid, st, ss
                in sq.execute("SELECT id, sector_top, subsector FROM companies")}
    name_tax = {(n, ct): (st, ss) for n, ct, st, ss
                in sq.execute("SELECT lower(canonical_name), country, sector_top, subsector "
                              "FROM companies")}
    # A recall row names a company; the guards need its id, not its labels.
    name_id = {(n, ct): cid for cid, n, ct
               in sq.execute("SELECT id, lower(canonical_name), country FROM companies")}

    programme_split = {r[0] for r in sq.execute("""
        SELECT source FROM public_funding_events
         WHERE programme_name IS NOT NULL AND programme_name != ''
         GROUP BY source HAVING COUNT(*) >= ? AND COUNT(DISTINCT programme_name) > 1
    """, (MIN_CHILD_EVENTS,))}

    # Same split key as populate_funding_instruments, and the same year rule.
    rows = sq.execute("""
        SELECT e.source, e.company_id, e.programme_name, e.granting_authority, e.call_id,
               e.project_started, e.call_deadline
          FROM public_funding_events e
          INNER JOIN v_european_companies c ON c.id = e.company_id
         WHERE COALESCE(e.is_duplicate, 0) = 0
    """).fetchall()

    holdout_names = set()
    recall = json.load(open(RECALL))
    for r in recall:
        if r["split"] == "holdout":
            holdout_names.add((r["name"].lower().strip(), r["country"]))
    hold_ids = {cid for cid, n, ct in
                sq.execute("SELECT id, lower(canonical_name), country FROM companies")
                if (n, ct) in holdout_names}

    # leaf -> list of (company_id, sector_top, subsector, year)
    awards: dict[str, list] = defaultdict(list)
    # (company_id, leaf) -> latest award year, so a pair can be dated.
    pair_year: dict[tuple, int] = {}
    placed = 0
    for r in rows:
        fam = source_to_family(r["source"], families)
        prog = (r["programme_name"] or "").strip()
        if prog and r["source"] in programme_split:
            leaf = f"{fam}__{child_slug(prog)}_{_digest(prog[:200])}"
        elif r["granting_authority"] and r["call_id"]:
            leaf = f"{fam}__{child_slug(r['call_id'])}__{child_slug(r['granting_authority'][:200])}"
        else:
            leaf = fam
        if leaf not in by_id:
            leaf = fam
        if leaf not in by_id:
            continue
        year = None
        for d in (r["project_started"], r["call_deadline"]):
            if d:
                try:
                    year = int(str(d)[:4])
                except ValueError:
                    year = None
                break
        placed += 1
        st, ss = comp_tax.get(r["company_id"], (None, None))
        awards[leaf].append((r["company_id"], st, ss, year))
        if year:
            k = (r["company_id"], leaf)
            pair_year[k] = max(pair_year.get(k, year), year)

    dated = sum(1 for v in awards.values() for a in v if a[3])
    print(f"corpus=sqlite awards placed on a leaf: {placed} of {len(rows)}  "
          f"({100 * dated / max(placed, 1):.0f}% dated)")
    print(f"GUARD={GUARD}  FIT={FIT}  POP={POP}" + (f"  CUT={CUT}" if GUARD == "temporal" or POP == "post_cut" else ""))

    def footprint(leaf: str, exclude_company=None):
        """(Counter(sector_top), Counter(subsector), total) under the active guard."""
        top, sub, n = Counter(), Counter(), 0
        for cid, st, ss, year in awards.get(leaf, ()):
            if cid == exclude_company:
                continue                                   # LOO always applies
            if GUARD == "peer" and cid in hold_ids:
                continue
            if GUARD == "temporal" and (year is None or year > CUT):
                continue
            n += 1
            if st:
                top[st] += 1
            if ss:
                sub[ss] += 1
        return top, sub, n

    # PEER and TEMPORAL footprints do not depend on the graded company, so they
    # are computed once. LOO does, so it is computed per pair.
    static = None
    if GUARD in ("peer", "temporal", "none"):
        static = {leaf: footprint(leaf) for leaf in by_id}

    NCLASS = 94

    def score(leaf: str, value: str, grain: str, company) -> float:
        top, sub, n = static[leaf] if static is not None else footprint(leaf, company)
        if FIT == "size":
            # The null model: how much has this leaf paid out, and nothing else.
            return n
        c = sub if grain == "sub" else top
        if not c:
            return 0.0
        return (c.get(value, 0) + 0.5) / (sum(c.values()) + 0.5 * NCLASS)

    results = {}
    for grain, label in (("sub", "subsector (94)"), ("top", "sector_top (11)")):
        if FIT == "size" and grain == "top":
            continue                                        # size ignores grain
        top1 = top5 = unif1 = unif5 = 0.0
        graded = no_label = 0
        acc = defaultdict(lambda: [0.0, 0.0, 0])
        for r in recall:
            if r["split"] != "holdout":
                continue
            leaf = r["instrument"]
            inst = by_id.get(leaf)
            if not inst:
                continue
            reg = inst["parent_id"] or inst["id"]
            sibs = by_regime[reg]
            if len(sibs) < 2:
                continue
            key = (r["name"].lower().strip(), r["country"])
            st, ss = name_tax.get(key, (None, None))
            cid = name_id.get(key)
            # Date the pair: only grade the awards this company won AFTER the
            # cut, so the map has never seen the call it is being asked about.
            if GUARD == "temporal" or POP == "post_cut":
                y = pair_year.get((cid, leaf))
                if y is None or y <= CUT:
                    continue
            v = ss if grain == "sub" else st
            graded += 1
            base1 = 1.0 / len(sibs)
            base5 = min(5, len(sibs)) / len(sibs)
            unif1 += base1
            unif5 += base5
            acc[reg][1] += base5
            acc[reg][2] += 1
            if not v and FIT != "size":
                no_label += 1
                top1 += base1
                top5 += base5
                acc[reg][0] += base5
                continue
            won = score(leaf, v, grain, None)
            better = tied = 0
            for x in sibs:
                s = score(x, v, grain, None)
                if s > won:
                    better += 1
                elif s == won:
                    tied += 1
            top1 += (1.0 / tied) if better == 0 else 0.0
            slots5 = max(0, min(5 - better, tied))
            top5 += slots5 / tied
            acc[reg][0] += slots5 / tied
        if not graded:
            print(f"\n── {label}: no graded pairs under this guard")
            continue
        results[label] = acc
        print(f"\n── {label} · {graded} graded holdout pairs in multi-leaf regimes")
        if FIT != "size":
            print(f"   unlabelled founders (get chance): {no_label} ({no_label / graded:.0%})")
        print(f"   top-1  {top1 / graded:6.1%}   uniform {unif1 / graded:6.1%}   "
              f"lift {(top1 - unif1) / graded:+.1%}")
        print(f"   top-5  {top5 / graded:6.1%}   uniform {unif5 / graded:6.1%}   "
              f"lift {(top5 - unif5) / graded:+.1%}")

    for label, acc in results.items():
        print(f"\n{label}: per-regime top-5, regimes with >=20 graded pairs")
        print(f"   {'regime':<26}{'n':>5}{'sibs':>6}{'top5':>8}{'uniform':>9}{'lift':>8}")
        for reg, (got, uni, n) in sorted(acc.items(), key=lambda kv: -kv[1][2]):
            if n < 20:
                continue
            print(f"   {reg[:25]:<26}{n:>5}{len(by_regime[reg]):>6}"
                  f"{got / n:>8.1%}{uni / n:>9.1%}{(got - uni) / n:>+8.1%}")


if __name__ == "__main__":
    main()
