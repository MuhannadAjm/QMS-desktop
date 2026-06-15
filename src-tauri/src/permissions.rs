use rusqlite::params;
use crate::db;

// Verify the calling user is an Admin and is active.
pub fn require_admin(current_user_id: i64) -> Result<(), String> {
    require_role(current_user_id, &["Admin"])
}

// Verify the calling user is Admin or QualityManager and is active.
pub fn require_admin_or_quality_manager(current_user_id: i64) -> Result<(), String> {
    require_role(current_user_id, &["Admin", "QualityManager"])
}

// Verify the calling user is Admin, QualityManager, or Auditor and is active.
// Used for audit findings and creating NCs from findings.
pub fn require_admin_qm_or_auditor(current_user_id: i64) -> Result<(), String> {
    require_role(current_user_id, &["Admin", "QualityManager", "Auditor"])
}

// Verify the calling user exists and is active (any role allowed — for read-only commands).
pub fn require_authenticated(current_user_id: i64) -> Result<(), String> {
    require_role(
        current_user_id,
        &["Admin", "QualityManager", "Auditor", "Employee", "Viewer"],
    )
}

fn require_role(user_id: i64, allowed_roles: &[&str]) -> Result<(), String> {
    let conn = db::open_conn()?;

    let result = conn.query_row(
        "SELECT role, is_active FROM users WHERE id = ?1",
        params![user_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
    );

    match result {
        Err(_) => Err("Unauthorized: caller user not found".to_string()),
        Ok((_, 0)) => Err("Unauthorized: caller account is inactive".to_string()),
        Ok((role, _)) => {
            if allowed_roles.contains(&role.as_str()) {
                Ok(())
            } else {
                Err(format!(
                    "Unauthorized: {} role required",
                    allowed_roles.join(" or ")
                ))
            }
        }
    }
}
