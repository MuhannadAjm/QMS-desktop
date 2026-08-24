use rusqlite::params;
use serde::Serialize;
use crate::{db, permissions, storage};

// ── Structs ──────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct CapaListItem {
    pub id: i64,
    pub capa_number: String,
    pub title: String,
    pub capa_type: String,
    pub source_type: Option<String>,
    pub source_id: Option<i64>,
    pub status: String,
    pub priority: Option<String>,
    pub root_cause: Option<String>,
    pub root_cause_method: Option<String>,
    pub action_plan: Option<String>,
    pub due_date: Option<String>,
    pub responsible_user_id: Option<i64>,
    pub responsible_user_name: Option<String>,
    pub effectiveness_check: Option<String>,
    pub effectiveness_date: Option<String>,
    pub effectiveness_result: Option<String>,
    pub closed_at: Option<String>,
    pub description: Option<String>,
    pub created_by: Option<i64>,
    pub created_by_name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub is_overdue: bool,
}

#[derive(Serialize)]
pub struct CAPAAttachment {
    pub id: i64,
    pub file_name: String,
    pub file_path: String,
    pub file_size: Option<i64>,
    pub uploaded_by: Option<i64>,
    pub uploaded_by_name: Option<String>,
    pub uploaded_at: String,
}

#[derive(Serialize)]
pub struct CapaActivityEntry {
    pub id: i64,
    pub action: String,
    pub description: Option<String>,
    pub performed_by: Option<i64>,
    pub performed_by_name: Option<String>,
    pub performed_at: String,
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CAPA_SQL: &str =
    "SELECT c.id, c.capa_number, c.title, c.type AS capa_type,
            c.source AS source_type, c.source_id,
            c.status, c.priority,
            c.root_cause, c.root_cause_method, c.action_plan,
            c.target_date AS due_date,
            c.assigned_to AS responsible_user_id, ru.full_name AS responsible_user_name,
            c.effectiveness_check, c.effectiveness_date, c.effectiveness_result,
            c.closed_at, c.description,
            c.created_by, cu.full_name AS created_by_name,
            c.created_at, c.updated_at,
            CASE WHEN c.status = 'OPEN' AND c.target_date IS NOT NULL
                      AND c.target_date < date('now') THEN 1 ELSE 0 END AS is_overdue
     FROM capas c
     LEFT JOIN users ru ON c.assigned_to = ru.id
     LEFT JOIN users cu ON c.created_by = cu.id";

// ── Validation helpers ────────────────────────────────────────────────────────

fn validate_capa_type(t: &str) -> Result<(), String> {
    match t {
        // System-fixed enum. CORRECTION is the immediate fix applied to the
        // symptom; CORRECTIVE addresses the root cause so it cannot recur;
        // PREVENTIVE acts before an issue has occurred. These are ISO 9001
        // concepts, not business lookup data, so they stay in code rather than
        // becoming administrator-managed master data.
        "CORRECTIVE" | "PREVENTIVE" | "CORRECTION" => Ok(()),
        _ => Err(format!(
            "Invalid CAPA type: {}. Must be CORRECTIVE, PREVENTIVE or CORRECTION",
            t
        )),
    }
}

fn validate_source_type(s: &str) -> Result<(), String> {
    match s {
        "MANUAL" | "COMPLAINT" | "RISK" | "AUDIT" | "NC" => Ok(()),
        _ => Err(format!(
            "Invalid source type: {}. Must be MANUAL, COMPLAINT, RISK, AUDIT, or NC",
            s
        )),
    }
}

fn validate_priority(p: &str) -> Result<(), String> {
    match p {
        "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" => Ok(()),
        _ => Err(format!("Invalid priority: {}. Must be LOW, MEDIUM, HIGH, or CRITICAL", p)),
    }
}

fn validate_file_extension(ext: &str) -> Result<(), String> {
    match ext {
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "png" | "jpg" | "jpeg" => Ok(()),
        _ => Err(format!(
            "File type .{} is not allowed. Allowed: PDF, DOC, DOCX, XLS, XLSX, PNG, JPG, JPEG",
            ext
        )),
    }
}

// ── Private fetch helpers ─────────────────────────────────────────────────────

fn map_capa_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CapaListItem> {
    let is_overdue_i: i64 = row.get(23)?;
    Ok(CapaListItem {
        id:                    row.get(0)?,
        capa_number:           row.get(1)?,
        title:                 row.get(2)?,
        capa_type:             row.get(3)?,
        source_type:           row.get(4)?,
        source_id:             row.get(5)?,
        status:                row.get(6)?,
        priority:              row.get(7)?,
        root_cause:            row.get(8)?,
        root_cause_method:     row.get(9)?,
        action_plan:           row.get(10)?,
        due_date:              row.get(11)?,
        responsible_user_id:   row.get(12)?,
        responsible_user_name: row.get(13)?,
        effectiveness_check:   row.get(14)?,
        effectiveness_date:    row.get(15)?,
        effectiveness_result:  row.get(16)?,
        closed_at:             row.get(17)?,
        description:           row.get(18)?,
        created_by:            row.get(19)?,
        created_by_name:       row.get(20)?,
        created_at:            row.get(21)?,
        updated_at:            row.get(22)?,
        is_overdue:            is_overdue_i != 0,
    })
}

fn fetch_capa(conn: &rusqlite::Connection, capa_id: i64) -> Result<CapaListItem, String> {
    let sql = format!("{} WHERE c.id = ?1", CAPA_SQL);
    conn.query_row(&sql, params![capa_id], map_capa_row)
        .map_err(|e| format!("CAPA not found: {}", e))
}

fn fetch_attachment(conn: &rusqlite::Connection, attachment_id: i64) -> Result<CAPAAttachment, String> {
    conn.query_row(
        "SELECT a.id, a.file_name, a.file_path, a.file_size,
                a.uploaded_by, u.full_name AS uploaded_by_name, a.uploaded_at
         FROM attachments a
         LEFT JOIN users u ON a.uploaded_by = u.id
         WHERE a.id = ?1",
        params![attachment_id],
        |row| {
            Ok(CAPAAttachment {
                id:               row.get(0)?,
                file_name:        row.get(1)?,
                file_path:        row.get(2)?,
                file_size:        row.get(3)?,
                uploaded_by:      row.get(4)?,
                uploaded_by_name: row.get(5)?,
                uploaded_at:      row.get(6)?,
            })
        },
    )
    .map_err(|e| format!("Attachment not found: {}", e))
}

fn get_capa_prefix(conn: &rusqlite::Connection) -> String {
    let prefix: String = conn
        .query_row(
            "SELECT COALESCE(value, 'CAPA') FROM settings WHERE key = 'capa_prefix'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "CAPA".to_string());
    if prefix.trim().is_empty() { "CAPA".to_string() } else { prefix.trim().to_string() }
}

fn generate_capa_number(conn: &rusqlite::Connection) -> Result<String, String> {
    let prefix = get_capa_prefix(conn);
    let year: String = conn
        .query_row("SELECT strftime('%Y', 'now')", [], |row| row.get(0))
        .map_err(|e| format!("Failed to get current year: {}", e))?;
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM capas WHERE capa_number LIKE ?1",
            params![format!("{}-{}-%" , prefix, year)],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to count CAPAs for numbering: {}", e))?;
    Ok(format!("{}-{}-{:04}", prefix, year, count + 1))
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// List all CAPAs with is_overdue computed. Requires any authenticated user.
#[tauri::command]
pub fn list_capas(current_user_id: i64) -> Result<Vec<CapaListItem>, String> {
    permissions::require_permission(current_user_id, "capa.view")?;

    let conn = db::open_conn()?;
    let sql = format!("{} ORDER BY c.capa_number ASC", CAPA_SQL);
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let capas = stmt
        .query_map([], map_capa_row)
        .map_err(|e| format!("Failed to query CAPAs: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(capas)
}

/// Get a single CAPA by ID. Requires any authenticated user.
#[tauri::command]
pub fn get_capa(current_user_id: i64, capa_record_id: i64) -> Result<CapaListItem, String> {
    permissions::require_permission(current_user_id, "capa.view")?;
    let conn = db::open_conn()?;
    fetch_capa(&conn, capa_record_id)
}

/// Create a new CAPA with auto-generated CAPA number. Requires Admin or QualityManager.
#[tauri::command]
pub fn create_capa(
    current_user_id: i64,
    title: String,
    capa_type: String,
    source_type: Option<String>,
    source_id: Option<i64>,
    root_cause: String,
    root_cause_method: Option<String>,
    action_plan: String,
    due_date: String,
    responsible_user_id: i64,
    description: Option<String>,
    priority: String,
) -> Result<CapaListItem, String> {
    permissions::require_permission(current_user_id, "capa.create")?;

    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("Title is required".to_string());
    }
    validate_capa_type(&capa_type)?;
    validate_priority(&priority)?;

    let root_cause = root_cause.trim().to_string();
    if root_cause.is_empty() {
        return Err("Root cause is required".to_string());
    }
    let action_plan = action_plan.trim().to_string();
    if action_plan.is_empty() {
        return Err("Action plan is required".to_string());
    }
    let due_date = due_date.trim().to_string();
    if due_date.is_empty() {
        return Err("Due date is required".to_string());
    }

    if let Some(ref st) = source_type {
        validate_source_type(st)?;
    }

    let conn = db::open_conn()?;

    // Validate responsible user exists and is active
    let user_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE id = ?1 AND is_active = 1",
            params![responsible_user_id],
            |row| row.get::<_, i64>(0),
        )
        .map(|c| c > 0)
        .unwrap_or(false);
    if !user_exists {
        return Err("Responsible user not found or inactive".to_string());
    }

    let capa_number = generate_capa_number(&conn)?;

    conn.execute(
        "INSERT INTO capas
             (capa_number, title, type, source, source_id, status, priority,
              root_cause, root_cause_method, action_plan, target_date,
              assigned_to, description, created_by, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'OPEN', ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
                 datetime('now'), datetime('now'))",
        params![
            &capa_number, &title, &capa_type, &source_type, &source_id,
            &priority, &root_cause, &root_cause_method, &action_plan,
            &due_date, responsible_user_id, &description, current_user_id
        ],
    )
    .map_err(|e| format!("Failed to create CAPA: {}", e))?;

    let id = conn.last_insert_rowid();

    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('capa', ?1, 'CREATED', ?2, ?3, datetime('now'))",
        params![
            id,
            format!("CAPA created: {} — {}", &capa_number, &title),
            current_user_id
        ],
    );

    fetch_capa(&conn, id)
}

/// Update CAPA metadata. Requires Admin or QualityManager.
#[tauri::command]
pub fn update_capa(
    current_user_id: i64,
    capa_record_id: i64,
    title: String,
    capa_type: String,
    source_type: Option<String>,
    source_id: Option<i64>,
    root_cause: String,
    root_cause_method: Option<String>,
    action_plan: String,
    due_date: String,
    responsible_user_id: i64,
    description: Option<String>,
    priority: String,
    effectiveness_check: Option<String>,
) -> Result<CapaListItem, String> {
    permissions::require_permission(current_user_id, "capa.edit")?;

    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("Title is required".to_string());
    }
    validate_capa_type(&capa_type)?;
    validate_priority(&priority)?;

    let root_cause = root_cause.trim().to_string();
    if root_cause.is_empty() {
        return Err("Root cause is required".to_string());
    }
    let action_plan = action_plan.trim().to_string();
    if action_plan.is_empty() {
        return Err("Action plan is required".to_string());
    }
    let due_date = due_date.trim().to_string();
    if due_date.is_empty() {
        return Err("Due date is required".to_string());
    }

    if let Some(ref st) = source_type {
        validate_source_type(st)?;
    }

    let conn = db::open_conn()?;

    let user_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE id = ?1 AND is_active = 1",
            params![responsible_user_id],
            |row| row.get::<_, i64>(0),
        )
        .map(|c| c > 0)
        .unwrap_or(false);
    if !user_exists {
        return Err("Responsible user not found or inactive".to_string());
    }

    // Null-coerce empty effectiveness_check to None
    let eff_check = effectiveness_check.and_then(|s| {
        let t = s.trim().to_string();
        if t.is_empty() { None } else { Some(t) }
    });

    conn.execute(
        "UPDATE capas
         SET title = ?1, type = ?2, source = ?3, source_id = ?4,
             root_cause = ?5, root_cause_method = ?6, action_plan = ?7,
             target_date = ?8, assigned_to = ?9, description = ?10,
             priority = ?11, effectiveness_check = ?12, updated_at = datetime('now')
         WHERE id = ?13",
        params![
            &title, &capa_type, &source_type, &source_id,
            &root_cause, &root_cause_method, &action_plan, &due_date,
            responsible_user_id, &description, &priority, &eff_check,
            capa_record_id
        ],
    )
    .map_err(|e| format!("Failed to update CAPA: {}", e))?;

    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('capa', ?1, 'UPDATED', 'CAPA metadata updated', ?2, datetime('now'))",
        params![capa_record_id, current_user_id],
    );

    fetch_capa(&conn, capa_record_id)
}

/// Change CAPA status. Closing requires a non-empty effectiveness_check.
/// Reopening clears closed_at. Requires Admin or QualityManager.
#[tauri::command]
pub fn set_capa_status(
    current_user_id: i64,
    capa_record_id: i64,
    status: String,
    effectiveness_check: Option<String>,
) -> Result<CapaListItem, String> {
    permissions::require_permission(current_user_id, "capa.edit")?;

    match status.as_str() {
        "OPEN" | "CLOSED" => {}
        _ => return Err(format!("Invalid status: {}. Must be OPEN or CLOSED", status)),
    }

    let conn = db::open_conn()?;

    if status == "CLOSED" {
        let eff = effectiveness_check
            .as_deref()
            .map(str::trim)
            .unwrap_or("");
        if eff.is_empty() {
            return Err(
                "Effectiveness check is required before closing a CAPA".to_string(),
            );
        }

        conn.execute(
            "UPDATE capas
             SET status = 'CLOSED', effectiveness_check = ?1,
                 closed_at = datetime('now'), updated_at = datetime('now')
             WHERE id = ?2",
            params![eff, capa_record_id],
        )
        .map_err(|e| format!("Failed to close CAPA: {}", e))?;

        let _ = conn.execute(
            "INSERT INTO activity_log
                 (module, record_id, action, description, performed_by, performed_at)
             VALUES ('capa', ?1, 'CLOSED', 'CAPA closed with effectiveness check', ?2, datetime('now'))",
            params![capa_record_id, current_user_id],
        );
    } else {
        // Reopening: clear closed_at
        conn.execute(
            "UPDATE capas
             SET status = 'OPEN', closed_at = NULL, updated_at = datetime('now')
             WHERE id = ?1",
            params![capa_record_id],
        )
        .map_err(|e| format!("Failed to reopen CAPA: {}", e))?;

        let _ = conn.execute(
            "INSERT INTO activity_log
                 (module, record_id, action, description, performed_by, performed_at)
             VALUES ('capa', ?1, 'REOPENED', 'CAPA reopened', ?2, datetime('now'))",
            params![capa_record_id, current_user_id],
        );
    }

    fetch_capa(&conn, capa_record_id)
}

/// Get activity log entries for a CAPA. Requires any authenticated user.
#[tauri::command]
pub fn get_capa_activity(
    current_user_id: i64,
    capa_record_id: i64,
) -> Result<Vec<CapaActivityEntry>, String> {
    permissions::require_permission(current_user_id, "capa.view")?;

    let conn = db::open_conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.action, a.description,
                    a.performed_by, u.full_name AS performed_by_name, a.performed_at
             FROM activity_log a
             LEFT JOIN users u ON a.performed_by = u.id
             WHERE a.module = 'capa' AND a.record_id = ?1
             ORDER BY a.performed_at DESC",
        )
        .map_err(|e| format!("Failed to prepare activity query: {}", e))?;

    let entries = stmt
        .query_map(params![capa_record_id], |row| {
            Ok(CapaActivityEntry {
                id:                row.get(0)?,
                action:            row.get(1)?,
                description:       row.get(2)?,
                performed_by:      row.get(3)?,
                performed_by_name: row.get(4)?,
                performed_at:      row.get(5)?,
            })
        })
        .map_err(|e| format!("Failed to query activity: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(entries)
}

/// Attach a file to a CAPA. Validates extension, copies to uploads/capa/, inserts into
/// attachments table, logs activity. Requires Admin or QualityManager.
#[tauri::command]
pub fn attach_capa_file(
    current_user_id: i64,
    capa_record_id: i64,
    source_file_path: String,
    original_file_name: String,
    note: Option<String>,
) -> Result<CAPAAttachment, String> {
    permissions::require_permission(current_user_id, "capa.attach")?;

    let ext = std::path::Path::new(&source_file_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    validate_file_extension(&ext)?;

    // The operator picked this in a native dialog, so it legitimately comes
    // from the renderer. It is only ever read and copied inward; nothing here
    // or later writes to or deletes it. Validated as a real regular file so a
    // directory or a dangling link cannot make the copy behave oddly.
    let source = storage::validate_import_source(&source_file_path)?;

    let since_epoch = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Clock error: {}", e))?;
    let timestamp_micros = since_epoch.as_micros();
    let stored_filename = format!("{}_{}.{}", capa_record_id, timestamp_micros, ext);

    let paths = storage::get_storage_paths()?;
    let dest_path = paths.uploads_capa.join(&stored_filename);
    std::fs::copy(&source, &dest_path)
        .map_err(|e| format!("Failed to copy file to storage: {}", e))?;

    let file_size = std::fs::metadata(&dest_path)
        .map(|m| m.len() as i64)
        .ok();

    let mime_type = match ext.as_str() {
        "pdf"  => "application/pdf",
        "doc"  => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls"  => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "png"  => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        _      => "application/octet-stream",
    };

    let conn = db::open_conn()?;

    conn.execute(
        "INSERT INTO attachments
             (module, record_id, file_name, file_path, file_size, mime_type,
              uploaded_by, uploaded_at)
         VALUES ('capa', ?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
        params![
            capa_record_id, &original_file_name, &stored_filename,
            file_size, mime_type, current_user_id
        ],
    )
    .map_err(|e| format!("Failed to record attachment: {}", e))?;

    let attachment_id = conn.last_insert_rowid();

    let activity_desc = match &note {
        Some(n) if !n.trim().is_empty() => {
            format!("File attached: {} — {}", &original_file_name, n.trim())
        }
        _ => format!("File attached: {}", &original_file_name),
    };

    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('capa', ?1, 'ATTACHMENT_ADDED', ?2, ?3, datetime('now'))",
        params![capa_record_id, &activity_desc, current_user_id],
    );

    let _ = conn.execute(
        "UPDATE capas SET updated_at = datetime('now') WHERE id = ?1",
        params![capa_record_id],
    );

    fetch_attachment(&conn, attachment_id)
}

/// Open a CAPA attachment file using the Windows default application.
/// Requires any authenticated user.
#[tauri::command]
pub fn open_capa_attachment(current_user_id: i64, attachment_id: i64) -> Result<(), String> {
    permissions::require_permission(current_user_id, "capa.view")?;

    let conn = db::open_conn()?;
    let file_path: String = conn
        .query_row(
            "SELECT file_path FROM attachments WHERE id = ?1 AND module = 'capa'",
            params![attachment_id],
            |row| row.get(0),
        )
        .map_err(|_| "Attachment not found".to_string())?;

    // Resolve through the managed-storage guard rather than joining a database
    // value onto a directory and trusting it. The stored value is generated by
    // this application, so the join is safe today — but nothing enforced that,
    // and PathBuf::join silently REPLACES the base if the joined component is
    // absolute. This canonicalises both sides and refuses anything that resolves
    // outside managed storage.
    let paths = storage::get_storage_paths()?;
    let real = storage::resolve_managed_file(&paths.uploads_capa, &file_path)?;

    std::process::Command::new("cmd")
        .arg("/c")
        .arg("start")
        .arg("")
        .arg(real.as_os_str())
        .spawn()
        .map_err(|e| format!("Failed to open file: {}", e))?;

    Ok(())
}

/// List all attachments for a CAPA. Requires any authenticated user.
#[tauri::command]
pub fn list_capa_attachments(
    current_user_id: i64,
    capa_record_id: i64,
) -> Result<Vec<CAPAAttachment>, String> {
    permissions::require_permission(current_user_id, "capa.view")?;

    let conn = db::open_conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.file_name, a.file_path, a.file_size,
                    a.uploaded_by, u.full_name AS uploaded_by_name, a.uploaded_at
             FROM attachments a
             LEFT JOIN users u ON a.uploaded_by = u.id
             WHERE a.module = 'capa' AND a.record_id = ?1
             ORDER BY a.uploaded_at DESC",
        )
        .map_err(|e| format!("Failed to prepare attachment query: {}", e))?;

    let attachments = stmt
        .query_map(params![capa_record_id], |row| {
            Ok(CAPAAttachment {
                id:               row.get(0)?,
                file_name:        row.get(1)?,
                file_path:        row.get(2)?,
                file_size:        row.get(3)?,
                uploaded_by:      row.get(4)?,
                uploaded_by_name: row.get(5)?,
                uploaded_at:      row.get(6)?,
            })
        })
        .map_err(|e| format!("Failed to query attachments: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(attachments)
}
