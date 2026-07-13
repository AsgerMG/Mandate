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

from .eurlex import EurLexAdapter, cellar_content_url

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
    "52025PC0837": "Digital Omnibus (GDPR/ePrivacy/Data Act simplification)",
    "32023R1230": "Machinery Regulation",
    "52023PC0369": "Digital Euro Regulation proposal",
    "52026PC0100": "Industrial Accelerator Act proposal",
    "52026PC0502": "Cloud and AI Development Act (CADA) proposal",
    # 52022PC0209 (CSAM Regulation proposal) is PDF-only in Cellar — add it
    # back once the PDF-text fallback lands (see backlog).
    # The four entries above (837/369/0100/0502) all hit the exact ambiguous-
    # manifestation 300 this comment used to describe as unresolved — fixed
    # 2026-07-13 via HttpClient._resolve_ambiguous() (etl/http.py), which
    # fetches the 300 body's first stream_order item directly instead of
    # giving up. CSAM is a different failure mode (no HTML/XHTML manifestation
    # exists at all, so it 404s rather than 300s) and still needs the PDF-text
    # fallback.
    # Council/Commission Recommendations (2026-07-13) — non-binding but
    # authoritative, actively-referenced coordination frameworks in the
    # cybersecurity/critical-infrastructure space. `eurlex`'s general
    # discovery never surfaces these on its own: at the time these were
    # added, none of them were in the corpus despite matching TECH_SUBJECT_
    # TERMS on title, because they're older than any realistic backfill
    # window's first run — the exact same gap this file exists to close for
    # GDPR/DMA/AI Act.
    "32025H03445": "Council Recommendation — EU Blueprint for Cyber Crisis Management (2025)",
    "32024H04371": "Council Recommendation — Blueprint for a Coordinated Response to "
    "Critical Infrastructure Disruptions (2024)",
    "32023H0120(01)": "Council Recommendation — Coordinated Approach to Strengthen "
    "Critical Infrastructure Resilience (2022)",
    "32024H2659": "Commission Recommendation — Cyber-Surveillance Items Export Guidelines "
    "(2024)",
    # Corrected 2026-07-13: this CELEX was originally added under the label
    # "5G Cybersecurity Toolbox" — wrong. A live brief-generation test
    # (AutoForge Robotics) surfaced the model citing this instrument with
    # 2019/534's real 5G content attached to this one's number, which sent us
    # back to the source text: 32021H0946 is actually the Commission's
    # toolbox recommendation for the European Digital Identity Framework
    # (eIDAS2-adjacent), not 5G security at all. No standalone numbered
    # Recommendation for the real "5G Cybersecurity Toolbox" (the NIS
    # Cooperation Group's Jan-2020 report) was found — it was endorsed via
    # Council conclusions/a joint Commission-ENISA communication, not issued
    # as its own CELEX instrument, so it isn't re-added under another id.
    "32021H0946": "Commission Recommendation — European Digital Identity Framework Toolbox (2021)",
    "32021H1086": "Commission Recommendation — Joint Cyber Unit (2021)",
    "32019H0534": "Commission Recommendation — Cybersecurity of 5G Networks (2019)",
    # Machinery Directive 2006/42/EC (2026-07-13) — the Machinery Regulation
    # (32023R1230, above) doesn't apply until 20 January 2027; until then
    # THIS is the currently-in-force law a company's machinery must comply
    # with. Added after a live keyword sweep for "machinery"/"robot"/
    # "automation" etc. against ALL of Cellar (see backlog) found this to be
    # the one genuinely load-bearing gap — everything else the sweep
    # surfaced was merger-control notices (e.g. "SBG / ABB ROBOTICS") or
    # implementing-decision corrigenda, not standalone instruments worth a
    # KEY_ACTS entry.
    "32006L0042": "Machinery Directive (2006/42/EC, in force until Jan 2027)",
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
                url=cellar_content_url(celex),
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
