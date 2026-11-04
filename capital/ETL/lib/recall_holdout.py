"""The companies no artifact the recall harness grades may be fitted over.

── The property, stated once ──────────────────────────────────────────────
An artifact fitted over award history, graded by replaying award history, must
not have seen the company being replayed. Otherwise each test company votes
once for its own answer, and the harness reads that vote back as recall.

This is not a rule about any one signal. It is a rule about a SHAPE, and every
artifact of that shape is subject to it: peer precedent, the region footprint,
the channel mix, and the per-instrument sector mix -- all four are "what has
this fund funded", counted from the same events table the ground truth is
drawn from.

── Why this file exists rather than a copy per emitter ────────────────────
Every one of the failures below was a COPY of this idea drifting from another
copy, and each was found by accident:

  emit_peer_prior.py    shipped once built WITHOUT its own exclusion flag; the
                        evaluation read its own answer key for weeks
                        (project-mgmt/research/ranking_audit.md 6.1).
  emit_region_prior.py  named two recall sets in a tuple literal. Three more
                        sets were added afterwards and nothing pointed at them,
                        so 2,390 of the ACTIVE set's 4,266 companies -- 56% --
                        were still inside the artifact that ranks siblings.
  sector_mix            had no exclusion of any kind. 95.7% of the active set's
                        pairs had their own vote inside the won fund's mix, and
                        for 5.8% that vote was the ONLY reason the fund showed
                        the founder's sector at all.

A "keep these in sync" comment would have been the bug. So there is one
definition, it is DISCOVERED rather than enumerated, and it is the default.

── Discovered, never listed ───────────────────────────────────────────────
`recall_company_names()` globs every `__recallSet*.json`. A set added tomorrow
is covered tomorrow, with nothing to remember. That is deliberate and is the
whole difference between this and the tuple literal it replaces.

── Excluded by DEFAULT, and why that is not the same as the old flag ──────
`--exclude-recall-set` was opt-in, and the artifact that shipped without it is
the reason this file has a header. An opt-in guard protects a build only if
somebody remembers, and these builders run from a Makefile where nobody is
watching. So the exclusion happens unless a caller asks loudly for the other
thing, and the flag name is kept as an accepted no-op so every command line
already written down in this repo still means what it says.

`--include-recall-set` builds the fuller artifact. It is the honest choice for
a corpus statistic nothing grades -- a real founder is not in the test set --
and it prints a warning naming the harnesses it invalidates, because the cost
of forgetting is a number that looks good and is not.

Usage in an emitter:

    from recall_holdout import add_holdout_flags, resolve_holdout
    ap = argparse.ArgumentParser(); add_holdout_flags(ap)
    holdout = resolve_holdout(ap.parse_args(), conn)
    ...
    if name in holdout.names: continue        # or `cid in holdout.ids`
    holdout.report()
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, field
from pathlib import Path

from etl_env import ROOT

# Where the graded answer keys live. One directory, one glob: the frontend's
# intelligence lib is where every recall set has ever been written, and a set
# stored anywhere else would not be loadable by the harnesses either.
INTEL_DIR = ROOT / "website" / "frontend" / "lib" / "intelligence"
RECALL_GLOB = "__recallSet*.json"


# The ONE place that says which set is active is `scripts/recallSet.ts`, and it
# says so for a reason recorded at length in that file: four sets accumulated in
# one session and every harness named its own default, which is how two numbers
# measured against different answer keys were quoted side by side for weeks.
#
# Python had no way to ask, so `enrich_recall_answers.py` and
# `audit_answer_key_reach.py` each hard-coded a filename -- a second definition,
# and one that goes stale silently the first time the constant moves. It moved on
# 2026-08-09 (Composed -> Doors) and both would have kept generating against the
# retired key with nothing on screen to say so.
#
# So it is READ, not copied. A regex over one exported constant is a small price
# for there being exactly one answer to "which key ships".
ACTIVE_SET_DECL = ROOT / "website" / "frontend" / "scripts" / "recallSet.ts"


def active_recall_set(decl: Path | None = None) -> str:
    """The basename of `ACTIVE_RECALL_SET`, read from the TypeScript that owns it.

    Raises rather than guessing: a caller that silently fell back to a
    hard-coded name would reintroduce exactly the drift this exists to remove.
    """
    import re
    src = (decl or ACTIVE_SET_DECL).read_text()
    m = re.search(r'^export const ACTIVE_RECALL_SET\s*=\s*"([^"]+)"',
                  src, re.MULTILINE)
    if not m:
        raise SystemExit(
            f"recall_holdout: no ACTIVE_RECALL_SET in {decl or ACTIVE_SET_DECL}. "
            "That constant is the single definition of which answer key ships; "
            "if it moved or was renamed, this reader moves with it.")
    return m.group(1)


def recall_set_files(intel_dir: Path | None = None) -> list[Path]:
    """Every recall set on disk, active and retired alike.

    Retired sets count. A retired set is still replayable under `SET=`, its
    published numbers are still quoted, and its companies are the same
    companies -- so an artifact that excludes only the active set still cannot
    honestly grade the retired one.
    """
    return sorted((intel_dir or INTEL_DIR).glob(RECALL_GLOB))


def recall_company_names(intel_dir: Path | None = None) -> set[str]:
    """Canonical company names appearing in any recall set."""
    names: set[str] = set()
    for f in recall_set_files(intel_dir):
        names |= {r["name"] for r in json.loads(f.read_text())}
    return names


def recall_company_ids(conn, names: set[str] | None = None) -> set[int]:
    """`companies.id` for those names.

    A name can resolve to more than one row -- the same company registered in
    two countries -- and every one of them is excluded. Matching on the name
    the recall set actually carries is what keeps this aligned with the
    harness, which knows companies by that name and nothing else.
    """
    names = recall_company_names() if names is None else names
    if not names:
        return set()
    out: set[int] = set()
    todo = sorted(names)
    # SQLite's variable limit is 999 on older builds; chunk rather than assume.
    for i in range(0, len(todo), 500):
        chunk = todo[i:i + 500]
        out |= {r[0] for r in conn.execute(
            "SELECT id FROM companies WHERE canonical_name IN (%s)"
            % ",".join("?" * len(chunk)), chunk)}
    return out


@dataclass
class Holdout:
    """The resolved decision, plus the one line every builder must print.

    `active` False means the build DELIBERATELY contains the test companies.
    Both cases are announced: a number is only comparable when the corpus it
    came from says which of the two it was.
    """
    active: bool
    names: set[str] = field(default_factory=set)
    ids: set[int] = field(default_factory=set)
    files: list[Path] = field(default_factory=list)

    def report(self) -> None:
        if self.active:
            print(f"recall holdout: {len(self.names):,} companies excluded "
                  f"from {len(self.files)} recall set(s) "
                  f"({', '.join(f.name for f in self.files)})")
        else:
            print("recall holdout: OFF -- this build CONTAINS every test "
                  "company.\n"
                  "  Any recall figure measured against it is grading the "
                  "model on its own\n"
                  "  answer key. Do not publish a number from this artifact.")


def add_holdout_flags(ap: argparse.ArgumentParser) -> None:
    """`--include-recall-set` to opt out; `--exclude-recall-set` accepted.

    The second is a no-op and is kept on purpose. It is written down in
    CONTINUE_HERE.md, in rebuild_to_95.md, in two research notes and in the
    header of emit_peer_prior.py; silently rejecting it would turn every one
    of those into a command that errors, and someone would then drop the flag
    rather than read why it was there.
    """
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--exclude-recall-set", action="store_true",
                   help="no-op: recall companies are excluded by default. "
                        "Accepted so documented command lines keep working.")
    g.add_argument("--include-recall-set", action="store_true",
                   help="build over EVERY company, test companies included. "
                        "The artifact is then unusable for any measurement.")


def resolve_holdout(args: argparse.Namespace, conn=None,
                    intel_dir: Path | None = None) -> Holdout:
    """Turn parsed flags into the set of companies to skip."""
    if getattr(args, "include_recall_set", False):
        return Holdout(active=False)
    files = recall_set_files(intel_dir)
    names = recall_company_names(intel_dir)
    ids = recall_company_ids(conn, names) if conn is not None else set()
    return Holdout(active=True, names=names, ids=ids, files=files)
