"""Extract direct-partner data from IPCEI Commission decision PDFs.

Layout families:
  - Modern (2022+): per-country tables with 'Financial figures in EUR million'
  - Legacy (2018–2021): per-country tables with 'State aid per company in 1000 €'
  - Micro-2018: country name in first cell; caption format differs

Country detection searches above and below each table.
Continuation tables (page-broken, no repeated full header) are detected when a
country caption is found near a table with range-like values.

Run modes:
  python extract_ipcei.py              → CSV only (no DB write)
  python extract_ipcei.py --load-db    → CSV + match + load into db.sqlite
"""
from __future__ import annotations


# --- ETL path bootstrap (auto-added; see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from europe_scope import COUNTRY_NAME_TO_ISO2  # noqa: E402
from etl_env import DB as _ETL_DB, ROOT as _ETL_ROOT  # noqa: E402,F401
from store import connect  # noqa: E402
# --- end ETL path bootstrap ---

import csv
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

import pdfplumber

BASE_DIR = _ETL_ROOT
PDF_DIR = BASE_DIR / "data" / "raw" / "ipcei"
OUT_DIR = BASE_DIR / "data" / "processed"
OUT_DIR.mkdir(parents=True, exist_ok=True)
CSV_PATH = OUT_DIR / "ipcei_partners.csv"

# COUNTRY_TO_ISO moved to ETL/lib/europe_scope.py. Four extractors each carried
# their own copy of this dict and they had drifted in coverage -- eight
# names were missing from at least one, and an unresolvable name writes a
# NULL country rather than raising. One copy now, imported.
COUNTRY_TO_ISO = COUNTRY_NAME_TO_ISO2

ISO_SET = set(COUNTRY_TO_ISO.values())

# Canonical source codes — methodology.md must match this table.
# unit: "M" = EUR million (×1e6), "K" = EUR thousands (×1000), "SK" = SEK thousands
# tuple: (source, sa_case, sector, unit)
PROGRAM_META: dict[str, tuple[str, str, str, str]] = {
    "ipcei_micro_2018.pdf":     ("ipcei_micro",      "SA.46705",   "deeptech_hardware", "K"),
    "ipcei_batteries_2019.pdf": ("ipcei_batteries",  "SA.54794",   "cleantech",         "K"),
    "ipcei_eubatin_2021.pdf":   ("ipcei_eubatin",    "SA.55831",   "cleantech",         "K"),
    "ipcei_hy2tech_2022.pdf":   ("ipcei_hy2tech",    "SA.64647",   "cleantech",         "M"),
    "ipcei_hy2use_2022.pdf":    ("ipcei_hy2use",     "SA.64650",   "cleantech",         "M"),
    "ipcei_mect_2023.pdf":      ("ipcei_mect",       "SA.101129",  "deeptech_hardware", "M"),
    "ipcei_cloud_2023.pdf":     ("ipcei_cloud",      "SA.102517",  "digital",           "M"),
    "ipcei_hy2infra_2024.pdf":  ("ipcei_hy2infra",   "SA.102825",  "cleantech",         "M"),
    "ipcei_hy2move_2024.pdf":   ("ipcei_hy2move",    "SA.104676",  "cleantech",         "M"),
    "ipcei_med4cure_2024.pdf":  ("ipcei_med4cure",   "SA.104974",  "life_sciences",     "M"),
    "ipcei_tech4cure_2025.pdf": ("ipcei_tech4cure",  "SA.113212",  "life_sciences",     "M"),
}

# EC Commission decision dates (project_started) — these are the official approval dates
# for each IPCEI, i.e. when state aid was authorised and projects could legally begin.
# Source: EC presscorner press releases and competition-cases.ec.europa.eu
IPCEI_DECISION_DATES: dict[str, str] = {
    "ipcei_micro":     "2018-12-18",
    "ipcei_batteries": "2019-12-09",
    "ipcei_eubatin":   "2021-01-26",
    "ipcei_hy2tech":   "2022-07-15",
    "ipcei_hy2use":    "2022-09-21",
    "ipcei_mect":      "2023-06-08",
    "ipcei_cloud":     "2023-12-05",
    "ipcei_hy2infra":  "2024-02-15",
    "ipcei_hy2move":   "2024-05-28",
    "ipcei_med4cure":  "2024-05-28",
    "ipcei_tech4cure": "2025-07-22",
}

DB_PATH = _ETL_DB

# Commission decision PDF URLs (for raw_source_url field)
PDF_URLS: dict[str, str] = {
    "ipcei_micro":     "https://ec.europa.eu/competition/state_aid/cases/269681/269681_2025986_423_2.pdf",
    "ipcei_batteries": "https://ec.europa.eu/competition/state_aid/cases/272698/272698_2157525_551_2.pdf",
    "ipcei_eubatin":   "https://ec.europa.eu/competition/state_aid/cases/280426/280426_2315534_648_2.pdf",
    "ipcei_hy2tech":   "https://ec.europa.eu/competition/state_aid/cases/288365/288365_2453714_719_2.pdf",
    "ipcei_hy2use":    "https://ec.europa.eu/competition/state_aid/cases/288366/288366_2453802_728_2.pdf",
    "ipcei_mect":      "https://ec.europa.eu/competition/state_aid/cases/301440/301440_2626920_783_2.pdf",
    "ipcei_cloud":     "https://ec.europa.eu/competition/state_aid/cases/302040/302040_2626931_806_2.pdf",
    "ipcei_hy2infra":  "https://ec.europa.eu/competition/state_aid/cases/307461/307461_2767044_844_2.pdf",
    "ipcei_hy2move":   "https://ec.europa.eu/competition/state_aid/cases/308248/308248_2782154_853_2.pdf",
    "ipcei_med4cure":  "https://ec.europa.eu/competition/state_aid/cases/308249/308249_2782163_862_2.pdf",
    "ipcei_tech4cure": "https://ec.europa.eu/competition/state_aid/cases/319038/319038_2945821_912_2.pdf",
}

# Sweden Batteries 2019 is in SEK, not EUR — flag those rows
SEK_SOURCES_COUNTRIES = {("ipcei_batteries", "SE")}

# Captions above/below financial tables (modern + legacy + Hy2Use style).
CAPTION_RE = re.compile(
    r"Table\s+\d+[\w\s]*\s*[-:–—]\s*"
    r"([A-Z][A-Za-z ]+?)"
    r"\s*[-–—]\s*"
    r"(?:State aid|Financial figures|Total\b)",
    re.IGNORECASE,
)

# Hy2Infra project codes: "DE43A - EWE HYDROGEN GmbH"
PROJECT_CODE_RE = re.compile(r"^([A-Z]{2}\d+[A-Z]?)\s*[-–]\s+(.+)$", re.DOTALL)

# Exact-match header tokens (case-insensitive, after _clean)
HEADER_SINGLES = frozenset({
    "aid", "r&d", "r&d&i", "rdi", "rdni", "fid", "npv", "net", "present",
    "value", "direct", "amount", "cost", "costs", "gap", "eur", "euro",
    "million", "nominal", "discounted", "eligible", "funding", "state",
    "total", "sum", "participant", "undertaking", "project", "company",
    "maximum", "estimated", "sub-total", "all projects", "grand total",
    "ws", "ws1", "ws2", "ws3", "ws4",
    "eur million",  # totals header in some modern tables (e.g. Hy2Move)
})

# Partial-match header keywords
HEADER_KEYWORDS = frozenset({
    "eligible costs", "funding gap", "state aid", "million eur", "million euro",
    "(nominal)", "(discounted)", "(npv)", "net present", "undertaking",
    "direct participant", "r&d&i", "financial figures",
    "total ipcei",  # aggregate rows like "Total IPCEI CIS"
})

SKIP_NAMES = frozenset({
    "total", "sum", "all projects", "sub-total", "grand total",
    "sum total", "sub total",
})

_FOOTNOTE_PAREN_RE = re.compile(r"\s*\(\d{1,3}\)$")
_FOOTNOTE_PLAIN_RE = re.compile(r"\d{1,3}$")


# ---------------------------------------------------------------------------
# Basic helpers
# ---------------------------------------------------------------------------

def _clean(s) -> str:
    if s is None:
        return ""
    return " ".join(str(s).split())


def _strip_footnote(s: str) -> str:
    """Remove trailing footnote markers.

    Two passes:
      1. Remove '(N)' notation (always safe): 'GF (19)' → 'GF', 'STM-FR (20)' → 'STM-FR'
      2. Remove plain trailing digits only if the resulting string has ≥ 3 chars,
         to avoid stripping digits that are part of the name: 'mi2' stays 'mi2'
         but 'Umicore17' → 'Umicore'.
    """
    s = _FOOTNOTE_PAREN_RE.sub("", s).strip()
    stripped = _FOOTNOTE_PLAIN_RE.sub("", s).strip()
    return stripped if len(stripped) >= 3 else s


def is_range_str(s: str) -> bool:
    s = s.strip()
    return bool(
        re.match(r"^\[", s)            # [20-30] or [10.000 –  (opening fragment)
        or re.match(r"^-\s*\[", s)    # -[30-40]
        or s in {"…", "[…]", "[...]", "-", "–", "—"}
    )


def is_range_fragment(s: str) -> bool:
    """Closing range fragments: '200]', '-10.000]'."""
    return bool(re.match(r"^[-\d\s,.]+\]$", s.strip()))


def is_rownum(s: str) -> bool:
    return bool(re.match(r"^\d{1,2}\.$", s.strip()))


def is_header_like(s: str) -> bool:
    sl = s.lower().strip()
    if not sl:
        return True
    # Range fragments/strings are NOT headers
    if is_range_str(sl) or is_range_fragment(sl):
        return False
    if sl in HEADER_SINGLES:
        return True
    for kw in HEADER_KEYWORDS:
        if kw in sl:
            return True
    # Purely parenthetical fragments: "(nominal)", "al)", "(npv)"
    # Only flag if string STARTS with '(' OR ends with ')' with NO '(' inside —
    # the latter catches closing fragments like "al)" but not "X-FAB (DE)".
    if sl.startswith("(") or (sl.endswith(")") and "(" not in sl):
        return len(sl) < 15
    # Closing bracket fragment that is not a range
    if sl.endswith("]") and not sl.startswith("["):
        return True
    # Single-character strings are always fragments, not company names
    if len(sl) <= 1:
        return True
    return False


def parse_amount(s: str | None) -> float | None:
    if not s:
        return None
    s = _clean(s).rstrip("*").strip()
    if not s or is_range_str(s) or is_range_fragment(s):
        return None
    s = s.replace(" ", "")
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    s = re.sub(r"[^\d.]", "", s)
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def extract_name_and_sa(cells: list[str]) -> tuple[str, str | None] | None:
    """Return (company_name, sa_raw) from a cleaned cell list, or None to skip."""
    if not cells:
        return None
    if is_rownum(cells[0]):
        cells = cells[1:]
    if not cells:
        return None

    name = _strip_footnote(cells[0])
    if is_range_fragment(name) or is_range_str(name) or is_header_like(name):
        return None
    if name.lower() in SKIP_NAMES:
        return None
    # Truncated aggregate rows: 'Tota' is a prefix of 'total', 'Gran' of 'grand total'
    if len(name) >= 3 and any(s.startswith(name.lower()) for s in SKIP_NAMES):
        return None
    if name.upper() in ISO_SET:
        return None
    # Country names (e.g. 'Belgium' in workstream tables) are not companies
    if name in COUNTRY_TO_ISO:
        return None
    # Purely numeric cells are aggregate rows, not company names
    if re.match(r"^[\d.,\s]+$", name):
        return None
    if len(name) <= 1:
        return None

    data_cells = cells[1:]
    found_range = False
    sa_raw: str | None = None

    for cell in data_cells:
        if is_range_str(cell) or is_range_fragment(cell):
            found_range = True
            continue
        amt = parse_amount(cell)
        if amt is not None and amt > 0 and found_range:
            sa_raw = cell
            break

    return name, sa_raw


# ---------------------------------------------------------------------------
# Table detection helpers
# ---------------------------------------------------------------------------

def is_financial_table(rows: list[list]) -> bool:
    if not rows or len(rows) < 2:
        return False

    # Legacy Micro-2018/Batteries style: first cell is a country name
    first_cell = _clean(rows[0][0]) if rows[0] else ""
    if first_cell in COUNTRY_TO_ISO:
        combined = " ".join(_clean(c).lower() for row in rows[:4] for c in row if _clean(c))
        if any(k in combined for k in ("state aid", "eligible costs", "aid amount", "aid amounts", "eligible")):
            return True

    header_text = " ".join(_clean(c).lower() for row in rows[:6] for c in row if _clean(c))
    has_partner = any(k in header_text for k in (
        "undertaking", "direct participant", "project – undertaking",
        "project - undertaking", "company",
    ))
    has_state_aid = "state aid" in header_text
    has_eligible = "eligible" in header_text
    has_million = "million" in header_text
    has_nominal = "nominal" in header_text

    if has_partner and has_state_aid and (has_eligible or has_million):
        return True
    # Legacy Batteries/EuBatIn: 'state aid nominal' + 'eligible' without 'undertaking'
    if has_state_aid and has_nominal and has_eligible and len(rows) >= 3:
        return True

    return False


def find_header_end(rows: list[list]) -> int:
    """Return index of last header row; data starts at index+1.
    Stops immediately on first non-header data row.
    Returns -1 if first row looks like data already.
    """
    last_header = -1
    for i, row in enumerate(rows[:12]):
        cells = [_clean(c) for c in row if _clean(c)]
        if not cells:
            # Empty row: extends header block only if immediately following a header
            if last_header == i - 1:
                last_header = i
            continue
        if all(is_header_like(c) for c in cells):
            last_header = i
        elif i == 0 and any(is_header_like(c) for c in cells):
            # First row with mixed content may still be a spanning header
            last_header = i
        else:
            break  # First genuine data row
    return last_header


def find_sa_name_cols(rows: list[list]) -> tuple[int | None, int | None]:
    """Return (name_col, sa_nom_col) from header rows."""
    name_col: int | None = None
    sa_col: int | None = None
    n_rows = min(len(rows), 6)
    n_cols = max((len(r) for r in rows[:n_rows]), default=0)

    col_texts: list[str] = []
    for ci in range(n_cols):
        parts = []
        for ri in range(n_rows):
            if ci < len(rows[ri]) and rows[ri][ci]:
                parts.append(_clean(rows[ri][ci]).lower())
        col_texts.append(" ".join(parts))

    for ci, ct in enumerate(col_texts):
        if any(k in ct for k in (
            "undertaking", "direct participant", "project – undertaking",
            "project - undertaking", "company",
        )):
            if name_col is None or ci < name_col:
                name_col = ci

    for ci, ct in enumerate(col_texts):
        if "state aid" in ct and "nominal" in ct:
            clean = ct.replace("discounted", "").replace("npv", "")
            if "state aid" in clean and "nominal" in clean:
                if sa_col is None or ci > sa_col:
                    sa_col = ci

    if sa_col is None:
        for ci, ct in enumerate(col_texts):
            if "state aid" in ct:
                for offset in range(-2, 3):
                    ni = ci + offset
                    if 0 <= ni < len(col_texts) and "nominal" in col_texts[ni]:
                        if sa_col is None or ci > sa_col:
                            sa_col = ci
                        break

    return name_col, sa_col


def get_country_from_caption(
    page, bbox, pdf_pages=None, page_idx: int | None = None
) -> str | None:
    """Search for a country caption around the table.

    Search order (stops at first hit):
      1. Below the table on the current page  (captions below data, e.g. Hy2Use)
      2. Top of the NEXT page                 (for tables cut at page bottom)
      3. Above the table on the current page, taking the LAST match (closest to
         the table top), for PDFs where captions precede data (e.g. MECT).
    """
    pw, ph = page.width, page.height

    # 1. Below current page
    top_b = max(0, bbox[3] - 5)
    bot_b = min(ph, bbox[3] + 300)
    if top_b < bot_b:
        try:
            text = page.crop((0, top_b, pw, bot_b)).extract_text() or ""
        except Exception:
            text = ""
        m = CAPTION_RE.search(text)
        if m:
            iso = COUNTRY_TO_ISO.get(m.group(1).strip())
            if iso:
                return iso

    # 2. Top of next page
    if pdf_pages is not None and page_idx is not None:
        next_idx = page_idx + 1
        if next_idx < len(pdf_pages):
            try:
                np_ = pdf_pages[next_idx]
                text = np_.crop((0, 0, np_.width, 200)).extract_text() or ""
            except Exception:
                text = ""
            m = CAPTION_RE.search(text)
            if m:
                iso = COUNTRY_TO_ISO.get(m.group(1).strip())
                if iso:
                    return iso

    # 3. Above current page — take LAST match (closest to the table top)
    top_a = max(0, bbox[1] - 120)
    bot_a = bbox[1] + 5
    if top_a < bot_a:
        try:
            text = page.crop((0, top_a, pw, bot_a)).extract_text() or ""
        except Exception:
            text = ""
        for country_name in reversed(CAPTION_RE.findall(text)):
            iso = COUNTRY_TO_ISO.get(country_name.strip())
            if iso:
                return iso

    return None


def split_project_code(name: str) -> tuple[str, str]:
    """'DE43A - EWE HYDROGEN GmbH' → ('DE43A', 'EWE HYDROGEN GmbH')."""
    m = PROJECT_CODE_RE.match(name)
    if m and m.group(1)[:2] in ISO_SET:
        return m.group(1), _clean(m.group(2))
    return "", name


# ---------------------------------------------------------------------------
# Per-table extractor
# ---------------------------------------------------------------------------

def extract_table_rows(
    rows: list[list],
    country_iso: str | None,
    source: str,
    sa_case: str,
    unit: str,
    page_num: int,
    seen: set[tuple[str, str]],
) -> list[dict]:
    if not rows or not country_iso:
        return []
    out: list[dict] = []

    # --- Micro-2018 / Legacy: country name in rows[0][0] ---
    first_cell = _clean(rows[0][0]) if rows[0] else ""
    if first_cell in COUNTRY_TO_ISO:
        country_iso = COUNTRY_TO_ISO[first_cell]
        remaining = rows[1:]
        sub_header_end = find_header_end(remaining)
        data_rows = remaining[sub_header_end + 1:]
    else:
        header_end = find_header_end(rows)
        data_rows = rows[header_end + 1:]

    if not data_rows:
        return []

    name_col, sa_col = find_sa_name_cols(rows)

    pending_name: str | None = None
    pending_sa: str | None = None
    prev_rownum: str | None = None  # tracks last seen row-number token

    for row in data_rows:
        raw_cells = row if row else []

        # --- Same-rownum continuation (e.g. "Thermo" / "Fisher" split in MECT) ---
        cells_clean = [_clean(c) for c in raw_cells if _clean(c)]
        curr_rownum = cells_clean[0] if cells_clean and is_rownum(cells_clean[0]) else None

        if curr_rownum is not None and curr_rownum == prev_rownum and pending_name is not None:
            data_part = cells_clean[1:]
            if data_part:
                dp0 = data_part[0]
                dp0_stripped = _strip_footnote(dp0)
                # Skip: ISO country codes (e.g. 'FR', 'RO') or same name repeated
                is_country_code = dp0.upper() in ISO_SET
                is_duplicate = dp0_stripped.lower() == pending_name.lower()
                if not is_country_code and not is_duplicate and not is_header_like(dp0):
                    pending_name = pending_name + " " + dp0_stripped
            # Either appended or was a duplicate/country-code — skip to next row
            continue

        if curr_rownum is not None:
            prev_rownum = curr_rownum

        # --- Multi-company cell detection (newline-packed, e.g. Hy2Move FR) ---
        if (
            name_col is not None
            and name_col < len(raw_cells)
            and raw_cells[name_col] is not None
            and "\n" in str(raw_cells[name_col])
        ):
            name_lines_raw = [
                _strip_footnote(n.strip())
                for n in str(raw_cells[name_col]).split("\n")
                if n.strip()
            ]

            # Find the SA column: prefer detected sa_col, but fall back to any
            # column with the right count of numeric values (handles table layouts
            # where pdfplumber's column detection misaligns header vs data columns).
            def _get_valid_sa(col_idx: int) -> list[str]:
                if col_idx is None or col_idx >= len(raw_cells) or not raw_cells[col_idx]:
                    return []
                lines = [s.strip() for s in str(raw_cells[col_idx]).split("\n") if s.strip()]
                return [
                    s for s in lines
                    if not is_range_fragment(s)
                    and not is_range_str(s)
                    and parse_amount(s) is not None
                ]

            valid_sa = _get_valid_sa(sa_col) if sa_col is not None else []
            if len(valid_sa) != len(name_lines_raw):
                # Fallback: scan every column for the right count of amounts
                for ci in range(len(raw_cells)):
                    if ci == name_col or ci == sa_col:
                        continue
                    candidate = _get_valid_sa(ci)
                    if len(candidate) == len(name_lines_raw):
                        valid_sa = candidate
                        break

            is_multi = len(valid_sa) > 1 and len(valid_sa) == len(name_lines_raw)

            if is_multi:
                # Multiple companies packed in one cell (Hy2Move France style)
                _flush_pending(pending_name, pending_sa, country_iso, source,
                               sa_case, unit, page_num, seen, out)
                pending_name, pending_sa = None, None
                for i, n in enumerate(name_lines_raw):
                    if not is_header_like(n) and n.lower() not in SKIP_NAMES:
                        sa = valid_sa[i] if i < len(valid_sa) else None
                        _maybe_add(n, sa, country_iso, source, sa_case, unit,
                                   page_num, seen, out)
                continue
            # Else: fall through to standard processing (single multi-line name)

        # --- Standard row ---
        cells = [_clean(c) for c in raw_cells if _clean(c)]
        if not cells:
            continue

        # All closing range fragments → skip
        if all(is_range_fragment(c) or is_range_str(c) for c in cells):
            continue

        # Single-cell row: company name continuation or duplicate
        if len(cells) == 1:
            c = _strip_footnote(cells[0])
            if (
                pending_name is not None
                and not is_header_like(c)
                and c.lower() not in SKIP_NAMES
                and not is_range_str(c)
                and not is_range_fragment(c)
            ):
                if c.lower() == pending_name.lower():
                    # Duplicate row (R&D&I / FID split in legacy tables) — skip
                    continue
                # Genuine continuation (part 2 of a multi-line company name)
                pending_name = pending_name + " " + c
                continue
            # New single-cell entry
            _flush_pending(pending_name, pending_sa, country_iso, source,
                           sa_case, unit, page_num, seen, out)
            pending_name, pending_sa = None, None
            if not is_header_like(c) and c.lower() not in SKIP_NAMES and not is_range_fragment(c):
                pending_name, pending_sa = c, None
            continue

        # Normal multi-cell row
        _flush_pending(pending_name, pending_sa, country_iso, source,
                       sa_case, unit, page_num, seen, out)
        pending_name, pending_sa = None, None

        result = extract_name_and_sa(cells)
        if result is None:
            continue
        name, sa_raw = result
        if name:
            pending_name = name
            pending_sa = sa_raw

    _flush_pending(pending_name, pending_sa, country_iso, source,
                   sa_case, unit, page_num, seen, out)
    return out


def _flush_pending(
    raw_name: str | None,
    sa_raw: str | None,
    country_iso: str | None,
    source: str,
    sa_case: str,
    unit: str,
    page_num: int,
    seen: set[tuple[str, str]],
    out: list[dict],
) -> None:
    if raw_name is None:
        return
    _maybe_add(raw_name, sa_raw, country_iso, source, sa_case, unit,
               page_num, seen, out)


def _maybe_add(
    raw_name: str,
    sa_raw: str | None,
    country_iso: str | None,
    source: str,
    sa_case: str,
    unit: str,
    page_num: int,
    seen: set[tuple[str, str]],
    out: list[dict],
) -> None:
    if not raw_name:
        return

    # Project code country always overrides caption country (Hy2Infra)
    project_code, clean_name = split_project_code(raw_name)
    if project_code and project_code[:2] in ISO_SET:
        country_iso = project_code[:2]

    if not country_iso or not clean_name:
        return

    clean_name = _strip_footnote(clean_name)
    # Strip trailing punctuation artifacts from PDF formatting (e.g. "Semikron -")
    clean_name = clean_name.rstrip(" -").strip()
    if not clean_name:
        return
    if clean_name.upper() in ISO_SET:
        return
    if clean_name.lower() in SKIP_NAMES:
        return
    if is_header_like(clean_name):
        return

    dedup_key = (clean_name.lower(), country_iso)
    if dedup_key in seen:
        return
    seen.add(dedup_key)

    is_sek = (source, country_iso) in SEK_SOURCES_COUNTRIES

    is_redacted = int(
        sa_raw is None or sa_raw == ""
        or is_range_str(sa_raw)
        or is_range_fragment(sa_raw)
        or is_sek
    )
    is_rng = int(
        sa_raw is not None
        and (is_range_str(sa_raw) or is_range_fragment(sa_raw))
    )

    raw_amount = parse_amount(sa_raw) if sa_raw and not is_sek else None
    if raw_amount is not None:
        multiplier = {"M": 1_000_000, "K": 1_000}.get(unit, 1)
        sa_eur = raw_amount * multiplier
    else:
        sa_eur = None

    out.append({
        "source": source,
        "sa_case": sa_case,
        "country": country_iso,
        "name": clean_name,
        "project_code": project_code,
        "aid_amount_raw": sa_raw or "",
        "aid_amount_eur": sa_eur,
        "aid_amount_is_range": is_rng,
        "aid_amount_redacted": is_redacted,
        "role": "direct",
        "page": page_num,
    })


# ---------------------------------------------------------------------------
# Main per-PDF extractor
# ---------------------------------------------------------------------------

def extract_from_pdf(pdf_path: Path, source: str, sa_case: str, unit: str) -> list[dict]:
    rows_out: list[dict] = []
    seen: set[tuple[str, str]] = set()

    with pdfplumber.open(pdf_path) as pdf:
        pages = pdf.pages
        for page_idx, page in enumerate(pages):
            page_num = page_idx + 1
            for ft in page.find_tables():
                rows = ft.extract()
                if not rows or len(rows) < 2:
                    continue

                is_ft = is_financial_table(rows)
                country_iso = get_country_from_caption(
                    page, ft.bbox, pages, page_idx
                )

                # Micro-2018 / legacy: country in first cell
                if not country_iso and rows and _clean(rows[0][0]) in COUNTRY_TO_ISO:
                    country_iso = COUNTRY_TO_ISO[_clean(rows[0][0])]

                # Continuation table: not financial by header, but country found and
                # has range-like cell values (page-broken financial table).
                # Allow 2 rows minimum (handles short continuation tables like CorWave).
                # Require data (not all-header) in the first row to exclude workstream
                # summary tables (like the Batteries 2019 WS overview).
                _first_cells = [_clean(c) for c in rows[0] if _clean(c)] if rows else []
                _first_row_is_data = bool(_first_cells) and not all(
                    is_header_like(c) for c in _first_cells
                )
                is_cont = (
                    not is_ft
                    and country_iso is not None
                    and len(rows) >= 2
                    and _first_row_is_data
                    and any(
                        is_range_str(_clean(c)) or is_range_fragment(_clean(c))
                        for row in rows[:4]
                        for c in row
                        if _clean(c)
                    )
                )

                if is_ft or is_cont:
                    new_rows = extract_table_rows(
                        rows, country_iso, source, sa_case, unit, page_num, seen
                    )
                    rows_out.extend(new_rows)

    return rows_out


# ---------------------------------------------------------------------------
# Name normalisation
# ---------------------------------------------------------------------------

# Legal-form suffixes to strip when building a canonical matching key.
# Patterns are word-boundary anchored so partial matches inside names are safe.
_NORM_LEGAL_RE = re.compile(
    r"\b(?:GmbH|gGmbH|mbH|AG|KG|UG|GesmbH|"
    r"BV|NV|"
    r"SAS|SARL|SASU|SCA|"
    r"SARL|SRL|S\.r\.l\.|SpA|S\.p\.A\.|Srls|SCPA|"
    r"SRO|s\.r\.o\.|"
    r"SL|SLU|SLL|SLNE|SAU|"
    r"Ltd|Limited|PLC|LLC|LLP|Inc|Corp|"
    r"AB|ApS|AS|"
    r"Oy|Oyj|hf|ehf|"
    r"DOO|d\.o\.o\.|DD|UAB|OOO|"
    r"Lda|CRL|Scrl|"
    r"EE|IKE|"
    r"Zrt|Kft|Nyrt|"
    r"SE|SA)\b",
    re.IGNORECASE,
)
_NORM_PUNCT_RE = re.compile(r"[,.\-_/\\&]+")
_NORM_WS_RE = re.compile(r"\s+")


def normalize_name(s: str) -> str:
    """Return a canonical matching key for a company name.

    Strips legal-form suffixes (reusing the suffix vocabulary from classify.py),
    punctuation, and collapses whitespace to a lowercased string.
    Used for both IPCEI-side and DB-side matching.
    """
    s = _NORM_LEGAL_RE.sub("", s)
    s = _NORM_PUNCT_RE.sub(" ", s)
    s = _NORM_WS_RE.sub(" ", s).strip().lower()
    return s


# ---------------------------------------------------------------------------
# Company matching
# ---------------------------------------------------------------------------

_FUZZY_THRESHOLD = 0.92
_MATCH_CSV_PATH = BASE_DIR / "data" / "processed" / "ipcei_match_summary.csv"


def _fuzzy_ratio(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def match_companies(
    rows: list[dict],
    conn,
) -> tuple[list[dict], list[dict]]:
    """Match each IPCEI row to an existing company or insert a new one.

    Returns (enriched_rows, match_summary_rows).
    Each row in enriched_rows gains a 'company_id' key.
    """
    cur = conn.cursor()

    # Load existing companies indexed by (normalized_name, country)
    cur.execute("SELECT id, canonical_name, country FROM companies ORDER BY canonical_name COLLATE \"C\", country COLLATE \"C\" NULLS FIRST, id")
    existing: dict[tuple[str, str], tuple[int, str]] = {}
    existing_list: list[tuple[str, str, int, str]] = []
    for row_id, cname, country in cur.fetchall():
        norm = normalize_name(cname)
        key = (norm, (country or "").upper())
        existing[key] = (row_id, cname)
        existing_list.append((norm, (country or "").upper(), row_id, cname))

    # Source → sector mapping from PROGRAM_META
    source_to_sector: dict[str, str] = {
        v[0]: v[2] for v in PROGRAM_META.values()
    }

    enriched: list[dict] = []
    summary: list[dict] = []

    for r in rows:
        norm = normalize_name(r["name"])
        country = (r.get("country") or "").upper()
        source = r["source"]

        company_id: int | None = None
        match_method = "none"
        match_confidence = "unmatched"
        matched_canonical = ""

        # 1. Exact match (normalized name + country)
        exact_key = (norm, country)
        if exact_key in existing:
            company_id, matched_canonical = existing[exact_key]
            match_method = "exact"
            match_confidence = "high"

        # 2. Fuzzy match (same country, ratio ≥ threshold)
        if company_id is None and norm:
            best_ratio = 0.0
            best_id = None
            best_cname = ""
            for ex_norm, ex_country, ex_id, ex_cname in existing_list:
                if ex_country != country:
                    continue
                ratio = _fuzzy_ratio(norm, ex_norm)
                if ratio >= _FUZZY_THRESHOLD and ratio > best_ratio:
                    best_ratio = ratio
                    best_id = ex_id
                    best_cname = ex_cname
            if best_id is not None:
                company_id = best_id
                matched_canonical = best_cname
                match_method = "fuzzy"
                match_confidence = "medium"

        # 3. No match → insert new company
        if company_id is None:
            sector = source_to_sector.get(source, "other")
            cur.execute(
                """INSERT INTO companies
                   (canonical_name, raw_name, country, entity_type, sector_inferred,
                    match_confidence, match_method)
                   VALUES (%s, %s, %s, 'unknown', %s, 'unmatched', 'none') RETURNING id""",
                (r["name"], r["name"], country or None, sector),
            )
            company_id = cur.fetchone()[0]
            matched_canonical = r["name"]
            match_method = "none"
            match_confidence = "unmatched"

            # Add to local index so later rows can match it
            new_key = (norm, country)
            existing[new_key] = (company_id, r["name"])
            existing_list.append((norm, country, company_id, r["name"]))

        enriched.append({**r, "company_id": company_id})
        summary.append({
            "source": source,
            "country": country,
            "input_name": r["name"],
            "normalized": norm,
            "matched_canonical": matched_canonical,
            "match_method": match_method,
            "match_confidence": match_confidence,
            "company_id": company_id,
        })

    conn.commit()
    return enriched, summary


# ---------------------------------------------------------------------------
# Event loading
# ---------------------------------------------------------------------------

def load_events(rows: list[dict], conn) -> int:
    """Insert IPCEI funding events into public_funding_events.

    Returns the number of rows inserted.
    """
    cur = conn.cursor()
    inserted = 0
    for r in rows:
        company_id = r.get("company_id")
        if company_id is None:
            continue
        source = r["source"]
        raw_url = PDF_URLS.get(source, "")
        aid_eur = r.get("aid_amount_eur") or None
        if aid_eur is not None:
            try:
                aid_eur = float(aid_eur)
            except (ValueError, TypeError):
                aid_eur = None
        decision_date = IPCEI_DECISION_DATES.get(source)
        cur.execute(
            """INSERT INTO public_funding_events
               (company_id, source, role, call_id, grant_amount_eur,
                sector_tags_raw, raw_source_url, project_started,
                coordinator_only, grant_amount_basis)
               VALUES (%s, %s, 'direct', %s, %s, '', %s, %s, 0, 'ipcei_state_aid')""",
            (company_id, source, r.get("sa_case"), aid_eur, raw_url, decision_date),
        )
        inserted += 1
    conn.commit()
    return inserted


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

FIELDNAMES = [
    "source", "sa_case", "country", "name", "project_code",
    "aid_amount_raw", "aid_amount_eur", "aid_amount_is_range",
    "aid_amount_redacted", "role", "page",
]

MATCH_FIELDNAMES = [
    "source", "country", "input_name", "normalized",
    "matched_canonical", "match_method", "match_confidence", "company_id",
]


def extract_all() -> list[dict]:
    """Run PDF extraction for all programs; return combined rows."""
    all_rows: list[dict] = []
    for fname, (source, sa_case, _sector, unit) in PROGRAM_META.items():
        path = PDF_DIR / fname
        if not path.exists():
            print(f"!! MISSING  {fname}")
            continue
        rows = extract_from_pdf(path, source, sa_case, unit)
        print(f"{source:<22}  {len(rows):>3} rows")
        all_rows.extend(rows)
    return all_rows


def main() -> None:
    load_db = "--load-db" in sys.argv

    # --- Extraction ---
    all_rows = extract_all()
    print(f"\nTotal: {len(all_rows)} rows → {CSV_PATH}")

    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDNAMES)
        w.writeheader()
        w.writerows(all_rows)

    if not load_db:
        print("(CSV only — pass --load-db to match and load into db.sqlite)")
        return

    # --- Match + Load ---
    if not DB_PATH.exists():
        print(f"!! DB not found: {DB_PATH}")
        sys.exit(1)

    with connect() as conn:
        print(f"\nMatching {len(all_rows)} rows against {DB_PATH.name} …")
        enriched, summary = match_companies(all_rows, conn)

        # Write match summary CSV
        with _MATCH_CSV_PATH.open("w", newline="", encoding="utf-8") as f:
            w2 = csv.DictWriter(f, fieldnames=MATCH_FIELDNAMES)
            w2.writeheader()
            w2.writerows(summary)

        method_counts: dict[str, int] = {}
        for s in summary:
            method_counts[s["match_method"]] = method_counts.get(s["match_method"], 0) + 1
        print("Match results:")
        for method, count in sorted(method_counts.items()):
            print(f"  {method:<12}  {count:>4}")
        print(f"  Match summary → {_MATCH_CSV_PATH}")

        inserted = load_events(enriched, conn)
    print(f"\nInserted {inserted} events into public_funding_events")

    # Per-IPCEI aid sums for validation
    print("\nPer-IPCEI aid sums (EUR, from extracted data):")
    source_sums: dict[str, float] = {}
    source_redacted: dict[str, int] = {}
    for r in all_rows:
        src = r["source"]
        try:
            amt = float(r["aid_amount_eur"]) if r["aid_amount_eur"] else None
        except (ValueError, TypeError):
            amt = None
        if amt is not None:
            source_sums[src] = source_sums.get(src, 0.0) + amt
        if str(r.get("aid_amount_redacted", "")) == "1":
            source_redacted[src] = source_redacted.get(src, 0) + 1
    for src in PROGRAM_META.values():
        name = src[0]
        total = source_sums.get(name, 0.0)
        redacted = source_redacted.get(name, 0)
        print(f"  {name:<22}  €{total/1e9:6.2f}bn  ({redacted} redacted rows)")


if __name__ == "__main__":
    main()
