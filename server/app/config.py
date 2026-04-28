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

    # SMTP (Phase 7 — collaborator invite emails). All optional; if SMTP_HOST
    # is unset, invite emails are skipped and the owner copies the link manually.
    SMTP_HOST: str | None = os.getenv("SMTP_HOST") or None
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USERNAME: str | None = os.getenv("SMTP_USERNAME") or None
    SMTP_PASSWORD: str | None = os.getenv("SMTP_PASSWORD") or None
    # "starttls" (default, e.g. Gmail/SES on 587), "ssl" (port 465), or "none".
    SMTP_SECURITY: str = os.getenv("SMTP_SECURITY", "starttls").lower()
    SMTP_FROM: str | None = (
        os.getenv("SMTP_FROM") or os.getenv("SMTP_USERNAME") or None
    )
    SMTP_FROM_NAME: str = os.getenv("SMTP_FROM_NAME", "TrailTales")
