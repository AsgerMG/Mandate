"""Where each fund's money actually lands, as something gate 2 can route on.

── The problem this exists to solve ───────────────────────────────────────
119 SATR leaves share a scheme name with at least one sibling, at mean cosine
0.947 between their profile embeddings. They are ONE notified scheme delivered
by MANY granting bodies: fourteen leaves share the French RDI regime's name,
three Portuguese leaves are textually identical but for COMPETE 2030 / Centro
2030 / Norte 2030. No description a founder can write says which of them is
theirs, and no embedding can be asked to guess. What separates them is WHERE
THE APPLICANT IS.

The register supplies the other half of that comparison. satr_staging carries
the beneficiary's region on all 122,814 rows, and a scheme child is exactly one
(sa_number, granting_authority) pair in that table, so each leaf's recipient
footprint is MEASURED. Conseil régional Hauts-de-France: 62 of 62 awards in
FRE. Région NORMANDIE: 42 of 42 in FRD. Ministère de l'économie: spread across
every region in France, which is equally informative -- it is the national door.

── Why this is a posterior and not a gate ─────────────────────────────────
The gate-based attempt measured flat and the audit says why: only 148 of 958
instruments carry a `region_within` gate, and the big sibling groups have NONE
(ademe 0/75, vinnova 0/49, satr_fr_rnd 0/42). Encoding more gates is a corpus
project. This needs no gates at all -- it reads award history, exactly as
peerPrior.generated.json does one level up.

The score is P(fund | region): the COUNT of this leaf's recipients in the
founder's region, not that count as a share of the leaf's own size. The share
form is the same inversion `sectorFit` makes, and it measures worse here too
(same-name @1 54.3% share against 65.7% count, oracle arm).

── Is the register's region a fact about the company or about the scheme? ──
It has to be about the COMPANY or this is circular. Measured on the 8,479
companies holding awards under more than one notified scheme, comparing the
region each scheme reports for the same company:

    exact NUTS id   79.0%      NUTS-2 prefix   86.6%      NUTS-1 prefix  94.4%

At the level a founder is actually asked -- NUTS-1/2, which is what
regions.generated.ts carries -- it is a company property. Confirmed end to end:
ranking siblings by a founder region derived ONLY from that company's awards
under a DIFFERENT notified scheme scores 64.9% @1, against 66.2% using every
award. The signal survives having its own evidence removed.

── Capping ────────────────────────────────────────────────────────────────
emit_peer_prior.py caps each instrument at 40 companies, because an uncapped
popularity prior just returns the biggest funds to everyone. That cap is not
repeated here and the difference is deliberate: this score is consumed ONLY
inside a sibling group, under a rank-PRESERVING reassignment that cannot move a
regime's position in the table (see materialiseInstrumentTable). "Biggest" can
therefore never leak across channels the way it can in a global prior. Measured
anyway, on the same-name holdout: uncapped @1 24.9%, cap-40 24.0% -- capping is
not free and buys nothing here.

Usage:
  python3 ETL/terms/emit_region_prior.py                          # report
  python3 ETL/terms/emit_region_prior.py --write --exclude-recall-set
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402
from nuts_regions import staged_region_mix  # noqa: E402

import argparse  # noqa: E402
import collections  # noqa: E402
import json  # noqa: E402
import sqlite3  # noqa: E402

OUT = ROOT / "website" / "frontend" / "lib" / "intelligence" / "regionPrior.generated.json"
INTEL = ROOT / "website" / "frontend" / "lib" / "intelligence"
RECALL_SETS = ("__recallSet.json", "__recallSetEnriched.json")

# A leaf whose whole footprint is a handful of awards describes nothing. Below
# this the entry is dropped rather than shipped weak: the scorer treats an
# absent leaf as NEUTRAL, which is the right reading of "we do not know", while
# a three-award mix would read as a claim.
MIN_RESOLVED = 5


def recall_companies() -> set[str]:
    names: set[str] = set()
    for f in RECALL_SETS:
        p = INTEL / f
        if p.exists():
            names |= {r["name"] for r in json.loads(p.read_text())}
    return names


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--exclude-recall-set", action="store_true",
                    help="drop every company in the recall sets before counting, "
                         "so a measured number is out-of-sample")
    args = ap.parse_args()

    conn = sqlite3.connect(DB)
    skip: set[int] = set()
    if args.exclude_recall_set:
        names = recall_companies()
        skip = {r[0] for r in conn.execute(
            "SELECT id FROM companies WHERE canonical_name IN (%s)"
            % ",".join("?" * len(names)), tuple(names))} if names else set()

    staged = staged_region_mix(conn, skip)

    # Only rows a founder can actually be shown. A framework is a legal basis,
    # a regime with children is a rollup nobody applies to, and a closed scheme
    # is not a route -- the same three `publishableInstruments()` removes, for
    # the same reasons emit_peer_prior.py removes them.
    unproposable = {r[0] for r in conn.execute(
        "SELECT id FROM funding_instruments "
        " WHERE is_framework = 1"
        "    OR id IN (SELECT parent_id FROM funding_instruments "
        "               WHERE parent_id IS NOT NULL)")}

    out: dict[str, dict] = {}
    thin = 0
    for iid, sa, body in conn.execute(
            "SELECT id, scheme_code, administering_body FROM funding_instruments"):
        if iid in unproposable or not sa or not body:
            continue
        mix = staged.get((sa.strip(), body[:200]))
        if not mix:
            continue
        resolved = {k: v for k, v in mix.most_common() if k}
        if sum(resolved.values()) < MIN_RESOLVED:
            thin += 1
            continue
        # `n` is EVERY award, including the ones the register files at country
        # level. A reader computing a share needs the honest denominator: a body
        # with 40 regional awards out of 4,000 is national, and dividing by the
        # resolvable subset alone would call it regional.
        out[iid] = {"n": sum(mix.values()), "mix": resolved}

    sizes = collections.Counter(len(v["mix"]) for v in out.values())
    print(f"staged (scheme, body) pairs: {len(staged):,}")
    if skip:
        print(f"companies excluded:          {len(skip):,} (recall sets)")
    print(f"instruments with a footprint:{len(out):,}"
          f"   (dropped below {MIN_RESOLVED} resolved awards: {thin})")
    print(f"regions per instrument:      median "
          f"{sorted(k for k, c in sizes.items() for _ in range(c))[len(out)//2]}")

    if not args.write:
        print("\n[report only] --write to persist")
        return
    OUT.write_text(json.dumps(out, indent=0, sort_keys=True) + "\n")
    print(f"\nwrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
