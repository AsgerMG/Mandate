"""Shared HTTP client: a consistent User-Agent, timeouts, polite delays and
retry-with-backoff for the flaky public endpoints we crawl."""

from __future__ import annotations

import time

import httpx
import structlog
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from data.config import Settings

log = structlog.get_logger(__name__)


def _is_retryable(exc: BaseException) -> bool:
    """Retry transient failures only: network errors, 429, and 5xx. A 4xx like
    404 (e.g. a Cellar manifestation type that doesn't exist) is permanent and
    must not be retried."""
    if isinstance(exc, httpx.TransportError):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code == 429 or exc.response.status_code >= 500
    return False


class HttpClient:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._client = httpx.Client(
            headers={"User-Agent": settings.http_user_agent},
            timeout=settings.http_timeout_seconds,
            follow_redirects=True,
        )

    @retry(
        retry=retry_if_exception(_is_retryable),
        stop=stop_after_attempt(4),
        wait=wait_exponential(multiplier=1, min=1, max=20),
        reraise=True,
    )
    def get(
        self,
        url: str,
        *,
        accept: str | None = None,
        accept_language: str | None = None,
        params: dict | None = None,
        follow_redirects: bool = True,
    ) -> httpx.Response:
        headers = {}
        if accept:
            headers["Accept"] = accept
        if accept_language:
            headers["Accept-Language"] = accept_language
        resp = self._client.get(
            url, headers=headers or None, params=params, follow_redirects=follow_redirects
        )
        if not follow_redirects and resp.is_redirect:
            pass  # some servers (eulawlive.com) attach the real body to a 3xx
        else:
            resp.raise_for_status()
        # Politeness: stay well under any source rate limit.
        time.sleep(self._settings.request_delay_seconds)
        return resp

    @retry(
        retry=retry_if_exception(_is_retryable),
        stop=stop_after_attempt(4),
        wait=wait_exponential(multiplier=1, min=1, max=20),
        reraise=True,
    )
    def post_json(self, url: str, payload: dict, *, accept: str = "application/json"):
        """POST a JSON body (some sources, e.g. the EU Law Tracker, are
        search-endpoint driven). Same retry/politeness policy as get()."""
        resp = self._client.post(url, json=payload, headers={"Accept": accept})
        resp.raise_for_status()
        time.sleep(self._settings.request_delay_seconds)
        return resp

    def negotiate(
        self, url: str, accepts: list[str], *, accept_language: str | None = None
    ) -> httpx.Response | None:
        """Return the first 200 response across an ordered list of Accept types,
        skipping types the resource doesn't offer (404) or can't disambiguate
        via a single Accept header (300 — Cellar returns this instead of a 404
        when a CELEX has manifestations but none matches cleanly, e.g. some
        recent COM proposals). Returns None if none of the requested
        representations exist."""
        for accept in accepts:
            try:
                return self.get(url, accept=accept, accept_language=accept_language)
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code in (404, 300):
                    continue
                raise
        return None

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> HttpClient:
        return self

    def __exit__(self, *exc) -> None:
        self.close()
