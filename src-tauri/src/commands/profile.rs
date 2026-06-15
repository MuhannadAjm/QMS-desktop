use rusqlite::params;
use crate::{db, password};
use super::auth::AuthUser;

/// Update the current user's own profile (name, department, email).
/// Username is immutable and cannot be changed here.
#[tauri::command]
pub fn update_own_profile(
    current_user_id: i64,
    name: String,
    department: String,
    email: Option<String>,
) -> Result<AuthUser, String> {
    let name = name.trim().to_string();
    let department = department.trim().to_string();
    let email = email
        .map(|e| e.trim().to_lowercase())
        .filter(|e| !e.is_empty())
        .unwrap_or_default();

    if name.is_empty() {
        return Err("Full name is required".to_string());
    }

    let conn = db::open_conn()?;

    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE id = ?1 AND is_active = 1",
            params![current_user_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Query failed: {}", e))?;
    if exists == 0 {
        return Err("User not found or account is inactive".to_string());
    }

    conn.execute(
        "UPDATE users SET full_name = ?1, department = ?2, email = ?3, updated_at = datetime('now') WHERE id = ?4",
        params![&name, &department, &email, current_user_id],
    )
    .map_err(|e| format!("Failed to update profile: {}", e))?;

    let result = conn.query_row(
        "SELECT id, username, full_name, email, role, is_active, department FROM users WHERE id = ?1",
        params![current_user_id],
        |row| {
            Ok(AuthUser {
                id:         row.get(0)?,
                username:   row.get(1)?,
                name:       row.get(2)?,
                email:      row.get(3)?,
                role:       row.get(4)?,
                is_active:  row.get::<_, i64>(5)? != 0,
                department: row.get(6)?,
            })
        },
    )
    .map_err(|e| format!("Failed to read updated profile: {}", e))?;

    Ok(result)
}

/// Change the current user's own password.
/// Requires the correct current password before accepting the new one.
#[tauri::command]
pub fn change_own_password(
    current_user_id: i64,
    current_password: String,
    new_password: String,
    confirm_new_password: String,
) -> Result<(), String> {
    if new_password != confirm_new_password {
        return Err("New passwords do not match".to_string());
    }
    password::validate_password_strength(&new_password)?;

    let conn = db::open_conn()?;

    let current_hash: String = conn
        .query_row(
            "SELECT password_hash FROM users WHERE id = ?1 AND is_active = 1",
            params![current_user_id],
            |row| row.get(0),
        )
        .map_err(|_| "User not found or account is inactive".to_string())?;

    if !password::verify_password(&current_password, &current_hash)? {
        return Err("Current password is incorrect".to_string());
    }

    let new_hash = password::hash_password(&new_password)?;

    conn.execute(
        "UPDATE users SET password_hash = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![&new_hash, current_user_id],
    )
    .map_err(|e| format!("Failed to change password: {}", e))?;

    Ok(())
}
