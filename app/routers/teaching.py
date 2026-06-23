"""Actual teaching content for a node (concept or microconcept) + edit + soft-delete."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from .. import deps, queries, s3
from .concepts import ActiveUpdate

router = APIRouter(prefix="/api", tags=["teaching"])


class TeachingUnitUpdate(BaseModel):
    title: str
    objective: str | None = None
    scope_note: str | None = None
    speech_text: str | None = None  # the lesson text (a tu_variant)
    variant_id: str | None = None   # which variant to update; None -> create one


@router.get("/nodes/{node_id}/teaching-content")
async def get_teaching_content(
    node_id: str,
    allowed: list[int] | None = Depends(deps.allowed_exam_ids),
):
    if not await queries.node_allowed(node_id, allowed):
        raise HTTPException(status_code=403, detail="No access to this item")
    return await queries.teaching_content_for_node(node_id)


@router.get("/assets/{artifact_id}/image")
async def get_asset_image(
    artifact_id: str,
    allowed: list[int] | None = Depends(deps.allowed_exam_ids),
):
    """Proxy an image asset's bytes from S3 so the browser can display it."""
    if not await queries.artifact_allowed(artifact_id, allowed):
        raise HTTPException(status_code=403, detail="No access to this image")
    row = await queries.get_ca_artifact(artifact_id)
    if row is None or not row.get("uri"):
        raise HTTPException(status_code=404, detail="Image not found")
    if not s3.configured():
        raise HTTPException(status_code=503, detail="Image storage is not configured")
    try:
        data = await s3.fetch_image(row["uri"])
    except Exception as exc:  # noqa: BLE001 — surface S3 failure as 502
        raise HTTPException(status_code=502, detail=f"Failed to fetch image: {exc}")
    if data is None:
        raise HTTPException(status_code=404, detail="Image not available")
    media_type = s3.sniff_image_type(data) or s3.content_type_for(
        row["uri"], row.get("media_type")
    )
    return Response(
        content=data,
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.put("/teaching-units/{tu_id}")
async def edit_teaching_unit(
    tu_id: str, body: TeachingUnitUpdate,
    allowed: list[int] | None = Depends(deps.allowed_exam_ids),
):
    if not await queries.tu_allowed(tu_id, allowed):
        raise HTTPException(status_code=403, detail="No access to this teaching unit")
    updated = await queries.update_teaching_unit(
        tu_id, body.title, body.objective, body.scope_note
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Teaching unit not found")

    # Persist the lesson text: update the shown variant, or create one if absent.
    if body.speech_text is not None:
        if body.variant_id:
            await queries.update_variant_speech(body.variant_id, body.speech_text)
        elif body.speech_text.strip():
            await queries.create_variant(tu_id, body.speech_text)
    return updated


@router.patch("/teaching-units/{tu_id}/active")
async def set_teaching_unit_active(
    tu_id: str, body: ActiveUpdate,
    allowed: list[int] | None = Depends(deps.allowed_exam_ids),
):
    if not await queries.tu_allowed(tu_id, allowed):
        raise HTTPException(status_code=403, detail="No access to this teaching unit")
    updated = await queries.set_tu_active(tu_id, body.is_active)
    if updated is None:
        raise HTTPException(status_code=404, detail="Teaching unit not found")
    return updated
