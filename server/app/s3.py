"""S3 helpers: presigned URLs, head, delete, key construction."""
from __future__ import annotations

import logging
import uuid

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError
from flask import current_app

log = logging.getLogger(__name__)

# Free-tier guardrails (adjust in one place)
MAX_PHOTO_BYTES = 10 * 1024 * 1024       # 10 MB
MAX_VIDEO_BYTES = 50 * 1024 * 1024       # 50 MB
MAX_THUMB_BYTES = 512 * 1024             # 512 KB
PER_USER_QUOTA_BYTES = 500 * 1024 * 1024  # 500 MB

ALLOWED_PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/quicktime", "video/webm"}


def _client():
    cfg = current_app.config
    return boto3.client(
        "s3",
        region_name=cfg["AWS_REGION"],
        aws_access_key_id=cfg.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=cfg.get("AWS_SECRET_ACCESS_KEY"),
        config=Config(signature_version="s3v4"),
    )


def _bucket() -> str:
    bucket = current_app.config.get("S3_BUCKET")
    if not bucket:
        raise RuntimeError("S3_BUCKET is not configured")
    return bucket


def media_kind(content_type: str) -> str | None:
    if content_type in ALLOWED_PHOTO_TYPES:
        return "photo"
    if content_type in ALLOWED_VIDEO_TYPES:
        return "video"
    return None


def build_keys(
    user_id: str, trip_id: str, content_type: str
) -> tuple[str, str, str | None]:
    """Return (mediaId, s3Key, thumbnailKey).

    Thumbnails are only generated for videos (used as poster/preview frames).
    Image grids use the original file with browser-side `object-fit: cover`,
    which avoids storing two copies of every photo.
    """
    media_id = uuid.uuid4().hex
    ext = _ext_for_type(content_type)
    s3_key = f"users/{user_id}/trips/{trip_id}/{media_id}/original{ext}"
    kind = media_kind(content_type)
    thumb_key: str | None = (
        f"users/{user_id}/trips/{trip_id}/{media_id}/thumb.jpg"
        if kind == "video"
        else None
    )
    return media_id, s3_key, thumb_key


def _ext_for_type(ct: str) -> str:
    return {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "video/mp4": ".mp4",
        "video/quicktime": ".mov",
        "video/webm": ".webm",
        "video/avi": ".avi",
        "video/AVI": ".AVI"
    }.get(ct, "")


def presign_put(key: str, content_type: str, expires: int = 300) -> str:
    return _client().generate_presigned_url(
        "put_object",
        Params={"Bucket": _bucket(), "Key": key, "ContentType": content_type},
        ExpiresIn=expires,
    )


def presign_get(key: str, expires: int = 3600) -> str:
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": _bucket(), "Key": key},
        ExpiresIn=expires,
    )


def head_size(key: str) -> int | None:
    try:
        resp = _client().head_object(Bucket=_bucket(), Key=key)
        return int(resp["ContentLength"])
    except (ClientError, BotoCoreError) as e:
        log.info("head_object failed for %s: %s", key, e)
        return None


def delete_object(key: str) -> None:
    try:
        _client().delete_object(Bucket=_bucket(), Key=key)
    except (ClientError, BotoCoreError) as e:
        log.warning("delete_object failed for %s: %s", key, e)
