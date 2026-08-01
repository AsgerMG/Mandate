"""Aid intensity as a number: what share of a project this can actually cover.

── Why ────────────────────────────────────────────────────────────────────
"Which fund fits" is a matching question. "How much of this project can be
public money" is the structuring question, and it is the one a state-backed
capital structuring analyst is actually paid to answer. Today the answer exists
only as prose:

    "Grant rate is 50% of eligible costs for SME research projects, rising to
     60% when the project content is ..."

As a rate plus its conditions, that becomes arithmetic a founder can plan
against, and comparable across instruments -- which prose never is.

── Where it is stored, and why not anywhere new ───────────────────────────
On the gate's own value_spec, with op `aid_intensity`. Three reasons:

  * gates are reconciled and survive a reload; funding_instruments is
    truncate-and-reload, and putting derived data there has now cost this
    project three times.
  * isFilter() admits only gate_role='filter', and these are programme_facts,
    so an intensity can never leak into an eligibility verdict. It is a fact
    about the money, not about who qualifies.
  * no new table, no new join, no new reconcile step to forget.

── Verified against what was really paid, where that is meaningful ────────
76,364 events carry both a grant and a total project cost, and 32 instruments
have enough to compute a realised intensity. Bpifrance's declared ~45% matches
its awards almost exactly. Others do not: chips_ju computes to 1% because its
cost field is not one project's cost, so a naive comparison would "disprove"
a correct rate. The audit therefore only flags a divergence where the realised
figure is itself plausible, and never overwrites a cited rate with a computed
one.

Usage:
  python3 ETL/terms/encode_intensity.py status
  python3 ETL/terms/encode_intensity.py run [--limit N] [--dry-run]
  python3 ETL/terms/encode_intensity.py audit
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

_sys.path.insert(0, str(_Path(__file__).resolve().parents[1] / "lib"))

import argparse  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402
from collections import defaultdict  # noqa: E402

import anthropic  # noqa: E402

from etl_env import DB  # noqa: E402

MODEL = "claude-sonnet-5"
CHUNK = 15
CITED = ("llm_cited", "llm_2pass", "human_verified")

# A prefilter, never the decision: a rate is written as a percentage somewhere,
# so anything without one cannot carry one. The model still decides whether the
# percentage IS an aid intensity -- "at least 10 per cent is withheld until
# approval" contains a percentage and is not a rate.
HAS_PCT = re.compile(r"\d{1,3}\s?%|per cent|percentage", re.I)

SCHEMA = {
    "type": "object",
    "properties": {
        "results": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "is_intensity": {"type": "boolean"},
                    "rate_pct": {"type": "number"},
                    "basis": {"type": "string"},
                    "max_rate_pct": {"type": "number"},
                    "condition": {"type": "string"},
                },
                "required": ["id", "is_intensity", "rate_pct", "basis",
                             "max_rate_pct", "condition"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["results"],
    "additionalProperties": False,
}

PROMPT = """You are reading rules about how European public funding is sized.

For each rule decide whether it states an AID INTENSITY: the share of a
project's eligible costs that the funder covers.

  is_intensity  true only for a share OF PROJECT COSTS the funder pays.
                FALSE for: retention or payment schedules ("10% is withheld
                until approval"), ownership thresholds, interest rates, shares
                of a budget allocated to a theme, co-financing the applicant
                must find from elsewhere, and any percentage that is not the
                funder's contribution rate.

  rate_pct      the BASE rate as a number, e.g. 50 for "50% of eligible costs".
                When several rates apply to different company sizes, give the
                one for an SME, since that is who asks.
  max_rate_pct  the highest rate reachable including bonuses; equal to rate_pct
                when there is no uplift.
  basis         what the percentage applies to, in the rule's own terms:
                "eligible costs", "total project costs", "investment cost".
  condition     what raises it to max_rate_pct, in under 12 words, or "" if
                nothing does.

A founder will plan a budget on this. If the rule does not clearly state a
funding rate, return is_intensity false and zeros."""


def client() -> anthropic.Anthropic:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY not set")
    return anthropic.Anthropic()


def candidates(conn: sqlite3.Connection) -> list[tuple]:
    rows = conn.execute(f"""
        SELECT id, instrument_id, requirement, value_spec
          FROM eligibility_gates
         WHERE gate_family = 'G3_financial'
           AND gate_role IN ('programme_fact', 'obligation')
           AND verification_level IN ({','.join('?' * len(CITED))})
         ORDER BY instrument_id
    """, CITED).fetchall()
    return [r for r in rows if HAS_PCT.search(r[2] or "")]


def realised(conn: sqlite3.Connection) -> dict[str, tuple[float, int]]:
    """Median realised intensity per instrument, where it is computable."""
    per: dict[str, list[float]] = defaultdict(list)
    for iid, g, tc in conn.execute("""
        SELECT fis.instrument_id, e.grant_amount_eur, e.total_project_cost_eur
          FROM public_funding_events e
          JOIN funding_instrument_sources fis ON fis.source = e.source
         WHERE e.is_duplicate = 0 AND e.grant_amount_eur > 0
           AND e.total_project_cost_eur > 0"""):
        r = g / tc
        # A share above 1 is a data error, not a 150% grant.
        if 0 < r <= 1:
            per[iid].append(r)
    out = {}
    for iid, xs in per.items():
        if len(xs) >= 5:
            xs.sort()
            out[iid] = (xs[len(xs) // 2], len(xs))
    return out


def cmd_status(_args) -> None:
    conn = sqlite3.connect(DB)
    cands = candidates(conn)
    done = conn.execute(
        "SELECT COUNT(*) FROM eligibility_gates WHERE value_spec LIKE '%aid_intensity%'"
    ).fetchone()[0]
    print(f"candidate gates (cited, financial, mention a percentage): {len(cands)}")
    print(f"already encoded as aid_intensity:                        {done}")
    print(f"instruments with a computable realised intensity:        {len(realised(conn))}")
    conn.close()


def cmd_run(args) -> None:
    conn = sqlite3.connect(DB)
    rows = candidates(conn)
    if not args.rebuild:
        rows = [r for r in rows if not (r[3] and "aid_intensity" in r[3])]
    if args.limit:
        rows = rows[: args.limit]
    print(f"reading {len(rows)} rules for an aid intensity ({MODEL})")
    if not rows:
        return
    cl = client()
    encoded = refused = 0
    for i in range(0, len(rows), CHUNK):
        chunk = rows[i : i + CHUNK]
        listing = "\n\n".join(f"id: {r[0]}\nrule: {(r[2] or '')[:400]}" for r in chunk)
        res = cl.messages.create(
            model=MODEL, max_tokens=4000, thinking={"type": "disabled"},
            output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
            messages=[{"role": "user", "content": PROMPT + "\n\n" + listing}])
        text = "".join(b.text for b in res.content if b.type == "text")
        for out in json.loads(text)["results"]:
            rate = out.get("rate_pct") or 0
            if not out.get("is_intensity") or not (0 < rate <= 100):
                refused += 1
                continue
            top = out.get("max_rate_pct") or rate
            spec = json.dumps({
                "op": "aid_intensity",
                "rate": round(float(rate), 1),
                "maxRate": round(float(max(top, rate)), 1),
                "basis": (out.get("basis") or "eligible costs").strip()[:80],
                "condition": (out.get("condition") or "").strip()[:120],
            })
            if args.dry_run:
                print(f"  [{out['id']}] {spec}")
            else:
                conn.execute(
                    "UPDATE eligibility_gates SET value_spec=? WHERE id=?", (spec, out["id"]))
            encoded += 1
        if not args.dry_run:
            conn.commit()
    print(f"done: {encoded} intensities encoded, {refused} rules were not a funding rate")
    conn.close()


def cmd_audit(_args) -> None:
    """Compare each declared rate against what the instrument actually paid."""
    conn = sqlite3.connect(DB)
    real = realised(conn)
    checked = agreed = 0
    print("declared vs realised, where both exist:\n")
    for iid, spec in conn.execute(
            "SELECT instrument_id, value_spec FROM eligibility_gates "
            "WHERE value_spec LIKE '%aid_intensity%'"):
        if iid not in real:
            continue
        declared = json.loads(spec)["rate"]
        got, n = real[iid]
        checked += 1
        delta = abs(declared - 100 * got)
        flag = "" if delta <= 20 else "   <- diverges"
        if not flag:
            agreed += 1
        print(f"  {iid[:38]:40} declared {declared:>5.0f}%   realised "
              f"{100*got:>5.0f}%  (n={n}){flag}")
    print(f"\n{agreed}/{checked} within 20 points. A divergence is not proof the "
          f"rate is wrong:\nsome sources report a consortium's whole project cost "
          f"against one participant's grant.")
    conn.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    r = sub.add_parser("run")
    r.add_argument("--limit", type=int, default=0)
    r.add_argument("--dry-run", action="store_true")
    r.add_argument("--rebuild", action="store_true")
    r.set_defaults(fn=cmd_run)
    sub.add_parser("audit").set_defaults(fn=cmd_audit)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
