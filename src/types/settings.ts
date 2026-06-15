export interface SettingEntry {
  key: string;
  value: string;
}

export type SettingsMap = Record<string, string>;

export const SETTINGS_DEFAULTS: SettingsMap = {
  company_name: '',
  company_logo_path: '',
  quality_policy: '',
  qms_scope: '',
  departments: '',
  address: '',
  contact_email: '',
  phone: '',
  document_prefix: 'DOC',
  capa_prefix: 'CAPA',
  risk_prefix: 'RISK',
  complaint_prefix: 'COMP',
  audit_prefix: 'AUDIT',
  nc_prefix: 'NC',
  date_format: 'YYYY-MM-DD',
  timezone: 'UTC',
};
