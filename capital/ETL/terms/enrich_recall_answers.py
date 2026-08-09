"""Give every replayed founder their OWN intake answers, leak-free.

── The defect this exists to remove ───────────────────────────────────────
`measure_recall.ts` replays a real award as if the company were filling in the
intake, and until now it handed EVERY replayed founder the same answers:

    activities ["none"] · borrowerModel "operating" · ticketBand "b500k_2m5"
    consortium "yes" · useOfFunds [industrial_research, experimental_development]
    capitalSought ["grant", "loan"]

Only country, sector and the description varied. That is fine for measuring
retrieval, and fatal for measuring any DISCRIMINATOR: a signal whose whole job
is to tell two founders apart cannot show an effect on a population that is
described identically. Two conclusions already rest on that flaw --

    "gates are useless for ranking"   won fund 62% pass vs pool 63%
    "ticket fit changes nothing"      every replay got one ticketBand

-- and neither is safe. The first is what this file exists to re-test.

── The rule ───────────────────────────────────────────────────────────────
An answer may be derived from the register only if it CANNOT have been read off
the award being predicted. Same standard, and the same two provenances, that
`repair_recall_attribution.py` established for the region field:

    other_scheme   derived from this company's awards under a DIFFERENT
                   notified scheme. Cannot be circular.
    own_award      derived from every award including the won one. Reported
                   separately, never mixed into a headline that claims to be
                   leak-free.

Rows with neither keep the constant, and the harness says how many did, because
a derived answer available for a third of founders is a different measurement
from one available for all of them.

── What is derived, and why only these ────────────────────────────────────
Only facts the register states about the COMPANY and a real founder would know
about themselves without being told:

    ticketBand    the median award this company has actually received. A
                  founder knows the size of cheque they are asking for. STILL
                  IN USE: measured to cost the candidate pool exactly zero
                  (234 against 234 on the same 250 pairs) and to gain exact
                  recall, which is what a non-circular discriminator looks
                  like. Ticket size reaches no filter -- `channelServesBand`
                  was retired and deleted -- so it can only reorder.
    capitalSought the kinds of capital it has actually taken.

── capitalSought is DISQUALIFIED as an answer (workstream AR) ──────────────
It is still derived, and still written, so the finding stays reproducible under
`ANSWERS=capital`. It is no longer supplied by `ANSWERS=real`. It cost the
candidate pool four points on every seed, and on the full holdout population
two thirds of that loss is this derivation being wrong rather than the filter:

  - It has the circularity `useOfFunds` was excluded for. `capital_kind` reads
    `satr_staging.aid_instrument_text`; `funding_instruments.capital_type` is
    derived from the SAME column one hop away. The answer and the thing it is
    matched against come from one field, and `ANSWERS=capital` duly raises
    EXACT@5 while cutting the pool -- the signature of a self-grading signal.
  - The `other_scheme` guard makes it worse, not better. Excluding the won
    scheme does not make the answer NEUTRAL about the won fund, it makes it
    ANTI-CORRELATED: any kind of capital a company took only from the fund it
    won is guaranteed absent from its derived answer, which guarantees the
    filter removes exactly the fund the pair exists to find. Leak-proofing that
    produces a negative leak.
  - A tax credit is not a preference. A company that claimed an R&D credit is
    derived as "wants tax credits" and thereby cut off from every grant
    programme in Europe. That is most of Germany's loss.
  - Receipts are not intent. The intake asks what capital a founder WANTS;
    1,419 of the 1,890 derivable rows collapse to ["grant"] alone, where the
    constant was ["grant","loan"]. The narrowing is the whole effect.

See project-mgmt/findings/workstream_ar_capital_filter.md. Reviving it needs a
derivation of INTENT rather than of receipts, and one that does not read the
column the corpus labels funds from.

`useOfFunds` is deliberately NOT derived. It would come from the register's
`objectives_text`, which is a statement about the SCHEME rather than about the
company, and `objectiveScorer` ranks on exactly that field -- deriving it would
let the objective signal grade itself, which is the shape of the project-title
leak that read 90% recall and was really 10%. `consortium` and `borrowerModel`
are not in the register at all and stay constant rather than being invented.

Usage:
  python3 ETL/terms/enrich_recall_answers.py                 # report only
  python3 ETL/terms/enrich_recall_answers.py --write
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
import collections  # noqa: E402
import json  # noqa: E402
import sqlite3  # noqa: E402
import statistics  # noqa: E402

INTEL = ROOT / "website" / "frontend" / "lib" / "intelligence"
DEFAULT_FROM = "__recallSetComposed.json"

# The intake's own ticket bands, read from the vocabulary contract rather than
# restated. This file decides which band every graded founder is recorded as
# having asked for, so a copy here that lagged a rebanding would grade the new
# scale against answers derived on the old one.
from ticket_bands import band_of_eur as ticket_band  # noqa: E402,F401


# The register's aid-instrument text -> the intake's capitalSought option.
#
# A PROPERTY, not a register of the strings seen today: matched on what the
# instrument DOES to the recipient's balance sheet, which is the same thing
# CAPITAL_SOUGHT_TO_DB keys on. New wording from a country we have not loaded
# lands in `unclassified` and is REPORTED, never silently dropped -- an
# unmatched instrument text is a gap in this table, and a table that swallows
# them would hide its own decay. `test_capital_kind` pins the property.
def capital_kind(text: str) -> str | None:
    t = (text or "").lower()
    if not t:
        return None
    # Order matters where a text names two things: "grant/ interest rate
    # subsidy" is money that is not repaid, and that is what decides it.
    if "grant" in t or "subsid" in t:
        return "grant"
    if "risk finance" in t or "risk capital" in t or "equity" in t or "capital injection" in t:
        return "equity"
    # Guarantees and counter-guarantees sit under `loan` in CAPITAL_SOUGHT_TO_DB
    # because they are debt the founder must still service.
    if "loan" in t or "advance" in t or "guarantee" in t or "credit" in t:
        return "loan"
    if "tax" in t:
        return "tax_credit"
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--from", dest="src", default=DEFAULT_FROM)
    args = ap.parse_args()

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row

    inst = {r["id"]: r for r in conn.execute(
        "SELECT id, parent_id, scheme_code FROM funding_instruments")}
    company: dict[str, int] = {}
    for r in conn.execute("SELECT id, canonical_name FROM companies"):
        company.setdefault(r["canonical_name"], r["id"])

    # company -> scheme -> [amounts], and company -> scheme -> {capital kinds}.
    # Keyed by scheme so the won scheme can be excluded per row rather than per
    # company: the same company appears in the set under several awards.
    amounts: dict[int, dict[str, list[float]]] = collections.defaultdict(
        lambda: collections.defaultdict(list))
    kinds: dict[int, dict[str, collections.Counter]] = collections.defaultdict(
        lambda: collections.defaultdict(collections.Counter))
    stat: collections.Counter = collections.Counter()
    unclassified: collections.Counter = collections.Counter()
    for r in conn.execute("""
            SELECT company_id, sa_number, amount_eur, aid_instrument_text
              FROM satr_staging
             WHERE company_id IS NOT NULL
               AND sa_number IS NOT NULL AND TRIM(sa_number) <> ''"""):
        sa = r["sa_number"].strip()
        if r["amount_eur"] is not None and r["amount_eur"] > 0:
            amounts[r["company_id"]][sa].append(float(r["amount_eur"]))
        kind = capital_kind(r["aid_instrument_text"])
        if kind:
            kinds[r["company_id"]][sa][kind] += 1
        elif r["aid_instrument_text"]:
            unclassified[r["aid_instrument_text"][:60]] += 1

    rows = json.loads((INTEL / args.src).read_text())
    for row in rows:
        cid = company.get(row["name"])
        labelled = row["instrument"]
        code = (inst[labelled]["scheme_code"] or "").strip() if labelled in inst else ""
        # Clear any previous run's answers, so a rebuild can REMOVE a derivation
        # that no longer holds rather than only adding new ones.
        for k in ("answerTicketBand", "answerTicketSource",
                  "answerCapital", "answerCapitalSource"):
            row.pop(k, None)
        if cid is None:
            stat["company not in the register"] += 1
            continue

        # Ticket band: the median award this company has actually received.
        per_scheme = amounts.get(cid, {})
        other = [a for sa, xs in per_scheme.items() if sa != code for a in xs]
        every = [a for xs in per_scheme.values() for a in xs]
        if other:
            row["answerTicketBand"] = ticket_band(statistics.median(other))
            row["answerTicketSource"] = "other_scheme"
            stat["ticket: other_scheme"] += 1
        elif every:
            row["answerTicketBand"] = ticket_band(statistics.median(every))
            row["answerTicketSource"] = "own_award"
            stat["ticket: own_award"] += 1
        else:
            stat["ticket: none"] += 1

        # Capital sought: every kind this company has actually taken, not only
        # the modal one. A founder who has held both a grant and a loan is open
        # to both, and collapsing to the mode would narrow the pool on an
        # assumption the register does not support.
        per_scheme_k = kinds.get(cid, {})
        other_k: collections.Counter = collections.Counter()
        for sa, c in per_scheme_k.items():
            if sa != code:
                other_k.update(c)
        every_k: collections.Counter = collections.Counter()
        for c in per_scheme_k.values():
            every_k.update(c)
        chosen, source = (other_k, "other_scheme") if other_k else (every_k, "own_award")
        if chosen:
            row["answerCapital"] = sorted(chosen)
            row["answerCapitalSource"] = source
            stat[f"capital: {source}"] += 1
        else:
            stat["capital: none"] += 1

    print(f"{len(rows)} rows from {args.src}")
    for k, v in sorted(stat.items()):
        print(f"  {k:38} {v:6}  ({100 * v / len(rows):.0f}%)")
    band_mix = collections.Counter(r.get("answerTicketBand") for r in rows)
    print("  ticket band mix:", dict(band_mix))
    cap_mix = collections.Counter(tuple(r.get("answerCapital") or ()) for r in rows)
    print("  capital mix:", dict(cap_mix.most_common(8)))
    if unclassified:
        # Loud on purpose: an aid-instrument wording this table cannot place is
        # a founder whose capital answer is wrong, and it must not be silent.
        print("  UNCLASSIFIED aid_instrument_text (capital_kind returned None):")
        for text, n in unclassified.most_common(10):
            print(f"    {n:7}  {text}")

    if args.write:
        out = INTEL / args.src
        out.write_text(json.dumps(rows, indent=1, ensure_ascii=False))
        print(f"wrote {out}")
    else:
        print("(report only; pass --write to update the set in place)")


if __name__ == "__main__":
    main()
