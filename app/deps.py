"""FastAPI dependencies for auth / authorization in the API routers."""
from __future__ import annotations

from fastapi import HTTPException, Request

from . import access


def current_user(request: Request) -> dict:
    user = request.session.get("user")
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def require_admin(request: Request) -> dict:
    user = current_user(request)
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")
    return user


def allowed_exam_ids(request: Request) -> list[int] | None:
    """Exam ids the current user may access; None means unrestricted (admin)."""
    user = current_user(request)
    if user.get("is_admin"):
        return None
    return access.get_user_exams(user["id"])
