use serde::Serialize;
use crate::{db, storage};

#[derive(Serialize)]
pub struct AppStorageStatus {
    pub storage_dir: String,
    pub storage_initialized: bool,
    pub database_initialized: bool,
    pub uploads_initialized: bool,
    pub migrations_applied: Vec<String>,
    pub settings_file_exists: bool,
    pub license_file_exists: bool,
}

/// Create all AppData directories, placeholder files, open/initialize the SQLite
/// database, and run any pending migrations.  Called once on app startup.
#[tauri::command]
pub fn initialize_app_storage() -> Result<AppStorageStatus, String> {
    let paths = storage::get_storage_paths()?;

    storage::create_storage_directories(&paths)?;
    storage::create_placeholder_files(&paths)?;
    db::initialize_database(&paths.database)?;

    let migrations = db::get_applied_migrations(&paths.database)?;

    Ok(AppStorageStatus {
        storage_dir:          paths.root.to_string_lossy().to_string(),
        storage_initialized:  paths.root.exists(),
        database_initialized: paths.database.exists(),
        uploads_initialized:  storage::uploads_initialized(&paths),
        migrations_applied:   migrations,
        settings_file_exists: paths.settings.exists(),
        license_file_exists:  paths.license.exists(),
    })
}

/// Return the current status of AppData storage without modifying anything.
#[tauri::command]
pub fn get_app_storage_status() -> Result<AppStorageStatus, String> {
    let paths = storage::get_storage_paths()?;

    let db_exists = paths.database.exists();
    let migrations = if db_exists {
        db::get_applied_migrations(&paths.database)?
    } else {
        vec![]
    };

    Ok(AppStorageStatus {
        storage_dir:          paths.root.to_string_lossy().to_string(),
        storage_initialized:  paths.root.exists(),
        database_initialized: db_exists,
        uploads_initialized:  storage::uploads_initialized(&paths),
        migrations_applied:   migrations,
        settings_file_exists: paths.settings.exists(),
        license_file_exists:  paths.license.exists(),
    })
}
