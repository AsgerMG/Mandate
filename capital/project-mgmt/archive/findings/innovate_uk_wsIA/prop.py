import json,re,sys,collections
from math import comb
sys.path.insert(0,"/private/tmp/claude-501/-Users-asgermollergrimberg-Wincent/1f599910-047b-4d24-8947-cb1c67ef6560/scratchpad")
from menu import blocks,qual
def fisher(a,b,c,d):
    n=a+b+c+d;R=a+b;C=a+c
    return sum(comb(R,i)*comb(n-R,C-i) for i in range(a,min(R,C)+1))/comb(n,C)
def band(q):
    if "in the way" in q: return "OBSTRUCTED"
    if "no encoded rule" in q: return "UNASSESSED"
    if "nothing we can check" in q: return "OPEN"
    return "OTHER:"+q[:30]

for tag in ["wsHO","wsHW"]:
    rows=[json.loads(l) for l in open(f"project-mgmt/findings/indicative_{tag}/main_tape.jsonl")]
    called=[r for r in rows if r.get("called") and r["stratum"] in ("C","R")]
    print("="*90); print(tag)
    tab=collections.defaultdict(lambda: collections.Counter())
    detail=[]
    for r in called:
        B=blocks(r["turns"][0]["prompt"])
        idx=r["poolRankControl"]-1
        b=band(qual(B[idx]))
        picked = idx in r["picks"]
        seat = r["picks"].index(idx) if picked else None
        detail.append((r,b,picked,seat))
        tab[(r["stratum"],b)]["n"]+=1
        tab[(r["stratum"],b)]["hit"]+= 1 if r["hitTreatment"] else 0
        tab[(r["stratum"],b)]["picked7"]+= 1 if picked else 0
        if picked: tab[(r["stratum"],b)]["seatsum"]+=seat
    for k in sorted(tab):
        c=tab[k]
        s = c["seatsum"]/c["picked7"] if c["picked7"] else float('nan')
        print(f"  {k[0]} {k[1]:11} n={c['n']:3} pickedAnywhere={c['picked7']:3} inSix(hitT)={c['hit']:3}  meanSeatIfPicked={s:.2f}")
    # HARM analysis on stratum C
    C=[d for d in detail if d[0]["stratum"]=="C"]
    o=[d for d in C if d[1]=="OBSTRUCTED"]; no=[d for d in C if d[1]!="OBSTRUCTED"]
    ho=sum(1 for d in o if not d[0]["hitTreatment"]); hn=sum(1 for d in no if not d[0]["hitTreatment"])
    print(f"  HARM: obstructed won-row {ho}/{len(o)}={ho/len(o):.1%}  vs other {hn}/{len(no)}={hn/len(no):.1%}  Fisher p={fisher(ho,len(o)-ho,hn,len(no)-hn):.4f}")
    print("  obstructed C founders (won regime):", collections.Counter(d[0]["wonRegime"] for d in o).most_common())
    print("  harmed & obstructed:", [(d[0]["company"][:24],d[0]["wonRegime"],"seat=%s"%d[3]) for d in o if not d[0]["hitTreatment"]])
    print("  harmed & NOT obstructed:", [(d[0]["company"][:24],d[0]["wonRegime"],d[1],"seat=%s"%d[3]) for d in no if not d[0]["hitTreatment"]])
    # seat-7 loss: picked but 7th
    seven=[d for d in detail if d[2] and d[3]==6]
    print(f"  won row picked but at SEAT 7 (cut by the six): {len(seven)} ->", [(d[0]['company'][:22],d[1]) for d in seven])
