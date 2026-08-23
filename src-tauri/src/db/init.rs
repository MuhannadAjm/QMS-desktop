use rusqlite::{Connection, params};
use std::path::Path;

struct Migration {
    version: &'static str,
    description: &'static str,
    sql: &'static str,
}

const MIGRATION_001: &str = include_str!("sql/001_initial_schema.sql");
const MIGRATION_002: &str = include_str!("sql/002_phase3_auth.sql");
const MIGRATION_003: &str = include_str!("sql/003_phase4_documents.sql");
const MIGRATION_004: &str = include_str!("sql/004_phase6_risks_complaints.sql");
const MIGRATION_005: &str = include_str!("sql/005_phase7_audits_nc.sql");
const MIGRATION_006: &str = include_str!("sql/006_phase8b_cross_module_links.sql");
const MIGRATION_007: &str = include_str!("sql/007_phase11a_username.sql");
const MIGRATION_008: &str = include_str!("sql/008_admin_master_data.sql");
const MIGRATION_009: &str = include_str!("sql/009_risk_source_historical_integrity.sql");
const MIGRATION_010: &str = include_str!("sql/010_rbac.sql");
const MIGRATION_011: &str = include_str!("sql/011_rbac_template_parity.sql");
const MIGRATION_012: &str = include_str!("sql/012_complaint_customer_link.sql");

fn migrations() -> Vec<Migration> {
    vec![
        Migration { version: "001", description: "initial_schema",           sql: MIGRATION_001 },
        Migration { version: "002", description: "phase3_auth",              sql: MIGRATION_002 },
        Migration { version: "003", description: "phase4_documents",         sql: MIGRATION_003 },
        Migration { version: "004", description: "phase6_risks_complaints",  sql: MIGRATION_004 },
        Migration { version: "005", description: "phase7_audits_nc",         sql: MIGRATION_005 },
        Migration { version: "006", description: "phase8b_cross_module",     sql: MIGRATION_006 },
        Migration { version: "007", description: "phase11a_username",        sql: MIGRATION_007 },
        Migration { version: "008", description: "admin_master_data",        sql: MIGRATION_008 },
        Migration { version: "009", description: "risk_source_history",     sql: MIGRATION_009 },
        Migration { version: "010", description: "rbac",                    sql: MIGRATION_010 },
        Migration { version: "011", description: "rbac_template_parity",    sql: MIGRATION_011 },
        Migration { version: "012", description: "complaint_customer_link", sql: MIGRATION_012 },
    ]
}

/// Open the database, enable WAL + foreign keys, create the migrations table,
/// run any pending migration scripts, then backfill email-format usernames.
pub fn initialize_database(db_path: &Path) -> Result<(), String> {
    let conn = Connection::open(db_path)
        .map_err(|e| format!("Failed to open database at {:?}: {}", db_path, e))?;

    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA foreign_keys = ON;",
    )
    .map_err(|e| format!("Failed to set database PRAGMAs: {}", e))?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version     TEXT NOT NULL PRIMARY KEY,
            description TEXT NOT NULL DEFAULT '',
            applied_at  TEXT NOT NULL
        );",
    )
    .map_err(|e| format!("Failed to create schema_migrations table: {}", e))?;

    run_pending_migrations(&conn)?;
    backfill_email_usernames(&conn)?;
    Ok(())
}

fn run_pending_migrations(conn: &Connection) -> Result<(), String> {
    for m in migrations() {
        let already_applied: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM schema_migrations WHERE version = ?1",
                params![m.version],
                |row| row.get::<_, i64>(0),
            )
            .map(|n| n > 0)
            .map_err(|e| format!("Migration check failed for {}: {}", m.version, e))?;

        if already_applied {
            continue;
        }

        // Apply the migration AND record it inside one transaction.
        //
        // Previously execute_batch() ran outside any transaction, so a migration
        // that failed halfway left the earlier statements committed while the
        // version row was never written. The next launch would retry from the
        // top and die on "duplicate column name", leaving the database wedged in
        // a state the app could not repair — with no way forward except deleting
        // data.db. SQLite supports transactional DDL, so wrapping both makes a
        // failed migration a clean no-op that can simply be retried.
        conn.execute_batch(&format!(
            "BEGIN;\n{}\n\
             INSERT INTO schema_migrations (version, description, applied_at)\n\
             VALUES ('{}', '{}', datetime('now'));\n\
             COMMIT;",
            m.sql,
            m.version.replace('\'', "''"),
            m.description.replace('\'', "''"),
        ))
        .map_err(|e| {
            // Best-effort unwind; SQLite has already rolled back on error, this
            // just clears the transaction state if it somehow survived.
            let _ = conn.execute_batch("ROLLBACK;");
            format!(
                "Migration {} ({}) failed and was rolled back: {}",
                m.version, m.description, e
            )
        })?;
    }
    Ok(())
}

/// For any user whose username contains '@' (i.e. was set to their email address),
/// extract the local part before '@', replace non-alphanumeric chars with '_',
/// and ensure uniqueness by appending _2, _3, … if needed.
fn backfill_email_usernames(conn: &Connection) -> Result<(), String> {
    let mut stmt = conn
        .prepare("SELECT id, username FROM users WHERE instr(username, '@') > 0")
        .map_err(|e| format!("Failed to prepare backfill query: {}", e))?;

    let rows: Vec<(i64, String)> = stmt
        .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| format!("Failed to query email usernames: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    for (id, email_username) in rows {
        let local = email_username
            .split('@')
            .next()
            .unwrap_or("user")
            .to_lowercase();

        let base = sanitize_username_part(&local);
        let base = if base.is_empty() { format!("user{}", id) } else { base };

        let candidate = find_unique_username(conn, &base, id)?;

        conn.execute(
            "UPDATE users SET username = ?1 WHERE id = ?2",
            params![&candidate, id],
        )
        .map_err(|e| format!("Failed to backfill username for user {}: {}", id, e))?;
    }

    Ok(())
}

fn sanitize_username_part(s: &str) -> String {
    let mut out = String::new();
    for c in s.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else {
            out.push('_');
        }
    }
    // Collapse consecutive underscores and trim edges
    let mut result = String::new();
    let mut prev_underscore = false;
    for c in out.chars() {
        if c == '_' {
            if !prev_underscore && !result.is_empty() {
                result.push('_');
            }
            prev_underscore = true;
        } else {
            result.push(c);
            prev_underscore = false;
        }
    }
    result.trim_end_matches('_').to_string()
}

fn find_unique_username(conn: &Connection, base: &str, exclude_id: i64) -> Result<String, String> {
    let mut candidate = base.to_string();
    let mut n = 2u32;
    loop {
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM users WHERE username = ?1 AND id != ?2",
                params![&candidate, exclude_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Uniqueness check failed: {}", e))?;
        if count == 0 {
            return Ok(candidate);
        }
        candidate = format!("{}_{}", base, n);
        n += 1;
        if n > 999 {
            return Ok(format!("user_{}", exclude_id));
        }
    }
}

/// Return the list of migration version strings that have been applied.
pub fn get_applied_migrations(db_path: &Path) -> Result<Vec<String>, String> {
    let conn = Connection::open(db_path)
        .map_err(|e| format!("Failed to open database for status check: {}", e))?;

    let mut stmt = conn
        .prepare("SELECT version FROM schema_migrations ORDER BY version ASC")
        .map_err(|e| format!("Failed to prepare migration query: {}", e))?;

    let versions: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| format!("Failed to query applied migrations: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(versions)
}
