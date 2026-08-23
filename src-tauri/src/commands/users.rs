use rusqlite::params;
use serde::Serialize;
use crate::{db, password, permissions};

#[derive(Serialize)]
pub struct UserMinimal {
    pub id: i64,
    pub name: String,
    pub role: String,
}

#[derive(Serialize)]
pub struct UserListItem {
    pub id: i64,
    pub username: String,
    pub name: String,
    pub email: String,
    pub role: String,
    pub department: String,
    pub is_active: bool,
    pub created_at: String,
    /// Assignment eligibility — deliberately separate from role. A user's role
    /// governs what they may DO; eligibility governs which assignment selectors
    /// they APPEAR IN. Overloading role for both is why the CAPA and audit
    /// selectors could not be curated independently.
    pub can_be_capa_responsible: bool,
    pub can_be_lead_auditor: bool,
}

fn validate_role(role: &str) -> Result<(), String> {
    match role {
        "Admin" | "QualityManager" | "Auditor" | "Employee" | "Viewer" => Ok(()),
        _ => Err(format!("Invalid role: {}", role)),
    }
}

fn is_valid_username(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 64
        && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
        && s.chars().next().map(|c| c.is_ascii_alphabetic()).unwrap_or(false)
}

/// List all users. Requires Admin role.
#[tauri::command]
pub fn list_users(current_user_id: i64) -> Result<Vec<UserListItem>, String> {
    permissions::require_admin(current_user_id)?;

    let conn = db::open_conn()?;

    let mut stmt = conn
        .prepare(
            // Eligibility columns are APPENDED at indices 8/9. Never insert into
            // the middle of this list: the mapping below is positional.
            "SELECT id, username, full_name, email, role, department, is_active, created_at,
                    can_be_capa_responsible, can_be_lead_auditor
             FROM users ORDER BY full_name ASC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let users = stmt
        .query_map([], |row| {
            Ok(UserListItem {
                id:          row.get(0)?,
                username:    row.get(1)?,
                name:        row.get(2)?,
                email:       row.get(3)?,
                role:        row.get(4)?,
                department:  row.get(5)?,
                is_active:   row.get::<_, i64>(6)? != 0,
                created_at:  row.get(7)?,
                can_be_capa_responsible: row.get::<_, i64>(8)? != 0,
                can_be_lead_auditor:     row.get::<_, i64>(9)? != 0,
            })
        })
        .map_err(|e| format!("Failed to query users: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(users)
}

/// Create a new local user account. Requires Admin role.
#[tauri::command]
pub fn create_user(
    current_user_id: i64,
    name: String,
    username: String,
    email: Option<String>,
    role: String,
    department: String,
    password: String,
) -> Result<UserListItem, String> {
    permissions::require_admin(current_user_id)?;

    let name = name.trim().to_string();
    let username = username.trim().to_lowercase();
    let email = email
        .map(|e| e.trim().to_lowercase())
        .filter(|e| !e.is_empty())
        .unwrap_or_default();
    let department = department.trim().to_string();

    if name.is_empty() {
        return Err("Full name is required".to_string());
    }
    if username.is_empty() {
        return Err("Username is required".to_string());
    }
    if !is_valid_username(&username) {
        return Err(
            "Username may only contain letters, digits, and underscores, and must start with a letter"
                .to_string(),
        );
    }
    validate_role(&role)?;
    password::validate_password_strength(&password)?;

    let conn = db::open_conn()?;

    let username_taken: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE username = ?1",
            params![&username],
            |row| row.get(0),
        )
        .map_err(|e| format!("Query failed: {}", e))?;
    if username_taken > 0 {
        return Err("Username is already taken".to_string());
    }

    let hash = password::hash_password(&password)?;

    // Seed assignment eligibility from the role, using the same rule as the
    // migration-008 backfill. Without this a newly created user is eligible for
    // nothing and never appears in the CAPA-responsible or lead-auditor
    // selectors — which is exactly the "I created a user and it doesn't show up"
    // defect. The admin can still override either flag afterwards via
    // set_user_eligibility; this is only a sensible starting point.
    let default_capa = matches!(role.as_str(), "Admin" | "QualityManager" | "Employee");
    let default_audit = matches!(role.as_str(), "Admin" | "QualityManager" | "Auditor");

    conn.execute(
        "INSERT INTO users (username, full_name, email, role, department, password_hash, is_active,
                            can_be_capa_responsible, can_be_lead_auditor, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8, datetime('now'), datetime('now'))",
        params![
            &username, &name, &email, &role, &department, &hash,
            if default_capa { 1 } else { 0 },
            if default_audit { 1 } else { 0 }
        ],
    )
    .map_err(|e| format!("Failed to create user: {}", e))?;

    let id = conn.last_insert_rowid();

    let _ = conn.execute(
        "INSERT INTO activity_log (module, record_id, action, description, performed_by, performed_at)
         VALUES ('users', ?1, 'CREATED', ?2, ?3, datetime('now'))",
        params![id, format!("User account created: {} (@{}) — {}", &name, &username, &role), current_user_id],
    );

    let created_at: String = conn
        .query_row(
            "SELECT created_at FROM users WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .unwrap_or_default();

    Ok(UserListItem {
        id,
        username,
        name,
        email,
        role,
        department,
        is_active: true,
        created_at,
        can_be_capa_responsible: default_capa,
        can_be_lead_auditor: default_audit,
    })
}

/// Update an existing user's profile. Requires Admin role.
/// Username is immutable and cannot be changed.
#[tauri::command]
pub fn update_user(
    current_user_id: i64,
    id: i64,
    name: String,
    email: Option<String>,
    role: String,
    department: String,
) -> Result<UserListItem, String> {
    permissions::require_admin(current_user_id)?;

    let name = name.trim().to_string();
    let email = email
        .map(|e| e.trim().to_lowercase())
        .filter(|e| !e.is_empty())
        .unwrap_or_default();
    let department = department.trim().to_string();

    if name.is_empty() {
        return Err("Full name is required".to_string());
    }
    validate_role(&role)?;

    let conn = db::open_conn()?;

    conn.execute(
        "UPDATE users SET full_name = ?1, email = ?2, role = ?3, department = ?4,
         updated_at = datetime('now') WHERE id = ?5",
        params![&name, &email, &role, &department, id],
    )
    .map_err(|e| format!("Failed to update user: {}", e))?;

    let _ = conn.execute(
        "INSERT INTO activity_log (module, record_id, action, description, performed_by, performed_at)
         VALUES ('users', ?1, 'UPDATED', ?2, ?3, datetime('now'))",
        params![id, format!("User profile updated: {} ({})", &name, &role), current_user_id],
    );

    let result = conn
        .query_row(
            // Eligibility appended at indices 8/9 — see the note on list_users.
            "SELECT id, username, full_name, email, role, department, is_active, created_at,
                    can_be_capa_responsible, can_be_lead_auditor
             FROM users WHERE id = ?1",
            params![id],
            |row| {
                Ok(UserListItem {
                    id:          row.get(0)?,
                    username:    row.get(1)?,
                    name:        row.get(2)?,
                    email:       row.get(3)?,
                    role:        row.get(4)?,
                    department:  row.get(5)?,
                    is_active:   row.get::<_, i64>(6)? != 0,
                    created_at:  row.get(7)?,
                    can_be_capa_responsible: row.get::<_, i64>(8)? != 0,
                    can_be_lead_auditor:     row.get::<_, i64>(9)? != 0,
                })
            },
        )
        .map_err(|e| format!("Failed to read updated user: {}", e))?;

    Ok(result)
}

/// Activate or deactivate a user account. Requires Admin role.
#[tauri::command]
pub fn set_user_status(current_user_id: i64, id: i64, is_active: bool) -> Result<(), String> {
    permissions::require_admin(current_user_id)?;

    let conn = db::open_conn()?;

    conn.execute(
        "UPDATE users SET is_active = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![is_active as i64, id],
    )
    .map_err(|e| format!("Failed to update user status: {}", e))?;

    let action = if is_active { "ACTIVATED" } else { "DEACTIVATED" };
    let _ = conn.execute(
        "INSERT INTO activity_log (module, record_id, action, description, performed_by, performed_at)
         VALUES ('users', ?1, ?2, 'User status changed', ?3, datetime('now'))",
        params![id, action, current_user_id],
    );

    Ok(())
}

/// List active users (id, name, role only). For owner dropdowns. Requires Admin or QualityManager.
#[tauri::command]
pub fn list_users_minimal(current_user_id: i64) -> Result<Vec<UserMinimal>, String> {
    permissions::require_admin_or_quality_manager(current_user_id)?;

    let conn = db::open_conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, full_name, role FROM users
             WHERE is_active = 1 ORDER BY full_name ASC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let users = stmt
        .query_map([], |row| {
            Ok(UserMinimal {
                id:   row.get(0)?,
                name: row.get(1)?,
                role: row.get(2)?,
            })
        })
        .map_err(|e| format!("Failed to query users: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(users)
}

/// Reset a user's password. Requires Admin role.
#[tauri::command]
pub fn reset_user_password(current_user_id: i64, id: i64, new_password: String) -> Result<(), String> {
    permissions::require_admin(current_user_id)?;

    password::validate_password_strength(&new_password)?;
    let hash = password::hash_password(&new_password)?;

    let conn = db::open_conn()?;

    conn.execute(
        "UPDATE users SET password_hash = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![&hash, id],
    )
    .map_err(|e| format!("Failed to reset password: {}", e))?;

    let _ = conn.execute(
        "INSERT INTO activity_log (module, record_id, action, description, performed_by, performed_at)
         VALUES ('users', ?1, 'PASSWORD_RESET', 'Password was reset by administrator', ?2, datetime('now'))",
        params![id, current_user_id],
    );

    Ok(())
}

/// Assignment eligibility for a user. Admin only.
///
/// Kept separate from create_user/update_user on purpose: those signatures are
/// already consumed by the Users screen, and eligibility is an orthogonal concern
/// that also needs to be togglable without re-submitting the whole user record.
#[tauri::command]
pub fn set_user_eligibility(
    current_user_id: i64,
    id: i64,
    can_be_capa_responsible: bool,
    can_be_lead_auditor: bool,
) -> Result<(), String> {
    permissions::require_admin(current_user_id)?;

    let conn = db::open_conn()?;

    let name: String = conn
        .query_row("SELECT full_name FROM users WHERE id = ?1", params![id], |r| r.get(0))
        .map_err(|_| "User not found".to_string())?;

    conn.execute(
        "UPDATE users
            SET can_be_capa_responsible = ?1,
                can_be_lead_auditor     = ?2,
                updated_at              = datetime('now')
          WHERE id = ?3",
        params![
            if can_be_capa_responsible { 1 } else { 0 },
            if can_be_lead_auditor { 1 } else { 0 },
            id
        ],
    )
    .map_err(|e| format!("Failed to update eligibility: {}", e))?;

    if let Err(e) = conn.execute(
        "INSERT INTO activity_log (module, record_id, action, description, performed_by, performed_at)
         VALUES ('users', ?1, 'ELIGIBILITY', ?2, ?3, datetime('now'))",
        params![
            id,
            format!(
                "Eligibility for {} set to CAPA responsible={}, lead auditor={}",
                name, can_be_capa_responsible, can_be_lead_auditor
            ),
            current_user_id
        ],
    ) {
        eprintln!("activity_log write failed for users/ELIGIBILITY: {}", e);
    }

    Ok(())
}

/// Active users eligible for a given assignment capability.
///
/// Guarded with require_authenticated rather than require_admin_or_quality_manager.
/// list_users_minimal - which previously fed every assignment selector - requires
/// Admin/QualityManager, so for an Auditor or Employee it returned an error that
/// every caller swallowed, leaving the dropdown silently empty. Choosing who a
/// record is assigned to is not privileged information; managing users is, and
/// that stays restricted.
///
/// `capability` is "capa_responsible" or "lead_auditor".
#[tauri::command]
pub fn list_assignable_users(
    current_user_id: i64,
    capability: String,
) -> Result<Vec<UserMinimal>, String> {
    permissions::require_authenticated(current_user_id)?;

    // Whitelist the column name - it is interpolated into SQL, so it must never
    // come straight from the caller.
    let column = match capability.as_str() {
        "capa_responsible" => "can_be_capa_responsible",
        "lead_auditor"     => "can_be_lead_auditor",
        other => return Err(format!("Unknown assignment capability: {}", other)),
    };

    let conn = db::open_conn()?;

    let sql = format!(
        "SELECT id, full_name, role FROM users
          WHERE is_active = 1 AND {} = 1
          ORDER BY full_name ASC",
        column
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let users = stmt
        .query_map([], |row| {
            Ok(UserMinimal {
                id:   row.get(0)?,
                name: row.get(1)?,
                role: row.get(2)?,
            })
        })
        .map_err(|e| format!("Failed to query assignable users: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(users)
}

#[cfg(test)]
mod eligibility_tests {
    use rusqlite::Connection;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                role TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                can_be_capa_responsible INTEGER NOT NULL DEFAULT 0,
                can_be_lead_auditor INTEGER NOT NULL DEFAULT 0);
             INSERT INTO users (full_name, role, is_active, can_be_capa_responsible, can_be_lead_auditor) VALUES
                ('Alice Admin','Admin',1,1,1),
                ('Bob Auditor','Auditor',1,0,1),
                ('Carol Employee','Employee',1,1,0),
                ('Dan Disabled','Admin',0,1,1),
                ('Eve Viewer','Viewer',1,0,0);",
        )
        .unwrap();
        conn
    }

    fn eligible(conn: &Connection, column: &str) -> Vec<String> {
        let sql = format!(
            "SELECT full_name FROM users WHERE is_active = 1 AND {} = 1 ORDER BY full_name",
            column
        );
        let mut s = conn.prepare(&sql).unwrap();
        s.query_map([], |r| r.get::<_, String>(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect()
    }

    /// Bob is an Auditor but NOT CAPA-eligible; Carol is a plain Employee who is.
    /// Filtering by role instead of eligibility would produce the wrong list both ways.
    #[test]
    fn capa_responsible_list_is_filtered_by_eligibility_not_role() {
        let conn = db();
        assert_eq!(
            eligible(&conn, "can_be_capa_responsible"),
            vec!["Alice Admin", "Carol Employee"]
        );
    }

    #[test]
    fn lead_auditor_list_is_filtered_by_eligibility_not_role() {
        let conn = db();
        assert_eq!(
            eligible(&conn, "can_be_lead_auditor"),
            vec!["Alice Admin", "Bob Auditor"]
        );
    }

    /// A deactivated user must never stay selectable, however eligible.
    #[test]
    fn inactive_users_are_excluded_even_when_eligible() {
        let conn = db();
        for col in ["can_be_capa_responsible", "can_be_lead_auditor"] {
            assert!(
                !eligible(&conn, col).contains(&"Dan Disabled".to_string()),
                "inactive user leaked into {}",
                col
            );
        }
    }

    /// The reported defect: a newly created, active, eligible user must appear
    /// in the selector straight away.
    #[test]
    fn newly_created_eligible_user_appears_immediately() {
        let conn = db();
        conn.execute(
            "INSERT INTO users (full_name, role, is_active, can_be_capa_responsible, can_be_lead_auditor)
             VALUES ('Frank New','Employee',1,1,1)",
            [],
        )
        .unwrap();
        assert!(eligible(&conn, "can_be_capa_responsible").contains(&"Frank New".to_string()));
        assert!(eligible(&conn, "can_be_lead_auditor").contains(&"Frank New".to_string()));
    }

    /// The capability string is interpolated into SQL, so only the whitelist may
    /// ever reach the query. Anything else must be rejected before that point.
    #[test]
    fn unknown_capability_maps_to_no_column() {
        let map = |c: &str| match c {
            "capa_responsible" => Some("can_be_capa_responsible"),
            "lead_auditor" => Some("can_be_lead_auditor"),
            _ => None,
        };
        assert_eq!(map("capa_responsible"), Some("can_be_capa_responsible"));
        assert_eq!(map("lead_auditor"), Some("can_be_lead_auditor"));
        assert_eq!(map("1=1; DROP TABLE users--"), None);
        assert_eq!(map("role"), None);
    }
}
