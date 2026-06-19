"""Recipient explorer dataset for /investors — sharded for fetch-on-filter.

A whole-corpus, sliceable leaderboard of public-funding recipients. The site is
a static export (no query backend), so each *facet value* gets its own precomputed
leaderboard shard; selecting a filter fetches that shard on demand — the static
equivalent of "the filter triggers a query". Initial load is just the default
(top recipients overall); picking a channel/country/sector fetches that slice.

Per row we carry a per-channel (source_family) breakdown of amount + events, so a
channel slice can show the euros from THAT channel (e.g. "EDF" → Thales €437.5M
from EDF, not its €519.5M grand total).

Companies are rolled up to parent via the Layer 1 merge (COALESCE(parent_group, id)).
Euros are indicative — mixed reporting bases across channels — so this ranks
magnitude, it is not an accounting total.

Output:
  site/public/data/recipient_explorer/manifest.json   (imported statically)
  site/public/data/recipient_explorer/_default.json
  site/public/data/recipient_explorer/channel/<family>.json
  site/public/data/recipient_explorer/country/<iso2>.json
  site/public/data/recipient_explorer/sector/<sector>.json
"""
import json
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from build_investor_insights import pretty_name, FAMILY_LABELS  # noqa: E402

DB = ROOT / "db.sqlite"
OUTDIR = ROOT / "site" / "public" / "data" / "recipient_explorer"
DEPTH = 300            # rows per shard
FAM_ORDER = list(FAMILY_LABELS)


def fam_rank(f: str) -> int:
    return FAM_ORDER.index(f) if f in FAM_ORDER else 99


def write(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False))


def build():
    con = sqlite3.connect(DB)
    rows = con.execute("""
        SELECT COALESCE(c.parent_group, 'id:' || c.id) AS grp,
               c.canonical_name, c.country, c.sector_inferred,
               v.source_family,
               COALESCE(SUM(COALESCE(v.grant_amount_eur,0)+COALESCE(v.debt_amount_eur,0)),0) AS eur,
               COUNT(*) AS events
        FROM v_events v
        JOIN companies c ON c.id = v.company_id
        WHERE c.entity_type = 'company'
        GROUP BY c.id, v.source_family
    """).fetchall()

    groups: dict[str, dict] = {}
    member_total: dict[tuple, float] = defaultdict(float)
    member_meta: dict[tuple, tuple] = {}
    for grp, name, country, sector, fam, eur, events in rows:
        g = groups.setdefault(grp, {"total": 0.0, "events": 0,
                                    "brk": defaultdict(lambda: [0.0, 0])})
        g["total"] += eur
        g["events"] += events
        b = g["brk"][fam]
        b[0] += eur
        b[1] += events
        mk = (grp, name)
        member_total[mk] += eur
        member_meta[mk] = (country, sector)

    best: dict[str, tuple] = {}
    for (grp, name), tot in member_total.items():
        cur = best.get(grp)
        if cur is None or tot > cur[0]:
            best[grp] = (tot, name, *member_meta[(grp, name)])

    recs = []
    for grp, g in groups.items():
        _, name, country, sector = best[grp]
        breakdown = sorted(
            ({"family": f, "eur": round(v[0]), "events": v[1]} for f, v in g["brk"].items()),
            key=lambda d: (-d["eur"], fam_rank(d["family"])),
        )
        recs.append({
            "name": pretty_name(name),
            "country": country or "",
            "sector": sector or "unclassified",
            "nFamilies": len(breakdown),
            "families": sorted((b["family"] for b in breakdown), key=fam_rank),
            "breakdown": breakdown,
            "nEvents": g["events"],
            "totalEur": round(g["total"]),
        })

    # default shard: top by total
    by_total = sorted(recs, key=lambda r: -r["totalEur"])
    write(OUTDIR / "_default.json", by_total[:DEPTH])

    # channel shards: top by THAT channel's euros
    channels = []
    for fam in FAM_ORDER:
        sub = [r for r in recs if any(b["family"] == fam for b in r["breakdown"])]
        sub.sort(key=lambda r: -next(b["eur"] for b in r["breakdown"] if b["family"] == fam))
        if sub:
            write(OUTDIR / "channel" / f"{fam}.json", sub[:DEPTH])
            channels.append({"id": fam, "label": FAMILY_LABELS[fam], "count": len(sub)})

    # country shards: top by total within country
    countries = []
    bycountry: dict[str, list] = defaultdict(list)
    for r in recs:
        if r["country"]:
            bycountry[r["country"]].append(r)
    for iso2, sub in sorted(bycountry.items()):
        sub.sort(key=lambda r: -r["totalEur"])
        write(OUTDIR / "country" / f"{iso2}.json", sub[:DEPTH])
        countries.append({"id": iso2, "count": len(sub)})

    # sector shards: top by total within sector
    sectors = []
    bysector: dict[str, list] = defaultdict(list)
    for r in recs:
        bysector[r["sector"]].append(r)
    for sec, sub in sorted(bysector.items()):
        sub.sort(key=lambda r: -r["totalEur"])
        write(OUTDIR / "sector" / f"{sec}.json", sub[:DEPTH])
        sectors.append({"id": sec, "count": len(sub)})

    write(OUTDIR / "manifest.json", {
        "depth": DEPTH,
        "corpusRecipients": len(recs),
        "channels": channels,
        "countries": countries,
        "sectors": sectors,
    })
    print(f"wrote recipient_explorer shards: {len(channels)} channels, "
          f"{len(countries)} countries, {len(sectors)} sectors; "
          f"{len(recs)} recipients in corpus, depth {DEPTH}")


if __name__ == "__main__":
    build()
