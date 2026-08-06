"""Does Vinnova's per-round eligibility text actually SEPARATE its programmes?

Sweden's whole remaining sibling problem is one regime: every leaf carries the
same administering body, one delivery region, no application URL and no text, so
per-programme eligibility text is the only lever that exists there.

The risk, stated by the agent that found the source and never got to load it:
several programmes run one round each, and the strategic-innovation-programme
family shares wording. If the "who may apply" field is the same sentence across
a family, that family is boilerplate and loading it buys coverage and no
separation at all.

So this probe answers, before anything is written:
  1. how many leaves reach a round with a populated "Vem kan söka?" at all;
  2. whether the text a leaf would get is distinct from its siblings' -- both
     exactly, and by the same own_share test the quote harvest uses;
  3. what the sibling class would become if it were loaded.

Reads only the cached CC0 pulls from data.vinnova.se. No writes.
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from probe_quote_harvest import connect, norm, publishable_ids  # noqa: E402

import psycopg2.extras  # noqa: E402

CACHE = Path(__file__).resolve().parents[1] / ".cache"
REGIME = "vinnova_grant"
# TextID 2 is the "Vem kan söka?" card Vinnova shows on every call page -- who
# may apply. 1 is what the money is for, 3 is how much.
WHO_MAY_APPLY = 2
MIN_TEXT = 40
MIN_SENTENCE = 40


def sentences(t: str) -> list[str]:
    parts = re.split(r"(?<=[.;:])\s+|\s+(?=[-–•])", t or "")
    return [p.strip() for p in parts if len(p.strip()) >= MIN_SENTENCE]


def own_share(text: str, others: list[str]) -> float:
    mine = sentences(text)
    if not mine:
        return 0.0
    theirs = {norm(s) for o in others for s in sentences(o)}
    tot = sum(len(s) for s in mine) or 1
    return sum(len(s) for s in mine if norm(s) not in theirs) / tot


def load_cache():
    return (json.loads((CACHE / "program.json").read_text()),
            json.loads((CACHE / "utlysningar.json").read_text()),
            json.loads((CACHE / "ansokningsomgangar.json").read_text()))


def who_may_apply(round_rec: dict) -> str:
    for w in round_rec.get("WebTextLista") or []:
        if w.get("TextID") == WHO_MAY_APPLY:
            return re.sub(r"\s+", " ", (w.get("TextSv") or "")).strip()
    return ""


def closes(round_rec: dict):
    s = round_rec.get("Stangningsdatum")
    try:
        return datetime.fromisoformat(s).date() if s else None
    except ValueError:
        return None


def pick(rounds: list[dict], today: date):
    """The round whose rules describe the programme a founder would meet now.

    An OPEN round is a promise about the call in front of them. A past round is
    evidence about how the programme behaves, which is weaker but real -- so the
    most recent closed round is the fallback and it is marked down in
    confidence, never presented as if it were open.
    """
    usable = [r for r in rounds if len(who_may_apply(r)) >= MIN_TEXT]
    if not usable:
        return None, None
    live = [r for r in usable if (closes(r) or date.min) >= today]
    if live:
        return min(live, key=lambda r: closes(r) or date.max), "open"
    return max(usable, key=lambda r: closes(r) or date.min), "past"


def chain():
    """leaf name (lowercased) -> its application rounds, newest last."""
    prog, utl, ans = load_cache()
    by_dnr_prog = defaultdict(list)
    for u in utl:
        if u.get("DiarienummerProgram"):
            by_dnr_prog[u["DiarienummerProgram"]].append(u)
    by_dnr_utl = defaultdict(list)
    for a in ans:
        if a.get("DiarienummerUtlysning"):
            by_dnr_utl[a["DiarienummerUtlysning"]].append(a)
    out = {}
    for p in prog:
        rounds = []
        for u in by_dnr_prog.get(p["Diarienummer"], []):
            rounds.extend(by_dnr_utl.get(u["Diarienummer"], []))
            for ref in u.get("AnsokningsomgangDnrLista") or []:
                d = ref.get("DiarienummerAnsokningsomgang") or ref.get("Diarienummer")
                rounds.extend(r for r in by_dnr_utl.get(d, []) if r not in rounds)
        out[(p.get("Titel") or "").strip().lower()] = {"prog": p, "rounds": rounds}
    return out


def main() -> None:
    today = date.today()
    progs = chain()
    conn = connect()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT id, name, eligibility_text FROM funding_instruments "
                "WHERE parent_id = %s", (REGIME,))
    leaves = {r["id"]: dict(r) for r in cur.fetchall()}
    pub = publishable_ids()

    drafted, why = {}, {}
    for iid, row in leaves.items():
        p = progs.get((row["name"] or "").strip().lower())
        if not p:
            why[iid] = "no programme record"
            continue
        if not p["rounds"]:
            why[iid] = "programme has no application rounds"
            continue
        r, kind = pick(p["rounds"], today)
        if not r:
            why[iid] = f"{len(p['rounds'])} rounds, none with a populated 'Vem kan söka?'"
            continue
        drafted[iid] = (who_may_apply(r), kind, r)

    print(f"{len(leaves)} leaves in {REGIME} ({sum(1 for i in leaves if i in pub)} "
          f"publishable); {len(drafted)} reach a round with eligibility text\n")
    for iid, w in sorted(why.items()):
        print(f"  no text  {iid:<40} {w}")

    # ---- the boilerplate question -----------------------------------------
    groups = defaultdict(list)
    for iid, (t, _k, _r) in drafted.items():
        groups[norm(t)].append(iid)
    dupes = {k: v for k, v in groups.items() if len(v) > 1}
    print(f"\ndistinct texts: {len(groups)} across {len(drafted)} leaves")
    if dupes:
        print("SHARED WORDING -- these leaves would receive identical text:")
        for k, v in sorted(dupes.items(), key=lambda kv: -len(kv[1])):
            print(f"  {len(v):>2} leaves  {', '.join(sorted(v))[:110]}")
            print(f"      \"{k[:150]}\"")
    else:
        print("no two leaves would receive the same text")

    lows = []
    for iid, (t, kind, _r) in sorted(drafted.items()):
        sh = own_share(t, [o for j, (o, _, _) in drafted.items() if j != iid])
        if sh < 0.34:
            lows.append((iid, sh, t))
    print(f"\nbelow the 0.34 own_share floor: {len(lows)}")
    for iid, sh, t in lows:
        print(f"  {iid:<40} {sh:.2f}  \"{t[:90]}\"")

    # ---- what it would buy ------------------------------------------------
    n = len(leaves)
    klass = []
    for iid in leaves:
        key = norm(drafted[iid][0]) if iid in drafted else ""
        klass.append(sum(1 for j in leaves
                         if (norm(drafted[j][0]) if j in drafted else "") == key))
    print(f"\nregime sibling class today: {n:.1f} (every leaf identical)")
    print(f"regime sibling class if loaded: {sum(klass)/len(klass):.2f}")
    print(f"open rounds {sum(1 for v in drafted.values() if v[1]=='open')}, "
          f"past rounds {sum(1 for v in drafted.values() if v[1]=='past')}")

    print("\nsample:")
    for iid, (t, kind, r) in sorted(drafted.items())[:4]:
        print(f"  {iid} [{kind}, closes {r.get('Stangningsdatum')}]\n      {t[:190]}")


if __name__ == "__main__":
    sys.exit(main())
