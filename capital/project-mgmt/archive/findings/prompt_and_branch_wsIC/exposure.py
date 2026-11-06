"""How much of the obstructed exposure the GATE fix alone removes.

FREE. Two committed tapes, parsed. No model, no database, no network.

WHY THIS AND NOT A COUNTERFACTUAL ON THE PROMPT. wsIA established that the
selector takes an obstructed row at the head of its list 9.6% of the time
against 49.2% for an open one, and that the prompt told it to. What CANNOT be
computed from a tape is what the model does once the sentence is gone: that
needs a paid arm and this workstream has EUR 0.

What CAN be computed is how much smaller the problem gets from the gate fix
alone -- because every row the fix turns from "one thing in the way" into
"nothing we can check rules them out" is a row that stops being subject to the
suppression at all, whatever the prompt says. That is the number below, and it
is a fact about the menus that were actually built, not a prediction.

    python3 project-mgmt/findings/prompt_and_branch_wsIC/exposure.py
"""
import collections
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FIXED = {"innovate_uk"}          # the instruments this workstream's correction touches


def blocks(prompt):
    """The menu, split into rows. Rows are 0-indexed; [0] is the first row."""
    i = prompt.index("CANDIDATES\n")
    txt = prompt[i + len("CANDIDATES\n"):]
    out = {}
    for part in re.split(r"\n(?=\[\d+\])", "\n" + txt):
        m = re.match(r"\s*\[(\d+)\]", part)
        if m:
            out[int(m.group(1))] = part.strip()
    return out


def band(blockstr):
    m = re.search(r"qualification: (.*)", blockstr)
    q = m.group(1) if m else ""
    if "in the way" in q:
        return "OBSTRUCTED"
    if "no encoded rule" in q:
        return "UNASSESSED"
    if "nothing we can check" in q:
        return "OPEN"
    return "OTHER"


def main():
    for tag in ("wsHO", "wsHW"):
        tape = ROOT / "project-mgmt" / "findings" / f"indicative_{tag}" / "main_tape.jsonl"
        rows = [json.loads(l) for l in tape.read_text().splitlines() if l.strip()]
        called = [r for r in rows if r.get("called")]
        print("=" * 78)
        print(f"{tag}   {len(called)} called founders, menus as the model saw them")

        obstructed = 0
        obstructed_fixed = 0
        head_obstructed = 0
        head_obstructed_fixed = 0
        founders_with_obstructed_head = set()
        founders_still = set()
        picked_obstructed = collections.Counter()

        for r in called:
            B = blocks(r["turns"][0]["prompt"])
            head_has, head_still = False, False
            for n, b in B.items():
                if band(b) != "OBSTRUCTED":
                    continue
                # The row's instrument id is not printed in the menu, so the
                # fund is identified by the one thing that is: whether this
                # founder's WON fund sits at this index. That is exact for the
                # won row -- the alignment wsIA verified on 78 of 78 -- and it
                # is the row the harm metric is about.
                is_fixed = (n == r.get("poolRankControl", -99) - 1
                            and r.get("won") in FIXED)
                obstructed += 1
                obstructed_fixed += is_fixed
                if n < 7:
                    head_obstructed += 1
                    head_obstructed_fixed += is_fixed
                    head_has = True
                    if not is_fixed:
                        head_still = True
                if n in r.get("picks", []):
                    picked_obstructed["all"] += 1
                    if is_fixed:
                        picked_obstructed["fixed"] += 1
            if head_has:
                founders_with_obstructed_head.add(r.get("company"))
            if head_still:
                founders_still.add(r.get("company"))

        def pct(a, b):
            return f"{(100 * a / b):.1f}%" if b else "n/a"

        print(f"  obstructed rows in all menus          {obstructed:5}")
        print(f"    ... that the gate fix opens         {obstructed_fixed:5}  "
              f"({pct(obstructed_fixed, obstructed)})")
        print(f"  obstructed rows at the head (rank<7)  {head_obstructed:5}")
        print(f"    ... that the gate fix opens         {head_obstructed_fixed:5}  "
              f"({pct(head_obstructed_fixed, head_obstructed)})")
        print(f"  founders carrying an obstructed head row "
              f"{len(founders_with_obstructed_head):4} of {len(called)}"
              f"  ({pct(len(founders_with_obstructed_head), len(called))})")
        print(f"    ... still carrying one after the fix    {len(founders_still):4} of {len(called)}"
              f"  ({pct(len(founders_still), len(called))})")
        print(f"  obstructed rows the model PICKED      {picked_obstructed['all']:5}"
              f"   of which the fix opens {picked_obstructed['fixed']}")

    print("\nNOTE. This counts only the WON row, because the menu prints no")
    print("instrument id and the won row is the only one a tape can name")
    print("exactly. Every OTHER innovate_uk row in a GB founder's menu is")
    print("opened by the same correction and is not counted here, so the")
    print("reduction below is a FLOOR, not an estimate.")


if __name__ == "__main__":
    sys.exit(main())
