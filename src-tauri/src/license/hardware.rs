use sha2::{Digest, Sha256};

/// Compute the hardware fingerprint for this machine.
///
/// Algorithm (Phase 9A):
///   SHA-256(lowercase(COMPUTERNAME) + ":" + lowercase(primary_mac))
///
/// Identifiers used:
///   1. COMPUTERNAME environment variable — Windows machine hostname.
///      Stable across reboots; changes if the machine is renamed.
///   2. Primary MAC address from the first non-loopback network adapter.
///      Stable unless the NIC is replaced, VPN software changes it, or
///      the network card is removed.
///
/// The raw identifiers are NEVER stored or logged. Only the SHA-256 hex
/// digest is stored in license.json and returned to the frontend (short form).
///
/// Phase 9B: May add OS volume serial number for additional binding strength.
pub fn compute_hardware_fingerprint() -> Result<String, String> {
    let hostname = std::env::var("COMPUTERNAME")
        .unwrap_or_else(|_| "UNKNOWN_HOST".to_string())
        .to_lowercase();

    let mac = mac_address::get_mac_address()
        .map_err(|e| format!("Failed to read MAC address: {}", e))?
        .map(|m| m.to_string().to_lowercase())
        .unwrap_or_else(|| "00:00:00:00:00:00".to_string());

    let raw = format!("{}:{}", hostname, mac);

    let mut hasher = Sha256::new();
    hasher.update(raw.as_bytes());
    let result = hasher.finalize();
    Ok(hex::encode(result))
}

/// Returns a safe short display of the fingerprint for UI display only.
/// Shows first 16 hex chars followed by "..." — not the full 64-char hash.
/// Do not display the full fingerprint in the UI.
pub fn fingerprint_short(full_hex: &str) -> String {
    if full_hex.len() > 16 {
        format!("{}...", &full_hex[..16])
    } else {
        full_hex.to_string()
    }
}
