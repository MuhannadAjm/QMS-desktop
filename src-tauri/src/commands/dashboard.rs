use rusqlite::params;
use serde::Serialize;
use crate::{db, permissions};

// ── Structs ───────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct DashboardSummary {
    pub open_capas: i64,
    pub overdue_capas: i64,
    pub closed_capas: i64,
    pub high_risks: i64,
    pub open_risks: i64,
    pub open_complaints: i64,
    pub total_complaints: i64,
    pub open_ncs: i64,
    pub high_critical_ncs: i64,
    pub open_audits: i64,
    pub closed_audits: i64,
    pub controlled_documents: i64,
    pub obsolete_documents: i64,
}

#[derive(Serialize)]
pub struct DashboardActivity {
    pub id: i64,
    pub module: String,
    pub record_id: i64,
    pub action: String,
    pub description: Option<String>,
    pub performed_by: Option<i64>,
    pub performed_by_name: Option<String>,
    pub performed_at: String,
}

#[derive(Serialize)]
pub struct OverdueCapa {
    pub id: i64,
    pub capa_number: String,
    pub title: String,
    pub due_date: Option<String>,
    pub responsible_user_name: Option<String>,
    pub priority: Option<String>,
}

#[derive(Serialize)]
pub struct HighRiskItem {
    pub id: i64,
    pub risk_number: String,
    pub title: String,
    pub risk_level: Option<String>,
    pub risk_score: Option<i64>,
    pub responsible_user_name: Option<String>,
}

#[derive(Serialize)]
pub struct OpenNcItem {
    pub id: i64,
    pub nc_number: String,
    pub title: String,
    pub severity: String,
    pub status: String,
    pub detected_date: Option<String>,
    pub responsible_user_name: Option<String>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn count(conn: &rusqlite::Connection, sql: &str) -> Result<i64, String> {
    conn.query_row(sql, [], |row| row.get::<_, i64>(0))
        .map_err(|e| format!("Dashboard count failed: {}", e))
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_dashboard_summary(current_user_id: i64) -> Result<DashboardSummary, String> {
    permissions::require_authenticated(current_user_id)?;
    let conn = db::open_conn()?;

    Ok(DashboardSummary {
        open_capas:
            count(&conn, "SELECT COUNT(*) FROM capas WHERE status = 'OPEN'")?,
        overdue_capas:
            count(&conn, "SELECT COUNT(*) FROM capas WHERE status = 'OPEN' AND target_date IS NOT NULL AND target_date < date('now')")?,
        closed_capas:
            count(&conn, "SELECT COUNT(*) FROM capas WHERE status = 'CLOSED'")?,
        high_risks:
            count(&conn, "SELECT COUNT(*) FROM risks WHERE risk_level IN ('HIGH','CRITICAL') AND status = 'OPEN'")?,
        open_risks:
            count(&conn, "SELECT COUNT(*) FROM risks WHERE status = 'OPEN'")?,
        open_complaints:
            count(&conn, "SELECT COUNT(*) FROM complaints WHERE status = 'OPEN'")?,
        total_complaints:
            count(&conn, "SELECT COUNT(*) FROM complaints")?,
        open_ncs:
            count(&conn, "SELECT COUNT(*) FROM non_conformities WHERE status IN ('OPEN','IN_REVIEW')")?,
        high_critical_ncs:
            count(&conn, "SELECT COUNT(*) FROM non_conformities WHERE severity IN ('HIGH','CRITICAL') AND status != 'CLOSED'")?,
        open_audits:
            count(&conn, "SELECT COUNT(*) FROM audits WHERE status = 'OPEN'")?,
        closed_audits:
            count(&conn, "SELECT COUNT(*) FROM audits WHERE status = 'CLOSED'")?,
        controlled_documents:
            count(&conn, "SELECT COUNT(*) FROM documents WHERE status = 'CONTROLLED'")?,
        obsolete_documents:
            count(&conn, "SELECT COUNT(*) FROM documents WHERE status = 'OBSOLETE'")?,
    })
}

#[tauri::command]
pub fn get_dashboard_recent_activity(
    current_user_id: i64,
    limit: i64,
) -> Result<Vec<DashboardActivity>, String> {
    permissions::require_authenticated(current_user_id)?;
    let conn = db::open_conn()?;

    let mut stmt = conn.prepare(
        "SELECT a.id, a.module, a.record_id, a.action, a.description,
                a.performed_by, u.full_name, a.performed_at
         FROM activity_log a
         LEFT JOIN users u ON u.id = a.performed_by
         ORDER BY a.performed_at DESC
         LIMIT ?1",
    ).map_err(|e| format!("Failed to prepare activity query: {}", e))?;

    let rows = stmt
        .query_map(params![limit], |row| {
            Ok(DashboardActivity {
                id:                row.get(0)?,
                module:            row.get(1)?,
                record_id:         row.get(2)?,
                action:            row.get(3)?,
                description:       row.get(4)?,
                performed_by:      row.get(5)?,
                performed_by_name: row.get(6)?,
                performed_at:      row.get(7)?,
            })
        })
        .map_err(|e| format!("Failed to query activity: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

#[tauri::command]
pub fn get_dashboard_overdue_capas(
    current_user_id: i64,
    limit: i64,
) -> Result<Vec<OverdueCapa>, String> {
    permissions::require_authenticated(current_user_id)?;
    let conn = db::open_conn()?;

    let mut stmt = conn.prepare(
        "SELECT c.id, c.capa_number, c.title, c.target_date,
                u.full_name, c.priority
         FROM capas c
         LEFT JOIN users u ON u.id = c.assigned_to
         WHERE c.status = 'OPEN'
           AND c.target_date IS NOT NULL
           AND c.target_date < date('now')
         ORDER BY c.target_date ASC
         LIMIT ?1",
    ).map_err(|e| format!("Failed to prepare overdue CAPAs query: {}", e))?;

    let rows = stmt
        .query_map(params![limit], |row| {
            Ok(OverdueCapa {
                id:                    row.get(0)?,
                capa_number:           row.get(1)?,
                title:                 row.get(2)?,
                due_date:              row.get(3)?,
                responsible_user_name: row.get(4)?,
                priority:              row.get(5)?,
            })
        })
        .map_err(|e| format!("Failed to query overdue CAPAs: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

#[tauri::command]
pub fn get_dashboard_high_risks(
    current_user_id: i64,
    limit: i64,
) -> Result<Vec<HighRiskItem>, String> {
    permissions::require_authenticated(current_user_id)?;
    let conn = db::open_conn()?;

    let mut stmt = conn.prepare(
        "SELECT r.id, r.risk_number, r.title, r.risk_level, r.risk_score,
                u.full_name
         FROM risks r
         LEFT JOIN users u ON u.id = r.owner_id
         WHERE r.risk_level IN ('HIGH','CRITICAL') AND r.status = 'OPEN'
         ORDER BY r.risk_score DESC, r.risk_level ASC
         LIMIT ?1",
    ).map_err(|e| format!("Failed to prepare high risks query: {}", e))?;

    let rows = stmt
        .query_map(params![limit], |row| {
            Ok(HighRiskItem {
                id:                    row.get(0)?,
                risk_number:           row.get(1)?,
                title:                 row.get(2)?,
                risk_level:            row.get(3)?,
                risk_score:            row.get(4)?,
                responsible_user_name: row.get(5)?,
            })
        })
        .map_err(|e| format!("Failed to query high risks: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

#[tauri::command]
pub fn get_dashboard_open_ncs(
    current_user_id: i64,
    limit: i64,
) -> Result<Vec<OpenNcItem>, String> {
    permissions::require_authenticated(current_user_id)?;
    let conn = db::open_conn()?;

    let mut stmt = conn.prepare(
        "SELECT n.id, n.nc_number, n.title, n.severity, n.status, n.detected_date,
                u.full_name
         FROM non_conformities n
         LEFT JOIN users u ON u.id = n.assigned_to
         WHERE n.status IN ('OPEN','IN_REVIEW')
         ORDER BY
             CASE n.severity
                 WHEN 'CRITICAL' THEN 1
                 WHEN 'HIGH'     THEN 2
                 WHEN 'MEDIUM'   THEN 3
                 ELSE 4
             END,
             n.detected_date ASC
         LIMIT ?1",
    ).map_err(|e| format!("Failed to prepare open NCs query: {}", e))?;

    let rows = stmt
        .query_map(params![limit], |row| {
            Ok(OpenNcItem {
                id:                    row.get(0)?,
                nc_number:             row.get(1)?,
                title:                 row.get(2)?,
                severity:              row.get(3)?,
                status:                row.get(4)?,
                detected_date:         row.get(5)?,
                responsible_user_name: row.get(6)?,
            })
        })
        .map_err(|e| format!("Failed to query open NCs: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}
