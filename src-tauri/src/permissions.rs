use rusqlite::params;
use crate::db;

// Authorization for QMS Desktop.
//
// There is exactly ONE authorization system: effective permissions. The legacy
// role-name guards (require_admin / require_admin_or_quality_manager /
// require_admin_qm_or_auditor / require_authenticated) have all been removed
// now that every command uses require_permission. No code path anywhere
// authorizes by comparing a role string.
//
// Effective permission resolution:
//     explicit DENY override  -> false   (deny always wins)
//     explicit ALLOW override -> true
//     otherwise               -> the user's role template
//
// Only overrides are stored per user, so editing a role template propagates to
// every user who has not explicitly overridden that key.

use std::collections::HashSet;

/// Every permission key in effect for a user, after overrides.
/// An inactive user has no permissions at all.
pub fn effective_permissions(
    conn: &rusqlite::Connection,
    user_id: i64,
) -> Result<HashSet<String>, String> {
    let active: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE id = ?1 AND is_active = 1",
            params![user_id],
            |r| r.get(0),
        )
        .map_err(|e| format!("Failed to check user: {}", e))?;
    if active == 0 {
        return Ok(HashSet::new());
    }

    // An inactive (or missing) role revokes ALL access, including anything the
    // user holds as an explicit ALLOW override.
    //
    // The earlier implementation let overrides survive an inactive role, on the
    // reasoning that an explicit user-scoped grant is not "inherited" and so is
    // not the role's to withdraw. That is the wrong trade here: deactivating a
    // role is an administrative kill-switch, and an administrator who disables a
    // role reasonably expects everyone holding it to lose access immediately. If
    // overrides survived, disabling a role would silently leave a partially
    // privileged account behind — the opposite of what the action implies.
    //
    // Overrides are still PERSISTED; they simply do not evaluate. Reactivating
    // the role restores the previous effective set exactly, with no data lost.
    let role_active: i64 = conn
        .query_row(
            "SELECT COUNT(*)
               FROM users u
               JOIN roles r ON r.id = u.role_id
              WHERE u.id = ?1 AND r.is_active = 1",
            params![user_id],
            |r| r.get(0),
        )
        .map_err(|e| format!("Failed to check role state: {}", e))?;
    if role_active == 0 {
        return Ok(HashSet::new());
    }

    // Role defaults.
    let mut keys: HashSet<String> = HashSet::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT p.perm_key
                   FROM users u
                   JOIN roles r            ON r.id  = u.role_id AND r.is_active = 1
                   JOIN role_permissions rp ON rp.role_id = r.id
                   JOIN permissions p       ON p.id  = rp.permission_id
                  WHERE u.id = ?1",
            )
            .map_err(|e| format!("Failed to prepare role permission query: {}", e))?;
        let rows = stmt
            .query_map(params![user_id], |r| r.get::<_, String>(0))
            .map_err(|e| format!("Failed to query role permissions: {}", e))?;
        for k in rows.flatten() {
            keys.insert(k);
        }
    }

    // Overrides applied last: ALLOW adds, DENY removes.
    {
        let mut stmt = conn
            .prepare(
                "SELECT p.perm_key, o.effect
                   FROM user_permission_overrides o
                   JOIN permissions p ON p.id = o.permission_id
                  WHERE o.user_id = ?1",
            )
            .map_err(|e| format!("Failed to prepare override query: {}", e))?;
        let rows = stmt
            .query_map(params![user_id], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })
            .map_err(|e| format!("Failed to query overrides: {}", e))?;
        for (key, effect) in rows.flatten() {
            if effect == "DENY" {
                keys.remove(&key);
            } else {
                keys.insert(key);
            }
        }
    }

    Ok(keys)
}

/// Does this user hold the given permission?
///
/// Part of the authorization API surface alongside require_permission. Kept for
/// call sites that need to branch rather than reject (for example returning a
/// reduced payload instead of an error).
#[allow(dead_code)]
pub fn has_permission(user_id: i64, perm_key: &str) -> Result<bool, String> {
    let conn = db::open_conn()?;
    Ok(effective_permissions(&conn, user_id)?.contains(perm_key))
}

/// Authorize when ANY one of several permissions is sufficient.
///
/// Used by the assignment-candidate APIs: choosing who a CAPA is assigned to is
/// legitimate for anyone who can create, edit, or assign a CAPA. Requiring one
/// specific key would deny a user who can genuinely perform the action by
/// another route.
pub fn require_any_permission(user_id: i64, perm_keys: &[&str]) -> Result<(), String> {
    let conn = db::open_conn()?;

    let active: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE id = ?1 AND is_active = 1",
            params![user_id],
            |r| r.get(0),
        )
        .map_err(|e| format!("Failed to check user: {}", e))?;
    if active == 0 {
        return Err("Unauthorized: caller not found or account is inactive".to_string());
    }

    let held = effective_permissions(&conn, user_id)?;
    if perm_keys.iter().any(|k| held.contains(*k)) {
        Ok(())
    } else {
        Err(format!(
            "Unauthorized: one of [{}] required",
            perm_keys.join(", ")
        ))
    }
}

/// Authorize an action, or fail with a message naming the missing permission.
///
/// This is the canonical authorization entry point. Frontend hiding is
/// convenience only — every sensitive command must call this (or a legacy role
/// guard) regardless of what the UI shows.
pub fn require_permission(user_id: i64, perm_key: &str) -> Result<(), String> {
    let conn = db::open_conn()?;

    let active: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE id = ?1 AND is_active = 1",
            params![user_id],
            |r| r.get(0),
        )
        .map_err(|e| format!("Failed to check user: {}", e))?;
    if active == 0 {
        return Err("Unauthorized: caller not found or account is inactive".to_string());
    }

    if effective_permissions(&conn, user_id)?.contains(perm_key) {
        Ok(())
    } else {
        Err(format!("Unauthorized: '{}' permission required", perm_key))
    }
}

// ─── Admin lockout protection ────────────────────────────────────────────────

/// Permissions that together constitute the administrative control path. If no
/// active user holds ALL of these, the system can no longer be administered and
/// the only recovery is editing the database by hand.
pub const CONTROL_PERMISSIONS: [&str; 2] = ["users.manage", "roles.manage"];

/// Count active users who retain the full administrative control path.
///
/// Deliberately computed from EFFECTIVE permissions rather than from the role
/// name: an "Admin" whose permissions have been overridden away is not a control
/// path, and a custom role granted both keys is.
pub fn count_control_users(conn: &rusqlite::Connection) -> Result<i64, String> {
    let mut stmt = conn
        .prepare("SELECT id FROM users WHERE is_active = 1")
        .map_err(|e| format!("Failed to prepare user scan: {}", e))?;
    let ids: Vec<i64> = stmt
        .query_map([], |r| r.get::<_, i64>(0))
        .map_err(|e| format!("Failed to scan users: {}", e))?
        .flatten()
        .collect();

    let mut n = 0i64;
    for id in ids {
        let perms = effective_permissions(conn, id)?;
        if CONTROL_PERMISSIONS.iter().all(|k| perms.contains(*k)) {
            n += 1;
        }
    }
    Ok(n)
}

/// Refuse a change that would leave nobody able to administer the system.
///
/// Call AFTER applying the change inside a transaction, then roll back on Err.
/// Checking the post-state is what makes this correct for every mutation
/// (deactivation, role change, override, role template edit) without having to
/// predict each one's effect up front.
pub fn assert_control_path_retained(conn: &rusqlite::Connection) -> Result<(), String> {
    if count_control_users(conn)? == 0 {
        return Err(
            "This change would leave no active user able to manage users and roles. \
             Grant another account the 'users.manage' and 'roles.manage' permissions first."
                .to_string(),
        );
    }
    Ok(())
}

#[cfg(test)]
mod rbac_tests {
    use super::*;
    use rusqlite::Connection;

    /// Minimal RBAC schema mirroring migration 010, so resolution is exercised
    /// against real SQL rather than a mock.
    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE roles (id INTEGER PRIMARY KEY, role_key TEXT UNIQUE, is_active INTEGER DEFAULT 1);
             CREATE TABLE permissions (id INTEGER PRIMARY KEY, perm_key TEXT UNIQUE);
             CREATE TABLE role_permissions (role_id INTEGER, permission_id INTEGER, PRIMARY KEY(role_id,permission_id));
             CREATE TABLE user_permission_overrides (
                user_id INTEGER, permission_id INTEGER, effect TEXT,
                created_at TEXT, updated_at TEXT, PRIMARY KEY(user_id,permission_id));
             CREATE TABLE users (id INTEGER PRIMARY KEY, full_name TEXT, is_active INTEGER DEFAULT 1, role_id INTEGER);

             INSERT INTO roles (id, role_key, is_active) VALUES (1,'Admin',1), (2,'Viewer',1), (3,'Retired',0);
             INSERT INTO permissions (id, perm_key) VALUES
                (1,'users.manage'), (2,'roles.manage'), (3,'capa.view'), (4,'capa.create'), (5,'capa.edit');

             INSERT INTO role_permissions (role_id, permission_id) VALUES
                (1,1),(1,2),(1,3),(1,4),(1,5),
                (2,3),
                (3,1),(3,2),(3,3),(3,4),(3,5);

             INSERT INTO users (id, full_name, is_active, role_id) VALUES
                (1,'Alice Admin',1,1),
                (2,'Vic Viewer',1,2),
                (3,'Dan Deactivated',0,1),
                (4,'Rita RetiredRole',1,3);",
        )
        .unwrap();
        c
    }

    fn perms(c: &Connection, uid: i64) -> Vec<String> {
        let mut v: Vec<String> = effective_permissions(c, uid).unwrap().into_iter().collect();
        v.sort();
        v
    }

    fn add_override(c: &Connection, uid: i64, pid: i64, effect: &str) {
        c.execute(
            "INSERT INTO user_permission_overrides (user_id, permission_id, effect, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'x', 'x')",
            params![uid, pid, effect],
        )
        .unwrap();
    }

    #[test]
    fn role_defaults_are_inherited() {
        let c = db();
        assert_eq!(perms(&c, 2), vec!["capa.view"]);
        assert_eq!(perms(&c, 1).len(), 5);
    }

    #[test]
    fn explicit_allow_grants_beyond_the_role() {
        let c = db();
        add_override(&c, 2, 4, "ALLOW");
        assert_eq!(perms(&c, 2), vec!["capa.create", "capa.view"]);
    }

    /// Deny must beat an inherited grant, otherwise an override cannot restrict
    /// anyone and the model is one-directional.
    #[test]
    fn explicit_deny_overrides_an_inherited_grant() {
        let c = db();
        add_override(&c, 1, 5, "DENY");
        let p = perms(&c, 1);
        assert!(!p.contains(&"capa.edit".to_string()), "DENY must win over the role default");
        assert!(p.contains(&"capa.create".to_string()), "other inherited permissions are unaffected");
    }

    #[test]
    fn deny_removes_the_only_inherited_permission() {
        let c = db();
        add_override(&c, 2, 3, "DENY");
        assert!(perms(&c, 2).is_empty());
    }

    /// An inactive user holds nothing, regardless of role or overrides.
    #[test]
    fn inactive_user_has_no_permissions() {
        let c = db();
        add_override(&c, 3, 4, "ALLOW");
        assert!(perms(&c, 3).is_empty(), "deactivated account must lose all access");
    }

    /// Deactivating a ROLE must immediately stop it granting anything.
    #[test]
    fn inactive_role_grants_nothing() {
        let c = db();
        assert!(perms(&c, 4).is_empty(), "an inactive role must not grant permissions");
    }

    /// Deactivating a role is a kill-switch: a stored ALLOW override must NOT
    /// keep granting access through an inactive role. The override row is
    /// retained, it simply does not evaluate.
    #[test]
    fn stored_override_does_not_bypass_an_inactive_role() {
        let c = db();
        add_override(&c, 4, 3, "ALLOW");
        assert!(
            perms(&c, 4).is_empty(),
            "an ALLOW override must not survive deactivation of the user's role"
        );

        // …and the override is still on disk, not silently discarded.
        let stored: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM user_permission_overrides WHERE user_id = 4",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(stored, 1, "override must be persisted, only inert");
    }

    /// Reactivating the role must restore exactly what was effective before,
    /// including the previously inert override.
    #[test]
    fn reactivating_a_role_restores_the_effective_set() {
        let c = db();
        add_override(&c, 4, 3, "ALLOW");
        assert!(perms(&c, 4).is_empty());

        c.execute("UPDATE roles SET is_active = 1 WHERE id = 3", []).unwrap();

        // Role 3's template is the full set; plus the (now live) ALLOW override.
        let p = perms(&c, 4);
        assert_eq!(p.len(), 5, "reactivation restores the role template");
        assert!(p.contains(&"capa.view".to_string()));
    }

    /// A user with no role at all must hold nothing — fail closed rather than
    /// falling through to an empty template that looks like a clean pass.
    #[test]
    fn user_with_no_role_has_no_permissions() {
        let c = db();
        c.execute("UPDATE users SET role_id = NULL WHERE id = 2", []).unwrap();
        assert!(perms(&c, 2).is_empty());
    }

    #[test]
    fn control_path_counts_only_users_holding_every_control_permission() {
        let c = db();
        assert_eq!(count_control_users(&c).unwrap(), 1);
    }

    #[test]
    fn removing_the_last_control_user_is_refused() {
        let c = db();
        assert!(assert_control_path_retained(&c).is_ok());
        c.execute("UPDATE users SET is_active = 0 WHERE id = 1", []).unwrap();
        assert!(
            assert_control_path_retained(&c).is_err(),
            "must refuse a state with no active administrator"
        );
    }

    /// Half the control path is not a control path: a user left with only
    /// users.manage cannot restore roles, so this must still be refused.
    #[test]
    fn partial_control_permissions_do_not_count_as_a_control_path() {
        let c = db();
        add_override(&c, 1, 2, "DENY");
        assert_eq!(count_control_users(&c).unwrap(), 0);
        assert!(assert_control_path_retained(&c).is_err());
    }

    /// A non-Admin role granted both keys IS a valid control path. The invariant
    /// is about effective permissions, not the role name.
    #[test]
    fn a_custom_role_holding_both_keys_is_a_valid_control_path() {
        let c = db();
        c.execute("UPDATE users SET is_active = 0 WHERE id = 1", []).unwrap();
        add_override(&c, 2, 1, "ALLOW");
        add_override(&c, 2, 2, "ALLOW");
        assert_eq!(count_control_users(&c).unwrap(), 1);
        assert!(assert_control_path_retained(&c).is_ok());
    }

    /// Mirrors the migration-010 seeding rules to prove the legacy roles map to
    /// equivalent access, so upgrading does not quietly demote or promote anyone.
    #[test]
    fn seeded_role_templates_preserve_legacy_access_levels() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE roles (id INTEGER PRIMARY KEY, role_key TEXT, is_active INTEGER DEFAULT 1);
             CREATE TABLE permissions (id INTEGER PRIMARY KEY, perm_key TEXT, module TEXT, action TEXT);
             CREATE TABLE role_permissions (role_id INTEGER, permission_id INTEGER, PRIMARY KEY(role_id,permission_id));
             CREATE TABLE user_permission_overrides (user_id INTEGER, permission_id INTEGER, effect TEXT, created_at TEXT, updated_at TEXT);
             CREATE TABLE users (id INTEGER PRIMARY KEY, full_name TEXT, is_active INTEGER DEFAULT 1, role_id INTEGER);
             INSERT INTO roles (id, role_key) VALUES (1,'Admin'),(2,'QualityManager'),(3,'Auditor'),(4,'Employee'),(5,'Viewer');
             INSERT INTO permissions (id, perm_key, module, action) VALUES
                (1,'capa.view','capa','view'),
                (2,'capa.create','capa','create'),
                (3,'users.manage','users','manage'),
                (4,'roles.manage','roles','manage'),
                (5,'audits.finding_manage','audits','finding_manage'),
                (6,'backup.restore','backup','restore'),
                (7,'users.view','users','view'),
                (8,'roles.view','roles','view'),
                (9,'masterdata.view','masterdata','view');
             INSERT INTO users (id, full_name, role_id) VALUES (1,'A',1),(2,'Q',2),(3,'U',3),(4,'E',4),(5,'V',5);",
        )
        .unwrap();
        c.execute_batch(
            "INSERT INTO role_permissions SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.role_key='Admin';
             INSERT INTO role_permissions SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
               WHERE r.role_key='QualityManager' AND p.perm_key NOT IN ('users.manage','roles.manage','backup.create','backup.restore');
             INSERT INTO role_permissions SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
               WHERE r.role_key='Auditor' AND (p.action='view' OR p.perm_key IN ('audits.finding_manage','reports.run'));
             INSERT INTO role_permissions SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
               WHERE r.role_key='Employee' AND p.action='view' AND p.module NOT IN ('users','roles');
             INSERT INTO role_permissions SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
               WHERE r.role_key='Viewer' AND p.action='view' AND p.module NOT IN ('users','roles','settings','backup','masterdata');",
        )
        .unwrap();
        // Migration 011 parity corrections.
        c.execute_batch(
            "DELETE FROM role_permissions
              WHERE role_id IN (SELECT id FROM roles WHERE role_key IN ('QualityManager','Auditor'))
                AND permission_id IN (SELECT id FROM permissions WHERE perm_key IN ('users.view','roles.view'));
             INSERT INTO role_permissions SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
               WHERE r.role_key='Viewer' AND p.perm_key IN ('masterdata.view','settings.view','backup.view');",
        )
        .unwrap();

        let admin = perms(&c, 1);
        assert!(admin.contains(&"users.manage".to_string()));
        assert!(admin.contains(&"roles.manage".to_string()));
        assert!(admin.contains(&"backup.restore".to_string()));

        let qm = perms(&c, 2);
        assert!(qm.contains(&"capa.create".to_string()), "QM keeps create rights");
        assert!(!qm.contains(&"users.manage".to_string()), "QM must not gain user administration");
        assert!(!qm.contains(&"backup.restore".to_string()), "QM must not gain restore");

        let auditor = perms(&c, 3);
        assert!(auditor.contains(&"audits.finding_manage".to_string()));
        assert!(auditor.contains(&"capa.view".to_string()));
        assert!(!auditor.contains(&"capa.create".to_string()), "Auditor had no create rights before");

        let viewer = perms(&c, 5);
        assert!(viewer.contains(&"capa.view".to_string()));
        assert!(!viewer.contains(&"capa.create".to_string()));
        assert!(!viewer.contains(&"users.manage".to_string()));
        // Migration 011 parity: the user directory was require_admin, so no other
        // role may hold users.view. A widening here leaks the directory the moment
        // list_users migrates to require_permission.
        assert!(!qm.contains(&"users.view".to_string()), "QM must not see the user directory");
        assert!(!auditor.contains(&"users.view".to_string()), "Auditor must not see the user directory");
        assert!(admin.contains(&"users.view".to_string()), "Admin keeps directory access");
    }
}

#[cfg(test)]
mod propagation_tests {
    use super::*;
    use rusqlite::Connection;

    /// Schema mirroring migration 010, plus the exact statements the admin
    /// commands issue. These tests exercise the real SQL and the real
    /// assert_control_path_retained invariant; only the Tauri wrapper and
    /// db::open_conn (which resolves %APPDATA%) are out of scope.
    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE roles (id INTEGER PRIMARY KEY, role_key TEXT UNIQUE, name TEXT,
                is_system INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1);
             CREATE TABLE permissions (id INTEGER PRIMARY KEY, perm_key TEXT UNIQUE);
             CREATE TABLE role_permissions (role_id INTEGER, permission_id INTEGER,
                PRIMARY KEY(role_id, permission_id));
             CREATE TABLE user_permission_overrides (user_id INTEGER, permission_id INTEGER,
                effect TEXT, created_at TEXT, updated_at TEXT, PRIMARY KEY(user_id, permission_id));
             CREATE TABLE users (id INTEGER PRIMARY KEY, full_name TEXT, is_active INTEGER DEFAULT 1,
                role_id INTEGER);

             INSERT INTO roles (id, role_key, name, is_system) VALUES
                (1,'Admin','Admin',1), (2,'Custom','Custom Role',0);
             INSERT INTO permissions (id, perm_key) VALUES
                (1,'users.manage'), (2,'roles.manage'),
                (3,'capa.view'), (4,'capa.create'), (5,'capa.edit');

             -- Admin holds the full control path; Custom starts with capa.view only.
             INSERT INTO role_permissions VALUES (1,1),(1,2),(1,3),(1,4),(1,5), (2,3);

             INSERT INTO users (id, full_name, role_id) VALUES
                (1,'Alice Admin',1), (2,'Cara Custom',2);",
        )
        .unwrap();
        c
    }

    fn eff(c: &Connection, uid: i64) -> Vec<String> {
        let mut v: Vec<String> = effective_permissions(c, uid).unwrap().into_iter().collect();
        v.sort();
        v
    }

    fn grant(c: &Connection, role: i64, perm: i64) {
        c.execute(
            "INSERT OR IGNORE INTO role_permissions VALUES (?1, ?2)",
            params![role, perm],
        )
        .unwrap();
    }

    fn revoke(c: &Connection, role: i64, perm: i64) {
        c.execute(
            "DELETE FROM role_permissions WHERE role_id=?1 AND permission_id=?2",
            params![role, perm],
        )
        .unwrap();
    }

    fn set_override(c: &Connection, uid: i64, perm: i64, effect: &str) {
        c.execute(
            "INSERT INTO user_permission_overrides (user_id, permission_id, effect, created_at, updated_at)
             VALUES (?1,?2,?3,'x','x')
             ON CONFLICT(user_id, permission_id) DO UPDATE SET effect=excluded.effect",
            params![uid, perm, effect],
        )
        .unwrap();
    }

    // ── Section 9: template propagation ──────────────────────────────────────

    /// A user with NO override tracks their role template in both directions.
    /// This is the whole point of storing overrides sparsely.
    #[test]
    fn inherited_permission_follows_role_template_changes() {
        let c = db();
        assert_eq!(eff(&c, 2), vec!["capa.view"]);

        grant(&c, 2, 4); // template gains capa.create
        assert_eq!(eff(&c, 2), vec!["capa.create", "capa.view"]);

        revoke(&c, 2, 3); // template loses capa.view
        assert_eq!(eff(&c, 2), vec!["capa.create"]);
    }

    /// An explicit ALLOW keeps granting after the template drops the key —
    /// that is what makes it an override rather than a duplicate of the template.
    #[test]
    fn explicit_allow_survives_the_template_losing_that_key() {
        let c = db();
        set_override(&c, 2, 5, "ALLOW"); // capa.edit, not in the template
        assert!(eff(&c, 2).contains(&"capa.edit".to_string()));

        grant(&c, 2, 5);   // template now also grants it
        revoke(&c, 2, 5);  // …and then loses it again
        assert!(
            eff(&c, 2).contains(&"capa.edit".to_string()),
            "explicit ALLOW must remain effective independently of the template"
        );
    }

    /// An explicit DENY keeps denying even after the template grants the key.
    #[test]
    fn explicit_deny_survives_the_template_gaining_that_key() {
        let c = db();
        set_override(&c, 2, 3, "DENY"); // deny the one key the template grants
        assert!(eff(&c, 2).is_empty());

        grant(&c, 2, 4);
        grant(&c, 2, 5);
        let p = eff(&c, 2);
        assert!(!p.contains(&"capa.view".to_string()), "DENY must not be overturned by the template");
        assert!(p.contains(&"capa.create".to_string()), "other template keys still apply");
    }

    /// Deactivating the role zeroes effective access while PERSISTING overrides,
    /// and reactivation recomputes from the CURRENT template plus those overrides
    /// — not from anything cached at deactivation time.
    #[test]
    fn deactivation_then_reactivation_recomputes_from_current_template() {
        let c = db();
        set_override(&c, 2, 5, "ALLOW");
        set_override(&c, 2, 3, "DENY");
        assert_eq!(eff(&c, 2), vec!["capa.edit"]);

        c.execute("UPDATE roles SET is_active=0 WHERE id=2", []).unwrap();
        assert!(eff(&c, 2).is_empty(), "inactive role grants nothing");

        // Change the template WHILE the role is inactive.
        grant(&c, 2, 4);

        let stored: i64 = c
            .query_row("SELECT COUNT(*) FROM user_permission_overrides WHERE user_id=2", [], |r| r.get(0))
            .unwrap();
        assert_eq!(stored, 2, "overrides persist while inert");

        c.execute("UPDATE roles SET is_active=1 WHERE id=2", []).unwrap();

        // capa.view denied, capa.create newly inherited, capa.edit still allowed.
        assert_eq!(
            eff(&c, 2),
            vec!["capa.create", "capa.edit"],
            "reactivation must reflect the template as it is NOW, plus stored overrides"
        );
    }

    // ── Section 10: lockout through the real command statements ──────────────
    //
    // Each test performs the exact statement the corresponding command issues,
    // inside a transaction, then calls the same assert_control_path_retained the
    // command calls, and asserts the transaction is refused.

    fn control_path_after<F: Fn(&Connection)>(c: &mut Connection, change: F) -> Result<(), String> {
        let tx = c.transaction().unwrap();
        change(&tx);
        let r = assert_control_path_retained(&tx);
        if r.is_err() { tx.rollback().unwrap(); } else { tx.commit().unwrap(); }
        r
    }

    #[test]
    fn cannot_deactivate_the_final_control_path_user() {
        let mut c = db();
        let r = control_path_after(&mut c, |tx| {
            tx.execute("UPDATE users SET is_active=0 WHERE id=1", []).unwrap();
        });
        assert!(r.is_err(), "deactivating the only administrator must be refused");
        let still: i64 = c.query_row("SELECT is_active FROM users WHERE id=1", [], |r| r.get(0)).unwrap();
        assert_eq!(still, 1, "rollback must leave the account active");
    }

    #[test]
    fn cannot_deny_users_manage_on_the_final_control_path_user() {
        let mut c = db();
        let r = control_path_after(&mut c, |tx| {
            tx.execute(
                "INSERT INTO user_permission_overrides VALUES (1,1,'DENY','x','x')", [],
            ).unwrap();
        });
        assert!(r.is_err());
    }

    #[test]
    fn cannot_deny_roles_manage_on_the_final_control_path_user() {
        let mut c = db();
        let r = control_path_after(&mut c, |tx| {
            tx.execute(
                "INSERT INTO user_permission_overrides VALUES (1,2,'DENY','x','x')", [],
            ).unwrap();
        });
        assert!(r.is_err());
    }

    #[test]
    fn cannot_move_the_final_control_path_user_to_an_insufficient_role() {
        let mut c = db();
        let r = control_path_after(&mut c, |tx| {
            tx.execute("UPDATE users SET role_id=2 WHERE id=1", []).unwrap();
        });
        assert!(r.is_err(), "reassigning the last admin to a role without control keys must be refused");
    }

    #[test]
    fn cannot_deactivate_the_role_providing_the_final_control_path() {
        let mut c = db();
        let r = control_path_after(&mut c, |tx| {
            tx.execute("UPDATE roles SET is_active=0 WHERE id=1", []).unwrap();
        });
        assert!(r.is_err());
    }

    #[test]
    fn cannot_strip_a_control_permission_from_the_final_control_path_role() {
        let mut c = db();
        let r = control_path_after(&mut c, |tx| {
            // exactly what set_role_permissions does: wipe then re-insert
            tx.execute("DELETE FROM role_permissions WHERE role_id=1", []).unwrap();
            tx.execute("INSERT INTO role_permissions VALUES (1,3),(1,4),(1,5)", []).unwrap();
        });
        assert!(r.is_err(), "removing users.manage/roles.manage from the last admin role must be refused");

        let kept: i64 = c
            .query_row("SELECT COUNT(*) FROM role_permissions WHERE role_id=1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(kept, 5, "rollback must restore the whole template");
    }

    /// The same changes become legal once a SECOND control path exists — and it
    /// does not have to be the built-in Admin role. The invariant is about
    /// effective permissions, never the name "Admin".
    #[test]
    fn a_second_custom_role_control_path_unblocks_the_change() {
        let mut c = db();
        // Give the custom role the full control path and a user holding it.
        grant(&c, 2, 1);
        grant(&c, 2, 2);
        assert_eq!(count_control_users(&c).unwrap(), 2);

        let r = control_path_after(&mut c, |tx| {
            tx.execute("UPDATE users SET is_active=0 WHERE id=1", []).unwrap();
        });
        assert!(r.is_ok(), "deactivating one admin is fine while another control path remains");

        let now: i64 = c.query_row("SELECT is_active FROM users WHERE id=1", [], |r| r.get(0)).unwrap();
        assert_eq!(now, 0, "the change must actually commit");
        assert_eq!(count_control_users(&c).unwrap(), 1);
    }
}

/// Effective permissions computed against the SHIPPED migration files.
///
/// The parity test above re-states migrations 010 and 011 inline, which proves
/// the intent but cannot catch drift: edit the .sql and the test still passes
/// because it holds its own copy. These run the real runner over the real files,
/// so the assertions below are about the artifact that actually ships.
#[cfg(test)]
mod shipped_schema_tests {
    use super::*;
    use rusqlite::Connection;

    /// A migrated database in a scratch file. The runner needs a path, not an
    /// in-memory handle, because it sets WAL journalling.
    struct TempDb {
        path: std::path::PathBuf,
    }

    impl TempDb {
        fn new(tag: &str) -> Self {
            let mut path = std::env::temp_dir();
            path.push(format!("qms_shipped_schema_{}_{}.db", tag, std::process::id()));
            let _ = std::fs::remove_file(&path);
            crate::db::initialize_database(&path).expect("shipped migrations must apply cleanly");
            TempDb { path }
        }

        fn open(&self) -> Connection {
            let c = Connection::open(&self.path).unwrap();
            c.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
            c
        }
    }

    impl Drop for TempDb {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.path);
            let _ = std::fs::remove_file(self.path.with_extension("db-wal"));
            let _ = std::fs::remove_file(self.path.with_extension("db-shm"));
        }
    }

    fn count(c: &Connection, sql: &str) -> i64 {
        c.query_row(sql, [], |r| r.get(0)).unwrap()
    }

    /// Give each seeded role one user so effective_permissions can be exercised
    /// per role. Returns the ids in the order the roles were requested.
    fn seed_users(c: &Connection, role_keys: &[&str]) -> Vec<i64> {
        let mut ids = Vec::new();
        for (i, key) in role_keys.iter().enumerate() {
            let role_id: i64 = c
                .query_row(
                    "SELECT id FROM roles WHERE role_key = ?1",
                    params![key],
                    |r| r.get(0),
                )
                .unwrap_or_else(|_| panic!("seeded role {} is missing", key));
            c.execute(
                "INSERT INTO users (username, full_name, email, role, role_id, department,
                                    password_hash, is_active, created_at, updated_at)
                 VALUES (?1, ?2, NULL, ?3, ?4, '', 'x', 1, datetime('now'), datetime('now'))",
                params![format!("u{}", i), format!("User {}", i), key, role_id],
            )
            .unwrap();
            ids.push(c.last_insert_rowid());
        }
        ids
    }

    #[test]
    fn shipped_migrations_seed_the_expected_registry() {
        let db = TempDb::new("registry");
        let c = db.open();

        assert_eq!(count(&c, "SELECT COUNT(*) FROM permissions"), 53);
        assert_eq!(count(&c, "SELECT COUNT(*) FROM roles"), 5);
        assert_eq!(
            count(&c, "SELECT COUNT(*) FROM roles WHERE is_system = 1 AND is_active = 1"),
            5,
        );
        // Every permission key must be unique and non-empty, or the matrix would
        // render duplicate rows and overrides would be ambiguous.
        assert_eq!(
            count(&c, "SELECT COUNT(DISTINCT perm_key) FROM permissions WHERE perm_key <> ''"),
            53,
        );
    }

    /// The exact template sizes. These numbers are a deliberate tripwire: any
    /// edit to 010 or 011 that widens or narrows a role fails here and has to be
    /// justified, rather than shipping as a silent privilege change.
    #[test]
    fn shipped_role_templates_have_the_agreed_shape() {
        let db = TempDb::new("shape");
        let c = db.open();

        for (role_key, expected) in [
            ("Admin", 53),
            ("QualityManager", 47),
            ("Auditor", 13),
            ("Employee", 11),
            ("Viewer", 11),
        ] {
            let n: i64 = c
                .query_row(
                    "SELECT COUNT(*) FROM role_permissions rp
                       JOIN roles r ON r.id = rp.role_id
                      WHERE r.role_key = ?1",
                    params![role_key],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(n, expected, "{} template size changed", role_key);
        }
    }

    /// The engine and the shipped seed agreeing is the point: resolving a real
    /// user against the real templates must reproduce the access boundaries the
    /// pre-RBAC role guards had.
    #[test]
    fn effective_permissions_over_shipped_templates_preserve_access_boundaries() {
        let db = TempDb::new("effective");
        let c = db.open();
        let ids = seed_users(&c, &["Admin", "QualityManager", "Auditor", "Employee", "Viewer"]);

        let admin = effective_permissions(&c, ids[0]).unwrap();
        let qm = effective_permissions(&c, ids[1]).unwrap();
        let auditor = effective_permissions(&c, ids[2]).unwrap();
        let employee = effective_permissions(&c, ids[3]).unwrap();
        let viewer = effective_permissions(&c, ids[4]).unwrap();

        assert_eq!(admin.len(), 53, "Admin must hold every permission");

        // Administration stays with Admin alone.
        for other in [&qm, &auditor, &employee, &viewer] {
            assert!(!other.contains("users.manage"));
            assert!(!other.contains("roles.manage"));
            assert!(!other.contains("users.view"), "the user directory was admin-only");
            assert!(!other.contains("backup.restore"));
        }

        // Quality managers keep the full record-editing rights they had.
        assert!(qm.contains("capa.create") && qm.contains("capa.edit"));
        assert!(qm.contains("documents.approve"));

        // Auditors could read everything and manage findings, but never create.
        assert!(auditor.contains("audits.finding_manage"));
        assert!(auditor.contains("capa.view"));
        assert!(!auditor.contains("capa.create"));

        // Employee and Viewer are read-only.
        for readonly in [&employee, &viewer] {
            assert!(readonly.contains("capa.view"));
            assert!(!readonly.contains("capa.create"));
            assert!(!readonly.contains("capa.edit"));
        }
    }

    /// A user holding a role is only half of it — the lockout invariant has to
    /// hold over the shipped seed too, not just over the hand-built fixtures.
    #[test]
    fn the_shipped_admin_template_is_a_valid_control_path() {
        let db = TempDb::new("control");
        let c = db.open();
        let ids = seed_users(&c, &["Admin", "Viewer"]);

        assert_eq!(count_control_users(&c).unwrap(), 1);
        assert!(assert_control_path_retained(&c).is_ok());

        // Removing the only Admin must be refused; a Viewer is not a substitute.
        c.execute("UPDATE users SET is_active = 0 WHERE id = ?1", params![ids[0]])
            .unwrap();
        assert!(
            assert_control_path_retained(&c).is_err(),
            "deactivating the last control user must be refused",
        );

        // And the Viewer still is not one after the fact.
        c.execute("UPDATE users SET is_active = 1 WHERE id = ?1", params![ids[0]])
            .unwrap();
        let viewer_perms = effective_permissions(&c, ids[1]).unwrap();
        assert!(!viewer_perms.contains("users.manage"));
    }
}
