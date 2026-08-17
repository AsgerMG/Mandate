"""How many successor redirects does the FORWARD-ONLY read of `caseLinks` miss?

FREE. Reads the fetched register on disk and Postgres. No model, no network.
Run from the worktree root: python3 website/frontend/scripts/_wshf_successor_count.py

wsHF, 2026-08-17. See project-mgmt/findings/body_named_rows_wsHF.md.
`caseLinks` is DIRECTIONAL -- the Commission files the edge on whichever side it
pleases -- so populate_funding_instruments.py's successor-redirect, which
iterates a case's OWN caseLinks, cannot see a successor that filed the link on
its own record. This counts what that costs.
"""
import json, os, sys
from datetime import date
from pathlib import Path
sys.path.insert(0, "ETL/lib")
from scheme_title import link_map
import psycopg

for l in Path(".env.local").read_text().splitlines():
    if l.startswith("DATABASE_URL="):
        os.environ["DATABASE_URL"] = l.split("=", 1)[1].strip().strip('"')

cases = json.loads(Path("/Users/asgermollergrimberg/Wincent/data/raw/state_aid_cases/cases.json").read_text())
today = date.today().isoformat()

def one(rec, k):
    v = rec.get(k)
    if isinstance(v, list): v = v[0] if v else ""
    return (v or "").strip()

def fwd(sa):
    v = (cases.get(sa) or {}).get("caseLinks") or []
    return [str(x).strip() for x in (v if isinstance(v, list) else [v])]

sym = link_map(cases)

with psycopg.connect(os.environ["DATABASE_URL"]) as c:
    rows = c.execute("""SELECT id, scheme_code, successor_scheme FROM funding_instruments
                        WHERE scheme_code IS NOT NULL AND TRIM(scheme_code) <> ''""").fetchall()

closed_rows = []
for iid, sa, succ in rows:
    end = one(cases.get(sa) or {}, "caseMeasureEndDate")[:10]
    if end and end < today:
        closed_rows.append((iid, sa, succ))

def live_successor(sa, candidates):
    for o in candidates:
        if o == sa: continue
        end = one(cases.get(o) or {}, "caseMeasureEndDate")[:10]
        if end and end >= today:
            return o
    return None

gained, schemes = [], {}
for iid, sa, succ in closed_rows:
    f = live_successor(sa, fwd(sa))
    s = live_successor(sa, sorted(sym.get(sa, ())))
    if s and not f:
        gained.append((iid, sa, s))
        schemes[sa] = s

print(f"instruments carrying an SA number                 {len(rows)}")
print(f"...whose scheme the register says has CLOSED      {len(closed_rows)}")
print(f"...with a live successor found FORWARD-only       {sum(1 for i,sa,_ in closed_rows if live_successor(sa, fwd(sa)))}")
print(f"...with a live successor ONLY on the OTHER side   {len(gained)}   <- missed today")
print(f"    distinct SA numbers affected                  {len(schemes)}")
for sa, s in sorted(schemes.items()):
    n = sum(1 for i, x, _ in gained if x == sa)
    print(f"      {sa:12} -> {s:12}  {n:>3} instrument(s)   {one(cases.get(s) or {}, 'caseTitle')[:60]}")
