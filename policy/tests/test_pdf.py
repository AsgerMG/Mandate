"""PDF rendering — the report markdown must survive the trip to bytes."""

from __future__ import annotations

from etl.intelligence.pdf import _export_markdown, render_report_pdf

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


def test_export_markdown_truncates_appendix_and_strips_markers():
    # The PDF is the shareable executive artifact: appendix and citation
    # markers stay on the site (where sources list what they're used for),
    # never in the export.
    md = (
        "# Brief: Acme\n"
        "## Bottom line\n"
        "Acme is in scope.[1] Also relevant.[2, 3]\n"
        "## Appendix: Out of Scope Register\n"
        "| Instrument | Why | Change |\n"
        "|---|---|---|\n"
        "| MiCA | no crypto[4] | crypto launch |\n"
    )
    out = _export_markdown(md)
    assert "Appendix" not in out
    assert "MiCA" not in out
    assert "[1]" not in out and "[2, 3]" not in out
    assert "Acme is in scope. Also relevant." in out


def test_export_markdown_no_appendix_is_passthrough_minus_markers():
    md = "# Brief\n## Bottom line\nNo appendix here.[12]"
    assert _export_markdown(md) == "# Brief\n## Bottom line\nNo appendix here."
