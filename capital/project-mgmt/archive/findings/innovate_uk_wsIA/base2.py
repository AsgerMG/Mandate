import json, collections
from math import comb

def load(p): return [json.loads(l) for l in open(p) if l.strip()]

def fisher(a,b,c,d):
    # 2x2 one-sided P(>= a)
    n=a+b+c+d; R=a+b; C=a+c
    tot=comb(n,C)
    s=0
    for i in range(a, min(R,C)+1):
        s+=comb(R,i)*comb(n-R,C-i)
    return s/tot

for tag,p in [("wsHO","project-mgmt/findings/indicative_wsHO/main_tape.jsonl"),
              ("wsHW","project-mgmt/findings/indicative_wsHW/main_tape.jsonl")]:
    rows=[r for r in load(p) if r.get("called")]
    print("="*72); print(tag, "called:", len(rows))
    C=[r for r in rows if r["stratum"]=="C"]; R=[r for r in rows if r["stratum"]=="R"]
    print("called C=%d R=%d"%(len(C),len(R)))
    print(" called by regime:", collections.Counter(r["wonRegime"] for r in rows).most_common())
    print(" called C by regime:", collections.Counter(r["wonRegime"] for r in C).most_common())
    print(" called R by regime:", collections.Counter(r["wonRegime"] for r in R).most_common())
    harms=[r for r in C if not r["hitTreatment"]]
    rescues=[r for r in R if r["hitTreatment"]]
    print(" harms=%d"%len(harms), collections.Counter(r["wonRegime"] for r in harms).most_common())
    print(" rescues=%d"%len(rescues), collections.Counter(r["wonRegime"] for r in rescues).most_common())
    N=len(C); K=sum(1 for r in C if r["wonRegime"]=="innovate_uk")
    k=sum(1 for r in harms if r["wonRegime"]=="innovate_uk"); n=len(harms)
    print(f" C called={N}, innovate_uk in called C={K}")
    print(f" iuk harm rate {k}/{K}={k/K:.1%}   other {n-k}/{N-K}={(n-k)/(N-K):.1%}")
    print(f" Fisher one-sided p = {fisher(k,K-k,n-k,N-K-(n-k)):.4f}")
    print(f" expected iuk harms if uniform = {K*n/N:.2f}")
    # rescue side for innovate_uk
    KR=sum(1 for r in R if r["wonRegime"]=="innovate_uk")
    kr=sum(1 for r in rescues if r["wonRegime"]=="innovate_uk")
    print(f" innovate_uk in called R={KR}, rescued={kr}")
    print(" iuk harm founders:", [(r["company"],r["won"]) for r in harms if r["wonRegime"]=="innovate_uk"])
    print(" iuk C non-harm:", [(r["company"],r["won"]) for r in C if r["wonRegime"]=="innovate_uk" and r["hitTreatment"]])
    print(" iuk R founders:", [(r["company"],r["won"],r["hitTreatment"]) for r in R if r["wonRegime"]=="innovate_uk"])
