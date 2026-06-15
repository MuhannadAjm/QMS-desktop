export interface AuditListItem {
  id: number;
  audit_number: string;
  title: string;
  audit_type: string | null;
  department: string | null;
  scope: string | null;
  standard: string | null;
  planned_date: string | null;
  actual_date: string | null;
  status: string;
  lead_auditor_id: number | null;
  lead_auditor_name: string | null;
  auditee: string | null;
  summary: string | null;
  closed_at: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  findings_count: number;
}

export interface AuditFinding {
  id: number;
  audit_id: number;
  finding_number: string;
  finding_type: string;
  clause_ref: string | null;
  description: string;
  evidence: string | null;
  severity: string;
  recommended_action: string | null;
  is_non_conformity: boolean;
  related_nc_id: number | null;
  related_nc_number: string | null;
  status: string;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditAttachment {
  id: number;
  file_name: string;
  file_path: string;
  file_size: number | null;
  uploaded_by: number | null;
  uploaded_by_name: string | null;
  uploaded_at: string;
}

export interface AuditActivityEntry {
  id: number;
  action: string;
  description: string | null;
  performed_by: number | null;
  performed_by_name: string | null;
  performed_at: string;
}

export const AUDIT_TYPES = [
  'Internal Audit',
  'External Audit',
  'Supplier Audit',
  'Process Audit',
  'Other',
] as const;

export type AuditType = (typeof AUDIT_TYPES)[number];

export const FINDING_TYPES = ['NC', 'OFI', 'Observation', 'Positive'] as const;
export type FindingType = (typeof FINDING_TYPES)[number];

export const FINDING_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const AUDIT_STATUSES = ['OPEN', 'CLOSED'] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];
