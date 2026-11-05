"""Connect a policy signal to the funds it actually bears on.

── Why this is the gate ───────────────────────────────────────────────────
The memo's back half (Positioning, State of play) is written from web search.
We own a policy corpus that should ground it -- 3,752 relevant articles, 4,366
typed signals, running to 2026-07-24 -- but `article_entities` links a mention
to a COMPANY and there is nothing linking one to an INSTRUMENT. 3,547 programme
mentions exist and none is connected to a fund we hold.

Without that link a signal cannot be made relevant to THIS founder, and pasting
general EU policy news into a personalised memo is exactly what the web search
already does. So this table is the difference between grounding the memo in our
corpus and merely quoting the news.

── Matching, and why it abstains ──────────────────────────────────────────
Three passes, in descending authority, each recorded as its own `match_method`
so a later reader can weigh them differently:

  channel       "Horizon Europe", "EIC Accelerator" -> a source_family_bucket
                or a named instrument. Deterministic.
  name          the instrument's own name, normalised the way the NUTS name
                matching was: fold case and accents, compare on substance.
                480 register-grade fund names exist to match against now.
  body          an abbreviation against administering_body ("BMFTR", "ADEME").

**A mention resolving to more than one instrument records NOTHING.** The
precedent is the naming work: a wrong fund name is worse than an ugly one, and a
policy signal attached to the wrong fund is worse still, because it will be
quoted to a founder as a reason to act. Ambiguity is counted and reported, not
resolved by picking the largest.

Reads funding_instruments and the signals_* tables; writes only
signals_article_instrument_links.

Usage:
  python3 ETL/intelligence/transform/link_programme_mentions.py            # report
  python3 ETL/intelligence/transform/link_programme_mentions.py --write
  python3 ETL/intelligence/transform/link_programme_mentions.py --sample 20
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from store import connect  # noqa: E402

import argparse  # noqa: E402
import collections  # noqa: E402
import re  # noqa: E402
import unicodedata  # noqa: E402

# A mention shorter than this is an initialism that collides with everything
# ("EU", "DG"). The channel pass handles the real short ones explicitly.
MIN_NAME_LEN = 6

# Channel vocabulary: the phrases the press actually uses for the funding
# programmes we hold, mapped to source_family_bucket. Written out because the
# press does not use our internal bucket names -- nobody writes
# "horizon_eu_pillar_ii" -- and there is no other source for the correspondence.
# Kept small and checked against the measured head of the mention distribution.
CHANNEL_PHRASES = {
    "horizon europe": "horizon_eu_pillar_ii",
    "horizon 2020": "horizon_eu_pillar_ii",
    "fp10": "horizon_eu_pillar_ii",
    "european innovation council": "eic",
    "eic": "eic",
    "eic accelerator": "eic",
    "eic pathfinder": "eic",
    "eic transition": "eic",
    "eit": "eit",
    "european institute of innovation and technology": "eit",
    "innovation fund": "innovation_fund",
    "european defence fund": "edf",
    "edf": "edf",
    "chips joint undertaking": "chips_ju",
    "chips ju": "chips_ju",
    "european chips act": "chips_ju",
    "ipcei": "ipcei",
    "european investment bank": "eib",
    "eib": "eib",
    "invest eu": "eib",
    "investeu": "eib",
    # Sub-instruments and short forms the press uses for programmes we hold.
    "horizon": "horizon_eu_pillar_ii",
    "eic fund": "eic",
    "eic business acceleration services": "eic",
}

# Granting bodies the press names only in abbreviation. Resolved against
# administering_body, which carries the full legal name.
#
# Deliberately NOT extended to every abbreviation that appears: "ERC" is the
# European Research Council, which is Horizon PILLAR I and not in this corpus at
# all (we hold Pillar II), and mapping it to Horizon would attach basic-research
# policy to applied-research funds. A mention we do not hold should stay
# unresolved -- that is the honest outcome, not a coverage failure.
BODY_ABBREVIATIONS = {
    "bmftr": "bundesministerium",     # Forschung, Technologie und Raumfahrt
    "bmbf": "bundesministerium",      # its predecessor, still cited
    "bmwk": "bundesministerium",
}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def load_targets(con) -> tuple[dict, dict, dict]:
    """(channel -> [ids], normalised name -> [ids], normalised body -> [ids]).

    Ordered by id, so the link rows (and which mention_text survives the ON
    CONFLICT) are a function of the data rather than of a scan order."""
    rows = con.execute("""
        SELECT id, name, source_family_bucket, administering_body
        FROM funding_instruments WHERE is_framework = false
        ORDER BY id COLLATE "C"
    """).fetchall()

    by_channel: dict[str, list[str]] = collections.defaultdict(list)
    by_name: dict[str, list[str]] = collections.defaultdict(list)
    by_body: dict[str, list[str]] = collections.defaultdict(list)
    for r in rows:
        if r["source_family_bucket"]:
            by_channel[r["source_family_bucket"]].append(r["id"])
        n = norm(r["name"])
        # Machine descriptors ("SATR De Rnd") are not names the press uses, and
        # matching on them would attach German policy news to a regime row.
        if len(n) >= MIN_NAME_LEN and not n.startswith("satr "):
            by_name[n].append(r["id"])
        b = norm(r["administering_body"] or "")
        if len(b) >= MIN_NAME_LEN:
            by_body[b].append(r["id"])
    return by_channel, by_name, by_body


def resolve(mention: str, by_channel, by_name, by_body) -> tuple[list[str], str] | None:
    """(instrument ids, method), or None. Ambiguity returns None by design."""
    m = norm(mention)
    if not m:
        return None
    # 1. Channel. A channel phrase legitimately maps to many instruments -- the
    #    signal bears on the whole programme -- so this is the one pass where a
    #    one-to-many result is correct rather than ambiguous.
    if m in CHANNEL_PHRASES:
        ids = by_channel.get(CHANNEL_PHRASES[m], [])
        return (ids, "channel") if ids else None
    # 2. Exact instrument name.
    if m in by_name:
        ids = by_name[m]
        return (ids, "name") if len(ids) == 1 else None
    # 3a. Abbreviated body: match the full legal name it stands for.
    if m in BODY_ABBREVIATIONS:
        stem = BODY_ABBREVIATIONS[m]
        ids = [i for b, lst in by_body.items() if b.startswith(stem) for i in lst]
        if ids:
            return (ids, "body_abbrev")
    # 3. Administering body.
    if m in by_body:
        ids = by_body[m]
        return (ids, "body") if len(ids) == 1 else None
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--sample", type=int, default=0)
    args = ap.parse_args()

    with connect(readonly=not args.write, dict_rows=True) as con:
        _main(con, args)


def _main(con, args) -> None:
    by_channel, by_name, by_body = load_targets(con)
    mentions = con.execute("""
        SELECT e.id, e.article_id, e.mention_text
        FROM signals_article_entities e
        JOIN signals_articles a ON a.id = e.article_id
        WHERE e.entity_type = 'program' AND a.is_relevant = 1
        ORDER BY e.id
    """).fetchall()

    links: list[tuple] = []
    methods = collections.Counter()
    unmatched = collections.Counter()
    for e in mentions:
        got = resolve(e["mention_text"], by_channel, by_name, by_body)
        if not got:
            unmatched[e["mention_text"]] += 1
            continue
        ids, method = got
        methods[method] += 1
        for iid in ids:
            links.append((e["article_id"], iid, e["mention_text"], method))

    matched = sum(methods.values())
    print(f"programme mentions on relevant articles: {len(mentions)}")
    print(f"  resolved:   {matched}  ({100*matched/max(1,len(mentions)):.0f}%)")
    for k, v in methods.most_common():
        print(f"    {k:10} {v}")
    print(f"  unresolved: {len(mentions)-matched}  "
          f"({len(unmatched)} distinct mentions)")
    print(f"  link rows (a channel signal bears on every fund in it): {len(links)}")
    print(f"  distinct articles linked: {len({l[0] for l in links})}")

    if args.sample:
        print(f"\ntop unresolved mentions:")
        for t, n in unmatched.most_common(args.sample):
            print(f"   {n:>4}  {t[:64]}")

    if not args.write:
        print("\n[report only] --write to persist")
        return

    # A deterministic recomputation from the two tables above, so it is
    # rebuilt whole -- in ONE transaction: a reader sees the old set or the new
    # one, never an empty table. (The DDL lives in ETL/schema/corpus_schema.sql.)
    con.execute("DELETE FROM signals_article_instrument_links")
    con.cursor().executemany(
        """INSERT INTO signals_article_instrument_links
             (article_id, instrument_id, mention_text, match_method)
           VALUES (%s, %s, %s, %s)
           ON CONFLICT (article_id, instrument_id, match_method) DO NOTHING""", links)
    print(f"\nwrote {len(links)} links")


if __name__ == "__main__":
    main()
