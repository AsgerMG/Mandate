"""Accuracy check for the deterministic merge dry run.

Reads data/processed/parent_groups_dryrun.csv and estimates precision two ways:
  1. Cohesion proxy: every member of a true group should share >=1 distinctive
     token (the brand). Groups with NO common distinctive token are flagged as
     suspected false bridges — the automated precision signal.
  2. Random sample: prints full member lists for human eyeball verification.
"""
import csv
import random
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from merge_companies import norm_tokens  # noqa: E402
from lib.merge_stoplist import is_distinctive  # noqa: E402

CSV = ROOT / "data" / "processed" / "parent_groups_dryrun.csv"

groups = defaultdict(list)
for r in csv.DictReader(CSV.open()):
    groups[r["parent_key"]].append((r["name"], r["country"]))

def distinctive(name):
    return {t for t in norm_tokens(name) if is_distinctive(t)}

cohesive, suspect = 0, []
for k, members in groups.items():
    common = set.intersection(*(distinctive(n) for n, _ in members)) if members else set()
    if common:
        cohesive += 1
    else:
        suspect.append((k, members))

total = len(groups)
print(f"groups: {total:,}  |  members: {sum(len(v) for v in groups.values()):,}")
print(f"cohesive (share a distinctive token): {cohesive:,}  ({100*cohesive/total:.1f}%)")
print(f"suspect (NO common distinctive token): {len(suspect):,}  ({100*len(suspect)/total:.1f}%)")
print(f"\n=== ALL suspect groups (review these) ===")
for k, members in sorted(suspect, key=lambda x: -len(x[1])):
    names = sorted({n for n, _ in members})
    print(f"  [{k[:24]}] {names[:4]}")

print(f"\n=== random sample of 18 merged groups (eyeball) ===")
random.seed(7)
for k in random.sample(list(groups), min(18, total)):
    members = groups[k]
    names = sorted({n for n, _ in members})
    cs = sorted({c for _, c in members if c})
    print(f"  ({len(members)}, {len(cs)}c) {names[0][:40]}  ::  {' | '.join(x[:24] for x in names[1:4])}")
