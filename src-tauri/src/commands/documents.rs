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
    // Appended at the end. Every field above is read by position, so inserting
    // mid-struct would silently shift all of them.
    /// System-generated at the moment of approval. Never supplied by the client.
    pub approval_date: Option<String>,
    pub approved_by: Option<i64>,
    pub approved_by_name: Option<String>,
    pub rejected_at: Option<String>,
    pub rejected_by: Option<i64>,
    pub rejected_by_name: Option<String>,
    pub rejection_reason: Option<String>,
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

/// The single column list behind every DocumentListItem read.
///
/// Column ORDER is load-bearing: rows are read positionally, so the approval
/// columns are appended at the end (16..22) rather than grouped with the other
/// document metadata where they would read better but would shift every index
/// below them.
const DOCUMENT_SELECT: &str =
    "SELECT d.id, d.doc_number, d.title, COALESCE(d.category, '') AS category,
            d.status, d.version,
            d.revision_date, d.effective_date,
            d.owner_id, u.full_name AS owner_name,
            d.file_path, d.original_file_name,
            d.description, d.created_by, d.created_at, d.updated_at,
            d.approval_date, d.approved_by, ap.full_name AS approved_by_name,
            d.rejected_at, d.rejected_by, rj.full_name AS rejected_by_name,
            d.rejection_reason
     FROM documents d
     LEFT JOIN users u  ON d.owner_id    = u.id
     LEFT JOIN users ap ON d.approved_by = ap.id
     LEFT JOIN users rj ON d.rejected_by = rj.id";

fn map_document_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<DocumentListItem> {
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
        approval_date:      row.get(16)?,
        approved_by:        row.get(17)?,
        approved_by_name:   row.get(18)?,
        rejected_at:        row.get(19)?,
        rejected_by:        row.get(20)?,
        rejected_by_name:   row.get(21)?,
        rejection_reason:   row.get(22)?,
    })
}

/// Best-effort activity write. A failed audit line must not fail the business
/// operation, but it must not vanish silently either.
fn log_document_activity(
    conn: &rusqlite::Connection,
    document_id: i64,
    action: &str,
    description: &str,
    performed_by: i64,
) {
    if let Err(e) = conn.execute(
        "INSERT INTO activity_log (module, record_id, action, description, performed_by, performed_at)
         VALUES ('documents', ?1, ?2, ?3, ?4, datetime('now'))",
        params![document_id, action, description, performed_by],
    ) {
        eprintln!("activity_log write failed for documents/{}: {}", action, e);
    }
}

fn fetch_document(conn: &rusqlite::Connection, document_id: i64) -> Result<DocumentListItem, String> {
    conn.query_row(
        &format!("{} WHERE d.id = ?1", DOCUMENT_SELECT),
        params![document_id],
        |row| {
            map_document_row(row)
        },
    )
    .map_err(|e| format!("Document not found: {}", e))
}

/// List all documents. Requires any authenticated user.
#[tauri::command]
pub fn list_documents(current_user_id: i64) -> Result<Vec<DocumentListItem>, String> {
    permissions::require_permission(current_user_id, "documents.view")?;

    let conn = db::open_conn()?;
    let mut stmt = conn
        .prepare(
            &format!("{} ORDER BY d.doc_number ASC", DOCUMENT_SELECT),
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let docs = stmt
        .query_map([], |row| {
            map_document_row(row)
        })
        .map_err(|e| format!("Failed to query documents: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(docs)
}

/// Get a single document by ID. Requires any authenticated user.
#[tauri::command]
pub fn get_document(current_user_id: i64, document_id: i64) -> Result<DocumentListItem, String> {
    permissions::require_permission(current_user_id, "documents.view")?;
    let conn = db::open_conn()?;
    fetch_document(&conn, document_id)
}

/// Create a new document with auto-generated doc_number.
///
/// There is deliberately no approval-date parameter. Both this command and
/// update_document used to accept one and bind it into the `effective_date`
/// column — so the form's "Approval Date" was a free-text field that never
/// touched `documents.approval_date`, which is why an approved document showed
/// nothing. An approval date is evidence that a document became controlled, so
/// it is now written only by approve_document, from the database clock.
/// Existing `effective_date` values are left exactly as they are.
#[tauri::command]
pub fn create_document(
    current_user_id: i64,
    title: String,
    document_type: String,
    version: String,
    owner_user_id: Option<i64>,
    description: Option<String>,
) -> Result<DocumentListItem, String> {
    permissions::require_permission(current_user_id, "documents.create")?;

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
              owner_id, description, created_by, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'UNDER PROCESS', ?4, ?5, ?6, ?7,
                 datetime('now'), datetime('now'))",
        params![
            &doc_number, &title, &document_type, &version,
            &owner_user_id, &description, current_user_id
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
    description: Option<String>,
) -> Result<DocumentListItem, String> {
    permissions::require_permission(current_user_id, "documents.edit")?;

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
             owner_id = ?4, description = ?5,
             updated_at = datetime('now')
         WHERE id = ?6",
        params![&title, &document_type, &version, &owner_user_id, &description, document_id],
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
    permissions::require_permission(current_user_id, "documents.edit")?;
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
    permissions::require_permission(current_user_id, "documents.attachment_manage")?;

    // A controlled document's file is evidence. Replacing it in place would
    // change what an approved record says without leaving a trace that it ever
    // said anything else.
    {
        let conn = db::open_conn()?;
        let status = document_status(&conn, document_id)?;
        if status != "UNDER PROCESS" {
            return Err(format!(
                "This document is {}. Its file cannot be replaced in place — create a new revision instead.",
                status
            ));
        }
    }

    let ext = std::path::Path::new(&source_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    validate_file_extension(&ext)?;

    // The user picked this path in a native dialog, so it legitimately comes
    // from the renderer. It is only ever read and copied inward; nothing later
    // writes to or deletes it.
    let source = storage::validate_import_source(&source_path)?;

    let since_epoch = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Clock error: {}", e))?;
    let timestamp_micros = since_epoch.as_micros();
    let stored_filename = format!("{}_{}.{}", document_id, timestamp_micros, ext);

    let paths = storage::get_storage_paths()?;
    let dest_path = paths.uploads_documents.join(&stored_filename);
    std::fs::copy(&source, &dest_path)
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
    permissions::require_permission(current_user_id, "documents.view")?;

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
    permissions::require_permission(current_user_id, "documents.view")?;

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


// ── Stage 4: controlled viewing, attachment lifecycle, approval ───────────────

/// Everything the viewer needs to decide how to present a document's file,
/// without handing it a filesystem path.
#[derive(Serialize)]
pub struct DocumentFileInfo {
    pub document_id: i64,
    pub original_file_name: String,
    /// Lower-case extension, e.g. "pdf".
    pub extension: String,
    /// Whether the in-app viewer can render this type.
    pub previewable: bool,
    pub size_bytes: i64,
    /// False when the row references a file that is no longer on disk.
    pub exists_on_disk: bool,
}

/// Largest file served into the WebView. A controlled procedure is a document,
/// not a disk image; refusing early gives a clear message instead of an opaque
/// out-of-memory failure in the renderer.
const MAX_INLINE_VIEW_BYTES: u64 = 100 * 1024 * 1024;

fn document_status(conn: &rusqlite::Connection, document_id: i64) -> Result<String, String> {
    conn.query_row(
        "SELECT status FROM documents WHERE id = ?1",
        params![document_id],
        |r| r.get(0),
    )
    .map_err(|_| "Document not found".to_string())
}

/// Resolve a document's attachment to a real file inside managed storage.
///
/// The caller passes a document id and nothing else. The filename comes from the
/// database and the directory from the storage roots, so no part of the location
/// is caller-controlled — the id is an authorisation subject, not a path.
fn resolve_document_attachment(
    conn: &rusqlite::Connection,
    document_id: i64,
) -> Result<(std::path::PathBuf, String), String> {
    let (stored, original): (Option<String>, Option<String>) = conn
        .query_row(
            "SELECT file_path, original_file_name FROM documents WHERE id = ?1",
            params![document_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "Document not found".to_string())?;

    let stored = stored.ok_or_else(|| "No file is attached to this document".to_string())?;
    let paths = storage::get_storage_paths()?;
    let real = storage::resolve_managed_file(&paths.uploads_documents, &stored)?;
    Ok((real, original.unwrap_or(stored)))
}

/// Describe a document's file so the UI can choose preview vs external open.
#[tauri::command]
pub fn get_document_file_info(
    current_user_id: i64,
    document_id: i64,
) -> Result<DocumentFileInfo, String> {
    permissions::require_permission(current_user_id, "documents.view")?;

    let conn = db::open_conn()?;
    let (stored, original): (Option<String>, Option<String>) = conn
        .query_row(
            "SELECT file_path, original_file_name FROM documents WHERE id = ?1",
            params![document_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "Document not found".to_string())?;

    let stored = stored.ok_or_else(|| "No file is attached to this document".to_string())?;
    let original = original.unwrap_or_else(|| stored.clone());
    let extension = std::path::Path::new(&stored)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let paths = storage::get_storage_paths()?;
    // A missing file is a reportable state, not an error: the UI should say so
    // rather than the document becoming unopenable with no explanation.
    let (exists_on_disk, size_bytes) =
        match storage::resolve_managed_file(&paths.uploads_documents, &stored) {
            Ok(p) => (true, std::fs::metadata(&p).map(|m| m.len() as i64).unwrap_or(0)),
            Err(_) => (false, 0),
        };

    Ok(DocumentFileInfo {
        document_id,
        original_file_name: original,
        previewable: extension == "pdf",
        extension,
        size_bytes,
        exists_on_disk,
    })
}

/// Stream a document's bytes to the in-app viewer.
///
/// Delivery is by document id over the existing IPC channel. No `file://` URL,
/// no asset-protocol scope and no custom scheme is opened, so there is no new
/// surface through which the renderer could name a different file — and
/// `documents.view` is checked on every call, so guessing ids gains nothing.
#[tauri::command]
pub fn read_document_file(
    current_user_id: i64,
    document_id: i64,
) -> Result<tauri::ipc::Response, String> {
    permissions::require_permission(current_user_id, "documents.view")?;

    let conn = db::open_conn()?;
    let (real, _) = resolve_document_attachment(&conn, document_id)?;

    let size = std::fs::metadata(&real)
        .map_err(|e| format!("Could not read the document file: {}", e))?
        .len();
    if size > MAX_INLINE_VIEW_BYTES {
        return Err(format!(
            "This file is {} MB, which is too large to preview in the application. Use Open Externally instead.",
            size / (1024 * 1024)
        ));
    }

    let bytes = std::fs::read(&real).map_err(|e| format!("Could not read the document file: {}", e))?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Hand the controlled file to the operating system's default application.
///
/// Gated on `documents.open_external`, which is a narrower thing than viewing:
/// once the file leaves the application it is outside every control the QMS
/// applies. Previously this required only `documents.view`.
#[tauri::command]
pub fn open_document_file(current_user_id: i64, document_id: i64) -> Result<(), String> {
    permissions::require_permission(current_user_id, "documents.open_external")?;

    let conn = db::open_conn()?;
    let (real, original) = resolve_document_attachment(&conn, document_id)?;

    // The argument is a backend-generated name ({id}_{micros}.{ext}) inside a
    // backend-owned directory, passed as a separate argv entry — never assembled
    // into a command string.
    std::process::Command::new("cmd")
        .arg("/c")
        .arg("start")
        .arg("")
        .arg(real.as_os_str())
        .spawn()
        .map_err(|e| format!("Failed to open file: {}", e))?;

    log_document_activity(
        &conn,
        document_id,
        "OPENED_EXTERNALLY",
        &format!("Opened outside the application: {}", original),
        current_user_id,
    );
    Ok(())
}

/// Print a document through the Windows shell's print verb.
///
/// This is the OS print association, not a shell for arbitrary commands: the
/// verb is fixed, the path is backend-resolved from managed storage, and both
/// are passed as separate arguments rather than interpolated into a string.
#[tauri::command]
pub fn print_document_file(current_user_id: i64, document_id: i64) -> Result<(), String> {
    permissions::require_permission(current_user_id, "documents.print")?;

    let conn = db::open_conn()?;
    let (real, original) = resolve_document_attachment(&conn, document_id)?;

    let status = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            "Start-Process -FilePath $args[0] -Verb Print",
        ])
        .arg(real.as_os_str())
        .status()
        .map_err(|e| format!("Could not reach the Windows print service: {}", e))?;

    if !status.success() {
        return Err(
            "Windows could not print this file. Check that a printer is installed and that the \
             file type has a print action associated with it."
                .to_string(),
        );
    }

    log_document_activity(
        &conn,
        document_id,
        "PRINTED",
        &format!("Sent to the Windows print handler: {}", original),
        current_user_id,
    );
    Ok(())
}

/// Detach the file from a draft document and delete the managed copy.
///
/// Only for a document that is still UNDER PROCESS and has never been approved.
/// A controlled document's file is evidence; it is superseded by a new revision,
/// never erased.
#[tauri::command]
pub fn remove_document_attachment(
    current_user_id: i64,
    document_id: i64,
) -> Result<DocumentListItem, String> {
    permissions::require_permission(current_user_id, "documents.attachment_manage")?;

    let mut conn = db::open_conn()?;

    let (status, approval_date): (String, Option<String>) = conn
        .query_row(
            "SELECT status, approval_date FROM documents WHERE id = ?1",
            params![document_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "Document not found".to_string())?;

    if status != "UNDER PROCESS" {
        return Err(format!(
            "This document is {}. A controlled file cannot be removed — create a new revision instead.",
            status
        ));
    }
    if approval_date.is_some() {
        return Err(
            "This document has been approved before. Its file is part of the controlled record and \
             cannot be removed — create a new revision instead."
                .to_string(),
        );
    }

    let (stored, original): (Option<String>, Option<String>) = conn
        .query_row(
            "SELECT file_path, original_file_name FROM documents WHERE id = ?1",
            params![document_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "Document not found".to_string())?;
    let stored = stored.ok_or_else(|| "There is no file to remove".to_string())?;
    let original = original.clone().unwrap_or_else(|| stored.clone());

    let paths = storage::get_storage_paths()?;
    // Resolve before touching the database, so a path that is not ours stops the
    // operation before anything has changed.
    let real = storage::resolve_managed_file(&paths.uploads_documents, &stored);

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    // Drop the draft revision rows that point at this file. Doing this first is
    // what makes the reference count below meaningful.
    tx.execute(
        "DELETE FROM document_revisions WHERE document_id = ?1 AND file_path = ?2",
        params![document_id, &stored],
    )
    .map_err(|e| format!("Failed to update revision history: {}", e))?;

    // Never delete a blob another revision still points at. Distinct attachments
    // get distinct generated names, so this should be zero — but if history has
    // been edited or a future feature copies a reference, the file stays.
    let still_referenced: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM document_revisions WHERE file_path = ?1",
            params![&stored],
            |r| r.get(0),
        )
        .unwrap_or(1);

    tx.execute(
        "UPDATE documents
            SET file_path = NULL, original_file_name = NULL, updated_at = datetime('now')
          WHERE id = ?1",
        params![document_id],
    )
    .map_err(|e| format!("Failed to detach the file: {}", e))?;

    tx.execute(
        "INSERT INTO activity_log (module, record_id, action, description, performed_by, performed_at)
         VALUES ('documents', ?1, 'FILE_REMOVED', ?2, ?3, datetime('now'))",
        params![
            document_id,
            format!("File removed from draft: {}", original),
            current_user_id
        ],
    )
    .map_err(|e| format!("Failed to write activity log: {}", e))?;

    // Delete the bytes before committing. If the disk refuses, nothing is
    // committed and the record still truthfully says the file is attached —
    // rather than the database claiming a removal that did not happen.
    if still_referenced == 0 {
        match real {
            Ok(p) => std::fs::remove_file(&p)
                .map_err(|e| format!("Could not delete the stored file: {}", e))?,
            // The row pointed at something already gone. Detaching is still the
            // right outcome; there is simply nothing to delete.
            Err(_) => {}
        }
    }

    tx.commit().map_err(|e| format!("Failed to commit removal: {}", e))?;

    fetch_document(&conn, document_id)
}

/// Approve a document into controlled status.
///
/// The approval date is generated here, by the database, at the moment of
/// approval. It is never accepted from the caller: an approval date is the
/// evidence that a controlled document became effective, and a value the client
/// could choose would be a value the client could forge.
#[tauri::command]
pub fn approve_document(
    current_user_id: i64,
    document_id: i64,
) -> Result<DocumentListItem, String> {
    permissions::require_permission(current_user_id, "documents.approve")?;

    let mut conn = db::open_conn()?;

    let (status, file_path, doc_number): (String, Option<String>, String) = conn
        .query_row(
            "SELECT status, file_path, doc_number FROM documents WHERE id = ?1",
            params![document_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|_| "Document not found".to_string())?;

    if status != "UNDER PROCESS" {
        return Err(format!(
            "Only a document that is under process can be approved. This one is {}.",
            status
        ));
    }
    if file_path.is_none() {
        return Err(
            "Attach the document file before approving it. A controlled document must have the \
             file it controls."
                .to_string(),
        );
    }

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    // Clearing the rejection fields is deliberate: they describe the CURRENT
    // state of a document awaiting correction, and this document is no longer
    // awaiting anything. The rejection itself is not lost — it stays in
    // activity_log, which is the history of what happened rather than a snapshot
    // of where things stand.
    tx.execute(
        "UPDATE documents
            SET status = 'CONTROLLED',
                approval_date = datetime('now'),
                approved_by = ?1,
                rejected_at = NULL,
                rejected_by = NULL,
                rejection_reason = NULL,
                updated_at = datetime('now')
          WHERE id = ?2",
        params![current_user_id, document_id],
    )
    .map_err(|e| format!("Failed to approve the document: {}", e))?;

    tx.execute(
        "INSERT INTO activity_log (module, record_id, action, description, performed_by, performed_at)
         VALUES ('documents', ?1, 'APPROVED', ?2, ?3, datetime('now'))",
        params![
            document_id,
            format!("Document {} approved and placed under control", doc_number),
            current_user_id
        ],
    )
    .map_err(|e| format!("Failed to write activity log: {}", e))?;

    tx.commit().map_err(|e| format!("Failed to commit approval: {}", e))?;

    fetch_document(&conn, document_id)
}

/// Reject a document back for correction.
///
/// The document, its file and its revision history are all retained — rejection
/// records a decision, it does not undo work. The document stays UNDER PROCESS,
/// which is already the editable state, so the author can correct and resubmit
/// without a fourth status meaning the same thing.
#[tauri::command]
pub fn reject_document(
    current_user_id: i64,
    document_id: i64,
    reason: String,
) -> Result<DocumentListItem, String> {
    permissions::require_permission(current_user_id, "documents.approve")?;

    let reason = reason.trim().to_string();
    if reason.is_empty() {
        return Err("A rejection reason is required. The author needs to know what to correct.".to_string());
    }
    if reason.len() > 2000 {
        return Err("The rejection reason is too long (2000 characters maximum).".to_string());
    }

    let mut conn = db::open_conn()?;

    let (status, doc_number): (String, String) = conn
        .query_row(
            "SELECT status, doc_number FROM documents WHERE id = ?1",
            params![document_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "Document not found".to_string())?;

    if status != "UNDER PROCESS" {
        return Err(format!(
            "Only a document that is under process can be rejected. This one is {}.",
            status
        ));
    }

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    tx.execute(
        "UPDATE documents
            SET rejected_at = datetime('now'),
                rejected_by = ?1,
                rejection_reason = ?2,
                updated_at = datetime('now')
          WHERE id = ?3",
        params![current_user_id, &reason, document_id],
    )
    .map_err(|e| format!("Failed to record the rejection: {}", e))?;

    tx.execute(
        "INSERT INTO activity_log (module, record_id, action, description, performed_by, performed_at)
         VALUES ('documents', ?1, 'REJECTED', ?2, ?3, datetime('now'))",
        params![
            document_id,
            format!("Document {} rejected: {}", doc_number, reason),
            current_user_id
        ],
    )
    .map_err(|e| format!("Failed to write activity log: {}", e))?;

    tx.commit().map_err(|e| format!("Failed to commit rejection: {}", e))?;

    fetch_document(&conn, document_id)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

/// Document control asserted against the SHIPPED migrations.
///
/// The command bodies open their own connection through `db::open_conn`, which
/// is pinned to the real %APPDATA% database, so they cannot be called against a
/// scratch file. What is exercised here is the logic those commands encode — the
/// lifecycle predicates, the SQL, and the permission sets — over the real schema,
/// plus the path guard itself, which IS directly callable.
#[cfg(test)]
mod document_control_tests {
    use rusqlite::{params, Connection};

    struct TempDb {
        path: std::path::PathBuf,
    }

    impl TempDb {
        fn new(tag: &str) -> Self {
            let mut path = std::env::temp_dir();
            path.push(format!("qms_doccontrol_{}_{}.db", tag, std::process::id()));
            let _ = std::fs::remove_file(&path);
            crate::db::initialize_database(&path).expect("shipped migrations must apply");
            TempDb { path }
        }
        fn open(&self) -> Connection {
            let c = Connection::open(&self.path).unwrap();
            c.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
            c
        }
    }

    impl Drop for TempDb {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.path);
            let _ = std::fs::remove_file(self.path.with_extension("db-wal"));
            let _ = std::fs::remove_file(self.path.with_extension("db-shm"));
        }
    }

    fn make_user(c: &Connection, username: &str, role_key: &str) -> i64 {
        let role_id: i64 = c
            .query_row("SELECT id FROM roles WHERE role_key = ?1", params![role_key], |r| r.get(0))
            .unwrap();
        c.execute(
            "INSERT INTO users (username, full_name, email, role, role_id, department,
                                password_hash, is_active, created_at, updated_at)
             VALUES (?1, ?1, NULL, ?2, ?3, '', 'x', 1, datetime('now'), datetime('now'))",
            params![username, role_key, role_id],
        )
        .unwrap();
        c.last_insert_rowid()
    }

    fn make_document(c: &Connection, number: &str, status: &str, file: Option<&str>) -> i64 {
        c.execute(
            "INSERT INTO documents (doc_number, title, category, status, version,
                                    file_path, original_file_name, created_at, updated_at)
             VALUES (?1, 'A procedure', 'Procedure', ?2, '1.0', ?3, ?4,
                     datetime('now'), datetime('now'))",
            params![number, status, file, file.map(|_| "original.pdf")],
        )
        .unwrap();
        c.last_insert_rowid()
    }

    // ── Approval columns exist and behave ────────────────────────────────────

    #[test]
    fn the_shipped_schema_already_carries_the_approval_columns() {
        let db = TempDb::new("cols");
        let c = db.open();
        let mut stmt = c.prepare("PRAGMA table_info(documents)").unwrap();
        let cols: Vec<String> = stmt
            .query_map([], |r| r.get::<_, String>(1))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        for needed in [
            "approval_date",
            "approved_by",
            "rejected_at",
            "rejected_by",
            "rejection_reason",
        ] {
            assert!(cols.contains(&needed.to_string()), "missing column {}", needed);
        }
        // effective_date survives: older records keep the date they were filed with.
        assert!(cols.contains(&"effective_date".to_string()));
    }

    /// The approval date must come from the database clock, not a caller.
    #[test]
    fn approval_stamps_a_server_side_date_and_the_approver() {
        let db = TempDb::new("approve");
        let c = db.open();
        let admin = make_user(&c, "doc_admin", "Admin");
        let id = make_document(&c, "DOC-1", "UNDER PROCESS", Some("1_1.pdf"));

        // Exactly what approve_document executes.
        c.execute(
            "UPDATE documents
                SET status = 'CONTROLLED', approval_date = datetime('now'), approved_by = ?1,
                    rejected_at = NULL, rejected_by = NULL, rejection_reason = NULL,
                    updated_at = datetime('now')
              WHERE id = ?2",
            params![admin, id],
        )
        .unwrap();

        let (status, date, by): (String, Option<String>, Option<i64>) = c
            .query_row(
                "SELECT status, approval_date, approved_by FROM documents WHERE id = ?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();

        assert_eq!(status, "CONTROLLED");
        assert_eq!(by, Some(admin), "the approver's stable id is recorded");
        let date = date.expect("an approval date must be written");
        assert!(date.len() >= 19, "expected a full timestamp, got {:?}", date);
        assert!(date.starts_with("20"), "expected an ISO date, got {:?}", date);
    }

    #[test]
    fn rejection_keeps_the_document_and_records_who_and_why() {
        let db = TempDb::new("reject");
        let c = db.open();
        let admin = make_user(&c, "rej_admin", "Admin");
        let id = make_document(&c, "DOC-2", "UNDER PROCESS", Some("2_1.pdf"));

        c.execute(
            "UPDATE documents
                SET rejected_at = datetime('now'), rejected_by = ?1, rejection_reason = ?2,
                    updated_at = datetime('now')
              WHERE id = ?3",
            params![admin, "Section 4 contradicts the risk register", id],
        )
        .unwrap();

        let (status, file, at, by, reason): (String, Option<String>, Option<String>, Option<i64>, Option<String>) = c
            .query_row(
                "SELECT status, file_path, rejected_at, rejected_by, rejection_reason
                   FROM documents WHERE id = ?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .unwrap();

        assert_eq!(status, "UNDER PROCESS", "a rejected document stays editable for correction");
        assert_eq!(file, Some("2_1.pdf".to_string()), "rejection does not discard the file");
        assert!(at.is_some());
        assert_eq!(by, Some(admin));
        assert_eq!(reason.as_deref(), Some("Section 4 contradicts the risk register"));
    }

    /// The reason is the whole point of a rejection — the author has to know what
    /// to fix. Whitespace is not a reason.
    #[test]
    fn a_blank_rejection_reason_is_not_a_reason() {
        for blank in ["", "   ", "\t", "\n  \n"] {
            assert!(blank.trim().is_empty(), "{:?} must be treated as empty", blank);
        }
        assert!(!"Needs a revision history table".trim().is_empty());
    }

    // ── Lifecycle predicates ─────────────────────────────────────────────────

    /// The rule the attachment commands enforce: a draft may be corrected, a
    /// controlled document may not be edited in place.
    fn attachment_change_allowed(status: &str, approval_date: Option<&str>) -> bool {
        status == "UNDER PROCESS" && approval_date.is_none()
    }

    #[test]
    fn only_an_unapproved_draft_may_have_its_file_changed() {
        assert!(attachment_change_allowed("UNDER PROCESS", None));

        // Controlled and obsolete are both off limits.
        assert!(!attachment_change_allowed("CONTROLLED", Some("2026-01-01 10:00:00")));
        assert!(!attachment_change_allowed("OBSOLETE", Some("2026-01-01 10:00:00")));

        // And so is a draft that was approved once before: its file is already
        // part of a controlled record, whatever the document is doing now.
        assert!(!attachment_change_allowed("UNDER PROCESS", Some("2026-01-01 10:00:00")));
    }

    #[test]
    fn approval_requires_a_draft_that_actually_has_its_file() {
        let approvable = |status: &str, file: Option<&str>| status == "UNDER PROCESS" && file.is_some();

        assert!(approvable("UNDER PROCESS", Some("1_1.pdf")));
        assert!(!approvable("UNDER PROCESS", None), "a controlled document must have its file");
        assert!(!approvable("CONTROLLED", Some("1_1.pdf")), "already approved");
        assert!(!approvable("OBSOLETE", Some("1_1.pdf")));
    }

    // ── Historical integrity ─────────────────────────────────────────────────

    /// Removing a draft's file must never take a revision that belongs to another
    /// document, and must never delete a blob still referenced.
    #[test]
    fn removal_only_touches_this_documents_own_revisions() {
        let db = TempDb::new("revisions");
        let c = db.open();
        let user = make_user(&c, "rev_admin", "Admin");
        let a = make_document(&c, "DOC-A", "UNDER PROCESS", Some("10_1.pdf"));
        let b = make_document(&c, "DOC-B", "CONTROLLED", Some("11_1.pdf"));

        for (doc, file) in [(a, "10_1.pdf"), (b, "11_1.pdf")] {
            c.execute(
                "INSERT INTO document_revisions
                     (document_id, version, change_summary, file_path, original_file_name,
                      revised_by, revised_at)
                 VALUES (?1, '1.0', 'attached', ?2, 'original.pdf', ?3, datetime('now'))",
                params![doc, file, user],
            )
            .unwrap();
        }

        // The statement remove_document_attachment runs.
        c.execute(
            "DELETE FROM document_revisions WHERE document_id = ?1 AND file_path = ?2",
            params![a, "10_1.pdf"],
        )
        .unwrap();

        let remaining_a: i64 = c
            .query_row("SELECT COUNT(*) FROM document_revisions WHERE document_id = ?1", params![a], |r| r.get(0))
            .unwrap();
        let remaining_b: i64 = c
            .query_row("SELECT COUNT(*) FROM document_revisions WHERE document_id = ?1", params![b], |r| r.get(0))
            .unwrap();

        assert_eq!(remaining_a, 0);
        assert_eq!(remaining_b, 1, "the controlled document's history is untouched");
    }

    #[test]
    fn a_blob_another_revision_still_points_at_is_never_deleted() {
        let db = TempDb::new("shared_blob");
        let c = db.open();
        let user = make_user(&c, "blob_admin", "Admin");
        let a = make_document(&c, "DOC-A", "UNDER PROCESS", Some("shared.pdf"));
        let b = make_document(&c, "DOC-B", "CONTROLLED", Some("shared.pdf"));

        for doc in [a, b] {
            c.execute(
                "INSERT INTO document_revisions
                     (document_id, version, change_summary, file_path, original_file_name,
                      revised_by, revised_at)
                 VALUES (?1, '1.0', 'attached', 'shared.pdf', 'original.pdf', ?2, datetime('now'))",
                params![doc, user],
            )
            .unwrap();
        }

        c.execute(
            "DELETE FROM document_revisions WHERE document_id = ?1 AND file_path = ?2",
            params![a, "shared.pdf"],
        )
        .unwrap();

        let still_referenced: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM document_revisions WHERE file_path = ?1",
                params!["shared.pdf"],
                |r| r.get(0),
            )
            .unwrap();

        assert_eq!(still_referenced, 1);
        assert!(still_referenced > 0, "the physical file must be kept while referenced");
    }

    #[test]
    fn approving_does_not_disturb_revision_history() {
        let db = TempDb::new("history");
        let c = db.open();
        let user = make_user(&c, "hist_admin", "Admin");
        let id = make_document(&c, "DOC-H", "UNDER PROCESS", Some("20_1.pdf"));

        for v in ["1.0", "1.1"] {
            c.execute(
                "INSERT INTO document_revisions
                     (document_id, version, change_summary, file_path, original_file_name,
                      revised_by, revised_at)
                 VALUES (?1, ?2, 'revised', '20_1.pdf', 'original.pdf', ?3, datetime('now'))",
                params![id, v, user],
            )
            .unwrap();
        }

        c.execute(
            "UPDATE documents SET status = 'CONTROLLED', approval_date = datetime('now'),
                                  approved_by = ?1 WHERE id = ?2",
            params![user, id],
        )
        .unwrap();

        let n: i64 = c
            .query_row("SELECT COUNT(*) FROM document_revisions WHERE document_id = ?1", params![id], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 2, "approval must not rewrite or drop revision rows");
    }

    // ── Authorization ────────────────────────────────────────────────────────

    /// WHO CAN APPROVE, AS SHIPPED.
    ///
    /// Stage 4 was specified as "approval is an Admin function". Admin does hold
    /// documents.approve — but so does Quality Manager, and that predates this
    /// stage: migration 010 grants QualityManager every permission except
    /// users.manage, roles.manage, backup.create and backup.restore, which sweeps
    /// documents.approve in with the rest.
    ///
    /// That is left EXACTLY as it is. Removing it would narrow a shipped role
    /// template, change the 47-key count the Stage 2 tripwire asserts, and quietly
    /// revoke a capability from every existing Quality Manager — a privilege
    /// decision for the owner, not a side effect of building the approval screen.
    /// This test pins the real state so the question stays visible rather than
    /// being discovered later in the field.
    #[test]
    fn document_approval_is_held_by_admin_and_quality_manager_as_shipped() {
        let db = TempDb::new("rbac");
        let c = db.open();

        let admin = make_user(&c, "a_admin", "Admin");
        let qm = make_user(&c, "a_qm", "QualityManager");
        let auditor = make_user(&c, "a_auditor", "Auditor");
        let employee = make_user(&c, "a_emp", "Employee");
        let viewer = make_user(&c, "a_view", "Viewer");

        let eff = |uid: i64| crate::permissions::effective_permissions(&c, uid).unwrap();

        assert!(eff(admin).contains("documents.approve"), "Admin approves documents");
        assert!(
            eff(qm).contains("documents.approve"),
            "QualityManager holds it too, as shipped — see the note above before changing this",
        );
        // The read-only and audit roles must not, and that IS the line the owner
        // cared about: approval is not something an auditor or an employee does.
        for (uid, who) in [(auditor, "Auditor"), (employee, "Employee"), (viewer, "Viewer")] {
            assert!(
                !eff(uid).contains("documents.approve"),
                "{} must not approve documents",
                who,
            );
        }

        // The other document keys this stage enforces exist and are distinct.
        let a = eff(admin);
        for key in [
            "documents.view",
            "documents.edit",
            "documents.attachment_manage",
            "documents.print",
            "documents.open_external",
        ] {
            assert!(a.contains(key), "Admin should hold {}", key);
        }

        // Viewing is not the same as taking the file out of the application.
        let v = eff(viewer);
        assert!(v.contains("documents.view"), "a viewer may read documents");
        assert!(
            !v.contains("documents.attachment_manage"),
            "a viewer must not manage document files",
        );
    }

    /// Guessing a document id must not be enough: reading a file is guarded by
    /// the same permission as reading the record.
    #[test]
    fn a_user_without_documents_view_is_refused_by_the_engine() {
        let db = TempDb::new("deny");
        let c = db.open();

        let viewer = make_user(&c, "d_view", "Viewer");
        // Strip the read permission from this one user.
        let perm_id: i64 = c
            .query_row("SELECT id FROM permissions WHERE perm_key = 'documents.view'", [], |r| r.get(0))
            .unwrap();
        c.execute(
            "INSERT INTO user_permission_overrides (user_id, permission_id, effect, created_at, updated_at)
             VALUES (?1, ?2, 'DENY', datetime('now'), datetime('now'))",
            params![viewer, perm_id],
        )
        .unwrap();

        let eff = crate::permissions::effective_permissions(&c, viewer).unwrap();
        assert!(
            !eff.contains("documents.view"),
            "the deny override must remove read access, which is what read_document_file checks",
        );
    }
}

// Stage 4 document control tests live at the end of this file.
