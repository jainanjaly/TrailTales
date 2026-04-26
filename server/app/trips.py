"""Trip CRUD routes."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from .db import get_db
from .utils import error, serialize

bp = Blueprint("trips", __name__, url_prefix="/api/trips")

DEFAULT_CURRENCY = "USD"


def _serialize_trip(doc: dict | None) -> dict | None:
    out = serialize(doc)
    if out is not None:
        # Older trips created before the per-trip currency field existed
        # default to USD so the client always sees a valid 3-letter code.
        out.setdefault("defaultCurrency", DEFAULT_CURRENCY)
    return out


def _parse_currency(raw: Any) -> str | None:
    if not isinstance(raw, str):
        return None
    code = raw.strip().upper()
    if len(code) != 3 or not code.isalpha():
        return None
    return code


def _parse_object_id(raw: str) -> ObjectId | None:
    try:
        return ObjectId(raw)
    except (InvalidId, TypeError):
        return None


def _parse_date(raw: Any) -> datetime | None:
    """Accept ISO-8601 strings (YYYY-MM-DD or full ISO). Return timezone-aware UTC."""
    if not raw or not isinstance(raw, str):
        return None
    try:
        # Support trailing "Z"
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _parse_location(raw: Any) -> dict | None:
    if not isinstance(raw, dict):
        return None
    name = (raw.get("name") or "").strip()
    try:
        lat = float(raw.get("lat"))
        lng = float(raw.get("lng"))
    except (TypeError, ValueError):
        return None
    if not name or not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        return None
    country = (raw.get("country") or "").strip() or None
    return {"name": name, "lat": lat, "lng": lng, "country": country}


def _owned_trip_or_none(trip_id: str, user_id: str) -> dict | None:
    oid = _parse_object_id(trip_id)
    if oid is None:
        return None
    db = get_db()
    return db.trips.find_one({"_id": oid, "ownerId": ObjectId(user_id)})


@bp.get("")
@jwt_required()
def list_trips():
    user_id = get_jwt_identity()
    db = get_db()
    cursor = (
        db.trips.find({"ownerId": ObjectId(user_id)})
        .sort("startDate", -1)
    )
    return jsonify({"trips": [_serialize_trip(t) for t in cursor]})


@bp.post("")
@jwt_required()
def create_trip():
    user_id = get_jwt_identity()
    data = request.get_json(silent=True) or {}

    title = (data.get("title") or "").strip()
    if not title:
        return error("title is required")

    location = _parse_location(data.get("location"))
    if location is None:
        return error("location.name, location.lat, location.lng are required")

    start_date = _parse_date(data.get("startDate"))
    end_date = _parse_date(data.get("endDate"))
    if start_date and end_date and end_date < start_date:
        return error("endDate must be on or after startDate")

    if "defaultCurrency" in data and data.get("defaultCurrency") is not None:
        currency = _parse_currency(data.get("defaultCurrency"))
        if currency is None:
            return error("defaultCurrency must be a 3-letter ISO code (e.g. USD)")
    else:
        currency = DEFAULT_CURRENCY

    doc = {
        "ownerId": ObjectId(user_id),
        "title": title,
        "location": location,
        "startDate": start_date,
        "endDate": end_date,
        "defaultCurrency": currency,
        "coverMediaId": None,
        "createdAt": datetime.now(timezone.utc),
    }
    result = get_db().trips.insert_one(doc)
    doc["_id"] = result.inserted_id
    return jsonify({"trip": _serialize_trip(doc)}), 201


@bp.get("/<trip_id>")
@jwt_required()
def get_trip(trip_id: str):
    user_id = get_jwt_identity()
    trip = _owned_trip_or_none(trip_id, user_id)
    if trip is None:
        return error("Trip not found", 404)
    return jsonify({"trip": _serialize_trip(trip)})


@bp.patch("/<trip_id>")
@jwt_required()
def update_trip(trip_id: str):
    user_id = get_jwt_identity()
    trip = _owned_trip_or_none(trip_id, user_id)
    if trip is None:
        return error("Trip not found", 404)

    data = request.get_json(silent=True) or {}
    updates: dict[str, Any] = {}

    if "title" in data:
        title = (data.get("title") or "").strip()
        if not title:
            return error("title cannot be empty")
        updates["title"] = title

    if "location" in data:
        loc = _parse_location(data.get("location"))
        if loc is None:
            return error("Invalid location")
        updates["location"] = loc

    if "startDate" in data:
        updates["startDate"] = _parse_date(data.get("startDate"))
    if "endDate" in data:
        updates["endDate"] = _parse_date(data.get("endDate"))

    if "defaultCurrency" in data:
        currency = _parse_currency(data.get("defaultCurrency"))
        if currency is None:
            return error("defaultCurrency must be a 3-letter ISO code")
        # Once expenses exist, lock the currency to avoid mixed-currency totals.
        existing = get_db().expenses.count_documents({"tripId": trip["_id"]})
        if existing > 0 and currency != trip.get("defaultCurrency", DEFAULT_CURRENCY):
            return error(
                "Cannot change trip currency once expenses have been logged",
                409,
            )
        updates["defaultCurrency"] = currency

    start = updates.get("startDate", trip.get("startDate"))
    end = updates.get("endDate", trip.get("endDate"))
    if start and end and end < start:
        return error("endDate must be on or after startDate")

    if not updates:
        return error("No updatable fields provided")

    get_db().trips.update_one({"_id": trip["_id"]}, {"$set": updates})
    trip.update(updates)
    return jsonify({"trip": _serialize_trip(trip)})


@bp.delete("/<trip_id>")
@jwt_required()
def delete_trip(trip_id: str):
    user_id = get_jwt_identity()
    trip = _owned_trip_or_none(trip_id, user_id)
    if trip is None:
        return error("Trip not found", 404)
    get_db().trips.delete_one({"_id": trip["_id"]})
    # Note: related media/expenses/timeline are cleaned up in their own phases.
    return jsonify({"ok": True})
