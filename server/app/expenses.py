"""Expense routes: CRUD + per-trip summary."""
from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from .db import get_db
from .utils import error, serialize

bp = Blueprint("expenses", __name__, url_prefix="/api/trips")


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


ALLOWED_CATEGORIES = {
    "accommodation", "food", "transport", "activities",
    "shopping", "health", "other",
}

DEFAULT_CURRENCY = "USD"


def _trip_currency(trip: dict) -> str:
    return (trip.get("defaultCurrency") or DEFAULT_CURRENCY).upper()


@bp.get("/<trip_id>/expenses")
@jwt_required()
def list_expenses(trip_id: str):
    user_id = get_jwt_identity()
    trip = _owned_trip(trip_id, user_id)
    if trip is None:
        return error("Trip not found", 404)

    expenses = list(
        get_db().expenses.find({"tripId": trip["_id"]}).sort("spentAt", 1)
    )
    return jsonify({"expenses": [serialize(e) for e in expenses]})


@bp.post("/<trip_id>/expenses")
@jwt_required()
def create_expense(trip_id: str):
    user_id = get_jwt_identity()
    trip = _owned_trip(trip_id, user_id)
    if trip is None:
        return error("Trip not found", 404)

    data = request.get_json(silent=True) or {}

    try:
        amount = float(data.get("amount") or 0)
    except (TypeError, ValueError):
        return error("amount must be a number")
    if amount <= 0:
        return error("amount must be positive")

    # Currency is enforced at the trip level so totals don't mix units.
    # The client-supplied value (if any) must match the trip's default.
    trip_currency = _trip_currency(trip)
    requested = data.get("currency")
    if requested:
        requested_code = str(requested).upper().strip()
        if requested_code != trip_currency:
            return error(
                f"This trip uses {trip_currency}. Update the trip currency to log expenses in another unit.",
                409,
            )
    currency = trip_currency

    category = (data.get("category") or "other").lower().strip()
    if category not in ALLOWED_CATEGORIES:
        return error(f"category must be one of: {', '.join(sorted(ALLOWED_CATEGORIES))}")

    note = (data.get("note") or "").strip()
    if len(note) > 500:
        return error("note too long (max 500 chars)")

    spent_at_raw = data.get("spentAt")
    if spent_at_raw:
        try:
            spent_at = datetime.fromisoformat(
                str(spent_at_raw).replace("Z", "+00:00")
            )
        except ValueError:
            return error("spentAt must be an ISO-8601 date string")
    else:
        spent_at = datetime.now(timezone.utc)

    doc = {
        "tripId": trip["_id"],
        "ownerId": ObjectId(user_id),
        "amount": amount,
        "currency": currency,
        "category": category,
        "note": note,
        "spentAt": spent_at,
        "createdAt": datetime.now(timezone.utc),
    }
    result = get_db().expenses.insert_one(doc)
    doc["_id"] = result.inserted_id
    return jsonify({"expense": serialize(doc)}), 201


@bp.patch("/<trip_id>/expenses/<expense_id>")
@jwt_required()
def update_expense(trip_id: str, expense_id: str):
    user_id = get_jwt_identity()
    trip = _owned_trip(trip_id, user_id)
    if trip is None:
        return error("Trip not found", 404)

    eid = _parse_oid(expense_id)
    if eid is None:
        return error("Invalid expense id")

    db = get_db()
    exp = db.expenses.find_one({"_id": eid, "tripId": trip["_id"]})
    if exp is None:
        return error("Expense not found", 404)

    data = request.get_json(silent=True) or {}
    updates: dict = {}

    if "amount" in data:
        try:
            amount = float(data["amount"])
        except (TypeError, ValueError):
            return error("amount must be a number")
        if amount <= 0:
            return error("amount must be positive")
        updates["amount"] = amount

    if "currency" in data:
        currency = (data["currency"] or "").upper().strip()
        trip_currency = _trip_currency(trip)
        if currency != trip_currency:
            return error(
                f"This trip uses {trip_currency}. Change the trip currency to switch units.",
                409,
            )
        updates["currency"] = currency

    if "category" in data:
        category = (data["category"] or "other").lower().strip()
        if category not in ALLOWED_CATEGORIES:
            return error(f"Invalid category")
        updates["category"] = category

    if "note" in data:
        note = (data["note"] or "").strip()
        if len(note) > 500:
            return error("note too long (max 500 chars)")
        updates["note"] = note

    if "spentAt" in data:
        try:
            updates["spentAt"] = datetime.fromisoformat(
                str(data["spentAt"]).replace("Z", "+00:00")
            )
        except ValueError:
            return error("spentAt must be ISO-8601")

    if not updates:
        return error("No updatable fields provided")

    db.expenses.update_one({"_id": eid}, {"$set": updates})
    exp.update(updates)
    return jsonify({"expense": serialize(exp)})


@bp.delete("/<trip_id>/expenses/<expense_id>")
@jwt_required()
def delete_expense(trip_id: str, expense_id: str):
    user_id = get_jwt_identity()
    trip = _owned_trip(trip_id, user_id)
    if trip is None:
        return error("Trip not found", 404)

    eid = _parse_oid(expense_id)
    if eid is None:
        return error("Invalid expense id")

    db = get_db()
    exp = db.expenses.find_one({"_id": eid, "tripId": trip["_id"]})
    if exp is None:
        return error("Expense not found", 404)

    db.expenses.delete_one({"_id": eid})
    return jsonify({"ok": True})


@bp.get("/<trip_id>/expenses/summary")
@jwt_required()
def expense_summary(trip_id: str):
    user_id = get_jwt_identity()
    trip = _owned_trip(trip_id, user_id)
    if trip is None:
        return error("Trip not found", 404)

    pipeline = [
        {"$match": {"tripId": trip["_id"]}},
        {
            "$group": {
                "_id": "$category",
                "total": {"$sum": "$amount"},
                "count": {"$sum": 1},
                "currency": {"$first": "$currency"},
            }
        },
        {"$sort": {"total": -1}},
    ]
    rows = list(get_db().expenses.aggregate(pipeline))
    by_category = [
        {
            "category": r["_id"],
            "total": round(r["total"], 2),
            "count": r["count"],
            "currency": r["currency"],
        }
        for r in rows
    ]
    grand_total = round(sum(r["total"] for r in rows), 2)
    currency = _trip_currency(trip)
    return jsonify(
        {
            "byCategory": by_category,
            "grandTotal": grand_total,
            "currency": currency,
        }
    )
