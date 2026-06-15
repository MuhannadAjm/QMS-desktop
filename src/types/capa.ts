export type CAPAStatus = 'OPEN' | 'CLOSED';
export type CAPAType = 'CORRECTIVE' | 'PREVENTIVE';
export type SourceType = 'MANUAL' | 'COMPLAINT' | 'RISK' | 'AUDIT' | 'NC';
export type CAPAPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type RootCauseMethod = '5-Why' | 'Fishbone' | 'Fault Tree' | 'Other';

export const CAPA_TYPES: CAPAType[] = ['CORRECTIVE', 'PREVENTIVE'];
export const SOURCE_TYPES: SourceType[] = ['MANUAL', 'COMPLAINT', 'RISK', 'AUDIT', 'NC'];
export const CAPA_PRIORITIES: CAPAPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const ROOT_CAUSE_METHODS: RootCauseMethod[] = ['5-Why', 'Fishbone', 'Fault Tree', 'Other'];
export const CAPA_STATUSES: CAPAStatus[] = ['OPEN', 'CLOSED'];

export interface CapaListItem {
  id: number;
  capa_number: string;
  title: string;
  capa_type: string;
  source_type: string | null;
  source_id: number | null;
  status: string;
  priority: string | null;
  root_cause: string | null;
  root_cause_method: string | null;
  action_plan: string | null;
  due_date: string | null;
  responsible_user_id: number | null;
  responsible_user_name: string | null;
  effectiveness_check: string | null;
  effectiveness_date: string | null;
  effectiveness_result: string | null;
  closed_at: string | null;
  description: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  is_overdue: boolean;
}

export interface CAPAAttachment {
  id: number;
  file_name: string;
  file_path: string;
  file_size: number | null;
  uploaded_by: number | null;
  uploaded_by_name: string | null;
  uploaded_at: string;
}

export interface CapaActivityEntry {
  id: number;
  action: string;
  description: string | null;
  performed_by: number | null;
  performed_by_name: string | null;
  performed_at: string;
}
