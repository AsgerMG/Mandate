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
from etl_env import DB, ROOT, WEB  # noqa: E402

import datetime  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import sqlite3  # noqa: E402

from recall_guards import digest, squash  # noqa: E402

FRONTEND = WEB / "lib" / "intelligence"
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

    # ── What a REBUILT description must additionally not contain ────────────
    # `profile_text` is built from up to 40 SAMPLED award titles per fund, so
    # the three checks above see a sample of the fund's own words and not all
    # of them. A description recovered from another regime is supposed to be
    # independent of the won fund entirely, which is a stronger claim and needs
    # a stronger test:
    #
    #   name / code   the fund's own name and its notified scheme code. The
    #                 build-time guard (`names_the_fund`) already refuses these,
    #                 but a guard that only runs at build time is a guard nobody
    #                 can re-run on a committed artifact.
    #   own titles    EVERY project title the corpus can credit to the fund, not
    #                 the 40 in its profile. The cross-regime rule says the text
    #                 belongs to another regime; the same string appearing on an
    #                 award under THIS one falsifies that, and only a full title
    #                 index can see it.
    #
    # Titles are emitted only for instruments some recall set actually names —
    # a fund that is never an answer cannot be leaked into — and as 12-hex
    # digests rather than text, because this artifact is committed and the whole
    # point of it is that it carries no award prose a request path could read.
    names = {i: (n or "") for i, n in conn.execute(
        "SELECT id, name FROM funding_instruments")}
    codes = {i: (c or "").strip() for i, c in conn.execute(
        "SELECT id, scheme_code FROM funding_instruments")}
    answers: set[str] = set()
    for f in PROBE_SOURCES:
        for r in json.loads(f.read_text()):
            answers.add(r["instrument"])
    src2inst: dict[str, list[str]] = {}
    for s, iid in conn.execute(
            "SELECT source, instrument_id FROM funding_instrument_sources"):
        src2inst.setdefault(s, []).append(iid)
    code2inst: dict[str, list[str]] = {}
    for iid, code in codes.items():
        if code:
            code2inst.setdefault(code, []).append(iid)
    own: dict[str, set[str]] = {}
    for source, call_id, title in conn.execute(
            "SELECT source, call_id, project_title FROM public_funding_events "
            "WHERE is_duplicate = 0 AND COALESCE(project_title, '') <> ''"):
        for iid in code2inst.get((call_id or "").strip(), []) + src2inst.get(source, []):
            if iid in answers:
                own.setdefault(iid, set()).add(digest(squash(title)))
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
        # Squashed, and only for instruments some recall set names: the check
        # asks whether a description CONTAINS one of these, and a fund nobody
        # can win is a fund nobody can leak.
        "name": {i: squash(names[i]) for i in sorted(answers)
                 if i in names and squash(names[i])},
        "code": {i: squash(codes[i]) for i in sorted(answers)
                 if codes.get(i) and squash(codes[i])},
        "ownTitles": {i: sorted(t) for i, t in sorted(own.items())},
        "squashProbes": probes,
        # The same cross-language contract squashProbes enforces, for the
        # digest: [squashed input, what Python produced].
        "digestProbes": [[p[1], digest(p[1])] for p in probes[:40]],
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=0) + "\n")
    print(f"wrote {OUT}")
    print(f"  instruments with a profile   {len(profiles):,}")
    print(f"  distinct non-ASCII chars      {len(chars):,} probed in context")
    print(f"  whole-string probes           {len(probes) - len(chars):,}")
    print(f"  descriptions scanned          {described:,}")
    print(f"  answer instruments named       {len(answers):,} across "
          f"{len(PROBE_SOURCES)} recall sets")
    print(f"  own project titles digested   {sum(len(t) for t in own.values()):,} "
          f"over {len(own):,} instruments")
    print(f"  size                          {OUT.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
