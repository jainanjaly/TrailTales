"""Collaborator contributions via magic-link invites (Phase 7).

Flow:
  1. Owner creates an invite for a guest email -> server generates a one-shot
     token, stores its sha256 hash, and returns the raw token to the owner
     once (so the owner can share the URL).
  2. Guest opens /contribute/<token> -> client calls GET /api/collab/invites/<token>
     to fetch trip context (no auth required).
  3. Guest uploads via presign/confirm endpoints; their submissions land with
     status="pending-review" and source="collaborator".
  4. Owner sees pending submissions in the dashboard and accepts or declines
     each one.

Guest uploads count against the trip OWNER's storage quota.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from bson.errors import InvalidId
from email_validator import EmailNotValidError, validate_email
from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from . import s3
from .db import get_db
from .mailer import is_configured as mail_configured, send_email
from .utils import error, serialize

bp_invites = Blueprint("collab_invites", __name__, url_prefix="/api/trips")
bp_public = Blueprint("collab_public", __name__, url_prefix="/api/collab")
bp_moderation = Blueprint("collab_moderation", __name__, url_prefix="/api/media")

INVITE_TTL_DAYS = 30
GUEST_NAME_MAX = 80


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


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


def _serialize_invite(doc: dict, *, include_url: str | None = None) -> dict:
    out = serialize(doc) or {}
    out.pop("tokenHash", None)
    if include_url:
        out["inviteUrl"] = include_url
    return out


def _owner_used_bytes(owner_oid: ObjectId) -> int:
    pipeline = [
        {"$match": {"ownerId": owner_oid, "status": {"$ne": "declined"}}},
        {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$sizeBytes", 0]}}}},
    ]
    result = list(get_db().media.aggregate(pipeline))
    return int(result[0]["total"]) if result else 0


def _serialize_media_with_urls(doc: dict) -> dict:
    out = serialize(doc) or {}
    if doc.get("s3Key"):
        out["url"] = s3.presign_get(doc["s3Key"])
    if doc.get("thumbnailKey"):
        out["thumbnailUrl"] = s3.presign_get(doc["thumbnailKey"])
    return out


def _frontend_origin() -> str:
    origin = current_app.config.get("FRONTEND_ORIGIN") or "http://localhost:5173"
    return origin.rstrip("/")


# ---------------------------------------------------------------------------
# Owner-facing endpoints (JWT required)
# ---------------------------------------------------------------------------


@bp_invites.post("/<trip_id>/invites")
@jwt_required()
def create_invite(trip_id: str):
    user_id = get_jwt_identity()
    trip = _owned_trip(trip_id, user_id)
    if trip is None:
        return error("Trip not found", 404)

    data = request.get_json(silent=True) or {}
    raw_email = (data.get("email") or "").strip().lower()
    try:
        email = validate_email(raw_email, check_deliverability=False).normalized
    except EmailNotValidError:
        return error("Invalid email")

    token = secrets.token_urlsafe(32)
    token_hash = _hash_token(token)
    now = datetime.now(timezone.utc)
    doc = {
        "tripId": trip["_id"],
        "ownerId": ObjectId(user_id),
        "email": email,
        "tokenHash": token_hash,
        "status": "active",
        "expiresAt": now + timedelta(days=INVITE_TTL_DAYS),
        "createdAt": now,
        "lastUsedAt": None,
        "uploadCount": 0,
    }
    result = get_db().collabInvites.insert_one(doc)
    doc["_id"] = result.inserted_id

    invite_url = f"{_frontend_origin()}/contribute/{token}"

    owner = get_db().users.find_one({"_id": ObjectId(user_id)}) or {}
    owner_name = owner.get("displayName") or "A TrailTales user"
    email_sent = _send_invite_email(
        to=email,
        owner_name=owner_name,
        trip_title=trip.get("title") or "their trip",
        invite_url=invite_url,
        expires_at=doc["expiresAt"],
    )

    return (
        jsonify(
            {
                "invite": _serialize_invite(doc, include_url=invite_url),
                # Token is returned ONCE so the owner can copy / share the link.
                "token": token,
                "inviteUrl": invite_url,
                "emailSent": email_sent,
                "emailConfigured": mail_configured(),
            }
        ),
        201,
    )


def _send_invite_email(
    *,
    to: str,
    owner_name: str,
    trip_title: str,
    invite_url: str,
    expires_at: datetime,
) -> bool:
    if not mail_configured():
        return False
    subject = f"{owner_name} invited you to contribute to '{trip_title}' on TrailTales"
    expires_str = expires_at.strftime("%B %d, %Y")
    text_body = (
        f"Hi,\n\n"
        f"{owner_name} invited you to share photos and videos for their trip "
        f"\"{trip_title}\" on TrailTales.\n\n"
        f"Open this link to upload (no account needed):\n{invite_url}\n\n"
        f"This link expires on {expires_str}.\n\n"
        f"If you weren't expecting this email, you can ignore it.\n"
    )
    safe_owner = _html_escape(owner_name)
    safe_trip = _html_escape(trip_title)
    safe_url = _html_escape(invite_url)
    html_body = f"""\
<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f9fafb;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:white;border:1px solid #e5e7eb;border-radius:12px;padding:28px;">
    <p style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.6px;margin:0;">TrailTales invitation</p>
    <h1 style="margin:6px 0 12px;font-size:22px;color:#111827;">You're invited to contribute</h1>
    <p style="color:#374151;font-size:15px;line-height:1.5;">
      <strong>{safe_owner}</strong> invited you to share photos and videos for their trip
      <strong>"{safe_trip}"</strong>.
    </p>
    <p style="margin:24px 0;">
      <a href="{safe_url}" style="display:inline-block;background:#111827;color:white;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">
        Upload your photos
      </a>
    </p>
    <p style="color:#6b7280;font-size:13px;">No account needed. This link expires on {expires_str}.</p>
    <p style="color:#9ca3af;font-size:12px;margin-top:24px;word-break:break-all;">
      If the button doesn't work, copy this URL: {safe_url}
    </p>
  </div>
</body></html>
"""
    return send_email(to=to, subject=subject, text_body=text_body, html_body=html_body)


def _html_escape(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


@bp_invites.get("/<trip_id>/invites")
@jwt_required()
def list_invites(trip_id: str):
    user_id = get_jwt_identity()
    trip = _owned_trip(trip_id, user_id)
    if trip is None:
        return error("Trip not found", 404)

    cursor = (
        get_db()
        .collabInvites.find({"tripId": trip["_id"], "ownerId": ObjectId(user_id)})
        .sort("createdAt", -1)
    )
    return jsonify({"invites": [_serialize_invite(d) for d in cursor]})


@bp_invites.delete("/<trip_id>/invites/<invite_id>")
@jwt_required()
def revoke_invite(trip_id: str, invite_id: str):
    user_id = get_jwt_identity()
    trip = _owned_trip(trip_id, user_id)
    if trip is None:
        return error("Trip not found", 404)

    invite_oid = _parse_oid(invite_id)
    if invite_oid is None:
        return error("Invalid invite id")

    db = get_db()
    res = db.collabInvites.update_one(
        {"_id": invite_oid, "tripId": trip["_id"], "ownerId": ObjectId(user_id)},
        {"$set": {"status": "revoked"}},
    )
    if res.matched_count == 0:
        return error("Invite not found", 404)
    return jsonify({"ok": True})


@bp_invites.get("/<trip_id>/media/pending")
@jwt_required()
def list_pending(trip_id: str):
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
                "status": "pending-review",
            }
        )
        .sort("createdAt", -1)
    )
    return jsonify({"media": [_serialize_media_with_urls(m) for m in cursor]})


@bp_moderation.post("/<media_id>/accept")
@jwt_required()
def accept_media(media_id: str):
    user_id = get_jwt_identity()
    oid = _parse_oid(media_id)
    if oid is None:
        return error("Invalid media id")

    db = get_db()
    media = db.media.find_one(
        {"_id": oid, "ownerId": ObjectId(user_id), "status": "pending-review"}
    )
    if media is None:
        return error("Pending media not found", 404)

    db.media.update_one({"_id": oid}, {"$set": {"status": "accepted"}})
    media["status"] = "accepted"
    return jsonify({"media": _serialize_media_with_urls(media)})


@bp_moderation.post("/<media_id>/decline")
@jwt_required()
def decline_media(media_id: str):
    user_id = get_jwt_identity()
    oid = _parse_oid(media_id)
    if oid is None:
        return error("Invalid media id")

    db = get_db()
    media = db.media.find_one(
        {"_id": oid, "ownerId": ObjectId(user_id), "status": "pending-review"}
    )
    if media is None:
        return error("Pending media not found", 404)

    # Free the storage immediately on decline.
    if media.get("s3Key"):
        s3.delete_object(media["s3Key"])
    if media.get("thumbnailKey"):
        s3.delete_object(media["thumbnailKey"])
    db.media.delete_one({"_id": oid})
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Public guest-facing endpoints (NO JWT)
# ---------------------------------------------------------------------------


def _resolve_active_invite(token: str) -> tuple[dict, dict] | None:
    """Look up an active, unexpired invite plus its trip. Returns (invite, trip) or None."""
    if not token or not isinstance(token, str):
        return None
    db = get_db()
    invite = db.collabInvites.find_one({"tokenHash": _hash_token(token)})
    if invite is None or invite.get("status") != "active":
        return None
    expires_at = invite.get("expiresAt")
    if expires_at is not None:
        # Mongo returns naive UTC datetimes by default; treat as UTC.
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            db.collabInvites.update_one(
                {"_id": invite["_id"]}, {"$set": {"status": "expired"}}
            )
            return None
    trip = db.trips.find_one({"_id": invite["tripId"]})
    if trip is None:
        return None
    return invite, trip


@bp_public.get("/invites/<token>")
def get_invite_public(token: str):
    resolved = _resolve_active_invite(token)
    if resolved is None:
        return error("Invite is invalid, expired, or revoked", 404)
    invite, trip = resolved
    owner = get_db().users.find_one({"_id": invite["ownerId"]}) or {}
    return jsonify(
        {
            "trip": {
                "id": str(trip["_id"]),
                "title": trip.get("title"),
                "location": trip.get("location"),
                "startDate": trip.get("startDate"),
                "endDate": trip.get("endDate"),
            },
            "ownerName": owner.get("displayName") or "the trip owner",
            "guestEmail": invite.get("email"),
            "expiresAt": invite.get("expiresAt"),
        }
    )


def _validated_guest_name(raw) -> str | None:
    if not isinstance(raw, str):
        return None
    name = raw.strip()
    if not name or len(name) > GUEST_NAME_MAX:
        return None
    return name


@bp_public.post("/invites/<token>/media/presign")
def presign_guest_upload(token: str):
    resolved = _resolve_active_invite(token)
    if resolved is None:
        return error("Invite is invalid, expired, or revoked", 404)
    invite, trip = resolved

    data = request.get_json(silent=True) or {}
    guest_name = _validated_guest_name(data.get("guestName"))
    if guest_name is None:
        return error("Your name is required (max 80 chars)")

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

    owner_oid = invite["ownerId"]
    used = _owner_used_bytes(owner_oid)
    if used + size_bytes > s3.PER_USER_QUOTA_BYTES:
        return error("Trip owner is out of storage quota", 413)

    _, s3_key, thumb_key = s3.build_keys(str(owner_oid), str(trip["_id"]), content_type)

    doc = {
        "tripId": trip["_id"],
        "ownerId": owner_oid,
        "uploaderId": None,
        "type": kind,
        "s3Key": s3_key,
        "thumbnailKey": thumb_key,
        "note": "",
        "takenAt": None,
        "source": "collaborator",
        "status": "pending-upload",
        "sizeBytes": 0,
        "contentType": content_type,
        "createdAt": datetime.now(timezone.utc),
        "guestName": guest_name,
        "guestEmail": invite.get("email"),
        "inviteId": invite["_id"],
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


@bp_public.post("/invites/<token>/media/confirm")
def confirm_guest_upload(token: str):
    resolved = _resolve_active_invite(token)
    if resolved is None:
        return error("Invite is invalid, expired, or revoked", 404)
    invite, trip = resolved

    data = request.get_json(silent=True) or {}
    media_oid = _parse_oid(data.get("mediaId") or "")
    if media_oid is None:
        return error("mediaId required")

    db = get_db()
    media = db.media.find_one(
        {
            "_id": media_oid,
            "tripId": trip["_id"],
            "inviteId": invite["_id"],
            "status": "pending-upload",
        }
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

    if media.get("thumbnailKey"):
        thumb_size = s3.head_size(media["thumbnailKey"]) or 0
        if thumb_size > s3.MAX_THUMB_BYTES:
            s3.delete_object(media["thumbnailKey"])
            db.media.update_one({"_id": media_oid}, {"$set": {"thumbnailKey": None}})
            media["thumbnailKey"] = None

    db.media.update_one(
        {"_id": media_oid},
        {"$set": {"status": "pending-review", "sizeBytes": size}},
    )
    db.collabInvites.update_one(
        {"_id": invite["_id"]},
        {
            "$set": {"lastUsedAt": datetime.now(timezone.utc)},
            "$inc": {"uploadCount": 1},
        },
    )
    return jsonify({"ok": True})
