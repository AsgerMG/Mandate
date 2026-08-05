"""Give the recall set the one thing it is missing: what the company actually does.

── The defect this exists to fix ──────────────────────────────────────────
`__recallSet.json` holds 1,988 (company -> won fund) pairs. 1,669 of them carry
no description at all; the harness substitutes one of ELEVEN canned sentences
derived from the company's sector. One of those strings is the query for 179
rows with 87 different correct answers, so a PERFECT index scores about 1/87
there. Measured over the whole holdout set, that caps any ranking method at
~64% and reports the intake's emptiness as a ranking failure.

Paired measurement (`scripts/measure_description_lift.ts`, holdout, n=188, same
companies both ways): EXACT@5 48.9% with the company's real project text against
21.3% with the canned sector sentence. The description is worth +27.6pp, and the
test set cannot see it on 84% of its rows.

── Where a real description can come from, and why it is not circular ─────
A previous version of this set used the WON fund's own project titles as the
description. It read as 90% recall and was really 10%: for the state-aid
registers the "project title" IS the scheme's name repeated on every award, so
the query contained the answer.

So this recovers text only from a DIFFERENT REGIME. If a company won a German
regional R&D scheme and also ran a Horizon project, the Horizon project summary
is a genuine, independent statement of what that company builds — written for
somebody else, about the same work. It cannot name the German scheme, because it
predates or ignores it.

Six guards, each of which alone has caught a real leak in development:

  1. cross-regime      the text's own instrument, and every instrument its
                       source maps to, must have a different root_id from the
                       won fund (not merely a different id — siblings share a
                       scheme name, which is exactly the string that leaked).
  2. title kind        a `project_title` is used only from instruments whose
                       titles the corpus classifier calls 'project'. That
                       classifier already knows `satr_de_rnd`'s titles are
                       statute names. `project_summary` is exempt: no scheme
                       publishes a per-award summary.
  3. not a sample      the normalised text must not appear in ANY instrument's
                       `sample_project_titles` — not just the won fund's. A
                       scheme name that slipped past guard 2 is in some
                       instrument's profile, and profiles are what we retrieve
                       against.
  3b. not in the       the text must not appear inside the won fund's
      profile text     `instrument_profiles.profile_text` — the string retrieval
                       is actually scored against.

                       Guard 3 is not enough, and this is the finding that made
                       3b necessary. `sample_project_titles` lives in SQLite;
                       `profile_text` is built separately in Postgres, caps at
                       40 titles of its own choosing, and has been rebuilt since
                       the recall set was made. Checked against the real target,
                       **86 of the 188 existing holdout `project` rows (46%) have
                       their description sitting verbatim in the profile of the
                       fund they are supposed to find.** Those rows are grading
                       retrieval on a query copied out of the answer. They are
                       not deleted — they are marked `own_project_title_leaks`,
                       so a measurement can exclude them and say so.
  4. not a funding     the text must not cover more than a tenth of any one
     line              instrument's recipient companies. THE PROPERTY: a
                       description is specific to a piece of WORK; a funding
                       line's name is carried by everyone it funds. Counting
                       companies alone is wrong — a Horizon consortium title is
                       shared by up to 198 partners and is still a real project.
                       The share is what separates them, and the measured gap is
                       wide: 'Partnership for the Assessment of Risks from
                       Chemicals' 0.07, 'European Rare Diseases Research
                       Alliance' 0.06, a single-company project 0.004 — against
                       'Fondo di garanzia per le PMI' and 'Zentrales
                       Innovationsprogramm Mittelstand' at 1.000.
  5. no fund name      the text must not contain the won fund's scheme code, nor
                       a distinctive word from its name or its parent's name.
  6. length + shape    long enough to embed (semantic.ts ignores under 12
                       chars) and not pure punctuation/numerals.

And one guard that is not about leakage but about the harness's own disease: no
recovered description may serve more than one pair. The failure being fixed is
179 rows querying with one identical string against 87 different right answers;
recovering a consortium title shared by 40 test companies would rebuild it in
miniature.

Everything that passes is written to a NEW file. `__recallSet.json` is never
touched: the two are measured side by side, and a number that moved because the
test set changed must stay distinguishable from a number that moved because the
product did.

Usage:
  python3 ETL/terms/enrich_recall_set.py            # report only
  python3 ETL/terms/enrich_recall_set.py --write
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DATA, DB, ROOT  # noqa: E402

import argparse  # noqa: E402
import collections  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402
import unicodedata  # noqa: E402

FRONTEND = ROOT / "website" / "frontend" / "lib" / "intelligence"
RECALL_SET = FRONTEND / "__recallSet.json"
OUT = FRONTEND / "__recallSetEnriched.json"
TITLE_KINDS = DATA / "instrument_title_kind.json"

# Below this a summary is a stub, not a description. 80 chars is roughly one
# full sentence; semantic.ts refuses to embed under 12 in any case.
MIN_SUMMARY = 80
# Titles are terser than summaries by nature — a Horizon project title is a
# single descriptive clause — so they get their own, lower bar.
MIN_TITLE = 25
# Guard 4. Above this share of an instrument's recipient companies, a string is
# describing the funding line rather than anybody's work. The observed
# separation is 0.07 (largest genuine consortium project) against 1.000 (scheme
# names), so anywhere in between is safe; a tenth sits in the middle of that gap.
MAX_INSTRUMENT_SHARE = 0.10


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s)
                   if not unicodedata.combining(c))


def norm(s: str) -> str:
    """Comparison form: accent-free, punctuation-free, single-spaced lowercase."""
    return re.sub(r"[^a-z0-9 ]+", " ", strip_accents(s).lower()).strip()


def squash(s: str) -> str:
    return re.sub(r"\s+", " ", norm(s))


# Words too common across fund names to count as a leak on their own. Derived,
# not enumerated by hand: any token appearing in more than 2% of instrument
# names is structural vocabulary ("aid", "programme", "regional", "de", "fur"),
# and a description sharing one of those with the won fund tells us nothing.
def distinctive_tokens(names: list[str], corpus_freq: dict[str, int],
                       total: int) -> set[str]:
    out: set[str] = set()
    for n in names:
        for tok in squash(n).split():
            if len(tok) < 5:
                continue
            if corpus_freq.get(tok, 0) / max(total, 1) > 0.02:
                continue
            out.add(tok)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    pairs = json.loads(RECALL_SET.read_text())
    kinds: dict[str, str] = json.loads(TITLE_KINDS.read_text()) if TITLE_KINDS.exists() else {}

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row

    inst = {r["id"]: dict(r) for r in conn.execute(
        "SELECT id, name, parent_id, root_id, scheme_code, sample_project_titles "
        "FROM funding_instruments")}

    def root_of(iid: str) -> str:
        i = inst.get(iid)
        if not i:
            return iid
        return i["root_id"] or i["parent_id"] or iid

    # ── Guard 3's index: every string that is part of some fund's PROFILE ─────
    # instrument_profiles embeds these titles verbatim, so a description equal
    # to one of them is retrieving itself.
    sample_titles: set[str] = set()
    for i in inst.values():
        raw = i["sample_project_titles"]
        if not raw:
            continue
        try:
            for t in json.loads(raw):
                if isinstance(t, str) and t.strip():
                    sample_titles.add(squash(t))
        except (ValueError, TypeError):
            continue

    # ── Guard 3b's index: what retrieval is ACTUALLY scored against ──────────
    # Lives in Postgres, not in this SQLite file, which is precisely why guard 3
    # missed 46% of the existing project rows. Optional so the script still runs
    # (and says so) without a database; the guard is then skipped, never faked.
    profile_text: dict[str, str] = {}
    dsn = os.environ.get("DATABASE_URL")
    if dsn:
        try:
            import psycopg2
            pg = psycopg2.connect(dsn)
            with pg.cursor() as cur:
                cur.execute("SELECT instrument_id, profile_text FROM instrument_profiles")
                profile_text = {i: squash(t or "") for i, t in cur.fetchall()}
            pg.close()
        except Exception as err:  # noqa: BLE001 - any failure means "no guard", loudly
            print(f"WARNING: guard 3b disabled, could not read instrument_profiles: {err}")
    else:
        print("WARNING: guard 3b disabled, DATABASE_URL is not set")

    def in_profile(text: str, won: str) -> bool:
        p = profile_text.get(won)
        n = squash(text)
        return bool(p and n and n in p)

    # Fund-name vocabulary, for guard 5.
    name_freq: collections.Counter = collections.Counter()
    for i in inst.values():
        name_freq.update(set(squash(i["name"] or "").split()))
    n_inst = len(inst)

    # ── Event -> instrument, both joins ──────────────────────────────────────
    # Exactly the pair emit_peer_prior.py uses. Joining only through
    # funding_instrument_sources returns PARENT regimes and no national scheme
    # would ever be recognised, which would silently disable guard 1 for the
    # 84% of rows this script exists to serve.
    src2inst: dict[str, list[str]] = collections.defaultdict(list)
    for s, iid in conn.execute("SELECT source, instrument_id FROM funding_instrument_sources"):
        src2inst[s].append(iid)
    code2inst: dict[str, list[str]] = collections.defaultdict(list)
    for iid, i in inst.items():
        code = (i["scheme_code"] or "").strip()
        if code:
            code2inst[code].append(iid)

    cid_by_name: dict[tuple[str, str], list[int]] = collections.defaultdict(list)
    for cid, cname, country in conn.execute(
            "SELECT id, canonical_name, country FROM companies"):
        cid_by_name[(cname, country or "")].append(cid)

    wanted_cids: set[int] = set()
    for p in pairs:
        wanted_cids.update(cid_by_name.get((p["name"], p["country"]), []))

    # ── Guard 4's index ──────────────────────────────────────────────────────
    # Per instrument: how many distinct companies it funded, and how many of
    # them carry each exact string. Counted over the WHOLE events table, not
    # just the recall companies — a scheme name is a scheme name regardless of
    # who happens to be in the test set.
    inst_firms: dict[str, set[int]] = collections.defaultdict(set)
    text_inst_firms: dict[str, dict[str, set[int]]] = collections.defaultdict(
        lambda: collections.defaultdict(set))
    candidates: dict[int, list[dict]] = collections.defaultdict(list)
    for e in conn.execute(
            "SELECT company_id, source, call_id, project_title, project_summary "
            "FROM public_funding_events WHERE is_duplicate = 0"):
        summary = (e["project_summary"] or "").strip()
        title = (e["project_title"] or "").strip()
        iids = list(code2inst.get((e["call_id"] or "").strip(), [])) + \
            list(src2inst.get(e["source"], []))
        for iid in iids:
            inst_firms[iid].add(e["company_id"])
            for text in (summary, title):
                if text:
                    text_inst_firms[squash(text)][iid].add(e["company_id"])
        if e["company_id"] not in wanted_cids or not iids:
            continue
        candidates[e["company_id"]].append(
            {"iids": iids, "summary": summary, "title": title, "source": e["source"]})
    conn.close()

    def instrument_share(n: str) -> float:
        """Largest share of any one instrument's companies carrying this string."""
        return max((len(firms) / max(len(inst_firms[iid]), 1)
                    for iid, firms in text_inst_firms.get(n, {}).items()), default=0.0)

    rejected: collections.Counter = collections.Counter()

    def usable(text: str, kind: str, iids: list[str], won: str) -> bool:
        """Every guard, in the order that rejects most cheaply."""
        if not text:
            return False
        n = squash(text)
        if kind == "summary" and len(text) < MIN_SUMMARY:
            rejected["too short"] += 1
            return False
        if kind == "title" and len(text) < MIN_TITLE:
            rejected["too short"] += 1
            return False
        if len(n.split()) < 3:
            rejected["not prose"] += 1
            return False
        # 1 — cross-regime
        won_root = root_of(won)
        if any(i == won or root_of(i) == won_root for i in iids):
            rejected["same regime as the won fund"] += 1
            return False
        # 2 — the corpus's own title-kind judgement
        if kind == "title" and not any(kinds.get(i, "project") == "project" for i in iids):
            rejected["source titles are scheme names"] += 1
            return False
        # 3 — never a string some fund's profile is built from
        if n in sample_titles:
            rejected["is a fund's own sample title"] += 1
            return False
        # 3b — never a string inside the won fund's own profile text
        if in_profile(text, won):
            rejected["appears in the won fund's profile text"] += 1
            return False
        # 4 — a description, not a funding line
        if instrument_share(n) > MAX_INSTRUMENT_SHARE:
            rejected["names a funding line, not a project"] += 1
            return False
        # 5 — never names the fund it is supposed to help us find
        won_inst = inst.get(won, {})
        code = (won_inst.get("scheme_code") or "").strip()
        if code and squash(code) and squash(code) in n:
            rejected["contains the won scheme code"] += 1
            return False
        parent = inst.get(won_inst.get("parent_id") or "", {})
        toks = distinctive_tokens(
            [won_inst.get("name") or "", parent.get("name") or ""], name_freq, n_inst)
        words = set(n.split())
        if toks & words:
            rejected["contains a distinctive word from the fund's name"] += 1
            return False
        return True

    out = []
    stats: collections.Counter = collections.Counter()
    # The reuse cap: a recovered description already spent on another pair may
    # not be spent again. Rows are visited in the file's own order, so the
    # result is deterministic and a rerun cannot reshuffle which pair keeps it.
    claimed: set[str] = set()
    for p in pairs:
        row = dict(p)
        had = bool((p.get("description") or "").strip())
        best = None
        for cid in cid_by_name.get((p["name"], p["country"]), []):
            for ev in candidates.get(cid, []):
                for kind in ("summary", "title"):
                    text = ev[kind]
                    if not usable(text, kind, ev["iids"], p["instrument"]):
                        continue
                    if squash(text) in claimed:
                        rejected["already the description of another pair"] += 1
                        continue
                    # Prefer the longest usable text: a summary says more about
                    # the company than a title, and among titles the longer one
                    # is the more descriptive.
                    if best is None or len(text) > len(best[0]):
                        best = (text, kind, ev["iids"][0], ev["source"])
        key = f"{p['split']}/{p['mode']}"
        stats[f"{key} total"] += 1
        # A pre-existing description that guard 3b rejects is replaced if we can
        # replace it and MARKED if we cannot. Never silently kept, never silently
        # dropped: a leaky row that vanished would look like the set shrinking,
        # and a leaky row left unlabelled is what produced the 90%-that-was-10%.
        leaks = had and in_profile(p["description"], p["instrument"])
        if had and not leaks:
            row["descriptionSource"] = "own_project_title"
            stats[f"{key} already described"] += 1
        elif leaks and best:
            row["description"] = best[0]
            row["descriptionSource"] = f"cross_regime_{best[1]}"
            row["descriptionFrom"] = best[2]
            row["replacedLeakyDescription"] = True
            claimed.add(squash(best[0]))
            stats[f"{key} leaky description replaced"] += 1
        elif leaks:
            # Moved OUT of `description`, not merely flagged. A harness that
            # reads `description` without knowing about the flag would otherwise
            # keep grading on the leaky string — and every harness in this repo
            # predates the flag. Under its own key the text stays inspectable,
            # and the row falls back to its sector template like any other
            # undescribed row, which is what it honestly is.
            row["leakyDescription"] = row.pop("description")
            row["description"] = ""
            row["descriptionSource"] = "own_project_title_leaks"
            stats[f"{key} leaky, no replacement found"] += 1
        elif best:
            row["description"] = best[0]
            row["descriptionSource"] = f"cross_regime_{best[1]}"
            row["descriptionFrom"] = best[2]
            claimed.add(squash(best[0]))
            stats[f"{key} enriched"] += 1
        else:
            row["descriptionSource"] = "none"
        out.append(row)

    # State the harness's central defect as a number, on both files, so the
    # enriched set can be shown to have actually fixed it rather than asserted to.
    for label, rows in (("__recallSet.json", pairs), ("enriched", out)):
        queries: dict[str, set[str]] = collections.defaultdict(set)
        for r in rows:
            q = (r.get("description") or "").strip() or (r.get("selfDescription") or "")
            if q:
                queries[squash(q)].add(r["instrument"])
        worst = max(queries.values(), key=len, default=set())
        rows_per_query = collections.Counter()
        for r in rows:
            q = (r.get("description") or "").strip() or (r.get("selfDescription") or "")
            if q:
                rows_per_query[squash(q)] += 1
        print(f"\n{label}: {len(queries):,} distinct queries; "
              f"worst carries {len(worst)} different right answers "
              f"across {max(rows_per_query.values(), default=0)} rows")

    described = sum(1 for r in out
                    if (r.get("description") or "").strip()
                    and r["descriptionSource"] != "own_project_title_leaks")
    print(f"pairs                    {len(out):,}")
    print(f"with a LEAK-FREE real description  {described:,} "
          f"({100 * described / len(out):.0f}%, was "
          f"{sum(1 for p in pairs if (p.get('description') or '').strip()):,})")
    for k in sorted(stats):
        print(f"  {k:34s} {stats[k]:,}")
    print("\nrejected candidate texts, by guard:")
    for reason, n in rejected.most_common():
        print(f"  {reason:44s} {n:,}")

    print("\nsample of recovered descriptions:")
    for r in [x for x in out if x.get("descriptionSource", "").startswith("cross_regime")][:8]:
        print(f"  [{r['descriptionSource']:22s}] {r['name']} -> {r['instrumentName']}")
        print(f"      {r['description'][:150]}")

    if args.write:
        OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
        print(f"\nwrote {OUT}")
    else:
        print("\n(dry run — pass --write)")


if __name__ == "__main__":
    main()
