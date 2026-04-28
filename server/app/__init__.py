"""Flask application factory."""
from __future__ import annotations

import os

from dotenv import load_dotenv

# Must load .env BEFORE importing Config, since Config reads env vars at class definition time.
load_dotenv()

from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager

from .config import Config
from .db import init_db

jwt = JWTManager()


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)

    CORS(
        app,
        resources={r"/api/*": {"origins": app.config["FRONTEND_ORIGIN"]}},
        supports_credentials=False,
    )
    jwt.init_app(app)

    # Blueprints
    from .auth import bp as auth_bp
    from .collab import bp_invites, bp_moderation, bp_public
    from .expenses import bp as expenses_bp
    from .media import bp_media, bp_trip as media_trip_bp
    from .reels import bp_reel, bp_trip as reels_trip_bp
    from .timeline import bp as timeline_bp
    from .trips import bp as trips_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(trips_bp)
    app.register_blueprint(media_trip_bp)
    app.register_blueprint(bp_media)
    app.register_blueprint(expenses_bp)
    app.register_blueprint(timeline_bp)
    app.register_blueprint(bp_invites)
    app.register_blueprint(bp_public)
    app.register_blueprint(bp_moderation)
    app.register_blueprint(reels_trip_bp)
    app.register_blueprint(bp_reel)

    # Health check
    @app.get("/api/health")
    def health():
        return jsonify({"ok": True})

    # JSON error handlers
    @app.errorhandler(404)
    def _not_found(_e):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(405)
    def _method(_e):
        return jsonify({"error": "Method not allowed"}), 405

    @app.errorhandler(500)
    def _server(_e):
        return jsonify({"error": "Internal server error"}), 500

    @jwt.unauthorized_loader
    def _jwt_missing(reason):
        return jsonify({"error": f"Missing or invalid token: {reason}"}), 401

    @jwt.invalid_token_loader
    def _jwt_invalid(reason):
        return jsonify({"error": f"Invalid token: {reason}"}), 401

    @jwt.expired_token_loader
    def _jwt_expired(_h, _p):
        return jsonify({"error": "Token expired"}), 401

    init_db(app)
    return app
