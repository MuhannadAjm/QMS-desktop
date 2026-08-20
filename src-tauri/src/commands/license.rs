use serde::{Deserialize, Serialize};

use crate::license::{
    LicenseState,
    hardware::{compute_hardware_fingerprint, fingerprint_short},
    storage::{read_license_token, reset_license_to_unlicensed, write_license_token, LicenseFileState},
    token::LicenseToken,
    validation::{compute_dev_signature, validate_token},
};

// Base URL for the Supabase licensing Edge Functions.
const LICENSE_SERVER_BASE_URL: &str =
    "https://ojomsgphjljypxodbxyu.supabase.co/functions/v1";

// ── Response types ─────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct LicenseStatusResult {
    pub state: String,
    pub state_label: String,
    pub is_valid: bool,
    pub message: String,
}

#[derive(Serialize)]
pub struct LicenseDetails {
    pub state: String,
    pub state_label: String,
    pub is_valid: bool,
    pub license_id: Option<String>,
    pub activation_id: Option<String>,
    pub customer_name: Option<String>,
    pub plan: Option<String>,
    pub hardware_fingerprint_short: Option<String>,
    pub issued_at: Option<String>,
    pub activated_at: Option<String>,
    pub expires_at: Option<String>,
    pub last_validated_at: Option<String>,
    pub next_validation_due_at: Option<String>,
    pub grace_until: Option<String>,
    pub features: Vec<String>,
    pub message: String,
}

// ── Helpers ────────────────────────────────────────────────────────────────────

fn state_label(s: &LicenseState) -> &'static str {
    match s {
        LicenseState::NotActivated     => "Not Activated",
        LicenseState::Active           => "Active",
        LicenseState::Expired          => "Expired",
        LicenseState::Invalid          => "Invalid",
        LicenseState::HardwareMismatch => "Hardware Mismatch",
        LicenseState::Revoked          => "Revoked",
        LicenseState::DevBypass        => "Active (Dev Mode)",
        LicenseState::Corrupt          => "Corrupt License File",
    }
}

fn state_message(s: &LicenseState) -> &'static str {
    match s {
        LicenseState::NotActivated     => "No license found. Import a license token to activate.",
        LicenseState::Active           => "License is valid and active.",
        LicenseState::Expired          => "License has expired. Please renew your license.",
        LicenseState::Invalid          => "This license failed signature verification. It was not issued for this product build.",
        LicenseState::HardwareMismatch => "This license is bound to a different machine. Contact support.",
        LicenseState::Revoked          => "This license has been revoked. Contact support.",
        LicenseState::DevBypass        => "Running in development mode. Not valid for production use.",
        LicenseState::Corrupt          => "The license file is damaged and could not be read. Re-activate or import your license token again.",
    }
}

fn build_status(state: LicenseState) -> LicenseStatusResult {
    LicenseStatusResult {
        is_valid:    matches!(state, LicenseState::Active | LicenseState::DevBypass),
        message:     state_message(&state).to_string(),
        state_label: state_label(&state).to_string(),
        state:       state.to_string(),
    }
}

// ── Commands ───────────────────────────────────────────────────────────────────

/// Return the short display form of this machine's hardware fingerprint.
/// The full 64-char SHA-256 hex is never exposed to the frontend.
/// Safe to call before login (no current_user_id required — runs at startup).
#[tauri::command]
pub fn get_hardware_fingerprint() -> Result<String, String> {
    let full = compute_hardware_fingerprint()?;
    Ok(fingerprint_short(&full))
}

/// Return the current license state.
/// Called at app startup before login to decide whether to gate access.
#[tauri::command]
pub fn get_license_status() -> Result<LicenseStatusResult, String> {
    let state = match read_license_token()? {
        LicenseFileState::Missing  => LicenseState::NotActivated,
        LicenseFileState::Corrupt  => LicenseState::Corrupt,
        LicenseFileState::Token(t) => validate_token(&t),
    };
    Ok(build_status(state))
}

/// Return full license details for the License page display.
#[tauri::command]
pub fn get_license_details() -> Result<LicenseDetails, String> {
    let (state, details) = match read_license_token()? {
        LicenseFileState::Missing => (LicenseState::NotActivated, None),
        LicenseFileState::Corrupt => (LicenseState::Corrupt, None),
        LicenseFileState::Token(t) => {
            let t = *t;
            let s = validate_token(&t);
            (s, Some(t))
        }
    };

    let is_valid = matches!(state, LicenseState::Active | LicenseState::DevBypass);

    Ok(match details {
        None => LicenseDetails {
            state:                    state.to_string(),
            state_label:              state_label(&state).to_string(),
            is_valid,
            license_id:               None,
            activation_id:            None,
            customer_name:            None,
            plan:                     None,
            hardware_fingerprint_short: None,
            issued_at:                None,
            activated_at:             None,
            expires_at:               None,
            last_validated_at:        None,
            next_validation_due_at:   None,
            grace_until:              None,
            features:                 vec![],
            message:                  state_message(&state).to_string(),
        },
        Some(t) => LicenseDetails {
            state:                    state.to_string(),
            state_label:              state_label(&state).to_string(),
            is_valid,
            hardware_fingerprint_short: Some(fingerprint_short(&t.hardware_fingerprint)),
            license_id:               Some(t.license_id),
            activation_id:            t.activation_id,
            customer_name:            Some(t.customer_name),
            plan:                     Some(t.plan),
            issued_at:                Some(t.issued_at),
            activated_at:             t.activated_at,
            expires_at:               t.expires_at,
            last_validated_at:        t.last_validated_at,
            next_validation_due_at:   t.next_validation_due_at,
            grace_until:              t.grace_until,
            features:                 t.features,
            message:                  state_message(&state).to_string(),
        },
    })
}

/// Re-read and validate the local license.json without modifying it.
#[tauri::command]
pub fn validate_local_license() -> Result<LicenseStatusResult, String> {
    get_license_status()
}

/// Import a license token from a JSON string.
/// The token is parsed, written to license.json, then validated immediately.
/// Returns the resulting license state.
#[tauri::command]
pub fn import_license_token(token_json: String) -> Result<LicenseStatusResult, String> {
    let token: LicenseToken = serde_json::from_str(&token_json)
        .map_err(|e| format!("Invalid license token format: {}", e))?;

    // Structural validation — required fields must be non-empty
    if token.license_id.trim().is_empty() {
        return Err("License token is missing 'license_id'".to_string());
    }
    if token.customer_name.trim().is_empty() {
        return Err("License token is missing 'customer_name'".to_string());
    }
    if token.hardware_fingerprint.trim().is_empty() {
        return Err("License token is missing 'hardware_fingerprint'".to_string());
    }
    if token.signature.trim().is_empty() {
        return Err("License token is missing 'signature'".to_string());
    }

    write_license_token(&token)?;

    let state = validate_token(&token);
    Ok(build_status(state))
}

/// DEV ONLY — Resets license.json to the unlicensed placeholder so the
/// not-activated gate can be tested without deleting the file manually.
/// In production (release) builds this command is disabled and returns an error.
#[tauri::command]
pub fn clear_local_license_dev_only() -> Result<(), String> {
    if cfg!(not(debug_assertions)) {
        return Err("Development tools are not available in production builds.".to_string());
    }
    reset_license_to_unlicensed()
}

/// DEV ONLY — Creates a development license for the current machine.
///
/// The generated token has:
///   status = "dev_bypass"
///   hardware_fingerprint = fingerprint of this machine
///   signature = HMAC-SHA256 (Phase 9A dev key)
///   customer_name = "Development Mode"
///   expires_at = null (perpetual)
///
/// This token passes local validation on this machine only.
/// It will NOT pass validation on any other machine.
/// It will NOT pass RSA production validation.
/// NOT FOR PRODUCTION USE. In release builds this command returns an error.
#[tauri::command]
pub fn create_dev_license_for_current_machine() -> Result<LicenseStatusResult, String> {
    if cfg!(not(debug_assertions)) {
        return Err("Development tools are not available in production builds.".to_string());
    }
    let fp = compute_hardware_fingerprint()?;

    let mut token = LicenseToken {
        license_id:             "DEV-LOCAL-000".to_string(),
        activation_id:          None,
        license_key_last4:      Some("DEV0".to_string()),
        customer_name:          "Development Mode".to_string(),
        plan:                   "dev".to_string(),
        max_activations:        1,
        hardware_fingerprint:   fp,
        issued_at:              "2026-01-01T00:00:00Z".to_string(),
        activated_at:           Some("2026-01-01T00:00:00Z".to_string()),
        expires_at:             None,
        last_validated_at:      None,
        next_validation_due_at: None,
        grace_until:            None,
        features: vec![
            "capa".to_string(),
            "risks".to_string(),
            "complaints".to_string(),
            "audits".to_string(),
            "documents".to_string(),
            "nc".to_string(),
            "reports".to_string(),
            "backup".to_string(),
        ],
        signature: String::new(), // filled below
        status:    "dev_bypass".to_string(),
    };

    token.signature = compute_dev_signature(&token)?;

    write_license_token(&token)?;

    let state = validate_token(&token);
    Ok(build_status(state))
}

// ── Online activation commands ─────────────────────────────────────────────────

/// Activate the license online by sending the license key + hardware fingerprint
/// to the Supabase Edge Function.
///
/// The server verifies the key, checks activation limits, creates an activation
/// record, signs a license token with the RSA private key, and returns it.
/// The signed token is written to license.json and validated locally.
///
/// The raw license_key is sent over HTTPS and immediately discarded — it is NOT
/// stored in license.json or anywhere on disk.
#[tauri::command]
pub async fn activate_license_online(
    license_key: String,
    machine_label: String,
) -> Result<LicenseStatusResult, String> {
    // Get hardware fingerprint (full hex for server, short for display)
    let full_fp  = compute_hardware_fingerprint()?;
    let short_fp = fingerprint_short(&full_fp);

    let url = format!("{}/activate-license", LICENSE_SERVER_BASE_URL);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let body = serde_json::json!({
        "license_key":               license_key,  // sent over HTTPS, not stored
        "hardware_fingerprint":      full_fp,
        "hardware_fingerprint_short": short_fp,
        "machine_label":             machine_label,
        "app_version":               env!("CARGO_PKG_VERSION"),
    });

    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "Connection timeout. Check your internet connection.".to_string()
            } else if e.is_connect() {
                "Cannot reach the license server. Check your internet connection.".to_string()
            } else {
                format!("Network error: {}", e)
            }
        })?;

    let status_code = resp.status();

    // Parse response as JSON — graceful fallback if body is not JSON
    let resp_json: serde_json::Value = resp
        .json()
        .await
        .unwrap_or(serde_json::Value::Null);

    if !status_code.is_success() {
        // Server returns { "error": "..." } or occasionally { "message": "..." }
        let msg = resp_json["error"]
            .as_str()
            .or_else(|| resp_json["message"].as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| "Unable to activate license. Please contact support.".to_string());
        return Err(msg);
    }

    // The server returns the full LicenseToken as JSON
    let token: LicenseToken = serde_json::from_value(resp_json)
        .map_err(|e| format!("Invalid token format from server: {}", e))?;

    write_license_token(&token)?;

    let state = validate_token(&token);
    Ok(build_status(state))
}

/// Validate the existing license online against the Supabase server.
/// Sends license_id + activation_id + hardware_fingerprint to the server.
/// The server checks the activation is still active, the license is not revoked,
/// and returns a fresh RSA-signed token.
///
/// Falls back gracefully: if the server is unreachable, local RSA validation
/// is used instead (the grace policy still applies offline).
#[tauri::command]
pub async fn validate_license_online() -> Result<LicenseStatusResult, String> {
    let token = match read_license_token()? {
        LicenseFileState::Token(t) => *t,
        LicenseFileState::Missing  => return Ok(build_status(LicenseState::NotActivated)),
        LicenseFileState::Corrupt  => return Ok(build_status(LicenseState::Corrupt)),
    };

    // DEV_BYPASS tokens don't need online validation
    if token.status == "dev_bypass" {
        let state = validate_token(&token);
        return Ok(build_status(state));
    }

    let activation_id = match &token.activation_id {
        Some(id) => id.clone(),
        None     => return Err("No activation_id in token. Re-activate online.".to_string()),
    };

    let full_fp = compute_hardware_fingerprint()?;
    let url     = format!("{}/validate-license", LICENSE_SERVER_BASE_URL);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let body = serde_json::json!({
        "license_id":          token.license_id,
        "activation_id":       activation_id,
        "hardware_fingerprint": full_fp,
        "app_version":         env!("CARGO_PKG_VERSION"),
    });

    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() || e.is_connect() {
                "Offline — using local license validation".to_string()
            } else {
                format!("Network error: {}", e)
            }
        });

    match resp {
        Err(offline_msg) => {
            // Server unreachable — fall back to local RSA validation
            let local_state = validate_token(&token);
            let mut result  = build_status(local_state);
            result.message  = format!("{} ({})", result.message, offline_msg);
            Ok(result)
        }
        Ok(http_resp) => {
            let status_code = http_resp.status();
            let resp_json: serde_json::Value = http_resp
                .json()
                .await
                .map_err(|_| "Invalid response from license server".to_string())?;

            if !status_code.is_success() {
                let msg = resp_json["error"]
                    .as_str()
                    .unwrap_or("License server error")
                    .to_string();
                return Err(msg);
            }

            // Write fresh token
            let fresh_token: LicenseToken = serde_json::from_value(resp_json)
                .map_err(|e| format!("Invalid token format from server: {}", e))?;

            write_license_token(&fresh_token)?;

            let state = validate_token(&fresh_token);
            Ok(build_status(state))
        }
    }
}

// Needed for the online command request bodies
#[allow(dead_code)]
#[derive(Deserialize)]
struct ServerError {
    error: String,
}
