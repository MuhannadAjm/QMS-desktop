export type DocumentStatus = 'UNDER PROCESS' | 'CONTROLLED' | 'OBSOLETE';

export type DocumentType =
  | 'Policy'
  | 'Procedure'
  | 'Work Instruction'
  | 'Form'
  | 'Manual'
  | 'Record'
  | 'Specification'
  | 'Other';

export const DOCUMENT_TYPES: DocumentType[] = [
  'Policy',
  'Procedure',
  'Work Instruction',
  'Form',
  'Manual',
  'Record',
  'Specification',
  'Other',
];

export const DOCUMENT_STATUSES: DocumentStatus[] = [
  'UNDER PROCESS',
  'CONTROLLED',
  'OBSOLETE',
];

export interface DocumentListItem {
  id: number;
  doc_number: string;
  title: string;
  category: string;
  status: string;
  version: string;
  revision_date: string | null;
  effective_date: string | null;
  owner_id: number | null;
  owner_name: string | null;
  file_path: string | null;
  original_file_name: string | null;
  description: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentRevision {
  id: number;
  document_id: number;
  version: string;
  change_summary: string | null;
  file_path: string | null;
  original_file_name: string | null;
  revised_by: number | null;
  revised_by_name: string | null;
  revised_at: string;
}

export interface ActivityEntry {
  id: number;
  action: string;
  description: string | null;
  performed_by: number | null;
  performed_by_name: string | null;
  performed_at: string;
}

export interface UserMinimal {
  id: number;
  name: string;
  role: string;
}
