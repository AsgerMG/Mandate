"""The chart fetch tries headless Chrome ONLY for a page the plain fetch was refused or got no text from.
Run: PYTHONPATH=. python3 -m pytest capital/ETL/terms/test_chart_fetch.py -q"""
import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from load_graph_de import fetch_one  # noqa: E402

PAGE = "<html><body>" + "<p>Directeur général : Jeanne Martin, présidente du conseil. </p>" * 20 + "</body></html>"
SHELL = "<html><body><div id='app'></div><script>load()</script></body></html>"


class Client:
    def __init__(self, status=200, body=PAGE, mime="text/html"):
        self.status, self.body, self.mime, self.calls = status, body, mime, 0

    def get(self, url):
        self.calls += 1
        return httpx.Response(self.status, content=self.body.encode(), headers={"content-type": self.mime},
                              request=httpx.Request("GET", url))


def renderer(html=PAGE):
    seen = []

    def render(url):
        seen.append(url)
        return html.encode() if html else None
    render.seen = seen
    return render


def test_a_page_the_plain_fetch_reads_is_never_rendered():
    r = renderer()
    via = fetch_one(Client(), "https://x/y", render=r)[5]
    assert via == "http" and r.seen == []


def test_a_refused_page_is_rendered():
    r = renderer()
    content, mime, status, text, ext, via = fetch_one(Client(403, "Forbidden"), "https://x/y", render=r)
    assert via == "chrome" and r.seen == ["https://x/y"] and "Jeanne Martin" in text and ext.endswith("+chrome")


def test_a_javascript_shell_is_rendered():
    r = renderer()
    _, _, _, text, _, via = fetch_one(Client(200, SHELL), "https://x/y", render=r)
    assert via == "chrome" and "Jeanne Martin" in text


def test_a_missing_page_is_not_rendered():
    r = renderer()
    with pytest.raises(httpx.HTTPStatusError):
        fetch_one(Client(404, "gone"), "https://x/y", render=r)
    assert r.seen == []


def test_a_pdf_with_little_text_is_not_rendered():
    r = renderer()
    c = Client(200, "%PDF-1.4 tiny", mime="application/pdf")
    fetch_one(c, "https://x/y.pdf", render=r)
    assert r.seen == []


def test_refused_and_rendering_fails_raises_the_plain_error():
    with pytest.raises(httpx.HTTPStatusError):
        fetch_one(Client(403, "Forbidden"), "https://x/y", render=renderer(None))


def test_an_empty_shell_that_renders_nothing_keeps_the_plain_result():
    content, mime, status, text, ext, via = fetch_one(Client(200, SHELL), "https://x/y", render=renderer(None))
    assert via == "http" and status == 200
