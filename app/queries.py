"""All SQL for the content panel. Parameterized; no ORM.

Schema (live prepgraph_merged6):
  pgca.taxonomy_nodes(id uuid, parent_id uuid, node_type, canonical_name, slug,
                      description, ordinal, is_active, ...)
      node_type in ('subject','topic','concept','micro_concept'); hierarchy via parent_id.
  pgca.exam_concept_scope(exam_id -> catalog.exams.id, concept_id -> taxonomy_nodes.id, importance, ...)
  catalog.exams(id, code, name, full_name, deleted_at, ...)
  pgca.teaching_units(id, concept_id -> taxonomy_nodes.id(concept), primary_micro_concept_id -> (micro), ...)
  pgca.tu_micro_concept_refs(tu_id, micro_concept_id, ...)   many-to-many TU<->microconcept
  pgca.tu_variants(tu_id, speech_text, ...)                  the actual content text
"""
from __future__ import annotations

from . import db


# ---------------------------------------------------------------- exams / subjects

async def list_exams(allowed_exam_ids: list[int] | None = None) -> list[dict]:
    """All exams, or only the given ids (None = no restriction / admin)."""
    return await db.fetch(
        """
        SELECT id, code, name, full_name
        FROM catalog.exams
        WHERE deleted_at IS NULL
          AND ($1::int[] IS NULL OR id = ANY($1::int[]))
        ORDER BY name
        """,
        allowed_exam_ids,
    )


async def subjects_for_exam(exam_id: int) -> list[dict]:
    """Walk parent_id up from the exam's in-scope concepts to the subject nodes."""
    return await db.fetch(
        """
        WITH RECURSIVE up AS (
            SELECT c.id, c.parent_id, c.node_type, c.canonical_name
            FROM pgca.exam_concept_scope s
            JOIN pgca.taxonomy_nodes c ON c.id = s.concept_id
            WHERE s.exam_id = $1
            UNION ALL
            SELECT p.id, p.parent_id, p.node_type, p.canonical_name
            FROM up u
            JOIN pgca.taxonomy_nodes p ON p.id = u.parent_id
        )
        SELECT DISTINCT id, canonical_name AS name
        FROM up
        WHERE node_type = 'subject'
        ORDER BY name
        """,
        exam_id,
    )


# ---------------------------------------------------------------- concepts grid

async def list_concepts(
    exam_id: int | None,
    subject_id: str | None,
    search: str,
    include_inactive: bool,
    limit: int,
    offset: int,
    allowed_exam_ids: list[int] | None = None,
) -> tuple[list[dict], int]:
    """Concepts grid, server-side paginated. All filters are optional:

      - no exam            -> every concept node
      - exam only          -> concepts in scope for that exam
      - exam + subject     -> concepts in scope, under that subject

    `allowed_exam_ids` (None = admin/unrestricted) caps the visible set to concepts
    in scope for those exams, even when no specific exam filter is chosen.

    `importance` (per-exam) is computed for the whole filtered set so we can sort
    by it before paginating; the expensive micro/unit counts are computed only for
    the rows on the current page. `total` is a window count over the filtered set.
    """
    rows = await db.fetch(
        """
        WITH RECURSIVE up AS (
            SELECT s.concept_id, c.id AS cur_id, c.parent_id
            FROM pgca.exam_concept_scope s
            JOIN pgca.taxonomy_nodes c ON c.id = s.concept_id AND c.node_type = 'concept'
            WHERE s.exam_id = $1
            UNION ALL
            SELECT u.concept_id, p.id, p.parent_id
            FROM up u
            JOIN pgca.taxonomy_nodes p ON p.id = u.parent_id
        ),
        filtered AS (
            SELECT
                tn.id, tn.canonical_name, tn.slug, tn.description, tn.is_active,
                (SELECT sc.importance FROM pgca.exam_concept_scope sc
                   WHERE sc.exam_id = $1 AND sc.concept_id = tn.id LIMIT 1) AS importance
            FROM pgca.taxonomy_nodes tn
            WHERE tn.node_type = 'concept'
              AND ($1::int IS NULL OR tn.id IN (
                    SELECT concept_id FROM pgca.exam_concept_scope WHERE exam_id = $1))
              AND ($2::uuid IS NULL OR tn.id IN (
                    SELECT concept_id FROM up WHERE cur_id = $2::uuid))
              AND ($7::int[] IS NULL OR tn.id IN (
                    SELECT concept_id FROM pgca.exam_concept_scope WHERE exam_id = ANY($7::int[])))
              AND ($3::boolean OR tn.is_active = true)
              AND ($4 = '' OR tn.canonical_name ILIKE '%' || $4 || '%')
        ),
        page AS (
            SELECT *, count(*) OVER() AS total
            FROM filtered
            ORDER BY importance DESC NULLS LAST, canonical_name
            LIMIT $5 OFFSET $6
        )
        SELECT
            p.id, p.canonical_name, p.slug, p.description, p.is_active,
            p.importance, p.total,
            (SELECT count(*) FROM pgca.taxonomy_nodes mc
               WHERE mc.parent_id = p.id AND mc.node_type = 'micro_concept') AS micro_count,
            (SELECT count(*) FROM pgca.teaching_units tu
               WHERE tu.concept_id = p.id) AS tu_count
        FROM page p
        ORDER BY p.importance DESC NULLS LAST, p.canonical_name
        """,
        exam_id, subject_id, include_inactive, search, limit, offset, allowed_exam_ids,
    )
    total = rows[0]["total"] if rows else 0
    for r in rows:
        r.pop("total", None)
    return rows, total


# ---------------------------------------------------------------- access checks

async def exam_allowed(exam_id: int, allowed_exam_ids: list[int] | None) -> bool:
    if allowed_exam_ids is None:
        return True
    return exam_id in allowed_exam_ids


async def node_allowed(node_id: str, allowed_exam_ids: list[int] | None) -> bool:
    """True if the concept (or a microconcept's parent concept) is in scope for an
    allowed exam. None = unrestricted (admin)."""
    if allowed_exam_ids is None:
        return True
    return bool(await db.fetchval(
        """
        SELECT EXISTS (
            SELECT 1 FROM pgca.taxonomy_nodes n
            WHERE n.id = $1::uuid
              AND EXISTS (
                  SELECT 1 FROM pgca.exam_concept_scope s
                  WHERE s.exam_id = ANY($2::int[])
                    AND s.concept_id = (CASE WHEN n.node_type = 'concept'
                                             THEN n.id ELSE n.parent_id END)
              )
        )
        """,
        node_id, allowed_exam_ids,
    ))


async def artifact_allowed(artifact_id: str, allowed_exam_ids: list[int] | None) -> bool:
    """True if an image artifact is attached to a TU in an allowed exam's scope."""
    if allowed_exam_ids is None:
        return True
    return bool(await db.fetchval(
        """
        SELECT EXISTS (
            SELECT 1
            FROM pgca.tu_assets ta
            JOIN pgca.teaching_units tu ON tu.id = ta.tu_id
            WHERE ta.artifact_id = $1::uuid
              AND EXISTS (
                  SELECT 1 FROM pgca.exam_concept_scope s
                  WHERE s.exam_id = ANY($2::int[])
                    AND s.concept_id = COALESCE(
                        tu.concept_id,
                        (SELECT parent_id FROM pgca.taxonomy_nodes
                          WHERE id = tu.primary_micro_concept_id))
              )
        )
        """,
        artifact_id, allowed_exam_ids,
    ))


async def tu_allowed(tu_id: str, allowed_exam_ids: list[int] | None) -> bool:
    """True if a teaching unit's concept is in scope for an allowed exam."""
    if allowed_exam_ids is None:
        return True
    return bool(await db.fetchval(
        """
        SELECT EXISTS (
            SELECT 1 FROM pgca.teaching_units tu
            WHERE tu.id = $1::uuid
              AND EXISTS (
                  SELECT 1 FROM pgca.exam_concept_scope s
                  WHERE s.exam_id = ANY($2::int[])
                    AND s.concept_id = COALESCE(
                        tu.concept_id,
                        (SELECT parent_id FROM pgca.taxonomy_nodes
                          WHERE id = tu.primary_micro_concept_id))
              )
        )
        """,
        tu_id, allowed_exam_ids,
    ))


# ---------------------------------------------------------------- microconcepts

async def list_microconcepts(
    concept_id: str,
    search: str,
    include_inactive: bool,
    limit: int,
    offset: int,
) -> tuple[list[dict], int]:
    """Microconcepts (node_type='micro_concept') whose parent is the given concept."""
    rows = await db.fetch(
        """
        WITH base AS (
            SELECT
                mc.id, mc.canonical_name, mc.slug, mc.description, mc.is_active,
                (SELECT count(*) FROM (
                    SELECT id AS tu_id FROM pgca.teaching_units WHERE primary_micro_concept_id = mc.id
                    UNION
                    SELECT tu_id FROM pgca.tu_micro_concept_refs WHERE micro_concept_id = mc.id
                 ) x) AS tu_count
            FROM pgca.taxonomy_nodes mc
            WHERE mc.parent_id = $1::uuid AND mc.node_type = 'micro_concept'
              AND ($2::boolean OR mc.is_active = true)
              AND ($3 = '' OR mc.canonical_name ILIKE '%' || $3 || '%')
        )
        SELECT *, count(*) OVER() AS total
        FROM base
        ORDER BY canonical_name
        LIMIT $4 OFFSET $5
        """,
        concept_id, include_inactive, search, limit, offset,
    )
    total = rows[0]["total"] if rows else 0
    for r in rows:
        r.pop("total", None)
    return rows, total


# ---------------------------------------------------------------- teaching content

async def teaching_content_for_node(node_id: str) -> list[dict]:
    """Teaching units for a node (works for concept OR microconcept).

    concept  -> teaching_units.concept_id
    micro    -> teaching_units.primary_micro_concept_id OR tu_micro_concept_refs
    Includes one representative variant's speech_text (the actual lesson text).
    """
    return await db.fetch(
        """
        SELECT DISTINCT
            tu.id, tu.title, tu.objective, tu.scope_note,
            tu.angle::text            AS angle,
            tu.intrinsic_depth::text  AS intrinsic_depth,
            tu.status::text           AS status,
            tu.lesson_kind,
            tu.is_active,
            tu.estimated_duration_sec,
            tu.created_at, tu.updated_at,
            (SELECT v.speech_text FROM pgca.tu_variants v
               WHERE v.tu_id = tu.id
               ORDER BY (v.variant_register::text = 'standard') DESC, v.created_at
               LIMIT 1) AS speech_text,
            (SELECT v.id::text FROM pgca.tu_variants v
               WHERE v.tu_id = tu.id
               ORDER BY (v.variant_register::text = 'standard') DESC, v.created_at
               LIMIT 1) AS variant_id,
            (SELECT count(*) FROM pgca.tu_variants v WHERE v.tu_id = tu.id) AS variant_count,
            (SELECT coalesce(jsonb_agg(jsonb_build_object(
                        'artifact_id', a.id::text,
                        'slot', ta.slot,
                        'preferred', ta.preferred,
                        'alt_text', a.alt_text,
                        'media_type', a.media_type
                    ) ORDER BY ta.preferred DESC, ta.position), '[]'::jsonb)
               FROM pgca.tu_assets ta
               JOIN pgca.ca_artifacts a ON a.id = ta.artifact_id
               WHERE ta.tu_id = tu.id
                 AND (a.media_type ILIKE 'image/%'
                      OR a.uri ~* '\.(png|jpe?g|gif|webp|svg)$')) AS images
        FROM pgca.teaching_units tu
        WHERE tu.concept_id = $1::uuid
           OR tu.primary_micro_concept_id = $1::uuid
           OR tu.id IN (SELECT tu_id FROM pgca.tu_micro_concept_refs WHERE micro_concept_id = $1::uuid)
        ORDER BY tu.title
        """,
        node_id,
    )


# ---------------------------------------------------------------- image asset (proxy)

async def get_ca_artifact(artifact_id: str) -> dict | None:
    """The S3 URI + media type for an image asset, used by the image proxy."""
    return await db.fetchrow(
        """
        SELECT uri, media_type
        FROM pgca.ca_artifacts
        WHERE id = $1::uuid
        """,
        artifact_id,
    )


# ---------------------------------------------------------------- node detail + mutations

async def get_node(node_id: str) -> dict | None:
    return await db.fetchrow(
        """
        SELECT id, node_type, canonical_name, slug, description, is_active
        FROM pgca.taxonomy_nodes
        WHERE id = $1::uuid
        """,
        node_id,
    )


async def update_node(node_id: str, canonical_name: str, description: str | None) -> dict | None:
    return await db.fetchrow(
        """
        UPDATE pgca.taxonomy_nodes
        SET canonical_name = $2, description = $3, updated_at = now()
        WHERE id = $1::uuid
        RETURNING id, node_type, canonical_name, slug, description, is_active
        """,
        node_id, canonical_name, description,
    )


async def set_node_active(node_id: str, is_active: bool) -> dict | None:
    return await db.fetchrow(
        """
        UPDATE pgca.taxonomy_nodes
        SET is_active = $2, updated_at = now()
        WHERE id = $1::uuid
        RETURNING id, node_type, canonical_name, is_active
        """,
        node_id, is_active,
    )


# ---------------------------------------------------------------- teaching unit mutations

async def get_teaching_unit(tu_id: str) -> dict | None:
    return await db.fetchrow(
        """
        SELECT tu.id, tu.title, tu.objective, tu.scope_note, tu.is_active,
               tu.status::text AS status,
               (SELECT v.speech_text FROM pgca.tu_variants v
                  WHERE v.tu_id = tu.id
                  ORDER BY (v.variant_register::text = 'standard') DESC, v.created_at
                  LIMIT 1) AS speech_text
        FROM pgca.teaching_units tu
        WHERE tu.id = $1::uuid
        """,
        tu_id,
    )


async def update_teaching_unit(
    tu_id: str, title: str, objective: str | None, scope_note: str | None
) -> dict | None:
    return await db.fetchrow(
        """
        UPDATE pgca.teaching_units
        SET title = $2, objective = $3, scope_note = $4, updated_at = now()
        WHERE id = $1::uuid
        RETURNING id, title, objective, scope_note, is_active
        """,
        tu_id, title, objective, scope_note,
    )


async def update_variant_speech(variant_id: str, speech_text: str) -> dict | None:
    """Update the lesson (speech) text of an existing teaching-unit variant."""
    return await db.fetchrow(
        """
        UPDATE pgca.tu_variants
        SET speech_text = $2, updated_at = now()
        WHERE id = $1::uuid
        RETURNING id::text AS id
        """,
        variant_id, speech_text,
    )


async def create_variant(tu_id: str, speech_text: str) -> dict | None:
    """Create a standard-register lesson-text variant for a TU that has none."""
    return await db.fetchrow(
        """
        INSERT INTO pgca.tu_variants (tu_id, speech_text)
        VALUES ($1::uuid, $2)
        RETURNING id::text AS id
        """,
        tu_id, speech_text,
    )


async def set_tu_active(tu_id: str, is_active: bool) -> dict | None:
    return await db.fetchrow(
        """
        UPDATE pgca.teaching_units
        SET is_active = $2, updated_at = now()
        WHERE id = $1::uuid
        RETURNING id, title, is_active
        """,
        tu_id, is_active,
    )
