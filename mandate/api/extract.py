"""Bytes -> text, for documents the agents research.

A version's text cannot be added after it is stored (grounding is append-only),
so extraction runs BEFORE the insert, inside mandate.grounding.fetch. What a
citation quotes is this text, so it must be deterministic for the same bytes:
no network, no model.

HTML: the readable text (scripts, styles, navigation chrome dropped), block
elements separated by newlines. PDF: pypdf when installed (the image installs
it; mandate/pyproject.toml [api]), else no text, which makes the version
uncitable rather than wrongly citable. Plain text and JSON pass through.
"""
from __future__ import annotations

import io
import re
from html.parser import HTMLParser

EXTRACTOR_HTML = "mandate-api/html-v1"
EXTRACTOR_PDF = "mandate-api/pypdf-v1"
EXTRACTOR_TEXT = "mandate-api/text-v1"

_SKIP = {"script", "style", "noscript", "template", "svg", "head", "nav", "footer", "form", "iframe"}
_BLOCK = {"p", "div", "section", "article", "li", "ul", "ol", "tr", "table", "br", "h1", "h2",
          "h3", "h4", "h5", "h6", "header", "main", "aside", "blockquote", "pre", "dd", "dt", "td",
          "th", "figcaption", "hr"}


class _Text(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip = 0
        self.title: str | None = None
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        if tag in _SKIP:
            self.skip += 1
        if tag == "title":
            self._in_title = True
        if tag in _BLOCK:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in _SKIP and self.skip:
            self.skip -= 1
        if tag == "title":
            self._in_title = False
        if tag in _BLOCK:
            self.parts.append("\n")

    def handle_data(self, data):
        if self._in_title and self.title is None and data.strip():
            self.title = " ".join(data.split())
        if not self.skip:
            self.parts.append(data)


def html_text(data: bytes) -> tuple[str, str | None]:
    """(text, title) of an HTML page."""
    p = _Text()
    p.feed(data.decode("utf-8", errors="replace"))
    raw = "".join(p.parts)
    lines = [" ".join(l.split()) for l in raw.splitlines()]
    text = "\n".join(l for l in lines if l)
    return text, p.title


def pdf_text(data: bytes) -> str | None:
    try:
        from pypdf import PdfReader  # noqa: PLC0415
    except ImportError:
        return None
    reader = PdfReader(io.BytesIO(data))
    pages = [(page.extract_text() or "") for page in reader.pages]
    return re.sub(r"[ \t]+", " ", "\n\n".join(pages)).strip() or None


def extractor(data: bytes, mime: str) -> tuple[str | None, str | None]:
    """The (text, extractor_name) callable mandate.grounding.fetch takes."""
    m = (mime or "").lower()
    if "html" in m or (not m.startswith("application/pdf") and data[:200].lstrip().lower().startswith((b"<!doctype html", b"<html"))):
        return html_text(data)[0], EXTRACTOR_HTML
    if m.startswith("application/pdf") or data[:5] == b"%PDF-":
        t = pdf_text(data)
        return (t, EXTRACTOR_PDF) if t else (None, None)
    if m.startswith("text/") or m in ("application/json", "application/xml"):
        return data.decode("utf-8", errors="replace"), EXTRACTOR_TEXT
    return None, None
