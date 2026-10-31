-- Idempotent, atomic Collection Entry spreadsheet imports.
CREATE TABLE IF NOT EXISTS collection_import_batches (
  batch_id UUID PRIMARY KEY,
  row_count INTEGER NOT NULL CHECK (row_count > 0),
  created_by VARCHAR(200) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES collection_import_batches(batch_id),
  ADD COLUMN IF NOT EXISTS import_source_row INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS ux_collections_import_batch_row
  ON collections(import_batch_id, import_source_row)
  WHERE import_batch_id IS NOT NULL;
