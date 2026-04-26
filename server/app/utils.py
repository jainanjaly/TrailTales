"""Shared helpers for JSON responses and ObjectId handling."""
from __future__ import annotations

from typing import Any

from bson import ObjectId
from flask import jsonify


def serialize(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    """Convert a Mongo document for JSON output (ObjectId -> str, drop password hash)."""
    if doc is None:
        return None
    out: dict[str, Any] = {}
    for k, v in doc.items():
        if k == "passwordHash":
            continue
        if k == "_id":
            out["id"] = str(v)
        elif isinstance(v, ObjectId):
            out[k] = str(v)
        else:
            out[k] = v
    return out


def error(message: str, status: int = 400):
    return jsonify({"error": message}), status
