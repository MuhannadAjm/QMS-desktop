export type CAPAStatus = 'OPEN' | 'CLOSED';

/**
 * System-fixed enum — NOT administrator-configurable.
 *
 * CORRECTION  fixes the symptom of a detected problem.
 * CORRECTIVE  removes the root cause so it cannot recur.
 * PREVENTIVE  acts on a potential problem before it occurs.
 *
 * These are ISO 9001 concepts rather than business lookup values, so they stay
 * in code. Must stay in sync with validate_capa_type() in
 * src-tauri/src/commands/capa.rs.
 */
export type CAPAType = 'CORRECTIVE' | 'PREVENTIVE' | 'CORRECTION';
export type SourceType = 'MANUAL' | 'COMPLAINT' | 'RISK' | 'AUDIT' | 'NC';
export type CAPAPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export const CAPA_TYPES: CAPAType[] = ['CORRECTIVE', 'PREVENTIVE', 'CORRECTION'];
export const SOURCE_TYPES: SourceType[] = ['MANUAL', 'COMPLAINT', 'RISK', 'AUDIT', 'NC'];
export const CAPA_PRIORITIES: CAPAPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const CAPA_STATUSES: CAPAStatus[] = ['OPEN', 'CLOSED'];

/**
 * Root cause method is FREE TEXT, not a fixed list.
 *
 * The former RootCauseMethod union and ROOT_CAUSE_METHODS array constrained the
 * field to four values. Teams use methods beyond those (8D, A3, Ishikawa
 * variants, "5-Why + Pareto"), and the column has always been plain TEXT, so
 * the restriction existed only in the UI. These values are now offered as
 * datalist suggestions while allowing anything to be typed. No stored value is
 * migrated or invalidated.
 */
export const ROOT_CAUSE_METHOD_SUGGESTIONS: string[] = [
  '5-Why',
  'Fishbone',
  'Fault Tree',
  '8D',
  'A3',
];

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
