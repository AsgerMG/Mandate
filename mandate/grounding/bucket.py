"""Where the original bytes live: the S3-compatible bucket `mandate-grounding`.

    from mandate.grounding.bucket import bucket_from_env
    b = bucket_from_env()               # S3Bucket from BUCKET_* env, or FilesystemBucket
    b.put_if_absent(key, data, mime)    # idempotent: a key IS its bytes' sha256
    b.get(key) -> bytes

Configuration, by environment, and nothing else:

    BUCKET_ENDPOINT            https://<host>   (Railway bucket endpoint)
    BUCKET_ACCESS_KEY_ID
    BUCKET_SECRET_ACCESS_KEY
    BUCKET_NAME                mandate-grounding
    BUCKET_REGION              optional, default "auto" (what S3-compatible stores sign with)
    BUCKET_ADDRESSING          optional, "virtual" (default) or "path"

    GROUNDING_BUCKET_DIR       a local directory INSTEAD of the bucket: the test
                               backend, and the dry-run rehearsal. Never set in
                               production; bucket_from_env() refuses to guess
                               between the two when both are set.

WHY A HAND-WRITTEN SigV4 CLIENT AND NOT boto3. The store needs three calls
(HEAD, PUT, GET), and boto3 is ~80 MB in two images that do not otherwise want
it. Signature V4 is a published algorithm with a published test vector;
tests/test_bucket.py checks this implementation against AWS's own example, so a
signing defect fails CI instead of the first production upload.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import os
from pathlib import Path
from typing import Protocol
from urllib.parse import quote, urlsplit

import httpx

KEY_PREFIX = "sha256/"
# Named archives (mandate/ops/archive_dead_weight.py): archive/<yyyy-mm>/<file>.
# The only other key family. Its objects are not content-addressed, so they are
# never cited; each has a "<key>.sha256" sidecar and is verified by read-back.
ARCHIVE_PREFIX = "archive/"


def _archive_key(key: str) -> str:
    if not key.startswith(ARCHIVE_PREFIX) or ".." in key or key.endswith("/"):
        raise ValueError(f"not an archive key: {key!r}")
    return key


def key_for(sha256: str) -> str:
    """The object key for some bytes. A function of the bytes, so two brains that
    store the same file write the same key, and a retried upload is a no-op."""
    if len(sha256) != 64 or any(c not in "0123456789abcdef" for c in sha256):
        raise ValueError(f"not a lowercase sha256 hex digest: {sha256!r}")
    return f"{KEY_PREFIX}{sha256[:2]}/{sha256}"


class Bucket(Protocol):
    def exists(self, key: str) -> bool: ...
    def put_if_absent(self, key: str, data: bytes, mime: str) -> bool: ...
    def get(self, key: str) -> bytes: ...


class FilesystemBucket:
    """A directory standing in for the bucket: tests and rehearsals.

    Same contract as S3Bucket, including the one property everything relies on:
    the object at a key is the bytes whose sha256 the key names. Checked on read,
    so a corrupted test fixture fails loudly rather than being cited.
    """

    def __init__(self, root: str | Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        if not key.startswith(KEY_PREFIX) or ".." in key:
            raise ValueError(f"not a grounding key: {key!r}")
        return self.root / key

    def exists(self, key: str) -> bool:
        return self._path(key).exists()

    def put_if_absent(self, key: str, data: bytes, mime: str) -> bool:
        p = self._path(key)
        if p.exists():
            return False
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(".part")
        tmp.write_bytes(data)
        tmp.replace(p)
        return True

    def get(self, key: str) -> bytes:
        data = self._path(key).read_bytes()
        _verify(key, data)
        return data

    def put_archive(self, key: str, data: bytes, mime: str) -> None:
        p = self.root / _archive_key(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)

    def get_archive(self, key: str) -> bytes:
        return (self.root / _archive_key(key)).read_bytes()


def _verify(key: str, data: bytes) -> None:
    want = key.rsplit("/", 1)[-1]
    got = hashlib.sha256(data).hexdigest()
    if got != want:
        raise IOError(f"bucket object {key} holds bytes with sha256 {got}: corrupt or wrong object")


# ── S3 Signature Version 4 ──────────────────────────────────────────────────
EMPTY_SHA256 = hashlib.sha256(b"").hexdigest()


def _hmac(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def sign_v4(*, method: str, url: str, headers: dict[str, str], payload_sha256: str,
            access_key: str, secret_key: str, region: str, now: dt.datetime,
            service: str = "s3") -> dict[str, str]:
    """Return `headers` plus x-amz-date, x-amz-content-sha256 and Authorization.

    Every header passed in is signed. Pure function of its arguments (the clock is
    a parameter), which is what lets the AWS test vector pin it exactly.
    """
    parts = urlsplit(url)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    datestamp = now.strftime("%Y%m%d")
    out = {k.lower(): v.strip() for k, v in headers.items()}
    out["host"] = parts.netloc
    out["x-amz-date"] = amz_date
    out["x-amz-content-sha256"] = payload_sha256
    signed = sorted(out)
    canonical_query = "&".join(
        f"{quote(k, safe='-_.~')}={quote(v, safe='-_.~')}"
        for k, v in sorted(
            (kv.split("=", 1) + [""])[:2] for kv in parts.query.split("&") if kv)
    )
    canonical = "\n".join([
        method,
        quote(parts.path or "/", safe="/-_.~"),
        canonical_query,
        "".join(f"{k}:{out[k]}\n" for k in signed),
        ";".join(signed),
        payload_sha256,
    ])
    scope = f"{datestamp}/{region}/{service}/aws4_request"
    to_sign = "\n".join(["AWS4-HMAC-SHA256", amz_date, scope,
                         hashlib.sha256(canonical.encode("utf-8")).hexdigest()])
    k = _hmac(("AWS4" + secret_key).encode("utf-8"), datestamp)
    k = _hmac(_hmac(_hmac(k, region), service), "aws4_request")
    signature = hmac.new(k, to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
    out["authorization"] = (f"AWS4-HMAC-SHA256 Credential={access_key}/{scope}, "
                            f"SignedHeaders={';'.join(signed)}, Signature={signature}")
    del out["host"]  # httpx sets it from the URL; it was signed with the same value
    return out


class S3Bucket:
    """The production backend: an S3-compatible bucket, signed with SigV4."""

    def __init__(self, *, endpoint: str, bucket: str, access_key: str, secret_key: str,
                 region: str = "auto", addressing: str = "virtual",
                 client: httpx.Client | None = None):
        if addressing not in ("virtual", "path"):
            raise ValueError("BUCKET_ADDRESSING must be 'virtual' or 'path'")
        ep = urlsplit(endpoint if "://" in endpoint else f"https://{endpoint}")
        self._base = (f"{ep.scheme}://{bucket}.{ep.netloc}" if addressing == "virtual"
                      else f"{ep.scheme}://{ep.netloc}/{bucket}")
        self.bucket = bucket
        self._ak, self._sk, self._region = access_key, secret_key, region
        self._client = client or httpx.Client(timeout=120.0)

    def _request(self, method: str, key: str, data: bytes = b"",
                 headers: dict[str, str] | None = None) -> httpx.Response:
        url = f"{self._base}/{quote(key, safe='/-_.~')}"
        payload = hashlib.sha256(data).hexdigest() if data else EMPTY_SHA256
        signed = sign_v4(method=method, url=url, headers=headers or {}, payload_sha256=payload,
                         access_key=self._ak, secret_key=self._sk, region=self._region,
                         now=dt.datetime.now(dt.timezone.utc))
        last: Exception | None = None
        for _ in range(4):
            try:
                r = self._client.request(method, url, content=data or None, headers=signed)
            except httpx.TransportError as e:
                last = e
                continue
            if r.status_code >= 500 or r.status_code == 429:
                last = httpx.HTTPStatusError(f"{method} {key}: {r.status_code}",
                                             request=r.request, response=r)
                continue
            return r
        raise IOError(f"bucket {method} {key} failed after retries: {last}")

    def exists(self, key: str) -> bool:
        r = self._request("HEAD", key)
        if r.status_code == 404:
            return False
        if r.status_code == 200:
            return True
        raise IOError(f"bucket HEAD {key}: HTTP {r.status_code}")

    def put_if_absent(self, key: str, data: bytes, mime: str) -> bool:
        if self.exists(key):
            return False
        r = self._request("PUT", key, data, {"content-type": mime})
        if r.status_code not in (200, 201):
            raise IOError(f"bucket PUT {key}: HTTP {r.status_code} {r.text[:300]}")
        return True

    def get(self, key: str) -> bytes:
        r = self._request("GET", key)
        if r.status_code != 200:
            raise IOError(f"bucket GET {key}: HTTP {r.status_code}")
        _verify(key, r.content)
        return r.content

    def put_archive(self, key: str, data: bytes, mime: str) -> None:
        r = self._request("PUT", _archive_key(key), data, {"content-type": mime})
        if r.status_code not in (200, 201):
            raise IOError(f"bucket PUT {key}: HTTP {r.status_code} {r.text[:300]}")

    def get_archive(self, key: str) -> bytes:
        r = self._request("GET", _archive_key(key))
        if r.status_code != 200:
            raise IOError(f"bucket GET {key}: HTTP {r.status_code}")
        return r.content


def bucket_from_env(env: dict[str, str] | None = None) -> Bucket:
    """The configured backend. Refuses an ambiguous or half-set configuration
    rather than silently writing somewhere nobody will look."""
    env = dict(os.environ if env is None else env)
    local = env.get("GROUNDING_BUCKET_DIR", "").strip()
    names = ("BUCKET_ENDPOINT", "BUCKET_ACCESS_KEY_ID", "BUCKET_SECRET_ACCESS_KEY", "BUCKET_NAME")
    present = [n for n in names if env.get(n, "").strip()]
    if local and present:
        raise RuntimeError("both GROUNDING_BUCKET_DIR and BUCKET_* are set: say which store you mean")
    if local:
        return FilesystemBucket(local)
    if len(present) != len(names):
        missing = [n for n in names if n not in present]
        raise RuntimeError(f"bucket not configured: missing {', '.join(missing)}")
    return S3Bucket(endpoint=env["BUCKET_ENDPOINT"].strip(), bucket=env["BUCKET_NAME"].strip(),
                    access_key=env["BUCKET_ACCESS_KEY_ID"].strip(),
                    secret_key=env["BUCKET_SECRET_ACCESS_KEY"].strip(),
                    region=env.get("BUCKET_REGION", "auto").strip() or "auto",
                    addressing=env.get("BUCKET_ADDRESSING", "virtual").strip() or "virtual")
