"""Application configuration loaded from environment variables."""
from __future__ import annotations

import os
from datetime import timedelta


class Config:
    # Flask
    DEBUG: bool = os.getenv("FLASK_DEBUG", "0") == "1"
    PORT: int = int(os.getenv("PORT", "5000"))

    # Mongo
    MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    MONGO_DB_NAME: str = os.getenv("MONGO_DB_NAME", "trailtales")

    # JWT
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "dev-insecure-change-me")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(
        minutes=int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", "60"))
    )

    # CORS
    FRONTEND_ORIGIN: str = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

    # AWS (used from Phase 3)
    AWS_REGION: str = os.getenv("AWS_REGION", "us-east-1")
    AWS_ACCESS_KEY_ID: str | None = os.getenv("AWS_ACCESS_KEY_ID") or None
    AWS_SECRET_ACCESS_KEY: str | None = os.getenv("AWS_SECRET_ACCESS_KEY") or None
    S3_BUCKET: str | None = os.getenv("S3_BUCKET") or None

    # Magic-link signing (Phase 5)
    COLLAB_INVITE_SECRET: str = os.getenv("COLLAB_INVITE_SECRET", "dev-collab-secret")
