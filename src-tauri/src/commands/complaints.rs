//! Customer complaints.
//!
//! A complaint carries BOTH a stable link to the customer master
//! (`customer_ref_id`) and a text snapshot of the customer's name and code as
//! they were when it was raised (`customer_name`, `customer_id`). That is not
//! redundancy: the link is what makes a complaint findable and filterable, and
//! the snapshot is what stops a later rename in the master from rewriting what a
//! controlled record says. Editing one must never change the other.
//!
//! Complaints raised before the customer master existed have the snapshot and no
//! link. They stay fully readable that way, and migration 012 attaches a link
//! only where the business code matches exactly.

use rusqlite::params;
use serde::Serialize;
use crate::{db, permissions, storage};

// ── Structs ──────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct ComplaintListItem {
    pub id: i64,
    pub complaint_number: String,
    pub customer_name: String,
    pub customer_id: String,
    pub title: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub received_date: String,
    pub status: String,
    pub priority: Option<String>,
    pub issued_by_user_id: Option<i64>,
    pub issued_by_name: Option<String>,
    pub root_cause: Option<String>,
    pub resolution: Option<String>,
    pub closed_at: Option<String>,
    pub created_by: Option<i64>,
    pub created_by_name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    // Cross-module links (Phase 8B)
    pub related_nc_id: Option<i64>,
    pub related_nc_number: Option<String>,
    pub related_capa_id: Option<i64>,
    pub related_capa_number: Option<String>,
    /// Stable link to the customer master. NULL for complaints raised before the
    /// master existed, or for a party that was never added to it - those keep
    /// only their text snapshot, which stays readable either way.
    pub customer_ref_id: Option<i64>,
    /// Whether that master record is still active, so the UI can mark it without
    /// a second round trip. NULL when there is no link.
    pub customer_ref_active: Option<bool>,
}

#[derive(Serialize)]
pub struct ComplaintAttachment {
    pub id: i64,
    pub file_name: String,
    pub file_path: String,
    pub file_size: Option<i64>,
    pub uploaded_by: Option<i64>,
    pub uploaded_by_name: Option<String>,
    pub uploaded_at: String,
}

#[derive(Serialize)]
pub struct ComplaintActivityEntry {
    pub id: i64,
    pub action: String,
    pub description: Option<String>,
    pub performed_by: Option<i64>,
    pub performed_by_name: Option<String>,
    pub performed_at: String,
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COMPLAINT_SQL: &str =
    "SELECT c.id, c.complaint_number, c.customer_name, c.customer_id,
            c.title, c.description, c.category,
            c.received_date, c.status, c.priority,
            c.assigned_to AS issued_by_user_id, au.full_name AS issued_by_name,
            c.root_cause, c.resolution, c.closed_at,
            c.created_by, cu.full_name AS created_by_name,
            c.created_at, c.updated_at,
            c.related_nc_id, cn.nc_number AS related_nc_number,
            c.related_capa_id, cc.capa_number AS related_capa_number,
            c.customer_ref_id, cm.is_active AS customer_ref_active
     FROM complaints c
     LEFT JOIN users au ON c.assigned_to = au.id
     LEFT JOIN users cu ON c.created_by = cu.id
     LEFT JOIN non_conformities cn ON c.related_nc_id = cn.id
     LEFT JOIN capas cc ON c.related_capa_id = cc.id
     LEFT JOIN customers cm ON c.customer_ref_id = cm.id";

// ── Validation helpers ────────────────────────────────────────────────────────

/// Resolve a selected customer into the (name, code) snapshot to store on the
/// complaint.
///
/// The snapshot is taken FROM THE MASTER, never from strings the caller supplied.
/// That is what makes "the typed Customer ID does not match the chosen customer"
/// unrepresentable: the client cannot send a code that disagrees with the id,
/// because the code it sends is not used at all when an id is present.
///
/// `allow_inactive_id` is the customer already on the record being edited. A
/// deactivated customer stays selectable for the complaint that already
/// references it — otherwise editing an unrelated field would force the user to
/// re-point a historical record at a different customer.
fn resolve_customer_snapshot(
    conn: &rusqlite::Connection,
    customer_ref_id: i64,
    allow_inactive_id: Option<i64>,
) -> Result<(String, String), String> {
    let (name, code, is_active): (String, String, i64) = conn
        .query_row(
            "SELECT customer_name, customer_code, is_active FROM customers WHERE id = ?1",
            params![customer_ref_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|_| "Selected customer not found".to_string())?;

    if is_active == 0 && allow_inactive_id != Some(customer_ref_id) {
        return Err(format!(
            "Customer '{}' ({}) is deactivated and cannot be selected for this complaint.",
            name, code
        ));
    }

    Ok((name, code))
}

fn validate_priority(p: &str) -> Result<(), String> {
    match p {
        "LOW" | "MEDIUM" | "HIGH" => Ok(()),
        _ => Err(format!("Invalid priority: {}. Must be LOW, MEDIUM, or HIGH", p)),
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

fn map_complaint_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ComplaintListItem> {
    Ok(ComplaintListItem {
        id:                 row.get(0)?,
        complaint_number:   row.get(1)?,
        customer_name:      row.get(2)?,
        customer_id:        row.get(3)?,
        title:              row.get(4)?,
        description:        row.get(5)?,
        category:           row.get(6)?,
        received_date:      row.get(7)?,
        status:             row.get(8)?,
        priority:           row.get(9)?,
        issued_by_user_id:  row.get(10)?,
        issued_by_name:     row.get(11)?,
        root_cause:         row.get(12)?,
        resolution:         row.get(13)?,
        closed_at:          row.get(14)?,
        created_by:         row.get(15)?,
        created_by_name:    row.get(16)?,
        created_at:         row.get(17)?,
        updated_at:         row.get(18)?,
        related_nc_id:      row.get(19)?,
        related_nc_number:  row.get(20)?,
        related_capa_id:    row.get(21)?,
        related_capa_number: row.get(22)?,
        // Appended at the end deliberately: every index above is positional, so a
        // column inserted mid-list would silently shift all of them.
        customer_ref_id:     row.get(23)?,
        customer_ref_active: row.get::<_, Option<i64>>(24)?.map(|v| v == 1),
    })
}

fn fetch_complaint(conn: &rusqlite::Connection, complaint_id: i64) -> Result<ComplaintListItem, String> {
    let sql = format!("{} WHERE c.id = ?1", COMPLAINT_SQL);
    conn.query_row(&sql, params![complaint_id], map_complaint_row)
        .map_err(|e| format!("Complaint not found: {}", e))
}

fn fetch_complaint_attachment(conn: &rusqlite::Connection, attachment_id: i64) -> Result<ComplaintAttachment, String> {
    conn.query_row(
        "SELECT a.id, a.file_name, a.file_path, a.file_size,
                a.uploaded_by, u.full_name AS uploaded_by_name, a.uploaded_at
         FROM attachments a
         LEFT JOIN users u ON a.uploaded_by = u.id
         WHERE a.id = ?1 AND a.module = 'complaint'",
        params![attachment_id],
        |row| {
            Ok(ComplaintAttachment {
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

fn get_complaint_prefix(conn: &rusqlite::Connection) -> String {
    let prefix: String = conn
        .query_row(
            "SELECT COALESCE(value, 'COMP') FROM settings WHERE key = 'complaint_prefix'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "COMP".to_string());
    if prefix.trim().is_empty() { "COMP".to_string() } else { prefix.trim().to_string() }
}

fn generate_complaint_number(conn: &rusqlite::Connection) -> Result<String, String> {
    let prefix = get_complaint_prefix(conn);
    let year: String = conn
        .query_row("SELECT strftime('%Y', 'now')", [], |row| row.get(0))
        .map_err(|e| format!("Failed to get current year: {}", e))?;
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM complaints WHERE complaint_number LIKE ?1",
            params![format!("{}-{}-%" , prefix, year)],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to count complaints for numbering: {}", e))?;
    Ok(format!("{}-{}-{:04}", prefix, year, count + 1))
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// List all complaints. Requires any authenticated user.
#[tauri::command]
pub fn list_complaints(current_user_id: i64) -> Result<Vec<ComplaintListItem>, String> {
    permissions::require_permission(current_user_id, "complaints.view")?;

    let conn = db::open_conn()?;
    let sql = format!("{} ORDER BY c.complaint_number ASC", COMPLAINT_SQL);
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let complaints = stmt
        .query_map([], map_complaint_row)
        .map_err(|e| format!("Failed to query complaints: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(complaints)
}

/// Get a single complaint by ID. Requires any authenticated user.
#[tauri::command]
pub fn get_complaint(current_user_id: i64, complaint_record_id: i64) -> Result<ComplaintListItem, String> {
    permissions::require_permission(current_user_id, "complaints.view")?;
    let conn = db::open_conn()?;
    fetch_complaint(&conn, complaint_record_id)
}

/// Create a new complaint with auto-generated complaint number. Requires Admin or QualityManager.
#[tauri::command]
pub fn create_complaint(
    current_user_id: i64,
    customer_ref_id: Option<i64>,
    customer_name: String,
    customer_id: String,
    title: String,
    description: Option<String>,
    category: Option<String>,
    received_date: String,
    priority: String,
    issued_by_user_id: Option<i64>,
    root_cause: Option<String>,
    resolution: Option<String>,
) -> Result<ComplaintListItem, String> {
    permissions::require_permission(current_user_id, "complaints.create")?;

    let conn = db::open_conn()?;

    // When a master customer is chosen, the stored text comes from that record.
    // The free-text arguments remain for complaints that predate the customer
    // master, or that reference a party never added to it.
    let (customer_name, customer_id_val) = match customer_ref_id {
        Some(ref_id) => resolve_customer_snapshot(&conn, ref_id, None)?,
        None => (customer_name.trim().to_string(), customer_id.trim().to_string()),
    };

    if customer_name.is_empty() {
        return Err("Customer name is required".to_string());
    }
    if customer_id_val.is_empty() {
        return Err("Customer ID is required".to_string());
    }
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("Complaint title is required".to_string());
    }
    let received_date = received_date.trim().to_string();
    if received_date.is_empty() {
        return Err("Received date is required".to_string());
    }
    validate_priority(&priority)?;

    // Validate issued_by user if provided
    if let Some(uid) = issued_by_user_id {
        let user_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM users WHERE id = ?1 AND is_active = 1",
                params![uid],
                |row| row.get::<_, i64>(0),
            )
            .map(|c| c > 0)
            .unwrap_or(false);
        if !user_exists {
            return Err("Issued by user not found or inactive".to_string());
        }
    }

    let complaint_number = generate_complaint_number(&conn)?;

    conn.execute(
        "INSERT INTO complaints
             (complaint_number, customer_name, customer_id, title, description, category,
              received_date, status, priority, assigned_to,
              root_cause, resolution, created_by, created_at, updated_at, customer_ref_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'OPEN', ?8, ?9, ?10, ?11, ?12,
                 datetime('now'), datetime('now'), ?13)",
        params![
            &complaint_number, &customer_name, &customer_id_val, &title, &description, &category,
            &received_date, &priority, &issued_by_user_id,
            &root_cause, &resolution, current_user_id, &customer_ref_id
        ],
    )
    .map_err(|e| format!("Failed to create complaint: {}", e))?;

    let id = conn.last_insert_rowid();

    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('complaint', ?1, 'CREATED', ?2, ?3, datetime('now'))",
        params![
            id,
            format!("Complaint created: {} — {} ({})", &complaint_number, &title, &customer_name),
            current_user_id
        ],
    );

    fetch_complaint(&conn, id)
}

/// Update complaint metadata. Requires Admin or QualityManager.
#[tauri::command]
pub fn update_complaint(
    current_user_id: i64,
    complaint_record_id: i64,
    customer_ref_id: Option<i64>,
    customer_name: String,
    customer_id: String,
    title: String,
    description: Option<String>,
    category: Option<String>,
    received_date: String,
    priority: String,
    issued_by_user_id: Option<i64>,
    root_cause: Option<String>,
    resolution: Option<String>,
) -> Result<ComplaintListItem, String> {
    permissions::require_permission(current_user_id, "complaints.edit")?;

    let conn = db::open_conn()?;

    // Whoever this complaint already points at stays selectable even if they have
    // since been deactivated, so editing the title of an old complaint cannot
    // force it onto a different customer.
    let existing_ref: Option<i64> = conn
        .query_row(
            "SELECT customer_ref_id FROM complaints WHERE id = ?1",
            params![complaint_record_id],
            |r| r.get(0),
        )
        .map_err(|_| "Complaint not found".to_string())?;

    let (customer_name, customer_id_val) = match customer_ref_id {
        Some(ref_id) => resolve_customer_snapshot(&conn, ref_id, existing_ref)?,
        None => (customer_name.trim().to_string(), customer_id.trim().to_string()),
    };

    if customer_name.is_empty() {
        return Err("Customer name is required".to_string());
    }
    if customer_id_val.is_empty() {
        return Err("Customer ID is required".to_string());
    }
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("Complaint title is required".to_string());
    }
    let received_date = received_date.trim().to_string();
    if received_date.is_empty() {
        return Err("Received date is required".to_string());
    }
    validate_priority(&priority)?;

    if let Some(uid) = issued_by_user_id {
        let user_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM users WHERE id = ?1 AND is_active = 1",
                params![uid],
                |row| row.get::<_, i64>(0),
            )
            .map(|c| c > 0)
            .unwrap_or(false);
        if !user_exists {
            return Err("Issued by user not found or inactive".to_string());
        }
    }

    conn.execute(
        "UPDATE complaints
         SET customer_name = ?1, customer_id = ?2, title = ?3, description = ?4,
             category = ?5, received_date = ?6, priority = ?7, assigned_to = ?8,
             root_cause = ?9, resolution = ?10, customer_ref_id = ?11,
             updated_at = datetime('now')
         WHERE id = ?12",
        params![
            &customer_name, &customer_id_val, &title, &description,
            &category, &received_date, &priority, &issued_by_user_id,
            &root_cause, &resolution, &customer_ref_id, complaint_record_id
        ],
    )
    .map_err(|e| format!("Failed to update complaint: {}", e))?;

    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('complaint', ?1, 'UPDATED', 'Complaint metadata updated', ?2, datetime('now'))",
        params![complaint_record_id, current_user_id],
    );

    fetch_complaint(&conn, complaint_record_id)
}

/// Change complaint status (OPEN / CLOSED). Requires Admin or QualityManager.
#[tauri::command]
pub fn set_complaint_status(
    current_user_id: i64,
    complaint_record_id: i64,
    status: String,
) -> Result<ComplaintListItem, String> {
    permissions::require_permission(current_user_id, "complaints.edit")?;

    match status.as_str() {
        "OPEN" | "CLOSED" => {}
        _ => return Err(format!("Invalid status: {}. Must be OPEN or CLOSED", status)),
    }

    let conn = db::open_conn()?;

    if status == "CLOSED" {
        conn.execute(
            "UPDATE complaints
             SET status = 'CLOSED', closed_at = datetime('now'), updated_at = datetime('now')
             WHERE id = ?1",
            params![complaint_record_id],
        )
        .map_err(|e| format!("Failed to close complaint: {}", e))?;

        let _ = conn.execute(
            "INSERT INTO activity_log
                 (module, record_id, action, description, performed_by, performed_at)
             VALUES ('complaint', ?1, 'CLOSED', 'Complaint closed', ?2, datetime('now'))",
            params![complaint_record_id, current_user_id],
        );
    } else {
        conn.execute(
            "UPDATE complaints
             SET status = 'OPEN', closed_at = NULL, updated_at = datetime('now')
             WHERE id = ?1",
            params![complaint_record_id],
        )
        .map_err(|e| format!("Failed to reopen complaint: {}", e))?;

        let _ = conn.execute(
            "INSERT INTO activity_log
                 (module, record_id, action, description, performed_by, performed_at)
             VALUES ('complaint', ?1, 'REOPENED', 'Complaint reopened', ?2, datetime('now'))",
            params![complaint_record_id, current_user_id],
        );
    }

    fetch_complaint(&conn, complaint_record_id)
}

/// Get activity log entries for a complaint. Requires any authenticated user.
#[tauri::command]
pub fn get_complaint_activity(
    current_user_id: i64,
    complaint_record_id: i64,
) -> Result<Vec<ComplaintActivityEntry>, String> {
    permissions::require_permission(current_user_id, "complaints.view")?;

    let conn = db::open_conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.action, a.description,
                    a.performed_by, u.full_name AS performed_by_name, a.performed_at
             FROM activity_log a
             LEFT JOIN users u ON a.performed_by = u.id
             WHERE a.module = 'complaint' AND a.record_id = ?1
             ORDER BY a.performed_at DESC",
        )
        .map_err(|e| format!("Failed to prepare activity query: {}", e))?;

    let entries = stmt
        .query_map(params![complaint_record_id], |row| {
            Ok(ComplaintActivityEntry {
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

/// Attach a file to a complaint. Validates extension, copies to uploads/complaints/, logs activity.
/// Requires Admin or QualityManager.
#[tauri::command]
pub fn attach_complaint_file(
    current_user_id: i64,
    complaint_record_id: i64,
    source_file_path: String,
    original_file_name: String,
    note: Option<String>,
) -> Result<ComplaintAttachment, String> {
    permissions::require_permission(current_user_id, "complaints.attach")?;

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
    let stored_filename = format!("{}_{}.{}", complaint_record_id, timestamp_micros, ext);

    let paths = storage::get_storage_paths()?;
    let dest_path = paths.uploads_complaints.join(&stored_filename);
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
         VALUES ('complaint', ?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
        params![
            complaint_record_id, &original_file_name, &stored_filename,
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
         VALUES ('complaint', ?1, 'ATTACHMENT_ADDED', ?2, ?3, datetime('now'))",
        params![complaint_record_id, &activity_desc, current_user_id],
    );

    let _ = conn.execute(
        "UPDATE complaints SET updated_at = datetime('now') WHERE id = ?1",
        params![complaint_record_id],
    );

    fetch_complaint_attachment(&conn, attachment_id)
}

/// Open a complaint attachment file using the Windows default application.
/// Requires any authenticated user.
#[tauri::command]
pub fn open_complaint_attachment(current_user_id: i64, attachment_id: i64) -> Result<(), String> {
    permissions::require_permission(current_user_id, "complaints.view")?;

    let conn = db::open_conn()?;
    let file_path: String = conn
        .query_row(
            "SELECT file_path FROM attachments WHERE id = ?1 AND module = 'complaint'",
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
    let real = storage::resolve_managed_file(&paths.uploads_complaints, &file_path)?;

    std::process::Command::new("cmd")
        .arg("/c")
        .arg("start")
        .arg("")
        .arg(real.as_os_str())
        .spawn()
        .map_err(|e| format!("Failed to open file: {}", e))?;

    Ok(())
}

/// List all attachments for a complaint. Requires any authenticated user.
#[tauri::command]
pub fn list_complaint_attachments(
    current_user_id: i64,
    complaint_record_id: i64,
) -> Result<Vec<ComplaintAttachment>, String> {
    permissions::require_permission(current_user_id, "complaints.view")?;

    let conn = db::open_conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.file_name, a.file_path, a.file_size,
                    a.uploaded_by, u.full_name AS uploaded_by_name, a.uploaded_at
             FROM attachments a
             LEFT JOIN users u ON a.uploaded_by = u.id
             WHERE a.module = 'complaint' AND a.record_id = ?1
             ORDER BY a.uploaded_at DESC",
        )
        .map_err(|e| format!("Failed to prepare attachment query: {}", e))?;

    let attachments = stmt
        .query_map(params![complaint_record_id], |row| {
            Ok(ComplaintAttachment {
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

// ── Cross-module workflow commands (Phase 8B) ─────────────────────────────────

/// Create a Non-Conformity from a Complaint.
/// Duplicate prevented: if related_nc_id is already set, returns an error.
/// Requires Admin or QualityManager.
#[tauri::command]
pub fn create_nc_from_complaint(
    current_user_id: i64,
    complaint_record_id: i64,
) -> Result<ComplaintListItem, String> {
    permissions::require_permission(current_user_id, "nc.create")?;

    let conn = db::open_conn()?;

    let (complaint_number, customer_name, customer_id, comp_title, already_nc_id):
        (String, String, String, String, Option<i64>) = conn
        .query_row(
            "SELECT complaint_number, customer_name, customer_id, title, related_nc_id
             FROM complaints WHERE id = ?1",
            params![complaint_record_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .map_err(|_| "Complaint not found".to_string())?;

    if already_nc_id.is_some() {
        return Err(
            "A Non-Conformity already exists for this Complaint. Duplicate NC creation is not allowed.".to_string(),
        );
    }

    // Generate NC number
    let nc_prefix: String = conn
        .query_row(
            "SELECT COALESCE(value, 'NC') FROM settings WHERE key = 'nc_prefix'",
            [], |row| row.get(0),
        )
        .unwrap_or_else(|_| "NC".to_string());
    let nc_prefix = if nc_prefix.trim().is_empty() { "NC".to_string() } else { nc_prefix.trim().to_string() };

    let year: String = conn
        .query_row("SELECT strftime('%Y', 'now')", [], |row| row.get(0))
        .map_err(|e| format!("Failed to get year: {}", e))?;
    let nc_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM non_conformities WHERE nc_number LIKE ?1",
            params![format!("{}-{}-%" , nc_prefix, year)],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to count NCs: {}", e))?;
    let nc_number = format!("{}-{}-{:04}", nc_prefix, year, nc_count + 1);

    let nc_title_raw = format!(
        "NC from Complaint {} — {} ({}, {})",
        &complaint_number, &comp_title, &customer_name, &customer_id
    );
    let nc_title = if nc_title_raw.len() > 250 {
        format!("{}...", &nc_title_raw[..247])
    } else {
        nc_title_raw
    };

    conn.execute(
        "INSERT INTO non_conformities
             (nc_number, title, source, source_id,
              severity, status, detected_date, created_by, created_at, updated_at)
         VALUES (?1, ?2, 'CUSTOMER_COMPLAINT', ?3, 'MEDIUM', 'OPEN', date('now'), ?4,
                 datetime('now'), datetime('now'))",
        params![&nc_number, &nc_title, complaint_record_id, current_user_id],
    )
    .map_err(|e| format!("Failed to create Non-Conformity: {}", e))?;

    let nc_id = conn.last_insert_rowid();

    conn.execute(
        "UPDATE complaints SET related_nc_id = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![nc_id, complaint_record_id],
    )
    .map_err(|e| format!("Failed to link NC to Complaint: {}", e))?;

    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('complaint', ?1, 'NC_CREATED', ?2, ?3, datetime('now'))",
        params![
            complaint_record_id,
            format!("Non-Conformity {} created from this Complaint", &nc_number),
            current_user_id
        ],
    );

    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('nc', ?1, 'CREATED', ?2, ?3, datetime('now'))",
        params![
            nc_id,
            format!(
                "NC {} created from Complaint {} ({}, {})",
                &nc_number, &complaint_number, &customer_name, &customer_id
            ),
            current_user_id
        ],
    );

    fetch_complaint(&conn, complaint_record_id)
}

/// Create a CAPA from a Complaint.
/// Duplicate prevented: if related_capa_id is already set, returns an error.
/// Requires Admin or QualityManager.
#[tauri::command]
pub fn create_capa_from_complaint(
    current_user_id: i64,
    complaint_record_id: i64,
) -> Result<ComplaintListItem, String> {
    permissions::require_permission(current_user_id, "capa.create")?;

    let conn = db::open_conn()?;

    let (complaint_number, customer_name, customer_id, comp_title, already_capa_id):
        (String, String, String, String, Option<i64>) = conn
        .query_row(
            "SELECT complaint_number, customer_name, customer_id, title, related_capa_id
             FROM complaints WHERE id = ?1",
            params![complaint_record_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .map_err(|_| "Complaint not found".to_string())?;

    if already_capa_id.is_some() {
        return Err(
            "A CAPA already exists for this Complaint. Duplicate CAPA creation is not allowed.".to_string(),
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

    let capa_title_raw = format!(
        "CAPA for Complaint {} — {} ({}, {})",
        &complaint_number, &comp_title, &customer_name, &customer_id
    );
    let capa_title = if capa_title_raw.len() > 250 {
        format!("{}...", &capa_title_raw[..247])
    } else {
        capa_title_raw
    };

    conn.execute(
        "INSERT INTO capas
             (capa_number, title, type, source, source_id, status, created_by,
              created_at, updated_at)
         VALUES (?1, ?2, 'CORRECTIVE', 'COMPLAINT', ?3, 'OPEN', ?4,
                 datetime('now'), datetime('now'))",
        params![&capa_number, &capa_title, complaint_record_id, current_user_id],
    )
    .map_err(|e| format!("Failed to create CAPA: {}", e))?;

    let capa_id = conn.last_insert_rowid();

    conn.execute(
        "UPDATE complaints SET related_capa_id = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![capa_id, complaint_record_id],
    )
    .map_err(|e| format!("Failed to link CAPA to Complaint: {}", e))?;

    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('complaint', ?1, 'CAPA_CREATED', ?2, ?3, datetime('now'))",
        params![
            complaint_record_id,
            format!("CAPA {} created from this Complaint", &capa_number),
            current_user_id
        ],
    );

    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('capa', ?1, 'CREATED', ?2, ?3, datetime('now'))",
        params![
            capa_id,
            format!(
                "CAPA {} created from Complaint {} ({}, {})",
                &capa_number, &complaint_number, &customer_name, &customer_id
            ),
            current_user_id
        ],
    );

    fetch_complaint(&conn, complaint_record_id)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod customer_link_tests {
    use super::resolve_customer_snapshot;
    use rusqlite::Connection;

    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE customers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_code TEXT NOT NULL UNIQUE,
                customer_name TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1);
             INSERT INTO customers (id, customer_code, customer_name, is_active) VALUES
                (1, 'CUST-001', 'Contoso Medical', 1),
                (2, 'CUST-002', 'Former Client',   0);",
        )
        .unwrap();
        c
    }

    /// THE POINT OF THE WHOLE CHANGE.
    ///
    /// The old form had Customer Name and Customer ID as two unrelated text
    /// boxes, so a complaint could carry one customer's name and another's code.
    /// The snapshot is now read from the master row, so the caller's strings are
    /// not consulted at all — a mismatch is unrepresentable rather than merely
    /// discouraged by the UI.
    #[test]
    fn the_snapshot_comes_from_the_master_not_from_the_caller() {
        let c = db();
        let (name, code) = resolve_customer_snapshot(&c, 1, None).unwrap();
        assert_eq!(name, "Contoso Medical");
        assert_eq!(code, "CUST-001", "the code is derived, so it always matches the customer");
    }

    #[test]
    fn an_unknown_customer_is_refused() {
        let c = db();
        assert!(resolve_customer_snapshot(&c, 999, None).is_err());
    }

    /// A deactivated customer must not be attachable to a NEW complaint.
    #[test]
    fn a_deactivated_customer_cannot_be_chosen_for_a_new_complaint() {
        let c = db();
        let err = resolve_customer_snapshot(&c, 2, None).unwrap_err();
        assert!(err.contains("deactivated"), "the refusal should say why: {}", err);
    }

    /// …but the complaint that ALREADY references it must still be editable.
    /// Otherwise changing an old complaint's title would force it onto a
    /// different customer, falsifying a controlled record.
    #[test]
    fn a_deactivated_customer_survives_an_edit_of_the_complaint_that_uses_it() {
        let c = db();
        let (name, code) = resolve_customer_snapshot(&c, 2, Some(2))
            .expect("the customer already on this record stays valid");
        assert_eq!(name, "Former Client");
        assert_eq!(code, "CUST-002");
    }

    /// The exemption is scoped to that one customer — it is not a general
    /// "editing lets you pick anything" hole.
    #[test]
    fn editing_does_not_unlock_other_deactivated_customers() {
        let c = db();
        c.execute(
            "INSERT INTO customers (id, customer_code, customer_name, is_active)
             VALUES (3, 'CUST-003', 'Another Dormant Co', 0)",
            [],
        )
        .unwrap();

        // Editing a complaint whose customer is 2 must not permit switching to 3.
        assert!(
            resolve_customer_snapshot(&c, 3, Some(2)).is_err(),
            "only the customer already on the record is exempt",
        );
    }

    /// Renaming the master afterwards changes what a NEW complaint would record,
    /// and nothing else — the stored snapshot of an existing one is not consulted
    /// here at all.
    #[test]
    fn a_later_master_rename_only_affects_the_next_snapshot() {
        let c = db();
        let (before, _) = resolve_customer_snapshot(&c, 1, None).unwrap();
        c.execute(
            "UPDATE customers SET customer_name = 'Contoso Medical GmbH' WHERE id = 1",
            [],
        )
        .unwrap();
        let (after, code) = resolve_customer_snapshot(&c, 1, None).unwrap();

        assert_eq!(before, "Contoso Medical");
        assert_eq!(after, "Contoso Medical GmbH");
        assert_eq!(code, "CUST-001", "the code did not change, so history stays traceable");
    }
}
