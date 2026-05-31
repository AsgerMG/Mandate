"""Shared helpers for Sprint 13 National Development Bank extractors.

Three concerns:
  1. `match_ipcei_linked` — does the company also appear in an IPCEI event? Used to
     flag NDB rows so aggregate views can net out double-counting (national IPCEI share
     also shows up under e.g. bpifrance_equity).
  2. `mark_eif_backed` — does the deploying institution receive EIF LP commitments?
     Documents EIF passthrough so headline "European capital" totals don't double-count
     the same euro at the EIF layer and the NDB layer.
  3. `normalise_ticket` — convert non-EUR amounts (SEK / CZK / PLN / etc.) to EUR using
     ECB annual reference rates. Cached lookup; no live API. Use deal *year* (call year
     or fund-closing year), not deal date — Sprint 13 methodology decision.

All three are pure functions — no DB writes — so they can be unit-tested independently
and called from any extractor.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "db.sqlite"


# ---------------------------------------------------------------------------
# 1. IPCEI linkage
# ---------------------------------------------------------------------------

def match_ipcei_linked(company_id: int, *, conn: sqlite3.Connection | None = None) -> int:
    """Return 1 if `company_id` has any existing ipcei_* event, else 0.

    Used at NDB-extractor load time to populate `public_funding_events.ipcei_linked`.
    Cheap because IPCEI is small (~280 events total) and indexed by source.
    Callers may pass an existing connection to avoid open/close churn in bulk loops.
    """
    own_conn = conn is None
    if own_conn:
        conn = sqlite3.connect(DB_PATH)
    try:
        row = conn.execute(
            "SELECT 1 FROM public_funding_events "
            "WHERE company_id = ? AND source LIKE 'ipcei_%' LIMIT 1",
            (company_id,),
        ).fetchone()
        return 1 if row else 0
    finally:
        if own_conn:
            conn.close()


def backfill_ipcei_linked(*, conn: sqlite3.Connection | None = None,
                         source_prefixes: tuple[str, ...] | None = None) -> int:
    """Bulk update `ipcei_linked=1` on all rows whose company has an ipcei_* sibling.

    If `source_prefixes` is given (e.g. `("bpifrance_", "cdti_")`), restrict to NDB
    sources. Otherwise update all non-IPCEI rows. Returns rows updated.

    Use this after a load instead of per-row lookup when scaling.
    """
    own_conn = conn is None
    if own_conn:
        conn = sqlite3.connect(DB_PATH)
    try:
        params: list = []
        where_extra = ""
        if source_prefixes:
            clauses = " OR ".join(["pfe.source LIKE ?"] * len(source_prefixes))
            where_extra = f" AND ({clauses})"
            params.extend(f"{p}%" for p in source_prefixes)
        cur = conn.execute(
            f"""
            UPDATE public_funding_events
            SET ipcei_linked = 1
            WHERE ipcei_linked = 0
              AND source NOT LIKE 'ipcei_%'
              AND company_id IN (
                  SELECT DISTINCT pfe.company_id
                  FROM public_funding_events pfe
                  JOIN public_funding_events ipcei
                    ON ipcei.company_id = pfe.company_id
                  WHERE ipcei.source LIKE 'ipcei_%'
                    AND pfe.source NOT LIKE 'ipcei_%'
                    {where_extra}
              )
            """,
            params,
        )
        conn.commit()
        return cur.rowcount
    finally:
        if own_conn:
            conn.close()


# ---------------------------------------------------------------------------
# 2. EIF LP-backed institutions
# ---------------------------------------------------------------------------

# Codes here are the NDB / sub-institution identifiers used as `source` prefixes
# in extractors. Any row whose `source` starts with one of these gets
# `eif_lp_backed=1` to flag the upstream EIF LP relationship.
#
# Membership rules (locked Sprint 13):
#   - KfW Capital: explicitly co-funded by EIF under InvestEU.
#   - Saminvest: Swedish state fund-of-funds; EIF is a regular LP.
#   - CDP VC (some funds): EIF is LP in selected vehicles (Boost, Tech4Planet).
#     Flag at the institution level — partial-truth caveat goes in methodology, not data.
#   - Bpifrance: sovereign-funded at holding level; NOT flagged. EIF participates in
#     some Bpifrance-managed funds, but the deployment vehicle is national.
#   - Tesi: Finnish state, NOT EIF-backed at the parent level.
#   - Enterprise Ireland: sovereign.
#   - Invest-NL: sovereign.
#   - SPRIND, CDTI, Business Finland, Vinnova, Almi Invest: grant agencies, no LP layer.
_EIF_LP_BACKED_PREFIXES: frozenset[str] = frozenset({
    "kfw_capital",
    "saminvest",
    "cdp_vc",
})


def mark_eif_backed(source: str) -> int:
    """Return 1 if `source` belongs to an EIF LP-backed institution, else 0.

    Match is on the source prefix — so `kfw_capital_btv_2023` and `kfw_capital_htgf`
    both flag.
    """
    if not source:
        return 0
    for prefix in _EIF_LP_BACKED_PREFIXES:
        if source.startswith(prefix):
            return 1
    return 0


# ---------------------------------------------------------------------------
# 3. FX normalisation
# ---------------------------------------------------------------------------

# Annual average EUR-per-1-unit-of-foreign-currency, from ECB statistical warehouse
# (https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/).
# One rate per year — Sprint 13 decision to avoid deal-date cherry-picking.
#
# Reference rates retrieved 2026-05-26. 2026 row uses YTD average pending year-end.
# To extend: append a new year row; do NOT retroactively edit historical rows.
_EUR_PER_UNIT: dict[str, dict[int, float]] = {
    # 1 SEK in EUR
    "SEK": {
        2021: 0.09848,
        2022: 0.09428,
        2023: 0.08731,
        2024: 0.08727,
        2025: 0.09060,
        2026: 0.09100,  # YTD placeholder; refresh at year end
    },
    # 1 CZK in EUR
    "CZK": {
        2021: 0.03903,
        2022: 0.04079,
        2023: 0.04173,
        2024: 0.03986,
        2025: 0.04020,
        2026: 0.04050,
    },
    # 1 PLN in EUR
    "PLN": {
        2021: 0.21862,
        2022: 0.21334,
        2023: 0.21992,
        2024: 0.23258,
        2025: 0.23420,
        2026: 0.23500,
    },
    # 1 DKK in EUR (pegged ~7.46 → 0.13405). Listed for completeness; rarely needed.
    "DKK": {
        2021: 0.13447,
        2022: 0.13443,
        2023: 0.13412,
        2024: 0.13405,
        2025: 0.13405,
        2026: 0.13405,
    },
    # Sprint 15 additions (SATR multi-country FX). ECB reference rates,
    # annual averages.
    # 1 HUF in EUR
    "HUF": {
        2021: 0.00280,
        2022: 0.00255,
        2023: 0.00263,
        2024: 0.00254,
        2025: 0.00254,
        2026: 0.00254,
    },
    # 1 GBP in EUR — UK pre-2020 awards still appear in SATR
    "GBP": {
        2021: 1.163,
        2022: 1.173,
        2023: 1.149,
        2024: 1.182,
        2025: 1.190,
        2026: 1.190,
    },
    # 1 BGN in EUR — Bulgarian lev is currency-board-pegged at 1.95583
    "BGN": {
        2021: 0.51129,
        2022: 0.51129,
        2023: 0.51129,
        2024: 0.51129,
        2025: 0.51129,
        2026: 0.51129,
    },
    # 1 RON in EUR — Romanian leu
    "RON": {
        2021: 0.20342,
        2022: 0.20242,
        2023: 0.20255,
        2024: 0.20105,
        2025: 0.20100,
        2026: 0.20100,
    },
    # 1 HRK in EUR — Croatian kuna (retired 2023-01-01 when Croatia joined eurozone)
    "HRK": {
        2021: 0.13312,
        2022: 0.13280,
        # 2023+ : HRK retired
    },
    # 1 ISK in EUR — Icelandic krona
    "ISK": {
        2021: 0.00673,
        2022: 0.00708,
        2023: 0.00665,
        2024: 0.00656,
        2025: 0.00666,
        2026: 0.00666,
    },
}


def normalise_ticket(amount: float | None, currency: str, year: int) -> float | None:
    """Convert `amount` in `currency` (ISO 4217 code) to EUR using the ECB annual
    reference rate for `year`.

    Returns None if `amount` is None.
    Returns `amount` unchanged if `currency` is "EUR".
    Raises KeyError if (currency, year) is unknown — callers should choose to log and
    skip rather than silently zero out, so we don't paper over an unknown FX series.
    """
    if amount is None:
        return None
    if currency == "EUR":
        return float(amount)
    series = _EUR_PER_UNIT.get(currency)
    if series is None:
        raise KeyError(f"FX series not available for currency={currency!r}")
    rate = series.get(year)
    if rate is None:
        raise KeyError(f"FX rate not available for {currency} in year={year}")
    return round(float(amount) * rate, 2)
