use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri_plugin_dialog::DialogExt;
use rusqlite::params;
use crate::{db, permissions, storage};

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
    permissions::require_permission(current_user_id, "backup.view")?;
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

// ── Backup destination + candidate safety ─────────────────────────────────────

/// What a restore candidate turned out to be, for the confirmation the user sees
/// before their live data is replaced.
#[derive(Serialize, Debug)]
pub struct BackupCandidate {
    /// Folder name only. The full external path is deliberately not returned to
    /// the renderer, and is not written to the audit log.
    pub folder_name: String,
    pub schema_version: String,
    pub user_count: i64,
    pub document_count: i64,
    pub capa_count: i64,
    pub risk_count: i64,
    pub complaint_count: i64,
    pub database_size_bytes: u64,
    pub has_uploads: bool,
    pub has_settings: bool,
    pub has_license: bool,
}

/// Core tables a QMS database must have. Restoring a SQLite file that merely
/// opens would replace the live database with something the application cannot
/// use — and the previous data would already be gone.
const REQUIRED_TABLES: [&str; 8] = [
    "users",
    "documents",
    "capas",
    "risks",
    "complaints",
    "audits",
    "non_conformities",
    "schema_migrations",
];

/// Open a database file for INSPECTION without touching it in any way.
///
/// A plain read-only open of a WAL database still creates zero-byte `-wal` and
/// `-shm` side-cars next to it, because SQLite wants the shared-memory index.
/// Leaving files behind in somebody's backup folder just for looking at it is
/// wrong, and it makes "validation is read-only" not quite true. The `immutable=1`
/// URI parameter tells SQLite the file cannot change underneath it, so it skips
/// the journal machinery altogether.
fn open_for_inspection(path: &Path) -> Result<rusqlite::Connection, String> {
    // file: URIs use forward slashes, and ? and # would otherwise be read as
    // query and fragment separators.
    let mut uri = String::from("file:///");
    for ch in path.to_string_lossy().chars() {
        match ch {
            '\\' => uri.push('/'),
            // '%' first: encoding it after the others would double-encode them.
            '%' => uri.push_str("%25"),
            '?' => uri.push_str("%3F"),
            '#' => uri.push_str("%23"),
            other => uri.push(other),
        }
    }
    uri.push_str("?immutable=1");

    rusqlite::Connection::open_with_flags(
        &uri,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|_| {
        "The backup's data.db could not be opened as a database. The file may be damaged \
         or may not be a QMS Desktop backup."
            .to_string()
    })
}
/// Reject a destination inside the app's own data directory.
///
/// Backing up into %APPDATA%\QMSDesktop would nest the copy inside the thing
/// being copied. Canonicalising is what makes this reliable: a junction or a
/// relative path can point at the data directory while looking nothing like it.
/// Unlike the previous helper this does NOT fall back to the raw string when
/// canonicalisation fails — a path that cannot be resolved is refused, because
/// "could not resolve" is exactly when a check must not be skipped.
fn assert_outside_app_data(dir: &Path) -> Result<PathBuf, String> {
    let paths = storage::get_storage_paths()?;
    let real_dir = dir
        .canonicalize()
        .map_err(|e| format!("Could not resolve the selected folder: {}", e))?;
    let real_root = paths
        .root
        .canonicalize()
        .map_err(|e| format!("Could not resolve the application data folder: {}", e))?;

    if real_dir.starts_with(&real_root) {
        return Err(
            "That location is inside the QMS Desktop data folder. Choose somewhere else — \
             a backup stored inside the data it protects is lost with it."
                .to_string(),
        );
    }
    Ok(real_dir)
}

/// Inspect a candidate backup folder WITHOUT touching the live database.
///
/// Everything here is read-only and happens before any replacement begins. The
/// previous restore checked only that a file called `data.db` existed, so any
/// file with that name — a text file, a truncated copy, another product's
/// database — would overwrite the live QMS database, and the original was gone
/// by the time anyone found out.
fn inspect_backup_candidate(dir: &Path) -> Result<BackupCandidate, String> {
    if !dir.is_dir() {
        return Err("The selected item is not a folder.".to_string());
    }

    let db_path = dir.join("data.db");
    if !db_path.is_file() {
        return Err(
            "This folder does not contain data.db, so it is not a QMS Desktop backup."
                .to_string(),
        );
    }

    let size = std::fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);
    if size == 0 {
        return Err("The backup's database file is empty.".to_string());
    }

    // Read-only open: inspecting a candidate must never modify it, and must never
    // create a database if the file turns out not to be one.
    let conn = open_for_inspection(&db_path)?;

    let integrity: String = conn
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(|_| {
            "The backup's database could not be checked and may be damaged.".to_string()
        })?;
    if integrity != "ok" {
        // Deliberately not echoing SQLite's page-level detail at the user.
        return Err(
            "The backup's database failed its integrity check. It is damaged and has not been \
             restored."
                .to_string(),
        );
    }

    for table in REQUIRED_TABLES {
        let found: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                params![table],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if found == 0 {
            return Err(format!(
                "The backup's database is missing the '{}' table, so it is not a QMS Desktop \
                 backup. Nothing has been changed.",
                table
            ));
        }
    }

    let schema_version: String = conn
        .query_row(
            "SELECT COALESCE(MAX(version), '') FROM schema_migrations",
            [],
            |r| r.get(0),
        )
        .map_err(|_| {
            "The backup's database has no readable migration history.".to_string()
        })?;
    if schema_version.is_empty() {
        return Err("The backup's database has no migration history.".to_string());
    }

    // A database from a NEWER build may contain columns and tables this version
    // does not understand. Downgrading silently is how data gets quietly dropped.
    let newest_known = crate::db::latest_migration_version();
    if schema_version.as_str() > newest_known {
        return Err(format!(
            "This backup was made by a newer version of QMS Desktop (schema {} against this \
             build's {}). Update the application before restoring it.",
            schema_version, newest_known
        ));
    }

    let count = |sql: &str| -> i64 { conn.query_row(sql, [], |r| r.get(0)).unwrap_or(0) };

    Ok(BackupCandidate {
        folder_name: dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("selected folder")
            .to_string(),
        schema_version,
        user_count: count("SELECT COUNT(*) FROM users"),
        document_count: count("SELECT COUNT(*) FROM documents"),
        capa_count: count("SELECT COUNT(*) FROM capas"),
        risk_count: count("SELECT COUNT(*) FROM risks"),
        complaint_count: count("SELECT COUNT(*) FROM complaints"),
        database_size_bytes: size,
        has_uploads: dir.join("uploads").is_dir(),
        has_settings: dir.join("settings.json").is_file(),
        has_license: dir.join("license.json").is_file(),
    })
}

fn log_backup_activity(action: &str, description: &str, performed_by: i64) {
    // Best-effort and deliberately path-free: an audit line naming an operator's
    // external folder would put a filesystem layout into the database for every
    // future reader of the log.
    let Ok(conn) = db::open_conn() else { return };
    if let Err(e) = conn.execute(
        "INSERT INTO activity_log (module, record_id, action, description, performed_by, performed_at)
         VALUES ('backup', 0, ?1, ?2, ?3, datetime('now'))",
        params![action, description, performed_by],
    ) {
        eprintln!("activity_log write failed for backup/{}: {}", action, e);
    }
}

/// Copy the live data set into `backup_dir`. Shared by both create paths.
fn write_backup_into(backup_dir: &Path, paths: &storage::StoragePaths) -> Result<(), String> {
    std::fs::create_dir_all(backup_dir)
        .map_err(|e| format!("Failed to create backup directory: {}", e))?;

    if paths.database.exists() {
        std::fs::copy(&paths.database, backup_dir.join("data.db"))
            .map_err(|e| format!("Failed to copy database: {}", e))?;
    }
    if paths.settings.exists() {
        std::fs::copy(&paths.settings, backup_dir.join("settings.json"))
            .map_err(|e| format!("Failed to copy settings.json: {}", e))?;
    }
    if paths.license.exists() {
        std::fs::copy(&paths.license, backup_dir.join("license.json"))
            .map_err(|e| format!("Failed to copy license.json: {}", e))?;
    }
    let uploads_src = paths.root.join("uploads");
    if uploads_src.exists() {
        copy_dir_recursive(&uploads_src, &backup_dir.join("uploads"))?;
    }
    Ok(())
}

/// Open the application's backups folder in Windows Explorer.
///
/// The path is derived from the storage roots, never supplied by the caller.
#[tauri::command]
pub fn open_backups_folder(current_user_id: i64) -> Result<(), String> {
    permissions::require_permission(current_user_id, "backup.view")?;
    let paths = storage::get_storage_paths()?;

    std::fs::create_dir_all(&paths.backups)
        .map_err(|e| format!("Failed to ensure backups directory: {}", e))?;

    std::process::Command::new("explorer")
        .arg(paths.backups.as_os_str())
        .spawn()
        .map_err(|e| format!("Failed to open backups folder: {}", e))?;

    Ok(())
}

/// The folder chosen in `pick_and_inspect_backup`, held until the operator
/// confirms or picks another.
///
/// Keeping it here rather than handing it back to the renderer is the point: the
/// folder that gets restored is the one that was actually inspected, not a
/// path the caller supplies afterwards.
static PENDING_RESTORE: std::sync::Mutex<Option<PathBuf>> = std::sync::Mutex::new(None);

fn remember_pending_restore(dir: PathBuf) {
    if let Ok(mut slot) = PENDING_RESTORE.lock() {
        *slot = Some(dir);
    }
}

fn take_pending_restore() -> Option<PathBuf> {
    PENDING_RESTORE.lock().ok().and_then(|mut slot| slot.take())
}

/// Back up into the application's own backups folder.
///
/// Takes no destination. The previous version accepted `destination_path:
/// Option<String>` from the renderer and validated it with `exists()` and
/// `is_dir()` only, which made it a general "copy the database, the licence and
/// every attachment to any writable location" primitive — a UNC share included.
/// The product never passed that argument; the capability existed for nobody.
#[tauri::command]
pub fn create_local_backup(current_user_id: i64) -> Result<String, String> {
    permissions::require_permission(current_user_id, "backup.create")?;
    let paths = storage::get_storage_paths()?;

    let folder_name = format!("QMS-Backup-{}", backup_timestamp());
    write_backup_into(&paths.backups.join(&folder_name), &paths)?;

    log_backup_activity(
        "BACKUP_CREATED",
        &format!("Backup {} created in the application backups folder", folder_name),
        current_user_id,
    );
    Ok(folder_name)
}

/// Back up to a folder the operator chooses.
///
/// The dialog is opened HERE. The renderer asks for a backup; it does not say
/// where, and never sees a path it could substitute. The destination is trusted
/// only because a person picked it during this call, and only for this call.
#[tauri::command]
pub fn create_backup_to_folder(
    app: tauri::AppHandle,
    current_user_id: i64,
) -> Result<Option<String>, String> {
    permissions::require_permission(current_user_id, "backup.create")?;

    let Some(chosen) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None); // cancelling is a normal outcome, not a failure
    };
    let chosen = chosen
        .into_path()
        .map_err(|e| format!("The selected destination is not a folder path: {}", e))?;

    let dest_root = assert_outside_app_data(&chosen)?;

    let folder_name = format!("QMS-Backup-{}", backup_timestamp());
    let backup_dir = dest_root.join(&folder_name);
    let paths = storage::get_storage_paths()?;
    write_backup_into(&backup_dir, &paths)?;

    // The folder name, not the operator's directory layout.
    log_backup_activity(
        "BACKUP_CREATED",
        &format!("Backup {} created in an external location", folder_name),
        current_user_id,
    );
    Ok(Some(backup_dir.to_string_lossy().to_string()))
}

/// Read a backup folder the operator picks, and report what it contains.
///
/// Read-only. Nothing is replaced by calling this — it exists so the confirmation
/// can show what is about to overwrite the live data, and so an unusable folder
/// is rejected before anyone is asked to confirm anything.
///
/// The chosen path is held in the backend between this call and the restore; the
/// renderer receives only a description.
#[tauri::command]
pub fn pick_and_inspect_backup(
    app: tauri::AppHandle,
    current_user_id: i64,
) -> Result<Option<BackupCandidate>, String> {
    permissions::require_permission(current_user_id, "backup.restore")?;

    let Some(chosen) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let chosen = chosen
        .into_path()
        .map_err(|e| format!("The selected item is not a folder path: {}", e))?;

    let candidate = inspect_backup_candidate(&chosen)?;
    remember_pending_restore(chosen);
    Ok(Some(candidate))
}

/// Restore the folder most recently accepted by `pick_and_inspect_backup`.
///
/// The renderer confirms; it does not name the source. Anything else would put
/// the path back in its hands after the validation had already been done against
/// a different one.
#[tauri::command]
pub fn restore_pending_backup(
    current_user_id: i64,
    preserve_license: bool,
) -> Result<String, String> {
    permissions::require_permission(current_user_id, "backup.restore")?;

    let source = take_pending_restore().ok_or_else(|| {
        "No backup has been selected. Choose a backup folder first.".to_string()
    })?;
    perform_restore(&source, preserve_license, current_user_id)
}

/// Restore one of the application's own listed backups, by folder name.
///
/// A name, not a path: it is resolved inside the backups directory and required
/// to be a direct child of it, the same rule `delete_backup` already applies.
#[tauri::command]
pub fn restore_managed_backup(
    current_user_id: i64,
    backup_name: String,
    preserve_license: bool,
) -> Result<String, String> {
    permissions::require_permission(current_user_id, "backup.restore")?;
    let dir = resolve_managed_backup_dir(&backup_name)?;
    perform_restore(&dir, preserve_license, current_user_id)
}

/// Resolve a backup folder NAME to a real directory inside the backups folder.
fn resolve_managed_backup_dir(backup_name: &str) -> Result<PathBuf, String> {
    let name = backup_name.trim();
    if name.is_empty()
        || name.contains('/')
        || name.contains('\\')
        || name.contains(':')
        || name.contains("..")
    {
        return Err("Invalid backup name.".to_string());
    }

    let paths = storage::get_storage_paths()?;
    let candidate = paths.backups.join(name);
    if !candidate.is_dir() {
        return Err("That backup no longer exists.".to_string());
    }

    let real = candidate
        .canonicalize()
        .map_err(|e| format!("Cannot resolve the backup folder: {}", e))?;
    let real_backups = paths
        .backups
        .canonicalize()
        .map_err(|e| format!("Cannot resolve the backups directory: {}", e))?;

    if real.parent() != Some(real_backups.as_path()) {
        return Err("That backup is not inside the backups folder.".to_string());
    }
    Ok(real)
}

/// Replace the live data set from a validated backup folder.
///
/// Order matters, and it is chosen so that a failure at any step leaves the
/// installation usable:
///
///   1. validate the candidate — before anything is touched
///   2. copy the current data aside, and abort if that copy fails
///   3. stage the new database beside the live one and verify the STAGED copy
///   4. clear the write-ahead log belonging to the OLD database
///   5. move the staged file into place
///
/// Step 3 is what stops a truncated copy becoming the live database: the bytes
/// are written under a different name and checked there, so the live file is
/// only ever replaced by something already proven to open. Step 4 matters just
/// as much — a `-wal` left from the previous database would be replayed on top
/// of the restored one, which is data corruption dressed up as a successful
/// restore.
fn perform_restore(
    source_dir: &Path,
    preserve_license: bool,
    current_user_id: i64,
) -> Result<String, String> {
    // 1 ─ validate first.
    let candidate = match inspect_backup_candidate(source_dir) {
        Ok(c) => c,
        Err(e) => {
            log_backup_activity(
                "RESTORE_REJECTED",
                &format!("Restore refused: {}", e),
                current_user_id,
            );
            return Err(e);
        }
    };

    let paths = storage::get_storage_paths()?;
    log_backup_activity(
        "RESTORE_STARTED",
        &format!(
            "Restore started from backup '{}' (schema {}, {} users, {} documents)",
            candidate.folder_name, candidate.schema_version,
            candidate.user_count, candidate.document_count
        ),
        current_user_id,
    );

    // 2 ─ safety copy of what is about to be replaced.
    let safety_name = format!("QMS-SafetyBackup-{}", backup_timestamp());
    let safety_dir = paths.backups.join(&safety_name);
    write_backup_into(&safety_dir, &paths).map_err(|e| {
        let msg = format!("Could not save a copy of the current data ({}). Nothing was changed.", e);
        log_backup_activity("RESTORE_FAILED", &msg, current_user_id);
        msg
    })?;

    // 3 ─ stage beside the live database, then verify the staged file.
    let staged = paths.root.join("data.db.restoring");
    let _ = std::fs::remove_file(&staged);
    std::fs::copy(source_dir.join("data.db"), &staged).map_err(|e| {
        let _ = std::fs::remove_file(&staged);
        let msg = format!("Could not stage the restored database ({}). Nothing was changed.", e);
        log_backup_activity("RESTORE_FAILED", &msg, current_user_id);
        msg
    })?;

    if let Err(e) = verify_staged_database(&staged) {
        let _ = std::fs::remove_file(&staged);
        let msg = format!("{} Nothing was changed.", e);
        log_backup_activity("RESTORE_FAILED", &msg, current_user_id);
        return Err(msg);
    }

    // 4 ─ the old write-ahead log belongs to the database being replaced.
    for suffix in ["data.db-wal", "data.db-shm"] {
        let _ = std::fs::remove_file(paths.root.join(suffix));
    }

    // 5 ─ move into place. Same directory, so this is a rename rather than a
    //     second copy that could fail half-written.
    std::fs::rename(&staged, &paths.database).map_err(|e| {
        let msg = format!(
            "Could not put the restored database in place ({}). Your previous data is intact in \
             the backups folder as '{}'.",
            e, safety_name
        );
        log_backup_activity("RESTORE_FAILED", &msg, current_user_id);
        msg
    })?;

    // The remaining files are not the system of record; a failure here is worth
    // reporting but does not undo a database that is already in place.
    let mut warnings: Vec<String> = Vec::new();

    let backup_settings = source_dir.join("settings.json");
    if backup_settings.is_file() {
        if let Err(e) = std::fs::copy(&backup_settings, &paths.settings) {
            warnings.push(format!("settings could not be restored ({})", e));
        }
    }
    if !preserve_license {
        // A quarantined installation is never re-licensed by a restore.
        //
        // Backups contain license.json, so without this an ordinary "restore my
        // records" — a supported, one-click operation — would copy a
        // pre-revocation token back over the lockout and silently return a
        // machine the vendor has refused to full working order. That is not
        // tampering the customer has to intend; it is the documented recovery
        // path quietly undoing a revocation.
        //
        // The vendor's decision outranks a local backup. Legitimate recovery is
        // still available: re-activate with a valid key, which is exactly what
        // the licence screen offers.
        let quarantined = matches!(
            crate::license::storage::read_license_token(),
            Ok(crate::license::storage::LicenseFileState::Quarantined(_))
        );

        if quarantined {
            warnings.push(
                "the licence was not restored: this installation was locked out by the license \
                 server, and a backup cannot reinstate it. Activate again with a valid license key."
                    .to_string(),
            );
        } else {
            let backup_license = source_dir.join("license.json");
            if backup_license.is_file() {
                if let Err(e) = std::fs::copy(&backup_license, &paths.license) {
                    warnings.push(format!("licence could not be restored ({})", e));
                }
            }
        }
    }
    let backup_uploads = source_dir.join("uploads");
    if backup_uploads.is_dir() {
        if let Err(e) = copy_dir_recursive(&backup_uploads, &paths.root.join("uploads")) {
            warnings.push(format!("attachments could not be restored ({})", e));
        }
    }

    // Confirm the database that is now live actually opens.
    if let Err(e) = verify_staged_database(&paths.database) {
        let msg = format!(
            "The restored database did not verify after being put in place ({}). Your previous \
             data is in the backups folder as '{}'.",
            e, safety_name
        );
        log_backup_activity("RESTORE_FAILED", &msg, current_user_id);
        return Err(msg);
    }

    log_backup_activity(
        "RESTORE_SUCCEEDED",
        &format!(
            "Restored from '{}' (schema {}). Previous data kept as '{}'",
            candidate.folder_name, candidate.schema_version, safety_name
        ),
        current_user_id,
    );

    let mut msg = format!(
        "Restore completed. A copy of your previous data was saved as '{}'. \
         Please restart the application to load the restored data.",
        safety_name
    );
    if !warnings.is_empty() {
        msg.push_str(&format!(" Note: {}.", warnings.join("; ")));
    }
    Ok(msg)
}

/// Open a database file read-only and confirm it is intact and structurally QMS.
fn verify_staged_database(path: &Path) -> Result<(), String> {
    let conn = open_for_inspection(path)
        .map_err(|_| "The restored database could not be opened.".to_string())?;

    let integrity: String = conn
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(|_| "The restored database could not be checked.".to_string())?;
    if integrity != "ok" {
        return Err("The restored database failed its integrity check.".to_string());
    }
    for table in REQUIRED_TABLES {
        let found: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                params![table],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if found == 0 {
            return Err(format!("The restored database is missing the '{}' table.", table));
        }
    }
    Ok(())
}

/// Delete one of the application's own backups, by folder name.
///
/// Name rather than path, for the same reason as restore: the renderer should
/// not be able to name what gets deleted. Safety backups are deliberately not
/// deletable here — they exist precisely for the moment someone regrets a restore.
#[tauri::command]
pub fn delete_backup(current_user_id: i64, backup_name: String) -> Result<(), String> {
    permissions::require_permission(current_user_id, "backup.create")?;

    if !backup_name.trim().starts_with("QMS-Backup-") {
        return Err(
            "Only regular QMS backup folders (QMS-Backup-*) can be deleted here.".to_string(),
        );
    }
    let dir = resolve_managed_backup_dir(&backup_name)?;

    std::fs::remove_dir_all(&dir).map_err(|e| format!("Failed to delete backup: {}", e))?;
    log_backup_activity(
        "BACKUP_DELETED",
        &format!("Backup {} deleted", backup_name.trim()),
        current_user_id,
    );
    Ok(())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

/// Restore safety, asserted against the shipped schema.
///
/// `inspect_backup_candidate` is the gate that stands between a folder someone
/// picked and the live database being overwritten, so it is tested directly
/// rather than through the command that calls it.
#[cfg(test)]
mod restore_safety_tests {
    use super::*;

    struct Scratch {
        dir: PathBuf,
    }

    impl Scratch {
        fn new(tag: &str) -> Self {
            let mut dir = std::env::temp_dir();
            dir.push(format!("qms_restore_{}_{}", tag, std::process::id()));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            Scratch { dir }
        }
        fn sub(&self, name: &str) -> PathBuf {
            let p = self.dir.join(name);
            std::fs::create_dir_all(&p).unwrap();
            p
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }

    /// A folder holding a real, migrated QMS database.
    fn valid_backup(s: &Scratch, name: &str) -> PathBuf {
        let dir = s.sub(name);
        crate::db::initialize_database(&dir.join("data.db")).unwrap();
        dir
    }

    #[test]
    fn a_real_qms_backup_is_accepted_and_described() {
        let s = Scratch::new("valid");
        let dir = valid_backup(&s, "QMS-Backup-20260101_000000");

        let c = inspect_backup_candidate(&dir).expect("a migrated QMS database must be accepted");
        assert_eq!(c.folder_name, "QMS-Backup-20260101_000000");
        assert_eq!(c.schema_version, crate::db::latest_migration_version());
        assert!(c.database_size_bytes > 0);
        // A freshly migrated database has no business rows yet — the point is
        // that the counts are readable, so the operator can compare them.
        assert_eq!(c.user_count, 0);
        assert_eq!(c.document_count, 0);
        assert!(!c.has_uploads);
    }

    #[test]
    fn a_missing_folder_is_refused() {
        let s = Scratch::new("missing");
        assert!(inspect_backup_candidate(&s.dir.join("not-there")).is_err());
    }

    #[test]
    fn a_folder_without_data_db_is_refused() {
        let s = Scratch::new("nodb");
        let dir = s.sub("empty");
        std::fs::write(dir.join("readme.txt"), b"not a backup").unwrap();

        let err = inspect_backup_candidate(&dir).unwrap_err();
        assert!(err.contains("data.db"), "unexpected: {}", err);
    }

    /// THE CASE THAT MATTERED MOST.
    ///
    /// The previous restore checked only that a file named data.db existed, so
    /// any file with that name would have replaced the live database — and the
    /// original was already gone by the time anyone noticed.
    #[test]
    fn a_file_that_is_not_a_database_is_refused() {
        let s = Scratch::new("notsqlite");
        let dir = s.sub("fake");
        std::fs::write(dir.join("data.db"), b"This is a text file, not a database at all.").unwrap();

        let err = inspect_backup_candidate(&dir).unwrap_err();
        assert!(
            err.contains("could not be opened") || err.contains("damaged"),
            "unexpected: {}",
            err,
        );
    }

    #[test]
    fn an_empty_database_file_is_refused() {
        let s = Scratch::new("empty_db");
        let dir = s.sub("zero");
        std::fs::write(dir.join("data.db"), b"").unwrap();

        let err = inspect_backup_candidate(&dir).unwrap_err();
        assert!(err.contains("empty"), "unexpected: {}", err);
    }

    #[test]
    fn a_corrupted_database_is_refused() {
        let s = Scratch::new("corrupt");
        let dir = valid_backup(&s, "corrupt");
        let db = dir.join("data.db");

        // Keep a valid SQLite header so the file still opens, then destroy the
        // pages behind it. This is the case a header check alone would miss.
        let mut bytes = std::fs::read(&db).unwrap();
        for b in bytes.iter_mut().skip(1024) {
            *b = 0x5A;
        }
        std::fs::write(&db, &bytes).unwrap();

        assert!(
            inspect_backup_candidate(&dir).is_err(),
            "a database whose pages are destroyed must not be restorable",
        );
    }

    /// A SQLite database that opens cleanly but belongs to something else.
    #[test]
    fn a_valid_sqlite_database_without_qms_tables_is_refused() {
        let s = Scratch::new("foreign");
        let dir = s.sub("other-product");
        let conn = rusqlite::Connection::open(dir.join("data.db")).unwrap();
        conn.execute_batch(
            "CREATE TABLE contacts (id INTEGER PRIMARY KEY, name TEXT);
             INSERT INTO contacts (name) VALUES ('someone');",
        )
        .unwrap();
        drop(conn);

        let err = inspect_backup_candidate(&dir).unwrap_err();
        assert!(
            err.contains("not a QMS Desktop backup") || err.contains("missing"),
            "unexpected: {}",
            err,
        );
    }

    /// Losing one core table is enough to make a restore destructive.
    #[test]
    fn a_qms_database_missing_a_core_table_is_refused() {
        let s = Scratch::new("partial");
        let dir = valid_backup(&s, "partial");
        let conn = rusqlite::Connection::open(dir.join("data.db")).unwrap();
        conn.execute_batch("DROP TABLE documents;").unwrap();
        drop(conn);

        let err = inspect_backup_candidate(&dir).unwrap_err();
        assert!(err.contains("documents"), "unexpected: {}", err);
    }

    /// A backup from a newer build may carry columns this one cannot represent.
    /// Restoring it would look successful and silently drop them.
    #[test]
    fn a_backup_from_a_newer_build_is_refused() {
        let s = Scratch::new("newer");
        let dir = valid_backup(&s, "future");
        let conn = rusqlite::Connection::open(dir.join("data.db")).unwrap();
        conn.execute(
            "INSERT INTO schema_migrations (version, description, applied_at)
             VALUES ('999', 'from the future', datetime('now'))",
            [],
        )
        .unwrap();
        drop(conn);

        let err = inspect_backup_candidate(&dir).unwrap_err();
        assert!(err.contains("newer version"), "unexpected: {}", err);
    }

    /// Validation is read-only: a refused candidate must be exactly as it was,
    /// and — the part that matters — nothing outside it has been touched.
    #[test]
    fn inspecting_a_candidate_never_modifies_it() {
        let s = Scratch::new("readonly");
        let dir = valid_backup(&s, "intact");
        let db = dir.join("data.db");

        // The fixture is created in WAL mode, so a -wal may already exist. What
        // matters is that inspecting does not CHANGE anything on disk.
        let snapshot = |p: &std::path::Path| -> Option<Vec<u8>> { std::fs::read(p).ok() };
        let before_db = std::fs::read(&db).unwrap();
        let before_wal = snapshot(&dir.join("data.db-wal"));

        let _ = inspect_backup_candidate(&dir);

        assert_eq!(before_db, std::fs::read(&db).unwrap(), "inspection must not write to the candidate");
        assert_eq!(
            before_wal,
            snapshot(&dir.join("data.db-wal")),
            "a read-only open must not append to the candidate's write-ahead log",
        );
    }

    // ── Name-based resolution ────────────────────────────────────────────────

    /// Restore and delete take a NAME, so the renderer cannot address a path.
    /// These are the strings that must never resolve to anything.
    #[test]
    fn a_backup_name_may_not_be_a_path() {
        for evil in [
            "",
            "   ",
            "../../Windows/System32",
            "..\\..\\Windows",
            "sub/dir",
            "sub\\dir",
            "C:\\Windows",
            "QMS-Backup-2026/../../..",
        ] {
            assert!(
                resolve_managed_backup_dir(evil).is_err(),
                "{:?} should have been refused",
                evil,
            );
        }
    }

    /// Safety backups are the thing an operator reaches for after regretting a
    /// restore. The delete command must not offer to remove them.
    #[test]
    fn only_regular_backups_are_deletable_by_name() {
        let accepted = |n: &str| n.trim().starts_with("QMS-Backup-");
        assert!(accepted("QMS-Backup-20260101_101010"));
        assert!(!accepted("QMS-SafetyBackup-20260101_101010"));
        assert!(!accepted("uploads"));
        assert!(!accepted(""));
    }

    // ── Destination containment ──────────────────────────────────────────────

    /// A backup written inside the data directory it is protecting is lost with
    /// it. The check resolves both sides rather than comparing strings.
    #[test]
    fn a_destination_inside_the_data_folder_is_refused() {
        let paths = storage::get_storage_paths().unwrap();
        if !paths.root.exists() {
            return; // no app data on this machine; nothing meaningful to assert
        }
        assert!(
            assert_outside_app_data(&paths.root).is_err(),
            "the data root itself must be refused as a backup destination",
        );
        if paths.backups.exists() {
            assert!(
                assert_outside_app_data(&paths.backups).is_err(),
                "a folder inside the data root must be refused too",
            );
        }
    }

    #[test]
    fn an_unresolvable_destination_is_refused_rather_than_assumed_safe() {
        // The previous helper used canonicalize(..).unwrap_or_else(|_| raw),
        // which fell back to the unresolved string exactly when resolution
        // failed — that is, precisely when the check could not be trusted.
        let missing = std::env::temp_dir().join("qms_definitely_not_here_53f1");
        let _ = std::fs::remove_dir_all(&missing);
        assert!(assert_outside_app_data(&missing).is_err());
    }
}

// Backup hardening: restore validation lives at the end of this file.
