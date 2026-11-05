"""Workstream AY: which fund-side attributes are STABLE enough to encode?

`_wsay_subsector.py` shows a subsector map scoring 39.4% top-5 when it may see
the awards it is predicting and 13.5% when it may not, on the same 1,546 pairs
against the same 11.2% baseline. That is the 34.5%/10.9% collapse again, and it
generalises into a test that should be run BEFORE any new discriminator is
proposed rather than after it has been built:

    An attribute of a fund is only worth matching a founder's answer against if
    the attribute is the SAME fund next year. Compute it on the fund's early
    awards, compute it on its late awards, and see whether the two agree.

An attribute that does not agree with itself across a cut year cannot separate a
call the corpus has not already seen -- and the calls a founder needs are mostly
calls the corpus has not already seen. This is not a proxy for the recall test;
it is the property the recall test was detecting, measured directly on the
corpus, on every leaf rather than on the ones that happen to appear in holdout.

Reported alongside a NAIVE floor for every attribute: the agreement you would get
by predicting the attribute's most common value across the whole regime, ignoring
the leaf. An attribute that only matches its floor is telling you about the
regime, not about the leaf.

Read-only.
"""
from __future__ import annotations

import hashlib
import os
import re
import sqlite3
import statistics
import sys
import unicodedata
from collections import Counter, defaultdict

import psycopg2
import psycopg2.extras

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib"))
from etl_env import DB  # noqa: E402

CUT = int(os.environ.get("CUT", "2023"))
MIN_SIDE = int(os.environ.get("MIN_SIDE", "8"))   # awards needed on EACH side
MIN_CHILD_EVENTS = 5

# The shipped bands, from lib/intelligence/types.ts TICKET_BANDS.
TICKET_BANDS = [("lt500k", 0, 500_000), ("b500k_2m5", 500_000, 2_500_000),
                ("b2m5_15m", 2_500_000, 15_000_000), ("b15m_50m", 15_000_000, 50_000_000),
                ("gt50m", 50_000_000, float("inf"))]
# A candidate finer low end. `lt500k` holds the great majority of Europe's
# national grant corpus, so the shipped scale spends four of its five bands on
# the tail and one on the body.
FINE_BANDS = [("lt25k", 0, 25_000), ("b25k_100k", 25_000, 100_000),
              ("b100k_500k", 100_000, 500_000), ("b500k_2m5", 500_000, 2_500_000),
              ("b2m5_15m", 2_500_000, 15_000_000), ("gt15m", 15_000_000, float("inf"))]


def band(v, bands):
    if v is None:
        return ""
    for name, lo, hi in bands:
        if lo <= float(v) < hi:
            return name
    return ""


def _digest(t): return hashlib.sha1(t.encode("utf-8")).hexdigest()[:6]


def child_slug(text: str) -> str:
    out = unicodedata.normalize("NFKD", text.lower())
    out = "".join(ch for ch in out if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "_", out).strip("_")[:48] or "unknown"


def source_to_family(source, families):
    best = ""
    for f in families:
        if (source == f or source.startswith(f + "_")) and len(f) > len(best):
            best = f
    return best or source


def main():
    pg = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = pg.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT id, parent_id FROM funding_instruments")
    insts = [dict(r) for r in cur.fetchall()]
    pg.close()
    by_id = {r["id"]: r for r in insts}
    families = {r["id"] for r in insts if not r["parent_id"]}
    regime_of = {r["id"]: (r["parent_id"] or r["id"]) for r in insts}

    sq = sqlite3.connect(DB)
    sq.row_factory = sqlite3.Row
    comp = {c["id"]: (c["sector_top"], c["subsector"], c["country"])
            for c in sq.execute("SELECT id, sector_top, subsector, country FROM companies")}
    programme_split = {r[0] for r in sq.execute("""
        SELECT source FROM public_funding_events
         WHERE programme_name IS NOT NULL AND programme_name != ''
         GROUP BY source HAVING COUNT(*) >= ? AND COUNT(DISTINCT programme_name) > 1
    """, (MIN_CHILD_EVENTS,))}

    rows = sq.execute("""
        SELECT e.source, e.company_id, e.programme_name, e.granting_authority, e.call_id,
               e.project_started, e.call_deadline, e.grant_amount_eur, e.equity_amount_eur,
               e.debt_amount_eur
          FROM public_funding_events e
          INNER JOIN v_european_companies c ON c.id = e.company_id
         WHERE COALESCE(e.is_duplicate, 0) = 0
    """).fetchall()

    early = defaultdict(list)   # leaf -> [(sector_top, subsector, amount, country)]
    late = defaultdict(list)
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
        if not year:
            continue
        amt = (r["grant_amount_eur"] or 0) + (r["equity_amount_eur"] or 0) + (r["debt_amount_eur"] or 0)
        st, ss, ct = comp.get(r["company_id"], (None, None, None))
        (early if year <= CUT else late)[leaf].append((st, ss, amt or None, ct))

    leaves = [l for l in set(early) & set(late)
              if len(early[l]) >= MIN_SIDE and len(late[l]) >= MIN_SIDE]
    print(f"cut={CUT}  leaves with >= {MIN_SIDE} awards on BOTH sides: {len(leaves)} "
          f"(of {len(by_id)} instruments)")

    def argmax(rows_, i):
        c = Counter(r[i] for r in rows_ if r[i])
        return c.most_common(1)[0][0] if c else None

    def med_band(rows_, bands):
        a = [r[2] for r in rows_ if r[2]]
        return band(statistics.median(a), bands) if a else None

    ATTRS = [
        ("sector_top argmax (11)", lambda rs: argmax(rs, 0)),
        ("subsector argmax (94)", lambda rs: argmax(rs, 1)),
        ("recipient country", lambda rs: argmax(rs, 3)),
        ("ticketBand of median award (shipped 5)", lambda rs: med_band(rs, TICKET_BANDS)),
        ("award band, finer low end (6)", lambda rs: med_band(rs, FINE_BANDS)),
        ("award decade (log10)", lambda rs: (
            None if not [r[2] for r in rs if r[2]]
            else str(len(str(int(statistics.median([r[2] for r in rs if r[2]])))))
        )),
    ]

    print(f"\n{'attribute':<40}{'agrees':>9}{'naive floor':>13}{'margin':>9}{'n':>7}")
    print("-" * 78)
    for label, fn in ATTRS:
        agree = n = 0
        # The naive floor: predict the REGIME's dominant early value for every
        # leaf. Beating it is the only thing that shows the attribute says
        # something about the LEAF rather than about the group it sits in.
        regime_early = defaultdict(list)
        for l in leaves:
            regime_early[regime_of[l]].extend(early[l])
        floor_hit = 0
        for l in leaves:
            a, b = fn(early[l]), fn(late[l])
            if a is None or b is None:
                continue
            n += 1
            agree += (a == b)
            floor_hit += (fn(regime_early[regime_of[l]]) == b)
        if not n:
            continue
        print(f"{label:<40}{agree / n:>9.0%}{floor_hit / n:>13.0%}"
              f"{(agree - floor_hit) / n:>+9.0%}{n:>7}")

    # ── Per-regime, for the families that actually bind ────────────────────────
    print(f"\n{'regime':<24}{'leaves':>7}   " +
          "".join(f"{lab.split(' ')[0][:10]:>12}" for lab, _ in ATTRS))
    by_reg = defaultdict(list)
    for l in leaves:
        by_reg[regime_of[l]].append(l)
    for reg, ls in sorted(by_reg.items(), key=lambda kv: -len(kv[1]))[:12]:
        if len(ls) < 5:
            continue
        line = f"{reg[:23]:<24}{len(ls):>7}   "
        for label, fn in ATTRS:
            a = [1 for l in ls if fn(early[l]) is not None and fn(early[l]) == fn(late[l])]
            d = [1 for l in ls if fn(early[l]) is not None and fn(late[l]) is not None]
            line += f"{(len(a) / len(d) if d else 0):>12.0%}"
        print(line)
    print("\nlegend:", ", ".join(f"{lab.split(' ')[0][:10]}={lab}" for lab, _ in ATTRS))


if __name__ == "__main__":
    main()
