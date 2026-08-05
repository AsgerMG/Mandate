"""Make the fetched scheme text extractable, so it can become GATES.

── Why this exists ────────────────────────────────────────────────────────
The 2026-08-05 corpus run fetched verbatim eligibility text for 241 schemes
across all 20 in-corpus countries and loaded it onto `funding_instruments`
(`eligibility_text`, `eligibility_source_url`). That made the text citable in
the memo immediately -- 259 application URLs where there were none.

It did NOT make it usable by the part of the product that needs it most.
Measured after loading and re-embedding: exact-scheme recall did not move
(23% -> 23%). The reason is structural, and worth stating so nobody re-runs
the embed expecting a different answer:

  * The ADAPTIVE ROUND generates its follow-up questions from
    `eligibility_gates` (see gateReach.ts), not from `eligibility_text`.
  * `scoreEase` then credits an instrument only when the founder answered a
    question generated from THAT instrument's own gate (`instrumentId::gateKey`).
  * All 241 fetched-text instruments DO have gates -- but they are the
    INHERITED regime gates, which are identical across siblings by
    construction. That is precisely the population the fetch was meant to
    separate.
  * Gates sourced from the new fetch: ZERO.

So the distinct text (181 distinct texts across 241 instruments) sits in a
column the discriminating step never reads. Until it becomes gates, the
corpus work cannot pay off in ranking, and any funnel measurement would be
testing the adaptive round against the old identical gates.

── What this script does, and deliberately does not do ────────────────────
It stages, it does not extract. `extract_terms_bulk.py` already does the hard
part properly -- a fixed G1-G6 keyword checklist, the full schema shape, and
crucially a FREE MECHANICAL VERBATIM CHECK on every quote, so a fabricated
quote cannot survive. That check pairs exactly with this text, because the
fetch stored it verbatim with its source URL.

So rather than writing a second extractor with its own failure modes, this
writes each instrument's fetched text into data/raw/instrument_docs/ in the
shape that extractor already consumes, and prints the DOC_MAP entries to
paste in. One extractor, one set of conventions, one place to audit.

Every staged file carries a provenance header naming the source URL, the
confidence the fetching agent assigned, and the fetch date -- so a gate
derived from it can always be traced back past this script to a real page.

Usage:
  python3 ETL/terms/stage_fetched_text_as_docs.py            # report
  python3 ETL/terms/stage_fetched_text_as_docs.py --write
  python3 ETL/terms/stage_fetched_text_as_docs.py --write --limit 20
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402

import argparse  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402

DOCS = ROOT / "data" / "raw" / "instrument_docs"

# Below this there is not enough prose for the extractor to find a gate in,
# and a near-empty document wastes a paid call.
MIN_LEN = 120


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (s or "").lower()).strip("_")[:60]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--limit", type=int, default=0,
                    help="stage only the N largest instruments, to validate "
                         "quality on a small batch before paying for all of them")
    args = ap.parse_args()

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("""
        SELECT id, name, country, eligibility_text, description,
               eligibility_source_url, eligibility_confidence, event_count
          FROM funding_instruments
         WHERE COALESCE(eligibility_text,'') <> ''
         ORDER BY event_count DESC
    """).fetchall()

    staged: list[tuple[str, str]] = []
    skipped_short = 0
    for r in rows:
        text = (r["eligibility_text"] or "").strip()
        if len(text) < MIN_LEN:
            skipped_short += 1
            continue
        if args.limit and len(staged) >= args.limit:
            break
        fname = f"FETCHED_{r['country']}_{slug(r['id'])}.txt"
        body = (
            f"# Source: {r['eligibility_source_url'] or '(none recorded)'}\n"
            f"# Instrument: {r['id']}  ({r['name']})\n"
            f"# Country: {r['country']}\n"
            f"# Fetch confidence: {r['eligibility_confidence'] or 'unknown'}\n"
            f"# Staged from funding_instruments.eligibility_text, "
            f"verbatim as fetched 2026-08-05.\n\n"
        )
        if r["description"]:
            body += f"## What it funds\n{r['description'].strip()}\n\n"
        body += f"## Who may apply\n{text}\n"
        staged.append((r["id"], fname, body))
        if args.write:
            (DOCS / fname).write_text(body)

    print(f"instruments with fetched text: {len(rows)}")
    print(f"  stageable (>= {MIN_LEN} chars): {len(staged)}")
    print(f"  skipped, too short:            {skipped_short}")
    if args.limit:
        print(f"  limited to the {args.limit} largest by event_count")

    if not args.write:
        print("\n[report only] --write to stage the files")
        return

    print(f"\nwrote {len(staged)} files to {DOCS.relative_to(ROOT)}")
    print("\nDOC_MAP entries to paste into extract_terms_bulk.py:\n")
    # Emit the REAL instrument id, never one reconstructed from the filename:
    # slug() truncates at 60 chars, so a filename cannot round-trip back to an
    # id, and a DOC_MAP keyed on a mangled id silently extracts nothing.
    for iid, fname, _ in staged:
        print(f'    "{iid}": ["{fname}"],')


if __name__ == "__main__":
    main()
