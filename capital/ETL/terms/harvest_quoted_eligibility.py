"""Assemble `eligibility_text` from quotes the corpus already holds.

── Why this exists ────────────────────────────────────────────────────────
`eligibility_gates.quote` and `eligibility_clauses.quote` hold verbatim,
source-attributed eligibility prose for instruments whose
`funding_instruments.eligibility_text` is empty. Nobody harvested it because an
empty column reads as "we never fetched this", and 155 instruments were fetched,
cut into gates, and then read as missing ever since.

This is a RECOVERY path, not a fetch path. It performs no network I/O and calls
no model.

── The two rules it will not bend ─────────────────────────────────────────
1. **Cited tier only.** Presented eligibility prose is shown to a founder as the
   fund's own words, so it is held to the `cited` bar in
   `lib/intelligence/evidenceTiers.json` -- not `attributable`, which may only
   structure a note, and certainly not `inadmissible`, which is a model reading
   metadata with no quote behind it.

2. **`eligibility_fetched_at` is when the QUOTE was captured, not now.** A row
   that claims to be freshly fetched when it was assembled from stored quotes is
   a lie the next agent acts on. The timestamp carried here is the newest
   `created_at` among the quotes that actually contributed.

`eligibility_source_url` is set only where the corpus holds a real URL for the
document. Where it holds a filename instead, the column stays NULL and the
citation remains the gate's own `source_locator`. Inventing a plausible URL
would be the same lie in a different column.

── The boilerplate gate, in two layers ────────────────────────────────────
Filling the column is not the goal; cutting the sibling class is. A regime whose
leaves all quote the same regime-level document assembles the same text on every
leaf, and writing it raises coverage while separating nothing.

1. **Shared source document (exact).** A quote whose `source_file` is cited by
   more than one leaf of the same regime is evidence about the REGIME, not about
   the leaf, and does not count toward that leaf's own text. This is not a
   heuristic: all nine Horizon Pillar II clusters cite one file,
   `horizon_eu_general_annexes_2026_2027.pdf`, so every character they would
   have contributed is by construction identical across siblings.

2. **Own share (residual).** The same document refetched under two filenames, or
   a quote with no `source_file` at all, defeats layer 1. So the assembled text
   must also carry `--min-own-share` (default 0.34) of characters in sentences no
   sibling states.

Layer 1 catches what layer 2 misses and the reverse: six of the nine Pillar II
clusters passed the own-share test on 0.46-0.85, because each quotes a DIFFERENT
excerpt of the one shared annex. Different excerpts of one regime document are
still one regime document.

Usage:
  python3 ETL/terms/harvest_quoted_eligibility.py --regime horizon_eu_partnership
  python3 ETL/terms/harvest_quoted_eligibility.py --regime X --write --postgres
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402
from collections import defaultdict  # noqa: E402

import psycopg2  # noqa: E402
import psycopg2.extras  # noqa: E402

# The liveness test is `publishableInstruments()` in corpus.ts, already mirrored
# once in Python by the scheme-text loader. Imported, never restated: a second
# copy of this rule is the shape of bug this repo has been bitten by repeatedly.
_sys.path.insert(0, str(_Path(__file__).resolve().parent))
from load_scheme_text import live_ids  # noqa: E402

TIERS = json.loads(
    (_Path(ROOT) / "website/frontend/lib/intelligence/evidenceTiers.json").read_text())
CITED = set(TIERS["cited"]["tiers"])

MIN_TEXT = 40          # below this the column is not worth writing
MIN_QUOTE = 20         # a fragment shorter than this states no condition
MIN_SENTENCE = 40      # for the own-share test
DEFAULT_OWN_SHARE = 0.34
MAX_TEXT = 4000        # the column is prose for a founder, not a document dump


def norm(s: str | None) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip().lower()


def env() -> None:
    for line in (_Path(ROOT) / ".env.local").read_text().splitlines():
        m = re.match(r"^([A-Z_]+)=(.*)$", line)
        if m:
            os.environ.setdefault(m.group(1), m.group(2).strip().strip("\"'"))


def sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.;:])\s+|\s+(?=[-–•])", text or "")
    return [p.strip() for p in parts if len(p.strip()) >= MIN_SENTENCE]


def own_share(text: str, siblings: list[str]) -> float:
    mine = sentences(text)
    if not mine:
        return 0.0
    theirs = {norm(s) for t in siblings for s in sentences(t)}
    total = sum(len(s) for s in mine) or 1
    return sum(len(s) for s in mine if norm(s) not in theirs) / total


def fetch_quotes(cur, ids: list[str]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = defaultdict(list)
    cur.execute("""
        SELECT instrument_id, gate_family AS family, gate_key AS key, quote,
               source_file, source_locator, verification_level, created_at
          FROM eligibility_gates
         WHERE instrument_id = ANY(%s) AND quote IS NOT NULL
         UNION ALL
        SELECT instrument_id, clause_type, clause_key, quote,
               source_file, source_locator, verification_level, created_at
          FROM eligibility_clauses
         WHERE instrument_id = ANY(%s) AND quote IS NOT NULL""", (ids, ids))
    for r in cur.fetchall():
        out[r["instrument_id"]].append(dict(r))
    return out


def assemble(quotes: list[dict],
             sibling_quotes: set[str] | None = None) -> tuple[str, list[dict]]:
    """Verbatim quotes, de-duplicated, ordered so the DISCRIMINATING ones survive.

    The column holds prose for a founder, so it is capped, and what the cap
    keeps is a product decision. Ordering by gate key keeps whatever happens to
    sort first, which for a Horizon cluster is the participation rules every
    cluster shares -- the founder reads 4,000 characters that are true of all
    nine siblings and learns nothing.

    So quotes no sibling also states come first: record the condition a sibling
    would FAIL, not the condition they all pass. Shared quotes still follow
    while there is room, because the common rules are real and a founder does
    need them; they are simply not what the space is for.
    """
    shared = sibling_quotes or set()
    seen: set[str] = set()
    parts: list[str] = []
    used: list[dict] = []
    ordered = sorted(quotes, key=lambda q: (norm(q["quote"]) in shared,
                                            (q["family"] or ""), (q["key"] or "")))
    for q in ordered:
        if q["verification_level"] not in CITED:
            continue
        t = re.sub(r"\s+", " ", q["quote"]).strip()
        if len(t) < MIN_QUOTE or norm(t) in seen:
            continue
        if sum(len(p) + 1 for p in parts) + len(t) > MAX_TEXT:
            break
        seen.add(norm(t))
        parts.append(t)
        used.append(q)
    return " ".join(parts), used


def provenance(used: list[dict]) -> tuple[str | None, str, str]:
    """(source_url, confidence, fetched_at) -- all read off the quotes."""
    urls = [q["source_locator"] or q["source_file"] or "" for q in used]
    url = next((u for u in urls if u.startswith("http")), None)
    # Every contributing quote is cited by construction. `human_verified`
    # anywhere is the strongest thing the corpus can say about prose.
    conf = "high" if any(q["verification_level"] == "human_verified" for q in used) \
        else "medium-high" if len({q["source_file"] for q in used if q["source_file"]}) > 1 \
        else "high"
    when = max(q["created_at"] for q in used)
    return url, conf, when


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--regime", action="append", help="parent_id to harvest")
    ap.add_argument("--country", action="append", metavar="CC")
    ap.add_argument("--min-own-share", type=float, default=DEFAULT_OWN_SHARE)
    ap.add_argument("--publishable-only", action="store_true",
                    help="skip rows the product cannot show -- regime containers "
                         "and schemes the register says have closed")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--postgres", action="store_true",
                    help="mirror to Postgres -- the database the product reads")
    args = ap.parse_args()
    if not (args.regime or args.country):
        ap.error("scope the run with --regime and/or --country")

    env()
    pg = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = pg.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    where, params = [], []
    if args.regime:
        where.append("COALESCE(parent_id, id) = ANY(%s)")
        params.append(args.regime)
    if args.country:
        where.append("country = ANY(%s)")
        params.append([c.upper() for c in args.country])
    cur.execute(f"""SELECT id, parent_id, country, eligibility_text
                      FROM funding_instruments WHERE {' OR '.join(where)}""", params)
    scope = {r["id"]: dict(r) for r in cur.fetchall()}
    if not scope:
        print("nothing in scope")
        return

    if args.publishable_only:
        sq = sqlite3.connect(DB)
        live = live_ids(sq)
        sq.close()
        dropped = [i for i in scope if i not in live]
        for i in sorted(dropped):
            del scope[i]
        print(f"{len(dropped)} rows skipped: not publishable "
              f"(regime container, or the register says the scheme has closed)")

    # Siblings are needed whole, not just the ones in scope: a candidate that
    # repeats what a sibling ALREADY says separates nothing either.
    regimes = {(i["parent_id"] or i["id"]) for i in scope.values()}
    cur.execute("""SELECT id, parent_id, eligibility_text FROM funding_instruments
                    WHERE COALESCE(parent_id, id) = ANY(%s)""", (list(regimes),))
    family: dict[str, list[dict]] = defaultdict(list)
    for r in cur.fetchall():
        family[r["parent_id"] or r["id"]].append(dict(r))

    # Every leaf of every regime in scope, so "does a sibling also say this?"
    # is asked against the whole family and not just the rows being written.
    all_leaves = [s["id"] for rid in regimes for s in family[rid]]
    quotes = fetch_quotes(cur, all_leaves)

    # Layer 1: source documents cited by more than one leaf of a regime. What
    # they say is the regime's, whatever the leaf it was filed against.
    regime_docs: dict[str, set[str]] = {}
    for rid in regimes:
        users: dict[str, int] = defaultdict(int)
        for s in family[rid]:
            for d in {q["source_file"] for q in quotes.get(s["id"]) or [] if q["source_file"]}:
                users[d] += 1
        regime_docs[rid] = {d for d, n in users.items() if n > 1}

    # Which quotes are shared across the regime. Computed before assembly,
    # because it decides what each leaf's capped text keeps.
    per_regime_shared: dict[str, set[str]] = {}
    for rid in regimes:
        counts: dict[str, int] = defaultdict(int)
        for s in family[rid]:
            for t in {norm(q["quote"]) for q in quotes.get(s["id"]) or []}:
                counts[t] += 1
        per_regime_shared[rid] = {t for t, n in counts.items() if n > 1}

    drafted: dict[str, tuple[str, list[dict]]] = {}
    inherited: dict[str, str] = {}
    for iid, row in scope.items():
        if norm(row["eligibility_text"]):
            continue
        rid = row["parent_id"] or iid
        held = quotes.get(iid) or []
        own = [q for q in held if q["source_file"] not in regime_docs[rid]]
        if held and not own:
            inherited[iid] = (f"every quote comes from "
                              f"{', '.join(sorted(regime_docs[rid] & {q['source_file'] for q in held}))}, "
                              f"a document its siblings cite too")
            continue
        text, used = assemble(own, per_regime_shared.get(rid))
        if len(text) >= MIN_TEXT:
            drafted[iid] = (text, used)

    updates = []
    print(f"{len(scope)} instruments in scope, {len(drafted)} carry harvestable "
          f"cited quote of their own\n")
    for iid, why in sorted(inherited.items()):
        print(f"  REGIME-INHERITED  {iid:<24} {why}")
    for iid, (text, used) in sorted(drafted.items()):
        rid = scope[iid]["parent_id"] or iid
        siblings = [drafted[s["id"]][0] if s["id"] in drafted else (s["eligibility_text"] or "")
                    for s in family[rid] if s["id"] != iid]
        share = own_share(text, [s for s in siblings if s])
        url, conf, when = provenance(used)
        if share < args.min_own_share:
            print(f"  REGIME-INHERITED  {iid:<24} own_share {share:.2f} "
                  f"-- its regime's words, not its own; skipped")
            continue
        print(f"  harvest {iid:<24} {len(text):>5} chars  own_share {share:.2f}  "
              f"conf {conf}  captured {when:%Y-%m-%d}  {len(used)} quotes")
        updates.append((text, url, conf, when, iid))

    print(f"\n{len(updates)} rows to write, "
          f"{len(drafted) - len(updates)} refused as regime-inherited")
    if not args.write:
        print("[dry run] nothing written -- pass --write (and --postgres)")
        return

    sq = sqlite3.connect(DB)
    sq.executemany("""UPDATE funding_instruments
                         SET eligibility_text = ?, eligibility_source_url = ?,
                             eligibility_confidence = ?, eligibility_fetched_at = ?
                       WHERE id = ?""",
                   [(t, u, c, w.isoformat(sep=" ", timespec="seconds"), i)
                    for t, u, c, w, i in updates])
    sq.commit()
    sq.close()
    print(f"sqlite: {len(updates)} rows")

    if args.postgres:
        w = pg.cursor()
        w.executemany("""UPDATE funding_instruments
                            SET eligibility_text = %s, eligibility_source_url = %s,
                                eligibility_confidence = %s, eligibility_fetched_at = %s
                          WHERE id = %s""", updates)
        pg.commit()
        print(f"postgres: {len(updates)} rows -- this is the one the product reads")
    else:
        print("postgres: NOT written. SQLite alone changes nothing a founder sees.")
    pg.close()


if __name__ == "__main__":
    main()
