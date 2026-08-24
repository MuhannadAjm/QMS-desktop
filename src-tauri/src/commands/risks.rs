use rusqlite::params;
use serde::Serialize;
use crate::{db, permissions, storage};

// ── Structs ──────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct RiskListItem {
    pub id: i64,
    pub risk_number: String,
    pub title: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub process: Option<String>,
    pub source: Option<String>,
    pub who_might_be_affected: Option<String>,
    pub severity: i64,
    pub likelihood: i64,
    pub risk_score: i64,
    pub risk_level: Option<String>,
    pub status: String,
    pub mitigation_plan: Option<String>,
    pub recommended_actions: Option<String>,
    pub time_scale: Option<String>,
    pub residual_severity: Option<i64>,
    pub residual_likelihood: Option<i64>,
    pub residual_score: Option<i64>,
    pub responsible_user_id: Option<i64>,
    pub responsible_user_name: Option<String>,
    pub review_date: Option<String>,
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
}

#[derive(Serialize)]
pub struct RiskAttachment {
    pub id: i64,
    pub file_name: String,
    pub file_path: String,
    pub file_size: Option<i64>,
    pub uploaded_by: Option<i64>,
    pub uploaded_by_name: Option<String>,
    pub uploaded_at: String,
}

#[derive(Serialize)]
pub struct RiskActivityEntry {
    pub id: i64,
    pub action: String,
    pub description: Option<String>,
    pub performed_by: Option<i64>,
    pub performed_by_name: Option<String>,
    pub performed_at: String,
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RISK_SQL: &str =
    "SELECT r.id, r.risk_number, r.title, r.description, r.category, r.process,
            r.source, r.who_might_be_affected,
            r.severity, r.likelihood, r.risk_score, r.risk_level, r.status,
            r.mitigation_plan, r.recommended_actions, r.time_scale,
            r.residual_severity, r.residual_likelihood, r.residual_score,
            r.owner_id AS responsible_user_id, ru.full_name AS responsible_user_name,
            r.review_date, r.closed_at,
            r.created_by, cu.full_name AS created_by_name,
            r.created_at, r.updated_at,
            r.related_nc_id, rn.nc_number AS related_nc_number,
            r.related_capa_id, rca.capa_number AS related_capa_number
     FROM risks r
     LEFT JOIN users ru ON r.owner_id = ru.id
     LEFT JOIN users cu ON r.created_by = cu.id
     LEFT JOIN non_conformities rn ON r.related_nc_id = rn.id
     LEFT JOIN capas rca ON r.related_capa_id = rca.id";

// ── Validation helpers ────────────────────────────────────────────────────────

fn validate_severity_likelihood(val: i64, field: &str) -> Result<(), String> {
    if val < 1 || val > 5 {
        return Err(format!("{} must be between 1 and 5", field));
    }
    Ok(())
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

fn compute_risk_level(score: i64) -> &'static str {
    match score {
        1..=4   => "LOW",
        5..=9   => "MEDIUM",
        10..=19 => "HIGH",
        _       => "CRITICAL",
    }
}

// ── Private fetch helpers ─────────────────────────────────────────────────────

fn map_risk_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<RiskListItem> {
    Ok(RiskListItem {
        id:                     row.get(0)?,
        risk_number:            row.get(1)?,
        title:                  row.get(2)?,
        description:            row.get(3)?,
        category:               row.get(4)?,
        process:                row.get(5)?,
        source:                 row.get(6)?,
        who_might_be_affected:  row.get(7)?,
        severity:               row.get(8)?,
        likelihood:             row.get(9)?,
        risk_score:             row.get(10)?,
        risk_level:             row.get(11)?,
        status:                 row.get(12)?,
        mitigation_plan:        row.get(13)?,
        recommended_actions:    row.get(14)?,
        time_scale:             row.get(15)?,
        residual_severity:      row.get(16)?,
        residual_likelihood:    row.get(17)?,
        residual_score:         row.get(18)?,
        responsible_user_id:    row.get(19)?,
        responsible_user_name:  row.get(20)?,
        review_date:            row.get(21)?,
        closed_at:              row.get(22)?,
        created_by:             row.get(23)?,
        created_by_name:        row.get(24)?,
        created_at:             row.get(25)?,
        updated_at:             row.get(26)?,
        related_nc_id:          row.get(27)?,
        related_nc_number:      row.get(28)?,
        related_capa_id:        row.get(29)?,
        related_capa_number:    row.get(30)?,
    })
}

fn fetch_risk(conn: &rusqlite::Connection, risk_id: i64) -> Result<RiskListItem, String> {
    let sql = format!("{} WHERE r.id = ?1", RISK_SQL);
    conn.query_row(&sql, params![risk_id], map_risk_row)
        .map_err(|e| format!("Risk not found: {}", e))
}

fn fetch_risk_attachment(conn: &rusqlite::Connection, attachment_id: i64) -> Result<RiskAttachment, String> {
    conn.query_row(
        "SELECT a.id, a.file_name, a.file_path, a.file_size,
                a.uploaded_by, u.full_name AS uploaded_by_name, a.uploaded_at
         FROM attachments a
         LEFT JOIN users u ON a.uploaded_by = u.id
         WHERE a.id = ?1 AND a.module = 'risk'",
        params![attachment_id],
        |row| {
            Ok(RiskAttachment {
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

fn get_risk_prefix(conn: &rusqlite::Connection) -> String {
    let prefix: String = conn
        .query_row(
            "SELECT COALESCE(value, 'RISK') FROM settings WHERE key = 'risk_prefix'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "RISK".to_string());
    if prefix.trim().is_empty() { "RISK".to_string() } else { prefix.trim().to_string() }
}

fn generate_risk_number(conn: &rusqlite::Connection) -> Result<String, String> {
    let prefix = get_risk_prefix(conn);
    let year: String = conn
        .query_row("SELECT strftime('%Y', 'now')", [], |row| row.get(0))
        .map_err(|e| format!("Failed to get current year: {}", e))?;
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM risks WHERE risk_number LIKE ?1",
            params![format!("{}-{}-%" , prefix, year)],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to count risks for numbering: {}", e))?;
    Ok(format!("{}-{}-{:04}", prefix, year, count + 1))
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// List all risks. Requires any authenticated user.
#[tauri::command]
pub fn list_risks(current_user_id: i64) -> Result<Vec<RiskListItem>, String> {
    permissions::require_permission(current_user_id, "risks.view")?;

    let conn = db::open_conn()?;
    let sql = format!("{} ORDER BY r.risk_number ASC", RISK_SQL);
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let risks = stmt
        .query_map([], map_risk_row)
        .map_err(|e| format!("Failed to query risks: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(risks)
}

/// Get a single risk by ID. Requires any authenticated user.
#[tauri::command]
pub fn get_risk(current_user_id: i64, risk_record_id: i64) -> Result<RiskListItem, String> {
    permissions::require_permission(current_user_id, "risks.view")?;
    let conn = db::open_conn()?;
    fetch_risk(&conn, risk_record_id)
}

/// Create a new risk with auto-generated risk number. Requires Admin or QualityManager.
#[tauri::command]
pub fn create_risk(
    current_user_id: i64,
    title: String,
    description: Option<String>,
    category: Option<String>,
    process: Option<String>,
    source: Option<String>,
    who_might_be_affected: Option<String>,
    severity: i64,
    likelihood: i64,
    mitigation_plan: Option<String>,
    recommended_actions: Option<String>,
    time_scale: Option<String>,
    owner_id: i64,
    review_date: Option<String>,
) -> Result<RiskListItem, String> {
    permissions::require_permission(current_user_id, "risks.create")?;

    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("Hazard description (title) is required".to_string());
    }
    validate_severity_likelihood(severity, "Severity")?;
    validate_severity_likelihood(likelihood, "Likelihood")?;

    let conn = db::open_conn()?;

    let owner_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE id = ?1 AND is_active = 1",
            params![owner_id],
            |row| row.get::<_, i64>(0),
        )
        .map(|c| c > 0)
        .unwrap_or(false);
    if !owner_exists {
        return Err("Responsible user not found or inactive".to_string());
    }

    let score = severity * likelihood;
    let risk_level = compute_risk_level(score);
    let risk_number = generate_risk_number(&conn)?;

    conn.execute(
        "INSERT INTO risks
             (risk_number, title, description, category, process, source, source_id,
              who_might_be_affected, severity, likelihood, risk_level, status,
              mitigation_plan, recommended_actions, time_scale,
              owner_id, review_date, created_by, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, (SELECT id FROM risk_sources WHERE name = ?6), ?7, ?8, ?9, ?10, 'OPEN',
                 ?11, ?12, ?13, ?14, ?15, ?16, datetime('now'), datetime('now'))",
        params![
            &risk_number, &title, &description, &category, &process, &source,
            &who_might_be_affected, severity, likelihood, risk_level,
            &mitigation_plan, &recommended_actions, &time_scale,
            owner_id, &review_date, current_user_id
        ],
    )
    .map_err(|e| format!("Failed to create risk: {}", e))?;

    let id = conn.last_insert_rowid();

    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('risk', ?1, 'CREATED', ?2, ?3, datetime('now'))",
        params![
            id,
            format!("Risk created: {} — {}", &risk_number, &title),
            current_user_id
        ],
    );

    fetch_risk(&conn, id)
}

/// Update risk metadata. Requires Admin or QualityManager.
#[tauri::command]
pub fn update_risk(
    current_user_id: i64,
    risk_record_id: i64,
    title: String,
    description: Option<String>,
    category: Option<String>,
    process: Option<String>,
    source: Option<String>,
    who_might_be_affected: Option<String>,
    severity: i64,
    likelihood: i64,
    mitigation_plan: Option<String>,
    recommended_actions: Option<String>,
    time_scale: Option<String>,
    owner_id: i64,
    review_date: Option<String>,
) -> Result<RiskListItem, String> {
    permissions::require_permission(current_user_id, "risks.edit")?;

    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("Hazard description (title) is required".to_string());
    }
    validate_severity_likelihood(severity, "Severity")?;
    validate_severity_likelihood(likelihood, "Likelihood")?;

    let conn = db::open_conn()?;

    let owner_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE id = ?1 AND is_active = 1",
            params![owner_id],
            |row| row.get::<_, i64>(0),
        )
        .map(|c| c > 0)
        .unwrap_or(false);
    if !owner_exists {
        return Err("Responsible user not found or inactive".to_string());
    }

    let score = severity * likelihood;
    let risk_level = compute_risk_level(score);

    conn.execute(
        "UPDATE risks
         SET title = ?1, description = ?2, category = ?3, process = ?4,
             source = ?5,
               -- Re-resolve the stable FK from the chosen label. The label
               -- itself stays the historical snapshot for this edit; a later
               -- master rename will not rewrite it. See migration 009.
               source_id = (SELECT id FROM risk_sources WHERE name = ?5),
               who_might_be_affected = ?6,
             severity = ?7, likelihood = ?8, risk_level = ?9,
             mitigation_plan = ?10, recommended_actions = ?11, time_scale = ?12,
             owner_id = ?13, review_date = ?14, updated_at = datetime('now')
         WHERE id = ?15",
        params![
            &title, &description, &category, &process, &source, &who_might_be_affected,
            severity, likelihood, risk_level,
            &mitigation_plan, &recommended_actions, &time_scale,
            owner_id, &review_date, risk_record_id
        ],
    )
    .map_err(|e| format!("Failed to update risk: {}", e))?;

    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('risk', ?1, 'UPDATED', 'Risk metadata updated', ?2, datetime('now'))",
        params![risk_record_id, current_user_id],
    );

    fetch_risk(&conn, risk_record_id)
}

/// Change risk status (OPEN / CLOSED). Requires Admin or QualityManager.
#[tauri::command]
pub fn set_risk_status(
    current_user_id: i64,
    risk_record_id: i64,
    status: String,
) -> Result<RiskListItem, String> {
    permissions::require_permission(current_user_id, "risks.edit")?;

    match status.as_str() {
        "OPEN" | "CLOSED" => {}
        _ => return Err(format!("Invalid status: {}. Must be OPEN or CLOSED", status)),
    }

    let conn = db::open_conn()?;

    if status == "CLOSED" {
        conn.execute(
            "UPDATE risks
             SET status = 'CLOSED', closed_at = datetime('now'), updated_at = datetime('now')
             WHERE id = ?1",
            params![risk_record_id],
        )
        .map_err(|e| format!("Failed to close risk: {}", e))?;

        let _ = conn.execute(
            "INSERT INTO activity_log
                 (module, record_id, action, description, performed_by, performed_at)
             VALUES ('risk', ?1, 'CLOSED', 'Risk closed', ?2, datetime('now'))",
            params![risk_record_id, current_user_id],
        );
    } else {
        conn.execute(
            "UPDATE risks
             SET status = 'OPEN', closed_at = NULL, updated_at = datetime('now')
             WHERE id = ?1",
            params![risk_record_id],
        )
        .map_err(|e| format!("Failed to reopen risk: {}", e))?;

        let _ = conn.execute(
            "INSERT INTO activity_log
                 (module, record_id, action, description, performed_by, performed_at)
             VALUES ('risk', ?1, 'REOPENED', 'Risk reopened', ?2, datetime('now'))",
            params![risk_record_id, current_user_id],
        );
    }

    fetch_risk(&conn, risk_record_id)
}

/// Get activity log entries for a risk. Requires any authenticated user.
#[tauri::command]
pub fn get_risk_activity(
    current_user_id: i64,
    risk_record_id: i64,
) -> Result<Vec<RiskActivityEntry>, String> {
    permissions::require_permission(current_user_id, "risks.view")?;

    let conn = db::open_conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.action, a.description,
                    a.performed_by, u.full_name AS performed_by_name, a.performed_at
             FROM activity_log a
             LEFT JOIN users u ON a.performed_by = u.id
             WHERE a.module = 'risk' AND a.record_id = ?1
             ORDER BY a.performed_at DESC",
        )
        .map_err(|e| format!("Failed to prepare activity query: {}", e))?;

    let entries = stmt
        .query_map(params![risk_record_id], |row| {
            Ok(RiskActivityEntry {
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

/// Attach a file to a risk. Validates extension, copies to uploads/risks/, logs activity.
/// Requires Admin or QualityManager.
#[tauri::command]
pub fn attach_risk_file(
    current_user_id: i64,
    risk_record_id: i64,
    source_file_path: String,
    original_file_name: String,
    note: Option<String>,
) -> Result<RiskAttachment, String> {
    permissions::require_permission(current_user_id, "risks.attach")?;

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
    let stored_filename = format!("{}_{}.{}", risk_record_id, timestamp_micros, ext);

    let paths = storage::get_storage_paths()?;
    let dest_path = paths.uploads_risks.join(&stored_filename);
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
         VALUES ('risk', ?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
        params![
            risk_record_id, &original_file_name, &stored_filename,
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
         VALUES ('risk', ?1, 'ATTACHMENT_ADDED', ?2, ?3, datetime('now'))",
        params![risk_record_id, &activity_desc, current_user_id],
    );

    let _ = conn.execute(
        "UPDATE risks SET updated_at = datetime('now') WHERE id = ?1",
        params![risk_record_id],
    );

    fetch_risk_attachment(&conn, attachment_id)
}

/// Open a risk attachment file using the Windows default application.
/// Requires any authenticated user.
#[tauri::command]
pub fn open_risk_attachment(current_user_id: i64, attachment_id: i64) -> Result<(), String> {
    permissions::require_permission(current_user_id, "risks.view")?;

    let conn = db::open_conn()?;
    let file_path: String = conn
        .query_row(
            "SELECT file_path FROM attachments WHERE id = ?1 AND module = 'risk'",
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
    let real = storage::resolve_managed_file(&paths.uploads_risks, &file_path)?;

    std::process::Command::new("cmd")
        .arg("/c")
        .arg("start")
        .arg("")
        .arg(real.as_os_str())
        .spawn()
        .map_err(|e| format!("Failed to open file: {}", e))?;

    Ok(())
}

/// List all attachments for a risk. Requires any authenticated user.
#[tauri::command]
pub fn list_risk_attachments(
    current_user_id: i64,
    risk_record_id: i64,
) -> Result<Vec<RiskAttachment>, String> {
    permissions::require_permission(current_user_id, "risks.view")?;

    let conn = db::open_conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.file_name, a.file_path, a.file_size,
                    a.uploaded_by, u.full_name AS uploaded_by_name, a.uploaded_at
             FROM attachments a
             LEFT JOIN users u ON a.uploaded_by = u.id
             WHERE a.module = 'risk' AND a.record_id = ?1
             ORDER BY a.uploaded_at DESC",
        )
        .map_err(|e| format!("Failed to prepare attachment query: {}", e))?;

    let attachments = stmt
        .query_map(params![risk_record_id], |row| {
            Ok(RiskAttachment {
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

/// Create a Non-Conformity from a Risk.
/// Duplicate prevented: if related_nc_id is already set, returns an error.
/// Requires Admin or QualityManager.
#[tauri::command]
pub fn create_nc_from_risk(
    current_user_id: i64,
    risk_record_id: i64,
) -> Result<RiskListItem, String> {
    permissions::require_permission(current_user_id, "nc.create")?;

    let conn = db::open_conn()?;

    let (risk_number, risk_title, already_nc_id): (String, String, Option<i64>) = conn
        .query_row(
            "SELECT risk_number, title, related_nc_id FROM risks WHERE id = ?1",
            params![risk_record_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| "Risk not found".to_string())?;

    if already_nc_id.is_some() {
        return Err(
            "A Non-Conformity already exists for this Risk. Duplicate NC creation is not allowed.".to_string(),
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

    let nc_title_raw = format!("NC from Risk {} — {}", &risk_number, &risk_title);
    let nc_title = if nc_title_raw.len() > 250 {
        format!("{}...", &nc_title_raw[..247])
    } else {
        nc_title_raw
    };

    conn.execute(
        "INSERT INTO non_conformities
             (nc_number, title, source, source_id,
              severity, status, detected_date, created_by, created_at, updated_at)
         VALUES (?1, ?2, 'RISK', ?3, 'MEDIUM', 'OPEN', date('now'), ?4,
                 datetime('now'), datetime('now'))",
        params![&nc_number, &nc_title, risk_record_id, current_user_id],
    )
    .map_err(|e| format!("Failed to create Non-Conformity: {}", e))?;

    let nc_id = conn.last_insert_rowid();

    conn.execute(
        "UPDATE risks SET related_nc_id = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![nc_id, risk_record_id],
    )
    .map_err(|e| format!("Failed to link NC to Risk: {}", e))?;

    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('risk', ?1, 'NC_CREATED', ?2, ?3, datetime('now'))",
        params![
            risk_record_id,
            format!("Non-Conformity {} created from this Risk", &nc_number),
            current_user_id
        ],
    );

    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('nc', ?1, 'CREATED', ?2, ?3, datetime('now'))",
        params![
            nc_id,
            format!("NC {} created from Risk {} ({})", &nc_number, &risk_number, &risk_title),
            current_user_id
        ],
    );

    fetch_risk(&conn, risk_record_id)
}

/// Create a CAPA from a Risk.
/// Duplicate prevented: if related_capa_id is already set, returns an error.
/// Requires Admin or QualityManager.
#[tauri::command]
pub fn create_capa_from_risk(
    current_user_id: i64,
    risk_record_id: i64,
) -> Result<RiskListItem, String> {
    permissions::require_permission(current_user_id, "capa.create")?;

    let conn = db::open_conn()?;

    let (risk_number, risk_title, already_capa_id): (String, String, Option<i64>) = conn
        .query_row(
            "SELECT risk_number, title, related_capa_id FROM risks WHERE id = ?1",
            params![risk_record_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| "Risk not found".to_string())?;

    if already_capa_id.is_some() {
        return Err(
            "A CAPA already exists for this Risk. Duplicate CAPA creation is not allowed.".to_string(),
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

    let capa_title_raw = format!("CAPA for Risk {} — {}", &risk_number, &risk_title);
    let capa_title = if capa_title_raw.len() > 250 {
        format!("{}...", &capa_title_raw[..247])
    } else {
        capa_title_raw
    };

    conn.execute(
        "INSERT INTO capas
             (capa_number, title, type, source, source_id, status, created_by,
              created_at, updated_at)
         VALUES (?1, ?2, 'CORRECTIVE', 'RISK', ?3, 'OPEN', ?4,
                 datetime('now'), datetime('now'))",
        params![&capa_number, &capa_title, risk_record_id, current_user_id],
    )
    .map_err(|e| format!("Failed to create CAPA: {}", e))?;

    let capa_id = conn.last_insert_rowid();

    conn.execute(
        "UPDATE risks SET related_capa_id = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![capa_id, risk_record_id],
    )
    .map_err(|e| format!("Failed to link CAPA to Risk: {}", e))?;

    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('risk', ?1, 'CAPA_CREATED', ?2, ?3, datetime('now'))",
        params![
            risk_record_id,
            format!("CAPA {} created from this Risk", &capa_number),
            current_user_id
        ],
    );

    let _ = conn.execute(
        "INSERT INTO activity_log
             (module, record_id, action, description, performed_by, performed_at)
         VALUES ('capa', ?1, 'CREATED', ?2, ?3, datetime('now'))",
        params![
            capa_id,
            format!("CAPA {} created from Risk {} ({})", &capa_number, &risk_number, &risk_title),
            current_user_id
        ],
    );

    fetch_risk(&conn, risk_record_id)
}
