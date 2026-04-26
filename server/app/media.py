"""Media routes: presigned upload flow, list, update note, delete."""
from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from . import s3
from .db import get_db
from .utils import error, serialize

bp_trip = Blueprint("trip_media", __name__, url_prefix="/api/trips")
bp_media = Blueprint("media", __name__, url_prefix="/api/media")


def _parse_oid(raw: str) -> ObjectId | None:
    try:
        return ObjectId(raw)
    except (InvalidId, TypeError):
        return None


def _owned_trip(trip_id: str, user_id: str) -> dict | None:
    oid = _parse_oid(trip_id)
    if oid is None:
        return None
    return get_db().trips.find_one({"_id": oid, "ownerId": ObjectId(user_id)})


def _user_used_bytes(user_id: str) -> int:
    pipeline = [
        {"$match": {"ownerId": ObjectId(user_id), "status": {"$ne": "declined"}}},
        {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$sizeBytes", 0]}}}},
    ]
    result = list(get_db().media.aggregate(pipeline))
    return int(result[0]["total"]) if result else 0


def _serialize_with_urls(doc: dict) -> dict:
    out = serialize(doc) or {}
    if doc.get("s3Key"):
        out["url"] = s3.presign_get(doc["s3Key"])
    if doc.get("thumbnailKey"):
        out["thumbnailUrl"] = s3.presign_get(doc["thumbnailKey"])
    return out


@bp_trip.post("/<trip_id>/media/presign")
@jwt_required()
def presign_upload(trip_id: str):
    user_id = get_jwt_identity()
    trip = _owned_trip(trip_id, user_id)
    if trip is None:
        return error("Trip not found", 404)

    data = request.get_json(silent=True) or {}
    content_type = (data.get("contentType") or "").lower()
    try:
        size_bytes = int(data.get("sizeBytes") or 0)
    except (TypeError, ValueError):
        return error("sizeBytes must be a number")

    kind = s3.media_kind(content_type)
    if kind is None:
        return error(f"Unsupported contentType: {content_type}")

    max_bytes = s3.MAX_PHOTO_BYTES if kind == "photo" else s3.MAX_VIDEO_BYTES
    if size_bytes <= 0 or size_bytes > max_bytes:
        return error(
            f"File exceeds {max_bytes // (1024 * 1024)} MB cap for {kind}s", 413
        )

    used = _user_used_bytes(user_id)
    if used + size_bytes > s3.PER_USER_QUOTA_BYTES:
        remaining_mb = max(0, (s3.PER_USER_QUOTA_BYTES - used) // (1024 * 1024))
        return error(
            f"Storage quota exceeded. Remaining: {remaining_mb} MB", 413
        )

    _, s3_key, thumb_key = s3.build_keys(user_id, trip_id, content_type)

    doc = {
        "tripId": trip["_id"],
        "ownerId": ObjectId(user_id),
        "uploaderId": ObjectId(user_id),
        "type": kind,
        "s3Key": s3_key,
        "thumbnailKey": thumb_key,
        "note": "",
        "takenAt": None,
        "source": "owner",
        "status": "pending-upload",
        "sizeBytes": 0,
        "contentType": content_type,
        "createdAt": datetime.now(timezone.utc),
    }
    result = get_db().media.insert_one(doc)

    return jsonify(
        {
            "mediaId": str(result.inserted_id),
            "uploadUrl": s3.presign_put(s3_key, content_type),
            "thumbUploadUrl": (
                s3.presign_put(thumb_key, "image/jpeg") if thumb_key else None
            ),
            "s3Key": s3_key,
            "thumbnailKey": thumb_key,
            "contentType": content_type,
        }
    )


@bp_trip.post("/<trip_id>/media/confirm")
@jwt_required()
def confirm_upload(trip_id: str):
    user_id = get_jwt_identity()
    trip = _owned_trip(trip_id, user_id)
    if trip is None:
        return error("Trip not found", 404)

    data = request.get_json(silent=True) or {}
    media_oid = _parse_oid(data.get("mediaId") or "")
    if media_oid is None:
        return error("mediaId required")

    db = get_db()
    media = db.media.find_one(
        {"_id": media_oid, "tripId": trip["_id"], "ownerId": ObjectId(user_id)}
    )
    if media is None:
        return error("Media not found", 404)

    size = s3.head_size(media["s3Key"])
    if size is None:
        return error("Upload not found in storage", 400)

    max_bytes = (
        s3.MAX_PHOTO_BYTES if media["type"] == "photo" else s3.MAX_VIDEO_BYTES
    )
    if size > max_bytes:
        s3.delete_object(media["s3Key"])
        if media.get("thumbnailKey"):
            s3.delete_object(media["thumbnailKey"])
        db.media.delete_one({"_id": media_oid})
        return error("File exceeds size cap", 413)

    # Thumbnail is only stored for videos. Validate its size if present.
    if media.get("thumbnailKey"):
        thumb_size = s3.head_size(media["thumbnailKey"]) or 0
        if thumb_size > s3.MAX_THUMB_BYTES:
            s3.delete_object(media["thumbnailKey"])
            db.media.update_one({"_id": media_oid}, {"$set": {"thumbnailKey": None}})
            media["thumbnailKey"] = None

    db.media.update_one(
        {"_id": media_oid},
        {"$set": {"status": "accepted", "sizeBytes": size}},
    )
    media["status"] = "accepted"
    media["sizeBytes"] = size
    return jsonify({"media": _serialize_with_urls(media)})


@bp_trip.get("/<trip_id>/media")
@jwt_required()
def list_media(trip_id: str):
    user_id = get_jwt_identity()
    trip = _owned_trip(trip_id, user_id)
    if trip is None:
        return error("Trip not found", 404)

    cursor = (
        get_db()
        .media.find(
            {
                "tripId": trip["_id"],
                "ownerId": ObjectId(user_id),
                "status": {"$in": ["accepted", "pending-review"]},
            }
        )
        .sort("createdAt", -1)
    )
    return jsonify({"media": [_serialize_with_urls(m) for m in cursor]})


@bp_media.patch("/<media_id>")
@jwt_required()
def update_media(media_id: str):
    user_id = get_jwt_identity()
    oid = _parse_oid(media_id)
    if oid is None:
        return error("Invalid media id", 400)

    db = get_db()
    media = db.media.find_one({"_id": oid, "ownerId": ObjectId(user_id)})
    if media is None:
        return error("Media not found", 404)

    data = request.get_json(silent=True) or {}
    updates: dict = {}
    if "note" in data:
        note = data.get("note") or ""
        if not isinstance(note, str):
            return error("note must be a string")
        if len(note) > 2000:
            return error("note too long (max 2000 chars)")
        updates["note"] = note
    if not updates:
        return error("No updatable fields provided")

    db.media.update_one({"_id": oid}, {"$set": updates})
    media.update(updates)
    return jsonify({"media": _serialize_with_urls(media)})


@bp_media.delete("/<media_id>")
@jwt_required()
def delete_media(media_id: str):
    user_id = get_jwt_identity()
    oid = _parse_oid(media_id)
    if oid is None:
        return error("Invalid media id", 400)

    db = get_db()
    media = db.media.find_one({"_id": oid, "ownerId": ObjectId(user_id)})
    if media is None:
        return error("Media not found", 404)

    if media.get("s3Key"):
        s3.delete_object(media["s3Key"])
    if media.get("thumbnailKey"):
        s3.delete_object(media["thumbnailKey"])
    db.media.delete_one({"_id": oid})
    return jsonify({"ok": True})
