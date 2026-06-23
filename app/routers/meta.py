"""Exam + subject dropdown data (the cascading filters)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from .. import deps, queries

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/exams")
async def get_exams(allowed: list[int] | None = Depends(deps.allowed_exam_ids)):
    return await queries.list_exams(allowed)


@router.get("/exams/{exam_id}/subjects")
async def get_subjects(
    exam_id: int,
    allowed: list[int] | None = Depends(deps.allowed_exam_ids),
):
    if not await queries.exam_allowed(exam_id, allowed):
        raise HTTPException(status_code=403, detail="You don't have access to this exam")
    return await queries.subjects_for_exam(exam_id)
