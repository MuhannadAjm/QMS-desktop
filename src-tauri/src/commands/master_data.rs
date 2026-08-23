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
    /// How many risks reference this source, counted via the stable FK so the
    /// figure survives a rename. Drives whether the admin UI offers deactivate
    /// rather than anything destructive.
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

// ── Lookup authorization ──────────────────────────────────────────────────────

/// Permissions that may READ the risk source list.
///
/// Named rather than inlined so the authorization decision is testable: a test
/// can assert that a role holding only `risks.create` satisfies this, without
/// standing up a Tauri command. Reading a lookup list is part of doing the work;
/// administering it is a separate act guarded by `masterdata.manage`.
pub const RISK_SOURCE_LOOKUP_PERMISSIONS: [&str; 5] = [
    "masterdata.view",
    "masterdata.manage",
    "risks.view",
    "risks.create",
    "risks.edit",
];

/// Permissions that may READ the customer picker list. Same reasoning.
pub const CUSTOMER_LOOKUP_PERMISSIONS: [&str; 5] = [
    "masterdata.view",
    "masterdata.manage",
    "complaints.view",
    "complaints.create",
    "complaints.edit",
];

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
    // Same reasoning as list_customer_options: choosing a source while raising a
    // risk is part of doing the work, not part of administering the lookup table.
    // A custom role granted risks.create must not also need master-data rights
    // just to populate one dropdown.
    permissions::require_any_permission(current_user_id, &RISK_SOURCE_LOOKUP_PERMISSIONS)?;
    query_risk_sources(true)
}

/// Every risk source including deactivated ones. Administration screen only.
#[tauri::command]
pub fn list_all_risk_sources(current_user_id: i64) -> Result<Vec<RiskSource>, String> {
    permissions::require_permission(current_user_id, "masterdata.manage")?;
    query_risk_sources(false)
}

fn query_risk_sources(active_only: bool) -> Result<Vec<RiskSource>, String> {
    let conn = db::open_conn()?;

    let sql = "SELECT s.id, s.name, s.sort_order, s.is_active,
                      (SELECT COUNT(*) FROM risks r WHERE r.source_id = s.id OR (r.source_id IS NULL AND r.source = s.name))
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
    permissions::require_permission(current_user_id, "masterdata.manage")?;

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
/// Renames ONLY the master row. Historical risks are deliberately left alone.
///
/// An earlier version of this command re-pointed existing risks
/// (`UPDATE risks SET source = new WHERE source = old`) so they would keep
/// showing a "meaningful" label. That was wrong for a controlled-records system:
/// it silently rewrote what a completed risk assessment said it was based on. A
/// risk raised under "Incident" would afterwards read "Security Incident", with
/// no record that the wording had ever changed.
///
/// Since migration 009, risks.source is an immutable snapshot of the label
/// chosen at the time and risks.source_id is the stable FK. A rename therefore
/// affects future selections and the master list only, while historical risks
/// stay traceable to the same master row.
///
/// Returns the number of historical risks that keep the OLD label, so the UI can
/// tell the administrator what the rename will and will not touch.
#[tauri::command]
pub fn rename_risk_source(
    current_user_id: i64,
    id: i64,
    new_name: String,
) -> Result<i64, String> {
    permissions::require_permission(current_user_id, "masterdata.manage")?;

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

    // Count, do NOT modify. These risks keep their original wording.
    let retained: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM risks WHERE source_id = ?1 OR (source_id IS NULL AND source = ?2)",
            params![id, &old_name],
            |r| r.get(0),
        )
        .unwrap_or(0);

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
            format!(
                "Risk source renamed from '{}' to '{}'. {} historical risk(s) retain the original label '{}' as recorded.",
                old_name, new_name, retained, old_name
            ),
            current_user_id
        ],
    )
    .map_err(|e| format!("Failed to write activity log: {}", e))?;

    tx.commit().map_err(|e| format!("Failed to commit rename: {}", e))?;

    Ok(retained)
}

/// Activate or deactivate. Deactivated sources disappear from selectors but remain
/// on historical risks. There is deliberately no delete command.
#[tauri::command]
pub fn set_risk_source_active(
    current_user_id: i64,
    id: i64,
    is_active: bool,
) -> Result<(), String> {
    permissions::require_permission(current_user_id, "masterdata.manage")?;

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
    permissions::require_permission(current_user_id, "masterdata.manage")?;

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
///
/// Authorized by EITHER master-data rights or a complaint business capability.
/// Requiring master-data permission here would mean a user could not raise a
/// complaint without also being able to administer the customer master, which is
/// the wrong trade: choosing an existing customer is a read of three
/// non-sensitive fields, not an administrative act.
///
/// The projection is deliberately minimal — id, code and name only. Contact
/// details and notes stay behind `list_customers`, which does require
/// `masterdata.manage`.
#[tauri::command]
pub fn list_customer_options(current_user_id: i64) -> Result<Vec<CustomerOption>, String> {
    permissions::require_any_permission(current_user_id, &CUSTOMER_LOOKUP_PERMISSIONS)?;

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
    permissions::require_permission(current_user_id, "masterdata.manage")?;

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
    permissions::require_permission(current_user_id, "masterdata.manage")?;

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
/// Edit a customer, including its business code.
///
/// The code IS editable — a mistyped customer code has to be fixable — but
/// editing it is a change to the MASTER record only. Historical complaints keep
/// the `customer_name` / `customer_id` text they were raised with, exactly as a
/// risk source rename leaves `risks.source` alone. That is what stops a rename
/// from retroactively falsifying a controlled record.
///
/// Returns the number of complaints that keep their original snapshot, so the
/// caller can tell the administrator what was deliberately left untouched.
#[tauri::command]
pub fn update_customer(
    current_user_id: i64,
    id: i64,
    customer_code: String,
    customer_name: String,
    contact_email: Option<String>,
    contact_phone: Option<String>,
    notes: Option<String>,
) -> Result<i64, String> {
    permissions::require_permission(current_user_id, "masterdata.manage")?;

    let name = customer_name.trim().to_string();
    if name.is_empty() {
        return Err("Customer name is required".to_string());
    }
    let code = customer_code.trim().to_string();
    if code.is_empty() {
        return Err("Customer code is required".to_string());
    }

    let mut conn = db::open_conn()?;

    let (old_code, old_name): (String, String) = conn
        .query_row(
            "SELECT customer_code, customer_name FROM customers WHERE id = ?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "Customer not found".to_string())?;

    // Case-insensitive, so "acme-01" cannot shadow "ACME-01" in a selector.
    let clash: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM customers WHERE lower(customer_code) = lower(?1) AND id != ?2",
            params![&code, id],
            |r| r.get(0),
        )
        .map_err(|e| format!("Failed to check for duplicate customer code: {}", e))?;
    if clash > 0 {
        return Err(format!(
            "Customer code '{}' is already used by another customer. Codes must be unique.",
            code
        ));
    }

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    // Count, do NOT modify. These complaints keep their original wording.
    let retained: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM complaints WHERE customer_ref_id = ?1",
            params![id],
            |r| r.get(0),
        )
        .unwrap_or(0);

    tx.execute(
        "UPDATE customers
            SET customer_code = ?1, customer_name = ?2, contact_email = ?3,
                contact_phone = ?4, notes = ?5, updated_at = datetime('now')
          WHERE id = ?6",
        params![&code, &name, &contact_email, &contact_phone, &notes, id],
    )
    .map_err(|e| format!("Failed to update customer: {}", e))?;

    let renamed = old_name != name || old_code != code;
    let description = if renamed {
        format!(
            "Customer changed from '{}' ({}) to '{}' ({}). {} historical complaint(s) retain the original details as recorded.",
            old_name, old_code, name, code, retained
        )
    } else {
        format!("Customer '{}' ({}) updated", name, code)
    };

    tx.execute(
        "INSERT INTO activity_log (module, record_id, action, description, performed_by, performed_at)
         VALUES ('master_data', ?1, 'UPDATE', ?2, ?3, datetime('now'))",
        params![id, description, current_user_id],
    )
    .map_err(|e| format!("Failed to write activity log: {}", e))?;

    tx.commit().map_err(|e| format!("Failed to commit customer update: {}", e))?;

    Ok(retained)
}

/// Activate/deactivate a customer. Deactivated customers vanish from the complaint
/// selector but remain attached to historical complaints. No hard delete exists.
#[tauri::command]
pub fn set_customer_active(
    current_user_id: i64,
    id: i64,
    is_active: bool,
) -> Result<(), String> {
    permissions::require_permission(current_user_id, "masterdata.manage")?;

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
                source TEXT, source_id INTEGER, updated_at TEXT);
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

    /// AUDITABILITY INVARIANT.
    ///
    /// Renaming a master risk source must NOT rewrite the label on risks that
    /// were already recorded. A risk assessed under "Incident" must keep saying
    /// "Incident" forever, while remaining traceable to the same master row via
    /// source_id. An earlier version of rename_risk_source re-pointed those rows,
    /// which silently changed what a completed controlled record claimed.
    #[test]
    fn rename_preserves_historical_risk_labels() {
        let conn = schema();
        conn.execute_batch(
            "INSERT INTO risk_sources (name, sort_order, is_active, created_at, updated_at)
                VALUES ('Incident', 10, 1, 'x', 'x');
             INSERT INTO risks (source, source_id, updated_at) VALUES ('Incident', 1, 'x');
             INSERT INTO risks (source, source_id, updated_at) VALUES ('Incident', 1, 'x');
             INSERT INTO risks (source, source_id, updated_at) VALUES ('Other', NULL, 'x');",
        )
        .unwrap();

        // The rename touches ONLY the master row.
        conn.execute(
            "UPDATE risk_sources SET name = ?1 WHERE id = ?2",
            rusqlite::params!["Security Incident", 1],
        )
        .unwrap();

        let labels: Vec<String> = conn
            .prepare("SELECT source FROM risks ORDER BY id")
            .unwrap()
            .query_map([], |r| r.get::<_, String>(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        assert_eq!(
            labels,
            vec!["Incident", "Incident", "Other"],
            "historical risk labels must survive a master rename verbatim"
        );

        // …while still resolving to the renamed master row.
        let via_fk: String = conn
            .query_row(
                "SELECT rs.name FROM risks r JOIN risk_sources rs ON rs.id = r.source_id WHERE r.id = 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(via_fk, "Security Incident", "the FK must follow the rename");
    }

    /// usage_count must count via the stable FK. Counting by name would silently
    /// report 0 uses after a rename and could make a still-referenced source look
    /// safe to retire.
    #[test]
    fn usage_count_survives_a_rename() {
        let conn = schema();
        conn.execute_batch(
            "INSERT INTO risk_sources (name, sort_order, is_active, created_at, updated_at)
                VALUES ('Incident', 10, 1, 'x', 'x');
             INSERT INTO risks (source, source_id, updated_at) VALUES ('Incident', 1, 'x'), ('Incident', 1, 'x');
             UPDATE risk_sources SET name = 'Security Incident' WHERE id = 1;",
        )
        .unwrap();

        let count: i64 = conn
            .query_row(
                "SELECT (SELECT COUNT(*) FROM risks r
                          WHERE r.source_id = s.id
                             OR (r.source_id IS NULL AND r.source = s.name))
                 FROM risk_sources s WHERE s.id = 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 2, "usage must still be visible after the label changed");
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

/// Master data behaviour asserted against the SHIPPED migration files.
///
/// The module above builds a hand-written subset of the schema. That proves the
/// SQL runs, but it cannot catch drift: edit a migration and those tests still
/// pass, because they carry their own copy of the tables. These run the real
/// migration runner over the real files, so what is asserted here is the
/// artifact that actually ships.
#[cfg(test)]
mod shipped_master_data_tests {
    use rusqlite::{params, Connection};

    struct TempDb {
        path: std::path::PathBuf,
    }

    impl TempDb {
        fn new(tag: &str) -> Self {
            let mut path = std::env::temp_dir();
            path.push(format!("qms_masterdata_{}_{}.db", tag, std::process::id()));
            let _ = std::fs::remove_file(&path);
            crate::db::initialize_database(&path).expect("shipped migrations must apply cleanly");
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

    fn names(c: &Connection, sql: &str) -> Vec<String> {
        let mut stmt = c.prepare(sql).unwrap();
        let v: Vec<String> = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        v
    }

    fn count(c: &Connection, sql: &str) -> i64 {
        c.query_row(sql, [], |r| r.get(0)).unwrap()
    }

    /// The selector query the Risk form uses, mirroring list_risk_sources.
    fn active_source_names(c: &Connection) -> Vec<String> {
        names(
            c,
            "SELECT name FROM risk_sources WHERE is_active = 1 ORDER BY sort_order ASC, name ASC",
        )
    }

    // ── Risk sources ─────────────────────────────────────────────────────────

    #[test]
    fn shipped_migrations_seed_the_suggested_risk_sources() {
        let db = TempDb::new("seed");
        let c = db.open();

        let seeded = active_source_names(&c);
        assert_eq!(seeded.len(), 7, "seven suggested sources ship with the product");
        for expected in [
            "Internal Audit",
            "Customer Feedback",
            "Process Review",
            "Management Review",
            "Supplier Assessment",
            "Incident",
            "Other",
        ] {
            assert!(seeded.iter().any(|s| s == expected), "missing seed: {}", expected);
        }
        // Ordering is data, not alphabetical chance — the admin can reorder it.
        assert_eq!(seeded[0], "Internal Audit", "sort_order drives the selector order");
    }

    #[test]
    fn a_deactivated_source_leaves_the_selector_but_keeps_its_risks() {
        let db = TempDb::new("deactivate");
        let c = db.open();

        let id: i64 = c
            .query_row(
                "SELECT id FROM risk_sources WHERE name = 'Incident'",
                [],
                |r| r.get(0),
            )
            .unwrap();

        c.execute(
            "INSERT INTO risks (risk_number, title, source, source_id, status, created_at, updated_at)
             VALUES ('R-1', 'Spill', 'Incident', ?1, 'OPEN', datetime('now'), datetime('now'))",
            params![id],
        )
        .unwrap();

        c.execute("UPDATE risk_sources SET is_active = 0 WHERE id = ?1", params![id])
            .unwrap();

        assert!(
            !active_source_names(&c).iter().any(|s| s == "Incident"),
            "a deactivated source must not be offered on a new risk",
        );
        // The record that used it is untouched and still resolvable.
        let (snapshot, still_linked): (String, i64) = c
            .query_row(
                "SELECT source, source_id FROM risks WHERE risk_number = 'R-1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(snapshot, "Incident");
        assert_eq!(still_linked, id, "the stable FK survives deactivation");
    }

    /// THE AUDITABILITY INVARIANT, against the shipped schema.
    ///
    /// Renaming the master must move the master label and nothing else. A risk
    /// assessed under "Internal Audit" has to keep saying "Internal Audit" even
    /// after the master becomes "Internal QMS Audit", or a completed controlled
    /// record would silently change what it claims to be based on.
    #[test]
    fn renaming_a_source_does_not_rewrite_the_historical_risk_snapshot() {
        let db = TempDb::new("rename");
        let c = db.open();

        let id: i64 = c
            .query_row(
                "SELECT id FROM risk_sources WHERE name = 'Internal Audit'",
                [],
                |r| r.get(0),
            )
            .unwrap();

        c.execute(
            "INSERT INTO risks (risk_number, title, source, source_id, status, created_at, updated_at)
             VALUES ('R-1', 'Old finding', 'Internal Audit', ?1, 'OPEN', datetime('now'), datetime('now'))",
            params![id],
        )
        .unwrap();

        // Exactly what rename_risk_source does: the master row only.
        c.execute(
            "UPDATE risk_sources SET name = 'Internal QMS Audit' WHERE id = ?1",
            params![id],
        )
        .unwrap();

        let (snapshot, linked): (String, i64) = c
            .query_row(
                "SELECT source, source_id FROM risks WHERE risk_number = 'R-1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();

        assert_eq!(
            snapshot, "Internal Audit",
            "history must read as it did when the risk was raised",
        );
        assert_eq!(linked, id, "and stay traceable to the same master row");

        let master: String = c
            .query_row("SELECT name FROM risk_sources WHERE id = ?1", params![id], |r| r.get(0))
            .unwrap();
        assert_eq!(master, "Internal QMS Audit", "the master label did change");

        // A newly raised risk picks up the current wording.
        assert!(active_source_names(&c).iter().any(|s| s == "Internal QMS Audit"));
    }

    /// Deletion is not a supported operation, and the schema is what enforces it
    /// for anything already referenced.
    #[test]
    fn a_referenced_source_cannot_be_destructively_deleted() {
        let db = TempDb::new("nodelete");
        let c = db.open();

        let id: i64 = c
            .query_row("SELECT id FROM risk_sources WHERE name = 'Other'", [], |r| r.get(0))
            .unwrap();
        c.execute(
            "INSERT INTO risks (risk_number, title, source, source_id, status, created_at, updated_at)
             VALUES ('R-9', 'Referenced', 'Other', ?1, 'OPEN', datetime('now'), datetime('now'))",
            params![id],
        )
        .unwrap();

        let deleted = c.execute("DELETE FROM risk_sources WHERE id = ?1", params![id]);
        assert!(
            deleted.is_err(),
            "the FK from risks.source_id must refuse to orphan a referenced source",
        );
        assert_eq!(count(&c, "SELECT COUNT(*) FROM risks WHERE risk_number = 'R-9'"), 1);
    }

    // ── Customers ────────────────────────────────────────────────────────────

    fn add_customer(c: &Connection, code: &str, name: &str, active: bool) -> i64 {
        c.execute(
            "INSERT INTO customers (customer_code, customer_name, is_active, created_at, updated_at)
             VALUES (?1, ?2, ?3, datetime('now'), datetime('now'))",
            params![code, name, if active { 1 } else { 0 }],
        )
        .unwrap();
        c.last_insert_rowid()
    }

    #[test]
    fn customer_code_is_unique_in_the_shipped_schema() {
        let db = TempDb::new("unique");
        let c = db.open();

        add_customer(&c, "CUST-001", "Contoso Medical", true);
        let dup = c.execute(
            "INSERT INTO customers (customer_code, customer_name, is_active, created_at, updated_at)
             VALUES ('CUST-001', 'A Different Company', 1, datetime('now'), datetime('now'))",
            [],
        );
        assert!(dup.is_err(), "duplicate customer codes must be refused by the database");
        assert_eq!(count(&c, "SELECT COUNT(*) FROM customers"), 1);
    }

    #[test]
    fn only_active_customers_are_offered_but_history_still_resolves() {
        let db = TempDb::new("cust_active");
        let c = db.open();

        let live = add_customer(&c, "CUST-001", "Contoso Medical", true);
        let gone = add_customer(&c, "CUST-002", "Former Client", false);

        c.execute(
            "INSERT INTO complaints
                 (complaint_number, customer_name, customer_id, title, received_date, status,
                  created_at, updated_at, customer_ref_id)
             VALUES ('C-1', 'Former Client', 'CUST-002', 'Old issue', '2026-01-01', 'OPEN',
                     datetime('now'), datetime('now'), ?1)",
            params![gone],
        )
        .unwrap();

        // The picker query from list_customer_options.
        let offered = names(
            &c,
            "SELECT customer_name FROM customers WHERE is_active = 1 ORDER BY customer_name ASC",
        );
        assert_eq!(offered, vec!["Contoso Medical".to_string()]);
        assert!(live > 0);

        // The historical complaint still resolves to its customer, inactive or not.
        let (name, code, active): (String, String, i64) = c
            .query_row(
                "SELECT cu.customer_name, cu.customer_code, cu.is_active
                   FROM complaints c JOIN customers cu ON cu.id = c.customer_ref_id
                  WHERE c.complaint_number = 'C-1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(name, "Former Client");
        assert_eq!(code, "CUST-002");
        assert_eq!(active, 0, "and is still identifiable as inactive");
    }

    #[test]
    fn editing_a_customer_does_not_rewrite_complaint_snapshots() {
        let db = TempDb::new("cust_rename");
        let c = db.open();

        let id = add_customer(&c, "CUST-001", "Contoso Medical", true);
        c.execute(
            "INSERT INTO complaints
                 (complaint_number, customer_name, customer_id, title, received_date, status,
                  created_at, updated_at, customer_ref_id)
             VALUES ('C-1', 'Contoso Medical', 'CUST-001', 'Late delivery', '2026-01-01', 'OPEN',
                     datetime('now'), datetime('now'), ?1)",
            params![id],
        )
        .unwrap();

        // What update_customer does: the master row only.
        c.execute(
            "UPDATE customers SET customer_code = 'CON-01', customer_name = 'Contoso Medical GmbH'
              WHERE id = ?1",
            params![id],
        )
        .unwrap();

        let (name, code, still_linked): (String, String, i64) = c
            .query_row(
                "SELECT customer_name, customer_id, customer_ref_id FROM complaints WHERE complaint_number = 'C-1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(name, "Contoso Medical", "the complaint says what it said when raised");
        assert_eq!(code, "CUST-001");
        assert_eq!(still_linked, id, "while still pointing at the same master record");
    }

    #[test]
    fn a_referenced_customer_cannot_be_destructively_deleted() {
        let db = TempDb::new("cust_nodelete");
        let c = db.open();

        let id = add_customer(&c, "CUST-001", "Contoso Medical", true);
        c.execute(
            "INSERT INTO complaints
                 (complaint_number, customer_name, customer_id, title, received_date, status,
                  created_at, updated_at, customer_ref_id)
             VALUES ('C-1', 'Contoso Medical', 'CUST-001', 'Issue', '2026-01-01', 'OPEN',
                     datetime('now'), datetime('now'), ?1)",
            params![id],
        )
        .unwrap();

        assert!(
            c.execute("DELETE FROM customers WHERE id = ?1", params![id]).is_err(),
            "the FK from complaints.customer_ref_id must refuse to orphan a referenced customer",
        );
    }

    // ── Migration 012: conservative backfill ─────────────────────────────────

    /// The backfill runs during initialize_database, so it has to be re-run by
    /// hand here against data inserted afterwards. This is the same statement
    /// migration 012 contains.
    fn run_backfill(c: &Connection) {
        c.execute_batch(
            "UPDATE complaints
                SET customer_ref_id = (
                     SELECT cu.id FROM customers cu
                      WHERE lower(trim(cu.customer_code)) = lower(trim(complaints.customer_id))
                    )
              WHERE customer_ref_id IS NULL
                AND trim(customer_id) <> ''
                AND EXISTS (
                     SELECT 1 FROM customers cu
                      WHERE lower(trim(cu.customer_code)) = lower(trim(complaints.customer_id))
                    );",
        )
        .unwrap();
    }

    fn legacy_complaint(c: &Connection, number: &str, name: &str, code: &str) {
        c.execute(
            "INSERT INTO complaints
                 (complaint_number, customer_name, customer_id, title, received_date, status,
                  created_at, updated_at)
             VALUES (?1, ?2, ?3, 'Legacy issue', '2025-06-01', 'OPEN',
                     datetime('now'), datetime('now'))",
            params![number, name, code],
        )
        .unwrap();
    }

    fn ref_of(c: &Connection, number: &str) -> Option<i64> {
        c.query_row(
            "SELECT customer_ref_id FROM complaints WHERE complaint_number = ?1",
            params![number],
            |r| r.get(0),
        )
        .unwrap()
    }

    #[test]
    fn backfill_links_only_an_exact_code_match() {
        let db = TempDb::new("backfill");
        let c = db.open();

        let contoso = add_customer(&c, "CUST-001", "Contoso Medical", true);

        legacy_complaint(&c, "C-1", "Contoso Medical", "CUST-001"); // exact code
        legacy_complaint(&c, "C-2", "Contoso Medical", " cust-001 "); // case + whitespace
        legacy_complaint(&c, "C-3", "Contoso Medical", "CUST-999"); // name matches, code does not
        legacy_complaint(&c, "C-4", "Contoso", ""); // no code at all

        run_backfill(&c);

        assert_eq!(ref_of(&c, "C-1"), Some(contoso));
        assert_eq!(ref_of(&c, "C-2"), Some(contoso), "trimmed and case-insensitive");
        assert_eq!(
            ref_of(&c, "C-3"),
            None,
            "a matching NAME is not evidence of identity — only the code is",
        );
        assert_eq!(ref_of(&c, "C-4"), None, "an empty code links to nothing");
    }

    #[test]
    fn backfill_never_alters_the_complaint_text() {
        let db = TempDb::new("backfill_text");
        let c = db.open();

        add_customer(&c, "CUST-001", "Contoso Medical GmbH", true); // master already renamed
        legacy_complaint(&c, "C-1", "Contoso Medical", "CUST-001"); // complaint says the old name

        run_backfill(&c);

        let (name, code): (String, String) = c
            .query_row(
                "SELECT customer_name, customer_id FROM complaints WHERE complaint_number = 'C-1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(name, "Contoso Medical", "linking must not adopt the master's newer name");
        assert_eq!(code, "CUST-001");
    }

    #[test]
    fn an_unlinked_legacy_complaint_remains_fully_readable() {
        let db = TempDb::new("legacy_readable");
        let c = db.open();

        legacy_complaint(&c, "C-1", "Someone Not In The Master", "OLD-42");
        run_backfill(&c);

        assert_eq!(ref_of(&c, "C-1"), None);
        let (name, code): (String, String) = c
            .query_row(
                "SELECT customer_name, customer_id FROM complaints WHERE complaint_number = 'C-1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(name, "Someone Not In The Master");
        assert_eq!(code, "OLD-42", "nothing has to be deleted or re-entered");
    }

    /// The complaint list query must survive an unlinked row — a LEFT JOIN, not
    /// an inner one, or legacy complaints would vanish from the register.
    #[test]
    fn the_complaint_list_join_keeps_unlinked_rows() {
        let db = TempDb::new("join");
        let c = db.open();

        let id = add_customer(&c, "CUST-001", "Contoso Medical", true);
        legacy_complaint(&c, "C-1", "Someone Else", "OLD-42");
        c.execute(
            "INSERT INTO complaints
                 (complaint_number, customer_name, customer_id, title, received_date, status,
                  created_at, updated_at, customer_ref_id)
             VALUES ('C-2', 'Contoso Medical', 'CUST-001', 'Linked', '2026-01-01', 'OPEN',
                     datetime('now'), datetime('now'), ?1)",
            params![id],
        )
        .unwrap();

        let n = count(
            &c,
            "SELECT COUNT(*) FROM complaints c LEFT JOIN customers cm ON c.customer_ref_id = cm.id",
        );
        assert_eq!(n, 2, "both the linked and the unlinked complaint must be listed");
    }

    // ── Lookup authorization ─────────────────────────────────────────────────

    /// Raising a record must not require administering the lookup tables.
    ///
    /// These assert the actual key sets the two lookup commands pass to
    /// require_any_permission, so narrowing a guard back to masterdata-only fails
    /// here rather than in a user's hands.
    #[test]
    fn business_capability_alone_authorizes_a_lookup() {
        use super::{CUSTOMER_LOOKUP_PERMISSIONS, RISK_SOURCE_LOOKUP_PERMISSIONS};

        let allows = |set: &[&str], held: &str| set.contains(&held);

        for held in ["complaints.create", "complaints.edit", "complaints.view"] {
            assert!(
                allows(&CUSTOMER_LOOKUP_PERMISSIONS, held),
                "{} must be able to pick a customer without master-data rights",
                held,
            );
        }
        for held in ["risks.create", "risks.edit", "risks.view"] {
            assert!(
                allows(&RISK_SOURCE_LOOKUP_PERMISSIONS, held),
                "{} must be able to pick a risk source without master-data rights",
                held,
            );
        }

        // Master-data rights still work, and unrelated permissions still do not.
        assert!(allows(&CUSTOMER_LOOKUP_PERMISSIONS, "masterdata.view"));
        assert!(allows(&RISK_SOURCE_LOOKUP_PERMISSIONS, "masterdata.manage"));
        for unrelated in ["capa.view", "audits.view", "backup.create", "users.manage"] {
            assert!(!allows(&CUSTOMER_LOOKUP_PERMISSIONS, unrelated));
            assert!(!allows(&RISK_SOURCE_LOOKUP_PERMISSIONS, unrelated));
        }

        // Neither lookup grants administration — that stays behind manage.
        assert!(
            !CUSTOMER_LOOKUP_PERMISSIONS.contains(&"masterdata.manage")
                || CUSTOMER_LOOKUP_PERMISSIONS.contains(&"masterdata.view"),
            "manage is accepted only as a superset of view, never as the sole route",
        );
    }

    /// Every WRITE stays on masterdata.manage. Resolved through the real RBAC
    /// engine over the shipped role templates, not by restating the rule.
    #[test]
    fn only_masterdata_manage_holders_may_write() {
        let db = TempDb::new("rbac");
        let c = db.open();

        let user_with = |role_key: &str, username: &str| -> i64 {
            let role_id: i64 = c
                .query_row(
                    "SELECT id FROM roles WHERE role_key = ?1",
                    params![role_key],
                    |r| r.get(0),
                )
                .unwrap();
            c.execute(
                "INSERT INTO users (username, full_name, email, role, role_id, department,
                                    password_hash, is_active, created_at, updated_at)
                 VALUES (?1, ?1, NULL, ?2, ?3, '', 'x', 1, datetime('now'), datetime('now'))",
                params![username, role_key, role_id],
            )
            .unwrap();
            c.last_insert_rowid()
        };

        let admin = user_with("Admin", "md_admin");
        let viewer = user_with("Viewer", "md_viewer");
        let employee = user_with("Employee", "md_employee");

        let eff = |uid: i64| crate::permissions::effective_permissions(&c, uid).unwrap();

        assert!(eff(admin).contains("masterdata.manage"), "Admin administers master data");

        for (uid, who) in [(viewer, "Viewer"), (employee, "Employee")] {
            let set = eff(uid);
            assert!(
                !set.contains("masterdata.manage"),
                "{} must not be able to write master data",
                who,
            );
            // …but may still read the lookups, which is the whole point of the split.
            assert!(
                set.contains("masterdata.view"),
                "{} keeps read access to lookup values",
                who,
            );
        }
    }
}
