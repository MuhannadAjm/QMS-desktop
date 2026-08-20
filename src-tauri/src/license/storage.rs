use crate::license::token::LicenseToken;
use crate::storage::get_storage_paths;

/// Outcome of reading %APPDATA%\QMSDesktop\license.json.
///
/// Phase R8: previously this was Option<LicenseToken>, which mapped a corrupt
/// file onto None — indistinguishable from "no license installed". The app then
/// reported NOT_ACTIVATED for a damaged token, which is misleading during
/// support and hides tampering. The three cases are now explicit.
#[derive(Debug)]
pub enum LicenseFileState {
    /// File absent, empty, or still the "unlicensed" placeholder.
    Missing,
    /// File present and readable, but not parseable as a LicenseToken.
    Corrupt,
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

    match serde_json::from_str::<LicenseToken>(trimmed) {
        Ok(token) => LicenseFileState::Token(Box::new(token)),
        Err(_)    => LicenseFileState::Corrupt,
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
