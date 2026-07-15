"""Render the regulatory intelligence report as a PDF.

The briefing arrives as constrained Markdown (headings, tables, bullets,
bold, ``[n]`` footnote markers — see the system prompt in briefing.py), so a
small line-based renderer covers it without an HTML engine. Core PDF fonts are
Latin-1, so text is sanitized through a lookup of the typographic characters
Claude actually emits.

The PDF is the shareable executive artifact: the Out-of-Scope appendix,
the sources list, and inline citation markers are deliberately stripped
(``_export_markdown``) — full traceability lives on the website, where each
source lists the exact claims it supports.
"""

from __future__ import annotations

import re
from datetime import date

from fpdf import FPDF
from fpdf.fonts import FontFace

INK = (30, 33, 40)
MUTED = (110, 116, 128)
ACCENT = (31, 61, 122)  # deep institutional blue — text only, never a fill
RULE = (205, 208, 215)  # the one line weight in the document; no color fills anywhere

_UNICODE_FALLBACKS = str.maketrans(
    {
        "—": "-",  # em dash
        "–": "-",  # en dash
        "‘": "'",
        "’": "'",
        "“": '"',
        "”": '"',
        "…": "...",
        "•": "-",
        "€": "EUR ",
        " ": " ",
        "→": "->",
    }
)


def _safe(text: str) -> str:
    text = text.translate(_UNICODE_FALLBACKS)
    return text.encode("latin-1", "replace").decode("latin-1")


_CITATION_MARKER = re.compile(r"\[\d+(?:,\s*\d+)*\]")


def _export_markdown(briefing: str) -> str:
    """The export view of the briefing: appendix truncated, citation markers
    stripped. With no sources list in the PDF the markers would dangle, and
    the appendix is a coverage register for the site, not the executive read."""
    lines = briefing.splitlines()
    for i, line in enumerate(lines):
        if line.lstrip().startswith("## Appendix:"):
            lines = lines[:i]
            break
    return _CITATION_MARKER.sub("", "\n".join(lines)).rstrip()


def _fpdf_markdown(text: str) -> str:
    """Our Markdown uses *italic*; fpdf2's inline markdown wants __italic__.
    **bold** is shared syntax and passes through."""
    out, parts = text.split("**"), []
    for i, chunk in enumerate(out):
        if i % 2 == 0:
            chunk = chunk.replace("*", "")  # stray single stars confuse fpdf2
        parts.append(chunk)
    return "**".join(parts)


class ReportPDF(FPDF):
    """A4 report with a running header band and numbered footer."""

    def __init__(self, company: str):
        super().__init__(format="A4")
        self.company = _safe(company)
        self.set_margins(20, 24, 20)
        self.set_auto_page_break(True, margin=22)

    def header(self) -> None:
        self.set_font("helvetica", "B", 8)
        self.set_text_color(*ACCENT)
        self.cell(0, 5, "EUROPOLTRACKER", align="L")
        self.set_font("helvetica", "", 8)
        self.set_text_color(*MUTED)
        self.cell(0, 5, f"Regulatory Intelligence Brief - {self.company}", align="R")
        self.ln(7)
        self.set_draw_color(*RULE)
        self.set_line_width(0.2)
        self.line(20, self.get_y(), 190, self.get_y())
        self.ln(6)

    def footer(self) -> None:
        self.set_y(-16)
        self.set_font("helvetica", "I", 7)
        self.set_text_color(*MUTED)
        self.cell(
            0,
            4,
            "Prepared from official EU sources. Informational analysis, not legal advice.",
            align="L",
        )
        self.cell(0, 4, f"Page {self.page_no()}/{{nb}}", align="R")


def _flush_table(pdf: ReportPDF, rows: list[list[str]]) -> None:
    if not rows:
        return
    pdf.set_font("helvetica", "", 8.5)
    pdf.set_text_color(*INK)
    pdf.set_draw_color(*RULE)
    pdf.set_line_width(0.15)
    # Instrument | Prio | Verdict | Why / Trigger — Prio is a single digit;
    # Why/Trigger takes the spare width.
    widths = [1.0] * len(rows[0])
    if len(rows[0]) == 4:
        widths = [1.5, 0.5, 0.9, 3.1]
    elif len(rows[0]) >= 5:
        widths = [1.6, 0.9, 0.9, 0.7, 2.2][: len(rows[0])]
    # No fill anywhere — a bare header row set off by rule weight, not color, is the
    # difference between a printed institutional table and a spreadsheet export.
    headings = FontFace(emphasis="BOLD", color=INK)
    with pdf.table(
        col_widths=widths,
        borders_layout="HORIZONTAL_LINES",
        text_align="LEFT",
        line_height=4.8,
        padding=1.8,
        headings_style=headings,
        markdown=True,  # cells commonly carry **In Scope** / **Monitor**
    ) as table:
        for row in rows:
            table.row(cells=[_safe(c) for c in row])
    pdf.ln(3)


def _split_table_row(line: str) -> list[str]:
    return [c.strip() for c in line.strip().strip("|").split("|")]


def render_report_pdf(
    company: str,
    briefing: str,
    citations: list[dict],
    generated: date | None = None,
) -> bytes:
    """Markdown report → PDF bytes (export view: no appendix, no citations).

    ``citations`` is accepted for call-site compatibility but no longer
    rendered — the sources block and inline markers are site-only."""
    del citations
    briefing = _export_markdown(briefing)
    pdf = ReportPDF(company)
    pdf.add_page()
    generated = generated or date.today()

    table_rows: list[list[str]] = []
    for raw in briefing.splitlines():
        line = raw.rstrip()
        is_table = line.lstrip().startswith("|")
        if table_rows and not is_table:
            _flush_table(pdf, table_rows)
            table_rows = []

        if not line.strip():
            continue
        if is_table:
            cells = _split_table_row(line)
            if not all(set(c) <= {"-", ":", " ", ""} or not c for c in cells):  # skip |---|
                table_rows.append(cells)
            continue
        if line.startswith("# "):
            pdf.set_font("helvetica", "B", 19)
            pdf.set_text_color(*INK)
            pdf.multi_cell(0, 8, _safe(line[2:]), new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("helvetica", "", 9.5)
            pdf.set_text_color(*MUTED)
            pdf.cell(0, 6, _safe(f"Prepared {generated.strftime('%d %B %Y')}"))
            pdf.ln(10)
            continue
        if line.startswith("## "):
            pdf.ln(5)
            pdf.set_font("helvetica", "B", 10.5)
            pdf.set_text_color(*ACCENT)
            pdf.set_char_spacing(0.6)
            pdf.multi_cell(0, 5.5, _safe(line[3:]).upper(), new_x="LMARGIN", new_y="NEXT")
            pdf.set_char_spacing(0)
            pdf.set_draw_color(*RULE)
            pdf.set_line_width(0.2)
            pdf.line(20, pdf.get_y() + 1, 190, pdf.get_y() + 1)
            pdf.ln(4.5)
            continue
        if line.startswith("### "):
            pdf.ln(2)
            pdf.set_font("helvetica", "B", 10.5)
            pdf.set_text_color(*INK)
            pdf.multi_cell(0, 5.5, _safe(line[4:]), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1.5)
            continue
        stripped = line.lstrip()
        if stripped.startswith(("- ", "* ")):
            pdf.set_font("helvetica", "", 9.5)
            pdf.set_text_color(*INK)
            pdf.set_x(24)
            pdf.multi_cell(
                162,
                4.9,
                _safe(_fpdf_markdown("- " + stripped[2:])),
                new_x="LMARGIN",
                new_y="NEXT",
                markdown=True,
            )
            pdf.ln(0.8)
            continue
        pdf.set_font("helvetica", "", 9.5)
        pdf.set_text_color(*INK)
        pdf.multi_cell(
            0, 4.9, _safe(_fpdf_markdown(line)), new_x="LMARGIN", new_y="NEXT", markdown=True
        )
        pdf.ln(1.6)
    _flush_table(pdf, table_rows)

    return bytes(pdf.output())
