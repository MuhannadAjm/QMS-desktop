use rusqlite::params;
use serde::Serialize;
use crate::{db, permissions, storage};

#[derive(Serialize)]
pub struct DocumentListItem {
    pub id: i64,
    pub doc_number: String,
    pub title: String,
    pub category: String,
    pub status: String,
    pub version: String,
    pub revision_date: Option<String>,
    pub effective_date: Option<String>,
    pub owner_id: Option<i64>,
    pub owner_name: Option<String>,
    pub file_path: Option<String>,
    pub original_file_name: Option<String>,
    pub description: Option<String>,
    pub created_by: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
pub struct DocumentRevision {
    pub id: i64,
    pub document_id: i64,
    pub version: String,
    pub change_summary: Option<String>,
    pub file_path: Option<String>,
    pub original_file_name: Option<String>,
    pub revised_by: Option<i64>,
    pub revised_by_name: Option<String>,
    pub revised_at: String,
}

#[derive(Serialize)]
pub struct ActivityEntry {
    pub id: i64,
    pub action: String,
    pub description: Option<String>,
    pub performed_by: Option<i64>,
    pub performed_by_name: Option<String>,
    pub performed_at: String,
}

fn validate_status(status: &str) -> Result<(), String> {
    match status {
        "UNDER PROCESS" | "CONTROLLED" | "OBSOLETE" => Ok(()),
        _ => Err(format!(
            "Invalid status: {}. Must be UNDER PROCESS, CONTROLLED, or OBSOLETE",
            status
        )),
    }
}

fn validate_document_type(category: &str) -> Result<(), String> {
    match category {
        "Policy" | "Procedure" | "Work Instruction" | "Form"
        | "Manual" | "Record" | "Specification" | "Other" => Ok(()),
        _ => Err(format!("Invalid document type: {}", category)),
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

fn get_document_prefix(conn: &rusqlite::Connection) -> String {
    let prefix: String = conn
        .query_row(
            "SELECT COALESCE(value, 'DOC') FROM settings WHERE key = 'document_prefix'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "DOC".to_string());
    if prefix.trim().is_empty() { "DOC".to_string() } else { prefix.trim().to_string() }
}

fn generate_doc_number(conn: &rusqlite::Connection) -> Result<String, String> {
    let prefix = get_document_prefix(conn);
    let year: String = conn
        .query_row("SELECT strftime('%Y', 'now')", [], |row| row.get(0))
        .map_err(|e| format!("Failed to get current year: {}", e))?;
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM documents WHERE doc_number LIKE ?1",
            params![format!("{}-{}-%" , prefix, year)],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to count documents for numbering: {}", e))?;
    Ok(format!("{}-{}-{:04}", prefix, year, count + 1))
}

fn fetch_document(conn: &rusqlite::Connection, document_id: i64) -> Result<DocumentListItem, String> {
    conn.query_row(
        "SELECT d.id, d.doc_number, d.title, COALESCE(d.category, '') AS category,
                d.status, d.version,
                d.revision_date, d.effective_date,
                d.owner_id, u.full_name AS owner_name,
                d.file_path, d.original_file_name,
                d.description, d.created_by, d.created_at, d.updated_at
         FROM documents d
         LEFT JOIN users u ON d.owner_id = u.id
         WHERE d.id = ?1",
        params![document_id],
        |row| {
            Ok(DocumentListItem {
                id:                 row.get(0)?,
                doc_number:         row.get(1)?,
                title:              row.get(2)?,
                category:           row.get(3)?,
                status:             row.get(4)?,
                version:            row.get(5)?,
                revision_date:      row.get(6)?,
                effective_date:     row.get(7)?,
                owner_id:           row.get(8)?,
                owner_name:         row.get(9)?,
                file_path:          row.get(10)?,
                original_file_name: row.get(11)?,
                description:        row.get(12)?,
                created_by:         row.get(13)?,
                created_at:         row.get(14)?,
                updated_at:         row.get(15)?,
            })
        },
    )
    .map_err(|e| format!("Document not found: {}", e))
}

/// List all documents. Requires any authenticated user.
#[tauri::command]
pub fn list_documents(current_user_id: i64) -> Result<Vec<DocumentListItem>, String> {
    permissions::require_authenticated(current_user_id)?;

    let conn = db::open_conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT d.id, d.doc_number, d.title, COALESCE(d.category, '') AS category,
                    d.status, d.version,
                    d.revision_date, d.effective_date,
                    d.owner_id, u.full_name AS owner_name,
                    d.file_path, d.original_file_name,
                    d.description, d.created_by, d.created_at, d.updated_at
             FROM documents d
             LEFT JOIN users u ON d.owner_id = u.id
             ORDER BY d.doc_number ASC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let docs = stmt
        .query_map([], |row| {
            Ok(DocumentListItem {
                id:                 row.get(0)?,
                doc_number:         row.get(1)?,
                title:              row.get(2)?,
                category:           row.get(3)?,
                status:             row.get(4)?,
                version:            row.get(5)?,
                revision_date:      row.get(6)?,
                effective_date:     row.get(7)?,
                owner_id:           row.get(8)?,
                owner_name:         row.get(9)?,
                file_path:          row.get(10)?,
                original_file_name: row.get(11)?,
                description:        row.get(12)?,
                created_by:         row.get(13)?,
                created_at:         row.get(14)?,
                updated_at:         row.get(15)?,
            })
        })
        .map_err(|e| format!("Failed to query documents: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(docs)
}

/// Get a single document by ID. Requires any authenticated user.
#[tauri::command]
pub fn get_document(current_user_id: i64, document_id: i64) -> Result<DocumentListItem, String> {
    permissions::require_authenticated(current_user_id)?;
    let conn = db::open_conn()?;
    fetch_document(&conn, document_id)
}

/// Create a new document with auto-generated doc_number. Requires Admin or QualityManager.
#[tauri::command]
pub fn create_document(
    current_user_id: i64,
    title: String,
    document_type: String,
    version: String,
    owner_user_id: Option<i64>,
    approval_date: Option<String>,
    description: Option<String>,
) -> Result<DocumentListItem, String> {
    permissions::require_admin_or_quality_manager(current_user_id)?;

    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("Title is required".to_string());
    }
    validate_document_type(&document_type)?;

    let version = {
        let v = version.trim().to_string();
        if v.is_empty() { "1.0".to_string() } else { v }
    };

    let conn = db::open_conn()?;
    let doc_number = generate_doc_number(&conn)?;

    conn.execute(
        "INSERT INTO documents
             (doc_number, title, category, status, version,
              effective_date, owner_id, description, created_by, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'UNDER PROCESS', ?4, ?5, ?6, ?7, ?8,
                 datetime('now'), datetime('now'))",
        params![
            &doc_number, &title, &document_type, &version,
            &approval_date, &owner_user_id, &description, current_user_id
        ],
    )
    .map_err(|e| format!("Failed to create document: {}", e))?;

    let id = conn.last_insert_rowid();

    let _ = conn.execute(
        "INSERT INTO document_revisions
             (document_id, version, change_summary, revised_by, revised_at)
         VALUES (?1, ?2, 'Initial creation', ?3, datetime('now'))",
        params![id, &version, current_user_id],
    );

    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('documents', ?1, 'CREATED', ?2, ?3, datetime('now'))",
        params![
            id,
            format!("Document created: {} — {}", &doc_number, &title),
            current_user_id
        ],
    );

    fetch_document(&conn, id)
}

/// Update document metadata. Creates a revision entry if version changes. Requires Admin or QM.
#[tauri::command]
pub fn update_document(
    current_user_id: i64,
    document_id: i64,
    title: String,
    document_type: String,
    version: String,
    owner_user_id: Option<i64>,
    approval_date: Option<String>,
    description: Option<String>,
) -> Result<DocumentListItem, String> {
    permissions::require_admin_or_quality_manager(current_user_id)?;

    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("Title is required".to_string());
    }
    validate_document_type(&document_type)?;

    let version = {
        let v = version.trim().to_string();
        if v.is_empty() { "1.0".to_string() } else { v }
    };

    let conn = db::open_conn()?;

    let old_version: String = conn
        .query_row(
            "SELECT version FROM documents WHERE id = ?1",
            params![document_id],
            |row| row.get(0),
        )
        .map_err(|_| "Document not found".to_string())?;

    conn.execute(
        "UPDATE documents
         SET title = ?1, category = ?2, version = ?3,
             effective_date = ?4, owner_id = ?5, description = ?6,
             updated_at = datetime('now')
         WHERE id = ?7",
        params![&title, &document_type, &version, &approval_date, &owner_user_id, &description, document_id],
    )
    .map_err(|e| format!("Failed to update document: {}", e))?;

    if version != old_version {
        let _ = conn.execute(
            "INSERT INTO document_revisions
                 (document_id, version, change_summary, revised_by, revised_at)
             VALUES (?1, ?2, 'Version updated', ?3, datetime('now'))",
            params![document_id, &version, current_user_id],
        );
    }

    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('documents', ?1, 'UPDATED', 'Document metadata updated', ?2, datetime('now'))",
        params![document_id, current_user_id],
    );

    fetch_document(&conn, document_id)
}

/// Change document status (UNDER PROCESS / CONTROLLED / OBSOLETE). Requires Admin or QM.
#[tauri::command]
pub fn set_document_status(
    current_user_id: i64,
    document_id: i64,
    status: String,
) -> Result<DocumentListItem, String> {
    permissions::require_admin_or_quality_manager(current_user_id)?;
    validate_status(&status)?;

    let conn = db::open_conn()?;

    conn.execute(
        "UPDATE documents
         SET status = ?1, revision_date = datetime('now'), updated_at = datetime('now')
         WHERE id = ?2",
        params![&status, document_id],
    )
    .map_err(|e| format!("Failed to update status: {}", e))?;

    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('documents', ?1, 'STATUS_CHANGED', ?2, ?3, datetime('now'))",
        params![document_id, format!("Status changed to {}", &status), current_user_id],
    );

    fetch_document(&conn, document_id)
}

/// Attach or replace the file for a document. Copies the file to uploads/documents/.
/// Requires Admin or QualityManager.
#[tauri::command]
pub fn attach_document_file(
    current_user_id: i64,
    document_id: i64,
    source_path: String,
    original_file_name: String,
    change_summary: Option<String>,
) -> Result<DocumentListItem, String> {
    permissions::require_admin_or_quality_manager(current_user_id)?;

    let ext = std::path::Path::new(&source_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    validate_file_extension(&ext)?;

    let source = std::path::Path::new(&source_path);
    if !source.exists() {
        return Err("Source file does not exist".to_string());
    }

    let since_epoch = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Clock error: {}", e))?;
    let timestamp_micros = since_epoch.as_micros();
    let stored_filename = format!("{}_{}.{}", document_id, timestamp_micros, ext);

    let paths = storage::get_storage_paths()?;
    let dest_path = paths.uploads_documents.join(&stored_filename);
    std::fs::copy(source, &dest_path)
        .map_err(|e| format!("Failed to copy file to storage: {}", e))?;

    let conn = db::open_conn()?;

    let current_version: String = conn
        .query_row(
            "SELECT version FROM documents WHERE id = ?1",
            params![document_id],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "1.0".to_string());

    conn.execute(
        "UPDATE documents
         SET file_path = ?1, original_file_name = ?2, updated_at = datetime('now')
         WHERE id = ?3",
        params![&stored_filename, &original_file_name, document_id],
    )
    .map_err(|e| format!("Failed to update document file: {}", e))?;

    let summary = change_summary
        .unwrap_or_else(|| format!("File attached: {}", &original_file_name));

    let _ = conn.execute(
        "INSERT INTO document_revisions
             (document_id, version, change_summary, file_path, original_file_name, revised_by, revised_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
        params![
            document_id, &current_version, &summary,
            &stored_filename, &original_file_name, current_user_id
        ],
    );

    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('documents', ?1, 'FILE_ATTACHED', ?2, ?3, datetime('now'))",
        params![
            document_id,
            format!("File attached: {}", &original_file_name),
            current_user_id
        ],
    );

    fetch_document(&conn, document_id)
}

/// List revision history for a document. Requires any authenticated user.
#[tauri::command]
pub fn list_document_revisions(
    current_user_id: i64,
    document_id: i64,
) -> Result<Vec<DocumentRevision>, String> {
    permissions::require_authenticated(current_user_id)?;

    let conn = db::open_conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT dr.id, dr.document_id, dr.version, dr.change_summary,
                    dr.file_path, dr.original_file_name,
                    dr.revised_by, u.full_name AS revised_by_name, dr.revised_at
             FROM document_revisions dr
             LEFT JOIN users u ON dr.revised_by = u.id
             WHERE dr.document_id = ?1
             ORDER BY dr.revised_at DESC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let revisions = stmt
        .query_map(params![document_id], |row| {
            Ok(DocumentRevision {
                id:                 row.get(0)?,
                document_id:        row.get(1)?,
                version:            row.get(2)?,
                change_summary:     row.get(3)?,
                file_path:          row.get(4)?,
                original_file_name: row.get(5)?,
                revised_by:         row.get(6)?,
                revised_by_name:    row.get(7)?,
                revised_at:         row.get(8)?,
            })
        })
        .map_err(|e| format!("Failed to query revisions: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(revisions)
}

/// Get activity log entries for a document. Requires any authenticated user.
#[tauri::command]
pub fn get_document_activity(
    current_user_id: i64,
    document_id: i64,
) -> Result<Vec<ActivityEntry>, String> {
    permissions::require_authenticated(current_user_id)?;

    let conn = db::open_conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.action, a.description,
                    a.performed_by, u.full_name AS performed_by_name, a.performed_at
             FROM activity_log a
             LEFT JOIN users u ON a.performed_by = u.id
             WHERE a.module = 'documents' AND a.record_id = ?1
             ORDER BY a.performed_at DESC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let entries = stmt
        .query_map(params![document_id], |row| {
            Ok(ActivityEntry {
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

/// Open the attached file using the OS default application (Windows only).
/// Requires any authenticated user.
#[tauri::command]
pub fn open_document_file(current_user_id: i64, document_id: i64) -> Result<(), String> {
    permissions::require_authenticated(current_user_id)?;

    let conn = db::open_conn()?;
    let file_path: Option<String> = conn
        .query_row(
            "SELECT file_path FROM documents WHERE id = ?1",
            params![document_id],
            |row| row.get(0),
        )
        .map_err(|_| "Document not found".to_string())?;

    let stored_filename = file_path
        .ok_or_else(|| "No file is attached to this document".to_string())?;

    let paths = storage::get_storage_paths()?;
    let full_path = paths.uploads_documents.join(&stored_filename);

    if !full_path.exists() {
        return Err("File not found on disk. It may have been moved or deleted.".to_string());
    }

    let path_str = full_path.to_string_lossy().to_string();

    // Open with Windows default application via cmd /c start
    std::process::Command::new("cmd")
        .arg("/c")
        .arg("start")
        .arg("")  // window title (required when path contains spaces)
        .arg(&path_str)
        .spawn()
        .map_err(|e| format!("Failed to open file: {}", e))?;

    Ok(())
}
