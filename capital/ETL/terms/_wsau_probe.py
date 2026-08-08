"""WS-AU probe: the Spanish gap, and whether the text behind it is boilerplate.

Read-only. Everything comes out of Postgres, which is what the product serves.
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import ROOT  # noqa: E402  (loads .env.local)

import hashlib  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import unicodedata  # noqa: E402
from collections import Counter, defaultdict  # noqa: E402

import psycopg2  # noqa: E402


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s or "")
    s = s.replace(" ", " ").replace("’", "'")
    return re.sub(r"\s+", " ", s).strip().lower()


def key(s: str) -> str:
    return hashlib.sha256(norm(s).encode()).hexdigest()[:16]


pg = psycopg2.connect(os.environ["DATABASE_URL"])
cur = pg.cursor()

print("=== the gap, per country (Postgres) ===")
cur.execute("""
    SELECT fi.country,
           COUNT(*) FILTER (WHERE fi.eligibility_text IS NOT NULL
                              AND length(trim(fi.eligibility_text)) > 40) AS with_text,
           COUNT(*) FILTER (WHERE fi.eligibility_text IS NOT NULL
                              AND length(trim(fi.eligibility_text)) > 40
                              AND EXISTS (SELECT 1 FROM eligibility_gates g
                                           WHERE g.instrument_id = fi.id)) AS with_gate,
           COUNT(*) FILTER (WHERE fi.eligibility_text IS NOT NULL
                              AND length(trim(fi.eligibility_text)) > 40
                              AND EXISTS (SELECT 1 FROM eligibility_gates g
                                           WHERE g.instrument_id = fi.id
                                             AND g.value_spec IS NOT NULL)) AS with_spec
      FROM funding_instruments fi
     WHERE fi.is_framework = false
     GROUP BY 1 HAVING COUNT(*) FILTER (WHERE fi.eligibility_text IS NOT NULL
                                          AND length(trim(fi.eligibility_text)) > 40) > 0
     ORDER BY 2 DESC LIMIT 15""")
print(f"{'cc':4} {'with_text':>10} {'any gate':>9} {'encoded':>8} {'UNUSED':>7}")
for cc, t, g, s, in cur.fetchall():
    print(f"{cc:4} {t:10} {g:9} {s:8} {t - g:7}")

print("\n=== ES: the unconverted rows ===")
cur.execute("""
    SELECT fi.id, fi.name, fi.parent_id, fi.eligibility_text,
           fi.eligibility_source_url, fi.name_basis
      FROM funding_instruments fi
     WHERE fi.country = 'ES' AND fi.is_framework = false
       AND fi.eligibility_text IS NOT NULL
       AND length(trim(fi.eligibility_text)) > 40
       AND NOT EXISTS (SELECT 1 FROM eligibility_gates g WHERE g.instrument_id = fi.id)
     ORDER BY fi.parent_id, fi.id""")
rows = cur.fetchall()
print(f"{len(rows)} ES instruments carry text and no gate at all")

texts = defaultdict(list)
for r in rows:
    texts[key(r[3])].append(r)
print(f"{len(texts)} distinct texts among them "
      f"({len(rows) - len(texts)} rows are aliases of another text)")

print("\n=== distinctness WITHIN each parent regime (the boilerplate test) ===")
by_parent = defaultdict(list)
for r in rows:
    by_parent[r[2]].append(r)
cur.execute("SELECT id, name FROM funding_instruments")
names = dict(cur.fetchall())
tot_leaves = tot_distinct = 0
for pid, members in sorted(by_parent.items(), key=lambda kv: -len(kv[1])):
    ks = {key(m[3]) for m in members}
    tot_leaves += len(members)
    tot_distinct += len(ks)
    flag = "IDENTICAL" if len(ks) == 1 and len(members) > 1 else ""
    print(f"  parent={str(pid):>6} {str(names.get(pid, '(none)'))[:44]:46} "
          f"leaves={len(members):3}  distinct texts={len(ks):3}  {flag}")
print(f"\n  overall: {tot_leaves} leaves -> {tot_distinct} distinct texts "
      f"({100*tot_distinct/max(1,tot_leaves):.0f}% distinct)")

print("\n=== length profile of the ES text ===")
lens = sorted(len(r[3]) for r in rows)
if lens:
    print(f"  min={lens[0]}  p25={lens[len(lens)//4]}  median={lens[len(lens)//2]}  "
          f"p75={lens[3*len(lens)//4]}  max={lens[-1]}")

print("\n=== the 11 ES rows that DID convert, for contrast ===")
cur.execute("""
    SELECT fi.id, fi.name, COUNT(g.id), COUNT(g.value_spec)
      FROM funding_instruments fi JOIN eligibility_gates g ON g.instrument_id = fi.id
     WHERE fi.country = 'ES' AND fi.is_framework = false
     GROUP BY 1,2 ORDER BY 3 DESC LIMIT 20""")
for iid, nm, n, enc in cur.fetchall():
    print(f"  {iid:6} {nm[:52]:54} gates={n:3} encoded={enc:3}")

print("\n=== sample of the unconverted text (first 3 distinct) ===")
for i, (k, members) in enumerate(list(texts.items())[:3]):
    m = members[0]
    print(f"\n--- [{i}] x{len(members)} rows | {m[1][:60]} | basis={m[5]}")
    print(f"    url={m[4]}")
    print("    " + norm(m[3])[:700])

pg.close()
