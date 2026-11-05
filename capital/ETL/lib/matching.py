"""Canonical company name normalization + 5-tier matcher.

THE RULE (2026-06-10 pipeline audit): new extractors import from here instead
of pasting their own copy. At audit time 23 extractors carried their own
normalize_name and 21 their own matcher, with three observably different
suffix lists — every divergence is a future duplicate company. Legacy
extractors are refactored opportunistically when next touched, not in bulk.

Performance contract (the Innovate UK lesson — first load ran 68+ minutes):
  - exact tier = dict lookup built once, never a per-row SQL scan
    (the DB-side equivalent is covered by idx_companies_name_upper, mig 007);
  - fuzzy tier = SequenceMatcher gated by length ratio + quick_ratio, never
    an unguarded .ratio() against every candidate.

Usage:
    from matching import normalize_name, CompanyMatcher

    matcher = CompanyMatcher(con, country="GB")   # or country=None for all
    cid, method = matcher.match(raw_name)         # method: exact/prefix/
                                                  # reverse_prefix/fuzzy/none
    matcher.register(cid, raw_name)               # after inserting a new row
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher

# Superset of the suffix lists found in the field (extract_cordis,
# extract_cordis_pillar_ii, extract_innovate_uk). Longest-first so compound
# suffixes strip before their tails.
_LEGAL_SUFFIXES = sorted(
    [
        " GMBH & CO. KG", " GMBH", " GGMBH", " MBH", " AG", " KG", " UG", " GESMBH",
        " BV", " B.V.", " NV", " N.V.",
        " SAS", " S.A.S.", " SARL", " SASU", " SCA",
        " SRL", " S.R.L.", " SPA", " S.P.A.", " SRLS", " SCPA",
        " SRO", " S.R.O.",
        " SL", " SLU", " SLL", " SLNE", " SAU", " S.L.",
        " LIMITED", " LTD", " PLC", " LLC", " LLP", " INC", " CORP", " CIC",
        " AB", " APS", " AS", " A/S", " ASA",
        " OY", " OYJ", " HF", " EHF",
        " DOO", " D.O.O.", " DD", " UAB", " OOO",
        " LDA", " LDA.", " CRL", " SCRL",
        " EE", " IKE",
        " ZRT", " KFT", " NYRT",
        " SA", " S.A.", " S.A",
        " SP. Z O.O.", "SPOLKA AKCYJNA",
        " ASBL", " AISBL", " VZW", " IVZW",
    ],
    key=len, reverse=True,
)

_PUNCT_RE = re.compile(r"[^A-Z0-9]+")

# SQLite's UPPER() folds ASCII a-z and nothing else ("Société" -> "SOCIéTé");
# Postgres's folds every letter. The candidate keys were always built with
# SQLite's, so on 2026-11-05 the port reproduces it exactly here rather than
# moving which company an award attaches to as a side effect of changing
# databases. Making the match Unicode-correct is a real improvement and a
# separate, measured change -- not something a store migration does silently.
_ASCII_UPPER = str.maketrans("abcdefghijklmnopqrstuvwxyz", "ABCDEFGHIJKLMNOPQRSTUVWXYZ")


def sqlite_upper(s: str | None) -> str | None:
    return None if s is None else s.translate(_ASCII_UPPER)
_WS_RE = re.compile(r"\s+")


def normalize_name(name: str) -> str:
    """Uppercase, strip one trailing legal suffix, collapse punctuation."""
    n = (name or "").upper().strip()
    for suffix in _LEGAL_SUFFIXES:
        if n.endswith(suffix):
            n = n[: -len(suffix)]
            break
    n = _PUNCT_RE.sub(" ", n).strip()
    return _WS_RE.sub(" ", n)


class CompanyMatcher:
    """5-tier matcher over an in-memory snapshot of the companies table.

    Tiers: pic (optional) → exact (dict) → prefix → reverse_prefix →
    fuzzy (gated SequenceMatcher ≥ 0.92).
    """

    FUZZY_THRESHOLD = 0.92
    LENGTH_GATE = 0.85
    MIN_PREFIX_LEN = 4

    def __init__(self, con, country: str | None = None):
        # ORDER BY id: the prefix scan returns the FIRST hit and setdefault keeps
        # the first id, so candidate order is part of the answer. SQLite gave
        # rowid order implicitly; it is stated here.
        if country:
            rows = con.execute(
                "SELECT id, canonical_name, pic FROM companies WHERE country = %s "
                "ORDER BY id", (country,)).fetchall()
        else:
            rows = con.execute(
                "SELECT id, canonical_name, pic FROM companies ORDER BY id").fetchall()
        self._candidates: list[tuple[int, str]] = []
        self._exact: dict[str, int] = {}
        self._by_pic: dict[str, int] = {}
        for cid, cname, pic in rows:
            cname = sqlite_upper(cname) or ""
            self._candidates.append((cid, cname))
            if cname:
                self._exact.setdefault(cname, cid)
            if pic:
                self._by_pic[str(pic)] = cid

    def match(self, raw_name: str, pic: str | None = None) -> tuple[int | None, str]:
        if pic and str(pic) in self._by_pic:
            return self._by_pic[str(pic)], "pic"
        norm = normalize_name(raw_name)
        if not norm:
            return None, "none"
        if norm in self._exact:
            return self._exact[norm], "exact"
        for cid, cname in self._candidates:
            if len(cname) < self.MIN_PREFIX_LEN:
                continue
            if norm.startswith(cname + " "):
                return cid, "prefix"
            if cname.startswith(norm + " "):
                return cid, "reverse_prefix"
        best: tuple[float, int | None] = (0.0, None)
        nlen = len(norm)
        for cid, cname in self._candidates:
            clen = len(cname)
            if not clen or clen < self.LENGTH_GATE * nlen or nlen < self.LENGTH_GATE * clen:
                continue
            sm = SequenceMatcher(None, norm, cname)
            if sm.quick_ratio() < self.FUZZY_THRESHOLD:
                continue
            ratio = sm.ratio()
            if ratio > best[0]:
                best = (ratio, cid)
        if best[0] >= self.FUZZY_THRESHOLD and best[1] is not None:
            return best[1], "fuzzy"
        return None, "none"

    def register(self, cid: int, raw_name: str, pic: str | None = None) -> None:
        """Add a freshly inserted company so later rows in the same run match it."""
        norm = normalize_name(raw_name)
        if norm:
            self._candidates.append((cid, norm))
            self._exact.setdefault(norm, cid)
        if pic:
            self._by_pic[str(pic)] = cid
