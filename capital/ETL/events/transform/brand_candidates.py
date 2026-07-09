"""Brand-dictionary candidate generator (the repeatable review step).

The big-company fragmentation problem is bounded (a few hundred multinationals),
so the systematic process is: rank distinctive tokens by how much they would
consolidate, REVIEW the top set once, add the genuine brands to
scripts/lib/brand_dictionary.py. Run this whenever new sources land to surface
newly-fragmented big companies. Generics, surnames, and city/word clashes are
rejected by the reviewer (that human judgement IS the precision control here).

Usage: python3 scripts/brand_candidates.py [N]   # show top N (default 60)
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

import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

ROOT = _ETL_ROOT
pass  # sys.path handled by etl_env bootstrap
from merge_companies import norm_tokens, DB  # noqa: E402
from merge_stoplist import is_distinctive  # noqa: E402
from brand_dictionary import BRANDS  # noqa: E402

N = int(sys.argv[1]) if len(sys.argv) > 1 else 60
con = sqlite3.connect(DB)
rows = con.execute("""
    SELECT c.canonical_name, COALESCE(c.country, ''),
           COALESCE(SUM(COALESCE(v.grant_amount_eur,0)+COALESCE(v.debt_amount_eur,0)),0)
    FROM companies c JOIN v_events v ON v.company_id=c.id GROUP BY c.id
""").fetchall()

cos, ctry, eur = defaultdict(list), defaultdict(set), defaultdict(float)
for nm, ct, e in rows:
    for t in set(norm_tokens(nm)):
        if is_distinctive(t) and t not in BRANDS:
            cos[t].append(nm)
            ctry[t].add(ct)
            eur[t] += e

# multinational signal: many companies AND many countries
cand = [(t, len(v), len(ctry[t]), eur[t]) for t, v in cos.items()
        if len(v) >= 5 and len(ctry[t]) >= 4]
cand.sort(key=lambda x: -x[3])
print(f"{'token':22}{'cos':>4}{'ctry':>5}{'eur_m':>9}  samples (pick real BRANDS, skip generics/surnames)")
for t, n, c, e in cand[:N]:
    print(f"{t:22}{n:4}{c:5}{e / 1e6:9.0f}  " + " | ".join(sorted(set(cos[t]))[:2])[:46])
