"""Every committed artifact the product ranks on can be rebuilt, and something
notices when it goes stale.

── The class this closes ──────────────────────────────────────────────────
`check_guard_reachability.py` asks whether every GUARD runs somewhere. This
asks the same question one layer down, about the DATA those guards and the
product read:

    a file is committed under website/frontend/lib/intelligence/, is read at
    request time on the production ranking path, and is produced by a command
    that no pipeline runs and no check compares against anything.

Nothing goes red. The artifact simply ages, and the ranker goes on ranking on a
corpus that no longer exists. It is the same defect as the schema nobody could
rebuild (workstream BE), one directory over: the difference between "we have
the file" and "we can produce the file" is invisible right up until the file is
wrong.

On 2026-08-08 that set was:

  peerPrior.generated.json        read by shortlist.ts at request time; the
                                  signal that took exact-scheme recall from 24%
                                  to 43%. Producer on no path. Measured against
                                  Postgres the same day: it named 16 funds the
                                  corpus no longer contained.
  regionPrior.generated.json      read by regionPrior.ts at request time.
  __objectives.json               read by shortlist.ts at request time.
  channelPrior.generated.json     read by shortlist.ts at request time.
  profileLeakIndex.generated.json CI's check_recall_leaks ASSERTS against it,
                                  and its producer was named by nothing but its
                                  own usage line -- a leak guard reading a file
                                  nothing refreshed.
  semanticCache.generated.json    what every NO_PG check ranks on. Found 70
                                  instruments behind the live index on
                                  2026-08-07; check_corpus_currency.ts printed
                                  the command to fix it and nothing ran it.

── The property, not the list ─────────────────────────────────────────────
Derived per file from the tree, so the seventh artifact is covered before
anybody writes it. For every committed artifact in that directory:

  1. PRODUCER      some module in this repo writes it.
  2. REGENERATION  that producer is named by a rebuild path.
  3. STALENESS     some check_* module names the artifact, so a copy that has
                   fallen behind the corpus is somebody's problem.
  4. ONE LOADER    no production module under lib/ reads it directly. They go
                   through lib/intelligence/generatedArtifact.ts, which names
                   the file, the cwd and what the ranking loses when the read
                   fails. All four of these artifacts previously carried their
                   own `catch { cache = {} }`, which turns a missing file into
                   a ranker that is quietly missing its best signal.

Any of the four may be declined, per artifact, in data/guard_registry.json
under `manual_artifacts` -- with a reason and a `review` date that expires, for
the reason spelled out in check_guard_reachability.py: an escape hatch with no
clock becomes the orphanage.

── Why `refresh.py` counts here and `npm run check` does not there ────────
Not a softer rule; a different question. A GUARD's whole value is in running
when nobody chose to run it, so `check_guard_reachability.py` accepts only
unattended paths. An ARTIFACT's value is in being REBUILDABLE -- there is a
single documented command that re-derives it from the corpus, and a stale copy
is therefore one command from correct rather than a research project. That is
exactly what `make refresh` and `make eligibility` are, and it is the same
standard the schema replay check holds the schema to.

So the two are complementary, and neither substitutes for the other: property 3
above is what makes staleness observable, and it may only be satisfied by a
check_* module, which check_guard_reachability then forces onto a real path.

Usage: python3 ETL/schema/check_artifact_reachability.py
"""
from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REGISTRY = ROOT / "data" / "guard_registry.json"
ARTIFACTS = ROOT / "website" / "frontend" / "lib" / "intelligence"
LOADER = "generatedArtifact.ts"

# Paths that RE-DERIVE a committed artifact from the corpus. Each is a single
# documented command; see the docstring for why this set differs from
# check_guard_reachability.py's.
REBUILD = {
    "ETL/refresh.py": ROOT / "ETL" / "refresh.py",
    "Makefile": ROOT / "Makefile",
    "railway_cron.py": ROOT / "ETL" / "events" / "extract" / "railway_cron.py",
}

# Where a producer or a check may live.
SOURCE_DIRS = [
    ROOT / "ETL",
    ROOT / "website" / "frontend" / "scripts",
    ROOT / "website" / "build",
]

def writes_artifact(text: str, name: str) -> bool:
    """Does this module WRITE `name`, as opposed to merely mentioning it?

    The distinction is the whole check. `emit_peer_prior.py` names all five
    recall sets — it excludes their companies from the prior — and it also
    writes a file, so "names it, and contains a write call" credited it as the
    producer of every recall set in the repo. That is a FALSE GREEN in a check
    whose entire job is to find things nothing produces, and it is worse than
    the false red it replaces: it would have reported the recall sets safely
    rebuildable by a script that has never written one.

    So the signature has to tie the write to the name. Both languages here do
    it the same way — bind the path to a constant, write the constant — which
    is a structure rather than a spelling:

        OUT = ROOT / "..." / "peerPrior.generated.json"     ...     OUT.write_text(
        const OUT = path.join(..., "themeIndex.generated.ts"); ... writeFileSync(OUT,

    plus the one-liner forms, where the name is inside the write call itself.
    """
    # Every assignment whose right-hand side reaches the name within 200
    # characters -- not the first one that does.
    #
    # A single lazy regex looked right and was wrong: it anchors at the
    # LEFTMOST `=`, so in a file that binds FRONTEND on one line and OUT to
    # `FRONTEND / "profileLeakIndex.generated.json"` twenty lines later, it
    # captured FRONTEND, found no `FRONTEND.write_text(`, and declared the
    # emitter not to be the producer of the file it writes. The window is
    # spelled out here instead, because a check whose own matching is subtle is
    # a check nobody trusts the red of.
    #
    # 200 chars covers a multi-line `path.join(...)` binding
    # (emit_offer_route_ratchet.ts) without spanning unrelated statements.
    # The quote need not sit against the name: emit_theme_index.ts writes
    # `resolve(process.cwd(), "lib/intelligence/themeIndex.generated.ts")`, so
    # the literal carries a directory prefix. Anchored at the closing quote so a
    # longer filename ending in this one cannot match.
    quoted = rf'["\'][^"\']*{re.escape(name)}["\']'
    cands = []
    for m in re.finditer(
            r'(?:^|\n)\s*(?:export\s+)?(?:const|let|var)?\s*(\w+)\s*=\s*[^=\n]', text):
        window = text[m.end(): m.end() + 200]
        if re.search(quoted, window):
            cands.append(m.group(1))
    for var in cands:
        if re.search(rf'\b{re.escape(var)}\s*\.\s*write_text\(', text) \
           or re.search(rf'writeFileSync\(\s*{re.escape(var)}\b', text) \
           or re.search(rf'\bopen\(\s*{re.escape(var)}\b[^)]*["\']w', text) \
           or re.search(rf'to_json\(\s*{re.escape(var)}\b', text):
            return True
    one_liner = rf'(write_text|writeFileSync|to_json)\([^\n)]*{quoted}'
    if re.search(one_liner, text):
        return True
    return bool(re.search(rf'\bopen\([^\n)]*{quoted}[^)]*["\']w', text))


def uncommented(text: str) -> str:
    """Source with comment lines removed.

    Same rule and same reason as check_guard_reachability.py: `refresh.py` now
    explains at length which artifacts it rebuilds and why. Counting prose as an
    invocation would mean the better the explanation, the greener the check.
    """
    out = []
    for line in text.splitlines():
        stripped = line.lstrip()
        if stripped.startswith(("#", "//", "*", "/*")):
            continue
        out.append(line)
    return "\n".join(out)


def artifacts() -> list[Path]:
    """Committed data artifacts in the intelligence directory.

    Derived from the filename, not from a list: `.generated.` marks a build
    product by convention here, and a bare `.json` beside hand-written `.ts`
    modules is one by construction -- nobody hand-maintains 421 instrument
    objectives. `__objectives.json` carries neither the suffix nor a producer's
    name and was an orphan for exactly that reason.
    """
    if not ARTIFACTS.is_dir():
        return []
    return sorted(p for p in ARTIFACTS.iterdir()
                  if p.is_file()
                  and (".generated." in p.name or p.suffix == ".json"))


def source_files() -> list[Path]:
    out = []
    for d in SOURCE_DIRS:
        if not d.is_dir():
            continue
        out.extend(p for p in d.rglob("*")
                   if p.is_file() and p.suffix in (".py", ".ts", ".mjs")
                   and "node_modules" not in p.parts)
    return out


def production_modules() -> list[Path]:
    """Non-test modules under website/frontend/lib — the request path."""
    lib = ROOT / "website" / "frontend" / "lib"
    if not lib.is_dir():
        return []
    return sorted(p for p in lib.rglob("*.ts")
                  if not p.name.endswith(".test.ts") and p.name != LOADER)


def main() -> int:
    if not REGISTRY.exists():
        print(f"FAILED: {REGISTRY} does not exist; there is nowhere to declare "
              f"an artifact's rebuild path.")
        return 1
    manual = json.loads(REGISTRY.read_text()).get("manual_artifacts", {})

    found = artifacts()
    if not found:
        # The emptiness floor. A guard that finds nothing to check and prints
        # "ok" is the failure workstream BF recorded twice on 2026-08-08: a
        # wrong path turned "not where I looked" into "nothing there", and the
        # most reassuring line this can print is the least true one.
        print(f"check_artifact_reachability: FAILED — no committed artifact "
              f"found under {ARTIFACTS.relative_to(ROOT)}.\n"
              f"  There are supposed to be several. Either the path above is "
              f"wrong or the ranking artifacts are gone; both are worse than "
              f"anything this check was written to catch.")
        return 1

    sources = [(p, uncommented(p.read_text(errors="ignore"))) for p in source_files()]
    rebuild = {n: uncommented(p.read_text(errors="ignore")) if p.exists() else ""
               for n, p in REBUILD.items()}
    missing_rebuild = [n for n, p in REBUILD.items() if not p.exists()]
    prod = [(p, uncommented(p.read_text(errors="ignore"))) for p in production_modules()]

    # What a check_* module can see: its own source, plus the source of the
    # modules it imports, one hop.
    #
    # The one hop is not a loophole, it is the arrangement this check is asking
    # for everywhere else. `scripts/recallSet.ts` is the single loader for the
    # five recall sets and `check_recall_floor.ts` imports it -- exactly the
    # shape clause 4 demands of the ranking artifacts. Refusing to follow the
    # import would mark all five unwatched and push the fix towards naming the
    # filename again in every check, which is the duplication this repo keeps
    # having to undo. It stops at one hop deliberately: two would let any check
    # that transitively pulls in the world claim to be watching everything.
    by_stem = {p.stem: text for p, text in sources}
    check_scope: list[tuple[Path, str]] = []
    for p, text in sources:
        if not p.name.startswith("check_"):
            continue
        seen = text
        for spec in re.findall(r'from\s+"([^"]+)"|^\s*from\s+(\S+)\s+import', text, re.M):
            stem = Path(spec[0] or spec[1]).name.split(".")[0]
            if stem in by_stem:
                seen += "\n" + by_stem[stem]
        check_scope.append((p, seen))

    problems: list[str] = []
    clean = 0

    for art in found:
        name = art.name
        entry = manual.get(name, {})
        waived = set(entry.get("waives", [])) if isinstance(entry, dict) else set()
        art_problems: list[str] = []

        if waived:
            reason = entry.get("reason")
            review = entry.get("review")
            if not isinstance(reason, str) or len(reason.strip()) < 20:
                art_problems.append(
                    f"is declared in `manual_artifacts` with no real reason ({reason!r}).")
            else:
                try:
                    due = date.fromisoformat(str(review))
                except ValueError:
                    art_problems.append(
                        f"is declared in `manual_artifacts` with no usable `review` "
                        f"date ({review!r}). Use YYYY-MM-DD.")
                else:
                    if due < date.today():
                        art_problems.append(
                            f"was declared in `manual_artifacts` for review by "
                            f"{due.isoformat()}, which has passed.\n"
                            f"      Waived: {', '.join(sorted(waived))}. On file: "
                            f"{reason.strip()}\n"
                            f"      Wire it up, move the date and say what changed, or "
                            f"delete the artifact.")

        # 1. PRODUCER
        # A check is never a producer. Without this the guard reads its OWN
        # source -- which quotes both a write call and an artifact name in the
        # docstring explaining the rule -- and credits itself as the producer of
        # themeIndex.generated.ts.
        producers = [p for p, text in sources
                     if not p.name.startswith("check_") and writes_artifact(text, name)]
        if "producer" not in waived and not producers:
            mentions = [p for p, text in sources
                        if not p.name.startswith("check_") and name in text]
            art_problems.append(
                f"has NO PROVABLE producer: nothing under "
                f"{', '.join(str(d.relative_to(ROOT)) for d in SOURCE_DIRS)} binds a\n"
                f"      path to this filename and then writes that path. It is committed "
                f"and it\n"
                f"      cannot be rebuilt, which is the shape the schema replay check "
                f"exists to\n"
                f"      forbid one directory over.\n"
                f"      Mentioned by: "
                f"{', '.join(p.name for p in mentions[:4]) or '(nothing at all)'}"
                f"{' ...' if len(mentions) > 4 else ''}\n"
                f"      If one of those does write it — through a CLI default, say — the "
                f"tie is\n"
                f"      not visible from the source and nobody inheriting this repo could "
                f"find it\n"
                f"      either. Bind the name to a constant and write the constant, or "
                f"declare it.")

        # 2. REGENERATION
        if "regeneration" not in waived and producers:
            named = [n for n, text in rebuild.items()
                     if any(p.stem in text for p in producers)]
            if not named:
                art_problems.append(
                    f"is produced by {', '.join(p.name for p in producers)}, which no "
                    f"rebuild path names.\n"
                    f"      Not {', '.join(REBUILD)}. It is re-derived only when somebody "
                    f"remembers the\n"
                    f"      command, so it ages against the corpus with nothing pulling "
                    f"it forward.")

        # 3. STALENESS
        #
        # A `.generated.ts` artifact is an ES module, so a check names it by its
        # import specifier and never by its filename: check_regions.ts imports
        # `../lib/intelligence/regions.generated`. Matching the basename alone
        # reported it unwatched while the check that watches it sat two
        # directories away -- a false red, which costs the same as a false green
        # the second time somebody has to explain it away.
        needles = [name]
        if name.endswith(".ts"):
            needles.append(name[: -len(".ts")])
        if "staleness" not in waived:
            checks = [p for p, text in check_scope
                      if any(n in text for n in needles)]
            if not checks:
                art_problems.append(
                    f"is named by NO check_* module. Nothing compares it to the corpus, "
                    f"so a copy\n"
                    f"      built against a corpus that has since moved reads exactly like "
                    f"a current one.\n"
                    f"      A rebuild path without a staleness check only fixes the drift "
                    f"nobody knew about.")

        # 4. ONE LOADER
        # A module that NAMES the artifact is fine -- `loadGenerated("peerPrior
        # .generated.json", {})` names it, and that is the arrangement being
        # asked for. What is not fine is a module that names it AND opens a
        # file, because the only thing it can be opening is this. Matching the
        # name alone flagged the three readers that had just been converted,
        # which would have taught the next person that the rule is noise.
        if "loader" not in waived and art.suffix == ".json":
            direct = [p for p, text in prod
                      if name in text and ("readFileSync" in text or "readFile(" in text)]
            if direct:
                art_problems.append(
                    f"is read directly by "
                    f"{', '.join(str(p.relative_to(ROOT)) for p in direct)},\n"
                    f"      not through lib/intelligence/{LOADER}. Every such reader this "
                    f"repo has had\n"
                    f"      wrapped the read in `catch {{ cache = {{}} }}`, which does not "
                    f"degrade the\n"
                    f"      ranker so much as replace it -- silently, with a green build "
                    f"and no log line.")

        if art_problems:
            problems.append(f"{name}\n    - " + "\n    - ".join(art_problems))
        else:
            clean += 1

    if missing_rebuild:
        problems.append(
            f"rebuild path(s) not found: {', '.join(missing_rebuild)}.\n"
            f"    Every artifact would look unrebuildable, or -- worse -- rebuildable "
            f"via the\n"
            f"    ones that remain. Fix the path in REBUILD above.")

    if problems:
        print("check_artifact_reachability: FAILED\n")
        for p in problems:
            print(f"  {p}\n")
        print(f"  {clean} of {len(found)} committed artifact(s) are produced, "
              f"regenerated, watched and read through one loader.")
        print(f"  Decline any of the four, per artifact, under `manual_artifacts` in\n"
              f"  data/guard_registry.json with a reason and a review date.")
        return 1

    print(f"check_artifact_reachability: ok — {clean} committed artifact(s) under "
          f"lib/intelligence/ each have a producer, a rebuild path, a staleness "
          f"check and one loader.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
