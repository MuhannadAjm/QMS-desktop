pub mod hardware;
pub mod rsa_public_key;
pub mod storage;
pub mod token;
pub mod validation;

use serde::{Deserialize, Serialize};

/// All possible license states the app can detect locally.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LicenseState {
    NotActivated,
    Active,
    Expired,
    Invalid,
    HardwareMismatch,
    /// Placeholder — actual online revoke check is implemented in Phase 9B.
    Revoked,
    /// Development bypass. NOT valid in production builds.
    DevBypass,
    /// license.json exists but could not be parsed as a LicenseToken.
    /// Distinct from NotActivated: a corrupt file is a different support
    /// problem from a missing one, and collapsing the two sent users down
    /// the wrong diagnostic path.
    Corrupt,
}

impl std::fmt::Display for LicenseState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LicenseState::NotActivated     => write!(f, "NOT_ACTIVATED"),
            LicenseState::Active           => write!(f, "ACTIVE"),
            LicenseState::Expired          => write!(f, "EXPIRED"),
            LicenseState::Invalid          => write!(f, "INVALID"),
            LicenseState::HardwareMismatch => write!(f, "HARDWARE_MISMATCH"),
            LicenseState::Revoked          => write!(f, "REVOKED"),
            LicenseState::DevBypass        => write!(f, "DEV_BYPASS"),
            LicenseState::Corrupt          => write!(f, "CORRUPT"),
        }
    }
}
