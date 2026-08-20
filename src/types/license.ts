export type LicenseState =
  | 'NOT_ACTIVATED'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'INVALID'
  | 'HARDWARE_MISMATCH'
  | 'REVOKED'
  | 'DEV_BYPASS'
  | 'CORRUPT';

export interface LicenseStatusResult {
  state: LicenseState;
  state_label: string;
  is_valid: boolean;
  message: string;
}

export interface LicenseDetails {
  state: LicenseState;
  state_label: string;
  is_valid: boolean;
  license_id: string | null;
  activation_id: string | null;
  customer_name: string | null;
  plan: string | null;
  hardware_fingerprint_short: string | null;
  issued_at: string | null;
  activated_at: string | null;
  expires_at: string | null;
  last_validated_at: string | null;
  next_validation_due_at: string | null;
  grace_until: string | null;
  features: string[];
  message: string;
}
