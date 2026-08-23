//! Export to a user-chosen file.
//!
//! WHY THIS FILE NO LONGER EXPOSES A GENERIC WRITE
//! ------------------------------------------------
//! It used to export exactly one command:
//!
//! ```ignore
//! #[tauri::command]
//! pub fn write_text_file(path: String, content: String) -> Result<(), String>
//! ```
//!
//! No `current_user_id`, no permission check, and the destination was any
//! absolute path the renderer cared to name — with `create_dir_all` on the
//! parent for good measure. The intended flow was safe (the frontend opened a
//! native save dialog first and passed the result through), but the backend had
//! no way to tell an operator-chosen path from a fabricated one. Anything able
//! to invoke a command — a bug in the renderer, a malicious dependency, injected
//! script — could overwrite any file the Windows user could write, including
//! this application's own database and licence.
//!
//! The fix is not a permission check bolted onto the same signature: with the
//! path still arriving from the renderer, an authorised user would simply have
//! become an authorised arbitrary-write. Instead the destination is no longer
//! something the caller can express. The save dialog is opened HERE, by the
//! backend, and the file is written to the path the human picked in that same
//! call. The renderer supplies the bytes and a suggested filename; it never
//! supplies a location.
//!
//! This is trust-boundary case C: an export destination is trusted only because
//! a person chose it, only for the operation they chose it for, and only within
//! the call that presented the dialog.

use std::io::Write;

use tauri_plugin_dialog::DialogExt;

use crate::permissions;

/// Which register is being exported. The caller names the register; the BACKEND
/// decides what permission that requires. A renderer cannot nominate its own
/// authorisation by passing a permission key.
///
/// Documents map to `documents.view` because the 53-key registry has no
/// `documents.export`, and inventing one to cover a register the user is already
/// reading would add a key without adding a control.
fn required_permission(kind: &str) -> Result<&'static [&'static str], String> {
    Ok(match kind {
        "documents" => &["documents.view"],
        "capa" => &["capa.export"],
        "risks" => &["risks.export"],
        "complaints" => &["complaints.export"],
        "audits" => &["audits.export"],
        "nc" => &["nc.export"],
        // The Reports screen is reachable through either report capability.
        "report" => &["reports.run", "reports.run_complaints"],
        other => return Err(format!("Unknown export type: {}", other)),
    })
}

/// Reject anything that is not a plain filename.
///
/// The suggested name only pre-fills the dialog, so this is belt-and-braces —
/// but a name carrying separators or `..` would let the caller steer where the
/// dialog opens, and there is no reason to accept one.
fn validate_suggested_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("A file name is required".to_string());
    }
    if name.len() > 120 {
        return Err("File name is too long".to_string());
    }
    if name.contains(['/', '\\', ':', '\0'])
        || name.contains("..")
        || name.starts_with('.')
    {
        return Err("File name must be a plain name without a path".to_string());
    }
    Ok(name.to_string())
}

/// Export text (CSV or JSON) to a destination the user chooses in a native save
/// dialog presented by this command.
///
/// Returns the chosen path on success, or `None` if the user cancelled — a
/// cancel is a normal outcome, not an error.
#[tauri::command]
pub fn export_text_file(
    app: tauri::AppHandle,
    current_user_id: i64,
    kind: String,
    suggested_name: String,
    extension: String,
    content: String,
) -> Result<Option<String>, String> {
    let needed = required_permission(&kind)?;
    permissions::require_any_permission(current_user_id, needed)?;

    let suggested = validate_suggested_name(&suggested_name)?;

    let ext = extension.trim().to_lowercase();
    if !matches!(ext.as_str(), "csv" | "json") {
        return Err(format!("Unsupported export format: {}", extension));
    }

    // The dialog is the trust boundary. Whatever comes back is a path a person
    // selected during this call, and it is used immediately and only here.
    let chosen = app
        .dialog()
        .file()
        .set_file_name(&suggested)
        .add_filter(if ext == "csv" { "CSV Files" } else { "JSON Files" }, &[ext.as_str()])
        .blocking_save_file();

    let Some(chosen) = chosen else {
        return Ok(None);
    };

    let dest = chosen
        .into_path()
        .map_err(|e| format!("The selected destination is not a file path: {}", e))?;

    // No create_dir_all. The dialog only yields a location that already exists;
    // creating directories was a capability the export never needed.
    let mut file = std::fs::File::create(&dest)
        .map_err(|e| format!("Could not create '{}': {}", dest.display(), e))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Could not write the export: {}", e))?;

    Ok(Some(dest.to_string_lossy().to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_export_kind_maps_to_a_real_permission() {
        for kind in ["documents", "capa", "risks", "complaints", "audits", "nc", "report"] {
            let keys = required_permission(kind).expect("known kind");
            assert!(!keys.is_empty(), "{} must require something", kind);
            for k in keys {
                assert!(k.contains('.'), "{} is not a permission key", k);
            }
        }
    }

    #[test]
    fn an_unknown_export_kind_is_refused() {
        // A caller cannot invent a kind to slip past the permission mapping.
        assert!(required_permission("").is_err());
        assert!(required_permission("licence").is_err());
        assert!(required_permission("../../etc").is_err());
    }

    #[test]
    fn a_suggested_name_may_not_carry_a_path() {
        assert!(validate_suggested_name("risks-register-2026-01-01.csv").is_ok());

        for bad in [
            "../escape.csv",
            "..\\escape.csv",
            "sub/dir/file.csv",
            "sub\\dir\\file.csv",
            "C:\\Windows\\System32\\evil.csv",
            ".hidden",
            "",
            "   ",
        ] {
            assert!(
                validate_suggested_name(bad).is_err(),
                "{:?} should have been refused",
                bad,
            );
        }
    }

    #[test]
    fn a_suggested_name_is_length_bounded() {
        let long = format!("{}.csv", "a".repeat(200));
        assert!(validate_suggested_name(&long).is_err());
    }
}
