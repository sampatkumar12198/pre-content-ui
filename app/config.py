"""Configuration: load the Postgres DSN from .env.

The repo's .env stores a SQLAlchemy-style URL (`postgresql+asyncpg://...`).
asyncpg wants a plain libpq URL, so we strip the `+asyncpg` driver suffix here.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env sitting next to this project (content-panel/.env).
_BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BASE_DIR / ".env")


def _normalize_dsn(url: str) -> str:
    """Turn a SQLAlchemy URL into a plain DSN asyncpg accepts."""
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set. Add it to content-panel/.env"
        )
    # postgresql+asyncpg://...  ->  postgresql://...
    if "+" in url.split("://", 1)[0]:
        scheme, rest = url.split("://", 1)
        url = scheme.split("+", 1)[0] + "://" + rest
    return url


DATABASE_URL: str = _normalize_dsn(os.getenv("DATABASE_URL", ""))

# --- S3 (read-only) for proxying teaching-content images -------------------
# Optional: if creds are absent, image requests just 404 and the UI shows a
# placeholder instead of breaking.
S3_BUCKET: str = os.getenv("S3_BUCKET", "")
S3_REGION: str = os.getenv("S3_REGION", "us-east-1")
S3_ACCESS_KEY: str = os.getenv("S3_ACCESS_KEY", "")
S3_SECRET_KEY: str = os.getenv("S3_SECRET_KEY", "")
S3_ENDPOINT: str = os.getenv("S3_ENDPOINT", "")  # set only for MinIO / non-AWS

# --- Auth: signed-cookie sessions + a read-only Excel user list ------------
SESSION_SECRET: str = os.getenv("SESSION_SECRET", "dev-insecure-change-me")
# Excel file holding the manually-maintained user list (id, password, name, role).
USERS_XLSX = Path(os.getenv("USERS_XLSX", str(_BASE_DIR / "users.xlsx")))
# JSON file holding per-user exam assignments (managed in-app by admins).
ASSIGNMENTS_JSON = Path(os.getenv("ASSIGNMENTS_JSON", str(_BASE_DIR / "assignments.json")))
