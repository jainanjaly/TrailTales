"""Authentication routes: register, login, me."""
from __future__ import annotations

from datetime import datetime, timezone

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from bson import ObjectId
from email_validator import EmailNotValidError, validate_email
from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required

from .db import get_db
from .utils import error, serialize

bp = Blueprint("auth", __name__, url_prefix="/api/auth")
_hasher = PasswordHasher()

MIN_PASSWORD_LEN = 8


def _validate_email(raw: str) -> str | None:
    try:
        return validate_email(raw, check_deliverability=False).normalized
    except EmailNotValidError:
        return None


@bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    display_name = (data.get("displayName") or "").strip()

    normalized = _validate_email(email)
    if not normalized:
        return error("Invalid email")
    if len(password) < MIN_PASSWORD_LEN:
        return error(f"Password must be at least {MIN_PASSWORD_LEN} characters")
    if not display_name:
        return error("displayName is required")

    db = get_db()
    if db.users.find_one({"email": normalized}):
        return error("Email already registered", 409)

    user_doc = {
        "email": normalized,
        "passwordHash": _hasher.hash(password),
        "displayName": display_name,
        "createdAt": datetime.now(timezone.utc),
    }
    result = db.users.insert_one(user_doc)
    user_doc["_id"] = result.inserted_id
    token = create_access_token(identity=str(result.inserted_id))
    return jsonify({"token": token, "user": serialize(user_doc)}), 201


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not email or not password:
        return error("email and password are required")

    db = get_db()
    user = db.users.find_one({"email": email})
    if not user:
        return error("Invalid credentials", 401)
    try:
        _hasher.verify(user["passwordHash"], password)
    except VerifyMismatchError:
        return error("Invalid credentials", 401)

    token = create_access_token(identity=str(user["_id"]))
    return jsonify({"token": token, "user": serialize(user)})


@bp.get("/me")
@jwt_required()
def me():
    user_id = get_jwt_identity()
    db = get_db()
    user = db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        return error("User not found", 404)
    return jsonify({"user": serialize(user)})
