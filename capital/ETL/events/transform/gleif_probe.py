#!/usr/bin/env python3
"""GLEIF LEI coverage probe.

Answers the Layer-3 sign-off question with data instead of speculation:
for a sample of corpus companies, what fraction
  (a) have an LEI in GLEIF at all,
  (b) of those, report a parent (direct or ultimate) vs a "reporting exception".

Two samples: a random draw (corpus-representative) and the top recipients by
funding (where a parent rollup actually changes the league table). No API key
needed; GLEIF API is public. Read-only against db.sqlite and the GLEIF API.
"""

# --- ETL path bootstrap (auto-added; see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB as _ETL_DB, ROOT as _ETL_ROOT  # noqa: E402,F401
# --- end ETL path bootstrap ---

import json
import re
import sqlite3
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

API = "https://api.gleif.org/api/v1"
LEGAL = {
    "ab", "ag", "as", "asa", "aps", "bv", "nv", "sa", "sas", "sl", "srl", "spa",
    "gmbh", "ltd", "limited", "plc", "oy", "oyj", "ab", "aps", "kft", "zrt",
    "se", "se.", "inc", "llc", "co", "kg", "mbh", "sp", "zoo", "doo", "ehf",
    "hf", "sarl", "sca", "vof", "ou", "sia", "uab", " apS",
}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9 ]", " ", s.lower())
    toks = [t for t in s.split() if t and t not in LEGAL]
    return " ".join(toks)


def get(url: str, tries: int = 2):
    """Fail-fast: short timeout, at most one quick retry (only useful for a 429).
    The earlier 4x/20s-timeout version burned ~80s on every unresolvable name."""
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/vnd.api+json"})
            with urllib.request.urlopen(req, timeout=8) as r:
                return json.loads(r.read())
        except Exception as e:  # noqa: BLE001
            code = getattr(e, "code", None)
            if code == 429 and i < tries - 1:
                time.sleep(1.0)
                continue
            return None
    return None


def lei_for(name: str):
    """Return (lei, matched_name) if GLEIF has a confident name match, else None."""
    q = urllib.parse.quote(name)
    data = get(f"{API}/fuzzycompletions?field=entity.legalName&q={q}")
    if not data:
        return None
    target = norm(name)
    if not target:
        return None
    for row in data.get("data", [])[:5]:
        val = row.get("attributes", {}).get("value", "")
        rel = row.get("relationships", {}).get("lei-records", {}).get("data")
        if not rel:
            continue
        nv = norm(val)
        # accept exact normalized match, or full containment either direction
        if nv == target or (len(target) >= 6 and (target in nv or nv in target)):
            return rel.get("id"), val
    return None


def parent_status(lei: str) -> str:
    """'parent' if a direct/ultimate parent LEI is reported, else 'exception'/'none'."""
    for kind in ("direct-parent", "ultimate-parent"):
        data = get(f"{API}/lei-records/{lei}/{kind}")
        if data and data.get("data"):
            return "parent"
    return "exception"


def sample(conn, n, top):
    cur = conn.cursor()
    if top:
        rows = cur.execute(
            """SELECT c.canonical_name, c.country, COALESCE(SUM(e.grant_amount),0) amt
               FROM companies c JOIN public_funding_events e ON e.company_id=c.id
               WHERE COALESCE(e.is_duplicate,0)=0
               GROUP BY c.id ORDER BY amt DESC LIMIT ?""",
            (n,),
        ).fetchall()
    else:
        rows = cur.execute(
            "SELECT canonical_name, country, 0 FROM companies ORDER BY RANDOM() LIMIT ?",
            (n,),
        ).fetchall()
    return rows


def run(conn, label, rows):
    hits = 0
    parents = 0
    examples = []
    for name, country, amt in rows:
        res = lei_for(name)
        time.sleep(0.25)
        if res:
            hits += 1
            lei, matched = res
            st = parent_status(lei)
            time.sleep(0.25)
            if st == "parent":
                parents += 1
                if len(examples) < 8:
                    examples.append(f"  + {name} -> {matched} [parent reported]")
            elif len(examples) < 8:
                examples.append(f"  . {name} -> {matched} [LEI but no parent]")
    n = len(rows)
    print(f"\n=== {label} (n={n}) ===")
    print(f"  has LEI:            {hits}/{n}  ({100*hits/n:.0f}%)")
    if hits:
        print(f"  of those, parent:  {parents}/{hits}  ({100*parents/hits:.0f}%)")
    print(f"  -> usable parent links: {parents}/{n}  ({100*parents/n:.1f}% of sample)")
    for e in examples:
        print(e)
    return hits, parents, n


if __name__ == "__main__":
    nrand = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    ntop = int(sys.argv[2]) if len(sys.argv) > 2 else 50
    conn = sqlite3.connect(_ETL_DB)
    print(f"GLEIF coverage probe: random={nrand}, top={ntop}")
    run(conn, "RANDOM sample (corpus-representative)", sample(conn, nrand, top=False))
    run(conn, "TOP recipients by funding (where rollup matters)", sample(conn, ntop, top=True))
