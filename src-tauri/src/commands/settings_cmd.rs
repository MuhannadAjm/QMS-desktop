use rusqlite::params;
use serde::Serialize;
use crate::{db, permissions};

#[derive(Serialize)]
pub struct SettingEntry {
    pub key: String,
    pub value: String,
}

/// Return all settings as key-value pairs. Read-only — no role restriction.
#[tauri::command]
pub fn get_settings() -> Result<Vec<SettingEntry>, String> {
    let conn = db::open_conn()?;

    let mut stmt = conn
        .prepare("SELECT key, COALESCE(value, '') FROM settings ORDER BY key ASC")
        .map_err(|e| format!("Failed to prepare settings query: {}", e))?;

    let entries = stmt
        .query_map([], |row| {
            Ok(SettingEntry {
                key:   row.get(0)?,
                value: row.get(1)?,
            })
        })
        .map_err(|e| format!("Failed to query settings: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(entries)
}

/// Update a single setting by key. Requires Admin or QualityManager role.
#[tauri::command]
pub fn update_setting(current_user_id: i64, key: String, value: String) -> Result<(), String> {
    permissions::require_permission(current_user_id, "settings.manage")?;

    let key = key.trim().to_string();
    if key.is_empty() {
        return Err("Setting key is required".to_string());
    }

    let conn = db::open_conn()?;

    conn.execute(
        "UPDATE settings SET value = ?1, updated_at = datetime('now') WHERE key = ?2",
        params![&value, &key],
    )
    .map_err(|e| format!("Failed to update setting '{}': {}", key, e))?;

    Ok(())
}
