import json,re
def blocks(p):
    i=p.index("CANDIDATES\n")
    txt=p[i+len("CANDIDATES\n"):]
    parts=re.split(r"\n(?=\[\d+\])", "\n"+txt)
    out={}
    for part in parts:
        m=re.match(r"\s*\[(\d+)\]", part)
        if m: out[int(m.group(1))]=part.strip()
    return out
def qual(b):
    m=re.search(r"qualification: (.*)", b)
    return m.group(1) if m else ""
