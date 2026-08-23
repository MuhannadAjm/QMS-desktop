-- ─────────────────────────────────────────────────────────────────────────────
-- 012 — Link existing complaints to the customer master, conservatively.
--
-- Migration 008 added complaints.customer_ref_id but nothing ever populated it.
-- Complaints raised before the customer master existed carry only free text:
--   complaints.customer_name  — what the customer was called
--   complaints.customer_id    — the code that was typed at the time
-- Both are NOT NULL and both are RETAINED untouched by this migration. They are
-- the historical record of what the complaint said when it was raised, and a
-- later rename of the customer master must not rewrite them.
--
-- WHAT THIS LINKS
-- Only an EXACT match on the business code, compared case-insensitively after
-- trimming. customers.customer_code is UNIQUE, so at most one customer can match
-- a given code — an exact code match is unambiguous by construction, not a guess.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   * No fuzzy or partial name matching. "Acme" and "Acme Ltd" are not evidence
--     of the same legal entity, and wrongly attributing a complaint to a customer
--     is worse than leaving it unlinked.
--   * No name-only matching. Two customers may legitimately share a trading name;
--     the code is the identifier.
--   * No blanking, rewriting or deleting of any existing complaint text.
--   * No linking of complaints that already have a customer_ref_id.
--
-- An unlinked complaint stays fully readable: the UI shows its text snapshot and
-- simply reports that it is not linked to a master record. Nothing has to be
-- deleted or re-entered, and an administrator can link one by editing it and
-- picking the customer.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE complaints
   SET customer_ref_id = (
        SELECT cu.id
          FROM customers cu
         WHERE lower(trim(cu.customer_code)) = lower(trim(complaints.customer_id))
       )
 WHERE customer_ref_id IS NULL
   AND trim(customer_id) <> ''
   AND EXISTS (
        SELECT 1
          FROM customers cu
         WHERE lower(trim(cu.customer_code)) = lower(trim(complaints.customer_id))
       );

-- Record what the upgrade did, so the link is explainable afterwards rather than
-- appearing as if someone had edited every complaint by hand. record_id 0 marks a
-- system action: there is no single complaint this describes.
INSERT INTO activity_log (module, record_id, action, description, performed_by, performed_at)
SELECT 'master_data',
       0,
       'CUSTOMER_LINK_BACKFILL',
       'Upgrade linked ' || COUNT(*) || ' existing complaint(s) to a customer master record by exact customer code. '
         || 'Historical customer name and code text on those complaints was left unchanged.',
       NULL,
       datetime('now')
  FROM complaints
 WHERE customer_ref_id IS NOT NULL
HAVING COUNT(*) > 0;
