"""The answer key is a coin flip for exactly the funds we are trying to tell apart.

── The defect ─────────────────────────────────────────────────────────────
`__recallSet.json` traces a company's award to an instrument with
`scheme_code = call_id`. That join is not unique. A notified scheme delivered by
several granting bodies is ONE SA number and MANY instruments -- SA.111723 is
fourteen of them -- so the join returns the whole group and one member is
picked. Checked against the register, on the holdout:

    won fund NOT in a same-name group   register confirms the exact leaf  91.7%
    won fund IN a same-name group       register confirms the exact leaf  32.2%
                                        register confirms SOME sibling    96.1%

The regime is right 96% of the time and the leaf is right 32%. For the 278
holdout pairs (24%) whose answer sits in a same-name group, the answer key is
close to a uniform draw over the siblings -- their labelled winners are
distributed 9, 9, 8, 8, 8, 8, 7, 7, 6, 6, 6, 6, 6, 6, 5, 5, 5, 4, 4, 3 across
one French regime whose real award volumes differ by a factor of a hundred.

This is why every attempt to separate these leaves "measured flat", region
included. It was not a ranking failure. **No method can beat chance on a
population whose answer key is chance.** Measured both ways on the identical
rows and the identical scorer:

    ranking same-name siblings by the founder's region
      against the shipped answer key      @1  24.9%   (uniform 23.1%)
      against the repaired answer key     @1  66.2%   (uniform 22.4%)

── What this does ─────────────────────────────────────────────────────────
The register knows which body signed. `satr_staging` holds
(sa_number, granting_authority) per award, and that pair IS the instrument
identity `populate_funding_instruments.py` splits on, so the correct leaf is
recoverable. Stated over the corpus, naming no fund and no country: where a
pair's labelled leaf shares its NOTIFIED SCHEME with other leaves, and the
register records that company under one of them, the label becomes the leaf the
register names.

Ambiguity is kept rather than resolved by preference: a company with awards
under two bodies of the same scheme really did win both, so the label is kept if
it is one of them, and only otherwise moved to the body that signed most of
them.

── The region field ───────────────────────────────────────────────────────
Emitted alongside, because a founder always knows their region and the harness
has no way to. Two provenances, kept apart so a number can be read honestly:

    other_scheme   modal region across this company's awards under a DIFFERENT
                   notified scheme. Cannot be circular. Available for ~30%.
    own_award      modal across every award, including the won one.

They are equivalent in practice and that is measured, not assumed: on the 214
holdout pairs carrying both they agree at NUTS-1 92.1% of the time and produce
the SAME sibling ranking (64.9% vs 66.2% @1). The register's region is a fact
about the company, not about the scheme -- across 8,479 companies holding
awards under more than one scheme it self-agrees 94.4% at NUTS-1.

Usage:
  python3 ETL/terms/repair_recall_attribution.py                    # report
  python3 ETL/terms/repair_recall_attribution.py --write
  python3 ETL/terms/repair_recall_attribution.py --write --from __recallSet.json
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402
from nuts_regions import ISO2_TO_NUTS, load_reference, resolve  # noqa: E402

import argparse  # noqa: E402
import collections  # noqa: E402
import json  # noqa: E402
import sqlite3  # noqa: E402

INTEL = ROOT / "website" / "frontend" / "lib" / "intelligence"
DEFAULT_FROM = "__recallSetEnriched.json"
OUT = INTEL / "__recallSetRepaired.json"

# A founder is asked for their region at NUTS-1 or NUTS-2, which is what
# regions.generated.ts carries. The register reports recipients at level 3, so
# an estimate of WHERE A COMPANY IS is taken at level 1: that is where its
# awards agree (94.4%, against 79.0% on the exact id), and reporting a level the
# evidence does not support would be a false precision the harness then grades
# against.
COMPANY_REGION_CHARS = 3


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--from", dest="src", default=DEFAULT_FROM)
    args = ap.parse_args()

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    index = load_reference()["index"]

    inst = {r["id"]: r for r in conn.execute(
        "SELECT id, parent_id, scheme_code, administering_body FROM funding_instruments")}
    # The notified scheme, as a set of the leaves that deliver it, WITHIN one
    # regime. This is the `scheme_code = call_id` ambiguity itself, made
    # explicit — and the parent is part of the key on purpose.
    #
    # An SA number can be registered for more than one kind of aid, so the same
    # (scheme, body) pair exists as both an R&D child and an equity child under
    # two different regimes. The register names the BODY that signed; it does
    # not say which regime the corpus filed the award under. Re-attributing
    # across that line would move a pair to a different family and quietly
    # rewrite REGIME@5, which is the one number this repair must leave alone:
    # measured, an unconstrained version read 74% where the constrained one
    # reads 84% on the identical rows.
    by_scheme: dict[tuple[str, str], list[str]] = collections.defaultdict(list)
    for i, r in inst.items():
        code = (r["scheme_code"] or "").strip()
        if code:
            by_scheme[(code, r["parent_id"] or i)].append(i)
    by_sa_body: dict[tuple[str, str], list[str]] = collections.defaultdict(list)
    for i, r in inst.items():
        code = (r["scheme_code"] or "").strip()
        body = (r["administering_body"] or "")[:200]
        if code and body:
            by_sa_body[(code, body)].append(i)

    company = {}
    for r in conn.execute("SELECT id, canonical_name FROM companies"):
        company.setdefault(r["canonical_name"], r["id"])

    # company -> Counter(instrument), and company -> Counter(NUTS-1 region),
    # both from the register's own per-award attribution.
    won: dict[int, collections.Counter] = collections.defaultdict(collections.Counter)
    scheme_regions: dict[int, dict[str, collections.Counter]] = collections.defaultdict(
        lambda: collections.defaultdict(collections.Counter))
    seen_region: dict[tuple[str, str], str] = {}
    for r in conn.execute("""
            SELECT company_id, sa_number, granting_authority,
                   granting_country_iso2, region
              FROM satr_staging
             WHERE company_id IS NOT NULL
               AND sa_number IS NOT NULL AND TRIM(sa_number) <> ''"""):
        sa = r["sa_number"].strip()
        key = (r["region"] or "", r["granting_country_iso2"] or "")
        if key not in seen_region:
            hit = resolve(key[0], ISO2_TO_NUTS.get(key[1], key[1]), index)
            seen_region[key] = hit[0] if hit and hit[1] > 0 else ""
        reg = seen_region[key][:COMPANY_REGION_CHARS]
        for iid in by_sa_body.get((sa, (r["granting_authority"] or "")[:200]), []):
            won[r["company_id"]][iid] += 1
        if reg:
            scheme_regions[r["company_id"]][sa][reg] += 1

    rows = json.loads((INTEL / args.src).read_text())
    stat: collections.Counter = collections.Counter()
    for row in rows:
        cid = company.get(row["name"])
        labelled = row["instrument"]
        code = (inst[labelled]["scheme_code"] or "").strip() if labelled in inst else ""
        family = (inst[labelled]["parent_id"] or labelled) if labelled in inst else ""
        siblings = set(by_scheme.get((code, family), [])) if code else set()

        if cid is not None and len(siblings) > 1:
            hits = collections.Counter({k: v for k, v in won[cid].items() if k in siblings})
            if not hits:
                stat["ambiguous scheme, register names no body"] += 1
            elif labelled in hits:
                stat["ambiguous scheme, label confirmed"] += 1
            elif len(hits) == 1:
                row["instrument"] = next(iter(hits))
                stat["ambiguous scheme, RELABELLED to the one body named"] += 1
            else:
                row["instrument"] = hits.most_common(1)[0][0]
                stat["ambiguous scheme, RELABELLED to the modal body"] += 1
        elif len(siblings) == 1:
            stat["scheme delivered by one body"] += 1
        else:
            stat["no notified scheme on the label (EU programme)"] += 1

        # Region. The won scheme's own awards are excluded first; only if the
        # company has nothing else does the label fall back to its own award,
        # and it says so.
        if cid is not None:
            per_scheme = scheme_regions.get(cid, {})
            other = collections.Counter()
            for sa, c in per_scheme.items():
                if sa != code:
                    other.update(c)
            if other:
                row["region"], row["regionSource"] = other.most_common(1)[0][0], "other_scheme"
                stat["region: other_scheme"] += 1
            else:
                every = collections.Counter()
                for c in per_scheme.values():
                    every.update(c)
                if every:
                    row["region"], row["regionSource"] = every.most_common(1)[0][0], "own_award"
                    stat["region: own_award"] += 1
                else:
                    stat["region: none"] += 1
        else:
            stat["region: none"] += 1

    for k, v in sorted(stat.items()):
        print(f"  {k:52s} {v:6,d}")
    moved = stat["ambiguous scheme, RELABELLED to the one body named"] \
        + stat["ambiguous scheme, RELABELLED to the modal body"]
    print(f"\n{len(rows):,} pairs, {moved:,} relabelled "
          f"({100 * moved / len(rows):.1f}%)")

    if not args.write:
        print("\n[report only] --write to persist")
        return
    OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=0) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
