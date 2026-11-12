"""The case library: the owner's model answers and graded runs as war stories.

    PYTHONPATH=. python3 -m mandate.eval.case_library build      # -> mandate/playbooks/cases/<brain>.md
    PYTHONPATH=. python3 -m mandate.eval.case_library check      # drift: generated files equal the yaml
    PYTHONPATH=. python3 -m mandate.eval.case_library retrieve "a credit fund wants guarantees" --brain wincent -k 3

Each case (mandate/eval/cases/*.yaml) is one senior move: the situation, the
junior move, the senior move, the owner's verdict in the owner's words, and
the source. Only owner-grounded cases are rendered (status owner_confirmed or
owner_habit); drafts stay in the yaml until the owner confirms them.

Instinct transfers through cases, not an ever-growing rulebook: the brains
Read the whole file for their brain before a case (small today). `retrieve`
ranks cases for a founder's ask by tag and word overlap, for the day the
library is too long to read whole, and for the loop's diagnosis.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
CASES_DIR = HERE / "cases"
OUT_DIR = HERE.parent / "playbooks" / "cases"
BRAINS = ("wincent", "regina")
RENDERED = ("owner_confirmed", "owner_habit")
REQUIRED = ("id", "brains", "status", "checks", "tags", "title", "situation", "junior_move", "senior_move", "owner_verdict", "source")

HEADER = """# {Brain}: worked cases (war stories)

GENERATED from `mandate/eval/cases/*.yaml` by `python -m mandate.eval.case_library build`;
edit the yaml, not this file. Each case is one senior move with the owner's verdict in the
owner's words. The names in a case are evidence, not the rule: swap the country, the fund
or the company and the move must still hold. Before working a case, find the closest one
here and ask what its senior move means for the case in front of you.

Status: **owner_confirmed** = the owner's model answer or grade; **owner_habit** = a habit
from the owner's interviews, applied to a run the owner has not graded yet.
"""


def load_cases() -> list[dict]:
    out = []
    for p in sorted(CASES_DIR.glob("*.yaml")):
        d = yaml.safe_load(p.read_text())
        missing = [k for k in REQUIRED if not d.get(k)]
        if missing:
            raise ValueError(f"{p.name}: missing {', '.join(missing)}")
        if d["id"] != p.stem:
            raise ValueError(f"{p.name}: id {d['id']!r} does not match the file name")
        bad = [b for b in d["brains"] if b not in BRAINS]
        if bad:
            raise ValueError(f"{p.name}: unknown brains {bad}")
        d["_file"] = p.name
        out.append(d)
    return out


def _para(s: str) -> str:
    return " ".join(str(s).split())


def render(brain: str, cases: list[dict]) -> str:
    mine = [c for c in cases if brain in c["brains"] and c["status"] in RENDERED]
    lines = [HEADER.format(Brain=brain.capitalize())]
    if not mine:
        lines.append(f"\nNo owner-confirmed case for {brain.capitalize()} yet. The first comes from the owner's or "
                     "the expert's grade of a bench run (Train, Grade runs), or from a model answer in an eval case.\n")
    for i, c in enumerate(mine, 1):
        lines.append(f"\n## {i}. {_para(c['title'])}\n")
        lines.append(f"*{c['status']}* · checks: {', '.join(c['checks'])}\n")
        lines.append(f"**Situation.** {_para(c['situation'])}\n")
        lines.append(f"**The junior move.** {_para(c['junior_move'])}\n")
        lines.append(f"**The senior move.** {_para(c['senior_move'])}\n")
        lines.append(f"**The owner's verdict.** {_para(c['owner_verdict'])}\n")
        lines.append(f"Source: {_para(c['source'])}\n")
    return "\n".join(lines).rstrip() + "\n"


def build(write: bool = True) -> dict[str, str]:
    cases = load_cases()
    out = {b: render(b, cases) for b in BRAINS}
    if write:
        OUT_DIR.mkdir(exist_ok=True)
        for b, text in out.items():
            (OUT_DIR / f"{b}.md").write_text(text)
    return out


def check() -> list[str]:
    """Generated files that differ from what the yaml renders (empty = in sync)."""
    want = build(write=False)
    stale = []
    for b, text in want.items():
        p = OUT_DIR / f"{b}.md"
        if not p.exists() or p.read_text() != text:
            stale.append(str(p))
    return stale


_WORD = re.compile(r"[a-zà-ü0-9]{3,}")
STOP = {"the", "and", "for", "with", "our", "are", "want", "wants", "what", "which", "that", "this", "have", "has",
        "from", "into", "not", "can", "about", "how", "its", "their", "they", "were", "will", "would", "should"}


def _stem(w: str) -> str:
    """A crude stem: enough that register / registration / registered meet."""
    return w[:6] if len(w) > 6 else w


def _words(text: str) -> Counter:
    return Counter(_stem(w) for w in _WORD.findall(text.lower()) if w not in STOP)


def retrieve(query: str, brain: str | None = None, k: int = 3, cases: list[dict] | None = None) -> list[dict]:
    """Cases ranked for a founder's ask: tag hits weigh three words; words one."""
    cases = cases or load_cases()
    q = _words(query)
    scored = []
    for c in cases:
        if brain and brain not in c["brains"]:
            continue
        if c["status"] not in RENDERED:
            continue
        tag_hits = sum(1 for t in c["tags"] if any(_stem(part) in q for part in t.split("_") if part not in STOP and len(part) > 2))
        text = " ".join(_para(c[k2]) for k2 in ("title", "situation", "junior_move", "senior_move"))
        tw = _words(text)
        overlap = sum(min(q[w], tw[w]) for w in q if w in tw)
        score = 3 * tag_hits + overlap
        if score:
            scored.append((score, c))
    scored.sort(key=lambda x: (-x[0], x[1]["id"]))
    return [{"id": c["id"], "title": c["title"], "score": s, "checks": c["checks"], "status": c["status"]} for s, c in scored[:k]]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("build")
    sub.add_parser("check")
    r = sub.add_parser("retrieve")
    r.add_argument("query")
    r.add_argument("--brain", choices=BRAINS)
    r.add_argument("-k", type=int, default=3)
    a = ap.parse_args(argv)
    if a.cmd == "build":
        out = build()
        for b in out:
            print(f"wrote mandate/playbooks/cases/{b}.md ({out[b].count(chr(10))} lines)")
        return 0
    if a.cmd == "check":
        stale = check()
        for s in stale:
            print(f"STALE: {s} (run: python -m mandate.eval.case_library build)")
        return 1 if stale else 0
    print(json.dumps(retrieve(a.query, a.brain, a.k), indent=1, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
