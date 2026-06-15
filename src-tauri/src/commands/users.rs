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
            "SELECT id, username, full_name, email, role, department, is_active, created_at
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

    conn.execute(
        "INSERT INTO users (username, full_name, email, role, department, password_hash, is_active, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, datetime('now'), datetime('now'))",
        params![&username, &name, &email, &role, &department, &hash],
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
            "SELECT id, username, full_name, email, role, department, is_active, created_at FROM users WHERE id = ?1",
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
