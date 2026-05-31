"""SATR session bootstrap and HTML pagination.

The EC State Aid Transparency Register portal at
https://webgate.ec.europa.eu/competition/transparency/public requires:

  1. A 2-step form flow: home (country checkboxes) → advanced search (date +
     filter fields) → results listing. Each step issues a fresh CSRFTOKEN
     bound to the session cookie (LB_TRANSPARENCY).
  2. JavaScript on the home page that re-enables disabled country / region
     inputs before submit. Curl alone cannot do this — we use Playwright for
     the bootstrap, then hand the cookies + CSRF off to `requests` for fast
     pagination via GET ?offset=N&max=100.

This module provides:

  bootstrap_search(country_iso2, date_from, date_to, *,
                   instruments=None, objectives=None)
      → SatrSession with .cookies, .csrf, .result_count, .over_limit

  paginate(session, *, max_per_page=100)
      → Iterator[dict] yielding parsed row dicts from the results table.

Both are awaitable / async — the underlying Playwright is async.

The session is single-use: once you paginate through a (country, period,
filter) batch, throw it away and bootstrap a fresh one for the next batch.
The SATR backend stores search criteria in the LB-cookied session and a
fresh search overwrites them.
"""
from __future__ import annotations

import asyncio
import html as html_lib
import re
from dataclasses import dataclass, field
from datetime import date
from typing import AsyncIterator

import requests
from playwright.async_api import async_playwright, Browser, BrowserContext, Page

from scripts.lib.satr_country_map import to_bid

BASE = "https://webgate.ec.europa.eu/competition/transparency"
HOME_URL = f"{BASE}/public/search/home?lang=en"
SEARCH_RESULTS_URL = f"{BASE}/public/search/results"

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

OVER_LIMIT_RE = re.compile(r"maximum number of records", re.IGNORECASE)
# The highest "offset=N" in the pagination block is the most reliable count
# signal: it equals (total - 1) rounded down to the nearest 10 (the SATR
# pagination uses max=10 increments in the link bar).
OFFSET_RE = re.compile(r"offset=(\d+)&(?:amp;)?max=10")


@dataclass
class SatrSession:
    """A bootstrapped SATR search session ready for pagination."""
    cookies: dict[str, str]
    csrf: str
    country_iso2: str
    date_from: date
    date_to: date
    result_count: int = 0
    over_limit: bool = False
    instruments: tuple[str, ...] = ()
    objectives: tuple[str, ...] = ()
    _final_url: str = ""

    def label(self) -> str:
        return (
            f"{self.country_iso2} "
            f"{self.date_from.isoformat()} → {self.date_to.isoformat()}"
        )


# ----------------------------------------------------------------------------
# Bootstrap
# ----------------------------------------------------------------------------

async def _select_magicsuggest(page: Page, field_id: str, values: list[str]) -> None:
    """Drive a magicSuggest autocomplete: type each value, press Enter.

    magicSuggest stores selected items as hidden inputs with the same name as
    the original field (after re-enabling it). Once items are selected, the
    standard form submission picks them up.
    """
    if not values:
        return

    # magicSuggest exposes setValue via the jQuery data — fastest path.
    js = """
    (args) => {
        const $ = window.jQuery;
        if (!$) throw new Error('jQuery not loaded');
        const ms = $('#' + args.fieldId).magicSuggest();
        if (!ms) throw new Error('magicSuggest not attached to #' + args.fieldId);
        ms.setValue(args.values);
        return ms.getValue();
    }
    """
    result = await page.evaluate(js, {"fieldId": field_id, "values": values})
    if not result or len(result) != len(values):
        # Fallback: type each value into the input and press Enter.
        input_sel = f'#{field_id}-input'
        for v in values:
            await page.fill(input_sel, v)
            await page.keyboard.press("Enter")
            await page.wait_for_timeout(150)


async def bootstrap_search(
    country_iso2: str,
    date_from: date,
    date_to: date,
    *,
    instruments: tuple[str, ...] = (),
    objectives: tuple[str, ...] = (),
    headless: bool = True,
) -> SatrSession:
    """Open the SATR form, run a search, return a session ready for pagination.

    Steps:
      1. GET /public/search/home → check country box → submit (goes to advanced form)
      2. On advanced form: fill date range + (optional) instrument/objective filters
      3. Click Search → results page
      4. Capture cookies + CSRFTOKEN + result count / over-limit flag
    """
    bid = to_bid(country_iso2)
    fmt = "%d/%m/%Y"

    async with async_playwright() as pw:
        browser: Browser = await pw.chromium.launch(headless=headless)
        context: BrowserContext = await browser.new_context(user_agent=UA)
        page: Page = await context.new_page()

        # Step 1: home page, check country, submit
        await page.goto(HOME_URL, wait_until="networkidle")
        await page.check(f'input[name="countries"][value="{bid}"]')
        await page.click("button.button-search")
        await page.wait_for_load_state("networkidle", timeout=30_000)

        # Step 2: advanced search form
        await page.fill("#dateGrantedFrom", date_from.strftime(fmt))
        await page.fill("#dateGrantedTo", date_to.strftime(fmt))

        if instruments:
            await _select_magicsuggest(page, "aidInstruments", list(instruments))
        if objectives:
            await _select_magicsuggest(page, "objectives", list(objectives))

        # Step 3: submit search
        await page.click("button.button-search")
        await page.wait_for_load_state("networkidle", timeout=60_000)

        # Step 4: harvest cookies + CSRF + count
        html = await page.content()
        final_url = page.url

        csrf_match = re.search(r'CSRFTOKEN"\s+value="([^"]+)"', html)
        csrf = csrf_match.group(1) if csrf_match else ""

        cookies_list = await context.cookies()
        cookies = {c["name"]: c["value"] for c in cookies_list
                   if "transparency" in c.get("path", "")
                   or c["domain"].endswith("europa.eu")}

        over = bool(OVER_LIMIT_RE.search(html))

        # Highest pagination offset ≈ total count (rounded down to nearest 10).
        # When there is only one page (≤10 rows), no offset links appear and
        # count stays 0 — but pagination still works correctly in that case.
        offsets = [int(m.group(1)) for m in OFFSET_RE.finditer(html)]
        count = max(offsets) if offsets else 0

        await browser.close()

        return SatrSession(
            cookies=cookies,
            csrf=csrf,
            country_iso2=country_iso2.upper(),
            date_from=date_from,
            date_to=date_to,
            result_count=count,
            over_limit=over,
            instruments=instruments,
            objectives=objectives,
            _final_url=final_url,
        )


# ----------------------------------------------------------------------------
# Pagination
# ----------------------------------------------------------------------------

# Field order in the resultsTable, confirmed in Sprint 15 discovery:
#   Country | Aid Measure Title | SA.Number | Reference Number | National ID |
#   Name of beneficiary | Beneficiary Type | Region | Sector (NACE) |
#   Aid Instrument | Objectives | Nominal Amount | Aid Element |
#   Date of granting | Granting Authority | Entrusted Entity |
#   Financial Intermediaries | Published Date | Beneficiary MS | Third country
COLUMNS = (
    "country", "aid_measure_title", "sa_number", "reference_number",
    "national_id", "beneficiary_name", "beneficiary_type", "region",
    "sector_nace", "aid_instrument_text", "objectives_text",
    "nominal_amount_raw", "aid_element_raw",
    "date_granted", "granting_authority", "entrusted_entity",
    "financial_intermediaries", "published_date",
    "beneficiary_ms", "third_country",
)

_TR_SPLIT_RE = re.compile(r"<tr[^>]*>(.*?)</tr>", re.DOTALL | re.IGNORECASE)
_TD_OPEN_RE = re.compile(r"<td([^>]*)>(.*?)</td>", re.DOTALL | re.IGNORECASE)
_TITLE_ATTR_RE = re.compile(r'title="([^"]*)"', re.IGNORECASE)
_TAG_RE = re.compile(r"<[^>]+>")
# Translation tooltip span — strip the whole element
_TRANSLATION_SPAN_RE = re.compile(
    r'<span\s+class="translationTooltip"[^>]*>.*?</span>',
    re.DOTALL | re.IGNORECASE,
)


def _strip_html(s: str) -> str:
    """Strip HTML tags and normalise whitespace; decode named + numeric entities."""
    s = _TRANSLATION_SPAN_RE.sub("", s)
    s = _TAG_RE.sub(" ", s)
    # stdlib html.unescape handles &nbsp;, &amp;, &#160;, &#x2026; etc.
    s = html_lib.unescape(s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _extract_td_value(attrs: str, inner: str) -> str:
    """Pick the better of title= attribute and inner text.

    Rule: prefer title only when the inner text is visually truncated (ends with
    an ellipsis '...' or '…'). Otherwise inner wins — many SATR cells use
    title= for metadata labels (e.g. 'Firmenbuchnummer' on the national_id cell)
    that we do NOT want to substitute for the value.
    """
    inner_stripped = _strip_html(inner)
    if inner_stripped.endswith("...") or inner_stripped.endswith("…"):
        title_match = _TITLE_ATTR_RE.search(attrs)
        if title_match:
            title_val = html_lib.unescape(title_match.group(1)).strip()
            if title_val:
                return title_val
    return inner_stripped


def parse_results_page(html: str) -> list[dict[str, str]]:
    """Parse the SATR results table HTML and return one dict per row.

    Robust to varying td count — pads with empty strings if columns missing.
    Prefers `title=` attribute over truncated inner HTML.
    """
    # Find the table body
    body_start = html.find('id="resultsTable"')
    if body_start < 0:
        return []
    # Skip past the <thead>
    tbody_start = html.find("<tbody", body_start)
    if tbody_start < 0:
        return []
    tbody_end = html.find("</tbody>", tbody_start)
    if tbody_end < 0:
        tbody_end = len(html)
    table_html = html[tbody_start:tbody_end]

    rows = []
    for tr_inner in _TR_SPLIT_RE.findall(table_html):
        tds = _TD_OPEN_RE.findall(tr_inner)
        if not tds:
            continue
        values = [_extract_td_value(attrs, inner) for attrs, inner in tds]
        # Pad / truncate to canonical column count
        values = (values + [""] * len(COLUMNS))[: len(COLUMNS)]
        rows.append(dict(zip(COLUMNS, values)))
    return rows


async def paginate(
    session: SatrSession,
    *,
    max_per_page: int = 100,
    polite_delay_s: float = 0.5,
    max_pages: int = 10_000,
    request_timeout: int = 90,
    retries_per_page: int = 3,
) -> AsyncIterator[dict[str, str]]:
    """Yield row dicts from the bootstrapped SATR session.

    Uses `requests` (sync) inside the async iterator for speed — Playwright
    is only needed for the form bootstrap.

    Per-page hardening:
      - request_timeout=90s (was 30; SATR is slow for the very large filter
        queries like IT/DE equity with the Fondo di Garanzia in scope)
      - retries_per_page with exponential backoff on Timeout / ConnectionError
    """
    cookie_header = "; ".join(f"{k}={v}" for k, v in session.cookies.items())
    headers = {
        "User-Agent": UA,
        "Cookie": cookie_header,
        "Referer": SEARCH_RESULTS_URL,
        "Accept": "text/html,application/xhtml+xml",
    }

    offset = 0
    pages_fetched = 0
    while pages_fetched < max_pages:
        url = f"{SEARCH_RESULTS_URL}?offset={offset}&max={max_per_page}"
        resp = None
        last_exc: Exception | None = None
        for attempt in range(retries_per_page):
            try:
                # requests is sync; offload to thread to keep the async API
                resp = await asyncio.to_thread(
                    requests.get, url, headers=headers, timeout=request_timeout,
                )
                break
            except (requests.Timeout, requests.ConnectionError) as e:
                last_exc = e
                wait = 2 ** attempt
                await asyncio.sleep(wait)
        if resp is None:
            raise RuntimeError(
                f"SATR pagination failed at offset={offset} after "
                f"{retries_per_page} retries: {last_exc}"
            )

        if resp.status_code != 200:
            raise RuntimeError(
                f"SATR pagination failed at offset={offset}: "
                f"HTTP {resp.status_code}"
            )

        # Detect session loss — redirect back to /search/home
        if "search/home" in resp.url and resp.url != SEARCH_RESULTS_URL:
            raise RuntimeError(
                f"SATR session expired during pagination at offset={offset}. "
                "Re-bootstrap and resume from this offset."
            )

        # SATR serves UTF-8 (Content-Type sets charset) but requests sometimes
        # falls back to ISO-8859-1 if the header is ambiguous. Force UTF-8.
        resp.encoding = "utf-8"
        rows = parse_results_page(resp.text)
        if not rows:
            return  # end of results

        for row in rows:
            yield row

        pages_fetched += 1
        if len(rows) < max_per_page:
            return  # last page

        offset += max_per_page
        if polite_delay_s > 0:
            await asyncio.sleep(polite_delay_s)
