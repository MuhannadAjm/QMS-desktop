import { invoke } from '@tauri-apps/api/core';
import type { LicenseDetails, LicenseStatusResult } from '../types/license';

export const licenseService = {
  getHardwareFingerprint: (): Promise<string> =>
    invoke('get_hardware_fingerprint'),

  getLicenseStatus: (): Promise<LicenseStatusResult> =>
    invoke('get_license_status'),

  getLicenseDetails: (): Promise<LicenseDetails> =>
    invoke('get_license_details'),

  validateLocalLicense: (): Promise<LicenseStatusResult> =>
    invoke('validate_local_license'),

  importLicenseToken: (tokenJson: string): Promise<LicenseStatusResult> =>
    invoke('import_license_token', { tokenJson }),

  /** DEV ONLY — resets license.json to unlicensed placeholder */
  clearLocalLicenseDevOnly: (): Promise<void> =>
    invoke('clear_local_license_dev_only'),

  /** DEV ONLY — creates a local dev bypass license for this machine */
  createDevLicenseForCurrentMachine: (): Promise<LicenseStatusResult> =>
    invoke('create_dev_license_for_current_machine'),

  /** Activate online: sends license key + machine label to the server. */
  activateLicenseOnline: (
    licenseKey: string,
    machineLabel: string,
  ): Promise<LicenseStatusResult> =>
    invoke('activate_license_online', { licenseKey, machineLabel }),

  /** Validate online: refreshes local token from the server. Falls back locally on network error. */
  validateLicenseOnline: (): Promise<LicenseStatusResult> =>
    invoke('validate_license_online'),
};
