"""Concepts grid (server-side paginated) + edit + soft-delete."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from .. import deps, queries

router = APIRouter(prefix="/api", tags=["concepts"])


class NodeUpdate(BaseModel):
    canonical_name: str
    description: str | None = None


class ActiveUpdate(BaseModel):
    is_active: bool


@router.get("/concepts")
async def get_concepts(
    exam_id: int | None = Query(None),
    subject_id: str | None = Query(None),
    search: str = Query(""),
    include_inactive: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    allowed: list[int] | None = Depends(deps.allowed_exam_ids),
):
    if exam_id is not None and not await queries.exam_allowed(exam_id, allowed):
        raise HTTPException(status_code=403, detail="You don't have access to this exam")
    offset = (page - 1) * page_size
    rows, total = await queries.list_concepts(
        exam_id, (subject_id or None), search.strip(), include_inactive,
        page_size, offset, allowed,
    )
    return {"rows": rows, "total": total, "page": page, "page_size": page_size}


@router.put("/concepts/{node_id}")
async def edit_concept(
    node_id: str, body: NodeUpdate,
    allowed: list[int] | None = Depends(deps.allowed_exam_ids),
):
    if not await queries.node_allowed(node_id, allowed):
        raise HTTPException(status_code=403, detail="No access to this concept")
    updated = await queries.update_node(node_id, body.canonical_name, body.description)
    if updated is None:
        raise HTTPException(status_code=404, detail="Concept not found")
    return updated


@router.patch("/concepts/{node_id}/active")
async def set_concept_active(
    node_id: str, body: ActiveUpdate,
    allowed: list[int] | None = Depends(deps.allowed_exam_ids),
):
    if not await queries.node_allowed(node_id, allowed):
        raise HTTPException(status_code=403, detail="No access to this concept")
    updated = await queries.set_node_active(node_id, body.is_active)
    if updated is None:
        raise HTTPException(status_code=404, detail="Concept not found")
    return updated
