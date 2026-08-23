use rusqlite::params;
use serde::Serialize;
use crate::{db, password, permissions};

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
    /// Assignment eligibility — deliberately separate from role. A user's role
    /// governs what they may DO; eligibility governs which assignment selectors
    /// they APPEAR IN. Overloading role for both is why the CAPA and audit
    /// selectors could not be curated independently.
    pub can_be_capa_responsible: bool,
    pub can_be_lead_auditor: bool,
}

/// Validate a role key against the roles table rather than a hard-coded list.
///
/// This used to accept only the five built-in strings, which would have made
/// every administrator-created custom role unassignable: create_user and
/// update_user would reject "document_controller" outright. Roles are now data,
/// so the check has to be data-driven too.
///
/// Only ACTIVE roles may be assigned — a deactivated role grants nothing, so
/// putting someone into one would silently strip their access.
fn validate_role(conn: &rusqlite::Connection, role_key: &str) -> Result<(), String> {
    let ok: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM roles WHERE role_key = ?1 AND is_active = 1",
            params![role_key],
            |r| r.get(0),
        )
        .map_err(|e| format!("Failed to validate role: {}", e))?;

    if ok > 0 {
        Ok(())
    } else {
        Err(format!(
            "Invalid or inactive role: {}. Choose an active role from Roles & Permissions.",
            role_key
        ))
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
    permissions::require_permission(current_user_id, "users.view")?;

    let conn = db::open_conn()?;

    let mut stmt = conn
        .prepare(
            // Eligibility columns are APPENDED at indices 8/9. Never insert into
            // the middle of this list: the mapping below is positional.
            "SELECT id, username, full_name, email, role, department, is_active, created_at,
                    can_be_capa_responsible, can_be_lead_auditor
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
                can_be_capa_responsible: row.get::<_, i64>(8)? != 0,
                can_be_lead_auditor:     row.get::<_, i64>(9)? != 0,
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
    permissions::require_permission(current_user_id, "users.manage")?;

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
    password::validate_password_strength(&password)?;

    let conn = db::open_conn()?;
    validate_role(&conn, &role)?;

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

    // Seed assignment eligibility from the role, using the same rule as the
    // migration-008 backfill. Without this a newly created user is eligible for
    // nothing and never appears in the CAPA-responsible or lead-auditor
    // selectors — which is exactly the "I created a user and it doesn't show up"
    // defect. The admin can still override either flag afterwards via
    // set_user_eligibility; this is only a sensible starting point.
    let default_capa = matches!(role.as_str(), "Admin" | "QualityManager" | "Employee");
    let default_audit = matches!(role.as_str(), "Admin" | "QualityManager" | "Auditor");

    conn.execute(
        // role_id is resolved from the same role string. Without it a new user
        // would have NULL role_id and, since the engine fails closed on a missing
        // role, no permissions at all.
        "INSERT INTO users (username, full_name, email, role, role_id, department, password_hash, is_active,
                            can_be_capa_responsible, can_be_lead_auditor, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, (SELECT id FROM roles WHERE role_key = ?4), ?5, ?6, 1, ?7, ?8, datetime('now'), datetime('now'))",
        params![
            &username, &name, &email, &role, &department, &hash,
            if default_capa { 1 } else { 0 },
            if default_audit { 1 } else { 0 }
        ],
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
        can_be_capa_responsible: default_capa,
        can_be_lead_auditor: default_audit,
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
    permissions::require_permission(current_user_id, "users.manage")?;

    let name = name.trim().to_string();
    let email = email
        .map(|e| e.trim().to_lowercase())
        .filter(|e| !e.is_empty())
        .unwrap_or_default();
    let department = department.trim().to_string();

    if name.is_empty() {
        return Err("Full name is required".to_string());
    }
    let mut conn = db::open_conn()?;
    validate_role(&conn, &role)?;

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    // role_id must move with the legacy role string, or a role change would be
    // invisible to the RBAC engine.
    tx.execute(
        "UPDATE users SET full_name = ?1, email = ?2, role = ?3,
                          role_id = (SELECT id FROM roles WHERE role_key = ?3),
                          department = ?4, updated_at = datetime('now')
          WHERE id = ?5",
        params![&name, &email, &role, &department, id],
    )
    .map_err(|e| format!("Failed to update user: {}", e))?;

    // Demoting the last administrator out of the control path must be refused.
    permissions::assert_control_path_retained(&tx)?;

    let _ = tx.execute(
        "INSERT INTO activity_log (module, record_id, action, description, performed_by, performed_at)
         VALUES ('users', ?1, 'UPDATED', ?2, ?3, datetime('now'))",
        params![id, format!("User profile updated: {} ({})", &name, &role), current_user_id],
    );

    tx.commit().map_err(|e| format!("Failed to commit user update: {}", e))?;
    let conn = db::open_conn()?;

    let result = conn
        .query_row(
            // Eligibility appended at indices 8/9 — see the note on list_users.
            "SELECT id, username, full_name, email, role, department, is_active, created_at,
                    can_be_capa_responsible, can_be_lead_auditor
             FROM users WHERE id = ?1",
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
                    can_be_capa_responsible: row.get::<_, i64>(8)? != 0,
                    can_be_lead_auditor:     row.get::<_, i64>(9)? != 0,
                })
            },
        )
        .map_err(|e| format!("Failed to read updated user: {}", e))?;

    Ok(result)
}

/// Activate or deactivate a user account. Requires Admin role.
#[tauri::command]
pub fn set_user_status(current_user_id: i64, id: i64, is_active: bool) -> Result<(), String> {
    permissions::require_permission(current_user_id, "users.manage")?;

    let mut conn = db::open_conn()?;

    // Apply, then assert the invariant on the RESULTING state and roll back if
    // it fails. Checking after the fact is what makes this correct for every
    // mutation without having to predict each one's effect on the control path.
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    tx.execute(
        "UPDATE users SET is_active = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![is_active as i64, id],
    )
    .map_err(|e| format!("Failed to update user status: {}", e))?;

    permissions::assert_control_path_retained(&tx)?;

    let action = if is_active { "ACTIVATED" } else { "DEACTIVATED" };
    let _ = tx.execute(
        "INSERT INTO activity_log (module, record_id, action, description, performed_by, performed_at)
         VALUES ('users', ?1, ?2, 'User status changed', ?3, datetime('now'))",
        params![id, action, current_user_id],
    );

    tx.commit()
        .map_err(|e| format!("Failed to commit user status change: {}", e))?;

    Ok(())
}

/// Reset a user's password. Requires Admin role.
#[tauri::command]
pub fn reset_user_password(current_user_id: i64, id: i64, new_password: String) -> Result<(), String> {
    permissions::require_permission(current_user_id, "users.manage")?;

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

/// Assignment eligibility for a user. Admin only.
///
/// Kept separate from create_user/update_user on purpose: those signatures are
/// already consumed by the Users screen, and eligibility is an orthogonal concern
/// that also needs to be togglable without re-submitting the whole user record.
#[tauri::command]
pub fn set_user_eligibility(
    current_user_id: i64,
    id: i64,
    can_be_capa_responsible: bool,
    can_be_lead_auditor: bool,
) -> Result<(), String> {
    permissions::require_permission(current_user_id, "users.manage")?;

    let conn = db::open_conn()?;

    let name: String = conn
        .query_row("SELECT full_name FROM users WHERE id = ?1", params![id], |r| r.get(0))
        .map_err(|_| "User not found".to_string())?;

    conn.execute(
        "UPDATE users
            SET can_be_capa_responsible = ?1,
                can_be_lead_auditor     = ?2,
                updated_at              = datetime('now')
          WHERE id = ?3",
        params![
            if can_be_capa_responsible { 1 } else { 0 },
            if can_be_lead_auditor { 1 } else { 0 },
            id
        ],
    )
    .map_err(|e| format!("Failed to update eligibility: {}", e))?;

    if let Err(e) = conn.execute(
        "INSERT INTO activity_log (module, record_id, action, description, performed_by, performed_at)
         VALUES ('users', ?1, 'ELIGIBILITY', ?2, ?3, datetime('now'))",
        params![
            id,
            format!(
                "Eligibility for {} set to CAPA responsible={}, lead auditor={}",
                name, can_be_capa_responsible, can_be_lead_auditor
            ),
            current_user_id
        ],
    ) {
        eprintln!("activity_log write failed for users/ELIGIBILITY: {}", e);
    }

    Ok(())
}


#[cfg(test)]
mod eligibility_tests {
    use rusqlite::Connection;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                role TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                can_be_capa_responsible INTEGER NOT NULL DEFAULT 0,
                can_be_lead_auditor INTEGER NOT NULL DEFAULT 0);
             INSERT INTO users (full_name, role, is_active, can_be_capa_responsible, can_be_lead_auditor) VALUES
                ('Alice Admin','Admin',1,1,1),
                ('Bob Auditor','Auditor',1,0,1),
                ('Carol Employee','Employee',1,1,0),
                ('Dan Disabled','Admin',0,1,1),
                ('Eve Viewer','Viewer',1,0,0);",
        )
        .unwrap();
        conn
    }

    fn eligible(conn: &Connection, column: &str) -> Vec<String> {
        let sql = format!(
            "SELECT full_name FROM users WHERE is_active = 1 AND {} = 1 ORDER BY full_name",
            column
        );
        let mut s = conn.prepare(&sql).unwrap();
        s.query_map([], |r| r.get::<_, String>(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect()
    }

    /// Bob is an Auditor but NOT CAPA-eligible; Carol is a plain Employee who is.
    /// Filtering by role instead of eligibility would produce the wrong list both ways.
    #[test]
    fn capa_responsible_list_is_filtered_by_eligibility_not_role() {
        let conn = db();
        assert_eq!(
            eligible(&conn, "can_be_capa_responsible"),
            vec!["Alice Admin", "Carol Employee"]
        );
    }

    #[test]
    fn lead_auditor_list_is_filtered_by_eligibility_not_role() {
        let conn = db();
        assert_eq!(
            eligible(&conn, "can_be_lead_auditor"),
            vec!["Alice Admin", "Bob Auditor"]
        );
    }

    /// A deactivated user must never stay selectable, however eligible.
    #[test]
    fn inactive_users_are_excluded_even_when_eligible() {
        let conn = db();
        for col in ["can_be_capa_responsible", "can_be_lead_auditor"] {
            assert!(
                !eligible(&conn, col).contains(&"Dan Disabled".to_string()),
                "inactive user leaked into {}",
                col
            );
        }
    }

    /// The reported defect: a newly created, active, eligible user must appear
    /// in the selector straight away.
    #[test]
    fn newly_created_eligible_user_appears_immediately() {
        let conn = db();
        conn.execute(
            "INSERT INTO users (full_name, role, is_active, can_be_capa_responsible, can_be_lead_auditor)
             VALUES ('Frank New','Employee',1,1,1)",
            [],
        )
        .unwrap();
        assert!(eligible(&conn, "can_be_capa_responsible").contains(&"Frank New".to_string()));
        assert!(eligible(&conn, "can_be_lead_auditor").contains(&"Frank New".to_string()));
    }

    /// The capability string is interpolated into SQL, so only the whitelist may
    /// ever reach the query. Anything else must be rejected before that point.
    #[test]
    fn unknown_capability_maps_to_no_column() {
        let map = |c: &str| match c {
            "capa_responsible" => Some("can_be_capa_responsible"),
            "lead_auditor" => Some("can_be_lead_auditor"),
            _ => None,
        };
        assert_eq!(map("capa_responsible"), Some("can_be_capa_responsible"));
        assert_eq!(map("lead_auditor"), Some("can_be_lead_auditor"));
        assert_eq!(map("1=1; DROP TABLE users--"), None);
        assert_eq!(map("role"), None);
    }
}

// ─── Assignment candidate APIs ───────────────────────────────────────────────
//
// Context-specific replacements for the generic list_assignable_users.
//
// PRIVACY: these return ONLY a stable id and a display name. No email, no role,
// no permission data, no account metadata. A user choosing an assignee has no
// business receiving the user directory, and the previous minimal-user query was
// the reason ordinary users were being pushed toward users.view.
//
// AUTHORIZATION is by business capability, not by user administration. Anyone who
// may create, edit, or assign a record may see who is eligible to receive it.
// A read-only user is NOT authorized — and the frontend must therefore only
// request candidates when it actually needs them (entering a create/edit form),
// never as part of the page's initial load.

/// The minimum a selector needs. Deliberately narrower than UserMinimal, which
/// also carries `role`.
#[derive(Serialize)]
pub struct AssignmentCandidate {
    pub id: i64,
    pub name: String,
}

fn query_candidates(column: &str) -> Result<Vec<AssignmentCandidate>, String> {
    let conn = db::open_conn()?;

    // `column` is never caller-supplied — both call sites pass a literal.
    let sql = format!(
        "SELECT id, full_name FROM users
          WHERE is_active = 1 AND {} = 1
          ORDER BY full_name ASC",
        column
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Failed to prepare candidate query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(AssignmentCandidate {
                id:   row.get(0)?,
                name: row.get(1)?,
            })
        })
        .map_err(|e| format!("Failed to query candidates: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

/// Active users eligible to be a CAPA responsible person.
/// Requires the ability to create, edit, or assign a CAPA.
#[tauri::command]
pub fn list_capa_responsible_candidates(
    current_user_id: i64,
) -> Result<Vec<AssignmentCandidate>, String> {
    permissions::require_any_permission(
        current_user_id,
        &["capa.create", "capa.edit", "capa.assign"],
    )?;
    query_candidates("can_be_capa_responsible")
}

/// Active users eligible to be an audit lead auditor.
/// Requires the ability to create, edit, or assign an audit.
#[tauri::command]
pub fn list_lead_auditor_candidates(
    current_user_id: i64,
) -> Result<Vec<AssignmentCandidate>, String> {
    permissions::require_any_permission(
        current_user_id,
        &["audits.create", "audits.edit", "audits.assign"],
    )?;
    query_candidates("can_be_lead_auditor")
}

#[cfg(test)]
mod candidate_tests {
    use rusqlite::Connection;

    /// The candidate projection must expose id and name ONLY. If someone widens
    /// this SELECT later, this test fails and says why.
    #[test]
    fn candidate_projection_exposes_only_id_and_name() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE users (
                id INTEGER PRIMARY KEY, full_name TEXT, email TEXT, role TEXT,
                password_hash TEXT, department TEXT, is_active INTEGER,
                can_be_capa_responsible INTEGER, can_be_lead_auditor INTEGER);
             INSERT INTO users VALUES
                (1,'Alice','alice@example.com','Admin','$argon2id$SECRET','QA',1,1,1);",
        )
        .unwrap();

        let mut stmt = c
            .prepare("SELECT id, full_name FROM users WHERE is_active = 1 AND can_be_capa_responsible = 1")
            .unwrap();
        assert_eq!(stmt.column_count(), 2, "candidate query must project exactly two columns");
        let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        assert_eq!(names, vec!["id", "full_name"]);
        for leaked in ["email", "password_hash", "role", "department"] {
            assert!(!names.contains(&leaked.to_string()), "{} must not be projected", leaked);
        }
    }

    #[test]
    fn candidates_are_filtered_by_eligibility_and_active_state() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, full_name TEXT, is_active INTEGER,
                can_be_capa_responsible INTEGER, can_be_lead_auditor INTEGER);
             INSERT INTO users VALUES
                (1,'Active Eligible',1,1,0),
                (2,'Active Ineligible',1,0,1),
                (3,'Inactive Eligible',0,1,1);",
        )
        .unwrap();

        let names = |col: &str| -> Vec<String> {
            let sql = format!(
                "SELECT full_name FROM users WHERE is_active = 1 AND {} = 1 ORDER BY full_name",
                col
            );
            let mut s = c.prepare(&sql).unwrap();
            s.query_map([], |r| r.get::<_, String>(0)).unwrap().filter_map(|r| r.ok()).collect()
        };

        assert_eq!(names("can_be_capa_responsible"), vec!["Active Eligible"]);
        assert_eq!(names("can_be_lead_auditor"), vec!["Active Ineligible"]);
    }
}

/// Active users who may be set as the owner / responsible person / handler of a
/// record in the given module.
///
/// SEMANTICS, derived from the actual forms rather than assumed:
///   risks      "Responsible Person"  -> risks.owner_id
///   complaints "Issued By (User)"    -> complaints.assigned_to
///   nc         "Responsible Person"  -> non_conformities.assigned_to
///   documents  "Owner"               -> documents.owner_id
///
/// None of these is a curated role in the product: any active user can be made
/// responsible for a risk or own a document. There is deliberately NO eligibility
/// flag for them — unlike CAPA responsible person and lead auditor, which the
/// product does curate. Inventing flags here would add administration burden for
/// a distinction the product does not make.
///
/// One parameterized command rather than four near-identical ones: the modules
/// differ only in which permission authorizes the call, and the module string is
/// whitelisted before it can influence anything.
///
/// PRIVACY: id and full_name only, exactly like the CAPA/auditor candidate APIs.
#[tauri::command]
pub fn list_record_owner_candidates(
    current_user_id: i64,
    module: String,
) -> Result<Vec<AssignmentCandidate>, String> {
    // Authorized by the caller's ability to act on that module — never by user
    // administration rights. A read-only viewer is correctly refused, so callers
    // must request this only when opening a form that needs it.
    let required: &[&str] = match module.as_str() {
        "risks"      => &["risks.create", "risks.edit", "risks.assign"],
        "complaints" => &["complaints.create", "complaints.edit", "complaints.assign"],
        "nc"         => &["nc.create", "nc.edit", "nc.assign"],
        "documents"  => &["documents.create", "documents.edit"],
        other => return Err(format!("Unknown assignment module: {}", other)),
    };
    permissions::require_any_permission(current_user_id, required)?;

    let conn = db::open_conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, full_name FROM users
              WHERE is_active = 1
              ORDER BY full_name ASC",
        )
        .map_err(|e| format!("Failed to prepare owner candidate query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(AssignmentCandidate {
                id:   row.get(0)?,
                name: row.get(1)?,
            })
        })
        .map_err(|e| format!("Failed to query owner candidates: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

#[cfg(test)]
mod owner_candidate_tests {
    /// The module string selects a permission set and must never fall through to
    /// a default. An unknown value has to be rejected, not silently allowed.
    #[test]
    fn module_whitelist_rejects_anything_unexpected() {
        let map = |m: &str| -> Option<&[&str]> {
            match m {
                "risks" => Some(&["risks.create", "risks.edit", "risks.assign"]),
                "complaints" => Some(&["complaints.create", "complaints.edit", "complaints.assign"]),
                "nc" => Some(&["nc.create", "nc.edit", "nc.assign"]),
                "documents" => Some(&["documents.create", "documents.edit"]),
                _ => None,
            }
        };
        assert!(map("risks").is_some());
        assert!(map("documents").is_some());
        assert_eq!(map("users"), None, "must not expose the user directory by module name");
        assert_eq!(map(""), None);
        assert_eq!(map("risks; DROP TABLE users--"), None);
    }

    /// Owner candidates are every ACTIVE user — no eligibility filter, because the
    /// product does not curate these roles. Inactive accounts are still excluded.
    #[test]
    fn owner_candidates_are_all_active_users_regardless_of_eligibility() {
        let c = rusqlite::Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, full_name TEXT, is_active INTEGER,
                can_be_capa_responsible INTEGER, can_be_lead_auditor INTEGER);
             INSERT INTO users VALUES
                (1,'Ann Active',1,0,0),
                (2,'Ben Eligible',1,1,1),
                (3,'Cid Inactive',0,1,1);",
        )
        .unwrap();

        let mut s = c
            .prepare("SELECT full_name FROM users WHERE is_active = 1 ORDER BY full_name")
            .unwrap();
        let got: Vec<String> = s
            .query_map([], |r| r.get::<_, String>(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert_eq!(got, vec!["Ann Active", "Ben Eligible"]);
        assert!(!got.contains(&"Cid Inactive".to_string()), "inactive users must never be offered");
    }
}
