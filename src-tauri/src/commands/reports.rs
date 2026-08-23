use rusqlite::params;
use serde::Serialize;
use crate::{db, permissions};

// ── Report row structs ────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct DocumentReportRow {
    pub id: i64,
    pub doc_number: String,
    pub title: String,
    pub category: Option<String>,
    pub version: String,
    pub status: String,
    pub owner_name: Option<String>,
    pub effective_date: Option<String>,
    pub revision_date: Option<String>,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct CapaReportRow {
    pub id: i64,
    pub capa_number: String,
    pub title: String,
    pub capa_type: String,
    pub source_type: Option<String>,
    pub status: String,
    pub priority: Option<String>,
    pub due_date: Option<String>,
    pub responsible_user_name: Option<String>,
    pub closed_at: Option<String>,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct RiskReportRow {
    pub id: i64,
    pub risk_number: String,
    pub title: String,
    pub category: Option<String>,
    pub risk_level: Option<String>,
    pub risk_score: Option<i64>,
    pub status: String,
    pub responsible_user_name: Option<String>,
    pub review_date: Option<String>,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct ComplaintReportRow {
    pub id: i64,
    pub complaint_number: String,
    pub customer_name: String,
    pub customer_id: String,
    pub title: String,
    pub category: Option<String>,
    pub priority: Option<String>,
    pub status: String,
    pub received_date: String,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct AuditReportRow {
    pub id: i64,
    pub audit_number: String,
    pub title: String,
    pub audit_type: Option<String>,
    pub department: Option<String>,
    pub status: String,
    pub planned_date: Option<String>,
    pub actual_date: Option<String>,
    pub lead_auditor_name: Option<String>,
    pub findings_count: i64,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct NcReportRow {
    pub id: i64,
    pub nc_number: String,
    pub title: String,
    pub source: Option<String>,
    pub severity: String,
    pub status: String,
    pub detected_date: Option<String>,
    pub responsible_user_name: Option<String>,
    pub related_capa_id: Option<i64>,
    pub created_at: String,
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Document Register report. All authenticated users.
#[tauri::command]
pub fn get_document_register_report(
    current_user_id: i64,
    status: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
) -> Result<Vec<DocumentReportRow>, String> {
    permissions::require_permission(current_user_id, "reports.view")?;
    let conn = db::open_conn()?;

    let mut stmt = conn.prepare(
        "SELECT d.id, d.doc_number, d.title, d.category, d.version, d.status,
                u.full_name AS owner_name, d.effective_date, d.revision_date, d.created_at
         FROM documents d
         LEFT JOIN users u ON u.id = d.owner_id
         WHERE (?1 IS NULL OR d.status = ?1)
           AND (?2 IS NULL OR date(d.created_at) >= date(?2))
           AND (?3 IS NULL OR date(d.created_at) <= date(?3))
         ORDER BY d.doc_number ASC",
    ).map_err(|e| format!("Failed to prepare document report query: {}", e))?;

    let rows = stmt
        .query_map(params![status, date_from, date_to], |row| {
            Ok(DocumentReportRow {
                id:             row.get(0)?,
                doc_number:     row.get(1)?,
                title:          row.get(2)?,
                category:       row.get(3)?,
                version:        row.get(4)?,
                status:         row.get(5)?,
                owner_name:     row.get(6)?,
                effective_date: row.get(7)?,
                revision_date:  row.get(8)?,
                created_at:     row.get(9)?,
            })
        })
        .map_err(|e| format!("Failed to query document report: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

/// CAPA Report. Admin, QualityManager, Auditor.
#[tauri::command]
pub fn get_capa_report(
    current_user_id: i64,
    status: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    responsible_user_id: Option<i64>,
) -> Result<Vec<CapaReportRow>, String> {
    permissions::require_permission(current_user_id, "reports.run")?;
    let conn = db::open_conn()?;

    let mut stmt = conn.prepare(
        "SELECT c.id, c.capa_number, c.title, c.type AS capa_type,
                c.source AS source_type, c.status, c.priority,
                c.target_date AS due_date, ru.full_name AS responsible_user_name,
                c.closed_at, c.created_at
         FROM capas c
         LEFT JOIN users ru ON ru.id = c.assigned_to
         WHERE (?1 IS NULL OR c.status = ?1)
           AND (?2 IS NULL OR date(c.created_at) >= date(?2))
           AND (?3 IS NULL OR date(c.created_at) <= date(?3))
           AND (?4 IS NULL OR c.assigned_to = ?4)
         ORDER BY c.created_at DESC",
    ).map_err(|e| format!("Failed to prepare CAPA report query: {}", e))?;

    let rows = stmt
        .query_map(params![status, date_from, date_to, responsible_user_id], |row| {
            Ok(CapaReportRow {
                id:                    row.get(0)?,
                capa_number:           row.get(1)?,
                title:                 row.get(2)?,
                capa_type:             row.get(3)?,
                source_type:           row.get(4)?,
                status:                row.get(5)?,
                priority:              row.get(6)?,
                due_date:              row.get(7)?,
                responsible_user_name: row.get(8)?,
                closed_at:             row.get(9)?,
                created_at:            row.get(10)?,
            })
        })
        .map_err(|e| format!("Failed to query CAPA report: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

/// Risk Report. Admin, QualityManager, Auditor.
#[tauri::command]
pub fn get_risk_report(
    current_user_id: i64,
    status: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
) -> Result<Vec<RiskReportRow>, String> {
    permissions::require_permission(current_user_id, "reports.run")?;
    let conn = db::open_conn()?;

    let mut stmt = conn.prepare(
        "SELECT r.id, r.risk_number, r.title, r.category,
                r.risk_level, r.risk_score, r.status,
                u.full_name AS responsible_user_name,
                r.review_date, r.created_at
         FROM risks r
         LEFT JOIN users u ON u.id = r.owner_id
         WHERE (?1 IS NULL OR r.status = ?1)
           AND (?2 IS NULL OR date(r.created_at) >= date(?2))
           AND (?3 IS NULL OR date(r.created_at) <= date(?3))
         ORDER BY r.risk_score DESC, r.created_at DESC",
    ).map_err(|e| format!("Failed to prepare risk report query: {}", e))?;

    let rows = stmt
        .query_map(params![status, date_from, date_to], |row| {
            Ok(RiskReportRow {
                id:                    row.get(0)?,
                risk_number:           row.get(1)?,
                title:                 row.get(2)?,
                category:              row.get(3)?,
                risk_level:            row.get(4)?,
                risk_score:            row.get(5)?,
                status:                row.get(6)?,
                responsible_user_name: row.get(7)?,
                review_date:           row.get(8)?,
                created_at:            row.get(9)?,
            })
        })
        .map_err(|e| format!("Failed to query risk report: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

/// Complaint Report. Admin, QualityManager.
#[tauri::command]
pub fn get_complaint_report(
    current_user_id: i64,
    status: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
) -> Result<Vec<ComplaintReportRow>, String> {
    permissions::require_permission(current_user_id, "reports.run_complaints")?;
    let conn = db::open_conn()?;

    let mut stmt = conn.prepare(
        "SELECT c.id, c.complaint_number, c.customer_name, c.customer_id,
                c.title, c.category, c.priority, c.status,
                c.received_date, c.created_at
         FROM complaints c
         WHERE (?1 IS NULL OR c.status = ?1)
           AND (?2 IS NULL OR date(c.created_at) >= date(?2))
           AND (?3 IS NULL OR date(c.created_at) <= date(?3))
         ORDER BY c.received_date DESC, c.created_at DESC",
    ).map_err(|e| format!("Failed to prepare complaint report query: {}", e))?;

    let rows = stmt
        .query_map(params![status, date_from, date_to], |row| {
            Ok(ComplaintReportRow {
                id:               row.get(0)?,
                complaint_number: row.get(1)?,
                customer_name:    row.get(2)?,
                customer_id:      row.get(3)?,
                title:            row.get(4)?,
                category:         row.get(5)?,
                priority:         row.get(6)?,
                status:           row.get(7)?,
                received_date:    row.get(8)?,
                created_at:       row.get(9)?,
            })
        })
        .map_err(|e| format!("Failed to query complaint report: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

/// Audit Report. Admin, QualityManager, Auditor.
#[tauri::command]
pub fn get_audit_report(
    current_user_id: i64,
    status: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
) -> Result<Vec<AuditReportRow>, String> {
    permissions::require_permission(current_user_id, "reports.run")?;
    let conn = db::open_conn()?;

    let mut stmt = conn.prepare(
        "SELECT a.id, a.audit_number, a.title, a.audit_type, a.department,
                a.status, a.planned_date, a.actual_date,
                u.full_name AS lead_auditor_name,
                (SELECT COUNT(*) FROM audit_findings f WHERE f.audit_id = a.id) AS findings_count,
                a.created_at
         FROM audits a
         LEFT JOIN users u ON u.id = a.lead_auditor_id
         WHERE (?1 IS NULL OR a.status = ?1)
           AND (?2 IS NULL OR date(a.created_at) >= date(?2))
           AND (?3 IS NULL OR date(a.created_at) <= date(?3))
         ORDER BY a.created_at DESC",
    ).map_err(|e| format!("Failed to prepare audit report query: {}", e))?;

    let rows = stmt
        .query_map(params![status, date_from, date_to], |row| {
            Ok(AuditReportRow {
                id:                 row.get(0)?,
                audit_number:       row.get(1)?,
                title:              row.get(2)?,
                audit_type:         row.get(3)?,
                department:         row.get(4)?,
                status:             row.get(5)?,
                planned_date:       row.get(6)?,
                actual_date:        row.get(7)?,
                lead_auditor_name:  row.get(8)?,
                findings_count:     row.get(9)?,
                created_at:         row.get(10)?,
            })
        })
        .map_err(|e| format!("Failed to query audit report: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

/// NC Report. Admin, QualityManager, Auditor.
#[tauri::command]
pub fn get_nc_report(
    current_user_id: i64,
    status: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
) -> Result<Vec<NcReportRow>, String> {
    permissions::require_permission(current_user_id, "reports.run")?;
    let conn = db::open_conn()?;

    let mut stmt = conn.prepare(
        "SELECT n.id, n.nc_number, n.title, n.source, n.severity, n.status,
                n.detected_date, u.full_name AS responsible_user_name,
                n.related_capa_id, n.created_at
         FROM non_conformities n
         LEFT JOIN users u ON u.id = n.assigned_to
         WHERE (?1 IS NULL OR n.status = ?1)
           AND (?2 IS NULL OR date(n.created_at) >= date(?2))
           AND (?3 IS NULL OR date(n.created_at) <= date(?3))
         ORDER BY
             CASE n.severity
                 WHEN 'CRITICAL' THEN 1
                 WHEN 'HIGH'     THEN 2
                 WHEN 'MEDIUM'   THEN 3
                 ELSE 4
             END,
             n.created_at DESC",
    ).map_err(|e| format!("Failed to prepare NC report query: {}", e))?;

    let rows = stmt
        .query_map(params![status, date_from, date_to], |row| {
            Ok(NcReportRow {
                id:                    row.get(0)?,
                nc_number:             row.get(1)?,
                title:                 row.get(2)?,
                source:                row.get(3)?,
                severity:              row.get(4)?,
                status:                row.get(5)?,
                detected_date:         row.get(6)?,
                responsible_user_name: row.get(7)?,
                related_capa_id:       row.get(8)?,
                created_at:            row.get(9)?,
            })
        })
        .map_err(|e| format!("Failed to query NC report: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}
