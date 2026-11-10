"""HttpClient politeness: the User-Agent the EP WAF accepts, Retry-After,
per-host spacing that remembers a 429, and transient-vs-permanent outcome."""

from __future__ import annotations

import httpx
import pytest

from data.config import Settings
from etl import http as H
from etl.http import HttpClient


def _client(handler, **settings):
    s = Settings(request_delay_seconds=0.0, retry_after_max_seconds=7.0, **settings)
    c = HttpClient(s)
    c._client = httpx.Client(transport=httpx.MockTransport(handler), headers=c._client.headers)
    return c


@pytest.fixture
def sleeps(monkeypatch):
    slept: list[float] = []
    monkeypatch.setattr(H.time, "sleep", slept.append)
    import tenacity.nap

    monkeypatch.setattr(tenacity.nap.time, "sleep", slept.append)
    return slept


def test_user_agent_opens_with_the_mozilla_token_the_ep_waf_requires():
    # europarl.europa.eu 403s "Regina/0.1 (...)" and "python-httpx"; it 200s
    # "Mozilla/5.0 (compatible; ...)" (live, 2026-11-09). Production sets its
    # own HTTP_USER_AGENT, so the wrapper must apply to any configured value.
    assert H.browser_compatible_user_agent("Regina/0.1 (+x)") == "Mozilla/5.0 (compatible; Regina/0.1 (+x))"
    assert H.browser_compatible_user_agent("Mozilla/5.0 (compatible; R)") == "Mozilla/5.0 (compatible; R)"
    seen = {}

    def handler(req):
        seen["ua"] = req.headers["User-Agent"]
        return httpx.Response(200)

    _client(handler, http_user_agent="Regina/0.1 (+x)").get("https://www.europarl.europa.eu/x")
    assert seen["ua"].startswith("Mozilla/5.0 (compatible; Regina/0.1")


def test_429_honours_retry_after_capped_and_slows_the_host(sleeps):
    calls = []

    def handler(req):
        calls.append(str(req.url))
        if len(calls) == 1:
            return httpx.Response(429, headers={"Retry-After": "30"})
        return httpx.Response(200)

    c = _client(handler)
    assert c.get("https://www.politico.eu/newsletter/a/").status_code == 200
    assert 7.0 in sleeps  # Retry-After 30, capped at 7
    assert c._host_delay["www.politico.eu"] >= H._THROTTLED_MIN_DELAY
    sleeps.clear()
    c.get("https://www.politico.eu/newsletter/b/")  # same host: spaced
    assert sleeps and max(sleeps) > 0
    sleeps.clear()
    c.get("https://www.edpb.europa.eu/feed/news_en")  # other host: not slowed
    assert not [s for s in sleeps if s > 0.5]


def test_404_is_not_retried_and_503_is_transient(sleeps):
    calls = []

    def handler(req):
        calls.append(1)
        return httpx.Response(404 if "gone" in str(req.url) else 503)

    c = _client(handler)
    with pytest.raises(httpx.HTTPStatusError) as e404:
        c.get("https://eprs.europarl.europa.eu/gone")
    assert len(calls) == 1 and not H._is_retryable(e404.value)
    calls.clear()
    with pytest.raises(httpx.HTTPStatusError) as e503:
        c.get("https://www.edpb.europa.eu/feed/news_en")
    assert len(calls) == H._RETRY_ATTEMPTS and H._is_retryable(e503.value)


def test_a_host_that_keeps_refusing_is_left_alone_for_the_rest_of_the_run(sleeps):
    """10 Nov: politico.eu answered 429 to everything; doubling the spacing to
    60 s across nine paged newsletters kept the refresh crawling for hours.
    After _THROTTLE_GIVE_UP refusals the host is not asked again this run, and
    the source fails as TRANSIENT (retried next run, a week's grace)."""
    calls = []

    def handler(request):
        calls.append(str(request.url))
        return httpx.Response(429, request=request)

    c = _client(handler)
    with pytest.raises(Exception) as first:
        c.get("https://www.politico.eu/newsletter/a/")
    assert len(calls) <= H._THROTTLE_GIVE_UP
    n = len(calls)
    with pytest.raises(H.HostThrottled) as later:
        c.get("https://www.politico.eu/newsletter/b/")
    assert len(calls) == n, "a given-up host must not be asked again this run"
    assert H.is_transient(later.value) and not H._is_retryable(later.value)
    assert H.is_transient(first.value)
