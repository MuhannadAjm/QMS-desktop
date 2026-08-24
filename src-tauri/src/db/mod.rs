mod init;
pub use init::{get_applied_migrations, initialize_database, latest_migration_version};

/// Open a database connection to the QMSDesktop data.db with FK enforcement.
pub fn open_conn() -> Result<rusqlite::Connection, String> {
    let paths = crate::storage::get_storage_paths()?;
    let conn = rusqlite::Connection::open(&paths.database)
        .map_err(|e| format!("Failed to open database: {}", e))?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| format!("Failed to set PRAGMA: {}", e))?;
    Ok(conn)
}
