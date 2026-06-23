"""Read-only S3 fetch used to proxy teaching-content images into the UI.

Images are stored as `s3://bucket/key` URIs on `pgca.ca_artifacts.uri`. Browsers
can't open `s3://` URLs, so we stream the bytes through our own endpoint. boto3 is
synchronous, so calls are run in a worker thread.
"""
from __future__ import annotations

import asyncio
from functools import lru_cache

from .config import (
    S3_ACCESS_KEY,
    S3_ENDPOINT,
    S3_REGION,
    S3_SECRET_KEY,
)

_EXT_CONTENT_TYPE = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
}


def configured() -> bool:
    return bool(S3_ACCESS_KEY and S3_SECRET_KEY)


@lru_cache(maxsize=1)
def _client():
    import boto3
    from botocore.config import Config

    kwargs: dict = {
        "region_name": S3_REGION,
        "config": Config(
            signature_version="s3v4",
            connect_timeout=5,
            read_timeout=20,
            retries={"max_attempts": 2},
        ),
        "aws_access_key_id": S3_ACCESS_KEY,
        "aws_secret_access_key": S3_SECRET_KEY,
    }
    if S3_ENDPOINT:
        kwargs["endpoint_url"] = S3_ENDPOINT
    return boto3.client("s3", **kwargs)


def parse_s3_uri(uri: str | None) -> tuple[str, str] | None:
    """`s3://bucket/key` -> ('bucket', 'key'); None if not a usable s3 URI."""
    if not uri or not uri.startswith("s3://"):
        return None
    bucket, _, key = uri[5:].partition("/")
    if not bucket or not key:
        return None
    return bucket, key


def content_type_for(uri: str | None, fallback: str | None) -> str:
    if fallback:
        return fallback
    low = (uri or "").lower()
    for ext, ct in _EXT_CONTENT_TYPE.items():
        if low.endswith(ext):
            return ct
    return "application/octet-stream"


def sniff_image_type(data: bytes) -> str | None:
    """Detect the real image content type from magic bytes.

    The DB's recorded media_type is unreliable (e.g. JPEGs labelled image/png),
    so we trust the actual bytes when serving.
    """
    if len(data) < 12:
        return None
    if data[:4] == b"\x89PNG":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:3] == b"GIF":
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    head = data[:256].lstrip()
    if head[:5] == b"<?xml" or head[:4] == b"<svg" or b"<svg" in head:
        return "image/svg+xml"
    return None


def _get_sync(bucket: str, key: str) -> bytes:
    obj = _client().get_object(Bucket=bucket, Key=key)
    return obj["Body"].read()


async def fetch_image(uri: str | None) -> bytes | None:
    """Fetch image bytes for an `s3://` URI, or None if unfetchable."""
    parsed = parse_s3_uri(uri)
    if parsed is None or not configured():
        return None
    bucket, key = parsed
    return await asyncio.to_thread(_get_sync, bucket, key)
