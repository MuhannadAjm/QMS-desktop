use serde::{Deserialize, Serialize};

/// The full structure of license.json as written to disk.
///
/// Phase 9A: signature was HMAC-SHA256 (dev placeholder).
/// Phase 9B: signature is RSA-PKCS1v1.5 SHA-256, base64-encoded.
///           Private key lives on the Supabase server; only the public key
///           is embedded in this binary.
///
/// Do NOT store the raw license key here. Only `license_key_last4` is allowed.
/// Do NOT store raw hardware identifiers. Only the SHA-256 hex digest is stored.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseToken {
    pub license_id: String,
    /// Server-assigned activation record UUID (from license_activations table).
    /// None for DEV_BYPASS tokens (not server-issued).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub activation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub license_key_last4: Option<String>,
    pub customer_name: String,
    pub plan: String,
    pub max_activations: u32,
    /// SHA-256 hex of (COMPUTERNAME.lowercase() + ":" + MAC.lowercase()).
    /// Raw values never stored here.
    pub hardware_fingerprint: String,
    pub issued_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub activated_at: Option<String>,
    /// ISO datetime string or null for perpetual licenses.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_validated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_validation_due_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grace_until: Option<String>,
    pub features: Vec<String>,
    /// RSA-PKCS1v1.5 SHA-256 signature over canonical payload, base64-encoded.
    /// DEV_BYPASS tokens use "DEV-BYPASS-NOT-FOR-PRODUCTION" (HMAC accepted in dev).
    pub signature: String,
    /// One of: "active", "revoked", "dev_bypass"
    pub status: String,
}
