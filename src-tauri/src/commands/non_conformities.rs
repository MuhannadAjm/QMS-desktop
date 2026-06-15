use rusqlite::params;
use serde::Serialize;
use crate::{db, permissions, storage};

// ── Structs ───────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct NcListItem {
    pub id: i64,
    pub nc_number: String,
    pub title: String,
    pub description: Option<String>,
    pub source_type: Option<String>,
    pub source_id: Option<i64>,
    pub finding_id: Option<i64>,
    pub severity: String,
    pub status: String,
    pub detected_date: Option<String>,
    pub responsible_user_id: Option<i64>,
    pub responsible_user_name: Option<String>,
    pub containment_action: Option<String>,
    pub related_capa_id: Option<i64>,
    pub related_capa_number: Option<String>,
    pub closed_at: Option<String>,
    pub created_by: Option<i64>,
    pub created_by_name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
pub struct NcAttachment {
    pub id: i64,
    pub file_name: String,
    pub file_path: String,
    pub file_size: Option<i64>,
    pub uploaded_by: Option<i64>,
    pub uploaded_by_name: Option<String>,
    pub uploaded_at: String,
}

#[derive(Serialize)]
pub struct NcActivityEntry {
    pub id: i64,
    pub action: String,
    pub description: Option<String>,
    pub performed_by: Option<i64>,
    pub performed_by_name: Option<String>,
    pub performed_at: String,
}

// ── SQL constants ─────────────────────────────────────────────────────────────

const NC_SQL: &str =
    "SELECT nc.id, nc.nc_number, nc.title, nc.description,
            nc.source AS source_type, nc.source_id,
            nc.finding_id,
            nc.severity, nc.status, nc.detected_date,
            nc.assigned_to AS responsible_user_id, ru.full_name AS responsible_user_name,
            nc.containment_action,
            nc.related_capa_id, c.capa_number AS related_capa_number,
            nc.closed_at,
            nc.created_by, cu.full_name AS created_by_name,
            nc.created_at, nc.updated_at
     FROM non_conformities nc
     LEFT JOIN users ru ON nc.assigned_to = ru.id
     LEFT JOIN users cu ON nc.created_by = cu.id
     LEFT JOIN capas c ON nc.related_capa_id = c.id";

// ── Validation helpers ────────────────────────────────────────────────────────

fn validate_nc_severity(s: &str) -> Result<(), String> {
    match s {
        "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" => Ok(()),
        _ => Err(format!(
            "Invalid severity: '{}'. Must be LOW, MEDIUM, HIGH, or CRITICAL",
            s
        )),
    }
}

fn validate_nc_source(s: &str) -> Result<(), String> {
    match s {
        "AUDIT" | "CUSTOMER_COMPLAINT" | "PROCESS_MONITORING"
        | "SUPPLIER" | "INSPECTION" | "INTERNAL" | "OTHER" | "RISK" => Ok(()),
        _ => Err(format!(
            "Invalid source type: '{}'. Must be AUDIT, CUSTOMER_COMPLAINT, PROCESS_MONITORING, SUPPLIER, INSPECTION, INTERNAL, OTHER, or RISK",
            s
        )),
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

// ── Private helpers ───────────────────────────────────────────────────────────

fn map_nc_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<NcListItem> {
    Ok(NcListItem {
        id:                   row.get(0)?,
        nc_number:            row.get(1)?,
        title:                row.get(2)?,
        description:          row.get(3)?,
        source_type:          row.get(4)?,
        source_id:            row.get(5)?,
        finding_id:           row.get(6)?,
        severity:             row.get(7)?,
        status:               row.get(8)?,
        detected_date:        row.get(9)?,
        responsible_user_id:  row.get(10)?,
        responsible_user_name: row.get(11)?,
        containment_action:   row.get(12)?,
        related_capa_id:      row.get(13)?,
        related_capa_number:  row.get(14)?,
        closed_at:            row.get(15)?,
        created_by:           row.get(16)?,
        created_by_name:      row.get(17)?,
        created_at:           row.get(18)?,
        updated_at:           row.get(19)?,
    })
}

fn fetch_nc(conn: &rusqlite::Connection, nc_id: i64) -> Result<NcListItem, String> {
    let sql = format!("{} WHERE nc.id = ?1", NC_SQL);
    conn.query_row(&sql, params![nc_id], map_nc_row)
        .map_err(|e| format!("Non-conformity not found: {}", e))
}

fn fetch_attachment(conn: &rusqlite::Connection, attachment_id: i64) -> Result<NcAttachment, String> {
    conn.query_row(
        "SELECT a.id, a.file_name, a.file_path, a.file_size,
                a.uploaded_by, u.full_name, a.uploaded_at
         FROM attachments a
         LEFT JOIN users u ON a.uploaded_by = u.id
         WHERE a.id = ?1",
        params![attachment_id],
        |row| Ok(NcAttachment {
            id:               row.get(0)?,
            file_name:        row.get(1)?,
            file_path:        row.get(2)?,
            file_size:        row.get(3)?,
            uploaded_by:      row.get(4)?,
            uploaded_by_name: row.get(5)?,
            uploaded_at:      row.get(6)?,
        }),
    )
    .map_err(|e| format!("Attachment not found: {}", e))
}

fn get_nc_prefix(conn: &rusqlite::Connection) -> String {
    let prefix: String = conn
        .query_row(
            "SELECT COALESCE(value, 'NC') FROM settings WHERE key = 'nc_prefix'",
            [], |row| row.get(0),
        )
        .unwrap_or_else(|_| "NC".to_string());
    if prefix.trim().is_empty() { "NC".to_string() } else { prefix.trim().to_string() }
}

fn generate_nc_number(conn: &rusqlite::Connection) -> Result<String, String> {
    let prefix = get_nc_prefix(conn);
    let year: String = conn
        .query_row("SELECT strftime('%Y', 'now')", [], |row| row.get(0))
        .map_err(|e| format!("Failed to get year: {}", e))?;
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM non_conformities WHERE nc_number LIKE ?1",
            params![format!("{}-{}-%" , prefix, year)],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to count NCs: {}", e))?;
    Ok(format!("{}-{}-{:04}", prefix, year, count + 1))
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_non_conformities(current_user_id: i64) -> Result<Vec<NcListItem>, String> {
    permissions::require_authenticated(current_user_id)?;
    let conn = db::open_conn()?;
    let sql = format!("{} ORDER BY nc.nc_number ASC", NC_SQL);
    let mut stmt = conn.prepare(&sql)
        .map_err(|e| format!("Failed to prepare query: {}", e))?;
    let ncs = stmt.query_map([], map_nc_row)
        .map_err(|e| format!("Failed to query non-conformities: {}", e))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(ncs)
}

#[tauri::command]
pub fn get_non_conformity(current_user_id: i64, nc_id: i64) -> Result<NcListItem, String> {
    permissions::require_authenticated(current_user_id)?;
    let conn = db::open_conn()?;
    fetch_nc(&conn, nc_id)
}

#[tauri::command]
pub fn create_non_conformity(
    current_user_id: i64,
    title: String,
    severity: String,
    source_type: String,
    description: Option<String>,
    source_id: Option<i64>,
    detected_date: Option<String>,
    responsible_user_id: Option<i64>,
    containment_action: Option<String>,
) -> Result<NcListItem, String> {
    permissions::require_admin_or_quality_manager(current_user_id)?;

    let title = title.trim().to_string();
    if title.is_empty() { return Err("Title is required".to_string()); }
    validate_nc_severity(&severity)?;
    validate_nc_source(&source_type)?;

    let conn = db::open_conn()?;

    // Validate responsible user if provided
    if let Some(uid) = responsible_user_id {
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM users WHERE id = ?1 AND is_active = 1",
                params![uid], |row| row.get::<_, i64>(0),
            )
            .map(|c| c > 0)
            .unwrap_or(false);
        if !exists { return Err("Responsible user not found or inactive".to_string()); }
    }

    let nc_number = generate_nc_number(&conn)?;
    let detected = detected_date.unwrap_or_else(|| {
        conn.query_row("SELECT date('now')", [], |r| r.get(0))
            .unwrap_or_else(|_| chrono_now_date())
    });

    conn.execute(
        "INSERT INTO non_conformities
             (nc_number, title, description, source, source_id,
              severity, status, detected_date, assigned_to,
              containment_action, created_by, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'OPEN', ?7, ?8, ?9, ?10,
                 datetime('now'), datetime('now'))",
        params![
            &nc_number, &title, &description, &source_type, &source_id,
            &severity, &detected, &responsible_user_id, &containment_action,
            current_user_id
        ],
    )
    .map_err(|e| format!("Failed to create non-conformity: {}", e))?;

    let id = conn.last_insert_rowid();

    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('nc', ?1, 'CREATED', ?2, ?3, datetime('now'))",
        params![id, format!("Non-conformity created: {} — {}", &nc_number, &title), current_user_id],
    );

    fetch_nc(&conn, id)
}

#[tauri::command]
pub fn update_non_conformity(
    current_user_id: i64,
    nc_id: i64,
    title: String,
    severity: String,
    source_type: String,
    description: Option<String>,
    detected_date: Option<String>,
    responsible_user_id: Option<i64>,
    containment_action: Option<String>,
) -> Result<NcListItem, String> {
    permissions::require_admin_or_quality_manager(current_user_id)?;

    let title = title.trim().to_string();
    if title.is_empty() { return Err("Title is required".to_string()); }
    validate_nc_severity(&severity)?;
    validate_nc_source(&source_type)?;

    let conn = db::open_conn()?;

    if let Some(uid) = responsible_user_id {
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM users WHERE id = ?1 AND is_active = 1",
                params![uid], |row| row.get::<_, i64>(0),
            )
            .map(|c| c > 0)
            .unwrap_or(false);
        if !exists { return Err("Responsible user not found or inactive".to_string()); }
    }

    conn.execute(
        "UPDATE non_conformities
         SET title = ?1, description = ?2, source = ?3,
             severity = ?4, detected_date = ?5, assigned_to = ?6,
             containment_action = ?7, updated_at = datetime('now')
         WHERE id = ?8",
        params![
            &title, &description, &source_type,
            &severity, &detected_date, &responsible_user_id,
            &containment_action, nc_id
        ],
    )
    .map_err(|e| format!("Failed to update non-conformity: {}", e))?;

    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('nc', ?1, 'UPDATED', 'Non-conformity metadata updated', ?2, datetime('now'))",
        params![nc_id, current_user_id],
    );

    fetch_nc(&conn, nc_id)
}

#[tauri::command]
pub fn set_non_conformity_status(
    current_user_id: i64,
    nc_id: i64,
    status: String,
) -> Result<NcListItem, String> {
    permissions::require_admin_or_quality_manager(current_user_id)?;

    match status.as_str() {
        "OPEN" | "CLOSED" | "IN_REVIEW" => {}
        _ => return Err(format!("Invalid status: {}. Must be OPEN, IN_REVIEW, or CLOSED", status)),
    }

    let conn = db::open_conn()?;

    if status == "CLOSED" {
        conn.execute(
            "UPDATE non_conformities SET status = 'CLOSED', closed_at = datetime('now'),
             updated_at = datetime('now') WHERE id = ?1",
            params![nc_id],
        )
        .map_err(|e| format!("Failed to close NC: {}", e))?;
        let _ = conn.execute(
            "INSERT INTO activity_log
                 (module, record_id, action, description, performed_by, performed_at)
             VALUES ('nc', ?1, 'CLOSED', 'Non-conformity closed', ?2, datetime('now'))",
            params![nc_id, current_user_id],
        );
    } else if status == "OPEN" {
        conn.execute(
            "UPDATE non_conformities SET status = 'OPEN', closed_at = NULL,
             updated_at = datetime('now') WHERE id = ?1",
            params![nc_id],
        )
        .map_err(|e| format!("Failed to reopen NC: {}", e))?;
        let _ = conn.execute(
            "INSERT INTO activity_log
                 (module, record_id, action, description, performed_by, performed_at)
             VALUES ('nc', ?1, 'REOPENED', 'Non-conformity reopened', ?2, datetime('now'))",
            params![nc_id, current_user_id],
        );
    } else {
        conn.execute(
            "UPDATE non_conformities SET status = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![&status, nc_id],
        )
        .map_err(|e| format!("Failed to update NC status: {}", e))?;
        let _ = conn.execute(
            "INSERT INTO activity_log
                 (module, record_id, action, description, performed_by, performed_at)
             VALUES ('nc', ?1, 'STATUS_CHANGED', ?2, ?3, datetime('now'))",
            params![nc_id, format!("Status changed to {}", &status), current_user_id],
        );
    }

    fetch_nc(&conn, nc_id)
}

/// Create a CAPA from a Non-Conformity.
/// Prevents duplicate: if nc.related_capa_id is already set, returns error.
/// Requires Admin or QualityManager.
#[tauri::command]
pub fn create_capa_from_non_conformity(
    current_user_id: i64,
    nc_id: i64,
) -> Result<NcListItem, String> {
    permissions::require_admin_or_quality_manager(current_user_id)?;

    let conn = db::open_conn()?;

    // Load NC
    let (nc_number, nc_title, already_capa_id): (String, String, Option<i64>) = conn
        .query_row(
            "SELECT nc_number, title, related_capa_id FROM non_conformities WHERE id = ?1",
            params![nc_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| "Non-conformity not found".to_string())?;

    if already_capa_id.is_some() {
        return Err(
            "A CAPA already exists for this Non-Conformity. Duplicate CAPA creation is not allowed.".to_string()
        );
    }

    // Generate CAPA number
    let capa_prefix: String = conn
        .query_row(
            "SELECT COALESCE(value, 'CAPA') FROM settings WHERE key = 'capa_prefix'",
            [], |row| row.get(0),
        )
        .unwrap_or_else(|_| "CAPA".to_string());
    let capa_prefix = if capa_prefix.trim().is_empty() { "CAPA".to_string() } else { capa_prefix.trim().to_string() };

    let year: String = conn
        .query_row("SELECT strftime('%Y', 'now')", [], |row| row.get(0))
        .map_err(|e| format!("Failed to get year: {}", e))?;
    let capa_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM capas WHERE capa_number LIKE ?1",
            params![format!("{}-{}-%" , capa_prefix, year)],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to count CAPAs: {}", e))?;
    let capa_number = format!("{}-{}-{:04}", capa_prefix, year, capa_count + 1);

    // Build CAPA title
    let capa_title = format!("CAPA for NC {} — {}", &nc_number, &nc_title);
    let capa_title = if capa_title.len() > 250 {
        format!("{}...", &capa_title[..247])
    } else {
        capa_title
    };

    // Insert CAPA
    conn.execute(
        "INSERT INTO capas
             (capa_number, title, source, nc_id, status, created_by, created_at, updated_at)
         VALUES (?1, ?2, 'NC', ?3, 'OPEN', ?4, datetime('now'), datetime('now'))",
        params![&capa_number, &capa_title, nc_id, current_user_id],
    )
    .map_err(|e| format!("Failed to create CAPA: {}", e))?;

    let capa_id = conn.last_insert_rowid();

    // Update NC related_capa_id
    conn.execute(
        "UPDATE non_conformities SET related_capa_id = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![capa_id, nc_id],
    )
    .map_err(|e| format!("Failed to link CAPA to NC: {}", e))?;

    // Activity log for NC
    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('nc', ?1, 'CAPA_CREATED', ?2, ?3, datetime('now'))",
        params![
            nc_id,
            format!("CAPA {} created from this NC", &capa_number),
            current_user_id
        ],
    );

    // Activity log for CAPA
    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('capa', ?1, 'CREATED', ?2, ?3, datetime('now'))",
        params![
            capa_id,
            format!("CAPA {} created from NC {} ({})", &capa_number, &nc_number, &nc_title),
            current_user_id
        ],
    );

    fetch_nc(&conn, nc_id)
}

#[tauri::command]
pub fn attach_nc_file(
    current_user_id: i64,
    nc_record_id: i64,
    source_file_path: String,
    original_file_name: String,
    note: Option<String>,
) -> Result<NcAttachment, String> {
    permissions::require_admin_or_quality_manager(current_user_id)?;

    let ext = std::path::Path::new(&source_file_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    validate_file_extension(&ext)?;

    let source = std::path::Path::new(&source_file_path);
    if !source.exists() { return Err("Source file does not exist".to_string()); }

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Clock error: {}", e))?
        .as_micros();
    let stored_filename = format!("{}_{}.{}", nc_record_id, ts, ext);

    let paths = storage::get_storage_paths()?;
    let dest = paths.uploads_nc.join(&stored_filename);
    std::fs::copy(source, &dest)
        .map_err(|e| format!("Failed to copy file: {}", e))?;

    let file_size = std::fs::metadata(&dest).map(|m| m.len() as i64).ok();
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
         VALUES ('nc', ?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
        params![nc_record_id, &original_file_name, &stored_filename, file_size, mime_type, current_user_id],
    )
    .map_err(|e| format!("Failed to record attachment: {}", e))?;

    let attachment_id = conn.last_insert_rowid();

    let activity_desc = match &note {
        Some(n) if !n.trim().is_empty() => format!("File attached: {} — {}", &original_file_name, n.trim()),
        _ => format!("File attached: {}", &original_file_name),
    };
    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('nc', ?1, 'ATTACHMENT_ADDED', ?2, ?3, datetime('now'))",
        params![nc_record_id, &activity_desc, current_user_id],
    );
    let _ = conn.execute(
        "UPDATE non_conformities SET updated_at = datetime('now') WHERE id = ?1",
        params![nc_record_id],
    );

    fetch_attachment(&conn, attachment_id)
}

#[tauri::command]
pub fn open_nc_attachment(current_user_id: i64, attachment_id: i64) -> Result<(), String> {
    permissions::require_authenticated(current_user_id)?;
    let conn = db::open_conn()?;
    let file_path: String = conn
        .query_row(
            "SELECT file_path FROM attachments WHERE id = ?1 AND module = 'nc'",
            params![attachment_id], |row| row.get(0),
        )
        .map_err(|_| "Attachment not found".to_string())?;
    let paths = storage::get_storage_paths()?;
    let full_path = paths.uploads_nc.join(&file_path);
    if !full_path.exists() {
        return Err("File not found on disk. It may have been moved or deleted.".to_string());
    }
    std::process::Command::new("cmd")
        .args(["/c", "start", "", &full_path.to_string_lossy()])
        .spawn()
        .map_err(|e| format!("Failed to open file: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn list_nc_attachments(
    current_user_id: i64,
    nc_record_id: i64,
) -> Result<Vec<NcAttachment>, String> {
    permissions::require_authenticated(current_user_id)?;
    let conn = db::open_conn()?;
    let mut stmt = conn.prepare(
        "SELECT a.id, a.file_name, a.file_path, a.file_size,
                a.uploaded_by, u.full_name, a.uploaded_at
         FROM attachments a
         LEFT JOIN users u ON a.uploaded_by = u.id
         WHERE a.module = 'nc' AND a.record_id = ?1
         ORDER BY a.uploaded_at DESC",
    )
    .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let attachments = stmt.query_map(params![nc_record_id], |row| {
        Ok(NcAttachment {
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

#[tauri::command]
pub fn get_non_conformity_activity(
    current_user_id: i64,
    nc_record_id: i64,
) -> Result<Vec<NcActivityEntry>, String> {
    permissions::require_authenticated(current_user_id)?;
    let conn = db::open_conn()?;
    let mut stmt = conn.prepare(
        "SELECT a.id, a.action, a.description,
                a.performed_by, u.full_name, a.performed_at
         FROM activity_log a
         LEFT JOIN users u ON a.performed_by = u.id
         WHERE a.module = 'nc' AND a.record_id = ?1
         ORDER BY a.performed_at DESC",
    )
    .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let entries = stmt.query_map(params![nc_record_id], |row| {
        Ok(NcActivityEntry {
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

// Fallback date helper (avoids chrono dependency — uses rusqlite to get date)
fn chrono_now_date() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let days = now / 86400;
    let year_approx = 1970 + days / 365;
    format!("{}-01-01", year_approx)
}
