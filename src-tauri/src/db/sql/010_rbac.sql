-- Migration 010: Local RBAC — roles, permission registry, role defaults, user overrides
--
-- All QMS authorization is LOCAL. Nothing here touches the licensing backend.
--
-- DESIGN
--   roles                     built-in + admin-created custom roles
--   permissions               finite registry of real product actions
--   role_permissions          the default template for each role
--   user_permission_overrides explicit per-user ALLOW / DENY on top of the role
--
--   effective(user, perm) =
--       DENY override   -> false          (deny always wins)
--       ALLOW override  -> true
--       otherwise       -> role default
--
--   Storing only overrides (rather than a full per-user permission copy) means a
--   later change to a role template propagates to every user who has not
--   explicitly overridden that key — which is the deterministic behaviour the
--   brief asks for. It also makes "inherited vs explicitly granted vs explicitly
--   denied" directly representable, instead of inferred.
--
-- BACKWARD COMPATIBILITY
--   users.role (TEXT) is RETAINED and still written. The legacy role guards keep
--   working during and after this migration, so nothing breaks in one step.
--   users.role_id is APPENDED (never inserted — see migration 008) and backfilled
--   from the legacy string.
--
-- ROLE DEFAULTS ARE DERIVED FROM THE ACTUAL GUARDS IN src-tauri/src/commands/*.rs,
-- not from an idealised model, so existing users keep exactly the access they
-- have today. The mapping used:
--     require_authenticated        -> all five built-in roles
--     require_admin_qm_or_auditor  -> Admin, Quality Manager, Auditor
--     require_admin_or_quality_manager -> Admin, Quality Manager
--     require_admin                -> Admin

-- ── Roles ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS roles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    role_key    TEXT    NOT NULL UNIQUE,   -- stable id, never renamed
    name        TEXT    NOT NULL,          -- display name, editable
    description TEXT,
    is_system   INTEGER NOT NULL DEFAULT 0,-- built-in: cannot be deleted
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);

-- role_key deliberately matches the legacy users.role strings so the backfill
-- below is exact and so legacy guards and RBAC agree during the transition.
INSERT OR IGNORE INTO roles (role_key, name, description, is_system, is_active, created_at, updated_at) VALUES
    ('Admin',          'Admin',           'Full system administration, including users, roles and backups.', 1, 1, datetime('now'), datetime('now')),
    ('QualityManager', 'Quality Manager', 'Manages QMS records and master data. No user or role administration.', 1, 1, datetime('now'), datetime('now')),
    ('Auditor',        'Auditor',         'Runs audits and records findings. Read access to other modules.', 1, 1, datetime('now'), datetime('now')),
    ('Employee',       'Employee',        'Day-to-day read access across QMS modules.', 1, 1, datetime('now'), datetime('now')),
    ('Viewer',         'Viewer',          'Read-only access.', 1, 1, datetime('now'), datetime('now'));

-- ── Permission registry ──────────────────────────────────────────────────────
-- Only actions the product actually performs. No permission exists here for a
-- feature that does not exist (there is no business-record delete command
-- anywhere, so there are no *.delete keys outside backup).

CREATE TABLE IF NOT EXISTS permissions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    perm_key    TEXT    NOT NULL UNIQUE,   -- 'capa.create'
    module      TEXT    NOT NULL,          -- grouping for the admin matrix
    action      TEXT    NOT NULL,
    label       TEXT    NOT NULL,
    description TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO permissions (perm_key, module, action, label, description, sort_order) VALUES
 ('dashboard.view','dashboard','view','View dashboard','See KPI tiles and recent activity.',10),

 ('capa.view','capa','view','View CAPAs','List, open and read CAPA records and their activity.',100),
 ('capa.create','capa','create','Create CAPAs',NULL,110),
 ('capa.edit','capa','edit','Edit / close CAPAs','Edit details and change status, including closing.',120),
 ('capa.assign','capa','assign','Assign responsible person','Choose the CAPA responsible person.',130),
 ('capa.attach','capa','attach','Manage CAPA attachments',NULL,140),
 ('capa.export','capa','export','Export / print CAPAs',NULL,150),

 ('risks.view','risks','view','View risks',NULL,200),
 ('risks.create','risks','create','Create risks',NULL,210),
 ('risks.edit','risks','edit','Edit / close risks',NULL,220),
 ('risks.assign','risks','assign','Assign risk owner',NULL,230),
 ('risks.attach','risks','attach','Manage risk attachments',NULL,240),
 ('risks.export','risks','export','Export / print risks',NULL,250),

 ('complaints.view','complaints','view','View complaints',NULL,300),
 ('complaints.create','complaints','create','Create complaints',NULL,310),
 ('complaints.edit','complaints','edit','Edit / close complaints',NULL,320),
 ('complaints.assign','complaints','assign','Assign complaint handler',NULL,330),
 ('complaints.attach','complaints','attach','Manage complaint attachments',NULL,340),
 ('complaints.export','complaints','export','Export / print complaints',NULL,350),

 ('audits.view','audits','view','View audits',NULL,400),
 ('audits.create','audits','create','Create audits',NULL,410),
 ('audits.edit','audits','edit','Edit / close audits',NULL,420),
 ('audits.assign','audits','assign','Assign lead auditor',NULL,430),
 ('audits.finding_manage','audits','finding_manage','Record audit findings','Add and edit findings, and raise an NC from a finding.',440),
 ('audits.attach','audits','attach','Manage audit attachments',NULL,450),
 ('audits.export','audits','export','Export / print audits',NULL,460),

 ('nc.view','nc','view','View non-conformities',NULL,500),
 ('nc.create','nc','create','Create non-conformities',NULL,510),
 ('nc.edit','nc','edit','Edit / close non-conformities',NULL,520),
 ('nc.assign','nc','assign','Assign non-conformity owner',NULL,530),
 ('nc.attach','nc','attach','Manage NC attachments',NULL,540),
 ('nc.export','nc','export','Export / print non-conformities',NULL,550),

 -- Documents: keys defined now so the matrix is complete and stable.
 -- approve/reject and attachment lifecycle are IMPLEMENTED IN STAGE 4.
 ('documents.view','documents','view','View documents',NULL,600),
 ('documents.create','documents','create','Create documents',NULL,610),
 ('documents.edit','documents','edit','Edit document metadata',NULL,620),
 ('documents.attachment_manage','documents','attachment_manage','Manage document files','Attach, replace or remove a document file where the lifecycle allows.',630),
 ('documents.approve','documents','approve','Approve / reject documents','Stage 4 — approval workflow.',640),
 ('documents.print','documents','print','Print documents',NULL,650),
 ('documents.open_external','documents','open_external','Open documents externally','Hand a controlled file to the operating system.',660),

 ('users.view','users','view','View users',NULL,700),
 ('users.manage','users','manage','Manage users','Create, edit, deactivate users and reset passwords.',710),

 ('roles.view','roles','view','View roles and permissions',NULL,800),
 ('roles.manage','roles','manage','Manage roles and permissions','Create roles and change permission templates.',810),

 ('masterdata.view','masterdata','view','View master data',NULL,900),
 ('masterdata.manage','masterdata','manage','Manage master data','Risk sources and customers.',910),

 ('reports.view','reports','view','View reports section',NULL,1000),
 ('reports.run','reports','run','Run reports','CAPA, risk, audit and non-conformity registers.',1010),
 -- Separate key ONLY because the current guard on get_complaint_report excludes
 -- Auditor while the other four reports allow it. Preserved rather than silently
 -- widening an Auditor''s access. Worth revisiting as a product decision.
 ('reports.run_complaints','reports','run_complaints','Run complaint report',NULL,1020),

 ('backup.view','backup','view','View backup status',NULL,1100),
 ('backup.create','backup','create','Create backups',NULL,1110),
 ('backup.restore','backup','restore','Restore backups','Destructive: replaces the live database.',1120),

 ('settings.view','settings','view','View settings',NULL,1200),
 ('settings.manage','settings','manage','Manage settings',NULL,1210);

-- ── Role default templates ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Admin: everything.
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.role_key = 'Admin';

-- Quality Manager: everything except user/role administration and backup
-- create/restore, matching require_admin_or_quality_manager today.
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE r.role_key = 'QualityManager'
   AND p.perm_key NOT IN ('users.manage','roles.manage','backup.create','backup.restore');

-- Auditor: read everything, manage audit findings, run reports (except the
-- complaint report, preserving the current guard), no create/edit elsewhere.
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE r.role_key = 'Auditor'
   AND (p.action IN ('view')
        OR p.perm_key IN ('audits.finding_manage','reports.run'));

-- Employee: read access across modules.
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE r.role_key = 'Employee'
   AND p.action = 'view'
   AND p.module NOT IN ('users','roles');

-- Viewer: read-only, narrowest.
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE r.role_key = 'Viewer'
   AND p.action = 'view'
   AND p.module NOT IN ('users','roles','settings','backup','masterdata');

-- ── Per-user overrides ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_permission_overrides (
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    effect        TEXT    NOT NULL CHECK (effect IN ('ALLOW','DENY')),
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL,
    PRIMARY KEY (user_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_upo_user ON user_permission_overrides(user_id);

-- ── Link existing users to their role row ────────────────────────────────────
-- APPENDED column. users.role (TEXT) stays authoritative for the legacy guards
-- so nothing breaks mid-migration; role_id is the RBAC join.
ALTER TABLE users ADD COLUMN role_id INTEGER REFERENCES roles(id);

UPDATE users
   SET role_id = (SELECT r.id FROM roles r WHERE r.role_key = users.role)
 WHERE EXISTS (SELECT 1 FROM roles r WHERE r.role_key = users.role);

-- Any user whose legacy role string is not one of the five built-ins (should not
-- happen — validate_role has always restricted it) falls back to Viewer so they
-- are never left with no role at all.
UPDATE users
   SET role_id = (SELECT id FROM roles WHERE role_key = 'Viewer')
 WHERE role_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
