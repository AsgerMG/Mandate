"""The currency property, pinned by the sentences the corpus actually holds.

Every string below is a verbatim requirement or quote from `eligibility_gates`
on 2026-08-19, or the same form in a language the corpus already carries. The
value is not what a regex happens to do; it is whether the funder wrote the
amount in euro.

  python3 ETL/terms/test_euro_money.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
from euro_money import (  # noqa: E402
    band_for_eur, eur_range, euro_denominated, euro_scales, stable_band,
)

# ── Shown to be euro ─────────────────────────────────────────────────────────
EURO = [
    "The grant amount requested in an application round must be between 30,000 and 3,000,000 euros.",
    "Taotlusvoorus taotletava toetuse suurus on 30 000 kuni 3 000 000 eurot.",
    "kelle põhitegevusala keskmine müügitulu on vähemalt 200 000 eurot",
    "kelle kontserni konsolideeritud käive oli vähemalt 25 miljonit eurot",
    "Applicant's average sales revenue must be at least €200,000, per the commercial register.",
    "årsomsättning eller balansomslutning på mindre än 10 miljoner euro",
    "either annual turnover under EUR 50 million or a balance sheet under EUR 43 million",
    "une demande d’aide inférieure à 30 millions d'euros",
    "I progetti devono prevedere spese ammissibili compreso tra 800 mila e 3 milioni di euro.",
    # The unit is written once, for the first bound, and the second is bare.
    "spese ammissibili di importo non inferiore a 750 mila euro e non superiore a 5 milioni",
    "Der Zuschuss beträgt maximal 500.000 Euro je Vorhaben",
    "le montant de l'aide est plafonné à 200 000 euros",
    # The continent is not the currency, and here it is both.
    "grants of up to EUR 2.5 million per project under the European Regional Development Fund",
]

# ── Not shown to be euro ─────────────────────────────────────────────────────
NOT_EURO = [
    "have total eligible project costs between £100,000 and £500,000",
    "not have gross assets worth more than £30 million before any shares are issued",
    "minst 500 000 kroner i total egenkapital",
    "Hvor mye Minimum 1 million kroner",
    "högst 10 mkr i nettoomsättning eller balansomslutning",
    "minimum 20 000 000 Ft - maximum 50 000 000 Ft",
    "minimalna wartość dofinansowania projektu wynosi 150 tys. PLN",
    # THE ONE THAT BREAKS A WINDOW-BASED TEST. The rule is in kroner and the
    # word "Eurostars" is in the same sentence.
    "Companies participating in a Eurostars project must document at least "
    "NOK 500,000 in equity capital at the time of application.",
    # A currency nobody has encoded a gate for yet. Nothing in the module knows
    # it exists, and that is exactly why it comes out right.
    "maximálně 5 000 000 Kč na projekt",
    "5 mil. Kč na projekt",
    "najviše 2 000 000 kuna po projektu",
]

# ── Nothing here is a money amount ───────────────────────────────────────────
NO_AMOUNT = [
    "Komisijas regulas Nr. 651/2014 1. pielikumā minētajai definīcijai",
    "an average annualised growth in turnover greater than 10% a year",
    "Applicant must be an SME per the Commission's definition",
]


FAILURES: list[str] = []


def check(cond, what: str) -> None:
    if not cond:
        FAILURES.append(what)


def test_denomination():
    for t in EURO:
        check(euro_denominated(t) is True, f"should read as euro: {t[:70]}")
    for t in NOT_EURO:
        check(euro_denominated(t) is False, f"should NOT read as euro: {t[:70]}")
    for t in NO_AMOUNT:
        check(euro_denominated(t) is None, f"has no money amount: {t[:70]}")


def test_only_money_scales_are_euro_scales():
    """A tripwire, not a rule. The rule is that a euro scale is one whose every
    band names a euro magnitude; this pins what that currently selects, so a
    band scale added to types.ts that the rule mis-sorts goes red here and
    somebody looks, instead of silently joining or leaving the property."""
    check(set(euro_scales()) == {"ticketBand", "turnoverBand", "balanceBand"},
          f"euro scales are now {sorted(euro_scales())}")


def test_ticket_band_edges_come_from_the_vocabulary():
    check(band_for_eur("ticketBand", 24_999) == "lt25k",
          'band_for_eur("ticketBand", 24_999) == "lt25k"')
    check(band_for_eur("ticketBand", 500_000) == "b500k_2m5",
          'band_for_eur("ticketBand", 500_000) == "b500k_2m5"')
    check(band_for_eur("ticketBand", 9_000_000_000) == "gt50m",
          'band_for_eur("ticketBand", 9_000_000_000) == "gt50m"')
    check(band_for_eur("turnoverBand", 1_999_999) == "<2M",
          'band_for_eur("turnoverBand", 1_999_999) == "<2M"')
    check(band_for_eur("balanceBand", 43_000_000) == ">43M",
          'band_for_eur("balanceBand", 43_000_000) == ">43M"')


def test_conversion_direction_is_not_inverted():
    """One euro buys more than one krone, so a kroner amount is a SMALLER euro
    amount. Inverting this is the whole defect, one file over."""
    lo, spot, hi = eur_range(1_000_000, "NOK")
    check(lo < spot < hi,
          'lo < spot < hi')
    check(spot < 1_000_000,
          'spot < 1_000_000')
    check(eur_range(1_000_000, "EUR") == (1_000_000, 1_000_000, 1_000_000),
          'eur_range(1_000_000, "EUR") == (1_000_000, 1_000_000, 1_000_000)')


def test_a_rate_that_decides_the_band_is_refused():
    """NOK 1,000,000 is EUR 81k at one end of the decade and EUR 114k at the
    other, and the intake's edge is at EUR 100k. No rate is good enough."""
    check(stable_band("ticketBand", 1_000_000, "NOK") is None,
          'stable_band("ticketBand", 1_000_000, "NOK") is None')
    # NOK 500,000 sits well inside one band at every rate in the window.
    check(stable_band("ticketBand", 500_000, "NOK") == "b25k_100k",
          'stable_band("ticketBand", 500_000, "NOK") == "b25k_100k"')
    check(stable_band("ticketBand", 50_000_000, "HUF") == "b100k_500k",
          'stable_band("ticketBand", 50_000_000, "HUF") == "b100k_500k"')
    check(stable_band("turnoverBand", 10_000_000, "SEK") == "<2M",
          'stable_band("turnoverBand", 10_000_000, "SEK") == "<2M"')
    check(stable_band("ticketBand", 150_000, "PLN") == "b25k_100k",
          'stable_band("ticketBand", 150_000, "PLN") == "b25k_100k"')
    # The GBP case the coarse bands absorbed: right before and after conversion.
    check(stable_band("balanceBand", 30_000_000, "GBP") == "2-43M",
          'stable_band("balanceBand", 30_000_000, "GBP") == "2-43M"')


def test_an_unquoted_currency_cannot_be_converted():
    try:
        eur_range(1_000, "XYZ")
    except KeyError:
        return
    FAILURES.append("a currency the ECB does not quote was converted anyway")


def main() -> int:
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn()
    for f in FAILURES:
        print("FAIL:", f)
    print(f"{'FAILED' if FAILURES else 'OK'}: {len(FAILURES)} failure(s) "
          f"over {len(EURO) + len(NOT_EURO) + len(NO_AMOUNT)} verbatim sentences")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    raise SystemExit(main())
