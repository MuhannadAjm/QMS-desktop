use serde::{Deserialize, Serialize};

use crate::license::token::LicenseToken;
use crate::storage::get_storage_paths;

/// Marker key that identifies a quarantine record. Chosen to be impossible to
/// mistake for a licence token, and checked before token parsing so a quarantined
/// installation reports "revoked", not "corrupt".
const QUARANTINE_MARKER: &str = "qms_license_quarantined";

/// The file the original token is preserved in when an installation is
/// quarantined. Kept rather than deleted: the codebase retires records instead
/// of erasing them, and support needs the original token to diagnose a lockout.
pub const QUARANTINE_BACKUP_FILENAME: &str = "license.revoked.json";

/// Why an installation was locked out, written where the next startup will find
/// it. Without this the customer would be told "not activated", which is both
/// wrong and the least useful thing to say to someone whose licence was revoked.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RevocationRecord {
    /// Always true. Presence of the key is what identifies the file.
    pub qms_license_quarantined: bool,
    /// Stable machine-readable cause, e.g. LICENSE_REVOKED.
    pub reason_code: String,
    /// The LicenseState this resolves to, e.g. REVOKED.
    pub state: String,
    /// The licensing server's own words, for the support log.
    pub server_message: String,
    /// Date of the quarantine, YYYY-MM-DD, in UTC — the same clock
    /// validate_token uses for expiry and grace, so the two cannot disagree.
    pub quarantined_on: String,
}

/// Outcome of reading %APPDATA%\QMSDesktop\license.json.
///
/// Phase R8: previously this was Option<LicenseToken>, which mapped a corrupt
/// file onto None — indistinguishable from "no license installed". The app then
/// reported NOT_ACTIVATED for a damaged token, which is misleading during
/// support and hides tampering. The cases are explicit for the same reason
/// Quarantined was later added: each one sends support down a different path.
#[derive(Debug)]
pub enum LicenseFileState {
    /// File absent, empty, or still the "unlicensed" placeholder.
    Missing,
    /// File present and readable, but not parseable as a LicenseToken.
    Corrupt,
    /// The licensing server authoritatively refused this installation and the
    /// token was quarantined. Distinct from Corrupt (damaged) and Missing (never
    /// activated) — the customer needs "your licence was revoked", not "your
    /// file is broken" or "enter a key you already entered".
    Quarantined(Box<RevocationRecord>),
    /// A structurally valid token. Cryptographic validity is decided later.
    Token(Box<LicenseToken>),
}

/// Read the license token from %APPDATA%\QMSDesktop\license.json.
///
/// Returns Err only when the file exists but cannot be read at all
/// (permissions, invalid UTF-8). Callers MUST treat that as fail-closed —
/// never as "no license".
pub fn read_license_token() -> Result<LicenseFileState, String> {
    let paths = get_storage_paths()?;
    let path = &paths.license;

    if !path.exists() {
        return Ok(LicenseFileState::Missing);
    }

    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read license.json: {}", e))?;

    Ok(classify_license_content(&content))
}

/// Decide what a license.json body represents. Pure and filesystem-free, so the
/// distinction that matters — "no licence" versus "damaged licence" — is testable
/// without touching %APPDATA%.
pub fn classify_license_content(content: &str) -> LicenseFileState {
    // A UTF-8 BOM is not whitespace, so str::trim() leaves it in place and
    // serde_json then fails on it — which previously surfaced as NOT_ACTIVATED.
    let trimmed = content.trim_start_matches('\u{feff}').trim();
    if trimmed.is_empty() {
        return LicenseFileState::Missing;
    }

    // Detect placeholder file written by storage::create_placeholder_files()
    if trimmed.contains("\"unlicensed\"") || trimmed.contains("\"status\":\"unlicensed\"") {
        return LicenseFileState::Missing;
    }

    // Checked before token parsing. A quarantine record is not a LicenseToken,
    // so without this it would fall through to Corrupt and the customer would be
    // told their file is damaged when in fact their licence was revoked.
    //
    // The test is the parsed top-level flag, deliberately not a substring scan of
    // the file. A raw scan would lock out any legitimate token that happened to
    // contain the marker text anywhere — in a customer name, say — and because
    // re-activation writes that same name back, the lockout would be permanent
    // and unrecoverable.
    //
    // A quarantine file damaged past parsing falls through to `Corrupt`, which
    // is also not a valid licence, so access still is not restored — it is just
    // described accurately.
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if v.get(QUARANTINE_MARKER).and_then(|b| b.as_bool()) == Some(true) {
            if let Ok(record) = serde_json::from_str::<RevocationRecord>(trimmed) {
                return LicenseFileState::Quarantined(Box::new(record));
            }
            // Flagged as quarantined but missing fields: still refuse to run.
            return LicenseFileState::Quarantined(Box::new(RevocationRecord {
                qms_license_quarantined: true,
                reason_code:    "SERVER_DENIED".to_string(),
                state:          "REVOKED".to_string(),
                server_message: "This installation was locked out by the license server. The lockout record could not be read in full.".to_string(),
                quarantined_on: String::new(),
            }));
        }
    }

    match serde_json::from_str::<LicenseToken>(trimmed) {
        Ok(token) => LicenseFileState::Token(Box::new(token)),
        Err(_)    => LicenseFileState::Corrupt,
    }
}

/// Build the quarantine record body. Pure and filesystem-free so the exact bytes
/// written on a lockout, and the fact that they read back as Quarantined, can be
/// tested without touching %APPDATA%.
pub fn build_quarantine_record(
    reason_code: &str,
    state: &str,
    server_message: &str,
    quarantined_on: &str,
) -> RevocationRecord {
    RevocationRecord {
        qms_license_quarantined: true,
        reason_code:    reason_code.to_string(),
        state:          state.to_string(),
        server_message: server_message.to_string(),
        quarantined_on: quarantined_on.to_string(),
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_token_json() -> String {
        // Structurally valid; signature is not checked at this layer.
        r#"{
          "license_id":"00000000-0000-0000-0000-000000000001",
          "activation_id":null,"license_key_last4":"ABCD",
          "customer_name":"Test","plan":"professional","max_activations":1,
          "hardware_fingerprint":"ff","issued_at":"2026-01-01T00:00:00Z",
          "activated_at":null,"expires_at":null,"last_validated_at":null,
          "next_validation_due_at":null,"grace_until":null,
          "features":["capa"],"signature":"sig","status":"active"
        }"#.to_string()
    }

    #[test]
    fn placeholder_is_missing_not_corrupt() {
        let s = r#"{"status":"unlicensed","activated_at":null,"hardware_id":null,"token":null}"#;
        assert!(matches!(classify_license_content(s), LicenseFileState::Missing));
    }

    #[test]
    fn empty_or_whitespace_is_missing() {
        assert!(matches!(classify_license_content(""), LicenseFileState::Missing));
        assert!(matches!(classify_license_content("   \n\t "), LicenseFileState::Missing));
    }

    /// The regression this whole state exists for: a damaged token must report
    /// Corrupt, not Missing. Collapsing the two told users "not activated" when
    /// their licence was actually damaged or tampered with.
    #[test]
    fn truncated_json_is_corrupt_not_missing() {
        let s = r#"{"license_id":"abc","customer_name":"#;
        assert!(matches!(classify_license_content(s), LicenseFileState::Corrupt));
    }

    #[test]
    fn valid_json_of_wrong_shape_is_corrupt() {
        assert!(matches!(classify_license_content(r#"{"hello":"world"}"#), LicenseFileState::Corrupt));
    }

    #[test]
    fn well_formed_token_parses() {
        match classify_license_content(&valid_token_json()) {
            LicenseFileState::Token(t) => {
                assert_eq!(t.plan, "professional");
                assert_eq!(t.status, "active");
            }
            other => panic!("expected Token, got {:?}", other),
        }
    }

    /// A UTF-8 BOM used to make serde_json fail, silently downgrading a perfectly
    /// good licence to "not activated".
    #[test]
    fn utf8_bom_prefix_is_tolerated() {
        let s = format!("\u{feff}{}", valid_token_json());
        assert!(matches!(classify_license_content(&s), LicenseFileState::Token(_)));
    }

    // ── Quarantine ────────────────────────────────────────────────────────────

    /// The bytes written on a lockout must read back as Quarantined, carrying the
    /// reason. If this round trip broke, a revoked machine would report CORRUPT
    /// and the customer would be sent to the wrong support path.
    #[test]
    fn a_quarantine_record_round_trips_and_is_not_corrupt() {
        let rec = build_quarantine_record(
            "LICENSE_REVOKED",
            "REVOKED",
            "License is revoked",
            "2026-09-05",
        );
        let json = serde_json::to_string_pretty(&rec).expect("serialises");

        match classify_license_content(&json) {
            LicenseFileState::Quarantined(r) => {
                assert_eq!(r.reason_code, "LICENSE_REVOKED");
                assert_eq!(r.state, "REVOKED");
                assert_eq!(r.server_message, "License is revoked");
                assert_eq!(r.quarantined_on, "2026-09-05");
            }
            other => panic!("expected Quarantined, got {:?}", other),
        }
    }

    /// Damaging the quarantine record must not restore access.
    ///
    /// A record that still parses as JSON but has lost its fields reports
    /// Quarantined; one damaged past parsing reports Corrupt. Neither is a valid
    /// licence, which is the property that matters — the difference is only what
    /// the customer is told.
    #[test]
    fn a_damaged_quarantine_record_still_locks_out() {
        match classify_license_content(r#"{"qms_license_quarantined":true}"#) {
            LicenseFileState::Quarantined(r) => {
                assert!(r.qms_license_quarantined);
                assert_eq!(r.state, "REVOKED");
            }
            other => panic!("expected Quarantined, got {:?}", other),
        }

        // Damaged past parsing: Corrupt, and Corrupt is never a valid licence.
        assert!(matches!(
            classify_license_content(r#"{"qms_license_quarantined":true,"reason_code":"#),
            LicenseFileState::Corrupt
        ));
    }

    /// A raw substring scan for the marker would lock out any legitimate token
    /// that happened to contain the text — and because re-activation writes the
    /// same customer name back, that lockout would be permanent. Detection tests
    /// the parsed top-level flag instead.
    #[test]
    fn a_token_merely_mentioning_the_marker_is_still_a_token() {
        let s = valid_token_json().replace(
            r#""customer_name":"Test""#,
            r#""customer_name":"qms_license_quarantined Ltd""#,
        );
        assert!(
            matches!(classify_license_content(&s), LicenseFileState::Token(_)),
            "a valid token must not be locked out by its own text"
        );
    }

    /// A quarantine record must never be mistaken for a licence, and a licence
    /// must never be mistaken for a quarantine record.
    #[test]
    fn quarantine_and_token_do_not_collide() {
        let rec = build_quarantine_record("SERVER_DENIED", "REVOKED", "denied", "2026-09-05");
        let quarantine_json = serde_json::to_string(&rec).unwrap();
        assert!(matches!(
            classify_license_content(&quarantine_json),
            LicenseFileState::Quarantined(_)
        ));
        assert!(matches!(
            classify_license_content(&valid_token_json()),
            LicenseFileState::Token(_)
        ));
    }

    // ── Quarantine, on a real directory ───────────────────────────────────────

    /// %APPDATA% is not redirectable from a test without a process-global env
    /// mutation, so the path-taking form is exercised against a scratch folder
    /// instead. Same pattern as the backup tests.
    struct Scratch {
        dir: std::path::PathBuf,
    }
    impl Scratch {
        fn new(tag: &str) -> Self {
            let mut dir = std::env::temp_dir();
            dir.push(format!("qms_licq_{}_{}", tag, std::process::id()));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            Scratch { dir }
        }
        fn license(&self) -> std::path::PathBuf {
            self.dir.join("license.json")
        }
    }
    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }

    /// The lockout must actually replace the token on disk, and the original
    /// must survive next to it so support can see what was revoked.
    #[test]
    fn quarantining_replaces_the_token_and_preserves_the_original() {
        let s = Scratch::new("replace");
        std::fs::write(s.license(), valid_token_json()).unwrap();

        let rec = build_quarantine_record(
            "LICENSE_REVOKED",
            "REVOKED",
            "License is revoked",
            "2026-09-05",
        );
        quarantine_license_file_in(&s.dir, &s.license(), &rec).unwrap();

        // license.json now locks out
        let now = std::fs::read_to_string(s.license()).unwrap();
        assert!(matches!(
            classify_license_content(&now),
            LicenseFileState::Quarantined(_)
        ));

        // the original token is preserved beside it
        let kept = std::fs::read_to_string(s.dir.join(QUARANTINE_BACKUP_FILENAME)).unwrap();
        assert!(matches!(
            classify_license_content(&kept),
            LicenseFileState::Token(_)
        ));
    }

    /// Quarantining twice must not overwrite the preserved original with the
    /// marker that replaced it — that would destroy the only copy of the token.
    #[test]
    fn quarantining_twice_keeps_the_first_preserved_token() {
        let s = Scratch::new("twice");
        std::fs::write(s.license(), valid_token_json()).unwrap();

        let rec = build_quarantine_record("LICENSE_REVOKED", "REVOKED", "revoked", "2026-09-05");
        quarantine_license_file_in(&s.dir, &s.license(), &rec).unwrap();
        quarantine_license_file_in(&s.dir, &s.license(), &rec).unwrap();

        let kept = std::fs::read_to_string(s.dir.join(QUARANTINE_BACKUP_FILENAME)).unwrap();
        assert!(
            matches!(classify_license_content(&kept), LicenseFileState::Token(_)),
            "the preserved original must still be the token, not a second marker"
        );
    }

    /// A machine that was never activated has no token to preserve. Quarantining
    /// must still succeed rather than erroring on the missing file.
    #[test]
    fn quarantining_without_an_existing_token_still_locks_out() {
        let s = Scratch::new("empty");
        let rec = build_quarantine_record("SERVER_DENIED", "REVOKED", "denied", "2026-09-05");
        quarantine_license_file_in(&s.dir, &s.license(), &rec).unwrap();

        let now = std::fs::read_to_string(s.license()).unwrap();
        assert!(matches!(
            classify_license_content(&now),
            LicenseFileState::Quarantined(_)
        ));
        assert!(!s.dir.join(QUARANTINE_BACKUP_FILENAME).exists());
    }

    /// Re-activation is the documented way back. A freshly issued token written
    /// over the marker must be read as a licence again.
    #[test]
    fn reactivating_over_a_quarantine_marker_restores_a_token() {
        let rec = build_quarantine_record("LICENSE_REVOKED", "REVOKED", "revoked", "2026-09-05");
        let quarantine_json = serde_json::to_string(&rec).unwrap();
        assert!(matches!(
            classify_license_content(&quarantine_json),
            LicenseFileState::Quarantined(_)
        ));
        // activate_license_online writes the new token over the same path
        assert!(matches!(
            classify_license_content(&valid_token_json()),
            LicenseFileState::Token(_)
        ));
    }
}

/// Write a LicenseToken to %APPDATA%\QMSDesktop\license.json.
pub fn write_license_token(token: &LicenseToken) -> Result<(), String> {
    let paths = get_storage_paths()?;
    let json = serde_json::to_string_pretty(token)
        .map_err(|e| format!("Failed to serialize license token: {}", e))?;
    std::fs::write(&paths.license, json)
        .map_err(|e| format!("Failed to write license.json: {}", e))?;
    Ok(())
}

/// Lock this installation out after an authoritative denial from the licensing
/// server, and leave behind a record of why.
///
/// The original token is copied to `license.revoked.json` first, then
/// `license.json` is replaced by the quarantine record. Preserving the original
/// matters for support — a customer reporting "it stopped working" is much
/// easier to help with the exact token in hand — and it matches how the rest of
/// the product treats terminal states: retire the record, never erase it.
///
/// Evidence is best-effort; the lockout is not. If the backup copy cannot be
/// written the quarantine still proceeds, because failing to preserve a
/// diagnostic is not a reason to leave a revoked machine running.
pub fn quarantine_license_token(record: &RevocationRecord) -> Result<(), String> {
    let paths = get_storage_paths()?;
    quarantine_license_file_in(&paths.root, &paths.license, record)
}

/// The quarantine itself, against explicit paths.
///
/// Split out for the same reason `classify_license_content` is: the interesting
/// behaviour — does the original survive, does re-quarantining clobber it — is
/// worth testing, and it cannot be tested through a function that resolves
/// %APPDATA% for itself.
pub fn quarantine_license_file_in(
    root: &std::path::Path,
    license_path: &std::path::Path,
    record: &RevocationRecord,
) -> Result<(), String> {
    if let Ok(existing) = std::fs::read_to_string(license_path) {
        // Only worth keeping if it is not already a quarantine record. Without
        // this guard, quarantining twice would overwrite the preserved original
        // token with the marker that replaced it.
        if !existing.contains(QUARANTINE_MARKER) {
            let _ = std::fs::write(root.join(QUARANTINE_BACKUP_FILENAME), &existing);
        }
    }

    let json = serde_json::to_string_pretty(record)
        .map_err(|e| format!("Failed to serialize quarantine record: {}", e))?;
    std::fs::write(license_path, json)
        .map_err(|e| format!("Failed to quarantine license.json: {}", e))?;
    Ok(())
}

/// Resets license.json to the unlicensed placeholder.
/// DEV ONLY — clears any existing license so the not-activated state can be tested.
pub fn reset_license_to_unlicensed() -> Result<(), String> {
    let paths = get_storage_paths()?;
    let content =
        r#"{"status":"unlicensed","activated_at":null,"hardware_id":null,"token":null}"#;
    std::fs::write(&paths.license, content)
        .map_err(|e| format!("Failed to reset license.json: {}", e))?;
    Ok(())
}
