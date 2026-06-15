use std::collections::BTreeMap;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use hmac::{Hmac, Mac};
use rsa::{pkcs1v15::VerifyingKey, pkcs8::DecodePublicKey, signature::Verifier, RsaPublicKey};
use sha2::Sha256;

use crate::license::{rsa_public_key::LICENSE_PUBLIC_KEY_PEM, token::LicenseToken, LicenseState};
use crate::license::hardware::compute_hardware_fingerprint;

// ── Phase 9A DEV placeholder ──────────────────────────────────────────────────
//
// IMPORTANT — DEVELOPMENT / TEST PLACEHOLDER ONLY.
//
// This HMAC-SHA256 key remains for DEV_BYPASS tokens created by
// create_dev_license_for_current_machine. It is NOT used for production
// (server-issued) tokens, which use RSA-2048 via verify_rsa_signature().
//
// Phase 9A tokens on disk may still carry an HMAC signature; this path
// continues to accept them so existing dev environments are not broken.
//
// To permanently disable HMAC dev bypass, remove this block and the
// DEV_BYPASS arm in verify_signature().
//
// DO NOT USE THIS KEY TO GENERATE PRODUCTION LICENSE TOKENS.
type HmacSha256 = Hmac<Sha256>;
const DEV_HMAC_KEY: &[u8] =
    b"QMS-DESKTOP-DEV-PHASE-9A-PLACEHOLDER-REPLACE-WITH-RSA-IN-9B";

// ── Public API ─────────────────────────────────────────────────────────────────

/// Validate a parsed LicenseToken and return the resulting LicenseState.
pub fn validate_token(token: &LicenseToken) -> LicenseState {
    // Dev bypass — explicit status + HMAC or literal sentinel (dev tool only).
    // In production (release) builds, dev_bypass tokens are unconditionally rejected.
    if token.status == "dev_bypass" {
        if cfg!(not(debug_assertions)) {
            return LicenseState::Invalid;
        }
        return if verify_dev_hmac(token) {
            LicenseState::DevBypass
        } else {
            LicenseState::Invalid
        };
    }

    // Revoked
    if token.status == "revoked" {
        return LicenseState::Revoked;
    }

    // Hardware fingerprint check
    let current_fp = match compute_hardware_fingerprint() {
        Ok(fp) => fp,
        Err(_) => return LicenseState::Invalid,
    };
    if token.hardware_fingerprint != current_fp {
        return LicenseState::HardwareMismatch;
    }

    // RSA signature check (production path)
    if !verify_rsa_signature(token) {
        return LicenseState::Invalid;
    }

    // Expiry check (optional — None = perpetual)
    if let Some(expires_at) = &token.expires_at {
        if !expires_at.is_empty() {
            let today       = current_date_string();
            let expires_date = expires_at.split('T').next().unwrap_or(expires_at.as_str());
            if expires_date < today.as_str() {
                if let Some(grace) = &token.grace_until {
                    let grace_date = grace.split('T').next().unwrap_or(grace.as_str());
                    if grace_date > today.as_str() {
                        return LicenseState::Active; // within grace period
                    }
                }
                return LicenseState::Expired;
            }
        }
    }

    LicenseState::Active
}

/// Compute the RSA canonical payload string that the server signs.
///
/// All 15 token fields (excluding `signature`) are serialized to compact JSON
/// with keys in alphabetical order. Absent optional fields are included as null.
///
/// This MUST match the `canonicalPayload()` function in
/// supabase/functions/_shared/rsa.ts.
pub fn canonical_payload(token: &LicenseToken) -> Result<String, String> {
    let mut map: BTreeMap<&str, serde_json::Value> = BTreeMap::new();

    map.insert("activation_id",          serde_json::json!(token.activation_id));
    map.insert("activated_at",           serde_json::json!(token.activated_at));
    map.insert("customer_name",          serde_json::json!(token.customer_name));
    map.insert("expires_at",             serde_json::json!(token.expires_at));
    map.insert("features",               serde_json::json!(token.features));
    map.insert("grace_until",            serde_json::json!(token.grace_until));
    map.insert("hardware_fingerprint",   serde_json::json!(token.hardware_fingerprint));
    map.insert("issued_at",              serde_json::json!(token.issued_at));
    map.insert("last_validated_at",      serde_json::json!(token.last_validated_at));
    map.insert("license_id",             serde_json::json!(token.license_id));
    map.insert("license_key_last4",      serde_json::json!(token.license_key_last4));
    map.insert("max_activations",        serde_json::json!(token.max_activations));
    map.insert("next_validation_due_at", serde_json::json!(token.next_validation_due_at));
    map.insert("plan",                   serde_json::json!(token.plan));
    map.insert("status",                 serde_json::json!(token.status));

    // BTreeMap keys are already alphabetically ordered; serde_json serializes them
    // in insertion (alphabetical) order producing deterministic compact JSON.
    serde_json::to_string(&map).map_err(|e| format!("Canonicalization error: {}", e))
}

/// Compute a DEV-ONLY HMAC-SHA256 signature for Phase 9A dev tokens.
/// Used exclusively by create_dev_license_for_current_machine.
pub fn compute_dev_signature(token: &LicenseToken) -> Result<String, String> {
    let message = build_dev_signature_message(token);
    let mut mac = HmacSha256::new_from_slice(DEV_HMAC_KEY)
        .map_err(|e| format!("HMAC init error: {}", e))?;
    mac.update(message.as_bytes());
    Ok(hex::encode(mac.finalize().into_bytes()))
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/// Verify RSA-PKCS1v1.5 SHA-256 signature on a production token.
/// Returns true only if the signature is valid for the canonical payload.
fn verify_rsa_signature(token: &LicenseToken) -> bool {
    // Decode the base64 signature
    let sig_bytes = match STANDARD.decode(&token.signature) {
        Ok(b) => b,
        Err(_) => return false,
    };

    // Load the embedded public key
    let public_key = match RsaPublicKey::from_public_key_pem(LICENSE_PUBLIC_KEY_PEM) {
        Ok(k) => k,
        Err(_) => return false,
    };

    let verifying_key = VerifyingKey::<Sha256>::new(public_key);

    // Build the signature object
    let signature = match rsa::pkcs1v15::Signature::try_from(sig_bytes.as_slice()) {
        Ok(s) => s,
        Err(_) => return false,
    };

    // Build the canonical payload the server signed
    let canonical = match canonical_payload(token) {
        Ok(c) => c,
        Err(_) => return false,
    };

    verifying_key.verify(canonical.as_bytes(), &signature).is_ok()
}

/// Verify the DEV HMAC signature for dev_bypass tokens.
fn verify_dev_hmac(token: &LicenseToken) -> bool {
    // Allow the literal sentinel from Phase 9A (dev tool shortcut)
    if token.signature == "DEV-BYPASS-NOT-FOR-PRODUCTION" {
        return true;
    }

    let message = build_dev_signature_message(token);
    let mut mac = match HmacSha256::new_from_slice(DEV_HMAC_KEY) {
        Ok(m)  => m,
        Err(_) => return false,
    };
    mac.update(message.as_bytes());

    match hex::decode(&token.signature) {
        Ok(sig_bytes) => mac.verify_slice(&sig_bytes).is_ok(),
        Err(_)        => false,
    }
}

fn build_dev_signature_message(token: &LicenseToken) -> String {
    format!(
        "{}:{}:{}",
        token.license_id,
        token.hardware_fingerprint,
        token.expires_at.as_deref().unwrap_or("never"),
    )
}

/// Today's date as "YYYY-MM-DD" without chrono (same pattern as backup.rs).
fn current_date_string() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    epoch_days_to_ymd(secs / 86400)
}

fn epoch_days_to_ymd(mut days: u64) -> String {
    let mut year = 1970i64;
    loop {
        let dy = if is_leap(year) { 366u64 } else { 365u64 };
        if days < dy { break; }
        days -= dy;
        year += 1;
    }
    let month_days: [u64; 12] = [
        31, if is_leap(year) { 29 } else { 28 },
        31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
    ];
    let mut month = 1u32;
    for &md in &month_days {
        if days < md { break; }
        days -= md;
        month += 1;
    }
    format!("{:04}-{:02}-{:02}", year, month, days + 1)
}

fn is_leap(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}
