"""Microconcepts for a concept (paginated) + edit + soft-delete.

Microconcepts live in the same pgca.taxonomy_nodes table (node_type='micro_concept'),
so edit/active reuse the node mutations.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from .. import deps, queries
from .concepts import ActiveUpdate, NodeUpdate

router = APIRouter(prefix="/api", tags=["microconcepts"])


@router.get("/concepts/{concept_id}/microconcepts")
async def get_microconcepts(
    concept_id: str,
    search: str = Query(""),
    include_inactive: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    allowed: list[int] | None = Depends(deps.allowed_exam_ids),
):
    if not await queries.node_allowed(concept_id, allowed):
        raise HTTPException(status_code=403, detail="No access to this concept")
    offset = (page - 1) * page_size
    rows, total = await queries.list_microconcepts(
        concept_id, search.strip(), include_inactive, page_size, offset
    )
    return {"rows": rows, "total": total, "page": page, "page_size": page_size}


@router.put("/microconcepts/{node_id}")
async def edit_microconcept(
    node_id: str, body: NodeUpdate,
    allowed: list[int] | None = Depends(deps.allowed_exam_ids),
):
    if not await queries.node_allowed(node_id, allowed):
        raise HTTPException(status_code=403, detail="No access to this microconcept")
    updated = await queries.update_node(node_id, body.canonical_name, body.description)
    if updated is None:
        raise HTTPException(status_code=404, detail="Microconcept not found")
    return updated


@router.patch("/microconcepts/{node_id}/active")
async def set_microconcept_active(
    node_id: str, body: ActiveUpdate,
    allowed: list[int] | None = Depends(deps.allowed_exam_ids),
):
    if not await queries.node_allowed(node_id, allowed):
        raise HTTPException(status_code=403, detail="No access to this microconcept")
    updated = await queries.set_node_active(node_id, body.is_active)
    if updated is None:
        raise HTTPException(status_code=404, detail="Microconcept not found")
    return updated
