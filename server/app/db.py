"""MongoDB client and index setup."""
from __future__ import annotations

import logging

from flask import Flask, current_app
from pymongo import ASCENDING, MongoClient
from pymongo.database import Database
from pymongo.errors import PyMongoError

log = logging.getLogger(__name__)
_client: MongoClient | None = None


def get_db() -> Database:
    """Return the application's Mongo database, creating the client on first use."""
    global _client
    if _client is None:
        _client = MongoClient(
            current_app.config["MONGO_URI"], serverSelectionTimeoutMS=5000
        )
    return _client[current_app.config["MONGO_DB_NAME"]]


def init_db(app: Flask) -> None:
    """Create indexes. Non-fatal if Mongo is unreachable at startup."""
    with app.app_context():
        try:
            db = get_db()
            db.users.create_index([("email", ASCENDING)], unique=True)
            # Indexes below are for upcoming phases; creating them early is cheap.
            db.trips.create_index([("ownerId", ASCENDING)])
            db.media.create_index([("tripId", ASCENDING)])
            db.expenses.create_index([("tripId", ASCENDING)])
            db.timelineEntries.create_index(
                [("tripId", ASCENDING), ("date", ASCENDING)]
            )
            db.collabInvites.create_index([("tokenHash", ASCENDING)], unique=True)
        except PyMongoError as e:
            log.warning("Skipping index creation; Mongo not reachable yet: %s", e)
