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

    let trimmed = content.trim_start_matches('\u{feff}').trim();
    if trimmed.is_empty() {
        return Ok(LicenseFileState::Missing);
    }

    // Detect placeholder file written by storage::create_placeholder_files()
    if trimmed.contains("\"unlicensed\"") || trimmed.contains("\"status\":\"unlicensed\"") {
        return Ok(LicenseFileState::Missing);
    }

    match serde_json::from_str::<LicenseToken>(trimmed) {
        Ok(token) => Ok(LicenseFileState::Token(Box::new(token))),
        Err(_)    => Ok(LicenseFileState::Corrupt),
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
