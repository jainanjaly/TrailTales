"""Tiny SMTP mailer used for collaborator invite emails (Phase 7).

Usage:
    send_email(to="alice@example.com", subject="...", text_body="...", html_body="...")

Returns True on success, False on any failure (the caller should log/skip
gracefully — invite creation must not fail just because email delivery did).

Configuration (env vars, all read via Config):
    SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD,
    SMTP_SECURITY = "starttls" | "ssl" | "none",
    SMTP_FROM, SMTP_FROM_NAME

If SMTP_HOST is unset, send_email returns False without attempting connection.
"""
from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

from flask import current_app

log = logging.getLogger(__name__)


def is_configured() -> bool:
    return bool(current_app.config.get("SMTP_HOST"))


def send_email(
    *,
    to: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
) -> bool:
    cfg = current_app.config
    host = cfg.get("SMTP_HOST")
    if not host:
        log.info("SMTP not configured; skipping email to %s", to)
        return False

    port = int(cfg.get("SMTP_PORT") or 587)
    username = cfg.get("SMTP_USERNAME")
    password = cfg.get("SMTP_PASSWORD")
    security = (cfg.get("SMTP_SECURITY") or "starttls").lower()
    from_addr = cfg.get("SMTP_FROM") or username
    from_name = cfg.get("SMTP_FROM_NAME") or "TrailTales"
    if not from_addr:
        log.warning("SMTP_FROM/SMTP_USERNAME missing; cannot send email")
        return False

    msg = EmailMessage()
    msg["From"] = formataddr((from_name, from_addr))
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text_body)
    if html_body:
        msg.add_alternative(html_body, subtype="html")

    try:
        if security == "ssl":
            with smtplib.SMTP_SSL(host, port, timeout=15) as server:
                if username and password:
                    server.login(username, password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=15) as server:
                server.ehlo()
                if security == "starttls":
                    server.starttls()
                    server.ehlo()
                if username and password:
                    server.login(username, password)
                server.send_message(msg)
        log.info("Sent email to %s (subject=%r)", to, subject)
        return True
    except (smtplib.SMTPException, OSError) as e:
        log.warning("Failed to send email to %s: %s", to, e)
        return False
