"""A euro band may only be derived from euro numerals.

THE DEFECT (measured 2026-08-19, wsIE)
--------------------------------------
`encode_gates.py` hands the model a EURO-denominated band scale and a funder's
sentence in the funder's own currency, and nothing anywhere reconciles the two.
So "maksimalt 500 000 kroner" -- EUR 46k -- was encoded as a ceiling of
`b100k_500k`, EUR 500k; "minimum 20 000 000 Ft - maximum 50 000 000 Ft" --
EUR 55k to EUR 137k -- was encoded as a ceiling of `b15m_50m`, EUR 50 MILLION.

The size of it is the shape of the exchange rate. Sterling at 1.17 euro lands
in the same coarse band most of the time and did: the corpus's one GBP balance
gate is right by accident. The kronor, kroner, zloty and forint gates are out by
factors of 11, 11, 4 and 365, and every one of them crossed a band edge. Nine of
thirteen non-euro bounds were encoded wrong, and none of them was GBP.

THE PROPERTY, which is not a list of currencies
-----------------------------------------------
    A comparator on a euro-denominated scale may only be derived from numerals
    shown to be euro. Where the gate's own verbatim words do not show that, the
    gate must either record a conversion whose band is the SAME at every rate
    that currency has held against the euro over the pinned ECB window, or
    carry no comparator at all.

The check never asks WHICH foreign currency a numeral is in, so there is no
register to fall out of date. It asks whether the numeral is shown to be EURO,
adjacent to the numeral itself, and treats everything else as not euro --
including the Czech scheme nobody has loaded yet. See ETL/lib/euro_money.py.

THE TEST FOR A GATE NOBODY HAS SEEN
-----------------------------------
Read the funder's own sentence and NAME THE CURRENCY OF THE NUMERAL THE BOUND
CAME FROM. If it is the euro, encode it. If it is not, convert it with
`euro_money.stable_band` and encode the band only if that returns one. If it
returns None, the exchange rate is deciding the verdict and the gate is
quarantined -- `value_spec` NULL, `encoding_method` 'quarantined', requirement
text untouched, exactly as `apply_gate_encoding_corrections.py` does it.

  python3 ETL/terms/check_gate_currency.py [--postgres] [--verbose]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
from etl_env import ROOT  # noqa: E402
from store import connect  # noqa: E402
from euro_money import euro_denominated, euro_scales, fx  # noqa: E402

# The provenance an encoding written THROUGH the conversion carries. A gate in
# this state has already been through `stable_band`; the check re-derives it
# rather than trusting the label, so a mislabelled row still fails.
FX_METHOD = "fx_converted"

QUERY = """
  SELECT instrument_id, gate_key, value_spec, requirement, quote,
         COALESCE(encoding_method, '')
    FROM eligibility_gates
   WHERE value_spec IS NOT NULL AND value_spec <> ''
     AND gate_role = 'filter'
"""


def violations(rows) -> list[dict]:
    scales = euro_scales()
    out = []
    for iid, gk, spec_json, requirement, quote, method in rows:
        try:
            spec = json.loads(spec_json)
        except (TypeError, ValueError):
            continue
        if not isinstance(spec, dict) or spec.get("field") not in scales:
            continue
        # The funder's own words: the verbatim quote first, then the
        # requirement the encoder read. Either showing euro is enough; a gate
        # whose quote is empty is judged on the requirement alone.
        verdicts = [euro_denominated(t) for t in (quote, requirement)]
        if any(v is True for v in verdicts) and not any(v is False for v in verdicts):
            continue                      # shown to be euro
        if all(v is None for v in verdicts):
            continue                      # no money numeral to denominate
        if method == FX_METHOD:
            continue                      # derived through a recorded conversion
        out.append({
            "instrument_id": iid, "gate_key": gk, "field": spec.get("field"),
            "op": spec.get("op"), "spec": spec,
            "requirement": (requirement or "")[:160],
            "quote": (quote or "")[:160],
        })
    return out


def fetch_rows():
    """The encoded filters, from the one store (schema capital in Postgres).
    There used to be two readers here, one per store, and the check reported
    the worse; with one store there is one reader."""
    with connect(readonly=True) as con:
        return con.execute(QUERY).fetchall()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--postgres", action="store_true",
                    help="accepted and ignored: there is one store, and it is Postgres")
    ap.add_argument("--verbose", action="store_true")
    a = ap.parse_args()

    rates = fx()
    print(f"euro-denominated scales: {', '.join(sorted(euro_scales()))}")
    print(f"ECB reference rates as of {rates['as_of']}, "
          f"envelope from {rates['window_start']} ({rates['window_years']}y)")

    stores = [("postgres", fetch_rows)]
    worst = 0
    for name, get in stores:
        rows = get()
        bad = violations(rows)
        # The WORST store, not the sum. Reporting 12 + 12 as 24 would say there
        # are twice as many broken rules as there are, and the two stores hold
        # the same corpus.
        worst = max(worst, len(bad))
        print(f"\n{name}: {len(rows)} encoded filters, {len(bad)} on a euro scale "
              f"from numerals not shown to be euro")
        for v in bad:
            print(f"  {v['instrument_id']} [{v['gate_key']}] {v['field']} {v['op']}")
            if a.verbose:
                print(f"      spec: {json.dumps(v['spec'], sort_keys=True)}")
                print(f"      req : {v['requirement']}")
                print(f"      quote: {v['quote']}")
    if worst:
        print(f"\nFAIL: {worst} comparator(s) in {len(stores)} store(s) place a founder on a "
              f"euro scale using numerals the funder did not write in euro.")
        print("Convert with euro_money.stable_band, or quarantine. Never widen a band "
              "so a conversion fits.")
        return 1
    print("\nOK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
