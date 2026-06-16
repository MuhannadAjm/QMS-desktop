use serde::Serialize;
use std::path::{Path, PathBuf};
use crate::{permissions, storage};

// ── Structs ───────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct BackupEntry {
    pub name: String,
    pub full_path: String,
    pub size_bytes: u64,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct BackupStatus {
    pub backups_dir: String,
    pub database_path: String,
    pub database_size_bytes: u64,
    pub uploads_size_bytes: u64,
    pub available_backups: Vec<BackupEntry>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn dir_size(path: &Path) -> u64 {
    if !path.exists() { return 0; }
    let mut total = 0u64;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                total += dir_size(&p);
            } else if let Ok(meta) = std::fs::metadata(&p) {
                total += meta.len();
            }
        }
    }
    total
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dst)
        .map_err(|e| format!("Failed to create dir {:?}: {}", dst, e))?;
    for entry in std::fs::read_dir(src)
        .map_err(|e| format!("Failed to read dir {:?}: {}", src, e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("Failed to copy {:?}: {}", src_path, e))?;
        }
    }
    Ok(())
}

fn backup_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let (y, mo, d) = days_to_ymd((secs / 86400) as u32);
    let rem = secs % 86400;
    let h = rem / 3600;
    let m = (rem % 3600) / 60;
    let s = rem % 60;
    format!("{:04}{:02}{:02}_{:02}{:02}{:02}", y, mo, d, h, m, s)
}

fn days_to_ymd(mut days: u32) -> (u32, u32, u32) {
    let mut year = 1970u32;
    loop {
        let yd = if is_leap(year) { 366 } else { 365 };
        if days < yd { break; }
        days -= yd;
        year += 1;
    }
    let md = [31u32, if is_leap(year) { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut month = 0u32;
    for &m in &md {
        if days < m { break; }
        days -= m;
        month += 1;
    }
    (year, month + 1, days + 1)
}

fn is_leap(y: u32) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

fn format_backup_time(ts_secs: u64) -> String {
    let (y, mo, d) = days_to_ymd((ts_secs / 86400) as u32);
    let rem = ts_secs % 86400;
    let h = rem / 3600;
    let m = (rem % 3600) / 60;
    format!("{:04}-{:02}-{:02} {:02}:{:02} UTC", y, mo, d, h, m)
}

fn list_backups(backups_dir: &Path) -> Vec<BackupEntry> {
    let mut entries = Vec::new();
    if let Ok(dir) = std::fs::read_dir(backups_dir) {
        for entry in dir.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !name.starts_with("QMS-Backup-") { continue; }
                let size = dir_size(&path);
                let created_at = std::fs::metadata(&path)
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| {
                        t.duration_since(std::time::UNIX_EPOCH).ok()
                            .map(|d| format_backup_time(d.as_secs()))
                    })
                    .unwrap_or_default();
                entries.push(BackupEntry {
                    name,
                    full_path: path.to_string_lossy().to_string(),
                    size_bytes: size,
                    created_at,
                });
            }
        }
    }
    entries.sort_by(|a, b| b.name.cmp(&a.name));
    entries
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Returns backup directory info, DB size, uploads size, and list of existing backups.
/// All authenticated users can view backup status (read-only). Create/restore is Admin only.
#[tauri::command]
pub fn get_backup_status(current_user_id: i64) -> Result<BackupStatus, String> {
    permissions::require_authenticated(current_user_id)?;
    let paths = storage::get_storage_paths()?;

    let db_size = std::fs::metadata(&paths.database)
        .map(|m| m.len())
        .unwrap_or(0);

    let uploads_root = paths.root.join("uploads");
    let uploads_size = dir_size(&uploads_root);
    let available_backups = list_backups(&paths.backups);

    Ok(BackupStatus {
        backups_dir:          paths.backups.to_string_lossy().to_string(),
        database_path:        paths.database.to_string_lossy().to_string(),
        database_size_bytes:  db_size,
        uploads_size_bytes:   uploads_size,
        available_backups,
    })
}

/// Create a local backup in the default backups directory (or a custom parent path if provided).
/// The backup is placed in a timestamped subfolder: QMS-Backup-YYYYMMDD_HHmmss.
/// Admin only.
#[tauri::command]
pub fn create_local_backup(
    current_user_id: i64,
    destination_path: Option<String>,
) -> Result<String, String> {
    permissions::require_admin(current_user_id)?;
    let paths = storage::get_storage_paths()?;

    let parent_dir: PathBuf = match destination_path {
        Some(ref p) if !p.is_empty() => {
            let pb = PathBuf::from(p);
            if !pb.exists() {
                return Err(format!(
                    "Destination path does not exist: {}",
                    pb.display()
                ));
            }
            if !pb.is_dir() {
                return Err(format!(
                    "Destination path is not a directory: {}",
                    pb.display()
                ));
            }
            pb
        }
        _ => paths.backups.clone(),
    };

    let folder_name = format!("QMS-Backup-{}", backup_timestamp());
    let backup_dir = parent_dir.join(&folder_name);

    std::fs::create_dir_all(&backup_dir)
        .map_err(|e| format!("Failed to create backup directory: {}", e))?;

    // Copy database
    if paths.database.exists() {
        std::fs::copy(&paths.database, backup_dir.join("data.db"))
            .map_err(|e| format!("Failed to copy database: {}", e))?;
    }

    // Copy settings.json
    if paths.settings.exists() {
        std::fs::copy(&paths.settings, backup_dir.join("settings.json"))
            .map_err(|e| format!("Failed to copy settings.json: {}", e))?;
    }

    // Copy license.json
    if paths.license.exists() {
        std::fs::copy(&paths.license, backup_dir.join("license.json"))
            .map_err(|e| format!("Failed to copy license.json: {}", e))?;
    }

    // Copy uploads directory recursively
    let uploads_src = paths.root.join("uploads");
    if uploads_src.exists() {
        copy_dir_recursive(&uploads_src, &backup_dir.join("uploads"))?;
    }

    Ok(backup_dir.to_string_lossy().to_string())
}

/// Open the default backups folder in Windows Explorer. Admin only.
#[tauri::command]
pub fn open_backups_folder(current_user_id: i64) -> Result<(), String> {
    permissions::require_admin(current_user_id)?;
    let paths = storage::get_storage_paths()?;

    std::fs::create_dir_all(&paths.backups)
        .map_err(|e| format!("Failed to ensure backups directory: {}", e))?;

    std::process::Command::new("explorer")
        .arg(paths.backups.to_string_lossy().as_ref())
        .spawn()
        .map_err(|e| format!("Failed to open backups folder: {}", e))?;

    Ok(())
}

/// Validate a user-provided backup path. Returns the resolved canonical path.
/// Admin only.
#[tauri::command]
pub fn validate_backup_path(
    current_user_id: i64,
    backup_path: String,
) -> Result<String, String> {
    permissions::require_admin(current_user_id)?;
    let path = PathBuf::from(&backup_path);

    if !path.exists() {
        return Err(format!("Path does not exist: {}", backup_path));
    }
    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", backup_path));
    }

    // Prevent backing up inside the AppData directory itself (risk of recursion)
    let paths = storage::get_storage_paths()?;
    let canonical_dest = std::fs::canonicalize(&path)
        .unwrap_or_else(|_| path.clone());
    let canonical_root = std::fs::canonicalize(&paths.root)
        .unwrap_or_else(|_| paths.root.clone());

    if canonical_dest.starts_with(&canonical_root) {
        return Err(
            "Backup destination cannot be inside the QMSDesktop data directory. \
             Choose a different location such as the Desktop or a USB drive."
                .to_string(),
        );
    }

    Ok(canonical_dest.to_string_lossy().to_string())
}

/// Restore a backup. Copies data.db, uploads, and settings from a backup folder back into AppData.
/// Before restoring, automatically creates a safety backup of current data.
/// If preserve_license is true (default), current license.json is NOT replaced.
/// Admin only.
#[tauri::command]
pub fn restore_local_backup(
    current_user_id: i64,
    backup_path: String,
    preserve_license: bool,
) -> Result<String, String> {
    permissions::require_admin(current_user_id)?;
    let backup_dir = PathBuf::from(&backup_path);

    if !backup_dir.exists() || !backup_dir.is_dir() {
        return Err(format!("Backup folder not found: {}", backup_path));
    }

    let backup_db = backup_dir.join("data.db");
    if !backup_db.exists() {
        return Err(
            "The selected folder does not contain data.db. This may not be a valid QMS backup."
                .to_string(),
        );
    }

    let paths = storage::get_storage_paths()?;

    // Step 1: Create safety backup before restore — abort if this fails.
    let safety_name = format!("QMS-SafetyBackup-{}", backup_timestamp());
    let safety_dir = paths.backups.join(&safety_name);
    std::fs::create_dir_all(&safety_dir)
        .map_err(|e| format!("Safety backup failed (cannot create directory): {}. Restore aborted.", e))?;

    if paths.database.exists() {
        std::fs::copy(&paths.database, safety_dir.join("data.db"))
            .map_err(|e| format!("Safety backup failed (database): {}. Restore aborted.", e))?;
    }
    if paths.settings.exists() {
        std::fs::copy(&paths.settings, safety_dir.join("settings.json"))
            .map_err(|e| format!("Safety backup failed (settings): {}. Restore aborted.", e))?;
    }
    if paths.license.exists() {
        std::fs::copy(&paths.license, safety_dir.join("license.json"))
            .map_err(|e| format!("Safety backup failed (license): {}. Restore aborted.", e))?;
    }
    let uploads_src = paths.root.join("uploads");
    if uploads_src.exists() {
        copy_dir_recursive(&uploads_src, &safety_dir.join("uploads"))
            .map_err(|e| format!("Safety backup failed (uploads): {}. Restore aborted.", e))?;
    }

    // Step 2: Restore data.db.
    std::fs::copy(&backup_db, &paths.database)
        .map_err(|e| format!("Failed to restore database: {}", e))?;

    // Step 3: Restore settings.json if present in backup.
    let backup_settings = backup_dir.join("settings.json");
    if backup_settings.exists() {
        std::fs::copy(&backup_settings, &paths.settings)
            .map_err(|e| format!("Failed to restore settings.json: {}", e))?;
    }

    // Step 4: Restore license.json only when explicitly requested.
    if !preserve_license {
        let backup_license = backup_dir.join("license.json");
        if backup_license.exists() {
            std::fs::copy(&backup_license, &paths.license)
                .map_err(|e| format!("Failed to restore license.json: {}", e))?;
        }
    }

    // Step 5: Restore uploads directory if present in backup.
    let backup_uploads = backup_dir.join("uploads");
    if backup_uploads.exists() {
        let uploads_dst = paths.root.join("uploads");
        copy_dir_recursive(&backup_uploads, &uploads_dst)?;
    }

    Ok(format!(
        "Restore completed successfully. A safety backup of your previous data was saved as \
         '{}'. Please restart the application to load the restored data.",
        safety_name
    ))
}

/// Validate a backup folder for import (checks existence, structure, and that it is not AppData).
/// Admin only.
#[tauri::command]
pub fn validate_import_backup(
    current_user_id: i64,
    backup_path: String,
) -> Result<String, String> {
    permissions::require_admin(current_user_id)?;
    let path = PathBuf::from(&backup_path);

    if !path.exists() {
        return Err("The selected path does not exist.".to_string());
    }
    if !path.is_dir() {
        return Err("The selected path is not a folder.".to_string());
    }

    // Must contain data.db to be a valid QMS backup
    if !path.join("data.db").exists() {
        return Err(
            "The selected folder does not contain data.db. \
             This does not appear to be a valid QMS backup folder."
                .to_string(),
        );
    }

    // Prevent importing from inside the AppData directory itself
    let paths = storage::get_storage_paths()?;
    let canonical_src = std::fs::canonicalize(&path).unwrap_or_else(|_| path.clone());
    let canonical_root = std::fs::canonicalize(&paths.root).unwrap_or_else(|_| paths.root.clone());
    if canonical_src.starts_with(&canonical_root) {
        return Err(
            "The selected folder is inside the QMSDesktop data directory. \
             Use the Restore button on a backup listed below instead."
                .to_string(),
        );
    }

    // Return canonical path for display
    Ok(canonical_src.to_string_lossy().to_string())
}
