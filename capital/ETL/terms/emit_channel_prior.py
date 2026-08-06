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
"""
from __future__ import annotations
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib")); break
from etl_env import DB, ROOT  # noqa: E402
from recall_holdout import add_holdout_flags, resolve_holdout  # noqa: E402
import argparse, collections, json, sqlite3  # noqa: E402

OUT = ROOT / "website" / "frontend" / "lib" / "intelligence" / "channelPrior.generated.json"
MIN_OBS = 40   # below this a cell is noise; back off rather than memorise it


def main() -> None:
    ap = argparse.ArgumentParser()
    add_holdout_flags(ap)
    args = ap.parse_args()
    c = sqlite3.connect(DB); c.row_factory = sqlite3.Row
    holdout = resolve_holdout(args, c)
    # Both joins: funding_instrument_sources cannot express a SATR child, so
    # without the scheme_code arm national schemes vanish entirely -- which is
    # exactly the blind spot this artifact exists to correct.
    q = """
      SELECT co.country cc, l.sector_top st, i.source_family_bucket ch, co.id cid
        FROM public_funding_events e
        JOIN companies co ON co.id = e.company_id
        JOIN company_sector_labels l ON l.name_key = LOWER(co.canonical_name)||'|'||co.country
        JOIN funding_instruments i ON i.scheme_code = e.call_id
       WHERE e.is_duplicate = 0 AND i.parent_id IS NOT NULL AND e.source LIKE 'satr%'
         AND l.sector_top IS NOT NULL AND i.source_family_bucket IS NOT NULL
      UNION
      SELECT co.country, l.sector_top, i.source_family_bucket, co.id
        FROM public_funding_events e
        JOIN companies co ON co.id = e.company_id
        JOIN company_sector_labels l ON l.name_key = LOWER(co.canonical_name)||'|'||co.country
        JOIN funding_instrument_sources s ON s.source = e.source
        JOIN funding_instruments i ON i.id = s.instrument_id
       WHERE e.is_duplicate = 0 AND i.parent_id IS NOT NULL
         AND l.sector_top IS NOT NULL AND i.source_family_bucket IS NOT NULL"""
    bysec: dict = collections.defaultdict(collections.Counter)
    bycountry: dict = collections.defaultdict(collections.Counter)
    glob = collections.Counter()
    dropped = 0
    for r in c.execute(q):
        # The company is the unit here -- the query UNIONs to distinct
        # (company, channel) rows -- so excluding by company id removes the
        # whole of a test company's vote, not one of its awards.
        if r["cid"] in holdout.ids:
            dropped += 1
            continue
        bysec[(r["cc"], r["st"])][r["ch"]] += 1
        bycountry[r["cc"]][r["ch"]] += 1
        glob[r["ch"]] += 1
    c.close()

    def norm(counter):
        t = sum(counter.values())
        return {k: round(v / t, 4) for k, v in counter.items()} if t else {}

    payload = {
        "_comment": "P(channel | country, sector), from distinct funded companies. "
                    "Emitted by ETL/terms/emit_channel_prior.py. Cells with fewer "
                    f"than {MIN_OBS} observations are omitted; the reader backs off "
                    "to country, then global.",
        "minObservations": MIN_OBS,
        "global": norm(glob),
        "byCountry": {k: norm(v) for k, v in bycountry.items() if sum(v.values()) >= MIN_OBS},
        "byCountrySector": {f"{k[0]}|{k[1]}": norm(v)
                            for k, v in bysec.items() if sum(v.values()) >= MIN_OBS},
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n")
    print(f"channel prior -> {OUT.relative_to(ROOT)}")
    holdout.report()
    print(f"  (company,channel) observations dropped: {dropped:,}")
    print(f"  global: {sorted(payload['global'].items(), key=lambda x: -x[1])[:4]}")
    print(f"  country cells {len(payload['byCountry'])}, country+sector cells {len(payload['byCountrySector'])}")


if __name__ == "__main__":
    main()
