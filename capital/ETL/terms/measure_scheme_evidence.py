"""What per-scheme evidence do the FREE sources still hold, and does it SEPARATE?

Workstream BY. The ranker is exhausted (`findings/signal_remeasure_wsBU.md`:
encoded gates score 1.3 +/-0.4 alone, below a shuffle, 0.0 on exact
attribution). The rules are not wrong, they are INHERITED -- siblings take
their rule set from one regime document, and rules that agree cannot separate.

477 of 1,088 instruments carry no gate with a verbatim quote from a document of
their own; 268 carry 1-4. This script asks, of each field the two FREE sources
already hold, the only question that matters:

    HOW MANY SIBLINGS IS A FOUNDER STILL CHOOSING BETWEEN once this field is
    known, and what share of leaves then fit in five rows?

COVERAGE IS NOT THE METRIC. A field present on every sibling with the same
value separates nothing. The metric is the one `measure_sibling_coverage.ts`
already computes -- residual sibling class and the @5 ceiling -- and the
baseline key here is bit-identical to that script's, so the numbers compose.

Sources measured, cheapest first, both free:
  1. `data/raw/state_aid_cases/cases.json` -- the Commission case register,
     531 SA numbers, joined on `funding_instruments.scheme_code`.
  2. `satr_staging` -- the transparency register's own per-award text, joined
     on (sa_number, granting_authority), which is the SAME pair the child split
     in `populate_funding_instruments.py` is keyed on, so the join is exact
     rather than fuzzy.

Reads Postgres for instruments (source of truth) and local SQLite for the SATR
staging table (a raw extract, not a product store). Writes nothing.

  python3 ETL/terms/measure_scheme_evidence.py
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
from etl_env import DB, ROOT  # noqa: E402

import psycopg2  # noqa: E402
import psycopg2.extras  # noqa: E402

CASES = ROOT / "data" / "raw" / "state_aid_cases" / "cases.json"


def h(v) -> str:
    """Same normalisation `measure_sibling_coverage.ts` uses, so the baseline
    key produced here is the same key and the two scripts' numbers compose."""
    if v is None:
        return ""
    return str(v).strip().lower()[:400]


# ── the metric ────────────────────────────────────────────────────────────
def separation(groups: list[list[dict]], key) -> tuple[float, float, float, float]:
    """(mean residual class, % uniquely identified, @5 ceiling, % field present).

    Mean class is the count of siblings still indistinguishable once this key
    is known. The @5 ceiling is the share of leaves whose residual class fits
    in the five rows the product shows -- a PERFECT chooser's score, which is
    what a corpus field can buy at best.
    """
    sizes: list[int] = []
    present = 0
    for g in groups:
        ks = [key(r) for r in g]
        cnt = Counter(ks)
        for k in ks:
            sizes.append(cnt[k])
            if k.replace("|", "").strip():
                present += 1
    n = len(sizes) or 1
    return (
        sum(sizes) / n,
        100 * sum(1 for s in sizes if s == 1) / n,
        100 * sum(1 for s in sizes if s <= 5) / n,
        100 * present / n,
    )


def report(label: str, groups, key, base=None) -> None:
    mean, uniq, ceil5, pres = separation(groups, key)
    delta = ""
    if base is not None:
        delta = f"   d@5 {ceil5 - base:+.1f}"
    print(f"  {label:<44} class {mean:6.2f}   alone {uniq:5.1f}%"
          f"   @5 {ceil5:5.1f}%   present {pres:5.1f}%{delta}")


def main() -> None:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        sys.exit("DATABASE_URL is required: instruments come from Railway "
                 "Postgres, which is the source of truth, not local SQLite.")

    pg = psycopg2.connect(dsn)
    cur = pg.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT i.id, i.parent_id, i.country, i.name, i.administering_body,
               i.delivery_region, i.eligibility_text, i.scheme_code,
               i.capital_type, i.award_p50, i.sample_project_titles,
               i.description, i.sector_mix, i.scheme_end_date,
               (SELECT count(*) FROM eligibility_gates g
                 WHERE g.instrument_id = i.id
                   AND g.quote IS NOT NULL AND length(g.quote) > 20) own_quoted
          FROM funding_instruments i""")
    rows = [dict(r) for r in cur.fetchall()]
    pg.close()
    print(f"instruments {len(rows)} (Postgres)")

    # PUBLISHABLE=<ids.json> restricts everything below to the rows the product
    # may actually offer. A leaf the founder is never shown is not a leaf the
    # ranker chose, and counting it inflates the class a chooser is credited
    # with ordering. The list comes from `dump_publishable_ids.ts`, which reads
    # the SAME liveness rule the product does -- it is not re-implemented here,
    # because a second definition of "open" would be free to drift from the one
    # that ships.
    pub_path = os.environ.get("PUBLISHABLE")
    if pub_path:
        raw = json.loads(Path(pub_path).read_text())
        ids = raw if isinstance(raw, list) else raw.get("ids") or raw.get("instruments")
        keep = {i if isinstance(i, str) else i.get("id") for i in ids}
        if not keep:
            sys.exit(f"PUBLISHABLE={pub_path} yielded no ids. An empty allow-list "
                     "would silently measure nothing, so this is a hard failure.")
        rows = [r for r in rows if r["id"] in keep]
        print(f"  restricted to PUBLISHABLE: {len(rows)} rows")

    evidence_less = {r["id"] for r in rows if r["own_quoted"] == 0}
    print(f"evidence-less (no gate quoting a document of their own): {len(evidence_less)}")

    # ── source 1: the Commission case register ────────────────────────────
    cases = json.loads(CASES.read_text())
    print(f"case register: {len(cases)} SA numbers in {CASES.relative_to(ROOT)}")

    def one(rec: dict, field: str) -> str:
        v = rec.get(field)
        if not v:
            return ""
        return h(" ; ".join(sorted(str(x) for x in v)))

    case_of: dict[str, dict] = {}
    for r in rows:
        sc = (r["scheme_code"] or "").strip()
        rec = cases.get(sc)          # exact match on `reference`, never fuzzy
        if rec:
            case_of[r["id"]] = rec

    reach_cases = set(case_of) & evidence_less
    print(f"  reaches {len(case_of)} instruments; "
          f"{len(reach_cases)} of the {len(evidence_less)} evidence-less")

    # ── source 2: SATR's own per-scheme text ──────────────────────────────
    # Joined on the SAME (sa_number, granting_authority) pair the SATR child
    # split is keyed on, so a matched row is the leaf's own award history and
    # not a sibling's.
    sq = sqlite3.connect(DB)
    sq.row_factory = sqlite3.Row
    satr_fields = ("aid_measure_title", "objectives_text", "aid_instrument_text",
                   "national_id", "region", "sector_nace", "entrusted_entity",
                   "financial_intermediaries")
    satr: dict[tuple[str, str], dict[str, Counter]] = defaultdict(
        lambda: defaultdict(Counter))
    for s in sq.execute(
            "SELECT sa_number, granting_authority, "
            + ", ".join(satr_fields) + " FROM satr_staging"):
        k = ((s["sa_number"] or "").strip(),
             (s["granting_authority"] or "").strip()[:200])
        if not k[0]:
            continue
        for f in satr_fields:
            if s[f]:
                satr[k][f][str(s[f]).strip()] += 1
    sq.close()
    print(f"satr_staging: {len(satr)} (sa_number, granting_authority) pairs")

    satr_of: dict[str, dict[str, Counter]] = {}
    for r in rows:
        k = ((r["scheme_code"] or "").strip(),
             (r["administering_body"] or "").strip()[:200])
        if k in satr:
            satr_of[r["id"]] = satr[k]
    reach_satr = set(satr_of) & evidence_less
    print(f"  reaches {len(satr_of)} instruments; "
          f"{len(reach_satr)} of the {len(evidence_less)} evidence-less")
    print(f"  either source reaches {len((set(case_of) | set(satr_of)) & evidence_less)}"
          f" of the {len(evidence_less)} evidence-less")

    def satr_key(r: dict, field: str, top: int = 3) -> str:
        c = satr_of.get(r["id"], {}).get(field)
        if not c:
            return ""
        return h(" ; ".join(sorted(v for v, _ in c.most_common(top))))

    def case_key(r: dict, field: str) -> str:
        rec = case_of.get(r["id"])
        return one(rec, field) if rec else ""

    # ── the population: regimes the ranker actually has to order ──────────
    by_regime: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_regime[r["parent_id"] or r["id"]].append(r)
    groups = [g for g in by_regime.values() if len(g) > 1]
    leaves = sum(len(g) for g in groups)
    print(f"\nmulti-leaf regimes {len(groups)}, holding {leaves} leaves")

    base_key = lambda r: (h(r["administering_body"]) + "|" + h(r["delivery_region"])
                          + "|" + h(r["eligibility_text"]))
    base_mean, base_uniq, base_ceil, _ = separation(groups, base_key)
    print(f"\nBASELINE (admin_body | delivery_region | eligibility_text)"
          f"   class {base_mean:.2f}   alone {base_uniq:.1f}%   @5 {base_ceil:.1f}%")

    print("\n-- each field ALONE, and what it adds ON TOP of the baseline --")
    candidates: list[tuple[str, object]] = [
        ("scheme_code (SA number)", lambda r: h(r["scheme_code"])),
    ]
    # The last five are the fields `fetch_state_aid_cases.py` dropped as
    # plumbing and `fetch_case_extra_fields.py` went back for. `caseSectors`
    # is the interesting one -- the only unused register field a FOUNDER can
    # be tested against -- so it is measured rather than argued about.
    for f in ("caseTitle", "caseObjectivesStr", "caseAidInstruments", "caseRegions",
              "caseMeasureEndDate", "caseAidCategory", "caseSimplifiedProcedure",
              "caseInitiationDate", "caseLinks",
              "caseSectors", "casePrimaryLaws", "caseSecondaryLaws",
              "caseMeasureStartDate", "caseNotificationDate"):
        candidates.append((f"case: {f}", (lambda f: lambda r: case_key(r, f))(f)))
    for f in satr_fields:
        candidates.append((f"satr: {f}", (lambda f: lambda r: satr_key(r, f))(f)))
    candidates += [
        ("corpus: sample_project_titles", lambda r: h(r["sample_project_titles"])),
        ("corpus: description", lambda r: h(r["description"])),
        ("corpus: sector_mix", lambda r: h(r["sector_mix"])),
        ("corpus: name", lambda r: h(r["name"])),
    ]

    print("\n[alone]")
    for label, key in candidates:
        report(label, groups, key)
    print("\n[baseline + field]")
    for label, key in candidates:
        report(label, groups, lambda r, k=key: base_key(r) + "|" + k(r), base=base_ceil)

    # ── the stacked answers, which is what a decision needs ───────────────
    print("\n[stacked]")
    stacks = [
        ("baseline + ALL case fields",
         lambda r: base_key(r) + "|" + "|".join(
             case_key(r, f) for f in ("caseTitle", "caseObjectivesStr",
                                      "caseAidInstruments", "caseRegions",
                                      "caseMeasureEndDate"))),
        ("baseline + ALL satr fields",
         lambda r: base_key(r) + "|" + "|".join(satr_key(r, f) for f in satr_fields)),
        ("baseline + case + satr",
         lambda r: base_key(r) + "|" + "|".join(
             [case_key(r, f) for f in ("caseTitle", "caseObjectivesStr",
                                       "caseAidInstruments", "caseRegions",
                                       "caseMeasureEndDate")]
             + [satr_key(r, f) for f in satr_fields])),
        ("EVERYTHING recorded (incl. corpus own-text)",
         lambda r: base_key(r) + "|" + h(r["sample_project_titles"]) + "|"
         + h(r["description"]) + "|" + h(r["sector_mix"]) + "|" + h(r["name"]) + "|"
         + "|".join([case_key(r, f) for f in ("caseTitle", "caseObjectivesStr",
                                              "caseAidInstruments", "caseRegions",
                                              "caseMeasureEndDate")]
                    + [satr_key(r, f) for f in satr_fields])),
    ]
    for label, key in stacks:
        report(label, groups, key, base=base_ceil)

    # ── THE TEST THAT DECIDES IT ─────────────────────────────────────────
    # Both free sources are keyed on the SA number, and the SA number is
    # ALREADY a corpus column -- it is half of the key the SATR child split is
    # built on. So the honest reference is not the baseline, it is the
    # baseline PLUS scheme_code: anything a fetched register field adds over
    # THAT is new information, and anything it does not add is a fact we
    # already hold under a different name.
    ref_key = lambda r: base_key(r) + "|" + h(r["scheme_code"])
    _, _, ref_ceil, _ = separation(groups, ref_key)
    print(f"\n-- ON TOP OF what the corpus already holds "
          f"(baseline + scheme_code, @5 {ref_ceil:.1f}%) --")
    for label, key in candidates:
        if label.startswith(("case:", "satr:")):
            report(label, groups, lambda r, k=key: ref_key(r) + "|" + k(r), base=ref_ceil)

    # Where the residual sits: is it the leaves no SA number reaches?
    no_sa = sum(1 for g in groups for r in g if not (r["scheme_code"] or "").strip())
    stuck_ref: Counter = Counter()
    for g in groups:
        cnt = Counter(ref_key(r) for r in g)
        for r in g:
            if cnt[ref_key(r)] > 5:
                stuck_ref[bool((r["scheme_code"] or "").strip())] += 1
    print(f"\n  leaves with no SA number at all: {no_sa} of {leaves} "
          f"({100 * no_sa / leaves:.1f}%)")
    print(f"  leaves still in a class > 5 at that reference: {sum(stuck_ref.values())}"
          f"  -- carrying an SA number: {stuck_ref[True]}, without one: {stuck_ref[False]}")

    # ── the same question, restricted to the leaves that lack own evidence ─
    ev_groups = []
    for g in groups:
        sub = [r for r in g if r["id"] in evidence_less]
        if len(sub) > 1:
            ev_groups.append(sub)
    ev_leaves = sum(len(g) for g in ev_groups)
    print(f"\n-- restricted to evidence-less siblings only "
          f"({len(ev_groups)} regimes, {ev_leaves} leaves) --")
    ev_mean, _, ev_ceil, _ = separation(ev_groups, base_key)
    print(f"  BASELINE                                     class {ev_mean:6.2f}"
          f"                  @5 {ev_ceil:5.1f}%")
    for label, key in stacks:
        report(label, ev_groups, key, base=ev_ceil)

    # ── where the residual mass sits, so step 3 can be aimed ──────────────
    full = stacks[-1][1]
    stuck: Counter = Counter()
    for g in groups:
        cnt = Counter(full(r) for r in g)
        for r in g:
            if cnt[full(r)] > 5:
                stuck[r["country"] or "??"] += 1
    print("\n-- leaves still in a class LARGER THAN FIVE after every recorded fact --")
    print(f"  {sum(stuck.values())} of {leaves}; by country: "
          + ", ".join(f"{c} {n}" for c, n in stuck.most_common(12)))

    # ── AIMING STEP 3 ────────────────────────────────────────────────────
    # A costed fetch has to name the rows it would buy. Two disjoint
    # populations matter and they need different answers:
    #   (a) evidence-less AND carrying an SA number -- the register reaches
    #       them, and has already given them everything it holds;
    #   (b) evidence-less with NO SA number -- no free source reaches them at
    #       all, so they are the only rows a paid fetch could be the FIRST
    #       evidence for.
    print("\n-- the evidence-less 477, split by whether any free source reaches them --")
    with_sa = [r for r in rows if r["id"] in evidence_less
               and (r["scheme_code"] or "").strip()]
    without_sa = [r for r in rows if r["id"] in evidence_less
                  and not (r["scheme_code"] or "").strip()]
    for label, pop in (("reached by the register (has an SA number)", with_sa),
                       ("NOT reached by any free source", without_sa)):
        by_c = Counter(r["country"] or "??" for r in pop)
        txt = Counter(bool(r["eligibility_text"] and len(r["eligibility_text"]) > 40)
                      for r in pop)
        print(f"  {label}: {len(pop)}")
        print(f"    by country: " + ", ".join(f"{c} {n}" for c, n in by_c.most_common(10)))
        print(f"    already carry eligibility_text > 40 chars: {txt[True]}"
              f"   carry none: {txt[False]}")
    ml = {r["id"] for g in groups for r in g}
    un_ml = [r for r in without_sa if r["id"] in ml]
    print(f"    of the un-reached, sitting in a MULTI-LEAF regime (where a"
          f" discriminator would pay): {len(un_ml)}")
    print("      by country: " + ", ".join(
        f"{c} {n}" for c, n in Counter(r["country"] or "??" for r in un_ml).most_common(10)))

    # The sharpest target a paid fetch could have: the leaves a founder still
    # cannot tell from five or more siblings after every free fact is in.
    print("\n-- THE ACTUAL TARGET: leaves in a class > 5 at baseline + scheme_code --")
    tgt: list[dict] = []
    for g in groups:
        cnt = Counter(ref_key(r) for r in g)
        tgt += [r for r in g if cnt[ref_key(r)] > 5]
    print(f"  {len(tgt)} leaves, by country: " + ", ".join(
        f"{c} {n}" for c, n in Counter(r["country"] or "??" for r in tgt).most_common(10)))
    print("  by regime: " + ", ".join(
        f"{p} {n}" for p, n in Counter(r["parent_id"] or r["id"] for r in tgt).most_common(8)))
    print(f"  of these, already carrying eligibility_text > 40 chars: "
          f"{sum(1 for r in tgt if r['eligibility_text'] and len(r['eligibility_text']) > 40)}")


if __name__ == "__main__":
    main()
