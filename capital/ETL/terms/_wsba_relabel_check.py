"""Workstream BA: does ADEME's 91% reproduce, or did we measure one sampling?

wsAY's self-consistency rule exists because subsector lost 92% of its lift out of
sample. That rule is stated for attributes computed from AWARD HISTORY, and it is
tested by splitting a leaf's awards at a cut year. The technology labels are not
award-derived -- `_wsay_label_axes.py` reads the scheme title, the register
description and the published eligibility text -- so the early/late split is not
defined for them and running it would be theatre.

The analogous failure mode for a label produced by a model is different and just
as real: the label might not be reproducible. If a second pass over the SAME text
produces materially different labels, then the 91% describes one sampling of the
model rather than a property of ADEME, and it would not survive being rebuilt.

So this re-labels ADEME independently and compares two things, in increasing order
of what actually matters:

    exact agreement   did the second pass write the same string?
    ceiling agreement did the second pass separate the regime just as well?

The second is the one that decides. Two passes may reasonably write "heavy
electric vehicles" and "electric heavy goods vehicles" for the same call; that is
a paraphrase, not a disagreement, and it changes no founder's outcome. A ceiling
that moves, on the other hand, means the number is not a measurement.

Writes to its OWN cache so the canonical labelling is never touched.
"""
from __future__ import annotations

import json
import os
import sys
from collections import Counter, defaultdict

import anthropic
import psycopg2
import psycopg2.extras

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib"))
from _wsay_ceilings import norm  # noqa: E402
from _wsay_label_axes import MODEL, SCHEMA, SYSTEM, brief  # noqa: E402 — one definition only
from etl_env import ROOT  # noqa: E402

CANON = ROOT / "data" / "wsay_leaf_axes.json"
CACHE = ROOT / "data" / "wsba_relabel_ademe.json"
REGIME = "ademe_aid"
BATCH = 12


def tech(lab: dict) -> str:
    return norm(lab.get("technology_label")) or norm(lab.get("sector_label"))


def ceiling5(rows, key):
    cls = Counter(key(r) for r in rows)
    sizes = [cls[key(r)] for r in rows]
    return sum(1 for s in sizes if s <= 5) / len(sizes)


def main():
    db = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT id, parent_id, name, country, description, eligibility_text,
               scheme_code, administering_body, award_p50
          FROM funding_instruments WHERE parent_id = %s
    """, (REGIME,))
    rows = [dict(r) for r in cur.fetchall()]
    db.close()

    canon = json.loads(CANON.read_text())
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    todo = [r for r in rows if r["id"] not in cache]
    limit = int(os.environ.get("LIMIT", "0"))
    if limit:
        todo = todo[:limit]
    print(f"{REGIME}: {len(rows)} leaves, {len(cache)} already re-labelled, {len(todo)} to do")

    if todo:
        client = anthropic.Anthropic()
        for i in range(0, len(todo), BATCH):
            chunk = todo[i:i + BATCH]
            body = "\n\n---\n\n".join(brief(r) for r in chunk)
            resp = client.messages.create(
                model=MODEL,
                max_tokens=8000,
                system=SYSTEM,
                thinking={"type": "adaptive"},
                output_config={"effort": "medium",
                               "format": {"type": "json_schema", "schema": SCHEMA}},
                messages=[{"role": "user", "content":
                           f"Label each of these {len(chunk)} leaves.\n\n{body}"}],
            )
            if resp.stop_reason == "refusal":
                print(f"  batch {i // BATCH}: refused, skipping")
                continue
            text = next(b.text for b in resp.content if b.type == "text")
            for leaf in json.loads(text)["leaves"]:
                cache[leaf["id"]] = leaf
            CACHE.write_text(json.dumps(cache, indent=1, ensure_ascii=False))
            print(f"  {min(i + BATCH, len(todo))}/{len(todo)} "
                  f"(in {resp.usage.input_tokens} out {resp.usage.output_tokens})")

    both = [r for r in rows if r["id"] in canon and r["id"] in cache]
    if not both:
        print("nothing labelled twice yet")
        return

    exact = sum(1 for r in both if tech(canon[r["id"]]) == tech(cache[r["id"]]))
    axis = sum(1 for r in both
               if canon[r["id"]]["primary_axis"] == cache[r["id"]]["primary_axis"])
    empt1 = sum(1 for r in both if not tech(canon[r["id"]]))
    empt2 = sum(1 for r in both if not tech(cache[r["id"]]))

    c1 = ceiling5(both, lambda r: tech(canon[r["id"]]))
    c2 = ceiling5(both, lambda r: tech(cache[r["id"]]))
    n1 = len({tech(canon[r["id"]]) for r in both})
    n2 = len({tech(cache[r["id"]]) for r in both})

    print("\n" + "=" * 78)
    print(f"REPRODUCIBILITY OF THE ADEME LABELLING  (n={len(both)} leaves labelled twice)")
    print("=" * 78)
    print(f"  exact string agreement        {exact / len(both):>6.0%}   ({exact}/{len(both)})")
    print(f"  primary_axis agreement        {axis / len(both):>6.0%}   ({axis}/{len(both)})")
    print(f"  left unlabelled, pass 1 / 2   {empt1:>6} / {empt2}")
    print(f"  distinct labels, pass 1 / 2   {n1:>6} / {n2}")
    print()
    print(f"  CEILING@5 pass 1              {c1:>6.0%}")
    print(f"  CEILING@5 pass 2              {c2:>6.0%}")
    print(f"  movement                      {abs(c1 - c2):>6.0%}")
    print()
    print("  The ceiling is the number that matters; a paraphrase that separates the")
    print("  regime identically is not a disagreement.")

    dis = [(r["name"][:52], tech(canon[r["id"]]), tech(cache[r["id"]]))
           for r in both if tech(canon[r["id"]]) != tech(cache[r["id"]])]
    if dis:
        print(f"\n  first disagreements ({len(dis)} total):")
        for nm, a, b in dis[:10]:
            print(f"    {nm}\n       1: {a or '(none)'}\n       2: {b or '(none)'}")


if __name__ == "__main__":
    main()
