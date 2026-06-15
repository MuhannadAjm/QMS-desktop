use rusqlite::params;
use serde::Serialize;
use crate::{db, password};

fn is_valid_username(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 64
        && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
        && s.chars().next().map(|c| c.is_ascii_alphabetic()).unwrap_or(false)
}

#[derive(Serialize, Clone)]
pub struct AuthUser {
    pub id: i64,
    pub username: String,
    pub name: String,
    pub email: String,
    pub role: String,
    pub department: String,
    pub is_active: bool,
}

/// Returns true if at least one Admin user exists in the database.
#[tauri::command]
pub fn check_first_admin_exists() -> Result<bool, String> {
    let conn = db::open_conn()?;
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE role = 'Admin'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Query failed: {}", e))?;
    Ok(count > 0)
}

/// Create the very first Admin account. Fails if any users already exist.
#[tauri::command]
pub fn create_first_admin(
    name: String,
    username: String,
    email: Option<String>,
    password: String,
    confirm_password: String,
) -> Result<AuthUser, String> {
    let name = name.trim().to_string();
    let username = username.trim().to_lowercase();
    let email = email
        .map(|e| e.trim().to_lowercase())
        .filter(|e| !e.is_empty())
        .unwrap_or_default();

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
    if password != confirm_password {
        return Err("Passwords do not match".to_string());
    }
    password::validate_password_strength(&password)?;

    let conn = db::open_conn()?;

    let existing: i64 = conn
        .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
        .map_err(|e| format!("Query failed: {}", e))?;
    if existing > 0 {
        return Err("An admin account already exists. Please use the login screen.".to_string());
    }

    let hash = password::hash_password(&password)?;

    conn.execute(
        "INSERT INTO users (username, full_name, email, role, password_hash, is_active, department, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'Admin', ?4, 1, '', datetime('now'), datetime('now'))",
        params![&username, &name, &email, &hash],
    )
    .map_err(|e| format!("Failed to create admin user: {}", e))?;

    let id = conn.last_insert_rowid();

    Ok(AuthUser {
        id,
        username,
        name,
        email,
        role: "Admin".to_string(),
        department: String::new(),
        is_active: true,
    })
}

/// Verify username + password and return a safe user profile (no password_hash).
#[tauri::command]
pub fn login(username: String, password: String) -> Result<AuthUser, String> {
    let username_norm = username.trim().to_lowercase();

    if username_norm.is_empty() {
        return Err("Username is required".to_string());
    }
    if password.is_empty() {
        return Err("Password is required".to_string());
    }

    let conn = db::open_conn()?;

    let result = conn.query_row(
        "SELECT id, username, full_name, email, role, password_hash, is_active, department
         FROM users WHERE username = ?1",
        params![&username_norm],
        |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, i64>(6)?,
                row.get::<_, String>(7)?,
            ))
        },
    );

    let (id, stored_username, name, email, role, hash, is_active_int, department) = match result {
        Ok(r) => r,
        Err(_) => return Err("Invalid username or password".to_string()),
    };

    if is_active_int == 0 {
        return Err("This account is inactive. Contact your administrator.".to_string());
    }

    if !password::verify_password(&password, &hash)? {
        return Err("Invalid username or password".to_string());
    }

    Ok(AuthUser {
        id,
        username: stored_username,
        name,
        email,
        role,
        department,
        is_active: true,
    })
}
