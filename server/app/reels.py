"""Reel generation routes (Phase 8).

Reels are short highlight videos rendered from a user-selected sequence of
trip media (photos and/or videos). Rendering happens in a background thread
so the API call returns immediately with a `queued` reel that the client can
poll. State machine: queued -> rendering -> ready | failed.

In-process threading is intentional for v1 — no Redis / Celery infra. Jobs
are lost on server restart; any reel left in `queued` or `rendering` after
restart should be considered failed by the client.
"""
from __future__ import annotations

import logging
import os
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path

from bson import ObjectId
from bson.errors import InvalidId
from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from . import s3
from .db import get_db
from .reel_renderer import ClipSpec, ensure_ffmpeg, render_reel
from .utils import error, serialize

log = logging.getLogger(__name__)

bp_trip = Blueprint("trip_reels", __name__, url_prefix="/api/trips")
bp_reel = Blueprint("reels", __name__, url_prefix="/api/reels")

ALLOWED_STYLES = {"classic", "punchy"}
MAX_CLIPS = 30
MIN_CLIPS = 1

# Music tracks live in this directory bundled with the server. Filenames
# (without extension) become the track id; the display name is derived from
# the filename. Drop .mp3/.m4a/.wav files in here to expose them.
MUSIC_DIR = Path(__file__).parent / "assets" / "music"
MUSIC_EXTS = {".mp3", ".m4a", ".aac", ".wav", ".ogg"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


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


def _serialize_reel(doc: dict | None) -> dict | None:
    if doc is None:
        return None
    out = serialize(doc) or {}
    # `serialize` only stringifies top-level ObjectIds; mediaIds is a list of them.
    if isinstance(doc.get("mediaIds"), list):
        out["mediaIds"] = [str(mid) for mid in doc["mediaIds"]]
    if doc.get("status") == "ready" and doc.get("s3Key"):
        out["downloadUrl"] = s3.presign_get(doc["s3Key"])
    return out


def _list_music_tracks() -> list[dict]:
    """Scan the bundled music directory for available tracks."""
    if not MUSIC_DIR.exists():
        return []
    tracks: list[dict] = []
    for path in sorted(MUSIC_DIR.iterdir()):
        if not path.is_file() or path.suffix.lower() not in MUSIC_EXTS:
            continue
        track_id = path.stem
        # "morning-walk" -> "Morning Walk"
        name = track_id.replace("_", " ").replace("-", " ").title()
        tracks.append({"id": track_id, "name": name, "ext": path.suffix.lower()})
    return tracks


def _resolve_music_path(track_id: str | None) -> str | None:
    if not track_id:
        return None
    for path in MUSIC_DIR.iterdir() if MUSIC_DIR.exists() else []:
        if path.is_file() and path.stem == track_id and path.suffix.lower() in MUSIC_EXTS:
            return str(path)
    return None


# ---------------------------------------------------------------------------
# Music + style metadata
# ---------------------------------------------------------------------------


@bp_reel.get("/music")
@jwt_required()
def list_music():
    return jsonify({"tracks": _list_music_tracks()})


# ---------------------------------------------------------------------------
# Reels CRUD
# ---------------------------------------------------------------------------


@bp_trip.get("/<trip_id>/reels")
@jwt_required()
def list_reels(trip_id: str):
    user_id = get_jwt_identity()
    trip = _owned_trip(trip_id, user_id)
    if trip is None:
        return error("Trip not found", 404)

    cursor = (
        get_db()
        .reels.find({"tripId": trip["_id"], "ownerId": ObjectId(user_id)})
        .sort("createdAt", -1)
    )
    return jsonify({"reels": [_serialize_reel(r) for r in cursor]})


@bp_trip.post("/<trip_id>/reels")
@jwt_required()
def create_reel(trip_id: str):
    user_id = get_jwt_identity()
    trip = _owned_trip(trip_id, user_id)
    if trip is None:
        return error("Trip not found", 404)

    # Fail fast if ffmpeg isn't installed so the user gets a real error
    # instead of a "failed" reel a few seconds later.
    try:
        ensure_ffmpeg()
    except RuntimeError as e:
        return error(str(e), 500)

    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip() or "Trip reel"
    if len(title) > 120:
        return error("title too long (max 120 chars)")

    style = data.get("style") or "classic"
    if style not in ALLOWED_STYLES:
        return error(f"style must be one of {sorted(ALLOWED_STYLES)}")

    music_track_id = data.get("musicTrackId") or None
    if music_track_id is not None:
        if not isinstance(music_track_id, str):
            return error("musicTrackId must be a string or null")
        if _resolve_music_path(music_track_id) is None:
            return error(f"Unknown music track: {music_track_id}")

    raw_ids = data.get("mediaIds") or []
    if not isinstance(raw_ids, list) or not (MIN_CLIPS <= len(raw_ids) <= MAX_CLIPS):
        return error(f"mediaIds must be a list of {MIN_CLIPS}\u2013{MAX_CLIPS} ids")

    media_oids: list[ObjectId] = []
    for raw in raw_ids:
        oid = _parse_oid(raw if isinstance(raw, str) else "")
        if oid is None:
            return error("Invalid media id in mediaIds")
        media_oids.append(oid)

    db = get_db()
    # Verify every media item belongs to this trip+owner and is accepted.
    found = list(
        db.media.find(
            {
                "_id": {"$in": media_oids},
                "tripId": trip["_id"],
                "ownerId": ObjectId(user_id),
                "status": "accepted",
            }
        )
    )
    if len(found) != len(media_oids):
        return error(
            "One or more selected media items are not available for this trip",
            400,
        )

    now = datetime.now(timezone.utc)
    doc = {
        "tripId": trip["_id"],
        "ownerId": ObjectId(user_id),
        "title": title,
        "style": style,
        "musicTrackId": music_track_id,
        "mediaIds": media_oids,
        "status": "queued",
        "errorMessage": None,
        "s3Key": None,
        "sizeBytes": 0,
        "durationSec": None,
        "createdAt": now,
        "completedAt": None,
    }
    result = db.reels.insert_one(doc)
    doc["_id"] = result.inserted_id

    _start_render_job(current_app._get_current_object(), result.inserted_id)
    return jsonify({"reel": _serialize_reel(doc)}), 201


@bp_reel.get("/<reel_id>")
@jwt_required()
def get_reel(reel_id: str):
    user_id = get_jwt_identity()
    oid = _parse_oid(reel_id)
    if oid is None:
        return error("Invalid reel id")
    db = get_db()
    reel = db.reels.find_one({"_id": oid, "ownerId": ObjectId(user_id)})
    if reel is None:
        return error("Reel not found", 404)
    return jsonify({"reel": _serialize_reel(reel)})


@bp_reel.delete("/<reel_id>")
@jwt_required()
def delete_reel(reel_id: str):
    user_id = get_jwt_identity()
    oid = _parse_oid(reel_id)
    if oid is None:
        return error("Invalid reel id")
    db = get_db()
    reel = db.reels.find_one({"_id": oid, "ownerId": ObjectId(user_id)})
    if reel is None:
        return error("Reel not found", 404)
    if reel.get("s3Key"):
        s3.delete_object(reel["s3Key"])
    db.reels.delete_one({"_id": oid})
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Background render job
# ---------------------------------------------------------------------------


def _start_render_job(app, reel_oid: ObjectId) -> None:
    """Spawn a daemon thread that renders the reel and updates the DB."""
    thread = threading.Thread(
        target=_run_render_job,
        args=(app, reel_oid),
        name=f"reel-{reel_oid}",
        daemon=True,
    )
    thread.start()


def _run_render_job(app, reel_oid: ObjectId) -> None:
    with app.app_context():
        db = get_db()
        try:
            db.reels.update_one(
                {"_id": reel_oid}, {"$set": {"status": "rendering"}}
            )
            reel = db.reels.find_one({"_id": reel_oid})
            if reel is None:
                log.warning("Reel %s vanished before render", reel_oid)
                return

            media_docs = {
                m["_id"]: m
                for m in db.media.find({"_id": {"$in": reel["mediaIds"]}})
            }
            # Preserve user-selected order.
            ordered = [media_docs[mid] for mid in reel["mediaIds"] if mid in media_docs]
            if len(ordered) != len(reel["mediaIds"]):
                raise RuntimeError("Some selected media is no longer available")

            with tempfile.TemporaryDirectory(prefix="reel-") as tmp:
                tmp_path = Path(tmp)
                clips: list[ClipSpec] = []
                for i, m in enumerate(ordered):
                    ext = Path(m["s3Key"]).suffix or (
                        ".jpg" if m["type"] == "photo" else ".mp4"
                    )
                    local = tmp_path / f"clip-{i:03d}{ext}"
                    s3.download_to(m["s3Key"], str(local))
                    clips.append(ClipSpec(path=str(local), kind=m["type"]))

                music_path = _resolve_music_path(reel.get("musicTrackId"))

                output_path = tmp_path / "reel.mp4"
                duration = render_reel(
                    clips=clips,
                    music_path=music_path,
                    style=reel["style"],
                    output_path=str(output_path),
                )

                size_bytes = output_path.stat().st_size
                s3_key = f"users/{reel['ownerId']}/trips/{reel['tripId']}/reels/{reel_oid}.mp4"
                s3.upload_file(str(output_path), s3_key, "video/mp4")

            db.reels.update_one(
                {"_id": reel_oid},
                {
                    "$set": {
                        "status": "ready",
                        "s3Key": s3_key,
                        "sizeBytes": size_bytes,
                        "durationSec": duration,
                        "completedAt": datetime.now(timezone.utc),
                        "errorMessage": None,
                    }
                },
            )
            log.info("Reel %s rendered (%.1fs, %d bytes)", reel_oid, duration, size_bytes)
        except Exception as e:  # noqa: BLE001 - we want to capture every failure
            log.exception("Reel %s failed to render", reel_oid)
            db.reels.update_one(
                {"_id": reel_oid},
                {
                    "$set": {
                        "status": "failed",
                        "errorMessage": str(e)[:500],
                        "completedAt": datetime.now(timezone.utc),
                    }
                },
            )


# Reference os to silence lint if reorganized later.
_ = os
