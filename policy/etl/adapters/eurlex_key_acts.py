"""Foundational EU tech acts — curated full-text seed list.

The main ``eurlex`` adapter discovers *recent* documents (its SPARQL query
filters by date), so the acts everything else refers to — GDPR, DMA, DSA,
AI Act… — never enter the corpus on their own: they predate any realistic
backfill window's first run and stopped being "new" years ago. This adapter
closes that loop with a fixed CELEX list, reusing EurLexAdapter's Cellar
fetch/parse path. The pipeline's content-hash dedup makes re-runs cheap, and
if an act is ever amended/consolidated the text change shows up as a new
version.

Adding an act = one line in KEY_ACTS.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Iterable

from data.models import Jurisdiction

from .eurlex import CELLAR_CONTENT_URL, EurLexAdapter

# CELEX → short name. Sector 3 = enacted law, sector 5 = proposals still in
# (or abandoned from) procedure — both matter for "what applies vs. what's
# coming" briefs.
KEY_ACTS: dict[str, str] = {
    "32016R0679": "GDPR",
    "32022R1925": "Digital Markets Act (DMA)",
    "32022R2065": "Digital Services Act (DSA)",
    "32024R1689": "AI Act",
    "32023R2854": "Data Act",
    "32022R0868": "Data Governance Act (DGA)",
    "32022L2555": "NIS2 Directive",
    "32024R2847": "Cyber Resilience Act (CRA)",
    "32022R2554": "DORA",
    "32023R1114": "MiCA",
    "32024R0900": "Political Advertising Regulation (TTPA)",
    "32019R1150": "Platform-to-Business Regulation (P2B)",
    "32024R1183": "European Digital Identity Framework (eIDAS 2)",
    "32024R1083": "European Media Freedom Act (EMFA)",
    "32002L0058": "ePrivacy Directive",
    "52018PC0148": "Digital Services Tax proposal (COM/2018/148)",
    "32015L2302": "Package Travel Directive",
    "32011L0083": "Consumer Rights Directive",
    # Found via a real-world tech-policy tracker cross-check (GetYourGuide's
    # own internal file) — real, currently-missing instruments the corpus's
    # date-scoped discovery hasn't independently surfaced yet.
    "32026L1024": "Revised Package Travel Directive (2026)",
    "32024L2831": "Platform Work Directive",
    "32024L0825": "Empowering Consumers for the Green Transition Directive (ECGT)",
    "32026L0470": "Corporate Sustainability Omnibus I (CSRD/CSDDD)",
    "52025PC0836": "Digital Omnibus on AI (AI Act simplification)",
    # 52022PC0209 (CSAM Regulation proposal) is PDF-only in Cellar — add it
    # back once the PDF-text fallback lands (see backlog).
    # 52025PC0837 (Digital Omnibus — GDPR/ePrivacy/Data Act simplification) is
    # ambiguous in Cellar for both text/html and application/xhtml+xml
    # (content negotiation returns 300 Multiple Choices, not a clean single
    # manifestation) — same class of problem as the CSAM PDF-only gap. Its
    # sibling proposal COM(2025) 836 above fetches cleanly, so this appears to
    # be a per-document Cellar quirk, not a systemic negotiation bug. Revisit
    # once Cellar publishes a disambiguated manifestation, or a manifestation-
    # picking fallback (fetch the 300's choice list, take the first HTML one)
    # lands.
}


class EurLexKeyActsAdapter(EurLexAdapter):
    key = "eurlex_key_acts"
    name = "EUR-Lex — foundational tech acts (curated full texts)"
    jurisdiction = Jurisdiction.EU

    def discover(self, since: dt.date | None, cursor: dict | None) -> Iterable:
        # A fixed list, deliberately ignoring `since`: these must exist in the
        # corpus regardless of age. Dedup/versioning happens in the pipeline.
        from .base import DocRef

        for celex in KEY_ACTS:
            yield DocRef(
                external_id=celex,
                url=CELLAR_CONTENT_URL.format(celex=celex),
                # title deliberately unset: parse() extracts the official title
                # from the document itself, then we prefix the short name.
                hint={"celex": celex, "date": None, "type_uri": None},
            )

    def parse(self, raw):
        doc = super().parse(raw)
        short = KEY_ACTS.get(doc.external_id)
        if short:
            # Cellar's raw XML manifestations often have no real <p id="title">
            # (that convention is for HTML-rendered pages) and _extract_title()
            # falls back to the <title> tag, which for these is just the
            # manifestation filename (e.g. "L_2023150EN.01004001.xml" or, for
            # a COM proposal, "IMMC.COM%282025%29836...v7.docx") — not useful
            # in a citation. A real title always has whitespace; a raw
            # manifestation filename never does, regardless of its extension
            # — check for that instead of enumerating extensions one by one.
            looks_like_filename = " " not in doc.title.strip()
            if looks_like_filename:
                doc.title = short
            elif short.lower() not in doc.title.lower():
                doc.title = f"{short} — {doc.title}"
            doc.extra["short_name"] = short
        return doc
