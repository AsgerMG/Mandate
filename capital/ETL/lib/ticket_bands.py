"""Which ticket band an amount falls in — one definition, read from the app's.

The intake's ticket bands are declared once, in
`web/lib/intelligence/types.ts`, and projected into
`data/vocabularies.json` by `emit_vocabulary.ts` as `bandBounds`. This module is
the Python half of that contract, so the ETL never restates the edges.

It exists because it had already gone wrong. Two files carried their own copy of
the boundaries:

  audit_encoding_vs_reality.TICKET_UPPER  under a comment reading "the
      boundaries are read there so this cannot drift" — directly above five
      hardcoded numbers, which is the comment doing the opposite of its job.
  enrich_recall_answers.TICKET_BANDS      which decides the band every graded
      founder in the recall harness is recorded as having asked for.

The second is the dangerous one. A rebanding that updated the app and missed it
would grade the new scale against answers derived on the old one, and report the
mismatch as an effect — a change measuring itself against a stale answer key,
which is the failure this project has now paid for more than once.

`band_of_eur` is the same function as `bandForEur` in types.ts, deliberately:
half-open intervals, `maxEur` exclusive, and the top band unbounded above.
"""
from __future__ import annotations

import json
from pathlib import Path

_VOCAB = json.loads(
    (Path(__file__).resolve().parents[2] / "data" / "vocabularies.json").read_text())

# Declaration order IS band order, smallest first; `bandOrders` agrees and is
# what a comparator sorts on.
BAND_BOUNDS: dict[str, float] = {
    name: (float("inf") if bound is None else float(bound))
    for name, bound in _VOCAB["bandBounds"].items()
}
BAND_ORDER: list[str] = _VOCAB["bandOrders"]["ticketBand"]

assert set(BAND_BOUNDS) == set(BAND_ORDER), (
    "data/vocabularies.json disagrees with itself about the ticket bands: "
    f"bandBounds={sorted(BAND_BOUNDS)} bandOrders={sorted(BAND_ORDER)} — "
    "regenerate with `npm run vocab` in web")


def band_floor_eur(band: str) -> float:
    """Inclusive lower bound: the previous band's exclusive upper bound."""
    i = BAND_ORDER.index(band)
    return 0.0 if i == 0 else BAND_BOUNDS[BAND_ORDER[i - 1]]


def band_of_eur(eur: float) -> str:
    """The band an amount falls in. Half-open: `maxEur` is exclusive."""
    for name in BAND_ORDER:
        if eur < BAND_BOUNDS[name]:
            return name
    return BAND_ORDER[-1]
