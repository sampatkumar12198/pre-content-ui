"""Per-user exam assignments (which exams a non-admin user may operate on).

Stored as a small JSON file: { "<user_id>": [exam_id, exam_id, ...], ... }.
Admins are unrestricted (they implicitly have access to every exam).
"""
from __future__ import annotations

import json

from .config import ASSIGNMENTS_JSON


def load_assignments() -> dict[str, list[int]]:
    if not ASSIGNMENTS_JSON.exists():
        return {}
    try:
        data = json.loads(ASSIGNMENTS_JSON.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return {}
    out: dict[str, list[int]] = {}
    if isinstance(data, dict):
        for uid, exams in data.items():
            if isinstance(exams, list):
                out[str(uid)] = [int(e) for e in exams if str(e).strip().isdigit()]
    return out


def save_assignments(data: dict[str, list[int]]) -> None:
    ASSIGNMENTS_JSON.write_text(json.dumps(data, indent=2), encoding="utf-8")


def get_user_exams(user_id: str) -> list[int]:
    """Exam ids assigned to a non-admin user (empty list = no access)."""
    return load_assignments().get(str(user_id), [])


def set_user_exams(user_id: str, exam_ids: list[int]) -> list[int]:
    data = load_assignments()
    cleaned = sorted({int(e) for e in exam_ids})
    data[str(user_id)] = cleaned
    save_assignments(data)
    return cleaned


def remove_user(user_id: str) -> None:
    data = load_assignments()
    if str(user_id) in data:
        del data[str(user_id)]
        save_assignments(data)
