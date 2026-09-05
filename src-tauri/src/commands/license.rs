use serde::{Deserialize, Serialize};

use crate::license::{
    LicenseState,
    hardware::{compute_hardware_fingerprint, fingerprint_short},
    online::{decide_online_outcome, DenialReason, LocalGrace, OnlineDecision, TransportOutcome},
    storage::{
        build_quarantine_record, quarantine_license_token, read_license_token,
        reset_license_to_unlicensed, write_license_token, LicenseFileState, RevocationRecord,
    },
    token::LicenseToken,
    validation::{compute_dev_signature, current_date_string, validate_token},
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
    let message = state_message(&state).to_string();
    build_status_with_message(state, message)
}

/// Same as `build_status`, but for the cases where the generic per-state text is
/// not the most useful thing to say — chiefly a quarantined installation, where
/// the customer needs to know *which* refusal locked them out.
fn build_status_with_message(state: LicenseState, message: String) -> LicenseStatusResult {
    LicenseStatusResult {
        is_valid:    matches!(state, LicenseState::Active | LicenseState::DevBypass),
        message,
        state_label: state_label(&state).to_string(),
        state:       state.to_string(),
    }
}

/// Whether a token the server just issued may replace the one already on disk.
///
/// Only a token that passes the embedded-key check earns that. Anything else —
/// a wrong-key signature, a foreign machine, an expired payload — leaves the
/// working licence in place, because there is exactly one copy of it.
fn may_adopt(state: &LicenseState) -> bool {
    matches!(state, LicenseState::Active | LicenseState::DevBypass)
}

/// Resolve a stored quarantine record into the state and message the UI shows.
///
/// `state` is read from the record so a future build that quarantines for a new
/// reason still reports something sensible; the reason code supplies the wording.
/// Anything unrecognised resolves to Revoked, never to a usable state.
fn quarantine_state_and_message(record: &RevocationRecord) -> (LicenseState, String) {
    let reason = DenialReason::from_code(&record.reason_code);
    let state = match record.state.as_str() {
        "EXPIRED"           => LicenseState::Expired,
        "HARDWARE_MISMATCH" => LicenseState::HardwareMismatch,
        "INVALID"           => LicenseState::Invalid,
        _                   => reason.resulting_state(),
    };
    (state, reason.customer_message().to_string())
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
    Ok(match read_license_token()? {
        LicenseFileState::Missing  => build_status(LicenseState::NotActivated),
        LicenseFileState::Corrupt  => build_status(LicenseState::Corrupt),
        LicenseFileState::Token(t) => build_status(validate_token(&t)),
        LicenseFileState::Quarantined(r) => {
            let (state, message) = quarantine_state_and_message(&r);
            build_status_with_message(state, message)
        }
    })
}

/// Return full license details for the License page display.
#[tauri::command]
pub fn get_license_details() -> Result<LicenseDetails, String> {
    let (state, details, message) = match read_license_token()? {
        LicenseFileState::Missing => (
            LicenseState::NotActivated,
            None,
            state_message(&LicenseState::NotActivated).to_string(),
        ),
        LicenseFileState::Corrupt => (
            LicenseState::Corrupt,
            None,
            state_message(&LicenseState::Corrupt).to_string(),
        ),
        LicenseFileState::Quarantined(r) => {
            let (s, m) = quarantine_state_and_message(&r);
            (s, None, m)
        }
        LicenseFileState::Token(t) => {
            let t = *t;
            let s = validate_token(&t);
            let m = state_message(&s).to_string();
            (s, Some(t), m)
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
            message:                  message.clone(),
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
            message:                  message.clone(),
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

/// Validate the existing licence against the licensing server, and act on what
/// the server actually says.
///
/// This is the point where a vendor revocation reaches the customer's machine.
/// It is deliberately conservative in one direction and decisive in the other:
///
/// * A TECHNICAL failure — offline, DNS, timeout, TLS, 5xx, a proxy page, an
///   unreadable body — changes nothing. The local token stands on its own RSA
///   signature exactly as it does on a machine that has never been online. QMS
///   Desktop is an offline-capable product, and a bad minute at the backend must
///   never cost a paying customer their licence.
///
/// * An AUTHORITATIVE denial — the server answering 403/404 in its own error
///   shape — quarantines the local token and locks the installation out.
///
/// The classification is a pure function in `license::online`, so every branch
/// of the deployed server contract is covered by tests with no network. This
/// command is the thin I/O shell around it.
///
/// It never returns `Err` for a licensing outcome. Returning `Err` on a 403 was
/// the original defect: the frontend's catch branch ran, `setLicenseInvalid()`
/// was never reached, and a revoked licence kept working indefinitely.
#[tauri::command]
pub async fn validate_license_online() -> Result<LicenseStatusResult, String> {
    let token = match read_license_token()? {
        LicenseFileState::Token(t) => *t,
        LicenseFileState::Missing  => return Ok(build_status(LicenseState::NotActivated)),
        LicenseFileState::Corrupt  => return Ok(build_status(LicenseState::Corrupt)),
        // Already locked out. Asking again would tell us nothing new, and
        // re-quarantining would overwrite the preserved original token.
        LicenseFileState::Quarantined(r) => {
            let (state, message) = quarantine_state_and_message(&r);
            return Ok(build_status_with_message(state, message));
        }
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
    let outcome = fetch_validation(&token.license_id, &activation_id, &full_fp).await;

    // The token in hand is what decides whether the backend's zero-grace expiry
    // refusal may be declined — the grace window it carries was signed by that
    // same backend. See `LocalGrace`.
    let grace = LocalGrace {
        grace_until: token.grace_until.clone(),
        today:       current_date_string(),
    };

    match decide_online_outcome(outcome, &grace) {
        OnlineDecision::AdoptToken(fresh) => {
            // Verify BEFORE persisting. `write_license_token` is a plain
            // overwrite with no backup, so adopting first and checking second
            // would destroy a working licence on the strength of a token this
            // build cannot verify — and this now runs unattended on every
            // launch, not only when someone presses a button. `LicenseToken`
            // has no `deny_unknown_fields`, so a token that merely deserialises
            // proves nothing about its signature.
            let fresh_state = validate_token(&fresh);
            if may_adopt(&fresh_state) {
                write_license_token(&fresh)?;
                return Ok(build_status(fresh_state));
            }
            let mut result = build_status(validate_token(&token));
            result.message = format!(
                "{} (the license server returned a token this build could not verify, so your existing license is unchanged)",
                result.message
            );
            Ok(result)
        }

        OnlineDecision::Quarantine { reason, server_message } => {
            let state = reason.resulting_state();
            let record = build_quarantine_record(
                reason.as_code(),
                &state.to_string(),
                &server_message,
                &current_date_string(),
            );
            // If the file cannot be updated the installation is still refused
            // for this session. Reporting Active because a write failed would be
            // the worst of both worlds.
            let write_note = match quarantine_license_token(&record) {
                Ok(())  => String::new(),
                Err(e)  => format!(" (the local license file could not be updated: {})", e),
            };
            Ok(build_status_with_message(
                state,
                format!("{}{}", reason.customer_message(), write_note),
            ))
        }

        OnlineDecision::KeepLocal { note } => {
            // Unchanged offline behaviour: report the LOCAL verdict, annotated
            // with why the server could not be consulted.
            let local_state = validate_token(&token);
            let mut result  = build_status(local_state);
            result.message  = format!("{} ({})", result.message, note);
            Ok(result)
        }
    }
}

/// Perform the HTTP call and reduce it to plain data, so the decision above can
/// be a pure function of what the server returned.
///
/// Every failure to obtain a complete response — including headers arriving but
/// the body not — becomes `Unreachable`. A half-received answer is not a
/// licensing decision.
async fn fetch_validation(
    license_id: &str,
    activation_id: &str,
    hardware_fingerprint: &str,
) -> TransportOutcome {
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
    {
        Ok(c)  => c,
        Err(e) => return TransportOutcome::Unreachable(format!("HTTP client error: {}", e)),
    };

    let body = serde_json::json!({
        "license_id":           license_id,
        "activation_id":        activation_id,
        "hardware_fingerprint": hardware_fingerprint,
        "app_version":          env!("CARGO_PKG_VERSION"),
    });

    let resp = match client
        .post(format!("{}/validate-license", LICENSE_SERVER_BASE_URL))
        .json(&body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return TransportOutcome::Unreachable(if e.is_timeout() {
                "offline — the connection timed out, so local license validation was used".to_string()
            } else if e.is_connect() {
                "offline — the license server could not be reached, so local license validation was used".to_string()
            } else {
                format!("the license server could not be reached: {}", e)
            });
        }
    };

    let status = resp.status().as_u16();
    match resp.text().await {
        Ok(body) => TransportOutcome::Responded { status, body },
        Err(e) => TransportOutcome::Unreachable(format!(
            "the license server response could not be read: {}",
            e
        )),
    }
}

// Needed for the online command request bodies
#[allow(dead_code)]
#[derive(Deserialize)]
struct ServerError {
    error: String,
}

// ── Tests ─────────────────────────────────────────────────────────────────────
//
// These assert the shape the FRONTEND actually consumes — `LicenseStatusResult`
// — rather than the internals underneath it. `is_valid` is the single field the
// startup chain and the License page branch on: App.tsx calls setLicenseInvalid()
// on `!is_valid`, and AppRouter gates the whole application on the resulting
// bootstrapState. If any of these flipped, a revoked machine would keep running
// or a working one would be locked out, and nothing below this layer would tell
// us. The network itself is not touched: `decide_online_outcome` is pure, so the
// verdicts it produces can be fed straight through the same mapping the command
// uses.

#[cfg(test)]
mod license_contract_tests {
    use super::*;
    use crate::license::online::{
        decide_online_outcome, LocalGrace, OnlineDecision, TransportOutcome,
    };
    use crate::license::storage::build_quarantine_record;
    use crate::license::validation::validate_token;

    /// The mapping `validate_license_online` applies to a denial, without the IO
    /// around it. Mirrors the Quarantine arm of the command.
    fn status_for_denial(reason: DenialReason) -> LicenseStatusResult {
        let state = reason.resulting_state();
        build_status_with_message(state, reason.customer_message().to_string())
    }

    fn responded(status: u16, body: &str) -> OnlineDecision {
        decide_online_outcome(
            TransportOutcome::Responded { status, body: body.to_string() },
            &LocalGrace::default(),
        )
    }

    const ALL_REASONS: [DenialReason; 8] = [
        DenialReason::LicenseRevoked,
        DenialReason::LicenseSuspended,
        DenialReason::LicenseExpired,
        DenialReason::ActivationDeactivated,
        DenialReason::ActivationNotFound,
        DenialReason::LicenseNotFound,
        DenialReason::HardwareMismatch,
        DenialReason::Other,
    ];

    /// The contract the whole feature rests on: every authoritative denial must
    /// reach the frontend as `is_valid: false`. One `true` here is a licence that
    /// cannot be revoked.
    #[test]
    fn every_authoritative_denial_reaches_the_frontend_as_invalid() {
        for reason in ALL_REASONS {
            let s = status_for_denial(reason);
            assert!(
                !s.is_valid,
                "{:?} produced is_valid = true, so the app would stay open",
                reason
            );
            assert!(!s.message.is_empty());
            assert!(!s.state.is_empty());
            assert!(!s.state_label.is_empty());
        }
    }

    /// The opposite direction, which matters just as much: a licence the server
    /// confirms, and a licence checked while offline, must both stay valid.
    #[test]
    fn active_and_dev_bypass_remain_valid() {
        assert!(build_status(LicenseState::Active).is_valid);
        assert!(build_status(LicenseState::DevBypass).is_valid);
    }

    /// A technical failure annotates the message but must not change the verdict.
    /// This is the exact shape of the command's KeepLocal arm.
    #[test]
    fn a_technical_failure_note_never_invalidates_a_valid_local_license() {
        for outcome in [
            TransportOutcome::Unreachable("offline".to_string()),
            TransportOutcome::Unreachable("timed out".to_string()),
            TransportOutcome::Responded { status: 500, body: r#"{"error":"Internal server error"}"#.to_string() },
            TransportOutcome::Responded { status: 503, body: "<html>unavailable</html>".to_string() },
            TransportOutcome::Responded { status: 200, body: "not a token".to_string() },
        ] {
            match decide_online_outcome(outcome, &LocalGrace::default()) {
                OnlineDecision::KeepLocal { note } => {
                    let mut result = build_status(LicenseState::Active);
                    result.message = format!("{} ({})", result.message, note);
                    assert!(
                        result.is_valid,
                        "a technical failure must leave a valid local licence valid"
                    );
                    assert_eq!(result.state, "ACTIVE");
                }
                other => panic!("expected KeepLocal, got {:?}", other),
            }
        }
    }

    /// End to end through the mapping the command uses: the server's own
    /// revocation answer must arrive at the frontend as a non-valid REVOKED
    /// state, and a deactivated activation likewise.
    #[test]
    fn server_denials_map_through_to_the_frontend_contract() {
        for (status, body, expected_state) in [
            (403u16, r#"{"error":"License is revoked"}"#, "REVOKED"),
            (403, r#"{"error":"License is suspended"}"#, "REVOKED"),
            (403, r#"{"error":"Activation is deactivated"}"#, "REVOKED"),
            (403, r#"{"error":"Activation is superseded"}"#, "REVOKED"),
            (403, r#"{"error":"License has expired"}"#, "EXPIRED"),
            (403, r#"{"error":"Hardware mismatch"}"#, "HARDWARE_MISMATCH"),
        ] {
            match responded(status, body) {
                OnlineDecision::Quarantine { reason, .. } => {
                    let s = status_for_denial(reason);
                    assert!(!s.is_valid, "{} {} left the app valid", status, body);
                    assert_eq!(s.state, expected_state, "for {} {}", status, body);
                }
                other => panic!("expected Quarantine for {} {}, got {:?}", status, body, other),
            }
        }
    }

    /// A quarantine record read back at the NEXT startup must still lock the
    /// app out. Without this, revocation would survive only until restart.
    #[test]
    fn a_stored_quarantine_record_still_locks_out_on_the_next_startup() {
        for reason in ALL_REASONS {
            let state = reason.resulting_state();
            let record = build_quarantine_record(
                reason.as_code(),
                &state.to_string(),
                "server said no",
                "2026-09-05",
            );
            let (read_state, message) = quarantine_state_and_message(&record);
            let s = build_status_with_message(read_state, message);
            assert!(
                !s.is_valid,
                "{:?} was readable as valid after a restart",
                reason
            );
        }
    }

    /// A record written by a newer build, or hand-edited, must not fall open.
    #[test]
    fn an_unknown_reason_code_in_a_stored_record_still_locks_out() {
        let record = build_quarantine_record(
            "A_REASON_THIS_BUILD_HAS_NEVER_HEARD_OF",
            "SOMETHING_ELSE",
            "server said no",
            "2026-09-05",
        );
        let (state, message) = quarantine_state_and_message(&record);
        let s = build_status_with_message(state, message);
        assert!(!s.is_valid);
        assert_eq!(s.state, "REVOKED");
    }

    /// A 200 body can deserialise cleanly into a `LicenseToken` and still be
    /// unverifiable — `LicenseToken` has no `deny_unknown_fields`, and the
    /// signature is only checked by `validate_token`. Since `write_license_token`
    /// is a plain overwrite with no backup, adopting before verifying would
    /// destroy the customer's only working licence on the strength of a token
    /// this build cannot verify. This runs unattended on every launch, so a
    /// server-side signing fault would otherwise wipe every online installation.
    #[test]
    fn a_server_token_that_does_not_verify_may_not_replace_the_working_one() {
        // Structurally complete, but signed by nothing this build trusts, and
        // bound to a fingerprint that is not this machine.
        let body = r#"{
          "license_id":"2808d856-7645-40ac-a887-f0a8254df416",
          "activation_id":"5b08b8bf-be28-4c99-a131-84e73c72170f",
          "customer_name":"ZZ-TEST","plan":"trial","max_activations":1,
          "hardware_fingerprint":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          "issued_at":"2026-09-01T00:00:00Z","activated_at":"2026-09-01T00:00:00Z",
          "expires_at":null,"last_validated_at":"2026-09-05T00:00:00Z",
          "next_validation_due_at":"2026-10-05T00:00:00Z","grace_until":null,
          "features":[],"license_key_last4":"WXYZ","status":"active",
          "signature":"bm90LWEtcmVhbC1zaWduYXR1cmU="
        }"#;

        match responded(200, body) {
            OnlineDecision::AdoptToken(fresh) => {
                let state = validate_token(&fresh);
                assert!(
                    !may_adopt(&state),
                    "fixture must not verify, or this test proves nothing (got {:?})",
                    state
                );
                assert!(
                    !build_status(state).is_valid,
                    "an unverifiable token must never be reported as a valid licence"
                );
            }
            other => panic!("expected AdoptToken from a parseable 200, got {:?}", other),
        }
    }

    /// The other half of the same guard: a token that DOES verify is adoptable.
    /// Without this, `may_adopt` could be stubbed to `false` and every test above
    /// would still pass while online validation quietly stopped working.
    #[test]
    fn a_verifying_token_is_adoptable() {
        assert!(may_adopt(&LicenseState::Active));
        assert!(may_adopt(&LicenseState::DevBypass));
        for s in [
            LicenseState::Invalid,
            LicenseState::Expired,
            LicenseState::Revoked,
            LicenseState::HardwareMismatch,
            LicenseState::Corrupt,
            LicenseState::NotActivated,
        ] {
            assert!(!may_adopt(&s), "{:?} must not be adoptable", s);
        }
    }

    /// Startup validation refreshes an existing activation rather than creating
    /// one. The client half of that is asserted here: a refreshed token carries
    /// the activation id it was issued against, so nothing downstream could
    /// treat it as a new seat.
    ///
    /// The server half is a property of `validate-license`, which contains no
    /// INSERT into `license_activations` at all — it only updates `last_seen_at`.
    /// That was verified by reading the deployed function, not by this test; a
    /// unit test cannot observe a remote endpoint's writes.
    #[test]
    fn a_refreshed_token_carries_the_same_activation_id() {
        let body = r#"{
          "license_id":"2808d856-7645-40ac-a887-f0a8254df416",
          "activation_id":"5b08b8bf-be28-4c99-a131-84e73c72170f",
          "customer_name":"ZZ-TEST","plan":"trial","max_activations":1,
          "hardware_fingerprint":"aa11bb22","issued_at":"2026-09-01T00:00:00Z",
          "activated_at":"2026-09-01T00:00:00Z","expires_at":null,
          "last_validated_at":"2026-09-05T00:00:00Z",
          "next_validation_due_at":"2026-10-05T00:00:00Z","grace_until":null,
          "features":[],"license_key_last4":"WXYZ","status":"active",
          "signature":"c2ln"
        }"#;
        match responded(200, body) {
            OnlineDecision::AdoptToken(t) => {
                assert_eq!(
                    t.activation_id.as_deref(),
                    Some("5b08b8bf-be28-4c99-a131-84e73c72170f"),
                    "a refreshed token must carry the same activation, never a new one"
                );
            }
            other => panic!("expected AdoptToken, got {:?}", other),
        }
    }
}
