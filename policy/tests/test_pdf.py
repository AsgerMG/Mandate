"""PDF rendering — the report markdown must survive the trip to bytes."""

from __future__ import annotations

from etl.intelligence.pdf import render_report_pdf

REPORT = """# Regulatory Exposure Report: Acme GmbH
## Executive summary
Acme is **in scope** of the AI Act.[1] Overall exposure: High — timelines are near-term.
## Exposure overview
| Instrument | Status | Applies? | Risk | Why |
|---|---|---|---|---|
| AI Act | In force | In scope | High | Credit scoring is Annex III[1] |
| GDPR | In force | In scope | High | Financial data at scale |
## Scope analysis
### AI Act — Regulation (EU) 2024/1689
As a *provider*, Acme falls under Annex III.[1]
- Conformity assessment before market placement
- Deadline: 2 August 2026 — budget €50k
## Recommended actions
- Next 90 days: gap-assess against Annex III duties
"""

CITATIONS = [
    {"n": 1, "celex": "32024R1689", "title": "AI Act", "url": "http://x/ai"},
    {"n": 1, "celex": "32024R1689", "title": "AI Act", "url": "http://x/ai"},  # dup collapses
]


def test_render_returns_valid_pdf():
    data = render_report_pdf("Acme GmbH", REPORT, CITATIONS)
    assert data.startswith(b"%PDF-")
    assert len(data) > 1500


def test_render_survives_unicode_and_empty_citations():
    md = "# Report: Ümlaut — GmbH\n## Summary\nCosts €1M — 'quoted' “fancy” … → done."
    data = render_report_pdf("Ümlaut — GmbH", md, [])
    assert data.startswith(b"%PDF-")


def test_render_handles_table_at_end_of_document():
    md = "# R\n## Overview\n| A | B |\n|---|---|\n| 1 | 2 |"
    data = render_report_pdf("Acme", md, [])
    assert data.startswith(b"%PDF-")
