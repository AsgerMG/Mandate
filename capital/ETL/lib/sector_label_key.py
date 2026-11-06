"""The key of company_sector_labels: ONE definition, in Python.

    from sector_label_key import name_key
    name_key("ΓΙΩΤΗΣ ΑΕ", "gr")  ->  "γιωτης αε|GR"

The vault of curated sector labels is keyed by a company's name and country,
lowered and uppercased by Python. A reader that rebuilds the key in SQL gets a
DIFFERENT key for real names, and silently loses those companies' labels:

  * SQLite's LOWER() folds ASCII only: "ÉCOLE" stays "ÉCOLE" (8,725 companies
    unmatched on the 2026-11-05 corpus);
  * Postgres's LOWER() folds Unicode but not contextually: a word-final Greek
    sigma becomes "σ" where Python writes "ς" (757 company-channel pairs).

So no SQL computes this key. Join in Python, through this function.
"""
from __future__ import annotations


def name_key(name: str | None, country: str | None) -> str:
    return f"{(name or '').strip().lower()}|{(country or '').strip().upper()}"
