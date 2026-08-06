"""Ship the string retrieval is scored on, so CI can check the test set for leaks.

── The defect this exists to prevent ──────────────────────────────────────
46% of the old recall set's holdout `project` rows had their description
sitting verbatim inside the profile of the fund they were meant to find. The
guard that should have caught it read `sample_project_titles` in SQLite while
retrieval scores against `instrument_profiles.profile_text` in POSTGRES. The
two are built separately and have drifted, and the gap between them is exactly
where the leak lived -- for weeks, inflating every number quoted from those
rows, because a leak does not announce itself as a failure. It announces itself
as a good score.

The Python guards close that gap at BUILD time. This closes it at CHECK time:
`npm run check` runs with no database on most machines and in the deploy path,
so a leak test that needs Postgres is a leak test that does not run. A guard
that cannot run is worse than no guard -- it reports green.

So the profile text is emitted as a committed artifact and
`scripts/check_recall_leaks.ts` reads it with no credentials at all.

── The comparison form, and the cross-language trap ───────────────────────
Containment is tested on the SQUASHED form (accent-free, punctuation-free,
single-spaced lowercase). Squashing happens in Python here and in TypeScript
there, and two implementations of one normaliser is the same duplication that
produced the original leak: the copy that drifts is the copy that stops
catching things.

So the artifact carries PROBES, and the check fails if its own squash cannot
reproduce them. The probe set is not a guess at what might differ -- it covers
EVERY distinct non-ASCII character that appears anywhere in the profile texts
or the recall descriptions, each in the context `a<char>b`, which is the
context in which the two implementations can disagree: Python drops a combining
mark and joins the neighbours, a regex that does not know it is a mark replaces
it with a space and separates them. If a character can appear in the data, it
is probed. When the corpus gains a character, this is rebuilt and the probe
appears with it.

Run with DATABASE_URL set:
  python3 ETL/terms/emit_profile_leak_index.py
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402

import datetime  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import sqlite3  # noqa: E402

from recall_guards import squash  # noqa: E402

FRONTEND = ROOT / "website" / "frontend" / "lib" / "intelligence"
OUT = FRONTEND / "profileLeakIndex.generated.json"
# Every recall set on disk, not just the active one: a retired set is still
# loadable with `SET=`, and the check must be able to test whatever it is
# pointed at rather than only the file that happens to be the default today.
PROBE_SOURCES = sorted(FRONTEND.glob("__recallSet*.json"))


def main() -> None:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit(
            "DATABASE_URL is not set. This artifact IS the Postgres profile "
            "text; emitting it from anything else would rebuild the exact gap "
            "it exists to close.")

    import psycopg2
    pg = psycopg2.connect(dsn)
    with pg.cursor() as cur:
        cur.execute("SELECT instrument_id, profile_text FROM instrument_profiles")
        raw = {i: (t or "") for i, t in cur.fetchall()}
    pg.close()

    profiles = {i: squash(t) for i, t in raw.items() if squash(t)}

    conn = sqlite3.connect(DB)
    parent = {r[0]: r[1] for r in conn.execute(
        "SELECT id, parent_id FROM funding_instruments")}
    conn.close()

    # ── probes: every non-ASCII character that can reach the comparison ──────
    chars: set[str] = set()
    for t in raw.values():
        chars.update(c for c in t if ord(c) > 127)
    described = 0
    for f in PROBE_SOURCES:
        for r in json.loads(f.read_text()):
            d = (r.get("description") or "")
            if d:
                described += 1
                chars.update(c for c in d if ord(c) > 127)

    probes = [[f"a{c}b", squash(f"a{c}b")] for c in sorted(chars)]
    # Plus whole real strings, so the probe set also exercises the parts of the
    # normaliser that only appear at length: runs of punctuation collapsing to
    # one space, leading and trailing trim, digits kept.
    for f in PROBE_SOURCES:
        rows = json.loads(f.read_text())
        for r in rows[::max(len(rows) // 15, 1)]:
            d = (r.get("description") or "").strip()[:240]
            if d:
                probes.append([d, squash(d)])
    for t in list(raw.values())[::max(len(raw) // 15, 1)]:
        if t.strip():
            probes.append([t.strip()[:240], squash(t.strip()[:240])])

    out = {
        "builtAt": datetime.datetime.now(datetime.timezone.utc)
                           .isoformat(timespec="seconds"),
        "source": "instrument_profiles.profile_text (Postgres), squashed",
        "instrumentsWithProfile": len(profiles),
        "probeChars": len(chars),
        "parent": {k: v for k, v in parent.items() if v},
        "profile": profiles,
        "squashProbes": probes,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=0) + "\n")
    print(f"wrote {OUT}")
    print(f"  instruments with a profile   {len(profiles):,}")
    print(f"  distinct non-ASCII chars      {len(chars):,} probed in context")
    print(f"  whole-string probes           {len(probes) - len(chars):,}")
    print(f"  descriptions scanned          {described:,}")
    print(f"  size                          {OUT.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
