"""Probe: can a granting body's own official NAME be read as a declared catchment,
and does it agree with the measured award footprint where we have both?"""
import json, os, sys, collections
sys.path.insert(0, "/Users/asgermollergrimberg/Wincent/ETL/lib")
from etl_env import ROOT
from nuts_regions import load_reference, norm, ISO2_TO_NUTS
import psycopg

for line in open(ROOT / ".env.local"):
    if "=" in line and not line.startswith("#"):
        k, v = line.strip().split("=", 1)
        os.environ.setdefault(k, v.strip('"\''))

REF = load_reference()
IDX = REF["index"]

# region-name -> (nuts id, vintage), grouped by NUTS country prefix
BY_CC = collections.defaultdict(list)
for key, (nid, vint) in IDX.items():
    cc, name = key.split("|", 1)
    if vint == 0 or len(nid) <= 2:
        continue
    BY_CC[cc].append((name, nid, vint))

STEM = 5          # shortest prefix two words may share and still be the same place
MIN_WORD = 4      # ignore short region words ("nord", "west") standing alone


def stem_match(word, rword):
    if word == rword:
        return True
    n = min(len(word), len(rword))
    if n < STEM:
        return False
    # adjectival and inflected forms share a long prefix with the noun:
    # bayern/bayerisches, wallonne/wallonie, toscana/toscano, sachsen/saechsische
    return word[:STEM] == rword[:STEM] and n >= STEM


def candidates(body, iso2):
    """Every NUTS region this body's own name names, most specific first."""
    cc = ISO2_TO_NUTS.get(iso2, iso2)
    words = [w for w in norm(body).split() if len(w) >= MIN_WORD]
    out = {}
    for name, nid, vint in BY_CC.get(cc, []):
        rwords = [w for w in name.split() if len(w) >= MIN_WORD]
        if not rwords:
            continue
        if all(any(stem_match(w, rw) for w in words) for rw in rwords):
            prev = out.get(nid)
            if prev is None or vint > prev:
                out[nid] = vint
    return sorted(out, key=lambda n: (-len(n), n))


with psycopg.connect(os.environ["DATABASE_URL"]) as c:
    rows = c.execute("""
      WITH g AS (SELECT COALESCE(parent_id,id) rid, id, country, administering_body ab,
                        delivery_region dr, delivery_region_share drs, recipient_region_mix mix
                   FROM funding_instruments),
      m AS (SELECT rid FROM g GROUP BY rid HAVING COUNT(*)>1)
      SELECT g.* FROM g JOIN m USING(rid)""").fetchall()

tot = named = 0
agree = disagree = nested = 0
new_cover = 0
examples_bad = []
examples_new = []
for rid, iid, cc, ab, dr, drs, mix in rows:
    if not ab:
        continue
    tot += 1
    cands = candidates(ab, cc)
    if not cands:
        continue
    named += 1
    pick = cands[0]
    if dr:
        if pick == dr or pick.startswith(dr) or dr.startswith(pick):
            if pick == dr:
                agree += 1
            else:
                nested += 1
        else:
            disagree += 1
            if len(examples_bad) < 12:
                examples_bad.append((cc, ab[:60], pick, dr, round(drs or 0, 2)))
    else:
        new_cover += 1
        if len(examples_new) < 15:
            examples_new.append((cc, ab[:70], pick))

print(f"leaves with a body name: {tot}")
print(f"  body name resolves to a NUTS region: {named}")
print(f"  of those, a measured delivery_region also exists:")
print(f"      exact agreement   {agree}")
print(f"      nested (same place, different level) {nested}")
print(f"      CONTRADICTS       {disagree}")
print(f"  no measured region today -> NEW declared coverage: {new_cover}")
print("\ncontradictions (declared vs measured):")
for e in examples_bad:
    print("   ", e)
print("\nnew coverage samples:")
for e in examples_new:
    print("   ", e)
