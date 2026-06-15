-- Phase 11A: Username-as-identifier backfill.
-- No schema change needed — username column (TEXT NOT NULL UNIQUE) already
-- exists from migration 001. Users created before Phase 11A had username = email.
-- Rust init code (backfill_email_usernames) runs after migrations complete and
-- extracts the local part (before '@') from any username that contains '@',
-- replacing non-alphanumeric characters with underscores and deduplicating.
SELECT 1;
