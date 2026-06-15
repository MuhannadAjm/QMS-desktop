export interface NcListItem {
  id: number;
  nc_number: string;
  title: string;
  description: string | null;
  source_type: string | null;
  source_id: number | null;
  finding_id: number | null;
  severity: string;
  status: string;
  detected_date: string | null;
  responsible_user_id: number | null;
  responsible_user_name: string | null;
  containment_action: string | null;
  related_capa_id: number | null;
  related_capa_number: string | null;
  closed_at: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface NcAttachment {
  id: number;
  file_name: string;
  file_path: string;
  file_size: number | null;
  uploaded_by: number | null;
  uploaded_by_name: string | null;
  uploaded_at: string;
}

export interface NcActivityEntry {
  id: number;
  action: string;
  description: string | null;
  performed_by: number | null;
  performed_by_name: string | null;
  performed_at: string;
}

export const NC_SOURCE_TYPES = [
  { value: 'AUDIT', label: 'Audit' },
  { value: 'CUSTOMER_COMPLAINT', label: 'Customer Complaint' },
  { value: 'PROCESS_MONITORING', label: 'Process Monitoring' },
  { value: 'SUPPLIER', label: 'Supplier' },
  { value: 'INSPECTION', label: 'Inspection' },
  { value: 'INTERNAL', label: 'Internal' },
  { value: 'OTHER', label: 'Other' },
] as const;

export const NC_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type NcSeverity = (typeof NC_SEVERITIES)[number];

export const NC_STATUSES = ['OPEN', 'IN_REVIEW', 'CLOSED'] as const;
export type NcStatus = (typeof NC_STATUSES)[number];
