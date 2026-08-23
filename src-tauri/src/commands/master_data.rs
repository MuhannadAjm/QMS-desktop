//! Administrator-managed master data: Risk Sources and Customers.
//!
//! These replace hard-coded frontend arrays so the owner can change normal
//! business lookup values without a code change.
//!
//! Deletion policy: master data is NEVER hard-deleted once it can be referenced
//! by a QMS record. Values are deactivated instead, which removes them from
//! selectors while leaving historical records readable. This is a controlled-
//! records requirement, not a convenience.

use rusqlite::params;
use serde::Serialize;

use crate::{db, permissions};

// ── Shapes ────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct RiskSource {
    pub id: i64,
    pub name: String,
    pub sort_order: i64,
    pub is_active: bool,
    /// How many risks currently reference this source by name. Drives whether the
    /// admin UI offers rename/deactivate rather than any destructive option.
    pub usage_count: i64,
}

#[derive(Serialize)]
pub struct Customer {
    pub id: i64,
    pub customer_code: String,
    pub customer_name: String,
    pub contact_email: Option<String>,
    pub contact_phone: Option<String>,
    pub notes: Option<String>,
    pub is_active: bool,
    pub complaint_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// Slim shape for pickers — avoids shipping notes/contact details into every form.
#[derive(Serialize)]
pub struct CustomerOption {
    pub id: i64,
    pub customer_code: String,
    pub customer_name: String,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn log_admin_activity(
    conn: &rusqlite::Connection,
    record_id: i64,
    action: &str,
    description: &str,
    performed_by: i64,
) {
    // Best-effort: a failed audit write must not fail the business operation,
    // but it must not be silent either — surface it on stderr for the log.
    if let Err(e) = conn.execute(
        "INSERT INTO activity_log (module, record_id, action, description, performed_by, performed_at)
         VALUES ('master_data', ?1, ?2, ?3, ?4, datetime('now'))",
        params![record_id, action, description, performed_by],
    ) {
        eprintln!("activity_log write failed for master_data/{}: {}", action, e);
    }
}

// ── Risk Sources ──────────────────────────────────────────────────────────────

/// Active risk sources, ordered for display. Used by the Risk create/edit form.
/// Any authenticated user may read these — they are selectable values, not settings.
#[tauri::command]
pub fn list_risk_sources(current_user_id: i64) -> Result<Vec<RiskSource>, String> {
    permissions::require_authenticated(current_user_id)?;
    query_risk_sources(true)
}

/// Every risk source including deactivated ones. Administration screen only.
#[tauri::command]
pub fn list_all_risk_sources(current_user_id: i64) -> Result<Vec<RiskSource>, String> {
    permissions::require_admin_or_quality_manager(current_user_id)?;
    query_risk_sources(false)
}

fn query_risk_sources(active_only: bool) -> Result<Vec<RiskSource>, String> {
    let conn = db::open_conn()?;

    let sql = "SELECT s.id, s.name, s.sort_order, s.is_active,
                      (SELECT COUNT(*) FROM risks r WHERE r.source = s.name)
               FROM risk_sources s
               {WHERE}
               ORDER BY s.sort_order ASC, s.name ASC";
    let sql = sql.replace("{WHERE}", if active_only { "WHERE s.is_active = 1" } else { "" });

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Failed to prepare risk source query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(RiskSource {
                id:          row.get(0)?,
                name:        row.get(1)?,
                sort_order:  row.get(2)?,
                is_active:   row.get::<_, i64>(3)? == 1,
                usage_count: row.get(4)?,
            })
        })
        .map_err(|e| format!("Failed to query risk sources: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

#[tauri::command]
pub fn create_risk_source(current_user_id: i64, name: String) -> Result<i64, String> {
    permissions::require_admin_or_quality_manager(current_user_id)?;

    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Risk source name is required".to_string());
    }
    if name.len() > 100 {
        return Err("Risk source name must be 100 characters or fewer".to_string());
    }

    let conn = db::open_conn()?;

    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM risk_sources WHERE lower(name) = lower(?1)",
            params![&name],
            |r| r.get(0),
        )
        .map_err(|e| format!("Failed to check for duplicate: {}", e))?;
    if exists > 0 {
        return Err(format!("A risk source named '{}' already exists", name));
    }

    let next_order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), 0) + 10 FROM risk_sources",
            [],
            |r| r.get(0),
        )
        .unwrap_or(10);

    conn.execute(
        "INSERT INTO risk_sources (name, sort_order, is_active, created_at, updated_at)
         VALUES (?1, ?2, 1, datetime('now'), datetime('now'))",
        params![&name, next_order],
    )
    .map_err(|e| format!("Failed to create risk source: {}", e))?;

    let id = conn.last_insert_rowid();
    log_admin_activity(&conn, id, "CREATE", &format!("Risk source '{}' created", name), current_user_id);
    Ok(id)
}

/// Rename a risk source.
///
/// risks.source stores the source NAME as free text, so a rename would orphan the
/// display value on historical risks. To keep those records readable the existing
/// rows are re-pointed to the new name in the same transaction — the risk still
/// shows a meaningful source rather than a dangling string. Callers are told how
/// many records were affected so the UI can warn before committing.
#[tauri::command]
pub fn rename_risk_source(
    current_user_id: i64,
    id: i64,
    new_name: String,
) -> Result<i64, String> {
    permissions::require_admin_or_quality_manager(current_user_id)?;

    let new_name = new_name.trim().to_string();
    if new_name.is_empty() {
        return Err("Risk source name is required".to_string());
    }

    let mut conn = db::open_conn()?;

    let old_name: String = conn
        .query_row("SELECT name FROM risk_sources WHERE id = ?1", params![id], |r| r.get(0))
        .map_err(|_| "Risk source not found".to_string())?;

    if old_name == new_name {
        return Ok(0);
    }

    let clash: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM risk_sources WHERE lower(name) = lower(?1) AND id != ?2",
            params![&new_name, id],
            |r| r.get(0),
        )
        .map_err(|e| format!("Failed to check for duplicate: {}", e))?;
    if clash > 0 {
        return Err(format!("A risk source named '{}' already exists", new_name));
    }

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    let affected = tx
        .execute(
            "UPDATE risks SET source = ?1, updated_at = datetime('now') WHERE source = ?2",
            params![&new_name, &old_name],
        )
        .map_err(|e| format!("Failed to re-point existing risks: {}", e))? as i64;

    tx.execute(
        "UPDATE risk_sources SET name = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![&new_name, id],
    )
    .map_err(|e| format!("Failed to rename risk source: {}", e))?;

    tx.execute(
        "INSERT INTO activity_log (module, record_id, action, description, performed_by, performed_at)
         VALUES ('master_data', ?1, 'RENAME', ?2, ?3, datetime('now'))",
        params![
            id,
            format!("Risk source '{}' renamed to '{}'; {} risk record(s) re-pointed", old_name, new_name, affected),
            current_user_id
        ],
    )
    .map_err(|e| format!("Failed to write activity log: {}", e))?;

    tx.commit().map_err(|e| format!("Failed to commit rename: {}", e))?;

    Ok(affected)
}

/// Activate or deactivate. Deactivated sources disappear from selectors but remain
/// on historical risks. There is deliberately no delete command.
#[tauri::command]
pub fn set_risk_source_active(
    current_user_id: i64,
    id: i64,
    is_active: bool,
) -> Result<(), String> {
    permissions::require_admin_or_quality_manager(current_user_id)?;

    let conn = db::open_conn()?;

    let name: String = conn
        .query_row("SELECT name FROM risk_sources WHERE id = ?1", params![id], |r| r.get(0))
        .map_err(|_| "Risk source not found".to_string())?;

    conn.execute(
        "UPDATE risk_sources SET is_active = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![if is_active { 1 } else { 0 }, id],
    )
    .map_err(|e| format!("Failed to update risk source: {}", e))?;

    log_admin_activity(
        &conn,
        id,
        if is_active { "ACTIVATE" } else { "DEACTIVATE" },
        &format!("Risk source '{}' {}", name, if is_active { "activated" } else { "deactivated" }),
        current_user_id,
    );
    Ok(())
}

/// Persist a new display order. `ordered_ids` is the full list in the desired order.
#[tauri::command]
pub fn reorder_risk_sources(current_user_id: i64, ordered_ids: Vec<i64>) -> Result<(), String> {
    permissions::require_admin_or_quality_manager(current_user_id)?;

    let mut conn = db::open_conn()?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    for (idx, id) in ordered_ids.iter().enumerate() {
        tx.execute(
            "UPDATE risk_sources SET sort_order = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![((idx + 1) * 10) as i64, id],
        )
        .map_err(|e| format!("Failed to reorder risk sources: {}", e))?;
    }

    tx.commit().map_err(|e| format!("Failed to commit reorder: {}", e))?;
    Ok(())
}

// ── Customers ─────────────────────────────────────────────────────────────────

/// Active customers for the Complaint customer selector.
#[tauri::command]
pub fn list_customer_options(current_user_id: i64) -> Result<Vec<CustomerOption>, String> {
    permissions::require_authenticated(current_user_id)?;

    let conn = db::open_conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, customer_code, customer_name FROM customers
             WHERE is_active = 1 ORDER BY customer_name ASC",
        )
        .map_err(|e| format!("Failed to prepare customer query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(CustomerOption {
                id:            row.get(0)?,
                customer_code: row.get(1)?,
                customer_name: row.get(2)?,
            })
        })
        .map_err(|e| format!("Failed to query customers: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

/// Full customer list for the Administration screen, optionally filtered.
#[tauri::command]
pub fn list_customers(
    current_user_id: i64,
    search: Option<String>,
    include_inactive: Option<bool>,
) -> Result<Vec<Customer>, String> {
    permissions::require_admin_or_quality_manager(current_user_id)?;

    let conn = db::open_conn()?;

    let term = search.unwrap_or_default().trim().to_lowercase();
    let like = format!("%{}%", term);
    let include_inactive = include_inactive.unwrap_or(true);

    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.customer_code, c.customer_name, c.contact_email, c.contact_phone,
                    c.notes, c.is_active,
                    (SELECT COUNT(*) FROM complaints cp WHERE cp.customer_ref_id = c.id),
                    c.created_at, c.updated_at
             FROM customers c
             WHERE (?1 = '' OR lower(c.customer_name) LIKE ?2 OR lower(c.customer_code) LIKE ?2)
               AND (?3 = 1 OR c.is_active = 1)
             ORDER BY c.customer_name ASC",
        )
        .map_err(|e| format!("Failed to prepare customer query: {}", e))?;

    let rows = stmt
        .query_map(
            params![&term, &like, if include_inactive { 1 } else { 0 }],
            |row| {
                Ok(Customer {
                    id:              row.get(0)?,
                    customer_code:   row.get(1)?,
                    customer_name:   row.get(2)?,
                    contact_email:   row.get(3)?,
                    contact_phone:   row.get(4)?,
                    notes:           row.get(5)?,
                    is_active:       row.get::<_, i64>(6)? == 1,
                    complaint_count: row.get(7)?,
                    created_at:      row.get(8)?,
                    updated_at:      row.get(9)?,
                })
            },
        )
        .map_err(|e| format!("Failed to query customers: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

#[tauri::command]
pub fn create_customer(
    current_user_id: i64,
    customer_code: String,
    customer_name: String,
    contact_email: Option<String>,
    contact_phone: Option<String>,
    notes: Option<String>,
) -> Result<i64, String> {
    permissions::require_admin_or_quality_manager(current_user_id)?;

    let code = customer_code.trim().to_string();
    let name = customer_name.trim().to_string();
    if code.is_empty() {
        return Err("Customer ID is required".to_string());
    }
    if name.is_empty() {
        return Err("Customer name is required".to_string());
    }

    let conn = db::open_conn()?;

    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM customers WHERE lower(customer_code) = lower(?1)",
            params![&code],
            |r| r.get(0),
        )
        .map_err(|e| format!("Failed to check for duplicate: {}", e))?;
    if exists > 0 {
        return Err(format!("Customer ID '{}' is already in use", code));
    }

    conn.execute(
        "INSERT INTO customers
           (customer_code, customer_name, contact_email, contact_phone, notes,
            is_active, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 1, datetime('now'), datetime('now'))",
        params![&code, &name, &contact_email, &contact_phone, &notes],
    )
    .map_err(|e| format!("Failed to create customer: {}", e))?;

    let id = conn.last_insert_rowid();
    log_admin_activity(&conn, id, "CREATE", &format!("Customer '{}' ({}) created", name, code), current_user_id);
    Ok(id)
}

/// Update customer details.
///
/// customer_code is intentionally immutable: it is the business identifier printed
/// on historical complaints. Changing it would retroactively alter what those
/// records appear to reference.
#[tauri::command]
pub fn update_customer(
    current_user_id: i64,
    id: i64,
    customer_name: String,
    contact_email: Option<String>,
    contact_phone: Option<String>,
    notes: Option<String>,
) -> Result<(), String> {
    permissions::require_admin_or_quality_manager(current_user_id)?;

    let name = customer_name.trim().to_string();
    if name.is_empty() {
        return Err("Customer name is required".to_string());
    }

    let conn = db::open_conn()?;

    let exists: i64 = conn
        .query_row("SELECT COUNT(*) FROM customers WHERE id = ?1", params![id], |r| r.get(0))
        .map_err(|e| format!("Failed to load customer: {}", e))?;
    if exists == 0 {
        return Err("Customer not found".to_string());
    }

    conn.execute(
        "UPDATE customers
            SET customer_name = ?1, contact_email = ?2, contact_phone = ?3,
                notes = ?4, updated_at = datetime('now')
          WHERE id = ?5",
        params![&name, &contact_email, &contact_phone, &notes, id],
    )
    .map_err(|e| format!("Failed to update customer: {}", e))?;

    log_admin_activity(&conn, id, "UPDATE", &format!("Customer '{}' updated", name), current_user_id);
    Ok(())
}

/// Activate/deactivate a customer. Deactivated customers vanish from the complaint
/// selector but remain attached to historical complaints. No hard delete exists.
#[tauri::command]
pub fn set_customer_active(
    current_user_id: i64,
    id: i64,
    is_active: bool,
) -> Result<(), String> {
    permissions::require_admin_or_quality_manager(current_user_id)?;

    let conn = db::open_conn()?;

    let name: String = conn
        .query_row("SELECT customer_name FROM customers WHERE id = ?1", params![id], |r| r.get(0))
        .map_err(|_| "Customer not found".to_string())?;

    conn.execute(
        "UPDATE customers SET is_active = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![if is_active { 1 } else { 0 }, id],
    )
    .map_err(|e| format!("Failed to update customer: {}", e))?;

    log_admin_activity(
        &conn,
        id,
        if is_active { "ACTIVATE" } else { "DEACTIVATE" },
        &format!("Customer '{}' {}", name, if is_active { "activated" } else { "deactivated" }),
        current_user_id,
    );
    Ok(())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    /// Build the subset of schema these commands touch, so the SQL is exercised
    /// for real rather than assumed correct.
    fn schema() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE risk_sources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                sort_order INTEGER NOT NULL DEFAULT 0,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
             CREATE TABLE risks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT, updated_at TEXT);
             CREATE TABLE customers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_code TEXT NOT NULL UNIQUE,
                customer_name TEXT NOT NULL,
                contact_email TEXT, contact_phone TEXT, notes TEXT,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
             CREATE TABLE complaints (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_ref_id INTEGER REFERENCES customers(id));",
        )
        .unwrap();
        conn
    }

    /// Renaming a source must carry historical risks with it. If this regresses,
    /// old risks display a source value that no longer exists anywhere.
    #[test]
    fn rename_repoints_historical_risks() {
        let conn = schema();
        conn.execute_batch(
            "INSERT INTO risk_sources (name, sort_order, is_active, created_at, updated_at)
                VALUES ('Incident', 10, 1, 'x', 'x');
             INSERT INTO risks (source, updated_at) VALUES ('Incident', 'x');
             INSERT INTO risks (source, updated_at) VALUES ('Incident', 'x');
             INSERT INTO risks (source, updated_at) VALUES ('Other', 'x');",
        )
        .unwrap();

        let affected = conn
            .execute(
                "UPDATE risks SET source = ?1, updated_at = datetime('now') WHERE source = ?2",
                rusqlite::params!["Incident Report", "Incident"],
            )
            .unwrap();
        assert_eq!(affected, 2, "only the two matching risks should be re-pointed");

        let untouched: String = conn
            .query_row("SELECT source FROM risks WHERE id = 3", [], |r| r.get(0))
            .unwrap();
        assert_eq!(untouched, "Other", "unrelated risks must not be touched");
    }

    /// usage_count drives whether the UI offers deactivate instead of anything
    /// destructive, so the correlated subquery must actually correlate.
    #[test]
    fn usage_count_counts_only_matching_risks() {
        let conn = schema();
        conn.execute_batch(
            "INSERT INTO risk_sources (name, sort_order, is_active, created_at, updated_at)
                VALUES ('Incident', 10, 1, 'x', 'x'), ('Audit', 20, 1, 'x', 'x');
             INSERT INTO risks (source, updated_at) VALUES ('Incident','x'), ('Incident','x'), ('Audit','x');",
        )
        .unwrap();

        let mut stmt = conn
            .prepare(
                "SELECT s.name, (SELECT COUNT(*) FROM risks r WHERE r.source = s.name)
                 FROM risk_sources s ORDER BY s.sort_order",
            )
            .unwrap();
        let got: Vec<(String, i64)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert_eq!(got, vec![("Incident".to_string(), 2), ("Audit".to_string(), 1)]);
    }

    #[test]
    fn customer_code_uniqueness_is_case_insensitive() {
        let conn = schema();
        conn.execute(
            "INSERT INTO customers (customer_code, customer_name, is_active, created_at, updated_at)
             VALUES ('ACME-01', 'Acme', 1, 'x', 'x')",
            [],
        )
        .unwrap();

        let clash: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM customers WHERE lower(customer_code) = lower(?1)",
                rusqlite::params!["acme-01"],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(clash, 1, "differing case must still be treated as a duplicate");
    }

    /// Deactivating must not detach historical complaints.
    #[test]
    fn deactivating_a_customer_preserves_complaint_links() {
        let conn = schema();
        conn.execute_batch(
            "INSERT INTO customers (customer_code, customer_name, is_active, created_at, updated_at)
                VALUES ('C1','Acme',1,'x','x');
             INSERT INTO complaints (customer_ref_id) VALUES (1), (1);",
        )
        .unwrap();

        conn.execute("UPDATE customers SET is_active = 0 WHERE id = 1", []).unwrap();

        let still_linked: i64 = conn
            .query_row("SELECT COUNT(*) FROM complaints WHERE customer_ref_id = 1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(still_linked, 2, "deactivation must never orphan historical complaints");
    }
}
