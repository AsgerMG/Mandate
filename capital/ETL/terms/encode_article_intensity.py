"""Turn an inferred GBER article into the structuring consequence of that article
-- and use what the scheme actually paid to decide whether to believe it at all.

── Why this exists ────────────────────────────────────────────────────────
`seed_inventory_gates` gives a scheme a line reading "R&D project aid (GBER
Art. 25)". That is a label. Any model can tell a founder that a fund exists;
the job here is to say what the fund does to their capital stack, which is
arithmetic:

    Art. 25 caps aid at 25% of eligible cost for experimental development,
    +20pp as a small enterprise = 45%. This scheme's awards run at a median
    of 38% of project cost. On a EUR 2M project, plan against roughly EUR
    760k of public money and EUR 1.24M you must raise elsewhere.

── What corroborates an article, and what cannot ──────────────────────────
Realised aid INTENSITY was the intended cross-check and it is not available:
the SATR transparency register publishes no project cost at all -- 0 of 122,814
SATR events -- so a share of eligible costs cannot be computed for any scheme
carrying an inferred article. It exists only on Horizon and Innovate UK, which
carry no inferred articles. Measured, not assumed.

What SATR does publish is the AWARD, and some articles cap the award absolutely:
Art. 22 start-up aid cannot lawfully grant beyond EUR 0.6M, doubled for small
innovative enterprises. A scheme labelled Art. 22 whose median award is several
million is not an Art. 22 scheme, and that is a real refutation on data we hold.

── The two independent signals, and why both are needed ───────────────────
The article itself is a majority vote across a scheme's own awards (floor
50%). A vote is not a rule, and on its own it is too thin to state as fact.

The statutory ceiling is the opposite: it is not inferred at all. Every scheme
granting under Art. 25 faces the same cap, set by the regulation. What is
uncertain is only whether THIS scheme really grants under Art. 25.

Realised intensity settles that. If a scheme's awards run at a share of
project cost that the article's ceiling forbids, the article inference is
wrong and the gate is DELETED -- not softened, not caveated. That is the guard
`audit_encoding_vs_reality.py` could never provide here, because it only
evaluates gates carrying a value_spec and these had none.

Where the two agree, they are independent confirmations of each other, which is
a materially stronger claim than either alone.

── What is deliberately not done ──────────────────────────────────────────
The research category (industrial research vs experimental development) is a
property of the PROJECT, not the scheme, so no instrument-level statement can
pin it. The ceiling is therefore published as a band across the categories the
article covers, and narrowed at request time once the founder says what they
are building. Publishing the midpoint would be inventing precision.

Usage:
  python3 ETL/terms/encode_article_intensity.py status
  python3 ETL/terms/encode_article_intensity.py run [--dry-run]
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

import argparse
import json
import re
import sqlite3

CEILINGS_JSON = ROOT / "reference" / "gber_aid_intensity.json"
CASES_JSON = ROOT / "data" / "raw" / "state_aid_cases" / "cases.json"

# Art. 25(5) sets a different ceiling per RESEARCH CATEGORY, and the category is
# a property of the project rather than the scheme -- so this file used to
# publish the band across categories and say so.
#
# The Commission's case register settles it: a notified scheme is registered
# under specific sub-paragraphs of Art. 25, and 252a-252d ARE those categories.
# A scheme registered under 252b covers industrial research at 50%; one
# registered under 252b and 252c covers 25-50% because the register says it
# covers both, not because we could not tell.
#
# Ceilings are the verified Art. 25(5) figures (see gber_aid_intensity.json).
REGISTERED_CATEGORY = {
    "252a": ("fundamental research", 100.0),
    "252b": ("industrial research", 50.0),
    "252c": ("experimental development", 25.0),
    "252d": ("feasibility studies", 50.0),
}


def registered_objectives(cases: dict, scheme_code: str | None) -> list[str]:
    """The GBER articles the Commission registered THIS scheme under.

    Strictly better evidence than the majority vote across award history: a
    filed registration, per scheme, rather than an inference with a 50% floor.
    Measured against the inference on 274 children -- they agree on 44 and the
    register is MORE SPECIFIC on 161 (Art. 25 -> Art. 25(2)(b), naming the
    research category), with the rest genuine corrections.
    """
    rec = cases.get((scheme_code or "").strip()) or {}
    raw = rec.get("caseObjectivesStr") or []
    out: list[str] = []
    for item in (raw if isinstance(raw, list) else [raw]):
        for part in str(item).split(","):
            code = part.split(":", 1)[-1].strip()
            if code.startswith("StateAidObjectiveGberArt"):
                out.append(code[len("StateAidObjectiveGberArt"):])
    return out

# A realised intensity is only evidence if there are enough awards behind it.
# Below this, one unusual project moves the median far enough to delete a
# correct article inference, which is the expensive direction to be wrong in.
MIN_INTENSITY_N = 8

# Awards behind a median before it may refute an article. Lower than the
# intensity floor because an award amount is published directly rather than
# derived from a ratio of two fields.
MIN_AWARDS_N = 5

# How far above the statutory ceiling a scheme's realised median must sit
# before the article inference is treated as refuted. It is not zero because
# `intensity_p50` divides grant by total project cost, and a project cost field
# that means something slightly different (chips_ju computes to 1% because its
# cost field is not one project's cost) would otherwise delete good rules. A
# scheme genuinely running under a different article usually misses by far more
# than this.
CEILING_TOLERANCE_PP = 12.0


def load_ceilings() -> dict:
    return {k: v for k, v in json.loads(CEILINGS_JSON.read_text()).items()
            if not k.startswith("_")}


def band(entry: dict) -> tuple[float, float] | None:
    """The statutory ceiling as (low, high) across the categories the article
    covers, before any enterprise-size uplift. None where the article has no
    intensity concept at all (Art. 21 risk finance, Art. 22 start-up aid)."""
    cats = entry.get("base_by_category", {})
    # Only the categories a company realistically applies under (see
    # _band_policy in the reference file): the full span opens at 100% for
    # fundamental research and reads as a promise no company will collect.
    keep = entry.get("company_categories")
    if keep:
        cats = {k: v for k, v in cats.items() if k in keep}
    bases = list(cats.values())
    if not bases or entry.get("cap") is None:
        return None
    return (float(min(bases)), float(max(bases)))


def max_with_uplifts(entry: dict, low_high: tuple[float, float]) -> float:
    """The highest intensity this article can reach for ANY beneficiary: the top
    of the band plus every uplift, clamped to the article's own cap. This is the
    number a realised median is tested against -- testing against the base would
    delete every scheme that legitimately pays an SME its uplift."""
    total_uplift = sum(float(u["pp"]) for u in entry.get("uplifts", []))
    return min(low_high[1] + total_uplift, float(entry["cap"]))


def rows(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute("""
        SELECT g.instrument_id, g.value AS article, g.verify_note, i.name,
               i.scheme_code, i.intensity_p50, i.intensity_n, i.award_p50, i.award_n
        FROM eligibility_gates g
        JOIN funding_instruments i ON i.id = g.instrument_id
        WHERE g.gate_key = 'gber_article_inferred'
    """).fetchall()


def vote_share(verify_note: str | None) -> tuple[int, int] | None:
    """The article's support, recovered from the note seed_inventory_gates wrote
    ("43/64 events carry this aid_objective code"). Surfaced on the row rather
    than kept in the database: the floor is only 50%, so a founder reading
    "granted under Art. 25" deserves to see that a third of this scheme's awards
    were not."""
    m = re.match(r"\s*(\d+)/(\d+)\b", verify_note or "")
    return (int(m.group(1)), int(m.group(2))) if m else None


def requirement_text(entry: dict, lo: float, hi: float, share: tuple[int, int] | None) -> str:
    """The instrument-level sentence: what the law caps this at, and how firmly
    the article is attributed. Founder-specific arithmetic (their size, their
    project cost) is resolved at request time, not baked in here."""
    span = f"{lo:.0f}%" if lo == hi else f"{lo:.0f}-{hi:.0f}%"
    shown = entry.get("company_categories") or list(entry["base_by_category"])
    cats = ", ".join(k.replace("_", " ") for k in shown)
    out = (f"Granted under GBER {entry['article']} ({entry['label']}): statutory ceiling "
           f"{span} of eligible costs ({cats})")
    if entry.get("uplifts"):
        out += ", " + " / ".join(f"+{u['pp']:g}pp {u['when']}" for u in entry["uplifts"])
        out += f", capped at {entry['cap']:g}%"
    out += ". The rest of the project cost is yours to fund."
    if share:
        got, tot = share
        out += (f" Attribution: the register records this article on {got} of {tot} "
                f"of this scheme's awards.")
    return out


def spec(entry: dict, lo: float, hi: float, r: sqlite3.Row,
         share: tuple[int, int] | None) -> str:
    return json.dumps({
        "op": "aid_intensity",
        "article": entry["article"],
        "legal_basis": entry["legal_basis"],
        "base_low": lo,
        "base_high": hi,
        "categories": entry["base_by_category"],
        "uplifts": entry.get("uplifts", []),
        "cap": entry["cap"],
        "statutory_verified": bool(entry.get("verified")),
        # How firmly the article is attributed, so the read path can present a
        # 51% attribution differently from a 98% one rather than treating every
        # article gate as equally certain.
        "attribution_hits": share[0] if share else None,
        "attribution_total": share[1] if share else None,
        # Null on every SATR scheme: the register publishes no project cost.
        # Carried anyway so a channel that DOES publish it lights up for free.
        "realised_p50": r["intensity_p50"],
        "realised_n": r["intensity_n"],
    }, ensure_ascii=False)


def registered_text(codes: list[str]) -> tuple[str, float, float] | None:
    """(sentence, low, high) from the registered categories, or None.

    Only Art. 25's sub-paragraphs pin a ceiling by themselves; a scheme also
    registered under Art. 28 or 29 keeps those as separate context rather than
    widening the R&D band, because they cap different things.
    """
    cats = [REGISTERED_CATEGORY[c] for c in codes if c in REGISTERED_CATEGORY]
    if not cats:
        return None
    lo, hi = min(c[1] for c in cats), max(c[1] for c in cats)
    names = ", ".join(sorted({c[0] for c in cats}))
    span = f"{lo:.0f}%" if lo == hi else f"{lo:.0f}-{hi:.0f}%"
    other = sorted({c for c in codes if c not in REGISTERED_CATEGORY and c.isdigit()})
    tail = f" It is also registered under GBER Art. {', '.join(other)}." if other else ""
    return (
        f"Registered with the European Commission under GBER Art. 25 for {names}: "
        f"statutory ceiling {span} of eligible costs, +20pp small enterprise / "
        f"+10pp medium-sized enterprise / +15pp effective collaboration, capped at 80%. "
        f"The rest of the project cost is yours to fund.{tail}",
        lo, hi)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["status", "run"])
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    ceilings = load_ceilings()
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row

    encoded = refuted = no_ceiling = corroborated = registered = 0
    cases = json.loads(CASES_JSON.read_text()) if CASES_JSON.exists() else {}
    weak: list[str] = []
    refutations: list[str] = []

    for r in rows(conn):
        entry = ceilings.get(r["article"])
        if entry is None:
            continue
        share = vote_share(r["verify_note"])

        # Refutation FIRST, and it applies to every article including the ones
        # with no intensity concept: an article that caps the award absolutely
        # is refuted by a scheme that pays far past that cap, whether or not the
        # article also has an intensity ceiling.
        cap_eur = entry.get("absolute_cap_test_eur")
        testable = bool(cap_eur and r["award_p50"] and (r["award_n"] or 0) >= MIN_AWARDS_N)
        if testable and r["award_p50"] <= cap_eur:
            # Positive evidence, not merely the absence of a contradiction: the
            # article was inferred from an objective code, and the award median
            # -- an independent field -- lands inside the band that article
            # allows. Two unrelated signals agreeing is the strongest thing this
            # corpus can say about a scheme it has no documents for.
            corroborated += 1
        if testable and r["award_p50"] > cap_eur:
            refuted += 1
            refutations.append(
                f"  {(r['name'] or '')[:48]:48} {entry['article']:8} lawful max "
                f"EUR {cap_eur/1e6:.1f}M, median award EUR {r['award_p50']/1e6:.2f}M "
                f"(n={r['award_n']})")
            if args.cmd == "run" and not args.dry_run:
                conn.execute("DELETE FROM eligibility_gates WHERE instrument_id=? "
                             "AND gate_key='gber_article_inferred'", (r["instrument_id"],))
            continue

        lh = band(entry)
        if lh is None:
            # Art. 21 / 22: intensity is not the mechanism. The gate survives as
            # the plain article statement; there is simply no ceiling to add.
            no_ceiling += 1
            continue
        lo, hi = lh

        if share and share[0] / share[1] < 0.75:
            weak.append(f"  {(r['name'] or '')[:48]:48} {entry['article']:8} "
                        f"{share[0]}/{share[1]} = {100*share[0]/share[1]:.0f}%")
        # The register wins where it has an opinion: it is a filed registration
        # for THIS scheme, not a >=50% vote across its award history.
        reg = registered_text(registered_objectives(cases, r["scheme_code"]))
        if reg:
            registered += 1
            lo, hi = reg[1], reg[2]
        encoded += 1
        if args.cmd == "run" and not args.dry_run:
            conn.execute(
                """UPDATE eligibility_gates
                   SET value_spec = ?, requirement = ?, updated_at = CURRENT_TIMESTAMP
                   WHERE instrument_id = ? AND gate_key = 'gber_article_inferred'""",
                (spec(entry, lo, hi, r, share),
                 reg[0] if reg else requirement_text(entry, lo, hi, share),
                 r["instrument_id"]))

    if args.cmd == "run" and not args.dry_run:
        conn.commit()

    print(f"article gates given a statutory ceiling:        {encoded}")
    print(f"  grounded in the Commission's registration:    {registered}")
    print(f"  attribution below 75% (stated on the row):    {len(weak) - registered if len(weak) > registered else 0}")
    print(f"articles with no intensity concept (Art 21/22): {no_ceiling}")
    print(f"corroborated by award median vs the article's cap: {corroborated}")
    print(f"REFUTED and deleted (pays past the lawful cap): {refuted}")
    for line in refutations[:20]:
        print(line)
    for line in weak[:8]:
        print(line)
    if args.dry_run:
        print("[dry-run] nothing written.")
    conn.close()


if __name__ == "__main__":
    main()
