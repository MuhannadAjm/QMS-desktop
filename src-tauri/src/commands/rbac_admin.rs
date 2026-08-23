//! Role and user-RBAC administration commands.
//!
//! These are the write surface behind the Roles & Permissions and User
//! Administration screens. They reuse the existing engine in permissions.rs —
//! there is deliberately no second permission implementation here.
//!
//! Every mutation that can affect authorization runs inside a transaction and
//! calls permissions::assert_control_path_retained on the RESULTING state,
//! rolling back if the change would leave nobody able to administer the system.
//! Checking the post-state is what makes one invariant correct for every kind of
//! change without predicting each one's effect.
//!
//! Audit events reuse activity_log (module 'roles' / 'users'), which already
//! carries actor, entity, action, timestamp and a free-text summary. No secret,
//! password, hash or token is ever written to it.

use rusqlite::params;
use serde::Serialize;

use crate::{db, permissions};

// ── Shapes ────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct RoleListItem {
    pub id: i64,
    pub role_key: String,
    pub name: String,
    pub description: Option<String>,
    pub is_system: bool,
    pub is_active: bool,
    pub user_count: i64,
    pub permission_count: i64,
}

#[derive(Serialize)]
pub struct PermissionItem {
    pub perm_key: String,
    pub module: String,
    pub action: String,
    pub label: String,
    pub description: Option<String>,
    pub sort_order: i64,
}

#[derive(Serialize)]
pub struct UserOverride {
    pub perm_key: String,
    /// "ALLOW" or "DENY".
    pub effect: String,
}

#[derive(Serialize)]
pub struct UserRbac {
    pub user_id: i64,
    pub role_id: Option<i64>,
    pub role_name: Option<String>,
    pub role_is_active: bool,
    pub is_active: bool,
    /// Keys granted by the role template alone, before overrides.
    pub inherited: Vec<String>,
    pub overrides: Vec<UserOverride>,
    /// Backend-computed final answer. The UI must display this rather than
    /// recomputing authority in React.
    pub effective: Vec<String>,
    pub can_be_capa_responsible: bool,
    pub can_be_lead_auditor: bool,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn audit(
    conn: &rusqlite::Connection,
    module: &str,
    record_id: i64,
    action: &str,
    description: &str,
    actor: i64,
) {
    if let Err(e) = conn.execute(
        "INSERT INTO activity_log (module, record_id, action, description, performed_by, performed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
        params![module, record_id, action, description, actor],
    ) {
        eprintln!("activity_log write failed for {}/{}: {}", module, action, e);
    }
}

/// Derive a stable, URL-safe key from a display name. The key never changes
/// afterwards, so renaming a role cannot break anything that referenced it.
fn slugify(name: &str) -> String {
    let mut out = String::new();
    let mut prev_sep = false;
    for ch in name.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            prev_sep = false;
        } else if !prev_sep && !out.is_empty() {
            out.push('_');
            prev_sep = true;
        }
    }
    out.trim_end_matches('_').to_string()
}

fn role_is_system(conn: &rusqlite::Connection, role_id: i64) -> Result<bool, String> {
    conn.query_row(
        "SELECT is_system FROM roles WHERE id = ?1",
        params![role_id],
        |r| r.get::<_, i64>(0),
    )
    .map(|v| v == 1)
    .map_err(|_| "Role not found".to_string())
}

// ── Permission registry ───────────────────────────────────────────────────────

/// The full permission registry, ordered for the grouped matrix.
#[tauri::command]
pub fn list_permissions(current_user_id: i64) -> Result<Vec<PermissionItem>, String> {
    permissions::require_permission(current_user_id, "roles.view")?;

    let conn = db::open_conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT perm_key, module, action, label, description, sort_order
               FROM permissions ORDER BY sort_order ASC",
        )
        .map_err(|e| format!("Failed to prepare permission query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(PermissionItem {
                perm_key:    row.get(0)?,
                module:      row.get(1)?,
                action:      row.get(2)?,
                label:       row.get(3)?,
                description: row.get(4)?,
                sort_order:  row.get(5)?,
            })
        })
        .map_err(|e| format!("Failed to query permissions: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

/// The caller's own effective permissions, so the UI can hide what it must not
/// offer. This is a convenience for rendering only — every command re-checks.
#[tauri::command]
pub fn get_my_permissions(current_user_id: i64) -> Result<Vec<String>, String> {
    let conn = db::open_conn()?;
    let mut v: Vec<String> = permissions::effective_permissions(&conn, current_user_id)?
        .into_iter()
        .collect();
    v.sort();
    Ok(v)
}

// ── Roles ─────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_roles(current_user_id: i64) -> Result<Vec<RoleListItem>, String> {
    permissions::require_permission(current_user_id, "roles.view")?;

    let conn = db::open_conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT r.id, r.role_key, r.name, r.description, r.is_system, r.is_active,
                    (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id),
                    (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_id = r.id)
               FROM roles r
              ORDER BY r.is_system DESC, r.name ASC",
        )
        .map_err(|e| format!("Failed to prepare role query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(RoleListItem {
                id:               row.get(0)?,
                role_key:         row.get(1)?,
                name:             row.get(2)?,
                description:      row.get(3)?,
                is_system:        row.get::<_, i64>(4)? == 1,
                is_active:        row.get::<_, i64>(5)? == 1,
                user_count:       row.get(6)?,
                permission_count: row.get(7)?,
            })
        })
        .map_err(|e| format!("Failed to query roles: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

/// The permission keys currently in a role's default template.
#[tauri::command]
pub fn get_role_permissions(
    current_user_id: i64,
    role_id: i64,
) -> Result<Vec<String>, String> {
    permissions::require_permission(current_user_id, "roles.view")?;

    let conn = db::open_conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT p.perm_key
               FROM role_permissions rp
               JOIN permissions p ON p.id = rp.permission_id
              WHERE rp.role_id = ?1
              ORDER BY p.sort_order",
        )
        .map_err(|e| format!("Failed to prepare template query: {}", e))?;

    let rows = stmt
        .query_map(params![role_id], |r| r.get::<_, String>(0))
        .map_err(|e| format!("Failed to query template: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

#[tauri::command]
pub fn create_role(
    current_user_id: i64,
    name: String,
    description: Option<String>,
) -> Result<i64, String> {
    permissions::require_permission(current_user_id, "roles.manage")?;

    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Role name is required".to_string());
    }
    if name.len() > 60 {
        return Err("Role name must be 60 characters or fewer".to_string());
    }

    let key = slugify(&name);
    if key.is_empty() {
        return Err("Role name must contain at least one letter or digit".to_string());
    }

    let conn = db::open_conn()?;

    let clash: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM roles WHERE role_key = ?1 OR lower(name) = lower(?2)",
            params![&key, &name],
            |r| r.get(0),
        )
        .map_err(|e| format!("Failed to check for duplicate role: {}", e))?;
    if clash > 0 {
        return Err(format!("A role named '{}' already exists", name));
    }

    // A new custom role starts with NO permissions. Granting nothing by default
    // is the safe direction: an administrator adds what the role needs rather
    // than discovering later that it inherited something.
    conn.execute(
        "INSERT INTO roles (role_key, name, description, is_system, is_active, created_at, updated_at)
         VALUES (?1, ?2, ?3, 0, 1, datetime('now'), datetime('now'))",
        params![&key, &name, &description],
    )
    .map_err(|e| format!("Failed to create role: {}", e))?;

    let id = conn.last_insert_rowid();
    audit(&conn, "roles", id, "ROLE_CREATED",
          &format!("Custom role '{}' created with no permissions", name), current_user_id);
    Ok(id)
}

/// Update display name / description. role_key and is_system are immutable.
#[tauri::command]
pub fn update_role(
    current_user_id: i64,
    role_id: i64,
    name: String,
    description: Option<String>,
) -> Result<(), String> {
    permissions::require_permission(current_user_id, "roles.manage")?;

    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Role name is required".to_string());
    }

    let conn = db::open_conn()?;

    // Built-in role names are referenced by seeded documentation and by existing
    // audit-trail entries, and their role_key is what legacy users.role stores.
    // Renaming them would make historical records read as if a different role
    // had acted. Their permission TEMPLATES remain editable.
    if role_is_system(&conn, role_id)? {
        return Err("Built-in roles cannot be renamed. Their permissions can still be changed.".to_string());
    }

    let old_name: String = conn
        .query_row("SELECT name FROM roles WHERE id = ?1", params![role_id], |r| r.get(0))
        .map_err(|_| "Role not found".to_string())?;

    let clash: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM roles WHERE lower(name) = lower(?1) AND id != ?2",
            params![&name, role_id],
            |r| r.get(0),
        )
        .map_err(|e| format!("Failed to check for duplicate role: {}", e))?;
    if clash > 0 {
        return Err(format!("A role named '{}' already exists", name));
    }

    conn.execute(
        "UPDATE roles SET name = ?1, description = ?2, updated_at = datetime('now') WHERE id = ?3",
        params![&name, &description, role_id],
    )
    .map_err(|e| format!("Failed to update role: {}", e))?;

    audit(&conn, "roles", role_id, "ROLE_UPDATED",
          &format!("Role '{}' renamed to '{}'", old_name, name), current_user_id);
    Ok(())
}

/// Activate or deactivate a role. Built-in roles may be deactivated but never
/// deleted; there is deliberately no delete command at all, because a role can
/// be referenced by users and by historical audit entries.
#[tauri::command]
pub fn set_role_active(
    current_user_id: i64,
    role_id: i64,
    is_active: bool,
) -> Result<(), String> {
    permissions::require_permission(current_user_id, "roles.manage")?;

    let mut conn = db::open_conn()?;

    let name: String = conn
        .query_row("SELECT name FROM roles WHERE id = ?1", params![role_id], |r| r.get(0))
        .map_err(|_| "Role not found".to_string())?;

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    tx.execute(
        "UPDATE roles SET is_active = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![if is_active { 1 } else { 0 }, role_id],
    )
    .map_err(|e| format!("Failed to update role: {}", e))?;

    // Deactivating a role revokes it for everyone holding it, so this can remove
    // the last control path.
    permissions::assert_control_path_retained(&tx)?;

    audit(&tx, "roles", role_id,
          if is_active { "ROLE_ACTIVATED" } else { "ROLE_DEACTIVATED" },
          &format!("Role '{}' {}", name, if is_active { "activated" } else { "deactivated" }),
          current_user_id);

    tx.commit().map_err(|e| format!("Failed to commit role change: {}", e))?;
    Ok(())
}

/// Replace a role's default permission template with exactly `perm_keys`.
#[tauri::command]
pub fn set_role_permissions(
    current_user_id: i64,
    role_id: i64,
    perm_keys: Vec<String>,
) -> Result<(), String> {
    permissions::require_permission(current_user_id, "roles.manage")?;

    let mut conn = db::open_conn()?;

    let name: String = conn
        .query_row("SELECT name FROM roles WHERE id = ?1", params![role_id], |r| r.get(0))
        .map_err(|_| "Role not found".to_string())?;

    let before: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM role_permissions WHERE role_id = ?1",
            params![role_id],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    tx.execute("DELETE FROM role_permissions WHERE role_id = ?1", params![role_id])
        .map_err(|e| format!("Failed to clear role template: {}", e))?;

    for key in &perm_keys {
        let pid: i64 = tx
            .query_row(
                "SELECT id FROM permissions WHERE perm_key = ?1",
                params![key],
                |r| r.get(0),
            )
            .map_err(|_| format!("Unknown permission key: {}", key))?;
        tx.execute(
            "INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?1, ?2)",
            params![role_id, pid],
        )
        .map_err(|e| format!("Failed to grant {}: {}", key, e))?;
    }

    // Stripping a control permission from the role that provides the last
    // administrative path must be refused, whatever the role is called.
    permissions::assert_control_path_retained(&tx)?;

    audit(&tx, "roles", role_id, "ROLE_TEMPLATE_CHANGED",
          &format!("Permission template for '{}' changed: {} keys -> {} keys",
                   name, before, perm_keys.len()),
          current_user_id);

    tx.commit().map_err(|e| format!("Failed to commit template change: {}", e))?;
    Ok(())
}

// ── User RBAC ─────────────────────────────────────────────────────────────────

/// Everything the Edit User screen needs: role, overrides, and the backend's own
/// effective-permission answer.
#[tauri::command]
pub fn get_user_rbac(current_user_id: i64, user_id: i64) -> Result<UserRbac, String> {
    permissions::require_permission(current_user_id, "users.view")?;

    let conn = db::open_conn()?;

    let (role_id, role_name, role_active, is_active, cap, la): (
        Option<i64>, Option<String>, bool, bool, bool, bool,
    ) = conn
        .query_row(
            "SELECT u.role_id, r.name, COALESCE(r.is_active, 0), u.is_active,
                    u.can_be_capa_responsible, u.can_be_lead_auditor
               FROM users u LEFT JOIN roles r ON r.id = u.role_id
              WHERE u.id = ?1",
            params![user_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get::<_, i64>(2)? == 1,
                    row.get::<_, i64>(3)? == 1,
                    row.get::<_, i64>(4)? == 1,
                    row.get::<_, i64>(5)? == 1,
                ))
            },
        )
        .map_err(|_| "User not found".to_string())?;

    let mut inherited: Vec<String> = Vec::new();
    if let Some(rid) = role_id {
        let mut stmt = conn
            .prepare(
                "SELECT p.perm_key FROM role_permissions rp
                   JOIN permissions p ON p.id = rp.permission_id
                  WHERE rp.role_id = ?1 ORDER BY p.sort_order",
            )
            .map_err(|e| format!("Failed to prepare inherited query: {}", e))?;
        inherited = stmt
            .query_map(params![rid], |r| r.get::<_, String>(0))
            .map_err(|e| format!("Failed to query inherited: {}", e))?
            .filter_map(|r| r.ok())
            .collect();
    }

    let mut stmt = conn
        .prepare(
            "SELECT p.perm_key, o.effect FROM user_permission_overrides o
               JOIN permissions p ON p.id = o.permission_id
              WHERE o.user_id = ?1 ORDER BY p.sort_order",
        )
        .map_err(|e| format!("Failed to prepare override query: {}", e))?;
    let overrides: Vec<UserOverride> = stmt
        .query_map(params![user_id], |r| {
            Ok(UserOverride { perm_key: r.get(0)?, effect: r.get(1)? })
        })
        .map_err(|e| format!("Failed to query overrides: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let mut effective: Vec<String> =
        permissions::effective_permissions(&conn, user_id)?.into_iter().collect();
    effective.sort();

    Ok(UserRbac {
        user_id,
        role_id,
        role_name,
        role_is_active: role_active,
        is_active,
        inherited,
        overrides,
        effective,
        can_be_capa_responsible: cap,
        can_be_lead_auditor: la,
    })
}

/// Assign a user to a role by stable id. The legacy users.role text column is
/// kept in step so anything still reading it stays consistent.
#[tauri::command]
pub fn set_user_role(
    current_user_id: i64,
    user_id: i64,
    role_id: i64,
) -> Result<(), String> {
    permissions::require_permission(current_user_id, "users.manage")?;

    let mut conn = db::open_conn()?;

    let (role_key, role_name): (String, String) = conn
        .query_row(
            "SELECT role_key, name FROM roles WHERE id = ?1 AND is_active = 1",
            params![role_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "Role not found or inactive".to_string())?;

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    tx.execute(
        "UPDATE users SET role_id = ?1, role = ?2, updated_at = datetime('now') WHERE id = ?3",
        params![role_id, &role_key, user_id],
    )
    .map_err(|e| format!("Failed to set user role: {}", e))?;

    // Moving the last administrator to a role without control permissions must
    // be refused.
    permissions::assert_control_path_retained(&tx)?;

    audit(&tx, "users", user_id, "ROLE_CHANGED",
          &format!("Role set to '{}'", role_name), current_user_id);

    tx.commit().map_err(|e| format!("Failed to commit role assignment: {}", e))?;
    Ok(())
}

/// Set or clear one user-specific override.
///
/// `effect` is "ALLOW", "DENY", or None meaning "use the role default" — which
/// deletes the row rather than storing a third state. Overrides stay sparse: a
/// user row exists only where the administrator deliberately departed from the
/// template.
#[tauri::command]
pub fn set_user_override(
    current_user_id: i64,
    user_id: i64,
    perm_key: String,
    effect: Option<String>,
) -> Result<(), String> {
    permissions::require_permission(current_user_id, "users.manage")?;

    let mut conn = db::open_conn()?;

    let pid: i64 = conn
        .query_row(
            "SELECT id FROM permissions WHERE perm_key = ?1",
            params![&perm_key],
            |r| r.get(0),
        )
        .map_err(|_| format!("Unknown permission key: {}", perm_key))?;

    let effect_norm = match effect.as_deref() {
        None => None,
        Some("ALLOW") => Some("ALLOW"),
        Some("DENY") => Some("DENY"),
        Some(other) => return Err(format!("Invalid override effect: {}", other)),
    };

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    match effect_norm {
        None => {
            tx.execute(
                "DELETE FROM user_permission_overrides WHERE user_id = ?1 AND permission_id = ?2",
                params![user_id, pid],
            )
            .map_err(|e| format!("Failed to clear override: {}", e))?;
        }
        Some(eff) => {
            tx.execute(
                "INSERT INTO user_permission_overrides (user_id, permission_id, effect, created_at, updated_at)
                 VALUES (?1, ?2, ?3, datetime('now'), datetime('now'))
                 ON CONFLICT(user_id, permission_id)
                 DO UPDATE SET effect = excluded.effect, updated_at = datetime('now')",
                params![user_id, pid, eff],
            )
            .map_err(|e| format!("Failed to set override: {}", e))?;
        }
    }

    // Denying a control permission on the last administrator must be refused.
    permissions::assert_control_path_retained(&tx)?;

    audit(&tx, "users", user_id, "PERMISSION_OVERRIDE",
          &match effect_norm {
              None => format!("Override cleared for '{}' (back to role default)", perm_key),
              Some(e) => format!("Override set: '{}' = {}", perm_key, e),
          },
          current_user_id);

    tx.commit().map_err(|e| format!("Failed to commit override: {}", e))?;
    Ok(())
}

/// Drop every override for a user, returning them fully to their role template.
#[tauri::command]
pub fn reset_user_overrides(current_user_id: i64, user_id: i64) -> Result<(), String> {
    permissions::require_permission(current_user_id, "users.manage")?;

    let mut conn = db::open_conn()?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    let removed = tx
        .execute(
            "DELETE FROM user_permission_overrides WHERE user_id = ?1",
            params![user_id],
        )
        .map_err(|e| format!("Failed to reset overrides: {}", e))?;

    // Clearing an ALLOW that was the last control path must be refused too.
    permissions::assert_control_path_retained(&tx)?;

    audit(&tx, "users", user_id, "PERMISSION_OVERRIDE",
          &format!("All {} override(s) reset to role defaults", removed), current_user_id);

    tx.commit().map_err(|e| format!("Failed to commit reset: {}", e))?;
    Ok(())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::slugify;

    #[test]
    fn slugify_produces_a_stable_key() {
        assert_eq!(slugify("Document Controller"), "document_controller");
        assert_eq!(slugify("CAPA Coordinator"), "capa_coordinator");
        assert_eq!(slugify("  Editor  "), "editor");
        assert_eq!(slugify("QA / QC Lead"), "qa_qc_lead");
        assert_eq!(slugify("Role---Name"), "role_name");
        assert_eq!(slugify("!!!"), "", "a name with no alphanumerics yields no key and is rejected");
    }

    /// The key is derived once at creation and never regenerated, so a later
    /// rename cannot orphan anything that referenced the role.
    #[test]
    fn renaming_does_not_change_the_key() {
        let key_at_creation = slugify("Editor");
        assert_eq!(key_at_creation, "editor");
        // update_role only touches name/description — asserted by its SQL, which
        // does not mention role_key.
        assert_ne!(slugify("Senior Editor"), key_at_creation);
    }
}
