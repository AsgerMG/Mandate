"""The one rule about money in this corpus, and the arithmetic that serves it.

THE PROPERTY
------------
    A comparator that places an answer on a EURO-DENOMINATED SCALE may only be
    derived from numerals that are themselves denominated in euro. Where the
    funder's own words denominate them in another currency, the comparator may
    exist at all only if the band the conversion selects is THE SAME AT EVERY
    RATE THAT CURRENCY HAS HELD AGAINST THE EURO over the pinned window.
    Otherwise the gate carries no comparator.

WHY THAT SECOND CLAUSE, AND NOT JUST "CONVERT IT"
-------------------------------------------------
An exchange rate is a floating number, and a hard eligibility verdict that
depends on one is a verdict that changes without anybody deciding it should.
The clause removes the dependence rather than documenting it: if a rule lands
in the same band at NOK 8.81 and at NOK 12.32 -- the extremes of a decade -- then
the rate is not load-bearing and re-deriving the band next year cannot change
the answer. If it does NOT land in the same band, no rate is good enough and
the honest encoding is none at all.

That test has teeth. Of the thirteen non-euro money bounds in the corpus on
2026-08-19 it admitted twelve and refused one: Innovasjon Norge's "minimum
1 million kroner" is EUR 81k at one end of the decade and EUR 114k at the other,
and the intake's band edge sits at EUR 100k between them.

WHY THE DETECTOR NAMES ONLY THE EURO
------------------------------------
The house rule is property, not register: a check that lists GBP, SEK, DKK,
NOK, PLN and CHF is a lie the day a Czech scheme arrives. So `euro_denominated`
does not try to recognise foreign currencies at all. It asks the only question
the property needs -- IS THIS NUMERAL SHOWN TO BE EURO? -- and anything that is
not shown to be euro is not euro, whether it is kroner, koruna, leva or a
currency nobody here has seen. The euro is the only currency named in this file
and that is the point: naming what we ADMIT is not a register of what we
EXCLUDE, and it does not grow.

WHICH CURRENCY a non-euro numeral is in is a READING task, not a pattern task,
and it is answered where reading happens: the model in `encode_gates.py` returns
an ISO 4217 code for the numerals it used, and the arithmetic here is
deterministic. No model does FX arithmetic and no regex reads a language.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

from etl_env import ROOT

FX_PATH = ROOT / "reference" / "fx_eur_reference_rates.json"
VOCAB_PATH = ROOT / "data" / "vocabularies.json"


# ── The rates ────────────────────────────────────────────────────────────────
@lru_cache(maxsize=1)
def fx() -> dict:
    """The pinned ECB reference rates. Rates are UNITS PER EURO."""
    if not FX_PATH.exists():
        raise SystemExit(
            f"missing {FX_PATH}. Generate it with:\n"
            f"  python3 ETL/terms/fetch_ecb_reference_rates.py")
    return json.loads(FX_PATH.read_text())


def eur_range(amount: float, currency: str) -> tuple[float, float, float]:
    """(at spot, at the window's weakest euro, at its strongest) in euro.

    Returned lowest-first, so a caller can read it as an interval without
    having to know that a HIGHER units-per-euro rate means a LOWER euro value.
    """
    c = currency.upper()
    if c in ("EUR", "€"):
        return (amount, amount, amount)
    r = fx()["rates"].get(c)
    if r is None:
        raise KeyError(
            f"{c} is not in {FX_PATH.name} (as of {fx()['as_of']}). "
            f"Re-run fetch_ecb_reference_rates.py; if the ECB does not quote it, "
            f"the amount cannot be converted and the gate cannot be encoded.")
    vals = sorted(amount / r[k] for k in ("spot", "min", "max"))
    return (vals[0], amount / r["spot"], vals[-1])


# ── Which scales are denominated in euro ─────────────────────────────────────
_MAGNITUDE = {"k": 1_000, "m": 1_000_000, "bn": 1_000_000_000}


def _band_ceiling_eur(band: str) -> float | None:
    """The euro amount a band name names, read OFF THE NAME.

    `lt25k` -> 25 000, `b25k_100k` -> 100 000, `2-10M` -> 10 000 000,
    `>43M` -> 43 000 000, `gt50m` -> unbounded above.

    Read rather than restated, so a band added to `types.ts` is covered here
    with no edit. Three hand-kept copies of these boundaries already existed
    once in this repo and two of them had stopped agreeing.
    """
    if "%" in band:
        return None
    nums = re.findall(r"(\d+(?:[.,]\d+)?)\s*(bn|k|m)\b", band, re.I)
    if not nums:
        return None
    if re.match(r"^(gt|>)", band, re.I):
        return float("inf")
    n, mag = nums[-1]
    return float(n.replace(",", ".")) * _MAGNITUDE[mag.lower()]


@lru_cache(maxsize=1)
def euro_scales() -> dict[str, list[tuple[str, float]]]:
    """field -> [(band, exclusive euro ceiling)], for every scale in the
    intake vocabulary whose EVERY band names a euro magnitude.

    `fteBand` ("1-9", "250+") names no magnitude and is not a money scale;
    `cofinancingBand` ("<25%") names a proportion. Both fall out, and neither
    is mentioned by name to make them.

    `ticketBand`'s ceilings come from `bandBounds`, which `emit_vocabulary.ts`
    projects from `TICKET_BANDS.maxEur` -- the single definition of where those
    edges are. The name-read above is the fallback for the scales the vocabulary
    does not project bounds for.
    """
    v = json.loads(VOCAB_PATH.read_text())
    projected = v.get("bandBounds", {})
    out: dict[str, list[tuple[str, float]]] = {}
    for field, order in v["bandOrders"].items():
        ceilings = []
        for b in order:
            c = projected[b] if b in projected else _band_ceiling_eur(b)
            if b in projected and c is None:
                c = float("inf")            # projected null = unbounded above
            if c is None:
                break
            ceilings.append((b, float(c)))
        else:
            if len(ceilings) == len(order) and len(order) > 1:
                out[field] = ceilings
    return out


def band_for_eur(field: str, amount_eur: float) -> str:
    """The band a euro amount falls in, on a euro-denominated scale."""
    scale = euro_scales()[field]
    for name, ceiling in scale:
        if amount_eur < ceiling:
            return name
    return scale[-1][0]


def stable_band(field: str, amount: float, currency: str) -> str | None:
    """The band this amount selects, or None if the rate decides which.

    THE ADMISSIBILITY TEST. None means the gate may carry no comparator: not
    "we could not be bothered", but "no exchange rate is good enough, because
    the answer changes across rates this currency has really held".
    """
    lo, spot, hi = eur_range(amount, currency)
    bands = {band_for_eur(field, x) for x in (lo, spot, hi)}
    return bands.pop() if len(bands) == 1 else None


# ── Is a numeral shown to be euro? ───────────────────────────────────────────
#
# The ONLY currency named in this file. The euro's symbol, its ISO code, and its
# own name in the scripts and spellings the corpus's source languages use --
# Latvian "eiro", Maltese "ewro", Greek and Bulgarian in their own alphabets.
# Everything else in Europe inflects on the stem "eur": euro, euros, eurot,
# eurodes, euró, eura, euron, eurai.
#
# `(?!op)` is doing real work and is not a spelling quirk. "European",
# "Europe", "europeisk" and "európai" are built on the same three letters and
# appear in half the eligibility text in this corpus; a rule that read them as
# the currency would certify a Norwegian kroner amount as euro because the
# sentence around it mentioned the European Commission. The continent is not
# the currency.
_EURO_TOKEN = r"(?:€|EUR\b|eur(?!op)\w{0,5}|eir\w{0,5}|ewro|ευρ\w*|евр\w*)"

# THE UNIT SITS NEXT TO THE AMOUNT. That is true in every language here --
# "EUR 200 000", "200 000 eurot", "10 miljoner euro", "£30 million" -- and it
# is the whole adjacency rule. A euro word anywhere ELSE in the sentence
# certifies nothing: `nfr_pesordning`'s rule is "Companies participating in a
# EUROSTARS project must document at least NOK 500,000 in equity", and a
# window-based test reads that as a euro amount. Only separators, brackets and
# the words "up to"/"at least" may stand between the number and its unit.
# Punctuation, and at most one short function word: the genitive preposition
# every language slips between the amount and its unit -- "3 milioni DI euro",
# "30 millions D'euros", "EUR ~1.3M". Three letters is the budget, so "kroner",
# "before" and "PLN na projekt" cannot be stepped over to reach a euro word
# further along.
_GAP = r"[\s.,:;()\[\]/~'’\"–—-]*(?:\w{1,3}[\s'’]+)?[\s.,:;()\[\]/~'’\"–—-]*"

# A numeral is a MONEY magnitude if it is written large or carries a scale
# word. "651/2014" (a regulation number) and "10%" (a growth rate) are not, and
# are not asked to prove themselves euro.
#
# The scale words ARE a lexicon, and unlike the currency test that is
# acceptable, because it fails OPEN: a magnitude nobody has listed makes the
# numeral invisible, which leaves the gate exactly where it is today rather
# than certifying it. Italian "750 MILA euro" was invisible until `mil\w*`
# replaced a list of spellings of "million".
_MONEY_NUMERAL = re.compile(
    r"(?<![\d./-])(\d{1,3}(?:[\s\u00a0.,]\d{3})+|\d{4,}|"
    r"\d+(?:[.,]\d+)?\s*(?:thousand|mkr|mio\.?|mln|mil\w*|milj\w*|"
    r"tus\w*|tys\w*|tuh\w*|ezer|bn|mn|k|m)\b)",
    re.I)


def money_numerals(text: str) -> list[tuple[int, int, str]]:
    """(start, end, literal) for every numeral in `text` that reads as money."""
    if not text:
        return []
    return [(m.start(), m.end(), m.group(0)) for m in _MONEY_NUMERAL.finditer(text)
            if "%" not in text[m.end():m.end() + 2]]


def _has_adjacent_euro(text: str, start: int, end: int) -> bool:
    if re.match(_GAP + _EURO_TOKEN, text[end:], re.I | re.U):
        return True
    before = text[:start]
    return bool(re.search(_EURO_TOKEN + _GAP + r"$", before, re.I | re.U))


# A RANGE SHARES ITS UNIT. "between 30 000 and 3 000 000 eurot" writes the
# currency once, after the second number, and every language here does the
# same. So numerals that stand in an unbroken run -- separated by a short
# connector carrying no digits of its own -- are denominated together, and the
# unit adjacent to any of them governs all of them. Without this, half the
# corpus's correctly-encoded euro ranges would be flagged as foreign, and a
# check that cries wolf on true rows is a check that gets switched off.
_RUN_GAP = 40


def _runs(text: str, hits: list[tuple[int, int, str]]) -> list[list[tuple[int, int, str]]]:
    runs: list[list[tuple[int, int, str]]] = []
    for h in hits:
        if runs and h[0] - runs[-1][-1][1] <= _RUN_GAP:
            runs[-1].append(h)
        else:
            runs.append([h])
    return runs


def euro_denominated(text: str) -> bool | None:
    """True  every money amount here is shown to be euro
    False at least one is not shown to be euro
    None   there is no money amount to denominate

    Note what False does NOT say: it does not say which currency. That is a
    reading task, and this function does not read languages.
    """
    hits = money_numerals(text or "")
    if not hits:
        return None
    return all(any(_has_adjacent_euro(text, s, e) for s, e, _ in run)
               for run in _runs(text, hits))
