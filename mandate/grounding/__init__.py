"""mandate.grounding: the one store of what every brain cites.

Schema `grounding` (mandate/db/grounding.sql) holds the record; the bucket
`mandate-grounding` holds the original bytes, keyed by sha256. See store.py for
the API and the invariants, bucket.py for configuration.
"""
from .bucket import Bucket, FilesystemBucket, S3Bucket, bucket_from_env, key_for
from .store import (
    Citation,
    Version,
    add_passages,
    canonical_url,
    cite,
    ensure_document,
    ensure_source,
    fetch,
    latest,
    locate,
    read_original,
    set_bucket,
    store_original,
    version,
    version_by_sha,
)

__all__ = [
    "Bucket", "FilesystemBucket", "S3Bucket", "bucket_from_env", "key_for",
    "Citation", "Version", "add_passages", "canonical_url", "cite", "ensure_document",
    "ensure_source", "fetch", "latest", "locate", "read_original", "set_bucket",
    "store_original", "version", "version_by_sha",
]
