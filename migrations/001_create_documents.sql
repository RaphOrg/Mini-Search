-- Mini Search Engine - Phase 1
-- Create base schema for storing raw documents and metadata.

BEGIN;

CREATE TABLE IF NOT EXISTS documents (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Helpful for listing/recent retrieval patterns.
CREATE INDEX IF NOT EXISTS documents_created_at_idx ON documents (created_at DESC);

COMMIT;
