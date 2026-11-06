"""The bucket backends, and SigV4 against AWS's published examples."""
from __future__ import annotations

import datetime as dt
import hashlib

import httpx
import pytest

from mandate.grounding.bucket import (
    EMPTY_SHA256, FilesystemBucket, S3Bucket, bucket_from_env, key_for, sign_v4,
)

AK, SK = "AKIAIOSFODNN7EXAMPLE", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
WHEN = dt.datetime(2013, 5, 24, tzinfo=dt.timezone.utc)


def test_sigv4_get_object_example():
    # docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html, "GET Object"
    h = sign_v4(method="GET", url="https://examplebucket.s3.amazonaws.com/test.txt",
                headers={"Range": "bytes=0-9"}, payload_sha256=EMPTY_SHA256,
                access_key=AK, secret_key=SK, region="us-east-1", now=WHEN)
    assert h["authorization"].endswith(
        "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41")


def test_sigv4_put_object_example():
    # same page, "PUT Object": a path that needs escaping and a signed payload
    body = b"Welcome to Amazon S3."
    h = sign_v4(method="PUT", url="https://examplebucket.s3.amazonaws.com/test$file.text",
                headers={"Date": "Fri, 24 May 2013 00:00:00 GMT",
                         "x-amz-storage-class": "REDUCED_REDUNDANCY"},
                payload_sha256=hashlib.sha256(body).hexdigest(),
                access_key=AK, secret_key=SK, region="us-east-1", now=WHEN)
    assert h["authorization"].endswith(
        "Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd")


def test_s3_put_if_absent_heads_first_and_verifies_on_get():
    data = b"original bytes"
    key = key_for(hashlib.sha256(data).hexdigest())
    store: dict[str, bytes] = {}
    seen = []

    def handler(req: httpx.Request):
        seen.append((req.method, req.url.host, req.url.path))
        assert req.headers["authorization"].startswith("AWS4-HMAC-SHA256 Credential=ak/")
        path = req.url.path.lstrip("/")
        if req.method == "HEAD":
            return httpx.Response(200 if path in store else 404)
        if req.method == "PUT":
            assert req.headers["x-amz-content-sha256"] == hashlib.sha256(req.content).hexdigest()
            store[path] = req.content
            return httpx.Response(200)
        if req.method == "GET":
            return httpx.Response(200, content=store[path]) if path in store else httpx.Response(404)
        return httpx.Response(405)

    b = S3Bucket(endpoint="https://storage.example.dev", bucket="mandate-grounding",
                 access_key="ak", secret_key="sk", client=httpx.Client(transport=httpx.MockTransport(handler)))
    assert b.put_if_absent(key, data, "text/plain") is True
    assert b.put_if_absent(key, data, "text/plain") is False      # idempotent: HEAD hit, no PUT
    assert [m for m, *_ in seen] == ["HEAD", "PUT", "HEAD"]
    assert seen[0][1] == "mandate-grounding.storage.example.dev"   # virtual-hosted by default
    assert b.get(key) == data
    store[key] = b"tampered"
    with pytest.raises(IOError, match="corrupt"):
        b.get(key)


def test_filesystem_bucket_contract(tmp_path):
    b = FilesystemBucket(tmp_path)
    data = b"x"
    key = key_for(hashlib.sha256(data).hexdigest())
    assert not b.exists(key) and b.put_if_absent(key, data, "text/plain") and b.exists(key)
    assert b.get(key) == data
    with pytest.raises(ValueError):
        b.get("../../etc/passwd")


def test_bucket_from_env_refuses_ambiguity(tmp_path):
    with pytest.raises(RuntimeError, match="missing"):
        bucket_from_env({"BUCKET_NAME": "mandate-grounding"})
    with pytest.raises(RuntimeError, match="both"):
        bucket_from_env({"GROUNDING_BUCKET_DIR": str(tmp_path), "BUCKET_NAME": "x"})
    assert isinstance(bucket_from_env({"GROUNDING_BUCKET_DIR": str(tmp_path)}), FilesystemBucket)
    full = {"BUCKET_ENDPOINT": "https://e.dev", "BUCKET_ACCESS_KEY_ID": "a",
            "BUCKET_SECRET_ACCESS_KEY": "s", "BUCKET_NAME": "mandate-grounding"}
    assert isinstance(bucket_from_env(full), S3Bucket)
