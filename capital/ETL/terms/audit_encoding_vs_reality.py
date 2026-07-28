"""Audit the encoded eligibility rules against who ACTUALLY received the money.

The idea (user's, 2026-07-26): comparable companies are not only motivation for
a founder -- they are a test of our own work. If our rules say a 20-person
German company qualifies for a fund and fifty such companies visibly drew on
it, the encoding is corroborated. If our rules would have EXCLUDED companies
that demonstrably won the award, we encoded something wrong.

A contradiction is not automatically a bug in the rule; an instrument may be
one sub-track of a wider programme whose events we group together. But a rule
contradicted by most of its own recipients is not safe to gate a verdict on,
and that is exactly what this surfaces.

-- Why this is the highest-leverage precision work available -----------------
Measured 2026-07-27: 25 of 4,018 gates are independently assertable
(`llm_2pass` / `human_verified`). Everything else is a model assertion nobody
has checked. This script is the ONLY mechanism that tests encoded rules against
external evidence, it costs nothing per rule, and it gets stronger as the
corpus grows.

It used to check ONE dimension (country), covering 71 of 586 encoded filters.
Each probe below widens that. Adding a dimension is deliberately cheap: give it
a way to read the recipients' real values and a way to normalise a spec value.

Usage: python3 ETL/terms/audit_encoding_vs_reality.py [--min-events 10]
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB  # noqa: E402
# --- end ETL path bootstrap ---

import argparse
import json
import re
import sqlite3
from collections import Counter
from pathlib import Path as _Path

# Full English name -> ISO2, for the countries our encoded rules actually use.
# Encoded specs speak full names (the intake picker's vocabulary); the events
# corpus speaks ISO2.
# Resolved by the canonical map rather than a fifth copy. Encoded specs speak
# full names (the intake picker's vocabulary); the events corpus speaks ISO2.
_ETL_LIB = _Path(__file__).resolve().parents[1] / "lib"
if str(_ETL_LIB) not in _sys.path:
    _sys.path.insert(0, str(_ETL_LIB))
from europe_scope import name_to_iso2  # noqa: E402

# NACE descriptor -> ACTIVITY_OPTIONS value. The register publishes each
# recipient's activity as free text on the event (sector_tags_raw, 276k rows),
# and the activities vocabulary was chosen to mirror the categories aid law
# names -- so the two line up almost directly. Most-specific first.
#
# Deliberately conservative: a descriptor that does not clearly match stays
# unmapped rather than being forced into a bucket. An audit that guesses is
# worse than one that abstains, because it manufactures contradictions.
NACE_TO_ACTIVITY: list[tuple[str, str]] = [
    (r"tobacco", "tobacco"),
    (r"gambling|betting", "gambling_betting"),
    (r"weapons?|ammunition|military fighting vehicles", "weapons"),
    (r"real estate", "real_estate"),
    (r"freight transport by road|road freight", "road_freight"),
    # NACE Section A is published as one line, "AGRICULTURE, FORESTRY AND
    # FISHING", so it must be read before the bare fishing pattern or the whole
    # section lands in the fisheries bucket. Agriculture is the head noun and
    # the larger population; both are excluded categories either way, so this
    # changes the label rather than the verdict.
    (r"agriculture, forestry and fishing", "primary_agriculture"),
    (r"crop and animal production|growing of |raising of |agricultural|farming",
     "primary_agriculture"),
    (r"fishing|aquaculture", "fisheries_aquaculture"),
    (r"financial service|insurance|monetary intermediation|banking|fund management"
     r"|credit granting", "financial_services"),
    (r"distilling|brewing|wine|malt liquors|beverages", "alcohol"),
]


def activities_of(descriptors: list[str]) -> Counter:
    """Which regulated activities the recipients of an instrument actually do."""
    out: Counter = Counter()
    for d in descriptors:
        low = d.lower()
        for pattern, activity in NACE_TO_ACTIVITY:
            if re.search(pattern, low):
                out[activity] += 1
                break
    return out


def recipients_country(conn: sqlite3.Connection, iid: str) -> Counter:
    return Counter({cc: n for cc, n in conn.execute(
        """SELECT c.country, COUNT(DISTINCT c.id)
             FROM public_funding_events e
             JOIN funding_instrument_sources fis ON fis.source = e.source
             JOIN companies c ON c.id = e.company_id
            WHERE fis.instrument_id = ? AND e.is_duplicate = 0
              AND c.country IS NOT NULL AND c.country <> ''
            GROUP BY 1""", (iid,))})


def recipients_sector(conn: sqlite3.Connection, iid: str) -> Counter:
    """Recipients' sector_top. Only possible since intake and the corpus were
    put on ONE sector vocabulary (2026-07-27): before that the two spoke
    different strings, so sector rules were entirely unverifiable."""
    return Counter({s: n for s, n in conn.execute(
        """SELECT c.sector_top, COUNT(DISTINCT c.id)
             FROM public_funding_events e
             JOIN funding_instrument_sources fis ON fis.source = e.source
             JOIN companies c ON c.id = e.company_id
            WHERE fis.instrument_id = ? AND e.is_duplicate = 0
              AND c.sector_top IS NOT NULL AND c.sector_top <> ''
            GROUP BY 1""", (iid,))})


# The ticket bands, in order, with their upper bounds in EUR. Mirrors
# TICKET_BANDS in types.ts via data/vocabularies.json -- the boundaries are
# read there so this cannot drift from what the intake offers.
_VOCAB = json.loads((_Path(__file__).resolve().parents[2] / "data" / "vocabularies.json").read_text())
TICKET_ORDER: list[str] = _VOCAB["bandOrders"]["ticketBand"]
TICKET_UPPER = {
    "lt500k": 500_000, "b500k_2m5": 2_500_000, "b2m5_15m": 15_000_000,
    "b15m_50m": 50_000_000, "gt50m": float("inf"),
}


def band_of_award(eur: float) -> str:
    for band in TICKET_ORDER:
        if eur <= TICKET_UPPER[band]:
            return band
    return TICKET_ORDER[-1]


def recipients_ticket(conn: sqlite3.Connection, iid: str) -> Counter:
    """What this instrument ACTUALLY funds, bucketed into the intake's bands.

    Counts an event under BOTH its grant amount and its total project cost,
    because a size rule can mean either and the text rarely disambiguates:
    "the project must present a total cost of between EUR 1 million and EUR 5
    million" is a PROJECT COST floor, while "grant support ranges from NOK 4m
    to NOK 20m" is a GRANT floor. Comparing project-cost rules against grant
    cheques flagged four correct Bpifrance, NFR and SATR-IT rules as
    contradicted -- a project costing EUR 1m at 30% aid intensity draws a
    EUR 300k grant, which is not a contradiction, it is arithmetic.

    Counting both means a spec is only contradicted when NEITHER reading
    supports it. Deliberately generous: this probe can quarantine a rule, so a
    false positive here deletes a correct rule and hides a real fund."""
    out: Counter = Counter()
    for grant, cost in conn.execute(
        """SELECT e.grant_amount_eur, e.total_project_cost_eur
             FROM public_funding_events e
             JOIN funding_instrument_sources fis ON fis.source = e.source
            WHERE fis.instrument_id = ? AND e.is_duplicate = 0""", (iid,)):
        seen = set()
        for eur in (grant, cost):
            if eur and eur > 0:
                seen.add(band_of_award(eur))
        for band in seen:
            out[band] += 1
    return out


def recipients_activity(conn: sqlite3.Connection, iid: str) -> Counter:
    descriptors = [r[0] for r in conn.execute(
        """SELECT e.sector_tags_raw
             FROM public_funding_events e
             JOIN funding_instrument_sources fis ON fis.source = e.source
            WHERE fis.instrument_id = ? AND e.is_duplicate = 0
              AND e.sector_tags_raw IS NOT NULL""", (iid,))]
    return activities_of(descriptors)


# field -> (read reality, normalise a spec value, weak?)
# `weak` marks probes where agreement is cheap: almost no recipient of anything
# is a tobacco company, so `not_in [tobacco]` agrees trivially. Those are still
# reported -- a contradiction there is strong evidence -- but counted separately
# so they cannot inflate the headline rate.
PROBES = {
    "entityCountries": (recipients_country,
                        lambda v: name_to_iso2(v), False),
    # Where the WORK happens rather than where the entity sits. We hold only
    # the recipient's country, so this is the same evidence read against a
    # different claim -- weaker, because a company can legitimately run a
    # project abroad, but a rule contradicted by every recipient still counts.
    "activityCountries": (recipients_country,
                          lambda v: name_to_iso2(v), True),
    "sector": (recipients_sector, lambda v: v.strip(), False),
    "ticketBand": (recipients_ticket, lambda v: v.strip(), False),
    "activities": (recipients_activity, lambda v: v.strip(), True),
}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--min-events", type=int, default=10,
                    help="ignore instruments with fewer classified recipients than this")
    ap.add_argument("--quarantine", action="store_true",
                    help="stop contradicted rules from gating verdicts (writes to the DB)")
    ap.add_argument("--threshold", type=float, default=0.5,
                    help="quarantine specs whose own recipients agree less than this")
    args = ap.parse_args()

    conn = sqlite3.connect(DB)
    rows = conn.execute(
        """SELECT g.id, g.instrument_id, fi.name, g.value_spec, g.requirement
           FROM eligibility_gates g JOIN funding_instruments fi ON fi.id = g.instrument_id
           WHERE g.value_spec IS NOT NULL AND g.gate_role = 'filter'"""
    ).fetchall()

    stats: dict[str, Counter] = {f: Counter() for f in PROBES}
    unchecked = 0
    problems: list[tuple[float, str]] = []
    quarantine: list[tuple[int, str, str, float, int]] = []
    cache: dict[tuple[str, str], Counter] = {}

    for _gid, iid, name, spec_json, requirement in rows:
        spec = json.loads(spec_json)
        field = spec.get("field")
        probe = PROBES.get(field)
        op = spec.get("op")
        if not probe or op not in ("in", "not_in", "band_max", "band_min"):
            unchecked += 1
            continue
        read, normalise, weak = probe

        # Banded specs name a CEILING or FLOOR, not a set, so the allowed set is
        # derived from the band order rather than read off the spec.
        if op in ("band_max", "band_min"):
            order = spec.get("order") or []
            target = spec.get("maxAllowed") if op == "band_max" else spec.get("minAllowed")
            if target not in order:
                unchecked += 1
                continue
            i = order.index(target)
            wanted = set(order[: i + 1] if op == "band_max" else order[i:])
        else:
            wanted = {normalise(v) for v in spec.get("allowed", [])}
            wanted.discard(None)
            wanted.discard("")
        if not wanted:
            unchecked += 1
            continue

        key = (field, iid)
        if key not in cache:
            cache[key] = read(conn, iid)
        actual = cache[key]
        total = sum(actual.values())
        if total < args.min_events:
            unchecked += 1
            continue

        # band_max/band_min are inclusive membership of the derived set, so
        # they compare like `in`; only not_in inverts.
        if op == "not_in":
            ok = sum(n for v, n in actual.items() if v not in wanted)
        else:
            ok = sum(n for v, n in actual.items() if v in wanted)
        share = ok / total
        bucket = ("weak_ok" if (weak and share >= 0.8)
                  else "corroborated" if share >= 0.8 else "contradicted")
        stats[field][bucket] += 1
        if share < args.threshold:
            quarantine.append((_gid, field, name, share, total))
        if share < 0.8:
            top = ", ".join(f"{v}:{n}" for v, n in actual.most_common(4))
            problems.append((share, f"  [{share:5.0%} agree] {field} - {name} ({iid})\n"
                                    f"      rule: {' '.join(requirement.split())[:86]}\n"
                                    f"      spec: {spec['op']} {sorted(wanted)}\n"
                                    f"      actual recipients: {top}  (n={total})"))

    print(f"encoded filters:            {len(rows):,}")
    print(f"  not checkable:            {unchecked:,}   "
          f"(no probe for the field, or under {args.min_events} classified recipients)")
    print()
    print(f"  {'dimension':16} {'checked':>8} {'corroborated':>13} {'contradicted':>13}")
    strong_ok = strong_total = 0
    for field, c in stats.items():
        checked = c["corroborated"] + c["contradicted"] + c["weak_ok"]
        if not checked:
            continue
        ok = c["corroborated"] + c["weak_ok"]
        suffix = "  (weak: agreement is cheap)" if PROBES[field][2] else ""
        print(f"  {field:16} {checked:8} {ok:13} {c['contradicted']:13}{suffix}")
        if not PROBES[field][2]:
            strong_ok += c["corroborated"]
            strong_total += checked
    if strong_total:
        print(f"\n  corroboration rate on strong probes: "
              f"{100*strong_ok/strong_total:.0f}%  ({strong_ok}/{strong_total})")
    if problems:
        print("\n=== rules their own recipients contradict (worst first) ===")
        for _, text in sorted(problems)[:20]:
            print(text)

    # A rule most of its own recipients contradict is not evidence, it is
    # noise, and leaving it in place means it silently hides funds from
    # founders who qualify. satr_de_equity is the Rentenbank AGRICULTURAL
    # vehicle carrying generic GBER Article 1 boilerplate that excludes
    # agriculture -- it would have blocked exactly the companies it funds.
    #
    # Quarantining clears the spec and marks the gate so `encode --fresh` will
    # not simply re-derive it. The requirement text stays: we lose the machine
    # verdict, not the record of what the document says.
    if quarantine:
        if args.quarantine:
            for gid, field, name, share, total in quarantine:
                conn.execute(
                    """UPDATE eligibility_gates
                          SET value_spec = NULL, encoding_method = 'quarantined',
                              verify_note = COALESCE(verify_note || ' | ', '')
                                || 'quarantined ' || ?
                                || ': only ' || ? || '% of ' || ?
                                || ' recipients agree'
                        WHERE id = ?""",
                    (field, round(share * 100), total, gid))
            conn.commit()
            print(f"\nquarantined {len(quarantine)} specs contradicted by their own recipients")
        else:
            print(f"\n{len(quarantine)} specs are below the {args.threshold:.0%} agreement "
                  f"threshold — re-run with --quarantine to stop them gating verdicts")
    conn.close()


if __name__ == "__main__":
    main()
