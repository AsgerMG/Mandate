"""Apply the evidence property to the corpus, and say exactly what it changes.

`technology_veto` in classify_taxonomy.py states when a technology sector_top
has no evidence behind it. This module runs that test over every company in the
corpus, recomputes the `sector_mix` of every instrument whose recipients move,
and reports the population.

READ-ONLY on the corpus. It writes nothing to sqlite and nothing to Postgres --
Railway is the source of truth and a taxonomy correction is an owner decision.
What it emits instead is (a) the exact write, as SQL, for review, and (b) a
corrected copy of the instrument snapshot so the change can be MEASURED on the
real ranker before anyone is asked to approve it.

  python3 ETL/events/transform/apply_sector_evidence.py report
  python3 ETL/events/transform/apply_sector_evidence.py snapshot --out /tmp/x.json
  python3 ETL/events/transform/apply_sector_evidence.py sql --out /tmp/write.sql
"""
from __future__ import annotations

# --- ETL path bootstrap (auto-added; see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB as _ETL_DB, ROOT as _ETL_ROOT  # noqa: E402,F401
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import json  # noqa: E402
import sqlite3  # noqa: E402
from collections import Counter, defaultdict  # noqa: E402

_sys.path.insert(0, str(_Path(__file__).resolve().parent))
from classify_taxonomy import technology_veto  # noqa: E402

ROOT = _ETL_ROOT
DB = _ETL_DB

SNAPSHOT = ROOT / "website" / "frontend" / "public" / "data" / "instrument_terms.json"

# `populate_funding_instruments.py` keeps the eight commonest recipient sectors
# per instrument. The corrected mix must be built the same way or the two are
# not comparable.
MIX_KEEP = 8


def vetoed_companies(conn: sqlite3.Connection) -> dict[int, str]:
    """company_id -> the technology sector it claims without evidence."""
    rows = conn.execute("""
        SELECT co.id, co.sector_top, GROUP_CONCAT(e.sector_tags_raw, '||')
        FROM companies co JOIN public_funding_events e ON e.company_id = co.id
        WHERE e.sector_tags_raw IS NOT NULL AND TRIM(e.sector_tags_raw) != ''
        GROUP BY co.id
    """).fetchall()
    out: dict[int, str] = {}
    for cid, top, tags_s in rows:
        if not top or top == "other":
            continue
        tags = [t.strip() for t in (tags_s or "").split("||") if t.strip()]
        if technology_veto(tags):
            out[cid] = top
    return out


def instrument_key(source: str, authority: str | None, call_id: str | None) -> None:
    raise NotImplementedError   # ids come from the built table, see recount_mix


def recount_mix(conn: sqlite3.Connection, vetoed: dict[int, str]) -> dict[str, dict]:
    """The veto, applied to the PUBLISHED mix as a delta. Never a rebuild.

    ── Why this is a delta and not a recount, which cost a whole measurement ──
    The first version of this rebuilt each instrument's mix from its own join
    over `public_funding_events`. It looked equivalent and was not: the loader
    withholds ONE vote per replayed company (`leaked_company` in
    populate_funding_instruments.py), because the recall harness grades the
    ranking by replaying companies out of the very table the mix is counted
    from, and a test company voting for its own answer is an answer key.

    A rebuild that does not reproduce that withholding puts the recall set back
    into the signal. Measured: 187 of 291 instruments came out with a different
    TOTAL award count, one of them 4,477 against the published 1,407. The A/B
    then differed in the leak as well as in the veto, and two founders lost the
    fund they had actually won -- which is precisely the outcome this whole
    workstream exists to avoid.

    So the mix is never recomputed. Each vetoed company's votes are MOVED from
    the technology sector it claimed to `other`, within the published counts,
    and every other count is left exactly as the loader wrote it. Whatever the
    loader excluded stays excluded, because it is never consulted."""
    inst = conn.execute("""
        SELECT id, scheme_code, administering_body, sector_mix, name, event_count
        FROM funding_instruments
    """).fetchall()
    # (scheme_code, administering_body) -> instrument id. Only the scheme
    # children the split produces carry a scheme_code, and they are the rows
    # whose mix is their own rather than inherited.
    by_scheme: dict[tuple[str, str], str] = {}
    for iid, scheme, body, _mix, _name, _n in inst:
        if scheme and body:
            by_scheme[(scheme, body)] = iid
    # Per instrument, how many of ITS awards went to a vetoed company, and
    # which sector each of those awards had been voting for.
    moved_from: dict[str, Counter] = defaultdict(Counter)
    q = conn.execute("""
        SELECT call_id, granting_authority, company_id
        FROM public_funding_events
        WHERE is_duplicate = 0 AND call_id IS NOT NULL
          AND granting_authority IS NOT NULL
    """)
    for call_id, authority, cid in q:
        claimed = vetoed.get(cid)
        if not claimed:
            continue
        iid = by_scheme.get((call_id, (authority or "")[:200]))
        if iid:
            moved_from[iid][claimed] += 1
    out: dict[str, dict] = {}
    for iid, _scheme, _body, mix_s, name, n in inst:
        deltas = moved_from.get(iid)
        if not deltas or not mix_s:
            continue
        before = json.loads(mix_s)
        after = dict(before)
        moved = 0
        for sector, k in deltas.items():
            have = after.get(sector, 0)
            # The published count is the authority. A vetoed company may have
            # cast fewer votes here than the raw join suggests -- the loader
            # withheld some -- so never move more than the column holds.
            take = min(have, k)
            if not take:
                continue
            after[sector] = have - take
            moved += take
        if not moved:
            continue
        after["other"] = after.get("other", 0) + moved
        after = {s: c for s, c in after.items() if c > 0}
        # Nothing is created or destroyed: a vote only moves sector -> other.
        assert sum(after.values()) == sum(before.values()), iid
        # The loader keeps only the commonest MIX_KEEP sectors, so a mix that
        # gains `other` as a new class can push a tail class out. Truncate the
        # same way it does, AFTER the conservation check -- the check is about
        # the move, the truncation is about the column's published shape.
        after = dict(Counter(after).most_common(MIX_KEEP))
        if before == after:
            continue
        out[iid] = {"name": name, "events": n, "moved": moved,
                    "before": before, "after": after}
    return out


def _share(mix: dict, sector: str) -> float:
    tot = sum(mix.values())
    return (mix.get(sector, 0) / tot) if tot else 0.0


def cmd_report(conn: sqlite3.Connection) -> None:
    vetoed = vetoed_companies(conn)
    by_sector = Counter(vetoed.values())
    print(f"companies claiming a technology sector with no evidence for it: "
          f"{len(vetoed)}")
    for k, v in by_sector.most_common():
        print(f"  {v:6d}  {k}")
    changed = recount_mix(conn, vetoed)
    print(f"\ninstruments whose recipient mix moves: {len(changed)}")
    ranked = sorted(changed.items(),
                    key=lambda kv: -(kv[1]["moved"] / max(1, sum(kv[1]["before"].values()))))
    for iid, d in ranked[:20]:
        b, a = d["before"], d["after"]
        top_b = max(b, key=b.get) if b else "-"
        print(f"  {d['moved']:4d}/{sum(b.values()):4d}  {d['name'][:52]:52s}")
        print(f"        {top_b} {100*_share(b, top_b):.0f}% -> {100*_share(a, top_b):.0f}%")


def cmd_snapshot(conn: sqlite3.Connection, out: str) -> None:
    vetoed = vetoed_companies(conn)
    changed = recount_mix(conn, vetoed)
    snap = json.loads(SNAPSHOT.read_text())
    hit = 0
    for rec in snap["records"]:
        d = changed.get(rec["id"])
        if d:
            rec["sectorMix"] = d["after"]
            hit += 1
    _Path(out).write_text(json.dumps(snap))
    print(f"corrected snapshot -> {out} "
          f"({hit} of {len(snap['records'])} records' sectorMix rebuilt)")


def cmd_sql(conn: sqlite3.Connection, out: str) -> None:
    vetoed = vetoed_companies(conn)
    changed = recount_mix(conn, vetoed)
    lines = [
        "-- wsCZ: the evidence property, applied to Railway Postgres.",
        "-- NOT RUN. Railway is the source of truth; this is the write for review.",
        f"-- {len(vetoed)} companies claim a technology sector that every official",
        "-- activity descriptor on their record contradicts. See",
        "-- ETL/events/transform/classify_taxonomy.py :: technology_veto.",
        "BEGIN;",
    ]
    ids = ",".join(str(i) for i in sorted(vetoed))
    lines += [
        "UPDATE companies SET sector_top = 'other', subsector = 'other',",
        "       sector_taxonomy_method = 'evidence_veto',",
        "       sector_taxonomy_updated_at = NOW()",
        f"WHERE id IN ({ids});",
        "",
        f"-- and the {len(changed)} instruments whose recipient mix therefore moves:",
    ]
    for iid, d in sorted(changed.items()):
        mix = json.dumps(d["after"]).replace("'", "''")
        lines.append(f"UPDATE funding_instruments SET sector_mix = '{mix}' "
                     f"WHERE id = '{iid}';")
    lines.append("COMMIT;")
    _Path(out).write_text("\n".join(lines) + "\n")
    print(f"write for review -> {out} "
          f"({len(vetoed)} companies, {len(changed)} instruments)")


EVIDENCE = ROOT / "data" / "reference" / "instrument_recipient_activity.json"
MAX_ACTIVITIES = 12


def cmd_evidence(conn: sqlite3.Connection) -> None:
    """Emit, as a COMMITTED artifact, what each instrument's recipients say they
    officially do.

    This is evidence, not a verdict. It carries the recipients' own registered
    activity descriptors and how many awards each accounts for, and nothing
    else -- no sector, no veto, no judgement. `check_sector_evidence.ts` applies
    the property to it. Keeping the two apart is the whole point: a check that
    reads a file its own logic produced is checking that it agrees with itself.

    It is committed because the corpus is not: `data/db.sqlite` is gitignored
    and no check may read it."""
    inst = conn.execute("""
        SELECT id, scheme_code, administering_body FROM funding_instruments
        WHERE scheme_code IS NOT NULL AND administering_body IS NOT NULL
    """).fetchall()
    by_scheme = {(s, b): i for i, s, b in inst}
    acts: dict[str, Counter] = defaultdict(Counter)
    totals: Counter = Counter()
    q = conn.execute("""
        SELECT call_id, granting_authority, sector_tags_raw
        FROM public_funding_events
        WHERE is_duplicate = 0 AND call_id IS NOT NULL
          AND granting_authority IS NOT NULL
    """)
    for call_id, authority, tag in q:
        iid = by_scheme.get((call_id, (authority or "")[:200]))
        if not iid:
            continue
        totals[iid] += 1
        if tag and tag.strip():
            acts[iid][tag.strip()] += 1
    records = {}
    for iid, c in acts.items():
        records[iid] = {"awards": totals[iid], "described": sum(c.values()),
                        "activities": dict(c.most_common(MAX_ACTIVITIES))}
    doc = {
        "_": "What each instrument's RECIPIENTS officially do, as registered "
             "activity descriptors and award counts. Evidence only -- the "
             "property is applied by check_sector_evidence.ts, never here.",
        "_source": "public_funding_events.sector_tags_raw, joined to the "
                   "instrument by (call_id, granting_authority), counted per "
                   "award exactly as funding_instruments.sector_mix is.",
        "_emitted_by": "ETL/events/transform/apply_sector_evidence.py evidence",
        "records": records,
    }
    EVIDENCE.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
    print(f"recipient activity -> {EVIDENCE} ({len(records)} instruments, "
          f"{sum(r['described'] for r in records.values())} described awards)")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("cmd", choices=["report", "snapshot", "sql", "evidence"])
    ap.add_argument("--out", default="/tmp/wscz_out")
    args = ap.parse_args()
    conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    if args.cmd == "report":
        cmd_report(conn)
    elif args.cmd == "evidence":
        cmd_evidence(conn)
    elif args.cmd == "snapshot":
        cmd_snapshot(conn, args.out)
    else:
        cmd_sql(conn, args.out)


if __name__ == "__main__":
    main()
