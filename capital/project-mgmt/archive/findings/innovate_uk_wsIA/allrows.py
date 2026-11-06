import json,re,sys,collections,statistics
sys.path.insert(0,"/private/tmp/claude-501/-Users-asgermollergrimberg-Wincent/1f599910-047b-4d24-8947-cb1c67ef6560/scratchpad")
from menu import blocks,qual
def band(q):
    if "in the way" in q: return "OBSTRUCTED"
    if "no encoded rule" in q: return "UNASSESSED"
    if "nothing we can check" in q: return "OPEN"
    return "OTHER"
for tag in ["wsHO","wsHW"]:
    rows=[json.loads(l) for l in open(f"project-mgmt/findings/indicative_{tag}/main_tape.jsonl")]
    called=[r for r in rows if r.get("called")]
    print("="*90); print(tag)
    # bucket by rank decile
    agg=collections.defaultdict(lambda: collections.Counter())
    seats=collections.defaultdict(list)
    for r in called:
        B=blocks(r["turns"][0]["prompt"])
        for n,b in B.items():
            bd=band(qual(b))
            bucket = "rank 0-6" if n<7 else ("rank 7-13" if n<14 else "rank 14+")
            agg[(bucket,bd)]["n"]+=1
            if n in r["picks"]:
                agg[(bucket,bd)]["picked"]+=1
                seats[(bucket,bd)].append(r["picks"].index(n))
    for k in sorted(agg):
        c=agg[k]; s=seats[k]
        if c["n"]<5: continue
        print(f"  {k[0]:10} {k[1]:11} rows={c['n']:5} picked={c['picked']:4} = {c['picked']/c['n']:6.1%}  meanSeat={statistics.mean(s) if s else float('nan'):.2f}  seat7share={sum(1 for x in s if x==6)/len(s) if s else 0:.1%}")
    # HEAD ONLY: top-3 rows, the places our score already spent
    print("  --- rows at menu rank 0,1,2 only ---")
    a=collections.defaultdict(lambda: collections.Counter()); sd=collections.defaultdict(list)
    for r in called:
        B=blocks(r["turns"][0]["prompt"])
        for n in (0,1,2):
            if n not in B: continue
            bd=band(qual(B[n])); a[bd]["n"]+=1
            if n in r["picks"]:
                a[bd]["picked"]+=1; sd[bd].append(r["picks"].index(n))
            if n in r["picks"][:6]: a[bd]["insix"]+=1
    for bd in a:
        c=a[bd]
        print(f"    {bd:11} rows={c['n']:4} picked={c['picked']:3}={c['picked']/c['n']:6.1%}  inSix={c['insix']:3}={c['insix']/c['n']:6.1%}  meanSeat={statistics.mean(sd[bd]) if sd[bd] else float('nan'):.2f}")
