-- ─────────────────────────────────────────────────────────────────────────────
-- 013 — Document approval becomes an Admin function by default.
--
-- WHY
-- Migration 010 builds the Quality Manager template by subtraction: every
-- permission EXCEPT users.manage, roles.manage, backup.create and
-- backup.restore. That rule was written before documents.approve existed, so
-- when the approval workflow landed the key was swept into Quality Manager
-- along with everything else — not by decision, but by the shape of an older
-- rule.
--
-- Approving a controlled document is the act that makes it effective. The owner
-- specifies it as an Admin function, so the shipped default is corrected here.
--
-- WHAT THIS IS NOT
-- The permission key is not removed, and no role-name check is introduced
-- anywhere. Authorization stays permission-based, so an administrator who wants
-- a Quality Manager — or any custom role — to approve documents can still grant
-- documents.approve through Roles & Permissions. This changes the DEFAULT, not
-- what is possible.
--
-- EXISTING INSTALLATIONS
-- A Quality Manager with no explicit decision recorded for this permission
-- loses it, which is the point of the correction. A user for whom an
-- administrator deliberately recorded an override — ALLOW or DENY — keeps that
-- override untouched: it is an explicit decision about that person, and a
-- default correction has no business overruling it.
--
-- Template counts after this migration:
--   Admin 53 · Quality Manager 46 (was 47) · Auditor 13 · Employee 11 · Viewer 11
-- ─────────────────────────────────────────────────────────────────────────────

-- Revoke from the Quality Manager TEMPLATE only.
DELETE FROM role_permissions
 WHERE role_id = (SELECT id FROM roles WHERE role_key = 'QualityManager')
   AND permission_id = (SELECT id FROM permissions WHERE perm_key = 'documents.approve');

-- Nothing else is touched: Auditor, Employee and Viewer never held it, and
-- Admin keeps it. Stated as an assertion rather than a change so the intent is
-- visible to anyone reading the migration history.
--
-- Per-user overrides are deliberately NOT deleted. user_permission_overrides
-- rows are explicit administrator decisions about a named person; the effective
-- permission engine applies them on top of whatever the template says, so an
-- explicit ALLOW survives this correction and an explicit DENY still denies.

-- Record the change where the product's own history lives, so a Quality Manager
-- who finds the button gone can be told why. record_id 0 marks a system action:
-- there is no single record this describes, and no user performed it.
INSERT INTO activity_log (module, record_id, action, description, performed_by, performed_at)
SELECT 'roles',
       0,
       'TEMPLATE_CORRECTED',
       'Document approval (documents.approve) removed from the Quality Manager role template; '
         || 'it is an Admin function by default. Explicit per-user grants were left in place. '
         || 'An administrator can still grant it to any role under Roles & Permissions.',
       NULL,
       datetime('now')
 WHERE EXISTS (SELECT 1 FROM roles WHERE role_key = 'QualityManager');
