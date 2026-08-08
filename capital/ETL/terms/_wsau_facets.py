"""WS-AU: distinctness of the ELIGIBILITY-BEARING part of the Spanish text.

The whole string is 88/88 distinct, which looks like a green light. It is not.
The string is composed by `load_bdns_open_calls.compose` out of register facets,
and most of those facets are programme facts by the corpus's own triage
definition -- budget, aid regime, application window, the title of the bases
reguladoras. Distinctness carried by a budget figure cannot separate two funds
for a founder, because no founder attribute is compared against it.

So measure the part that could ever become a FILTER, and nothing else.
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import ROOT  # noqa: E402

import os  # noqa: E402
import re  # noqa: E402
from collections import Counter  # noqa: E402

import psycopg2  # noqa: E402

# The facets a gate could be cut from, and the facets that are programme facts
# whatever they say. Split stated explicitly: the claim being tested is that
# distinctness lives entirely in the second group.
FILTERABLE = ["Beneficiarios", "Ámbito regional", "Sectores elegibles"]
FACTUAL = ["Finalidad", "Tipo de convocatoria", "Instrumento",
           "Régimen de ayudas", "Presupuesto total", "Plazo de solicitud",
           "Bases reguladoras"]
ALL_FACETS = FILTERABLE + FACTUAL


def facets(text: str) -> dict[str, str]:
    """Split the composed text back into the facets it was composed from."""
    out: dict[str, str] = {}
    pat = "|".join(re.escape(f) for f in ALL_FACETS)
    hits = list(re.finditer(rf"({pat}):\s*", text))
    for i, m in enumerate(hits):
        end = hits[i + 1].start() if i + 1 < len(hits) else len(text)
        out[m.group(1)] = text[m.end():end].strip().rstrip(".").strip()
    return out


pg = psycopg2.connect(os.environ["DATABASE_URL"])
cur = pg.cursor()
cur.execute("""
    SELECT fi.id, fi.name, fi.eligibility_text
      FROM funding_instruments fi
     WHERE fi.country = 'ES' AND fi.is_framework = false
       AND fi.eligibility_text IS NOT NULL
       AND length(trim(fi.eligibility_text)) > 40
       AND NOT EXISTS (SELECT 1 FROM eligibility_gates g WHERE g.instrument_id = fi.id)
     ORDER BY fi.id""")
rows = cur.fetchall()
print(f"{len(rows)} unconverted ES instruments\n")

parsed = [(r[0], r[1], facets(r[2])) for r in rows]
n = len(parsed)

print("=== per-facet distinctness (how many different values it takes) ===")
print(f"{'facet':24} {'present':>8} {'distinct':>9} {'mean class':>11}  group")
for f in ALL_FACETS:
    vals = [p[2][f] for p in parsed if f in p[2]]
    if not vals:
        print(f"{f:24} {0:8} {'-':>9} {'-':>11}  "
              f"{'FILTERABLE' if f in FILTERABLE else 'programme fact'}")
        continue
    c = Counter(vals)
    mean_class = sum(c[v] for v in vals) / len(vals)
    print(f"{f:24} {len(vals):8} {len(c):9} {mean_class:11.1f}  "
          f"{'FILTERABLE' if f in FILTERABLE else 'programme fact'}")

print("\n=== distinctness of the FILTERABLE facets, jointly ===")
joint = Counter(" | ".join(p[2].get(f, "") for f in FILTERABLE) for p in parsed)
mean_joint = sum(joint[" | ".join(p[2].get(f, "") for f in FILTERABLE)]
                 for p in parsed) / n
print(f"  {len(joint)} distinct eligibility signatures across {n} rows")
print(f"  mean sibling class on the filterable content: {mean_joint:.1f}")
print(f"  -> a founder attribute can separate at most {len(joint)} of {n} rows")

print("\n=== distinctness of the FACTUAL facets, jointly (the contrast) ===")
jf = Counter(" | ".join(p[2].get(f, "") for f in FACTUAL) for p in parsed)
print(f"  {len(jf)} distinct across {n} rows  <- where the 88/88 comes from")

print("\n=== the beneficiary enumeration, in full ===")
for v, k in Counter(p[2].get("Beneficiarios", "(absent)") for p in parsed).most_common():
    print(f"  {k:4}  {v[:96]}")

print("\n=== the sector facet, in full ===")
for v, k in Counter(p[2].get("Sectores elegibles", "(absent)")
                    for p in parsed).most_common(12):
    print(f"  {k:4}  {v[:96]}")

print("\n=== the regional facet ===")
for v, k in Counter(p[2].get("Ámbito regional", "(absent)")
                    for p in parsed).most_common(12):
    print(f"  {k:4}  {v[:96]}")

# The other half of the argument: does the text ASSERT anything? AT's Property 2
# says a filter may only be cut from text that states a requirement, an
# exclusion, or a list the text itself calls exhaustive. Look for the Spanish
# forms of an assertion anywhere in the corpus.
print("\n=== does any of this text ASSERT a restriction? ===")
ASSERT = [r"no ser[aá]n? elegibles", r"quedan excluid", r"no podr[aá]n? (ser )?benefici",
          r"se excluye", r"requisitos?", r"deber[aá]n?", r"ser[aá] necesario",
          r"únicamente", r"solo podr[aá]n", r"exclusivamente", r"quedar[aá]n excluid"]
hits = Counter()
for _, _, f in parsed:
    blob = " ".join(f.values()).lower()
    for a in ASSERT:
        if re.search(a, blob):
            hits[a] += 1
print(f"  rows containing any assertion verb: "
      f"{sum(1 for _, _, f in parsed if any(re.search(a, ' '.join(f.values()).lower()) for a in ASSERT))} of {n}")
for a, k in hits.most_common():
    print(f"    {k:4}  /{a}/")

pg.close()
