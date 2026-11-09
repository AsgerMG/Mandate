"""The fund-intelligence coverage table: one row per instrument, every stat.

audit_grounding.py answers "how are we doing" in aggregate. This answers "what
do we know about THIS fund", which is the question you have when a brief puts a
row in front of a founder and you want to know what stands behind it.

Emits JSON for the coverage dashboard, and a compact Markdown summary for the
repo. Read-only, no API cost.

Usage:
  python3 ETL/terms/coverage_report.py [--json OUT.json] [--md OUT.md]
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

_sys.path.insert(0, str(_Path(__file__).resolve().parents[1] / "lib"))

import argparse  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
from collections import defaultdict  # noqa: E402

from etl_env import ROOT  # noqa: E402
from store import connect  # noqa: E402

EVALUABLE = ("value_spec IS NOT NULL AND value_spec != '' "
             "AND (gate_role IS NULL OR gate_role = 'filter')")
CITED = ("llm_cited", "llm_2pass", "human_verified")
STALE_YEARS = 3

# The six things an analyst needs before they can advise on a fund. Each is
# either present or it is not; "partly" is what hides gaps, so every axis is
# a hard boolean and the score is simply how many are true.
AXES = ("eligibility", "funds", "where", "amount", "route", "live")


def build(conn) -> dict:
    """`conn` is a store connection (tuple rows); named access is a local cursor,
    so a caller can hand the same connection to compute_kpis afterwards."""
    from psycopg.rows import dict_row  # noqa: PLC0415
    named = conn.cursor(row_factory=dict_row)

    insts = list(named.execute("""
        SELECT id, parent_id, name, country, source_family_bucket, capital_type,
               tier, root_id, depth, path,
               event_count, company_count, total_eur, first_year, last_year,
               sample_project_titles, sector_mix_display, scheme_code,
               award_p25, award_p50, award_p75, award_n
          FROM funding_instruments ORDER BY id
    """))

    row = conn.execute("""
        SELECT last_year FROM funding_instruments WHERE last_year IS NOT NULL
         GROUP BY last_year HAVING COUNT(*) >= 10 ORDER BY last_year DESC LIMIT 1
    """).fetchone()
    latest = row[0] if row else 0

    # ── gates, with parent rules layered under the child's, as the read path
    # resolves them. Counting only directly-attached rows measures a corpus the
    # product never sees.
    own_keys: dict[str, set[str]] = defaultdict(set)
    # Rules the instrument holds ITSELF, excluding the framework rules seeded
    # across a channel and the generic five-rule stub. This is the difference
    # between a fund we have researched and a fund that merely sits under a
    # regime we have researched.
    FRAMEWORK_KEYS = {"framework_excluded_activity",
                      "framework_undertaking_in_difficulty",
                      "gber_article_inferred"}
    own_rules: dict[str, int] = defaultdict(int)
    n_eval: dict[str, int] = defaultdict(int)
    n_cited: dict[str, int] = defaultdict(int)
    fields: dict[str, set[str]] = defaultdict(set)
    region_eval: set[str] = set()

    for r in named.execute(f"""
        SELECT instrument_id, gate_key, value_spec, verification_level,
               COALESCE(intake_field_resolved, intake_field) AS f,
               CASE WHEN {EVALUABLE} THEN 1 ELSE 0 END AS ev
          FROM eligibility_gates ORDER BY id
    """):
        iid = r["instrument_id"]
        own_keys[iid].add(r["gate_key"])
        if r["gate_key"] not in FRAMEWORK_KEYS and not r["gate_key"].startswith("llm_classified_"):
            own_rules[iid] += 1
        if r["ev"]:
            n_eval[iid] += 1
            if r["f"] and r["f"] != "none":
                fields[iid].add(r["f"])
            if r["verification_level"] in CITED:
                n_cited[iid] += 1
            if r["value_spec"] and '"region_within"' in r["value_spec"]:
                region_eval.add(iid)

    parent_of = {i["id"]: i["parent_id"] for i in insts}
    for iid, pid in parent_of.items():
        if pid and (own_keys.get(pid, set()) - own_keys.get(iid, set())):
            n_eval[iid] += n_eval.get(pid, 0)
            n_cited[iid] += n_cited.get(pid, 0)
            fields[iid] |= fields.get(pid, set())
            if pid in region_eval:
                region_eval.add(iid)

    # Rows the product can never publish: framework placeholders, and rollup
    # parents that exist only to hold a regime's curated gates for the children
    # underneath them. They score zero on everything by construction, and
    # counting them made coverage look ~7 points worse than it is. Same test
    # publishableInstruments() applies in the read path.
    has_children = {p for p in parent_of.values() if p}
    frameworks = {r[0] for r in conn.execute(
        "SELECT id FROM funding_instruments WHERE is_framework")}

    apply_direct = {r[0] for r in conn.execute(
        "SELECT DISTINCT instrument_id FROM instrument_application")}
    apply_url = {r[0] for r in conn.execute(
        "SELECT DISTINCT instrument_id FROM instrument_application "
        "WHERE url IS NOT NULL AND url != ''")}

    # What an instrument actually funds, from its own award history.
    #
    # Deliberately NOT part of the name. The label must stay the fund's own
    # identifier — inventing "Altum Energy Programme" from the sectors its
    # recipients happen to sit in would fabricate a programme that does not
    # exist, and someone would eventually quote it back to a founder. Sector
    # mix is a measurement, so it is shown as one, in its own column.
    #
    # It also answers the thing the identifier cannot: a row reading
    # "Altum (Latvia) - aui" tells a reader nothing, while "energy 62%,
    # industrial 21%" tells them whether to keep looking.
    def focus_of(mix_json: str | None) -> str:
        if not mix_json:
            return ""
        try:
            mix = json.loads(mix_json)
        except (ValueError, TypeError):
            return ""
        total = sum(mix.values())
        if not total:
            return ""
        top = sorted(mix.items(), key=lambda kv: -kv[1])[:2]
        # Below a fifth of an instrument's awards a "focus" is noise.
        return ", ".join(f"{k.replace('_', ' ')} {round(100 * v / total)}%"
                         for k, v in top if v / total >= 0.2)

    rows = []
    for i in insts:
        iid = i["id"]
        titles = json.loads(i["sample_project_titles"] or "[]") if i["sample_project_titles"] else []
        has_route = iid in apply_direct or (parent_of[iid] in apply_direct)
        stale = bool(i["last_year"]) and latest - i["last_year"] >= STALE_YEARS
        axes = {
            "eligibility": n_eval[iid] >= 2,
            # The DISPLAY mix (every recipient), not the ranker's held-out one:
            # this asks whether the corpus knows what the fund funds, and a fund
            # whose recipients all sit in a recall set still told us that.
            # See populate_funding_instruments.py, sector_mix_display.
            "funds": bool(titles) or bool(i["sector_mix_display"]),
            # Country is the floor; a region is only owed where a rule needs one.
            "where": bool(i["country"]),
            "amount": i["award_p50"] is not None,
            "route": has_route,
            # Whether we KNOW its recency, not whether it happens to be busy.
            #
            # This axis used to require the instrument to be non-stale, which
            # made 30% of the corpus a permanent coverage failure over a fact
            # about the world rather than a gap in our knowledge. A scheme that
            # stopped awarding in 2022 is not a hole — it is fully known, and
            # the honest thing is to say so and demote it, which livenessFit
            # already does. Chasing that axis to 100% would have meant chasing
            # something unreachable and meaningless.
            #
            # Dormancy is still tracked, as `stale`, and shown as a quality of
            # the row rather than as missing evidence.
            "live": bool(i["last_year"]),
        }
        rows.append({
            "id": iid,
            "publishable": iid not in has_children and iid not in frameworks,
            "tier": i["tier"],
            "rootId": i["root_id"],
            "depth": i["depth"],
            "path": i["path"],
            "name": i["name"] or iid,
            "country": i["country"] or "",
            "channel": i["source_family_bucket"] or "",
            "capital": i["capital_type"] or "",
            "scheme": i["scheme_code"] or "",
            "events": i["event_count"] or 0,
            "companies": i["company_count"] or 0,
            "totalEur": i["total_eur"] or 0,
            "firstYear": i["first_year"],
            "lastYear": i["last_year"],
            "parentId": parent_of[iid],
            "ownRules": own_rules[iid],
            "gates": n_eval[iid],
            "cited": n_cited[iid],
            "fields": len(fields[iid]),
            "titles": len(titles),
            "sectorMix": bool(i["sector_mix_display"]),
            "focus": focus_of(i["sector_mix_display"]),
            "regionEval": iid in region_eval,
            "awardP25": i["award_p25"],
            "awardP50": i["award_p50"],
            "awardP75": i["award_p75"],
            "awardN": i["award_n"] or 0,
            "route": has_route,
            "routeUrl": iid in apply_url or (parent_of[iid] in apply_url),
            "stale": stale,
            "axes": axes,
            "score": sum(axes.values()),
        })

    # ── A row must be distinguishable from every other row ────────────────
    # 542 of 724 publishable instruments share their display name with another,
    # because `name` is the granting BODY and one body runs many programmes:
    # "Norges Forskningsradet" appears 65 times, once per programme (ENERGIX,
    # BIA, FORNY20 ...). The product already qualifies state-aid rows by scheme
    # code; nothing qualified the rest, so the dashboard read as duplicates and
    # the shortlist logged SEL-DUPE-NAME and dropped rows outright.
    #
    # The qualifier is never invented. A notified scheme has a code, and every
    # other instrument's id was built from the source's own programme
    # identifier — so the distinguishing fragment is recovered by stripping the
    # prefix a name's siblings share, rather than by naming the fund ourselves.
    # Real programme names arrive with Phase 1 of the substream plan; until
    # then this is the fund's identifier, shown honestly as one.
    by_name: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        if r["publishable"]:
            by_name[r["name"]].append(r)
    for name, group in by_name.items():
        if len(group) < 2:
            for r in group:
                r["label"] = name
            continue
        prefix = os.path.commonprefix([r["id"] for r in group])
        for r in group:
            token = r["scheme"] or r["id"][len(prefix):].strip("_") or r["id"]
            r["label"] = f"{name} \u00b7 {token.replace('_', ' ')}"
        # One body can run the same notified scheme under two regimes — the
        # R&D one and the equity one — so the scheme code alone still collides.
        # What separates them is what the money IS, which the row already
        # knows, and which is the more useful distinction to a founder anyway.
        seen: dict[str, list[dict]] = defaultdict(list)
        for r in group:
            seen[r["label"]].append(r)
        for label, tied in seen.items():
            if len(tied) < 2:
                continue
            for r in tied:
                if r["capital"]:
                    r["label"] = f"{label} ({r['capital']})"
        # Last tier: the notified regime itself. Two rows can share a body, a
        # scheme code AND a capital type while sitting under different regimes
        # (Austria's FFG runs SA.101861 under both the R&D and equity ones).
        # Qualifying by the regime is the end of the chain because there is
        # nothing left that distinguishes them — if this ever collides, the two
        # rows really are the same instrument and the corpus has a duplicate.
        seen2: dict[str, list[dict]] = defaultdict(list)
        for r in group:
            seen2[r["label"]].append(r)
        for label, tied in seen2.items():
            if len(tied) < 2:
                continue
            common = os.path.commonprefix([r["parentId"] or "" for r in tied])
            for r in tied:
                regime = (r["parentId"] or "")[len(common):].strip("_")
                if regime:
                    r["label"] = f"{label} [{regime}]"
    for r in rows:
        r.setdefault("label", r["name"])

    rows.sort(key=lambda r: (-r["score"], -r["totalEur"]))
    # Coverage is measured on what a founder can actually be shown.
    pub = [r for r in rows if r["publishable"]]
    n = len(pub)
    summary = {
        "instruments": n,
        "total": len(rows),
        "latestYear": latest,
        "axes": {a: sum(1 for r in pub if r["axes"][a]) for a in AXES},
        "complete": sum(1 for r in pub if r["score"] == len(AXES)),
        # Depth, as distinct from coverage. An instrument can be complete on
        # all six axes and still hold no rule of its own.
        "subInstruments": sum(1 for r in pub if r["parentId"]),
        "noOwnRules": sum(1 for r in pub if r["ownRules"] == 0),
        "noCited": sum(1 for r in pub if r["cited"] == 0),
        "regimes": len({r["parentId"] for r in pub if r["parentId"]}),
        "maxDepth": max((r["depth"] or 0) for r in rows) if rows else 0,
        "families": sum(1 for r in rows if r["tier"] == "family"),
        "byChannel": [],
    }
    per_ch: dict[str, list] = defaultdict(list)
    for r in pub:
        per_ch[r["channel"] or "(none)"].append(r)
    for ch, rs in sorted(per_ch.items(), key=lambda kv: -len(kv[1])):
        summary["byChannel"].append({
            "channel": ch, "n": len(rs),
            "complete": sum(1 for r in rs if r["score"] == len(AXES)),
            "meanScore": round(sum(r["score"] for r in rs) / len(rs), 2),
            **{a: sum(1 for r in rs if r["axes"][a]) for a in AXES},
        })
    return {"summary": summary, "rows": rows}


def to_markdown(data: dict) -> str:
    s = data["summary"]
    n = s["instruments"]
    def pct(x): return f"{100 * x / n:.0f}%"
    out = [
        "# Fund intelligence coverage",
        "",
        f"Generated from the live corpus: **{n} instruments**, latest active "
        f"award year {s['latestYear']}. Regenerate with "
        "`python3 ETL/terms/coverage_report.py --md project-mgmt/coverage.md`.",
        "",
        "Six things an analyst needs before advising on a fund. Each is present "
        "or it is not — \"partly\" is what hides gaps.",
        "",
        "| What we know | Instruments | Share |",
        "|---|---:|---:|",
        f"| Eligibility we can evaluate (2+ filters) | {s['axes']['eligibility']} | {pct(s['axes']['eligibility'])} |",
        f"| What it has actually funded | {s['axes']['funds']} | {pct(s['axes']['funds'])} |",
        f"| Where it applies | {s['axes']['where']} | {pct(s['axes']['where'])} |",
        f"| What it typically awards | {s['axes']['amount']} | {pct(s['axes']['amount'])} |",
        f"| How to approach it | {s['axes']['route']} | {pct(s['axes']['route'])} |",
        f"| Award recency on record | {s['axes']['live']} | {pct(s['axes']['live'])} |",
        f"| **All six** | **{s['complete']}** | **{pct(s['complete'])}** |",
        "",
        "## By channel",
        "",
        "| Channel | n | All six | Mean score | Eligibility | Funds | Amount | Route | Live |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for c in s["byChannel"]:
        out.append(
            f"| {c['channel']} | {c['n']} | {c['complete']} | {c['meanScore']} | "
            f"{c['eligibility']} | {c['funds']} | {c['amount']} | {c['route']} | {c['live']} |")
    out += ["", "Per-instrument detail lives in the coverage dashboard "
            "(coverage.json), which carries every row.", ""]
    return "\n".join(out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json")
    ap.add_argument("--md")
    args = ap.parse_args()
    with connect(readonly=True) as conn:
        data = build(conn)
    s = data["summary"]
    print(f"coverage: {s['instruments']} instruments, {s['complete']} complete on all six axes")
    for a in AXES:
        print(f"  {a:14} {s['axes'][a]:>5}  {100*s['axes'][a]/s['instruments']:5.1f}%")
    if args.json:
        _Path(args.json).write_text(json.dumps(data, ensure_ascii=False))
        print(f"json -> {args.json}")
    if args.md:
        _Path(args.md).write_text(to_markdown(data))
        print(f"md   -> {args.md}")


if __name__ == "__main__":
    main()
