"""Where funding of a given kind actually comes from, per country and sector.

The brief shows five funds. Which CHANNELS those five come from was decided by
text richness: EU programmes carry ~534 project titles per leaf and national
schemes carry zero, so every semantic signal favours the EU side and nothing
corrected for it. Measured against real awards in the six main markets:

    state_aid_satr         48,344 companies   77.8%
    horizon_eu_pillar_ii    8,974             14.5%
    eic                     1,369              2.2%

and the published table was close to the inverse. The product was systematically
showing the 22% and under-showing the 78%.

This emits P(channel | country, sector) from the corpus so the table's
composition follows where money is actually won. It is a prior, not a rule: it
names no fund and no channel, it is re-estimated on every run, and a country
whose funding really does come from EU programmes gets EU rows because that is
what its own data says.

Backed off deliberately. A (country, sector) cell with few observations would
memorise noise, so it falls back to (country) and then to the global shape once
below MIN_OBS.

── THE CLAUSE THAT DELETED THE LARGEST CHANNEL IN THE CORPUS (wsIO) ───────
Both arms below carried `i.parent_id IS NOT NULL`, and it removed TWO of the
corpus's eleven channels from every one of the artifact's 200 cells:
`national_dev_banks` -- 111k events, the won channel of 471 of the funnel's 897
founders -- and `eib`. Not down-weighted: ABSENT, which `shortlist.ts` reads as
`prior[c] ?? 0`, i.e. as the assertion that this channel is impossible here.

It was not there for a reason that survives the query. The clause is the
difference and nothing else: re-running this emitter with the clause reproduces
the shipped artifact's `global`, `byCountry` and `byCountrySector` EXACTLY, and
re-running it without reproduces them plus 46,273 `national_dev_banks`
companies, 148 `eib`, one more country cell and 21 more country+sector cells.

Three things had to be true before it could come out, and all three were
checked against the database rather than argued:

  NO DOUBLE COUNT   the UNION reduces to distinct (country, sector, channel,
                    COMPANY), so a company reached through a root AND its child
                    is one observation, not two.
  NO CHANNEL DRIFT  a child never sits in a different bucket from its parent --
                    683 of 683 parent/child pairs agree -- so a root-level row
                    cannot attribute a company to a channel its leaves are not
                    in. Nor can a source: 0 sources map to instruments in two
                    buckets.
  NO CHILD ROUTE    `national_dev_banks` has 131 child instruments carrying
                    22,539 events, and NEITHER arm can reach them: none has a
                    `funding_instrument_sources` row, and no event's `call_id`
                    matches their `scheme_code`. Its only route into this query
                    is the root-level source mapping the clause was deleting.
                    So the clause was not preferring leaves to aggregates; for
                    this channel it was the difference between all of it and
                    none of it.

── ABSENT IS NOT ZERO, AND THE PAYLOAD NOW SAYS WHICH IT MEANS ────────────
The defect above is one instance of a shape, and the shape is what is guarded:
a channel the corpus can offer, missing from a cell, was indistinguishable from
a channel this cell has measured at zero. That was true of 732 of the shipped
artifact's 1,800 (cell, channel) pairs -- including `state_aid_satr`, the
channel this file exists to promote, in 28 of them.

So two properties, both DERIVED from the corpus and naming no channel:

  1. `channels` is the corpus's own `source_family_bucket` vocabulary, and
     `assert_every_offerable_channel_observed` fails the emit when a channel
     with funded companies in the corpus lands with none in the prior. A
     twelfth channel is covered the day it is loaded, with no edit here.
  2. every cell is DENSE over the observed vocabulary: a channel not observed
     in a (country, sector) cell takes its country's value, and a channel not
     observed in a country takes the global one, renormalised. `?? 0` in the
     reader is then honest, because the only channels it can fall through on
     are the ones `unobserved` names -- the ones the corpus really has never
     funded anybody through.

── WHAT THIS ARTIFACT ACTUALLY MOVES, MEASURED BEFORE IT WAS FIXED ────────
Small, and stated here so the next person does not spend a workstream finding
out again. `channelPrior` is read at exactly two sites in `shortlist.ts`. The
row sort is NOT one of them and says so in its own comment; the channel
traversal order it does feed is re-sorted by a TOTAL comparator, so it survives
only between rows carrying no instrument id. The one live decision it makes is
the order of the BACKFILL -- which channels take the free slots up to
`MIN_CHANNELS_CONSIDERED`.

And `national_dev_banks` is the FIRST entry of `DEFAULT_INSTRUMENTS`, so it is
already in the pool before the backfill reads this file at all. Measured on the
funnel's 897, offline and free (`web/scripts/_wsio_prior.ts`): the
corrected prior changes the channel set for 14 founders, the won fund's rank for
5, EXACT@6 by 0 founders and mean reciprocal rank by -0.000005. An arm asserting
`national_dev_banks` is the ONLY channel that exists -- probability 1.0 in every
cell -- puts it in exactly the same 613 tables of 897 as the zero did.

The correction is right and it is not a lever. Fix it because an artifact that
says "impossible" about a third of the corpus is a lie the next reader will
believe, not because it buys accuracy.

── Leakage ────────────────────────────────────────────────────────────────
This is counted from the same events table the recall ground truth is drawn
from, and `shortlist.ts` reads it while `measure_recall.ts` grades the result.
So it is the same shape as the peer prior and subject to the same rule: a
replayed company must not have voted for the channel of the fund it won.

It shipped with no exclusion at all, which was not a decision -- nothing had
asked the question of this artifact. The rule now lives in
`ETL/lib/recall_holdout.py` and is on by default here as everywhere else.

The effect is small by construction and that is worth stating rather than
assuming: a cell is a distribution over four or five channels built from tens
of thousands of companies, so one company's vote moves it very little, and the
back-off floor means a cell too thin to absorb the loss is dropped rather than
skewed. Small is not zero, and "small" was the word used about the peer prior
too.

Usage:
  python3 ETL/terms/emit_channel_prior.py                     # leak-free
  python3 ETL/terms/emit_channel_prior.py --include-recall-set
  python3 ETL/terms/emit_channel_prior.py --out /tmp/x.json   # do not publish
"""
from __future__ import annotations
import os
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib")); break
from etl_env import ROOT, WEB  # noqa: E402
from recall_holdout import add_holdout_flags, resolve_holdout  # noqa: E402
import argparse, collections, json  # noqa: E402
from store import reader  # noqa: E402
from sector_label_key import name_key  # noqa: E402

OUT = WEB / "lib" / "intelligence" / "channelPrior.generated.json"
MIN_OBS = 40   # below this a cell is noise; back off rather than memorise it


def channel_vocabulary(c) -> list[str]:
    """Every channel the corpus can offer, from the corpus. Not a list here:
    a bucket loaded tomorrow is in the vocabulary tomorrow, and the assertion
    below then covers it without anybody remembering this file exists."""
    return sorted(r[0] for r in c.execute(
        "SELECT DISTINCT source_family_bucket FROM funding_instruments "
        "WHERE source_family_bucket IS NOT NULL"))


def funded_companies_per_channel(c) -> dict:
    """Distinct funded companies per channel, counted WITHOUT either of the two
    joins the prior is built from. That independence is the whole point: it is
    the second opinion that can tell "this channel funds nobody" apart from
    "our join cannot see this channel", which is the defect this file shipped
    with for as long as it has existed."""
    q = """
      SELECT i.source_family_bucket ch, COUNT(DISTINCT e.company_id) n
        FROM public_funding_events e
        JOIN funding_instrument_sources s ON s.source = e.source
        JOIN funding_instruments i ON i.id = s.instrument_id
       WHERE e.is_duplicate = 0 AND i.source_family_bucket IS NOT NULL
       GROUP BY 1
      UNION ALL
      SELECT i.source_family_bucket, COUNT(DISTINCT e.company_id)
        FROM public_funding_events e
        JOIN funding_instruments i ON i.scheme_code = e.call_id
       WHERE e.is_duplicate = 0 AND i.source_family_bucket IS NOT NULL
       GROUP BY 1"""
    out: dict = {}
    for ch, n in c.execute(q):
        out[ch] = max(out.get(ch, 0), n)
    return out


def assert_every_offerable_channel_observed(vocab, funded, observed) -> None:
    """A channel the corpus funds companies through MUST reach the prior.

    Absent and zero are different facts, and only one of them is allowed to be
    silent. A channel with no funded companies anywhere is legitimately absent
    and is named in `unobserved`; a channel with thousands of them and no
    observations here is a JOIN DEFECT, and it is the exact defect that removed
    `national_dev_banks` and `eib` from all 200 cells of the shipped artifact
    while `shortlist.ts` read the gap as probability zero.

    Names no channel. The test for the unseen case is the corpus itself."""
    broken = sorted(ch for ch in vocab if funded.get(ch, 0) > 0 and ch not in observed)
    if broken:
        raise SystemExit(
            "emit_channel_prior: REFUSING TO WRITE. "
            + ", ".join(f"{ch} funds {funded[ch]:,} companies in the corpus and has "
                        "0 observations in this prior" for ch in broken)
            + ". The reader is `prior[c] ?? 0`, so publishing this would assert that "
              "channel is impossible for every founder. Fix the query, not this check.")


def densify(cell: dict, fallback: dict) -> dict:
    """A cell holds a value for every channel observed anywhere, so `?? 0` in
    the reader can only fall through on a channel the corpus has never funded
    anybody through -- where 0 is the true fact rather than a missing one.

    The back-off was already the design; it was just per-CELL. A cell thin
    enough to be dropped whole falls back to its country and then to the
    global shape, and a channel thin enough to be absent from a cell that
    SURVIVED did not -- it read as zero. Same rule, applied per channel."""
    m = dict(fallback) | dict(cell)
    t = sum(m.values())
    return {k: round(v / t, 6) for k, v in m.items()} if t else {}


def main() -> None:
    ap = argparse.ArgumentParser()
    add_holdout_flags(ap)
    ap.add_argument("--out", default=None, help="write elsewhere; for measuring an "
                    "arm without publishing it")
    args = ap.parse_args()
    # READ-ONLY: this emitter has never written to the corpus.
    c = reader()
    holdout = resolve_holdout(args, c)
    vocab = channel_vocabulary(c)
    funded = funded_companies_per_channel(c)
    # Both joins: funding_instrument_sources cannot express a SATR child, so
    # without the scheme_code arm national schemes vanish entirely -- which is
    # exactly the blind spot this artifact exists to correct. And neither arm
    # filters on `parent_id` any more; see the header for the three facts that
    # had to hold before that clause could come out.
    #
    # The sector label is joined HERE, in Python, through sector_label_key: the
    # vault's key is Python's lowering, and neither SQLite's LOWER (ASCII only)
    # nor Postgres's (no final sigma) reproduces it. The SQL join this replaced
    # lost 8,725 companies' labels on SQLite and 757 pairs on Postgres.
    q = """
      SELECT co.country, co.canonical_name, i.source_family_bucket, co.id
        FROM public_funding_events e
        JOIN companies co ON co.id = e.company_id
        JOIN funding_instruments i ON i.scheme_code = e.call_id
       WHERE e.is_duplicate = 0 AND e.source LIKE 'satr%'
         AND i.source_family_bucket IS NOT NULL
      UNION
      SELECT co.country, co.canonical_name, i.source_family_bucket, co.id
        FROM public_funding_events e
        JOIN companies co ON co.id = e.company_id
        JOIN funding_instrument_sources s ON s.source = e.source
        JOIN funding_instruments i ON i.id = s.instrument_id
       WHERE e.is_duplicate = 0
         AND i.source_family_bucket IS NOT NULL"""
    label = {k: st for k, st in c.execute(
        "SELECT name_key, sector_top FROM company_sector_labels "
        "WHERE sector_top IS NOT NULL")}
    observed = set()
    for cc, name, ch, cid in c.execute(q):
        st = label.get(name_key(name, cc))
        if st is not None:
            observed.add((cc, st, ch, cid))
    bysec: dict = collections.defaultdict(collections.Counter)
    bycountry: dict = collections.defaultdict(collections.Counter)
    glob = collections.Counter()
    dropped = 0
    for cc, st, ch, cid in sorted(observed, key=repr):
        # The company is the unit here -- distinct (company, sector, channel)
        # rows -- so excluding by company id removes the whole of a test
        # company's vote, not one of its awards.
        if cid in holdout.ids:
            dropped += 1
            continue
        bysec[(cc, st)][ch] += 1
        bycountry[cc][ch] += 1
        glob[ch] += 1
    c.close()

    def norm(counter):
        t = sum(counter.values())
        return {k: round(v / t, 4) for k, v in counter.items()} if t else {}

    g = norm(glob)
    assert_every_offerable_channel_observed(vocab, funded, g)
    country = {k: densify(norm(v), g)
               for k, v in bycountry.items() if sum(v.values()) >= MIN_OBS}
    payload = {
        "_comment": "P(channel | country, sector), from distinct funded companies. "
                    "Emitted by ETL/terms/emit_channel_prior.py. Cells with fewer "
                    f"than {MIN_OBS} observations are omitted; the reader backs off "
                    "to country, then global. Every cell carries a value for every "
                    "channel in `channels` except those in `unobserved`, so a key "
                    "the reader does not find is a channel the corpus has never "
                    "funded anybody through -- never one this cell merely missed.",
        "minObservations": MIN_OBS,
        "channels": vocab,
        "unobserved": [ch for ch in vocab if ch not in g],
        "global": densify(g, {}),
        "byCountry": country,
        "byCountrySector": {
            f"{k[0]}|{k[1]}": densify(norm(v), country.get(k[0], g))
            for k, v in bysec.items() if sum(v.values()) >= MIN_OBS},
    }
    dest = _Path(args.out) if args.out else OUT
    dest.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n")
    print(f"channel prior -> {dest if args.out else _Path(os.path.relpath(dest, ROOT))}")
    print(f"  channels: {len(vocab)} in the corpus, {len(g)} observed, "
          f"unobserved {payload['unobserved'] or 'none'}")
    holdout.report()
    print(f"  (company,channel) observations dropped: {dropped:,}")
    print(f"  global: {sorted(payload['global'].items(), key=lambda x: -x[1])[:4]}")
    print(f"  country cells {len(payload['byCountry'])}, country+sector cells {len(payload['byCountrySector'])}")


if __name__ == "__main__":
    main()
