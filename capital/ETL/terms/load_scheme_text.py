"""Load fetched scheme text into the corpus as it lands, not at the end.

── Why "as it lands" ───────────────────────────────────────────────────────
The fetch runs as agents against live sites, and every one of them has been
killed mid-task by an account-level spend limit that can recur at any time.
The `found_<CC>.json` files survive that (they're already on disk), but
survival on disk doesn't help the product -- nothing reads them until they're
in the DB. Waiting to batch-load until every country finishes means a cutoff
before that point loses the VALUE of everything fetched so far, even though
the files themselves are safe.

So this script is deliberately idempotent and re-run after every agent
completion: it reads whatever `found_<CC>.json` files currently exist,
UPDATEs `funding_instruments` for rows that don't have text yet, and reports
what changed. Running it twice on the same data is a no-op.

── What it does NOT do ─────────────────────────────────────────────────────
It does not write `eligibility_gates`. Turning fetched prose into a formal
GATE means assigning `gate_role`, `verification_level`, `intake_field` --
and the standing rule is a seeded gate MUST declare gate_role, NULL is not
neutral. That is a real design decision, not a load step, and rushing it
under time pressure is exactly how the region-gate defects happened. This
script writes the descriptive text only (`description`, `eligibility_text`,
`eligibility_source_url`), which:
  - feeds `build_instrument_profiles.py` directly (same integration point as
    yesterday's SATR aid_measure_title/objectives_text), so re-embedding
    already benefits from it, and
  - is exactly what a hand-read pass needs to look at before gates are cut
    from it.

── Light verification, not none ────────────────────────────────────────────
The plan's gate was a full 20-per-country hand read before any load. Under
the current risk of being cut off mid-fetch, loading the descriptive text now
and hand-reading before it becomes a GATE is the accepted tradeoff -- but
this script still refuses obvious garbage: empty text, text under 40 chars,
records explicitly marked not found, and closed schemes (per the "only active
funds" rule -- their text should not have been fetched at all, and if it was,
it doesn't belong in the live corpus).

Usage:
  python3 load_scheme_text.py            # report what would load
  python3 load_scheme_text.py --write
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT as REPO_ROOT  # noqa: E402

import argparse  # noqa: E402
import collections  # noqa: E402
import json  # noqa: E402
import sqlite3  # noqa: E402

SRC_DIR = REPO_ROOT / "data" / "raw" / "scheme_enrichment"
MIN_TEXT_LEN = 40


def usable(rec: dict) -> bool:
    if rec.get("found") is False:
        return False
    if (rec.get("status") or "").lower() == "closed":
        return False
    text = rec.get("eligibility_text") or rec.get("description") or ""
    return len(text.strip()) >= MIN_TEXT_LEN


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    conn = sqlite3.connect(DB)
    have_desc = {r[0] for r in conn.execute(
        "SELECT id FROM funding_instruments WHERE COALESCE(eligibility_text,'') <> ''")}

    per_country = collections.Counter()
    updates: list[tuple] = []
    skipped_no_id = skipped_bad = skipped_dup = 0

    for f in sorted(SRC_DIR.glob("found_*.json")):
        cc = f.stem.split("_")[1]
        try:
            recs = json.loads(f.read_text())
        except Exception:
            continue
        for rec in recs:
            iid = rec.get("instrument_id")
            if not iid:
                skipped_no_id += 1
                continue
            if not usable(rec):
                skipped_bad += 1
                continue
            if iid in have_desc:
                skipped_dup += 1
                continue
            desc = (rec.get("description") or "").strip()
            elig = (rec.get("eligibility_text") or "").strip()
            url = (rec.get("scheme_url") or rec.get("source_url") or "").strip() or None
            conf = (rec.get("confidence") or "").strip() or None
            updates.append((desc or None, elig or None, url, conf, iid))
            per_country[cc] += 1

    print(f"loadable: {len(updates)} instruments across {len(per_country)} countries")
    for cc, n in per_country.most_common():
        print(f"   {cc}  {n}")
    print(f"skipped: {skipped_bad} not-usable (closed/abstained/too short), "
          f"{skipped_dup} already loaded, {skipped_no_id} missing instrument_id")

    if not args.write:
        print("\n[report only] --write to apply")
        return

    conn.executemany("""
        UPDATE funding_instruments
           SET description = COALESCE(description, ?),
               eligibility_text = ?,
               eligibility_source_url = ?,
               eligibility_confidence = ?,
               eligibility_fetched_at = CURRENT_TIMESTAMP
         WHERE id = ?
    """, updates)
    conn.commit()
    print(f"\nloaded {len(updates)} rows")


if __name__ == "__main__":
    main()
