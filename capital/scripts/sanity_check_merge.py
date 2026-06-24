"""Sanity-check the deterministic merge dry run against known names.

For each probe brand: how many companies match it, how many distinct parent-groups
they land in, and how many remain unmerged singletons. 1 group + few singletons =
well consolidated; many groups/singletons = remaining duplicates (recall gap, a
brand-dictionary candidate). Also prints the member names so wrong merges show.
"""
import csv
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from merge_companies import DB  # noqa: E402

CSV = ROOT / "data" / "processed" / "parent_groups_dryrun.csv"
pg = {}
for r in csv.DictReader(CSV.open()):
    pg[int(r["company_id"])] = r["parent_key"]

con = sqlite3.connect(DB)

BIG = ["siemens", "novo nordisk", "robert bosch", "airbus", "thales", "volkswagen",
       "ericsson", "nokia", "philips", "sap ", "volvo", "sanofi", "bayer", "basf",
       "stellantis", "michelin", "saint-gobain", "air liquide", "schneider",
       "infineon", "stmicroelectronics", "alstom", "leonardo", "safran", "valeo",
       "continental", "vestas", "maersk", "carlsberg", "nestle", "abb "]
SMALL = ["aerones", "iqm", "multiverse", "dawn aerospace", "morrow batteries",
         "northvolt", "einride", "lilium", "sennder", "wallbox", "fairphone"]


def probe(label, brands):
    print(f"\n=== {label} ===")
    print(f"{'brand':22} {'cos':>4} {'groups':>6} {'singl':>5}  notes")
    for b in brands:
        rows = con.execute(
            "SELECT id, canonical_name FROM companies WHERE LOWER(canonical_name) LIKE ?",
            (f"%{b.strip()}%",)).fetchall()
        if not rows:
            print(f"{b:22} {'0':>4}   (no match)")
            continue
        keys = [pg.get(cid) for cid, _ in rows]
        groups = sorted({k for k in keys if k})
        singles = sum(1 for k in keys if not k)
        flag = ""
        if len(groups) > 1:
            flag = f"<-- {len(groups)} groups (still fragmented)"
        elif singles > 1 and not groups:
            flag = f"<-- {singles} unmerged"
        print(f"{b:22} {len(rows):>4} {len(groups):>6} {singles:>5}  {flag}")
        if len(groups) > 1 or (label == 'SMALL/LOCAL' and len(rows) <= 8):
            for cid, nm in rows[:8]:
                print(f"      [{(pg.get(cid) or 'SINGLETON')[:20]:20}] {nm[:46]}")


probe("BIG MULTINATIONALS", BIG)
probe("SMALL/LOCAL", SMALL)
