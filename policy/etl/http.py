"""Shared HTTP client: a consistent User-Agent, timeouts, polite per-host
spacing and retry-with-backoff (honouring Retry-After) for the flaky public
endpoints we crawl."""

from __future__ import annotations

import email.utils
import time
from urllib.parse import urlsplit

import httpx
import structlog
from bs4 import BeautifulSoup
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from data.config import Settings

log = structlog.get_logger(__name__)

_RETRY_ATTEMPTS = 4
_backoff = wait_exponential(multiplier=1, min=1, max=20)
# A host that has said 429 once this run is slowed to at least this spacing,
# doubling on every further 429, up to the cap.
_THROTTLED_MIN_DELAY = 5.0
_THROTTLED_MAX_DELAY = 60.0


def _is_retryable(exc: BaseException) -> bool:
    """Retry transient failures only: network errors, 429, and 5xx. A 4xx like
    404 (e.g. a Cellar manifestation type that doesn't exist) is permanent and
    must not be retried. The same predicate classifies a source that still
    fails after the retries as *transient* in the run record (pipeline.py),
    which the health check gives one extra run of grace."""
    if isinstance(exc, httpx.TransportError):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code == 429 or exc.response.status_code >= 500
    return False


def retry_after_seconds(resp: httpx.Response) -> float | None:
    """Retry-After as seconds: either delta-seconds or an HTTP-date."""
    value = resp.headers.get("Retry-After")
    if not value:
        return None
    value = value.strip()
    if value.isdigit():
        return float(value)
    try:
        when = email.utils.parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    return max(0.0, when.timestamp() - time.time())


def browser_compatible_user_agent(ua: str) -> str:
    """The europarl.europa.eu WAF 403s any User-Agent that does not open with
    the ``Mozilla/5.0`` product token (``Regina/0.1 (...)`` and
    ``python-httpx`` both 403, from a laptop as from Railway, 2026-11-09). The
    standard crawler form ``Mozilla/5.0 (compatible; <ours>)`` passes and still
    names us. Applied here rather than only in the config default because
    production sets HTTP_USER_AGENT explicitly."""
    ua = ua.strip()
    return ua if ua.startswith("Mozilla/") else f"Mozilla/5.0 (compatible; {ua})"


def _host(url: str) -> str:
    return urlsplit(url).hostname or ""


def _wait(client: HttpClient):
    """tenacity wait: the server's Retry-After when it sent one (capped), else
    exponential backoff."""

    def wait(retry_state) -> float:
        base = _backoff(retry_state)
        exc = retry_state.outcome.exception() if retry_state.outcome else None
        if isinstance(exc, httpx.HTTPStatusError):
            ra = retry_after_seconds(exc.response)
            if ra is not None:
                return min(max(ra, base), client._settings.retry_after_max_seconds)
            if exc.response.status_code == 429:
                return max(base, client._host_delay.get(_host(str(exc.request.url)), 0.0))
        return base

    return wait


class HttpClient:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._client = httpx.Client(
            headers={"User-Agent": browser_compatible_user_agent(settings.http_user_agent)},
            timeout=settings.http_timeout_seconds,
            follow_redirects=True,
        )
        # Per-host politeness: the earliest moment the next request to a host
        # may start, and any extra spacing a host has asked for with a 429.
        # The old global sleep ran only AFTER a success, so a failing host got
        # retried at backoff speed and every source on one host (nine Politico
        # newsletters) shared no memory of having been throttled.
        self._next_ok: dict[str, float] = {}
        self._host_delay: dict[str, float] = {}

    def _space(self, url: str) -> None:
        host = _host(url)
        wait = self._next_ok.get(host, 0.0) - time.monotonic()
        if wait > 0:
            time.sleep(wait)

    def _after(self, url: str, resp: httpx.Response | None) -> None:
        host = _host(url)
        delay = max(self._settings.request_delay_seconds, self._host_delay.get(host, 0.0))
        if resp is not None and resp.status_code == 429:
            delay = min(max(_THROTTLED_MIN_DELAY, delay * 2), _THROTTLED_MAX_DELAY)
            self._host_delay[host] = delay
            log.warning("http_throttled", host=host, spacing_seconds=delay,
                        retry_after=resp.headers.get("Retry-After"))
        self._next_ok[host] = time.monotonic() + delay

    def _send(self, method: str, url: str, **kwargs) -> httpx.Response:
        self._space(url)
        resp = None
        try:
            resp = self._client.request(method, url, **kwargs)
        finally:
            self._after(url, resp)
        return resp

    def get(
        self,
        url: str,
        *,
        accept: str | None = None,
        accept_language: str | None = None,
        params: dict | None = None,
        follow_redirects: bool = True,
    ) -> httpx.Response:
        @retry(
            retry=retry_if_exception(_is_retryable),
            stop=stop_after_attempt(_RETRY_ATTEMPTS),
            wait=_wait(self),
            reraise=True,
        )
        def attempt() -> httpx.Response:
            headers = {}
            if accept:
                headers["Accept"] = accept
            if accept_language:
                headers["Accept-Language"] = accept_language
            resp = self._send(
                "GET", url, headers=headers or None, params=params,
                follow_redirects=follow_redirects,
            )
            # A 3xx is only an error when we asked to follow redirects. Some
            # servers (eulawlive.com) attach the real feed body to the 3xx
            # itself and serve only an HTML homepage once a client follows it,
            # so an unfollowed redirect is a valid response here, not a failure.
            if follow_redirects or not resp.is_redirect:
                resp.raise_for_status()
            return resp

        return attempt()

    def post_json(self, url: str, payload: dict, *, accept: str = "application/json"):
        """POST a JSON body (some sources, e.g. the EU Law Tracker, are
        search-endpoint driven). Same retry/politeness policy as get()."""

        @retry(
            retry=retry_if_exception(_is_retryable),
            stop=stop_after_attempt(_RETRY_ATTEMPTS),
            wait=_wait(self),
            reraise=True,
        )
        def attempt() -> httpx.Response:
            resp = self._send("POST", url, json=payload, headers={"Accept": accept})
            resp.raise_for_status()
            return resp

        return attempt()

    def negotiate(
        self, url: str, accepts: list[str], *, accept_language: str | None = None
    ) -> httpx.Response | None:
        """Return the first 200 response across an ordered list of Accept types,
        skipping types the resource doesn't offer (404). A 300 (Cellar's
        "Multiple Choices" — the CELEX has manifestations of that media type,
        but content negotiation alone can't pick one, e.g. most recent COM
        proposals) is resolved via ``_resolve_ambiguous`` instead of skipped
        outright. Returns None if nothing usable is found."""
        ambiguous: httpx.Response | None = None
        for accept in accepts:
            try:
                return self.get(url, accept=accept, accept_language=accept_language)
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 300:
                    ambiguous = ambiguous or exc.response
                    continue
                if exc.response.status_code == 404:
                    continue
                raise
        if ambiguous is not None:
            resolved = self._resolve_ambiguous(ambiguous, accept_language)
            if resolved is not None:
                return resolved
        return None

    def _resolve_ambiguous(
        self, resp: httpx.Response, accept_language: str | None
    ) -> httpx.Response | None:
        """Cellar's 300 body lists every part of the matching manifestation as
        a direct ``DOC_N`` URL, in ``stream_order`` (part 1 is the main act
        text; later parts are annexes/impact assessments). Fetch part 1
        directly — a concrete ``DOC_N`` resource returns its content with no
        further Accept negotiation needed, sidestepping the ambiguity."""
        soup = BeautifulSoup(resp.content, "lxml")
        item = soup.find("li", attrs={"title": "item"})
        href = item.find("a")["href"] if item else None
        if not href:
            return None
        try:
            return self.get(href, accept_language=accept_language)
        except httpx.HTTPStatusError:
            return None

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> HttpClient:
        return self

    def __exit__(self, *exc) -> None:
        self.close()
