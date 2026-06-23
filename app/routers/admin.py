"""Admin-only endpoints: view users and assign exams to non-admin users."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import access, auth, deps, queries

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(deps.require_admin)])


class ExamAssignment(BaseModel):
    exam_ids: list[int]


class NewUser(BaseModel):
    id: str
    password: str
    name: str | None = None
    role: str = "user"
    exam_ids: list[int] = []


@router.get("/users")
async def list_users():
    """All users (from the Excel file) with their assigned exam ids."""
    assignments = access.load_assignments()
    out = []
    for u in auth.load_users().values():
        out.append({
            "id": u["id"],
            "name": u["name"],
            "role": u["role"],
            "is_admin": u["is_admin"],
            "exam_ids": [] if u["is_admin"] else assignments.get(u["id"], []),
        })
    out.sort(key=lambda x: (not x["is_admin"], x["name"].lower()))
    return out


@router.get("/exams")
async def all_exams():
    """Full exam list for the assignment UI (admins see every exam)."""
    return await queries.list_exams(None)


@router.post("/users")
async def create_user(body: NewUser):
    """Create a user in users.xlsx, optionally assigning exams to a non-admin."""
    try:
        user = auth.create_user(body.id, body.password, body.name or body.id, body.role)
    except auth.UsersFileLocked as e:
        raise HTTPException(status_code=423, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not user["is_admin"] and body.exam_ids:
        access.set_user_exams(user["id"], body.exam_ids)
    return user


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(deps.require_admin)):
    users = auth.load_users()
    if user_id not in users:
        raise HTTPException(status_code=404, detail="User not found")
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="You can't delete your own account")
    if users[user_id]["is_admin"] and sum(1 for u in users.values() if u["is_admin"]) <= 1:
        raise HTTPException(status_code=400, detail="Can't delete the last admin")
    try:
        auth.delete_user(user_id)
    except auth.UsersFileLocked as e:
        raise HTTPException(status_code=423, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    access.remove_user(user_id)
    return {"deleted": user_id}


@router.post("/users/{user_id}/exams")
async def set_exams(user_id: str, body: ExamAssignment):
    users = auth.load_users()
    if user_id not in users:
        raise HTTPException(status_code=404, detail="User not found")
    if users[user_id]["is_admin"]:
        raise HTTPException(status_code=400, detail="Admins already have access to all exams")
    saved = access.set_user_exams(user_id, body.exam_ids)
    return {"user_id": user_id, "exam_ids": saved}
