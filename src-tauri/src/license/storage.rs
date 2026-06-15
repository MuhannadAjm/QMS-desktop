use crate::license::token::LicenseToken;
use crate::storage::get_storage_paths;

/// Read the license token from %APPDATA%\QMSDesktop\license.json.
/// Returns Ok(None) if the file is missing, empty, or contains the
/// placeholder "unlicensed" structure written by create_placeholder_files().
/// Returns Ok(Some(token)) if a full LicenseToken could be parsed.
/// Returns Err if the file exists but cannot be read at all.
pub fn read_license_token() -> Result<Option<LicenseToken>, String> {
    let paths = get_storage_paths()?;
    let path = &paths.license;

    if !path.exists() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read license.json: {}", e))?;

    let trimmed = content.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    // Detect placeholder file written by storage::create_placeholder_files()
    if trimmed.contains("\"unlicensed\"") || trimmed.contains("\"status\":\"unlicensed\"") {
        return Ok(None);
    }

    match serde_json::from_str::<LicenseToken>(trimmed) {
        Ok(token) => Ok(Some(token)),
        Err(_) => Ok(None), // Corrupt JSON → treat as not activated
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
