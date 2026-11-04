"""Is a candidate's assembled text ITS OWN, or its regime's?

The sibling metric keys on the whole string, so two texts that share 95% of
their sentences and differ in a trailing clause both count as "separated". They
are not. A founder reading them cannot tell the two funds apart, and the number
we would report would be an artefact of string equality.

The property being tested, stated so it holds for regimes nobody has looked at
yet:

    A candidate's text earns its place only if the part of it that NO sibling
    also states is large enough to be an answer on its own.

Operationally: split each candidate into sentences, normalise them, and compute
`own_share` -- the fraction of the text's characters carried by sentences that
appear in NO other leaf of the same regime (candidate or already-written). A
regime whose leaves all sit near zero is publishing one document onto many
funds; a regime whose leaves sit high is publishing per-fund rules.

The threshold is deliberately stated as a number here rather than hidden in a
judgement call, and the per-regime table is printed so the call can be argued
with. Nothing about this test names a country, a regime or a fund.
"""
from __future__ import annotations

import re
import sys
from collections import defaultdict

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from probe_quote_harvest import (  # noqa: E402
    REPO, assemble, connect, load, load_quotes, norm, publishable_ids)
import psycopg2.extras  # noqa: E402

# A sentence has to be substantial before its presence or absence says anything.
MIN_SENT = 40
# Below this, the text is mostly its regime's words and will not help a founder
# choose. Chosen so that a leaf must carry at least a third of its own content.
OWN_SHARE_FLOOR = 0.34


def sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.;:])\s+|\s+(?=[-–•])", text or "")
    return [p.strip() for p in parts if len(p.strip()) >= MIN_SENT]


def own_share(text: str, sibling_texts: list[str]) -> tuple[float, int, int]:
    """(share of chars unique to this leaf, own sentences, total sentences)"""
    mine = sentences(text)
    if not mine:
        return 0.0, 0, 0
    theirs = set()
    for t in sibling_texts:
        theirs.update(norm(s) for s in sentences(t))
    own = [s for s in mine if norm(s) not in theirs]
    total = sum(len(s) for s in mine) or 1
    return sum(len(s) for s in own) / total, len(own), len(mine)


def main() -> None:
    conn = connect()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    inst = load(cur)
    quotes = load_quotes(cur)
    pub = publishable_ids()

    regime = defaultdict(list)
    for i in inst.values():
        regime[i["parent_id"] or i["id"]].append(i["id"])

    print(f"own_share floor {OWN_SHARE_FLOOR}, min sentence {MIN_SENT} chars\n")
    print(f"{'regime':<28}{'lf':>3}{'cand':>5}{'pub':>4}  "
          f"{'mean own_share':>15}  {'min':>5}  verdict")
    keep: list[str] = []
    drop: list[str] = []
    for rid, members in sorted(regime.items(), key=lambda kv: -len(kv[1])):
        if len(members) < 2:
            continue
        cands = {}
        for i in members:
            if norm(inst[i]["eligibility_text"]):
                continue
            t = assemble(quotes.get(i) or [])
            if len(t) >= 40:
                cands[i] = t
        if not cands:
            continue
        # Siblings to compare against: every other leaf's text, whether it is a
        # candidate or already carries eligibility_text.
        pool = {i: cands.get(i) or inst[i]["eligibility_text"] or "" for i in members}
        scores = {}
        for i, t in cands.items():
            scores[i] = own_share(t, [v for k, v in pool.items() if k != i and v])
        mean = sum(s[0] for s in scores.values()) / len(scores)
        lo = min(s[0] for s in scores.values())
        npub = sum(1 for i in cands if i in pub)
        ok = lo >= OWN_SHARE_FLOOR
        verdict = "per-fund" if ok else ("REGIME-INHERITED" if mean < OWN_SHARE_FLOOR
                                         else "MIXED")
        print(f"{rid[:28]:<28}{len(members):>3}{len(cands):>5}{npub:>4}  "
              f"{mean:>15.2f}  {lo:>5.2f}  {verdict}")
        for i, (sh, o, n) in sorted(scores.items(), key=lambda kv: kv[1][0]):
            tag = "keep" if sh >= OWN_SHARE_FLOOR else "DROP"
            (keep if sh >= OWN_SHARE_FLOOR else drop).append(i)
            if len(members) > 2 or True:
                print(f"      {tag}  {i[:34]:<34} own {sh:>4.2f}  "
                      f"{o}/{n} sentences  {'pub' if i in pub else '   '}")

    print(f"\nkeep {len(keep)}  ({sum(1 for i in keep if i in pub)} publishable)")
    print(f"drop {len(drop)}  ({sum(1 for i in drop if i in pub)} publishable)")
    (REPO / "boilerplate_verdict.json").write_text(
        __import__("json").dumps({"keep": keep, "drop": drop}, indent=0))


if __name__ == "__main__":
    sys.exit(main())
