"""Timeline entry routes: CRUD, sorted by date."""
from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from .db import get_db
from .utils import error, serialize

bp = Blueprint("timeline", __name__, url_prefix="/api/trips")


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


@bp.get("/<trip_id>/timeline")
@jwt_required()
def list_timeline(trip_id: str):
    user_id = get_jwt_identity()
    trip = _owned_trip(trip_id, user_id)
    if trip is None:
        return error("Trip not found", 404)

    entries = list(
        get_db().timelineEntries.find({"tripId": trip["_id"]}).sort("date", 1)
    )
    return jsonify({"entries": [serialize(e) for e in entries]})


@bp.post("/<trip_id>/timeline")
@jwt_required()
def create_entry(trip_id: str):
    user_id = get_jwt_identity()
    trip = _owned_trip(trip_id, user_id)
    if trip is None:
        return error("Trip not found", 404)

    data = request.get_json(silent=True) or {}

    date_raw = data.get("date") or ""
    try:
        entry_date = datetime.fromisoformat(str(date_raw).replace("Z", "+00:00"))
    except ValueError:
        return error("date must be an ISO-8601 date string (e.g. 2026-04-25)")

    title = (data.get("title") or "").strip()
    if not title:
        return error("title is required")
    if len(title) > 200:
        return error("title too long (max 200 chars)")

    description = (data.get("description") or "").strip()
    if len(description) > 2000:
        return error("description too long (max 2000 chars)")

    doc = {
        "tripId": trip["_id"],
        "ownerId": ObjectId(user_id),
        "date": entry_date,
        "title": title,
        "description": description,
        "createdAt": datetime.now(timezone.utc),
    }
    result = get_db().timelineEntries.insert_one(doc)
    doc["_id"] = result.inserted_id
    return jsonify({"entry": serialize(doc)}), 201


@bp.patch("/<trip_id>/timeline/<entry_id>")
@jwt_required()
def update_entry(trip_id: str, entry_id: str):
    user_id = get_jwt_identity()
    trip = _owned_trip(trip_id, user_id)
    if trip is None:
        return error("Trip not found", 404)

    eid = _parse_oid(entry_id)
    if eid is None:
        return error("Invalid entry id")

    db = get_db()
    entry = db.timelineEntries.find_one({"_id": eid, "tripId": trip["_id"]})
    if entry is None:
        return error("Entry not found", 404)

    data = request.get_json(silent=True) or {}
    updates: dict = {}

    if "date" in data:
        try:
            updates["date"] = datetime.fromisoformat(
                str(data["date"]).replace("Z", "+00:00")
            )
        except ValueError:
            return error("date must be ISO-8601")

    if "title" in data:
        title = (data["title"] or "").strip()
        if not title:
            return error("title cannot be empty")
        if len(title) > 200:
            return error("title too long")
        updates["title"] = title

    if "description" in data:
        desc = (data["description"] or "").strip()
        if len(desc) > 2000:
            return error("description too long")
        updates["description"] = desc

    if not updates:
        return error("No updatable fields provided")

    db.timelineEntries.update_one({"_id": eid}, {"$set": updates})
    entry.update(updates)
    return jsonify({"entry": serialize(entry)})


@bp.delete("/<trip_id>/timeline/<entry_id>")
@jwt_required()
def delete_entry(trip_id: str, entry_id: str):
    user_id = get_jwt_identity()
    trip = _owned_trip(trip_id, user_id)
    if trip is None:
        return error("Trip not found", 404)

    eid = _parse_oid(entry_id)
    if eid is None:
        return error("Invalid entry id")

    db = get_db()
    entry = db.timelineEntries.find_one({"_id": eid, "tripId": trip["_id"]})
    if entry is None:
        return error("Entry not found", 404)

    db.timelineEntries.delete_one({"_id": eid})
    return jsonify({"ok": True})
