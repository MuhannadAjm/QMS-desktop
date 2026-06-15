-- Migration 003: Phase 4 Documents
-- Add original_file_name column to documents and document_revisions.
-- This column stores the user-visible filename separate from the stored filename on disk.

ALTER TABLE documents ADD COLUMN original_file_name TEXT;
ALTER TABLE document_revisions ADD COLUMN original_file_name TEXT;
