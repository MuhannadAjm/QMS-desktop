-- Migration 011: correct role default templates to match legacy access exactly
--
-- Migration 010 seeded templates with two broad rules ("all view actions",
-- "everything except these four keys"). Auditing the resulting matrix against
-- the real guards in src-tauri/src/commands/*.rs found parity breaks in BOTH
-- directions. Neither is acceptable: a widening hands out access nobody granted,
-- and a narrowing silently removes access users have today.
--
-- WIDENINGS REMOVED
--   users.view / roles.view were granted to QualityManager and Auditor because
--   they are "view" actions. But the real guard on list_users is require_admin —
--   only an Admin has ever been able to list user accounts. Granting these would
--   have leaked the user directory to two more roles the moment list_users is
--   migrated to require_permission. Removed from both.
--
--   (list_users_minimal was require_admin_or_quality_manager, but that is a
--   minimal id+name list for assignment, not directory access. It is being
--   replaced by the context-specific candidate APIs, which carry their own
--   business-permission checks — so it does not justify users.view here.)
--
-- NARROWINGS RESTORED
--   Viewer was excluded from masterdata.view, settings.view and backup.view by
--   the module blocklist. All three are readable by every authenticated user
--   today: list_risk_sources and get_backup_status use require_authenticated,
--   and get_settings has no guard at all. Removing them would have been a
--   regression for existing Viewer accounts.
--
-- Idempotent: DELETE is bounded by role_key + perm_key, INSERT uses OR IGNORE.

-- ── Remove widenings ─────────────────────────────────────────────────────────
DELETE FROM role_permissions
 WHERE role_id IN (SELECT id FROM roles WHERE role_key IN ('QualityManager', 'Auditor'))
   AND permission_id IN (SELECT id FROM permissions WHERE perm_key IN ('users.view', 'roles.view'));

-- ── Restore narrowings ───────────────────────────────────────────────────────
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE r.role_key = 'Viewer'
   AND p.perm_key IN ('masterdata.view', 'settings.view', 'backup.view');
