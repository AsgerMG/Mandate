"""wsIT — how many founders on cross-regime text could have had their OWN words?

── The question, and the correction it starts from ────────────────────────
The funnel header says 887 descriptions were "recovered from another regime",
and that has been read as "another company's text". It is not.
`rebuild_recall_descriptions.py` keys its candidates on
`cid_by_name[(name, country)]` — THE SAME COMPANY. All four provenances are the
founder's own words; what differs is WHICH AWARD they were written for:

  own_award_text / own_project_title   the award that IS the answer
  cross_regime_summary / _title        a different award, under another regime

So the question this script answers is not "could we have found the founder's
own words" — we already have them in both strata. It is: for a founder now
described by another project of theirs, does the corpus hold prose from THE WON
FUND's own award, and if so why was it not used?

FREE. Reads db.sqlite READ-ONLY (uri mode=ro) and instrument_profiles from
Postgres READ-ONLY through the same LeakIndex the ETL uses. No writes anywhere.

  python3 ETL/terms/_wsit_headroom.py     # DRAW= to point at another draw dump
"""
import sys, os, json, collections, sqlite3
sys.path.insert(0, os.path.abspath("ETL/lib"))
sys.path.insert(0, os.path.abspath("ETL/terms"))
from etl_env import DATA, DB, ROOT
from dotenv import load_dotenv
load_dotenv(os.path.join(str(ROOT), ".env.local"))
from recall_guards import LeakIndex, squash

FRONTEND = ROOT / "website" / "frontend" / "lib" / "intelligence"
pairs = json.loads((FRONTEND / "__recallSetDescribed.json").read_text())
kinds = json.loads((DATA / "instrument_title_kind.json").read_text()) if (DATA / "instrument_title_kind.json").exists() else {}

conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
conn.row_factory = sqlite3.Row
guards = LeakIndex(conn, title_kinds=kinds)
assert guards.profile_text, "profile-text guard MUST be armed; DATABASE_URL missing"

src2inst = collections.defaultdict(list)
for s, iid in conn.execute("SELECT source, instrument_id FROM funding_instrument_sources"):
    src2inst[s].append(iid)
code2inst = collections.defaultdict(list)
for iid, i in guards.inst.items():
    code = (i["scheme_code"] or "").strip()
    if code: code2inst[code].append(iid)
cid_by_name = collections.defaultdict(list)
for cid, cname, country in conn.execute("SELECT id, canonical_name, country FROM companies"):
    cid_by_name[(cname, country or "")].append(cid)

# the draw: holdout + described, one row per company, order irrelevant here
DRAW_PATH = os.environ.get("DRAW") or sys.argv[1]
DRAW = {(json.loads(l)["name"], json.loads(l)["country"]): json.loads(l)
        for l in open(DRAW_PATH) if l.strip()}
# map back to the pair each drawn founder came from (name is unique in the draw)
by_name = collections.defaultdict(list)
for p in pairs:
    by_name[(p["name"], p["country"])].append(p)

wanted = set()
for k in DRAW:
    wanted.update(cid_by_name.get(k, []))

cand = collections.defaultdict(list)
own_titles = collections.defaultdict(set)
for e in conn.execute("SELECT company_id, source, call_id, project_title, project_summary "
                      "FROM public_funding_events WHERE is_duplicate = 0"):
    summary = (e["project_summary"] or "").strip()
    title = (e["project_title"] or "").strip()
    iids = list(code2inst.get((e["call_id"] or "").strip(), [])) + list(src2inst.get(e["source"], []))
    guards.note_event(e["company_id"], iids, [summary, title])
    if title:
        for iid in iids: own_titles[iid].add(squash(title))
    if e["company_id"] in wanted and iids:
        cand[e["company_id"]].append({"iids": iids, "summary": summary, "title": title})
conn.close()

MAXC = 1200
def truncate(t, limit=MAXC):
    t = t.strip()
    if len(t) <= limit: return t
    cut = t[:limit]; sp = cut.rfind(" ")
    return (cut[:sp] if sp > limit-120 else cut).rstrip(" ,;:-")

OWN = {"own_award_text","own_project_title"}
out = collections.Counter()
detail = collections.Counter()
per_founder = []
for key, d in DRAW.items():
    if d["descriptionSource"] in OWN:
        out["already own words"] += 1
        continue
    # which fund does the key credit this founder with?
    rows = [p for p in by_name[key] if (p.get("description") or "") == d["description"]]
    won = rows[0]["instrument"] if rows else None
    if won is None:
        out["could not resolve the won fund"] += 1; continue
    # does the corpus hold prose from an award UNDER THE WON FUND for this company?
    texts = []
    for cid in cid_by_name.get(key, []):
        for ev in cand.get(cid, []):
            if won not in ev["iids"]: continue
            for kind in ("summary","title"):
                if ev[kind]: texts.append((kind, ev[kind]))
    if not texts:
        out["no award prose under the won fund at all"] += 1
        per_founder.append((key, "absent", None)); continue
    usable, reasons = None, []
    for kind, raw in texts:
        t = truncate(raw)
        r = guards.reject_reason(t, kind, won)
        if not r and squash(t) in own_titles.get(won, ()):
            r = "is a project title of the won fund's own award"
        if r: reasons.append(r)
        else: usable = (kind, t)
    if usable:
        out["HELD, leak-free, and NOT used"] += 1
        per_founder.append((key, "usable", usable[0]))
    else:
        out["held but every candidate fails a leak guard"] += 1
        detail[reasons[0]] += 1
        per_founder.append((key, "rejected", reasons[0]))

print("\n=== cross-regime founders in the draw: is the WON FUND's own award prose held? ===")
tot = sum(v for k, v in out.items() if k != "already own words")
for k, v in out.most_common():
    print(f"  {v:5d}  {k}" + ("" if k == "already own words" else f"   ({100*v/tot:.1f}% of {tot})"))
print("\n  first guard that rejected, where prose existed:")
for k, v in detail.most_common(): print(f"    {v:5d}  {k}")

