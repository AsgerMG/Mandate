import json,re,sys,collections,statistics
sys.path.insert(0,"/private/tmp/claude-501/-Users-asgermollergrimberg-Wincent/1f599910-047b-4d24-8947-cb1c67ef6560/scratchpad")
from menu import blocks,qual
def band(q):
    return "OBSTRUCTED" if "in the way" in q else ("UNASSESSED" if "no encoded rule" in q else "OPEN")
S={"wsHO":(0.391,0.417),"wsHW":(0.386,0.427)}
for tag in ["wsHO","wsHW"]:
    rows=[json.loads(l) for l in open(f"project-mgmt/findings/indicative_{tag}/main_tape.jsonl")]
    called=[r for r in rows if r.get("called")]
    sR,sC=S[tag]
    C=[r for r in called if r["stratum"]=="C"]; R=[r for r in called if r["stratum"]=="R"]
    def bandOf(r):
        return band(qual(blocks(r["turns"][0]["prompt"])[r["poolRankControl"]-1]))
    obC=[r for r in C if bandOf(r)=="OBSTRUCTED"]; opC=[r for r in C if bandOf(r)!="OBSTRUCTED"]
    harm=lambda L: sum(1 for r in L if not r["hitTreatment"])
    resc=sum(1 for r in R if r["hitTreatment"])
    hO,hP=harm(obC),harm(opC)
    d0=sR*resc/len(R)-sC*(hO+hP)/len(C)
    rateOpen=hP/len(opC)
    hOcf=len(obC)*rateOpen
    d1=sR*resc/len(R)-sC*(hOcf+hP)/len(C)
    print("="*80); print(tag)
    print(f"  observed delta            {d0*100:+.2f}  (rescue {resc}/{len(R)}, harm {hO+hP}/{len(C)})")
    print(f"  if obstructed won-rows harmed at the OPEN rate ({rateOpen:.1%}): {d1*100:+.2f}  swing {(d1-d0)*100:+.2f} pts")
    # exposure: founders with >=1 obstructed row in ranker top6
    exp=sum(1 for r in called if any(band(qual(b))=="OBSTRUCTED" for n,b in blocks(r["turns"][0]["prompt"]).items() if n<6))
    print(f"  founders with >=1 OBSTRUCTED row in the ranker's top 6: {exp}/{len(called)} = {exp/len(called):.1%}")
    # if a band sort were REINSTATED: would control still hit for obstructed-won founders?
    lost=0
    for r in obC:
        B=blocks(r["turns"][0]["prompt"])
        openAhead=sum(1 for n in range(0,7) if n in B and band(qual(B[n]))!="OBSTRUCTED")
        # under a band sort the obstructed won row goes behind every open row in the 7-cap
        if openAhead>=6: lost+=1
    print(f"  if the band sort were REINSTATED, OUR OWN six would lose the won fund on {lost}/{len(obC)} of the obstructed-won founders")
