-- Soft-delete support for taxonomy nodes (concepts / microconcepts).
-- Additive and non-breaking: existing routers select explicit columns, never SELECT *.
ALTER TABLE pgca.taxonomy_nodes
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Keep the recursive parent_id walks (subject<-concept) fast.
CREATE INDEX IF NOT EXISTS taxonomy_nodes_parent_id_idx
  ON pgca.taxonomy_nodes (parent_id);

-- Helps the per-exam scope filtering.
CREATE INDEX IF NOT EXISTS exam_concept_scope_exam_id_idx
  ON pgca.exam_concept_scope (exam_id);
