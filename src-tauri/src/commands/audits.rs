use rusqlite::params;
use serde::Serialize;
use crate::{db, permissions, storage};

// ── Structs ───────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct AuditListItem {
    pub id: i64,
    pub audit_number: String,
    pub title: String,
    pub audit_type: Option<String>,
    pub department: Option<String>,
    pub scope: Option<String>,
    pub standard: Option<String>,
    pub planned_date: Option<String>,
    pub actual_date: Option<String>,
    pub status: String,
    pub lead_auditor_id: Option<i64>,
    pub lead_auditor_name: Option<String>,
    pub auditee: Option<String>,
    pub summary: Option<String>,
    pub closed_at: Option<String>,
    pub created_by: Option<i64>,
    pub created_by_name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub findings_count: i64,
}

#[derive(Serialize)]
pub struct AuditFinding {
    pub id: i64,
    pub audit_id: i64,
    pub finding_number: String,
    pub finding_type: String,
    pub clause_ref: Option<String>,
    pub description: String,
    pub evidence: Option<String>,
    pub severity: String,
    pub recommended_action: Option<String>,
    pub is_non_conformity: bool,
    pub related_nc_id: Option<i64>,
    pub related_nc_number: Option<String>,
    pub status: String,
    pub created_by: Option<i64>,
    pub created_by_name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
pub struct AuditAttachment {
    pub id: i64,
    pub file_name: String,
    pub file_path: String,
    pub file_size: Option<i64>,
    pub uploaded_by: Option<i64>,
    pub uploaded_by_name: Option<String>,
    pub uploaded_at: String,
}

#[derive(Serialize)]
pub struct AuditActivityEntry {
    pub id: i64,
    pub action: String,
    pub description: Option<String>,
    pub performed_by: Option<i64>,
    pub performed_by_name: Option<String>,
    pub performed_at: String,
}

// ── SQL constants ─────────────────────────────────────────────────────────────

const AUDIT_SQL: &str =
    "SELECT a.id, a.audit_number, a.title, a.audit_type, a.department, a.scope, a.standard,
            a.planned_date, a.actual_date, a.status,
            a.lead_auditor_id, au.full_name AS lead_auditor_name,
            a.auditee, a.summary,
            a.closed_at, a.created_by, cu.full_name AS created_by_name,
            a.created_at, a.updated_at,
            (SELECT COUNT(*) FROM audit_findings af WHERE af.audit_id = a.id) AS findings_count
     FROM audits a
     LEFT JOIN users au ON a.lead_auditor_id = au.id
     LEFT JOIN users cu ON a.created_by = cu.id";

const FINDING_SQL: &str =
    "SELECT f.id, f.audit_id, f.finding_number, f.finding_type, f.clause_ref,
            f.description, f.evidence, f.severity, f.recommended_action,
            f.is_non_conformity, f.related_nc_id, nc.nc_number AS related_nc_number,
            f.status, f.created_by, cu.full_name AS created_by_name,
            f.created_at, f.updated_at
     FROM audit_findings f
     LEFT JOIN non_conformities nc ON f.related_nc_id = nc.id
     LEFT JOIN users cu ON f.created_by = cu.id";

// ── Validation helpers ────────────────────────────────────────────────────────

fn validate_audit_type(t: &str) -> Result<(), String> {
    match t {
        "Internal Audit" | "External Audit" | "Supplier Audit" | "Process Audit" | "Other" => Ok(()),
        _ => Err(format!(
            "Invalid audit type: '{}'. Must be Internal Audit, External Audit, Supplier Audit, Process Audit, or Other",
            t
        )),
    }
}

fn validate_finding_type(t: &str) -> Result<(), String> {
    match t {
        "NC" | "OFI" | "Observation" | "Positive" => Ok(()),
        _ => Err(format!(
            "Invalid finding type: '{}'. Must be NC, OFI, Observation, or Positive",
            t
        )),
    }
}

fn validate_severity(s: &str) -> Result<(), String> {
    match s {
        "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" => Ok(()),
        _ => Err(format!(
            "Invalid severity: '{}'. Must be LOW, MEDIUM, HIGH, or CRITICAL",
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

// ── Private row mappers ───────────────────────────────────────────────────────

fn map_audit_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AuditListItem> {
    Ok(AuditListItem {
        id:                 row.get(0)?,
        audit_number:       row.get(1)?,
        title:              row.get(2)?,
        audit_type:         row.get(3)?,
        department:         row.get(4)?,
        scope:              row.get(5)?,
        standard:           row.get(6)?,
        planned_date:       row.get(7)?,
        actual_date:        row.get(8)?,
        status:             row.get(9)?,
        lead_auditor_id:    row.get(10)?,
        lead_auditor_name:  row.get(11)?,
        auditee:            row.get(12)?,
        summary:            row.get(13)?,
        closed_at:          row.get(14)?,
        created_by:         row.get(15)?,
        created_by_name:    row.get(16)?,
        created_at:         row.get(17)?,
        updated_at:         row.get(18)?,
        findings_count:     row.get(19)?,
    })
}

fn map_finding_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AuditFinding> {
    let is_nc_i: i64 = row.get(9)?;
    Ok(AuditFinding {
        id:                 row.get(0)?,
        audit_id:           row.get(1)?,
        finding_number:     row.get(2)?,
        finding_type:       row.get(3)?,
        clause_ref:         row.get(4)?,
        description:        row.get(5)?,
        evidence:           row.get(6)?,
        severity:           row.get(7)?,
        recommended_action: row.get(8)?,
        is_non_conformity:  is_nc_i != 0,
        related_nc_id:      row.get(10)?,
        related_nc_number:  row.get(11)?,
        status:             row.get(12)?,
        created_by:         row.get(13)?,
        created_by_name:    row.get(14)?,
        created_at:         row.get(15)?,
        updated_at:         row.get(16)?,
    })
}

fn fetch_audit(conn: &rusqlite::Connection, audit_id: i64) -> Result<AuditListItem, String> {
    let sql = format!("{} WHERE a.id = ?1", AUDIT_SQL);
    conn.query_row(&sql, params![audit_id], map_audit_row)
        .map_err(|e| format!("Audit not found: {}", e))
}

fn fetch_finding(conn: &rusqlite::Connection, finding_id: i64) -> Result<AuditFinding, String> {
    let sql = format!("{} WHERE f.id = ?1", FINDING_SQL);
    conn.query_row(&sql, params![finding_id], map_finding_row)
        .map_err(|e| format!("Finding not found: {}", e))
}

fn fetch_attachment(conn: &rusqlite::Connection, attachment_id: i64) -> Result<AuditAttachment, String> {
    conn.query_row(
        "SELECT a.id, a.file_name, a.file_path, a.file_size,
                a.uploaded_by, u.full_name, a.uploaded_at
         FROM attachments a
         LEFT JOIN users u ON a.uploaded_by = u.id
         WHERE a.id = ?1",
        params![attachment_id],
        |row| Ok(AuditAttachment {
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

fn get_audit_prefix(conn: &rusqlite::Connection) -> String {
    let prefix: String = conn
        .query_row(
            "SELECT COALESCE(value, 'AUDIT') FROM settings WHERE key = 'audit_prefix'",
            [], |row| row.get(0),
        )
        .unwrap_or_else(|_| "AUDIT".to_string());
    if prefix.trim().is_empty() { "AUDIT".to_string() } else { prefix.trim().to_string() }
}

fn generate_audit_number(conn: &rusqlite::Connection) -> Result<String, String> {
    let prefix = get_audit_prefix(conn);
    let year: String = conn
        .query_row("SELECT strftime('%Y', 'now')", [], |row| row.get(0))
        .map_err(|e| format!("Failed to get year: {}", e))?;
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM audits WHERE audit_number LIKE ?1",
            params![format!("{}-{}-%" , prefix, year)],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to count audits: {}", e))?;
    Ok(format!("{}-{}-{:04}", prefix, year, count + 1))
}

fn generate_finding_number(conn: &rusqlite::Connection, audit_id: i64) -> Result<String, String> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM audit_findings WHERE audit_id = ?1",
            params![audit_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to count findings: {}", e))?;
    Ok(format!("F-{:03}", count + 1))
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_audits(current_user_id: i64) -> Result<Vec<AuditListItem>, String> {
    permissions::require_authenticated(current_user_id)?;
    let conn = db::open_conn()?;
    let sql = format!("{} ORDER BY a.audit_number ASC", AUDIT_SQL);
    let mut stmt = conn.prepare(&sql)
        .map_err(|e| format!("Failed to prepare query: {}", e))?;
    let audits = stmt.query_map([], map_audit_row)
        .map_err(|e| format!("Failed to query audits: {}", e))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(audits)
}

#[tauri::command]
pub fn get_audit(current_user_id: i64, audit_record_id: i64) -> Result<AuditListItem, String> {
    permissions::require_authenticated(current_user_id)?;
    let conn = db::open_conn()?;
    fetch_audit(&conn, audit_record_id)
}

#[tauri::command]
pub fn create_audit(
    current_user_id: i64,
    title: String,
    audit_type: String,
    department: String,
    auditor_user_id: i64,
    audit_date: String,
    scope: Option<String>,
    standard: Option<String>,
    planned_date: Option<String>,
    auditee: Option<String>,
    summary: Option<String>,
) -> Result<AuditListItem, String> {
    permissions::require_admin_or_quality_manager(current_user_id)?;

    let title = title.trim().to_string();
    if title.is_empty() { return Err("Title is required".to_string()); }
    validate_audit_type(&audit_type)?;
    let department = department.trim().to_string();
    if department.is_empty() { return Err("Department is required".to_string()); }
    let audit_date = audit_date.trim().to_string();
    if audit_date.is_empty() { return Err("Audit date is required".to_string()); }

    let conn = db::open_conn()?;

    let auditor_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE id = ?1 AND is_active = 1",
            params![auditor_user_id], |row| row.get::<_, i64>(0),
        )
        .map(|c| c > 0)
        .unwrap_or(false);
    if !auditor_exists { return Err("Auditor not found or inactive".to_string()); }

    let audit_number = generate_audit_number(&conn)?;

    conn.execute(
        "INSERT INTO audits
             (audit_number, title, audit_type, department, scope, standard,
              planned_date, actual_date, status, lead_auditor_id, auditee, summary,
              created_by, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'OPEN', ?9, ?10, ?11, ?12,
                 datetime('now'), datetime('now'))",
        params![
            &audit_number, &title, &audit_type, &department,
            &scope, standard.as_deref().or(Some("ISO 9001:2015")),
            &planned_date, &audit_date,
            auditor_user_id, &auditee, &summary,
            current_user_id
        ],
    )
    .map_err(|e| format!("Failed to create audit: {}", e))?;

    let id = conn.last_insert_rowid();

    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('audit', ?1, 'CREATED', ?2, ?3, datetime('now'))",
        params![id, format!("Audit created: {} — {}", &audit_number, &title), current_user_id],
    );

    fetch_audit(&conn, id)
}

#[tauri::command]
pub fn update_audit(
    current_user_id: i64,
    audit_record_id: i64,
    title: String,
    audit_type: String,
    department: String,
    auditor_user_id: i64,
    audit_date: String,
    scope: Option<String>,
    standard: Option<String>,
    planned_date: Option<String>,
    auditee: Option<String>,
    summary: Option<String>,
) -> Result<AuditListItem, String> {
    permissions::require_admin_or_quality_manager(current_user_id)?;

    let title = title.trim().to_string();
    if title.is_empty() { return Err("Title is required".to_string()); }
    validate_audit_type(&audit_type)?;
    let department = department.trim().to_string();
    if department.is_empty() { return Err("Department is required".to_string()); }
    let audit_date = audit_date.trim().to_string();
    if audit_date.is_empty() { return Err("Audit date is required".to_string()); }

    let conn = db::open_conn()?;

    let auditor_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE id = ?1 AND is_active = 1",
            params![auditor_user_id], |row| row.get::<_, i64>(0),
        )
        .map(|c| c > 0)
        .unwrap_or(false);
    if !auditor_exists { return Err("Auditor not found or inactive".to_string()); }

    conn.execute(
        "UPDATE audits
         SET title = ?1, audit_type = ?2, department = ?3, scope = ?4, standard = ?5,
             planned_date = ?6, actual_date = ?7, lead_auditor_id = ?8,
             auditee = ?9, summary = ?10, updated_at = datetime('now')
         WHERE id = ?11",
        params![
            &title, &audit_type, &department, &scope, &standard,
            &planned_date, &audit_date, auditor_user_id,
            &auditee, &summary, audit_record_id
        ],
    )
    .map_err(|e| format!("Failed to update audit: {}", e))?;

    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('audit', ?1, 'UPDATED', 'Audit metadata updated', ?2, datetime('now'))",
        params![audit_record_id, current_user_id],
    );

    fetch_audit(&conn, audit_record_id)
}

#[tauri::command]
pub fn set_audit_status(
    current_user_id: i64,
    audit_record_id: i64,
    status: String,
) -> Result<AuditListItem, String> {
    permissions::require_admin_or_quality_manager(current_user_id)?;

    match status.as_str() {
        "OPEN" | "CLOSED" => {}
        _ => return Err(format!("Invalid status: {}. Must be OPEN or CLOSED", status)),
    }

    let conn = db::open_conn()?;

    if status == "CLOSED" {
        conn.execute(
            "UPDATE audits SET status = 'CLOSED', closed_at = datetime('now'),
             updated_at = datetime('now') WHERE id = ?1",
            params![audit_record_id],
        )
        .map_err(|e| format!("Failed to close audit: {}", e))?;
        let _ = conn.execute(
            "INSERT INTO activity_log
                 (module, record_id, action, description, performed_by, performed_at)
             VALUES ('audit', ?1, 'CLOSED', 'Audit closed', ?2, datetime('now'))",
            params![audit_record_id, current_user_id],
        );
    } else {
        conn.execute(
            "UPDATE audits SET status = 'OPEN', closed_at = NULL,
             updated_at = datetime('now') WHERE id = ?1",
            params![audit_record_id],
        )
        .map_err(|e| format!("Failed to reopen audit: {}", e))?;
        let _ = conn.execute(
            "INSERT INTO activity_log
                 (module, record_id, action, description, performed_by, performed_at)
             VALUES ('audit', ?1, 'REOPENED', 'Audit reopened', ?2, datetime('now'))",
            params![audit_record_id, current_user_id],
        );
    }

    fetch_audit(&conn, audit_record_id)
}

#[tauri::command]
pub fn list_audit_findings(
    current_user_id: i64,
    audit_record_id: i64,
) -> Result<Vec<AuditFinding>, String> {
    permissions::require_authenticated(current_user_id)?;
    let conn = db::open_conn()?;
    let sql = format!("{} WHERE f.audit_id = ?1 ORDER BY f.finding_number ASC", FINDING_SQL);
    let mut stmt = conn.prepare(&sql)
        .map_err(|e| format!("Failed to prepare query: {}", e))?;
    let findings = stmt.query_map(params![audit_record_id], map_finding_row)
        .map_err(|e| format!("Failed to query findings: {}", e))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(findings)
}

#[tauri::command]
pub fn add_audit_finding(
    current_user_id: i64,
    audit_record_id: i64,
    finding_type: String,
    description: String,
    severity: String,
    clause_ref: Option<String>,
    evidence: Option<String>,
    recommended_action: Option<String>,
) -> Result<AuditFinding, String> {
    permissions::require_admin_qm_or_auditor(current_user_id)?;

    validate_finding_type(&finding_type)?;
    let description = description.trim().to_string();
    if description.is_empty() { return Err("Finding description is required".to_string()); }
    validate_severity(&severity)?;

    let conn = db::open_conn()?;

    // Verify audit exists
    let audit_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM audits WHERE id = ?1",
            params![audit_record_id], |row| row.get::<_, i64>(0),
        )
        .map(|c| c > 0)
        .unwrap_or(false);
    if !audit_exists { return Err("Audit not found".to_string()); }

    let finding_number = generate_finding_number(&conn, audit_record_id)?;

    conn.execute(
        "INSERT INTO audit_findings
             (audit_id, finding_number, finding_type, clause_ref, description,
              evidence, severity, recommended_action, status, is_non_conformity,
              created_by, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'OPEN', 0, ?9,
                 datetime('now'), datetime('now'))",
        params![
            audit_record_id, &finding_number, &finding_type, &clause_ref, &description,
            &evidence, &severity, &recommended_action, current_user_id
        ],
    )
    .map_err(|e| format!("Failed to add finding: {}", e))?;

    let finding_id = conn.last_insert_rowid();

    // Update audit updated_at
    let _ = conn.execute(
        "UPDATE audits SET updated_at = datetime('now') WHERE id = ?1",
        params![audit_record_id],
    );

    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('audit', ?1, 'FINDING_ADDED', ?2, ?3, datetime('now'))",
        params![
            audit_record_id,
            format!("Finding added: {} — {} ({})", &finding_number, &description, &finding_type),
            current_user_id
        ],
    );

    fetch_finding(&conn, finding_id)
}

#[tauri::command]
pub fn update_audit_finding(
    current_user_id: i64,
    finding_id: i64,
    finding_type: String,
    description: String,
    severity: String,
    clause_ref: Option<String>,
    evidence: Option<String>,
    recommended_action: Option<String>,
) -> Result<AuditFinding, String> {
    permissions::require_admin_qm_or_auditor(current_user_id)?;

    validate_finding_type(&finding_type)?;
    let description = description.trim().to_string();
    if description.is_empty() { return Err("Finding description is required".to_string()); }
    validate_severity(&severity)?;

    let conn = db::open_conn()?;

    // Get audit_id for activity log
    let audit_id: i64 = conn
        .query_row(
            "SELECT audit_id FROM audit_findings WHERE id = ?1",
            params![finding_id], |row| row.get(0),
        )
        .map_err(|_| "Finding not found".to_string())?;

    conn.execute(
        "UPDATE audit_findings
         SET finding_type = ?1, clause_ref = ?2, description = ?3,
             evidence = ?4, severity = ?5, recommended_action = ?6,
             updated_at = datetime('now')
         WHERE id = ?7",
        params![
            &finding_type, &clause_ref, &description,
            &evidence, &severity, &recommended_action,
            finding_id
        ],
    )
    .map_err(|e| format!("Failed to update finding: {}", e))?;

    let _ = conn.execute(
        "UPDATE audits SET updated_at = datetime('now') WHERE id = ?1",
        params![audit_id],
    );

    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('audit', ?1, 'FINDING_UPDATED', 'Audit finding updated', ?2, datetime('now'))",
        params![audit_id, current_user_id],
    );

    fetch_finding(&conn, finding_id)
}

/// Create a Non-Conformity from an audit finding.
/// Prevents duplicate: if finding.related_nc_id is already set, returns error.
/// Requires Admin, QualityManager, or Auditor.
#[tauri::command]
pub fn create_nc_from_audit_finding(
    current_user_id: i64,
    finding_id: i64,
) -> Result<AuditFinding, String> {
    permissions::require_admin_qm_or_auditor(current_user_id)?;

    let conn = db::open_conn()?;

    // Load finding
    let (audit_id, finding_number, finding_desc, already_nc_id): (i64, String, String, Option<i64>) = conn
        .query_row(
            "SELECT audit_id, finding_number, description, related_nc_id
             FROM audit_findings WHERE id = ?1",
            params![finding_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|_| "Finding not found".to_string())?;

    if already_nc_id.is_some() {
        return Err(
            "A Non-Conformity already exists for this finding. Duplicate NC creation is not allowed.".to_string()
        );
    }

    // Get audit info
    let audit_number: String = conn
        .query_row(
            "SELECT audit_number FROM audits WHERE id = ?1",
            params![audit_id], |row| row.get(0),
        )
        .map_err(|_| "Audit not found".to_string())?;

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

    // Build NC title from finding
    let nc_title = format!("NC from {} — {}", &finding_number, &finding_desc);
    let nc_title = if nc_title.len() > 250 {
        format!("{}...", &nc_title[..247])
    } else {
        nc_title
    };

    // Insert NC
    conn.execute(
        "INSERT INTO non_conformities
             (nc_number, title, description, source, source_id, finding_id,
              severity, status, detected_date, created_by, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'AUDIT', ?4, ?5, 'LOW', 'OPEN', date('now'), ?6,
                 datetime('now'), datetime('now'))",
        params![
            &nc_number, &nc_title, &finding_desc,
            audit_id, finding_id,
            current_user_id
        ],
    )
    .map_err(|e| format!("Failed to create NC: {}", e))?;

    let nc_id = conn.last_insert_rowid();

    // Update finding: mark as NC, set related_nc_id
    conn.execute(
        "UPDATE audit_findings
         SET is_non_conformity = 1, related_nc_id = ?1, updated_at = datetime('now')
         WHERE id = ?2",
        params![nc_id, finding_id],
    )
    .map_err(|e| format!("Failed to link NC to finding: {}", e))?;

    // Update audit updated_at
    let _ = conn.execute(
        "UPDATE audits SET updated_at = datetime('now') WHERE id = ?1",
        params![audit_id],
    );

    // Activity log for audit
    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('audit', ?1, 'NC_CREATED', ?2, ?3, datetime('now'))",
        params![
            audit_id,
            format!("NC {} created from finding {}", &nc_number, &finding_number),
            current_user_id
        ],
    );

    // Activity log for NC
    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('nc', ?1, 'CREATED', ?2, ?3, datetime('now'))",
        params![
            nc_id,
            format!("NC {} created from audit finding {} ({})", &nc_number, &finding_number, &audit_number),
            current_user_id
        ],
    );

    fetch_finding(&conn, finding_id)
}

#[tauri::command]
pub fn attach_audit_file(
    current_user_id: i64,
    audit_record_id: i64,
    source_file_path: String,
    original_file_name: String,
    note: Option<String>,
) -> Result<AuditAttachment, String> {
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
    let stored_filename = format!("{}_{}.{}", audit_record_id, ts, ext);

    let paths = storage::get_storage_paths()?;
    let dest = paths.uploads_audits.join(&stored_filename);
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
         VALUES ('audit', ?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
        params![audit_record_id, &original_file_name, &stored_filename, file_size, mime_type, current_user_id],
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
         VALUES ('audit', ?1, 'ATTACHMENT_ADDED', ?2, ?3, datetime('now'))",
        params![audit_record_id, &activity_desc, current_user_id],
    );
    let _ = conn.execute(
        "UPDATE audits SET updated_at = datetime('now') WHERE id = ?1",
        params![audit_record_id],
    );

    fetch_attachment(&conn, attachment_id)
}

#[tauri::command]
pub fn open_audit_attachment(current_user_id: i64, attachment_id: i64) -> Result<(), String> {
    permissions::require_authenticated(current_user_id)?;
    let conn = db::open_conn()?;
    let file_path: String = conn
        .query_row(
            "SELECT file_path FROM attachments WHERE id = ?1 AND module = 'audit'",
            params![attachment_id], |row| row.get(0),
        )
        .map_err(|_| "Attachment not found".to_string())?;
    let paths = storage::get_storage_paths()?;
    let full_path = paths.uploads_audits.join(&file_path);
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
pub fn list_audit_attachments(
    current_user_id: i64,
    audit_record_id: i64,
) -> Result<Vec<AuditAttachment>, String> {
    permissions::require_authenticated(current_user_id)?;
    let conn = db::open_conn()?;
    let mut stmt = conn.prepare(
        "SELECT a.id, a.file_name, a.file_path, a.file_size,
                a.uploaded_by, u.full_name, a.uploaded_at
         FROM attachments a
         LEFT JOIN users u ON a.uploaded_by = u.id
         WHERE a.module = 'audit' AND a.record_id = ?1
         ORDER BY a.uploaded_at DESC",
    )
    .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let attachments = stmt.query_map(params![audit_record_id], |row| {
        Ok(AuditAttachment {
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
pub fn get_audit_activity(
    current_user_id: i64,
    audit_record_id: i64,
) -> Result<Vec<AuditActivityEntry>, String> {
    permissions::require_authenticated(current_user_id)?;
    let conn = db::open_conn()?;
    let mut stmt = conn.prepare(
        "SELECT a.id, a.action, a.description,
                a.performed_by, u.full_name, a.performed_at
         FROM activity_log a
         LEFT JOIN users u ON a.performed_by = u.id
         WHERE a.module = 'audit' AND a.record_id = ?1
         ORDER BY a.performed_at DESC",
    )
    .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let entries = stmt.query_map(params![audit_record_id], |row| {
        Ok(AuditActivityEntry {
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
